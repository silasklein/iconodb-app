/**
 * Login no Dropbox por OAuth 2 com PKCE: sem App secret, só a app key.
 * Dois caminhos:
 * - iniciarLogin / concluirLogin: redireciona para o Dropbox e volta ao app;
 * - iniciarLoginComCodigo / concluirLoginComCodigo: sem redirect_uri, o Dropbox
 *   mostra um código que o usuário cola no app (para o iPhone, onde o retorno
 *   pode cair no Safari, cujo armazenamento é separado do app instalado).
 *
 * Os tokens ficam no IndexedDB (tokenStore.ts), nunca no localStorage.
 */
import { Dropbox, DropboxAuth } from 'dropbox'
import { irPara } from './navegacao'
import {
  gravarPendente,
  gravarToken,
  lerPendente,
  lerToken,
  limparPendente,
  limparToken,
  type LoginPendente,
  type Token,
} from './tokenStore'

/** Pública por natureza no PKCE. O App secret nunca entra neste código. */
export const APP_KEY = 'erkchv20ri1l2at'
export const REDIRECT_PRODUCAO = 'https://silasklein.github.io/iconodb-app/'
export const REDIRECT_DESENVOLVIMENTO = 'http://localhost:5173/'
export const MSG_CODIGO_INVALIDO = 'Código não aceito pelo Dropbox; tente de novo'
export const MSG_SEM_CONEXAO = 'Sem conexão com o Dropbox; tente de novo'
export const MSG_ACESSO_NEGADO = 'Acesso não autorizado no Dropbox'

/** O Dropbox renova o access token com folga: igual à margem do SDK (5 min). */
const MARGEM_MS = 300_000

export type EstadoLogin = 'sem-login' | 'ativo' | 'expirado'

/** Lido na hora da chamada (e não ao carregar o módulo) para os testes poderem trocar o ambiente. */
export function redirectUri(): string {
  return import.meta.env.PROD ? REDIRECT_PRODUCAO : REDIRECT_DESENVOLVIMENTO
}

function novoAuth(extra: { codeVerifier?: string; refreshToken?: string; accessToken?: string; expiraEm?: number } = {}) {
  const auth = new DropboxAuth({
    clientId: APP_KEY,
    // Resolve o fetch na hora da chamada.
    fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
    accessToken: extra.accessToken,
    refreshToken: extra.refreshToken,
    accessTokenExpiresAt: extra.expiraEm === undefined ? undefined : new Date(extra.expiraEm),
  } as ConstructorParameters<typeof DropboxAuth>[0])
  if (extra.codeVerifier) auth.setCodeVerifier(extra.codeVerifier)
  return auth
}

function gerarState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

interface RespostaDeToken {
  access_token: string
  refresh_token?: string
  expires_in: number
}

/** Troca o código (single-use) pelo token. `redirect` fica de fora no login por código. */
async function trocarCodigo(auth: DropboxAuth, redirect: string | undefined, codigo: string): Promise<Token> {
  // O SDK monta a query sem codificar: codificamos o código colado.
  const res = await auth.getAccessTokenFromCode(redirect as string, encodeURIComponent(codigo))
  const r = res.result as RespostaDeToken
  if (!r.access_token || !r.refresh_token) throw new Error('Resposta do Dropbox sem refresh token')
  return {
    refreshToken: r.refresh_token,
    accessToken: r.access_token,
    expiraEm: Date.now() + r.expires_in * 1000,
    expirado: false,
  }
}

/** PKCE com redirecionamento: guarda verifier e state e vai para o Dropbox. */
export async function iniciarLogin(): Promise<void> {
  const auth = novoAuth()
  const state = gerarState()
  const url = await auth.getAuthenticationUrl(redirectUri(), state, 'code', 'offline', undefined, 'none', true)
  await gravarPendente({ modo: 'redirect', codeVerifier: auth.getCodeVerifier(), state })
  irPara(url)
}

/**
 * Resultado de uma tentativa de login:
 * - ok: token gravado;
 * - recusado: o Dropbox recusou a troca (código errado, usado ou vencido);
 * - sem-conexao: a rede falhou (ou o Dropbox está fora do ar): vale tentar de novo;
 * - acesso-negado: o usuário não autorizou o app no Dropbox;
 * - sem-pendente: não há login em andamento neste armazenamento (o retorno caiu em
 *   outro lugar) ou o state não confere.
 */
export type ResultadoLogin = 'ok' | 'recusado' | 'sem-conexao' | 'acesso-negado' | 'sem-pendente'

/**
 * A troca não chegou a ser julgada pelo Dropbox? Falha do fetch (TypeError),
 * tempo esgotado, 429 ou 5xx. Qualquer 4xx é recusa do Dropbox.
 */
function eFalhaDeConexao(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false
  const { status, name } = erro as { status?: unknown; name?: unknown }
  if (typeof status === 'number') return status === 429 || status >= 500
  return erro instanceof TypeError || name === 'AbortError' || name === 'TimeoutError'
}

