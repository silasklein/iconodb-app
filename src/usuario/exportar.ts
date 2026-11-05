/**
 * As exportações da camada do usuário (Tarefa 15; spec §7.7). Puro: monta os três arquivos a partir do que já foi lido
 * (o instantâneo do IndexedDB, src/usuario/instantaneo.ts; o estado fundido; o que o pacote sabe das regiões). Nada aqui
 * toca a rede, o IndexedDB, o banco ou o DOM. Os formatos estão no README (seção "Exportar"), para a Tarefa 16 e uma
 * restauração futura.
 *
 * 1. CÓPIA DE SEGURANÇA, `iconodb-copia` v1 (`iconodb-copia-AAAA-MM-DD-HHMM.json`):
 *    - `formato` "iconodb-copia", `versao` 1, `geradoEm` (ISO 8601, UTC);
 *    - `aparelho` {id, nome}: o aparelho que gerou; `aparelhos` {id: nome}: os nomes conhecidos (este e os outros);
 *    - `eventos`: TODOS os eventos que este aparelho guarda (enviados e ainda não enviados, de todos os aparelhos), cada um
 *      só com as 8 chaves do contrato (src/usuario/eventos.ts), em ordem de (aparelho, seq, n);
 *    - `naoEnviados`: os ids dos eventos deste aparelho que ainda não subiram ao Dropbox;
 *    - `base`: a base consolidada guardada (a do estado.json; null se não há). Ela cobre os eventos deste aparelho já podados
 *      do diário local depois de uma consolidação: sem ela, os eventos sozinhos não refazem o estado;
 *    - `estado`: o estado fundido, sem perda (todas as escritas de cada campo, a última é a atual; o formato do estado.json,
 *      `consolidar`, documentado em src/usuario/fusao.ts, como `base`). REGRA: `fundir(eventos, base)` reproduz exatamente
 *      `estado` (em qualquer ordem, com repetições);
 *    - `marcas` {aparelho: {seq, segmento}}: até onde vai o que este aparelho conhece de cada aparelho (o maior seq de
 *      evento e o último segmento do diário lido em sequência);
 *    - `numerosConfirmados`: os números de objeto SKC confirmados (o mapa `numeros` do estado.json);
 *    - `imagens`: as imagens do usuário (NÃO vão dentro do arquivo: ficam na pasta `usuario/imagens/` do Dropbox), cada uma
 *      com {id, alvo, excluida, enviada, arquivos: os caminhos no Dropbox}. `enviada` false: a imagem ainda está na fila de
 *      envio deste aparelho (OPFS) e algum arquivo dela ainda não está no Dropbox;
 *    - `observacoes`: textos para quem abrir o arquivo.
 *    Nenhum dado de login (token, código, verificador) entra: só as chaves acima.
 *
 * 2. REGIÕES, W3C Web Annotation em JSON-LD (`iconodb-regioes-….jsonld`): uma `AnnotationCollection` (a página `first`
 *    com `partOf` = o id da coleção) com uma `Annotation` (motivation "tagging") por região viva, as do usuário (registros
 *    `regiao`) e as desenhadas no pacote (`element_region`):
 *    - id: `urn:iconodb:regiao:<RG-…>` (do usuário) ou `urn:iconodb:regiao-do-livro:<EL-…>:<IMG-…>` (do livro: o par
 *      elemento + imagem, único e estável entre versões do núcleo; o `element_region.id` não é). Os `urn:iconodb:` são um
 *      espaço de nomes informal, não registrado;
 *    - QUEM AFIRMA O QUÊ (decisão 46), por `creator`:
 *      - a região do LIVRO: a anotação é dos autores do livro (Person, um por autor; sem autores, o agente Organization
 *        `urn:iconodb:autores:<SIGLA>` "Autores de <obra>"); o corpo leva só o rótulo do livro e os verbetes das
 *        hipóteses do livro sobre o elemento, sem `creator` próprio (herdam o da anotação). Nunca um termo SKC;
 *      - a região do USUÁRIO: a anotação (o polígono) é do usuário (`urn:iconodb:usuario`, Person "SKC"), e TODO corpo
 *        diz de quem é. Sobre um elemento do livro (`EL-…`): o rótulo do livro e os verbetes das hipóteses do livro, com
 *        os autores do livro como `creator` (o pacote não lido: o rótulo guardado na região, com o agente
 *        `urn:iconodb:autores-do-livro` "Autores do livro"); os verbetes das hipóteses SKC vivas sobre o elemento, com o
 *        usuário como `creator`. Sobre um elemento do usuário (`RG-…`): o rótulo e os verbetes das hipóteses SKC, do
 *        usuário;
 *    - corpos: `TextualBody` (o rótulo; em português, e o do livro também na língua da obra, `publication.language`;
 *      língua desconhecida: sem `language`) e `SpecificResource` `urn:iconodb:verbete:<GL-…>`, purpose "identifying"; um
 *      verbete do usuário que o pacote publicou (Tarefa 16) sai com o id do livro (o redirecionamento);
 *    - target: `SpecificResource` com source `urn:iconodb:imagem:<id da imagem>` (o id do pacote, `IMG-…`, ou o do usuário,
 *      `IM-…`; percent-encoded se preciso) e um `SvgSelector` com um só `<polygon>`;
 *    - COORDENADAS, sempre em pixels da imagem quando o tamanho é conhecido: `viewBox="0 0 <largura> <altura>"` e os pontos
 *      relativos guardados × o tamanho (2 casas). O tamanho: de uma imagem do pacote, `image.width_px`/`height_px` (o
 *      `original-<n>.png`, o quadro da figura ANTES do giro do livro; a tela é o mesmo quadro reduzido); de uma imagem do
 *      usuário, `originalLargura`/`originalAltura` do registro (o original JÁ ORIENTADO: quem abrir `original.<ext>` aplica
 *      o EXIF antes), senão `largura`/`altura` (a versão de tela, o mesmo quadro reduzido). SÓ quando nenhum tamanho é
 *      conhecido (a imagem de outro aparelho que ainda não chegou; o pacote não lido): `viewBox="0 0 1 1"` e os pontos
 *      relativos, como guardados (4 casas). Pontos fora de 0 a 1 são trazidos para a borda.
 *    Regiões excluídas, ou sem polígono (menos de 3 pontos), ficam de fora.
 *
 * 3. HIPÓTESES PARA O MEDIATION, `iconodb-mediation` v1 (`iconodb-hipoteses-mediation-….json`): MAPEAMENTO PROVISÓRIO pelos
 *    campos da tabela de hipóteses da spec §4.2; a Fase 5 (spec §11) o fecha contra o esquema real do MEDIATION. Só as
 *    hipóteses PRÓPRIAS (SKC) vivas, com `fonte: "own_unpublished"` e `publicado: false`. As posições sobre hipóteses dos
 *    livros não são exportadas. Os códigos seguem os do pacote: `alvo.tipo` "item" (o objeto; `id` é o número do objeto,
 *    CA… ou OB-…, porque o app anota objetos) ou "element" (como `hypothesis.target_type`); `nivel`, `modalidade` e
 *    `verificacao` também. `localizador` é legível como o `hypothesis.locator` do pacote: a obra e o número de cada item do
 *    objeto ("TESTE I, Nr. 3"; vários itens separados por "; "), "SKC OB-…" para um objeto SKC, ou o número do objeto se o
 *    pacote não pôde ser lido; o trecho marcado (o id `PA-…`/`OB-…`) fica em `trecho.fonte`. Um termo do usuário que o
 *    pacote publicou (Tarefa 16) sai com o id do livro, `termoDoUsuario: false` e `publicadoDe` = o id do app.
 */
