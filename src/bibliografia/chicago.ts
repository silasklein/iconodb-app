/**
 * O Chicago autor-data das obras (Parte 2C, bloco 3, Tarefa 8): o porte de `iconodb/biblio/chicago.py`, para a prévia e a
 * lista das obras do usuário. Puro: sem React, sem banco.
 *
 * CONTRATO. `chicago(csl)` e `chicagoHtml(csl)` dão o mesmo texto que `chicago`/`chicago_html` do processamento, que
 * formata a obra no build seguinte. O gabarito `tests/fixtures/chicago-gabarito.json` (`python -m iconodb
 * chicago-gabarito`) é a prova, caso a caso.
 *
 * O QUE É PORTADO, FUNÇÃO POR FUNÇÃO. As funções do arquivo Python, com os mesmos passos:
 * - `_prepare` → `preparar`: `language` sempre "und", fora `container-key`, `et-al` e `original-date`, os organizadores
 *   de um livro (não capítulo) passam a autores com o rótulo «ed.»/«eds.», e «4» volumes vira «4 vols»;
 * - `_date_text` → `textoDaData`, `_decorate` → `decorar` (o «, et al.» e o «, ed./eds.» ao fim dos nomes, sem «and»
 *   antes de «et al.»), `_chicago_quotes` → `aspasDeChicago`, `_render` → `formatar`.
 *
 * O RENDERIZADOR. No Python, `_render` entrega o item ao citeproc-py com o estilo `data/sources/chicago-author-date.csl`
 * (Chicago 18). Aqui, `bibliografia` é esse passo: as macros do estilo que o item alcança, uma função por macro (com o
 * nome da macro), avaliadas como o citeproc-py 0.11 as avalia, inclusive nas suas manias:
 * - a costura das partes (`normalize_seam`): «ed.» + «. » dá «ed. », e o ponto final não se repete; um texto do
 *   citeproc-py costura de novo a cada `+`, um `str` simples não (`Parte.m`);
 * - o grupo some quando só termos saem dele, mas uma `<choose>` conta como variável: o artigo sem revista ganha
 *   «Edition» mesmo sem edição; uma variável presente mas vazia escolhe o ramo e não imprime nada;
 * - a obra sem nomes repete o título no lugar do autor; o capítulo só com organizadores os põe em ordem direta, sem
 *   «ed.» (a `<names>` sem `<name>` da substituição);
 * - as páginas no formato «chicago-16» («1102–8», «140–47»), o ordinal da edição («2nd», «111st»), «Vol.»/«vol.» só
 *   com volume numérico (`^[A-Z]*\d+[A-Z]*$`), a data literal repetida no artigo («BEI 5-6 (1990/91)»);
 * - no HTML, só o itálico (`<i>`) e o «&» das páginas mudam; o texto das variáveis não é escapado.
 *
 * ALCANCE. Os campos que o formulário e o «Colar do Zotero» gravam (revisão da Tarefa 2, M2), mais os que as obras dos
 * livros trazem: os tipos `book`, `chapter`, `article-journal` e `document`; `author`/`editor` (`family`/`given`, ou
 * `literal`), `et-al`, `issued` (ano, intervalo de anos ou `literal`; mês e dia só como o estilo os imprime),
 * `year-suffix`, `title`, `container-title`, `volume`, `issue`, `page`, `publisher-place`, `publisher`,
 * `collection-title`, `collection-number`, `edition`, `number-of-volumes`, e ainda `note`, `container-key`,
 * `original-date` e `language`, que não se imprimem. Fora disso (outros tipos, tradutor, DOI, URL…) o porte não promete
 * o mesmo texto, e `chicago` lança `ForaDoAlcance` (ver `foraDoAlcance`). Os valores são textos; um número vira texto,
 * como no Python.
 */
import type { Csl } from './modelo'

// ---- O Python: valores como o Python os vê --------------------------------------------------------------------------

type Obj = { [campo: string]: unknown }

const eObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)

/** `bool(x)` do Python. */
function verdadeiro(x: unknown): boolean {
  if (Array.isArray(x)) return x.length > 0
  if (eObj(x)) return Object.keys(x).length > 0
  return Boolean(x)
}

/**
 * `str(x)` do Python, para os valores de um JSON. Difere só onde o formulário não chega: um objeto sai em JSON (o Python
 * usa `repr`), e um fracionário inteiro perde o «.0» já no `JSON.parse` («3.0» → «3»).
 */
function str(x: unknown): string {
  if (typeof x === 'string') return x
  if (x === null || x === undefined) return 'None'
  if (typeof x === 'boolean') return x ? 'True' : 'False'
  if (typeof x === 'number') return String(x)
  return JSON.stringify(x)
}

// ---- chicago.py ------------------------------------------------------------------------------------------------------

/** `_prepare`: o item para o renderizador, o rótulo de organizador («ed.»/«eds.») e se há et al. */
function preparar(csl: Csl): { item: Obj; rotulo: string; etal: boolean } {
  const item = JSON.parse(JSON.stringify(csl)) as Obj // `copy.deepcopy`; o CSL é JSON
  item.id = 'item'
  // Sempre "und": com "en" (ou sem `language`) o citeproc-py poria os títulos em caixa de título.
  item.language = 'und'
  delete item['container-key']
  const etal = verdadeiro(item['et-al'])
  delete item['et-al']
  let rotulo = ''
  if (verdadeiro(item.editor) && !verdadeiro(item.author) && item.type !== 'chapter') {
    const eds = item.editor as unknown[]
    delete item.editor
    item.author = eds
    rotulo = eds.length > 1 || etal ? 'eds.' : 'ed.'
  }
  delete item['original-date']
  if (verdadeiro(item['number-of-volumes'])) {
    // o rótulo já no valor: o estilo o imprime como está, na posição que a Chicago prescreve.
    const n = str(item['number-of-volumes'])
    item['number-of-volumes'] = `${n} vol${n !== '1' ? 's' : ''}`
  }
  return { item, rotulo, etal }
}

