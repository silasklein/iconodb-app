/**
 * As consultas da leitura de uma obra de catálogo (o IPIAO no formato do §; Tarefa 3 do plano «O IPIAO lido no formato do §»).
 * Só o SQL e a montagem: a ordem vem de `ordemDaObra` (src/leitura/ordem.ts), calculada uma vez por obra e por pacote aberto
 * (`geracaoDoBanco`, e esquecida em `aoReabrir`); o detalhe de um passo, sob demanda.
 *
 * Uma obra de leitura é a publicação aberta que tem entradas de catálogo (`item.kind = 'catalog'`), não é livro em parágrafos
 * (`livrosEmParagrafos`) e não é tradução (`publication.translation_of`). Os trechos do volume são os de locator `<vol>.S.<p>`
 * e kind `running_text`, `period_overview` ou `caption`; as entradas, as do catálogo do volume.
 */
import { aoReabrir, executar, geracaoDoBanco, publicacoesAbertas, type PublicacaoAberta } from './cliente'
import { caminhoDoGrupo, livrosEmParagrafos, numerosDosItens, resumosDosItens, temColuna, temSubcolecoes, termos } from './consultas'
import { dividirEmFrases } from './paragrafos'
import { formatarReferencias } from './referencias'
import type { EstadoDaTraducao, LinhaDaLeitura, ObraDeLeitura, PassoDetalhe, ReferenciaDoParagrafo, VizinhoDaLeitura } from './tipos'
import {
  ordemDaObra,
  paginaDoLocator,
  type EntradaParaOrdem,
  type GrupoParaOrdem,
  type PassoDaLeitura,
  type TipoDeTexto,
  type TrechoParaOrdem,
  type VolumeParaOrdem,
} from '../leitura/ordem'

type L = Record<string, unknown>

const s = (v: unknown): string | null => (typeof v === 'string' ? v : v == null ? null : String(v))
const n = (v: unknown): number | null => (typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : null)
const ids = (lista: readonly string[]) => JSON.stringify(lista)
const EM_IDS = '(SELECT value FROM json_each($ids))'
const cmpTexto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export const rotaDoTrecho = (sigla: string, id: string) => `/ler/${encodeURIComponent(sigla)}/trecho/${encodeURIComponent(id)}`
export const rotaDaEntrada = (sigla: string, chave: string) => `/ler/${encodeURIComponent(sigla)}/entrada/${encodeURIComponent(chave)}`

const rotaDoPasso = (sigla: string, p: PassoDaLeitura) => (p.tipo === 'texto' ? rotaDoTrecho(sigla, p.chave) : rotaDaEntrada(sigla, p.chave))

/** O rótulo do volume e da obra no título: «TESTE I» (a publicação e o volume, como `origemDe` e o caminho do §). */
const rotuloDoVolume = (sigla: string, volume: string) => `${sigla} ${volume}`.trim()

/** Os rótulos das linhas da entrada (q3 A): a descrição e os campos 3–5. */
const ROTULO_DA_DESCRICAO = 'Descrição'
const ROTULO_DO_CAMPO: Record<number, string> = {
  3: '3 · Local e contexto do achado',
  4: '4 · Época e datação',
  5: '5 · Suporte, material e estado',
}
const ROTULO_DA_LEGENDA = 'Mapa'

const KINDS_DA_LEITURA = ['running_text', 'period_overview', 'caption'] as const

// ---------------------------------------------------------------------------
// As obras de leitura e a ordem (uma vez por pacote)
// ---------------------------------------------------------------------------

interface VolumeDaObra {
  volume: string
  /** `page_offsets` do volume: [[início, deslocamento], …]; [] sem a coluna. */
  deslocamentos: [number, number][]
  /** `volume.year`, ou o ano da publicação; null sem nenhum (Tarefa 6: o ano no cabeçalho do alemão). */
  ano: number | null
}

interface OrdemDaObra {
  sigla: string
  esquema: string
  volumes: VolumeDaObra[]
  passos: PassoDaLeitura[]
  /** Cada trecho de introdução → o índice do passo de texto que o contém. */
  porTrecho: Map<string, number>
  /** A chave da entrada («95a») → o índice do passo. */
  porEntrada: Map<string, number>
  /** O item da entrada → o índice do passo. */
  porItem: Map<string, number>
  /** Os grupos da obra (todos os volumes). */
  grupos: Map<string, GrupoParaOrdem>
}

