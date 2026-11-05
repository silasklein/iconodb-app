/**
 * Onde as imagens do usuário ficam NESTE aparelho:
 *
 * - OPFS, pasta `usuario-imagens/<IM-…>/` (separada da pasta `pacote/` do banco): `original.<ext>`, `tela.<webp|jpg>`,
 *   `miniatura.<webp|jpg>`, `local.json` (quando foi gravada) e `envio.json` (o que já subiu; ver fila.ts). Só as
 *   imagens criadas AQUI e ainda não confirmadas no Dropbox moram aqui. É a fila de envio: sobrevive a recarregar e a
 *   fechar o app.
 * - Cache Storage, cache `iconodb-usuario-imagens`: as cópias de tela e miniatura já confirmadas no Dropbox (as deste
 *   aparelho, quando a pasta do OPFS é desfeita) e as baixadas do outro aparelho. Pode ser esvaziado pelo navegador
 *   sem perda: tudo está no Dropbox.
 *
 * Quando a cópia local sai (decisão desta tarefa): NUNCA antes de o Dropbox confirmar os três arquivos. Confirmados,
 * a tela e a miniatura vão ao Cache Storage e a pasta inteira (com o original) sai do OPFS. Se o Cache Storage falha,
 * só o original sai (a tela e a miniatura continuam no OPFS e o app as mostra de lá).
 */
import { armazemOpfs, type Armazem } from '../pacote/armazem'
import { cacheStorage, type CacheImagens } from '../pacote/imagens'

export const PASTA_DAS_IMAGENS = 'usuario-imagens'
export const CACHE_DAS_IMAGENS = 'iconodb-usuario-imagens'

export const MSG_SEM_ESPACO = 'Não há espaço neste aparelho para guardar a imagem. Libere espaço (fotos, apps ou arquivos) e tente de novo.'
export const MSG_SEM_ARMAZENAMENTO = 'Este navegador não permite guardar imagens no aparelho.'

/** Falta espaço no aparelho (cota do navegador). */
export class ErroDeEspaco extends Error {
  constructor() {
    super(MSG_SEM_ESPACO)
    this.name = 'ErroDeEspaco'
  }
}

let armazemFixo: Armazem | null | undefined
let cacheFixo: CacheImagens | null | undefined
let armazemPadrao: Armazem | null = null

/** Troca o armazém (testes). `undefined` volta ao padrão (OPFS); `null` = sem armazenamento. */
export function usarArmazemDasImagens(a: Armazem | null | undefined): void {
  armazemFixo = a
}
export function usarCacheDasImagens(c: CacheImagens | null | undefined): void {
  cacheFixo = c
}

/** O OPFS das imagens, ou null se o navegador não tem (o jsdom dos testes, por exemplo). */
export function armazemDasImagens(): Armazem | null {
  if (armazemFixo !== undefined) return armazemFixo
  if (typeof navigator === 'undefined' || typeof navigator.storage?.getDirectory !== 'function') return null
  armazemPadrao ??= armazemOpfs({ pasta: PASTA_DAS_IMAGENS })
  return armazemPadrao
}

export function cacheDasImagens(): CacheImagens | null {
  if (cacheFixo !== undefined) return cacheFixo
  if (typeof caches === 'undefined') return null
  return cacheStorage(CACHE_DAS_IMAGENS)
}

const ehCota = (erro: unknown) => {
  const nome = (erro as { name?: unknown } | null)?.name
  return nome === 'QuotaExceededError' || nome === 'NS_ERROR_DOM_QUOTA_REACHED'
}

/** Cabe? Pela estimativa do navegador (quando há), com folga de 20 %. Sem estimativa, tenta e vê. */
async function cabe(bytes: number): Promise<boolean> {
  try {
    const e = await navigator.storage?.estimate?.()
    if (!e || typeof e.quota !== 'number' || typeof e.usage !== 'number') return true
    return e.quota - e.usage > bytes * 1.2
  } catch {
    return true
  }
}

export interface ArquivoLocal {
  nome: string
  blob: Blob
}

const bytesDe = async (b: Blob) => new Uint8Array(await b.arrayBuffer())

/**
 * Grava os arquivos da imagem na pasta dela, por inteiro, e por último `local.json`. Falhou no meio (espaço, erro do
 * OPFS): tira o que gravou e lança (ErroDeEspaco quando é a cota).
 */
export async function guardarLocal(id: string, arquivos: readonly ArquivoLocal[]): Promise<void> {
  const armazem = armazemDasImagens()
  if (!armazem) throw new Error(MSG_SEM_ARMAZENAMENTO)
  const total = arquivos.reduce((n, a) => n + a.blob.size, 0)
  if (!(await cabe(total))) throw new ErroDeEspaco()
  try {
    for (const a of arquivos) await armazem.gravar(`${id}/${a.nome}`, await bytesDe(a.blob))
    await armazem.gravar(`${id}/local.json`, new TextEncoder().encode(JSON.stringify({ v: 1, criadaEm: Date.now() })))
  } catch (erro) {
    await removerLocal(id).catch(() => undefined)
    if (ehCota(erro)) throw new ErroDeEspaco()
    throw erro
  }
}

const TIPOS: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', json: 'application/json' }
export const tipoDoArquivo = (nome: string) => TIPOS[nome.slice(nome.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream'

export async function lerLocal(id: string, nome: string): Promise<Blob | null> {
  const armazem = armazemDasImagens()
  if (!armazem) return null
  const bytes = await armazem.ler(`${id}/${nome}`)
  return bytes ? new Blob([bytes as BlobPart], { type: tipoDoArquivo(nome) }) : null
}

/** Os bytes do arquivo, numa cópia só (a leitura do OPFS), para um envio simples. */
export async function bytesLocais(id: string, nome: string): Promise<Uint8Array | null> {
  const armazem = armazemDasImagens()
  return armazem ? armazem.ler(`${id}/${nome}`) : null
}

/** O arquivo sem ler o conteúdo (o File do OPFS), para enviar em fatias. */
export async function arquivoLocal(id: string, nome: string): Promise<Blob | null> {
  const armazem = armazemDasImagens()
  if (!armazem) return null
  if (armazem.arquivo) return armazem.arquivo(`${id}/${nome}`)
  return lerLocal(id, nome)
}

/** Tira um arquivo da pasta da imagem, ou a pasta inteira (sem `nome`). */
export async function removerLocal(id: string, nome?: string): Promise<void> {
  const armazem = armazemDasImagens()
  if (!armazem) return
  if (nome) return armazem.remover(`${id}/${nome}`)
  for (const c of await armazem.listar(id)) await armazem.remover(c)
  await armazem.remover(id)
}

/** As imagens que têm pasta no OPFS deste aparelho. */
export async function idsLocais(): Promise<string[]> {
  const armazem = armazemDasImagens()
  if (!armazem) return []
  const ids = new Set<string>()
  for (const c of await armazem.listar('')) {
    const id = c.split('/')[0]
    if (id && /^IM-/.test(id) && c.includes('/')) ids.add(id)
  }
  return [...ids].sort()
}

export async function lerJsonLocal<T>(id: string, nome: string): Promise<T | null> {
  const armazem = armazemDasImagens()
  const bytes = armazem ? await armazem.ler(`${id}/${nome}`) : null
  if (!bytes) return null
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } catch {
    return null
  }
}

export async function gravarJsonLocal(id: string, nome: string, valor: unknown): Promise<void> {
  const armazem = armazemDasImagens()
  if (!armazem) return
  await armazem.gravar(`${id}/${nome}`, new TextEncoder().encode(JSON.stringify(valor)))
}
