import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { AppRoutes, ROTAS } from './routes'

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
  '/imagem/:id',
  '/glossario',
  '/verbete/:id',
  '/bibliografia',
  '/obra/:id',
  '/sitios',
  '/sitio/:id',
  '/revisao',
  '/atalhos',
  '/notas',
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

  it('caminho desconhecido volta ao Início', async () => {
    abrir('/nao-existe')
    expect(await screen.findByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeInTheDocument()
  })

  describe('barra superior', () => {
    it('no computador aparece nas telas de consulta, com um só campo de busca (o da barra)', async () => {
      instalarMatchMedia(1280)
      abrir('/busca')
      expect(await screen.findByRole('navigation', { name: 'Navegação' })).toBeInTheDocument()
      expect(screen.getAllByRole('searchbox')).toHaveLength(1)
      expect(document.querySelector('.campo-busca-barra')).not.toBeNull()
    })

    it('no Início do computador a barra não repete o campo (o Início tem o seu)', async () => {
      instalarMatchMedia(1280)
      abrir('/')
      expect(await screen.findByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeInTheDocument()
      expect(screen.getByRole('navigation', { name: 'Navegação' })).toBeInTheDocument()
      expect(screen.getAllByRole('searchbox')).toHaveLength(1)
      expect(document.querySelector('.campo-busca-inicio')).not.toBeNull()
    })

    it('no celular não há barra; a Busca traz o próprio campo', async () => {
      abrir('/busca')
      expect(await screen.findByRole('searchbox', { name: 'Buscar' })).toBeInTheDocument()
      expect(screen.queryByRole('navigation', { name: 'Navegação' })).not.toBeInTheDocument()
    })

    it.each(['/entrar', '/preparando'])('%s não tem barra superior', async (caminho) => {
      instalarMatchMedia(1280)
      abrir(caminho)
      await screen.findByRole('heading', { level: 1 })
      expect(screen.queryByRole('navigation', { name: 'Navegação' })).not.toBeInTheDocument()
    })
  })
})
