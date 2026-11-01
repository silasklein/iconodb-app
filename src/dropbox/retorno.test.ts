import { concluirLoginDetalhado as concluirLogin } from './auth'
import { processarRetornoDoLogin } from './retorno'

vi.mock('./auth', () => ({ concluirLoginDetalhado: vi.fn() }))

function irParaUrl(caminho: string) {
  window.history.replaceState(null, '', caminho)
}

afterEach(() => {
  irParaUrl('/')
  vi.mocked(concluirLogin).mockReset()
})

describe('processarRetornoDoLogin', () => {
  it('sem "code" na URL não faz nada', async () => {
    irParaUrl('/?outro=1#/busca')
    expect(await processarRetornoDoLogin()).toBe('sem-retorno')
    expect(concluirLogin).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?outro=1')
  })

  it('com "code": conclui o login com a URL de retorno e limpa a URL antes de esperar', async () => {
    irParaUrl('/?code=ABC&state=XYZ#/entrar')
    let urlNaChamada = ''
    let buscaNaChamada = ''
    vi.mocked(concluirLogin).mockImplementation(async (url) => {
      urlNaChamada = url
      buscaNaChamada = window.location.search
      return 'ok'
    })
    expect(await processarRetornoDoLogin()).toBe('concluido')
    expect(urlNaChamada).toContain('code=ABC')
    expect(urlNaChamada).toContain('state=XYZ')
    expect(buscaNaChamada).toBe('')
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('#/entrar')
  })

  it('devolve "falhou" quando o login não conclui (sem verifier, state errado...)', async () => {
    irParaUrl('/?code=ABC&state=XYZ')
    vi.mocked(concluirLogin).mockResolvedValue('sem-pendente')
    expect(await processarRetornoDoLogin()).toBe('falhou')
    expect(window.location.search).toBe('')
  })

  it('falha de rede na troca devolve "sem-conexao"', async () => {
    irParaUrl('/?code=ABC&state=XYZ')
    vi.mocked(concluirLogin).mockResolvedValue('sem-conexao')
    expect(await processarRetornoDoLogin()).toBe('sem-conexao')
  })

  it('troca recusada pelo Dropbox devolve "falhou"', async () => {
    irParaUrl('/?code=ABC&state=XYZ')
    vi.mocked(concluirLogin).mockResolvedValue('recusado')
    expect(await processarRetornoDoLogin()).toBe('falhou')
  })

  it('retorno com erro do Dropbox passa por concluirLogin, limpa a URL e devolve "acesso-negado"', async () => {
    irParaUrl('/?error=access_denied&error_description=x&state=XYZ')
    vi.mocked(concluirLogin).mockResolvedValue('acesso-negado')
    expect(await processarRetornoDoLogin()).toBe('acesso-negado')
    expect(window.location.search).toBe('')
  })

  it('devolve "falhou" se concluirLogin lançar', async () => {
    irParaUrl('/?code=ABC&state=XYZ')
    vi.mocked(concluirLogin).mockRejectedValue(new Error('x'))
    expect(await processarRetornoDoLogin()).toBe('falhou')
  })

  it('uma segunda chamada (StrictMode) já não encontra o code', async () => {
    irParaUrl('/?code=ABC&state=XYZ')
    vi.mocked(concluirLogin).mockResolvedValue('ok')
    const [a, b] = await Promise.all([processarRetornoDoLogin(), processarRetornoDoLogin()])
    expect([a, b]).toEqual(['concluido', 'sem-retorno'])
    expect(concluirLogin).toHaveBeenCalledTimes(1)
  })
})