import { eHipoteseSkc, lerHipotese, lerRegiao, RE_ELEMENTO_DO_LIVRO } from '../hipoteses/modelo'
import { arquivosDaImagem, lerImagem } from '../imagens-usuario/registro'
import { eVerbeteSkc, lerVerbeteSkc } from '../glossario/modelo'
import { destinoDe, SEM_REDIRECIONAMENTOS, type Redirecionamentos } from '../pacote/redirecionamentos'
import type { Lidos } from './diarioLocal'
import { compararPorPontoDeCodigo, type Evento } from './eventos'
import { consolidar, fundir, type Estado, type EstadoConsolidado } from './fusao'

export const FORMATO_DA_COPIA = 'iconodb-copia'
export const FORMATO_DO_MEDIATION = 'iconodb-mediation'
export const CONTEXTO_W3C = 'http://www.w3.org/ns/anno.jsonld'
/** O autor das hipóteses e regiões do usuário (a marca SKC do app). */
export const AUTOR_DO_USUARIO = 'SKC'

// ---------------------------------------------------------------------------------------------------------------- comum

const seqDe = (id: string) => Number(/-(\d+)-\d+$/.exec(id)?.[1] ?? 0)
const nDe = (id: string) => Number(/-(\d+)$/.exec(id)?.[1] ?? 0)
/** Os 13 primeiros dígitos de um hlc são ms desde 1970. */
const isoDoHlc = (hlc: string) => new Date(Number(hlc.slice(0, 13))).toISOString()
const doContrato = (e: Evento): Evento => ({ v: e.v, id: e.id, hlc: e.hlc, aparelho: e.aparelho, tipo: e.tipo, reg: e.reg, op: e.op, campos: e.campos })
const doisDigitos = (n: number) => String(n).padStart(2, '0')