/** `_date_text`: o ano como o estilo o imprime depois dos nomes («n.d.» sem data). */
function textoDaData(item: Obj): string {
  const d = item.issued
  if (!verdadeiro(d)) return 'n.d.'
  const data = d as Obj
  if ('literal' in data) return str(data.literal)
  const partes = data['date-parts'] as unknown[][] | undefined
  return str(partes?.[0]?.[0]) // onde o Python quebraria, uma marca que não se acha
}

/**
 * `_decorate`: põe «, et al.» e «, ed./eds.» ao fim do bloco de nomes, que termina antes da data; com «et al.», tira o
 * «and» que o estilo pôs antes do último nome.
 */
function decorar(texto: string, item: Obj, rotulo: string, etal: boolean): string {
  if (!(rotulo || etal)) return texto
  const marca = ' ' + textoDaData(item)
  const corte = texto.indexOf(marca)
  if (corte <= 0) return texto
  let nomes = texto.slice(0, corte)
  const resto = texto.slice(corte)
  const pessoas = (verdadeiro(item.author) && Array.isArray(item.author) ? item.author : [{}]) as unknown[]
  const ultima: Obj = eObj(pessoas[pessoas.length - 1]) ? (pessoas[pessoas.length - 1] as Obj) : {}
  const ultimoTexto = str(ultima.given || ultima.literal || '')
  if (nomes.endsWith('.') && !ultimoTexto.endsWith('.')) nomes = nomes.slice(0, -1) // o ponto do estilo; o resto o repõe
  if (etal && pessoas.length > 1) {
    // a lista não está completa: sem «and» antes do último nome impresso («A, B, et al.», não «A, and B, et al.»)
    const ultimo = ultima.literal
      ? str(ultima.literal)
      : [ultima.given, ultima.family].filter((x) => verdadeiro(x)).map(str).join(' ')
    for (const juntor of [', and ', ' and ']) {
      if (ultimo && nomes.endsWith(juntor + ultimo)) {
        nomes = nomes.slice(0, nomes.length - (juntor + ultimo).length) + ', ' + ultimo
        break
      }
    }
  }
  const extra = etal && rotulo ? `, et al., ${rotulo}` : etal ? ', et al.' : `, ${rotulo}`
  return nomes + extra + resto
}

/**
 * `_chicago_quotes`: a pontuação das aspas do título entre aspas, como a Chicago prescreve: aspas duplas dentro dele viram
 * simples; ponto e vírgula ficam dentro das aspas de fechamento; depois de «?», «!» ou ponto não se acrescenta ponto.
 */
function aspasDeChicago(texto: string): string {
  const saida: string[] = []
  let externa = false
  let interna = false
  for (const c of texto) {
    if (c === '“' && !externa) {
      externa = true
      saida.push(c)
    } else if (c === '“' && externa) {
      interna = true
      saida.push('‘')
    } else if (c === '"' && externa) {
      saida.push(interna ? '’' : '‘')
      interna = !interna
    } else if (c === '”' && externa && interna) {
      interna = false
      saida.push('’')
    } else if (c === '”' && externa) {
      externa = false
      saida.push(c)
    } else {
      saida.push(c)
    }
  }
  return saida.join('').replace(/([’”]*”)([.,])/g, (_m, fechos: string, pontuacao: string, pos: number, s: string) => {
    const antes = pos ? (s[pos - 1] ?? '') : ''
    // `prev in "?!."` do Python: também vale com `prev` vazio, no começo do texto
    if ('?!.'.includes(antes) || (pontuacao === '.' && antes === ',')) return pontuacao === '.' ? fechos : fechos + pontuacao
    return pontuacao + fechos
  })
}

/**
 * O ALCANCE, conferido antes de formatar. Fora dele o porte não adivinha: lança `TipoNaoSuportado` ou
 * `CampoNaoSuportado`, e quem chama mostra outra coisa (o título, por exemplo) e diz que o tipo não tem prévia. A
 * Tarefa 9 leva os tipos do Zotero para estes quatro, ou os recusa, e guarda só os campos de `CAMPOS_DO_CHICAGO`.
 */
export const TIPOS_DO_CHICAGO = ['book', 'chapter', 'article-journal', 'document'] as const
export type TipoDoChicago = (typeof TIPOS_DO_CHICAGO)[number]

/**
 * Os campos do CSL que o porte conhece: os que imprime e os que sabe que não se imprimem (`id`, `language`, `note`,
 * `container-key`, `original-date`). Qualquer outro (`translator`, `DOI`, `URL`, `genre`, `number`…) pode mudar o texto
 * do processamento.
 */
export const CAMPOS_DO_CHICAGO: readonly string[] = ['id', 'type', 'language', 'author', 'editor', 'et-al', 'issued',
  'year-suffix', 'title', 'container-title', 'volume', 'issue', 'page', 'publisher-place', 'publisher',
  'collection-title', 'collection-number', 'edition', 'number-of-volumes', 'note', 'container-key', 'original-date']

/** O CSL está fora do que este porte formata igual ao processamento. */
export class ForaDoAlcance extends Error {}

/** O tipo não é um dos quatro (`TIPOS_DO_CHICAGO`). */
export class TipoNaoSuportado extends ForaDoAlcance {
  readonly tipo: unknown
  constructor(tipo: unknown) {
    super(`o Chicago do app não formata o tipo ${JSON.stringify(tipo)}`)
    this.name = 'TipoNaoSuportado'
    this.tipo = tipo
  }
}

