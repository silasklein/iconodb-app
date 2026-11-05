import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, useLocation } from 'react-router'
import { reabrirBanco, usarMotor } from '../banco/cliente'
import { linhasDaFila, sitios } from '../banco/consultas'
import { linhasDeTeste } from '../../tests/suporte/filaDeTeste'
import { lerEstado } from '../pacote/local'
import { AtalhosGlobais } from '../app/useAtalhosDeNavegacao'
import { definirSync, modulo as sync, zerarSync } from '../../tests/suporte/syncSimulada'
import { teclasNaoDeclaradas } from '../test/atalhosDeclarados'
import { BarraSuperior } from './BarraSuperior'

vi.mock('../banco/consultas', () => ({ linhasDaFila: vi.fn(), verbetesAReverNoPacote: vi.fn(async () => []), elementosSemRegiaoNoPacote: vi.fn(async () => []), traducoesNaoRevisadasNoPacote: vi.fn(async () => []), lugaresDosCasos: vi.fn(async () => new Map()), sitios: vi.fn() }))
vi.mock('../pacote/local', () => ({ lerEstado: vi.fn() }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

function Onde() {
  const { pathname, search } = useLocation()
  return <p data-testid="onde">{pathname + search}</p>
}

function abrir(url = '/colecoes', props: React.ComponentProps<typeof BarraSuperior> = {}) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AtalhosGlobais />
      <BarraSuperior {...props} />
      <Onde />
    </MemoryRouter>,
  )
}
const onde = () => screen.getByTestId('onde').textContent