export type TipoDeArquivo = 'copia' | 'regioes' | 'hipoteses'

/** `iconodb-copia-AAAA-MM-DD-HHMM.json` (e os outros dois), na hora LOCAL. */
export function nomeDoArquivo(tipo: TipoDeArquivo, agora: Date): string {
  const data = `${agora.getFullYear()}-${doisDigitos(agora.getMonth() + 1)}-${doisDigitos(agora.getDate())}-${doisDigitos(agora.getHours())}${doisDigitos(agora.getMinutes())}`
  if (tipo === 'copia') return `iconodb-copia-${data}.json`
  if (tipo === 'regioes') return `iconodb-regioes-${data}.jsonld`
  return `iconodb-hipoteses-mediation-${data}.json`
}

// ---------------------------------------------------------------------------------------------------------------- cópia

/** O que a cópia lê do IndexedDB, numa só transação (src/usuario/instantaneo.ts). */
export interface Instantaneo {
  aparelho: { id: string; nome: string }
  /** Os nomes dos outros aparelhos que a sincronização conhece. */
  nomes: Record<string, string>
  eventos: { evento: Evento; enviado: boolean }[]
  base: EstadoConsolidado | null
  lidos: Lidos
  /** O último seq de evento deste aparelho. */
  seqLocal: number
  confirmados: Record<string, string>
}

export interface ImagemNaCopia {
  id: string
  alvo: string
  excluida: boolean
  /** false: ainda na fila de envio deste aparelho (algum arquivo ainda não está no Dropbox). */
  enviada: boolean
  arquivos: string[]
}

export interface CopiaDeSeguranca {
  formato: typeof FORMATO_DA_COPIA
  versao: 1
  geradoEm: string
  aparelho: { id: string; nome: string }
  aparelhos: Record<string, string>
  eventos: Evento[]
  naoEnviados: string[]
  base: EstadoConsolidado | null
  estado: EstadoConsolidado
  marcas: Record<string, { seq: number; segmento: number }>
  numerosConfirmados: Record<string, string>
  imagens: ImagemNaCopia[]
  observacoes: string[]
}

const compararEventos = (a: Evento, b: Evento) => compararPorPontoDeCodigo(a.aparelho, b.aparelho) || seqDe(a.id) - seqDe(b.id) || nDe(a.id) - nDe(b.id)

const estadoDe = (i: Instantaneo): Estado => fundir(
  i.eventos.map((x) => x.evento),
  i.base ?? undefined,
)

function imagensDe(estado: Estado, naFila: ReadonlySet<string>): ImagemNaCopia[] {
  const saida: ImagemNaCopia[] = []
  for (const r of estado.registros.get('imagem')?.values() ?? []) {
    const img = lerImagem(r)
    if (!img) continue
    saida.push({ id: img.id, alvo: img.alvo, excluida: img.excluido, enviada: !naFila.has(img.id), arquivos: arquivosDaImagem(img).map((a) => a.caminho) })
  }
  return saida.sort((a, b) => compararPorPontoDeCodigo(a.id, b.id))
}

const NENHUMA: ReadonlySet<string> = new Set()

/**
 * A cópia de segurança (formato no cabeçalho). `agora` dá `geradoEm`; `naFila`: as imagens deste aparelho que ainda têm
 * arquivo por subir (a fila do OPFS, `imagensAindaNesteAparelho`).
 */
