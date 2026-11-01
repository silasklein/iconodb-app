/**
 * O manifesto do pacote (nucleo/manifest.json) e o que se pode dizer dele sem
 * mexer no aparelho: formato, Fonte (de onde os arquivos vêm), erros e sha256.
 */

export const SCHEMA_ESPERADO = 5
export const CAMINHO_DO_MANIFESTO = 'nucleo/manifest.json'
export const MSG_SCHEMA = 'Este pacote é de outra versão do banco; gere-o de novo com `app-export`.'

export interface ArquivoDoPacote {
  sha256: string
  bytes: number
}

export interface Publicacao {
  sigla: string
  volume?: string
  rotulo?: string
}

export interface Manifesto {
  schema: number
  gerado_em: string
  publicacoes: Publicacao[]
  /** Caminho relativo à raiz do pacote (ex.: "nucleo/comum.sqlite") → sha256 e tamanho. */
  arquivos: Record<string, ArquivoDoPacote>
}

/** De onde o pacote vem: o Dropbox no app, a pasta tests/fixtures/pacote nos testes. */
export interface Fonte {
  /** Caminhos (relativos à raiz do pacote) de todos os arquivos sob o prefixo. */
  listar(prefixo?: string): Promise<string[]>
  baixar(caminho: string): Promise<ArrayBuffer>
}

/** O pacote é de outro schema: o app o recusa. */
export class ErroDeSchema extends Error {
  constructor() {
    super(MSG_SCHEMA)
    this.name = 'ErroDeSchema'
  }
}

/** O manifesto não tem o formato esperado. */
export class ErroDeManifesto extends Error {
  constructor() {
    super('O manifesto do pacote está incompleto ou ilegível.')
    this.name = 'ErroDeManifesto'
  }
}

/** O sha256 do arquivo baixado não é o do manifesto: o arquivo é recusado. */
export class ErroDeIntegridade extends Error {
  readonly caminho: string
  constructor(caminho: string) {
    super(`O arquivo ${caminho} não passou na conferência (sha256).`)
    this.name = 'ErroDeIntegridade'
    this.caminho = caminho
  }
}

/** Sem rede (ou o Dropbox fora do ar): vale tentar de novo mais tarde. */
export class ErroDeRede extends Error {
  constructor(causa?: unknown) {
    super('Sem conexão com o Dropbox.', { cause: causa })
    this.name = 'ErroDeRede'
  }
}

/** Sem login ou login expirado: é preciso entrar de novo. Nenhum dado local é apagado. */
export class ErroDeLogin extends Error {
  constructor() {
    super('É preciso entrar no Dropbox de novo.')
    this.name = 'ErroDeLogin'
  }
}

const eObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Confere o schema (antes de tudo) e o formato. Serve também ao estado guardado no aparelho. */
export function validarManifesto(dados: unknown): Manifesto {
  if (!eObjeto(dados)) throw new ErroDeManifesto()
  if (dados.schema !== SCHEMA_ESPERADO) throw new ErroDeSchema()
  const { arquivos, publicacoes } = dados
  if (!eObjeto(arquivos) || !Array.isArray(publicacoes) || typeof dados.gerado_em !== 'string') throw new ErroDeManifesto()
  for (const a of Object.values(arquivos)) {
    if (!eObjeto(a) || typeof a.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(a.sha256) || typeof a.bytes !== 'number') {
      throw new ErroDeManifesto()
    }
  }
  return dados as unknown as Manifesto
}

export async function lerManifesto(fonte: Fonte): Promise<Manifesto> {
  const bytes = await fonte.baixar(CAMINHO_DO_MANIFESTO)
  let dados: unknown
  try {
    dados = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new ErroDeManifesto()
  }
  return validarManifesto(dados)
}

export async function sha256(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const resumo = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(resumo), (b) => b.toString(16).padStart(2, '0')).join('')
}