/** O CSL tem campos fora de `CAMPOS_DO_CHICAGO`. */
export class CampoNaoSuportado extends ForaDoAlcance {
  readonly campos: string[]
  constructor(campos: string[]) {
    super(`o Chicago do app não conhece os campos ${campos.join(', ')}`)
    this.name = 'CampoNaoSuportado'
    this.campos = campos
  }
}

export const eTipoDoChicago = (t: unknown): t is TipoDoChicago => (TIPOS_DO_CHICAGO as readonly unknown[]).includes(t)

/** O erro que `chicago` lançaria para este CSL, ou null se ele está no alcance. */
export function foraDoAlcance(csl: Csl): ForaDoAlcance | null {
  if (!eTipoDoChicago(csl.type)) return new TipoNaoSuportado(csl.type)
  const campos = Object.keys(csl).filter((c) => !CAMPOS_DO_CHICAGO.includes(c))
  return campos.length ? new CampoNaoSuportado(campos) : null
}

export const noAlcance = (csl: Csl) => foraDoAlcance(csl) === null

/** `_render`. */
function formatar(csl: Csl, html: boolean): string {
  const erro = foraDoAlcance(csl)
  if (erro) throw erro
  const { item, rotulo, etal } = preparar(csl)
  const texto = bibliografia(lerReferencia(item), html) ?? ''
  return aspasDeChicago(decorar(texto, item, rotulo, etal))
}

/** Referência completa em Chicago autor-data, texto puro. Lança `ForaDoAlcance` fora do alcance. */
export function chicago(csl: Csl): string {
  return formatar(csl, false)
}

/**
 * Igual a `chicago`, com o título de monografia em itálico (`<i>`). NÃO é HTML escapado: como no Python, o texto do
 * usuário sai cru («A & B <script>…»). Desenhe só com `htmlComItalico` (src/item/Secoes.tsx), nunca com innerHTML.
 */
export function chicagoHtml(csl: Csl): string {
  return formatar(csl, true)
}

// ---- citeproc-py: a referência (`CiteProcJSON`) --------------------------------------------------------------------

const NOMES = new Set(['author', 'collection_editor', 'composer', 'container_author', 'editor', 'editorial_director',
  'illustrator', 'interviewer', 'original_author', 'recipient', 'translator'])
const DATAS = new Set(['accessed', 'container', 'event_date', 'issued', 'original_date', 'submitted'])

/** Um texto lido (`parse_string`): sem as marcas `<span class="nocase">`; `semCaixa` se o primeiro trecho era uma delas. */
interface Texto { s: string; semCaixa: boolean }

interface Nome { given?: string; family?: string; dp?: string; ndp?: string; suffix?: string }

interface DiaDoCalendario { ano?: number; mes?: number; dia?: number }
type Data =
  | { tipo: 'literal'; texto: string; circa: boolean }
  | { tipo: 'dia'; d: DiaDoCalendario; circa: boolean }
  | { tipo: 'intervalo'; de: DiaDoCalendario; ate: DiaDoCalendario; circa: boolean }
  | null

interface Referencia {
  tipo: unknown
  campos: Map<string, Texto | Nome[] | Data | string>
}

const ABRE_SEM_CAIXA = '<span class="nocase">'
const FECHA_SEM_CAIXA = '</span>'

/** `CiteProcJSON.parse_string`, com a mesma volta quando falta o fecho. */
function lerTexto(valor: unknown): Texto {
  const s = str(valor)
  const minusculo = s.toLowerCase()
  const trechos: { s: string; semCaixa: boolean }[] = []
  let fim = 0
  for (;;) {
    const ini = minusculo.indexOf(ABRE_SEM_CAIXA, fim)
    if (ini < 0) break
    const normal = s.slice(fim, ini)
    if (normal) trechos.push({ s: normal, semCaixa: false })
    const fecho = minusculo.indexOf(FECHA_SEM_CAIXA, ini + 1)
    if (fecho < 0) break
    const dentro = s.slice(ini + ABRE_SEM_CAIXA.length, fecho)
    if (dentro) trechos.push({ s: dentro, semCaixa: true })
    fim = fecho + FECHA_SEM_CAIXA.length
  }
  const resto = s.slice(fim)
  if (resto) trechos.push({ s: resto, semCaixa: false })
  return { s: trechos.map((t) => t.s).join(''), semCaixa: trechos[0]?.semCaixa ?? false }
}

function lerNome(n: Obj): Nome {
  const t = (v: unknown) => (v === null || v === undefined ? undefined : str(v))
  if ('literal' in n) return { family: t(n.literal) }
  return { given: t(n.given), family: t(n.family), dp: t(n['dropping-particle']), ndp: t(n['non-dropping-particle']), suffix: t(n.suffix) }
}

/** `Date(**partes)` do citeproc-py: cada parte passa por `int()`, e o ano em texto do Zotero («2000») vale como número. */
function lerDia(partes: unknown[]): DiaDoCalendario {
  const n = (v: unknown) => inteiro(v) ?? undefined
  return { ano: n(partes[0]), mes: n(partes[1]), dia: n(partes[2]) }
}

/** `CiteProcJSON.parse_date`. */
function lerData(valor: unknown): Data {
  if (!eObj(valor)) return null
  const circa = valor.circa !== undefined && valor.circa !== 0 && valor.circa !== false // `get('circa', 0) != 0`
  const partes = Array.isArray(valor['date-parts']) ? (valor['date-parts'] as unknown[]).filter(Array.isArray) : []
  if (partes.length === 1) return { tipo: 'dia', d: lerDia(partes[0] as unknown[]), circa }
  if (partes.length > 1) return { tipo: 'intervalo', de: lerDia(partes[0] as unknown[]), ate: lerDia(partes[1] as unknown[]), circa }
  if ('literal' in valor) return { tipo: 'literal', texto: str(valor.literal), circa }
  return null
}

