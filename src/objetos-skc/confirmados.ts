/**
 * Os números confirmados deste aparelho (id do objeto SKC → número): a união dos mapas `numeros` de todo `estado.json`
 * que ele baixou ou gravou (veja numeracao.ts). Fica no IndexedDB (config `numeros:confirmados`) e numa cópia em memória
 * que as telas assinam. Só cresce: nada aqui apaga uma confirmação.
 */
import { useSyncExternalStore } from 'react'
import { atualizarConfig, lerConfig } from '../usuario/diarioLocal'
import { unirConfirmados, validarConfirmados, type Confirmados } from './numeracao'

export const CHAVE_DOS_CONFIRMADOS = 'numeros:confirmados'

const VAZIO: Confirmados = Object.freeze({})
let atual: Confirmados = VAZIO
const assinantes = new Set<() => void>()

function publicar(novo: Confirmados): void {
  if (JSON.stringify(novo) === JSON.stringify(atual)) return
  atual = Object.freeze({ ...novo })
  for (const f of [...assinantes]) f()
}

export const confirmadosAtuais = (): Confirmados => atual

export function assinarConfirmados(f: () => void): () => void {
  assinantes.add(f)
  return () => {
    assinantes.delete(f)
  }
}

export function useConfirmados(): Confirmados {
  return useSyncExternalStore(assinarConfirmados, confirmadosAtuais, confirmadosAtuais)
}

/** Lê o que está guardado (e publica em memória). */
export async function lerConfirmados(): Promise<Confirmados> {
  const guardado = validarConfirmados(await lerConfig<unknown>(CHAVE_DOS_CONFIRMADOS))
  publicar(unirConfirmados(atual, guardado))
  return atual
}

/** Une `novos` ao que está guardado, numa só transação; devolve o mapa resultante. */
export async function unirConfirmadosGuardados(novos: Confirmados): Promise<Confirmados> {
  const valido = validarConfirmados(novos)
  const resultado = await atualizarConfig<Record<string, string>>(CHAVE_DOS_CONFIRMADOS, (guardado) => unirConfirmados(validarConfirmados(guardado), valido))
  publicar(unirConfirmados(atual, resultado))
  return atual
}

/** Só nos testes. */
export function esquecerConfirmados(): void {
  atual = VAZIO
}
