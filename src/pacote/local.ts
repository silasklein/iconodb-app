/**
 * O que está guardado no aparelho (lado da leitura). É por aqui que o resto do
 * app (o worker do banco, as telas) chega ao pacote, nunca pelos arquivos soltos.
 *
 * Layout em `pacote/` (via Armazem):
 * - blobs/<sha256>   arquivos do núcleo, nomeados pelo conteúdo. Um arquivo novo
 *                    nunca substitui o antigo: os dois convivem até a troca.
 * - estado.json      o manifesto do último conjunto COMPLETO e conferido. É o
 *                    ponto de troca: só ele diz qual blob é qual arquivo.
 * - progresso.json   caminho → sha256 do que já foi baixado, conferido e gravado.
 * - persistencia.json, preferencias.json
 */
import { armazemPadrao, type Armazem } from './armazem'
import { validarManifesto, type Manifesto } from './manifesto'

export const ARQUIVO_ESTADO = 'estado.json'
/** Cópia completa do estado, gravada antes do estado.json (que, no worker, não é atômico). */
export const ARQUIVO_ESTADO_TMP = 'estado.tmp'
export const ARQUIVO_PROGRESSO = 'progresso.json'
export const ARQUIVO_PERSISTENCIA = 'persistencia.json'
export const ARQUIVO_PREFERENCIAS = 'preferencias.json'
export const PASTA_BLOBS = 'blobs'

export const caminhoDoBlob = (sha256: string) => `${PASTA_BLOBS}/${sha256}`

export const ehDoNucleo = (caminho: string) => caminho.startsWith('nucleo/')
export const ehMiniatura = (caminho: string) => caminho.startsWith('imagens/') && /\/thumb-[^/]+$/.test(caminho)

export async function lerJson<T>(armazem: Armazem, caminho: string): Promise<T | null> {
  const bytes = await armazem.ler(caminho)
  if (!bytes) return null
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } catch {
    return null
  }
}

export function gravarJson(armazem: Armazem, caminho: string, dados: unknown): Promise<void> {
  return armazem.gravar(caminho, new TextEncoder().encode(JSON.stringify(dados)))
}

async function estadoDe(armazem: Armazem, caminho: string): Promise<Manifesto | null> {
  const dados = await lerJson<unknown>(armazem, caminho)
  if (dados === null) return null
  try {
    return validarManifesto(dados)
  } catch {
    return null
  }
}

/**
 * O manifesto do último conjunto completo; null se ainda não houve sincronização completa.
 * Se o estado.json está ilegível (gravação cortada), vale a cópia estado.tmp, que era gravada antes.
 */
export async function lerEstado(armazem: Armazem = armazemPadrao()): Promise<Manifesto | null> {
  return (await estadoDe(armazem, ARQUIVO_ESTADO)) ?? (await estadoDe(armazem, ARQUIVO_ESTADO_TMP))
}

/** Grava o estado: primeiro a cópia, depois o estado.json (o ponto de troca). */
export async function gravarEstado(armazem: Armazem, manifesto: Manifesto): Promise<void> {
  await gravarJson(armazem, ARQUIVO_ESTADO_TMP, manifesto)
  await gravarJson(armazem, ARQUIVO_ESTADO, manifesto)
}

/**
 * Os bytes de um arquivo do núcleo (ex.: "nucleo/comum.sqlite") na versão do
 * último conjunto completo. null sem estado (o banco não abre pela metade) ou se o
 * blob falta ou tem tamanho diferente do manifesto. Se isso acontece, o estado é lido
 * de novo uma vez: outra janela pode ter trocado o conjunto entre as duas leituras.
 */
export async function lerArquivoDoPacote(caminho: string, armazem: Armazem = armazemPadrao()): Promise<Uint8Array | null> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const entrada = (await lerEstado(armazem))?.arquivos[caminho]
    if (!entrada) return null
    const bytes = await armazem.ler(caminhoDoBlob(entrada.sha256))
    if (bytes && bytes.byteLength === entrada.bytes) return bytes
  }
  return null
}

export interface Persistencia {
  concedido: boolean
}

export function lerPersistencia(armazem: Armazem = armazemPadrao()): Promise<Persistencia | null> {
  return lerJson<Persistencia>(armazem, ARQUIVO_PERSISTENCIA)
}

export interface Preferencias {
  /** "Imagens em alta resolução offline" (decisão 17). Só guardada na 2A; os originais ficam para a 2B. */
  altaResolucaoOffline: boolean
}

export async function lerPreferencias(armazem: Armazem = armazemPadrao()): Promise<Preferencias> {
  const p = await lerJson<Partial<Preferencias>>(armazem, ARQUIVO_PREFERENCIAS)
  return { altaResolucaoOffline: p?.altaResolucaoOffline === true }
}

export function gravarPreferencias(preferencias: Preferencias, armazem: Armazem = armazemPadrao()): Promise<void> {
  return gravarJson(armazem, ARQUIVO_PREFERENCIAS, preferencias)
}
