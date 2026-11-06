/**
 * Restaurar a partir de uma cópia (2C, bloco 1, Tarefa 7; especificação §6.2, escolha B do usuário). Traz de volta o que
 * está numa cópia e falta aqui, sem apagar nada: o que mudou aqui depois da data da cópia continua valendo.
 *
 * `planoDeRestauracao` (PURO) compara o estado da cópia (`fundir(copia.eventos, copia.base)`) com o estado de agora, registro
 * por registro, na ordem (tipo, id), com as mesmas comparações da fusão (src/usuario/fusao.ts, que não muda):
 *  - registro ausente aqui → `criar` com o valor atual de cada campo da cópia e, se a marca vencedora da cópia é `excluir`,
 *    um `excluir` (ele aparece em «Excluídos»);
 *  - presente → um `alterar` com cada campo cuja escrita vencedora na cópia vence a daqui por (hlc, id do evento) (ou que
 *    não existe aqui); um `excluir`/`restaurar` quando a marca da cópia vence a daqui por (hlc, id do evento, op);
 *  - objeto SKC confirmado na cópia que, depois do plano, não tem a testemunha → `alterar` com ela, pela regra de
 *    `testemunhasFaltando` (numeracao.ts, `testemunhaDoObjeto`: `numero`, `nrSkc` e, na decisão 48, o número novo de
 *    `LIVRO:<id>` com `numeroTomadoPeloLivro`): o número não muda ao restaurar num Dropbox vazio;
 *  - os `alterar` de um registro vão juntos num só pedido.
 * Os pedidos não dizem aparelho nem hlc: `registrarVarios` os grava como eventos NOVOS deste aparelho, com hlc de agora (o
 * relógio passa antes do maior hlc da cópia, `ate`). Os ids dos registros são os da cópia. Restaurar a mesma cópia de novo
 * não gera nada (toda escrita feita aqui é mais nova que a da cópia).
 *
 * As fotos (`aplicarRestauracao`): para cada imagem que fica viva, UMA listagem recursiva de `usuario/imagens` no Dropbox
 * (a do resumo, se o plano não mudou e ela é fresca) diz que arquivos faltam; os que faltam e estão no .zip entram na fila de envio deste aparelho (`guardarLocal`, a mesma fila de uma
 * foto nova), com o mesmo id e os mesmos nomes. SEGURANÇA: nenhum nome lido do .zip vira caminho. Os nomes procurados no .zip
 * são sempre `imagens/<id>/<nome>`, com `<id>` um id de imagem bem formado (`IM-<aparelho>-<n>`) e `<nome>` de
 * `arquivosDaImagem` do registro; as chaves do .zip só servem para procurar num Map.
 */
import { escritaDropbox, type Escrita } from '../dropbox/escrita'
import { avisarFila, ESTADO_INICIAL, gravarEstadoDoEnvio } from '../imagens-usuario/fila'
import { guardarLocal, idsLocais, removerLocal } from '../imagens-usuario/local'
import { testemunhaDoObjeto } from '../objetos-skc/numeracao'
import { arquivosDaImagem, lerImagem } from '../imagens-usuario/registro'
import { avancarRelogio, type PedidoDeEvento } from '../usuario/armazem'
import { registrarVarios } from '../usuario/estado'
import { compararPorPontoDeCodigo, type Campos, type Tipo } from '../usuario/eventos'
import type { CopiaDeSeguranca } from '../usuario/exportar'
import { entradasDoCampo, fundir, type Entrada, type Estado, type Marca, type Registro } from '../usuario/fusao'
import { comTrava, sincronizarAgora } from '../usuario/useSincronizacao'

/** Um id de imagem que pode virar pasta (`IM-<aparelho>-<n>`): nada de `/`, `.` ou `..`. */
export const RE_ID_DE_IMAGEM = /^IM-[a-z0-9]{8}-[1-9][0-9]*$/

