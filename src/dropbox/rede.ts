/**
 * A falha foi da rede (vale tentar de novo) ou uma resposta de verdade do Dropbox?
 * Um só critério para o login (auth.ts), os downloads (fonte.ts) e a tela de preparo.
 */
import { ErroDeRede } from '../pacote/manifesto'

/** Falha de conexão (fetch), tempo esgotado, 429 (muitos pedidos) ou 5xx: vale tentar de novo. Qualquer outro 4xx é resposta. */
export function eErroDeRede(erro: unknown): boolean {
  if (erro instanceof ErroDeRede) return true
  if (typeof erro !== 'object' || erro === null) return false
  const { status, name } = erro as { status?: unknown; name?: unknown }
  if (typeof status === 'number') return status === 0 || status === 429 || status >= 500
  return erro instanceof TypeError || name === 'AbortError' || name === 'TimeoutError'
}
