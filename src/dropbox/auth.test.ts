import { IDBFactory } from 'fake-indexeddb'
import { Dropbox } from 'dropbox'
import {
  cliente,
  concluirLogin,
  concluirLoginComCodigo,
  estadoLogin,
  iniciarLogin,
  iniciarLoginComCodigo,
  MSG_CODIGO_INVALIDO,
  sair,
} from './auth'
import { gravarToken, lerPendente, lerToken } from './tokenStore'
import { irPara } from './navegacao'

vi.mock('./navegacao', () => ({ irPara: vi.fn() }))

const APP_KEY = 'erkchv20ri1l2at'
const REDIRECT_PROD = 'https://silasklein.github.io/iconodb-app/'
const REDIRECT_DEV = 'http://localhost:5173/'

const TOKEN_OK = {
  access_token: 'acesso-novo',
  refresh_token: 'refresh-novo',
  expires_in: 14400,
  token_type: 'bearer',
  uid: 'u1',
}

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

/** Parâmetros de uma chamada ao Dropbox: a URL (query) e o corpo, juntos. */
function parametrosDaChamada(i = 0) {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit | undefined]
  const u = new URL(url)
  const params = new URLSearchParams(u.search)
  const corpo = init?.body
  if (typeof corpo === 'string') {
    try {
      for (const [k, v] of Object.entries(JSON.parse(corpo))) params.set(k, String(v))
    } catch {
      for (const [k, v] of new URLSearchParams(corpo)) params.set(k, v)
    }
  }
  return { url: u, params }
}

async function guardarDadosLocais() {
  // Simula o banco de dados do app (outro IndexedDB): o login não pode tocar nele.
  await new Promise<void>((ok, falha) => {
    const abrir = indexedDB.open('iconodb-dados-teste', 1)
    abrir.onupgradeneeded = () => abrir.result.createObjectStore('itens')
    abrir.onsuccess = () => {
      const tx = abrir.result.transaction('itens', 'readwrite')
      tx.objectStore('itens').put('sentinela', 'k')
      tx.oncomplete = () => {
        abrir.result.close()
        ok()
      }
      tx.onerror = () => falha(tx.error)
    }
  })
}

async function lerDadosLocais() {
  return new Promise<unknown>((ok, falha) => {
    const abrir = indexedDB.open('iconodb-dados-teste', 1)
    abrir.onsuccess = () => {
      const r = abrir.result.transaction('itens').objectStore('itens').get('k')
      r.onsuccess = () => {
        abrir.result.close()
        ok(r.result)
      }
      r.onerror = () => falha(r.error)
    }
    abrir.onerror = () => falha(abrir.error)
  })
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(irPara).mockReset()
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('iniciarLogin (PKCE com redirecionamento)', () => {
  it('em desenvolvimento usa a app key e o redirect de localhost, com PKCE e refresh token', async () => {
    await iniciarLogin()
    expect(irPara).toHaveBeenCalledTimes(1)
    const url = new URL(vi.mocked(irPara).mock.calls[0]![0])
    expect(url.origin + url.pathname).toBe('https://dropbox.com/oauth2/authorize')
    const p = url.searchParams
    expect(p.get('client_id')).toBe(APP_KEY)
    expect(p.get('redirect_uri')).toBe(REDIRECT_DEV)
    expect(p.get('response_type')).toBe('code')
    expect(p.get('token_access_type')).toBe('offline')
    expect(p.get('code_challenge_method')).toBe('S256')
    expect(p.get('code_challenge')).toBeTruthy()
    expect(p.get('state')).toBeTruthy()
    expect(p.has('client_secret')).toBe(false)
  })

  it('em produção usa o redirect do GitHub Pages', async () => {
    vi.stubEnv('PROD', true)
    await iniciarLogin()
    const url = new URL(vi.mocked(irPara).mock.calls[0]![0])
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_PROD)
  })

  it('guarda o code_verifier e o state no IndexedDB (sobrevivem ao redirecionamento)', async () => {
    await iniciarLogin()
    const url = new URL(vi.mocked(irPara).mock.calls[0]![0])
    const pendente = await lerPendente()
    expect(pendente?.modo).toBe('redirect')
    expect(pendente?.state).toBe(url.searchParams.get('state'))
    expect(pendente?.codeVerifier.length).toBeGreaterThanOrEqual(43)
  })
})

