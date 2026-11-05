/**
 * A porta de `iconodb/images/display.py` (`classify_display`): as MESMAS imagens sintéticas do teste do pipeline
 * (tests/test_display.py), geradas aqui do mesmo jeito, dão o mesmo modo. As métricas de referência foram tiradas do
 * próprio Python (Pillow 12, numpy 2) sobre essas imagens e estão escritas aqui: o teste confere as duas.
 */
import {
  CINZA_MAX,
  arredondarComoPython,
  EXTREMOS_MIN,
  classificarModo,
  cinzaDeRgba,
  margem,
  metricas,
  miniaturaPil,
  tamanhoDaMiniaturaPil,
  type ImagemCinza,
} from './modo'

const cinza = (largura: number, altura: number, valor: number): ImagemCinza => ({ largura, altura, px: new Uint8Array(largura * altura).fill(valor) })

/** `_lines()` do Python: papel branco com linhas finas pretas (a cada 40 px nas duas direções). */
function linhas(w = 600, h = 400, passo = 40): ImagemCinza {
  const img = cinza(w, h, 255)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (y % passo === 0 || x % passo === 0) img.px[y * w + x] = 0
  return img
}

/** `np.tile(np.linspace(40, 220, 600).astype(np.uint8), (400, 1))`: o degradê de uma impressão tonal. */
function degrade(): ImagemCinza {
  const n = 600
  const passo = (220 - 40) / (n - 1)
  const linha = Array.from({ length: n }, (_, i) => Math.trunc(i === n - 1 ? 220 : i * passo + 40))
  const img = cinza(600, 400, 0)
  for (let y = 0; y < 400; y++) for (let x = 0; x < 600; x++) img.px[y * 600 + x] = linha[x]!
  return img
}

/** Papel branco com uma área de cinza chapado (128) em [100:250, 150:400]: 15% da imagem. */
function cinzaChapado(): ImagemCinza {
  const img = cinza(600, 400, 255)
  for (let y = 100; y < 250; y++) for (let x = 150; x < 400; x++) img.px[y * 600 + x] = 128
  return img
}

/** `np.full((1600, 1200), 255)` com `block[::3, :] = 0` em [400:1000, 300:900]: hachura fina demais para a tela. */
function hachuraFina(): ImagemCinza {
  const img = cinza(1200, 1600, 255)
  for (let y = 400; y < 1000; y += 3) for (let x = 300; x < 900; x++) img.px[y * 1200 + x] = 0
  return img
}

/** As métricas que `classify_display` dá para cada imagem (rodado no Python, 01/11/2026). */
const PYTHON = {
  linhas: { modo: 'traco', extremes: 0.9014, grey_core: 0.0 },
  degrade: { modo: 'tons', extremes: 0.22, grey_core: 0.7585 },
  cinzaChapado: { modo: 'tons', extremes: 0.8436, grey_core: 0.1465 },
  hachuraFina: { modo: 'tons', extremes: 0.8125, grey_core: 0.1776 },
} as const

describe('classificarModo: as imagens sintéticas do pipeline', () => {
  it('desenho de traço (linhas finas pretas em papel branco) é traco', () => {
    const r = classificarModo(linhas())
    expect(r.modo).toBe('traco')
    expect(Object.keys(r.metricas).sort()).toEqual(['extremes', 'grey_core'])
    expect(r.metricas.extremes).toBeGreaterThan(0.9)
    expect(r.metricas.grey_core).toBe(0)
  })

  it('impressão tonal (degradê) é tons, com poucos extremos', () => {
    const r = classificarModo(degrade())
    expect(r.modo).toBe('tons')
    expect(r.metricas.extremes).toBeLessThan(EXTREMOS_MIN)
  })

  it('área de cinza chapado é tons, mesmo com muito papel branco', () => {
    const r = classificarModo(cinzaChapado())
    expect(r.metricas.extremes).toBeGreaterThan(EXTREMOS_MIN)
    expect(r.metricas.grey_core).toBeGreaterThan(CINZA_MAX)
    expect(r.modo).toBe('tons')
  })

  it('hachura fina demais para a tela vira cinza na redução e conta como cinza chapado', () => {
    const r = classificarModo(hachuraFina())
    expect(r.modo).toBe('tons')
    expect(r.metricas.grey_core).toBeGreaterThan(CINZA_MAX)
  })

  it.each(Object.entries(PYTHON))('%s: o mesmo modo e as mesmas métricas do Python', (nome, esperado) => {
    const imagem = { linhas, degrade, cinzaChapado, hachuraFina }[nome as keyof typeof PYTHON]()
    const r = classificarModo(imagem)
    expect(r.modo).toBe(esperado.modo)
    // Idênticas: a mesma luminância, a mesma redução (reduce + LANCZOS em ponto fixo) e o mesmo arredondamento.
    expect(r.metricas).toEqual({ extremes: esperado.extremes, grey_core: esperado.grey_core })
  })

  it('aceita RGBA (como o canvas devolve): a luminância é a do Pillow (L = 299/587/114)', () => {
    const l = linhas()
    const rgba = new Uint8ClampedArray(l.px.length * 4)
    l.px.forEach((v, i) => rgba.set([v, v, v, 255], i * 4))
    expect(classificarModo(cinzaDeRgba(rgba, l.largura, l.altura)).modo).toBe('traco')
    // Vermelho, verde e azul puros, como o Pillow converte.
    const tres = cinzaDeRgba(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]), 3, 1)
    expect([...tres.px]).toEqual([76, 150, 29])
  })

  it('as métricas saem arredondadas a 4 casas', () => {
    const { metricas: m } = classificarModo(cinzaChapado())
    for (const v of Object.values(m)) expect(Number(v.toFixed(4))).toBe(v)
  })

  it('não altera a imagem recebida', () => {
    const img = hachuraFina()
    const antes = img.px.slice()
    classificarModo(img)
    expect(img.px.every((v, i) => v === antes[i])).toBe(true)
  })
})

