import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { linhasDaFila, sitios } from '../banco/consultas'
import { linhasDeTeste } from '../../tests/suporte/filaDeTeste'
import { definirSync, modulo as sync, zerarSync } from '../../tests/suporte/syncSimulada'
import { Menu } from './Menu'

vi.mock('../banco/consultas', () => ({ linhasDaFila: vi.fn(), verbetesAReverNoPacote: vi.fn(async () => []), elementosSemRegiaoNoPacote: vi.fn(async () => []), traducoesNaoRevisadasNoPacote: vi.fn(async () => []), lugaresDosCasos: vi.fn(async () => new Map()), sitios: vi.fn() }))
vi.mock('../pacote/local', () => ({ lerEstado: vi.fn(async () => ({ schema: 5 })) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

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
    vi.mocked(linhasDaFila).mockResolvedValue(linhasDeTeste(4248))
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

  it('Comparar é um link com o contador da bandeja; Ajustes fica desabilitado, com "na próxima versão"', () => {
    abrir()
    const comparar = screen.getByRole('link', { name: /Comparar/ })
    expect(comparar).toHaveAttribute('href', '/comparar')
    expect(comparar).toHaveTextContent('0/4')
    const item = screen.getByRole('button', { name: /Ajustes/ })
    expect(item).toBeDisabled()
    expect(item).toHaveTextContent('na próxima versão')
  })

  describe('a seção Sincronização (Menu.dc.html)', () => {
    beforeEach(() => zerarSync())

    it('o link "Sincronização" com "Detalhes" leva à tela; o estado e a última; o botão "Salvar e sincronizar"', async () => {
      const as1910 = new Date(new Date().setHours(19, 10, 0, 0)).getTime()
      definirSync({ porEnviar: 3, ultimaEm: as1910 })
      const { aoFechar } = abrir()
      const secao = screen.getByRole('region', { name: 'Sincronização' })
      const link = within(secao).getByRole('link', { name: /Sincronização/ })
      expect(link).toHaveAttribute('href', '/sincronizacao')
      expect(link).toHaveTextContent('Detalhes')
      expect(link.querySelector('[data-marca="ponto"]')).not.toBeNull()
      expect(within(secao).getByText(/3 alterações por enviar/).parentElement).toHaveTextContent('3 alterações por enviar · última às 19:10')
      // A hora fica fora da região viva: não é lida de novo a cada rodada.
      expect(within(secao).getByRole('status')).toHaveTextContent(/^3 alterações por enviar$/)
      const botao = within(secao).getByRole('button', { name: 'Salvar e sincronizar' })
      expect(botao).toHaveAttribute('aria-keyshortcuts', 'Control+S Meta+S')
      await userEvent.click(botao)
      expect(sync.sincronizarAgora).toHaveBeenCalledWith('manual')
      expect(aoFechar).not.toHaveBeenCalled()
      await userEvent.click(link)
      expect(aoFechar).toHaveBeenCalled()
    })

    it('sincronizado: sem ponto; sem login, o aviso de entrar de novo', () => {
      definirSync({ estado: { erro: 'login', mensagem: 'Entre de novo para sincronizar' } })
      abrir()
      const secao = screen.getByRole('region', { name: 'Sincronização' })
      expect(within(secao).getByRole('status')).toHaveTextContent('Entre de novo para sincronizar')
      act(() => zerarSync())
      expect(within(secao).getByRole('link', { name: /Sincronização/ }).querySelector('[data-marca]')).toBeNull()
    })
  })

  it('"Exportar" leva a /exportar, logo antes de "Atalhos e convenções", e fecha o menu como as outras entradas', async () => {
    const { aoFechar } = abrir()
    const nav = screen.getByRole('navigation', { name: 'Menu' })
    const exportar = within(nav).getByRole('link', { name: /Exportar/ })
    expect(exportar).toHaveAttribute('href', '/exportar')
    const links = within(nav).getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(links.indexOf('/exportar')).toBe(links.indexOf('/atalhos') - 1)
    // O teclado: Tab chega a ela, e Enter a abre (fecha o menu), como nas outras.
    exportar.focus()
    await userEvent.keyboard('{Enter}')
    expect(aoFechar).toHaveBeenCalled()
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
