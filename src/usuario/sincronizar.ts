/**
 * A sincronização da camada do usuário pela pasta do app no Dropbox (só sob usuario/):
 *
 *   usuario/diario/<aparelho>/<segmento 6 díg>.jsonl   segmentos imutáveis de eventos (JSONL, UTF-8)
 *   usuario/estado.json                                 {v:1, base, ate, segmentos, numeros?}: a consolidação
 *   usuario/aparelhos/<aparelho>.json                   {id, nome, atualizadoEm}: cada um grava só o seu
 *
 * Uma rodada (`sincronizar`), sempre na mesma ordem:
 *  1. lista usuario/diario/ e usuario/aparelhos/ (recursivo) e usuario/ (só o que está direto nela: o
 *     estado.json); NÃO desce a usuario/imagens/. Dela saem o rev do estado.json, os segmentos e os nomes;
 *  2. se o estado.json mudou desde o último visto, baixa-o, valida e recebe a base: os segmentos que ele
 *     cobre (segmentos[aparelho]) não precisam mais ser baixados, e os eventos deste aparelho que ele
 *     cobre são podados do IndexedDB (só os já enviados);
 *  3. baixa os nomes dos aparelhos que mudaram;
 *  4. baixa os segmentos novos de cada aparelho (inclusive deste, se o Dropbox tem algum que ele não
 *     conhece: o banco voltou de uma cópia antiga), valida cada linha e funde. Um segmento malformado é
 *     reportado e não impede os demais; uma lacuna nunca é pulada;
 *  5. empacota os eventos locais não enviados em segmentos (planos gravados ANTES do envio), envia cada
 *     um e só então marca os eventos como enviados. Reenviar o mesmo plano dá o mesmo nome e conteúdo;
 *  6. publica o nome deste aparelho, se mudou;
 *  7. consolida (grava estado.json) se há mais de 20 segmentos novos desde o estado.json, uma vez por dia, ou se
 *     há objeto SKC com número ou SKC, Nr. provisório (Tarefa 9 e decisão 38: é a consolidação que CONFIRMA os
 *     números, no mapa `numeros`),
 *     com escrita condicional ao rev lido. Se outro aparelho gravou antes, relê e não grava;
 *  8. escreve as testemunhas (`alterar {numero, nrSkc}`) dos números confirmados que ainda não as têm (veja
 *     src/objetos-skc/numeracao.ts).
 * Baixar antes de enviar garante que um evento local nunca sobe com um id que o Dropbox já tem (passo 4).
 *
 * Segmento com problema (malformado, grande demais, linhas ilegíveis, partes de outro aparelho): o que há de
 * válido nele entra, mas ele NÃO conta como lido para a cobertura publicada no estado.json (veja
 * `sync:problemas` em diarioLocal.ts): o aparelho dono dele só poda o que uma base realmente cita.
 * Um estado.json que esta versão não consegue ler (v maior, malformado, grande demais) nunca é regravado; nem um que ela lê
 * só em parte (registros de um tipo que só uma versão mais nova conhece, ou ilegíveis; A-7 da Tarefa 17): o que ela lê
 * entra, mas regravá-lo apagaria o resto.
 *
 * Nada do Dropbox é confiável: eventos, bases, nomes e o próprio estado.json são validados. Os erros de
 * rede, login e permissão sobem (o progresso já gravado fica: planos, marcas, segmentos lidos).
 */
import { ErroDeConflito, ErroDeArquivoAusente, hashDeConteudo, type ArquivoDoUsuario, type Escrita } from '../dropbox/escrita'
import { ErroDePermissao } from '../dropbox/tentativas'
import { aparelhoAtual } from './aparelho'
import { eventosLocaisNaoEnviados, lerBase, todosEventos, unirBase } from './armazem'
import {
  CHAVE_SEGMENTO,
  contarNaoEnviados,
  descartarPlano,
  elevarLidos,
  gravarConfig,
  jaLido,
  lerConfig,
  lerLidos,
  lerPlanos,
  lerProblemas,
  linhasDosIds,
  marcarComoEnviadosPorCopia,
  marcarSegmentoEnviado,
  planejar,
  podarProprios,
  registrarLidos,
  registrarProblemas,
  renumerarLocais,
  trocarDeAparelho,
  type Cobertura,
  type Plano,
  type Problema,
  type Problemas,
} from './diarioLocal'
import { compararCopias, jsonCanonico, tipoValido, validarEvento, type Evento, type Tipo } from './eventos'
import { carregarEstado, estadoAtual, receberEventos, registrarVarios } from './estado'
import { consolidar, entradasDoCampo, fundir, validarBase, type EstadoConsolidado } from './fusao'
import { maiorHlc } from './hlc'
import { lerConfirmados, unirConfirmadosGuardados } from '../objetos-skc/confirmados'
import { confirmacoes, idDaChaveDoMapa, numerar, testemunhasDoLivro, testemunhasFaltando, unirConfirmados, validarConfirmados } from '../objetos-skc/numeracao'
import { numerosDoPacote } from '../objetos-skc/pacote'

export const MAXIMO_DE_EVENTOS_POR_SEGMENTO = 500
/**
 * Consolida quando a cobertura pode avançar por MAIS que isto de segmentos (os que foram lidos por inteiro, em
 * sequência, além do que o estado.json já cobre). Segmentos além de um problema ou de uma lacuna não contam:
 * a cobertura não passa por eles, e contá-los reescreveria o estado.json a cada rodada.
 */
export const SEGMENTOS_PARA_CONSOLIDAR = 20
export const INTERVALO_DE_CONSOLIDACAO_MS = 24 * 60 * 60 * 1000
export const CAMINHO_DO_ESTADO = 'usuario/estado.json'
/** Um segmento tem até 500 eventos: um arquivo muito maior que isto não é um segmento de verdade. */
const TAMANHO_MAXIMO_DO_SEGMENTO = 32 * 1024 * 1024
/** O estado.json é a base inteira, mas passar disto é sinal de arquivo errado: não se baixa nem se regrava. */
const TAMANHO_MAXIMO_DO_ESTADO = 64 * 1024 * 1024
/** Um segmento com problema é tentado de novo quando o rev dele muda ou depois deste tempo. */
const NOVA_TENTATIVA_DE_SEGMENTO_MS = 60 * 60 * 1000
const MAXIMO_DE_TROCAS_DE_ID_POR_RODADA = 2
/** Uma base maior que isto não é gravada: um aparelho nunca deve deixar um estado.json que os outros não leem (limite deles: 64 MB). */
const TAMANHO_MAXIMO_PARA_GRAVAR_O_ESTADO = 48 * 1024 * 1024
const TAMANHO_MAXIMO_DO_NOME = 4096
const SEGMENTOS_POR_LOTE = 20
const CONFLITOS_PROPRIOS_POR_RODADA = 3

const APARELHO = /^[a-z0-9]{8}$/
const RE_SEGMENTO = /^usuario\/diario\/([a-z0-9]{8})\/(\d{6})\.jsonl$/
const RE_NOME = /^usuario\/aparelhos\/([a-z0-9]{8})\.json$/