export function montarCopia(i: Instantaneo, agora: Date, naFila: ReadonlySet<string> = NENHUMA): CopiaDeSeguranca {
  const estado = estadoDe(i)
  const eventos = i.eventos.map((x) => doContrato(x.evento)).sort(compararEventos)
  const naoEnviados = i.eventos
    .filter((x) => !x.enviado && x.evento.aparelho === i.aparelho.id)
    .map((x) => x.evento)
    .sort(compararEventos)
    .map((e) => e.id)
  const marcas: CopiaDeSeguranca['marcas'] = {}
  const marca = (ap: string) => (marcas[ap] ??= { seq: 0, segmento: 0 })
  for (const e of eventos) marca(e.aparelho).seq = Math.max(marca(e.aparelho).seq, seqDe(e.id))
  for (const [ap, l] of Object.entries(i.lidos)) {
    const m = marca(ap)
    m.seq = Math.max(m.seq, l.ate, ...Object.values(l.alem))
    m.segmento = Math.max(m.segmento, l.marca)
  }
  if (i.seqLocal > 0) marca(i.aparelho.id).seq = Math.max(marca(i.aparelho.id).seq, i.seqLocal)
  const ordenadas = Object.fromEntries(Object.keys(marcas).sort(compararPorPontoDeCodigo).map((ap) => [ap, marcas[ap]!]))
  const aparelhos: Record<string, string> = { [i.aparelho.id]: i.aparelho.nome }
  for (const [ap, nome] of Object.entries(i.nomes)) if (ap !== i.aparelho.id) aparelhos[ap] = nome
  return {
    formato: FORMATO_DA_COPIA,
    versao: 1,
    geradoEm: agora.toISOString(),
    aparelho: { id: i.aparelho.id, nome: i.aparelho.nome },
    aparelhos,
    eventos,
    naoEnviados,
    base: i.base,
    estado: consolidar(estado),
    marcas: ordenadas,
    numerosConfirmados: { ...i.confirmados },
    imagens: imagensDe(estado, naFila),
    observacoes: [
      'Cópia de segurança da camada do usuário do IconoDB (notas, coleções, hipóteses, regiões, objetos SKC, sítios, verbetes, revisão).',
      'O estado é a fusão dos eventos sobre a base: fundir(eventos, base) reproduz exatamente "estado".',
      'As imagens não estão dentro deste arquivo: continuam na pasta usuario/imagens/ do Dropbox (os caminhos estão em "imagens").',
      'Uma imagem com enviada false ainda não subiu: está só no aparelho que gerou a cópia, na fila de envio.',
    ],
  }
}

export interface ResumoDaCopia {
  eventos: number
  /** Os aparelhos dos eventos ("N eventos de M aparelhos"; não os que só aparecem na base). */
  aparelhos: number
  porEnviar: number
  imagens: number
  /** As imagens que ainda não subiram (só neste aparelho). */
  soNoAparelho: number
  registros: number
  vazia: boolean
}

/**
 * O que a cópia levaria, em números (para a tela, antes de baixar). `estado`: o de `fundir(eventos, base)`, se quem chama
 * já o tem (a tela não funde duas vezes).
 */
export function resumoDaCopia(i: Instantaneo, estado: Estado = estadoDe(i), naFila: ReadonlySet<string> = NENHUMA): ResumoDaCopia {
  let registros = 0
  for (const m of estado.registros.values()) registros += m.size
  const imagens = imagensDe(estado, naFila)
  return {
    eventos: i.eventos.length,
    aparelhos: new Set(i.eventos.map((x) => x.evento.aparelho)).size,
    porEnviar: i.eventos.filter((x) => !x.enviado && x.evento.aparelho === i.aparelho.id).length,
    imagens: imagens.length,
    soNoAparelho: imagens.filter((x) => !x.enviada).length,
    registros,
    vazia: i.eventos.length === 0 && registros === 0,
  }
}

// ---------------------------------------------------------------------------------------------------------------- regiões

/** Uma região desenhada no pacote (`element_region` com o seu elemento). */
export interface RegiaoDoLivro {
  sigla: string
  elementoId: string
  /** O rótulo em português (`label_pt`), ou null. */
  rotulo: string | null
  /** O rótulo como no texto da fonte (`label`). */
  rotuloDe: string
  imagem: string
  seletor: string
}

/** Um elemento do pacote (para a região que o usuário desenhou sobre ele). */
export interface ElementoDoLivro {
  sigla: string
  rotulo: string | null
  rotuloDe: string
}

export interface PublicacaoDoLivro {
  /** "TESTE I". */
  obra: string
  autores: readonly string[]
  /** A língua da obra (`publication.language`: "de", "en"…), ou null. */
  lingua: string | null
}

export interface EntradaDasRegioes {
  estado: Estado
  doLivro: readonly RegiaoDoLivro[]
  /** O tamanho em pixels das imagens do pacote (`width_px`, `height_px`). */
  tamanhos: ReadonlyMap<string, { largura: number; altura: number }>
  /** Os verbetes das hipóteses DO LIVRO sobre cada elemento (`EL-…` → `GL-…`, na ordem). */
  termosDosElementos: ReadonlyMap<string, readonly string[]>
  /** Os elementos do pacote em que o usuário desenhou (`EL-…`). */
  elementos: ReadonlyMap<string, ElementoDoLivro>
  /** Por sigla: a obra, os autores e a língua, como no pacote. */
  publicacoes: ReadonlyMap<string, PublicacaoDoLivro>
  geradoEm: Date
  /** Os redirecionamentos do pacote (Tarefa 16): o termo SKC publicado sai com o id do livro. */
  redirecionamentos?: Redirecionamentos
}

