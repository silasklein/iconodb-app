/**
 * «Colar do Zotero» (Parte 2C, bloco 3, Tarefa 9): lê o que o Zotero copia, CSL JSON ou BibTeX, para os campos do
 * formulário «Nova obra». Puro: sem React, sem banco.
 *
 * CONTRATO. `lerDoZotero(texto)` devolve `{ csl, formato, faltou }` e NUNCA lança, seja qual for o texto (foco 1):
 * - `formato`: 'csl-json', 'bibtex', ou null quando o texto não é nenhum dos dois (então `csl` é `{}`);
 * - `csl`: SÓ os campos do formulário (`CAMPOS_DO_FORMULARIO`), todos dentro de `CAMPOS_DO_CHICAGO`. Um campo que não
 *   veio, ou que não foi lido, não aparece (nunca `author: []`, nunca texto vazio);
 * - `faltou`: o que o formulário deve dizer à pessoa, em frases curtas (o que não foi lido, o que ficou de fora, o tipo
 *   que foi trocado). Nada é adivinhado: o que não é lido com certeza fica de fora e entra aqui.
 *
 * AS REGRAS.
 * - CSL JSON: um objeto, ou uma lista (lê o primeiro e diz quantos ignorou). Um JSON que não é CSL (sem `type` de CSL,
 *   ou sem título, nomes nem data) dá null.
 * - BibTeX: a primeira entrada (`@comment`, `@preamble` e `@string` não contam; os `@string` valem nos valores). Converte
 *   os acentos do LaTeX (`{\'e}`, `\"o`, `\c{c}`…), os símbolos (`\ss`, `\o`…) e o grego (`$\alpha$`), desfaz as
 *   chaves e separa os nomes por ` and `. Um comando que não conhece fica visível (`\foo{x}`) e é nomeado em `faltou`.
 *   O `--` das páginas vira «–», como no resto do texto.
 * - O tipo vai para um dos quatro do Chicago do app (`TIPOS_DO_CHICAGO`). Os outros tipos do Zotero são levados a eles
 *   (`thesis` → `book`…) com o aviso «tipo <original> tratado como <novo>». Um tipo sem mapa (`webpage`) fica de fora
 *   (`csl.type` ausente) com um aviso, e o formulário pede a escolha.
 * - O ano: só o ano (um inteiro de 1 a 9999), também em texto (`[["2000"]]`, revisão da Tarefa 8, R2). Mês e dia
 *   ficam de fora; de um intervalo, fica o primeiro ano, com aviso.
 * - Os nomes: `family`/`given` ou `literal`. As partículas entram no sobrenome («van der Probe») ou no nome, como o
 *   formulário as mostra («Sobrenome, Nome»); o sufixo («Jr.») fica de fora, com aviso. «others» e «et al.» não são
 *   nomes: saem, com aviso (o formulário não tem o `et-al` do CSL).
 * - DOI, URL, mês, `language`, edição, número e os outros campos do Zotero ficam de fora (revisão da Tarefa 2, M2): o
 *   formulário não os mostra e eles mudariam o Chicago. O aviso «fora do formulário: …» os nomeia.
 */
import { TIPOS_DO_CHICAGO, type TipoDoChicago } from './chicago'
import type { Csl } from './modelo'
import type { Json } from '../usuario/eventos'

/** Os campos do formulário «Nova obra», na ordem dele. São os únicos que `lerDoZotero` devolve. */
export const CAMPOS_DO_FORMULARIO = ['type', 'author', 'editor', 'issued', 'title', 'container-title', 'volume', 'page',
  'publisher-place', 'publisher', 'collection-title'] as const

export type FormatoDoZotero = 'csl-json' | 'bibtex'

export interface LidoDoZotero {
  csl: Partial<Csl>
  formato: FormatoDoZotero | null
  faltou: string[]
}

/** Os avisos fixos de `faltou`. */
export const NAO_RECONHECIDO = 'o texto não é CSL JSON nem BibTeX'
export const SEM_TIPO = 'sem tipo: escolha o tipo'
export const SEM_TITULO = 'sem título'

/** Os tipos do Zotero (CSL) que o Chicago do app não formata, levados a um dos quatro (revisão da Tarefa 8, R1). */
export const TIPOS_MAPEADOS: Readonly<Record<string, TipoDoChicago>> = {
  thesis: 'book',
  report: 'book',
  manuscript: 'book',
  'paper-conference': 'chapter',
  'entry-encyclopedia': 'chapter',
  'article-magazine': 'article-journal',
  'article-newspaper': 'article-journal',
}

