import base from './mapa-base.json'
import {
  ALTURA_DA_EXTENSAO,
  EXTENSAO,
  LARGURA_DA_EXTENSAO,
  segurar,
  ajustarA,
  agruparPontos,
  caixaDosPontos,
  caminhoDosAneis,
  caminhoDasArestas,
  caminhoDoPoligono,
  centrarEm,
  diametroDoPonto,
  escalaDaBarra,
  limitesDaVisao,
  mover,
  pontoNaPosicao,
  raioDoToque,
  rotulosDeRegiao,
  vizinhoNaDirecao,
  ordemDeLeitura,
  projetar,
  rotulosVisiveis,
  aproximar,
  type SitioNoMapa,
} from './mapa'
import { REGIOES } from './regioes'

const sitio = (id: string, lat: number, lon: number, objetos = 1, nome = id): SitioNoMapa => ({ id, nome, lat, lon, objetos, regiao: 'levante-sul', doUsuario: false })

describe('o mapa base (gerado por scripts/gerar-mapa.ts)', () => {
  it('cabe no orçamento: o JSON tem no máximo 400 KB', () => {
    expect(JSON.stringify(base).length).toBeLessThanOrEqual(400 * 1024)
  })

  it('a extensão do JSON é a que o app usa, e cobre todas as regiões', () => {
    expect({ lon0: base.lon0, lat0: base.lat0, lon1: base.lon1, lat1: base.lat1 }).toEqual(EXTENSAO)
    for (const r of REGIOES) {
      for (const [lon, lat] of r.poligono) {
        // o Egito e o Irã chegam às bordas do recorte: o mapa cobre os vértices com folga ou na própria borda
        expect(lon).toBeGreaterThanOrEqual(EXTENSAO.lon0)
        expect(lon).toBeLessThanOrEqual(EXTENSAO.lon1)
        expect(lat).toBeGreaterThanOrEqual(EXTENSAO.lat0)
        expect(lat).toBeLessThanOrEqual(EXTENSAO.lat1)
      }
    }
  })

  it('traz terra, lagos e fronteiras, e o Mar Morto e o Kinneret entre os lagos', () => {
    expect(base.terra.length).toBeGreaterThan(50)
    expect(base.limites.length).toBeGreaterThan(10)
    // o centro de cada anel de lago, em graus: o Mar Morto (31,5 N; 35,5 E) e o Kinneret (32,8 N; 35,6 E)
    const centros = base.lagos.map((anel) => {
      let x = anel[0]!
      let y = anel[1]!
      const xs = [x]
      const ys = [y]
      for (let i = 2; i < anel.length; i += 2) {
        x += anel[i]!
        y += anel[i + 1]!
        xs.push(x)
        ys.push(y)
      }
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2 / base.unidade + base.lon0
      const cy = base.lat1 - (Math.min(...ys) + Math.max(...ys)) / 2 / base.unidade
      return { lon: cx, lat: cy }
    })
    const perto = (lat: number, lon: number) => centros.some((c) => Math.abs(c.lat - lat) < 0.35 && Math.abs(c.lon - lon) < 0.2)
    expect(perto(31.5, 35.48)).toBe(true)
    expect(perto(32.8, 35.58)).toBe(true)
  })

  it('o caminho da terra cobre o interior do Levante e não cobre o Mediterrâneo ao largo de Gaza (par-ímpar)', () => {
    // conta cruzamentos horizontais dos anéis de terra num ponto, na grade do JSON
    const dentroDe = (aneis: readonly (readonly number[])[], lat: number, lon: number) => {
      const px = (lon - base.lon0) * base.unidade
      const py = (base.lat1 - lat) * base.unidade
      let cruzamentos = 0
      for (const anel of aneis) {
        const pts: [number, number][] = [[anel[0]!, anel[1]!]]
        for (let i = 2; i < anel.length; i += 2) pts.push([pts.at(-1)![0] + anel[i]!, pts.at(-1)![1] + anel[i + 1]!])
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i]!
          const [xj, yj] = pts[j]!
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) cruzamentos++
        }
      }
      return cruzamentos % 2 === 1
    }
    const dentro = (lat: number, lon: number) => dentroDe(base.terra, lat, lon)
    const dentroDosLagos = (lat: number, lon: number) => dentroDe(base.lagos, lat, lon)
    expect(dentro(31.8, 35.1)).toBe(true) // interior do Levante
    expect(dentro(30.1, 31.3)).toBe(true) // vale do Nilo
    expect(dentro(31.5, 33.0)).toBe(false) // Mediterrâneo, ao largo de Gaza
    // m10: as ilhas pequenas são terra (pintadas), e nenhum lago as escava
    expect(dentro(35.0, 33.2)).toBe(true) // Chipre, interior
    expect(dentro(35.2, 24.9)).toBe(true) // Creta, interior
    expect(dentro(35.6, 32.0)).toBe(false) // o mar entre Chipre e a Anatólia: controle negativo
    expect(dentro(35.0, 33.2) && !dentroDosLagos(35.0, 33.2)).toBe(true)
    expect(dentro(35.2, 24.9) && !dentroDosLagos(35.2, 24.9)).toBe(true)
    expect(dentro(31.5, 35.48)).toBe(true) // o Mar Morto está na terra; é o lago, desenhado por cima em branco, que o escava
  })
})