export interface Agente {
  id?: string
  type: 'Person' | 'Organization'
  name: string
}
export type Criador = Agente | Agente[]
export interface CorpoTextual {
  type: 'TextualBody'
  value: string
  format: 'text/plain'
  language?: string
  purpose: 'tagging'
  creator?: Criador
}
export interface CorpoDeVerbete {
  type: 'SpecificResource'
  source: string
  purpose: 'identifying'
  creator?: Criador
}
export interface Anotacao {
  id: string
  type: 'Annotation'
  motivation: 'tagging'
  creator: Criador
  created?: string
  modified?: string
  body: (CorpoTextual | CorpoDeVerbete)[]
  target: { type: 'SpecificResource'; source: string; selector: { type: 'SvgSelector'; value: string } }
}
export interface ColecaoDeAnotacoes {
  '@context': typeof CONTEXTO_W3C
  id: string
  type: 'AnnotationCollection'
  label: string
  total: number
  first?: { id: string; type: 'AnnotationPage'; partOf: string; startIndex: 0; items: Anotacao[] }
}

const iri = (prefixo: string, id: string) => `${prefixo}${encodeURIComponent(id)}`
const IRI_DA_IMAGEM = 'urn:iconodb:imagem:'
const IRI_DO_VERBETE = 'urn:iconodb:verbete:'
const naBorda = (v: number) => Math.min(1, Math.max(0, v))
/** Um número como texto, sem notação científica nem zeros à direita, com até `casas` casas. */
const numero = (v: number, casas: number) => String(Number(v.toFixed(casas)))

type Tamanho = { largura: number; altura: number }

/** O `<svg>` do seletor: em pixels, se o tamanho é conhecido; senão no quadro 0..1. */
function svgDoPoligono(pontos: readonly (readonly [number, number])[], tamanho: Tamanho | undefined): string {
  const l = tamanho?.largura ?? 1
  const a = tamanho?.altura ?? 1
  const casas = tamanho ? 2 : 4
  const pts = pontos.map(([x, y]) => `${numero(naBorda(x) * l, casas)},${numero(naBorda(y) * a, casas)}`).join(' ')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${numero(l, 2)} ${numero(a, 2)}"><polygon points="${pts}"/></svg>`
}

const tamanhoValido = (largura: number | null | undefined, altura: number | null | undefined): Tamanho | undefined =>
  largura && altura && largura > 0 && altura > 0 ? { largura, altura } : undefined

/** O tamanho em pixels da imagem de uma região: do pacote (`IMG-…`) ou do registro da imagem do usuário (`IM-…`). */
function tamanhoDaImagem(e: EntradaDasRegioes, imagem: string): Tamanho | undefined {
  const doPacote = e.tamanhos.get(imagem)
  if (doPacote) return tamanhoValido(doPacote.largura, doPacote.altura)
  const r = e.estado.registros.get('imagem')?.get(imagem)
  const img = r ? lerImagem(r) : null
  if (!img) return undefined
  const original = tamanhoValido(img.originalLargura, img.originalAltura)
  const tela = tamanhoValido(img.largura, img.altura)
  if (original && tela) {
    // A região é relativa ao quadro que a pessoa viu (a versão de tela, já orientada). Se o original não confere com ele (um HEIC com
    // rotação/espelho que o navegador não aplicou, ou um Safari antigo sem `imageOrientation: 'from-image'`), os pixels sairiam
    // deformados e com os lados trocados: cai no tamanho da tela quando a proporção difere mais que 2 % (T17-C-11).
    const proporcaoOriginal = original.largura / original.altura
    const proporcaoTela = tela.largura / tela.altura
    return Math.abs(proporcaoOriginal - proporcaoTela) / proporcaoTela > 0.02 ? tela : original
  }
  return original ?? tela
}

/** Os verbetes das hipóteses SKC vivas sobre cada elemento (do livro ou do usuário), na ordem de criação, sem repetir. */
function termosSkcPorElemento(estado: Estado, redirecionamentos: Redirecionamentos): Map<string, string[]> {
  const mapa = new Map<string, string[]>()
  const skc = [...(estado.registros.get('hipotese')?.values() ?? [])].filter((r) => !r.excluido && eHipoteseSkc(r.id)).map(lerHipotese)
  skc.sort((a, b) => (a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : compararPorPontoDeCodigo(a.id, b.id)))
  for (const h of skc) {
    if (h.sobre.tipo !== 'elemento') continue
    const lista = mapa.get(h.sobre.id) ?? []
    for (const t of h.termos) {
      const id = destinoDe(redirecionamentos, t.id)
      if (!lista.includes(id)) lista.push(id)
    }
    mapa.set(h.sobre.id, lista)
  }
  return mapa
}

