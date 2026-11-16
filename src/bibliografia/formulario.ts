/**
 * O formulário «Nova obra» (Parte 2C, bloco 3, quadro 2), sem React: o estado dos campos, o CSL que ele grava, a citação
 * curta proposta e as obras parecidas.
 *
 * OS CAMPOS. O formulário guarda só os seus próprios campos (M2 da Tarefa 2), os de `CAMPOS_DO_FORMULARIO`
 * (src/bibliografia/colar.ts), nesta ordem: `type`, `author`, `editor`, `issued` (só o ano), `title`, `container-title`,
 * `volume`, `page`, `publisher-place`, `publisher`, `collection-title`. Um campo vazio não sai (nunca `author: []` nem
 * texto vazio: o Chicago do processamento dá «Edited by None» com `editor: []`).
 *
 * O TIPO. Livro (`book`), artigo (`article-journal`), capítulo (`chapter`) e volume organizado, que é um `book` com os
 * organizadores (`editor`) no lugar dos autores. O `document` (o `@misc` do Zotero) só aparece quando veio colado ou
 * gravado: não é um dos quatro do quadro, mas o Chicago o formata e o formulário não o troca sozinho.
 *
 * O QUE APARECE. Cada tipo mostra os campos que lhe cabem (o artigo, a revista e o volume; o capítulo, o livro e os
 * organizadores dele…). Um campo com valor aparece SEMPRE, seja qual for o tipo, e o que aparece é o que se grava: nada
 * fica escondido no formulário e nada escondido vai para a obra.
 *
 * OS NOMES. Um por linha, «Sobrenome, Nome» (`{family, given}`); uma linha sem vírgula é um nome inteiro (`{literal}`:
 * uma instituição). Uma linha igual ao texto de um nome que já estava na obra (colado ou gravado) devolve esse nome como
 * era, sem perder nada dele.
 */
import { chaveDaCitacao } from './chave'
import { chicago, chicagoHtml, noAlcance } from './chicago'
import { eCslValido, type Csl } from './modelo'
import { dobrar, normalizarForma } from '../glossario/modelo'
import type { Json } from '../usuario/eventos'

/** O tipo escolhido no formulário: os quatro do quadro, e o `document`, que só vem colado ou gravado. */
export type TipoDoFormulario = 'book' | 'article-journal' | 'chapter' | 'volume' | 'document'

export const TIPOS_DO_QUADRO: readonly { tipo: TipoDoFormulario; rotulo: string }[] = [
  { tipo: 'book', rotulo: 'Livro' },
  { tipo: 'article-journal', rotulo: 'Artigo' },
  { tipo: 'chapter', rotulo: 'Capítulo' },
  { tipo: 'volume', rotulo: 'Volume organizado' },
]
export const ROTULO_DO_DOCUMENTO = 'Documento'

export interface FormularioDaObra {
  tipo: TipoDoFormulario | ''
  /** Um nome por linha. */
  autores: string
  organizadores: string
  ano: string
  titulo: string
  /** A revista (artigo) ou o livro (capítulo): `container-title`. */
  fonte: string
  volume: string
  paginas: string
  lugar: string
  editora: string
  serie: string
  curta: string
}

export type CampoDoFormulario = Exclude<keyof FormularioDaObra, 'tipo'>

export const formularioVazio = (): FormularioDaObra => ({
  tipo: '',
  autores: '',
  organizadores: '',
  ano: '',
  titulo: '',
  fonte: '',
  volume: '',
  paginas: '',
  lugar: '',
  editora: '',
  serie: '',
  curta: '',
})

/** Os campos que cada tipo mostra (além dos que têm valor). A citação curta aparece sempre. */
const DO_TIPO: Record<TipoDoFormulario | '', readonly CampoDoFormulario[]> = {
  '': ['autores', 'ano', 'titulo', 'lugar', 'editora'],
  book: ['autores', 'ano', 'titulo', 'lugar', 'editora', 'serie'],
  'article-journal': ['autores', 'ano', 'titulo', 'fonte', 'volume', 'paginas'],
  chapter: ['autores', 'ano', 'titulo', 'fonte', 'organizadores', 'paginas', 'lugar', 'editora', 'serie'],
  volume: ['organizadores', 'ano', 'titulo', 'lugar', 'editora', 'serie'],
  document: ['autores', 'ano', 'titulo', 'lugar', 'editora'],
}

