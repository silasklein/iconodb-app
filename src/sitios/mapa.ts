/**
 * A geometria do mapa dos sítios (decisão 36): a projeção, os caminhos SVG, os pontos (sítios de mesma coordenada fundidos), a
 * visão (ajuste, zoom, arrastar), a barra de escala e a escolha dos rótulos. PURO: sem React nem DOM. O desenho está em
 * Mapa.tsx; o mapa base (terra, lagos, fronteiras) vem de `mapa-base.json`, gerado por scripts/gerar-mapa.ts.
 *
 * O PLANO "BASE": equirretangular com o eixo x encolhido por cos 33° (a latitude média dos sítios), 100 unidades por grau de
 * latitude; a origem é o canto noroeste da extensão recortada. A visão é {x, y, k}: tela = base · k + (x, y).
 */
import type { Poligono } from './regioes'

/** O recorte do mapa base (o mesmo de scripts/gerar-mapa.ts; um teste confere com o JSON). */
export const EXTENSAO = { lon0: 22, lat0: 7, lon1: 62, lat1: 50 } as const

const COS = Math.cos((33 * Math.PI) / 180)
const UNIDADES_POR_GRAU = 100
const KM_POR_GRAU = 111.195

export const LARGURA_DA_EXTENSAO = (EXTENSAO.lon1 - EXTENSAO.lon0) * COS * UNIDADES_POR_GRAU
export const ALTURA_DA_EXTENSAO = (EXTENSAO.lat1 - EXTENSAO.lat0) * UNIDADES_POR_GRAU

export interface Plano {
  x: number
  y: number
}

/** (latitude, longitude) → plano base. */
export function projetar(lat: number, lon: number): Plano {
  return { x: (lon - EXTENSAO.lon0) * COS * UNIDADES_POR_GRAU, y: (EXTENSAO.lat1 - lat) * UNIDADES_POR_GRAU }
}

/** Plano base → (latitude, longitude). */
export function desprojetar(x: number, y: number): { lat: number; lon: number } {
  return { lat: EXTENSAO.lat1 - y / UNIDADES_POR_GRAU, lon: EXTENSAO.lon0 + x / (COS * UNIDADES_POR_GRAU) }
}

const n1 = (v: number) => v.toFixed(1)

/** Os anéis do JSON ([X0, Y0, dX, dY, …]) em pontos absolutos, na unidade do JSON. */
function pontosDoAnel(anel: readonly number[]): [number, number][] {
  const pontos: [number, number][] = []
  let X = anel[0]!
  let Y = anel[1]!
  pontos.push([X, Y])
  for (let i = 2; i + 1 < anel.length; i += 2) {
    X += anel[i]!
    Y += anel[i + 1]!
    pontos.push([X, Y])
  }
  return pontos
}

/**
 * Os anéis do JSON como um caminho SVG no plano base. `fechado`: anéis fechados (a terra e os lagos, para preencher);
 * `aberto`: linhas abertas (as fronteiras); `costa`: os anéis da terra como linhas, SEM as arestas que correm sobre a borda do
 * recorte (a borda do recorte não é costa e não deve aparecer riscada quando o mapa chega nela).
 */
export function caminhoDosAneis(aneis: readonly (readonly number[])[], unidade: number, modo: 'fechado' | 'aberto' | 'costa'): string {
  const fx = (COS * UNIDADES_POR_GRAU) / unidade
  const fy = UNIDADES_POR_GRAU / unidade
  const xy = ([X, Y]: readonly [number, number]) => `${n1(X * fx)} ${n1(Y * fy)}`
  const larguraInteira = Math.round((EXTENSAO.lon1 - EXTENSAO.lon0) * unidade)
  const alturaInteira = Math.round((EXTENSAO.lat1 - EXTENSAO.lat0) * unidade)
  const naBorda = (a: readonly [number, number], b: readonly [number, number]) =>
    (a[0] === 0 && b[0] === 0) || (a[0] === larguraInteira && b[0] === larguraInteira) || (a[1] === 0 && b[1] === 0) || (a[1] === alturaInteira && b[1] === alturaInteira)
  const partes: string[] = []
  for (const anel of aneis) {
    const pontos = pontosDoAnel(anel)
    if (modo === 'costa') {
      let linha: [number, number][] = []
      const fecha = () => {
        if (linha.length > 1) partes.push(`M${linha.map(xy).join(' ')}`)
        linha = []
      }
      for (let i = 0; i < pontos.length; i++) {
        const a = pontos[i]!
        const b = pontos[(i + 1) % pontos.length]!
        if (naBorda(a, b)) fecha()
        else {
          if (linha.length === 0) linha.push(a)
          linha.push(b)
        }
      }
      fecha()
    } else {
      partes.push(`M${pontos.map(xy).join(' ')}${modo === 'fechado' ? 'z' : ''}`)
    }
  }
  return partes.join('')
}

