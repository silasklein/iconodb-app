/**
 * A Fonte do pacote no Dropbox. Os arquivos ficam na raiz da pasta do app
 * (/nucleo/…, /imagens/…); o escopo "app folder" já resolve a raiz.
 *
 * O cliente é pedido a cada download (cliente() renova o token quando precisa),
 * porque a primeira sincronização pode durar mais que a vida de um access token.
 */
import { ErroDeLogin, ErroDeRede, type Fonte } from '../pacote/manifesto'
import { cliente, eErroDeAutenticacao, marcarExpirado } from './auth'

const TENTATIVAS = 4
/** O Dropbox pode pedir esperas longas no 429; esperar mais que isto trava a tela de progresso. */
const ESPERA_MAXIMA_S = 30

export interface OpcoesDaFonte {
  /** Espera entre tentativas (para os testes). */
  esperar?: (ms: number) => Promise<void>
}

const dormir = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms))

/** Falha de conexão (fetch), tempo esgotado, 429 (muitos pedidos) ou 5xx: vale tentar de novo. */
export function eErroDeRede(erro: unknown): boolean {
  if (erro instanceof ErroDeRede) return true
  if (typeof erro !== 'object' || erro === null) return false
  const { status, name } = erro as { status?: unknown; name?: unknown }
  if (typeof status === 'number') return status === 0 || status === 429 || status >= 500
  return erro instanceof TypeError || name === 'AbortError' || name === 'TimeoutError'
}

/** Segundos que o Dropbox pede para esperar no 429. */
function esperaPedida(erro: unknown): number | null {
  const interno = (erro as { error?: { error?: { retry_after?: unknown } } } | null)?.error?.error?.retry_after
  return typeof interno === 'number' && interno >= 0 ? Math.min(interno, ESPERA_MAXIMA_S) : null
}

const semInternet = () => typeof navigator !== 'undefined' && navigator.onLine === false

async function comTentativas<T>(fazer: () => Promise<T>, esperar: (ms: number) => Promise<void>): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    // O navegador já sabe que está sem rede: não adianta tentar nem esperar.
    if (semInternet()) throw new ErroDeRede()
    try {
      return await fazer()
    } catch (erro) {
      if (eErroDeAutenticacao(erro)) {
        await marcarExpirado().catch(() => undefined)
        throw new ErroDeLogin()
      }
      if (!eErroDeRede(erro)) throw erro
      if (tentativa >= TENTATIVAS || semInternet()) throw new ErroDeRede(erro)
      await esperar((esperaPedida(erro) ?? 2 ** (tentativa - 1)) * 1000)
    }
  }
}

async function clienteOuLogin() {
  const c = await cliente()
  if (!c) throw new ErroDeLogin()
  return c
}

/**
 * A Fonte do Dropbox; null se não há login (ou ele expirou). Se a renovação do token
 * falhar por falta de internet, o erro sobe (é "sem conexão", não "sem login").
 */
export async function fonteDropbox(opcoes: OpcoesDaFonte = {}): Promise<Fonte | null> {
  if (!(await cliente())) return null
  const esperar = opcoes.esperar ?? dormir
  return {
    async listar(prefixo = '') {
      const pasta = prefixo === '' ? '' : `/${prefixo.replace(/^\/+|\/+$/g, '')}`
      const caminhos: string[] = []
      await comTentativas(async () => {
        caminhos.length = 0
        const c = await clienteOuLogin()
        let r = await c.filesListFolder({ path: pasta, recursive: true })
        for (;;) {
          for (const e of r.result.entries) if (e['.tag'] === 'file' && e.path_display) caminhos.push(e.path_display.slice(1))
          if (!r.result.has_more) break
          r = await c.filesListFolderContinue({ cursor: r.result.cursor })
        }
      }, esperar)
      return caminhos.sort()
    },
    async baixar(caminho) {
      return comTentativas(async () => {
        const c = await clienteOuLogin()
        const r = await c.filesDownload({ path: `/${caminho}` })
        const blob = (r.result as unknown as { fileBlob: Blob }).fileBlob
        return blob.arrayBuffer()
      }, esperar)
    },
  }
}
