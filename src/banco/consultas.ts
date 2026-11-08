/**
 * As consultas do app. É o único lugar com SQL de leitura (além da busca, Tarefa 6);
 * as telas chamam estas funções e recebem objetos de src/banco/tipos.ts.
 *
 * comum.sqlite é `main`; cada publicação do pacote é um esquema `pub_<SIGLA>`. As
 * tabelas de publicação são lidas por UNION ALL sobre todos os esquemas abertos.
 * Os deslocamentos de texto ficam em code points (ver tipos.ts).
 */
import { executar, publicacoesAbertas, type Parametro, type PublicacaoAberta } from './cliente'
import { chaveDaFonte, formatarReferencias, type ReferenciaDeFonte } from './referencias'
import { tradicaoValida } from '../sitios/modelo'
import type { GrafiaDoPacote, ParSugerido } from '../sitios/resolucao'
import {
  NIVEIS,
  type Ancora,
  type CampoDoCatalogo,
  type Certeza,
  type Contagens,
  type ContextoDeNavegacao,
  type Datacao,
  type DatacaoCssl,
  type Grupo,
  type GrupoDetalhe,
  type Hipotese,
  type HipotesesPorNivel,
  type Imagem,
  type ItemDaFonte,
  type ItemDetalhe,
  type Leitura,
  type Medida,
  type ModoDeExibicao,
  type Numero,
  type ObjetoResumo,
  type Obra,
  type ObraResumo,
  type Paralelo,
  type ReferenciaBibliografica,
  type Regiao,
  type Remissao,
  type Sitio,
  type SitioDoItem,
  type SitioResumo,
  type Termo,
  type TextoDaIntroducao,
  type Verbete,
  type VerbeteDaLista,
  type VerbeteResumo,
  type Vizinhos,
} from './tipos'

export * from './tipos'

type Params = Record<string, Parametro>
type L = Record<string, unknown>

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

const s = (v: unknown): string | null => (typeof v === 'string' ? v : v == null ? null : String(v))
const n = (v: unknown): number | null => (typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : null)
const b = (v: unknown): boolean => v === 1 || v === true
const ids = (lista: readonly string[]) => JSON.stringify(lista)
const EM_IDS = '(SELECT value FROM json_each($ids))'

function json<T>(texto: unknown, padrao: T): T {
  if (typeof texto !== 'string' || texto === '') return padrao
  try {
    return JSON.parse(texto) as T
  } catch {
    return padrao
  }
}

/** [[gl_id, início, fim], …] de unit_pt_render.termos. */
function termos(texto: unknown): Termo[] {
  return json<unknown[]>(texto, [])
    .filter((t): t is [string, number, number] => Array.isArray(t) && typeof t[0] === 'string' && typeof t[1] === 'number' && typeof t[2] === 'number')
    .map(([glId, inicio, fim]) => ({ glId, inicio, fim }))
}

/** Uma subconsulta por publicação aberta, unidas. `null` se o pacote não tem publicação. */
function porPublicacao(pubs: readonly PublicacaoAberta[], montar: (esq: string, sigla: string) => string): string | null {
  if (pubs.length === 0) return null
  return pubs.map((p) => montar(p.esquema, p.sigla)).join('\nUNION ALL\n')
}

async function linhasPorPublicacao(montar: (esq: string, sigla: string) => string, parametros: Params = {}): Promise<L[]> {
  const sql = porPublicacao(await publicacoesAbertas(), montar)
  return sql ? executar<L>(sql, parametros) : []
}

/** A referência de um item na fonte: obra e volume ("TESTE I"), número, sufixo e se é figura da introdução. */
function referenciaDe(l: L): ReferenciaDeFonte {
  return { obra: `${s(l.publication) ?? ''} ${s(l.volume) ?? ''}`.trim(), numero: n(l.number) ?? 0, sufixo: s(l.suffix) ?? '', abb: l.kind === 'intro_figure' }
}

/** "TESTE I: 60", "TESTE I: 95a" ou "TESTE I: Abb. 1" (decisão 39: o formato de `formatarReferencias`). */
function origemDe(l: L): string {
  return formatarReferencias([referenciaDe(l)])
}

/** Tipo curto: a primeira frase do campo 5, sem o ponto final. */
function tipoCurto(texto: string | null): string | null {
  if (!texto) return null
  const primeira = texto.split(/(?<=\.)\s+/)[0] ?? texto
  return primeira.replace(/\.$/, '').trim() || null
}

/** Ordem das fontes: publicação na ordem do manifesto, catálogo antes das figuras, número, sufixo. */
async function comparadorDeFonte(): Promise<(a: L, b: L) => number> {
  const ordemPub = new Map((await publicacoesAbertas()).map((p, i) => [p.sigla, i]))
  return (x, y) =>
    (ordemPub.get(s(x.publication) ?? '') ?? 99) - (ordemPub.get(s(y.publication) ?? '') ?? 99) ||
    (x.kind === y.kind ? 0 : x.kind === 'catalog' ? -1 : 1) ||
    (n(x.number) ?? 0) - (n(y.number) ?? 0) ||
    (s(x.suffix) ?? '').localeCompare(s(y.suffix) ?? '')
}

function imagemDe(l: L): Imagem {
  return {
    id: s(l.id)!,
    itemId: s(l.item_id)!,
    ordinal: n(l.ordinal)!,
    display_mode: s(l.display_mode) as ModoDeExibicao | null,
    tela: s(l.screen_path),
    miniatura: s(l.thumb_path),
    largura: n(l.width_px),
    altura: n(l.height_px),
    credito: s(l.credit),
    rotacao: n(l.rotation),
  }
}

/** Item → número do objeto (o próprio id quando o item ainda não tem número). */
async function numerosDosItens(itens: readonly string[]): Promise<Map<string, Numero>> {
  const mapa = new Map<string, Numero>(itens.map((i) => [i, i]))
  if (itens.length === 0) return mapa
  const linhas = await executar<L>(`SELECT item_id, object_id FROM main.object_member WHERE item_id IN ${EM_IDS}`, { $ids: ids(itens) })
  for (const l of linhas) mapa.set(s(l.item_id)!, s(l.object_id)!)
  return mapa
}

const SQL_ITEM = (esq: string) => `
  SELECT i.id, i.publication, i.kind, i.number, i.suffix, coalesce(i.volume, p.volume) AS volume
  FROM ${esq}.item i LEFT JOIN ${esq}.publication p ON p.sigla = i.publication
  WHERE i.id IN ${EM_IDS}`

const SQL_RESUMO = (esq: string, sigla: string) => `
  SELECT i.id, i.publication, i.kind, i.number, i.suffix, coalesce(i.volume, p.volume) AS volume,
    coalesce(r.texto, cf.literal) AS campo5,
    (SELECT coalesce(g.pt, st.literal_name) FROM ${esq}.assertion a
       JOIN ${esq}.site st ON st.id = a.site_id
       LEFT JOIN main.glossary_entry g ON g.id = st.name_entry_id
     WHERE a.subject_type = 'item' AND a.subject_id = i.id AND a.field = 'findspot'
     ORDER BY a.is_primary DESC, a.id LIMIT 1) AS sitio,
    (SELECT '${sigla}-' || st.id FROM ${esq}.assertion a
       JOIN ${esq}.site st ON st.id = a.site_id
     WHERE a.subject_type = 'item' AND a.subject_id = i.id AND a.field = 'findspot'
     ORDER BY a.is_primary DESC, a.id LIMIT 1) AS sitio_id,
    im.thumb_path, im.display_mode
  FROM ${esq}.item i
  LEFT JOIN ${esq}.publication p ON p.sigla = i.publication
  LEFT JOIN ${esq}.unit_pt_render r ON r.unit_id = i.id || '#5'
  LEFT JOIN ${esq}.catalog_field cf ON cf.item_id = i.id AND cf.category = 5
  LEFT JOIN ${esq}.image im ON im.id = (SELECT id FROM ${esq}.image WHERE item_id = i.id ORDER BY ordinal LIMIT 1)
  WHERE i.id IN ${EM_IDS}`

/**
 * Resumos dos objetos destes itens, um por objeto (o primeiro item de cada um).
 * `ordem: 'dada'` mantém a ordem da lista; `'fonte'` ordena pela ordem das fontes.
 */
export async function resumosDosItens(itens: readonly string[], ordem: 'dada' | 'fonte'): Promise<ObjetoResumo[]> {
  if (itens.length === 0) return []
  const linhas = await linhasPorPublicacao(SQL_RESUMO, { $ids: ids(itens) })
  if (ordem === 'dada') {
    const posicao = new Map(itens.map((id, i) => [id, i]))
    linhas.sort((x, y) => posicao.get(s(x.id)!)! - posicao.get(s(y.id)!)!)
  } else {
    linhas.sort(await comparadorDeFonte())
  }
  const numeros = await numerosDosItens(linhas.map((l) => s(l.id)!))
  const vistos = new Set<string>()
  const resumos: ObjetoResumo[] = []
  for (const l of linhas) {
    const numero = numeros.get(s(l.id)!)!
    if (vistos.has(numero)) continue
    vistos.add(numero)
    resumos.push({
      numero,
      itemId: s(l.id)!,
      origem: origemDe(l),
      tipo: tipoCurto(s(l.campo5)),
      sitio: s(l.sitio),
      sitioId: s(l.sitio_id),
      miniatura: s(l.thumb_path),
      display_mode: s(l.display_mode) as ModoDeExibicao | null,
    })
  }
  return resumos
}

/**
 * Os resumos dos objetos com estes números (`CA00001`), na ordem pedida, um por objeto (o do primeiro item dele).
 * O número que o pacote não tem fica de fora.
 */
export async function resumosDosObjetos(numeros: readonly string[]): Promise<ObjetoResumo[]> {
  const unicos = [...new Set(numeros)]
  if (unicos.length === 0) return []
  const membrosL = await executar<L>(`SELECT object_id, min(item_id) AS item_id FROM main.object_member WHERE object_id IN ${EM_IDS} GROUP BY object_id`, { $ids: ids(unicos) })
  const itemDe = new Map(membrosL.map((l) => [s(l.object_id)!, s(l.item_id)!]))
  const resumos = await resumosDosItens([...itemDe.values()], 'dada')
  const porNumero = new Map(resumos.map((r) => [r.numero, r]))
  return unicos.flatMap((numero) => porNumero.get(numero) ?? [])
}

// ---------------------------------------------------------------------------
// Hipóteses
// ---------------------------------------------------------------------------