/** O polígono de uma região ([lon, lat]) como caminho SVG fechado no plano base. */
export function caminhoDoPoligono(poligono: Poligono): string {
  const pontos = poligono.map(([lon, lat]) => projetar(lat, lon))
  return `M${pontos.map((p) => `${n1(p.x)} ${n1(p.y)}`).join(' ')}z`
}

/**
 * As arestas das regiões, cada uma UMA vez (as regiões vizinhas dividem as arestas): um caminho só de segmentos. Desenhar cada
 * polígono separado traçaria a aresta comum duas vezes, com os tracejados defasados, e ela pareceria contínua.
 */
export function caminhoDasArestas(poligonos: readonly Poligono[]): { caminho: string; total: number; unicas: number } {
  const vistas = new Set<string>()
  const segmentos: string[] = []
  let total = 0
  for (const p of poligonos) {
    p.forEach((a, i) => {
      const b = p[(i + 1) % p.length]!
      total++
      const [u, v] = [`${a[0]},${a[1]}`, `${b[0]},${b[1]}`].sort() as [string, string]
      const chave = `${u}|${v}`
      if (vistas.has(chave)) return
      vistas.add(chave)
      const pa = projetar(a[1], a[0])
      const pb = projetar(b[1], b[0])
      segmentos.push(`M${n1(pa.x)} ${n1(pa.y)}L${n1(pb.x)} ${n1(pb.y)}`)
    })
  }
  return { caminho: segmentos.join(''), total, unicas: segmentos.length }
}

// ---------------------------------------------------------------------------------------------------------------------
// Pontos
// ---------------------------------------------------------------------------------------------------------------------

/** Um sítio com coordenada, como o mapa o recebe (do livro, corrigido ou do usuário). */
export interface SitioNoMapa {
  id: string
  nome: string
  lat: number
  lon: number
  objetos: number
  /** O id da região geográfica (regioes.ts). */
  regiao: string
  doUsuario: boolean
}

/**
 * Um ponto do mapa: uma ou mais coordenadas iguais. Genérico sobre «a lista de sítios neste ponto» (decisão 49: mesclar
 * sítios e subdivisões virá na Parte 2C): o cartão e a lista só leem `sitios`.
 */
export interface PontoDoMapa {
  chave: string
  lat: number
  lon: number
  sitios: SitioNoMapa[]
  objetos: number
  nome: string
  /** O nome acessível do ponto: os sítios e a contagem. */
  aria: string
}

const formatoDaLista = new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' })
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

export const chaveDaCoordenada = (lat: number, lon: number) => `${lat.toFixed(5)},${lon.toFixed(5)}`

/** Funde os sítios de mesma coordenada (5 casas) num ponto só; a ordem é a do primeiro sítio de cada ponto. */
export function agruparPontos(sitios: readonly SitioNoMapa[]): PontoDoMapa[] {
  const porChave = new Map<string, SitioNoMapa[]>()
  for (const s of sitios) {
    const chave = chaveDaCoordenada(s.lat, s.lon)
    const grupo = porChave.get(chave)
    if (grupo) grupo.push(s)
    else porChave.set(chave, [s])
  }
  return [...porChave].map(([chave, grupo]) => {
    const objetos = grupo.reduce((soma, s) => soma + s.objetos, 0)
    const nome = formatoDaLista.format(grupo.map((s) => s.nome))
    const aria = grupo.length === 1 ? `${nome}, ${plural(objetos, 'objeto', 'objetos')}` : `${nome}, ${plural(grupo.length, 'sítio', 'sítios')}, ${plural(objetos, 'objeto', 'objetos')}`
    return { chave, lat: grupo[0]!.lat, lon: grupo[0]!.lon, sitios: grupo, objetos, nome, aria }
  })
}

/** O diâmetro do ponto pelo número de objetos: 8 px com 1, 10 com 2 a 4, 13 com 5 a 9, 16 com 10 a 19, 20 com 20 ou mais. */
export function diametroDoPonto(objetos: number): number {
  return objetos >= 20 ? 20 : objetos >= 10 ? 16 : objetos >= 5 ? 13 : objetos >= 2 ? 10 : 8
}

