import { render, screen } from '@testing-library/react'
import { Logo } from './Logo'

const RETANGULOS = [
  [0, 0, 7, 3],
  [3, 4, 4, 3],
  [0, 8, 7, 3],
  [8, 0, 3, 11],
  [12, 0, 7, 3],
  [12, 4, 4, 3],
  [12, 8, 7, 3],
]

describe('Logo', () => {
  it('com scale=2 mede 38 x 22 sobre a grade 19 x 11, sem suavização', () => {
    render(<Logo scale={2} tone="light" />)
    const svg = screen.getByRole('img', { name: 'Logo SKC' })
    expect(svg).toHaveAttribute('width', '38')
    expect(svg).toHaveAttribute('height', '22')
    expect(svg).toHaveAttribute('viewBox', '0 0 19 11')
    expect(svg).toHaveAttribute('shape-rendering', 'crispEdges')
  })

  it.each([1, 2, 3, 4] as const)('com scale=%i usa 19*scale por 11*scale', (scale) => {
    render(<Logo scale={scale} tone="dark" />)
    const svg = screen.getByRole('img', { name: 'Logo SKC' })
    expect(svg).toHaveAttribute('width', String(19 * scale))
    expect(svg).toHaveAttribute('height', String(11 * scale))
  })

  it('desenha 7 retângulos em coordenadas inteiras da grade', () => {
    const { container } = render(<Logo scale={1} tone="light" />)
    const rects = Array.from(container.querySelectorAll('rect'))
    expect(rects).toHaveLength(7)
    const lidos = rects.map((r) =>
      ['x', 'y', 'width', 'height'].map((a) => Number(r.getAttribute(a))),
    )
    expect(lidos).toEqual(RETANGULOS)
    for (const n of lidos.flat()) expect(Number.isInteger(n)).toBe(true)
  })

  it('não aceita escala fracionária (erro de tipo)', () => {
    // @ts-expect-error 1.5 não é 1 | 2 | 3 | 4
    render(<Logo scale={1.5} tone="light" />)
  })

  it('usa a cor do texto do tema: clara sobre fundo claro, escura sobre fundo escuro', () => {
    const { rerender } = render(<Logo scale={2} tone="light" />)
    expect(screen.getByRole('img', { name: 'Logo SKC' })).toHaveStyle({ color: 'var(--texto-consulta)' })
    rerender(<Logo scale={2} tone="dark" />)
    expect(screen.getByRole('img', { name: 'Logo SKC' })).toHaveStyle({ color: 'var(--texto-item)' })
  })

  it('nunca usa largura automática', () => {
    render(<Logo scale={3} tone="light" />)
    const svg = screen.getByRole('img', { name: 'Logo SKC' })
    expect(svg.getAttribute('style') ?? '').not.toMatch(/auto/)
  })

  it('tone="atual" segue a cor do tema da tela (barra superior, clara ou escura)', () => {
    render(<Logo scale={2} tone="atual" />)
    expect(screen.getByRole('img', { name: 'Logo SKC' })).toHaveStyle({ color: 'var(--texto)' })
  })
})
