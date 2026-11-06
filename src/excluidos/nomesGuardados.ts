/**
 * P5 (aprovação do bloco 1): o nome da entrada dos livros de cada origem (`GL-<aparelho>-<n>`, `SI-<aparelho>-<n>`) que este
 * aparelho já viu. Uma origem retirada sem nunca ter chegado só tem a marca de exclusão (o evento continua SEM campos: o
 * `user-import` depende disso), e depois da importação o pacote não traz mais a entrada nem o redirecionamento. Para
 * «Excluídos» continuar dizendo o nome, o aparelho o guarda aqui: config local do IndexedDB (`origens:nomes`), que não
 * sincroniza e não é evento. É gravado sempre que o nome é conhecido («Retirar dos livros mesmo assim», «veio de você» e
 * «Excluídos» enquanto o pacote o traz) e lido só como reserva.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { atualizarConfig, lerConfig } from '../usuario/diarioLocal'

export const CHAVE_DOS_NOMES = 'origens:nomes'
export type NomesGuardados = Readonly<Record<string, string>>

const RE_ORIGEM = /^(GL|SI)-[a-z0-9]{8}-[1-9][0-9]*$/
const VAZIO: NomesGuardados = Object.freeze({})
let atual: NomesGuardados = VAZIO
let lido = false
const assinantes = new Set<() => void>()

/** Só as entradas válidas: um id de origem do usuário e um nome não vazio. */
function validos(x: unknown): Record<string, string> {
  const saida: Record<string, string> = {}
  if (!x || typeof x !== 'object' || Array.isArray(x)) return saida
  for (const [id, nome] of Object.entries(x)) if (RE_ORIGEM.test(id) && typeof nome === 'string' && nome.trim() !== '') saida[id] = nome.trim()
  return saida
}

function publicar(novo: Record<string, string>): void {
  if (JSON.stringify(novo) === JSON.stringify(atual)) return
  atual = Object.freeze({ ...novo })
  for (const f of [...assinantes]) f()
}

export const nomesGuardadosAtuais = (): NomesGuardados => atual

function assinar(f: () => void): () => void {
  assinantes.add(f)
  return () => {
    assinantes.delete(f)
  }
}

/** Lê o que está guardado (e publica em memória). */
export async function lerNomesGuardados(): Promise<NomesGuardados> {
  publicar({ ...validos(await lerConfig<unknown>(CHAVE_DOS_NOMES)), ...atual })
  lido = true
  return atual
}

/** Guarda os nomes conhecidos (um nome novo troca o antigo), numa só transação; nada a mudar, nada é gravado. */
export async function guardarNomes(novos: Record<string, string>): Promise<void> {
  const v = validos(novos)
  if (Object.keys(v).length === 0 || Object.entries(v).every(([id, nome]) => atual[id] === nome)) return
  const resultado = await atualizarConfig<Record<string, string>>(CHAVE_DOS_NOMES, (guardado) => ({ ...validos(guardado), ...v }))
  publicar({ ...atual, ...resultado })
}

/** Os nomes guardados; a primeira tela que os usa os lê do aparelho. */
export function useNomesGuardados(): NomesGuardados {
  useEffect(() => {
    if (!lido) void lerNomesGuardados().catch(() => undefined)
  }, [])
  return useSyncExternalStore(assinar, nomesGuardadosAtuais, nomesGuardadosAtuais)
}

/** Só nos testes. */
export function esquecerNomesGuardados(): void {
  atual = VAZIO
  lido = false
}