// ---------------------------------------------------------------------------------------------------------------------
// Visão
// ---------------------------------------------------------------------------------------------------------------------

export interface Estagio {
  w: number
  h: number
}
/** tela = base · k + (x, y) */
export interface Visao {
  x: number
  y: number
  k: number
}
export interface Caixa {
  x0: number
  y0: number
  x1: number
  y1: number
}

const K_MAXIMO = 6
/** Um ponto só (ou pontos muito juntos) não é enquadrado além disto. */
const K_DO_AJUSTE = 3

/**
 * Os limites do zoom: o mínimo «cobre» o palco (o mapa o preenche nos dois eixos, então nunca aparece a borda reta da terra no
 * meio do branco); o máximo são 600 px por grau.
 */
export function limitesDaVisao(e: Estagio): { kMin: number; kMax: number } {
  return { kMin: Math.max(e.w / LARGURA_DA_EXTENSAO, e.h / ALTURA_DA_EXTENSAO), kMax: K_MAXIMO }
}

const entre = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Segura a visão: o zoom entre os limites e a extensão sempre cobrindo o palco (ou centrada, se cabe inteira). */
export function segurar(v: Visao, e: Estagio): Visao {
  const { kMin, kMax } = limitesDaVisao(e)
  const k = entre(v.k, kMin, kMax)
  const eixo = (pos: number, tamanhoDoMapa: number, palco: number) => {
    const t = tamanhoDoMapa * k
    return t <= palco ? (palco - t) / 2 : entre(pos, palco - t, 0)
  }
  return { k, x: eixo(v.x, LARGURA_DA_EXTENSAO, e.w), y: eixo(v.y, ALTURA_DA_EXTENSAO, e.h) }
}

/** A caixa (no plano base) que contém os pontos; sem pontos, a extensão inteira. */
export function caixaDosPontos(pontos: readonly Pick<PontoDoMapa, 'lat' | 'lon'>[]): Caixa {
  if (pontos.length === 0) return { x0: 0, y0: 0, x1: LARGURA_DA_EXTENSAO, y1: ALTURA_DA_EXTENSAO }
  const ps = pontos.map((p) => projetar(p.lat, p.lon))
  return { x0: Math.min(...ps.map((p) => p.x)), y0: Math.min(...ps.map((p) => p.y)), x1: Math.max(...ps.map((p) => p.x)), y1: Math.max(...ps.map((p) => p.y)) }
}

/** «Ver tudo»: enquadra a caixa no palco, centrada, com a margem (px) em volta. */
export function ajustarA(caixa: Caixa, e: Estagio, margem: number): Visao {
  const larg = Math.max(caixa.x1 - caixa.x0, 1e-6)
  const alt = Math.max(caixa.y1 - caixa.y0, 1e-6)
  const { kMin } = limitesDaVisao(e)
  const k = entre(Math.min(Math.max(e.w - 2 * margem, 1) / larg, Math.max(e.h - 2 * margem, 1) / alt), kMin, K_DO_AJUSTE)
  const cx = (caixa.x0 + caixa.x1) / 2
  const cy = (caixa.y0 + caixa.y1) / 2
  return segurar({ k, x: e.w / 2 - cx * k, y: e.h / 2 - cy * k }, e)
}

/** Aproxima (fator > 1) ou afasta (< 1) mantendo fixo o ponto da tela (cx, cy). */
export function aproximar(v: Visao, fator: number, cx: number, cy: number, e: Estagio): Visao {
  const { kMin, kMax } = limitesDaVisao(e)
  const k = entre(v.k * fator, kMin, kMax)
  const bx = (cx - v.x) / v.k
  const by = (cy - v.y) / v.k
  return segurar({ k, x: cx - bx * k, y: cy - by * k }, e)
}

/** Arrasta a visão `dx`, `dy` pixels. */
export const mover = (v: Visao, dx: number, dy: number, e: Estagio): Visao => segurar({ ...v, x: v.x + dx, y: v.y + dy }, e)

/** Põe o ponto (bx, by) do plano base no centro do palco, com o zoom `k`. */
export const centrarEm = (bx: number, by: number, k: number, e: Estagio): Visao => segurar({ k, x: e.w / 2 - bx * k, y: e.h / 2 - by * k }, e)

