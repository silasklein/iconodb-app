import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { pendencias, sitios } from '../banco/consultas'
import { Menu } from './Menu'

vi.mock('../banco/consultas', () => ({ pendencias: vi.fn(), sitios: vi.fn() }))

function abrir(props: Partial<React.ComponentProps<typeof Menu>> = {}) {
  const aoFechar = vi.fn()
  const gatilho = document.createElement('button')
  document.body.append(gatilho)
  const r = render(
    <MemoryRouter>
      <Menu variante="folha" aoFechar={aoFechar} gatilho={gatilho} {...props} />
    </MemoryRouter>,
  )
  return { aoFechar, gatilho, ...r }
}

describe('Menu', () => {
  beforeEach(() => {
    vi.mocked(pendencias).mockResolvedValue({ total: 4248, porTipo: [] })
    vi.mocked(sitios).mockResolvedValue(Array.from({ length: 90 }, () => ({}) as never))
  })

  it('é um diálogo modal "Menu" com as entradas que existem e a contagem da Revisão', async () => {
    abrir()
    const dialogo = screen.getByRole('dialog', { name: 'Menu' })
    expect(dialogo).toHaveAttribute('aria-modal', 'true')
    const nav = within(dialogo).getByRole('navigation', { name: 'Menu' })
    const revisao = within(nav).getByRole('link', { name: /Revisão/ })
    expect(revisao).toHaveAttribute('href', '/revisao')
    expect(await within(nav).findByText('4.248 casos')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Minhas notas/ })).toHaveAttribute('href', '/notas')
    const sitiosLink = within(nav).getByRole('link', { name: /Sítios/ })
    expect(sitiosLink).toHaveAttribute('href', '/sitios')
    expect(await within(nav).findByText('90 sítios')).toBeInTheDocument()
  })

  it('Comparar, Sincronização e Ajustes ficam desabilitados, com "na próxima versão"', () => {
    abrir()
    for (const nome of ['Comparar', 'Sincronização', 'Ajustes']) {
      const item = screen.getByRole('button', { name: new RegExp(nome) })
      expect(item).toBeDisabled()
      expect(item).toHaveTextContent('na próxima versão')
    }
  })

  it('não oferece "Salvar e sincronizar" (a sincronização é da 2B)', () => {
    abrir()
    expect(screen.queryByText(/Salvar e sincronizar/)).not.toBeInTheDocument()
  })

  it('"Atalhos e convenções" leva a /atalhos e declara a tecla ?', () => {
    abrir()
    const link = screen.getByRole('link', { name: /Atalhos e convenções/ })
    expect(link).toHaveAttribute('href', '/atalhos')
    expect(link).toHaveAttribute('aria-keyshortcuts', '?')
  })

  it('escolher uma entrada fecha o menu', async () => {
    const { aoFechar } = abrir()
    await userEvent.click(screen.getByRole('link', { name: /Minhas notas/ }))
    expect(aoFechar).toHaveBeenCalled()
  })

  it('Esc e o botão Fechar fecham; o foco volta ao gatilho', async () => {
    const { aoFechar, gatilho, unmount } = abrir()
    await userEvent.keyboard('{Escape}')
    expect(aoFechar).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Fechar o menu' }))
    expect(aoFechar).toHaveBeenCalledTimes(2)
    unmount()
    expect(gatilho).toHaveFocus()
  })

  it('o foco começa dentro do menu e o Tab não sai dele', async () => {
    abrir()
    const dialogo = screen.getByRole('dialog', { name: 'Menu' })
    expect(dialogo).toContainElement(document.activeElement as HTMLElement)
    for (let i = 0; i < 12; i++) {
      await userEvent.tab()
      expect(dialogo).toContainElement(document.activeElement as HTMLElement)
    }
    for (let i = 0; i < 12; i++) {
      await userEvent.tab({ shift: true })
      expect(dialogo).toContainElement(document.activeElement as HTMLElement)
    }
  })

  it('o resto da tela fica inerte enquanto o menu está aberto', () => {
    const pagina = document.createElement('div')
    document.body.append(pagina)
    const { unmount } = abrir()
    expect(pagina).toHaveAttribute('inert')
    unmount()
    expect(pagina).not.toHaveAttribute('inert')
  })

  it('tocar fora (no fundo) fecha', async () => {
    const { aoFechar } = abrir()
    await userEvent.click(screen.getByTestId('menu-fundo'))
    expect(aoFechar).toHaveBeenCalled()
  })

  it('a variante popover usa o mesmo conteúdo', () => {
    abrir({ variante: 'popover' })
    expect(screen.getByRole('dialog', { name: 'Menu' })).toHaveClass('menu-popover')
    expect(screen.getByRole('link', { name: /Revisão/ })).toBeInTheDocument()
  })
})