describe('projeção e caminhos', () => {
  it('norte é para cima e leste é para a direita; um grau de latitude vale 100 unidades', () => {
    const a = projetar(31, 35)
    const b = projetar(32, 36)
    expect(b.y).toBeLessThan(a.y)
    expect(b.x).toBeGreaterThan(a.x)
    expect(a.y - b.y).toBeCloseTo(100, 6)
    expect(b.x - a.x).toBeCloseTo(100 * Math.cos((33 * Math.PI) / 180), 6)
  })

  it('o caminho de anéis fechados começa em M, usa pontos absolutos e fecha com z; o aberto não fecha', () => {
    const d = caminhoDosAneis([[0, 0, 10, 0, 0, 10, -10, 0]], 200, 'fechado')
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('z')).toBe(true)
    expect(d.match(/M/g)).toHaveLength(1)
    expect(caminhoDosAneis([[0, 0, 10, 0]], 200, 'aberto').endsWith('z')).toBe(false)
  })

  it('a costa não traça as arestas que correm sobre a borda do recorte', () => {
    // um anel que encosta na borda oeste (X = 0): o lado oeste fica de fora, os outros três ficam
    const anel = [0, 100, 0, 50, 80, 0, 0, -50] // (0,100) → (0,150) → (80,150) → (80,100) → volta a (0,100)
    const costa = caminhoDosAneis([anel], 200, 'costa')
    const fechado = caminhoDosAneis([anel], 200, 'fechado')
    expect(costa).not.toBe(fechado)
    expect(costa.endsWith('z')).toBe(false)
    // o lado (0,100)–(0,150) não está no caminho: nenhum segmento liga dois pontos de x = 0
    const nums = (costa.match(/M[^M]*/g) ?? []).map((l) => l.slice(1).split(' ').map(Number))
    for (const l of nums) for (let i = 0; i + 3 < l.length; i += 2) expect(!(l[i] === 0 && l[i + 2] === 0)).toBe(true)
    // um anel que não encosta em nenhuma borda sai inteiro, dando a volta
    const solto = caminhoDosAneis([[100, 100, 50, 0, 0, 50, -50, 0]], 200, 'costa')
    expect(solto.match(/M/g)).toHaveLength(1)
    expect(solto.split(' ').length).toBeGreaterThanOrEqual(2 * 5 - 1)
  })

  it('o caminho de um polígono de região usa os mesmos números da projeção', () => {
    const d = caminhoDoPoligono([
      [35, 31],
      [36, 31],
      [36, 32],
    ])
    const p = projetar(31, 35)
    expect(d.startsWith(`M${p.x.toFixed(1)} ${p.y.toFixed(1)}`)).toBe(true)
    expect(d.endsWith('z')).toBe(true)
  })
})

describe('as arestas das regiões', () => {
  it('cada aresta comum a duas regiões é traçada uma vez só', () => {
    const { total, unicas, caminho } = caminhoDasArestas(REGIOES.map((r) => r.poligono))
    expect(total).toBe(REGIOES.reduce((n, r) => n + r.poligono.length, 0))
    expect(unicas).toBeLessThan(total)
    expect(unicas).toBeGreaterThan(total / 2) // só as comuns se repetem
    expect(caminho.match(/M/g)).toHaveLength(unicas)
    // um quadrado e um vizinho dividem uma aresta: 4 + 4 − 1 = 7
    const quadrado: [number, number][] = [[30, 30], [31, 30], [31, 31], [30, 31]]
    const vizinho: [number, number][] = [[31, 30], [32, 30], [32, 31], [31, 31]]
    expect(caminhoDasArestas([quadrado, vizinho]).unicas).toBe(7)
  })
})