export type Motivo = 'abrir' | 'mudanca' | 'rede' | 'visivel' | 'manual' | 'atalho' | 'preparando' | 'tentar-de-novo' | 'restauracao'

export const caminhoDoSegmento = (aparelho: string, seg: number) => `usuario/diario/${aparelho}/${String(seg).padStart(6, '0')}.jsonl`
export const caminhoDoNome = (aparelho: string) => `usuario/aparelhos/${aparelho}.json`

export interface Malformado {
  caminho: string
  /** Em português, para a tela de Sincronização ("2 linhas ilegíveis"). */
  motivo: string
  /** Parte do arquivo era válida e entrou (o resto foi ignorado). */
  parcial?: boolean
}

export interface MesmoCampo {
  tipo: Tipo
  reg: string
  campo: string
  /** O outro aparelho. */
  aparelho: string
  nome: string | null
  /** Qual versão ficou valendo (a outra está no histórico). */
  venceu: 'este' | 'outro'
  hlcDeste: string
  hlcDoOutro: string
}

export interface ResumoSync {
  motivo: Motivo
  /** Eventos deste aparelho enviados nesta rodada. */
  enviados: number
  segmentosEnviados: string[]
  /** Eventos novos recebidos (que este aparelho ainda não tinha). */
  recebidos: number
  /** Eventos lidos dos segmentos de cada outro aparelho nesta rodada. */
  porAparelho: { aparelho: string; nome: string | null; eventos: number }[]
  /** Eventos recusados pela validação. */
  ignorados: number
  malformados: Malformado[]
  /** Segmentos que faltam entre os já lidos (serão lidos quando aparecerem). */
  faltando: { aparelho: string; segmento: number }[]
  estadoBaixado: boolean
  consolidacao: 'gravada' | 'outro-aparelho' | null
  /** Eventos deste aparelho podados do IndexedDB (cobertos pela base). */
  podados: number
  /** Eventos locais não enviados que ganharam id novo (o Dropbox já tinha o id). */
  renumerados: number
  /** Por que o estado.json do Dropbox não pôde ser lido nesta rodada (versão mais nova, malformado, grande demais); null se pôde. */
  estadoIlegivel: string | null
  /**
   * O estado.json foi lido só em parte (A-7: registros que esta versão não conhece, ou ilegíveis). Vai junto com
   * `estadoIlegivel` (o motivo); a tela mostra um aviso próprio, sem a sugestão de apagar o arquivo.
   */
  estadoLidoEmParte: boolean
  /**
   * Com `estadoLidoEmParte`: os registros que ficaram de fora são SÓ ilegíveis (nenhum de tipo que uma versão nova conhece; A-28).
   * Apagar o estado.json é seguro nesse caso: o app o recria a partir dos diários.
   */
  estadoSoIlegiveis: boolean
  /** Este aparelho ganhou um id novo (o Dropbox tinha, com o id dele, conteúdo que ele nunca produziu). */
  aparelhoTrocado: { de: string; para: string } | null
  mesmoCampo: MesmoCampo[]
  /** Objetos SKC cujo número esta rodada confirmou (gravando ou recebendo um estado.json). */
  numerosConfirmados?: string[]
}

/** O Dropbox tem conteúdo com o id deste aparelho que ele nunca produziu: o id mudou e a rodada recomeça. */
class TrocaDeAparelho extends Error {
  constructor(
    readonly de: string,
    readonly para: string,
  ) {
    super(`o aparelho ${de} passou a ser ${para}`)
    this.name = 'TrocaDeAparelho'
  }
}

export interface ArquivoDeEstado extends Cobertura {
  v: 1
  base: EstadoConsolidado
  /**
   * Os números de objeto SKC confirmados (id → número; Tarefa 9), os SKC, Nr. confirmados (`SKC:<id>` → '12';
   * decisão 38) e o número novo de um objeto cujo número um livro tomou (`LIVRO:<id>` → número; decisão 48, revisão 2
   * da Tarefa 16). Ausente quando vazio. Cada estado.json contém os do anterior (quem grava leu o anterior): é a cadeia que
   * torna um número definitivo.
   */
  numeros?: Record<string, string>
}

export interface OpcoesDaSincronizacao {
  motivo: Motivo
  /** O relógio (para os testes). */
  agora?: () => number
}

const objeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const inteiroNaoNegativo = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0

function mapaDeContagens(x: unknown): Record<string, number> {
  const saida: Record<string, number> = {}
  if (!objeto(x)) return saida
  for (const [ap, n] of Object.entries(x)) if (APARELHO.test(ap) && inteiroNaoNegativo(n) && n > 0) saida[ap] = n
  return saida
}

/** Confere um estado.json baixado. null se a forma não serve; registros ruins da base ficam de fora. */
export function validarArquivoDeEstado(x: unknown): ArquivoDeEstado | null {
  if (!objeto(x) || x.v !== 1 || !objeto(x.ate) || !objeto(x.segmentos)) return null
  const base = validarBase(x.base)
  if (!base) return null
  const arquivo: ArquivoDeEstado = { v: 1, base: base.base, ate: mapaDeContagens(x.ate), segmentos: mapaDeContagens(x.segmentos) }
  const numeros = validarConfirmados(x.numeros)
  if (Object.keys(numeros).length) arquivo.numeros = numeros
  return arquivo
}

/**
 * Por que um estado.json válido não pode ser REGRAVADO por esta versão (A-7 da Tarefa 17), ou null se pode: a base tinha
 * registros que `validarBase` deixou de fora (de um tipo que só uma versão mais nova do app conhece, ou ilegíveis). O que se
 * lê dele entra; mas regravá-lo com a base desta versão apagaria esses registros para todos os aparelhos (a cobertura diria
 * que os segmentos deles já estão na base).
 */
function motivoDoEstadoIncompleto(x: unknown): { motivo: string; soIlegiveis: boolean } | null {
  const registros = objeto(x) && objeto(x.base) && Array.isArray(x.base.registros) ? x.base.registros : []
  const validada = validarBase(objeto(x) ? x.base : null)
  if (!validada || validada.ignorados === 0) return null
  const bons = new Set(validada.base.registros)
  let desconhecidos = 0
  for (const r of registros) if (!bons.has(r as never) && objeto(r) && typeof r.tipo === 'string' && !tipoValido(r.tipo)) desconhecidos++
  const ilegiveis = validada.ignorados - desconhecidos
  const partes: string[] = []
  if (desconhecidos) partes.push(`versão mais nova do app em outro aparelho: ${plural(desconhecidos, 'registro que esta versão não conhece', 'registros que esta versão não conhece')}`)
  if (ilegiveis) partes.push(plural(ilegiveis, 'registro ilegível', 'registros ilegíveis'))
  return { motivo: `${partes.join('; ')} (o que pôde ser lido entrou; o arquivo não é regravado)`, soIlegiveis: desconhecidos === 0 }
}

/** Quantos eventos deste aparelho ainda não subiram (para o indicador). */
export const contarPorEnviar = contarNaoEnviados

