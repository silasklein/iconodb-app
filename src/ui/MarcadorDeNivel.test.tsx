import { render, screen } from '@testing-library/react'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { MarcadorDeNivel, TEXTO_DO_NIVEL } from './MarcadorDeNivel'

const cheios = (c: HTMLElement) => c.querySelectorAll('rect[data-cheio="true"]').length
const vazios = (c: HTMLElement) => c.querySelectorAll('rect[data-cheio="false"]').length

describe('MarcadorDeNivel (decisão 35)', () => {
  beforeEach(() => instalarMatchMedia(375))

  it.each([
    ['pre_iconographic', 1, 2, 'nível pré-iconográfico'],
    ['iconographic', 2, 1, 'nível iconográfico'],
    ['iconological', 3, 0, 'nível iconológico'],
  ] as const)('%s: %i quadrado(s) cheio(s), %i vazio(s) e o texto «%s»', (nivel, nCheios, nVazios, texto) => {
    const { container } = render(<MarcadorDeNivel nivel={nivel} />)
    expect(cheios(container)).toBe(nCheios)
    expect(vazios(container)).toBe(nVazios)
    expect(TEXTO_DO_NIVEL[nivel]).toBe(texto)
    // O texto acessível é o nome do nível, não os quadrados.
    expect(screen.getByText(texto)).toHaveClass('so-leitor')
    // Os quadrados são decorativos.
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('sem nível: não desenha nada e não diz nada', () => {
    const { container } = render(<MarcadorDeNivel nivel={null} />)
    expect(container).toBeEmptyDOMElement()
    const { container: c2 } = render(<MarcadorDeNivel nivel={undefined} />)
    expect(c2).toBeEmptyDOMElement()
  })

  it('comTexto={false}: só os quadrados, quando o nome já está escrito ao lado', () => {
    const { container } = render(<MarcadorDeNivel nivel="iconographic" comTexto={false} />)
    expect(cheios(container)).toBe(2)
    expect(container.querySelector('.so-leitor')).toBeNull()
  })

  it('o tamanho vem da tela: linha 22×6; título 25×7 no celular e 30×8 no computador; painel 30×8', () => {
    const medida = (c: HTMLElement) => {
      const s = c.querySelector('svg')!
      return `${s.getAttribute('width')}x${s.getAttribute('height')}`
    }
    expect(medida(render(<MarcadorDeNivel nivel="iconographic" tamanho="linha" />).container)).toBe('22x6')
    expect(medida(render(<MarcadorDeNivel nivel="iconographic" tamanho="titulo" />).container)).toBe('25x7')
    expect(medida(render(<MarcadorDeNivel nivel="iconographic" tamanho="painel" />).container)).toBe('30x8')
    instalarMatchMedia(1280)
    expect(medida(render(<MarcadorDeNivel nivel="iconographic" tamanho="titulo" />).container)).toBe('30x8')
  })

  it('só o marcador do título assina a largura da tela: o da linha, o do painel e o da prévia não (um por hipótese no texto)', () => {
    const espiao = vi.spyOn(window, 'matchMedia')
    render(<MarcadorDeNivel nivel="iconographic" tamanho="linha" />)
    render(<MarcadorDeNivel nivel="iconographic" tamanho="painel" />)
    expect(espiao).not.toHaveBeenCalled()
    render(<MarcadorDeNivel nivel="iconographic" tamanho="titulo" />)
    expect(espiao).toHaveBeenCalled()
    espiao.mockRestore()
  })
})