/**
 * O item a que a hipótese pertence: o próprio alvo (`item`) ou o item do elemento (`element`
 * com `element.target_type = 'item'`). Hipóteses e elementos com `target_type = 'artifact'`
 * ainda não se ligam a item nenhum (não há tabela de artefatos no pacote): ficam fora do item,
 * dos grupos e dos objetos do verbete, e só aparecem por `hipotese(id)`.
 */
const ALVO_ITEM = `CASE WHEN h.target_type = 'element' AND e.target_type = 'item' THEN e.target_id WHEN h.target_type = 'item' THEN h.target_id END`

const SQL_HIPOTESE = (esq: string, onde: string) => `
  SELECT h.id, h.target_type, h.target_id, h.level, h.modality, h.publication, h.locator, h.passage_id,
    h.quote, h.quote_start, h.quote_end, h.cited_from_item, h.verification, h.religiosity,
    e.label AS el_label, e.label_pt AS el_label_pt, om.object_id AS alvo_numero, ${ALVO_ITEM} AS alvo_item,
    a.unit_id, a.gl_id, a.pt_start, a.pt_end, a.metodo,
    (SELECT json_group_array(json_array(x.glossary_id, x.pt, x.de)) FROM (
       SELECT ht.glossary_id, coalesce(g.pt_text, g.pt) AS pt, g.de
       FROM ${esq}.hypothesis_term ht LEFT JOIN main.glossary_entry g ON g.id = ht.glossary_id
       WHERE ht.hypothesis_id = h.id ORDER BY ht.ordinal, ht.glossary_id) x) AS termos_json,
    (SELECT json_group_array(json_array(y.author, y.role)) FROM (
       SELECT author, role FROM ${esq}.hypothesis_author WHERE hypothesis_id = h.id
       ORDER BY CASE role WHEN 'author' THEN 0 WHEN 'reported' THEN 1 ELSE 2 END, rowid) y) AS autores_json
  FROM ${esq}.hypothesis h
  LEFT JOIN ${esq}.element e ON h.target_type = 'element' AND e.id = h.target_id
  LEFT JOIN ${esq}.hypothesis_anchor_pt a ON a.hypothesis_id = h.id
  LEFT JOIN main.object_member om ON om.item_id = ${ALVO_ITEM}
  WHERE ${onde}`

function hipoteseDe(l: L): Hipotese {
  const alvoNumero = s(l.alvo_numero) ?? s(l.alvo_item)
  return {
    id: s(l.id)!,
    nivel: s(l.level) as Hipotese['nivel'],
    modalidade: s(l.modality) as Hipotese['modalidade'],
    publicacao: s(l.publication),
    locator: s(l.locator),
    passagemId: s(l.passage_id),
    citacao: s(l.quote),
    citacaoInicio: n(l.quote_start),
    citacaoFim: n(l.quote_end),
    citadaDe: s(l.cited_from_item),
    alvo: {
      tipo: s(l.target_type) as Hipotese['alvo']['tipo'],
      id: s(l.target_id)!,
      numero: alvoNumero,
      itemId: s(l.alvo_item),
      rotulo: l.target_type === 'element' ? (s(l.el_label_pt) ?? s(l.el_label)) : null,
    },
    termos: json<[string, string | null, string | null][]>(l.termos_json, []).map(([glId, pt, de]) => ({ glId, pt, de })),
    autores: json<[string, string][]>(l.autores_json, []).map(([nome, papel]) => ({ nome, papel: papel as Hipotese['autores'][number]['papel'] })),
    verificacao: s(l.verification) as Hipotese['verificacao'],
    religiosidade: s(l.religiosity) as Hipotese['religiosidade'],
    ancora: l.metodo
      ? { unidade: s(l.unit_id)!, metodo: s(l.metodo) as 'termo', glId: s(l.gl_id), inicio: n(l.pt_start), fim: n(l.pt_end) }
      : null,
  }
}

/** Ordem de leitura: trecho, posição da citação, id. */
function ordenarHipoteses(hs: Hipotese[]): Hipotese[] {
  return hs.sort(
    (x, y) =>
      (x.passagemId ?? '').localeCompare(y.passagemId ?? '') ||
      (x.citacaoInicio ?? Infinity) - (y.citacaoInicio ?? Infinity) ||
      x.id.localeCompare(y.id),
  )
}

async function hipotesesOnde(onde: string | ((esq: string) => string), parametros: Params): Promise<Hipotese[]> {
  const condicao = typeof onde === 'string' ? () => onde : onde
  return ordenarHipoteses((await linhasPorPublicacao((esq) => SQL_HIPOTESE(esq, condicao(esq)), parametros)).map(hipoteseDe))
}

function porNivel(hs: Hipotese[]): HipotesesPorNivel {
  const r = Object.fromEntries(NIVEIS.map((nv) => [nv, [] as Hipotese[]])) as HipotesesPorNivel
  for (const h of hs) r[h.nivel]?.push(h)
  return r
}

export async function hipotese(id: string): Promise<Hipotese | null> {
  return (await hipotesesOnde('h.id = $id', { $id: id }))[0] ?? null
}

// ---------------------------------------------------------------------------
// Contagens e grupos
// ---------------------------------------------------------------------------

export async function contagens(): Promise<Contagens> {
  const pubs = await publicacoesAbertas()
  const soma = porPublicacao(pubs, (esq) => `SELECT count(*) AS n FROM ${esq}.hypothesis`)
  const [l] = await executar<L>(`
    SELECT (SELECT count(*) FROM main.object) AS objetos,
           ${soma ? `(SELECT coalesce(sum(n), 0) FROM (${soma}))` : '0'} AS hipoteses,
           (SELECT count(*) FROM main.glossary_entry) AS verbetes`)
  return { objetos: n(l!.objetos) ?? 0, hipoteses: n(l!.hipoteses) ?? 0, verbetes: n(l!.verbetes) ?? 0 }
}

/** Uma linha da fila de revisão do pacote, como o pipeline a gravou (a base `main` primeiro, depois cada publicação, cada uma por `id`). */
export interface LinhaDaFila {
  /** O motivo (`review_queue.reason`). */
  tipo: string
  entidade: string
  entidadeId: string | null
  detalhe: string
  /** Para uma linha de item: o número do objeto dele (o id do item se não tem número). */
  numero: string | null
}

/** Todas as linhas da fila de revisão do pacote (a Revisão, o Menu e o ponto da barra contam a partir delas). */
export async function linhasDaFila(): Promise<LinhaDaFila[]> {
  const pubs = await publicacoesAbertas()
  const campos = 'entity, entity_id, reason, detail'
  const uniao = [`SELECT 0 AS o, id, ${campos} FROM main.review_queue`, ...pubs.map((p, i) => `SELECT ${i + 1} AS o, id, ${campos} FROM ${p.esquema}.review_queue`)].join(' UNION ALL ')
  const linhas = await executar<L>(`SELECT entity, entity_id, reason, detail FROM (${uniao}) ORDER BY o, id`)
  const itens = linhas.filter((l) => s(l.entity) === 'item' && l.entity_id != null).map((l) => s(l.entity_id)!)
  const numeros = await numerosDosItens(itens)
  return linhas.map((l) => {
    const entidade = s(l.entity)!
    const entidadeId = s(l.entity_id)
    return { tipo: s(l.reason)!, entidade, entidadeId, detalhe: s(l.detail) ?? '', numero: entidade === 'item' && entidadeId ? (numeros.get(entidadeId) ?? entidadeId) : null }
  })
}

/** Um elemento do livro (uma parte do desenho: «Testlöwe») que ainda não tem região desenhada em nenhuma imagem. */
export interface ElementoSemRegiao {
  id: string
  /** O nome em português (a proposta), senão o do livro. */
  rotulo: string
  /** O nome como está no livro (alemão). */
  rotuloDe: string
  itemId: string
  /** A imagem do item onde desenhar (a primeira); null se o item não tem imagem. */
  imagem: string | null
}

/**
 * Os elementos do livro sem nenhuma região no pacote (`element` sem `element_region`): a Revisão os lista em «Regiões a
 * desenhar», e desenhar uma região do usuário para o elemento resolve o caso (src/revisao/fila.ts). Só elementos de item (os
 * de `artifact` não têm imagem própria).
 */
export async function elementosSemRegiaoNoPacote(): Promise<ElementoSemRegiao[]> {
  const linhas = await linhasPorPublicacao(
    (esq) => `
      SELECT e.id, e.label, e.label_pt, e.target_id,
             (SELECT im.id FROM ${esq}.image im WHERE im.item_id = e.target_id ORDER BY im.ordinal, im.id LIMIT 1) AS imagem
      FROM ${esq}.element e
      WHERE e.target_type = 'item' AND NOT EXISTS (SELECT 1 FROM ${esq}.element_region r WHERE r.element_id = e.id)`,
  )
  return linhas
    .map((l) => ({ id: s(l.id)!, rotulo: s(l.label_pt) ?? s(l.label) ?? s(l.id)!, rotuloDe: s(l.label) ?? '', itemId: s(l.target_id)!, imagem: s(l.imagem) }))
    .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
}

/** Uma tradução ainda de máquina (`translation_state = 'machine'`): um trecho ou um campo do catálogo (`<item>#<categoria>`). */
export interface TraducaoNaoRevisada {
  entidade: 'passage' | 'catalog_field'
  entidadeId: string
}

/** As traduções de máquina ainda não revisadas do pacote (trechos e campos do catálogo): a lista «Traduções não revisadas». */
export async function traducoesNaoRevisadasNoPacote(): Promise<TraducaoNaoRevisada[]> {
  const linhas = await linhasPorPublicacao(
    (esq) => `
      SELECT 'passage' AS entidade, id AS entity_id FROM ${esq}.passage WHERE translation_state = 'machine'
      UNION ALL
      SELECT 'catalog_field' AS entidade, unit_id AS entity_id FROM ${esq}.catalog_field WHERE translation_state = 'machine'`,
  )
  return linhas
    .map((l): TraducaoNaoRevisada => ({ entidade: s(l.entidade) as TraducaoNaoRevisada['entidade'], entidadeId: s(l.entity_id)! }))
    .sort((x, y) => (x.entidade === y.entidade ? (x.entidadeId < y.entidadeId ? -1 : x.entidadeId > y.entidadeId ? 1 : 0) : x.entidade < y.entidade ? -1 : 1))
}

/**
 * De que objeto(s) do livro é cada trecho: os objetos dos itens que o trecho DESCREVE (`passage_item.role = 'describes'`; uma
 * introdução só os menciona e não é de objeto nenhum). Os trechos que não existem ou não descrevem nada não vêm. A hipótese
 * ancorada num trecho do livro é do objeto dele (T17-B-4).
 */