describe('BarraSuperior', () => {
  beforeEach(() => {
    vi.mocked(linhasDaFila).mockResolvedValue(linhasDeTeste(4248))
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
    const campo = screen.getByRole('combobox', { name: 'Buscar' })
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
    vi.mocked(linhasDaFila).mockResolvedValue(linhasDeTeste(1))
    const { unmount } = abrir('/busca')
    expect(await screen.findByRole('link', { name: /1 pendência$/ })).toBeInTheDocument()
    unmount()
    vi.mocked(linhasDaFila).mockResolvedValue(linhasDeTeste(0))
    abrir('/busca')
    const link = await screen.findByRole('link', { name: /Revisão/ })
    await waitFor(() => expect(link.querySelector('.icon-button-ponto')).toBeNull())
  })

  it('a Revisão ainda carregando ou com falha continua sendo um link com o nome Revisão', async () => {
    vi.mocked(linhasDaFila).mockRejectedValue(new Error('sem pacote'))
    abrir('/busca')
    expect(await screen.findByRole('link', { name: 'Revisão' })).toHaveAttribute('aria-keyshortcuts', 'g r')
  })

  describe('o ícone de sincronização (PC-Sincronizacao.dc.html)', () => {
    beforeEach(() => zerarSync())
    const hoje1920 = () => new Date(new Date().setHours(19, 20, 0, 0)).getTime()
    const botao = () => screen.getByRole('button', { name: /sincroniz|Sem internet|Dropbox|Entre de novo/i })

    it('fica antes do Menu; sincronizado: só o ícone, a dica com a hora e o atalho', () => {
      definirSync({ ultimaEm: hoje1920() })
      abrir()
      const nav = screen.getByRole('navigation', { name: 'Navegação' })
      const b = within(nav).getByRole('button', { name: 'Sincronizado às 19:20 — Salvar e sincronizar' })
      expect(b).toHaveAttribute('data-tip', 'Sincronizado às 19:20 — Salvar e sincronizar (Ctrl+S)')
      expect(b).toHaveAttribute('aria-keyshortcuts', 'Control+S Meta+S')
      expect(b).toHaveAttribute('aria-haspopup', 'dialog')
      expect(b).toHaveAttribute('aria-expanded', 'false')
      expect(b.nextElementSibling).toBe(within(nav).getByRole('button', { name: 'Menu' }))
      expect(b.querySelector('[data-marca]')).toBeNull()
      expect(teclasNaoDeclaradas(document.body)).toEqual([])
    })

    it('por enviar: o ponto, com o número na dica', () => {
      definirSync({ porEnviar: 3 })
      abrir()
      const b = screen.getByRole('button', { name: '3 alterações por enviar — Salvar e sincronizar' })
      expect(b).toHaveAttribute('data-tip', '3 alterações por enviar — Salvar e sincronizar (Ctrl+S)')
      expect(b.querySelector('[data-marca="ponto"]')).not.toBeNull()
    })

    it.each([
      ['sincronizando', { estado: 'sincronizando' as const, porEnviar: 3 }, 'Sincronizando: enviando 3 alterações', 'girando'],
      ['sem internet', { estado: 'sem-internet' as const, porEnviar: 3 }, 'Sem internet — 3 alterações guardadas neste aparelho; envia quando voltar', 'traco'],
      ['erro', { estado: { erro: 'geral' as const, mensagem: 'x' } }, 'Não foi possível falar com o Dropbox — tentar de novo', 'erro'],
      ['sem login', { estado: { erro: 'login' as const, mensagem: 'Entre de novo para sincronizar' } }, 'Entre de novo para sincronizar', 'erro'],
    ])('%s: o nome acessível e a marca', (_n, estado, nome, marca) => {
      definirSync(estado)
      abrir()
      expect(screen.getByRole('button', { name: nome }).querySelector(`[data-marca="${marca}"]`)).not.toBeNull()
    })

    it('clicar abre o painel "Sincronização · Dropbox": estado, o que vai subir, o botão e o automático; Esc fecha e o foco volta', async () => {
      definirSync({ porEnviar: 2, ultimaEm: hoje1920(), recebidas: { em: hoje1920(), porAparelho: [{ aparelho: 'bbbbbbbb', nome: 'iPhone', eventos: 2 }] } })
      abrir('/busca')
      const b = botao()
      await userEvent.click(b)
      const painel = screen.getByRole('dialog', { name: 'Sincronização · Dropbox' })
      expect(b).toHaveAttribute('aria-expanded', 'true')
      expect(within(painel).getByRole('status')).toHaveTextContent('2 alterações por enviar')
      // A última sincronização aparece no painel, fora da região viva.
      expect(within(painel).getByRole('status')).not.toHaveTextContent('Última sincronização')
      expect(within(painel).getByText(/Última sincronização: hoje,/)).toBeInTheDocument()
      expect(within(painel).getByRole('region', { name: 'Chegou do outro aparelho' })).toHaveTextContent('2 alterações do iPhone')
      const salvar = within(painel).getByRole('button', { name: 'Salvar e sincronizar' })
      expect(salvar).toHaveAttribute('aria-keyshortcuts', 'Control+S Meta+S')
      await userEvent.click(salvar)
      expect(sync.sincronizarAgora).toHaveBeenCalledWith('manual')
      expect(within(painel).getByRole('switch', { name: /Automático/ })).toBeChecked()
      expect(within(painel).getByRole('link', { name: /Histórico e detalhes/ })).toHaveAttribute('href', '/sincronizacao')
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog', { name: 'Sincronização · Dropbox' })).not.toBeInTheDocument()
      expect(b).toHaveFocus()
    })
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
    vi.mocked(linhasDaFila).mockClear()
    vi.mocked(lerEstado).mockResolvedValue(null)
    abrir('/busca')
    expect(await screen.findByRole('link', { name: 'Revisão' })).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 20))
    expect(linhasDaFila).not.toHaveBeenCalled()
  })

  it('o ponto da Revisão se atualiza quando o banco é reaberto (pacote novo), sem recarregar', async () => {
    vi.mocked(lerEstado).mockResolvedValue(null)
    abrir('/busca')
    expect(await screen.findByRole('link', { name: 'Revisão' })).toBeInTheDocument()
    vi.mocked(lerEstado).mockResolvedValue({ schema: 5, gerado_em: 'y', publicacoes: [], arquivos: {} })
    vi.mocked(linhasDaFila).mockResolvedValue(linhasDeTeste(7))
    usarMotor({
      abrir: async () => ({ estado: 'sem-pacote' }),
      reabrir: async () => ({ estado: 'aberto', publicacoes: [], geradoEm: 'y', modo: 'memoria' }),
      executar: async () => [],
    })
    try {
      await act(async () => {
        await reabrirBanco()
      })
      expect(await screen.findByRole('link', { name: /7 pendências/ })).toBeInTheDocument()
    } finally {
      usarMotor(null)
    }
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
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar' }), 'a') // arma a espera de 250 ms
    await userEvent.click(screen.getByRole('link', { name: 'sair' }))
    expect(onde()).toBe('/colecoes?obra=TESTE-I')
    await new Promise((r) => setTimeout(r, 400))
    expect(onde()).toBe('/colecoes?obra=TESTE-I')
  })

  describe('o campo de busca', () => {
    it('fora da Busca, Enter leva a /busca?q=…', async () => {
      abrir('/colecoes')
      await userEvent.type(screen.getByRole('combobox', { name: 'Buscar' }), 'teste{Enter}')
      expect(onde()).toBe('/busca?q=teste')
    })

    it('na Busca, digitar atualiza q na endereço (substituindo) e preserva escopo e filtros', async () => {
      abrir('/busca?q=le&escopo=termo&nivel=iconographic')
      const campo = screen.getByRole('combobox', { name: 'Buscar' })
      expect(campo).toHaveValue('le')
      await userEvent.type(campo, 'ao')
      await waitFor(() => expect(onde()).toBe('/busca?q=leao&escopo=termo&nivel=iconographic'))
    })

    it('na Busca, Enter envia na hora', async () => {
      abrir('/busca?q=')
      await userEvent.type(screen.getByRole('combobox', { name: 'Buscar' }), 'leao{Enter}')
      expect(onde()).toBe('/busca?q=leao')
    })

    it('na Busca, esvaziar o campo limpa q', async () => {
      abrir('/busca?q=leao')
      await userEvent.click(screen.getByRole('button', { name: 'Limpar a busca' }))
      await waitFor(() => expect(onde()).toBe('/busca?q='))
      expect(screen.getByRole('combobox', { name: 'Buscar' })).toHaveValue('')
    })

    it('fora da Busca o campo começa vazio', () => {
      abrir('/glossario')
      expect(screen.getByRole('combobox', { name: 'Buscar' })).toHaveValue('')
    })
  })

  it('sem busca (Início do computador, que tem o próprio campo) a barra não repete o campo', () => {
    abrir('/', { busca: false })
    expect(screen.queryByRole('combobox', { name: 'Buscar' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Coleções' })).toBeInTheDocument()
  })
})