let obrasGuardadas: { motor: number; pedido: Promise<PublicacaoAberta[]> } | null = null
let ordensGuardadas: { motor: number; porSigla: Map<string, Promise<OrdemDaObra | null>> } | null = null
aoReabrir(() => {
  obrasGuardadas = null
  ordensGuardadas = null
})

/** As publicações abertas que são obras de leitura, na ordem de `publicacoesAbertas()`. Uma vez por pacote. */
function publicacoesDeLeitura(): Promise<PublicacaoAberta[]> {
  const motor = geracaoDoBanco()
  if (obrasGuardadas?.motor === motor) return obrasGuardadas.pedido
  const pedido = (async () => {
    const emParagrafos = await livrosEmParagrafos()
    const saida: PublicacaoAberta[] = []
    for (const p of await publicacoesAbertas()) {
      if (emParagrafos.has(p.sigla)) continue
      const traducao = (await temColuna(p.esquema, 'publication', 'translation_of'))
        ? `(SELECT translation_of FROM ${p.esquema}.publication WHERE sigla = $sigla)`
        : 'NULL'
      const [l] = await executar<L>(
        `SELECT EXISTS (SELECT 1 FROM ${p.esquema}.item WHERE kind = 'catalog' AND publication = $sigla) AS tem, ${traducao} AS original`,
        { $sigla: p.sigla },
      )
      if (n(l?.tem) && !s(l?.original)) saida.push(p)
    }
    return saida
  })()
  const entrada = { motor, pedido }
  obrasGuardadas = entrada
  pedido.catch(() => {
    if (obrasGuardadas === entrada) obrasGuardadas = null
  })
  return pedido
}

/** A ordem da obra `sigla` e os índices dela; null se não é obra de leitura. Uma vez por obra e por pacote. */
function ordemGuardada(sigla: string): Promise<OrdemDaObra | null> {
  const motor = geracaoDoBanco()
  if (ordensGuardadas?.motor !== motor) ordensGuardadas = { motor, porSigla: new Map() }
  const cache = ordensGuardadas.porSigla
  const guardado = cache.get(sigla)
  if (guardado) return guardado
  const pedido = (async () => {
    const pub = (await publicacoesDeLeitura()).find((p) => p.sigla === sigla)
    return pub ? lerOrdem(pub) : null
  })()
  cache.set(sigla, pedido)
  pedido.catch(() => {
    if (cache.get(sigla) === pedido) cache.delete(sigla)
  })
  return pedido
}

/** Os volumes da obra: os de `volume`, na ordem de `ordinal`, e depois os que só os itens citam; sem a tabela, os dos itens. */
async function volumesDaObra(esq: string, sigla: string): Promise<VolumeDaObra[]> {
  const temVolume = await temColuna(esq, 'volume', 'ordinal')
  const [temDeslocamentos, temAno] = temVolume ? await Promise.all([temColuna(esq, 'volume', 'page_offsets'), temColuna(esq, 'volume', 'year')]) : [false, false]
  const [tabela, dosItens, publicacao] = await Promise.all([
    temVolume
      ? executar<L>(
          `SELECT volume, ordinal, ${temDeslocamentos ? 'page_offsets' : 'NULL AS page_offsets'}, ${temAno ? 'year' : 'NULL AS year'} FROM ${esq}.volume WHERE publication = $sigla`,
          { $sigla: sigla },
        )
      : Promise.resolve([]),
    executar<L>(`SELECT DISTINCT volume FROM ${esq}.item WHERE kind = 'catalog' AND publication = $sigla`, { $sigla: sigla }),
    executar<L>(`SELECT year FROM ${esq}.publication WHERE sigla = $sigla`, { $sigla: sigla }),
  ])
  const anoDaPublicacao = n(publicacao[0]?.year)
  tabela.sort((a, b) => (n(a.ordinal) ?? 0) - (n(b.ordinal) ?? 0) || cmpTexto(s(a.volume)!, s(b.volume)!))
  const saida: VolumeDaObra[] = tabela.map((l) => ({ volume: s(l.volume)!, deslocamentos: deslocamentosDe(l.page_offsets), ano: n(l.year) ?? anoDaPublicacao }))
  const vistos = new Set(saida.map((v) => v.volume))
  const extras = dosItens.map((l) => s(l.volume)).filter((v): v is string => !!v && !vistos.has(v))
  for (const v of extras.sort(cmpTexto)) saida.push({ volume: v, deslocamentos: [], ano: anoDaPublicacao })
  return saida
}

