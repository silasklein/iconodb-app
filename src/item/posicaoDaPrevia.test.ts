import { posicaoDaPrevia, type Retangulo } from './posicaoDaPrevia'

const ret = (left: number, top: number, largura: number, altura: number): Retangulo => ({ left, top, right: left + largura, bottom: top + altura })
const PAI = ret(50, 0, 600, 3000)
const CAIXA = { largura: 300, altura: 80 }

describe('posicaoDaPrevia: junto da linha do trecho, dentro da coluna e da janela', () => {
  it('abre logo abaixo da linha do trecho, na altura dela (não no pé do parágrafo)', () => {
    const p = posicaoDaPrevia({ linha: ret(100, 200, 80, 24), pai: PAI, caixa: CAIXA, alturaDaJanela: 800 })
    expect(p).toEqual({ top: 224, left: 50, acima: false })
  })

  it('o canto esquerdo nunca passa da coluna: fica entre 0 e (largura do parágrafo − largura da caixa)', () => {
    const direita = posicaoDaPrevia({ linha: ret(600, 200, 40, 24), pai: PAI, caixa: CAIXA, alturaDaJanela: 800 })
    expect(direita.left).toBe(300)
    const antes = posicaoDaPrevia({ linha: ret(10, 200, 40, 24), pai: PAI, caixa: CAIXA, alturaDaJanela: 800 })
    expect(antes.left).toBe(0)
  })

  it('uma caixa mais larga que a coluna começa em 0', () => {
    expect(posicaoDaPrevia({ linha: ret(100, 200, 80, 24), pai: ret(50, 0, 250, 3000), caixa: CAIXA, alturaDaJanela: 800 }).left).toBe(0)
  })

  it('sem espaço embaixo na janela e com espaço em cima, abre para cima', () => {
    const p = posicaoDaPrevia({ linha: ret(100, 740, 80, 24), pai: PAI, caixa: CAIXA, alturaDaJanela: 800 })
    expect(p).toEqual({ top: 740 - 80, left: 50, acima: true })
  })

  it('sem espaço nem em cima, fica embaixo', () => {
    const p = posicaoDaPrevia({ linha: ret(100, 30, 80, 24), pai: PAI, caixa: { largura: 300, altura: 800 }, alturaDaJanela: 800 })
    expect(p.acima).toBe(false)
    expect(p.top).toBe(54)
  })

  it('as medidas são relativas ao parágrafo, mesmo com a página rolada', () => {
    const p = posicaoDaPrevia({ linha: ret(100, 200, 80, 24), pai: ret(50, -1000, 600, 3000), caixa: CAIXA, alturaDaJanela: 800 })
    expect(p.top).toBe(1224)
  })
})