/** O retângulo que a visão mostra, no plano base. */
export function retanguloVisivel(v: Visao, e: Estagio): Caixa {
  return { x0: -v.x / v.k, y0: -v.y / v.k, x1: (e.w - v.x) / v.k, y1: (e.h - v.y) / v.k }
}

// ---------------------------------------------------------------------------------------------------------------------
// Escala e rótulos
// ---------------------------------------------------------------------------------------------------------------------

const KM_REDONDOS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]

/** A barra de escala: o maior valor redondo (km) cuja barra, na latitude dada, cabe em 130 px. */
export function escalaDaBarra(k: number, lat: number): { km: number; largura: number } {
  const pxPorKm = (UNIDADES_POR_GRAU * COS * k) / (KM_POR_GRAU * Math.cos((lat * Math.PI) / 180))
  let km = KM_REDONDOS[0]!
  for (const c of KM_REDONDOS) if (c * pxPorKm <= 130) km = c
  return { km, largura: km * pxPorKm }
}

export interface CaixaDePonto {
  chave: string
  nome: string
  /** O centro do ponto no palco, em px. */
  x: number
  y: number
  d: number
  objetos: number
}
export interface Rotulo {
  chave: string
  nome: string
  esq: number
  topo: number
  larg: number
  alt: number
  /** `inicio`: o rótulo fica à direita do ponto; `fim`: à esquerda (o texto termina junto do ponto). */
  alinhar: 'inicio' | 'fim'
  forte: boolean
}

// ---------------------------------------------------------------------------------------------------------------------
// Pontos sob o dedo e o teclado
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Qual ponto está sob a posição (x, y) do palco: o MAIS PERTO dentro do raio (`raioMinimo`, ou metade do diâmetro do ponto, o
 * que for maior). Os alvos de toque de pontos vizinhos se sobrepõem; quem decide é a distância, não a ordem no DOM. O empate
 * (mesma posição na tela) é desfeito pela ordem da lista. Sem ponto no raio: null (o toque é no fundo).
 */
export function pontoNaPosicao(pontos: readonly CaixaDePonto[], x: number, y: number, raioMinimo: number): string | null {
  let melhor: string | null = null
  let menor = Infinity
  for (const p of pontos) {
    const dist = Math.hypot(p.x - x, p.y - y)
    if (dist <= Math.max(raioMinimo, p.d / 2) && dist < menor) {
      menor = dist
      melhor = p.chave
    }
  }
  return melhor
}

/** O vizinho mais próximo de `chave` na direção (dx, dy) da tela (uma seta); null se não há ninguém daquele lado. */
export function vizinhoNaDirecao(pontos: readonly CaixaDePonto[], chave: string, dx: number, dy: number): string | null {
  const atual = pontos.find((p) => p.chave === chave)
  if (!atual) return null
  let melhor: string | null = null
  let menor = Infinity
  for (const p of pontos) {
    if (p.chave === chave) continue
    const ao = (p.x - atual.x) * dx + (p.y - atual.y) * dy
    if (ao <= 0.01) continue
    const lado = Math.abs((p.x - atual.x) * dy - (p.y - atual.y) * dx)
    const nota = ao + 2 * lado
    if (nota < menor) {
      menor = nota
      melhor = p.chave
    }
  }
  return melhor
}

/** Todos os pontos em ordem de leitura (da esquerda para a direita, de cima para baixo): PageDown e PageUp percorrem esta lista. */
export function ordemDeLeitura(pontos: readonly CaixaDePonto[]): string[] {
  return [...pontos].sort((a, b) => a.x - b.x || a.y - b.y || a.chave.localeCompare(b.chave)).map((p) => p.chave)
}

const ALTURA_DO_ROTULO = 18
const LARGURA_POR_LETRA = 7
const FOLGA = 5

const sobrepoe = (a: { esq: number; topo: number; larg: number; alt: number }, b: { esq: number; topo: number; larg: number; alt: number }) =>
  a.esq < b.esq + b.larg && b.esq < a.esq + a.larg && a.topo < b.topo + b.alt && b.topo < a.topo + a.alt

/**
 * Quais pontos ganham o nome escrito ao lado: primeiro os destacados (em negrito), depois os de mais objetos; um rótulo só
 * entra se não cobrir outro rótulo nem outro ponto, e cabe no palco (à direita do ponto ou, se não couber, à esquerda).
 */