/** Os tipos do CSL 1.0.2: um JSON com outro `type` não é CSL. */
const TIPOS_CSL = new Set(['article', 'article-journal', 'article-magazine', 'article-newspaper', 'bill', 'book',
  'broadcast', 'chapter', 'classic', 'collection', 'dataset', 'document', 'entry', 'entry-dictionary',
  'entry-encyclopedia', 'event', 'figure', 'graphic', 'hearing', 'interview', 'legal_case', 'legislation', 'manuscript',
  'map', 'motion_picture', 'musical_score', 'pamphlet', 'paper-conference', 'patent', 'performance', 'periodical',
  'personal_communication', 'post', 'post-weblog', 'regulation', 'report', 'review', 'review-book', 'software', 'song',
  'speech', 'standard', 'thesis', 'treaty', 'webpage'])

/**
 * Os tipos do BibTeX (e do biblatex) que o Zotero exporta, no tipo do CSL. `@misc` é o que o Zotero usa para
 * `document` e para muitos outros, por isso entra com aviso.
 */
const TIPOS_BIBTEX: Readonly<Record<string, string>> = {
  book: 'book',
  collection: 'book',
  article: 'article-journal',
  incollection: 'chapter',
  inbook: 'chapter',
  inproceedings: 'paper-conference',
  conference: 'paper-conference',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  thesis: 'thesis',
  techreport: 'report',
  report: 'report',
  unpublished: 'manuscript',
  misc: 'document',
}
/** Os tipos do BibTeX que correspondem ao tipo do CSL sem aviso. */
const BIBTEX_SEM_AVISO = new Set(['book', 'collection', 'article', 'incollection', 'inbook'])

type Obj = { [campo: string]: unknown }
const eObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)

const nada = (faltou: string[] = [NAO_RECONHECIDO]): LidoDoZotero => ({ csl: {}, formato: null, faltou })

/** Lê o texto colado. Nunca lança. */
export function lerDoZotero(texto: string): LidoDoZotero {
  try {
    if (typeof texto !== 'string') return nada()
    const t = texto.replace(/^\uFEFF/, '').trim()
    if (!t) return nada()
    if (t[0] === '{' || t[0] === '[') {
      let json: unknown
      let eJson = true
      try {
        json = JSON.parse(t)
      } catch {
        eJson = false
      }
      if (eJson) return doJson(json)
    }
    return doBibtex(t)
  } catch {
    return nada()
  }
}

// ---- A montagem comum: um item com os nomes do CSL → os campos do formulário ---------------------------------------

interface Montagem {
  /** O item com as chaves do CSL. */
  item: Obj
  /** Como o tipo veio escrito na fonte («thesis», «@phdthesis»), para o aviso. */
  tipoOriginal: string | null
  /** Os campos da fonte que o formulário não tem, com valor. */
  foraDoFormulario: string[]
  /** Avisos que a leitura da fonte já deu (nomes, ano, lista). */
  avisos: string[]
}

const TEXTOS = ['title', 'container-title', 'volume', 'page', 'publisher-place', 'publisher', 'collection-title'] as const