export async function numerosDosTrechos(trechos: readonly string[]): Promise<Map<string, string[]>> {
  const saida = new Map<string, string[]>()
  const unicos = [...new Set(trechos)]
  if (unicos.length === 0) return saida
  const linhas = await linhasPorPublicacao((esq) => `SELECT passage_id, item_id FROM ${esq}.passage_item WHERE role = 'describes' AND passage_id IN ${EM_IDS}`, { $ids: ids(unicos) })
  if (linhas.length === 0) return saida
  const numeros = await numerosDosItens([...new Set(linhas.map((l) => s(l.item_id)!))])
  for (const l of linhas) {
    const n = numeros.get(s(l.item_id)!)!
    const lista = saida.get(s(l.passage_id)!) ?? []
    if (!lista.includes(n)) lista.push(n)
    saida.set(s(l.passage_id)!, lista.sort())
  }
  return new Map([...saida].sort(([a], [b]) => (a < b ? -1 : 1)))
}

/** Onde um caso da fila está: o objeto (para abrir) ou o grupo da introdução, e a referência na fonte ("TESTE I: 11"). */
export interface LugarDoCaso {
  /** O número do objeto; null quando o caso é de uma introdução (sem item). */
  numero: string | null
  itemId: string | null
  /** O grupo cuja introdução tem o trecho (quando o trecho não pertence a nenhum item). */
  grupoId: string | null
  origem: string
}

/**
 * O objeto e a referência de cada caso da fila, pelo par (entidade, id): um item é ele mesmo; um trecho, uma imagem ou uma
 * citação levam ao item a que pertencem; o trecho de uma introdução leva ao grupo. Os casos sem lugar (por exemplo, o aviso
 * de um gazetteer) ficam de fora. A chave do mapa é "<entidade>|<id>".
 */
export async function lugaresDosCasos(pares: readonly { entidade: string; entidadeId: string | null }[]): Promise<Map<string, LugarDoCaso>> {
  const por = (entidade: string) => [...new Set(pares.filter((p) => p.entidade === entidade && p.entidadeId).map((p) => p.entidadeId!))]
  const pubs = await publicacoesAbertas()
  const saida = new Map<string, LugarDoCaso>()
  if (pubs.length === 0) return saida
  const paraItem = new Map<string, string>() // "entidade|id" → id do item
  for (const i of por('item')) paraItem.set(`item|${i}`, i)
  const consultar = async (entidade: string, lista: string[], sql: (esq: string) => string) => {
    if (lista.length === 0) return
    for (const l of await executar<L>(pubs.map((p) => sql(p.esquema)).join(' UNION ALL '), { $ids: ids(lista) })) {
      const chave = `${entidade}|${s(l.entity_id)}`
      if (l.item_id != null && !paraItem.has(chave)) paraItem.set(chave, s(l.item_id)!)
    }
  }
  const passagens = por('passage')
  await consultar('passage', passagens, (esq) => `SELECT passage_id AS entity_id, min(item_id) AS item_id FROM ${esq}.passage_item WHERE passage_id IN ${EM_IDS} GROUP BY passage_id`)
  await consultar('image', por('image'), (esq) => `SELECT id AS entity_id, item_id FROM ${esq}.image WHERE id IN ${EM_IDS}`)
  await consultar('bib_ref', por('bib_ref'), (esq) => `SELECT CAST(id AS TEXT) AS entity_id, item_id FROM ${esq}.bib_ref WHERE CAST(id AS TEXT) IN ${EM_IDS}`)
  // Um campo do catálogo é `<item>#<categoria>`: o item é o que vem antes do `#`.
  for (const campo of por('catalog_field')) paraItem.set(`catalog_field|${campo}`, campo.split('#')[0]!)
  await consultar(
    'hypothesis',
    por('hypothesis'),
    (esq) => `SELECT h.id AS entity_id, ${ALVO_ITEM} AS item_id FROM ${esq}.hypothesis h LEFT JOIN ${esq}.element e ON h.target_type = 'element' AND e.id = h.target_id WHERE h.id IN ${EM_IDS}`,
  )
  const itens = [...new Set(paraItem.values())]
  if (itens.length > 0) {
    const numeros = await numerosDosItens(itens)
    const origens = new Map<string, string>()
    for (const l of await executar<L>(pubs.map((p) => SQL_ITEM(p.esquema)).join(' UNION ALL '), { $ids: ids(itens) })) origens.set(s(l.id)!, origemDe(l))
    for (const [chave, itemId] of paraItem) saida.set(chave, { itemId, numero: numeros.get(itemId) ?? itemId, grupoId: null, origem: origens.get(itemId) ?? itemId })
  }
  // Os trechos sem item: a introdução de um grupo da autora.
  const soltas = passagens.filter((p) => !saida.has(`passage|${p}`))
  if (soltas.length > 0) {
    const sql = pubs.map((p) => `SELECT intro_passage_id AS entity_id, id AS grupo, publication, volume FROM ${p.esquema}.author_group WHERE intro_passage_id IN ${EM_IDS}`).join(' UNION ALL ')
    for (const l of await executar<L>(sql, { $ids: ids(soltas) })) {
      const chave = `passage|${s(l.entity_id)}`
      if (!saida.has(chave)) saida.set(chave, { itemId: null, numero: null, grupoId: s(l.grupo)!, origem: `${s(l.publication) ?? ''} ${s(l.volume) ?? ''}`.trim() + ' · introdução' })
    }
  }
  return saida
}

/** Os verbetes do pacote que ainda estão "a revisar" (o estado do pacote), com a forma original: o que a Revisão conta menos o que a pessoa já aprovou. */
export async function verbetesAReverNoPacote(): Promise<{ id: string; original: string }[]> {
  const linhas = await executar<L>("SELECT id, pt, de FROM main.glossary_entry WHERE status = 'proposed'")
  return linhas.map((l) => ({ id: s(l.id)!, original: s(l.pt) ?? s(l.de) ?? s(l.id)! }))
}

const SQL_GRUPO = (esq: string, onde: string) => `
  SELECT g.id, g.publication, g.volume, g.ordinal, g.path, g.title_de, g.title_pt, g.period_pt, g.intro_passage_id,
    (SELECT count(DISTINCT coalesce(om.object_id, gi.item_id)) FROM ${esq}.author_group_item gi
       LEFT JOIN main.object_member om ON om.item_id = gi.item_id WHERE gi.group_id = g.id) AS objetos,
    (SELECT count(*) FROM ${esq}.author_group_item gi JOIN ${esq}.image im ON im.item_id = gi.item_id
     WHERE gi.group_id = g.id) AS imagens,
    (SELECT count(*) FROM ${esq}.hypothesis h
       LEFT JOIN ${esq}.element e ON h.target_type = 'element' AND e.id = h.target_id
     WHERE ${ALVO_ITEM} IN (SELECT item_id FROM ${esq}.author_group_item WHERE group_id = g.id)) AS hipoteses,
    (SELECT json_array(im.thumb_path, im.display_mode) FROM ${esq}.author_group_item gi
       JOIN ${esq}.image im ON im.item_id = gi.item_id
     WHERE gi.group_id = g.id AND im.thumb_path IS NOT NULL ORDER BY gi.ordinal, im.ordinal LIMIT 1) AS capa
  FROM ${esq}.author_group g
  WHERE ${onde}`

function grupoDe(l: L): Grupo {
  const capa = json<[string, string | null] | null>(l.capa, null)
  return {
    id: s(l.id)!,
    publicacao: s(l.publication)!,
    volume: s(l.volume) ?? '',
    ordinal: n(l.ordinal) ?? 0,
    titulo: s(l.title_pt) ?? s(l.title_de)!,
    tituloDe: s(l.title_de)!,
    periodo: s(l.period_pt),
    caminho: json<string[]>(l.path, []),
    introducaoId: s(l.intro_passage_id),
    objetos: n(l.objetos) ?? 0,
    imagens: n(l.imagens) ?? 0,
    hipoteses: n(l.hipoteses) ?? 0,
    capa: capa ? { miniatura: capa[0], display_mode: capa[1] as ModoDeExibicao | null } : null,
  }
}

/** Os grupos da obra (todos, ou só os de uma publicação), na ordem do livro. */
export async function grupos(publicacao?: string): Promise<Grupo[]> {
  const pubs = await publicacoesAbertas()
  const ordemPub = new Map(pubs.map((p, i) => [p.sigla, i]))
  const linhas = await linhasPorPublicacao((esq) => SQL_GRUPO(esq, '($pub IS NULL OR g.publication = $pub)'), { $pub: publicacao ?? null })
  return linhas
    .map(grupoDe)
    .sort(
      (x, y) =>
        (ordemPub.get(x.publicacao) ?? 99) - (ordemPub.get(y.publicacao) ?? 99) ||
        x.volume.localeCompare(y.volume) ||
        x.ordinal - y.ordinal,
    )
}

/** Os itens do grupo, na ordem de author_group_item.ordinal. */
async function itensDoGrupo(id: string): Promise<string[]> {
  const linhas = await linhasPorPublicacao(
    (esq) => `SELECT item_id, ordinal FROM ${esq}.author_group_item WHERE group_id = $id`,
    { $id: id },
  )
  return linhas.sort((x, y) => (n(x.ordinal) ?? 0) - (n(y.ordinal) ?? 0)).map((l) => s(l.item_id)!)
}

const SQL_TRECHO = (esq: string) => `
  SELECT p.id, p.text, r.texto, r.termos FROM ${esq}.passage p
  LEFT JOIN ${esq}.unit_pt_render r ON r.unit_id = p.id WHERE p.id = $id`

async function trecho(id: string): Promise<TextoDaIntroducao | null> {
  const [l] = await linhasPorPublicacao(SQL_TRECHO, { $id: id })
  return l ? { id: s(l.id)!, texto: s(l.texto), original: s(l.text) ?? '', termos: termos(l.termos) } : null
}

export async function grupo(id: string): Promise<GrupoDetalhe | null> {
  const [l] = await linhasPorPublicacao((esq) => SQL_GRUPO(esq, 'g.id = $id'), { $id: id })
  if (!l) return null
  const g = grupoDe(l)
  return {
    ...g,
    introducao: g.introducaoId ? await trecho(g.introducaoId) : null,
    itens: await resumosDosItens(await itensDoGrupo(id), 'dada'),
  }
}

/** Os números, sem repetição, de uma lista de números ou ids de item. */
async function numerosEmOrdem(lista: readonly string[]): Promise<Numero[]> {
  const numeros = await numerosDosItens(lista)
  return [...new Set(lista.map((id) => numeros.get(id) ?? id))]
}

