/**
 * A ordem de leitura de uma obra de catálogo (§ 3 do desenho «O IPIAO lido no formato do §»): cada introdução (época,
 * grupo, subcoleção) seguida das entradas do catálogo que ela introduz. Função pura: sem React e sem banco. A Tarefa 3
 * lê as linhas do pacote e as passa aqui; a página de leitura percorre os passos que saem daqui.
 *
 * Por volume:
 * 1. os trechos na ordem (página, running_text < period_overview < caption, ordinal); as entradas na ordem do catálogo
 *    (página, número, letra, id);
 * 2. os blocos de texto: abre-se um no primeiro trecho, em todo trecho que é o começo de algum grupo e em todo trecho
 *    separado do anterior por uma página de entrada estritamente no meio (o corte pelo catálogo);
 * 3. o grupo do bloco: entre os grupos que começam no trecho, o primeiro que tem entradas, ou o primeiro deles; o bloco
 *    aberto pelo corte do catálogo fica sem grupo;
 * 4. a intercalação: cada entrada puxa o bloco do seu grupo (ou, sem ele, o do pai) e todos os anteriores ainda não
 *    emitidos; sem bloco, ou com ele já emitido, a entrada fica no lugar dela. No fim, os blocos que sobraram;
 * 5. cada bloco vira um passo por página impressa (a do locator), com os trechos consecutivos da mesma página juntos.
 */

export type TipoDeTexto = 'introducao-geral' | 'panorama' | 'grupo' | 'subcolecao'

export interface TrechoParaOrdem {
  id: string
  kind: 'running_text' | 'period_overview' | 'caption'
  /** A página do banco (`passage.page`): é ela que ordena e que se compara às páginas das entradas. */
  pagina: number
  /** `<vol>.S.<p>`: dá a página impressa do passo. */
  locator: string
  ordinal: number
}

export interface EntradaParaOrdem {
  itemId: string
  numero: number
  sufixo: string
  /** A página do banco (`item.text_page`). */
  pagina: number
  /** O grupo mais interno da entrada: a subcoleção, quando ela está numa; null fora de todo grupo. */
  grupo: string | null
}

export interface GrupoParaOrdem {
  id: string
  paiId: string | null
  /** O trecho que abre o grupo: o `intro_passage_id` do grupo de cima, ou o 1º trecho da subcoleção; null sem texto. */
  comeco: string | null
}

export interface VolumeParaOrdem {
  volume: string
  trechos: TrechoParaOrdem[]
  entradas: EntradaParaOrdem[]
  grupos: GrupoParaOrdem[]
}

export type PassoDaLeitura =
  | {
      tipo: 'texto'
      /** O id do primeiro trecho do passo. */
      chave: string
      volume: string
      pagina: number
      trechos: string[]
      /** O índice do bloco no volume (a partir de 0). */
      bloco: number
      grupo: string | null
      rotulo: TipoDeTexto
      /** k de m dentro do bloco. */
      posicao: { n: number; total: number }
    }
  | {
      tipo: 'entrada'
      /** `chaveDaEntrada(numero, sufixo)`. */
      chave: string
      volume: string
      itemId: string
      numero: number
      sufixo: string
      grupo: string | null
      /** k de m entre as entradas do mesmo grupo, na ordem emitida. */
      posicao: { n: number; total: number }
    }

const LOCATOR = /^[^.\s]+\.S\.(\d+)$/

/** A página impressa de um locator de introdução: 'I.S.58' → 58. Outro formato ('0060', '§3') → null. */
export function paginaDoLocator(locator: string): number | null {
  const m = LOCATOR.exec(locator)
  return m ? Number(m[1]) : null
}

/** A chave (e o endereço) do passo de uma entrada: (95, 'a') → '95a'. */
export function chaveDaEntrada(numero: number, sufixo: string): string {
  return `${numero}${sufixo}`
}

const ORDEM_DO_KIND: Record<TrechoParaOrdem['kind'], number> = { running_text: 0, period_overview: 1, caption: 2 }

/** Comparação de texto estável e independente da língua do aparelho. */
const cmpTexto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const cmpTrecho = (a: TrechoParaOrdem, b: TrechoParaOrdem) =>
  a.pagina - b.pagina || ORDEM_DO_KIND[a.kind] - ORDEM_DO_KIND[b.kind] || a.ordinal - b.ordinal || cmpTexto(a.id, b.id)

const cmpEntrada = (a: EntradaParaOrdem, b: EntradaParaOrdem) =>
  a.pagina - b.pagina || a.numero - b.numero || cmpTexto(a.sufixo, b.sufixo) || cmpTexto(a.itemId, b.itemId)

/** Quantos valores de `ordenados` são ≤ x (ou < x, com `estrito`). */
function contarAte(ordenados: readonly number[], x: number, estrito: boolean): number {
  let lo = 0
  let hi = ordenados.length
  while (lo < hi) {
    const meio = (lo + hi) >> 1
    const v = ordenados[meio]!
    if (estrito ? v < x : v <= x) lo = meio + 1
    else hi = meio
  }
  return lo
}