function lerReferencia(item: Obj): Referencia {
  const campos = new Map<string, Texto | Nome[] | Data | string>()
  let tipo: unknown
  for (const [chave, valor] of Object.entries(item)) {
    let k = chave.replaceAll('-', '_')
    if (k === 'id' || k === 'key') continue
    if (k === 'type') {
      tipo = valor
      continue
    }
    if (k === 'shortTitle') k = 'title_short'
    if (NOMES.has(k)) campos.set(k, (Array.isArray(valor) ? valor : []).filter(eObj).map(lerNome))
    else if (DATAS.has(k)) campos.set(k, lerData(valor))
    else if (chave === 'language') campos.set(k, str(valor))
    else campos.set(k, lerTexto(valor))
  }
  return { tipo, campos }
}

/** A variável está na referência (`variable="…"` do estilo), mesmo vazia. */
const tem = (r: Referencia, v: string) => r.campos.has(v.replaceAll('-', '_'))

/** O texto de uma variável, ou null se falta ou se é vazio (o que não se imprime). */
function texto(r: Referencia, v: string): Texto | null {
  const t = r.campos.get(v.replaceAll('-', '_')) as Texto | undefined
  return t && t.s ? t : null
}

function nomes(r: Referencia, v: string): Nome[] | null {
  const n = r.campos.get(v)
  return Array.isArray(n) ? n : null
}

// ---- citeproc-py: as primitivas -------------------------------------------------------------------------------------

/**
 * Um pedaço do texto, como o citeproc-py o carrega. `m` se é um texto dele (`String`/`MixedString`: variáveis, termos,
 * aspas), que costura outra vez a cada `+`; um `str` simples (os nomes, as datas, o itálico, as páginas soltas) não.
 */
interface Parte { s: string; m: boolean }
const misto = (s: string): Parte => ({ s, m: true })
const simples = (s: string): Parte => ({ s, m: false })

const COSTURA = new Set(['.', ',', ';', ':', '!', '?'])

/** `normalize_seam`: o começo de `outro`, para que, posto depois de `esq`, não dobre o espaço nem a pontuação. */
function costura(esq: string, outro: string): string {
  if (!esq || !outro) return outro
  const ultimo = esq[esq.length - 1]
  const primeiro = outro[0] ?? ''
  if (ultimo === ' ' && primeiro === ' ') return outro.slice(1)
  if (ultimo === primeiro && COSTURA.has(primeiro)) return outro.slice(1)
  return outro
}

/** O `+` do Python: entre dois `str`, só a soma; com um texto do citeproc-py, costurado (`MixedString.__add__`). */
function somar(a: Parte, b: Parte): Parte {
  if (!a.m && !b.m) return simples(a.s + b.s)
  return misto(a.s + costura(a.s, b.s))
}

/** `join` do citeproc-py: as partes que saíram (null não), com o delimitador, costuradas; null se nada sai. */
function juntar(partes: (Parte | null)[], delimitador: string | Parte): Parte | null {
  const d = typeof delimitador === 'string' ? simples(delimitador) : delimitador
  const [primeira, ...resto] = partes.filter((p): p is Parte => p !== null)
  if (primeira === undefined) return null
  let saida = primeira
  for (const p of resto) {
    saida = somar(saida, { s: costura(saida.s, d.s), m: d.m })
    saida = somar(saida, { s: costura(saida.s, p.s), m: p.m })
  }
  return saida.s ? saida : null
}

/** `Affixed.wrap`: prefixo e sufixo, costurados. */
function envolver(p: Parte | null, prefixo: string, sufixo: string): Parte | null {
  if (p === null) return null
  const t = somar(simples(prefixo), { s: costura(prefixo, p.s), m: p.m })
  return somar(t, simples(costura(t.s, sufixo)))
}

/** `font-style="italic"`: no texto puro, `str(…)`; no HTML, `<i>…</i>`. */
const italico = (p: Parte, html: boolean) => simples(html ? `<i>${p.s}</i>` : p.s)
const entreAspas = (p: Parte) => somar(somar(misto('“'), p), misto('”'))

/** O texto de uma variável (`MixedString`). */
const variavel = (r: Referencia, v: string): Parte | null => {
  const t = texto(r, v)
  return t && misto(t.s)
}

/** `capitalize_first`: o primeiro caractere em maiúscula, salvo num trecho «nocase». */
function capitalizar(t: Texto | string): Parte {
  const { s, semCaixa } = typeof t === 'string' ? { s: t, semCaixa: false } : t
  const [primeiro] = s
  if (semCaixa || primeiro === undefined) return misto(s)
  return misto(primeiro.toUpperCase() + s.slice(primeiro.length))
}

/** `is-numeric`: `^([A-Z]*\d+[A-Z]*)$` com `re.I` (o `\d` e o `$` do Python). */
const RE_NUMERICO = /^[a-z]*\p{Nd}+[a-z]*\n?$/iu
const numerico = (r: Referencia, v: string) => {
  const t = r.campos.get(v.replaceAll('-', '_')) as Texto | undefined
  return t !== undefined && RE_NUMERICO.test(t.s)
}

/** `Label._is_plural`: mais de um número, separados por algo que não é ponto («1-2», «3, 5»). */
const RE_VARIOS = /\p{Nd}+[^\p{Nd}.]+\p{Nd}+/u
const plural = (r: Referencia, v: string) => RE_VARIOS.test(texto(r, v)?.s ?? '')

