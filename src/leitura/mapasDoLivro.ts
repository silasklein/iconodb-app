/**
 * Os mapas impressos da introdução e o mapa do app (desenho «O IPIAO lido no formato do §», § 9; decisão 94, opção A).
 *
 * O pacote guarda só o título de cada mapa (o trecho `caption`, a linha «Mapa»). Sob ela a página desenha o mapa do app com os
 * sítios das entradas da parte do livro que a legenda abre (src/leitura/ordem.ts, `partesDoVolume`). Quando a mesma parte tem
 * dois mapas impressos, as entradas se dividem pela datação EBW delas (`dating_ebw`), pela tabela fixa abaixo, chaveada pelo id
 * do trecho da legenda. Puro: sem React e sem banco (o scripts/conferir-leitura.ts o usa no Node).
 */

/** O id do trecho da legenda → os códigos EBW do mapa (§ 9). Ids e códigos de período, não texto do livro. */
export const MAPAS_DO_LIVRO: Readonly<Record<string, readonly string[]>> = {
  'PA-IPIAO-I.S.51-cap-1': ['PPNA', 'PPNB', 'PPNC'],
  'PA-IPIAO-I.S.53-cap-1': ['PNE'],
  'PA-IPIAO-I.S.157-cap-1': ['EBI'],
  'PA-IPIAO-I.S.159-cap-1': ['EBII', 'EBIII'],
  'PA-IPIAO-IV.S.13-cap-1': ['LBIII', 'IAI', 'EIIA', 'LIIA'],
  'PA-IPIAO-IV.S.14-cap-1': ['IIB', 'IIC', 'IID', 'EPER'],
}

/**
 * As entradas (itemIds, na ordem dada) do mapa da legenda `legenda`, entre as `entradas` da parte:
 * - a legenda fora da tabela: todas;
 * - na tabela: as que têm um código do mapa dela, mais as sem código e as cujos códigos não estão em nenhum mapa das legendas
 *   da mesma parte (essas aparecem nos dois mapas do par).
 */
export function entradasDoMapa(
  legenda: string,
  legendasDaParte: readonly string[],
  entradas: readonly { itemId: string; ebw: readonly string[] }[],
  tabela: Readonly<Record<string, readonly string[]>> = MAPAS_DO_LIVRO,
): string[] {
  const deste = tabela[legenda]
  if (!deste) return entradas.map((e) => e.itemId)
  const meus = new Set(deste)
  const daParte = new Set(legendasDaParte.filter((l) => l !== legenda).flatMap((l) => tabela[l] ?? []))
  return entradas.filter((e) => e.ebw.some((c) => meus.has(c)) || !e.ebw.some((c) => daParte.has(c))).map((e) => e.itemId)
}

/**
 * Os pares da tabela: as duas legendas de cada par dividem as entradas de uma parte, então têm de estar na mesma parte
 * (a conferência no pacote: scripts/conferir-leitura.ts).
 */
export const PARES_DOS_MAPAS: readonly (readonly [string, string])[] = [
  ['PA-IPIAO-I.S.51-cap-1', 'PA-IPIAO-I.S.53-cap-1'],
  ['PA-IPIAO-I.S.157-cap-1', 'PA-IPIAO-I.S.159-cap-1'],
  ['PA-IPIAO-IV.S.13-cap-1', 'PA-IPIAO-IV.S.14-cap-1'],
]

export interface ParConferido {
  par: readonly [string, string]
  /** A parte de cada legenda (`parteDe`), ou null quando a legenda não está na obra. */
  partes: [string | null, string | null]
  /** As duas na obra e na mesma parte. */
  ok: boolean
}

/** Os pares da obra `sigla` (alguma legenda `PA-<sigla>-…`), cada um com as partes das duas legendas. */
export function conferirParesDosMapas(
  sigla: string,
  parteDe: (legenda: string) => string | null,
  pares: readonly (readonly [string, string])[] = PARES_DOS_MAPAS,
): ParConferido[] {
  const daObra = (l: string) => l.startsWith(`PA-${sigla}-`)
  return pares
    .filter(([a, b]) => daObra(a) || daObra(b))
    .map((par) => {
      const partes: [string | null, string | null] = [parteDe(par[0]), parteDe(par[1])]
      return { par, partes, ok: partes[0] !== null && partes[0] === partes[1] }
    })
}

/**
 * Os sítios de um mapa (src/leitura/MapaDaLegenda.tsx), um por destino, na ordem das entradas: `idsDasEntradas` é o sítio que
 * cada entrada mostra (null sem sítio), `destinos` leva um sítio mesclado ao destino, e `sitios` é a lista dos Sítios. Um sítio
 * que a lista não tem (um `SI-…` excluído ou que ainda não chegou a este aparelho) não conta.
 */
export function sitiosDasEntradas<S extends { id: string }>(
  idsDasEntradas: readonly (string | null | undefined)[],
  sitios: readonly S[],
  destinos: ReadonlyMap<string, string> | null | undefined,
): S[] {
  const porId = new Map(sitios.map((s) => [s.id, s] as const))
  const vistos = new Map<string, S>()
  for (const id of idsDasEntradas) {
    if (!id) continue
    const item = porId.get(destinos?.get(id) ?? id)
    if (item && !vistos.has(item.id)) vistos.set(item.id, item)
  }
  return [...vistos.values()]
}

/** Quantos sítios têm coordenada (viram ponto) e quantos não. */
export function contarSitios(sitios: readonly { lat: number | null; lon: number | null }[]): { comCoordenada: number; semCoordenada: number } {
  const comCoordenada = sitios.filter((s) => s.lat !== null && s.lon !== null).length
  return { comCoordenada, semCoordenada: sitios.length - comCoordenada }
}