export interface PlanoDeRestauracao {
  /** Os eventos a gravar, numa transação, na ordem (tipo, id). */
  pedidos: PedidoDeEvento[]
  /** Quantos registros de cada tipo voltam (os ausentes aqui), excluídos ou não. */
  trazidos: Partial<Record<Tipo, number>>
  /**
   * P13: dos `trazidos`, os que voltam excluídos e aparecem em «Excluídos» (os tipos que a tela lista; I-1). A foto excluída
   * conta em `imagensExcluidas`.
   */
  voltamExcluidos: Partial<Record<Tipo, number>>
  /** I-1: dos `trazidos`, os que voltam excluídos mas «Excluídos» não lista (revisão, posição…): o resumo não os diz. */
  naoDitos: Partial<Record<Tipo, number>>
  /** Quantos registros que já existem aqui recebem algo da cópia (um por registro). */
  atualizados: number
  /** As imagens da cópia que ficam vivas depois do plano (bem formadas, com os nomes dos arquivos conhecidos). */
  imagens: string[]
  /** Os nomes dos arquivos de cada imagem de `imagens` (`arquivosDaImagem` do registro da cópia). */
  arquivosDasImagens: Record<string, string[]>
  /** Os registros `imagem` vivos que o plano cria (as fotos que voltam). */
  imagensNovas: string[]
  /** I-1: os registros `imagem` que o plano cria excluídos (as fotos que voltam para «Excluídos»). */
  imagensExcluidas: string[]
  /** O maior hlc da cópia (o relógio deste aparelho passa dele antes de gravar), ou null numa cópia vazia. */
  ate: string | null
}

const comparar = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** I-1: os tipos que a tela «Excluídos» lista (src/excluidos/modelo.ts, TIPOS_EXCLUIVEIS; o objeto só se for SKC). */
const LISTADOS_EM_EXCLUIDOS: readonly Tipo[] = ['objeto', 'nota', 'colecao', 'hipotese', 'regiao', 'imagem', 'sitio', 'verbete']
const listadoEmExcluidos = (tipo: Tipo, id: string) => LISTADOS_EM_EXCLUIDOS.includes(tipo) && (tipo !== 'objeto' || id.startsWith('OB-'))

/** A marca `a` vence `b`? Por (hlc, id do evento, op), como `compararMarcas` da fusão (`restaurar` > `excluir`). */
const vence = (a: Marca, b: Marca | null) => b === null || (comparar(a.hlc, b.hlc) || comparar(a.evento, b.evento) || comparar(a.op, b.op)) > 0

/** A escrita `a` vence `b`? Por (hlc, id do evento), como `compararEntradas` da fusão. */
const venceEntrada = (a: Pick<Entrada, 'hlc' | 'evento'>, b: Pick<Entrada, 'hlc' | 'evento'> | null) =>
  b === null || (comparar(a.hlc, b.hlc) || comparar(a.evento, b.evento)) > 0

/**
 * A escrita vencedora (hlc e id do evento) de um campo: a última de `entradasDoCampo`, a API pública da fusão que dá as
 * escritas de um campo em ordem de (hlc, evento). Só é procurada quando o campo empata no hlc (o caso de sempre: o mesmo
 * evento dos dois lados), e lê só aquele campo, sem consolidar o estado inteiro.
 */
const vencedora = (estado: Estado, tipo: Registro['tipo'], id: string, campo: string): Entrada | null =>
  entradasDoCampo(estado, tipo, id, campo).at(-1) ?? null

const ordemDosRegistros = (a: Registro, b: Registro) => compararPorPontoDeCodigo(a.tipo, b.tipo) || compararPorPontoDeCodigo(a.id, b.id)

/**
 * A testemunha do número de um objeto SKC confirmado na cópia que ele não terá depois do plano: a regra de
 * `testemunhasFaltando` (numeracao.ts, `testemunhaDoObjeto`), com o `numero`, o `nrSkc` e, na decisão 48 (`LIVRO:<id>`), o
 * número novo com `numeroTomadoPeloLivro`. `campos`: os valores que o registro terá (os daqui, com o que o plano escreve por
 * cima).
 */
const testemunha = (copia: CopiaDeSeguranca, id: string, campos: Readonly<Campos>): Campos => ({ ...testemunhaDoObjeto({ id, campos }, copia.numerosConfirmados ?? {}) })