/** Os termos do estilo e da língua (en-US) que estas macros usam. */
const TERMOS = {
  e: 'and',
  etAl: 'et al.',
  semData: 'n.d.',
  em: 'in',
  organizadoPor: 'edited by',
  edicao: ['ed.', 'eds.'],
  edicaoLonga: ['edition', 'editions'],
  volume: ['vol.', 'vols.'],
  numero: ['no.', 'nos.'],
  serie: ['vol.', 'vols.'], // o rótulo curto de `collection-number`, do estilo
  meses: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November',
    'December'],
} as const

const termo = (t: readonly [string, string], varios: boolean) => misto(varios ? t[1] : t[0])

/** `to_ordinal` com os termos de en-US: «1st», «11th», «21st», «111st». */
function ordinal(n: number): Parte {
  const s = String(n)
  const pelo = (d: string) => ({ '1': 'st', '2': 'nd', '3': 'rd' } as Record<string, string>)[d] ?? 'th'
  const sufixo = s.length === 1 ? pelo(s) : n === 11 || n === 12 || n === 13 ? 'th' : pelo(s.slice(-1))
  return misto(s + sufixo) // `str(number) + termo`
}

/**
 * `int()` do Python: o número (fracionário, truncado), o booleano, ou o texto com sinal e dígitos, espaços em volta e
 * «_» entre os dígitos («2000», « 2000», «2_000»); null onde o `int()` falha (os dígitos não ASCII ficam de fora).
 */
function inteiro(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v !== 'string') return null
  const t = v.trim()
  return /^[+-]?\d+(_\d+)*$/.test(t) ? Number(t.replaceAll('_', '')) : null
}

/** `join` do citeproc-py como `FormatNumber._process` o usa: os vazios contam. */
function juntarTodos(partes: Parte[], delimitador: string | Parte): Parte {
  const d = typeof delimitador === 'string' ? simples(delimitador) : delimitador
  const [primeira, ...resto] = partes
  let saida = primeira ?? simples('')
  for (const p of resto) {
    saida = somar(saida, { s: costura(saida.s, d.s), m: d.m })
    saida = somar(saida, { s: costura(saida.s, p.s), m: p.m })
  }
  return saida
}

/** `FormatNumber._process`: cada número ou intervalo (com o «–» do termo), entre vírgulas e «&». */
function numeros(s: string, html: boolean, um: (x: string) => Parte, intervalo: (de: string, ate: string) => Parte): Parte {
  const e = simples(html ? ' &amp; ' : ' & ')
  return juntarTodos(s.split(',').map((virgula) => juntarTodos(virgula.split('&').map((parte) => {
    const lados = parte.replaceAll('–', '-').split('-')
    const [de, ate] = lados
    if (lados.length !== 2 || de === undefined || ate === undefined) return um(parte.trim())
    return intervalo(de.trim(), ate.trim())
  }), e)), ', ')
}

/** `<number form="ordinal">`: só a edição numérica chega aqui. */
function numeroOrdinal(s: string, html: boolean): Parte {
  const um = (x: string) => {
    const n = inteiro(x)
    return n === null ? simples(x) : ordinal(n)
  }
  return numeros(s, html, um, (de, ate) => juntarTodos([um(de), um(ate)], '–'))
}

/** `_format_last_page` com `page-range-format="chicago-16"`. */
function ultimaPagina(primeira: string, ultima: string): string {
  // `find_common`: a posição da primeira diferença; sem diferença, o tamanho do menor (1 se um deles é vazio)
  const n = Math.min(primeira.length, ultima.length)
  let comum = 0
  while (comum < n && primeira[comum] === ultima[comum]) comum++
  if (comum === n) comum = n === 0 ? 1 : n
  const m = /\d+/.exec(primeira)
  if (!m) return ultima
  const num = Number(m[0])
  let formato = 'expanded'
  if (num < 100 || num % 100 === 0) formato = 'expanded'
  else if (primeira.length >= 4 && comum < 2) formato = 'expanded'
  else if (num % 100 >= 1 && num % 100 <= 9) formato = 'minimal'
  else if (num % 100 >= 10 && num % 100 <= 99) formato = 'minimal-two'
  let i = 0
  if (formato === 'minimal') i = comum
  else if (formato === 'minimal-two') i = Math.min(comum, primeira.length - 2)
  return ultima.slice(i)
}

/** `<text variable="page">`: «1102-1108» → «1102–8» (o «–» é o termo `page-range-delimiter`); o resto como está. */
function paginas(s: string, html: boolean): Parte {
  return numeros(s, html, simples, (de, ate) => juntarTodos([simples(de), simples(ultimaPagina(de, ate))], misto('–')))
}

// ---- citeproc-py: os nomes -------------------------------------------------------------------------------------------

interface OpcoesDosNomes {
  /** `and="text"`. */
  e: boolean
  /** `delimiter-precedes-last`. */
  virgulaAntesDoUltimo: 'always' | 'contextual'
  /** `name-as-sort-order="first"`. */
  primeiroInvertido: boolean
}

/** `Name.process`, forma longa, `et-al-min="7"` e `et-al-use-first="3"` da bibliografia, sem iniciais. */
function formatarNomes(lista: Nome[], o: OpcoesDosNomes): Parte | null {
  // `len(names) > 1 and et_al_min and len(names) >= et_al_min`, copiado do citeproc-py (o `> 1` sobra com o 7 do estilo)
  const truncar = lista.length > 1 && lista.length >= 7
  const usados = truncar ? lista.slice(0, 3) : lista
  const naoVazios = (xs: (string | undefined)[]) => xs.filter((x): x is string => Boolean(x))
  const saida = usados.map((n, i) => {
    if (o.primeiroInvertido && i === 0) {
      const prenome = naoVazios([n.given, n.dp, n.ndp]).join(' ')
      return simples(naoVazios([n.family, prenome, n.suffix]).join(', '))
    }
    const sobrenome = naoVazios([n.dp, n.ndp, n.family]).join(' ')
    return simples(naoVazios([n.given, sobrenome, n.suffix]).join(' '))
  })
  const ultimo = saida[saida.length - 1]
  let s: Parte | null
  if (truncar) s = juntarTodos([...saida, misto(TERMOS.etAl)], ', ')
  else if (o.e && ultimo !== undefined && saida.length > 1) {
    let t = juntarTodos(saida.slice(0, -1), ', ')
    if (o.virgulaAntesDoUltimo === 'always' || saida.length > 2) t = juntarTodos([t, simples('')], ', ')
    else t = somar(t, simples(' '))
    s = somar(t, simples(`${TERMOS.e} ${ultimo.s}`))
  } else s = juntarTodos(saida, ', ')
  return s.s ? s : null
}

