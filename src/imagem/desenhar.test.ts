import { pontosDoSeletor } from '../banco/consultas'
import {
  aplicarEdicao,
  clienteParaRelativo,
  DESENHO_VAZIO,
  desfazer,
  fechar,
  limitar,
  moverPonto,
  novaEdicao,
  poligonoValido,
  pontoSob,
  seletorDoPoligono,
  tocar,
  type Desenho,
} from './desenhar'

const TOL = { x: 0.02, y: 0.02 }

describe('desenhar: o polígono livre de uma região (formato R4)', () => {
  it('cada toque põe um ponto; tocar perto do primeiro (com 3 ou mais) fecha; fechado, não aceita mais pontos', () => {
    let d: Desenho = DESENHO_VAZIO
    d = tocar(d, [0.1, 0.1], TOL)
    d = tocar(d, [0.5, 0.1], TOL)
    // Com só 2 pontos, tocar no primeiro é mais um ponto (não fecha uma "região" de 2 pontos).
    expect(tocar(d, [0.105, 0.1], TOL).fechado).toBe(false)
    d = tocar(d, [0.5, 0.5], TOL)
    expect(d).toEqual({ pontos: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]], fechado: false })
    d = tocar(d, [0.11, 0.105], TOL)
    expect(d).toEqual({ pontos: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]], fechado: true })
    expect(tocar(d, [0.9, 0.9], TOL)).toBe(d)
  })

  it('pontos fora da imagem ficam na borda (0 a 1); NaN não vira ponto', () => {
    expect(limitar([-0.2, 1.4])).toEqual([0, 1])
    expect(limitar([Number.NaN, 0.5])).toBeNull()
    expect(tocar(DESENHO_VAZIO, [Number.NaN, 0.2], TOL)).toBe(DESENHO_VAZIO)
    expect(tocar(DESENHO_VAZIO, [1.3, -1], TOL).pontos).toEqual([[1, 0]])
  })

  it('"Concluir" (Enter) fecha só com 3 pontos que formam uma área; pontos repetidos não contam', () => {
    const dois = { pontos: [[0.1, 0.1], [0.4, 0.4]] as [number, number][], fechado: false }
    expect(fechar(dois)).toBe(dois)
    const emLinha = { pontos: [[0, 0], [0.5, 0.5], [1, 1]] as [number, number][], fechado: false }
    expect(poligonoValido(emLinha.pontos)).toBe(false)
    expect(fechar(emLinha)).toBe(emLinha)
    const tri = { pontos: [[0, 0], [1, 0], [0, 1]] as [number, number][], fechado: false }
    expect(fechar(tri).fechado).toBe(true)
  })

  it('os pontos são editáveis: o mais próximo dentro da tolerância é pego e movido (também depois de fechado)', () => {
    const d: Desenho = { pontos: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]], fechado: true }
    expect(pontoSob(d, [0.51, 0.49], TOL)).toBe(2)
    expect(pontoSob(d, [0.3, 0.3], TOL)).toBe(-1)
    expect(moverPonto(d, 2, [0.6, 1.2])).toEqual({ pontos: [[0.1, 0.1], [0.5, 0.1], [0.6, 1]], fechado: true })
    expect(moverPonto(d, 7, [0.6, 0.6])).toBe(d)
  })

  it('desfazer volta um passo de cada vez (ponto, fechar, mover), até o vazio', () => {
    let e = novaEdicao()
    e = aplicarEdicao(e, tocar(e.atual, [0.1, 0.1], TOL))
    e = aplicarEdicao(e, tocar(e.atual, [0.5, 0.1], TOL))
    e = aplicarEdicao(e, tocar(e.atual, [0.5, 0.5], TOL))
    e = aplicarEdicao(e, fechar(e.atual))
    e = aplicarEdicao(e, moverPonto(e.atual, 0, [0.2, 0.2]))
    // Uma edição que não muda nada não entra no histórico.
    e = aplicarEdicao(e, tocar(e.atual, [0.9, 0.9], TOL))
    expect(e.antes).toHaveLength(5)
    e = desfazer(e)
    expect(e.atual.pontos[0]).toEqual([0.1, 0.1])
    e = desfazer(e)
    expect(e.atual.fechado).toBe(false)
    e = desfazer(desfazer(desfazer(e)))
    expect(e.atual).toEqual(DESENHO_VAZIO)
    expect(desfazer(e)).toBe(e)
  })

  it('o seletor é `<polygon points="x,y …"/>` com no máximo 4 casas, e volta igual pelo leitor do banco', () => {
    const pontos: [number, number][] = [
      [0.123456, 0.1],
      [1, 0],
      [0.5, 0.987654321],
    ]
    const s = seletorDoPoligono(pontos)
    expect(s).toBe('<polygon points="0.1235,0.1 1,0 0.5,0.9877"/>')
    expect(pontosDoSeletor(s)).toEqual([
      [0.1235, 0.1],
      [1, 0],
      [0.5, 0.9877],
    ])
  })
})

describe('clienteParaRelativo: do ponto na tela para 0–1 da imagem (antes do giro)', () => {
  it('sem giro: a caixa na tela é a imagem (ampliada ou não)', () => {
    const caixa = { left: 100, top: 50, width: 200, height: 100 }
    const tam = { w: 100, h: 50 } // tamanho de layout; a caixa está ampliada 2×
    expect(clienteParaRelativo({ x: 100, y: 50 }, caixa, tam, 0)).toEqual([0, 0])
    expect(clienteParaRelativo({ x: 300, y: 150 }, caixa, tam, 0)).toEqual([1, 1])
    expect(clienteParaRelativo({ x: 150, y: 125 }, caixa, tam, 0)).toEqual([0.25, 0.75])
  })

  it('com o giro do livro (90°): o canto de cima à esquerda da figura está no alto à direita da caixa', () => {
    // A figura de 100 × 50 girada 90° ocupa uma caixa de 50 × 100 na tela.
    const caixa = { left: 0, top: 0, width: 50, height: 100 }
    const tam = { w: 100, h: 50 }
    const [x, y] = clienteParaRelativo({ x: 50, y: 0 }, caixa, tam, 90)!
    expect(x).toBeCloseTo(0, 6)
    expect(y).toBeCloseTo(0, 6)
    const [x2, y2] = clienteParaRelativo({ x: 0, y: 100 }, caixa, tam, 90)!
    expect(x2).toBeCloseTo(1, 6)
    expect(y2).toBeCloseTo(1, 6)
    const [x3, y3] = clienteParaRelativo({ x: 25, y: 50 }, caixa, tam, 90)!
    expect(x3).toBeCloseTo(0.5, 6)
    expect(y3).toBeCloseTo(0.5, 6)
  })

  it('fora da imagem, fica na borda; caixa sem tamanho não dá ponto', () => {
    const caixa = { left: 0, top: 0, width: 100, height: 100 }
    expect(clienteParaRelativo({ x: -50, y: 300 }, caixa, { w: 100, h: 100 }, 0)).toEqual([0, 1])
    expect(clienteParaRelativo({ x: 1, y: 1 }, { left: 0, top: 0, width: 0, height: 0 }, { w: 0, h: 0 }, 0)).toBeNull()
  })
})