/** O usuário: o autor das regiões que desenhou e das suas hipóteses. */
export const AGENTE_DO_USUARIO: Agente = { id: 'urn:iconodb:usuario', type: 'Person', name: AUTOR_DO_USUARIO }
/** Os autores de um livro que o pacote não pôde dizer (o pacote não foi lido). */
export const AUTORES_DESCONHECIDOS: Agente = { id: 'urn:iconodb:autores-do-livro', type: 'Organization', name: 'Autores do livro' }

/** Os autores do livro de `sigla`, como agentes: um Person por autor; sem autores, a Organization "Autores de <obra>". */
function autoresDe(e: EntradaDasRegioes, sigla: string): Criador {
  const pub = e.publicacoes.get(sigla)
  if (pub && pub.autores.length > 0) return pub.autores.map((name): Agente => ({ type: 'Person', name }))
  return { id: iri('urn:iconodb:autores:', sigla), type: 'Organization', name: `Autores de ${pub?.obra || sigla}` }
}

function corpoDeTexto(value: string, language: string | null, creator?: Criador): CorpoTextual {
  return { type: 'TextualBody', value, format: 'text/plain', ...(language ? { language } : {}), purpose: 'tagging', ...(creator ? { creator } : {}) }
}
function corposDeVerbetes(termos: readonly string[] | undefined, creator?: Criador): CorpoDeVerbete[] {
  return (termos ?? []).map((t) => {
    const c: CorpoDeVerbete = { type: 'SpecificResource', source: iri(IRI_DO_VERBETE, t), purpose: 'identifying' }
    if (creator) c.creator = creator
    return c
  })
}
/** O rótulo do livro: em português e na língua da obra (se a obra diz qual é). */
function rotulosDoLivro(e: EntradaDasRegioes, el: { sigla: string; rotulo: string | null; rotuloDe: string }, creator?: Criador): CorpoTextual[] {
  const corpos: CorpoTextual[] = []
  if (el.rotulo) corpos.push(corpoDeTexto(el.rotulo, 'pt', creator))
  if (el.rotuloDe) corpos.push(corpoDeTexto(el.rotuloDe, e.publicacoes.get(el.sigla)?.lingua ?? null, creator))
  return corpos
}

const alvo = (e: EntradaDasRegioes, imagem: string, pontos: readonly (readonly [number, number])[]): Anotacao['target'] => ({
  type: 'SpecificResource',
  source: iri(IRI_DA_IMAGEM, imagem),
  selector: { type: 'SvgSelector', value: svgDoPoligono(pontos, tamanhoDaImagem(e, imagem)) },
})