/** A camada do usuário deste aparelho está vazia (nem base, nem eventos)? É a primeira vez. */
export async function camadaDoUsuarioVazia(): Promise<boolean> {
  const [base, eventos] = await Promise.all([lerBase(), todosEventos()])
  return base === null && eventos.length === 0
}

// ------------------------------------------------------------------ leitura do Dropbox

interface Listagem {
  estado: ArquivoDoUsuario | null
  segmentos: Map<string, Map<number, ArquivoDoUsuario>>
  nomes: Map<string, ArquivoDoUsuario>
}

function analisar(lista: readonly ArquivoDoUsuario[]): Listagem {
  const r: Listagem = { estado: null, segmentos: new Map(), nomes: new Map() }
  for (const a of lista) {
    if (a.caminho === CAMINHO_DO_ESTADO) {
      r.estado = a
      continue
    }
    const s = RE_SEGMENTO.exec(a.caminho)
    if (s) {
      const seg = Number(s[2])
      if (seg < 1) continue
      let m = r.segmentos.get(s[1]!)
      if (!m) r.segmentos.set(s[1]!, (m = new Map()))
      m.set(seg, a)
      continue
    }
    const n = RE_NOME.exec(a.caminho)
    if (n) r.nomes.set(n[1]!, a)
  }
  return r
}

const decodificador = () => new TextDecoder('utf-8', { fatal: true })