/** A ordem dos campos na tela. */
export const ORDEM_DOS_CAMPOS: readonly CampoDoFormulario[] = ['autores', 'organizadores', 'ano', 'titulo', 'fonte', 'volume', 'paginas', 'lugar', 'editora', 'serie']

/** Os campos que aparecem: os do tipo e todos os que têm valor. */
export function camposVisiveis(f: FormularioDaObra): CampoDoFormulario[] {
  const doTipo = DO_TIPO[f.tipo]
  return ORDEM_DOS_CAMPOS.filter((c) => doTipo.includes(c) || f[c].trim() !== '')
}

/** O rótulo de um campo, que muda com o tipo (a revista do artigo, o livro do capítulo…). */
export function rotuloDoCampo(c: CampoDoFormulario, tipo: TipoDoFormulario | ''): string {
  switch (c) {
    case 'autores':
      return 'Autores'
    case 'organizadores':
      return tipo === 'chapter' ? 'Organizadores do livro' : 'Organizadores'
    case 'ano':
      return 'Ano'
    case 'titulo':
      return tipo === 'chapter' ? 'Título do capítulo' : tipo === 'article-journal' ? 'Título do artigo' : 'Título'
    case 'fonte':
      return tipo === 'article-journal' ? 'Revista' : tipo === 'chapter' ? 'Livro' : 'Revista ou livro'
    case 'volume':
      return 'Volume'
    case 'paginas':
      return 'Páginas'
    case 'lugar':
      return 'Lugar'
    case 'editora':
      return 'Editora'
    case 'serie':
      return 'Série'
    case 'curta':
      return 'Citação curta'
  }
}

// ---- nomes -----------------------------------------------------------------------------------------------------

type Nome = { [campo: string]: Json }
const texto = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const limpo = (s: string) => s.replace(/\s+/g, ' ').trim()

/** O texto de um nome numa linha: «Sobrenome, Nome», o sobrenome só, ou o nome inteiro (`literal`). */
export function textoDoNome(n: unknown): string {
  if (!n || typeof n !== 'object' || Array.isArray(n)) return ''
  const o = n as Nome
  const literal = limpo(texto(o.literal))
  if (literal) return literal
  const family = limpo(texto(o.family))
  const given = limpo(texto(o.given))
  return family && given ? `${family}, ${given}` : family || given
}

export const textoDosNomes = (nomes: unknown): string => (Array.isArray(nomes) ? nomes.map(textoDoNome).filter(Boolean).join('\n') : '')

/** Os nomes de um texto (um por linha). `originais`: os nomes que a obra já tinha, devolvidos como eram quando a linha não mudou. */
export function nomesDoTexto(t: string, originais: unknown = []): Nome[] {
  const antes = new Map<string, Nome>()
  if (Array.isArray(originais)) for (const n of originais) if (textoDoNome(n) && !antes.has(textoDoNome(n))) antes.set(textoDoNome(n), n as Nome)
  const saida: Nome[] = []
  for (const bruta of t.split('\n')) {
    const linha = limpo(bruta)
    if (!linha) continue
    const igual = antes.get(linha)
    if (igual) {
      saida.push(JSON.parse(JSON.stringify(igual)) as Nome)
      continue
    }
    const virgula = linha.indexOf(',')
    if (virgula < 0) {
      saida.push({ literal: linha })
      continue
    }
    const family = limpo(linha.slice(0, virgula))
    const given = limpo(linha.slice(virgula + 1))
    if (!family) saida.push({ literal: given })
    else saida.push(given ? { family, given } : { family })
  }
  return saida
}

