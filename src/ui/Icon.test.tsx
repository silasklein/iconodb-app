import { render } from '@testing-library/react'
import { Icon, ICON_NAMES, type IconName } from './Icon'

describe('Icon', () => {
  it('declara os conceitos usados no design', () => {
    const obrigatorios: IconName[] = [
      'buscar',
      'menu',
      'fechar',
      'sincronizar',
      'voltar',
      'anterior',
      'proximo',
      'colecoes',
      'glossario',
      'sitios',
      'bibliografia',
      'revisao',
      'filtro',
    ]
    for (const nome of obrigatorios) expect(ICON_NAMES).toContain(nome)
  })

  it.each([16, 18, 20, 22] as const)('desenha em 24 x 24 e exibe em %i px', (size) => {
    const { container } = render(<Icon name="buscar" size={size} />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    expect(svg).toHaveAttribute('width', String(size))
    expect(svg).toHaveAttribute('height', String(size))
    expect(svg).toHaveAttribute('stroke-width', '1.5')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('tamanho padrão é 20', () => {
    const { container } = render(<Icon name="menu" />)
    expect(container.querySelector('svg')).toHaveAttribute('width', '20')
  })

  it('não aceita tamanho fora do conjunto (erro de tipo)', () => {
    // @ts-expect-error 19 não é 16 | 18 | 20 | 22
    render(<Icon name="menu" size={19} />)
  })

  it('cada nome desenha algo e nenhum glifo se repete (um por conceito)', () => {
    const vistos = new Map<string, IconName>()
    for (const nome of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={nome} />)
      const interior = container.querySelector('svg')!.innerHTML
      expect(interior, nome).not.toBe('')
      expect(vistos.get(interior), `${nome} repete ${vistos.get(interior)}`).toBeUndefined()
      vistos.set(interior, nome)
      unmount()
    }
  })
})
