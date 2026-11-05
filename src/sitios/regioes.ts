/**
 * As regiões dos sítios (decisão 36), deduzidas da coordenada por polígonos simples: Levante Sul, Levante Norte (até o médio Eufrates e o alto
 * Khabur), Transjordânia, Egito (com o Sinai), Mesopotâmia, Anatólia, Chipre e Irã, mais «Sem coordenada». Puro: sem React.
 *
 * Os polígonos seguem a malha proposta em PC-SitiosMapa.dc.html: as regiões vizinhas repartem as mesmas arestas, com os mesmos
 * vértices (cada vértice é definido uma vez, abaixo). Pontos [longitude, latitude] em graus. Não são fronteiras políticas: são
 * balizas para filtrar. O vértice D, na cabeceira do golfo de Aqaba, foi levado para oeste para que os sítios que ficam
 * junto da fronteira atual, do lado israelense, caiam no Levante Sul e não no Egito.
 *
 * REGRA DE BORDA (determinística): `regiaoDe` testa as regiões na ordem de `REGIOES`, com teste INCLUSIVO (um ponto sobre uma
 * aresta ou num vértice conta como dentro), e devolve a primeira que contém o ponto. Assim um ponto sobre uma aresta comum cai
 * numa região só, sempre a mesma: a primeira da ordem.
 */
export type Ponto = readonly [lon: number, lat: number]
export type Poligono = readonly Ponto[]

export interface Regiao {
  id: string
  nome: string
  poligono: Poligono
  /** Onde o nome da região é escrito no mapa quando «Limites das regiões» está ligado. */
  rotulo: { lon: number; lat: number; alinhar: 'meio' | 'fim' }
}

/** A chave de quem não tem coordenada (o último filtro). */
export const CHAVE_SEM_COORDENADA = 'sem-coordenada'
export const NOME_SEM_COORDENADA = 'Sem coordenada'
/** Uma coordenada que não cai em nenhum polígono (um sítio do usuário fora da área): não some da lista. */
export const CHAVE_FORA = 'fora'
export const NOME_FORA = 'Fora das regiões'

// Os vértices compartilhados. Cada polígono os cita pelo nome, para que as arestas comuns sejam idênticas.
const A: Ponto = [34.42, 33.28]
const B: Ponto = [33.62, 31.58]
const C: Ponto = [34.27, 31.3]
const D: Ponto = [34.82, 29.68]
const E: Ponto = [34.86, 29.43]
const F: Ponto = [35.05, 29.43]
const G: Ponto = [35.18, 30.28]
const H: Ponto = [35.43, 30.98]
const I: Ponto = [35.5, 31.48]
const J: Ponto = [35.56, 31.76]
const K: Ponto = [35.58, 32.28]
const L: Ponto = [35.61, 32.62]
const M: Ponto = [35.98, 32.7]
const N: Ponto = [35.88, 33.31]
const O: Ponto = [35.58, 33.26]
const P: Ponto = [35.13, 33.07]
const Q: Ponto = [35.33, 33.98]
const R: Ponto = [36.83, 32.3]
const S: Ponto = [38.83, 33.35]
const T: Ponto = [41.05, 34.4]
const U: Ponto = [41.3, 35.58]
const V: Ponto = [42.41, 37.08]
const W: Ponto = [40.04, 36.83]
const X: Ponto = [38.04, 36.82]
const Y: Ponto = [36.73, 36.78]
const Z: Ponto = [35.83, 35.98]
const AA: Ponto = [35.33, 35.88]
const AB: Ponto = [39.24, 32.18]
const AC: Ponto = [37.53, 30.98]
const AD: Ponto = [37.53, 29.18]
const AE: Ponto = [35.05, 29.18]
const AF: Ponto = [44.56, 37.18]
const AG: Ponto = [45.56, 35.78]
const AH: Ponto = [46.06, 32.98]
const AI: Ponto = [47.57, 31.98]
const AJ: Ponto = [48.47, 30.38]
const AK: Ponto = [48.07, 29.38]
const AL: Ponto = [46.56, 29.08]
const AM: Ponto = [44.76, 29.18]
const AN: Ponto = [42.05, 30.98]
const AO: Ponto = [26.0, 42.18]
const AP: Ponto = [26.0, 35.58]
const AQ: Ponto = [32.02, 35.93]
const AR: Ponto = [44.86, 39.68]
const AS: Ponto = [44.86, 42.18]