function montar({ item, tipoOriginal, foraDoFormulario, avisos }: Montagem): { csl: Partial<Csl>; faltou: string[] } {
  const csl: { [campo: string]: Json } = {}
  const faltou: string[] = []
  const ignorados = [...foraDoFormulario]

  // O tipo.
  const tipo = item.type
  if (typeof tipo === 'string' && tipo.trim()) {
    const original = tipoOriginal ?? tipo
    if ((TIPOS_DO_CHICAGO as readonly string[]).includes(tipo)) {
      csl.type = tipo
      if (original !== tipo) faltou.push(`tipo ${original} tratado como ${tipo}`)
    } else if (Object.hasOwn(TIPOS_MAPEADOS, tipo)) {
      const novo = TIPOS_MAPEADOS[tipo]!
      csl.type = novo
      faltou.push(`tipo ${original} tratado como ${novo}`)
    } else {
      faltou.push(`tipo ${original} sem equivalente: escolha o tipo`)
    }
  } else if (tipoOriginal) {
    faltou.push(`tipo ${tipoOriginal} sem equivalente: escolha o tipo`)
  } else {
    faltou.push(SEM_TIPO)
  }

  for (const campo of ['author', 'editor'] as const) {
    if (!Object.hasOwn(item, campo)) continue
    const nomes = lerNomes(item[campo], campo === 'author' ? 'autores' : 'organizadores', faltou)
    if (nomes.length) csl[campo] = nomes
  }

  if (Object.hasOwn(item, 'issued')) {
    const ano = lerData(item.issued, faltou)
    if (ano !== null) csl.issued = { 'date-parts': [[ano]] }
  }

  for (const campo of TEXTOS) {
    if (!Object.hasOwn(item, campo)) continue
    const v = item[campo]
    if (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) {
      const s = String(v).replace(/\s+/g, ' ').trim()
      if (s) csl[campo] = s
    } else if (v !== null && v !== undefined) {
      faltou.push(`${ROTULOS[campo]} não lido`)
    }
  }
  if (!Object.hasOwn(csl, 'title')) faltou.push(SEM_TITULO)

  for (const [campo, v] of Object.entries(item)) {
    if (campo === 'id' || campo === 'type' || (CAMPOS_DO_FORMULARIO as readonly string[]).includes(campo)) continue
    if (temValor(v)) ignorados.push(campo)
  }
  if (ignorados.length) faltou.push(`fora do formulário: ${ignorados.join(', ')}`)

  // Ordem dos campos: a do formulário.
  const ordenado: { [campo: string]: Json } = {}
  for (const campo of CAMPOS_DO_FORMULARIO) if (Object.hasOwn(csl, campo)) ordenado[campo] = csl[campo]!
  return { csl: ordenado as Partial<Csl>, faltou: [...avisos, ...faltou] }
}

const ROTULOS: Record<(typeof TEXTOS)[number], string> = {
  title: 'título',
  'container-title': 'revista ou livro',
  volume: 'volume',
  page: 'páginas',
  'publisher-place': 'lugar',
  publisher: 'editora',
  'collection-title': 'série',
}

function temValor(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  if (eObj(v)) return Object.keys(v).length > 0
  return true
}

/** Um texto limpo, ou '' se não é texto. */
const limpo = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** Os nomes de um CSL: `family`/`given` (com as partículas juntadas) ou `literal`. */
function lerNomes(v: unknown, rotulo: string, faltou: string[]): Json[] {
  if (!Array.isArray(v)) {
    if (temValor(v)) faltou.push(`${rotulo} não lidos`)
    return []
  }
  const nomes: Json[] = []
  let naoLidos = 0
  let etAl = false
  for (const n of v) {
    if (!eObj(n)) {
      naoLidos++
      continue
    }
    const literal = limpo(n.literal)
    const family = [limpo(n['non-dropping-particle']), limpo(n.family)].filter(Boolean).join(' ')
    const given = [limpo(n.given), limpo(n['dropping-particle'])].filter(Boolean).join(' ')
    if (eEtAl(literal || (given ? '' : family))) {
      if (!etAl) faltou.push(avisoEtAl(rotulo))
      etAl = true
      continue
    }
    if (literal) {
      nomes.push({ literal })
      continue
    }
    const sufixo = limpo(n.suffix)
    if (sufixo) faltou.push(`sufixo de nome deixado de fora: ${sufixo}`)
    if (!family && !given) {
      naoLidos++
      continue
    }
    const nome: { [campo: string]: Json } = {}
    if (family) nome.family = family
    if (given) nome.given = given
    nomes.push(nome)
  }
  if (naoLidos) faltou.push(naoLidos === 1 ? `1 nome não lido em ${rotulo}` : `${naoLidos} nomes não lidos em ${rotulo}`)
  return nomes
}

/** Um ano: um inteiro de 1 a 9999, como número ou como texto («2000», « 2000 »). */
function lerAno(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 1 && v <= 9999 ? v : null
  if (typeof v === 'string' && /^\s*\+?\d{1,4}\s*$/.test(v)) {
    const n = Number.parseInt(v.trim().replace(/^\+/, ''), 10)
    return n >= 1 ? n : null
  }
  return null
}

