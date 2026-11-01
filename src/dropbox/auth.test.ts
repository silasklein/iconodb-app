import { IDBFactory } from 'fake-indexeddb'
import { Dropbox } from 'dropbox'
import {
  cliente,
  concluirLoginDetalhado,
  estadoLogin,
  iniciarLogin,
  iniciarLoginComCodigo,
  MSG_ACESSO_NEGADO,
  MSG_CODIGO_INVALIDO,
  MSG_SEM_CONEXAO,
  repetirTrocaPendente,
  sair,
  tentarLoginComCodigo,
} from './auth'
import { gravarToken, lerPendente, lerToken } from './tokenStore'
import { irPara } from './navegacao'

vi.mock('./navegacao', () => ({ irPara: vi.fn() }))

/** Só o sim ou não de cada caminho de login (os resultados detalhados têm testes próprios). */
const concluirLogin = async (url: string) => (await concluirLoginDetalhado(url)) === 'ok'
const concluirLoginComCodigo = async (codigo: string) => (await tentarLoginComCodigo(codigo)) === 'ok'

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

  it('em produção usa o redirect do GitHub Pages (o endereço padrão)', async () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_ENDERECO', '')
    await iniciarLogin()
    const url = new URL(vi.mocked(irPara).mock.calls[0]![0])
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_PROD)
  })

  it('em produção com VITE_ENDERECO (domínio próprio), o redirect é esse endereço', async () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_ENDERECO', 'https://icono.silasklein.com')
    await iniciarLogin()
    const url = new URL(vi.mocked(irPara).mock.calls[0]![0])
    expect(url.searchParams.get('redirect_uri')).toBe('https://icono.silasklein.com/')
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

describe('rede fora do ar x recusa do Dropbox (R6, itens 3 e 4)', () => {
  const FALHA_DE_REDE = () => new TypeError('Failed to fetch')

  async function comecar() {
    await iniciarLogin()
    return new URL(vi.mocked(irPara).mock.calls[0]![0]).searchParams.get('state')!
  }

  it('mensagens combinadas', () => {
    expect(MSG_SEM_CONEXAO).toBe('Sem conexão com o Dropbox; tente de novo')
    expect(MSG_ACESSO_NEGADO).toBe('Acesso não autorizado no Dropbox')
  })

  it('retorno: falha de rede na troca devolve "sem-conexao" e MANTÉM o login pendente', async () => {
    const state = await comecar()
    fetchMock.mockRejectedValueOnce(FALHA_DE_REDE())
    expect(await concluirLoginDetalhado(`${REDIRECT_DEV}?code=COD&state=${state}`)).toBe('sem-conexao')
    expect(await lerPendente()).not.toBeNull()
    expect(await estadoLogin()).toBe('sem-login')
  })

  it('retorno: erro 5xx do Dropbox também é "sem-conexao" e mantém o pendente', async () => {
    const state = await comecar()
    fetchMock.mockResolvedValueOnce(resposta({ error: 'server_error' }, 503))
    expect(await concluirLoginDetalhado(`${REDIRECT_DEV}?code=COD&state=${state}`)).toBe('sem-conexao')
    expect(await lerPendente()).not.toBeNull()
  })

  it('retorno: depois da falha de rede, repetirTrocaPendente conclui com o código guardado', async () => {
    const state = await comecar()
    const verifier = (await lerPendente())!.codeVerifier
    fetchMock.mockRejectedValueOnce(FALHA_DE_REDE())
    await concluirLoginDetalhado(`${REDIRECT_DEV}?code=COD&state=${state}`)

    fetchMock.mockResolvedValueOnce(resposta(TOKEN_OK))
    expect(await repetirTrocaPendente()).toBe('ok')
    const { params } = parametrosDaChamada(1)
    expect(params.get('code')).toBe('COD')
    expect(params.get('code_verifier')).toBe(verifier)
    expect(params.get('redirect_uri')).toBe(REDIRECT_DEV)
    expect(await estadoLogin()).toBe('ativo')
    expect(await lerPendente()).toBeNull()
  })

  it('repetirTrocaPendente: sem rede de novo mantém o pendente; sem código guardado devolve "sem-pendente"', async () => {
    expect(await repetirTrocaPendente()).toBe('sem-pendente')
    const state = await comecar()
    expect(await repetirTrocaPendente()).toBe('sem-pendente') // ainda não voltou do Dropbox
    fetchMock.mockRejectedValueOnce(FALHA_DE_REDE())
    await concluirLoginDetalhado(`${REDIRECT_DEV}?code=COD&state=${state}`)
    fetchMock.mockRejectedValueOnce(FALHA_DE_REDE())
    expect(await repetirTrocaPendente()).toBe('sem-conexao')
    expect(await lerPendente()).not.toBeNull()
  })

  it('retorno: troca recusada pelo Dropbox devolve "recusado" e limpa o pendente', async () => {
    const state = await comecar()
    fetchMock.mockResolvedValueOnce(resposta({ error: 'invalid_grant' }, 400))
    expect(await concluirLoginDetalhado(`${REDIRECT_DEV}?code=COD&state=${state}`)).toBe('recusado')
    expect(await lerPendente()).toBeNull()
  })

  it('retorno com error=access_denied devolve "acesso-negado" e limpa o pendente', async () => {
    const state = await comecar()
    expect(await concluirLoginDetalhado(`${REDIRECT_DEV}?error=access_denied&state=${state}`)).toBe('acesso-negado')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await lerPendente()).toBeNull()
  })

  it('retorno sem pendente, ou com state diferente, devolve "sem-pendente"', async () => {
    expect(await concluirLoginDetalhado(`${REDIRECT_DEV}?code=C&state=x`)).toBe('sem-pendente')
    await comecar()
    expect(await concluirLoginDetalhado(`${REDIRECT_DEV}?code=C&state=outro`)).toBe('sem-pendente')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('código colado: falha de rede devolve "sem-conexao", mantém o pendente e dá para tentar de novo', async () => {
    await iniciarLoginComCodigo()
    fetchMock.mockRejectedValueOnce(FALHA_DE_REDE())
    expect(await tentarLoginComCodigo('abc')).toBe('sem-conexao')
    expect(await concluirLoginComCodigo('abc')).toBe(false)
    expect((await lerPendente())?.modo).toBe('codigo')
    fetchMock.mockResolvedValueOnce(resposta(TOKEN_OK))
    expect(await tentarLoginComCodigo('abc')).toBe('ok')
  })

  it('código colado: o Dropbox recusar (400) é "recusado"; vazio é "recusado" sem rede; sem início é "sem-pendente"', async () => {
    expect(await tentarLoginComCodigo('abc')).toBe('sem-pendente')
    await iniciarLoginComCodigo()
    fetchMock.mockResolvedValueOnce(resposta({ error: 'invalid_grant' }, 400))
    expect(await tentarLoginComCodigo('errado')).toBe('recusado')
    expect(await tentarLoginComCodigo('  ')).toBe('recusado')
    expect(fetchMock).toHaveBeenCalledTimes(1)
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

describe('segredos no corpo, nunca na URL (B1)', () => {
  /** A URL e o corpo de uma chamada, separados. */
  function chamada(i = 0) {
    const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit | undefined]
    const headers = new Headers(init?.headers)
    return { url: new URL(url), metodo: init?.method, tipo: headers.get('content-type'), corpo: new URLSearchParams(String(init?.body ?? '')) }
  }

  it('troca do código do retorno: POST form-urlencoded, sem query; code, verifier e redirect no corpo', async () => {
    await iniciarLogin()
    const state = new URL(vi.mocked(irPara).mock.calls[0]![0]).searchParams.get('state')!
    const verifier = (await lerPendente())!.codeVerifier
    fetchMock.mockResolvedValueOnce(resposta(TOKEN_OK))
    expect(await concluirLoginDetalhado(`${REDIRECT_DEV}?code=C%2B1&state=${state}`)).toBe('ok')
    const { url, metodo, tipo, corpo } = chamada()
    expect(url.href).toBe('https://api.dropboxapi.com/oauth2/token')
    expect(url.search).toBe('')
    expect(metodo).toBe('POST')
    expect(tipo).toBe('application/x-www-form-urlencoded')
    expect(Object.fromEntries(corpo)).toEqual({
      grant_type: 'authorization_code',
      code: 'C+1',
      client_id: APP_KEY,
      code_verifier: verifier,
      redirect_uri: REDIRECT_DEV,
    })
  })

  it('código colado: no corpo, sem redirect_uri, com caracteres especiais intactos', async () => {
    await iniciarLoginComCodigo()
    fetchMock.mockResolvedValueOnce(resposta(TOKEN_OK))
    expect(await tentarLoginComCodigo(' a&b=c+d ')).toBe('ok')
    const { url, corpo } = chamada()
    expect(url.search).toBe('')
    expect(corpo.get('code')).toBe('a&b=c+d')
    expect(corpo.has('redirect_uri')).toBe(false)
  })

  it('renovação: refresh_token no corpo, sem query', async () => {
    await gravarToken({ refreshToken: 'r/+=', accessToken: 'a', expiraEm: Date.now() - 1000 })
    fetchMock.mockResolvedValueOnce(resposta({ access_token: 'novo', expires_in: 14400 }))
    await cliente()
    const { url, metodo, tipo, corpo } = chamada()
    expect(url.search).toBe('')
    expect(metodo).toBe('POST')
    expect(tipo).toBe('application/x-www-form-urlencoded')
    expect(Object.fromEntries(corpo)).toEqual({ grant_type: 'refresh_token', refresh_token: 'r/+=', client_id: APP_KEY })
  })

  it('o SDK não guarda o refresh token: a renovação automática dele (com query) nunca roda', async () => {
    await gravarToken({ refreshToken: 'r', accessToken: 'a', expiraEm: Date.now() + 3600_000 })
    const c = (await cliente())!
    const auth = (c as unknown as { auth: { getRefreshToken(): string | undefined; checkAndRefreshAccessToken(): Promise<void> } }).auth
    expect(auth.getRefreshToken()).toBeFalsy()
    const agora = Date.now()
    const relogio = vi.spyOn(Date, 'now').mockReturnValue(agora + 2 * 3600_000)
    try {
      await auth.checkAndRefreshAccessToken()
    } finally {
      relogio.mockRestore()
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('retorno com erro e state (B2)', () => {
  it('error= com state diferente é ignorado: o login pendente fica', async () => {
    await iniciarLogin()
    expect(await concluirLoginDetalhado(`${REDIRECT_DEV}?error=access_denied&state=outro`)).toBe('sem-pendente')
    expect((await lerPendente())?.modo).toBe('redirect')
  })

  it('error= sem state também é ignorado', async () => {
    await iniciarLogin()
    expect(await concluirLoginDetalhado(`${REDIRECT_DEV}?error=access_denied`)).toBe('sem-pendente')
    expect(await lerPendente()).not.toBeNull()
  })
})

describe('sair() revoga o token no Dropbox (B3)', () => {
  it('POST em /2/auth/token/revoke com o access token, depois limpa', async () => {
    await gravarToken({ refreshToken: 'r', accessToken: 'a', expiraEm: Date.now() + 3600_000 })
    fetchMock.mockResolvedValueOnce(new Response('null', { status: 200 }))
    await sair()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.dropboxapi.com/2/auth/token/revoke')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer a')
    expect(await lerToken()).toBeNull()
  })

  it('access token vencido: renova primeiro e revoga com o novo', async () => {
    await gravarToken({ refreshToken: 'r', accessToken: 'velho', expiraEm: Date.now() - 1000 })
    fetchMock.mockResolvedValueOnce(resposta({ access_token: 'novo', expires_in: 14400 }))
    fetchMock.mockResolvedValueOnce(new Response('null', { status: 200 }))
    await sair()
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('https://api.dropboxapi.com/2/auth/token/revoke')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer novo')
    expect(await lerToken()).toBeNull()
  })

  it('sem rede (ou o Dropbox recusa) sai do mesmo jeito', async () => {
    await gravarToken({ refreshToken: 'r', accessToken: 'a', expiraEm: Date.now() + 3600_000 })
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await sair()
    expect(await lerToken()).toBeNull()
    await gravarToken({ refreshToken: 'r', accessToken: 'a', expiraEm: Date.now() + 3600_000 })
    fetchMock.mockResolvedValueOnce(resposta({ error: 'invalid_access_token' }, 401))
    await sair()
    expect(await lerToken()).toBeNull()
  })

  it('sem token, ou com login expirado, não chama a rede', async () => {
    await sair()
    await gravarToken({ refreshToken: 'r', accessToken: 'a', expiraEm: Date.now() - 1000, expirado: true })
    await sair()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await lerToken()).toBeNull()
  })
})

describe('prazo nas chamadas ao Dropbox (B7)', () => {
  it('o cliente aborta com TimeoutError quando o Dropbox não responde no prazo', async () => {
    await gravarToken({ refreshToken: 'r', accessToken: 'a', expiraEm: Date.now() + 3600_000 })
    fetchMock.mockImplementation(
      (_u: string, init?: RequestInit) =>
        new Promise((_ok, falha) => init?.signal?.addEventListener('abort', () => falha(init.signal!.reason))),
    )
    const c = (await cliente({ prazoMs: 30 }))!
    const erro = await c.filesListFolder({ path: '' }).catch((e: unknown) => e)
    expect((erro as Error).name).toBe('TimeoutError')
  })

  it('a troca de token também tem prazo (sem resposta = sem conexão)', async () => {
    await iniciarLoginComCodigo()
    fetchMock.mockImplementation((_u: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return Promise.reject(new DOMException('tempo esgotado', 'TimeoutError'))
    })
    expect(await tentarLoginComCodigo('abc')).toBe('sem-conexao')
  })
})
