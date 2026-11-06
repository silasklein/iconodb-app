import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { AppRoutes, ROTAS } from './routes'

function Onde() {
  return <span data-testid="onde">{useLocation().pathname}</span>
}

// A guarda de "/" tem teste próprio (RotaInicial.test.tsx): aqui há pacote e o Início abre.
vi.mock('./RotaInicial', () => ({ RotaInicial: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async () => null) }))

const CAMINHOS = [
  '/',
  '/entrar',
  '/preparando',
  '/busca',
  '/colecoes',
  '/grupo/:id',
  '/item/:numero',
  '/objeto/novo',
  '/imagem/:id',
  '/glossario',
  '/verbete/:id',
  '/bibliografia',
  '/obra/:id',
  '/sitios',
  '/sitios/novo',
  '/sitio/:id',
  '/revisao',
  '/atalhos',
  '/notas',
  '/nota/:id',
  '/sincronizacao',
  '/comparar',
  '/copias',
  '/exportar',
  '/excluidos',
]

function abrir(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('rotas', () => {
  beforeAll(async () => usarMotor(await bancoDeTeste()))
  afterAll(() => usarMotor(null))
  afterEach(() => instalarMatchMedia(375))

  it('declara exatamente as rotas combinadas', () => {
    expect(ROTAS.map((r) => r.path)).toEqual(CAMINHOS)
  })

  it.each(CAMINHOS)('%s mostra uma tela com título', async (caminho) => {
    abrir(caminho.replace(':id', caminho === '/grupo/:id' ? 'GR-TESTE-I-01' : 'x1').replace(':numero', 'CA00001'))
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('/exportar (o endereço antigo) leva a /copias, a tela «Cópias e exportação»', async () => {
    render(
      <MemoryRouter initialEntries={['/exportar']}>
        <AppRoutes />
        <Onde />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Cópias e exportação' })).toBeInTheDocument()
    expect(screen.getByTestId('onde')).toHaveTextContent(/^\/copias$/)
  })

  it('caminho desconhecido volta ao Início', async () => {
    abrir('/nao-existe')
    expect(await screen.findByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeInTheDocument()
  })

  describe('barra superior', () => {
    it('no computador aparece nas telas de consulta, com um só campo de busca (o da barra)', async () => {
      instalarMatchMedia(1280)
      abrir('/busca')
      expect(await screen.findByRole('navigation', { name: 'Navegação' })).toBeInTheDocument()
      expect(screen.getAllByRole('combobox', { name: 'Buscar' })).toHaveLength(1)
      expect(document.querySelector('.campo-busca-barra')).not.toBeNull()
    })

    it('no Início do computador a barra não repete o campo (o Início tem o seu)', async () => {
      instalarMatchMedia(1280)
      abrir('/')
      expect(await screen.findByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeInTheDocument()
      expect(screen.getByRole('navigation', { name: 'Navegação' })).toBeInTheDocument()
      expect(screen.getAllByRole('combobox', { name: 'Buscar' })).toHaveLength(1)
      expect(document.querySelector('.campo-busca-inicio')).not.toBeNull()
    })

    it('no celular não há barra; a Busca traz o próprio campo', async () => {
      abrir('/busca')
      expect(await screen.findByRole('combobox', { name: 'Buscar' })).toBeInTheDocument()
      expect(screen.queryByRole('navigation', { name: 'Navegação' })).not.toBeInTheDocument()
    })

    it.each(['/entrar', '/preparando', '/imagem/IMG-TESTE-0001-1'])('%s não tem barra superior', async (caminho) => {
      instalarMatchMedia(1280)
      abrir(caminho)
      await screen.findByRole('heading', { level: 1 })
      expect(screen.queryByRole('navigation', { name: 'Navegação' })).not.toBeInTheDocument()
    })
  })
  describe('teclado em todas as telas (inclusive no celular, sem barra superior)', () => {
    it.each([
      ['c', 'Coleções'],
      ['l', 'Glossário'],
      ['s', 'Sítios'],
      ['b', 'Bibliografia'],
      ['r', 'Revisão'],
    ])('g e depois %s leva a %s', async (letra, titulo) => {
      abrir('/notas')
      await screen.findByRole('heading', { level: 1, name: 'Minhas notas' })
      expect(screen.queryByRole('navigation', { name: 'Navegação' })).not.toBeInTheDocument()
      await userEvent.keyboard(`g${letra}`)
      expect(await screen.findByRole('heading', { level: 1, name: titulo })).toBeInTheDocument()
    })

    it('g i leva ao Início', async () => {
      abrir('/notas')
      await screen.findByRole('heading', { level: 1, name: 'Minhas notas' })
      await userEvent.keyboard('gi')
      expect(await screen.findByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeInTheDocument()
    })

    it('? abre a lista de atalhos e convenções, e Esc volta', async () => {
      abrir('/notas')
      await screen.findByRole('heading', { level: 1, name: 'Minhas notas' })
      await userEvent.keyboard('?')
      expect(await screen.findByRole('heading', { level: 1, name: 'Atalhos e convenções' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 2, name: 'Convenções' })).toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
      expect(await screen.findByRole('heading', { level: 1, name: 'Minhas notas' })).toBeInTheDocument()
    })

    it('/ foca a busca (a da Busca no celular; a da barra no computador)', async () => {
      abrir('/busca')
      await screen.findByRole('combobox', { name: 'Buscar' })
      await userEvent.keyboard('/')
      expect(screen.getByRole('combobox', { name: 'Buscar' })).toHaveFocus()
    })

    it('/ foca o campo da barra nas telas de consulta do computador', async () => {
      instalarMatchMedia(1280)
      abrir('/colecoes')
      const campo = await screen.findByRole('combobox', { name: 'Buscar' })
      await userEvent.keyboard('/')
      expect(campo).toHaveFocus()
    })

    it('nada dispara dentro de um campo de texto: "gl" digitado na busca fica no campo', async () => {
      abrir('/busca')
      const campo = await screen.findByRole('combobox', { name: 'Buscar' })
      await userEvent.click(campo)
      await userEvent.keyboard('gl?/')
      expect(campo).toHaveValue('gl?/')
      expect(screen.getByRole('heading', { level: 1, name: 'Busca' })).toBeInTheDocument()
    })
  })
})
