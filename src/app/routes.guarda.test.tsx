import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { lerEstado } from '../pacote/local'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { AppRoutes } from './routes'

vi.mock('../pacote/local', async (original) => ({
  ...(await original<typeof import('../pacote/local')>()),
  lerEstado: vi.fn(),
}))
vi.mock('../dropbox/auth', () => ({ estadoLogin: vi.fn(async () => 'sem-login') }))
vi.mock('../banco/consultas', () => ({ pendencias: vi.fn(async () => ({ total: 3, porTipo: [] })), sitios: vi.fn(async () => []), contagens: vi.fn(async () => ({ objetos: 1, hipoteses: 1, verbetes: 1 })), grupos: vi.fn(async () => []) }))

describe('barra superior em "/" (computador)', () => {
  afterEach(() => instalarMatchMedia(375))

  it('não aparece enquanto a guarda decide (nem depois, se o destino é /entrar)', async () => {
    instalarMatchMedia(1280)
    let decidir: (v: null) => void = () => {}
    vi.mocked(lerEstado).mockReturnValue(new Promise((ok) => (decidir = ok)))
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('navigation', { name: 'Navegação' })).not.toBeInTheDocument()
    decidir(null)
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Navegação' })).not.toBeInTheDocument()
  })

  it('aparece (sem o campo de busca) quando há pacote e o Início abre', async () => {
    instalarMatchMedia(1280)
    vi.mocked(lerEstado).mockResolvedValue({ schema: 5, gerado_em: 'x', publicacoes: [], arquivos: {} })
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Navegação' })).toBeInTheDocument()
    expect(screen.getAllByRole('searchbox')).toHaveLength(1)
  })
})