/** Anterior, próximo e posição ("2 / 3") do objeto no grupo ou numa lista (a da busca). null se ele não está lá. */
export async function vizinhos(numero: string, contexto: ContextoDeNavegacao): Promise<Vizinhos | null> {
  const lista = await numerosEmOrdem(contexto.tipo === 'grupo' ? await itensDoGrupo(contexto.id) : contexto.ids)
  const [alvo] = await numerosEmOrdem([numero])
  const i = lista.indexOf(alvo!)
  if (i < 0) return null
  return { anterior: lista[i - 1] ?? null, proximo: lista[i + 1] ?? null, posicao: i + 1, total: lista.length }
}

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

/** Os itens-membros do objeto (pelo número dele ou pelo id de um dos seus itens), na ordem das fontes. */
async function membros(numeroOuItem: string): Promise<{ numero: Numero; itens: L[] } | null> {
  const linhas = await executar<L>(
    `SELECT object_id, item_id FROM main.object_member
     WHERE object_id = $n OR object_id = (SELECT object_id FROM main.object_member WHERE item_id = $n)`,
    { $n: numeroOuItem },
  )
  const numero = s(linhas[0]?.object_id) ?? numeroOuItem
  const idsDosItens = linhas.length > 0 ? linhas.map((l) => s(l.item_id)!) : [numeroOuItem]
  const itens = await linhasPorPublicacao(SQL_ITEM, { $ids: ids(idsDosItens) })
  if (itens.length === 0) return null
  return { numero, itens: itens.sort(await comparadorDeFonte()) }
}

export async function item(numeroOuItem: string): Promise<ItemDetalhe | null> {
  const m = await membros(numeroOuItem)
  if (!m) return null
  const idsDosItens = m.itens.map((l) => s(l.id)!)
  const ordemDoItem = new Map(idsDosItens.map((id, i) => [id, i]))
  const porItem = (x: L, y: L, campo = 'item_id') => ordemDoItem.get(s(x[campo])!)! - ordemDoItem.get(s(y[campo])!)!
  const p = { $ids: ids(idsDosItens) }
  const origemPorItem = new Map(m.itens.map((l) => [s(l.id)!, origemDe(l)]))

  const [imagens, datacoes, afirmacoes, campos, passagens, paralelosL, bib, gruposL] = await Promise.all([
    linhasPorPublicacao((esq) => `SELECT * FROM ${esq}.image WHERE item_id IN ${EM_IDS}`, p),
    linhasPorPublicacao(
      (esq) => `SELECT d.*, (SELECT json_group_array(json_array(c.cssl_code, c.relation, c.approximate))
                  FROM (SELECT * FROM ${esq}.dating_cssl WHERE dating_id = d.id ORDER BY id) c) AS cssl
                FROM ${esq}.dating d WHERE d.subject_type = 'item' AND d.subject_id IN ${EM_IDS}`,
      p,
    ),
    linhasPorPublicacao(
      (esq, sigla) => `SELECT a.subject_id AS item_id, a.id, a.field, a.value, a.certainty, a.is_primary, a.site_id,
                  '${sigla}' AS sigla, st.literal_name, st.name_entry_id, st.lat, st.lon, g.pt AS gl_pt
                FROM ${esq}.assertion a LEFT JOIN ${esq}.site st ON st.id = a.site_id
                LEFT JOIN main.glossary_entry g ON g.id = st.name_entry_id
                WHERE a.subject_type = 'item' AND a.subject_id IN ${EM_IDS}
                  AND a.field IN ('findspot', 'context', 'holding', 'dimensions')`,
      p,
    ),
    linhasPorPublicacao(
      (esq) => `SELECT cf.*, r.texto, r.termos FROM ${esq}.catalog_field cf
                LEFT JOIN ${esq}.unit_pt_render r ON r.unit_id = cf.unit_id
                WHERE cf.item_id IN ${EM_IDS} AND (cf.category BETWEEN 3 AND 8 OR cf.category = 0)`,
      p,
    ),
    linhasPorPublicacao(
      (esq) => `SELECT pi.item_id, p.id, p.publication, p.text, p.ordinal, p.translation_state, p.translation_stale,
                  r.texto, r.termos
                FROM ${esq}.passage_item pi JOIN ${esq}.passage p ON p.id = pi.passage_id
                LEFT JOIN ${esq}.unit_pt_render r ON r.unit_id = p.id
                WHERE pi.role = 'describes' AND pi.item_id IN ${EM_IDS}`,
      p,
    ),
    linhasPorPublicacao((esq) => `SELECT * FROM ${esq}.comparison WHERE from_type = 'item' AND from_id IN ${EM_IDS}`, p),
    linhasPorPublicacao(
      (esq) => `SELECT r.*, b.chicago, b.chicago_html FROM ${esq}.bib_ref r
                LEFT JOIN main.bib_entry b ON b.id = r.bib_entry_id WHERE r.item_id IN ${EM_IDS}`,
      p,
    ),
    linhasPorPublicacao(
      (esq) => `SELECT gi.item_id, g.id, g.publication, g.volume, g.ordinal, coalesce(g.title_pt, g.title_de) AS titulo
                FROM ${esq}.author_group_item gi JOIN ${esq}.author_group g ON g.id = gi.group_id
                WHERE gi.item_id IN ${EM_IDS}`,
      p,
    ),
  ])

  // Hipóteses: as do objeto (sobre um item dele ou sobre um elemento de um item dele) e as que os
  // textos dele sustentam sobre outros alvos.
  passagens.sort((x, y) => porItem(x, y) || (n(x.ordinal) ?? 0) - (n(y.ordinal) ?? 0))
  const idsDasPassagens = passagens.map((l) => s(l.id)!)
  const todas = await hipotesesOnde(`${ALVO_ITEM} IN ${EM_IDS} OR h.passage_id IN (SELECT value FROM json_each($passagens))`, {
    ...p,
    $passagens: ids(idsDasPassagens),
  })
  const proprias = todas.filter((h) => h.alvo.itemId !== null && idsDosItens.includes(h.alvo.itemId))
  const outras = todas.filter((h) => !proprias.includes(h))

  const leituras: Leitura[] = passagens.map((l) => {
    const unidade = s(l.id)!
    const ancoras: Ancora[] = todas
      .filter((h) => h.ancora?.unidade === unidade && h.ancora.metodo === 'termo' && h.ancora.inicio !== null && h.ancora.fim !== null)
      .map((h) => ({ hipoteseId: h.id, glId: h.ancora!.glId!, inicio: h.ancora!.inicio!, fim: h.ancora!.fim!, nivel: h.nivel, modalidade: h.modalidade }))
      .sort((x, y) => x.inicio - y.inicio || x.fim - y.fim)
    return {
      fonte: origemPorItem.get(s(l.item_id)!)!,
      publicacao: s(l.publication)!,
      itemId: s(l.item_id)!,
      passagemId: unidade,
      texto: s(l.texto),
      original: s(l.text) ?? '',
      termos: termos(l.termos),
      ancoras,
      estado: s(l.translation_state) as Leitura['estado'],
      desatualizada: b(l.translation_stale),
    }
  })

  // Ficha: datação, sítio, acervo e medidas (do primeiro item que os tem; a afirmação principal primeiro).
  afirmacoes.sort((x, y) => porItem(x, y) || (n(y.is_primary) ?? 0) - (n(x.is_primary) ?? 0) || (n(x.id) ?? 0) - (n(y.id) ?? 0))
  const primeira = (campo: string) => afirmacoes.find((a) => a.field === campo)
  const achado = primeira('findspot')
  const sitio: SitioDoItem | null =
    achado && n(achado.site_id) !== null
      ? {
          id: `${s(achado.sigla)}-${n(achado.site_id)}`,
          nome: s(achado.gl_pt) ?? s(achado.literal_name) ?? s(achado.value)!,
          literal: s(achado.literal_name) ?? s(achado.value)!,
          glId: s(achado.name_entry_id),
          lat: n(achado.lat),
          lon: n(achado.lon),
          certeza: s(achado.certainty) as Certeza,
          contexto: s(afirmacoes.find((a) => a.field === 'context' && a.item_id === achado.item_id)?.value),
        }
      : null
  campos.sort((x, y) => porItem(x, y) || (n(x.category) ?? 0) - (n(y.category) ?? 0))
  const catalogo: CampoDoCatalogo[] = campos.map((l) => ({
    itemId: s(l.item_id)!,
    categoria: n(l.category)!,
    unidade: s(l.unit_id)!,
    literal: s(l.literal)!,
    texto: s(l.texto),
    termos: termos(l.termos),
    estado: s(l.translation_state) as CampoDoCatalogo['estado'],
    desatualizada: b(l.translation_stale),
  }))
  const campo = (cat: number) => catalogo.find((c) => c.categoria === cat)
  const dimensoes = primeira('dimensions')
  const medidas =
    campo(6) || dimensoes
      ? {
          texto: campo(6)?.literal ?? null,
          valores: json<{ dim?: unknown; value_cm?: unknown; qualifier?: unknown }[]>(dimensoes?.value, []).map(
            (d): Medida => ({ dim: s(d.dim) ?? '', cm: n(d.value_cm), qualificador: s(d.qualifier) }),
          ),
        }
      : null
  const descricao = campo(5) ? (campo(5)!.texto ?? campo(5)!.literal) : null

  datacoes.sort((x, y) => porItem(x, y, 'subject_id') || (n(x.id) ?? 0) - (n(y.id) ?? 0))
  imagens.sort((x, y) => porItem(x, y) || (n(x.ordinal) ?? 0) - (n(y.ordinal) ?? 0))
  paralelosL.sort((x, y) => porItem(x, y, 'from_id') || (n(x.id) ?? 0) - (n(y.id) ?? 0))
  bib.sort((x, y) => porItem(x, y) || (n(x.id) ?? 0) - (n(y.id) ?? 0))
  gruposL.sort((x, y) => porItem(x, y) || (n(x.ordinal) ?? 0) - (n(y.ordinal) ?? 0))

  // Remissões: itens citados nos textos do objeto ("cf. 2"), fora o próprio objeto.
  const mencionados = idsDasPassagens.length
    ? await linhasPorPublicacao(
        (esq) => `SELECT DISTINCT item_id FROM ${esq}.passage_item
                  WHERE role = 'mentions' AND passage_id IN ${EM_IDS} AND item_id NOT IN (SELECT value FROM json_each($itens))`,
        { $ids: ids(idsDasPassagens), $itens: p.$ids },
      )
    : []
  const alvosDosParalelos = paralelosL.filter((l) => l.to_type === 'item' && s(l.to_id)).map((l) => s(l.to_id)!)
  const idsMencionados = mencionados.map((l) => s(l.item_id)!)
  const outrosItens = [...new Set([...alvosDosParalelos, ...idsMencionados])]
  const [numerosDeOutros, existentes] = await Promise.all([
    numerosDosItens(outrosItens),
    outrosItens.length ? linhasPorPublicacao(SQL_ITEM, { $ids: ids(outrosItens) }) : Promise.resolve([]),
  ])
  const origemDeOutro = new Map(existentes.map((l) => [s(l.id)!, origemDe(l)]))
  const ordenarFonte = await comparadorDeFonte()
  // As que apontam para um item fora do pacote (órfãs) ficam no fim, com número e origem nulos.
  const remissoes: Remissao[] = [
    ...existentes.filter((l) => idsMencionados.includes(s(l.id)!)).sort(ordenarFonte),
    ...idsMencionados.filter((id) => !origemDeOutro.has(id)).map((id): L => ({ id })),
  ].map((l) => {
    const id = s(l.id)!
    return { itemId: id, numero: origemDeOutro.has(id) ? numerosDeOutros.get(id)! : null, origem: origemDeOutro.get(id) ?? null }
  })
  const paralelos: Paralelo[] = paralelosL.map((l) => {
    const alvo = l.to_type === 'external' ? null : s(l.to_id)
    return {
      grau: s(l.degree) as Paralelo['grau'],
      numero: alvo ? (origemDeOutro.has(alvo) ? numerosDeOutros.get(alvo)! : null) : null,
      itemId: alvo,
      externo: s(l.to_external),
      semelhanca: s(l.similarity),
      locator: s(l.locator),
    }
  })

  const vistosGrupos = new Set<string>()
  const gruposDoObjeto = gruposL
    .filter((l) => !vistosGrupos.has(s(l.id)!) && vistosGrupos.add(s(l.id)!))
    .map((l) => ({ id: s(l.id)!, titulo: s(l.titulo)! }))

  return {
    numero: m.numero,
    itens: m.itens.map((l): ItemDaFonte => ({ id: s(l.id)!, publicacao: s(l.publication)!, tipo: s(l.kind) as ItemDaFonte['tipo'], origem: origemDe(l), referencia: referenciaDe(l) })),
    origem: origemDe(m.itens[0]!),
    tipo: tipoCurto(descricao),
    descricao,
    datacoes: datacoes.map(
      (l): Datacao => ({
        itemId: s(l.subject_id)!,
        esquema: s(l.scheme)!,
        periodoDe: s(l.period_from),
        periodoAte: s(l.period_to),
        qualificador: s(l.qualifier),
        anoDe: n(l.year_from),
        anoAte: n(l.year_to),
        aproximada: b(l.approximate),
        certeza: s(l.certainty) as Certeza,
        motivo: s(l.reason),
        cssl: json<[string, string, number][]>(l.cssl, []).map(
          ([codigo, relacao, aprox]): DatacaoCssl => ({ codigo, relacao: relacao as DatacaoCssl['relacao'], aproximada: aprox === 1 }),
        ),
      }),
    ),
    sitio,
    medidas,
    acervo: s(primeira('holding')?.value),
    imagens: imagens.map(imagemDe),
    leituras,
    catalogo,
    hipotesesPorNivel: porNivel(proprias),
    outrasHipoteses: outras,
    relacoes: { paralelos, remissoes },
    bibliografia: bib.map(
      (l): ReferenciaBibliografica => ({
        id: n(l.id)!,
        itemId: s(l.item_id),
        categoria: n(l.category),
        bruto: s(l.raw)!,
        curta: s(l.short_cite),
        paginas: s(l.pages),
        obraId: s(l.bib_entry_id),
        resolvida: l.status === 'resolved',
        chicago: s(l.chicago),
        chicagoHtml: s(l.chicago_html),
        hipoteseId: s(l.hypothesis_id),
        passagemId: s(l.passage_id),
      }),
    ),
    grupos: gruposDoObjeto,
  }
}

