import {
  alternarZoom,
  ajustar,
  caixaGirada,
  emPorcento,
  fatorDaRoda,
  limitarVista,
  mover,
  passo,
  pinca,
  zoomEm,
  ESCALA_MAX,
  ESCALA_MIN,
  VISTA_INICIAL,
  type Vista,
} from './zoom'

const palco = { w: 800, h: 600 }
// A figura ajustada ao palco: 400×600 (o palco é mais largo que a figura).
const caixa = { w: 400, h: 600 }

describe('caixaGirada / ajustar', () => {
  it('sem giro, a caixa é a própria figura; a 90° troca largura e altura', () => {
    expect(caixaGirada({ w: 300, h: 200 }, 0)).toEqual({ w: 300, h: 200 })
    const g = caixaGirada({ w: 300, h: 200 }, 90)
    expect(g.w).toBeCloseTo(200)
    expect(g.h).toBeCloseTo(300)
    const m = caixaGirada({ w: 300, h: 200 }, 10) // giro pequeno: a caixa cresce um pouco
    expect(m.w).toBeGreaterThan(300)
    expect(m.h).toBeGreaterThan(200)
  })

  it('ajusta a figura ao palco (cabe inteira, mantém a proporção), girada ou não', () => {
    expect(ajustar(palco, { w: 900, h: 1200 }, 0)).toEqual({ w: 450, h: 600 })
    const larga = ajustar(palco, { w: 1200, h: 900 }, 0)
    expect(larga.w).toBeCloseTo(800)
    expect(larga.h).toBeCloseTo(600)
    // girada 90°: a figura de 900×1200 ocupa 1200×900 na tela, e cabe em 800×600
    const g = ajustar(palco, { w: 900, h: 1200 }, 90)
    expect(g.w).toBeCloseTo(600)
    expect(g.h).toBeCloseTo(800)
  })

  it('palco sem tamanho (ainda não medido): figura de tamanho zero, sem NaN', () => {
    expect(ajustar({ w: 0, h: 0 }, { w: 900, h: 1200 }, 0)).toEqual({ w: 0, h: 0 })
    expect(ajustar(palco, { w: 0, h: 0 }, 0)).toEqual({ w: 0, h: 0 })
  })
})

describe('limitarVista', () => {
  it('a escala fica entre 1× e 8×', () => {
    expect(limitarVista({ escala: 0.2, x: 0, y: 0 }, palco, caixa).escala).toBe(ESCALA_MIN)
    expect(limitarVista({ escala: 50, x: 0, y: 0 }, palco, caixa).escala).toBe(ESCALA_MAX)
    expect(ESCALA_MIN).toBe(1)
    expect(ESCALA_MAX).toBe(8)
  })

  it('a 1× não há o que arrastar', () => {
    expect(limitarVista({ escala: 1, x: 120, y: -80 }, palco, caixa)).toEqual(VISTA_INICIAL)
  })

  it('ampliada, a figura não sai do palco: a borda dela para na borda do palco', () => {
    // 2×: figura de 800×1200 num palco de 800×600 → só dá para andar na vertical (±300)
    const v = limitarVista({ escala: 2, x: 500, y: 9999 }, palco, caixa)
    expect(v.x).toBe(0)
    expect(v.y).toBe(300)
    const w = limitarVista({ escala: 4, x: -9999, y: -9999 }, palco, caixa)
    expect(w.x).toBe(-400) // (1600 − 800) / 2
    expect(w.y).toBe(-900) // (2400 − 600) / 2
  })

  it('nunca produz -0 nem NaN', () => {
    const v = limitarVista({ escala: 1, x: -0, y: 0 }, palco, caixa)
    expect(Object.is(v.x, 0)).toBe(true)
    expect(limitarVista({ escala: NaN, x: NaN, y: NaN }, palco, caixa)).toEqual(VISTA_INICIAL)
  })
})

describe('zoomEm', () => {
  it('o ponto sob o cursor continua sob o cursor', () => {
    // ponto a (200, 100) do centro do palco, de 1× para 2×, numa figura que enche o palco
    const v = zoomEm(VISTA_INICIAL, 2, { x: 200, y: 100 }, palco, { w: 800, h: 600 })
    expect(v.escala).toBe(2)
    // antes: o ponto de conteúdo c = (200,100); depois: x = 200 − 200·2 = −200, y = 100 − 100·2 = −100
    expect(v.x).toBe(-200)
    expect(v.y).toBe(-100)
  })

  it('perto da borda, o limite ganha do cursor (a figura não sai)', () => {
    const v = zoomEm(VISTA_INICIAL, 2, { x: 400, y: 300 }, palco, caixa)
    expect(v.x).toBe(0) // a 2× a figura tem a largura do palco
    expect(v.y).toBe(-300)
  })

  it('volta a 1× e recentra', () => {
    const ampliada: Vista = { escala: 4, x: -300, y: 200 }
    expect(zoomEm(ampliada, 1, { x: 0, y: 0 }, palco, caixa)).toEqual(VISTA_INICIAL)
  })

  it('respeita 8×', () => {
    expect(zoomEm(VISTA_INICIAL, 20, { x: 0, y: 0 }, palco, caixa).escala).toBe(8)
  })
})

