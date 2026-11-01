/**
 * A busca. `montarConsulta` transforma o que o usuário digitou numa consulta FTS5 segura;
 * `buscar` a roda no índice (`busca.fts` / `busca.doc`, o busca.sqlite anexado ao banco),
 * agrupa o que achou por objeto, aplica o escopo e os filtros e devolve os objetos, o
 * verbete em destaque, as contagens por escopo e as facetas.
 *
 * Este e o `consultas.ts` são os únicos lugares com SQL; as telas só chamam funções.
 */
import { executar, publicacoesAbertas, type PublicacaoAberta } from '../banco/cliente'
import { resumosDosItens, verbete, type Modalidade, type Nivel, type ObjetoResumo, type Verbete } from '../banco/consultas'
import { fold, tabelaDoPacote, textoIndexado, type FoldTabela } from './fold'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export const ESCOPOS = ['tudo', 'termo', 'local', 'bibliografia', 'colecao'] as const
/**
 * O que cada escopo procura (R3: na 2A a "Coleção" é só o grupo da obra, `author_group`;
 * as coleções do usuário vêm na 2B):
 * - tudo: o texto dos itens (campo 5, sítio, catálogo e trechos) e todos os outros escopos;
 * - termo: verbetes do glossário que casam, e os objetos com hipótese nesse termo ou achados no sítio de mesmo nome;
 * - local: sítios cujo nome casa, e os objetos achados neles;
 * - bibliografia: obras que casam (referência Chicago), e os objetos que as citam;
 * - colecao: grupos da obra cujo título casa, e os objetos do grupo.
 */
export type Escopo = (typeof ESCOPOS)[number]

export const ROTULO_DO_ESCOPO: Record<Escopo, string> = {
  tudo: 'Tudo',
  termo: 'Termo',
  local: 'Local',
  bibliografia: 'Bibliografia',
  colecao: 'Coleção',
}

export const CHAVES_DE_FILTRO = ['publicacao', 'periodo', 'sitio', 'tipo', 'nivel', 'modalidade', 'certeza'] as const
export type ChaveDeFiltro = (typeof CHAVES_DE_FILTRO)[number]
/** Dentro de uma chave os valores são alternativas (OU); entre chaves, todas valem (E). */
export type Filtros = Partial<Record<ChaveDeFiltro, readonly string[]>>

export const ROTULO_DA_CHAVE: Record<ChaveDeFiltro, string> = {
  publicacao: 'Publicação',
  periodo: 'Período',
  sitio: 'Sítio',
  tipo: 'Tipo',
  nivel: 'Nível',
  modalidade: 'Modalidade',
  certeza: 'Certeza do sítio',
}

/** Valor de filtro para "não tem" (sem sítio, sem tipo). */
export const SEM_VALOR = '~sem'

export interface OpcaoDeFaceta {
  valor: string
  rotulo: string
  /** Objetos do escopo com este valor, contados com os demais filtros aplicados. */
  n: number
  ativa: boolean
}

export interface Faceta {
  chave: ChaveDeFiltro
  rotulo: string
  opcoes: OpcaoDeFaceta[]
}

export interface OpcoesDaBusca {
  escopo: Escopo
  filtros: Filtros
  /** Quantos objetos devolver em `objetos` (o total e `numeros` não se limitam). Padrão: 120. */
  limite?: number
  /** A tabela de dobra; sem ela, a do pacote aberto (nucleo/fold.json). */
  tabela?: FoldTabela
}

export interface ResultadoDaBusca {
  /** Não havia o que buscar (nada além de espaços, aspas, `*`…, ou curto demais): a tela mostra o estado vazio. */
  vazia: boolean
  /** A consulta tem letras mas menos de MINIMO_DE_CARACTERES: a tela pede mais letras. */
  curta: boolean
  verbeteDestaque?: Verbete
  /** Outros verbetes que casam ("ver também"), sem o destaque. */
  verbetesRelacionados: { id: string; rotulo: string }[]
  /** Os primeiros `limite` objetos do escopo, já filtrados, por número. */
  objetos: ObjetoResumo[]
  /** Os números de todos os objetos do escopo, filtrados, na mesma ordem (para vizinhos(), "lista"). */
  numeros: string[]
  /** Quantos objetos o escopo tem com os filtros. */
  total: number
  /** Quantos teria sem os filtros. */
  totalSemFiltros: number
  /** Objetos de cada escopo, com os filtros (as abas). */
  contagens: Record<Escopo, number>
  facetas: Faceta[]
}