// ---------------------------------------------------------------------------
// Glossário, bibliografia, sítios e regiões
// ---------------------------------------------------------------------------

function verbeteResumoDe(l: L): VerbeteResumo {
  return {
    id: s(l.id)!,
    tipo: s(l.kind) as VerbeteResumo['tipo'],
    pt: s(l.pt),
    de: s(l.de),
    status: s(l.status) as VerbeteResumo['status'],
  }
}

/**
 * Todos os verbetes, em ordem alfabética da forma em português, cada um com o inglês e a
 * contagem de objetos (a mesma de `verbete(id).objetos`: hipótese no termo, ou achado no sítio de mesmo nome).
 */
export async function verbetes(): Promise<VerbeteDaLista[]> {
  const pares = porPublicacao(
    await publicacoesAbertas(),
    (esq) => `SELECT ht.glossary_id AS gl, ${ALVO_ITEM} AS item_id
              FROM ${esq}.hypothesis_term ht JOIN ${esq}.hypothesis h ON h.id = ht.hypothesis_id
              LEFT JOIN ${esq}.element e ON h.target_type = 'element' AND e.id = h.target_id
              UNION ALL
              SELECT st.name_entry_id, a.subject_id FROM ${esq}.assertion a JOIN ${esq}.site st ON st.id = a.site_id
              WHERE a.subject_type = 'item' AND a.field = 'findspot' AND st.name_entry_id IS NOT NULL`,
  )
  const linhas = await executar<L>(
    `SELECT g.id, g.kind, g.pt, g.de, g.en, g.status,
       ${pares ? `(SELECT count(DISTINCT coalesce(om.object_id, p.item_id)) FROM (${pares}) p
                    LEFT JOIN main.object_member om ON om.item_id = p.item_id WHERE p.gl = g.id AND p.item_id IS NOT NULL)` : '0'} AS objetos
     FROM main.glossary_entry g`,
  )
  return linhas
    .map((l): VerbeteDaLista => ({ ...verbeteResumoDe(l), en: s(l.en), objetos: n(l.objetos) ?? 0 }))
    .sort((x, y) => (x.pt ?? x.de ?? '').localeCompare(y.pt ?? y.de ?? '', 'pt'))
}

/**
 * Os redirecionamentos do pacote (Tarefa 16; `redirecionamento` do comum.sqlite, schema 6): o verbete ou o sítio que a pessoa
 * criou e o pipeline publicou com um id do livro. Um pacote do schema 5 não tem a tabela: nenhum. `verbeteExiste`: o destino
 * é um verbete do pacote (m7; o de um sítio quem confere é src/pacote/redirecionamentos.ts, pela lista dos sítios).
 */
export async function redirecionamentos(): Promise<{ de: string; para: string; tipo: string; verbeteExiste: boolean; criado: boolean }[]> {
  const [t] = await executar<L>("SELECT count(*) AS n FROM main.sqlite_master WHERE type = 'table' AND name = 'redirecionamento'")
  if (!n(t?.n)) return []
  // `criado` (decisão 50; revisão 2 da Tarefa 16): o destino foi criado do registro do usuário. Uma tabela sem a coluna
  // (a da revisão 1, nunca publicada) conta como 0: a página do livro não diz «veio de você».
  const [c] = await executar<L>("SELECT count(*) AS n FROM pragma_table_info('redirecionamento', 'main') WHERE name = 'criado'")
  const criado = n(c?.n) ? 'r.criado' : '0'
  const linhas = await executar<L>(
    `SELECT r.de, r.para, r.tipo, ${criado} AS criado, EXISTS (SELECT 1 FROM main.glossary_entry g WHERE g.id = r.para) AS existe FROM main.redirecionamento r ORDER BY r.de`,
  )
  return linhas.map((l) => ({ de: s(l.de) ?? '', para: s(l.para) ?? '', tipo: s(l.tipo) ?? '', verbeteExiste: !!n(l.existe), criado: n(l.criado) === 1 }))
}

/** A tabela existe no comum.sqlite? (As do schema 8 faltam num pacote 5–7: quem lê dá a lista vazia, F11.) */
async function tabelaDoComum(nome: string): Promise<boolean> {
  const [t] = await executar<L>("SELECT count(*) AS n FROM main.sqlite_master WHERE type = 'table' AND name = $nome", { $nome: nome })
  return !!n(t?.n)
}

/** As partes dos sítios gravadas pelo processamento (`sitio_parte`, schema 8): parte → todo. [] num pacote 5–7. */
export async function partesDoPacote(): Promise<{ parte: string; todo: string }[]> {
  if (!(await tabelaDoComum('sitio_parte'))) return []
  const linhas = await executar<L>('SELECT parte, todo FROM main.sitio_parte ORDER BY parte')
  return linhas.flatMap((l) => (s(l.parte) && s(l.todo) ? [{ parte: s(l.parte)!, todo: s(l.todo)! }] : []))
}

/**
 * As grafias dos sítios (`sitio_grafia`, schema 8): as dos livros (`origem = 'livro'`, com sigla e página) e as que a pessoa
 * deu e o processamento publicou (`'usuario'`; o app lê as da pessoa só da camada, F12). Uma tradição fora da lista vira
 * null. [] num pacote 5–7.
 */
export async function grafiasDoPacote(): Promise<GrafiaDoPacote[]> {
  if (!(await tabelaDoComum('sitio_grafia'))) return []
  const linhas = await executar<L>('SELECT sitio, texto, tradicao, sigla, pagina, origem FROM main.sitio_grafia ORDER BY rowid')
  return linhas.flatMap((l): GrafiaDoPacote[] => {
    const sitio = s(l.sitio)
    const texto = s(l.texto)
    const origem = s(l.origem)
    if (!sitio || !texto || (origem !== 'livro' && origem !== 'usuario')) return []
    const tradicao = s(l.tradicao)
    return [{ sitio, texto, tradicao: tradicao !== null && tradicaoValida(tradicao) ? tradicao : null, sigla: s(l.sigla), pagina: s(l.pagina), origem }]
  })
}

/** Os pares de sítios que podem ser o mesmo lugar (`sitio_par_sugerido`, schema 8; `a < b`), na ordem do pacote. [] num pacote 5–7. */
export async function paresSugeridos(): Promise<ParSugerido[]> {
  if (!(await tabelaDoComum('sitio_par_sugerido'))) return []
  const linhas = await executar<L>('SELECT a, b, motivo FROM main.sitio_par_sugerido ORDER BY a, b')
  return linhas.flatMap((l): ParSugerido[] => {
    const motivo = s(l.motivo)
    if (!s(l.a) || !s(l.b) || (motivo !== 'coordenada' && motivo !== 'nome' && motivo !== 'variante')) return []
    return [{ a: s(l.a)!, b: s(l.b)!, motivo }]
  })
}

/**
 * O `pt` (a forma de verbete, a etiqueta, que pode levar glosa) e o `pt_text` (a de texto corrido, quando há) de cada
 * verbete do pacote. A forma em uso do usuário (Tarefa 11) compara-se com estas (src/glossario/exibirTermo.ts).
 */
