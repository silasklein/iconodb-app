import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import {
  concluirLoginComCodigo,
  estadoLogin,
  iniciarLogin,
  iniciarLoginComCodigo,
  MSG_CODIGO_INVALIDO,
} from '../dropbox/auth'
import { Entrar } from './Entrar'

vi.mock('../dropbox/auth', () => ({
  iniciarLogin: vi.fn(),
  iniciarLoginComCodigo: vi.fn(),
  concluirLoginComCodigo: vi.fn(),
  estadoLogin: vi.fn(),
  MSG_CODIGO_INVALIDO: 'Código não aceito pelo Dropbox; tente de novo',
}))

function montar(estado?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/entrar', state: estado }]}>
      <Routes>
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/preparando" element={<p>Tela preparando</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(estadoLogin).mockResolvedValue('sem-login')
  vi.mocked(iniciarLogin).mockResolvedValue(undefined)
  vi.mocked(iniciarLoginComCodigo).mockResolvedValue('https://dropbox.com/oauth2/authorize?x=1')
  vi.mocked(concluirLoginComCodigo).mockResolvedValue(true)
  vi.spyOn(window, 'open').mockReturnValue(null)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

describe('Entrar', () => {
  it('mostra logo 38 x 22, SKC, IconoDB, o lema e o botão, sem aviso', () => {
    montar()
    const logo = screen.getByRole('img', { name: 'Logo SKC' })
    expect(logo).toHaveAttribute('width', '38')
    expect(logo).toHaveAttribute('height', '22')
    expect(screen.getByText('SKC')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'IconoDB' })).toBeInTheDocument()
    expect(screen.getByText(/Banco de dados iconográfico/)).toHaveTextContent(
      'Banco de dados iconográfico pessoal e fechado',
    )
    expect(screen.getByRole('button', { name: 'Entrar com o Dropbox' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Código do Dropbox')).not.toBeInTheDocument()
  })

  it('"Entrar com o Dropbox" inicia o login com redirecionamento', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com o Dropbox' }))
    expect(iniciarLogin).toHaveBeenCalledTimes(1)
  })

  it('se o login não puder começar, avisa sem quebrar', async () => {
    vi.mocked(iniciarLogin).mockRejectedValue(new Error('sem crypto'))
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com o Dropbox' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível abrir o Dropbox; tente de novo')
    expect(screen.getByRole('button', { name: 'Entrar com o Dropbox' })).toBeEnabled()
  })

  it('"Entrar com código" abre o login alternativo: abre o Dropbox em nova janela e mostra o campo e o botão', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com código' }))
    expect(iniciarLoginComCodigo).toHaveBeenCalledTimes(1)
    expect(await screen.findByLabelText('Código do Dropbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    expect(window.open).toHaveBeenCalledWith('https://dropbox.com/oauth2/authorize?x=1', '_blank', 'noopener')
    // Se a janela for bloqueada, o link resolve.
    const link = screen.getByRole('link', { name: 'Abrir a página do Dropbox' })
    expect(link).toHaveAttribute('href', 'https://dropbox.com/oauth2/authorize?x=1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('código aceito leva a /preparando', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com código' }))
    await userEvent.type(await screen.findByLabelText('Código do Dropbox'), 'abc')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(concluirLoginComCodigo).toHaveBeenCalledWith('abc')
    expect(await screen.findByText('Tela preparando')).toBeInTheDocument()
  })

  it('código recusado mostra a mensagem e mantém o campo', async () => {
    vi.mocked(concluirLoginComCodigo).mockResolvedValue(false)
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com código' }))
    const campo = await screen.findByLabelText('Código do Dropbox')
    await userEvent.type(campo, 'errado')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(MSG_CODIGO_INVALIDO)
    expect(screen.getByLabelText('Código do Dropbox')).toHaveValue('errado')
  })

  it('Enter no campo envia o código', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com código' }))
    await userEvent.type(await screen.findByLabelText('Código do Dropbox'), 'abc{Enter}')
    expect(concluirLoginComCodigo).toHaveBeenCalledWith('abc')
  })

  it('"Entrar" fica desabilitado enquanto o campo está vazio', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com código' }))
    await screen.findByLabelText('Código do Dropbox')
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled()
  })

  it('ao voltar do Dropbox sem concluir, já mostra o caminho por código, com explicação', async () => {
    montar({ voltou: true })
    expect(await screen.findByLabelText('Código do Dropbox')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/não chegou a este app/i)
    await waitFor(() => expect(iniciarLoginComCodigo).toHaveBeenCalledTimes(1))
  })

  it('login expirado avisa que os dados do aparelho continuam', async () => {
    vi.mocked(estadoLogin).mockResolvedValue('expirado')
    montar()
    expect(await screen.findByRole('status')).toHaveTextContent(/expirou/i)
    expect(screen.getByRole('status')).toHaveTextContent(/continuam/i)
  })
})
