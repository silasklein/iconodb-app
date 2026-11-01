import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, useLocation } from 'react-router'
import { pendencias, sitios } from '../banco/consultas'
import { lerEstado } from '../pacote/local'
import { BarraSuperior } from './BarraSuperior'

vi.mock('../banco/consultas', () => ({ pendencias: vi.fn(), sitios: vi.fn() }))
vi.mock('../pacote/local', () => ({ lerEstado: vi.fn() }))

function Onde() {
  const { pathname, search } = useLocation()
  return <p data-testid="onde">{pathname + search}</p>
}

function abrir(url = '/colecoes', props: React.ComponentProps<typeof BarraSuperior> = {}) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <BarraSuperior {...props} />
      <Onde />
    </MemoryRouter>,
  )
}
const onde = () => screen.getByTestId('onde').textContent

describe('BarraSuperior', () => {
  beforeEach(() => {
    vi.mocked(pendencias).mockResolvedValue({ total: 4248, porTipo: [] })
    vi.mocked(sitios).mockResolvedValue([])
    vi.mocked(lerEstado).mockResolvedValue({ schema: 5, gerado_em: 'x', publicacoes: [], arquivos: {} })
  })

  it('à esquerda o logo SKC (38 x 22) leva ao Início, com g i', () => {
    abrir()
    const inicio = screen.getByRole('link', { name: 'Início' })
    expect(inicio).toHaveAttribute('href', '#/')
    expect(inicio).toHaveAttribute('aria-keyshortcuts', 'g i')
    const logo = within(inicio).getByRole('img', { name: 'Logo SKC' })
    expect(logo).toHaveAttribute('width', '38')
    expect(logo).toHaveAttribute('height', '22')
  })

  it('ao centro o campo de busca, com o nome visível "Buscar" e a tecla /', () => {
    abrir()
    const campo = screen.getByRole('searchbox', { name: 'Buscar' })
    expect(campo).toHaveAttribute('aria-keyshortcuts', '/')
    expect(campo).toHaveAttribute('placeholder', 'termo, sítio ou número…')
    expect(screen.getByText('Buscar')).toBeVisible()
  })

  it.each([
    ['Coleções', '#/colecoes', 'g c'],
    ['Glossário', '#/glossario', 'g l'],
    ['Sítios', '#/sitios', 'g s'],
    ['Bibliografia', '#/bibliografia', 'g b'],
  ])('o ícone %s leva a %s e tem o atalho %s', (nome, href, atalho) => {
    abrir('/busca')
    const nav = screen.getByRole('navigation', { name: 'Navegação' })
    const link = within(nav).getByRole('link', { name: nome })
    expect(link).toHaveAttribute('href', href)
    expect(link).toHaveAttribute('aria-keyshortcuts', atalho)
    expect(link).toHaveAttribute('data-tip', `${nome} (${atalho})`)
    expect(link).toHaveTextContent('')
  })

  it('a Revisão é só um ponto, com a dica "<N> pendências" (N em pt-BR) e g r', async () => {
    abrir('/busca')
    const link = await screen.findByRole('link', { name: /4\.248 pendências/ })
    expect(link).toHaveAttribute('href', '#/revisao')
    expect(link).toHaveAttribute('aria-keyshortcuts', 'g r')
    expect(link.getAttribute('data-tip')).toMatch(/^Revisão.*4\.248 pendências.*\(g r\)$/)
    expect(link.querySelector('.icon-button-ponto')).not.toBeNull()
    expect(link).toHaveTextContent('')
  })

  it('1 pendência no singular; sem pendências, sem ponto', async () => {
    vi.mocked(pendencias).mockResolvedValue({ total: 1, porTipo: [] })
    const { unmount } = abrir('/busca')
    expect(await screen.findByRole('link', { name: /1 pendência$/ })).toBeInTheDocument()
    unmount()
    vi.mocked(pendencias).mockResolvedValue({ total: 0, porTipo: [] })
    abrir('/busca')
    const link = await screen.findByRole('link', { name: /Revisão/ })
    await waitFor(() => expect(link.querySelector('.icon-button-ponto')).toBeNull())
  })

  it('a Revisão ainda carregando ou com falha continua sendo um link com o nome Revisão', async () => {
    vi.mocked(pendencias).mockRejectedValue(new Error('sem pacote'))
    abrir('/busca')
    expect(await screen.findByRole('link', { name: 'Revisão' })).toHaveAttribute('aria-keyshortcuts', 'g r')
  })

  it('não há ícone de sincronização na 2A', () => {
    abrir()
    expect(screen.queryByRole('button', { name: /sincroniz/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /sincroniz/i })).not.toBeInTheDocument()
  })

  it('marca a seção atual', () => {
    abrir('/colecoes')
    expect(screen.getByRole('link', { name: 'Coleções' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Glossário' })).not.toHaveAttribute('aria-current')
  })

  it('a barra de um grupo marca Coleções (a tela pertence à seção)', () => {
    abrir('/grupo/GR-TESTE-I-01')
    expect(screen.getByRole('link', { name: 'Coleções' })).toHaveAttribute('aria-current', 'page')
  })

  it('g e a letra navegam', async () => {
    abrir('/busca')
    await userEvent.keyboard('gc')
    expect(onde()).toBe('/colecoes')
    await userEvent.keyboard('gl')
    expect(onde()).toBe('/glossario')
    await userEvent.keyboard('gs')
    expect(onde()).toBe('/sitios')
    await userEvent.keyboard('gb')
    expect(onde()).toBe('/bibliografia')
    await userEvent.keyboard('gr')
    expect(onde()).toBe('/revisao')
  })

  it('o Menu abre o painel (aria-expanded), Esc fecha e o foco volta ao botão', async () => {
    abrir('/busca')
    const botao = screen.getByRole('button', { name: 'Menu' })
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(botao)
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument()
    expect(botao).toHaveAttribute('aria-expanded', 'true')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
    expect(botao).toHaveFocus()
  })

  it('escolher algo no Menu fecha o painel', async () => {
    abrir('/busca')
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
    await userEvent.click(screen.getByRole('link', { name: /Minhas notas/ }))
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
    expect(onde()).toBe('/notas')
  })

  it('sem pacote no aparelho a barra não consulta a fila de revisão', async () => {
    vi.mocked(pendencias).mockClear()
    vi.mocked(lerEstado).mockResolvedValue(null)
    abrir('/busca')
    expect(await screen.findByRole('link', { name: 'Revisão' })).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 20))
    expect(pendencias).not.toHaveBeenCalled()
  })

  it('g e a letra não navegam com o Menu aberto', async () => {
    abrir('/busca')
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
    await userEvent.keyboard('gc')
    expect(onde()).toBe('/busca')
  })

  it('a espera de digitação não escreve ?q= em outra rota depois de sair da Busca', async () => {
    render(
      <MemoryRouter initialEntries={['/busca?q=']}>
        <BarraSuperior />
        <Onde />
        <Link to="/colecoes?obra=TESTE-I">sair</Link>
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'a') // arma a espera de 250 ms
    await userEvent.click(screen.getByRole('link', { name: 'sair' }))
    expect(onde()).toBe('/colecoes?obra=TESTE-I')
    await new Promise((r) => setTimeout(r, 400))
    expect(onde()).toBe('/colecoes?obra=TESTE-I')
  })

  describe('o campo de busca', () => {
    it('fora da Busca, Enter leva a /busca?q=…', async () => {
      abrir('/colecoes')
      await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'teste{Enter}')
      expect(onde()).toBe('/busca?q=teste')
    })

    it('na Busca, digitar atualiza q na endereço (substituindo) e preserva escopo e filtros', async () => {
      abrir('/busca?q=le&escopo=termo&nivel=iconographic')
      const campo = screen.getByRole('searchbox', { name: 'Buscar' })
      expect(campo).toHaveValue('le')
      await userEvent.type(campo, 'ao')
      await waitFor(() => expect(onde()).toBe('/busca?q=leao&escopo=termo&nivel=iconographic'))
    })

    it('na Busca, Enter envia na hora', async () => {
      abrir('/busca?q=')
      await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'leao{Enter}')
      expect(onde()).toBe('/busca?q=leao')
    })

    it('na Busca, esvaziar o campo limpa q', async () => {
      abrir('/busca?q=leao')
      await userEvent.click(screen.getByRole('button', { name: 'Limpar a busca' }))
      await waitFor(() => expect(onde()).toBe('/busca?q='))
      expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('')
    })

    it('fora da Busca o campo começa vazio', () => {
      abrir('/glossario')
      expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('')
    })
  })

  it('sem busca (Início do computador, que tem o próprio campo) a barra não repete o campo', () => {
    abrir('/', { busca: false })
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Coleções' })).toBeInTheDocument()
  })
})