export async function formasDosVerbetes(): Promise<{ id: string; pt: string | null; ptTexto: string | null }[]> {
  const linhas = await executar<L>('SELECT id, pt, pt_text FROM main.glossary_entry')
  return linhas.map((l) => ({ id: s(l.id)!, pt: s(l.pt), ptTexto: s(l.pt_text) }))
}

export async function verbete(glId: string): Promise<Verbete | null> {
  const [l] = await executar<L>(
    `SELECT g.*, pai.pt AS pai_pt,
       (SELECT json_group_array(json_array(j.value, ic.pt, ic.de, ic.en)) FROM json_each(g.iconclass) j
          LEFT JOIN main.iconclass ic ON ic.notation = j.value) AS iconclass_json,
       (SELECT json_group_array(json_array(j.value, ss.label_en)) FROM json_each(g.sssl) j
          LEFT JOIN main.sssl ss ON ss.code = j.value) AS sssl_json
     FROM main.glossary_entry g LEFT JOIN main.glossary_entry pai ON pai.id = g.parent_id
     WHERE g.id = $id`,
    { $id: glId },
  )
  if (!l) return null
  const hipoteses = await hipotesesOnde((esq) => `h.id IN (SELECT hypothesis_id FROM ${esq}.hypothesis_term WHERE glossary_id = $id)`, {
    $id: glId,
  })
  const noSitio = await linhasPorPublicacao(
    (esq) => `SELECT DISTINCT a.subject_id AS item_id FROM ${esq}.assertion a JOIN ${esq}.site st ON st.id = a.site_id
              WHERE a.subject_type = 'item' AND a.field = 'findspot' AND st.name_entry_id = $id`,
    { $id: glId },
  )
  const itens = [...hipoteses.map((h) => h.alvo.itemId), ...noSitio.map((x) => s(x.item_id))].filter((x): x is string => x !== null)
  return {
    ...verbeteResumoDe(l),
    ptTexto: s(l.pt_text),
    ptProposta: s(l.pt_proposed),
    genero: s(l.pt_gender) as Verbete['genero'],
    numeroGramatical: s(l.pt_number) as Verbete['numeroGramatical'],
    en: s(l.en),
    ar: s(l.ar),
    he: s(l.he),
    variantes: json<string[]>(l.variants, []),
    definicao: s(l.definition),
    pai: s(l.parent_id) ? { id: s(l.parent_id)!, pt: s(l.pai_pt) } : null,
    iconclass: json<[string, string | null, string | null, string | null][]>(l.iconclass_json, []).map(([notacao, pt, de, en]) => ({ notacao, pt, de, en })),
    sssl: json<[string, string | null][]>(l.sssl_json, []).map(([codigo, rotulo]) => ({ codigo, rotulo })),
    hipoteses,
    objetos: await resumosDosItens(itens, 'fonte'),
  }
}

/** Primeira citação curta de bib_entry.short_cites ({"TESTE": ["Autor 1999"]}). */
function citadaComoDe(texto: unknown): Record<string, string[]> {
  const dados = json<Record<string, unknown>>(texto, {})
  return Object.fromEntries(
    Object.entries(dados).map(([sigla, v]) => [sigla, Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []]),
  )
}
const primeiraCitacao = (c: Record<string, string[]>) => Object.values(c).flat()[0] ?? null
const tituloDoCsl = (csl: Record<string, unknown> | null) => (csl && typeof csl.title === 'string' ? csl.title : null)

const SQL_REFS = (esq: string) => `SELECT bib_entry_id, item_id FROM ${esq}.bib_ref WHERE bib_entry_id IS NOT NULL AND item_id IS NOT NULL`

/** As obras da bibliografia, pela citação curta, com quantos objetos citam cada uma. */
export async function obras(): Promise<ObraResumo[]> {
  const refs = porPublicacao(await publicacoesAbertas(), SQL_REFS)
  const linhas = await executar<L>(
    `SELECT b.id, b.csl_json, b.short_cites,
       ${refs ? `(SELECT count(DISTINCT coalesce(om.object_id, r.item_id)) FROM (${refs}) r
                  LEFT JOIN main.object_member om ON om.item_id = r.item_id WHERE r.bib_entry_id = b.id)` : '0'} AS objetos
     FROM main.bib_entry b`,
  )
  return linhas
    .map((l): ObraResumo => {
      const csl = json<Record<string, unknown> | null>(l.csl_json, null)
      return { id: s(l.id)!, curta: primeiraCitacao(citadaComoDe(l.short_cites)), titulo: tituloDoCsl(csl), objetos: n(l.objetos) ?? 0 }
    })
    .sort((x, y) => (x.curta ?? x.id).localeCompare(y.curta ?? y.id, 'pt'))
}

export async function obra(bibId: string): Promise<Obra | null> {
  const [l] = await executar<L>('SELECT * FROM main.bib_entry WHERE id = $id', { $id: bibId })
  if (!l) return null
  const csl = json<Record<string, unknown> | null>(l.csl_json, null)
  const citadaComo = citadaComoDe(l.short_cites)
  const refs = await linhasPorPublicacao((esq) => `SELECT item_id FROM ${esq}.bib_ref WHERE bib_entry_id = $id AND item_id IS NOT NULL`, { $id: bibId })
  return {
    id: s(l.id)!,
    curta: primeiraCitacao(citadaComo),
    titulo: tituloDoCsl(csl),
    chicago: s(l.chicago),
    chicagoHtml: s(l.chicago_html),
    citadaComo,
    origem: s(l.origin),
    csl,
    objetos: await resumosDosItens([...new Set(refs.map((r) => s(r.item_id)!))], 'fonte'),
  }
}

const SQL_SITIO = (esq: string, sigla: string, onde: string) => `
  SELECT '${sigla}' AS sigla, st.*, g.pt AS gl_pt, g.parent_id AS regiao_id, coalesce(pai.pt, pai.de) AS regiao_nome,
    (SELECT count(DISTINCT coalesce(om.object_id, a.subject_id)) FROM ${esq}.assertion a
       LEFT JOIN main.object_member om ON om.item_id = a.subject_id
     WHERE a.site_id = st.id AND a.subject_type = 'item' AND a.field = 'findspot') AS objetos
  FROM ${esq}.site st LEFT JOIN main.glossary_entry g ON g.id = st.name_entry_id
  LEFT JOIN main.glossary_entry pai ON pai.id = g.parent_id
  WHERE ${onde}`

function sitioResumoDe(l: L): SitioResumo {
  return {
    id: `${s(l.sigla)}-${n(l.id)}`,
    nome: s(l.gl_pt) ?? s(l.literal_name)!,
    literal: s(l.literal_name)!,
    glId: s(l.name_entry_id),
    lat: n(l.lat),
    lon: n(l.lon),
    regiao: s(l.regiao_id) ? { id: s(l.regiao_id)!, nome: s(l.regiao_nome) ?? s(l.regiao_id)! } : null,
    objetos: n(l.objetos) ?? 0,
  }
}

/** Os sítios de todas as publicações, em ordem alfabética. O id é "<SIGLA>-<n>". */
export async function sitios(): Promise<SitioResumo[]> {
  const linhas = await linhasPorPublicacao((esq, sigla) => SQL_SITIO(esq, sigla, '1'))
  return linhas.map(sitioResumoDe).sort((x, y) => x.nome.localeCompare(y.nome, 'pt'))
}

export async function sitio(id: string): Promise<Sitio | null> {
  const partes = /^(.+)-(\d+)$/.exec(id)
  const pub = partes && (await publicacoesAbertas()).find((p) => p.sigla === partes[1])
  if (!partes || !pub) return null
  const [l] = await executar<L>(SQL_SITIO(pub.esquema, pub.sigla, 'st.id = $id'), { $id: Number(partes[2]) })
  if (!l) return null
  const itens = await executar<L>(
    `SELECT DISTINCT subject_id AS item_id FROM ${pub.esquema}.assertion
     WHERE site_id = $id AND subject_type = 'item' AND field = 'findspot'`,
    { $id: Number(partes[2]) },
  )
  const { id: idDoSitio, nome, literal, glId, lat, lon, regiao } = sitioResumoDe(l)
  return {
    id: idDoSitio,
    nome,
    literal,
    glId,
    lat,
    lon,
    regiao,
    gradeRef: s(l.grid_ref),
    metodo: s(l.coord_method) as Sitio['metodo'],
    fonteDaCoordenada: s(l.coord_source),
    notaDaCoordenada: s(l.coord_note),
    nota: s(l.note),
    objetos: await resumosDosItens(itens.map((x) => s(x.item_id)!), 'fonte'),
  }
}

/**
 * Os objetos do livro achados em cada um destes sítios (`<SIGLA>-<n>`; um `SI-…` ou um id estranho fica vazio), uma consulta
 * por publicação (`site_id IN (…)`). Cada objeto aparece uma vez, no primeiro sítio da lista em que o livro o põe (a lista vem
 * do topo para baixo: o todo, depois as partes; ou o destino, depois os absorvidos). Cada sítio pedido tem a sua entrada, na
 * ordem pedida; os objetos de cada um na ordem das fontes.
 */
export async function objetosDosSitios(idsDosSitios: readonly string[]): Promise<Map<string, ObjetoResumo[]>> {
  const saida = new Map<string, ObjetoResumo[]>(idsDosSitios.map((id) => [id, []]))
  const pubs = await publicacoesAbertas()
  const posicao = new Map<string, number>()
  idsDosSitios.forEach((id, i) => {
    if (!posicao.has(id)) posicao.set(id, i)
  })
  // item → o sítio pedido mais perto do topo em que ele está
  const sitioDoItem = new Map<string, string>()
  for (const p of pubs) {
    const numeros = idsDosSitios.flatMap((id) => {
      const partes = /^(.+)-(\d+)$/.exec(id)
      return partes && partes[1] === p.sigla ? [Number(partes[2])] : []
    })
    if (numeros.length === 0) continue
    const linhas = await executar<L>(
      `SELECT DISTINCT subject_id AS item_id, site_id FROM ${p.esquema}.assertion
       WHERE site_id IN ${EM_IDS} AND subject_type = 'item' AND field = 'findspot'`,
      { $ids: JSON.stringify(numeros) },
    )
    for (const l of linhas) {
      const item = s(l.item_id)!
      const sitio = `${p.sigla}-${n(l.site_id)}`
      const atual = sitioDoItem.get(item)
      if (atual === undefined || posicao.get(sitio)! < posicao.get(atual)!) sitioDoItem.set(item, sitio)
    }
  }
  if (sitioDoItem.size === 0) return saida
  const resumos = await resumosDosItens([...sitioDoItem.keys()], 'fonte')
  // Um objeto de vários itens: vale o sítio mais perto do topo entre os dos itens dele.
  const sitioDoObjeto = new Map<string, string>()
  const numeros = await numerosDosItens([...sitioDoItem.keys()])
  for (const [item, sitio] of sitioDoItem) {
    const numero = numeros.get(item)!
    const atual = sitioDoObjeto.get(numero)
    if (atual === undefined || posicao.get(sitio)! < posicao.get(atual)!) sitioDoObjeto.set(numero, sitio)
  }
  for (const r of resumos) saida.get(sitioDoObjeto.get(r.numero)!)?.push(r)
  return saida
}

