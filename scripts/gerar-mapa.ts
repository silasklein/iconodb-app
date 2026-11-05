/**
 * Gera o mapa base dos sítios (decisão 36): terra, lagos e fronteiras atuais, recortados à extensão dos sítios (com folga),
 * simplificados e quantizados, gravados em `src/sitios/mapa-base.json`. Script de desenvolvimento, rodado À MÃO; a saída
 * é versionada. O app não usa nada daqui em tempo de execução, e o mapa nunca pede nada à rede.
 *
 * Fontes (a origem, a versão e a licença também estão no README):
 * - terra e fronteiras: `world-atlas` 2.0.2 (npm, licença ISC; dados do Natural Earth, domínio público), `land-10m.json` e
 *   `countries-10m.json` (escala 1:10 milhões);
 * - lagos (Mar Morto, Kinneret e os demais da extensão): `ne_10m_lakes` do Natural Earth (domínio público), no commit
 *   f1890d9f152c896d250a77557a5751a93d494776 (tag v5.1.2) de github.com/nvkelso/natural-earth-vector. O arquivo é conferido pelo SHA-256
 *   abaixo: se não bater, o script para (nunca se inventa geometria).
 *
 * Uso:
 *   curl -o /tmp/ne_10m_lakes.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/f1890d9f152c896d250a77557a5751a93d494776/geojson/ne_10m_lakes.geojson
 *   node scripts/gerar-mapa.ts /tmp/ne_10m_lakes.geojson
 *
 * Formato do JSON: cada anel é uma lista de inteiros [X0, Y0, dX1, dY1, …]: o primeiro ponto absoluto, os outros relativos ao
 * anterior, em 1/`unidade` de grau (X = (lon − lon0) · unidade, Y = (lat1 − lat) · unidade). `terra` e `lagos` são anéis
 * fechados (preenchimento par-ímpar: os buracos vazam); `limites` são linhas abertas. O app não traça as arestas de `terra` que
 * correm sobre a borda do recorte (a borda do recorte não é costa): veja `caminhoDosAneis` em src/sitios/mapa.ts.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'

/** Os SHA-256 dos arquivos do `world-atlas` 2.0.2 (os mesmos do README): outra instalação do pacote não gera outro mapa sem aviso. */
export const SHA256_DO_WORLD_ATLAS: Readonly<Record<string, string>> = {
  'land-10m.json': '9b9f584709c119d63fbadf484ce425260497697b7166be7a2fe360e8c0b171a8',
  'countries-10m.json': '3bc6f1d367a9bcec479841bae0e76092f512838411d0cef124e92eec4db45f79',
}
export const SHA256_DOS_LAGOS = '2d036f53dedec578001c5c30c2959ee7d4eebc1306900fa4367c49929ec8f2d9'

/**
 * A extensão recortada: os sítios vão de 25°N a 38°N e de 30°E a 55°E; as regiões (Irã, Egito) pedem folga, e a folga vertical
 * é grande para o mapa preencher também a tela do celular em pé.
 */
export const EXTENSAO = { lon0: 22, lat0: 7, lon1: 62, lat1: 50 } as const
/** Unidades por grau no JSON (0,005°, cerca de 550 m). */
export const UNIDADE = 200
/** Tolerância da simplificação (graus). */
const TOLERANCIA = { terra: 0.003, limites: 0.004, lagos: 0.002 }
/** Ilhotas e lagos menores que isto (graus, maior lado) são descartados. */
const MINIMO = { terra: 0.03, lagos: 0.06 }

type Ponto = [number, number]
type Anel = Ponto[]

/** Recorta um anel pelo retângulo (Sutherland–Hodgman). Devolve o anel (aberto, sem repetir o primeiro ponto) ou vazio. */
export function recortarAnel(anel: readonly Ponto[], e = EXTENSAO): Anel {
  const arestas: { dentro: (p: Ponto) => boolean; cruza: (a: Ponto, b: Ponto) => Ponto }[] = [
    { dentro: (p) => p[0] >= e.lon0, cruza: (a, b) => [e.lon0, a[1] + ((b[1] - a[1]) * (e.lon0 - a[0])) / (b[0] - a[0])] },
    { dentro: (p) => p[0] <= e.lon1, cruza: (a, b) => [e.lon1, a[1] + ((b[1] - a[1]) * (e.lon1 - a[0])) / (b[0] - a[0])] },
    { dentro: (p) => p[1] >= e.lat0, cruza: (a, b) => [a[0] + ((b[0] - a[0]) * (e.lat0 - a[1])) / (b[1] - a[1]), e.lat0] },
    { dentro: (p) => p[1] <= e.lat1, cruza: (a, b) => [a[0] + ((b[0] - a[0]) * (e.lat1 - a[1])) / (b[1] - a[1]), e.lat1] },
  ]
  let saida: Anel = anel.map((p) => [p[0], p[1]])
  if (saida.length > 1 && saida[0]![0] === saida.at(-1)![0] && saida[0]![1] === saida.at(-1)![1]) saida.pop()
  for (const a of arestas) {
    const entrada = saida
    saida = []
    for (let i = 0; i < entrada.length; i++) {
      const atual = entrada[i]!
      const anterior = entrada[(i + entrada.length - 1) % entrada.length]!
      if (a.dentro(atual)) {
        if (!a.dentro(anterior)) saida.push(a.cruza(anterior, atual))
        saida.push(atual)
      } else if (a.dentro(anterior)) saida.push(a.cruza(anterior, atual))
    }
    if (saida.length === 0) return []
  }
  return saida
}