interface Bloco {
  grupo: GrupoParaOrdem | null
  trechos: TrechoParaOrdem[]
}

export function ordemDoVolume(v: VolumeParaOrdem): PassoDaLeitura[] {
  const trechos = [...v.trechos].sort(cmpTrecho)
  const entradas = [...v.entradas].sort(cmpEntrada)

  const entradasPorGrupo = new Map<string | null, number>()
  for (const e of entradas) entradasPorGrupo.set(e.grupo, (entradasPorGrupo.get(e.grupo) ?? 0) + 1)
  const paiDe = new Map(v.grupos.map((g) => [g.id, g.paiId]))

  // os grupos que começam em cada trecho, na ordem dada
  const comecamEm = new Map<string, GrupoParaOrdem[]>()
  for (const g of v.grupos) {
    if (g.comeco === null) continue
    const lista = comecamEm.get(g.comeco)
    if (lista) lista.push(g)
    else comecamEm.set(g.comeco, [g])
  }

  // 2–3. os blocos e o grupo de cada um
  const paginasDeEntrada = entradas.map((e) => e.pagina)
  const blocos: Bloco[] = []
  const blocoDoGrupo = new Map<string, number>()
  trechos.forEach((t, i) => {
    const comecam = comecamEm.get(t.id)
    const anterior = i > 0 ? trechos[i - 1]! : null
    // uma página de entrada estritamente entre a do trecho anterior e a deste
    const corte =
      anterior !== null && contarAte(paginasDeEntrada, anterior.pagina, false) < contarAte(paginasDeEntrada, t.pagina, true)
    if (anterior === null || comecam || corte) {
      const grupo = comecam ? (comecam.find((g) => (entradasPorGrupo.get(g.id) ?? 0) > 0) ?? comecam[0]!) : null
      for (const g of comecam ?? []) blocoDoGrupo.set(g.id, blocos.length)
      blocos.push({ grupo, trechos: [] })
    }
    blocos[blocos.length - 1]!.trechos.push(t)
  })

  // 5–6. os passos de cada bloco, com o rótulo e a posição dentro do bloco
  const passosDoBloco = (k: number): PassoDaLeitura[] => {
    const b = blocos[k]!
    const rotulo: TipoDeTexto = b.grupo
      ? b.grupo.paiId !== null
        ? 'subcolecao'
        : 'grupo'
      : b.trechos[0]!.kind === 'running_text'
        ? 'introducao-geral'
        : 'panorama'
    const porPagina: { pagina: number; trechos: string[] }[] = []
    for (const t of b.trechos) {
      const pagina = paginaDoLocator(t.locator) ?? t.pagina
      const ultimo = porPagina[porPagina.length - 1]
      if (ultimo && ultimo.pagina === pagina) ultimo.trechos.push(t.id)
      else porPagina.push({ pagina, trechos: [t.id] })
    }
    return porPagina.map((p, i) => ({
      tipo: 'texto',
      chave: p.trechos[0]!,
      volume: v.volume,
      pagina: p.pagina,
      trechos: p.trechos,
      bloco: k,
      grupo: b.grupo?.id ?? null,
      rotulo,
      posicao: { n: i + 1, total: porPagina.length },
    }))
  }

  // 4. a intercalação
  const passos: PassoDaLeitura[] = []
  const vistasPorGrupo = new Map<string | null, number>()
  let emitido = -1
  const emitirAte = (k: number) => {
    for (; emitido < k; ) passos.push(...passosDoBloco(++emitido))
  }
  for (const e of entradas) {
    const pai = e.grupo === null ? null : (paiDe.get(e.grupo) ?? null)
    const alvo = e.grupo === null ? undefined : (blocoDoGrupo.get(e.grupo) ?? (pai === null ? undefined : blocoDoGrupo.get(pai)))
    if (alvo !== undefined && alvo > emitido) emitirAte(alvo)
    const n = (vistasPorGrupo.get(e.grupo) ?? 0) + 1
    vistasPorGrupo.set(e.grupo, n)
    passos.push({
      tipo: 'entrada',
      chave: chaveDaEntrada(e.numero, e.sufixo),
      volume: v.volume,
      itemId: e.itemId,
      numero: e.numero,
      sufixo: e.sufixo,
      grupo: e.grupo,
      posicao: { n, total: entradasPorGrupo.get(e.grupo)! },
    })
  }
  emitirAte(blocos.length - 1)
  return passos
}

/** A ordem da obra: os volumes na ordem dada, concatenados. */
export function ordemDaObra(volumes: readonly VolumeParaOrdem[]): PassoDaLeitura[] {
  return volumes.flatMap((v) => ordemDoVolume(v))
}