/** O plano da restauração (veja o cabeçalho). Puro: não muda a cópia nem o estado. */
export function planoDeRestauracao(copia: CopiaDeSeguranca, atual: Estado): PlanoDeRestauracao {
  const daCopia = fundir(copia.eventos, copia.base ?? undefined)
  const plano: PlanoDeRestauracao = { pedidos: [], trazidos: {}, voltamExcluidos: {}, naoDitos: {}, atualizados: 0, imagens: [], arquivosDasImagens: {}, imagensNovas: [], imagensExcluidas: [], ate: null }
  const registros: Registro[] = []
  for (const m of daCopia.registros.values()) for (const r of m.values()) registros.push(r)
  registros.sort(ordemDosRegistros)

  for (const r of registros) {
    if (plano.ate === null || r.alteradoEm > plano.ate) plano.ate = r.alteradoEm
    const aqui = atual.registro(r.tipo, r.id)
    const marca = daCopia.marcaDeExclusao(r.tipo, r.id)
    let excluido: boolean
    if (!aqui) {
      const campos: Campos = { ...r.campos }
      plano.pedidos.push({ tipo: r.tipo, reg: r.id, op: 'criar', campos })
      const t = testemunha(copia, r.id, campos)
      if (Object.keys(t).length > 0) plano.pedidos.push({ tipo: r.tipo, reg: r.id, op: 'alterar', campos: t })
      if (marca?.op === 'excluir') {
        plano.pedidos.push({ tipo: r.tipo, reg: r.id, op: 'excluir', campos: {} })
        // I-1: só o que «Excluídos» mostra é dito como «volta para Excluídos»; a foto, à parte (`imagensExcluidas`)
        const lista = listadoEmExcluidos(r.tipo, r.id)
        if (r.tipo !== 'imagem') {
          const onde = lista ? plano.voltamExcluidos : plano.naoDitos
          onde[r.tipo] = (onde[r.tipo] ?? 0) + 1
        }
      }
      plano.trazidos[r.tipo] = (plano.trazidos[r.tipo] ?? 0) + 1
      // Um id malformado volta como registro, mas nunca tem arquivos: não conta como foto (revisão 1).
      if (r.tipo === 'imagem' && RE_ID_DE_IMAGEM.test(r.id)) (marca?.op === 'excluir' ? plano.imagensExcluidas : plano.imagensNovas).push(r.id)
      excluido = r.excluido
    } else {
      const alterar: Campos = {}
      for (const campo of Object.keys(r.campos)) {
        const hlcAqui = atual.hlcDoCampo(r.tipo, r.id, campo)
        const hlcDaCopia = daCopia.hlcDoCampo(r.tipo, r.id, campo)!
        // Por (hlc, evento), como a fusão; o id do evento só é preciso (e só é procurado) quando o hlc empata.
        const escreve =
          hlcAqui === null ||
          hlcAqui < hlcDaCopia ||
          (hlcAqui === hlcDaCopia && venceEntrada(vencedora(daCopia, r.tipo, r.id, campo)!, vencedora(atual, r.tipo, r.id, campo)))
        if (escreve) alterar[campo] = r.campos[campo]!
      }
      Object.assign(alterar, testemunha(copia, r.id, { ...aqui.campos, ...alterar }))
      let mudou = false
      if (Object.keys(alterar).length > 0) {
        const ordenado: Campos = {}
        for (const campo of Object.keys(alterar).sort(compararPorPontoDeCodigo)) ordenado[campo] = alterar[campo]!
        plano.pedidos.push({ tipo: r.tipo, reg: r.id, op: 'alterar', campos: ordenado })
        mudou = true
      }
      excluido = aqui.excluido
      if (marca && vence(marca, atual.marcaDeExclusao(r.tipo, r.id))) {
        plano.pedidos.push({ tipo: r.tipo, reg: r.id, op: marca.op, campos: {} })
        excluido = marca.op === 'excluir'
        mudou = true
      }
      if (mudou) plano.atualizados++
    }
    if (r.tipo === 'imagem' && !excluido && RE_ID_DE_IMAGEM.test(r.id)) {
      const img = lerImagem(r)
      if (img) {
        plano.imagens.push(r.id)
        plano.arquivosDasImagens[r.id] = arquivosDaImagem(img).map((a) => a.nome)
      }
    }
  }
  return plano
}