/** `<polygon points="x,y x,y …"/>` → [[x, y], …]; vazio se o formato não é esse. */
export function pontosDoSeletor(selector: string): [number, number][] {
  const pontos = /points\s*=\s*"([^"]*)"/.exec(selector)?.[1]
  if (!pontos) return []
  const pares = pontos
    .trim()
    .split(/\s+/)
    .map((par) => par.split(',').map(Number))
  return pares.every((p) => p.length === 2 && p.every(Number.isFinite)) ? (pares as [number, number][]) : []
}

/** As regiões desenhadas na imagem, com o nome do elemento. */
export async function regioes(imagemId: string): Promise<Regiao[]> {
  const linhas = await linhasPorPublicacao(
    (esq) => `SELECT r.id, r.element_id, r.selector, e.label, e.label_pt FROM ${esq}.element_region r
              JOIN ${esq}.element e ON e.id = r.element_id WHERE r.image_id = $id`,
    { $id: imagemId },
  )
  return linhas
    .sort((x, y) => (n(x.id) ?? 0) - (n(y.id) ?? 0))
    .map((l) => ({
      id: n(l.id)!,
      elementoId: s(l.element_id)!,
      elemento: s(l.label_pt) ?? s(l.label)!,
      elementoDe: s(l.label)!,
      selector: s(l.selector)!,
      pontos: pontosDoSeletor(s(l.selector)!),
    }))
}

/** Uma região do pacote para a exportação W3C (Tarefa 15; src/usuario/exportar.ts). */
export interface RegiaoDoLivroParaExportar {
  sigla: string
  elementoId: string
  rotulo: string | null
  rotuloDe: string
  imagem: string
  seletor: string
}

export interface DadosDoLivroParaRegioes {
  regioes: RegiaoDoLivroParaExportar[]
  /** O tamanho em pixels (`width_px`, `height_px`: o quadro da figura antes do giro) das imagens das regiões e das pedidas. */
  tamanhos: Map<string, { largura: number; altura: number }>
  /** Os verbetes das hipóteses do livro sobre cada elemento (`EL-…` → `GL-…`, na ordem da hipótese e do termo). */
  termosDosElementos: Map<string, string[]>
  /** Os elementos pedidos (onde o usuário desenhou): a obra e os rótulos. */
  elementos: Map<string, { sigla: string; rotulo: string | null; rotuloDe: string }>
  /** Por sigla: a obra ("TESTE I"), os autores e a língua (`publication.language`). */
  publicacoes: Map<string, { obra: string; autores: string[]; lingua: string | null }>
}

/**
 * Todas as regiões desenhadas no pacote (`element_region` com o rótulo do elemento), em ordem de (sigla, elemento,
 * imagem). Sozinha: a tela Exportar só as conta.
 */
export async function regioesDoLivro(): Promise<RegiaoDoLivroParaExportar[]> {
  const linhas = await linhasPorPublicacao(
    (esq, sigla) => `SELECT '${sigla}' AS sigla, r.element_id, r.selector, r.image_id, e.label, e.label_pt
                     FROM ${esq}.element_region r JOIN ${esq}.element e ON e.id = r.element_id`,
  )
  const ordem = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  return linhas
    .map((l) => ({
      sigla: s(l.sigla)!,
      elementoId: s(l.element_id)!,
      rotulo: s(l.label_pt),
      rotuloDe: s(l.label) ?? '',
      imagem: s(l.image_id)!,
      seletor: s(l.selector) ?? '',
    }))
    .sort((a, b) => ordem(a.sigla, b.sigla) || ordem(a.elementoId, b.elementoId) || ordem(a.imagem, b.imagem))
}

/**
 * O que a exportação das regiões (W3C Web Annotation) precisa do pacote: todas as regiões desenhadas, o tamanho das imagens
 * (as das regiões e as `imagens` pedidas: imagens do livro onde o usuário desenhou), os verbetes ligados aos elementos pelas
 * hipóteses do livro, os `elementos` pedidos (os do livro sobre os quais o usuário desenhou) e cada publicação.
 */
export async function regioesDoLivroParaExportar(imagens: readonly string[], elementos: readonly string[] = []): Promise<DadosDoLivroParaRegioes> {
  const regioes = await regioesDoLivro()
  const pedidas = [...new Set([...regioes.map((r) => r.imagem), ...imagens])]
  const tamanhos = new Map<string, { largura: number; altura: number }>()
  if (pedidas.length > 0) {
    const ims = await linhasPorPublicacao((esq) => `SELECT id, width_px, height_px FROM ${esq}.image WHERE id IN ${EM_IDS}`, { $ids: ids(pedidas) })
    for (const l of ims) {
      const largura = n(l.width_px)
      const altura = n(l.height_px)
      if (largura && altura && largura > 0 && altura > 0) tamanhos.set(s(l.id)!, { largura, altura })
    }
  }
  const termos = await linhasPorPublicacao(
    (esq) => `SELECT h.target_id, h.id AS hipotese, t.glossary_id, t.ordinal FROM ${esq}.hypothesis h
              JOIN ${esq}.hypothesis_term t ON t.hypothesis_id = h.id WHERE h.target_type = 'element'`,
  )
  termos.sort((a, b) => (s(a.hipotese)! < s(b.hipotese)! ? -1 : s(a.hipotese)! > s(b.hipotese)! ? 1 : (n(a.ordinal) ?? 0) - (n(b.ordinal) ?? 0)))
  const termosDosElementos = new Map<string, string[]>()
  for (const l of termos) {
    const el = s(l.target_id)!
    const lista = termosDosElementos.get(el) ?? []
    if (!lista.includes(s(l.glossary_id)!)) lista.push(s(l.glossary_id)!)
    termosDosElementos.set(el, lista)
  }
  const doElemento = new Map<string, { sigla: string; rotulo: string | null; rotuloDe: string }>()
  const unicos = [...new Set(elementos)]
  if (unicos.length > 0) {
    const els = await linhasPorPublicacao((esq, sigla) => `SELECT '${sigla}' AS sigla, id, label, label_pt FROM ${esq}.element WHERE id IN ${EM_IDS}`, { $ids: ids(unicos) })
    for (const l of els) doElemento.set(s(l.id)!, { sigla: s(l.sigla)!, rotulo: s(l.label_pt), rotuloDe: s(l.label) ?? '' })
  }
  const pubs = await linhasPorPublicacao((esq) => `SELECT sigla, authors, volume, language FROM ${esq}.publication`)
  const publicacoes = new Map<string, { obra: string; autores: string[]; lingua: string | null }>()
  for (const l of pubs) {
    const autores = json<unknown[]>(l.authors, []).filter((a): a is string => typeof a === 'string' && a.trim() !== '')
    publicacoes.set(s(l.sigla)!, { obra: `${s(l.sigla) ?? ''} ${s(l.volume) ?? ''}`.trim(), autores, lingua: s(l.language)?.trim() || null })
  }
  return { regioes, tamanhos, termosDosElementos, elementos: doElemento, publicacoes }
}

/**
 * O localizador de cada objeto do pacote (CA…) no estilo do `hypothesis.locator` do pacote, para o MEDIATION (Tarefa 15):
 * "TESTE I, Nr. 3" (uma figura da introdução: "Abb."); um objeto com vários itens, os itens separados por "; ", na ordem
 * das fontes. Objetos que o pacote não conhece ficam de fora.
 */
export async function localizadoresDosObjetos(numeros: readonly string[]): Promise<Map<string, string>> {
  const saida = new Map<string, string>()
  const pedidos = [...new Set(numeros)]
  if (pedidos.length === 0) return saida
  const membrosL = await executar<L>(`SELECT object_id, item_id FROM main.object_member WHERE object_id IN ${EM_IDS}`, { $ids: ids(pedidos) })
  if (membrosL.length === 0) return saida
  const objetoDoItem = new Map(membrosL.map((l) => [s(l.item_id)!, s(l.object_id)!]))
  const itens = await linhasPorPublicacao(SQL_ITEM, { $ids: ids([...objetoDoItem.keys()]) })
  itens.sort(await comparadorDeFonte())
  const doObjeto = new Map<string, string[]>()
  for (const l of itens) {
    const obj = objetoDoItem.get(s(l.id)!)
    if (!obj) continue
    const ref = referenciaDe(l)
    doObjeto.set(obj, [...(doObjeto.get(obj) ?? []), `${ref.obra}, ${ref.abb ? 'Abb.' : 'Nr.'} ${ref.numero}${ref.sufixo ?? ''}`])
  }
  for (const [obj, lista] of doObjeto) saida.set(obj, lista.join('; '))
  return saida
}

/** Um elemento da imagem de um objeto (`element`), para "Sobre" da nova hipótese (Tarefa 10). */
export interface ElementoDoObjeto {
  id: string
  /** Em português, senão como no texto. */
  rotulo: string
  rotuloDe: string
  pai: string | null
}

/** Os elementos dos itens do objeto (os do artefato não entram: o app ainda não mostra artefatos), na ordem do id. */
export async function elementosDoObjeto(numero: string): Promise<ElementoDoObjeto[]> {
  const m = await membros(numero)
  if (!m) return []
  const linhas = await linhasPorPublicacao(
    (esq) => `SELECT id, label, label_pt, parent_id FROM ${esq}.element WHERE target_type = 'item' AND target_id IN ${EM_IDS}`,
    { $ids: ids(m.itens.map((l) => s(l.id)!)) },
  )
  return linhas
    .map((l) => ({ id: s(l.id)!, rotulo: s(l.label_pt) ?? s(l.label) ?? s(l.id)!, rotuloDe: s(l.label) ?? '', pai: s(l.parent_id) }))
    .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
}

/** Quantas imagens do livro o objeto tem (todas as fontes). O visualizador de uma imagem do usuário põe as dela depois destas. */
/** Os números de todos os objetos do pacote (a tabela `object`: só objetos dos livros), para a numeração SKC (Tarefa 9). */
export async function numerosDosObjetos(): Promise<string[]> {
  const linhas = await executar<L>('SELECT id FROM main.object')
  return linhas.map((l) => s(l.id)!).filter(Boolean)
}