interface SegmentoLido {
  aparelho: string
  seg: number
  /** O rev do arquivo lido ('' se não veio de uma listagem). */
  rev: string
  eventos: Evento[]
  maiorSeq: number
  problema: string | null
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

function lerSegmento(aparelho: string, seg: number, rev: string, bytes: ArrayBuffer): SegmentoLido {
  const lido: SegmentoLido = { aparelho, seg, rev, eventos: [], maiorSeq: 0, problema: null }
  let texto: string
  try {
    texto = decodificador().decode(bytes)
  } catch {
    lido.problema = 'não é texto UTF-8'
    return lido
  }
  let ilegiveis = 0
  let invalidos = 0
  let deOutro = 0
  for (const linha of texto.split('\n')) {
    if (linha.trim() === '') continue
    let x: unknown
    try {
      x = JSON.parse(linha)
    } catch {
      ilegiveis++
      continue
    }
    const v = validarEvento(x)
    if (!v.ok) {
      invalidos++
      continue
    }
    if (v.evento.aparelho !== aparelho) {
      deOutro++
      continue
    }
    lido.eventos.push(v.evento)
    lido.maiorSeq = Math.max(lido.maiorSeq, Number(/-(\d+)-\d+$/.exec(v.evento.id)![1]))
  }
  const partes: string[] = []
  if (ilegiveis) partes.push(plural(ilegiveis, 'linha ilegível', 'linhas ilegíveis'))
  if (invalidos) partes.push(plural(invalidos, 'evento inválido', 'eventos inválidos'))
  if (deOutro) partes.push(plural(deOutro, 'evento de outro aparelho', 'eventos de outro aparelho'))
  if (partes.length) lido.problema = partes.join(', ')
  return lido
}

function bytesDoSegmento(eventos: readonly Evento[]): Uint8Array {
  // As chaves na ordem do contrato; o conteúdo vem da linha guardada, que não muda: reenviar dá os mesmos bytes.
  const linhas = eventos.map((e) =>
    JSON.stringify({ v: e.v, id: e.id, hlc: e.hlc, aparelho: e.aparelho, tipo: e.tipo, reg: e.reg, op: e.op, campos: e.campos }),
  )
  return new TextEncoder().encode(linhas.map((l) => `${l}\n`).join(''))
}

const seqDe = (e: Evento) => Number(/-(\d+)-\d+$/.exec(e.id)![1])
const chaveDoCampo = (tipo: string, reg: string, campo: string) => `${tipo}\u0000${reg}\u0000${campo}`

// ------------------------------------------------------------------ a rodada

/**
 * Uma rodada de sincronização. Se o Dropbox revela que o id deste aparelho foi usado por outro (perfil
 * clonado, banco restaurado), o aparelho ganha um id novo (os eventos por enviar são recarimbados, nenhum se
 * perde) e a rodada recomeça com o id novo.
 */
export async function sincronizar(escrita: Escrita, opcoes: OpcoesDaSincronizacao): Promise<ResumoSync> {
  let trocado = null as { de: string; para: string } | null
  for (let trocas = 0; ; trocas++) {
    try {
      const resumo = await rodada(escrita, opcoes)
      if (trocado) resumo.aparelhoTrocado = trocado
      return resumo
    } catch (erro) {
      if (!(erro instanceof TrocaDeAparelho) || trocas >= MAXIMO_DE_TROCAS_DE_ID_POR_RODADA) throw erro
      trocado = { de: trocado?.de ?? erro.de, para: erro.para }
    }
  }
}

async function rodada(escrita: Escrita, opcoes: OpcoesDaSincronizacao): Promise<ResumoSync> {
  const agora = opcoes.agora ?? Date.now
  const eu = await aparelhoAtual()
  const resumo: ResumoSync = {
    motivo: opcoes.motivo,
    enviados: 0,
    segmentosEnviados: [],
    recebidos: 0,
    porAparelho: [],
    ignorados: 0,
    malformados: [],
    faltando: [],
    estadoBaixado: false,
    consolidacao: null,
    podados: 0,
    renumerados: 0,
    aparelhoTrocado: null,
    estadoIlegivel: null,
    estadoLidoEmParte: false,
    estadoSoIlegiveis: false,
    mesmoCampo: [],
    numerosConfirmados: [],
  }

  // Os campos que este aparelho tem por enviar: uma escrita de outro aparelho que chegar nesta rodada a um
  // deles é "o mesmo campo nos dois aparelhos".
  const pendentes = new Map<string, { tipo: Tipo; reg: string; campo: string; hlc: string; valor: string; outros: Set<string> }>()
  {
    const estado = estadoAtual()
    for (const e of await eventosLocaisNaoEnviados()) {
      for (const campo of Object.keys(e.campos)) {
        // A testemunha do número de um objeto SKC (Tarefa 9) é escrita pela própria sincronização, às vezes por dois
        // aparelhos: não é "o mesmo campo nos dois aparelhos".
        if (e.tipo === 'objeto' && (campo === 'numero' || campo === 'nrSkc')) continue
        const k = chaveDoCampo(e.tipo, e.reg, campo)
        const p = pendentes.get(k)
        const valor = jsonCanonico(e.campos[campo])
        if (p) {
          if (e.hlc > p.hlc) p.valor = valor
          p.hlc = maiorHlc(p.hlc, e.hlc)!
        } else {
          const outros = new Set(entradasDoCampo(estado, e.tipo, e.reg, campo).filter((x) => !x.evento.startsWith(`${eu.id}-`)).map((x) => x.evento))
          pendentes.set(k, { tipo: e.tipo, reg: e.reg, campo, hlc: e.hlc, valor, outros })
        }
      }
    }
  }

  // 1. A listagem: o diário e os nomes (recursivo), e só o que está direto em usuario/ (o estado.json). Nunca
  // desce a usuario/imagens/, que cresce com o uso e não interessa à sincronização.
  const listagem = analisar(
    (await Promise.all([escrita.listar('usuario', { recursivo: false }), escrita.listar('usuario/diario'), escrita.listar('usuario/aparelhos')])).flat(),
  )
  /** Eventos de cada outro aparelho que chegaram nesta rodada (pelos segmentos ou por uma base). */
  const porAparelho = new Map<string, number>()
  const contar = (ap: string, n: number) => {
    if (ap !== eu.id && n > 0) porAparelho.set(ap, (porAparelho.get(ap) ?? 0) + n)
  }

  // 2. O estado.json, se mudou. Um que esta versão não consegue ler NUNCA é regravado (`estadoIlegivel`).
  let estadoIlegivel: string | null = null
  let lidoEmParte = false
  let soIlegiveis = false
  if (listagem.estado) {
    const revConhecido = await lerConfig<string | null>('sync:estadoRev')
    if (listagem.estado.rev !== revConhecido) {
      const lido = await lerEstadoDoDropbox(escrita, listagem.estado.caminho, listagem.estado.tamanho)
      if (lido) {
        resumo.estadoBaixado = true
        if ('arquivo' in lido) {
          await receberArquivoDeEstado(lido.arquivo, eu.id, resumo, contar, { parcial: lido.incompleto !== null })
          await gravarConfig('sync:estadoHash', lido.hash)
          await gravarConfig('sync:consolidadoEm', agora())
          // Lido, mas com registros que ficaram de fora (A-7): o que entrou vale; o arquivo nunca é regravado por esta versão.
          if (lido.incompleto) {
            estadoIlegivel = lido.incompleto.motivo
            lidoEmParte = true
            soIlegiveis = lido.incompleto.soIlegiveis
            await gravarConfig('sync:estadoIlegivel', { rev: listagem.estado.rev, motivo: lido.incompleto.motivo, parcial: true, soIlegiveis })
          } else await gravarConfig('sync:estadoIlegivel', undefined)
        } else {
          estadoIlegivel = lido.ilegivel
          await gravarConfig('sync:estadoIlegivel', { rev: listagem.estado.rev, motivo: lido.ilegivel })
        }
        await gravarConfig('sync:estadoRev', listagem.estado.rev)
      }
    } else {
      const ilegivel = await lerConfig<{ rev: string; motivo: string; parcial?: boolean; soIlegiveis?: boolean }>('sync:estadoIlegivel')
      if (ilegivel && ilegivel.rev === listagem.estado.rev) {
        estadoIlegivel = ilegivel.motivo
        lidoEmParte = ilegivel.parcial === true
        soIlegiveis = lidoEmParte && ilegivel.soIlegiveis === true
      }
    }
    if (estadoIlegivel) {
      resumo.estadoIlegivel = estadoIlegivel
      resumo.estadoLidoEmParte = lidoEmParte
      resumo.estadoSoIlegiveis = soIlegiveis
      resumo.malformados.push({ caminho: CAMINHO_DO_ESTADO, motivo: estadoIlegivel })
    }
  }

  // 3. Os nomes dos aparelhos.
  const nomes = await atualizarNomes(escrita, listagem, eu.id)

  // 4. Os segmentos novos (deste aparelho também, se o Dropbox tem algum que ele não conhece).
  const planosAntes = new Set((await lerPlanos()).map((p) => p.seg))
  const lidos = await lerLidos()
  const problemas = await lerProblemas()
  const aLer: { aparelho: string; seg: number; arquivo: ArquivoDoUsuario }[] = []
  for (const [ap, segs] of listagem.segmentos) {
    for (const [seg, arquivo] of [...segs].sort((a, b) => a[0] - b[0])) {
      if (jaLido(lidos[ap], seg)) continue
      if (ap === eu.id && planosAntes.has(seg)) continue // nosso, montado aqui; o envio abaixo confirma
      const p = problemas[ap]?.[String(seg)]
      if (p && p.rev === arquivo.rev && agora() - p.em < NOVA_TENTATIVA_DE_SEGMENTO_MS) {
        // Já tentado, sem mudança: continua reportado e fora da cobertura; tenta de novo quando o rev mudar ou passar uma hora.
        resumo.malformados.push({ caminho: arquivo.caminho, motivo: p.motivo, parcial: p.parcial })
        continue
      }
      aLer.push({ aparelho: ap, seg, arquivo })
    }
  }
  for (let i = 0; i < aLer.length; i += SEGMENTOS_POR_LOTE) {
    const lote: SegmentoLido[] = []
    for (const { aparelho, seg, arquivo } of aLer.slice(i, i + SEGMENTOS_POR_LOTE)) {
      if (arquivo.tamanho > TAMANHO_MAXIMO_DO_SEGMENTO) {
        lote.push({ aparelho, seg, rev: arquivo.rev, eventos: [], maiorSeq: 0, problema: 'grande demais para um segmento' })
        continue
      }
      let bytes: ArrayBuffer
      try {
        bytes = await escrita.baixar(arquivo.caminho)
      } catch (erro) {
        if (erro instanceof ErroDeArquivoAusente) continue // sumiu entre a listagem e o download: fica para depois
        throw erro
      }
      lote.push(lerSegmento(aparelho, seg, arquivo.rev, bytes))
    }
    await receberSegmentos(lote, eu.id, resumo)
    const lidosOk: { aparelho: string; seg: number; maiorSeq: number }[] = []
    const mudancas: { aparelho: string; seg: number; problema: Problema | null }[] = []
    for (const s of lote) {
      const anterior = problemas[s.aparelho]?.[String(s.seg)]
      if (s.problema) {
        const parcial = s.eventos.length > 0
        resumo.malformados.push({ caminho: caminhoDoSegmento(s.aparelho, s.seg), motivo: s.problema, parcial })
        mudancas.push({ aparelho: s.aparelho, seg: s.seg, problema: { rev: s.rev, motivo: s.problema, em: agora(), parcial } })
      } else {
        lidosOk.push({ aparelho: s.aparelho, seg: s.seg, maiorSeq: s.maiorSeq })
        if (anterior) mudancas.push({ aparelho: s.aparelho, seg: s.seg, problema: null })
      }
      if (!(anterior && anterior.rev === s.rev)) contar(s.aparelho, s.eventos.length)
    }
    // Só o que foi lido por inteiro conta como lido (e, daí, entra na cobertura que o estado.json publica).
    await registrarLidos(lidosOk)
    if (mudancas.length) await registrarProblemas(mudancas)
  }

  // O mesmo campo nos dois aparelhos: escritas de outro aparelho que chegaram agora a um campo por enviar.
  if (pendentes.size) {
    const estado = estadoAtual()
    for (const p of pendentes.values()) {
      const entradas = entradasDoCampo(estado, p.tipo, p.reg, p.campo)
      const novasDeOutros = entradas.filter((x) => !x.evento.startsWith(`${eu.id}-`) && !p.outros.has(x.evento))
      if (novasDeOutros.length === 0) continue
      const outro = novasDeOutros[novasDeOutros.length - 1]!
      // O outro aparelho escreveu o mesmo valor: nada se perdeu, não há o que avisar.
      if (jsonCanonico(outro.valor) === p.valor) continue
      const atual = entradas[entradas.length - 1]!
      const ap = outro.evento.slice(0, 8)
      resumo.mesmoCampo.push({
        tipo: p.tipo,
        reg: p.reg,
        campo: p.campo,
        aparelho: ap,
        nome: nomes[ap] ?? null,
        venceu: atual.evento.startsWith(`${eu.id}-`) ? 'este' : 'outro',
        hlcDeste: p.hlc,
        hlcDoOutro: outro.hlc,
      })
    }
  }

  // 5. O envio. Os números nunca ficam abaixo do maior segmento deste aparelho que o Dropbox já tem.
  const proprios = listagem.segmentos.get(eu.id)
  const maiorProprio = proprios ? Math.max(...proprios.keys()) : 0
  let erroDePermissao: unknown = null
  const enviadosAgora: number[] = []
  const enviarOsLocais = async () => {
    for (let conflitos = 0; ; ) {
      const planos = await planejar(MAXIMO_DE_EVENTOS_POR_SEGMENTO, maiorProprio)
      let houveConflito = false
      for (const plano of planos) {
        const r = await enviarPlano(escrita, plano, eu.id, resumo, agora).catch((erro: unknown) => {
          if (erro instanceof ErroDePermissao) return erro
          throw erro
        })
        if (r instanceof ErroDePermissao) {
          erroDePermissao = r // sem permissão de escrita, o que já chegou continua valendo; o erro sobe no fim
          break
        }
        if (r === 'conflito') {
          houveConflito = true
          break
        }
        if (r === 'enviado') enviadosAgora.push(plano.seg)
      }
      if (!houveConflito || erroDePermissao) break
      if (++conflitos >= CONFLITOS_PROPRIOS_POR_RODADA) throw new ErroDeConflito(caminhoDoSegmento(eu.id, (await lerConfig<number>(CHAVE_SEGMENTO)) ?? 0))
    }
  }
  await enviarOsLocais()

  // 6. O nome deste aparelho, se mudou (e só depois de ele ter algo no Dropbox).
  if (!erroDePermissao) await publicarNome(escrita, listagem, eu, agora)

  // 7. A consolidação (nunca por cima de um estado.json que esta versão não lê).
  let consolidado: Consolidacao = NADA_CONSOLIDADO
  if (!erroDePermissao && !estadoIlegivel) {
    const conhecido = (await lerConfig<Cobertura>('sync:estadoCobertura')) ?? { ate: {}, segmentos: {} }
    // Quanto a cobertura PODE avançar: os segmentos lidos por inteiro, em sequência, além do que o estado.json
    // já cobre (a marca). Uma lacuna ou um segmento com problema a segura; o que está além dela não conta.
    const lidosAgora = await lerLidos()
    let avanco = 0
    for (const [ap, l] of Object.entries(lidosAgora)) avanco += Math.max(0, l.marca - (conhecido.segmentos[ap] ?? 0))
    // Segmentos além do que o estado.json cobre, lidos ou não: só contam para a consolidação diária.
    let alem = 0
    for (const [ap, segs] of listagem.segmentos) for (const seg of segs.keys()) if (seg > (conhecido.segmentos[ap] ?? 0)) alem++
    alem += enviadosAgora.filter((s) => !proprios?.has(s)).length
    const ultima = await lerConfig<number>('sync:consolidadoEm')
    const diaria = ultima === undefined || agora() - ultima >= INTERVALO_DE_CONSOLIDACAO_MS
    // Objeto SKC com número (ou SKC, Nr.; decisão 38) provisório: só a consolidação o confirma (e só com os números do
    // pacote à mão).
    const pacote = await numerosDoPacote()
    const atual = pacote !== null ? numerar(estadoAtual(), pacote, await lerConfirmados()) : null
    const pedidos = atual !== null && (atual.provisorios.length > 0 || atual.nrSkcProvisorios.length > 0)
    const devida = avanco > SEGMENTOS_PARA_CONSOLIDAR || (alem > 0 && diaria) || pedidos
    if (devida) consolidado = await consolidarNoDropbox(escrita, listagem.estado?.rev ?? null, conhecido, eu.id, agora, resumo)
  }

  // 8. As testemunhas dos números confirmados: as dos objetos deste aparelho e as dos que esta consolidação confirmou.
  // Elas sobem NESTA rodada (um segmento a mais): a confirmação fica no diário imutável segundos depois de entrar no
  // estado.json, e não só na próxima rodada deste aparelho.
  if ((await escreverTestemunhas(eu.id, consolidado)) > 0 && !erroDePermissao) await enviarOsLocais()

  resumo.porAparelho = [...porAparelho].map(([aparelho, eventos]) => ({ aparelho, nome: nomes[aparelho] ?? null, eventos }))

  // As lacunas que ficaram (segmentos ainda não vistos entre os já lidos). Os com problema já estão reportados.
  const comProblema: Problemas = await lerProblemas()
  for (const [ap, l] of Object.entries(await lerLidos())) {
    const alem = Object.keys(l.alem).map(Number)
    if (alem.length === 0) continue
    const maior = Math.max(...alem)
    for (let s = l.marca + 1; s < maior; s++) {
      if (l.alem[String(s)] === undefined && !comProblema[ap]?.[String(s)]) resumo.faltando.push({ aparelho: ap, segmento: s })
    }
  }

  if (erroDePermissao) throw erroDePermissao
  return resumo
}

// ------------------------------------------------------------------ partes

const versaoMaior = (v: unknown) => typeof v === 'number' && v > 1

/** Por que este JSON não é um estado.json que esta versão leia (e que, por isso, nunca é regravado). */
function motivoDoEstadoIlegivel(x: unknown): string {
  const nota = ' (o arquivo não foi alterado)'
  if (objeto(x) && (versaoMaior(x.v) || (objeto(x.base) && versaoMaior(x.base.v)))) return `versão mais nova do app em outro aparelho${nota}`
  return `não tem a forma de um estado.json${nota}`
}

/**
 * Baixa e confere o estado.json. Devolve o arquivo validado, o motivo de ele não servir (versão mais nova,
 * malformado, grande demais) ou null se ele sumiu entre a listagem e o download.
 */
async function lerEstadoDoDropbox(
  escrita: Escrita,
  caminho: string,
  tamanho?: number,
): Promise<{ arquivo: ArquivoDeEstado; hash: string; incompleto: { motivo: string; soIlegiveis: boolean } | null } | { ilegivel: string } | null> {
  if (tamanho !== undefined && tamanho > TAMANHO_MAXIMO_DO_ESTADO) {
    return { ilegivel: `grande demais para um estado.json (${Math.round(tamanho / 1e6)} MB; o limite é ${TAMANHO_MAXIMO_DO_ESTADO / (1024 * 1024)} MB) (o arquivo não foi alterado)` }
  }
  let bytes: ArrayBuffer
  try {
    bytes = await escrita.baixar(caminho)
  } catch (erro) {
    if (erro instanceof ErroDeArquivoAusente) return null
    throw erro
  }
  let x: unknown
  try {
    x = JSON.parse(decodificador().decode(bytes))
  } catch {
    return { ilegivel: 'não é JSON legível (o arquivo não foi alterado)' }
  }
  const arquivo = validarArquivoDeEstado(x)
  return arquivo ? { arquivo, hash: await hashDeConteudo(bytes), incompleto: motivoDoEstadoIncompleto(x) } : { ilegivel: motivoDoEstadoIlegivel(x) }
}

/** Os ids de evento que uma base cita (nas escritas dos campos e nas marcas de exclusão). */
function idsDaBase(base: EstadoConsolidado): Set<string> {
  const ids = new Set<string>()
  for (const r of base.registros) {
    for (const lista of Object.values(r.campos)) for (const e of lista) ids.add(e.evento)
    if (r.exclusao) ids.add(r.exclusao.evento)
  }
  return ids
}

/** Apaga as linhas próprias já enviadas que a cobertura inclui E que a base guardada aqui realmente cita. */
async function podar(eu: string, cobertura: Cobertura): Promise<number> {
  const base = await lerBase()
  return podarProprios(eu, cobertura, base ? idsDaBase(base) : new Set())
}

/**
 * O Dropbox mostra conteúdo com o id DESTE aparelho que ele nunca produziu: o id passa a ser outro, os
 * eventos por enviar são recarimbados (nenhum se perde) e a rodada recomeça.
 */
async function trocarDeIdERecomecar(): Promise<never> {
  const t = await trocarDeAparelho()
  await carregarEstado() // os ids dos eventos por enviar mudaram: refunde da memória
  throw new TrocaDeAparelho(t.de, t.para)
}

/**
 * Recebe a base de um estado.json (validado): funde, sobe as marcas de leitura e poda o que ela cobre.
 * `contar` recebe, por aparelho, os eventos que a base trouxe e que este aparelho ainda não tinha. `parcial` (o arquivo
 * lido só em parte, A-7): só funde a base; as marcas de leitura, a cobertura e a poda ficam como estavam.
 */
async function receberArquivoDeEstado(
  arquivo: ArquivoDeEstado,
  eu: string,
  resumo: ResumoSync,
  contar?: (ap: string, n: number) => void,
  { parcial = false }: { parcial?: boolean } = {},
): Promise<void> {
  const citadosPelaBase = idsDaBase(arquivo.base)
  // Eventos deste aparelho que a base cita e ele nunca produziu (nem tem, nem tinha): perfil clonado.
  const meus = [...citadosPelaBase].filter((id) => id.startsWith(`${eu}-`))
  if (meus.length) {
    const [locais, baseLocal] = await Promise.all([linhasDosIds(meus), lerBase()])
    const tenho = new Set(locais.map((l) => l.id))
    const citados = baseLocal ? idsDaBase(baseLocal) : new Set<string>()
    if (meus.some((id) => !tenho.has(id) && !citados.has(id))) await trocarDeIdERecomecar()
  }
  const conhecidos = idsDaBase(consolidar(estadoAtual()))
  const novos = new Map<string, number>()
  for (const id of citadosPelaBase) {
    if (conhecidos.has(id)) continue
    const ap = id.slice(0, 8)
    novos.set(ap, (novos.get(ap) ?? 0) + 1)
  }
  const r = await receberEventos([], arquivo.base)
  resumo.ignorados += r.ignorados
  if (arquivo.numeros) {
    const antes = await lerConfirmados()
    const depois = await unirConfirmadosGuardados(arquivo.numeros)
    for (const chave of Object.keys(depois)) if (antes[chave] === undefined) anotarConfirmado(resumo, chave)
  }
  for (const [ap, n] of novos) {
    if (ap !== eu) resumo.recebidos += n
    contar?.(ap, n)
  }
  // Lido em parte (A-7; revisão 1 da Tarefa 17a): só a base entra. A cobertura do arquivo inclui segmentos com registros
  // que esta versão não lê; adotá-la marcaria esses segmentos como lidos (nunca baixados aqui) e um estado.json gravado
  // depois por esta versão diria cobri-los sem esses registros: um aparelho novo nunca mais os leria. Sem ela, esta versão
  // lê os segmentos ela mesma, e as linhas que não entende os seguram fora da cobertura (`sync:problemas`).
  if (parcial) return
  await elevarLidos(arquivo)
  const anterior = (await lerConfig<Cobertura>('sync:estadoCobertura')) ?? { ate: {}, segmentos: {} }
  const cobertura: Cobertura = { ate: { ...anterior.ate }, segmentos: { ...anterior.segmentos } }
  for (const [ap, n] of Object.entries(arquivo.ate)) cobertura.ate[ap] = Math.max(cobertura.ate[ap] ?? 0, n)
  for (const [ap, n] of Object.entries(arquivo.segmentos)) cobertura.segmentos[ap] = Math.max(cobertura.segmentos[ap] ?? 0, n)
  await gravarConfig('sync:estadoCobertura', cobertura)
  resumo.podados += await podar(eu, cobertura)
}

/**
 * Funde um lote de segmentos baixados. Antes, olha os eventos que levam o id DESTE aparelho (só pode haver
 * se o Dropbox tem um segmento dele que este IndexedDB não conhece):
 * - igual a um evento local ainda não enviado: a cópia já está no Dropbox, o local fica enviado (sem
 *   "N por enviar" fantasma);
 * - mesmo id e outro conteúdo, o local ainda não enviado (planejado ou não): o local ganha um id novo e o
 *   plano dele é desfeito; a cópia de fora nunca toma o lugar do conteúdo local que não subiu;
 * - nenhum evento local com esse id e a base daqui não o cita (conteúdo que este aparelho nunca produziu), ou
 *   o local com esse id já foi enviado com outro conteúdo: perfil clonado. O aparelho troca de id e a
 *   rodada recomeça (TrocaDeAparelho).
 */
async function receberSegmentos(lote: readonly SegmentoLido[], eu: string, resumo: ResumoSync): Promise<void> {
  const eventos = lote.flatMap((s) => s.eventos)
  if (eventos.length === 0) return
  const meus = eventos.filter((e) => e.aparelho === eu)
  let renumerados = 0
  if (meus.length) {
    const [locaisLista, baseLocal] = await Promise.all([linhasDosIds(meus.map((e) => e.id)), lerBase()])
    const locais = new Map(locaisLista.map((l) => [l.id, l]))
    const citados = baseLocal ? idsDaBase(baseLocal) : new Set<string>()
    const colidem: Evento[] = []
    const iguais: { id: string; seg: number }[] = []
    let clonado = false
    for (const s of lote) {
      for (const e of s.eventos) {
        if (e.aparelho !== eu) continue
        const l = locais.get(e.id)
        if (!l) {
          if (!citados.has(e.id)) clonado = true
        } else if (compararCopias(e, l.evento) === 0) {
          if (l.enviado === 0) iguais.push({ id: e.id, seg: s.seg })
        } else if (l.enviado === 0) colidem.push(e)
        else clonado = true
      }
    }
    if (clonado) await trocarDeIdERecomecar()
    if (iguais.length) await marcarComoEnviadosPorCopia(iguais)
    if (colidem.length) {
      let seq = 0
      let hlc: string | null = null
      for (const e of meus) {
        seq = Math.max(seq, seqDe(e))
        hlc = maiorHlc(hlc, e.hlc)
      }
      renumerados = await renumerarLocais(
        colidem.map((e) => e.id),
        { seq, hlc },
      )
      resumo.renumerados += renumerados
    }
  }
  const r = await receberEventos(eventos)
  resumo.recebidos += r.novos
  resumo.ignorados += r.ignorados
  // Uma renumeração tira ids da memória: refunde do IndexedDB.
  if (renumerados) await carregarEstado()
}

/** Envia um plano: 'enviado', 'vazio' (os eventos sumiram) ou 'conflito' (o número já tem outro conteúdo). */
async function enviarPlano(escrita: Escrita, plano: Plano, eu: string, resumo: ResumoSync, agora: () => number): Promise<'enviado' | 'vazio' | 'conflito'> {
  const linhas = await linhasDosIds(plano.ids)
  if (linhas.length === 0) {
    await descartarPlano(plano.seg)
    return 'vazio'
  }
  const caminho = caminhoDoSegmento(eu, plano.seg)
  try {
    await escrita.enviar(caminho, bytesDoSegmento(linhas.map((l) => l.evento)))
  } catch (erro) {
    if (!(erro instanceof ErroDeConflito)) throw erro
    // O número já está ocupado no Dropbox com outro conteúdo. Nunca se sobrescreve: o que está lá entra
    // aqui (como de qualquer segmento), o número conta como lido e os eventos do plano vão para outro número.
    const bytes = await escrita.baixar(caminho)
    const lido = lerSegmento(eu, plano.seg, '', bytes)
    await descartarPlano(plano.seg)
    await receberSegmentos([lido], eu, resumo)
    if (lido.problema) {
      const parcial = lido.eventos.length > 0
      resumo.malformados.push({ caminho, motivo: lido.problema, parcial })
      await registrarProblemas([{ aparelho: eu, seg: plano.seg, problema: { rev: '', motivo: lido.problema, em: agora(), parcial } }])
    } else await registrarLidos([{ aparelho: eu, seg: plano.seg, maiorSeq: lido.maiorSeq }])
    return 'conflito'
  }
  await marcarSegmentoEnviado(plano, eu, Math.max(...linhas.map((l) => l.seq)))
  resumo.enviados += linhas.length
  resumo.segmentosEnviados.push(caminho)
  return 'enviado'
}

/** Os nomes dos outros aparelhos ({aparelho: nome}), baixando só os arquivos que mudaram. */
async function atualizarNomes(escrita: Escrita, listagem: Listagem, eu: string): Promise<Record<string, string>> {
  const cache = { ...((await lerConfig<Record<string, { nome: string; rev: string }>>('sync:nomes')) ?? {}) }
  let mudou = false
  for (const [ap, arquivo] of listagem.nomes) {
    if (ap === eu || cache[ap]?.rev === arquivo.rev || arquivo.tamanho > TAMANHO_MAXIMO_DO_NOME) continue
    try {
      const x = JSON.parse(decodificador().decode(await escrita.baixar(arquivo.caminho))) as unknown
      const nome = objeto(x) && x.id === ap && typeof x.nome === 'string' ? limparNome(x.nome) : ''
      if (nome) {
        cache[ap] = { nome, rev: arquivo.rev }
        mudou = true
      }
    } catch (erro) {
      if (erro instanceof SyntaxError || erro instanceof TypeError || erro instanceof ErroDeArquivoAusente) continue
      throw erro
    }
  }
  if (mudou) await gravarConfig('sync:nomes', cache)
  return Object.fromEntries(Object.entries(cache).map(([ap, v]) => [ap, v.nome]))
}

/** O nome que veio do Dropbox: sem caracteres de controle nem de direção do texto (bidi), até 40. */
export function limparNome(nome: string): string {
  return nome.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, 40).trim()
}

