/**
 * Baixa e guarda o pacote no aparelho.
 *
 * - Só baixa o que mudou de sha256 (e o que ainda falta, se a vez anterior foi interrompida).
 * - Confere o sha256 ANTES de gravar: arquivo que não confere é recusado e o anterior fica.
 * - Um arquivo só conta como pronto depois de gravado por inteiro E registrado em
 *   progresso.json. Interrompido (app fechado, iPhone suspenso), a próxima vez retoma.
 * - O banco só é trocado com todos os arquivos conferidos: estado.json (o manifesto
 *   do conjunto completo) é escrito por último e é o ponto de troca. Os arquivos do
 *   núcleo ficam em blobs/<sha256>, então o novo nunca pisa no antigo e não é preciso
 *   renomear nada (FileSystemHandle.move() não é confiável no Safari).
 * - Baixados de início: tudo em nucleo/ e as miniaturas (thumb-*). As imagens de tela
 *   (screen-*) vêm ao abrir, por urlImagem (imagens.ts).
 */
import { armazemPadrao, type Armazem } from './armazem'
import { cacheImagensPadrao, esquecerUrl, tipoDaImagem, type CacheImagens } from './imagens'
import {
  ARQUIVO_PERSISTENCIA,
  ARQUIVO_PROGRESSO,
  caminhoDoBlob,
  ehDoNucleo,
  ehMiniatura,
  gravarEstado,
  gravarJson,
  lerEstado,
  lerJson,
  lerPersistencia,
  PASTA_BLOBS,
} from './local'
import {
  ErroDeIntegridade,
  ErroDeSincronizacaoEmAndamento,
  lerManifesto,
  sha256,
  validarPacote,
  type ArquivoDoPacote,
  type Fonte,
  type Manifesto,
} from './manifesto'

/** Nome da trava entre janelas (Web Locks): só uma sincronização por vez. */
export const TRAVA_DE_SINCRONIZACAO = 'iconodb-sync'

export { lerArquivoDoPacote, lerEstado, lerPersistencia } from './local'
export { sha256 } from './manifesto'

export type Etapa = 'Banco de dados' | 'Imagens de tela'
/** `feito` e `total` em bytes. As miniaturas contam na etapa "Imagens de tela". */
export type AoProgredir = (etapa: Etapa, feito: number, total: number) => void

export interface OpcoesDeSincronizacao {
  armazem?: Armazem
  cache?: CacheImagens
  /** Downloads ao mesmo tempo (padrão 4). */
  concorrencia?: number
}

type Entrada = [caminho: string, arquivo: ArquivoDoPacote]

/** Caminho → sha256 do que já está no aparelho, conferido e gravado. Gravado aos poucos, sem repetir gravações. */
class Registro {
  private versao = 0
  private gravada = 0
  private cadeia: Promise<void> = Promise.resolve()

  private constructor(
    private readonly armazem: Armazem,
    readonly dados: Record<string, string>,
  ) {}

  static async abrir(armazem: Armazem): Promise<Registro> {
    const dados = await lerJson<Record<string, string>>(armazem, ARQUIVO_PROGRESSO)
    return new Registro(armazem, dados && typeof dados === 'object' ? dados : {})
  }

  /** Resolve quando um progresso.json que inclui este arquivo foi gravado. */
  marcar(caminho: string, sha: string): Promise<void> {
    this.dados[caminho] = sha
    return this.salvar()
  }

  /** Deixa só os caminhos de `manter`, cada um com o sha256 do conjunto novo. */
  alinhar(manter: Record<string, string>): Promise<void> {
    for (const c of Object.keys(this.dados)) if (!(c in manter)) delete this.dados[c]
    Object.assign(this.dados, manter)
    return this.salvar()
  }

  esvaziar(): Promise<void> {
    return this.cadeia
  }

  private salvar(): Promise<void> {
    const minha = ++this.versao
    this.cadeia = this.cadeia.then(async () => {
      if (this.gravada >= minha) return // uma gravação posterior já levou este arquivo
      const v = this.versao
      await gravarJson(this.armazem, ARQUIVO_PROGRESSO, this.dados)
      this.gravada = v
    })
    return this.cadeia
  }
}

async function emParalelo<T>(itens: T[], quantos: number, fazer: (item: T) => Promise<void>): Promise<void> {
  let proximo = 0
  let falhou = false
  let erro: unknown
  const trabalhador = async () => {
    while (!falhou) {
      const item = itens[proximo++]
      if (item === undefined) return
      try {
        await fazer(item)
      } catch (e) {
        if (!falhou) {
          falhou = true
          erro = e
        }
        return
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(quantos, 1), itens.length) }, trabalhador))
  if (falhou) throw erro
}

const assinatura = (m: Manifesto) =>
  Object.entries(m.arquivos)
    .map(([c, a]) => `${c}:${a.sha256}`)
    .sort()
    .join('\n')

async function pedirPersistencia(armazem: Armazem): Promise<void> {
  if (await lerPersistencia(armazem)) return
  let concedido = false
  try {
    concedido = (await navigator.storage?.persist?.()) === true
  } catch {
    concedido = false
  }
  await gravarJson(armazem, ARQUIVO_PERSISTENCIA, { concedido })
}