const NOMES_DO_AUTOR: OpcoesDosNomes = { e: true, virgulaAntesDoUltimo: 'always', primeiroInvertido: true }
/** O `<name>` padrão que o citeproc-py cria para a `<names>` sem `<name>` dentro de uma `<choose>` da substituição. */
const NOMES_PADRAO: OpcoesDosNomes = { e: false, virgulaAntesDoUltimo: 'contextual', primeiroInvertido: false }
const NOMES_DIRETOS: OpcoesDosNomes = { e: true, virgulaAntesDoUltimo: 'contextual', primeiroInvertido: false }

/** `<names variable="editor"><label form="verb" suffix=" "/><name and="text" initialize="false"/></names>`. */
function organizadoPor(r: Referencia, maiuscula: boolean): Parte | null {
  const eds = nomes(r, 'editor')
  if (!eds) return null
  const rotulo = envolver(maiuscula ? capitalizar(TERMOS.organizadoPor) : misto(TERMOS.organizadoPor), '', ' ')
  // sem nome impresso (lista vazia), o citeproc-py soma o rótulo a None: «edited by None»
  return somar(rotulo ?? misto(''), formatarNomes(eds, NOMES_DIRETOS) ?? simples('None'))
}

// ---- citeproc-py: as datas -------------------------------------------------------------------------------------------

/** A parte do ano (`<date-part name="year"/>`): «AD» antes de 1000, «BC» antes de 0. */
function ano(d: DiaDoCalendario): Parte | null {
  if (d.ano === undefined) return null
  const s = simples(String(Math.abs(d.ano)))
  return d.ano < 0 ? somar(s, misto(' BC')) : d.ano < 1000 ? somar(s, misto(' AD')) : s
}

/** `date-issued-year`: o ano (ou o intervalo de anos, ou o literal), «[…?]» se incerto. */
function dateIssuedYear(r: Referencia): Parte | null {
  const d = r.campos.get('issued') as Data | undefined
  if (!d) return null
  let p: Parte | null
  if (d.tipo === 'literal') p = d.texto ? simples(d.texto) : null
  else if (d.tipo === 'dia') p = ano(d.d)
  else if (d.de.ano === d.ate.ano) p = null // `render_date_range`: o mesmo ano não sobra em nenhuma ponta
  else {
    // `diff_begin.rstrip() + EN DASH + diff_end`
    const de = ano(d.de)
    const ate = ano(d.ate)
    p = de && ate && somar(somar({ s: de.s.trimEnd(), m: de.m }, simples('–')), ate)
  }
  if (!p) return null
  return d.circa ? envolver(p, '[', '?]') : p
}

/** `date-issued-month-day` (e `date-issued-month`, sem o dia): só o literal, ou o mês e o dia de uma data. */
function dateIssuedMonthDay(r: Referencia, comDia: boolean): Parte | null {
  const d = r.campos.get('issued') as Data | undefined
  if (!d) return null
  if (d.tipo === 'literal') return d.texto ? simples(d.texto) : null
  if (d.tipo === 'intervalo') return null
  const mes = d.d.mes === undefined ? undefined : TERMOS.meses[d.d.mes - 1]
  return juntar([mes === undefined ? null : misto(mes), comDia && d.d.dia !== undefined ? simples(` ${d.d.dia}`) : null], '')
}

// ---- O estilo: as macros que o item alcança --------------------------------------------------------------------------

const eTipo = (r: Referencia, ...tipos: TipoDoChicago[]) => tipos.some((t) => t === r.tipo)
/** Os tipos «seriais» do estilo (entre os quatro, só o artigo). */
const serial = (r: Referencia) => eTipo(r, 'article-journal')

/** `<layout suffix=".">` com `bibliography-author-date`. */
function bibliografia(r: Referencia, html: boolean): string | null {
  const corpo = juntar([authorBib(r, html), date(r), titleAndSourceBib(r, html)], '. ')
  return envolver(corpo, '', '.')?.s ?? null
}

/** `author-bib`: os autores, ou a substituição. */
function authorBib(r: Referencia, html: boolean): Parte | null {
  // `<names variable="composer">`, que não há: a substituição, a começar por `<names variable="author"/>`; uma lista que
  // não imprime nada (vazia) passa à seguinte
  const autores = nomes(r, 'author')
  const a = autores && formatarNomes(autores, NOMES_DO_AUTOR)
  if (a) return a
  // a `<names variable="editor"/>` dentro de `<choose>` sai com o `<name>` padrão, sem rótulo
  const eds = nomes(r, 'editor')
  const e = eds && formatarNomes(eds, NOMES_PADRAO)
  if (e) return e
  // `author-title-substitute-bib` (a `author-title-substitute-container` não vale para estes tipos)
  return tem(r, 'title') ? titleBib(r, html) : titleAndDescriptionsBib(r, html)
}

