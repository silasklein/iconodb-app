import { codepointsParaUtf16, mapaDeCodepoints } from './offsets'

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