/** O sobrenome de um nome (o `family`, ou o nome inteiro). */
const sobrenomeDe = (n: unknown): string => {
  if (!n || typeof n !== 'object' || Array.isArray(n)) return ''
  const o = n as Nome
  return limpo(texto(o.family)) || limpo(texto(o.literal)) || limpo(texto(o.given))
}

// ---- o formulário e o CSL --------------------------------------------------------------------------------------

/** O ano de um CSL como o `_ano_do_csl` do processamento: o primeiro de `date-parts`, ou o `literal`/`raw`. */
export function anoDoCsl(csl: unknown): string | null {
  if (!csl || typeof csl !== 'object') return null
  const d = (csl as Record<string, unknown>).issued
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null
  const partes = (d as Record<string, unknown>)['date-parts']
  if (Array.isArray(partes) && Array.isArray(partes[0]) && partes[0].length > 0) return String(partes[0][0])
  for (const k of ['literal', 'raw']) {
    const v = (d as Record<string, unknown>)[k]
    if (typeof v === 'string' && v.trim() !== '') return v.trim()
  }
  return null
}

/** O formulário de um CSL (colado ou gravado). O que não é campo do formulário fica de fora. */
export function formularioDoCsl(csl: Partial<Csl> | Record<string, unknown>, curta = ''): FormularioDaObra {
  const c = csl as Record<string, unknown>
  const autores = textoDosNomes(c.author)
  const organizadores = textoDosNomes(c.editor)
  const tipoDoCsl = texto(c.type)
  const tipo: TipoDoFormulario | '' =
    tipoDoCsl === 'book'
      ? autores === '' && organizadores !== ''
        ? 'volume'
        : 'book'
      : tipoDoCsl === 'article-journal' || tipoDoCsl === 'chapter' || tipoDoCsl === 'document'
        ? tipoDoCsl
        : ''
  const ano = anoDoCsl(c)
  return {
    tipo,
    autores,
    organizadores,
    ano: ano && /^\d+$/.test(ano) ? ano : '',
    titulo: texto(c.title),
    fonte: texto(c['container-title']),
    volume: texto(c.volume),
    paginas: texto(c.page),
    lugar: texto(c['publisher-place']),
    editora: texto(c.publisher),
    serie: texto(c['collection-title']),
    curta,
  }
}

export const MSG_SEM_TIPO = 'Escolha o tipo da obra.'
export const MSG_SEM_TITULO = 'Dê o título da obra.'
export const MSG_ANO = 'O ano é só o número, como «1993». A letra («1993a») vai na citação curta.'

export type ErroDoFormulario = { campo: 'tipo' | 'titulo' | 'ano'; texto: string }

/**
 * O CSL que o formulário grava (o mesmo da prévia) e os erros que impedem gravar. Com erro, o CSL é o que se pode montar
 * (sem o ano que não se lê; sem o tipo): a prévia mostra o que já dá.
 */
export function montarCsl(f: FormularioDaObra, originais: { author?: unknown; editor?: unknown } = {}): { csl: Record<string, Json>; erros: ErroDoFormulario[] } {
  const erros: ErroDoFormulario[] = []
  const csl: Record<string, Json> = {}
  if (f.tipo === '') erros.push({ campo: 'tipo', texto: MSG_SEM_TIPO })
  else csl.type = f.tipo === 'volume' ? 'book' : f.tipo
  const author = nomesDoTexto(f.autores, originais.author)
  if (author.length) csl.author = author
  const editor = nomesDoTexto(f.organizadores, originais.editor)
  if (editor.length) csl.editor = editor
  const ano = f.ano.trim()
  if (ano !== '') {
    const n = /^\d{1,4}$/.test(ano) ? Number(ano) : NaN
    if (Number.isInteger(n) && n >= 1) csl.issued = { 'date-parts': [[n]] }
    else erros.push({ campo: 'ano', texto: MSG_ANO })
  }
  const titulo = limpo(f.titulo)
  if (titulo) csl.title = titulo
  else erros.push({ campo: 'titulo', texto: MSG_SEM_TITULO })
  const textos: [string, string][] = [
    ['container-title', f.fonte],
    ['volume', f.volume],
    ['page', f.paginas],
    ['publisher-place', f.lugar],
    ['publisher', f.editora],
    ['collection-title', f.serie],
  ]
  for (const [campo, valor] of textos) if (limpo(valor)) csl[campo] = limpo(valor)
  // a ordem do erro na tela: o tipo, depois o ano, depois o título (a ordem dos campos)
  erros.sort((a, b) => ORDEM_DO_ERRO.indexOf(a.campo) - ORDEM_DO_ERRO.indexOf(b.campo))
  return { csl, erros }
}
const ORDEM_DO_ERRO: ErroDoFormulario['campo'][] = ['tipo', 'ano', 'titulo']