describe('mover', () => {
  it('arrasta e limita', () => {
    const v: Vista = { escala: 2, x: 0, y: 0 }
    expect(mover(v, 50, 100, palco, caixa)).toEqual({ escala: 2, x: 0, y: 100 })
    expect(mover(v, 0, 1000, palco, caixa).y).toBe(300)
  })
})

describe('pinca', () => {
  it('afastar os dedos amplia na razão das distâncias, em torno do ponto médio', () => {
    // dedos a (−50,0) e (50,0) → (−100,0) e (100,0): distância 100 → 200, ponto médio (0,0)
    const v = pinca(VISTA_INICIAL, [{ x: -50, y: 0 }, { x: 50, y: 0 }], [{ x: -100, y: 0 }, { x: 100, y: 0 }], palco, caixa)
    expect(v.escala).toBeCloseTo(2)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(0)
  })

  it('aproximar os dedos reduz, mas não passa de 1×', () => {
    const v = pinca({ escala: 2, x: 0, y: 0 }, [{ x: -100, y: 0 }, { x: 100, y: 0 }], [{ x: -10, y: 0 }, { x: 10, y: 0 }], palco, caixa)
    expect(v).toEqual(VISTA_INICIAL)
  })

  it('arrastar os dois dedos juntos também anda', () => {
    const v = pinca({ escala: 2, x: 0, y: 0 }, [{ x: -50, y: 0 }, { x: 50, y: 0 }], [{ x: -50, y: 40 }, { x: 50, y: 40 }], palco, caixa)
    expect(v.escala).toBeCloseTo(2)
    expect(v.y).toBeCloseTo(40)
  })

  it('dedos no mesmo ponto (distância zero antes): não muda a escala', () => {
    const v = pinca(VISTA_INICIAL, [{ x: 0, y: 0 }, { x: 0, y: 0 }], [{ x: -10, y: 0 }, { x: 10, y: 0 }], palco, caixa)
    expect(v.escala).toBe(1)
  })
})

describe('alternarZoom (toque duplo / clique duplo)', () => {
  it('de 1× vai a 2× no ponto; de qualquer ampliação volta a 1×', () => {
    const a = alternarZoom(VISTA_INICIAL, { x: 200, y: 100 }, palco, caixa)
    expect(a.escala).toBe(2)
    expect(alternarZoom(a, { x: 0, y: 0 }, palco, caixa)).toEqual(VISTA_INICIAL)
    expect(alternarZoom({ escala: 5, x: 10, y: 10 }, { x: 0, y: 0 }, palco, caixa)).toEqual(VISTA_INICIAL)
  })
})

describe('passo (teclas + e −)', () => {
  it('amplia e reduz em passos, dentro de 1×–8×', () => {
    const mais = passo(VISTA_INICIAL, 1, palco, caixa)
    expect(mais.escala).toBeGreaterThan(1)
    expect(passo(mais, -1, palco, caixa)).toEqual(VISTA_INICIAL)
    let v: Vista = VISTA_INICIAL
    for (let i = 0; i < 30; i++) v = passo(v, 1, palco, caixa)
    expect(v.escala).toBe(8)
    for (let i = 0; i < 30; i++) v = passo(v, -1, palco, caixa)
    expect(v).toEqual(VISTA_INICIAL)
  })
})

describe('fatorDaRoda / emPorcento', () => {
  it('rolar para cima amplia, para baixo reduz; ctrl (pinça do trackpad) pesa mais; linhas valem mais que pixels', () => {
    expect(fatorDaRoda(-100, 0, false)).toBeGreaterThan(1)
    expect(fatorDaRoda(100, 0, false)).toBeLessThan(1)
    expect(fatorDaRoda(-10, 0, true)).toBeGreaterThan(fatorDaRoda(-10, 0, false))
    expect(fatorDaRoda(-3, 1, false)).toBeGreaterThan(fatorDaRoda(-3, 0, false))
    expect(fatorDaRoda(0, 0, false)).toBe(1)
  })

  it('porcentagem inteira', () => {
    expect(emPorcento(1)).toBe(100)
    expect(emPorcento(1.5)).toBe(150)
    expect(emPorcento(2.333)).toBe(233)
  })
})