/** `volume.page_offsets` ([[início, deslocamento], …]); o valor estragado vale []. */
function deslocamentosDe(texto: unknown): [number, number][] {
  if (typeof texto !== 'string') return []
  try {
    const v = JSON.parse(texto) as unknown
    if (!Array.isArray(v)) return []
    return v.filter((f): f is [number, number] => Array.isArray(f) && typeof f[0] === 'number' && typeof f[1] === 'number')
  } catch {
    return []
  }
}

/** A página impressa de uma entrada: `text_page` mais o deslocamento da última faixa cujo início é ≤ `text_page`. */
function paginaImpressa(textPage: number | null, deslocamentos: readonly [number, number][]): number | null {
  if (textPage === null) return null
  let melhor: [number, number] | null = null
  for (const f of deslocamentos) if (f[0] <= textPage && (melhor === null || f[0] >= melhor[0])) melhor = f
  return textPage + (melhor?.[1] ?? 0)
}

async function lerOrdem(pub: PublicacaoAberta): Promise<OrdemDaObra> {
  const { esquema: esq, sigla } = pub
  const sub = await temSubcolecoes()
  const [volumes, trechosL, entradasL, gruposDosItensL, gruposL] = await Promise.all([
    volumesDaObra(esq, sigla),
    executar<L>(
      `SELECT id, kind, page, locator, ordinal FROM ${esq}.passage
       WHERE publication = $sigla AND kind IN (${KINDS_DA_LEITURA.map((k) => `'${k}'`).join(', ')}) AND locator GLOB '*.S.*'`,
      { $sigla: sigla },
    ),
    executar<L>(
      `SELECT i.id, i.number, i.suffix, i.volume,
         coalesce(i.text_page, (SELECT min(p.page) FROM ${esq}.passage_item pi JOIN ${esq}.passage p ON p.id = pi.passage_id
                                WHERE pi.item_id = i.id AND pi.role = 'describes'), 0) AS pagina
       FROM ${esq}.item i WHERE i.kind = 'catalog' AND i.publication = $sigla`,
      { $sigla: sigla },
    ),
    executar<L>(
      `SELECT gi.item_id, g.id, g.ordinal, ${sub ? 'g.parent_id' : 'NULL AS parent_id'}
       FROM ${esq}.author_group_item gi JOIN ${esq}.author_group g ON g.id = gi.group_id WHERE g.publication = $sigla`,
      { $sigla: sigla },
    ),
    executar<L>(
      `SELECT g.id, g.volume, g.ordinal, g.intro_passage_id,
         ${sub ? `g.parent_id, (SELECT ap.passage_id FROM ${esq}.author_group_passage ap WHERE ap.group_id = g.id ORDER BY ap.ordinal, ap.passage_id LIMIT 1) AS primeiro` : 'NULL AS parent_id, NULL AS primeiro'}
       FROM ${esq}.author_group g WHERE g.publication = $sigla`,
      { $sigla: sigla },
    ),
  ])

  // o grupo mais interno de cada entrada: a subcoleção, quando ela está numa; depois a menor posição e o menor id
  const grupoDoItem = new Map<string, L>()
  const melhorGrupo = (a: L, b: L) =>
    Number(!!s(b.parent_id)) - Number(!!s(a.parent_id)) || (n(a.ordinal) ?? 0) - (n(b.ordinal) ?? 0) || cmpTexto(s(a.id)!, s(b.id)!)
  for (const l of gruposDosItensL) {
    const atual = grupoDoItem.get(s(l.item_id)!)
    if (!atual || melhorGrupo(l, atual) < 0) grupoDoItem.set(s(l.item_id)!, l)
  }

  // os grupos em ordem estável: os de cima pela posição, depois as subcoleções (pela posição do pai e pela delas)
  const ordinalDe = new Map(gruposL.map((l) => [s(l.id)!, n(l.ordinal) ?? 0]))
  const chaveDoGrupo = (l: L): [number, number, number, string] => {
    const pai = s(l.parent_id)
    return pai ? [1, ordinalDe.get(pai) ?? 0, n(l.ordinal) ?? 0, s(l.id)!] : [0, n(l.ordinal) ?? 0, 0, s(l.id)!]
  }
  gruposL.sort((a, b) => {
    const x = chaveDoGrupo(a)
    const y = chaveDoGrupo(b)
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || cmpTexto(x[3], y[3])
  })
  const grupos = new Map<string, GrupoParaOrdem & { volume: string }>()
  for (const l of gruposL) {
    const paiId = s(l.parent_id)
    // o começo do grupo de cima é o `intro_passage_id`; o da subcoleção, o 1º trecho de `author_group_passage`
    const comeco = paiId ? (s(l.primeiro) ?? s(l.intro_passage_id)) : (s(l.intro_passage_id) ?? s(l.primeiro))
    grupos.set(s(l.id)!, { id: s(l.id)!, paiId, comeco, volume: s(l.volume) ?? '' })
  }

  const volumesParaOrdem: VolumeParaOrdem[] = volumes.map(({ volume }) => {
    const prefixo = `${volume}.S.`
    const trechos: TrechoParaOrdem[] = trechosL
      .filter((l) => s(l.locator)!.startsWith(prefixo) && paginaDoLocator(s(l.locator)!) !== null)
      .map((l) => ({
        id: s(l.id)!,
        kind: s(l.kind) as TrechoParaOrdem['kind'],
        pagina: n(l.page) ?? paginaDoLocator(s(l.locator)!)!,
        locator: s(l.locator)!,
        ordinal: n(l.ordinal) ?? 0,
      }))
    const entradas: EntradaParaOrdem[] = entradasL
      .filter((l) => s(l.volume) === volume)
      .map((l) => ({
        itemId: s(l.id)!,
        numero: n(l.number) ?? 0,
        sufixo: s(l.suffix) ?? '',
        pagina: n(l.pagina) ?? 0,
        grupo: s(grupoDoItem.get(s(l.id)!)?.id),
      }))
    const doVolume = [...grupos.values()].filter((g) => g.volume === volume).map(({ id, paiId, comeco }) => ({ id, paiId, comeco }))
    return { volume, trechos, entradas, grupos: doVolume }
  })

  const passos = ordemDaObra(volumesParaOrdem)
  const porTrecho = new Map<string, number>()
  const porEntrada = new Map<string, number>()
  const porItem = new Map<string, number>()
  passos.forEach((p, i) => {
    if (p.tipo === 'texto') for (const t of p.trechos) porTrecho.set(t, i)
    else {
      if (!porEntrada.has(p.chave)) porEntrada.set(p.chave, i)
      porItem.set(p.itemId, i)
    }
  })
  return { sigla, esquema: esq, volumes, passos, porTrecho, porEntrada, porItem, grupos }
}