describe('pontos do mapa: sítios com a mesma coordenada viram um ponto só', () => {
  it('funde pela coordenada (5 casas) e soma os objetos; o ponto guarda a lista de sítios', () => {
    const pontos = agruparPontos([sitio('A', 31.327, 35.635, 1, 'Alfa'), sitio('B', 31.327, 35.635, 2, 'Alfa/Beta'), sitio('C', 32, 35, 4, 'Gama')])
    expect(pontos).toHaveLength(2)
    const fundido = pontos.find((p) => p.sitios.length === 2)!
    expect(fundido.objetos).toBe(3)
    expect(fundido.sitios.map((s) => s.id)).toEqual(['A', 'B'])
    expect(fundido.nome).toBe('Alfa e Alfa/Beta')
    expect(fundido.aria).toBe('Alfa e Alfa/Beta, 2 sítios, 3 objetos')
  })

  it('o nome acessível de um sítio só diz o nome e a contagem, no singular e no plural', () => {
    const [um] = agruparPontos([sitio('A', 31, 35, 1, 'Sítio Um')])
    const [varios] = agruparPontos([sitio('B', 32, 35, 5, 'Sítio Cinco')])
    expect(um!.aria).toBe('Sítio Um, 1 objeto')
    expect(varios!.aria).toBe('Sítio Cinco, 5 objetos')
  })

  it('coordenadas diferentes na sexta casa continuam fundidas; na quinta, não', () => {
    expect(agruparPontos([sitio('A', 31.1234561, 35, 1), sitio('B', 31.1234564, 35, 1)])).toHaveLength(1)
    expect(agruparPontos([sitio('A', 31.12345, 35, 1), sitio('B', 31.12346, 35, 1)])).toHaveLength(2)
  })

  it('a ordem é estável: os pontos saem na ordem do primeiro sítio de cada um', () => {
    const pontos = agruparPontos([sitio('A', 1, 1), sitio('B', 2, 2), sitio('C', 1, 1)])
    expect(pontos.map((p) => p.sitios.map((s) => s.id))).toEqual([['A', 'C'], ['B']])
  })

  it('o tamanho do ponto cresce com os objetos (8, 10, 13, 16, 20)', () => {
    expect([1, 2, 4, 5, 9, 10, 19, 20, 99].map(diametroDoPonto)).toEqual([8, 10, 10, 13, 13, 16, 16, 20, 20])
  })
})