// ---------------------------------------------------------------------------------------------------------------- fotos

/** As fotos de um .zip (`lerCopia`): a chave é o nome da entrada, que só serve para procurar. */
export type FotosDaCopia = ReadonlyMap<string, () => Promise<Blob>>

export interface ConferenciaDasFotos {
  /** false: sem Dropbox, ou a listagem falhou (nada é dito sobre as fotos). */
  conferido: boolean
  /** As imagens com arquivo faltando no Dropbox cujos arquivos que faltam estão todos no .zip (entram na fila). */
  voltam: string[]
  /** As imagens com arquivo faltando no Dropbox que a cópia não traz (uma cópia sem fotos, ou o .zip sem eles). */
  semArquivo: string[]
  /** Por imagem de `voltam`: os nomes que faltam (vão para a fila) e os que já estão no Dropbox. */
  arquivos: Record<string, { faltam: string[]; noDropbox: string[] }>
  /** A listagem usada (para reaproveitar ao restaurar; veja `listagemReaproveitavel`), ou null se não houve. */
  listagem: ListagemDasImagens | null
}

/** O que está em usuario/imagens/ no Dropbox: pasta (id, em minúsculas) → nomes dos arquivos (em minúsculas). */
export interface ListagemDasImagens {
  /** Quando foi feita (Date.now()). */
  em: number
  pastas: ReadonlyMap<string, ReadonlySet<string>>
}

const NADA_CONFERIDO: ConferenciaDasFotos = Object.freeze({ conferido: false, voltam: [], semArquivo: [], arquivos: {}, listagem: null }) as ConferenciaDasFotos

const PASTA_DAS_IMAGENS = 'usuario/imagens'

/**
 * UMA listagem recursiva de usuario/imagens (paginada pela Escrita), indexada por pasta (revisão 1: antes, uma por imagem).
 * O Dropbox pode devolver o caminho com outras maiúsculas (path_display): tudo vai em minúsculas. Lança se a listagem falha.
 */
export async function listarImagensNoDropbox(escrita: Escrita, agora: () => number = Date.now): Promise<ListagemDasImagens> {
  const pastas = new Map<string, Set<string>>()
  const prefixo = `${PASTA_DAS_IMAGENS}/`.toLowerCase()
  for (const a of await escrita.listar(PASTA_DAS_IMAGENS, { recursivo: true })) {
    const caminho = a.caminho.toLowerCase()
    if (!caminho.startsWith(prefixo)) continue
    const resto = caminho.slice(prefixo.length)
    const barra = resto.indexOf('/')
    if (barra <= 0) continue
    const pasta = resto.slice(0, barra)
    let nomes = pastas.get(pasta)
    if (!nomes) pastas.set(pasta, (nomes = new Set()))
    nomes.add(resto.slice(barra + 1))
  }
  return { em: agora(), pastas }
}

/** Quanto tempo a listagem de «Lendo…» vale para «Restaurar» (o mesmo plano). Depois disso, lista de novo. */
export const LISTAGEM_FRESCA_MS = 2 * 60_000

const mesmoPlano = (a: PlanoDeRestauracao, b: PlanoDeRestauracao) =>
  JSON.stringify([a.pedidos, a.imagens, a.arquivosDasImagens]) === JSON.stringify([b.pedidos, b.imagens, b.arquivosDasImagens])

/**
 * A listagem feita ao escolher a cópia ainda serve para restaurar? Só com o mesmo plano (nada mudou aqui desde o resumo) e
 * se ainda é fresca (`LISTAGEM_FRESCA_MS`); senão null, e `aplicarRestauracao` lista uma vez mais.
 */