export const REGIOES: readonly Regiao[] = [
  {
    id: 'levante-sul',
    nome: 'Levante Sul',
    poligono: [A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P],
    rotulo: { lon: 34.12, lat: 30.57, alinhar: 'fim' },
  },
  {
    id: 'levante-norte',
    nome: 'Levante Norte',
    poligono: [Q, A, P, O, N, M, R, S, T, U, V, W, X, Y, Z, AA],
    rotulo: { lon: 38.6, lat: 35.2, alinhar: 'meio' },
  },
  {
    id: 'transjordania',
    nome: 'Transjordânia',
    poligono: [F, G, H, I, J, K, L, M, R, S, AB, AC, AD, AE],
    rotulo: { lon: 36.63, lat: 30.57, alinhar: 'meio' },
  },
  {
    id: 'egito',
    nome: 'Egito',
    // Do Nilo e do deserto ocidental ao Sinai inteiro (até o golfo de Aqaba) e à costa do mar Vermelho.
    poligono: [[24.49, 21.77], [24.49, 31.68], [29.01, 31.28], [32.02, 31.58], B, C, D, E, [34.95, 28.0], [36.0, 23.47]],
    rotulo: { lon: 29.5, lat: 27.2, alinhar: 'meio' },
  },
  {
    id: 'mesopotamia',
    nome: 'Mesopotâmia',
    poligono: [S, T, U, V, AF, AG, AH, AI, AJ, AK, AL, AM, AN, AB],
    rotulo: { lon: 44.2, lat: 32.6, alinhar: 'meio' },
  },
  {
    id: 'anatolia',
    nome: 'Anatólia',
    poligono: [AO, AP, AQ, AA, Z, Y, X, W, V, AF, AR, AS],
    rotulo: { lon: 33.5, lat: 39.0, alinhar: 'meio' },
  },
  {
    id: 'chipre',
    nome: 'Chipre',
    poligono: [[32.12, 35.73], [32.12, 34.43], [34.73, 34.43], [34.73, 35.73]],
    rotulo: { lon: 33.4, lat: 35.1, alinhar: 'meio' },
  },
  {
    id: 'ira',
    nome: 'Irã',
    poligono: [AF, AG, AH, AI, AJ, [50.08, 29.48], [51.58, 27.58], [56.6, 26.58], [61.61, 25.17], [61.61, 37.48], [55.59, 38.18], [48.57, 38.58], AR],
    rotulo: { lon: 52.1, lat: 33.0, alinhar: 'meio' },
  },
]

const EPSILON = 1e-9

/** O ponto está sobre o segmento a–b? (Tolerância mínima, só contra erro de ponto flutuante.) */
function sobreOSegmento(x: number, y: number, a: Ponto, b: Ponto): boolean {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const comprimento2 = dx * dx + dy * dy
  if (comprimento2 === 0) return Math.abs(x - a[0]) < EPSILON && Math.abs(y - a[1]) < EPSILON
  const t = ((x - a[0]) * dx + (y - a[1]) * dy) / comprimento2
  if (t < -EPSILON || t > 1 + EPSILON) return false
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)) < EPSILON
}

/** Ponto em polígono: raio horizontal (par-ímpar) para o interior, e INCLUSIVO nas arestas e nos vértices. */
export function dentroDoPoligono(lon: number, lat: number, poligono: Poligono): boolean {
  let dentro = false
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i]!
    const b = poligono[j]!
    if (sobreOSegmento(lon, lat, a, b)) return true
    if (a[1] > lat !== b[1] > lat && lon < ((b[0] - a[0]) * (lat - a[1])) / (b[1] - a[1]) + a[0]) dentro = !dentro
  }
  return dentro
}

const temCoordenada = (lat: unknown, lon: unknown): lat is number => typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)

/** Todas as regiões que contêm o ponto (mais de uma só sobre uma borda comum), na ordem de `REGIOES`. */
export function regioesQueContem(lat: number, lon: number): string[] {
  return REGIOES.filter((r) => dentroDoPoligono(lon, lat, r.poligono)).map((r) => r.id)
}

/**
 * A região de uma coordenada: o id da primeira região (na ordem de `REGIOES`) cujo polígono contém o ponto, bordas incluídas;
 * `CHAVE_SEM_COORDENADA` sem coordenada; `CHAVE_FORA` se nenhum polígono a contém.
 */
export function regiaoDe(lat: number | null | undefined, lon: number | null | undefined): string {
  if (!temCoordenada(lat, lon)) return CHAVE_SEM_COORDENADA
  return REGIOES.find((r) => dentroDoPoligono(lon as number, lat, r.poligono))?.id ?? CHAVE_FORA
}

/** Os filtros, na ordem em que aparecem: as oito regiões e «Sem coordenada». «Fora das regiões» só aparece quando há sítio nela. */
export const FILTROS_DE_REGIAO: readonly { id: string; nome: string }[] = [...REGIOES.map((r) => ({ id: r.id, nome: r.nome })), { id: CHAVE_SEM_COORDENADA, nome: NOME_SEM_COORDENADA }]

export const nomeDaRegiao = (id: string): string => (id === CHAVE_SEM_COORDENADA ? NOME_SEM_COORDENADA : id === CHAVE_FORA ? NOME_FORA : (REGIOES.find((r) => r.id === id)?.nome ?? id))
