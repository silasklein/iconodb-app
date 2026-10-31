import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IconButton } from './IconButton'
import tooltipCss from './Tooltip.css?raw'

describe('IconButton', () => {
  it('é um botão com aria-label e sem atributo title', () => {
    render(<IconButton icon="buscar" label="Buscar" onClick={() => {}} />)
    const botao = screen.getByRole('button', { name: 'Buscar' })
    expect(botao).toHaveAttribute('aria-label', 'Buscar')
    expect(botao).not.toHaveAttribute('title')
  })

  it('esconde o glifo dos leitores de tela e não mostra rótulo visível', () => {
    render(<IconButton icon="buscar" label="Buscar" onClick={() => {}} />)
    const botao = screen.getByRole('button', { name: 'Buscar' })
    expect(botao.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(botao).toHaveTextContent('')
  })

  it('tem aria-keyshortcuts e mostra o atalho na dica quando há shortcut', () => {
    render(<IconButton icon="buscar" label="Buscar" shortcut="/" onClick={() => {}} />)
    const botao = screen.getByRole('button', { name: 'Buscar' })
    expect(botao).toHaveAttribute('aria-keyshortcuts', '/')
    expect(botao).toHaveAttribute('data-tip', 'Buscar (/)')
  })

  it('sem shortcut não declara aria-keyshortcuts e a dica é só o rótulo', () => {
    render(<IconButton icon="menu" label="Abrir o menu" onClick={() => {}} />)
    const botao = screen.getByRole('button', { name: 'Abrir o menu' })
    expect(botao).not.toHaveAttribute('aria-keyshortcuts')
    expect(botao).toHaveAttribute('data-tip', 'Abrir o menu')
  })

  it('mostra um nome de atalho legível na dica, sem mudar o valor de aria-keyshortcuts', () => {
    render(
      <IconButton icon="fechar" label="Fechar" shortcut="Escape" shortcutLabel="Esc" onClick={() => {}} />,
    )
    const botao = screen.getByRole('button', { name: 'Fechar' })
    expect(botao).toHaveAttribute('aria-keyshortcuts', 'Escape')
    expect(botao).toHaveAttribute('data-tip', 'Fechar (Esc)')
  })

  it('recebe o foco pelo teclado (Tab) e dispara onClick com Enter', async () => {
    const aoClicar = vi.fn()
    const user = userEvent.setup()
    render(<IconButton icon="buscar" label="Buscar" shortcut="/" onClick={aoClicar} />)
    await user.tab()
    const botao = screen.getByRole('button', { name: 'Buscar' })
    expect(botao).toHaveFocus()
    expect(botao).toHaveAttribute('data-tip', 'Buscar (/)')
    await user.keyboard('{Enter}')
    expect(aoClicar).toHaveBeenCalledTimes(1)
  })

  it('com href vira um link com a mesma semântica', () => {
    render(<IconButton icon="colecoes" label="Coleções" shortcut="g c" href="#/colecoes" />)
    const link = screen.getByRole('link', { name: 'Coleções' })
    expect(link).toHaveAttribute('href', '#/colecoes')
    expect(link).toHaveAttribute('aria-keyshortcuts', 'g c')
    expect(link).toHaveAttribute('data-tip', 'Coleções (g c)')
  })

  it('posiciona a dica conforme tipPosition', () => {
    render(<IconButton icon="voltar" label="Voltar" href="#/" tipPosition="start" />)
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveClass('tip-start')
  })

  it('posiciona a dica acima com tipAbove', () => {
    render(<IconButton icon="ampliar" label="Ampliar" onClick={() => {}} tipAbove />)
    expect(screen.getByRole('button', { name: 'Ampliar' })).toHaveClass('tip-up')
  })

  it('exige onClick ou href (erro de tipo)', () => {
    // @ts-expect-error falta a ação
    render(<IconButton icon="menu" label="Menu" />)
  })
})

describe('Tooltip.css', () => {
  const css = tooltipCss

  it('mostra a dica ao receber foco visível', () => {
    expect(css).toMatch(/\[data-tip\]:focus-visible::after\s*\{\s*display:\s*block/)
  })

  it('mostra a dica ao passar o mouse só em aparelhos com hover', () => {
    expect(css).toMatch(/@media \(hover:\s*hover\)\s*\{\s*\[data-tip\]:hover::after\s*\{\s*display:\s*block/)
  })

  it('nunca desce abaixo de 12 px de fonte', () => {
    for (const m of css.matchAll(/font:\s*\d+\s+(\d+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(12)
  })
})