describe('a visão: ajuste, zoom, arrastar', () => {
  const estagio = { w: 800, h: 600 }

  it('«Ver tudo» enquadra a caixa dos pontos com a margem, centrada', () => {
    const caixa = caixaDosPontos(agruparPontos([sitio('A', 26, 31), sitio('B', 37, 54)]))
    const v = ajustarA(caixa, estagio, 40)
    const largura = (caixa.x1 - caixa.x0) * v.k
    const altura = (caixa.y1 - caixa.y0) * v.k
    expect(largura).toBeLessThanOrEqual(estagio.w - 80 + 0.001)
    expect(altura).toBeLessThanOrEqual(estagio.h - 80 + 0.001)
    // centrada
    expect(caixa.x0 * v.k + v.x + largura / 2).toBeCloseTo(estagio.w / 2, 3)
    expect(caixa.y0 * v.k + v.y + altura / 2).toBeCloseTo(estagio.h / 2, 3)
  })

  it('um ponto só (caixa vazia) é enquadrado com um zoom razoável, e sem pontos usa a extensão toda', () => {
    const um = ajustarA(caixaDosPontos(agruparPontos([sitio('A', 31, 35)])), estagio, 40)
    expect(Number.isFinite(um.k)).toBe(true)
    expect(um.k).toBeGreaterThan(1)
    expect(um.k).toBeLessThanOrEqual(limitesDaVisao(estagio).kMax)
    const nenhum = ajustarA(caixaDosPontos([]), estagio, 40)
    expect(nenhum.k).toBeCloseTo(limitesDaVisao(estagio).kMin, 6)
  })

  it('aproximar mantém fixo o ponto sob o cursor', () => {
    const v0 = ajustarA(caixaDosPontos(agruparPontos([sitio('A', 26, 31), sitio('B', 37, 54)])), estagio, 40)
    const cursor = { x: 300, y: 250 }
    const base0 = { x: (cursor.x - v0.x) / v0.k, y: (cursor.y - v0.y) / v0.k }
    const v1 = aproximar(v0, 2, cursor.x, cursor.y, estagio)
    expect(v1.k).toBeCloseTo(v0.k * 2, 6)
    expect((cursor.x - v1.x) / v1.k).toBeCloseTo(base0.x, 4)
    expect((cursor.y - v1.y) / v1.k).toBeCloseTo(base0.y, 4)
  })

  it('o mínimo do zoom «cobre» o palco: o mapa sempre o preenche, sem faixa branca, em qualquer proporção', () => {
    for (const e of [{ w: 800, h: 600 }, { w: 375, h: 572 }, { w: 1000, h: 300 }, { w: 300, h: 900 }]) {
      const { kMin } = limitesDaVisao(e)
      expect(LARGURA_DA_EXTENSAO * kMin, `largura ${e.w}x${e.h}`).toBeGreaterThanOrEqual(e.w - 0.001)
      expect(ALTURA_DA_EXTENSAO * kMin, `altura ${e.w}x${e.h}`).toBeGreaterThanOrEqual(e.h - 0.001)
      // e é o MENOR zoom que cobre: uma das dimensões encosta
      const encosta = Math.abs(LARGURA_DA_EXTENSAO * kMin - e.w) < 0.001 || Math.abs(ALTURA_DA_EXTENSAO * kMin - e.h) < 0.001
      expect(encosta).toBe(true)
      const v = segurar({ k: 0.0001, x: 0, y: 0 }, e)
      expect(v.x).toBeLessThanOrEqual(0.001)
      expect(v.y).toBeLessThanOrEqual(0.001)
      expect(LARGURA_DA_EXTENSAO * v.k + v.x).toBeGreaterThanOrEqual(e.w - 0.001)
      expect(ALTURA_DA_EXTENSAO * v.k + v.y).toBeGreaterThanOrEqual(e.h - 0.001)
    }
  })

  it('o zoom fica entre o mínimo (cobrir o palco) e o máximo', () => {
    const { kMin, kMax } = limitesDaVisao(estagio)
    let v = ajustarA(caixaDosPontos(agruparPontos([sitio('A', 31, 35)])), estagio, 40)
    for (let i = 0; i < 20; i++) v = aproximar(v, 2, 400, 300, estagio)
    expect(v.k).toBe(kMax)
    for (let i = 0; i < 20; i++) v = aproximar(v, 0.5, 400, 300, estagio)
    expect(v.k).toBeCloseTo(kMin, 9)
  })

  it('arrastar nunca leva a extensão para fora do palco (o mapa nunca fica vazio)', () => {
    let v = ajustarA(caixaDosPontos(agruparPontos([sitio('A', 31, 35)])), estagio, 40)
    v = mover(v, 1e6, 1e6, estagio)
    const topo = projetar(EXTENSAO.lat1, EXTENSAO.lon0)
    expect(topo.x * v.k + v.x).toBeLessThanOrEqual(0.0001)
    expect(topo.y * v.k + v.y).toBeLessThanOrEqual(0.0001)
    v = mover(v, -1e7, -1e7, estagio)
    const fim = projetar(EXTENSAO.lat0, EXTENSAO.lon1)
    expect(fim.x * v.k + v.x).toBeGreaterThanOrEqual(estagio.w - 0.0001)
    expect(fim.y * v.k + v.y).toBeGreaterThanOrEqual(estagio.h - 0.0001)
  })

  it('centrarEm põe a base no centro do palco com o zoom pedido', () => {
    const alvo = projetar(31.9, 35.2)
    const v = centrarEm(alvo.x, alvo.y, 2.5, estagio)
    expect(alvo.x * v.k + v.x).toBeCloseTo(estagio.w / 2, 4)
    expect(alvo.y * v.k + v.y).toBeCloseTo(estagio.h / 2, 4)
    expect(v.k).toBe(2.5)
  })
})