export function rotulosVisiveis(
  pontos: readonly CaixaDePonto[],
  o: {
    destaque: ReadonlySet<string>
    largura: number
    altura: number
    max: number
    /** A largura medida do texto (px); sem ela, uma estimativa por letra. */
    larguraDe?: (nome: string, forte: boolean) => number
    /** Áreas onde um rótulo não entra (os controles, o minimapa, a escala, o crédito): {esq, topo, larg, alt} em px do palco. */
    proibidas?: readonly { esq: number; topo: number; larg: number; alt: number }[]
  },
): Rotulo[] {
  const dentro = pontos.filter((p) => p.x >= 0 && p.x <= o.largura && p.y >= 0 && p.y <= o.altura)
  const ordem = [...dentro].sort((a, b) => Number(o.destaque.has(b.chave)) - Number(o.destaque.has(a.chave)) || b.objetos - a.objetos || a.nome.localeCompare(b.nome, 'pt'))
  const colocados: Rotulo[] = []
  for (const p of ordem) {
    if (colocados.length >= o.max) break
    const forte = o.destaque.has(p.chave)
    const larg = o.larguraDe ? o.larguraDe(p.nome, forte) : p.nome.length * LARGURA_POR_LETRA
    const candidatos: Rotulo[] = [
      { chave: p.chave, nome: p.nome, esq: p.x + p.d / 2 + FOLGA, topo: p.y - ALTURA_DO_ROTULO / 2, larg, alt: ALTURA_DO_ROTULO, alinhar: 'inicio', forte },
      { chave: p.chave, nome: p.nome, esq: p.x - p.d / 2 - FOLGA - larg, topo: p.y - ALTURA_DO_ROTULO / 2, larg, alt: ALTURA_DO_ROTULO, alinhar: 'fim', forte },
    ]
    const serve = candidatos.find(
      (c) =>
        c.esq >= 0 &&
        c.esq + c.larg <= o.largura &&
        !colocados.some((r) => sobrepoe(c, r)) &&
        !(o.proibidas ?? []).some((z) => sobrepoe(c, z)) &&
        !dentro.some((q) => q.chave !== p.chave && sobrepoe(c, { esq: q.x - q.d / 2, topo: q.y - q.d / 2, larg: q.d, alt: q.d })),
    )
    if (serve) colocados.push(serve)
  }
  return colocados
}

/** Quanto (px) um ponteiro pode andar entre apertar e soltar e ainda ser um toque, não um arrasto: o mouse é preciso; o dedo e a caneta tremem. */
export function raioDoToque(tipoDoPonteiro: string): number {
  return tipoDoPonteiro === 'mouse' ? 4 : 10
}

export interface RotuloDeRegiao {
  id: string
  nome: string
  /** O centro do nome na tela (px do palco) e a caixa que ele ocupa. */
  x: number
  y: number
  esq: number
  topo: number
  larg: number
  alt: number
  alinhar: 'meio' | 'fim'
}

const DESLOCAMENTOS_DO_NOME = [0, -20, 20, -40, 40, -60, 60]
const DESLOCAMENTOS_LATERAIS = [-24, 24, -48, 48, -72, 72, -96, 96]
const PASSO_DA_GRADE = 14

const dentroDoAnel = (x: number, y: number, anel: readonly { x: number; y: number }[]) => {
  let dentro = false
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const a = anel[i]!
    const b = anel[j]!
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro
  }
  return dentro
}

/**
 * Onde escrever o nome de cada região (m12, m17). O nome nasce no lugar que o desenho pede e, se cobriria outro nome de região, um
 * ponto, o nome de outro lugar ou uma área proibida, procura outro lugar, nesta ordem: acima e abaixo em passos de 20 px; para os
 * lados em passos de 24 px; e, por fim, dentro do polígono da região (`poligono`, em px do palco), nos pontos de uma grade, do mais
 * perto do lugar do desenho para o mais longe. Se nenhum lugar livre existe, uma região que tem sítios (`temSitios`) ainda leva o
 * nome, no lugar que cobre menos pontos (o halo branco do texto deixa o ponto legível), sempre sem cobrir outro nome nem os
 * controles; uma região sem sítios nesse caso não é escrita. Os nomes mais importantes (as regiões ativas) escolhem primeiro. O
 * tamanho do texto não muda (12 px é o mínimo do app). Cada nome fica inteiro no palco.
 */
