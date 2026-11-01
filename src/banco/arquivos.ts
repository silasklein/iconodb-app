/**
 * Quais arquivos do manifesto viram esquemas do banco. Puro (sem sqlite-wasm): também serve à
 * conferência do pacote antes da troca (src/pacote/manifesto.ts), no thread principal.
 */
import type { Manifesto } from '../pacote/manifesto'
import type { PublicacaoAberta } from './protocolo'

export const ESQUEMA_DA_BUSCA = 'busca'

/** `pub_<SIGLA>`. A sigla entra no SQL como identificador: só letras, dígitos e `_`. */
export function esquemaDaPublicacao(sigla: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(sigla)) throw new Error(`Sigla de publicação inválida no pacote: ${sigla}`)
  return `pub_${sigla}`
}

/** Um arquivo do núcleo que vira um esquema do banco. */
export interface ArquivoDoBanco {
  /** Caminho no pacote ("nucleo/comum.sqlite"). */
  caminho: string
  /** Nome no pool ("/comum.sqlite"). */
  nome: string
  sha256: string
  bytes: number
  esquema: string
}

/** Os arquivos do banco no manifesto: comum (main), um por publicação e a busca. */
export function arquivosDoBanco(manifesto: Manifesto): { arquivos: ArquivoDoBanco[]; publicacoes: PublicacaoAberta[] } {
  const arquivo = (caminho: string, esquema: string): ArquivoDoBanco | null => {
    const a = manifesto.arquivos[caminho]
    return a ? { caminho, nome: `/${caminho.slice(caminho.lastIndexOf('/') + 1)}`, sha256: a.sha256, bytes: a.bytes, esquema } : null
  }
  const comum = arquivo('nucleo/comum.sqlite', 'main')
  if (!comum) throw new Error('O pacote não tem nucleo/comum.sqlite.')
  const arquivos = [comum]
  const publicacoes: PublicacaoAberta[] = []
  for (const { sigla } of manifesto.publicacoes) {
    const esquema = esquemaDaPublicacao(sigla)
    const pub = arquivo(`nucleo/pub-${sigla}.sqlite`, esquema)
    if (!pub || publicacoes.some((p) => p.esquema.toLowerCase() === esquema.toLowerCase())) continue
    arquivos.push(pub)
    publicacoes.push({ sigla, esquema })
  }
  const busca = arquivo('nucleo/busca.sqlite', ESQUEMA_DA_BUSCA)
  if (busca) arquivos.push(busca)
  return { arquivos, publicacoes }
}