/** O ano de `issued`: `date-parts`, ou um `literal`/`raw` que é só um ano. */
function lerData(v: unknown, faltou: string[]): number | null {
  if (!temValor(v)) return null
  if (eObj(v)) {
    const partes = v['date-parts']
    if (Array.isArray(partes) && partes.length) {
      const primeira = partes[0]
      const ano = Array.isArray(primeira) ? lerAno(primeira[0]) : null
      if (ano !== null) {
        const segunda = partes[1]
        const fim = Array.isArray(segunda) ? lerAno(segunda[0]) : null
        if (fim !== null && fim !== ano) faltou.push(`só o primeiro ano do intervalo foi lido: ${ano}–${fim}`)
        return ano
      }
    }
    for (const chave of ['literal', 'raw']) {
      const ano = lerAno(v[chave])
      if (ano !== null) return ano
    }
    const primeiro = Array.isArray(partes) && Array.isArray(partes[0]) ? partes[0][0] : undefined
    const mostra = limpo(v.literal) || limpo(v.raw) || (typeof primeiro === 'number' ? String(primeiro) : limpo(primeiro))
    faltou.push(mostra ? `ano não lido: ${mostra}` : 'ano não lido')
    return null
  }
  const ano = lerAno(v)
  if (ano === null) faltou.push(`ano não lido: ${typeof v === 'string' ? limpo(v) : JSON.stringify(v)}`)
  return ano
}

/** O aviso da lista ou das várias entradas: só a primeira obra é lida. */
const obrasIgnoradas = (resto: number) =>
  resto === 1 ? '1 obra ignorada: só a primeira foi lida' : `${resto} obras ignoradas: só a primeira foi lida`

function resultado(m: Montagem, formato: FormatoDoZotero): LidoDoZotero {
  const { csl, faltou } = montar(m)
  return { csl, formato, faltou }
}

// ---- CSL JSON -------------------------------------------------------------------------------------------------------

/** Um objeto CSL: `type` de CSL e ao menos um título, nome ou data. */
function eItemCsl(x: unknown): x is Obj {
  return eObj(x) && typeof x.type === 'string' && TIPOS_CSL.has(x.type) &&
    ['title', 'author', 'editor', 'issued', 'container-title'].some((c) => temValor(x[c]))
}

function doJson(json: unknown): LidoDoZotero {
  const avisos: string[] = []
  let item: unknown = json
  if (Array.isArray(json)) {
    item = json[0]
    const resto = json.length - 1
    if (resto > 0) avisos.push(obrasIgnoradas(resto))
  }
  if (!eItemCsl(item)) return nada()
  return resultado({ item, tipoOriginal: null, foraDoFormulario: [], avisos }, 'csl-json')
}

// ---- BibTeX ---------------------------------------------------------------------------------------------------------

interface Entrada {
  tipo: string
  campos: Map<string, string>
}

/** Pula os espaços a partir de `i`. */
function pularEspacos(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i]!)) i++
  return i
}

/** O fim (exclusivo) do grupo que abre em `s[i]` ('{' ou '('), contando só esse par; -1 sem fecho. */
function fimDoGrupo(s: string, i: number, abre: string, fecha: string): number {
  let nivel = 0
  for (let j = i; j < s.length; j++) {
    const c = s[j]
    if (c === abre) nivel++
    else if (c === fecha) {
      nivel--
      if (nivel === 0) return j + 1
    }
  }
  return -1
}

/**
 * Lê os campos `nome = valor` de `s` a partir de `i` até `fecha` (fora das chaves). Um valor é `{…}` (com chaves
 * dentro), `"…"`, um número ou um nome de `@string`, e as partes se juntam com `#`. Para no primeiro erro, com o que já
 * leu. Devolve o fim.
 */
