/**
 * O que a leitura (fonte.ts) e a escrita (escrita.ts) do Dropbox têm em comum: as repetições
 * em falha de rede e 429, a leitura dos erros do Dropbox e o cliente com prazo.
 * Um só lugar, para que os prazos e as repetições sejam os mesmos nas duas.
 */
import { ErroDeLogin, ErroDeRede } from '../pacote/manifesto'
import { cliente, eErroDeAutenticacao, marcarExpirado } from './auth'
import { eErroDeRede } from './rede'

const TENTATIVAS = 4
/** O Dropbox pode pedir esperas longas no 429; esperar mais que isto trava a tela de progresso. */
const ESPERA_MAXIMA_S = 30

export const dormir = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms))

/** O arquivo pedido não existe na pasta do app (Dropbox 409 path/not_found): o pacote não foi posto lá. */
export class ErroDePacoteAusente extends Error {
  constructor(readonly caminho: string) {
    super(`O arquivo ${caminho} não está na pasta do app no Dropbox`)
    this.name = 'ErroDePacoteAusente'
  }
}

/** O token não tem a permissão pedida (Dropbox 401 missing_scope): falta marcá-la no App Console. */
export class ErroDePermissao extends Error {
  constructor(readonly escopo: string | null) {
    super(`Falta a permissão ${escopo ?? ''} no App Console do Dropbox`.replace('  ', ' '))
    this.name = 'ErroDePermissao'
  }
}

/** O resumo do erro que o Dropbox devolve (ex.: "path/not_found/.."), ou null. */
export function resumoDoErro(erro: unknown): string | null {
  const corpo = (erro as { error?: unknown } | null)?.error
  if (typeof corpo === 'string') return corpo.slice(0, 200)
  const resumo = (corpo as { error_summary?: unknown } | null)?.error_summary
  return typeof resumo === 'string' ? resumo.slice(0, 200) : null
}

function escopoQueFalta(erro: unknown): string | null | undefined {
  if ((erro as { status?: unknown } | null)?.status !== 401) return undefined
  const corpo = (erro as { error?: { error?: { '.tag'?: unknown; required_scope?: unknown } } }).error
  const resumo = resumoDoErro(erro) ?? ''
  if (corpo?.error?.['.tag'] !== 'missing_scope' && !resumo.startsWith('missing_scope')) return undefined
  return typeof corpo?.error?.required_scope === 'string' ? corpo.error.required_scope : null
}

/** 409 path/not_found: o arquivo (ou a pasta) não existe. */
export function eNaoEncontrado(erro: unknown): boolean {
  return (erro as { status?: unknown } | null)?.status === 409 && /not_found/.test(resumoDoErro(erro) ?? '')
}

/** Segundos que o Dropbox pede para esperar no 429. */
function esperaPedida(erro: unknown): number | null {
  const interno = (erro as { error?: { error?: { retry_after?: unknown } } } | null)?.error?.error?.retry_after
  return typeof interno === 'number' && interno >= 0 ? Math.min(interno, ESPERA_MAXIMA_S) : null
}

const semInternet = () => typeof navigator !== 'undefined' && navigator.onLine === false

export interface OpcoesDeTentativa {
  /** Caminho pedido, para a mensagem de "ausente". */
  caminho?: string
  /** O erro para 409 not_found. Padrão: ErroDePacoteAusente (leitura do pacote). */
  aoNaoEncontrar?: (caminho: string) => Error
  /** O escopo assumido quando o Dropbox diz missing_scope sem nomeá-lo. */
  escopoPadrao?: string
}

export async function comTentativas<T>(
  fazer: () => Promise<T>,
  esperar: (ms: number) => Promise<void>,
  opcoes: OpcoesDeTentativa = {},
): Promise<T> {
  const caminho = opcoes.caminho ?? ''
  for (let tentativa = 1; ; tentativa++) {
    // O navegador já sabe que está sem rede: não adianta tentar nem esperar.
    if (semInternet()) throw new ErroDeRede()
    try {
      return await fazer()
    } catch (erro) {
      // Antes do 401 genérico: missing_scope não é login expirado (entrar de novo sem a permissão não resolve).
      const escopo = escopoQueFalta(erro)
      if (escopo !== undefined) throw new ErroDePermissao(escopo ?? opcoes.escopoPadrao ?? null)
      if (eNaoEncontrado(erro)) throw (opcoes.aoNaoEncontrar ?? ((c) => new ErroDePacoteAusente(c)))(caminho)
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

/** `prazoMs`: sem resposta (ou sem bytes novos) por esse tempo, a chamada falha como falha de rede. */
export async function clienteOuLogin(prazoMs: number) {
  const c = await cliente({ prazoMs })
  if (!c) throw new ErroDeLogin()
  return c
}