describe('concluirLogin', () => {
  async function comecar() {
    await iniciarLogin()
    const url = new URL(vi.mocked(irPara).mock.calls[0]![0])
    return { state: url.searchParams.get('state')!, verifier: (await lerPendente())!.codeVerifier }
  }

  it('troca o code pelo token com o mesmo code_verifier, sem segredo, e grava no IndexedDB', async () => {
    const { state, verifier } = await comecar()
    fetchMock.mockResolvedValueOnce(resposta(TOKEN_OK))
    const ok = await concluirLogin(`${REDIRECT_DEV}?code=COD123&state=${state}`)
    expect(ok).toBe(true)

    const { url, params } = parametrosDaChamada()
    expect(url.origin + url.pathname).toBe('https://api.dropboxapi.com/oauth2/token')
    expect(params.get('grant_type')).toBe('authorization_code')
    expect(params.get('code')).toBe('COD123')
    expect(params.get('client_id')).toBe(APP_KEY)
    expect(params.get('code_verifier')).toBe(verifier)
    expect(params.get('redirect_uri')).toBe(REDIRECT_DEV)
    expect(params.has('client_secret')).toBe(false)

    const token = await lerToken()
    expect(token?.refreshToken).toBe('refresh-novo')
    expect(token?.accessToken).toBe('acesso-novo')
    expect(token!.expiraEm).toBeGreaterThan(Date.now() + 3 * 3600 * 1000)
    expect(await estadoLogin()).toBe('ativo')
    expect(await lerPendente()).toBeNull()
  })

  it('recusa um state diferente, sem chamar a rede nem gravar token', async () => {
    await comecar()
    const ok = await concluirLogin(`${REDIRECT_DEV}?code=COD123&state=outro`)
    expect(ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await estadoLogin()).toBe('sem-login')
  })

  it('sem login pendente (retorno caiu em outro armazenamento) devolve false', async () => {
    const ok = await concluirLogin(`${REDIRECT_DEV}?code=COD123&state=qualquer`)
    expect(ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retorno com erro do Dropbox (acesso negado) devolve false', async () => {
    const { state } = await comecar()
    expect(await concluirLogin(`${REDIRECT_DEV}?error=access_denied&state=${state}`)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('se o Dropbox recusa a troca, devolve false e não grava token', async () => {
    const { state } = await comecar()
    fetchMock.mockResolvedValueOnce(resposta({ error: 'invalid_grant' }, 400))
    expect(await concluirLogin(`${REDIRECT_DEV}?code=X&state=${state}`)).toBe(false)
    expect(await estadoLogin()).toBe('sem-login')
  })
})

describe('login alternativo por código (Foco 6)', () => {
  it('iniciarLoginComCodigo devolve a URL de autorização sem redirect_uri e com token_access_type=offline', async () => {
    const url = new URL(await iniciarLoginComCodigo())
    expect(url.origin + url.pathname).toBe('https://dropbox.com/oauth2/authorize')
    const p = url.searchParams
    expect(p.get('client_id')).toBe(APP_KEY)
    expect(p.has('redirect_uri')).toBe(false)
    expect(p.get('response_type')).toBe('code')
    expect(p.get('token_access_type')).toBe('offline')
    expect(p.get('code_challenge_method')).toBe('S256')
    expect(p.get('code_challenge')).toBeTruthy()
    expect(irPara).not.toHaveBeenCalled()
    expect((await lerPendente())?.modo).toBe('codigo')
  })

  it('concluirLoginComCodigo troca o código pelo token (mesmo code_verifier, sem redirect_uri) e grava', async () => {
    await iniciarLoginComCodigo()
    const verifier = (await lerPendente())!.codeVerifier
    fetchMock.mockResolvedValueOnce(resposta(TOKEN_OK))
    expect(await concluirLoginComCodigo('abc')).toBe(true)

    const { url, params } = parametrosDaChamada()
    expect(url.origin + url.pathname).toBe('https://api.dropboxapi.com/oauth2/token')
    expect(params.get('grant_type')).toBe('authorization_code')
    expect(params.get('code')).toBe('abc')
    expect(params.get('client_id')).toBe(APP_KEY)
    expect(params.get('code_verifier')).toBe(verifier)
    expect(params.has('redirect_uri')).toBe(false)
    expect(params.has('client_secret')).toBe(false)

    expect((await lerToken())?.refreshToken).toBe('refresh-novo')
    expect(await estadoLogin()).toBe('ativo')
    expect(await lerPendente()).toBeNull()
  })

  it('ignora espaços em volta do código colado', async () => {
    await iniciarLoginComCodigo()
    fetchMock.mockResolvedValueOnce(resposta(TOKEN_OK))
    expect(await concluirLoginComCodigo('  abc \n')).toBe(true)
    expect(parametrosDaChamada().params.get('code')).toBe('abc')
  })

  it('código inválido devolve false e a mensagem combinada existe', async () => {
    await iniciarLoginComCodigo()
    fetchMock.mockResolvedValueOnce(resposta({ error: 'invalid_grant' }, 400))
    expect(await concluirLoginComCodigo('errado')).toBe(false)
    expect(await estadoLogin()).toBe('sem-login')
    expect(MSG_CODIGO_INVALIDO).toBe('Código não aceito pelo Dropbox; tente de novo')
  })

  it('depois de um código errado dá para tentar de novo com o código certo', async () => {
    await iniciarLoginComCodigo()
    fetchMock.mockResolvedValueOnce(resposta({ error: 'invalid_grant' }, 400))
    expect(await concluirLoginComCodigo('errado')).toBe(false)
    fetchMock.mockResolvedValueOnce(resposta(TOKEN_OK))
    expect(await concluirLoginComCodigo('certo')).toBe(true)
  })

  it('código vazio ou sem ter começado devolve false sem chamar a rede', async () => {
    expect(await concluirLoginComCodigo('abc')).toBe(false)
    await iniciarLoginComCodigo()
    expect(await concluirLoginComCodigo('   ')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('não aproveita um login pendente de redirecionamento', async () => {
    await iniciarLogin()
    expect(await concluirLoginComCodigo('abc')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('cliente() e estadoLogin()', () => {
  const agora = () => Date.now()

  it('sem token: estado "sem-login" e cliente null', async () => {
    expect(await estadoLogin()).toBe('sem-login')
    expect(await cliente()).toBeNull()
  })

  it('token válido: devolve um Dropbox sem chamar a rede', async () => {
    await gravarToken({ refreshToken: 'r', accessToken: 'a', expiraEm: agora() + 3600_000 })
    const c = await cliente()
    expect(c).toBeInstanceOf(Dropbox)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await estadoLogin()).toBe('ativo')
  })

  it('token expirado com refresh válido é renovado e o novo token é gravado', async () => {
    await gravarToken({ refreshToken: 'refresh-velho', accessToken: 'velho', expiraEm: agora() - 1000 })
    fetchMock.mockResolvedValueOnce(resposta({ access_token: 'acesso-renovado', expires_in: 14400, token_type: 'bearer' }))
    const c = await cliente()
    expect(c).toBeInstanceOf(Dropbox)

    const { url, params } = parametrosDaChamada()
    expect(url.origin + url.pathname).toBe('https://api.dropboxapi.com/oauth2/token')
    expect(params.get('grant_type')).toBe('refresh_token')
    expect(params.get('refresh_token')).toBe('refresh-velho')
    expect(params.get('client_id')).toBe(APP_KEY)
    expect(params.has('client_secret')).toBe(false)

    const t = await lerToken()
    expect(t?.accessToken).toBe('acesso-renovado')
    expect(t?.refreshToken).toBe('refresh-velho')
    expect(t!.expiraEm).toBeGreaterThan(agora() + 3 * 3600_000)
    expect(await estadoLogin()).toBe('ativo')
  })

  it('refresh revogado: cliente null, estado "expirado", dados locais intactos (Foco 3)', async () => {
    await guardarDadosLocais()
    await gravarToken({ refreshToken: 'revogado', accessToken: 'velho', expiraEm: agora() - 1000 })
    fetchMock.mockResolvedValueOnce(
      resposta({ error: 'invalid_grant', error_description: 'refresh token is invalid or revoked' }, 400),
    )
    expect(await cliente()).toBeNull()
    expect(await estadoLogin()).toBe('expirado')
    expect(await lerDadosLocais()).toBe('sentinela')

    // Já expirado: não insiste na rede.
    expect(await cliente()).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('401 na renovação também é token expirado', async () => {
    await gravarToken({ refreshToken: 'r', accessToken: 'a', expiraEm: agora() - 1000 })
    fetchMock.mockResolvedValueOnce(resposta({ error: 'invalid_access_token' }, 401))
    expect(await cliente()).toBeNull()
    expect(await estadoLogin()).toBe('expirado')
  })

  it('sem internet na renovação: o erro sobe e o login continua "ativo"', async () => {
    await gravarToken({ refreshToken: 'r', accessToken: 'a', expiraEm: agora() - 1000 })
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(cliente()).rejects.toThrow()
    expect(await estadoLogin()).toBe('ativo')
  })

  it('entrar de novo depois de expirado volta ao estado "ativo"', async () => {
    await gravarToken({ refreshToken: 'r', accessToken: 'a', expiraEm: agora() - 1000 })
    fetchMock.mockResolvedValueOnce(resposta({ error: 'invalid_grant' }, 400))
    await cliente()
    expect(await estadoLogin()).toBe('expirado')
    await iniciarLoginComCodigo()
    fetchMock.mockResolvedValueOnce(resposta(TOKEN_OK))
    expect(await concluirLoginComCodigo('abc')).toBe(true)
    expect(await estadoLogin()).toBe('ativo')
  })
})

describe('sair()', () => {
  it('limpa só o token: dados locais ficam', async () => {
    await guardarDadosLocais()
    await gravarToken({ refreshToken: 'r', accessToken: 'a', expiraEm: Date.now() + 3600_000 })
    await sair()
    expect(await estadoLogin()).toBe('sem-login')
    expect(await lerToken()).toBeNull()
    expect(await lerDadosLocais()).toBe('sentinela')
  })
})

describe('armazenamento e segredo', () => {
  it('nada vai para localStorage nem sessionStorage, e nenhuma chamada leva segredo', async () => {
    await iniciarLogin()
    const state = new URL(vi.mocked(irPara).mock.calls[0]![0]).searchParams.get('state')!
    fetchMock.mockResolvedValueOnce(resposta(TOKEN_OK))
    await concluirLogin(`${REDIRECT_DEV}?code=C&state=${state}`)
    await gravarToken({ refreshToken: 'r', accessToken: 'a', expiraEm: Date.now() - 1 })
    fetchMock.mockResolvedValueOnce(resposta({ access_token: 'n', expires_in: 14400 }))
    await cliente()
    await iniciarLoginComCodigo()

    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    for (const [url, init] of fetchMock.mock.calls as [string, RequestInit?][]) {
      expect(`${url} ${String(init?.body ?? '')}`).not.toMatch(/secret/i)
    }
  })
})
