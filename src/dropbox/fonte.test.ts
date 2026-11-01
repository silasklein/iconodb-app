import { ErroDeLogin, ErroDeRede } from '../pacote/manifesto'
import { cliente, eErroDeAutenticacao, marcarExpirado } from './auth'
import { fonteDropbox } from './fonte'

vi.mock('./auth', () => ({
  cliente: vi.fn(),
  eErroDeAutenticacao: vi.fn(() => false),
  marcarExpirado: vi.fn(async () => undefined),
}))

const sem_espera = async () => undefined

function falso(sobrescrever: Record<string, unknown> = {}) {
  return {
    filesDownload: vi.fn(async ({ path }: { path: string }) => ({
      result: { fileBlob: new Blob([`conteudo de ${path}`]) },
    })),
    filesListFolder: vi.fn(),
    filesListFolderContinue: vi.fn(),
    ...sobrescrever,
  }
}

function usarCliente(c: ReturnType<typeof falso> | null) {
  vi.mocked(cliente).mockResolvedValue(c as never)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
  vi.mocked(eErroDeAutenticacao).mockReturnValue(false)
})

describe('fonteDropbox', () => {
  it('sem login devolve null', async () => {
    usarCliente(null)
    expect(await fonteDropbox()).toBeNull()
  })

  it('sem internet ao renovar o token, o erro sobe (não é "sem login")', async () => {
    vi.mocked(cliente).mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(fonteDropbox()).rejects.toBeInstanceOf(TypeError)
  })

  it('baixa pelo caminho na raiz da pasta do app', async () => {
    const c = falso()
    usarCliente(c)
    const fonte = (await fonteDropbox({ esperar: sem_espera }))!
    const bytes = await fonte.baixar('nucleo/comum.sqlite')
    expect(c.filesDownload).toHaveBeenCalledWith({ path: '/nucleo/comum.sqlite' })
    expect(new TextDecoder().decode(bytes)).toBe('conteudo de /nucleo/comum.sqlite')
  })

  it('repete em 429 e em falha de rede, e entrega quando volta', async () => {
    const download = vi
      .fn()
      .mockRejectedValueOnce({ status: 429, error: { error: { retry_after: 3 } } })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ result: { fileBlob: new Blob(['ok']) } })
    usarCliente(falso({ filesDownload: download }))
    const esperas: number[] = []
    const fonte = (await fonteDropbox({ esperar: async (ms) => void esperas.push(ms) }))!
    expect(new TextDecoder().decode(await fonte.baixar('x'))).toBe('ok')
    expect(download).toHaveBeenCalledTimes(3)
    expect(esperas).toEqual([3000, 2000])
  })

  it('limita a espera pedida pelo Dropbox no 429', async () => {
    const download = vi
      .fn()
      .mockRejectedValueOnce({ status: 429, error: { error: { retry_after: 600 } } })
      .mockResolvedValue({ result: { fileBlob: new Blob(['ok']) } })
    usarCliente(falso({ filesDownload: download }))
    const esperas: number[] = []
    const fonte = (await fonteDropbox({ esperar: async (ms) => void esperas.push(ms) }))!
    await fonte.baixar('x')
    expect(esperas).toEqual([30_000])
  })

  it('com o navegador sem rede (onLine false), vai direto a ErroDeRede, sem tentar nem esperar', async () => {
    const download = vi.fn()
    usarCliente(falso({ filesDownload: download }))
    const fonte = (await fonteDropbox({ esperar: sem_espera }))!
    vi.stubGlobal('navigator', { ...navigator, onLine: false })
    await expect(fonte.baixar('x')).rejects.toBeInstanceOf(ErroDeRede)
    expect(download).not.toHaveBeenCalled()
  })

  it('se a rede cai durante as tentativas, não espera as demais', async () => {
    const download = vi.fn().mockImplementation(async () => {
      vi.stubGlobal('navigator', { ...navigator, onLine: false })
      throw new TypeError('Failed to fetch')
    })
    usarCliente(falso({ filesDownload: download }))
    const esperas: number[] = []
    const fonte = (await fonteDropbox({ esperar: async (ms) => void esperas.push(ms) }))!
    await expect(fonte.baixar('x')).rejects.toBeInstanceOf(ErroDeRede)
    expect(download).toHaveBeenCalledTimes(1)
    expect(esperas).toEqual([])
  })

  it('desiste da rede depois de 4 tentativas com ErroDeRede', async () => {
    const download = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    usarCliente(falso({ filesDownload: download }))
    const fonte = (await fonteDropbox({ esperar: sem_espera }))!
    await expect(fonte.baixar('x')).rejects.toBeInstanceOf(ErroDeRede)
    expect(download).toHaveBeenCalledTimes(4)
  })

  it('tempo esgotado (TimeoutError do prazo) é falha de rede: tenta de novo e, por fim, ErroDeRede', async () => {
    const download = vi.fn().mockRejectedValue(new DOMException('O Dropbox não respondeu a tempo.', 'TimeoutError'))
    usarCliente(falso({ filesDownload: download }))
    const fonte = (await fonteDropbox({ esperar: sem_espera }))!
    await expect(fonte.baixar('nucleo/comum.sqlite')).rejects.toBeInstanceOf(ErroDeRede)
    expect(download).toHaveBeenCalledTimes(4)
  })

  it('cada chamada pede o cliente com prazo: 60 s para arquivos, 20 s para JSON e listagem', async () => {
    const c = falso({
      filesListFolder: vi.fn(async () => ({ result: { entries: [], has_more: false, cursor: 'c' } })),
    })
    usarCliente(c)
    const fonte = (await fonteDropbox({ esperar: sem_espera }))!
    vi.mocked(cliente).mockClear()
    await fonte.baixar('nucleo/comum.sqlite')
    await fonte.baixar('nucleo/manifest.json')
    await fonte.listar('')
    expect(vi.mocked(cliente).mock.calls).toEqual([[{ prazoMs: 60_000 }], [{ prazoMs: 20_000 }], [{ prazoMs: 20_000 }]])
  })

  it('credencial recusada marca o login como expirado e lança ErroDeLogin, sem repetir', async () => {
    const download = vi.fn().mockRejectedValue({ status: 401 })
    vi.mocked(eErroDeAutenticacao).mockReturnValue(true)
    usarCliente(falso({ filesDownload: download }))
    const fonte = (await fonteDropbox({ esperar: sem_espera }))!
    await expect(fonte.baixar('x')).rejects.toBeInstanceOf(ErroDeLogin)
    expect(marcarExpirado).toHaveBeenCalledTimes(1)
    expect(download).toHaveBeenCalledTimes(1)
  })

  it('um erro que não é de rede (arquivo inexistente) sobe como está, sem repetir', async () => {
    const download = vi.fn().mockRejectedValue({ status: 409, error: { error_summary: 'path/not_found/' } })
    usarCliente(falso({ filesDownload: download }))
    const fonte = (await fonteDropbox({ esperar: sem_espera }))!
    await expect(fonte.baixar('x')).rejects.toMatchObject({ status: 409 })
    expect(download).toHaveBeenCalledTimes(1)
  })

  it('o login que some no meio do caminho lança ErroDeLogin', async () => {
    usarCliente(falso())
    const fonte = (await fonteDropbox({ esperar: sem_espera }))!
    usarCliente(null)
    await expect(fonte.baixar('x')).rejects.toBeInstanceOf(ErroDeLogin)
  })

  it('lista só os arquivos, seguindo a paginação, relativos à raiz', async () => {
    const c = falso({
      filesListFolder: vi.fn(async () => ({
        result: {
          entries: [
            { '.tag': 'folder', path_display: '/nucleo' },
            { '.tag': 'file', path_display: '/nucleo/b.sqlite' },
          ],
          has_more: true,
          cursor: 'c1',
        },
      })),
      filesListFolderContinue: vi.fn(async () => ({
        result: { entries: [{ '.tag': 'file', path_display: '/nucleo/a.json' }], has_more: false, cursor: 'c2' },
      })),
    })
    usarCliente(c)
    const fonte = (await fonteDropbox({ esperar: sem_espera }))!
    expect(await fonte.listar('nucleo')).toEqual(['nucleo/a.json', 'nucleo/b.sqlite'])
    expect(c.filesListFolder).toHaveBeenCalledWith({ path: '/nucleo', recursive: true })
    expect(c.filesListFolderContinue).toHaveBeenCalledWith({ cursor: 'c1' })
  })
})