function lerCampos(
  s: string, i: number, fecha: string, strings: Map<string, string>, campos: Map<string, string>,
): number {
  for (;;) {
    i = pularEspacos(s, i)
    while (s[i] === ',') i = pularEspacos(s, i + 1)
    if (i >= s.length) return i
    if (s[i] === fecha) return i + 1
    const nome = /^[^\s=,{}()"#]+/.exec(s.slice(i, i + 200))
    if (!nome) return i
    i = pularEspacos(s, i + nome[0].length)
    if (s[i] !== '=') return i
    i++
    let valor = ''
    for (;;) {
      i = pularEspacos(s, i)
      const c = s[i]
      if (c === '{') {
        const fim = fimDoGrupo(s, i, '{', '}')
        if (fim < 0) {
          valor += s.slice(i + 1)
          campos.set(nome[0].toLowerCase(), valor)
          return s.length
        }
        valor += s.slice(i + 1, fim - 1)
        i = fim
      } else if (c === '"') {
        let j = i + 1
        let nivel = 0
        while (j < s.length && !(s[j] === '"' && nivel === 0)) {
          if (s[j] === '{') nivel++
          else if (s[j] === '}') nivel--
          j++
        }
        valor += s.slice(i + 1, j)
        i = j + 1
      } else {
        const palavra = /^[^\s,#{}()"=]+/.exec(s.slice(i, i + 200))
        if (!palavra) break
        valor += strings.get(palavra[0].toLowerCase()) ?? palavra[0]
        i += palavra[0].length
      }
      i = pularEspacos(s, i)
      if (s[i] !== '#') break
      i++
    }
    campos.set(nome[0].toLowerCase(), valor)
  }
}

/** As entradas do texto, com os `@string` aplicados. Ignora `@comment` e `@preamble`. */
function entradasBibtex(s: string): Entrada[] {
  const entradas: Entrada[] = []
  const strings = new Map<string, string>()
  const re = /@\s*([A-Za-z]+)\s*([{(])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    const tipo = m[1]!.toLowerCase()
    const abre = m[2]!
    const fecha = abre === '{' ? '}' : ')'
    const inicio = m.index + m[0].length - 1
    if (tipo === 'comment' || tipo === 'preamble') {
      const fim = fimDoGrupo(s, inicio, abre, fecha)
      if (fim < 0) break
      re.lastIndex = fim
      continue
    }
    if (tipo === 'string') {
      const campos = new Map<string, string>()
      re.lastIndex = Math.max(lerCampos(s, inicio + 1, fecha, strings, campos), inicio + 1)
      for (const [k, v] of campos) strings.set(k, v)
      continue
    }
    // A chave da entrada vai até a primeira vírgula; sem vírgula, a entrada não tem campos.
    let i = pularEspacos(s, inicio + 1)
    const chave = /^[^,\s{}()]*/.exec(s.slice(i, i + 500))
    i = pularEspacos(s, i + (chave?.[0].length ?? 0))
    const campos = new Map<string, string>()
    if (s[i] === ',') i = lerCampos(s, i + 1, fecha, strings, campos)
    if (campos.size) entradas.push({ tipo, campos })
    // Depois da entrada: do fecho dela, para que um «@» num campo não conte como outra entrada. Uma entrada com `{` que
    // não fecha engole o resto do texto, como no BibTeX; continuar dali faria a leitura quadrática num lixo grande.
    if (abre === '{') {
      const fim = fimDoGrupo(s, inicio, '{', '}')
      if (fim < 0) break
      re.lastIndex = Math.max(i, fim)
    } else re.lastIndex = Math.max(i, inicio + 1)
  }
  return entradas
}

function doBibtex(t: string): LidoDoZotero {
  if (!t.includes('@')) return nada()
  const entradas = entradasBibtex(t)
  const entrada = entradas[0]
  if (!entrada) return nada()
  const avisos: string[] = []
  const resto = entradas.length - 1
  if (resto > 0) avisos.push(obrasIgnoradas(resto))

  const tipoCsl = Object.hasOwn(TIPOS_BIBTEX, entrada.tipo) ? TIPOS_BIBTEX[entrada.tipo] : undefined
  const item: Obj = {}
  const fora: string[] = []
  if (tipoCsl) item.type = tipoCsl
  const tipoOriginal = tipoCsl && BIBTEX_SEM_AVISO.has(entrada.tipo) ? null : `@${entrada.tipo}`
  const tipoFinal = tipoCsl && Object.hasOwn(TIPOS_MAPEADOS, tipoCsl) ? TIPOS_MAPEADOS[tipoCsl] : tipoCsl

  /** Os comandos LaTeX que ficaram como estavam, para o aviso. */
  const comandos = new Set<string>()
  const tex = (v: string) => latex(v, comandos)
  const usados = new Set<string>()
  const pegar = (...nomes: string[]): string | undefined => {
    for (const n of nomes) {
      const v = entrada.campos.get(n)
      if (v !== undefined && v.trim()) {
        usados.add(n)
        return v
      }
    }
    return undefined
  }

  for (const [campo, rotulo] of [['author', 'autores'], ['editor', 'organizadores']] as const) {
    const v = pegar(campo)
    if (v !== undefined) {
      const { nomes, avisos: a } = nomesBibtex(v, rotulo, comandos)
      item[campo] = nomes
      avisos.push(...a)
    }
  }

  const ano = pegar('year')
  const data = ano === undefined ? pegar('date') : undefined
  if (ano !== undefined) item.issued = { 'date-parts': [[tex(ano)]] }
  else if (data !== undefined) {
    // O `date` do biblatex: «2004-05-01», ou um intervalo «2000/2001» (as duas pontas, para o aviso de `lerData`).
    const d = tex(data)
    const anos = d.split('/').map((p) => /^(\d{1,4})(?:-|$)/.exec(p.trim())?.[1])
    item.issued = anos[0] ? { 'date-parts': anos[1] ? [[anos[0]], [anos[1]]] : [[anos[0]]] } : { literal: d }
  }

  const titulo = pegar('title')
  if (titulo !== undefined) item.title = tex(titulo)
  // «Revista ou livro»: a revista só no artigo, o livro só no capítulo.
  const container = tipoFinal === 'article-journal' ? pegar('journal', 'journaltitle')
    : tipoFinal === 'chapter' ? pegar('booktitle') : undefined
  if (container !== undefined) item['container-title'] = tex(container)
  const volume = pegar('volume')
  if (volume !== undefined) item.volume = tex(volume)
  const paginas = pegar('pages')
  if (paginas !== undefined) item.page = tex(paginas)
  const lugar = pegar('address', 'location')
  if (lugar !== undefined) item['publisher-place'] = tex(lugar)
  const editora = pegar('publisher', 'school', 'institution')
  if (editora !== undefined) item.publisher = tex(editora)
  const serie = pegar('series')
  if (serie !== undefined) item['collection-title'] = tex(serie)

  for (const [campo, v] of entrada.campos) if (!usados.has(campo) && v.trim()) fora.push(campo)
  if (comandos.size) {
    const lista = [...comandos].join(', ')
    avisos.push(comandos.size === 1 ? `comando LaTeX não convertido: ${lista}` : `comandos LaTeX não convertidos: ${lista}`)
  }

  return resultado({ item, tipoOriginal, foraDoFormulario: fora, avisos }, 'bibtex')
}

/** Divide `s` nos separadores que `eSeparador` acha (devolve o comprimento, ou 0), só fora das chaves. */
function dividirFora(s: string, eSeparador: (s: string, i: number) => number): string[] {
  const partes: string[] = []
  let nivel = 0
  let inicio = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '{') nivel++
    else if (c === '}') nivel = Math.max(0, nivel - 1)
    else if (nivel === 0) {
      const n = eSeparador(s, i)
      if (n > 0) {
        partes.push(s.slice(inicio, i))
        inicio = i + n
        i += n - 1
      }
    }
  }
  partes.push(s.slice(inicio))
  return partes
}

/** « and », com qualquer espaço em volta e qualquer caixa. */
const separadorAnd = (s: string, i: number): number => {
  const m = /^\s+and\s+/i.exec(s.slice(i, i + 40))
  return m && /\s/.test(s[i]!) ? m[0].length : 0
}
const separadorVirgula = (s: string, i: number): number => (s[i] === ',' ? 1 : 0)
const separadorEspaco = (s: string, i: number): number => {
  const m = /^\s+/.exec(s.slice(i, i + 40))
  return m ? m[0].length : 0
}

/** Um nome do BibTeX: «Sobrenome, Nome», «Sobrenome, Jr., Nome», «Nome von Sobrenome», ou «{Instituição}». */
function nomesBibtex(v: string, rotulo: string, comandos: Set<string>): { nomes: Obj[]; avisos: string[] } {
  const tex = (x: string) => latex(x, comandos)
  const nomes: Obj[] = []
  const avisos: string[] = []
  for (const bruto of dividirFora(v.trim(), separadorAnd)) {
    const n = bruto.trim()
    if (!n) continue
    if (eEtAl(tex(n))) {
      if (!avisos.includes(avisoEtAl(rotulo))) avisos.push(avisoEtAl(rotulo))
      continue
    }
    if (n.startsWith('{') && fimDoGrupo(n, 0, '{', '}') === n.length) {
      const literal = tex(n)
      if (literal) nomes.push({ literal })
      continue
    }
    const partes = dividirFora(n, separadorVirgula).map((p) => p.trim())
    let family: string
    let given: string
    if (partes.length === 1) {
      const palavras = dividirFora(n, separadorEspaco).filter(Boolean)
      const ultima = palavras.length - 1
      // O «von»: as palavras em minúscula antes da última vão para o sobrenome, com o que vem depois delas.
      let von = palavras.findIndex((p, i) => i < ultima && eMinuscula(p))
      if (von < 0) von = ultima
      given = palavras.slice(0, von).join(' ')
      family = palavras.slice(von).join(' ')
    } else {
      family = partes[0]!
      given = partes.length >= 3 ? partes.slice(2).join(', ') : partes[1]!
      if (partes.length >= 3 && partes[1]) avisos.push(`sufixo de nome deixado de fora: ${tex(partes[1])}`)
    }
    nomes.push({ family: tex(family), given: tex(given) })
  }
  return { nomes, avisos }
}

/** «others» ou «et al.» no lugar de um nome: não é um nome. O formulário não tem o «et al.» do CSL, e ele fica de fora. */
// Entre «et» e «al» vem um ponto, um espaço ou o til (já espaço): «Etal» sozinho é um sobrenome.
const eEtAl = (nome: string) => /^(others|et(\. ?| )al\.?)$/i.test(nome.replace(/\s+/g, ' ').trim())
const avisoEtAl = (rotulo: string) => `«et al.» deixado de fora em ${rotulo}`

/** A palavra começa com minúscula (a regra do «von» do BibTeX). Uma palavra que abre com chave não conta. */
function eMinuscula(p: string): boolean {
  if (p.startsWith('{')) return false
  const c = latex(p)[0]
  return c !== undefined && c !== c.toUpperCase() && c === c.toLowerCase()
}

// ---- LaTeX → texto --------------------------------------------------------------------------------------------------

/** Os acentos do LaTeX, como marcas combinantes (o NFC as junta à letra). */
const ACENTOS: Readonly<Record<string, string>> = {
  "'": '\u0301', '`': '\u0300', '^': '\u0302', '"': '\u0308', '~': '\u0303', '=': '\u0304', '.': '\u0307',
  u: '\u0306', v: '\u030C', H: '\u030B', c: '\u0327', k: '\u0328', r: '\u030A', d: '\u0323', b: '\u0331',
}

const SIMBOLOS: Readonly<Record<string, string>> = {
  ss: 'ß', o: 'ø', O: 'Ø', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł', i: 'ı', j: 'ȷ',
  dh: 'ð', DH: 'Ð', th: 'þ', TH: 'Þ', textendash: '–', textemdash: '—', textquoteleft: '‘', textquoteright: '’',
  textquotedblleft: '“', textquotedblright: '”', S: '§', P: '¶', copyright: '©', textregistered: '®',
  dots: '…', ldots: '…', textellipsis: '…', guillemotleft: '«', guillemotright: '»', textasciitilde: '~',
  textbackslash: '\\', textunderscore: '_', textbar: '|',
}

/** As letras gregas do modo matemático (`$\alpha$`), que o Zotero escreve como comandos. */
const GREGO: Readonly<Record<string, string>> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
  vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', varpi: 'ϖ',
  rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ',
  omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ',
  Psi: 'Ψ', Omega: 'Ω',
}