export function listagemReaproveitavel(
  anterior: { plano: PlanoDeRestauracao; listagem: ListagemDasImagens | null } | null,
  plano: PlanoDeRestauracao,
  agora: number = Date.now(),
): ListagemDasImagens | null {
  if (!anterior?.listagem || agora - anterior.listagem.em > LISTAGEM_FRESCA_MS || agora < anterior.listagem.em) return null
  return mesmoPlano(anterior.plano, plano) ? anterior.listagem : null
}

/** O nome procurado no .zip: sempre montado aqui, de um id bem formado e de um nome de `arquivosDaImagem`. */
const nomeNoZip = (id: string, nome: string) => `imagens/${id}/${nome}`

/**
 * Para cada imagem de `plano.imagens` que não está na fila deste aparelho, a listagem de usuario/imagens (uma só; a de
 * `listagem`, se dada) diz que arquivos faltam no Dropbox; com `fotos` (o .zip), os que faltam e estão nele voltam. Sem
 * `escrita` nem `listagem`, ou se a listagem falha: `conferido: false` e nada. Não muda nada.
 */
export async function conferirFotos(
  plano: PlanoDeRestauracao,
  fotos: FotosDaCopia | null,
  escrita: Escrita | null,
  listagem: ListagemDasImagens | null = null,
): Promise<ConferenciaDasFotos> {
  if (!escrita && !listagem) return NADA_CONFERIDO
  let lista = listagem
  if (!lista) {
    if (plano.imagens.length === 0) return { ...NADA_CONFERIDO, conferido: true }
    try {
      lista = await listarImagensNoDropbox(escrita!)
    } catch {
      return NADA_CONFERIDO
    }
  }
  const resultado: ConferenciaDasFotos = { conferido: true, voltam: [], semArquivo: [], arquivos: {}, listagem: lista }
  // As que já estão na fila deste aparelho (criadas aqui, ou restauradas antes) estão a caminho: não faltam.
  const naFila = new Set(plano.imagens.length > 0 ? await idsLocais().catch(() => [] as string[]) : [])
  for (const id of plano.imagens) {
    if (!RE_ID_DE_IMAGEM.test(id) || naFila.has(id)) continue
    const noDropbox = lista.pastas.get(id.toLowerCase()) ?? new Set<string>()
    const nomes = plano.arquivosDasImagens[id] ?? []
    const faltam = nomes.filter((nome) => !noDropbox.has(nome.toLowerCase()))
    if (faltam.length === 0) continue
    if (fotos && faltam.every((nome) => fotos.has(nomeNoZip(id, nome)))) {
      resultado.voltam.push(id)
      resultado.arquivos[id] = { faltam, noDropbox: nomes.filter((n) => !faltam.includes(n)) }
    } else resultado.semArquivo.push(id)
  }
  return resultado
}

/**
 * Quantas fotos voltam: as imagens que o plano cria (menos as que ficam sem arquivo) mais as que entram na fila. Sem
 * conferir o Dropbox, só as que o plano cria.
 */
export function contarFotos(plano: PlanoDeRestauracao, conferencia: ConferenciaDasFotos, deFora: ReadonlySet<string> = new Set()): number {
  if (!conferencia.conferido) return plano.imagensNovas.length
  const sem = new Set([...conferencia.semArquivo, ...deFora])
  const voltam = new Set(plano.imagensNovas.filter((id) => !sem.has(id)))
  for (const id of conferencia.voltam) if (!deFora.has(id)) voltam.add(id)
  return voltam.size
}

export interface ResultadoDaRestauracao {
  /** As fotos que voltam (veja `contarFotos`). */
  fotosRestauradas: number
  /** O Dropbox não pôde ser conferido (sem internet, sem login, listagem que falhou): nada entrou na fila. */
  fotosSemConferir: boolean
  /** As fotos do .zip que não puderam entrar na fila (arquivo danificado no .zip, sem espaço no aparelho). */
  fotosQueFalharam: number
}

/**
 * Restaura: o relógio deste aparelho passa do maior hlc da cópia; os pedidos são gravados numa só transação
 * (`registrarVarios`: tudo ou nada; se falha, rejeita e nada mais acontece); depois, com o .zip e o Dropbox, as fotos que
 * faltam lá entram na fila deste aparelho, sob a trava da sincronização (a rodada nunca vê uma imagem pela metade). No fim,
 * avisa a fila e pede uma sincronização (sem esperar por ela).
 */