/** As obras de leitura abertas, com os volumes na ordem de `volume.ordinal` e a rota do 1º passo de cada um. */
export async function obrasDeLeitura(): Promise<ObraDeLeitura[]> {
  const saida: ObraDeLeitura[] = []
  for (const pub of await publicacoesDeLeitura()) {
    const ordem = await ordemGuardada(pub.sigla)
    if (!ordem) continue
    const volumes = ordem.volumes.flatMap(({ volume }) => {
      const primeiro = ordem.passos.find((p) => p.volume === volume)
      return primeiro ? [{ volume, rotulo: rotuloDoVolume(pub.sigla, volume), primeiro: rotaDoPasso(pub.sigla, primeiro) }] : []
    })
    if (volumes.length > 0) saida.push({ sigla: pub.sigla, volumes })
  }
  return saida
}

/** A ordem de leitura da obra (§ 3 do desenho), do volume I ao último; null se `sigla` não é obra de leitura aberta. */
export async function ordemDaLeitura(sigla: string): Promise<PassoDaLeitura[] | null> {
  return (await ordemGuardada(sigla))?.passos ?? null
}

// ---------------------------------------------------------------------------
// O passo (sob demanda)
// ---------------------------------------------------------------------------

const estadoDe = (v: unknown) => (s(v) as EstadoDaTraducao | null) ?? null
const desatualizadaDe = (v: unknown) => v === true || n(v) === 1