/** Os comandos de formatação: o nome some e o argumento fica (`\textit{X}` → «X»). */
const FORMATACAO = new Set(['textit', 'emph', 'textbf', 'textsc', 'textup', 'textrm', 'textsf', 'texttt', 'textnormal',
  'textsl', 'textmd', 'mbox', 'url', 'mkbibquote', 'mkbibemph', 'textsuperscript', 'textsubscript', 'ensuremath',
  'enquote', 'nolinkurl', 'it', 'bf', 'sc', 'em', 'rm', 'sf', 'tt', 'sl', 'relax'])

/** Os comandos cujo argumento é só para ordenar, e some com eles (`{\noopsort{a}}`). */
const SEM_ARGUMENTO_VISIVEL = new Set(['noopsort', 'noop', 'sortnoop', 'nocite'])

/**
 * O texto de um valor do BibTeX: os acentos, os símbolos e as letras gregas do LaTeX viram letras, as chaves e o `$` da
 * matemática somem, `~` vira espaço, `--` e `---` viram traços, e os comandos de formatação (`\textit{…}`, `\emph{…}`)
 * deixam só o texto. Um comando que este leitor não conhece fica VISÍVEL (`\foo{x}`), e o nome dele entra em
 * `naoConvertidos`, para o aviso. Sem recursão: um texto qualquer não estoura a pilha.
 */