/** Depois da troca: tira do aparelho o que deixou de valer. Falhar aqui não desfaz a troca. */
async function limpar(armazem: Armazem, cache: CacheImagens, antes: Manifesto | null, novo: Manifesto, registro: Registro) {
  const blobsVivos = new Set(
    Object.entries(novo.arquivos)
      .filter(([c]) => ehDoNucleo(c))
      .map(([, a]) => caminhoDoBlob(a.sha256)),
  )
  for (const blob of await armazem.listar(PASTA_BLOBS)) if (!blobsVivos.has(blob)) await armazem.remover(blob)

  for (const [c, a] of Object.entries(antes?.arquivos ?? {})) {
    if (ehDoNucleo(c)) continue
    const atual = novo.arquivos[c]
    // Miniatura que mudou já foi baixada de novo; a imagem de tela que mudou volta pela rede, ao abrir.
    if (!atual || (atual.sha256 !== a.sha256 && !ehMiniatura(c))) {
      await cache.remover(c)
      esquecerUrl(c)
    }
  }
  await registro.alinhar(
    Object.fromEntries(
      Object.entries(novo.arquivos)
        .filter(([c]) => ehDoNucleo(c) || ehMiniatura(c))
        .map(([c, a]) => [c, a.sha256]),
    ),
  )
}

/**
 * Deixa o aparelho com o pacote da Fonte. Só uma sincronização por vez entre as janelas
 * do app (Web Locks): se outra janela está sincronizando, lança ErroDeSincronizacaoEmAndamento
 * sem tocar em nada, porque a limpeza de uma apagaria os arquivos novos da outra.
 * Sem Web Locks no navegador, não há trava.
 */
export async function sincronizarPacote(
  fonte: Fonte,
  aoProgredir: AoProgredir,
  opcoes: OpcoesDeSincronizacao = {},
): Promise<'atualizado' | 'igual'> {
  const travas = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (typeof travas?.request !== 'function') return sincronizar(fonte, aoProgredir, opcoes)
  return travas.request(TRAVA_DE_SINCRONIZACAO, { ifAvailable: true }, async (trava) => {
    if (!trava) throw new ErroDeSincronizacaoEmAndamento()
    return sincronizar(fonte, aoProgredir, opcoes)
  })
}

/**
 * A sincronização em si, já com a trava. "igual" quando não havia nada a baixar nem a trocar.
 * Lança ErroDeSchema, ErroDeIntegridade ou o erro da Fonte (rede, login); em todos os casos
 * o que já estava no aparelho continua como estava.
 */
async function sincronizar(
  fonte: Fonte,
  aoProgredir: AoProgredir,
  opcoes: OpcoesDeSincronizacao,
): Promise<'atualizado' | 'igual'> {
  const armazem = opcoes.armazem ?? armazemPadrao()
  const cache = opcoes.cache ?? cacheImagensPadrao()
  const concorrencia = opcoes.concorrencia ?? 4

  const novo = await lerManifesto(fonte)
  // Um pacote com defeito não baixa nada nem troca o que já está no aparelho.
  validarPacote(novo)
  const estado = await lerEstado(armazem)
  const registro = await Registro.abrir(armazem)

  // Conteúdos que já estão inteiros no aparelho: não se regravam por cima.
  const completos = new Set([...Object.values(registro.dados), ...Object.values(estado?.arquivos ?? {}).map((a) => a.sha256)])
  const jaTem = (c: string, a: ArquivoDoPacote) => registro.dados[c] === a.sha256 || estado?.arquivos[c]?.sha256 === a.sha256

  const entradas = Object.entries(novo.arquivos)
  let baixouAlgo = false

  async function etapa(nome: Etapa, lista: Entrada[], gravarEm: (c: string, a: ArquivoDoPacote, bytes: Uint8Array) => Promise<void>) {
    const total = lista.reduce((s, [, a]) => s + a.bytes, 0)
    const pendentes: Entrada[] = []
    let feito = 0
    for (const e of lista) {
      const [c, a] = e
      // O núcleo precisa do blob no disco; a miniatura, da cópia no cache (o sistema pode ter esvaziado o cache).
      const pronto =
        jaTem(c, a) && (ehDoNucleo(c) ? await armazem.existe(caminhoDoBlob(a.sha256)) : await cache.tem(c))
      if (pronto) feito += a.bytes
      else pendentes.push(e)
    }
    aoProgredir(nome, feito, total)
    await emParalelo(pendentes, concorrencia, async ([c, a]) => {
      const bytes = new Uint8Array(await fonte.baixar(c))
      if ((await sha256(bytes)) !== a.sha256) throw new ErroDeIntegridade(c)
      await gravarEm(c, a, bytes)
      await registro.marcar(c, a.sha256)
      baixouAlgo = true
      feito += a.bytes
      aoProgredir(nome, feito, total)
    })
  }

  try {
    await etapa('Banco de dados', entradas.filter(([c]) => ehDoNucleo(c)), async (_c, a, bytes) => {
      const blob = caminhoDoBlob(a.sha256)
      if (completos.has(a.sha256) && (await armazem.existe(blob))) return
      await armazem.gravar(blob, bytes)
      completos.add(a.sha256)
    })
    await etapa('Imagens de tela', entradas.filter(([c]) => ehMiniatura(c)), (c, _a, bytes) =>
      cache.guardar(c, bytes, tipoDaImagem(c)),
    )
  } finally {
    // Também numa falha: o que já foi conferido fica registrado para a retomada.
    await registro.esvaziar().catch(() => undefined)
  }

  // Todos conferidos: a troca é este arquivo, escrito por último.
  const mudou = baixouAlgo || estado === null || assinatura(estado) !== assinatura(novo)
  await gravarEstado(armazem, novo)
  await limpar(armazem, cache, estado, novo, registro).catch(() => undefined)
  await pedirPersistencia(armazem)
  return mudou ? 'atualizado' : 'igual'
}
