import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { estadoLogin } from '../dropbox/auth'
import { lerEstado } from '../pacote/local'
import { RotaInicial } from './RotaInicial'

vi.mock('../pacote/local', () => ({ lerEstado: vi.fn() }))
vi.mock('../dropbox/auth', () => ({ estadoLogin: vi.fn() }))

const manifesto = { schema: 5, gerado_em: 'x', publicacoes: [], arquivos: {} }

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <RotaInicial>
              <p>tela do Início</p>
            </RotaInicial>
          }
        />
        <Route path="/preparando" element={<p>tela Preparando</p>} />
        <Route path="/entrar" element={<p>tela Entrar</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RotaInicial: para onde o app vai ao abrir', () => {
  beforeEach(() => {
    vi.mocked(lerEstado).mockReset()
    vi.mocked(estadoLogin).mockReset()
  })

  it.each(['ativo', 'expirado', 'sem-login'] as const)('com pacote no aparelho e login %s, abre o Início (token nunca bloqueia a consulta)', async (login) => {
    vi.mocked(lerEstado).mockResolvedValue(manifesto)
    vi.mocked(estadoLogin).mockResolvedValue(login)
    abrir()
    expect(await screen.findByText('tela do Início')).toBeInTheDocument()
  })

  it('sem pacote e com login ativo, vai para /preparando', async () => {
    vi.mocked(lerEstado).mockResolvedValue(null)
    vi.mocked(estadoLogin).mockResolvedValue('ativo')
    abrir()
    expect(await screen.findByText('tela Preparando')).toBeInTheDocument()
  })

  it.each(['expirado', 'sem-login'] as const)('sem pacote e com login %s, vai para /entrar', async (login) => {
    vi.mocked(lerEstado).mockResolvedValue(null)
    vi.mocked(estadoLogin).mockResolvedValue(login)
    abrir()
    expect(await screen.findByText('tela Entrar')).toBeInTheDocument()
  })

  it('não mostra o Início nem redireciona enquanto decide', () => {
    vi.mocked(lerEstado).mockReturnValue(new Promise(() => {}))
    abrir()
    expect(screen.queryByText('tela do Início')).not.toBeInTheDocument()
    expect(screen.queryByText('tela Entrar')).not.toBeInTheDocument()
  })

  it('se ler o estado do aparelho falha, trata como sem pacote', async () => {
    vi.mocked(lerEstado).mockRejectedValue(new Error('opfs'))
    vi.mocked(estadoLogin).mockResolvedValue('sem-login')
    abrir()
    expect(await screen.findByText('tela Entrar')).toBeInTheDocument()
  })

  it('só consulta o login quando falta o pacote', async () => {
    vi.mocked(lerEstado).mockResolvedValue(manifesto)
    abrir()
    await screen.findByText('tela do Início')
    expect(estadoLogin).not.toHaveBeenCalled()
  })
})