export async function aplicarRestauracao(
  plano: PlanoDeRestauracao,
  fotos: FotosDaCopia | null,
  dep: { escrita: Escrita | null; listagem?: ListagemDasImagens | null },
): Promise<ResultadoDaRestauracao> {
  if (plano.ate) await avancarRelogio(plano.ate)
  await registrarVarios(plano.pedidos)
  // A listagem de «Lendo…», se ainda vale (listagemReaproveitavel); senão, uma listagem nova.
  const conferencia = await conferirFotos(plano, fotos, dep.escrita, dep.listagem ?? null)
  const deFora = new Set<string>()
  if (fotos && conferencia.voltam.length > 0) {
    await comTrava(async () => {
      const locais = new Set(await idsLocais().catch(() => [] as string[]))
      for (const id of conferencia.voltam) {
        // Já na fila deste aparelho (criada aqui e ainda subindo): fica como está.
        if (locais.has(id)) continue
        const { faltam, noDropbox } = conferencia.arquivos[id]!
        let guardou = false
        try {
          const arquivos = []
          for (const nome of faltam) arquivos.push({ nome, blob: await fotos.get(nomeNoZip(id, nome))!() })
          // Primeiro os arquivos (sem envio.json, a fase dos originais não pega a imagem); depois, o que já está no Dropbox.
          await guardarLocal(id, arquivos)
          guardou = true
          if (noDropbox.length > 0) await gravarEstadoDoEnvio(id, { ...ESTADO_INICIAL, enviados: noDropbox })
        } catch {
          // Sem o envio.json, a fila tentaria subir os que já estão no Dropbox e não estão aqui: a pasta sai inteira.
          if (guardou) await removerLocal(id).catch(() => undefined)
          deFora.add(id)
        }
      }
    })
  }
  avisarFila()
  void sincronizarAgora('restauracao')
  return { fotosRestauradas: contarFotos(plano, conferencia, deFora), fotosSemConferir: !conferencia.conferido, fotosQueFalharam: deFora.size }
}

// ---------------------------------------------------------------------------------------------------------------- textos

const NOMES_DOS_TIPOS: readonly [Tipo, string, string][] = [
  ['nota', 'nota', 'notas'],
  ['colecao', 'coleção', 'coleções'],
  ['hipotese', 'hipótese', 'hipóteses'],
  ['regiao', 'região', 'regiões'],
  ['objeto', 'objeto SKC', 'objetos SKC'],
  ['sitio', 'sítio', 'sítios'],
  ['verbete', 'verbete', 'verbetes'],
]
/** Os tipos sem nome próprio no resumo (posições, sítios de objetos, revisão, ligações, a bandeja de comparação). */
const OUTROS_TIPOS: readonly Tipo[] = ['posicao', 'item-sitio', 'revisao', 'ligacao', 'comparar']

const quantos = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

/** "a", "a e b", "a, b e c". */
export function listaComE(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join('')
  return `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`
}

/** O que volta, em partes: "12 notas", "1 coleção", "1 objeto SKC", "2 outros registros", "3 fotos". */
function partesDoQueVolta(trazidos: PlanoDeRestauracao['trazidos'], fotos: number): { partes: string[]; total: number } {
  const partes: string[] = []
  let total = 0
  for (const [tipo, um, varios] of NOMES_DOS_TIPOS) {
    const n = trazidos[tipo] ?? 0
    if (n > 0) partes.push(quantos(n, um, varios))
    total += n
  }
  const outros = OUTROS_TIPOS.reduce((s, t) => s + (trazidos[t] ?? 0), 0)
  if (outros > 0) partes.push(quantos(outros, 'outro registro', 'outros registros'))
  if (fotos > 0) partes.push(quantos(fotos, 'foto', 'fotos'))
  return { partes, total: total + outros + fotos }
}

/**
 * P13: os `trazidos` que voltam vivos e os que voltam para «Excluídos» (os tipos que a tela lista). Os que voltam excluídos
 * de um tipo que ela não lista não são ditos em parte nenhuma (I-1).
 */
