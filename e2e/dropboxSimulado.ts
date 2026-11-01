/**
 * O Dropbox simulado dos testes e2e. Nada sai para a internet:
 * - a página de autorização (dropbox.com/oauth2/authorize) redireciona direto de volta ao app,
 *   com `?code=…&state=…` (o state vem da própria URL de autorização);
 * - o endpoint de token (api.dropboxapi.com/oauth2/token) devolve um token de teste;
 * - o download (content.dropboxapi.com/2/files/download) serve os arquivos do pacote sintético
 *   (tests/fixtures/pacote), com o cabeçalho `Dropbox-API-Result`.
 * Qualquer outro pedido a um servidor que não seja o local derruba o teste.
 */
import { readFileSync, statSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import type { BrowserContext, Route } from '@playwright/test'

const RAIZ_DO_PACOTE = join(import.meta.dirname, '..', 'tests', 'fixtures', 'pacote')
const CODIGO = 'codigo-de-teste'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-expose-headers': 'Dropbox-API-Result',
}

export interface DropboxSimulado {
  /** Caminhos baixados (um por pedido de download). */
  baixados: string[]
  /** Pedidos a servidores de fora que não são o Dropbox simulado (têm de ficar vazios). */
  proibidos: string[]
  /** Quantas vezes a página de autorização foi aberta. */
  autorizacoes: number
}

const ehLocal = (url: URL) => url.hostname === 'localhost' || url.hostname === '127.0.0.1'

function lerDoPacote(caminho: string): Buffer | null {
  const absoluto = normalize(join(RAIZ_DO_PACOTE, caminho))
  if (!absoluto.startsWith(RAIZ_DO_PACOTE + sep)) return null
  try {
    if (!statSync(absoluto).isFile()) return null
    return readFileSync(absoluto)
  } catch {
    return null
  }
}

async function responder(route: Route, estado: DropboxSimulado): Promise<void> {
  const pedido = route.request()
  const url = new URL(pedido.url())

  if (pedido.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })

  if ((url.hostname === 'www.dropbox.com' || url.hostname === 'dropbox.com') && url.pathname === '/oauth2/authorize') {
    estado.autorizacoes++
    // O app tem de pedir PKCE com o redirect registrado no Dropbox.
    const p = url.searchParams
    const ok = p.get('client_id') === 'erkchv20ri1l2at' && p.get('code_challenge_method') === 'S256' && p.get('redirect_uri') === 'https://silasklein.github.io/iconodb-app/'
    if (!ok) {
      estado.proibidos.push(`autorização com parâmetros errados: ${url.search}`)
      return route.fulfill({ status: 400, body: 'parâmetros errados' })
    }
    // Em vez de voltar a github.io, volta ao app servido localmente (a origem do teste).
    const volta = new URL(pedido.frame().url())
    volta.search = ''
    volta.hash = ''
    volta.searchParams.set('code', CODIGO)
    volta.searchParams.set('state', p.get('state') ?? '')
    return route.fulfill({ status: 302, headers: { location: volta.toString() }, body: '' })
  }

  if (url.hostname === 'api.dropboxapi.com' && url.pathname === '/oauth2/token') {
    return route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: 'acesso-de-teste', refresh_token: 'renovacao-de-teste', token_type: 'bearer', expires_in: 14400, scope: 'files.content.read' }),
    })
  }

  if (url.hostname === 'content.dropboxapi.com' && url.pathname === '/2/files/download') {
    const arg = JSON.parse(pedido.headers()['dropbox-api-arg'] ?? '{}') as { path?: string }
    const caminho = (arg.path ?? '').replace(/^\//, '')
    const bytes = lerDoPacote(caminho)
    if (!bytes) return route.fulfill({ status: 409, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ error_summary: 'path/not_found/..' }) })
    estado.baixados.push(caminho)
    return route.fulfill({
      status: 200,
      headers: {
        ...CORS,
        'content-type': 'application/octet-stream',
        'dropbox-api-result': JSON.stringify({ name: caminho.split('/').pop(), path_display: `/${caminho}`, size: bytes.length }),
      },
      body: bytes,
    })
  }

  estado.proibidos.push(`${pedido.method()} ${pedido.url()}`)
  return route.abort('blockedbyclient')
}

/** Liga o Dropbox simulado ao contexto e bloqueia (e registra) todo o resto que sair do computador. */
export async function ligarDropboxSimulado(context: BrowserContext): Promise<DropboxSimulado> {
  const estado: DropboxSimulado = { baixados: [], proibidos: [], autorizacoes: 0 }
  await context.route((url) => !ehLocal(url) && (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ws:' || url.protocol === 'wss:'), (route) => responder(route, estado))
  return estado
}
