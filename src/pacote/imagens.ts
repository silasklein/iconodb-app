/**
 * Imagens do pacote. As miniaturas vêm na primeira sincronização; as imagens de
 * tela, ao abrir (urlImagem). Tudo fica no Cache Storage (cache "iconodb-imagens"),
 * com uma chave sintética por caminho do pacote.
 */
import { fonteDropbox } from '../dropbox/fonte'
import { armazemPadrao, type Armazem } from './armazem'
import { lerEstado } from './local'
import { sha256, type Fonte } from './manifesto'

export const NOME_DO_CACHE = 'iconodb-imagens'

export interface CacheImagens {
  obter(caminho: string): Promise<Blob | null>
  guardar(caminho: string, bytes: Uint8Array, tipo: string): Promise<void>
  remover(caminho: string): Promise<void>
}

export function cacheMemoria(): CacheImagens {
  const itens = new Map<string, { bytes: Uint8Array; tipo: string }>()
  return {
    async obter(caminho) {
      const i = itens.get(caminho)
      return i ? new Blob([i.bytes.slice()], { type: i.tipo }) : null
    },
    async guardar(caminho, bytes, tipo) {
      itens.set(caminho, { bytes: bytes.slice(), tipo })
    },
    async remover(caminho) {
      itens.delete(caminho)
    },
  }
}

export function cacheStorage(nome: string = NOME_DO_CACHE): CacheImagens {
  const chave = (caminho: string) => new Request(`${location.origin}/__imagens/${encodeURI(caminho)}`)
  const abrir = () => caches.open(nome)
  return {
    async obter(caminho) {
      const r = await (await abrir()).match(chave(caminho))
      return r ? r.blob() : null
    },
    async guardar(caminho, bytes, tipo) {
      const corpo = new Blob([bytes as BlobPart], { type: tipo })
      await (await abrir()).put(chave(caminho), new Response(corpo, { headers: { 'Content-Type': tipo } }))
    },
    async remover(caminho) {
      await (await abrir()).delete(chave(caminho))
    },
  }
}

let cachePadrao: CacheImagens | null = null

export function cacheImagensPadrao(): CacheImagens {
  if (typeof caches === 'undefined') throw new Error('Este navegador não permite guardar imagens no aparelho.')
  cachePadrao ??= cacheStorage()
  return cachePadrao
}

export function tipoDaImagem(caminho: string): string {
  const ext = caminho.slice(caminho.lastIndexOf('.') + 1).toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  return 'image/webp'
}

/** Um endereço (blob:) por imagem: reaproveitado, para não vazar um novo a cada tela. */
const urls = new Map<string, string>()
const emAndamento = new Map<string, Promise<string | null>>()

/** Esquece (e libera) o endereço da imagem, por exemplo quando ela mudou no pacote. */
export function esquecerUrl(caminho: string): void {
  const u = urls.get(caminho)
  if (u) URL.revokeObjectURL(u)
  urls.delete(caminho)
}

export function liberarUrls(): void {
  for (const c of [...urls.keys()]) esquecerUrl(c)
}

export interface OpcoesDeImagem {
  cache?: CacheImagens
  armazem?: Armazem
  /** Como obter a Fonte quando a imagem não está no aparelho; null = sem login. Pode lançar sem rede. */
  fonte?: () => Promise<Fonte | null>
}

async function buscar(caminho: string, opcoes: OpcoesDeImagem): Promise<string | null> {
  const cache = opcoes.cache ?? cacheImagensPadrao()
  const guardada = await cache.obter(caminho)
  if (guardada) return novoUrl(caminho, guardada)

  // Não há cópia: busca na fonte (só imagens que o pacote declara, conferidas pelo sha256).
  try {
    const entrada = (await lerEstado(opcoes.armazem ?? armazemPadrao()))?.arquivos[caminho]
    if (!entrada) return null
    const fonte = await (opcoes.fonte ?? fonteDropbox)()
    if (!fonte) return null
    const bytes = new Uint8Array(await fonte.baixar(caminho))
    if ((await sha256(bytes)) !== entrada.sha256) return null
    const tipo = tipoDaImagem(caminho)
    await cache.guardar(caminho, bytes, tipo)
    return novoUrl(caminho, new Blob([bytes as BlobPart], { type: tipo }))
  } catch {
    // Sem internet, sem login ou fonte com defeito: a tela mostra o marcador.
    return null
  }
}

function novoUrl(caminho: string, blob: Blob): string {
  const existente = urls.get(caminho)
  if (existente) return existente
  const url = URL.createObjectURL(blob)
  urls.set(caminho, url)
  return url
}

/**
 * Endereço da imagem para usar em <img src>. Usa a cópia do aparelho; sem ela,
 * busca no Dropbox e guarda. null quando não há cópia e nem rede.
 */
export function urlImagem(caminho: string, opcoes: OpcoesDeImagem = {}): Promise<string | null> {
  const pronta = urls.get(caminho)
  if (pronta) return Promise.resolve(pronta)
  let fazendo = emAndamento.get(caminho)
  if (!fazendo) {
    fazendo = buscar(caminho, opcoes).finally(() => emAndamento.delete(caminho))
    emAndamento.set(caminho, fazendo)
  }
  return fazendo
}
