/**
 * A busca. `montarConsulta` transforma o que o usuário digitou numa consulta FTS5 segura;
 * `buscar` a roda no índice (`busca.fts` / `busca.doc`, o busca.sqlite anexado ao banco),
 * agrupa o que achou por objeto, aplica o escopo e os filtros e devolve os objetos, o
 * verbete em destaque, as contagens por escopo e as facetas.
 *
 * Este e o `consultas.ts` são os únicos lugares com SQL; as telas só chamam funções.
 */
import { consultarUsuario, executar, publicacoesAbertas, type PublicacaoAberta } from '../banco/cliente'
import { obrasDoPacote, resumosDosItens, verbete, type Modalidade, type Nivel, type ObjetoResumo, type Verbete } from '../banco/consultas'
import type { Tipo } from '../usuario/eventos'
import { estadoAtual, type Estado } from '../usuario/estado'
import type { Registro } from '../usuario/fusao'
import { garantirIndiceDoUsuario, numeroDeObjeto, SIGLA_SKC } from '../usuario/indice'
import { chaveDaFonte, lerReferenciaDigitada } from '../banco/referencias'
import { indiceDeNotas } from '../notas/indiceDeNotas'
import { numeracaoDe, numeroDoObjeto, objetosComNumero } from '../objetos-skc/atual'
import { garantirOsDonosDosTrechos } from '../hipoteses/garantirDonos'
import { lerAncora, objetoDaHipotese } from '../hipoteses/modelo'
import { lerFicha, textoDaOrigem, tipoCurtoDe } from '../objetos-skc/modelo'
import { edicoesDosVerbetes, formasEmUso } from '../glossario/doUsuario'
import { eVerbeteSkc, situacaoDoVerbete, type EdicaoDoVerbete, type StatusDoVerbete } from '../glossario/modelo'
import { numerosNoTexto } from '../objetos-skc/numeracao'
import { nomeComMarcaDoSitio, nomeDeAgoraDoSitio, sitioDoObjetoDoPacote } from '../sitios/doUsuario'
import { eSitioSkc } from '../sitios/modelo'
import { destinoDe, redirecionamentosOuNenhum, type Redirecionamentos } from '../pacote/redirecionamentos'
import { sitiosDoPacote, type SitiosDoPacote } from '../sitios/pacote'
import { fold, tabelaDoPacote, textoIndexado, type FoldTabela } from './fold'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export const ESCOPOS = ['tudo', 'termo', 'local', 'bibliografia', 'colecao'] as const
/**
 * O que cada escopo procura. Os do pacote (índice `busca`) e os do usuário (índice em memória, src/usuario/indice.ts,
 * com a marca SKC) valem juntos:
 * - tudo: o texto dos itens (campo 5, sítio, catálogo e trechos) e todos os outros escopos; do usuário, tudo o que
 *   ele escreveu (notas, objetos SKC com número, ficha e leitura, coleções, sítios, hipóteses);
 * - termo: verbetes do glossário que casam, e os objetos com hipótese nesse termo ou achados no sítio de mesmo nome;
 *   do usuário, as hipóteses SKC (termos e justificativa) e as notas sobre verbetes;
 * - local: sítios cujo nome casa, e os objetos achados neles; do usuário, os sítios SKC (nome e variantes), os
 *   objetos SKC achados neles e as notas sobre sítios;
 * - bibliografia: obras que casam (referência Chicago), e os objetos que as citam; do usuário, as notas sobre obras;
 * - colecao (R3 encerrada na 2B): grupos da obra (`author_group`) cujo título casa, e os objetos do grupo; do
 *   usuário, as coleções SKC cujo nome casa (a coleção e os objetos dela) e as notas sobre grupos.
 *
 * Os acertos do usuário contam para o objeto a que pertencem (uma nota num objeto, a leitura ou a hipótese dele); o
 * que não é de nenhum objeto (nota sobre verbete, coleção, sítio, hipótese solta, rascunho) vem em `usuario`.
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

/** Um acerto da camada do usuário que não pertence a um objeto: aparece num grupo à parte, com a marca SKC. */
export interface AcertoDoUsuario {
  tipo: Tipo
  /** O id do registro (NT-…, CO-…, SI-…, HY-…, OB-…). */
  ref: string
  rotulo: string
  skc: true
  /** O objeto a que o acerto se refere, quando não é resolvido (objeto excluído ou inexistente); senão, null. */
  objeto: string | null
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
  /**
   * Acertos do usuário (SKC) do escopo escolhido que não são de um objeto, por rótulo. Filtros de objeto (período,
   * tipo, sítio…) os escondem, porque eles não têm esses valores; só "Publicação: SKC" os mantém.
   */
  usuario: AcertoDoUsuario[]
  /** Quantos `usuario` cada escopo teria (com os filtros), ao lado de `contagens`. */
  contagensDoUsuario: Record<Escopo, number>
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
export function casa(palavras: readonly string[], texto: string, tabela: FoldTabela): boolean {
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

/**
 * Os objetos dos sítios que a camada do usuário achou (Tarefa 12): num sítio do LIVRO corrigido, os itens que o livro acha
 * lá; num sítio qualquer, os objetos do livro que a pessoa ligou a ele (`item-sitio`). Os objetos SKC dele saem do estado.
 * A busca é aditiva: o nome do livro continua achando o objeto que o livro diz estar lá, mesmo trocado de sítio.
 */
async function objetosDosSitiosAchados(pubs: readonly PublicacaoAberta[], refs: readonly string[], estado: Estado): Promise<Map<string, string[]>> {
  const saida = new Map<string, string[]>()
  for (const ref of new Set(refs)) {
    const numeros: string[] = []
    for (const r of estado.registros.get('item-sitio')?.values() ?? []) if (r.campos.sitio === ref) numeros.push(r.id)
    const partes = eSitioSkc(ref) ? null : /^(.+)-(\d+)$/.exec(ref)
    const pub = partes && pubs.find((p) => p.sigla === partes[1])
    if (partes && pub) {
      const itens = await executar<L>(
        `SELECT DISTINCT subject_id AS item_id FROM ${pub.esquema}.assertion WHERE site_id = $id AND subject_type = 'item' AND field = 'findspot'`,
        { $id: Number(partes[2]) },
      )
      numeros.push(...(await numerosDosItens(itens.map((l) => s(l.item_id)!))))
    }
    saida.set(ref, unicos(numeros))
  }
  return saida
}

/** Números de objeto escritos na busca ("CA00001") que existem. */
async function objetosCitados(digitado: string): Promise<string[]> {
  const candidatos = numerosNoTexto(digitado)
  if (candidatos.length === 0) return []
  const linhas = await executar<L>(`SELECT id FROM main.object WHERE id IN ${EM_IDS}`, { $ids: lista(candidatos) })
  return linhas.map((l) => s(l.id)!)
}

/**
 * Uma referência de fonte digitada (decisões 38 e 39; `lerReferenciaDigitada`) responde EXATAMENTE, em `buscar` e em
 * `sugerir`: os números dos objetos que ela aponta, e nada mais (nem prefixo, nem página, nem medida, nem nota que a
 * cite). null quando o digitado não é uma referência de uma fonte conhecida: então é uma busca comum.
 * - "SKC 12", "SKC: 12", "SKC, Nr. 12", "skc nr 12": o objeto SKC com esse SKC, Nr. (`porNrSkc`), se existe e não está
 *   excluído; senão, nenhum.
 * - "IPIAO I: 60", "IPIAO I, Nr. 60", "IPIAO 60", "IPIAO I: 95a", "IPIAO I: Abb. 1": se a sigla é de uma obra aberta,
 *   o objeto de cada item com esse número (e volume, se dado; sem volume, todos os volumes da sigla); senão, null.
 * O "skc" sozinho NÃO é uma referência: é uma palavra comum, e acha os objetos SKC com Nr. pelo termo indexado
 * `skcnr<n>` (como "TESTE" acha os objetos do livro; veja src/usuario/indice.ts).
 */
export async function objetosDaReferencia(digitado: string, pubs: readonly PublicacaoAberta[], estado: Estado): Promise<string[] | null> {
  const ref = lerReferenciaDigitada(digitado)
  if (!ref) return null
  if (ref.sigla === SIGLA_SKC) {
    const numeracao = numeracaoDe(estado)
    const id = numeracao.porNrSkc.get(ref.numero)
    const numero = id ? (numeracao.porId.get(id)?.numero ?? null) : null
    return numero && objetosSkc(estado).has(numero) ? [numero] : []
  }
  const daSigla = pubs.filter((p) => p.sigla.toUpperCase() === ref.sigla)
  if (daSigla.length === 0) return null
  const linhas = await porPublicacao(
    daSigla,
    (esq) => `
      SELECT i.id FROM ${esq}.item i LEFT JOIN ${esq}.publication p ON p.sigla = i.publication
      WHERE upper(i.publication) = $sigla AND i.kind = $tipo AND i.number = CAST($numero AS INTEGER) AND lower(i.suffix) = $sufixo
        AND ($volume = '' OR upper(coalesce(i.volume, p.volume, '')) = $volume)`,
    { $sigla: ref.sigla, $tipo: ref.abb ? 'intro_figure' : 'catalog', $numero: String(ref.numero), $sufixo: ref.sufixo, $volume: ref.volume ?? '' },
  )
  return unicos(await numerosDosItens(linhas.map((l) => s(l.id)!)))
}

/**
 * Decisão 40: as notas que CITAM a referência digitada ("TESTE I: 1-3" é achada por "TESTE I: 2"), pelo índice dos
 * links reversos (indiceDeNotas, chave da fonte), sem passar pelo FTS. Vão ao grupo da camada ("Na sua camada"), sem
 * objeto e sem escopo (só na aba Tudo): os objetos da resposta continuam só os da referência. Sem volume ("TESTE 2"),
 * vale cada volume aberto da sigla. O rótulo é o do índice da camada (o título ou a primeira linha da nota).
 */
async function notasQueCitam(digitado: string, estado: Estado): Promise<AcertoBruto[]> {
  const ref = lerReferenciaDigitada(digitado)
  if (!ref) return []
  const obras =
    ref.sigla === SIGLA_SKC
      ? [SIGLA_SKC]
      : (await obrasDoPacote()).filter((o) => (ref.volume ? o === `${ref.sigla} ${ref.volume}` : o === ref.sigla || o.startsWith(`${ref.sigla} `)))
  const indice = indiceDeNotas(estado)
  const ids = unicos(obras.flatMap((o) => indice.ligadasA('fonte', chaveDaFonte(o, ref.numero, ref.sufixo, ref.abb)).map((l) => l.nota.id)))
  if (ids.length === 0) return []
  const linhas = await consultarUsuario<L>(`SELECT ref, rotulo FROM doc WHERE tipo = 'nota' AND ref IN (SELECT value FROM json_each($ids))`, { $ids: lista(ids) })
  const rotulos = new Map(linhas.map((l) => [s(l.ref)!, s(l.rotulo) ?? '']))
  return ids.map((id) => ({ tipo: 'nota', ref: id, objeto: null, objetos: [], rotulo: rotulos.get(id) || id, escopo: null }))
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
// A camada do usuário
// ---------------------------------------------------------------------------

interface AcertoBruto {
  tipo: Tipo
  ref: string
  objeto: string | null
  objetos: string[]
  rotulo: string
  escopo: Escopo | null
}

async function acertosDoUsuario(consulta: string): Promise<AcertoBruto[]> {
  const linhas = await consultarUsuario<L>(
    `SELECT d.tipo, d.ref, d.objeto, d.objetos, d.rotulo, d.escopo FROM fts AS f JOIN doc AS d ON d.rowid = f.rowid WHERE f.fts MATCH $q ORDER BY d.rowid`,
    { $q: consulta },
  )
  return linhas.map((l) => {
    let objetos: unknown = []
    try {
      objetos = JSON.parse(s(l.objetos) ?? '[]')
    } catch {
      /* lista ilegível: sem objetos */
    }
    const escopo = s(l.escopo)
    return {
      tipo: s(l.tipo) as Tipo,
      ref: s(l.ref)!,
      objeto: s(l.objeto),
      objetos: Array.isArray(objetos) ? objetos.filter((o): o is string => typeof o === 'string') : [],
      rotulo: s(l.rotulo) ?? '',
      escopo: escopo !== null && (ESCOPOS as readonly string[]).includes(escopo) ? (escopo as Escopo) : null,
    }
  })
}

/** Os objetos SKC do estado que existem (não excluídos, não reservas, com número confirmado ou provisório), por número. */
const objetosSkc = (estado: Estado): Map<string, Registro> => objetosComNumero(estado)

const textoDe = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** Um objeto SKC como candidato da busca: publicação "SKC", período pelo prefixo do número, tipo e sítio da ficha. */
function candidatoSkc(numero: string, r: Registro, estado: Estado, livro: SitiosDoPacote | null, redirecionamentos: Redirecionamentos): Candidato {
  // Um sítio do usuário que o pacote publicou (Tarefa 16) é o sítio do livro: o id e o nome dele (a faceta Sítio os junta).
  const sitioId = textoDe(r.campos.sitio) === null ? null : destinoDe(redirecionamentos, textoDe(r.campos.sitio)!)
  // O nome de agora (corrigido → do livro → o guardado na ficha), e a marca «excluído» num sítio seu que se excluiu (Tarefa 12).
  const guardado = textoDe(r.campos.sitioNome)
  const sitioNome = (sitioId ? nomeDeAgoraDoSitio(estado, sitioId, livro, guardado, redirecionamentos) : null) ?? guardado ?? sitioId
  const rotuloDoSitio = nomeComMarcaDoSitio(estado, sitioId, sitioNome, redirecionamentos)
  const prefixo = numero.slice(0, 2)
  const ficha = lerFicha(r.campos)
  return {
    numero,
    resumo: {
      numero,
      itemId: r.id,
      origem: textoDaOrigem(ficha),
      tipo: tipoCurtoDe(ficha),
      sitio: sitioNome,
      sitioId,
      miniatura: null,
      display_mode: null,
      skc: true,
    },
    publicacoes: new Map([[SIGLA_SKC, SIGLA_SKC]]),
    periodo: prefixo in PERIODOS ? prefixo : null,
    sitio: sitioId ? { id: sitioId, nome: rotuloDoSitio ?? sitioId } : null,
    certeza: null,
    niveis: new Set(),
    modalidades: new Set(),
  }
}

/** O sítio de um objeto do livro depois da troca da pessoa e com o nome corrigido: é o que a faceta Sítio conta e rotula. */
function aplicarSitioDeAgora(c: Candidato, estado: Estado, livro: SitiosDoPacote | null, redirecionamentos: Redirecionamentos): void {
  const s = sitioDoObjetoDoPacote(estado, c.numero, c.sitio?.id ?? null, redirecionamentos)
  if (s.id === null) return
  const guardado = s.trocado ? (textoDe(estado.registro('item-sitio', c.numero)?.campos.sitioNome) ?? c.sitio?.nome ?? null) : (c.sitio?.nome ?? null)
  const id = destinoDe(redirecionamentos, s.id)
  c.sitio = { id, nome: nomeDeAgoraDoSitio(estado, id, livro, guardado, redirecionamentos) ?? '—' }
}

/** Só filtros que um acerto solto do usuário pode cumprir: nenhum, ou apenas "Publicação: SKC". */
function filtrosDeixamOsSoltos(filtros: Filtros): boolean {
  const ativos = CHAVES_DE_FILTRO.filter((c) => (filtros[c]?.length ?? 0) > 0)
  return ativos.length === 0 || (ativos.length === 1 && ativos[0] === 'publicacao' && filtros.publicacao!.includes(SIGLA_SKC))
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
async function escolherDestaque(
  refs: readonly string[],
  digitado: string,
  tabela: FoldTabela,
  formas: ReadonlyMap<string, string> = new Map(),
  edicoes: ReadonlyMap<string, EdicaoDoVerbete> = new Map(),
): Promise<string | null> {
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
    // A forma em uso do usuário (Tarefa 11) também é um nome do verbete.
    const nomes = [formas.get(s(l.id) ?? ''), l.pt, l.pt_text, l.de, l.en, ...(Array.isArray(variantes) ? variantes : [])].map(s).filter((x): x is string => !!x)
    return nomes.some((nome) => fold(nome, tabela) === dobrado)
  })
  if (iguais.length > 0) {
    // O desempate é pelo estado DE AGORA (derivado), não pelo `status` cru do pacote (T17-B-10).
    const aprovado = (l: L) => {
      const id = s(l.id)!
      return Number(situacaoDoVerbete(edicoes.get(id) ?? null, s(l.pt) ?? s(l.de) ?? id, (s(l.status) as StatusDoVerbete | null) ?? 'proposed').status === 'approved')
    }
    iguais.sort((a, b) => aprovado(b) - aprovado(a) || refs.indexOf(s(a.id)!) - refs.indexOf(s(b.id)!))
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
    usuario: [],
    contagensDoUsuario: { tudo: 0, termo: 0, local: 0, bibliografia: 0, colecao: 0 },
  }
}

export async function buscar(digitado: string, opcoes: OpcoesDaBusca): Promise<ResultadoDaBusca> {
  const tabela = opcoes.tabela ?? (await tabelaDoPacote())
  const palavras = palavrasDaConsulta(digitado, tabela)
  const consulta = montarConsulta(digitado, tabela)
  if (consulta === null) return vazio()
  if (palavras.join('').length < MINIMO_DE_CARACTERES) return vazio(true)

  const pubs = await publicacoesAbertas()
  // A hipótese ancorada num trecho do livro conta para o objeto dele (T17-B-4). Os donos vêm ANTES do índice, para a entrada
  // da hipótese sair com o mesmo objeto que a faceta Nível usa, esteja o cache cheio ou não (revisão 1, I1).
  await garantirOsDonosDosTrechos(estadoAtual())
  const estadoDoUsuario = await garantirIndiceDoUsuario(tabela)
  // "SKC 12", "IPIAO I: 60"…: só os objetos da referência (veja `objetosDaReferencia`).
  const exatos = await objetosDaReferencia(digitado, pubs, estadoDoUsuario)
  const [docs, todosOsAcertosComPublicados, redirecionamentos] = await Promise.all([
    exatos ? Promise.resolve([]) : documentos(consulta),
    exatos ? notasQueCitam(digitado, estadoDoUsuario) : acertosDoUsuario(consulta),
    redirecionamentosOuNenhum(),
  ])
  // O verbete ou sítio do usuário que o pacote publicou (Tarefa 16) é achado como o do livro (nos documentos do pacote), nunca aqui.
  const todosOsAcertos = todosOsAcertosComPublicados.filter((a) => !redirecionamentos.has(a.ref))
  // Um verbete do LIVRO achado pela forma em uso do usuário (Tarefa 11) é o verbete do livro, com os objetos dele, e não um
  // acerto "na sua camada": entra entre os verbetes do pacote (uma vez só).
  const doLivro = todosOsAcertos.filter((a) => a.tipo === 'verbete' && !eVerbeteSkc(a.ref))
  const acertos = doLivro.length === 0 ? todosOsAcertos : todosOsAcertos.filter((a) => !doLivro.includes(a))
  const formas = formasEmUso(estadoDoUsuario)
  const skc = objetosSkc(estadoDoUsuario)
  const doTipo = (...tipos: string[]) => docs.filter((d) => tipos.includes(d.tipo))
  const verbetes = [...doTipo('verbete')]
  for (const a of doLivro) if (!verbetes.some((d) => d.ref === a.ref)) verbetes.push({ tipo: 'verbete', ref: a.ref, objeto: null, rotulo: a.rotulo })

  // Cada fonte vira um conjunto de números de objeto.
  const nenhum = Promise.resolve<string[]>([])
  const [itensDeTexto, itensDeTermos, itensDeObras, itensDeSitios, itensDeGrupos, citados] = await Promise.all([
    numerosDosItens(doTipo('item').map((d) => d.ref)),
    itensDosTermos(pubs, verbetes.map((d) => d.ref)).then(numerosDosItens),
    itensDasObras(pubs, doTipo('obra').map((d) => d.ref)).then(numerosDosItens),
    exatos ? nenhum : itensDosSitios(pubs, palavras, tabela).then(numerosDosItens),
    exatos ? nenhum : itensDosGrupos(pubs, palavras, tabela).then(numerosDosItens),
    exatos ? Promise.resolve([...exatos]) : objetosCitados(digitado),
  ])
  if (!exatos) for (const nr of numerosNoTexto(digitado)) if (skc.has(nr)) citados.push(nr)
  const doTexto = new Set([...itensDeTexto, ...doTipo('trecho', 'catalogo').flatMap((d) => (d.objeto ? [d.objeto] : []))])
  const porEscopo: Record<Escopo, Set<string>> = {
    termo: new Set(itensDeTermos),
    local: new Set(itensDeSitios),
    bibliografia: new Set(itensDeObras),
    colecao: new Set(itensDeGrupos),
    tudo: new Set([...doTexto, ...itensDeTermos, ...itensDeObras, ...itensDeSitios, ...itensDeGrupos, ...citados]),
  }

  // Os sítios achados pela camada do usuário (Tarefa 12) e os objetos do livro deles.
  const dosSitios = await objetosDosSitiosAchados(pubs, acertos.filter((a) => a.tipo === 'sitio').map((a) => a.ref), estadoDoUsuario)

  // A camada do usuário: cada acerto vale para os objetos dele, no "tudo" e no escopo do registro.
  const doUsuario = (a: AcertoBruto) => ['tudo' as Escopo, ...(a.escopo ? [a.escopo] : [])]
  for (const a of acertos) {
    const objetos = a.tipo === 'colecao' ? a.objetos : a.objeto ? [a.objeto] : []
    if (a.tipo === 'sitio') {
      for (const [nr, r] of skc) if (r.campos.sitio === a.ref) objetos.push(nr)
      objetos.push(...(dosSitios.get(a.ref) ?? []))
    }
    for (const e of doUsuario(a)) for (const nr of objetos) porEscopo[e].add(nr)
  }

  const todos = await candidatos(pubs, [...porEscopo.tudo])
  const livro = await sitiosDoPacote().catch((): SitiosDoPacote | null => null)
  for (const nr of porEscopo.tudo) {
    const r = skc.get(nr)
    if (r && !todos.has(nr)) todos.set(nr, candidatoSkc(nr, r, estadoDoUsuario, livro, redirecionamentos))
  }
  // O sítio de agora de cada objeto do livro (a faceta Sítio): o trocado pela pessoa, com o nome corrigido (Tarefa 12).
  for (const c of todos.values()) if (!c.resumo.skc) aplicarSitioDeAgora(c, estadoDoUsuario, livro, redirecionamentos)
  for (const h of estadoDoUsuario.registros.get('hipotese')?.values() ?? []) {
    const alvo = (v: unknown) => numeroDeObjeto(v) ?? (typeof v === 'string' && v.startsWith('OB-') ? numeroDoObjeto(estadoDoUsuario, v) : null)
    // Ancorada numa leitura SKC, a hipótese é do dono da leitura, como na tela (revisão 4 da Tarefa 10, m6; M13).
    const dono = objetoDaHipotese({ objeto: typeof h.campos.objeto === 'string' ? h.campos.objeto : null, ancora: lerAncora(h.campos.ancora) })
    const c = h.excluido ? undefined : todos.get(alvo(dono) ?? alvo(h.campos.alvo) ?? '')
    if (!c) continue
    if (typeof h.campos.nivel === 'string') c.niveis.add(h.campos.nivel)
    if (typeof h.campos.modalidade === 'string') c.modalidades.add(h.campos.modalidade)
  }
  const doEscopo = (escopo: Escopo) => [...porEscopo[escopo]].flatMap((nr) => todos.get(nr) ?? [])
  const contagens = Object.fromEntries(
    ESCOPOS.map((e) => [e, doEscopo(e).filter((c) => passa(c, opcoes.filtros)).length]),
  ) as Record<Escopo, number>

  // O que não é de um objeto que existe vai para o grupo à parte.
  const soltos = acertos.filter((a) => !(a.objeto && todos.has(a.objeto)))
  const soltosDoEscopo = (e: Escopo) => (filtrosDeixamOsSoltos(opcoes.filtros) ? soltos.filter((a) => e === 'tudo' || a.escopo === e) : [])
  const contagensDoUsuario = Object.fromEntries(ESCOPOS.map((e) => [e, soltosDoEscopo(e).length])) as Record<Escopo, number>
  const usuario = soltosDoEscopo(opcoes.escopo)
    .map((a): AcertoDoUsuario => ({ tipo: a.tipo, ref: a.ref, rotulo: a.rotulo, skc: true, objeto: a.objeto }))
    .sort((a, b) => comparar(a.rotulo, b.rotulo) || comparar(a.ref, b.ref))

  const noEscopo = doEscopo(opcoes.escopo)
  const filtrados = noEscopo.filter((c) => passa(c, opcoes.filtros))
  const numeros = filtrados.map((c) => c.numero).sort(comparar)

  let verbeteDestaque: Verbete | undefined
  let relacionados = verbetes
  if (opcoes.escopo === 'tudo' || opcoes.escopo === 'termo') {
    const glId = await escolherDestaque(
      verbetes.map((d) => d.ref),
      digitado,
      tabela,
      formas,
      edicoesDosVerbetes(estadoDoUsuario),
    )
    const doPacote = glId ? ((await verbete(glId)) ?? undefined) : undefined
    // O que o usuário fez no verbete (forma em uso e estado, Tarefa 11) vale sobre o do pacote.
    verbeteDestaque = doPacote && { ...doPacote, pt: formas.get(doPacote.id) ?? doPacote.pt, status: situacaoDoVerbete(edicoesDosVerbetes(estadoDoUsuario).get(doPacote.id) ?? null, doPacote.pt ?? doPacote.de ?? doPacote.id, doPacote.status).status }
    relacionados = verbetes.filter((d) => d.ref !== glId)
  } else {
    relacionados = []
  }

  const porNumero = new Map(filtrados.map((c) => [c.numero, c.resumo]))
  return {
    vazia: false,
    curta: false,
    verbeteDestaque,
    verbetesRelacionados: relacionados.slice(0, 12).map((d) => ({ id: d.ref, rotulo: formas.get(d.ref) ?? d.rotulo })),
    objetos: numeros.slice(0, opcoes.limite ?? LIMITE_PADRAO).map((nr) => porNumero.get(nr)!),
    numeros,
    total: numeros.length,
    totalSemFiltros: noEscopo.length,
    contagens,
    facetas: facetas(noEscopo, opcoes.filtros),
    usuario,
    contagensDoUsuario,
  }
}