/**
 * As referências de origem (obra, número; decisão 39) de todos os itens dos objetos de livro dados, na ordem das fontes
 * (a do cabeçalho do Item): a parte dos livros da linha "números nas fontes" (decisão 38), para `formatarReferencias`.
 * Números sem item no pacote ficam de fora.
 */
export async function fontesDosObjetos(numeros: readonly string[]): Promise<ReferenciaDeFonte[]> {
  if (numeros.length === 0) return []
  const membros = await executar<L>(`SELECT object_id, item_id FROM main.object_member WHERE object_id IN ${EM_IDS}`, { $ids: ids(numeros) })
  // Por número: sem linhas de membro, o "número" pode ser o próprio item (como em quantasImagensDoObjeto).
  const comMembros = new Set(membros.map((m) => s(m.object_id)!))
  const doItem = [...membros.map((m) => s(m.item_id)!), ...numeros.filter((nr) => !comMembros.has(nr))]
  const itens = await linhasPorPublicacao(SQL_ITEM, { $ids: ids(doItem) })
  return itens.sort(await comparadorDeFonte()).map(referenciaDe)
}

// ---------------------------------------------------------------------------
// Citações no texto do usuário (decisão 40)
// ---------------------------------------------------------------------------

/** As obras de cada publicação aberta, com o volume ("TESTE I"), como as referências de origem as escrevem. */
export async function obrasDoPacote(): Promise<string[]> {
  const linhas = await linhasPorPublicacao(
    (esq) => `SELECT DISTINCT i.publication AS sigla, coalesce(i.volume, p.volume) AS volume FROM ${esq}.item i LEFT JOIN ${esq}.publication p ON p.sigla = i.publication`,
  )
  return [...new Set(linhas.map((l) => `${s(l.sigla) ?? ''} ${s(l.volume) ?? ''}`.trim()).filter(Boolean))]
}

/**
 * O objeto de cada referência de livro citada (decisão 40), pela `chaveDaFonte`: a mesma correspondência da busca exata
 * (obra com o volume, número, letra, Abb.). Uma referência sem item no pacote fica de fora. Uma consulta só, pelos números.
 */
export async function objetosDasFontes(refs: readonly Pick<ReferenciaDeFonte, 'obra' | 'numero' | 'sufixo' | 'abb'>[]): Promise<Map<string, Numero>> {
  const pedidas = new Set(refs.map((r) => chaveDaFonte(r.obra, r.numero, r.sufixo ?? '', !!r.abb)))
  const achados = new Map<string, Numero>()
  if (pedidas.size === 0) return achados
  const linhas = await linhasPorPublicacao(
    (esq) => `SELECT i.id, i.publication, i.kind, i.number, i.suffix, coalesce(i.volume, p.volume) AS volume
              FROM ${esq}.item i LEFT JOIN ${esq}.publication p ON p.sigla = i.publication
              WHERE i.kind IN ('catalog', 'intro_figure') AND i.number IN (SELECT value FROM json_each($numeros))`,
    { $numeros: JSON.stringify([...new Set(refs.map((r) => r.numero))]) },
  )
  const doItem = new Map<string, string>()
  for (const l of linhas) {
    const r = referenciaDe(l)
    const chave = chaveDaFonte(r.obra, r.numero, r.sufixo ?? '', !!r.abb)
    if (pedidas.has(chave) && !doItem.has(chave)) doItem.set(chave, s(l.id)!)
  }
  const numeros = await numerosDosItens([...doItem.values()])
  for (const chave of pedidas) {
    const item = doItem.get(chave)
    if (item) achados.set(chave, numeros.get(item)!)
  }
  return achados
}

export async function quantasImagensDoObjeto(numero: string): Promise<number> {
  const membros = await executar<L>('SELECT item_id FROM main.object_member WHERE object_id = $n', { $n: numero })
  const itens = membros.length > 0 ? membros.map((m) => s(m.item_id)!) : [numero]
  const contagens = await linhasPorPublicacao((esq) => `SELECT count(*) AS n FROM ${esq}.image WHERE item_id IN ${EM_IDS}`, { $ids: ids(itens) })
  return contagens.reduce((soma, c) => soma + (n(c.n) ?? 0), 0)
}

/** Uma imagem pelo id, com o número do objeto e quantas imagens o objeto tem (o visualizador). */
export async function imagem(id: string): Promise<(Imagem & { numero: Numero; total: number }) | null> {
  const [linha] = await linhasPorPublicacao((esq) => `SELECT * FROM ${esq}.image WHERE id = $id`, { $id: id })
  if (!linha) return null
  const img = imagemDe(linha)
  const numero = (await numerosDosItens([img.itemId])).get(img.itemId)!
  const membros = await executar<L>('SELECT item_id FROM main.object_member WHERE object_id = $n', { $n: numero })
  const itens = membros.length > 0 ? membros.map((m) => s(m.item_id)!) : [img.itemId]
  const contagens = await linhasPorPublicacao((esq) => `SELECT count(*) AS n FROM ${esq}.image WHERE item_id IN ${EM_IDS}`, { $ids: ids(itens) })
  return { ...img, numero, total: contagens.reduce((soma, c) => soma + (n(c.n) ?? 0), 0) }
}

// ---------------------------------------------------------------------------
// Notas SKC (Parte 2B, Tarefa 6): o que as notas precisam saber do pacote
// ---------------------------------------------------------------------------

/** O que uma nota pode ligar no pacote. */
export type TipoDeAlvoDoPacote = 'verbete' | 'obra' | 'objeto' | 'sitio' | 'grupo'

export interface AlvoDoPacote {
  ref: string
  tipo: TipoDeAlvoDoPacote
  /** Como o alvo se chama: o verbete, a citação da obra, o tipo do objeto, o sítio, o título do grupo. */
  rotulo: string
  /** Objetos: o número (CA00001), em fonte de código; null nos outros. */
  codigo: string | null
}

/**
 * Dos ids dados (`GL-…`, `BIB-…`, número de objeto em maiúsculas, `<SIGLA>-<n>` de sítio, id de grupo), os que existem
 * no pacote, com o rótulo de cada um. Um id que não está no mapa não existe: a nota o mostra como texto, sem link.
 * Uma consulta por tipo, todas em paralelo; nada é lido além do rótulo.
 */
export async function alvosDoPacote(refs: readonly string[]): Promise<Map<string, AlvoDoPacote>> {
  const unicos = [...new Set(refs)]
  const achados = new Map<string, AlvoDoPacote>()
  if (unicos.length === 0) return achados
  const p = { $ids: ids(unicos) }
  const [verbetesL, obrasL, objetosL, sitiosL, gruposL] = await Promise.all([
    executar<L>(`SELECT id, coalesce(pt, de, id) AS rotulo FROM main.glossary_entry WHERE id IN ${EM_IDS}`, p),
    executar<L>(`SELECT id, csl_json, short_cites FROM main.bib_entry WHERE id IN ${EM_IDS}`, p),
    executar<L>(`SELECT object_id, min(item_id) AS item_id FROM main.object_member WHERE object_id IN ${EM_IDS} GROUP BY object_id`, p),
    linhasPorPublicacao(
      (esq, sigla) => `SELECT '${sigla}-' || st.id AS id, coalesce(g.pt, st.literal_name) AS rotulo FROM ${esq}.site st
                       LEFT JOIN main.glossary_entry g ON g.id = st.name_entry_id WHERE '${sigla}-' || st.id IN ${EM_IDS}`,
      p,
    ),
    linhasPorPublicacao((esq) => `SELECT id, coalesce(title_pt, title_de, id) AS rotulo FROM ${esq}.author_group WHERE id IN ${EM_IDS}`, p),
  ])
  for (const l of verbetesL) achados.set(s(l.id)!, { ref: s(l.id)!, tipo: 'verbete', rotulo: s(l.rotulo)!, codigo: null })
  for (const l of obrasL) {
    const csl = json<Record<string, unknown> | null>(l.csl_json, null)
    const rotulo = primeiraCitacao(citadaComoDe(l.short_cites)) ?? tituloDoCsl(csl) ?? s(l.id)!
    achados.set(s(l.id)!, { ref: s(l.id)!, tipo: 'obra', rotulo, codigo: null })
  }
  if (objetosL.length > 0) {
    const resumos = await resumosDosItens(objetosL.map((l) => s(l.item_id)!), 'dada')
    const tipos = new Map(resumos.map((r) => [r.numero, r.tipo]))
    for (const l of objetosL) {
      const numero = s(l.object_id)!
      achados.set(numero, { ref: numero, tipo: 'objeto', rotulo: tipos.get(numero) ?? numero, codigo: numero })
    }
  }
  for (const l of sitiosL) achados.set(s(l.id)!, { ref: s(l.id)!, tipo: 'sitio', rotulo: s(l.rotulo)!, codigo: null })
  for (const l of gruposL) achados.set(s(l.id)!, { ref: s(l.id)!, tipo: 'grupo', rotulo: s(l.rotulo)!, codigo: null })
  return achados
}

/** Um trecho do texto da fonte, como impresso (o alemão do livro), e o id dele no pacote. */
export interface TrechoDaFonte {
  id: string
  texto: string
}

/** Os trechos que descrevem o objeto (`passage_item.role = 'describes'`): o que uma nota sobre o objeto ancora. */
export async function trechosDoObjeto(numero: string): Promise<TrechoDaFonte[]> {
  const m = await membros(numero)
  if (!m) return []
  const linhas = await linhasPorPublicacao(
    (esq) => `SELECT p.id, p.text FROM ${esq}.passage_item pi JOIN ${esq}.passage p ON p.id = pi.passage_id
              WHERE pi.role = 'describes' AND pi.item_id IN ${EM_IDS}`,
    { $ids: ids(m.itens.map((l) => s(l.id)!)) },
  )
  return linhas.map((l) => ({ id: s(l.id)!, texto: s(l.text) ?? '' })).sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
}

/**
 * Os trechos com estes ids no pacote de agora (os que já não existem não vêm). `null` é "fonte indisponível": nenhuma
 * publicação aberta, então nada se pode dizer sobre os trechos (não é o mesmo que "os trechos saíram do pacote").
 */
export async function trechosDaFonte(trechos: readonly string[]): Promise<TrechoDaFonte[] | null> {
  if (trechos.length === 0) return []
  if ((await publicacoesAbertas()).length === 0) return null
  const linhas = await linhasPorPublicacao((esq) => `SELECT id, text FROM ${esq}.passage WHERE id IN ${EM_IDS}`, { $ids: ids([...new Set(trechos)]) })
  return linhas.map((l) => ({ id: s(l.id)!, texto: s(l.text) ?? '' }))
}