/** Recorta uma linha aberta pelo retângulo (Liang–Barsky por segmento); devolve os pedaços que ficam dentro. */
export function recortarLinha(linha: readonly Ponto[], e = EXTENSAO): Ponto[][] {
  const pedacos: Ponto[][] = []
  let atual: Ponto[] = []
  for (let i = 0; i + 1 < linha.length; i++) {
    const [x0, y0] = linha[i]!
    const [x1, y1] = linha[i + 1]!
    let t0 = 0
    let t1 = 1
    const dx = x1 - x0
    const dy = y1 - y0
    let fora = false
    for (const [p, q] of [
      [-dx, x0 - e.lon0],
      [dx, e.lon1 - x0],
      [-dy, y0 - e.lat0],
      [dy, e.lat1 - y0],
    ] as const) {
      if (p === 0) {
        if (q < 0) fora = true
      } else {
        const r = q / p
        if (p < 0) t0 = Math.max(t0, r)
        else t1 = Math.min(t1, r)
      }
    }
    if (fora || t0 > t1) {
      if (atual.length > 1) pedacos.push(atual)
      atual = []
      continue
    }
    const a: Ponto = [x0 + t0 * dx, y0 + t0 * dy]
    const b: Ponto = [x0 + t1 * dx, y0 + t1 * dy]
    const continua = atual.length > 0 && atual.at(-1)![0] === a[0] && atual.at(-1)![1] === a[1]
    if (!continua) {
      if (atual.length > 1) pedacos.push(atual)
      atual = [a]
    }
    atual.push(b)
  }
  if (atual.length > 1) pedacos.push(atual)
  return pedacos
}

function distanciaAoSegmento(p: Ponto, a: Ponto, b: Ponto): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Douglas–Peucker (iterativo) sobre uma linha aberta; mantém as pontas. */
export function simplificar(linha: readonly Ponto[], tolerancia: number): Ponto[] {
  if (linha.length <= 2) return [...linha]
  const fica = new Uint8Array(linha.length)
  fica[0] = 1
  fica[linha.length - 1] = 1
  const pilha: [number, number][] = [[0, linha.length - 1]]
  while (pilha.length > 0) {
    const [i, j] = pilha.pop()!
    let maior = 0
    let onde = -1
    for (let k = i + 1; k < j; k++) {
      const d = distanciaAoSegmento(linha[k]!, linha[i]!, linha[j]!)
      if (d > maior) {
        maior = d
        onde = k
      }
    }
    if (onde >= 0 && maior > tolerancia) {
      fica[onde] = 1
      pilha.push([i, onde], [onde, j])
    }
  }
  return linha.filter((_, k) => fica[k] === 1)
}

/** Um anel fechado simplificado: ancora o primeiro ponto e o mais distante, simplifica as duas metades. */
export function simplificarAnel(anel: readonly Ponto[], tolerancia: number): Anel {
  if (anel.length <= 3) return [...anel]
  let longe = 1
  let maior = -1
  for (let k = 1; k < anel.length; k++) {
    const d = Math.hypot(anel[k]![0] - anel[0]![0], anel[k]![1] - anel[0]![1])
    if (d > maior) {
      maior = d
      longe = k
    }
  }
  const a = simplificar(anel.slice(0, longe + 1), tolerancia)
  const b = simplificar([...anel.slice(longe), anel[0]!], tolerancia)
  return [...a.slice(0, -1), ...b.slice(0, -1)]
}

const maiorLado = (pontos: readonly Ponto[]) => {
  const xs = pontos.map((p) => p[0])
  const ys = pontos.map((p) => p[1])
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
}

/** Quantiza e codifica em [X0, Y0, dX, dY, …], sem pontos repetidos em seguida. Menos de `minimo` pontos: nada. */
export function codificar(pontos: readonly Ponto[], minimo: number, e = EXTENSAO): number[] {
  const inteiros: [number, number][] = []
  for (const [lon, lat] of pontos) {
    const x = Math.round((lon - e.lon0) * UNIDADE)
    const y = Math.round((e.lat1 - lat) * UNIDADE)
    const ultimo = inteiros.at(-1)
    if (!ultimo || ultimo[0] !== x || ultimo[1] !== y) inteiros.push([x, y])
  }
  if (inteiros.length < minimo) return []
  const saida: number[] = [inteiros[0]![0], inteiros[0]![1]]
  for (let k = 1; k < inteiros.length; k++) saida.push(inteiros[k]![0] - inteiros[k - 1]![0], inteiros[k]![1] - inteiros[k - 1]![1])
  return saida
}