/** As regiões em W3C Web Annotation (formato no cabeçalho). */
export function montarRegioes(e: EntradaDasRegioes): ColecaoDeAnotacoes {
  const termosSkc = termosSkcPorElemento(e.estado, e.redirecionamentos ?? SEM_REDIRECIONAMENTOS)
  const itens: Anotacao[] = []
  const regs = [...(e.estado.registros.get('regiao')?.values() ?? [])].filter((r) => !r.excluido).sort((a, b) => compararPorPontoDeCodigo(a.id, b.id))
  for (const r of regs) {
    const g = lerRegiao(r)
    if (g.pontos.length < 3) continue
    const body: Anotacao['body'] = []
    if (RE_ELEMENTO_DO_LIVRO.test(g.elementoId)) {
      // Sobre um elemento do livro: o polígono é do usuário; o rótulo e os termos do livro, dos autores (decisão 46).
      const el = e.elementos.get(g.elementoId)
      if (el) {
        const autores = autoresDe(e, el.sigla)
        body.push(...rotulosDoLivro(e, el, autores))
        body.push(...corposDeVerbetes(e.termosDosElementos.get(g.elementoId), autores))
      } else if (g.elemento) body.push(corpoDeTexto(g.elemento, 'pt', AUTORES_DESCONHECIDOS))
    } else if (g.elemento) body.push(corpoDeTexto(g.elemento, 'pt', AGENTE_DO_USUARIO))
    body.push(...corposDeVerbetes(termosSkc.get(g.elementoId), AGENTE_DO_USUARIO))
    itens.push({
      id: iri('urn:iconodb:regiao:', g.id),
      type: 'Annotation',
      motivation: 'tagging',
      creator: AGENTE_DO_USUARIO,
      created: isoDoHlc(r.criadoEm),
      modified: isoDoHlc(r.alteradoEm),
      body,
      target: alvo(e, g.imagem, g.pontos),
    })
  }
  const doLivro = [...e.doLivro].sort(
    (a, b) => compararPorPontoDeCodigo(a.sigla, b.sigla) || compararPorPontoDeCodigo(a.elementoId, b.elementoId) || compararPorPontoDeCodigo(a.imagem, b.imagem),
  )
  for (const l of doLivro) {
    const pontos = pontosDoSeletorLivre(l.seletor)
    if (pontos.length < 3) continue
    // Só o que o livro diz: o rótulo e os termos das hipóteses do livro (os corpos herdam os autores da anotação).
    const body: Anotacao['body'] = [...rotulosDoLivro(e, l), ...corposDeVerbetes(RE_ELEMENTO_DO_LIVRO.test(l.elementoId) ? e.termosDosElementos.get(l.elementoId) : undefined)]
    itens.push({
      id: `urn:iconodb:regiao-do-livro:${encodeURIComponent(l.elementoId)}:${encodeURIComponent(l.imagem)}`,
      type: 'Annotation',
      motivation: 'tagging',
      creator: autoresDe(e, l.sigla),
      body,
      target: alvo(e, l.imagem, pontos),
    })
  }
  const id = `urn:iconodb:exportacao:regioes:${e.geradoEm.toISOString()}`
  const colecao: ColecaoDeAnotacoes = { '@context': CONTEXTO_W3C, id, type: 'AnnotationCollection', label: 'IconoDB: regiões das imagens', total: itens.length }
  if (itens.length > 0) colecao.first = { id: `${id}:pagina:1`, type: 'AnnotationPage', partOf: id, startIndex: 0, items: itens }
  return colecao
}

/** `<polygon points="x,y …"/>` → pontos (o mesmo formato R4 do pacote e do usuário); vazio se não for isso. */
function pontosDoSeletorLivre(seletor: string): [number, number][] {
  const pontos = /points\s*=\s*"([^"]*)"/.exec(seletor)?.[1]
  if (!pontos) return []
  const pares = pontos.trim().split(/\s+/).map((par) => par.split(',').map(Number))
  return pares.every((p) => p.length === 2 && p.every(Number.isFinite)) ? (pares as [number, number][]) : []
}

/** Quantas regiões a exportação leva: as do usuário e as dos livros. */
export function resumoDasRegioes(e: Pick<EntradaDasRegioes, 'estado' | 'doLivro'>): { suas: number; doLivro: number } {
  let suas = 0
  for (const r of e.estado.registros.get('regiao')?.values() ?? []) if (!r.excluido && lerRegiao(r).pontos.length >= 3) suas++
  return { suas, doLivro: e.doLivro.filter((l) => pontosDoSeletorLivre(l.seletor).length >= 3).length }
}

// ---------------------------------------------------------------------------------------------------------------- MEDIATION

export interface TermoParaMediation {
  id: string
  /** O rótulo guardado na hipótese (a forma de quando o termo foi escolhido). */
  rotulo: string
  termoDoUsuario: boolean
  /** Só num termo do usuário (decisão 41): a forma de agora e a forma como foi criado. */
  forma?: string
  formaOriginal?: string
  /** Um termo do usuário que o pacote publicou (Tarefa 16): o id dele no app (`id` é o do livro). */
  publicadoDe?: string
}

export interface HipoteseParaMediation {
  id: string
  /** Os códigos do pacote (`hypothesis.target_type`): "item" (o objeto) ou "element". */
  alvo: { tipo: 'item' | 'element'; id: string | null; objeto: string | null; rotulo: string }
  identificacao: TermoParaMediation[]
  nivel: string | null
  modalidade: string | null
  autores: { nome: string; papel: 'author' }[]
  fonte: 'own_unpublished'
  publicado: false
  localizador: string | null
  trecho: { texto: string; fonte: string; lingua: string; inicio: number; fim: number } | null
  supersedes_id: string | null
  verificacao: 'recorded'
  religiosidade: null
  estrategias: null
  justificativa: string
  criadoEm: string
  alteradoEm: string
}

export interface ArquivoMediation {
  formato: typeof FORMATO_DO_MEDIATION
  alvoEsquema: 'MEDIATION v0.6'
  versao: 1
  geradoEm: string
  observacoes: string[]
  hipoteses: HipoteseParaMediation[]
}