const linhaDoTrecho = (l: L, rotulo: string | null): LinhaDaLeitura => ({
  id: s(l.id)!,
  rotulo,
  texto: s(l.text) ?? '',
  portugues: s(l.texto),
  termos: termos(l.termos),
  estado: estadoDe(l.translation_state),
  desatualizada: desatualizadaDe(l.translation_stale),
})

const SQL_TRECHOS = (esq: string) => `
  SELECT p.id, p.kind, p.ordinal, p.text, p.translation_state, p.translation_stale, r.texto, r.termos
  FROM ${esq}.passage p LEFT JOIN ${esq}.unit_pt_render r ON r.unit_id = p.id WHERE p.id IN ${EM_IDS}`

const SQL_DESCRICOES = (esq: string) => `
  SELECT p.id, p.kind, p.ordinal, p.text, p.translation_state, p.translation_stale, r.texto, r.termos
  FROM ${esq}.passage_item pi JOIN ${esq}.passage p ON p.id = pi.passage_id
  LEFT JOIN ${esq}.unit_pt_render r ON r.unit_id = p.id
  WHERE pi.role = 'describes' AND pi.item_id = $item AND p.kind = 'catalog_description'`

const porOrdinal = (a: L, b: L) => (n(a.ordinal) ?? 0) - (n(b.ordinal) ?? 0) || cmpTexto(s(a.id)!, s(b.id)!)

/** Os trechos do passo de texto, na ordem do passo; a legenda leva o rótulo «Mapa». */
async function linhasDoTexto(esq: string, trechos: readonly string[]): Promise<LinhaDaLeitura[]> {
  const linhas = await executar<L>(SQL_TRECHOS(esq), { $ids: ids(trechos) })
  const porId = new Map(linhas.map((l) => [s(l.id)!, l]))
  return trechos.flatMap((id) => {
    const l = porId.get(id)
    return l ? [linhaDoTrecho(l, l.kind === 'caption' ? ROTULO_DA_LEGENDA : null)] : []
  })
}

/** As descrições da entrada (`passage_item 'describes'`, `catalog_description`), em ordem. */
async function descricoesDe(esq: string, itemId: string): Promise<L[]> {
  return (await executar<L>(SQL_DESCRICOES(esq), { $item: itemId })).sort(porOrdinal)
}

/** As linhas da entrada: a descrição e os campos 3, 4 e 5 (o campo vazio não aparece). */
async function linhasDaEntrada(esq: string, itemId: string, descricoes: readonly L[]): Promise<LinhaDaLeitura[]> {
  const campos = await executar<L>(
    `SELECT cf.unit_id, cf.category, cf.literal, cf.translation_state, cf.translation_stale, r.texto, r.termos
     FROM ${esq}.catalog_field cf LEFT JOIN ${esq}.unit_pt_render r ON r.unit_id = cf.unit_id
     WHERE cf.item_id = $item AND cf.category IN (3, 4, 5)`,
    { $item: itemId },
  )
  campos.sort((a, b) => (n(a.category) ?? 0) - (n(b.category) ?? 0))
  return [
    ...descricoes.map((l) => linhaDoTrecho(l, ROTULO_DA_DESCRICAO)),
    ...campos
      .filter((l) => (s(l.literal) ?? '').trim() !== '')
      .map((l) => ({
        id: s(l.unit_id)!,
        rotulo: ROTULO_DO_CAMPO[n(l.category)!]!,
        texto: s(l.literal)!,
        portugues: s(l.texto),
        termos: termos(l.termos),
        estado: estadoDe(l.translation_state),
        desatualizada: desatualizadaDe(l.translation_stale),
      })),
  ]
}

/** As figuras que estes trechos citam (`passage_item 'mentions'`), menos as de `fora`, uma por objeto, na ordem das fontes. */
async function figurasCitadas(esq: string, trechos: readonly string[], fora: readonly string[] = []) {
  if (trechos.length === 0) return []
  const linhas = await executar<L>(`SELECT DISTINCT item_id FROM ${esq}.passage_item WHERE role = 'mentions' AND passage_id IN ${EM_IDS}`, {
    $ids: ids(trechos),
  })
  const itens = linhas.map((l) => s(l.item_id)!).filter((id) => !fora.includes(id))
  return resumosDosItens(itens, 'fonte')
}