async function publicarNome(escrita: Escrita, listagem: Listagem, eu: { id: string; nome: string }, agora: () => number): Promise<void> {
  const lidos = await lerLidos()
  if (!lidos[eu.id] || (lidos[eu.id]!.marca === 0 && Object.keys(lidos[eu.id]!.alem).length === 0)) return
  const publicado = await lerConfig<string>('sync:nomePublicado')
  const noDropbox = listagem.nomes.get(eu.id)
  if (publicado === eu.nome && noDropbox) return
  const conteudo = JSON.stringify({ id: eu.id, nome: eu.nome, atualizadoEm: new Date(agora()).toISOString() })
  try {
    await escrita.enviar(caminhoDoNome(eu.id), new TextEncoder().encode(conteudo), { sobrescrever: { rev: noDropbox?.rev ?? null } })
    await gravarConfig('sync:nomePublicado', eu.nome)
  } catch (erro) {
    if (!(erro instanceof ErroDeConflito)) throw erro // mudou no meio (outra aba): fica para a próxima
  }
}

/**
 * O que uma consolidação gravada confirmou: as chaves novas do mapa (`OB-…`, `SKC:OB-…`, `LIVRO:OB-…`) e as testemunhas novas dos objetos
 * cujo número um livro tomou (decisão 48, `testemunhasDoLivro`), calculadas sobre a numeração que ela gravou.
 */