describe('margem: o sinal decide; a distância é a menor das duas, relativa ao limiar', () => {
  it('como display_margin', () => {
    expect(margem({ extremes: 0.95, grey_core: 0 })).toBeGreaterThan(0)
    expect(margem({ extremes: EXTREMOS_MIN - 0.01, grey_core: 0 })).toBeLessThan(0)
    expect(margem({ extremes: 0.95, grey_core: CINZA_MAX * 2 })).toBeLessThan(0)
    expect(margem({ extremes: EXTREMOS_MIN * 1.05, grey_core: 0 })).toBeCloseTo(0.05, 9)
    // No limiar exato é tons (não inverter é o erro mais seguro).
    expect(margem({ extremes: EXTREMOS_MIN, grey_core: 0 })).toBe(0)
    expect(classificarModo(cinza(10, 10, 255)).modo).toBe('traco')
  })
})

describe('a redução do Pillow (thumbnail 400, LANCZOS)', () => {
  it('o tamanho preserva a proporção como o Pillow arredonda', () => {
    expect(tamanhoDaMiniaturaPil(600, 400)).toEqual([400, 267])
    expect(tamanhoDaMiniaturaPil(1200, 1600)).toEqual([300, 400])
    expect(tamanhoDaMiniaturaPil(400, 300)).toBeNull() // já cabe: não mexe
    expect(tamanhoDaMiniaturaPil(5000, 3)).toEqual([400, 1])
  })

  it('imagem que já cabe volta igual; a maior encolhe para o lado máximo', () => {
    const pequena = cinza(40, 30, 7)
    expect(miniaturaPil(pequena)).toBe(pequena)
    const grande = miniaturaPil(hachuraFina())
    expect([grande.largura, grande.altura]).toEqual([300, 400])
    expect(grande.px.length).toBe(300 * 400)
  })

  it('cinza uniforme continua uniforme (os pesos somam 1)', () => {
    const r = miniaturaPil(cinza(1000, 700, 123))
    expect(new Set(r.px)).toEqual(new Set([123]))
  })

  it('metricas mede a imagem como está (sem reduzir)', () => {
    // A borda conta como fora (np.pad com False): duas erosões deixam só o pixel do centro de uma imagem 5×5 cinza.
    expect(metricas(cinza(5, 5, 128))).toEqual({ extremes: 0, grey_core: 0.04 })
    expect(metricas(cinza(5, 5, 255))).toEqual({ extremes: 1, grey_core: 0 })
  })
})

/** Um degradê em diagonal `(3x + 5y) mod 256` (o mesmo no Python, com `np.mgrid`). */
function diagonal(w: number, h: number): ImagemCinza {
  const img = cinza(w, h, 0)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.px[y * w + x] = (x * 3 + y * 5) % 256
  return img
}

describe('a redução do Pillow com fator 3 (o multiplicador do Reduce.c em float de 32 bits) — revisão 1, M1', () => {
  /** Tirados do Pillow 12 (thumbnail 400, LANCZOS) e de classify_display, rodados no repositório privado. */
  const PILLOW = [
    { w: 3000, h: 2000, soma: 13615695, amostras: [26, 49, 84, 30, 126], extremes: 0.3596 },
    { w: 2700, h: 1800, soma: 13615687, amostras: [23, 189, 25, 173, 127], extremes: 0.3519 },
  ]
  it.each(PILLOW)('$w×$h: os mesmos pixels da miniatura e as mesmas métricas', ({ w, h, soma, amostras, extremes }) => {
    const img = diagonal(w, h)
    const t = miniaturaPil(img)
    expect([t.largura, t.altura]).toEqual([400, 267])
    expect(t.px.reduce((s, v) => s + v, 0)).toBe(soma)
    expect([[0, 0], [10, 17], [100, 200], [266, 399], [133, 5]].map(([r, c]) => t.px[r! * 400 + c!])).toEqual(amostras)
    expect(classificarModo(img)).toEqual({ modo: 'tons', metricas: { extremes, grey_core: 0 } })
  })
})

describe('o arredondamento do Python (round, metade para o par) — revisão 1, M2', () => {
  it('3750 / 120000 = 0,03125 vira 0,0312 (não 0,0313)', () => {
    expect(arredondarComoPython(3750 / 120000)).toBe(0.0312)
    expect(arredondarComoPython(0.09375)).toBe(0.0938)
    expect(arredondarComoPython(0.00005)).toBe(0.0001) // 0,00005 não é exato em binário: fica acima da metade
    expect(arredondarComoPython(0.22)).toBe(0.22)
  })

  it('numa imagem: um núcleo de cinza de exatamente 3750 pixels em 120000 dá grey_core 0,0312, como o Python', () => {
    const img = cinza(400, 300, 255)
    for (let y = 100; y < 154; y++) for (let x = 100; x < 179; x++) img.px[y * 400 + x] = 128
    expect(classificarModo(img)).toEqual({ modo: 'tons', metricas: { extremes: 0.9645, grey_core: 0.0312 } })
  })
})
