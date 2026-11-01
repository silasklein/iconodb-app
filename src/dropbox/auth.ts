/**
 * Login no Dropbox por OAuth 2 com PKCE: sem App secret, só a app key.
 * Dois caminhos:
 * - iniciarLogin / concluirLoginDetalhado: redireciona para o Dropbox e volta ao app;
 * - iniciarLoginComCodigo / tentarLoginComCodigo: sem redirect_uri, o Dropbox
 *   mostra um código que o usuário cola no app (para o iPhone, onde o retorno
 *   pode cair no Safari, cujo armazenamento é separado do app instalado).
 *
 * Os tokens ficam no IndexedDB (tokenStore.ts), nunca no localStorage.
 */
import { Dropbox, DropboxAuth } from 'dropbox'
import { enderecoPublicado } from '../app/endereco'
import { irPara } from './navegacao'
import { fetchComPrazo, PRAZO_ARQUIVO_MS, PRAZO_CURTO_MS } from './prazo'
import { eErroDeRede } from './rede'
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
export const REDIRECT_DESENVOLVIMENTO = 'http://localhost:5173/'
export const MSG_CODIGO_INVALIDO = 'Código não aceito pelo Dropbox; tente de novo'
export const MSG_SEM_CONEXAO = 'Sem conexão com o Dropbox; tente de novo'
export const MSG_ACESSO_NEGADO = 'Acesso não autorizado no Dropbox'

/** O Dropbox renova o access token com folga: igual à margem do SDK (5 min). */
const MARGEM_MS = 300_000

export type EstadoLogin = 'sem-login' | 'ativo' | 'expirado'

/**
 * Em produção, o endereço publicado (VITE_ENDERECO ou o padrão, src/app/endereco.ts); ele tem de estar
 * nos Redirect URIs do app no Dropbox. Lido na hora da chamada (e não ao carregar o módulo) para os
 * testes poderem trocar o ambiente.
 */
export function redirectUri(): string {
  return import.meta.env.PROD ? enderecoPublicado(import.meta.env.VITE_ENDERECO) : REDIRECT_DESENVOLVIMENTO
}

/** Só para montar a URL de autorização (PKCE): o SDK gera o verifier e o challenge. */
function authParaAutorizar() {
  return new DropboxAuth({
    clientId: APP_KEY,
    fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
  } as ConstructorParameters<typeof DropboxAuth>[0])
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

const URL_DO_TOKEN = 'https://api.dropboxapi.com/oauth2/token'
const URL_DE_REVOGAR = 'https://api.dropboxapi.com/2/auth/token/revoke'

/** Uma resposta de erro do Dropbox, no formato do erro do SDK (`status`, `error`): eErroDeAutenticacao e eErroDeRede a leem. */
class ErroDoDropbox extends Error {
  readonly status: number
  readonly error: unknown
  constructor(status: number, corpo: unknown) {
    super(`O Dropbox respondeu ${status}.`)
    this.name = 'ErroDoDropbox'
    this.status = status
    this.error = corpo
  }
}

/**
 * POST no endpoint de token com os campos no CORPO (form-urlencoded). O SDK do Dropbox põe o
 * code, o code_verifier e o refresh_token na query string, que fica em logs de proxy e no
 * histórico de rede: por isso a troca e a renovação são feitas aqui, não pelo SDK.
 */
async function pedirToken(campos: Record<string, string>): Promise<RespostaDeToken> {
  const res = await globalThis.fetch(URL_DO_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(campos).toString(),
    signal: AbortSignal.timeout(PRAZO_CURTO_MS),
  })
  let corpo: unknown = null
  try {
    corpo = await res.json()
  } catch {
    corpo = null
  }
  if (!res.ok) throw new ErroDoDropbox(res.status, corpo)
  const r = corpo as Partial<RespostaDeToken> | null
  if (!r || typeof r.access_token !== 'string' || typeof r.expires_in !== 'number') throw new Error('Resposta do Dropbox sem access token')
  return r as RespostaDeToken
}

/** Troca o código (single-use) pelo token. `redirect` fica de fora no login por código. */
async function trocarCodigo(codeVerifier: string, redirect: string | undefined, codigo: string): Promise<Token> {
  const r = await pedirToken({
    grant_type: 'authorization_code',
    code: codigo,
    client_id: APP_KEY,
    code_verifier: codeVerifier,
    ...(redirect ? { redirect_uri: redirect } : {}),
  })
  if (!r.refresh_token) throw new Error('Resposta do Dropbox sem refresh token')
  return {
    refreshToken: r.refresh_token,
    accessToken: r.access_token,
    expiraEm: Date.now() + r.expires_in * 1000,
    expirado: false,
  }
}