interface Consolidacao {
  confirmados: string[]
  doLivro: ReturnType<typeof testemunhasDoLivro>
}
const NADA_CONSOLIDADO: Consolidacao = { confirmados: [], doLivro: [] }

/**
 * Grava usuario/estado.json com o estado fundido deste aparelho, só se o arquivo ainda está no rev lido
 * (null = só se ainda não existe). Se outro aparelho gravou antes, relê o dele e não grava.
 */
async function consolidarNoDropbox(
  escrita: Escrita,
  revLido: string | null,
  conhecido: Cobertura,
  eu: string,
  agora: () => number,
  resumo: ResumoSync,
): Promise<Consolidacao> {
  const [eventos, baseLocal, lidos, confirmados, pacote] = await Promise.all([todosEventos(), lerBase(), lerLidos(), lerConfirmados(), numerosDoPacote()])
  const fundido = fundir(eventos, baseLocal ?? undefined)
  const base = consolidar(fundido)
  // Os números: os já confirmados (que este aparelho tem, inclusive os do estado.json que ele acabou de ler) e, com os
  // números do pacote à mão, os provisórios desta base. Sem eles, nada novo é confirmado (poderia colidir com um livro).
  const numeracao = pacote ? numerar(fundido, pacote, confirmados) : null
  const numeros = numeracao ? unirConfirmados(confirmados, confirmacoes(numeracao)) : unirConfirmados(confirmados, {})
  // Decisão 48: o número que um livro tomou ganha a testemunha nova, que só esta escrita condicional autoriza.
  const doLivro = numeracao ? testemunhasDoLivro(numeracao) : []
  const cobertura: Cobertura = { ate: {}, segmentos: {} }
  for (const ap of [...new Set([...Object.keys(lidos), ...Object.keys(conhecido.segmentos)])].sort()) {
    const seg = Math.max(lidos[ap]?.marca ?? 0, conhecido.segmentos[ap] ?? 0)
    if (seg <= 0) continue
    cobertura.segmentos[ap] = seg
    cobertura.ate[ap] = Math.max(lidos[ap]?.ate ?? 0, conhecido.ate[ap] ?? 0)
  }
  const arquivo: ArquivoDeEstado = { v: 1, base, ate: cobertura.ate, segmentos: cobertura.segmentos }
  if (Object.keys(numeros).length) arquivo.numeros = numeros
  const bytes = new TextEncoder().encode(JSON.stringify(arquivo))
  if (bytes.byteLength > TAMANHO_MAXIMO_PARA_GRAVAR_O_ESTADO) {
    // Gravar uma base que os outros aparelhos recusam (acima de 64 MB) travaria todos. Fica só nos diários.
    await gravarConfig('sync:consolidadoEm', agora())
    resumo.malformados.push({
      caminho: CAMINHO_DO_ESTADO,
      motivo: `a base consolidada passou de ${TAMANHO_MAXIMO_PARA_GRAVAR_O_ESTADO / (1024 * 1024)} MB e não foi gravada (nada se perde: os diários continuam sendo a fonte)`,
    })
    return NADA_CONSOLIDADO
  }
  // Nunca regrava um estado.json igual ao que já está lá (a base e a cobertura idênticas às conhecidas), salvo para
  // autorizar uma testemunha do livro (decisão 48): ela só vale junto com uma escrita condicional.
  const hash = await hashDeConteudo(bytes)
  if (doLivro.length === 0 && revLido !== null && revLido === (await lerConfig<string | null>('sync:estadoRev')) && hash === (await lerConfig<string>('sync:estadoHash'))) {
    await gravarConfig('sync:consolidadoEm', agora())
    return NADA_CONSOLIDADO
  }
  try {
    const { rev } = await escrita.enviar(CAMINHO_DO_ESTADO, bytes, { sobrescrever: { rev: revLido } })
    await unirBase(base)
    const novos = Object.keys(numeros).filter((chave) => confirmados[chave] === undefined)
    for (const chave of novos) anotarConfirmado(resumo, chave)
    await unirConfirmadosGuardados(numeros)
    await gravarConfig('sync:estadoRev', rev)
    await gravarConfig('sync:estadoHash', hash)
    await gravarConfig('sync:estadoCobertura', cobertura)
    await gravarConfig('sync:consolidadoEm', agora())
    resumo.consolidacao = 'gravada'
    resumo.podados += await podar(eu, cobertura)
    return { confirmados: novos, doLivro }
  } catch (erro) {
    if (!(erro instanceof ErroDeConflito)) throw erro
    resumo.consolidacao = 'outro-aparelho'
    // Relê o que o outro aparelho gravou. Se esta versão não o lê, nada é regravado: só é reportado.
    // O tamanho vem da listagem: o mesmo limite de 64 MB do caminho normal vale antes de baixar.
    const listado = (await escrita.listar('usuario', { recursivo: false })).find((a) => a.caminho === CAMINHO_DO_ESTADO)
    if (!listado) return NADA_CONSOLIDADO
    const lido = await lerEstadoDoDropbox(escrita, CAMINHO_DO_ESTADO, listado.tamanho)
    if (!lido) return NADA_CONSOLIDADO
    if ('ilegivel' in lido) {
      resumo.estadoIlegivel = lido.ilegivel
      resumo.malformados.push({ caminho: CAMINHO_DO_ESTADO, motivo: lido.ilegivel })
      return NADA_CONSOLIDADO
    }
    const dele = lido.arquivo
    await receberArquivoDeEstado(dele, eu, resumo, undefined, { parcial: lido.incompleto !== null })
    resumo.estadoBaixado = true
    if (lido.incompleto) {
      // A próxima rodada (que relê este arquivo, de rev ainda desconhecido aqui) guarda o motivo com o rev.
      resumo.estadoIlegivel = lido.incompleto.motivo
      resumo.estadoLidoEmParte = true
      resumo.estadoSoIlegiveis = lido.incompleto.soIlegiveis
      resumo.malformados.push({ caminho: CAMINHO_DO_ESTADO, motivo: lido.incompleto.motivo })
    }
    // O rev do que foi lido não é conhecido aqui: a próxima listagem o traz (e ele é baixado de novo, uma vez).
    await gravarConfig('sync:estadoRev', null)
    await gravarConfig('sync:estadoHash', lido.hash)
    await gravarConfig('sync:consolidadoEm', agora())
    return NADA_CONSOLIDADO
  }
}