const LIMITE_PADRAO = 120
/** Menos letras e números (já dobrados) que isto casariam com quase tudo: nem se busca. */
export const MINIMO_DE_CARACTERES = 2

// ---------------------------------------------------------------------------
// Montar a consulta
// ---------------------------------------------------------------------------

/** As palavras da consulta: dobradas, só letras e números. */
export function palavrasDaConsulta(digitado: string, tabela: FoldTabela): string[] {
  return fold(digitado, tabela)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((p) => p !== '')
}

/**
 * A consulta FTS5 para o que foi digitado: cada palavra dobrada, entre aspas (então nada
 * digitado vira sintaxe do FTS5), com `*` (prefixo) na última. `null` se não sobra nada.
 * A forma colada não entra aqui (só no texto indexado): "marduks" acha o que "marduk's" acha
 * porque o índice guarda "marduk s marduks".
 */
export function montarConsulta(digitado: string, tabela: FoldTabela): string | null {
  const palavras = palavrasDaConsulta(digitado, tabela)
  if (palavras.length === 0) return null
  return palavras.map((p, i) => `"${p.replaceAll('"', '""')}"${i === palavras.length - 1 ? '*' : ''}`).join(' ')
}

/** O texto (dobrado, com a forma colada) tem todas as palavras, a última como prefixo? É o que o FTS5 faz. */
function casa(palavras: readonly string[], texto: string, tabela: FoldTabela): boolean {
  const doTexto = textoIndexado(texto, tabela)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((p) => p !== '')
  const ultima = palavras.length - 1
  return palavras.every((p, i) => doTexto.some((t) => (i === ultima ? t.startsWith(p) : t === p)))
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

type L = Record<string, unknown>
const s = (v: unknown): string | null => (typeof v === 'string' ? v : v == null ? null : String(v))
const n = (v: unknown): number | null => (typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : null)
const EM_IDS = '(SELECT value FROM json_each($ids))'
const lista = (itens: readonly (string | number)[]) => JSON.stringify(itens)

async function porPublicacao(pubs: readonly PublicacaoAberta[], montar: (esq: string, sigla: string) => string, parametros: Record<string, string>): Promise<L[]> {
  if (pubs.length === 0) return []
  return executar<L>(pubs.map((p) => montar(p.esquema, p.sigla)).join('\nUNION ALL\n'), parametros)
}

/** O objeto de cada item (o próprio id do item se ele ainda não tem número). */
async function numerosDosItens(itens: readonly string[]): Promise<string[]> {
  if (itens.length === 0) return []
  const linhas = await executar<L>(`SELECT item_id, object_id FROM main.object_member WHERE item_id IN ${EM_IDS}`, { $ids: lista(itens) })
  const mapa = new Map(linhas.map((l) => [s(l.item_id)!, s(l.object_id)!]))
  return itens.map((i) => mapa.get(i) ?? i)
}

/** Os itens de cada objeto (um número que não é de objeto é um item solto). */
async function itensDosNumeros(numeros: readonly string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>()
  if (numeros.length === 0) return mapa
  const linhas = await executar<L>(
    `SELECT object_id, item_id FROM main.object_member WHERE object_id IN ${EM_IDS} ORDER BY object_id, item_id`,
    { $ids: lista(numeros) },
  )
  for (const l of linhas) {
    const o = s(l.object_id)!
    mapa.set(o, [...(mapa.get(o) ?? []), s(l.item_id)!])
  }
  for (const nr of numeros) if (!mapa.has(nr)) mapa.set(nr, [nr])
  return mapa
}

/** O item de uma hipótese: o próprio alvo, ou o item do elemento que ela anota. */
const ITEM_DA_HIPOTESE = `CASE WHEN h.target_type = 'item' THEN h.target_id WHEN h.target_type = 'element' AND e.target_type = 'item' THEN e.target_id END`
const JUNTA_ELEMENTO = (esq: string) => `LEFT JOIN ${esq}.element e ON h.target_type = 'element' AND e.id = h.target_id`

interface Documento {
  tipo: string
  ref: string
  objeto: string | null
  rotulo: string
}

async function documentos(consulta: string): Promise<Documento[]> {
  const linhas = await executar<L>(
    `SELECT d.tipo, d.ref, d.objeto, d.rotulo FROM busca.fts AS f JOIN busca.doc AS d ON d.rowid = f.rowid WHERE f.fts MATCH $q ORDER BY d.rowid`,
    { $q: consulta },
  )
  return linhas.map((l) => ({ tipo: s(l.tipo)!, ref: s(l.ref)!, objeto: s(l.objeto), rotulo: s(l.rotulo) ?? '' }))
}

const unicos = <T>(itens: Iterable<T>): T[] => [...new Set(itens)]

/** Itens com hipótese num dos termos, ou achados num sítio cujo nome é um deles. */
async function itensDosTermos(pubs: readonly PublicacaoAberta[], glIds: readonly string[]): Promise<string[]> {
  if (glIds.length === 0) return []
  const linhas = await porPublicacao(
    pubs,
    (esq) => `
      SELECT DISTINCT item_id FROM (
        SELECT ${ITEM_DA_HIPOTESE} AS item_id FROM ${esq}.hypothesis_term ht
          JOIN ${esq}.hypothesis h ON h.id = ht.hypothesis_id ${JUNTA_ELEMENTO(esq)}
          WHERE ht.glossary_id IN ${EM_IDS}
        UNION
        SELECT a.subject_id FROM ${esq}.assertion a JOIN ${esq}.site st ON st.id = a.site_id
          WHERE a.subject_type = 'item' AND a.field = 'findspot' AND st.name_entry_id IN ${EM_IDS}
      ) WHERE item_id IS NOT NULL`,
    { $ids: lista(glIds) },
  )
  return linhas.map((l) => s(l.item_id)!)
}

async function itensDasObras(pubs: readonly PublicacaoAberta[], bibIds: readonly string[]): Promise<string[]> {
  if (bibIds.length === 0) return []
  const linhas = await porPublicacao(
    pubs,
    (esq) => `SELECT DISTINCT item_id FROM ${esq}.bib_ref WHERE bib_entry_id IN ${EM_IDS} AND item_id IS NOT NULL`,
    { $ids: lista(bibIds) },
  )
  return linhas.map((l) => s(l.item_id)!)
}

/** Itens achados num sítio cujo nome (impresso ou do glossário) casa com a consulta. */
async function itensDosSitios(pubs: readonly PublicacaoAberta[], palavras: readonly string[], tabela: FoldTabela): Promise<string[]> {
  const itens: string[] = []
  for (const pub of pubs) {
    const sitios = await executar<L>(
      `SELECT st.id, st.literal_name, g.pt, g.pt_text, g.de, g.variants
       FROM ${pub.esquema}.site st LEFT JOIN main.glossary_entry g ON g.id = st.name_entry_id`,
    )
    const ids = sitios
      .filter((l) => casa(palavras, [l.literal_name, l.pt, l.pt_text, l.de, l.variants].map(s).filter(Boolean).join(' '), tabela))
      .map((l) => n(l.id)!)
    if (ids.length === 0) continue
    const achados = await executar<L>(
      `SELECT DISTINCT subject_id FROM ${pub.esquema}.assertion
       WHERE subject_type = 'item' AND field = 'findspot' AND site_id IN (SELECT value FROM json_each($ids))`,
      { $ids: lista(ids) },
    )
    itens.push(...achados.map((l) => s(l.subject_id)!))
  }
  return itens
}

/** Itens dos grupos da obra (author_group) cujo título casa com a consulta. */
async function itensDosGrupos(pubs: readonly PublicacaoAberta[], palavras: readonly string[], tabela: FoldTabela): Promise<string[]> {
  const itens: string[] = []
  for (const pub of pubs) {
    const grupos = await executar<L>(`SELECT id, title_de, title_pt, period_pt FROM ${pub.esquema}.author_group`)
    const ids = grupos.filter((l) => casa(palavras, [l.title_de, l.title_pt, l.period_pt].map(s).filter(Boolean).join(' '), tabela)).map((l) => s(l.id)!)
    if (ids.length === 0) continue
    const achados = await executar<L>(
      `SELECT DISTINCT item_id FROM ${pub.esquema}.author_group_item WHERE group_id IN (SELECT value FROM json_each($ids))`,
      { $ids: lista(ids) },
    )
    itens.push(...achados.map((l) => s(l.item_id)!))
  }
  return itens
}

/** Números de objeto escritos na busca ("CA00023") que existem. */
async function objetosCitados(digitado: string): Promise<string[]> {
  const candidatos = unicos((digitado.match(/\b[A-Za-z]{2}\d{5}\b/g) ?? []).map((x) => x.toUpperCase()))
  if (candidatos.length === 0) return []
  const linhas = await executar<L>(`SELECT id FROM main.object WHERE id IN ${EM_IDS}`, { $ids: lista(candidatos) })
  return linhas.map((l) => s(l.id)!)
}

// ---------------------------------------------------------------------------
// O que cada objeto tem, para os filtros e as facetas
// ---------------------------------------------------------------------------

const PERIODOS: Record<string, string> = {
  NT: 'Natufiano',
  NE: 'Neolítico',
  CA: 'Calcolítico',
  BA: 'Bronze Antigo',
  BI: 'Bronze Intermediário',
  BM: 'Bronze Médio',
  BT: 'Bronze Tardio',
  F1: 'Ferro I',
  F2: 'Ferro II',
  F3: 'Ferro III',
  PE: 'Persa',
  HE: 'Helenístico',
  RO: 'Romano',
}
const ORDEM_DOS_PERIODOS = Object.keys(PERIODOS)

const ROTULO_DO_NIVEL: Record<Nivel, string> = {
  pre_iconographic: 'pré-iconográfico',
  iconographic: 'iconográfico',
  iconological: 'iconológico',
}
const ROTULO_DA_MODALIDADE: Record<Modalidade, string> = {
  asserted: 'afirmada',
  probable: 'provável',
  possible: 'possível',
  questioned: 'questionada',
}
const ROTULO_DA_CERTEZA: Record<string, string> = { certain: 'certo', doubtful: 'duvidoso', unknown: 'desconhecido' }

interface Candidato {
  numero: string
  resumo: ObjetoResumo
  /** sigla → "TESTE I" */
  publicacoes: Map<string, string>
  periodo: string | null
  sitio: { id: string; nome: string } | null
  certeza: string | null
  niveis: Set<string>
  modalidades: Set<string>
}

/** O(s) valor(es) de um candidato para cada chave de filtro. */
function valoresDe(c: Candidato, chave: ChaveDeFiltro): string[] {
  switch (chave) {
    case 'publicacao':
      return [...c.publicacoes.keys()]
    case 'periodo':
      return [c.periodo ?? SEM_VALOR]
    case 'sitio':
      return [c.sitio?.id ?? SEM_VALOR]
    case 'tipo':
      return [c.resumo.tipo ?? SEM_VALOR]
    case 'nivel':
      return [...c.niveis]
    case 'modalidade':
      return [...c.modalidades]
    case 'certeza':
      return c.certeza ? [c.certeza] : []
  }
}

function passa(c: Candidato, filtros: Filtros, ignorar?: ChaveDeFiltro): boolean {
  return CHAVES_DE_FILTRO.every((chave) => {
    const pedido = filtros[chave]
    if (chave === ignorar || !pedido || pedido.length === 0) return true
    return valoresDe(c, chave).some((v) => pedido.includes(v))
  })
}

async function candidatos(pubs: readonly PublicacaoAberta[], numeros: readonly string[]): Promise<Map<string, Candidato>> {
  const itensPorNumero = await itensDosNumeros(numeros)
  const todosOsItens = unicos([...itensPorNumero.values()].flat())
  const resumos = new Map((await resumosDosItens(todosOsItens, 'fonte')).map((r) => [r.numero, r]))
  const donoDoItem = new Map<string, string>()
  for (const [numero, itens] of itensPorNumero) for (const i of itens) donoDoItem.set(i, numero)

  const p = { $ids: lista(todosOsItens) }
  const [itens, hipoteses, periodos] = await Promise.all([
    porPublicacao(
      pubs,
      (esq, sigla) => `
        SELECT i.id AS item_id, '${sigla}' AS sigla, trim(coalesce(i.publication, '${sigla}') || ' ' || coalesce(p.volume, '')) AS publicacao,
          fa.site_id, fa.certainty, coalesce(g.pt, st.literal_name) AS sitio_nome
        FROM ${esq}.item i LEFT JOIN ${esq}.publication p ON p.sigla = i.publication
        LEFT JOIN ${esq}.assertion fa ON fa.id = (
          SELECT a.id FROM ${esq}.assertion a WHERE a.subject_type = 'item' AND a.subject_id = i.id AND a.field = 'findspot' AND a.site_id IS NOT NULL
          ORDER BY a.is_primary DESC, a.id LIMIT 1)
        LEFT JOIN ${esq}.site st ON st.id = fa.site_id
        LEFT JOIN main.glossary_entry g ON g.id = st.name_entry_id
        WHERE i.id IN ${EM_IDS}`,
      p,
    ),
    porPublicacao(
      pubs,
      (esq) => `
        SELECT DISTINCT item_id, level, modality FROM (
          SELECT ${ITEM_DA_HIPOTESE} AS item_id, h.level, h.modality FROM ${esq}.hypothesis h ${JUNTA_ELEMENTO(esq)}
        ) WHERE item_id IN ${EM_IDS}`,
      p,
    ),
    executar<L>(`SELECT id, period_code FROM main.object WHERE id IN (SELECT value FROM json_each($ids))`, { $ids: lista(numeros) }),
  ])

  const mapa = new Map<string, Candidato>()
  for (const numero of numeros) {
    const resumo = resumos.get(numero)
    if (!resumo) continue
    mapa.set(numero, { numero, resumo, publicacoes: new Map(), periodo: null, sitio: null, certeza: null, niveis: new Set(), modalidades: new Set() })
  }
  for (const l of periodos) {
    const c = mapa.get(s(l.id)!)
    if (c) c.periodo = s(l.period_code)
  }
  for (const l of itens) {
    const c = mapa.get(donoDoItem.get(s(l.item_id)!) ?? '')
    if (!c) continue
    c.publicacoes.set(s(l.sigla)!, s(l.publicacao) ?? s(l.sigla)!)
    if (!c.sitio && l.site_id != null) {
      c.sitio = { id: `${s(l.sigla)}-${n(l.site_id)}`, nome: s(l.sitio_nome) ?? '—' }
      c.certeza = s(l.certainty)
    }
  }
  for (const l of hipoteses) {
    const c = mapa.get(donoDoItem.get(s(l.item_id)!) ?? '')
    if (!c) continue
    c.niveis.add(s(l.level)!)
    c.modalidades.add(s(l.modality)!)
  }
  return mapa
}

// ---------------------------------------------------------------------------
// Facetas
// ---------------------------------------------------------------------------

const comparar = (a: string, b: string) => a.localeCompare(b, 'pt', { numeric: true, sensitivity: 'base' })

function facetas(escopo: readonly Candidato[], filtros: Filtros): Faceta[] {
  return CHAVES_DE_FILTRO.map((chave) => {
    const contagem = new Map<string, { rotulo: string; n: number }>()
    const rotuloDe = (valor: string, c?: Candidato): string => {
      if (valor === SEM_VALOR) return chave === 'sitio' ? 'Sem sítio' : 'Sem tipo'
      switch (chave) {
        case 'publicacao':
          return c?.publicacoes.get(valor) ?? valor
        case 'periodo':
          return PERIODOS[valor] ?? valor
        case 'sitio':
          return c?.sitio?.nome ?? valor
        case 'tipo':
          return valor
        case 'nivel':
          return ROTULO_DO_NIVEL[valor as Nivel] ?? valor
        case 'modalidade':
          return ROTULO_DA_MODALIDADE[valor as Modalidade] ?? valor
        case 'certeza':
          return ROTULO_DA_CERTEZA[valor] ?? valor
      }
    }
    for (const c of escopo) {
      if (!passa(c, filtros, chave)) continue
      for (const valor of valoresDe(c, chave)) {
        const entrada = contagem.get(valor) ?? { rotulo: rotuloDe(valor, c), n: 0 }
        entrada.n++
        contagem.set(valor, entrada)
      }
    }
    const ativos = filtros[chave] ?? []
    for (const valor of ativos) if (!contagem.has(valor)) contagem.set(valor, { rotulo: rotuloDe(valor), n: 0 })

    const opcoes = [...contagem].map(([valor, { rotulo, n: quantos }]): OpcaoDeFaceta => ({ valor, rotulo, n: quantos, ativa: ativos.includes(valor) }))
    const fim = (o: OpcaoDeFaceta) => (o.valor === SEM_VALOR ? 1 : 0)
    if (chave === 'periodo') opcoes.sort((a, b) => fim(a) - fim(b) || ORDEM_DOS_PERIODOS.indexOf(a.valor) - ORDEM_DOS_PERIODOS.indexOf(b.valor))
    else if (chave === 'nivel') opcoes.sort((a, b) => ['pre_iconographic', 'iconographic', 'iconological'].indexOf(a.valor) - ['pre_iconographic', 'iconographic', 'iconological'].indexOf(b.valor))
    else if (chave === 'modalidade') opcoes.sort((a, b) => ['asserted', 'probable', 'possible', 'questioned'].indexOf(a.valor) - ['asserted', 'probable', 'possible', 'questioned'].indexOf(b.valor))
    else opcoes.sort((a, b) => fim(a) - fim(b) || b.n - a.n || comparar(a.rotulo, b.rotulo))
    return { chave, rotulo: ROTULO_DA_CHAVE[chave], opcoes }
  }).filter((f) => f.opcoes.length > 0)
}

// ---------------------------------------------------------------------------
// Verbete em destaque
// ---------------------------------------------------------------------------

/**
 * O verbete em destaque: o que tem um nome (pt, pt_text, de, en ou variante) igual à consulta
 * dobrada; se nenhum é igual e só um verbete casa, esse. Mais de um verbete casando sem nenhum
 * igual: sem destaque (a lista fica em "ver também").
 */
async function escolherDestaque(refs: readonly string[], digitado: string, tabela: FoldTabela): Promise<string | null> {
  if (refs.length === 0) return null
  const dobrado = fold(digitado, tabela)
  const linhas = await executar<L>(
    `SELECT id, pt, pt_text, de, en, variants, status FROM main.glossary_entry WHERE id IN ${EM_IDS}`,
    { $ids: lista(refs) },
  )
  const iguais = linhas.filter((l) => {
    let variantes: unknown = []
    try {
      variantes = JSON.parse(s(l.variants) ?? '[]')
    } catch {
      /* variantes ilegíveis: vale o resto */
    }
    const nomes = [l.pt, l.pt_text, l.de, l.en, ...(Array.isArray(variantes) ? variantes : [])].map(s).filter((x): x is string => !!x)
    return nomes.some((nome) => fold(nome, tabela) === dobrado)
  })
  if (iguais.length > 0) {
    iguais.sort((a, b) => Number(s(b.status) === 'approved') - Number(s(a.status) === 'approved') || refs.indexOf(s(a.id)!) - refs.indexOf(s(b.id)!))
    return s(iguais[0]!.id)
  }
  return refs.length === 1 ? refs[0]! : null
}

// ---------------------------------------------------------------------------
// buscar
// ---------------------------------------------------------------------------

function vazio(curta = false): ResultadoDaBusca {
  return {
    vazia: true,
    curta,
    verbetesRelacionados: [],
    objetos: [],
    numeros: [],
    total: 0,
    totalSemFiltros: 0,
    contagens: { tudo: 0, termo: 0, local: 0, bibliografia: 0, colecao: 0 },
    facetas: [],
  }
}

export async function buscar(digitado: string, opcoes: OpcoesDaBusca): Promise<ResultadoDaBusca> {
  const tabela = opcoes.tabela ?? (await tabelaDoPacote())
  const palavras = palavrasDaConsulta(digitado, tabela)
  const consulta = montarConsulta(digitado, tabela)
  if (consulta === null) return vazio()
  if (palavras.join('').length < MINIMO_DE_CARACTERES) return vazio(true)

  const pubs = await publicacoesAbertas()
  const docs = await documentos(consulta)
  const doTipo = (...tipos: string[]) => docs.filter((d) => tipos.includes(d.tipo))
  const verbetes = doTipo('verbete')

  // Cada fonte vira um conjunto de números de objeto.
  const [itensDeTexto, itensDeTermos, itensDeObras, itensDeSitios, itensDeGrupos, citados] = await Promise.all([
    numerosDosItens(doTipo('item').map((d) => d.ref)),
    itensDosTermos(pubs, verbetes.map((d) => d.ref)).then(numerosDosItens),
    itensDasObras(pubs, doTipo('obra').map((d) => d.ref)).then(numerosDosItens),
    itensDosSitios(pubs, palavras, tabela).then(numerosDosItens),
    itensDosGrupos(pubs, palavras, tabela).then(numerosDosItens),
    objetosCitados(digitado),
  ])
  const doTexto = new Set([...itensDeTexto, ...doTipo('trecho', 'catalogo').flatMap((d) => (d.objeto ? [d.objeto] : []))])
  const porEscopo: Record<Escopo, Set<string>> = {
    termo: new Set(itensDeTermos),
    local: new Set(itensDeSitios),
    bibliografia: new Set(itensDeObras),
    colecao: new Set(itensDeGrupos),
    tudo: new Set([...doTexto, ...itensDeTermos, ...itensDeObras, ...itensDeSitios, ...itensDeGrupos, ...citados]),
  }

  const todos = await candidatos(pubs, [...porEscopo.tudo])
  const doEscopo = (escopo: Escopo) => [...porEscopo[escopo]].flatMap((nr) => todos.get(nr) ?? [])
  const contagens = Object.fromEntries(
    ESCOPOS.map((e) => [e, doEscopo(e).filter((c) => passa(c, opcoes.filtros)).length]),
  ) as Record<Escopo, number>

  const noEscopo = doEscopo(opcoes.escopo)
  const filtrados = noEscopo.filter((c) => passa(c, opcoes.filtros))
  const numeros = filtrados.map((c) => c.numero).sort(comparar)

  let verbeteDestaque: Verbete | undefined
  let relacionados = verbetes
  if (opcoes.escopo === 'tudo' || opcoes.escopo === 'termo') {
    const glId = await escolherDestaque(verbetes.map((d) => d.ref), digitado, tabela)
    verbeteDestaque = glId ? ((await verbete(glId)) ?? undefined) : undefined
    relacionados = verbetes.filter((d) => d.ref !== glId)
  } else {
    relacionados = []
  }

  const porNumero = new Map(filtrados.map((c) => [c.numero, c.resumo]))
  return {
    vazia: false,
    curta: false,
    verbeteDestaque,
    verbetesRelacionados: relacionados.slice(0, 12).map((d) => ({ id: d.ref, rotulo: d.rotulo })),
    objetos: numeros.slice(0, opcoes.limite ?? LIMITE_PADRAO).map((nr) => porNumero.get(nr)!),
    numeros,
    total: numeros.length,
    totalSemFiltros: noEscopo.length,
    contagens,
    facetas: facetas(noEscopo, opcoes.filtros),
  }
}