/**
 * As menções destes trechos (`passage_item 'mentions'`), menos as de `fora`, item por item, com o número e a letra no livro, o
 * volume do item (o nome acessível da remissão a outro volume) e o objeto: o que liga os números do catálogo no texto. Em ordem
 * de número e letra.
 */
async function referenciasDe(esq: string, trechos: readonly string[], fora: readonly string[] = []): Promise<ReferenciaDoParagrafo[]> {
  if (trechos.length === 0) return []
  const linhas = await executar<L>(
    `SELECT DISTINCT pi.item_id, i.number, i.suffix, i.volume FROM ${esq}.passage_item pi JOIN ${esq}.item i ON i.id = pi.item_id
     WHERE pi.role = 'mentions' AND pi.passage_id IN ${EM_IDS}`,
    { $ids: ids(trechos) },
  )
  const doPasso = linhas.filter((l) => !fora.includes(s(l.item_id)!))
  const objetos = await numerosDosItens(doPasso.map((l) => s(l.item_id)!))
  return doPasso
    .map((l) => ({
      itemId: s(l.item_id)!,
      objeto: objetos.get(s(l.item_id)!)!,
      numero: n(l.number) ?? 0,
      sufixo: s(l.suffix) ?? '',
      ...(s(l.volume) ? { volume: s(l.volume)! } : {}),
    }))
    .sort((a, b) => a.numero - b.numero || cmpTexto(a.sufixo, b.sufixo) || cmpTexto(a.itemId, b.itemId))
}

/** A primeira frase do passo: a do português do 1º trecho (ou da descrição, na entrada), ou a do original sem tradução. */
async function fraseDoPasso(esq: string, p: PassoDaLeitura): Promise<string | null> {
  const [l] = p.tipo === 'texto' ? await executar<L>(SQL_TRECHOS(esq), { $ids: ids([p.chave]) }) : await descricoesDe(esq, p.itemId)
  if (!l) return null
  return dividirEmFrases(s(l.texto) ?? s(l.text) ?? '')[0] ?? null
}

const rotuloDaEntrada = (sigla: string, p: Extract<PassoDaLeitura, { tipo: 'entrada' }>) =>
  formatarReferencias([{ obra: rotuloDoVolume(sigla, p.volume), numero: p.numero, sufixo: p.sufixo, abb: false }])

/** O título do passo: «TESTE I, p. 10» (texto) ou «TESTE I: 1» (entrada, decisão 39). */
const tituloDoPasso = (sigla: string, p: PassoDaLeitura) =>
  p.tipo === 'texto' ? `${rotuloDoVolume(sigla, p.volume)}, p. ${p.pagina}` : rotuloDaEntrada(sigla, p)

/** O vizinho: «p. 10» no mesmo volume, «TESTE II, p. 4» no outro; a entrada, «TESTE I: 2». */
async function vizinho(ordem: OrdemDaObra, p: PassoDaLeitura | undefined, volume: string): Promise<VizinhoDaLeitura | null> {
  if (!p) return null
  const rotulo =
    p.tipo === 'entrada'
      ? rotuloDaEntrada(ordem.sigla, p)
      : p.volume === volume
        ? `p. ${p.pagina}`
        : `${rotuloDoVolume(ordem.sigla, p.volume)}, p. ${p.pagina}`
  return {
    rota: rotaDoPasso(ordem.sigla, p),
    rotulo,
    tipo: p.tipo === 'texto' ? p.rotulo : 'entrada',
    frase: await fraseDoPasso(ordem.esquema, p),
  }
}

/**
 * Um passo da leitura: o que contém o trecho `{ trecho }` (rolado até ele) ou o da entrada `{ entrada }` («95a»). null: a obra
 * não é de leitura, ou o pacote não tem o passo (link velho, trecho que sumiu, número que não há).
 */