export function rotulosDeRegiao(
  regioes: readonly {
    id: string
    nome: string
    x: number
    y: number
    larg: number
    alinhar: 'meio' | 'fim'
    prioridade?: boolean
    temSitios?: boolean
    poligono?: readonly { x: number; y: number }[]
  }[],
  o: {
    largura: number
    altura: number
    pontos: readonly { x: number; y: number; d: number }[]
    proibidas: readonly { esq: number; topo: number; larg: number; alt: number }[]
  },
): RotuloDeRegiao[] {
  const colocados: RotuloDeRegiao[] = []
  const ordem = [...regioes].sort((a, b) => Number(!!b.prioridade) - Number(!!a.prioridade))
  const caixasDosPontos = o.pontos.map((q) => ({ esq: q.x - q.d / 2 - FOLGA, topo: q.y - q.d / 2 - FOLGA, larg: q.d + 2 * FOLGA, alt: q.d + 2 * FOLGA }))
  for (const r of ordem) {
    const candidatos: { x: number; y: number; alinhar: 'meio' | 'fim' }[] = []
    const origemNoPalco = r.x >= 0 && r.x <= o.largura && r.y >= 0 && r.y <= o.altura
    if (origemNoPalco) {
      const x = r.alinhar === 'fim' ? Math.min(Math.max(r.x, r.larg + 8), o.largura - 8) : Math.min(Math.max(r.x, r.larg / 2 + 8), o.largura - r.larg / 2 - 8)
      for (const dy of DESLOCAMENTOS_DO_NOME) candidatos.push({ x, y: r.y + dy, alinhar: r.alinhar })
      for (const dx of DESLOCAMENTOS_LATERAIS) for (const dy of DESLOCAMENTOS_DO_NOME.slice(0, 5)) candidatos.push({ x: x + dx, y: r.y + dy, alinhar: r.alinhar })
    }
    // (o `as` impede o TypeScript de dar por nulos estes dois, que `percorrer` preenche)
    let melhor = null as { c: (typeof candidatos)[number]; caixa: { esq: number; topo: number; larg: number; alt: number }; tocados: number } | null
    let escolhido = null as RotuloDeRegiao | null
    /** Percorre os candidatos na ordem; o primeiro que não toca em ponto nenhum vale. Guarda o que toca menos, para o caso de nenhum livre. */
    const percorrer = (lista: typeof candidatos) => {
      for (const c of lista) {
        if (c.y < 9 || c.y > o.altura - 9) continue
        const caixa = { esq: c.alinhar === 'fim' ? c.x - r.larg : c.x - r.larg / 2, topo: c.y - ALTURA_DO_ROTULO / 2, larg: r.larg, alt: ALTURA_DO_ROTULO }
        if (caixa.esq < 0 || caixa.esq + caixa.larg > o.largura) continue
        if (colocados.some((k) => sobrepoe({ ...caixa, esq: caixa.esq - FOLGA, larg: caixa.larg + 2 * FOLGA }, k)) || o.proibidas.some((z) => sobrepoe(caixa, z))) continue
        const tocados = caixasDosPontos.filter((q) => sobrepoe(caixa, q)).length
        if (tocados === 0) {
          escolhido = { id: r.id, nome: r.nome, x: c.x, y: c.y, ...caixa, alinhar: c.alinhar }
          return
        }
        if (melhor === null || tocados < melhor.tocados) melhor = { c, caixa, tocados }
      }
    }
    percorrer(candidatos)
    // A grade do interior do polígono é a parte cara (a cada mudança de visão, e a visão muda a cada quadro de um arrasto): só se monta
    // se o lugar do desenho e os desvios simples não bastaram (T17-C-29). A ordem dos candidatos é a mesma de antes.
    if (!escolhido && r.poligono && r.poligono.length >= 3) {
      const interior: { x: number; y: number; alinhar: 'meio'; d: number }[] = []
      for (let y = 9; y <= o.altura - 9; y += PASSO_DA_GRADE) {
        for (let x = r.larg / 2 + 8; x <= o.largura - r.larg / 2 - 8; x += PASSO_DA_GRADE) {
          if (dentroDoAnel(x, y, r.poligono)) interior.push({ x, y, alinhar: 'meio', d: Math.hypot(x - r.x, y - r.y) })
        }
      }
      interior.sort((a, b) => a.d - b.d)
      percorrer(interior)
    }
    if (!escolhido && r.temSitios && melhor) escolhido = { id: r.id, nome: r.nome, x: melhor.c.x, y: melhor.c.y, ...melhor.caixa, alinhar: melhor.c.alinhar }
    if (escolhido) colocados.push(escolhido)
  }
  return colocados
}