const aneisDe = (g: Polygon | MultiPolygon): Ponto[][] =>
  (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flatMap((poligono) => poligono.map((anel) => anel.map((p: Position) => [p[0]!, p[1]!] as Ponto)))

function aneis(geometrias: readonly (Polygon | MultiPolygon)[], tolerancia: number, minimo: number): number[][] {
  const saida: number[][] = []
  for (const g of geometrias) {
    for (const anel of aneisDe(g)) {
      const recortado = recortarAnel(anel)
      if (recortado.length < 3 || maiorLado(recortado) < minimo) continue
      const codificado = codificar(simplificarAnel(recortado, tolerancia), 3)
      if (codificado.length > 0) saida.push(codificado)
    }
  }
  return saida
}

export interface MapaBase {
  versao: 1
  unidade: number
  lon0: number
  lat0: number
  lon1: number
  lat1: number
  terra: number[][]
  lagos: number[][]
  limites: number[][]
}

export function gerarMapa(raizDoNpm: string, lagosGeojson: string): MapaBase {
  const lerTopo = (arquivo: string) => {
    const bytes = readFileSync(join(raizDoNpm, 'world-atlas', arquivo))
    const sha = createHash('sha256').update(bytes).digest('hex')
    if (sha !== SHA256_DO_WORLD_ATLAS[arquivo]) throw new Error(`world-atlas/${arquivo} com SHA-256 ${sha}; esperado ${SHA256_DO_WORLD_ATLAS[arquivo]}. Não vou gerar com outro arquivo.`)
    return JSON.parse(bytes.toString('utf8')) as Topology
  }
  const terraTopo = lerTopo('land-10m.json')
  const paisesTopo = lerTopo('countries-10m.json')

  const terra = feature(terraTopo, terraTopo.objects.land as GeometryCollection) as unknown as FeatureCollection<Polygon | MultiPolygon> | Feature<Polygon | MultiPolygon>
  const geometriasDaTerra = ('features' in terra ? terra.features : [terra]).map((f) => f.geometry)

  // Só as fronteiras entre dois países (as linhas de costa já são o contorno da terra).
  const fronteiras = mesh(paisesTopo, paisesTopo.objects.countries as GeometryCollection, (a, b) => a !== b)
  const linhas: Ponto[][] = (fronteiras.type === 'MultiLineString' ? fronteiras.coordinates : [fronteiras.coordinates]).map((l) => l.map((p) => [p[0]!, p[1]!] as Ponto))
  const limites: number[][] = []
  for (const linha of linhas) {
    for (const pedaco of recortarLinha(linha)) {
      const codificado = codificar(simplificar(pedaco, TOLERANCIA.limites), 2)
      if (codificado.length > 0) limites.push(codificado)
    }
  }

  const lagos = JSON.parse(lagosGeojson) as FeatureCollection<Polygon | MultiPolygon>

  return {
    versao: 1,
    unidade: UNIDADE,
    ...EXTENSAO,
    terra: aneis(geometriasDaTerra, TOLERANCIA.terra, MINIMO.terra),
    lagos: aneis(
      lagos.features.map((f) => f.geometry),
      TOLERANCIA.lagos,
      MINIMO.lagos,
    ),
    limites,
  }
}

// Executado direto (`node scripts/gerar-mapa.ts <ne_10m_lakes.geojson>`): grava src/sitios/mapa-base.json.
if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const arquivo = process.argv[2]
  if (!arquivo) throw new Error('Uso: node scripts/gerar-mapa.ts <ne_10m_lakes.geojson> (veja o cabeçalho deste arquivo)')
  const bytes = readFileSync(arquivo)
  const sha = createHash('sha256').update(bytes).digest('hex')
  if (sha !== SHA256_DOS_LAGOS) throw new Error(`ne_10m_lakes.geojson com SHA-256 ${sha}; esperado ${SHA256_DOS_LAGOS}. Não vou gerar com outro arquivo.`)
  const raiz = join(import.meta.dirname, '..')
  const mapa = gerarMapa(join(raiz, 'node_modules'), bytes.toString('utf8'))
  const destino = join(raiz, 'src/sitios/mapa-base.json')
  const texto = JSON.stringify(mapa)
  writeFileSync(destino, texto)
  const pontos = (l: number[][]) => l.reduce((s, a) => s + a.length / 2, 0)
  console.log(`${destino}: ${texto.length} bytes; terra ${mapa.terra.length} anéis / ${pontos(mapa.terra)} pontos; lagos ${mapa.lagos.length} / ${pontos(mapa.lagos)}; limites ${mapa.limites.length} / ${pontos(mapa.limites)}`)
}
