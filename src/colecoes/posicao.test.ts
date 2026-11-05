import { indiceSobOPonto, type Caixa } from './posicao'

const caixa = (left: number, top: number, w: number, h: number): Caixa => ({ left, top, right: left + w, bottom: top + h })

describe('indiceSobOPonto: para onde vai o item que se arrasta', () => {
  const lista = [caixa(0, 0, 300, 60), caixa(0, 60, 300, 60), caixa(0, 120, 300, 60), caixa(0, 180, 300, 60)]

  it('numa lista, o item cuja caixa contém o ponteiro', () => {
    expect(indiceSobOPonto(lista, 100, 10)).toBe(0)
    expect(indiceSobOPonto(lista, 100, 70)).toBe(1)
    expect(indiceSobOPonto(lista, 100, 239)).toBe(3)
  })
  it('acima da primeira ou abaixo da última, o primeiro ou o último', () => {
    expect(indiceSobOPonto(lista, 100, -80)).toBe(0)
    expect(indiceSobOPonto(lista, 100, 900)).toBe(3)
  })
  it('numa fresta entre duas caixas, a mais próxima', () => {
    const com = [caixa(0, 0, 300, 50), caixa(0, 60, 300, 50), caixa(0, 120, 300, 50)]
    expect(indiceSobOPonto(com, 10, 53)).toBe(0)
    expect(indiceSobOPonto(com, 10, 58)).toBe(1)
  })
  it('numa grade, a caixa sob o ponteiro, em linha e coluna', () => {
    const grade = [caixa(0, 0, 100, 120), caixa(110, 0, 100, 120), caixa(0, 140, 100, 120), caixa(110, 140, 100, 120)]
    expect(indiceSobOPonto(grade, 150, 20)).toBe(1)
    expect(indiceSobOPonto(grade, 30, 200)).toBe(2)
    expect(indiceSobOPonto(grade, 160, 400)).toBe(3)
    expect(indiceSobOPonto(grade, 108, 130)).toBe(1) // entre as caixas: vence a mais próxima
  })
  it('sem caixas não há índice', () => {
    expect(indiceSobOPonto([], 1, 1)).toBe(-1)
  })
})