function hipotesesProprias(estado: Estado) {
  return [...(estado.registros.get('hipotese')?.values() ?? [])]
    .filter((r) => !r.excluido && eHipoteseSkc(r.id))
    .sort((a, b) => (a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : compararPorPontoDeCodigo(a.id, b.id)))
}

/** O localizador legível de um objeto: o do pacote ("TESTE I, Nr. 3"), "SKC OB-…", ou o número do objeto. */
function localizadorDe(objeto: string | null, localizadores: ReadonlyMap<string, string>): string | null {
  if (!objeto) return null
  if (/^OB-/.test(objeto)) return `SKC ${objeto}`
  return localizadores.get(objeto) ?? objeto
}

/**
 * As hipóteses SKC para o MEDIATION (formato no cabeçalho). `localizadores`: objeto do pacote (CA…) → o localizador no
 * estilo do pacote ("TESTE I, Nr. 3"), de `localizadoresDosObjetos`.
 */
export function montarHipoteses(
  estado: Estado,
  agora: Date,
  localizadores: ReadonlyMap<string, string> = new Map(),
  redirecionamentos: Redirecionamentos = SEM_REDIRECIONAMENTOS,
): ArquivoMediation {
  const hipoteses = hipotesesProprias(estado).map((r): HipoteseParaMediation => {
    const h = lerHipotese(r)
    const identificacao = h.termos.map((t): TermoParaMediation => {
      const publicado = destinoDe(redirecionamentos, t.id)
      if (publicado !== t.id) return { id: publicado, rotulo: t.rotulo, termoDoUsuario: false, publicadoDe: t.id }
      if (!eVerbeteSkc(t.id)) return { id: t.id, rotulo: t.rotulo, termoDoUsuario: false }
      const v = estado.registro('verbete', t.id)
      const lido = v ? lerVerbeteSkc(v) : null
      return { id: t.id, rotulo: t.rotulo, termoDoUsuario: true, forma: lido?.emUso ?? t.rotulo, formaOriginal: lido?.forma ?? t.rotulo }
    })
    const alvo: HipoteseParaMediation['alvo'] =
      h.sobre.tipo === 'elemento' ? { tipo: 'element', id: h.sobre.id, objeto: h.objeto, rotulo: h.sobre.rotulo } : { tipo: 'item', id: h.objeto, objeto: h.objeto, rotulo: '' }
    return {
      id: h.id,
      alvo,
      identificacao,
      nivel: h.nivel,
      modalidade: h.modalidade,
      autores: [{ nome: AUTOR_DO_USUARIO, papel: 'author' }],
      fonte: 'own_unpublished',
      publicado: false,
      localizador: localizadorDe(h.objeto, localizadores),
      trecho: h.ancora ? { texto: h.ancora.trecho, fonte: h.ancora.fonte, lingua: h.ancora.lingua, inicio: h.ancora.inicio, fim: h.ancora.fim } : null,
      // O app ainda não registra que uma hipótese substitui outra: sempre null (as anteriores, se houver, continuam no arquivo).
      supersedes_id: null,
      verificacao: 'recorded',
      religiosidade: null,
      estrategias: null,
      justificativa: h.justificativa,
      criadoEm: isoDoHlc(r.criadoEm),
      alteradoEm: isoDoHlc(r.alteradoEm),
    }
  })
  return {
    formato: FORMATO_DO_MEDIATION,
    alvoEsquema: 'MEDIATION v0.6',
    versao: 1,
    geradoEm: agora.toISOString(),
    observacoes: [
      'Só as hipóteses próprias (SKC), marcadas como não publicadas (fonte "own_unpublished", publicado false).',
      'As posições sobre hipóteses dos livros (concordo, discordo, em aberto) não são exportadas.',
      'Mapeamento provisório pelos campos da tabela de hipóteses da especificação (§4.2); a Fase 5 o fecha contra o esquema real do MEDIATION.',
      'Termos com termoDoUsuario true são verbetes criados no app (ids GL-<aparelho>-<n>): "forma" é a forma de agora.',
      'Um verbete criado no app que o pipeline já publicou leva o id do livro (termoDoUsuario false); publicadoDe é o id dele no app.',
      'alvo.tipo usa os códigos do pacote ("item" = o objeto, pelo número; "element"); localizador é a obra e o número; o trecho marcado está em trecho.fonte.',
    ],
    hipoteses,
  }
}

export function resumoDasHipoteses(estado: Estado): { hipoteses: number } {
  return { hipoteses: hipotesesProprias(estado).length }
}