export function latex(s: string, naoConvertidos?: Set<string>): string {
  let saida = ''
  /** A marca de acento à espera da primeira letra que vier (`\'{e}`, `\' e`). */
  let acento: string | null = null
  /** O nível de chaves do grupo aberto logo depois do acento (`\'{}`), ou -1. */
  let grupoDoAcento = -1
  let nivel = 0
  /** Os níveis das chaves que ficam visíveis: as do argumento de um comando desconhecido. */
  const chavesVisiveis: number[] = []
  let manterProximaChave = false
  const poe = (txt: string) => {
    if (!txt) return
    if (acento !== null) {
      // `\i` e `\j` sob acento são o i e o j de sempre.
      const base = txt[0] === 'ı' ? 'i' : txt[0] === 'ȷ' ? 'j' : txt[0]!
      saida += base + acento + txt.slice(1)
      acento = null
      grupoDoAcento = -1
    } else saida += txt
  }
  let i = 0
  while (i < s.length) {
    const c = s[i]!
    if (c !== '{') manterProximaChave = false
    if (c === '\\') {
      const prox = s[i + 1]
      if (prox === undefined) {
        i++
        continue
      }
      if (/[A-Za-z]/.test(prox)) {
        const nome = /^[A-Za-z]+/.exec(s.slice(i + 1, i + 41))![0]
        i += 1 + nome.length
        const antes = i
        // O TeX engole os espaços depois de um comando com letras.
        while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++
        if (Object.hasOwn(ACENTOS, nome) && nome.length === 1) {
          acento = ACENTOS[nome]!
          grupoDoAcento = -1
        } else if (Object.hasOwn(SIMBOLOS, nome)) poe(SIMBOLOS[nome]!)
        else if (Object.hasOwn(GREGO, nome)) poe(GREGO[nome]!)
        else if (FORMATACAO.has(nome)) {
          // Só o nome some; o argumento vem a seguir.
        } else if (SEM_ARGUMENTO_VISIVEL.has(nome)) {
          if (s[i] === '{') {
            const fim = fimDoGrupo(s, i, '{', '}')
            i = fim < 0 ? s.length : fim
          }
        } else {
          // Desconhecido: fica como está, com as chaves do argumento, e entra no aviso.
          poe(`\\${nome}`)
          naoConvertidos?.add(`\\${nome}`)
          if (s[i] === '{') manterProximaChave = true
          else if (i > antes) poe(' ')
        }
        continue
      }
      i += 2
      if (Object.hasOwn(ACENTOS, prox) && !/[A-Za-z]/.test(prox)) {
        acento = ACENTOS[prox]!
        grupoDoAcento = -1
        while (i < s.length && s[i] === ' ') i++
      } else if ('&%$#_{}'.includes(prox)) poe(prox)
      else if (prox === '\\' || prox === ' ' || prox === ',' || prox === ';') poe(' ')
      // `\-` (hifenização) e o resto: nada.
      continue
    }
    if (c === '{') {
      if (acento !== null && grupoDoAcento < 0) grupoDoAcento = nivel + 1
      nivel++
      if (manterProximaChave) {
        chavesVisiveis.push(nivel)
        manterProximaChave = false
        saida += '{'
      }
      i++
      continue
    }
    if (c === '}') {
      // O acento sobre um grupo vazio (`\'{}x`) cai sobre o vazio, e não sobre a letra seguinte.
      if (acento !== null && grupoDoAcento === nivel) {
        acento = null
        grupoDoAcento = -1
      }
      if (chavesVisiveis.length && chavesVisiveis[chavesVisiveis.length - 1] === nivel) {
        chavesVisiveis.pop()
        saida += '}'
      }
      if (nivel > 0) nivel--
      i++
      continue
    }
    // O `$` da matemática some (o `\$` escapado já foi tratado acima). Um `$` solto, sem `\`, também some («$5» → «5»):
    // o BibTeX bem formado escreve `\$`, e o Zotero também.
    if (c === '$') {
      i++
      continue
    }
    if (c === '~') {
      poe(' ')
      i++
      continue
    }
    if (c === '-' && s[i + 1] === '-') {
      if (s[i + 2] === '-') {
        poe('—')
        i += 3
      } else {
        poe('–')
        i += 2
      }
      continue
    }
    if ((c === '`' || c === "'") && s[i + 1] === c) {
      poe(c === '`' ? '“' : '”')
      i += 2
      continue
    }
    poe(c)
    i++
  }
  return saida.normalize('NFC').replace(/\s+/g, ' ').trim()
}