/** `date`: o ano e o sufixo, ou «n.d.» (com o sufixo depois de «-», pelo delimitador do grupo). */
function date(r: Referencia): Parte | null {
  const sufixo = variavel(r, 'year-suffix')
  if (tem(r, 'issued')) {
    const a = dateIssuedYear(r)
    return a === null ? null : juntar([a, sufixo], '')
  }
  return juntar([misto(TERMOS.semData), sufixo], '-')
}

/** `title-and-source-bib`. */
function titleAndSourceBib(r: Referencia, html: boolean): Parte | null {
  return juntar([titleAndDescriptionsBib(r, html), sourceBib(r, html), sourceMonographicPublicationBib(r)], '. ')
}

/** `title-and-descriptions-bib` (a `description-bib` não imprime nada nestes tipos). */
function titleAndDescriptionsBib(r: Referencia, html: boolean): Parte | null {
  return juntar([tem(r, 'title') ? titleBib(r, html) : null, identifierBib(r, html)], '. ')
}

/** `title-bib`: nestes tipos, sempre `title-primary`. */
const titleBib = (r: Referencia, html: boolean) => titlePrimary(r, html)

/** `title-primary`: livro em itálico; com revista ou livro, e no `document`, entre aspas; o resto em itálico. */
function titlePrimary(r: Referencia, html: boolean): Parte | null {
  const t = variavel(r, 'title')
  if (t === null) return null
  if (eTipo(r, 'book')) return italico(t, html)
  if (tem(r, 'container-title') || eTipo(r, 'document')) return entreAspas(t)
  return italico(t, html)
}

/** `identifier-bib`. */
function identifierBib(r: Referencia, html: boolean): Parte | null {
  // com `container-title`, só `identifier-contributors-bib`, que nestes tipos não imprime nada
  if (tem(r, 'container-title')) return null
  return juntar([labelEditionCapitalized(r, html), identifierContributorsAndVolumeBib(r)], '. ')
}

/** `label-edition-capitalized` (pela `identifier-edition-bib`; sem `original-date`, que `preparar` tirou). */
function labelEditionCapitalized(r: Referencia, html: boolean): Parte | null {
  const ed = texto(r, 'edition')
  if (numerico(r, 'edition') && ed) return juntar([numeroOrdinal(ed.s, html), termo(TERMOS.edicao, plural(r, 'edition'))], ' ')
  // o rótulo sai mesmo sem edição: o grupo conta a `<choose>` como variável impressa
  if (serial(r)) return juntar([ed && misto(ed.s), capitalizar(termo(TERMOS.edicaoLonga, plural(r, 'edition')).s)], ' ')
  return ed && capitalizar(ed)
}

/** `label-edition` (pela `identifier-edition-note`). */
function labelEdition(r: Referencia, html: boolean): Parte | null {
  const ed = texto(r, 'edition')
  if (numerico(r, 'edition') && ed) return juntar([numeroOrdinal(ed.s, html), termo(TERMOS.edicao, plural(r, 'edition'))], ' ')
  if (serial(r)) return juntar([ed && misto(ed.s), termo(TERMOS.edicaoLonga, plural(r, 'edition'))], ' ')
  return ed && misto(ed.s)
}

/** `identifier-contributors-and-volume-bib`: «Edited by …», «Vol. 3» ou «4 vols» (sem revista ou livro). */
function identifierContributorsAndVolumeBib(r: Referencia): Parte | null {
  if (serial(r)) return null // `identifier-contributors-serial-bib`: tradutor, compilador… (fora do alcance)
  return juntar([
    organizadoPor(r, true), // `identifier-contributors-monographic-bib`
    juntar([identifierVolumeBibSpecificTitleFirst(r)], ', '),
    tem(r, 'volume') ? null : labelNumberOfVolumes(r),
  ], '. ')
}

/** `identifier-volume-bib-specific-title-first` → `label-volume-capitalized`. */
function identifierVolumeBibSpecificTitleFirst(r: Referencia): Parte | null {
  const v = texto(r, 'volume')
  if (v === null) return null
  return juntar([numerico(r, 'volume') ? capitalizar(TERMOS.volume[0]) : null, capitalizar(v)], ' ')
}

/** `label-volume`. */
function labelVolume(r: Referencia): Parte | null {
  const v = variavel(r, 'volume')
  if (v === null) return null
  return juntar([numerico(r, 'volume') ? termo(TERMOS.volume, false) : null, v], ' ')
}

/** `label-number-of-volumes` (o valor já vem com «vols» de `preparar`). */
function labelNumberOfVolumes(r: Referencia): Parte | null {
  const n = variavel(r, 'number-of-volumes')
  if (n === null) return null
  return juntar([n, numerico(r, 'number-of-volumes') ? termo(TERMOS.volume, plural(r, 'number-of-volumes')) : null], ' ')
}

/** `source-bib`. */
function sourceBib(r: Referencia, html: boolean): Parte | null {
  return serial(r) ? sourceSerialBib(r, html) : sourceMonographicBib(r, html)
}

/** `source-monographic-bib`: «In Livro, 2nd ed., edited by …, vol. 3» e a série. */
function sourceMonographicBib(r: Referencia, html: boolean): Parte | null {
  let livro: Parte | null = null
  if (tem(r, 'container-title')) {
    const titulo = variavel(r, 'container-title')
    livro = juntar([
      // «In» sai mesmo com o título vazio: a macro da preposição conta como variável no grupo
      juntar([capitalizar(TERMOS.em), titulo && italico(titulo, html)], ' '),
      sourceMonographicIdentifierBib(r, html),
    ], ', ')
  }
  return juntar([livro, sourceSeriesBib(r)], '. ')
}