/**
 * A citação curta que a tela propõe: o sobrenome e o ano (dos autores; sem autores, dos organizadores, com «[ed.]», como
 * os livros a imprimem). Dois nomes: «Um/Outro 1993»; três ou mais: «Um et al. 1993». '' sem nome.
 */
export function curtaProposta(f: FormularioDaObra): string {
  const autores = nomesDoTexto(f.autores).map(sobrenomeDe).filter(Boolean)
  const organizadores = autores.length ? [] : nomesDoTexto(f.organizadores).map(sobrenomeDe).filter(Boolean)
  const nomes = autores.length ? autores : organizadores
  if (nomes.length === 0) return ''
  const quem = nomes.length === 1 ? nomes[0]! : nomes.length === 2 ? `${nomes[0]}/${nomes[1]}` : `${nomes[0]} et al.`
  const ano = /^\d{1,4}$/.test(f.ano.trim()) ? f.ano.trim() : ''
  return normalizarForma([quem, organizadores.length ? '[ed.]' : '', ano].filter(Boolean).join(' '))
}

/**
 * Os campos de uma citação curta impressa (`?curta=` da Revisão, «Probe-Exemplo 1993: 12»): os sobrenomes e o ano, para
 * começar o formulário. Só o que se lê com certeza: o ano é o de quatro dígitos no fim (a letra fica só na citação curta);
 * «et al.» sai; com «[ed.]» (ou «[eds.]», «[Hg.]») os nomes são de organizadores. Cada nome vem como «Sobrenome, », para a
 * pessoa completar.
 */
export function camposDaCurta(curta: string): { autores: string; organizadores: string; ano: string; curta: string } {
  const semLocalizador = normalizarForma(curta.split(':', 1)[0] ?? '')
  const m = /^(.*?)\s*(\d{4})[a-z]?$/u.exec(semLocalizador)
  let quem = m ? m[1]! : semLocalizador
  const organizado = /\s*\[[^\]]*\]\s*$/u.test(quem)
  quem = quem.replace(/\s*\[[^\]]*\]\s*$/u, '').replace(/\s+et al\.?$/iu, '')
  const nomes = quem
    .split('/')
    .map((x) => limpo(x))
    .filter((x) => /\p{L}/u.test(x))
    .map((x) => `${x}, `)
    .join('\n')
  return { autores: organizado ? '' : nomes, organizadores: organizado ? nomes : '', ano: m ? m[2]! : '', curta: semLocalizador }
}

// ---- a prévia --------------------------------------------------------------------------------------------------

/**
 * O Chicago de um CSL, para mostrar: o texto de `chicago()` e o de `chicagoHtml()` (desenhado só com o sanitizador,
 * `htmlComItalico`), ou null quando o CSL não se formata (falta o tipo ou o título, ou está fora do alcance do porte).
 */
export function chicagoDaObra(csl: unknown): { texto: string; html: string } | null {
  if (!eCslValido(csl) || !noAlcance(csl)) return null
  try {
    return { texto: chicago(csl), html: chicagoHtml(csl) }
  } catch {
    return null
  }
}

// ---- as parecidas ----------------------------------------------------------------------------------------------