/** Troca o code do retorno; em falha de conexão guarda o code no pendente para repetir. */
async function trocarDoRetorno(pendente: LoginPendente, code: string): Promise<ResultadoLogin> {
  let token: Token
  try {
    token = await trocarCodigo(novoAuth({ codeVerifier: pendente.codeVerifier }), redirectUri(), code)
  } catch (erro) {
    if (eFalhaDeConexao(erro)) {
      await gravarPendente({ ...pendente, codigoRecebido: code })
      return 'sem-conexao'
    }
    await limparPendente()
    return 'recusado'
  }
  await gravarToken(token)
  await limparPendente()
  return 'ok'
}

/**
 * Conclui o login na volta do Dropbox (`?code=…&state=…`) e diz o que aconteceu.
 * Falha de rede mantém o login pendente (com o code recebido) para tentar de novo.
 */
export async function concluirLoginDetalhado(url: string): Promise<ResultadoLogin> {
  let params: URLSearchParams
  try {
    params = new URL(url).searchParams
  } catch {
    return 'sem-pendente'
  }
  const pendente = await lerPendente()
  if (!pendente || pendente.modo !== 'redirect') return 'sem-pendente'

  const erro = params.get('error')
  if (erro) {
    await limparPendente()
    return erro === 'access_denied' ? 'acesso-negado' : 'recusado'
  }
  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state || state !== pendente.state) {
    await limparPendente()
    return 'sem-pendente'
  }
  return trocarDoRetorno(pendente, code)
}

/** Como concluirLoginDetalhado, só com o sim ou não. */
export async function concluirLogin(url: string): Promise<boolean> {
  return (await concluirLoginDetalhado(url)) === 'ok'
}

/** Repete a troca guardada depois de uma falha de conexão no retorno do Dropbox. */
export async function repetirTrocaPendente(): Promise<ResultadoLogin> {
  const pendente = await lerPendente()
  if (!pendente || pendente.modo !== 'redirect' || !pendente.codigoRecebido) return 'sem-pendente'
  return trocarDoRetorno(pendente, pendente.codigoRecebido)
}

/** Login alternativo: devolve a URL de autorização (sem redirect_uri) para abrir em outra janela. */
export async function iniciarLoginComCodigo(): Promise<string> {
  const auth = novoAuth()
  const url = await auth.getAuthenticationUrl(undefined as unknown as string, undefined, 'code', 'offline', undefined, 'none', true)
  await gravarPendente({ modo: 'codigo', codeVerifier: auth.getCodeVerifier() })
  return url
}

/**
 * Troca o código colado pelo token, com o mesmo code_verifier e sem redirect_uri.
 * Nem código errado nem falha de rede gastam o login pendente: dá para tentar de novo.
 */
export async function tentarLoginComCodigo(codigo: string): Promise<ResultadoLogin> {
  const limpo = codigo.trim()
  if (!limpo) return 'recusado'
  const pendente = await lerPendente()
  if (!pendente || pendente.modo !== 'codigo') return 'sem-pendente'

  let token: Token
  try {
    token = await trocarCodigo(novoAuth({ codeVerifier: pendente.codeVerifier }), undefined, limpo)
  } catch (erro) {
    return eFalhaDeConexao(erro) ? 'sem-conexao' : 'recusado'
  }
  await gravarToken(token)
  await limparPendente()
  return 'ok'
}

/** Como tentarLoginComCodigo, só com o sim ou não. */
export async function concluirLoginComCodigo(codigo: string): Promise<boolean> {
  return (await tentarLoginComCodigo(codigo)) === 'ok'
}

/** O Dropbox recusou as credenciais (refresh token revogado ou token inválido)? */
export function eErroDeAutenticacao(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false
  const { status, error } = erro as { status?: unknown; error?: unknown }
  if (status === 401) return true
  const motivo = typeof error === 'object' && error !== null ? (error as { error?: unknown }).error : error
  return status === 400 && motivo === 'invalid_grant'
}

/** Marca o login como expirado. Não apaga nada: só o token fica sinalizado. */
export async function marcarExpirado(): Promise<void> {
  const token = await lerToken()
  if (token) await gravarToken({ ...token, expirado: true })
}

export async function estadoLogin(): Promise<EstadoLogin> {
  try {
    const token = await lerToken()
    if (!token) return 'sem-login'
    return token.expirado ? 'expirado' : 'ativo'
  } catch {
    return 'sem-login'
  }
}

/**
 * Cliente do Dropbox com o access token em dia (renovado pelo refresh token e
 * regravado). Devolve null sem login ou com login expirado/revogado, sem apagar
 * dados locais. Se a renovação falhar por outro motivo (sem internet), o erro sobe
 * e o login continua "ativo".
 */
export async function cliente(): Promise<Dropbox | null> {
  const token = await lerToken()
  if (!token || token.expirado) return null

  const auth = novoAuth(token)
  if (token.expiraEm - MARGEM_MS <= Date.now()) {
    try {
      await auth.refreshAccessToken()
    } catch (erro) {
      if (eErroDeAutenticacao(erro)) {
        await marcarExpirado()
        return null
      }
      throw erro
    }
    await gravarToken({
      ...token,
      accessToken: auth.getAccessToken(),
      expiraEm: auth.getAccessTokenExpiresAt().getTime(),
    })
  }
  return new Dropbox({ auth })
}

/** Sai: limpa só o token e o login pendente. Os dados do app ficam. */
export async function sair(): Promise<void> {
  await limparToken()
  await limparPendente()
}