export async function passoDaLeitura(sigla: string, alvo: { trecho: string } | { entrada: string }): Promise<PassoDetalhe | null> {
  const ordem = await ordemGuardada(sigla)
  if (!ordem) return null
  const i = 'trecho' in alvo ? ordem.porTrecho.get(alvo.trecho) : ordem.porEntrada.get(alvo.entrada)
  if (i === undefined) return null
  const p = ordem.passos[i]!
  const esq = ordem.esquema
  const obra = rotuloDoVolume(sigla, p.volume)

  // o 1º passo do mesmo bloco (texto) ou da 1ª entrada do mesmo grupo (entrada), no mesmo volume
  const mesmoConjunto = (q: PassoDaLeitura) =>
    q.volume === p.volume &&
    (p.tipo === 'texto' ? q.tipo === 'texto' && q.bloco === p.bloco : q.tipo === 'entrada' && q.grupo === p.grupo)
  const inicio = p.posicao.n > 1 ? ordem.passos.find(mesmoConjunto) : undefined

  const [caminho, anterior, seguinte, corpo] = await Promise.all([
    p.grupo ? caminhoDoGrupo(esq, p.grupo) : Promise.resolve({ caminho: [], grupos: [] }),
    vizinho(ordem, ordem.passos[i - 1], p.volume),
    vizinho(ordem, ordem.passos[i + 1], p.volume),
    p.tipo === 'texto' ? corpoDoTexto(esq, p) : corpoDaEntrada(ordem, p),
  ])

  const de: PassoDetalhe['posicao']['de'] =
    p.tipo === 'texto' ? 'bloco' : p.grupo !== null && ordem.grupos.get(p.grupo)?.paiId ? 'subcolecao' : 'grupo'
  return {
    sigla,
    volume: p.volume,
    obra,
    ano: ordem.volumes.find((v) => v.volume === p.volume)?.ano ?? null,
    tipo: p.tipo,
    rotuloDoTipo: p.tipo === 'texto' ? p.rotulo : 'entrada',
    titulo: tituloDoPasso(sigla, p),
    pagina: corpo.pagina,
    caminho: caminho.caminho,
    grupos: caminho.grupos,
    linhas: corpo.linhas,
    figuras: corpo.figuras,
    entrada: corpo.entrada,
    referencias: corpo.referencias,
    posicao: { n: p.posicao.n, total: p.posicao.total, de },
    inicio: inicio ? rotaDoPasso(sigla, inicio) : null,
    alvo: 'trecho' in alvo ? alvo.trecho : null,
    anterior,
    seguinte,
  }
}

type Corpo = Pick<PassoDetalhe, 'pagina' | 'linhas' | 'figuras' | 'entrada' | 'referencias'>

async function corpoDoTexto(esq: string, p: Extract<PassoDaLeitura, { tipo: 'texto' }>): Promise<Corpo> {
  const [linhas, figuras, referencias] = await Promise.all([linhasDoTexto(esq, p.trechos), figurasCitadas(esq, p.trechos), referenciasDe(esq, p.trechos)])
  return { pagina: p.pagina, linhas, figuras, entrada: null, referencias }
}

async function corpoDaEntrada(ordem: OrdemDaObra, p: Extract<PassoDaLeitura, { tipo: 'entrada' }>): Promise<Corpo> {
  const esq = ordem.esquema
  const descricoes = await descricoesDe(esq, p.itemId)
  const idsDasDescricoes = descricoes.map((l) => s(l.id)!)
  const [linhas, citadas, referencias, [peca], [itemL]] = await Promise.all([
    linhasDaEntrada(esq, p.itemId, descricoes),
    figurasCitadas(esq, idsDasDescricoes, [p.itemId]),
    referenciasDe(esq, idsDasDescricoes, [p.itemId]),
    resumosDosItens([p.itemId], 'dada'),
    executar<L>(`SELECT text_page FROM ${esq}.item WHERE id = $item`, { $item: p.itemId }),
  ])
  // a outra peça do mesmo objeto, citada na descrição, não traz o objeto da entrada às citadas (fix final, m3)
  const figuras = peca ? citadas.filter((f) => f.numero !== peca.numero) : citadas
  const deslocamentos = ordem.volumes.find((v) => v.volume === p.volume)?.deslocamentos ?? []
  return { pagina: paginaImpressa(n(itemL?.text_page), deslocamentos), linhas, figuras, entrada: peca ?? null, referencias }
}

// ---------------------------------------------------------------------------
// As entradas da leitura a partir do grupo e do objeto
// ---------------------------------------------------------------------------