/** O título dobrado sem pontuação, como o `_chave_quase` do processamento. */
export function tituloDobrado(t: unknown): string {
  if (typeof t !== 'string') return ''
  return dobrar(t)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Uma obra para comparar (dos livros ou do usuário). */
export interface ObraParaComparar {
  id: string
  /** As citações curtas da obra (das publicações; a do usuário). */
  curtas: readonly string[]
  csl: Record<string, unknown> | null
  skc: boolean
}

export type MotivoDaParecida = 'quase' | 'chave' | 'autor-e-ano' | 'titulo'

export interface Parecida<T extends ObraParaComparar = ObraParaComparar> {
  obra: T
  /**
   * Por que aparece. 'quase': a mesma chave da citação curta, o mesmo ano e o mesmo título dobrado, a «quase igual» do
   * `user-import` (Tarefa 3), que não recebe id na importação até a pessoa decidir.
   */
  motivo: MotivoDaParecida
}

/** O que se compara da obra do formulário. */
export interface AlvoDaComparacao {
  csl: Record<string, unknown>
  /** A citação curta (a do formulário; sem ela, a chave da citação que se vai ligar). */
  curta: string
}

const sobrenomesDobrados = (csl: Record<string, unknown> | null): string[] => {
  if (!csl) return []
  const nomes = Array.isArray(csl.author) && csl.author.length ? csl.author : Array.isArray(csl.editor) ? csl.editor : []
  return nomes.map((n) => dobrar(sobrenomeDe(n))).filter(Boolean)
}

/**
 * O que se compara de cada obra (as chaves das citações curtas, o ano, o título dobrado e os sobrenomes), calculado uma vez
 * por obra (N6 do fix round 1): a cada tecla só a obra do formulário é dobrada de novo. As obras são as da lista, que só
 * muda quando a Bibliografia muda.
 */
const CHAVES = new WeakMap<ObraParaComparar, { chaves: (string | null)[]; ano: string | null; titulo: string; sobrenomes: string[] }>()
function chavesDe(o: ObraParaComparar) {
  let k = CHAVES.get(o)
  if (!k) {
    k = { chaves: o.curtas.map((c) => chaveDaCitacao(c)), ano: anoDoCsl(o.csl), titulo: tituloDobrado(o.csl?.title), sobrenomes: sobrenomesDobrados(o.csl) }
    CHAVES.set(o, k)
  }
  return k
}

/**
 * As obras parecidas com a do formulário: as «quase iguais» primeiro, depois a mesma citação curta, o mesmo sobrenome e
 * ano, e o mesmo título dobrado. `limite`: quantas.
 */
export function parecidas<T extends ObraParaComparar>(alvo: AlvoDaComparacao, obras: readonly T[], limite = 6): Parecida<T>[] {
  const chave = chaveDaCitacao(alvo.curta.trim() || null)
  const ano = anoDoCsl(alvo.csl)
  const titulo = tituloDobrado(alvo.csl.title)
  const primeiro = sobrenomesDobrados(alvo.csl)[0] ?? null
  const ordem: MotivoDaParecida[] = ['quase', 'chave', 'autor-e-ano', 'titulo']
  const achadas: Parecida<T>[] = []
  for (const o of obras) {
    const k = chavesDe(o)
    const mesmaChave = chave !== null && k.chaves.includes(chave)
    const mesmoAno = ano !== null && k.ano === ano
    const mesmoTitulo = titulo !== '' && k.titulo === titulo
    const motivo: MotivoDaParecida | null =
      mesmaChave && mesmoAno && mesmoTitulo
        ? 'quase'
        : mesmaChave
          ? 'chave'
          : primeiro !== null && mesmoAno && k.sobrenomes.includes(primeiro)
            ? 'autor-e-ano'
            : mesmoTitulo
              ? 'titulo'
              : null
    if (motivo) achadas.push({ obra: o, motivo })
  }
  return achadas.sort((a, b) => ordem.indexOf(a.motivo) - ordem.indexOf(b.motivo)).slice(0, limite)
}