describe('a barra de escala', () => {
  it('escolhe um valor redondo e uma largura entre 60 e 130 px', () => {
    for (const k of [0.4, 1, 2.05, 5]) {
      const { km, largura } = escalaDaBarra(k, 31)
      expect([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]).toContain(km)
      expect(largura).toBeGreaterThanOrEqual(30)
      expect(largura).toBeLessThanOrEqual(135)
    }
  })

  it('no zoom do design (2,05) a barra de 50 km tem cerca de 92 px', () => {
    const { km, largura } = escalaDaBarra(2.05, 32)
    expect(km).toBe(50)
    expect(largura).toBeGreaterThan(85)
    expect(largura).toBeLessThan(100)
  })
})

describe('rótulos dos pontos', () => {
  const caixa = (nome: string, x: number, y: number, d = 10) => ({ chave: nome, nome, x, y, d, objetos: 1 })

  it('o destacado entra primeiro, em negrito; nenhum rótulo cobre outro, e os longe entram', () => {
    const r = rotulosVisiveis([caixa('Sítio Cinco', 100, 100), caixa('Épsilon', 104, 100), caixa('Épsilon Norte', 112, 104), caixa('Longe', 400, 300)], { destaque: new Set(['Épsilon']), largura: 800, altura: 600, max: 10 })
    const nomes = r.map((x) => x.nome)
    expect(nomes).toContain('Épsilon')
    expect(nomes).toContain('Longe')
    expect(r.find((x) => x.nome === 'Épsilon')!.forte).toBe(true)
    expect(r.find((x) => x.nome === 'Longe')!.forte).toBe(false)
    for (const a of r) {
      for (const b of r) {
        if (a === b) continue
        const separados = a.esq + a.larg <= b.esq || b.esq + b.larg <= a.esq || a.topo + a.alt <= b.topo || b.topo + b.alt <= a.topo
        expect(separados, `${a.nome} cobre ${b.nome}`).toBe(true)
      }
    }
  })

  it('não passa do máximo e põe o rótulo à esquerda quando falta lugar à direita', () => {
    const muitos = Array.from({ length: 30 }, (_, i) => caixa(`Sítio ${i}`, 20 + (i % 6) * 120, 30 + Math.floor(i / 6) * 100))
    expect(rotulosVisiveis(muitos, { destaque: new Set(), largura: 800, altura: 600, max: 5 })).toHaveLength(5)
    const [borda] = rotulosVisiveis([caixa('Nome bem comprido na borda', 780, 100)], { destaque: new Set(), largura: 800, altura: 600, max: 5 })
    expect(borda!.alinhar).toBe('fim')
  })

  it('pontos fora do palco não têm rótulo', () => {
    expect(rotulosVisiveis([caixa('Fora', -50, 100)], { destaque: new Set(), largura: 800, altura: 600, max: 5 })).toEqual([])
  })
})

describe('qual ponto está sob o dedo ou o mouse', () => {
  const c = (chave: string, x: number, y: number, d = 8) => ({ chave, nome: chave, x, y, d, objetos: 1 })
  // cinco pontos a poucos pixels uns dos outros: as áreas de toque de 44 px se sobrepõem todas
  const grupo = [c('a', 100, 100), c('b', 106, 100), c('c', 100, 108), c('d', 112, 106), c('e', 94, 96)]

  it('o ponto mais perto dentro do raio vence, e não o último do DOM', () => {
    for (const p of grupo) expect(pontoNaPosicao(grupo, p.x, p.y, 22), `sobre ${p.chave}`).toBe(p.chave)
    // um toque ao lado do b (entre o a e o b, mais perto do b) e outro a 20 px de tudo
    expect(pontoNaPosicao(grupo, 104, 100.5, 22)).toBe('b')
    expect(pontoNaPosicao(grupo, 103, 101, 22)).toBe('a')
    expect(pontoNaPosicao(grupo, 100 - 20, 100, 22)).toBe('e')
  })

  it('fora do raio não há ponto (o toque é no fundo); o raio de cada ponto é no mínimo o dado ou metade do diâmetro', () => {
    expect(pontoNaPosicao(grupo, 300, 300, 22)).toBeNull()
    expect(pontoNaPosicao([c('grande', 200, 200, 80)], 200 + 38, 200, 10)).toBe('grande')
    expect(pontoNaPosicao([c('p', 200, 200)], 200 + 23, 200, 22)).toBeNull()
    expect(pontoNaPosicao([], 1, 1, 22)).toBeNull()
  })

  it('o empate (mesma posição na tela) é desfeito pela ordem da lista, sempre igual', () => {
    expect(pontoNaPosicao([c('x', 10, 10), c('y', 10, 10)], 10, 10, 22)).toBe('x')
    expect(pontoNaPosicao([c('y', 10, 10), c('x', 10, 10)], 10, 10, 22)).toBe('y')
  })
})