/**
 * A rota do 1º passo do grupo na leitura: o passo do trecho que abre o grupo (o começo dele, mesmo quando outro grupo que
 * começa ali ficou com o bloco) ou, antes dele, o 1º passo de uma entrada do grupo ou de uma subcoleção dele. null fora das
 * obras de leitura.
 */
export async function passoDoGrupo(grupoId: string): Promise<string | null> {
  for (const pub of await publicacoesDeLeitura()) {
    const ordem = await ordemGuardada(pub.sigla)
    const g = ordem?.grupos.get(grupoId)
    if (!ordem || !g) continue
    let melhor = g.comeco ? (ordem.porTrecho.get(g.comeco) ?? Infinity) : Infinity
    ordem.passos.forEach((q, i) => {
      if (i >= melhor || q.grupo === null) return
      if (q.grupo === grupoId || ordem.grupos.get(q.grupo)?.paiId === grupoId) melhor = i
    })
    return melhor === Infinity ? null : rotaDoPasso(pub.sigla, ordem.passos[melhor]!)
  }
  return null
}

/** A rota do passo da entrada do item (`TESTE-0003` → `/ler/TESTE/entrada/3`); null fora das obras de leitura. */
export async function passoDoItem(itemId: string): Promise<string | null> {
  for (const pub of await publicacoesDeLeitura()) {
    const ordem = await ordemGuardada(pub.sigla)
    const i = ordem?.porItem.get(itemId)
    if (ordem && i !== undefined) return rotaDoPasso(pub.sigla, ordem.passos[i]!)
  }
  return null
}


// ---------------------------------------------------------------------------
// A posição guardada e os trechos achados pela busca (Tarefa 5)
// ---------------------------------------------------------------------------

const ROTA_GUARDADA = /^\/ler\/([^/]+)\/(trecho|entrada)\/([^/]+)$/

const decodificar = (v: string): string | null => {
  try {
    return decodeURIComponent(v)
  } catch {
    return null
  }
}

/**
 * O título do passo da rota guardada (`lerPosicao`) na obra `sigla`: «TESTE I, p. 11» ou «TESTE I: 2», como o `titulo` de
 * `passoDaLeitura`. null quando a rota não é da leitura desta obra ou o pacote não tem o passo (o «Continuar» não aparece).
 */
export async function tituloDaPosicao(sigla: string, rota: string): Promise<string | null> {
  const m = ROTA_GUARDADA.exec(rota)
  const siglaDaRota = m ? decodificar(m[1]!) : null
  const chave = m ? decodificar(m[3]!) : null
  if (!m || siglaDaRota !== sigla || chave === null) return null
  const ordem = await ordemGuardada(sigla)
  const i = m[2] === 'trecho' ? ordem?.porTrecho.get(chave) : ordem?.porEntrada.get(chave)
  const p = i === undefined ? undefined : ordem!.passos[i]
  return p ? tituloDoPasso(sigla, p) : null
}

/** Um trecho de introdução na ordem de leitura: a obra, o passo (o índice na ordem) e o que o rótulo do achado usa. */
export interface TrechoNaLeitura {
  sigla: string
  /** O índice do passo na ordem da obra: os trechos do mesmo passo são um achado só. */
  passo: number
  /** «TESTE I, p. 10». */
  rotulo: string
  pagina: number
  rotuloDoTipo: TipoDeTexto
}

/** Os trechos (ids) que estão num passo de texto de alguma obra de leitura aberta; os outros ficam fora do mapa. */
export async function trechosNaLeitura(trechos: readonly string[]): Promise<Map<string, TrechoNaLeitura>> {
  const saida = new Map<string, TrechoNaLeitura>()
  if (trechos.length === 0) return saida
  for (const pub of await publicacoesDeLeitura()) {
    const ordem = await ordemGuardada(pub.sigla)
    if (!ordem) continue
    for (const id of trechos) {
      const i = ordem.porTrecho.get(id)
      const p = i === undefined ? undefined : ordem.passos[i]
      if (!p || p.tipo !== 'texto' || saida.has(id)) continue
      saida.set(id, { sigla: pub.sigla, passo: i!, rotulo: tituloDoPasso(pub.sigla, p), pagina: p.pagina, rotuloDoTipo: p.rotulo })
    }
  }
  return saida
}
