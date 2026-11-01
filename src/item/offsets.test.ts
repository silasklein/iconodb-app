import { codepointsParaUtf16, mapaDeCodepoints, paraUtf16, trechosEmUtf16 } from './offsets'

describe('codepointsParaUtf16', () => {
  it('em texto só do BMP, code point e UTF-16 coincidem', () => {
    expect(codepointsParaUtf16('leão-de-teste', 0)).toBe(0)
    expect(codepointsParaUtf16('leão-de-teste', 4)).toBe(4)
    expect(codepointsParaUtf16('leão-de-teste', 13)).toBe(13)
  })

  it('cada caractere fora do BMP (𓀀, dois code units) desloca o que vem depois em 1', () => {
    const texto = 'a𓀀b𓀀c'
    expect(texto.length).toBe(7)
    expect(codepointsParaUtf16(texto, 1)).toBe(1) // o 𓀀
    expect(codepointsParaUtf16(texto, 2)).toBe(3) // o b
    expect(codepointsParaUtf16(texto, 4)).toBe(6) // o c
    expect(texto.slice(codepointsParaUtf16(texto, 2), codepointsParaUtf16(texto, 3))).toBe('b')
  })

  it('fim do texto e além dele dão o comprimento; negativo dá 0', () => {
    expect(codepointsParaUtf16('a𓀀', 2)).toBe(3)
    expect(codepointsParaUtf16('a𓀀', 99)).toBe(3)
    expect(codepointsParaUtf16('a𓀀', -1)).toBe(0)
  })
})

describe('mapaDeCodepoints', () => {
  it('converte qualquer posição de uma vez (o mesmo que codepointsParaUtf16)', () => {
    const texto = 'No verso: 𓀀 e 𓀁, depois o leão.'
    const mapa = mapaDeCodepoints(texto)
    const total = [...texto].length
    expect(mapa.length).toBe(total + 1)
    for (let i = 0; i <= total; i++) expect(mapa[i]).toBe(codepointsParaUtf16(texto, i))
  })
})

describe('surrogates sem par (correção 8)', () => {
  it('um high surrogate só forma par se o seguinte for DC00–DFFF', () => {
    const texto = 'x\uD800a😀b' // x, high sozinho, a, 😀, b
    expect(codepointsParaUtf16(texto, 2)).toBe(2) // o "a" (o \uD800 conta 1 unidade)
    expect(codepointsParaUtf16(texto, 3)).toBe(3) // o 😀
    expect(codepointsParaUtf16(texto, 4)).toBe(5) // o "b"
    expect(mapaDeCodepoints(texto)).toEqual([0, 1, 2, 3, 5, 6])
  })
})

describe('paraUtf16 e trechosEmUtf16 (correção 7: um só conversor, com corte)', () => {
  const texto = 'a𓀀bc'
  const mapa = mapaDeCodepoints(texto)
  it('corta a [0, fim] e arredonda para baixo', () => {
    expect(paraUtf16(mapa, -3)).toBe(0)
    expect(paraUtf16(mapa, 2)).toBe(3)
    expect(paraUtf16(mapa, 2.7)).toBe(3)
    expect(paraUtf16(mapa, 99)).toBe(texto.length)
  })
  it('NaN e infinito não são posição (null)', () => {
    expect(paraUtf16(mapa, Number.NaN)).toBeNull()
    expect(paraUtf16(mapa, Number.POSITIVE_INFINITY)).toBeNull()
  })
  it('um trecho com NaN some, em vez de ocupar o texto inteiro', () => {
    expect(trechosEmUtf16(texto, [{ inicio: Number.NaN, fim: 3 }, { inicio: 0, fim: Number.NaN }, { inicio: 2, fim: 3 }, { inicio: 3, fim: 3 }])).toEqual([{ inicio: 3, fim: 4 }])
  })
})