/** Renova o access token pelo refresh token (campos no corpo). */
async function renovar(token: Token): Promise<Token> {
  const r = await pedirToken({ grant_type: 'refresh_token', refresh_token: token.refreshToken, client_id: APP_KEY })
  return { ...token, accessToken: r.access_token, expiraEm: Date.now() + r.expires_in * 1000 }
}

/** PKCE com redirecionamento: guarda verifier e state e vai para o Dropbox. */
export async function iniciarLogin(): Promise<void> {
  const auth = authParaAutorizar()
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

/** Troca o code do retorno; em falha de conexão guarda o code no pendente para repetir. */
async function trocarDoRetorno(pendente: LoginPendente, code: string): Promise<ResultadoLogin> {
  let token: Token
  try {
    token = await trocarCodigo(pendente.codeVerifier, redirectUri(), code)
  } catch (erro) {
    if (eErroDeRede(erro)) {
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
    // Um retorno com erro só encerra o login se o state confere; senão é ignorado (o login segue pendente).
    if (params.get('state') !== pendente.state) return 'sem-pendente'
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

/** Repete a troca guardada depois de uma falha de conexão no retorno do Dropbox. */
export async function repetirTrocaPendente(): Promise<ResultadoLogin> {
  const pendente = await lerPendente()
  if (!pendente || pendente.modo !== 'redirect' || !pendente.codigoRecebido) return 'sem-pendente'
  return trocarDoRetorno(pendente, pendente.codigoRecebido)
}

/** Login alternativo: devolve a URL de autorização (sem redirect_uri) para abrir em outra janela. */
export async function iniciarLoginComCodigo(): Promise<string> {
  const auth = authParaAutorizar()
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
    token = await trocarCodigo(pendente.codeVerifier, undefined, limpo)
  } catch (erro) {
    return eErroDeRede(erro) ? 'sem-conexao' : 'recusado'
  }
  await gravarToken(token)
  await limparPendente()
  return 'ok'
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
 *
 * O SDK recebe só o access token (sem o refresh token): assim a renovação automática
 * dele, que manda o refresh token na query string, nunca roda. Como cliente() é pedido
 * a cada chamada e renova com 5 min de folga, o token nunca vence no meio de uma.
 * `prazoMs`: cada chamada do SDK falha com TimeoutError depois desse tempo sem resposta
 * ou sem bytes novos (prazo.ts).
 */
export async function cliente(opcoes: { prazoMs?: number } = {}): Promise<Dropbox | null> {
  let token = await lerToken()
  if (!token || token.expirado) return null

  if (token.expiraEm - MARGEM_MS <= Date.now()) {
    try {
      token = await renovar(token)
    } catch (erro) {
      if (eErroDeAutenticacao(erro)) {
        await marcarExpirado()
        return null
      }
      throw erro
    }
    await gravarToken(token)
  }
  const auth = new DropboxAuth({
    clientId: APP_KEY,
    accessToken: token.accessToken,
    accessTokenExpiresAt: new Date(token.expiraEm),
    fetch: fetchComPrazo(opcoes.prazoMs ?? PRAZO_ARQUIVO_MS),
  } as ConstructorParameters<typeof DropboxAuth>[0])
  return new Dropbox({ auth })
}

/**
 * Sai: revoga o token no Dropbox (melhor esforço: sem rede ou com recusa, sai do mesmo jeito)
 * e limpa só o token e o login pendente. Os dados do app ficam.
 */
export async function sair(): Promise<void> {
  try {
    let token = await lerToken()
    if (token && !token.expirado) {
      // Revogar com um access token vencido não adianta: renova antes (o refresh token cai junto).
      if (token.expiraEm - MARGEM_MS <= Date.now()) token = await renovar(token)
      await globalThis.fetch(URL_DE_REVOGAR, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.accessToken}` },
        signal: AbortSignal.timeout(PRAZO_CURTO_MS),
      })
    }
  } catch {
    /* melhor esforço */
  }
  await limparToken()
  await limparPendente()
}
