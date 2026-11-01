import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import {
  estadoLogin,
  iniciarLogin,
  iniciarLoginComCodigo,
  MSG_ACESSO_NEGADO,
  MSG_CODIGO_INVALIDO,
  MSG_SEM_CONEXAO,
  repetirTrocaPendente,
  tentarLoginComCodigo,
} from '../dropbox/auth'
import estilos from './Entrar.css?raw'
import { Entrar } from './Entrar'

vi.mock('../dropbox/auth', () => ({
  iniciarLogin: vi.fn(),
  iniciarLoginComCodigo: vi.fn(),
  tentarLoginComCodigo: vi.fn(),
  repetirTrocaPendente: vi.fn(),
  estadoLogin: vi.fn(),
  MSG_CODIGO_INVALIDO: 'Código não aceito pelo Dropbox; tente de novo',
  MSG_SEM_CONEXAO: 'Sem conexão com o Dropbox; tente de novo',
  MSG_ACESSO_NEGADO: 'Acesso não autorizado no Dropbox',
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
  vi.mocked(tentarLoginComCodigo).mockResolvedValue('ok')
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
    expect(tentarLoginComCodigo).toHaveBeenCalledWith('abc')
    expect(await screen.findByText('Tela preparando')).toBeInTheDocument()
  })

  it('código recusado mostra a mensagem e mantém o campo', async () => {
    vi.mocked(tentarLoginComCodigo).mockResolvedValue('recusado')
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
    expect(tentarLoginComCodigo).toHaveBeenCalledWith('abc')
  })

  it('"Entrar" fica desabilitado enquanto o campo está vazio', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com código' }))
    await screen.findByLabelText('Código do Dropbox')
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled()
  })

  it('código com a rede fora do ar mostra "Sem conexão", não "Código não aceito"', async () => {
    vi.mocked(tentarLoginComCodigo).mockResolvedValue('sem-conexao')
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com código' }))
    await userEvent.type(await screen.findByLabelText('Código do Dropbox'), 'abc')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(MSG_SEM_CONEXAO)
    expect(alerta).not.toHaveTextContent('Código não aceito')
    expect(screen.getByLabelText('Código do Dropbox')).toHaveValue('abc')
  })

  it('voltou com a rede fora do ar: mensagem de conexão e "Tentar de novo" repete a troca guardada', async () => {
    vi.mocked(repetirTrocaPendente).mockResolvedValueOnce('sem-conexao').mockResolvedValueOnce('ok')
    montar({ voltou: true, motivo: 'sem-conexao' })
    expect(await screen.findByRole('status')).toHaveTextContent(MSG_SEM_CONEXAO)
    expect(screen.getByRole('status')).not.toHaveTextContent(/não chegou a este app/i)
    // Não prepara o login por código: isso apagaria o login pendente que guarda o código recebido.
    expect(iniciarLoginComCodigo).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(MSG_SEM_CONEXAO)
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Tela preparando')).toBeInTheDocument()
  })

  it('voltou e a troca guardada foi recusada: cai no login por código', async () => {
    vi.mocked(repetirTrocaPendente).mockResolvedValue('recusado')
    montar({ voltou: true, motivo: 'sem-conexao' })
    await userEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByLabelText('Código do Dropbox')).toBeInTheDocument()
    expect(iniciarLoginComCodigo).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent(/não chegou a este app/i)
  })

  it('voltou com acesso negado: mostra "Acesso não autorizado no Dropbox" e não abre o login por código', async () => {
    montar({ voltou: true, motivo: 'acesso-negado' })
    expect(await screen.findByRole('status')).toHaveTextContent(MSG_ACESSO_NEGADO)
    expect(screen.queryByLabelText('Código do Dropbox')).not.toBeInTheDocument()
    expect(screen.queryByText(/não chegou a este app/i)).not.toBeInTheDocument()
    expect(iniciarLoginComCodigo).not.toHaveBeenCalled()
  })

  it('voltou e o login por código não pôde ser preparado: oferece "Tentar de novo"', async () => {
    vi.mocked(iniciarLoginComCodigo)
      .mockRejectedValueOnce(new Error('falhou'))
      .mockResolvedValueOnce('https://dropbox.com/oauth2/authorize?x=2')
    montar({ voltou: true })
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível abrir o Dropbox; tente de novo')
    expect(screen.queryByRole('link', { name: 'Abrir a página do Dropbox' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    const link = await screen.findByRole('link', { name: 'Abrir a página do Dropbox' })
    expect(link).toHaveAttribute('href', 'https://dropbox.com/oauth2/authorize?x=2')
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('não tem faixa preta no topo (a ilustração do livro não vai para o repositório público)', () => {
    const { container } = montar()
    expect(container.querySelector('.entrar-faixa')).toBeNull()
    expect(estilos).not.toContain('entrar-faixa')
  })

  it('o foco aparece em todos os controles: anel branco explícito sobre o fundo #111111', () => {
    expect(estilos).toMatch(/\.entrar\s+:focus-visible\s*\{[^}]*outline:\s*2px solid #ffffff/i)
    // Nenhum controle anula o contorno.
    expect(estilos).not.toMatch(/outline:\s*(none|0)/i)
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
