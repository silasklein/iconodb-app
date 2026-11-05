import { deslocamentoDaDica, dicaVaiAcima, ajustarDica } from './posicaoDaDica'
import type { Retangulo } from './posicaoDaPrevia'

const ret = (left: number, top: number, largura: number, altura: number): Retangulo => ({ left, top, right: left + largura, bottom: top + altura })

describe('deslocamentoDaDica: a dica se ancora no termo e não sai da coluna (T17-B-7/8)', () => {
  const PAI = ret(16, 0, 343, 900)
  it('um termo no começo da coluna: sem deslocamento', () => {
    expect(deslocamentoDaDica({ termo: ret(16, 100, 60, 24), pai: PAI })).toBe(0)
  })
  it('um termo perto da borda direita puxa a dica para a esquerda, até caber (largura máxima 260)', () => {
    // termo começa em x=300; a dica de 260 terminaria em 560, a coluna acaba em 359 → desloca -201
    expect(deslocamentoDaDica({ termo: ret(300, 100, 50, 24), pai: PAI })).toBe(-201)
  })
  it('uma coluna mais estreita que 260 limita a largura da dica à coluna', () => {
    const estreito = ret(16, 0, 200, 900)
    expect(deslocamentoDaDica({ termo: ret(100, 0, 40, 24), pai: estreito })).toBe(-84)
  })
  it('nunca passa da borda esquerda da coluna', () => {
    expect(deslocamentoDaDica({ termo: ret(10, 100, 40, 24), pai: PAI })).toBe(6)
  })
})

describe('dicaVaiAcima', () => {
  it('só quando embaixo não cabe e em cima cabe', () => {
    expect(dicaVaiAcima({ termo: ret(0, 700, 50, 24), alturaDaJanela: 760 })).toBe(true)
    expect(dicaVaiAcima({ termo: ret(0, 300, 50, 24), alturaDaJanela: 760 })).toBe(false)
    expect(dicaVaiAcima({ termo: ret(0, 20, 50, 24), alturaDaJanela: 40 })).toBe(false)
  })
})

describe('ajustarDica', () => {
  it('põe --dica-x e data-acima no termo, usando a primeira linha dele', () => {
    document.body.innerHTML = '<p class="leitura-texto"><a class="termo" data-tip="x">t</a></p>'
    const p = document.querySelector('p')!
    const a = document.querySelector('a')!
    p.getBoundingClientRect = () => ({ left: 16, right: 359, top: 0, bottom: 900, width: 343, height: 900, x: 16, y: 0, toJSON() {} }) as DOMRect
    a.getClientRects = () => [{ left: 300, right: 350, top: 700, bottom: 724, width: 50, height: 24 }] as unknown as DOMRectList
    Object.defineProperty(window, 'innerHeight', { value: 760, configurable: true })
    ajustarDica(a)
    expect(a.style.getPropertyValue('--dica-x')).toBe('-201px')
    expect(a.getAttribute('data-acima')).toBe('')
  })
})