/** `source-monographic-identifier-bib`: a edição, os organizadores, o volume, os volumes. */
function sourceMonographicIdentifierBib(r: Referencia, html: boolean): Parte | null {
  return juntar([labelEdition(r, html), sourceMonographicIdentifierContributorsAndVolumeBibSpecificTitleFirst(r)], ', ')
}

/** `source-monographic-identifier-contributors-and-volume-bib-specific-title-first`. */
function sourceMonographicIdentifierContributorsAndVolumeBibSpecificTitleFirst(r: Referencia): Parte | null {
  return juntar([
    organizadoPor(r, false), // `source-monographic-identifier-contributors-bib`
    juntar([labelVolume(r)], ', '), // `source-monographic-identifier-volume-bib-specific-title-first`
    tem(r, 'volume') || tem(r, 'page') ? null : labelNumberOfVolumes(r),
  ], ', ')
}

/** `source-series-bib` → `source-series-title`: «Série 12», «Série, IV», «Série, vol. 5, no. 2». */
function sourceSeriesBib(r: Referencia): Parte | null {
  const serie = variavel(r, 'collection-title')
  let partes: (Parte | null)[] = []
  if (tem(r, 'issue')) partes = [serie, labelCollectionNumber(r), labelIssue(r)]
  else if (numerico(r, 'collection-number') && tem(r, 'collection-title')) {
    partes = [juntar([serie, variavel(r, 'collection-number')], ' ')]
  } else if (tem(r, 'collection-title')) partes = [serie, variavel(r, 'collection-number')]
  return juntar(partes, ', ')
}

/** `label-collection-number`. */
function labelCollectionNumber(r: Referencia): Parte | null {
  const n = variavel(r, 'collection-number')
  if (n === null) return null
  return juntar([numerico(r, 'collection-number') ? termo(TERMOS.serie, false) : null, n], ' ')
}

/** `label-issue`: «no. 2» («nos. 1-2»). */
function labelIssue(r: Referencia): Parte | null {
  const n = variavel(r, 'issue')
  if (n === null) return null
  return juntar([termo(TERMOS.numero, plural(r, 'issue')), n], ' ')
}

/** `source-serial-bib`: «Revista 7 (2): 12–34», «Revista, Série, vol. 3: 1–5», «Revista, 5–9». */
function sourceSerialBib(r: Referencia, html: boolean): Parte | null {
  const partes = [sourceSerialTitleBib(r, html), sourceSerialIdentifierBib(r, html)]
  if (tem(r, 'collection-title') && tem(r, 'volume')) return juntar(partes, ', ')
  if (tem(r, 'volume')) return juntar(partes, ' ')
  return juntar(partes, ', ')
}

/** `source-serial-title-bib` → `source-serial-name`: a revista em itálico e «(lugar)». */
function sourceSerialTitleBib(r: Referencia, html: boolean): Parte | null {
  const revista = variavel(r, 'container-title')
  return juntar([revista && italico(revista, html), envolver(variavel(r, 'publisher-place'), '(', ')')], ' ')
}

/** `source-serial-identifier-bib`. */
function sourceSerialIdentifierBib(r: Referencia, html: boolean): Parte | null {
  const partes = [sourceSerialIdentifierVolumeAuthorDate(r), sourceSerialLocator(r, html)]
  return tem(r, 'issue') || tem(r, 'volume') ? juntar(partes, ': ') : juntar(partes, ', ')
}

/** `source-serial-identifier-volume-author-date`. */
function sourceSerialIdentifierVolumeAuthorDate(r: Referencia): Parte | null {
  const serie = variavel(r, 'collection-title')
  if (!(tem(r, 'issue') || tem(r, 'volume'))) {
    // `source-serial-volume-status-bib`
    return juntar([serie, juntar([sourceDateSpecificTitleFirst(r)], ' ')], ', ')
  }
  let volume: Parte | null = null
  if (tem(r, 'volume')) {
    const v = tem(r, 'collection-title') ? labelVolume(r) : variavel(r, 'volume')
    const entre = tem(r, 'issue') ? variavel(r, 'issue') : sourceDateSpecificTitleFirst(r)
    volume = juntar([v, envolver(juntar([entre], ', '), '(', ')')], ' ')
  } else {
    const comNomes = tem(r, 'author') || tem(r, 'editor')
    volume = juntar([juntar([labelIssue(r)], ', '), comNomes ? envolver(sourceDateSpecificTitleFirst(r), '(', ')') : null], ' ')
  }
  return juntar([serie, volume], ', ')
}

/** `source-serial-locator`: as páginas. */
function sourceSerialLocator(r: Referencia, html: boolean): Parte | null {
  const p = texto(r, 'page')
  if (p === null) return null
  const t = paginas(p.s, html)
  return t.s ? t : null
}

/**
 * `source-date-specific-title-first`: nos artigos e no `document`, o mês e o dia da data (o literal inteiro); nos
 * livros e capítulos, nada.
 */
function sourceDateSpecificTitleFirst(r: Referencia): Parte | null {
  if (serial(r)) return dateIssuedMonthDay(r, !(tem(r, 'issue') || tem(r, 'volume')))
  if (eTipo(r, 'document')) return dateIssuedMonthDay(r, true)
  return null
}

/** `source-monographic-publication-bib` → `source-publication-and-date-bib`: editora ou lugar, e a data do `document`. */
function sourceMonographicPublicationBib(r: Referencia): Parte | null {
  if (serial(r)) return null
  return juntar([sourcePublicationPublisherBib(r), juntar([sourceDateSpecificTitleFirst(r)], ' ')], ', ')
}

/** `source-publication-publisher-bib`: a editora, se há; senão o lugar. */
function sourcePublicationPublisherBib(r: Referencia): Parte | null {
  const t = tem(r, 'publisher') ? texto(r, 'publisher') : texto(r, 'publisher-place')
  return t && capitalizar(t)
}
