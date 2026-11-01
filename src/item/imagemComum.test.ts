import { geometriaGirada, giroDaImagem, transformDoGiro } from './imagemComum'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn() }))

describe('o giro da imagem (a regra do item e do visualizador)', () => {
  it('só vale a partir de 0,5° (sem rotação ou com ruído, não gira)', () => {
    expect(giroDaImagem(null)).toBe(0)
    expect(giroDaImagem(0)).toBe(0)
    expect(giroDaImagem(0.4)).toBe(0)
    expect(giroDaImagem(-0.49)).toBe(0)
    expect(giroDaImagem(0.5)).toBe(0.5)
    expect(giroDaImagem(-5)).toBe(-5)
    expect(giroDaImagem(90)).toBe(90)
  })

  it('o transform é o mesmo texto para o item e para o visualizador', () => {
    expect(transformDoGiro(90)).toBe('rotate(90deg)')
    expect(transformDoGiro(-5)).toBe('rotate(-5deg)')
  })

  it('a 90° a caixa troca largura e altura; a figura ocupa a fração da caixa', () => {
    const g = geometriaGirada({ w: 900, h: 1200 }, 90)
    expect(g.caixa.w).toBeCloseTo(1200)
    expect(g.caixa.h).toBeCloseTo(900)
    expect(g.razao).toBeCloseTo(1200 / 900)
    expect(g.fracao.w).toBeCloseTo(0.75)
    expect(g.fracao.h).toBeCloseTo(1200 / 900)
  })

  it('sem giro a caixa é a figura', () => {
    const g = geometriaGirada({ w: 900, h: 1200 }, 0)
    expect(g.caixa).toEqual({ w: 900, h: 1200 })
    expect(g.razao).toBeCloseTo(0.75)
    expect(g.fracao).toEqual({ w: 1, h: 1 })
  })
})
