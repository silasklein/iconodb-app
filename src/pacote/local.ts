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

/** O manifesto do último conjunto completo; null se ainda não houve sincronização completa. */
export async function lerEstado(armazem: Armazem = armazemPadrao()): Promise<Manifesto | null> {
  const dados = await lerJson<unknown>(armazem, ARQUIVO_ESTADO)
  if (dados === null) return null
  try {
    return validarManifesto(dados)
  } catch {
    return null
  }
}

/**
 * Os bytes de um arquivo do núcleo (ex.: "nucleo/comum.sqlite") na versão do
 * último conjunto completo. null sem estado (o banco não abre pela metade).
 */
export async function lerArquivoDoPacote(caminho: string, armazem: Armazem = armazemPadrao()): Promise<Uint8Array | null> {
  const estado = await lerEstado(armazem)
  const entrada = estado?.arquivos[caminho]
  if (!entrada) return null
  return armazem.ler(caminhoDoBlob(entrada.sha256))
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