function separados(plano: PlanoDeRestauracao): { vivos: PlanoDeRestauracao['trazidos']; excluidos: PlanoDeRestauracao['trazidos'] } {
  const vivos: PlanoDeRestauracao['trazidos'] = {}
  for (const [tipo, n] of Object.entries(plano.trazidos) as [Tipo, number][]) vivos[tipo] = n - (plano.voltamExcluidos[tipo] ?? 0) - (plano.naoDitos[tipo] ?? 0)
  return { vivos, excluidos: plano.voltamExcluidos }
}

const doisDigitos = (n: number) => String(n).padStart(2, '0')

/** "5/11/2026, 15h20" (hora local). */
export function dataDaCopia(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}, ${d.getHours()}h${doisDigitos(d.getMinutes())}`
}

/** "feita no Mac", "feita neste aparelho", "feita em outro aparelho" (sem nome, ou o nome genérico). */
function feitaEm(aparelho: CopiaDeSeguranca['aparelho'], esteAparelho: string): string {
  if (aparelho.id === esteAparelho) return 'feita neste aparelho'
  const nome = aparelho.nome.trim()
  return nome && nome !== 'Este aparelho' ? `feita no ${nome}` : 'feita em outro aparelho'
}

export const NADA_A_TRAZER = 'Esta cópia não tem nada que falte aqui.'
export const SEM_CONFERIR_AS_FOTOS = 'As fotos não puderam ser conferidas no Dropbox agora; restaure de novo quando estiver conectado.'

/** As fotos que faltam no Dropbox e a cópia não traz (só quando a listagem respondeu). */
function avisoDasFotosSemArquivo(n: number, comFotos: boolean): string | null {
  if (n === 0) return null
  const fotos = quantos(n, 'foto', 'fotos')
  if (comFotos) return `${fotos} desta cópia não ${n === 1 ? 'está' : 'estão'} no Dropbox nem dentro dela.`
  return `${fotos} desta cópia não ${n === 1 ? 'está' : 'estão'} no Dropbox, e ela não ${n === 1 ? 'a' : 'as'} traz: use a cópia completa.`
}

export interface EntradaDoResumo {
  copia: CopiaDeSeguranca
  plano: PlanoDeRestauracao
  conferencia: ConferenciaDasFotos
  /** É a cópia completa (.zip)? */
  comFotos: boolean
  /** O id deste aparelho. */
  esteAparelho: string
}

/**
 * Há algo a trazer que o resumo diga (registros que voltam, fotos que voltam, itens a atualizar)? Sem nada, a tela só
 * oferece «Cancelar». Uma foto que a cópia não traz (sem arquivo no Dropbox nem no .zip) não conta: o resumo diz que ela
 * não vem, e o texto e o botão concordam.
 */
export const temAlgoATrazer = (plano: PlanoDeRestauracao, conferencia: ConferenciaDasFotos) => {
  const { vivos, excluidos } = separados(plano)
  return plano.atualizados > 0 || partesDoQueVolta(vivos, contarFotos(plano, conferencia)).total > 0 || partesDoQueVolta(excluidos, plano.imagensExcluidas.length).total > 0
}

/**
 * O resumo antes de restaurar (especificação §6.2): «Cópia de 5/11/2026, 15h20, feita no Mac. Vai trazer de volta 12 notas,
 * 1 coleção, 1 objeto SKC e 3 fotos que faltam aqui, e atualizar 2 itens que estão mais novos na cópia. O que você mudou
 * depois dessa data continua valendo.», ou «… Esta cópia não tem nada que falte aqui.»; com as fotos que faltam no Dropbox
 * e a cópia não traz, a frase delas no fim.
 */
export function textoDoResumo({ copia, plano, conferencia, comFotos, esteAparelho }: EntradaDoResumo): string {
  const frases = [`Cópia de ${dataDaCopia(copia.geradoEm)}, ${feitaEm(copia.aparelho, esteAparelho)}.`]
  const { vivos, excluidos } = separados(plano)
  const { partes, total } = partesDoQueVolta(vivos, contarFotos(plano, conferencia))
  const fora = partesDoQueVolta(excluidos, plano.imagensExcluidas.length)
  const atualizar = plano.atualizados > 0 ? `atualizar ${quantos(plano.atualizados, 'item que está mais novo', 'itens que estão mais novos')} na cópia` : null
  if (partes.length === 0 && fora.partes.length === 0 && !atualizar) frases.push(NADA_A_TRAZER)
  else {
    // P13: «… que faltam aqui, e 1 nota que volta para Excluídos»; só excluídos: «1 nota, que volta para Excluídos»
    const voltaPara = fora.total === 1 ? 'que volta para Excluídos' : 'que voltam para Excluídos'
    const trazer =
      partes.length > 0
        ? `trazer de volta ${listaComE(partes)} ${total === 1 ? 'que falta' : 'que faltam'} aqui${fora.partes.length > 0 ? `, e ${listaComE(fora.partes)} ${voltaPara}` : ''}`
        : fora.partes.length > 0
          ? `trazer de volta ${listaComE(fora.partes)}, ${voltaPara}`
          : null
    // m-6: com algo a trazer, atualizar vai numa frase própria («Também vai atualizar …»)
    if (trazer) frases.push(`Vai ${trazer}.`)
    if (atualizar) frases.push(trazer ? `Também vai ${atualizar}.` : `Vai ${atualizar}.`)
    frases.push('O que você mudou depois dessa data continua valendo.')
  }
  const aviso = avisoDasFotosSemArquivo(conferencia.semArquivo.length, comFotos)
  if (aviso) frases.push(aviso)
  return frases.join(' ')
}

/**
 * Depois de restaurar: «Restaurado: 12 notas, 1 coleção, 1 objeto SKC e 3 fotos. Sobe na próxima sincronização.»; sem o
 * Dropbox, mais «As fotos não puderam ser conferidas…»; fotos do .zip que não entraram na fila, mais a frase delas.
 */
export function textoDoRestaurado(plano: PlanoDeRestauracao, r: ResultadoDaRestauracao): string {
  const { vivos, excluidos } = separados(plano)
  const { partes } = partesDoQueVolta(vivos, r.fotosRestauradas)
  const fora = partesDoQueVolta(excluidos, plano.imagensExcluidas.length)
  const frases: string[] = []
  // P13: «Restaurado: 2 notas e 1 coleção; 1 nota voltou para Excluídos.»; só excluídos: «Restaurado: 1 nota, que voltou …»
  const voltou = fora.total === 1 ? 'voltou para Excluídos' : 'voltaram para Excluídos'
  if (partes.length > 0 && fora.partes.length > 0) frases.push(`Restaurado: ${listaComE(partes)}; ${listaComE(fora.partes)} ${voltou}. Sobe na próxima sincronização.`)
  else if (partes.length > 0) frases.push(`Restaurado: ${listaComE(partes)}. Sobe na próxima sincronização.`)
  else if (fora.partes.length > 0) frases.push(`Restaurado: ${listaComE(fora.partes)}, que ${voltou}. Sobe na próxima sincronização.`)
  else if (plano.atualizados > 0) frases.push(`Restaurado: ${quantos(plano.atualizados, 'item atualizado', 'itens atualizados')}. Sobe na próxima sincronização.`)
  else frases.push(NADA_A_TRAZER)
  if (r.fotosSemConferir && plano.imagens.length > 0) frases.push(SEM_CONFERIR_AS_FOTOS)
  if (r.fotosQueFalharam > 0) {
    const n = r.fotosQueFalharam
    frases.push(`${quantos(n, 'foto da cópia não pôde', 'fotos da cópia não puderam')} ser ${n === 1 ? 'guardada' : 'guardadas'} neste aparelho; restaure de novo para tentar outra vez.`)
  }
  return frases.join(' ')
}

/** O Dropbox para conferir as fotos: nenhum sem internet (nem tenta) ou sem login. */
export async function escritaParaRestaurar(): Promise<Escrita | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
  try {
    return await escritaDropbox()
  } catch {
    return null
  }
}