/** O id do objeto de uma chave do mapa de confirmados (`OB-…`, `SKC:OB-…` ou `LIVRO:OB-…`), uma vez só em `numerosConfirmados`. */
function anotarConfirmado(resumo: ResumoSync, chave: string): void {
  const id = idDaChaveDoMapa(chave)
  if (!resumo.numerosConfirmados?.includes(id)) resumo.numerosConfirmados?.push(id)
}

/**
 * Escreve no diário a testemunha (`alterar {numero, nrSkc}`) de cada número confirmado que ainda não a tem: os dos objetos
 * criados neste aparelho e os que esta rodada confirmou. Assim a confirmação fica também nos segmentos imutáveis e
 * sobrevive a um estado.json apagado. Devolve quantas escreveu.
 *
 * Dois aparelhos podem testemunhar o mesmo objeto (o que o criou e o que consolidou). Dentro de uma cadeia de estado.json
 * o valor é o mesmo; depois de uma falha dupla (estado.json apagado logo depois de uma confirmação) os dois valores
 * podem diferir: então vale a escrita de maior hlc (a fusão por campo) e `numerar` resolve o número repetido que
 * sobrar (`conflito: 'skc'`). Uma testemunha de valor igual não gera aviso de "mesmo campo" (veja `pendentes`).
 */
async function escreverTestemunhas(eu: string, consolidado: Consolidacao): Promise<number> {
  const confirmados = await lerConfirmados()
  // As chaves do mapa (`OB-…`, `SKC:OB-…` e `LIVRO:OB-…`) → ids.
  const agora = new Set(consolidado.confirmados.map(idDaChaveDoMapa))
  const faltam = testemunhasFaltando(estadoAtual(), confirmados).filter((t) => t.id.startsWith(`OB-${eu}-`) || agora.has(t.id))
  // Decisão 48: a testemunha nova de um número que um livro tomou (a do objeto ainda sem ela; um `alterar` só por objeto).
  const doLivro = consolidado.doLivro.filter((t) => estadoAtual().registro('objeto', t.id)?.campos.numero !== t.campos.numero)
  const porId = new Map<string, Record<string, string>>()
  for (const t of faltam) porId.set(t.id, { ...t.campos })
  for (const t of doLivro) porId.set(t.id, { ...porId.get(t.id), ...t.campos })
  if (porId.size === 0) return 0
  await registrarVarios([...porId].map(([reg, campos]) => ({ tipo: 'objeto' as const, reg, op: 'alterar' as const, campos })))
  return porId.size
}