describe('navegar entre os pontos pelo teclado', () => {
  const c = (chave: string, x: number, y: number) => ({ chave, nome: chave, x, y, d: 8, objetos: 1 })
  const pontos = [c('oeste', 0, 50), c('centro', 50, 50), c('leste', 100, 52), c('norte', 52, 0), c('sul', 48, 100)]

  it('as setas vão ao vizinho mais próximo na direção, e ficam onde estão se não há ninguém lá', () => {
    expect(vizinhoNaDirecao(pontos, 'centro', 1, 0)).toBe('leste')
    expect(vizinhoNaDirecao(pontos, 'centro', -1, 0)).toBe('oeste')
    expect(vizinhoNaDirecao(pontos, 'centro', 0, -1)).toBe('norte')
    expect(vizinhoNaDirecao(pontos, 'centro', 0, 1)).toBe('sul')
    expect(vizinhoNaDirecao(pontos, 'oeste', -1, 0)).toBeNull()
  })

  it('a ordem de leitura percorre TODOS os pontos, também os que ficam na mesma posição da tela', () => {
    const empilhados = [c('p1', 10, 10), c('p2', 10, 10), c('p3', 10, 10), c('p4', 11, 10), c('p5', 10, 12)]
    const ordem = ordemDeLeitura(empilhados)
    expect([...ordem].sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    expect(ordemDeLeitura([...empilhados].reverse())).toEqual(ordem)
  })
})

describe('rótulos: largura medida e zonas proibidas', () => {
  const caixa = (nome: string, x: number, y: number, d = 10) => ({ chave: nome, nome, x, y, d, objetos: 1 })

  it('usa a largura medida do texto, e não a estimativa por letra', () => {
    const [r] = rotulosVisiveis([caixa('Nome', 100, 100)], { destaque: new Set(), largura: 800, altura: 600, max: 5, larguraDe: () => 200 })
    expect(r!.larg).toBe(200)
  })

  it('um rótulo não entra sobre uma zona proibida (os controles, o minimapa, a escala)', () => {
    const livre = rotulosVisiveis([caixa('Sítio', 100, 100)], { destaque: new Set(), largura: 800, altura: 600, max: 5 })
    expect(livre).toHaveLength(1)
    const zona = { esq: 20, topo: 90, larg: 300, alt: 40 }
    const coberto = rotulosVisiveis([caixa('Sítio', 100, 100)], { destaque: new Set(), largura: 800, altura: 600, max: 5, proibidas: [zona] })
    expect(coberto).toEqual([])
  })
})

describe('a folga do toque (I4): quanto o ponteiro pode andar e ainda ser um toque', () => {
  it('o mouse é preciso (cerca de 4 px); o dedo e a caneta tremem mais (cerca de 10 px)', () => {
    expect(raioDoToque('mouse')).toBe(4)
    expect(raioDoToque('touch')).toBe(10)
    expect(raioDoToque('pen')).toBe(10)
    expect(raioDoToque('')).toBe(10) // tipo desconhecido: a folga maior, a do dedo
    expect(raioDoToque('touch')).toBeGreaterThan(raioDoToque('mouse'))
  })
})

describe('os nomes das regiões não se cobrem nem cobrem os pontos (m12)', () => {
  const cobre = (a: { esq: number; topo: number; larg: number; alt: number }, b: { esq: number; topo: number; larg: number; alt: number }) =>
    a.esq < b.esq + b.larg && b.esq < a.esq + a.larg && a.topo < b.topo + b.alt && b.topo < a.topo + a.alt
  // as regiões reais do Levante Sul e da Transjordânia, num zoom em que os dois nomes se tocariam
  const dx = projetar(30.57, 36.63).x - projetar(30.57, 34.12).x
  const k = 40 / dx // os dois nomes nascem a 40 px um do outro (o do Levante Sul termina onde o outro nasce, o outro tem 136 px)
  const centro = projetar(30.57, 35.4)
  const visao = { k, x: 187 - centro.x * k, y: 280 - centro.y * k }
  const regioes = REGIOES.map((r) => {
    const b = projetar(r.rotulo.lat, r.rotulo.lon)
    const nome = r.nome.toUpperCase()
    return { id: r.id, nome: r.nome, x: b.x * visao.k + visao.x, y: b.y * visao.k + visao.y, larg: nome.length * 10.5, alinhar: r.rotulo.alinhar }
  })
  const pontosNaTela = [30.2, 30.57, 30.9].flatMap((lat) =>
    [34.6, 35.0, 35.4, 35.8, 36.2].map((lon) => {
      const b = projetar(lat, lon)
      return { x: b.x * visao.k + visao.x, y: b.y * visao.k + visao.y, d: 12 }
    }),
  )

  it('sem ajuste, os nomes de Levante Sul e Transjordânia se cobririam (o caso que a correção resolve)', () => {
    const sul = regioes.find((r) => r.id === 'levante-sul')!
    const trans = regioes.find((r) => r.id === 'transjordania')!
    const caixa = (r: typeof sul) => ({ esq: r.alinhar === 'fim' ? r.x - r.larg : r.x - r.larg / 2, topo: r.y - 9, larg: r.larg, alt: 18 })
    expect(cobre(caixa(sul), caixa(trans))).toBe(true)
  })

  it('depois do ajuste nenhum nome cobre outro nome nem um ponto, e todos ficam inteiros no palco', () => {
    const postos = rotulosDeRegiao(regioes, { largura: 375, altura: 560, pontos: pontosNaTela, proibidas: [] })
    expect(postos.length).toBeGreaterThan(0)
    for (const [i, a] of postos.entries()) {
      expect(a.esq, a.nome).toBeGreaterThanOrEqual(0)
      expect(a.esq + a.larg, a.nome).toBeLessThanOrEqual(375)
      expect(a.topo, a.nome).toBeGreaterThanOrEqual(0)
      expect(a.topo + a.alt, a.nome).toBeLessThanOrEqual(560)
      for (const b of postos.slice(i + 1)) expect(cobre(a, b), `${a.nome} cobre ${b.nome}`).toBe(false)
      for (const q of pontosNaTela) expect(cobre(a, { esq: q.x - q.d / 2, topo: q.y - q.d / 2, larg: q.d, alt: q.d }), `${a.nome} cobre um ponto`).toBe(false)
    }
  })

  it('um nome que não cabe em lugar nenhum não é escrito, e uma área proibida é respeitada', () => {
    const um = [{ id: 'x', nome: 'Região', x: 100, y: 100, larg: 80, alinhar: 'meio' as const }]
    expect(rotulosDeRegiao(um, { largura: 375, altura: 560, pontos: [], proibidas: [] })).toHaveLength(1)
    // controle positivo acima; agora pontos por todo o palco (nenhum lugar livre) e o nome some
    const tapado: { x: number; y: number; d: number }[] = []
    for (let x = 0; x <= 375; x += 12) for (let y = 0; y <= 560; y += 12) tapado.push({ x, y, d: 14 })
    expect(rotulosDeRegiao(um, { largura: 375, altura: 560, pontos: tapado, proibidas: [] })).toEqual([])
    const [posto] = rotulosDeRegiao(um, { largura: 375, altura: 560, pontos: [], proibidas: [{ esq: 40, topo: 0, larg: 120, alt: 560 }] })
    expect(posto).toBeUndefined()
  })

  it('as regiões ativas escolhem primeiro; fora do palco não há nome', () => {
    const duas = [
      { id: 'a', nome: 'Alfa', x: 100, y: 100, larg: 60, alinhar: 'meio' as const },
      { id: 'b', nome: 'Beta', x: 110, y: 100, larg: 60, alinhar: 'meio' as const, prioridade: true },
    ]
    const postos = rotulosDeRegiao(duas, { largura: 375, altura: 560, pontos: [], proibidas: [] })
    expect(postos.find((p) => p.id === 'b')!.y).toBe(100) // a ativa fica onde nasceu; a outra desvia
    expect(postos.find((p) => p.id === 'a')!.y).not.toBe(100)
    expect(rotulosDeRegiao([{ id: 'f', nome: 'Fora', x: -5, y: 100, larg: 40, alinhar: 'meio' }], { largura: 375, altura: 560, pontos: [], proibidas: [] })).toEqual([])
  })

  describe('m17: o nome aparece mesmo quando o lugar do desenho e os vizinhos estão tomados', () => {
    const cercar = (x: number, y: number) => {
      // pontos num anel em volta do lugar do desenho: acima e abaixo (±60) e dos lados (±96) ficam tomados
      const lista: { x: number; y: number; d: number }[] = []
      for (let dx = -130; dx <= 130; dx += 16) for (const dy of [-60, -40, -20, 0, 20, 40, 60]) lista.push({ x: x + dx, y: y + dy, d: 12 })
      return lista
    }
    const quadrado = [
      { x: 20, y: 20 },
      { x: 360, y: 20 },
      { x: 360, y: 540 },
      { x: 20, y: 540 },
    ]
    const o = (pontos: { x: number; y: number; d: number }[]) => ({ largura: 375, altura: 560, pontos, proibidas: [] as { esq: number; topo: number; larg: number; alt: number }[] })

    it('com o lugar do desenho e os desvios tomados, o nome vai para um lugar livre dentro do polígono da região', () => {
      const pontos = cercar(190, 280)
      const sem = rotulosDeRegiao([{ id: 'r', nome: 'Mesopotâmia', x: 190, y: 280, larg: 100, alinhar: 'meio', temSitios: true }], o(pontos))
      // sem o polígono só os desvios do desenho existem: o nome fica sobre algum ponto (região com sítios) ou nem sai
      const [posto] = rotulosDeRegiao([{ id: 'r', nome: 'Mesopotâmia', x: 190, y: 280, larg: 100, alinhar: 'meio', temSitios: true, poligono: quadrado }], o(pontos))
      expect(posto, 'o nome saiu').toBeDefined()
      const caixa = { esq: posto!.esq, topo: posto!.topo, larg: posto!.larg, alt: posto!.alt }
      for (const q of pontos) expect(cobre(caixa, { esq: q.x - q.d / 2, topo: q.y - q.d / 2, larg: q.d, alt: q.d }), 'cobre um ponto').toBe(false)
      expect(sem.length === 0 || sem[0]!.y !== posto!.y || sem[0]!.x !== posto!.x).toBe(true)
    })

    it('sem lugar livre, uma região com sítios leva o nome onde cobre menos pontos; uma sem sítios não é escrita', () => {
      const tudo: { x: number; y: number; d: number }[] = []
      for (let x = 0; x <= 375; x += 12) for (let y = 0; y <= 560; y += 12) tudo.push({ x, y, d: 14 })
      const base = { id: 'r', nome: 'Transjordânia', x: 190, y: 280, larg: 110, alinhar: 'meio' as const, poligono: quadrado }
      expect(rotulosDeRegiao([{ ...base, temSitios: true }], o(tudo))).toHaveLength(1)
      expect(rotulosDeRegiao([{ ...base, temSitios: false }], o(tudo))).toEqual([])
    })

    it('uma área proibida continua valendo para a região com sítios (os controles nunca são cobertos)', () => {
      const tudo = [{ esq: 0, topo: 0, larg: 375, alt: 560 }]
      expect(rotulosDeRegiao([{ id: 'r', nome: 'Irã', x: 190, y: 280, larg: 60, alinhar: 'meio', temSitios: true, poligono: quadrado }], { largura: 375, altura: 560, pontos: [], proibidas: tudo })).toEqual([])
    })

    it('uma região cujo desenho caiu fora do palco ganha o nome na parte dela que aparece', () => {
      const parte = [
        { x: 100, y: -300 },
        { x: 300, y: -300 },
        { x: 300, y: 120 },
        { x: 100, y: 120 },
      ]
      const [posto] = rotulosDeRegiao([{ id: 'a', nome: 'Anatólia', x: 200, y: -200, larg: 80, alinhar: 'meio', poligono: parte }], o([]))
      expect(posto).toBeDefined()
      expect(posto!.y).toBeLessThan(120)
    })
  })
})
