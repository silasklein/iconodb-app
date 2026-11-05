/**
 * O estado da camada do usuário em memória: um armazenamento assinável (o estado fundido atual) e o hook
 * `useEstado`. Toda mudança passa por aqui:
 * - `registrar` / `registrarVarios`: grava no IndexedDB PRIMEIRO (armazem.gravarNovosEventos, que só
 *   resolve com a transação terminada) e só então aplica na memória e avisa os assinantes. Se a gravação
 *   falha, nada muda e a promessa rejeita.
 * - `receberEventos`: o que a sincronização (Tarefa 3) baixou: guarda, avança o relógio, aplica.
 * - `carregarEstado`: ao abrir o app, funde a base guardada com todos os eventos do IndexedDB.
 * Outras abas do mesmo aparelho recebem os eventos novos por BroadcastChannel.
 */
import { useRef, useSyncExternalStore } from 'react'
import { avancarRelogio, gravarNovosEventos, guardarEventosRemotos, lerBase, todosEventos, unirBase, type PedidoDeEvento } from './armazem'
import type { Campos, Evento, Op, Tipo } from './eventos'
import { aplicar, fundir, type Estado, type EstadoConsolidado } from './fusao'

export { proximoId } from './armazem'
export type { Estado, Registro, EntradaDeHistorico } from './fusao'

let estado: Estado = fundir([])
const assinantes = new Set<() => void>()
/** Eventos aplicados na memória enquanto cada carregarEstado em andamento lia o IndexedDB. */
const cargas = new Set<Evento[]>()
/**
 * Cada carga recebe um número crescente ao começar. Uma carga só publica se nenhuma carga iniciada DEPOIS
 * dela já publicou: uma carga velha que termina por último não sobrescreve a nova (que pode ter visto uma
 * base nova ou uma cópia substituída, que não passam pelo buffer de eventos); e, se a mais nova falha, o
 * estado publicado fica como está e uma carga anterior ainda em andamento pode publicar.
 */
let geracao = 0
let ultimaPublicada = 0

function publicar(novo: Estado): void {
  if (novo === estado) return
  estado = novo
  for (const avisar of [...assinantes]) avisar()
}

function aplicarNaMemoria(eventos: readonly Evento[]): void {
  if (eventos.length === 0) return
  for (const c of cargas) c.push(...eventos)
  publicar(aplicar(estado, eventos))
}

// ------------------------------------------------------------ outras abas

const CANAL = 'iconodb-usuario'
type Mensagem = { tipo: 'eventos'; eventos: Evento[] } | { tipo: 'recarregar' }
let canal: BroadcastChannel | null | undefined

function obterCanal(): BroadcastChannel | null {
  if (canal !== undefined) return canal
  canal = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CANAL)
  if (canal) {
    canal.onmessage = (m: MessageEvent<Mensagem>) => {
      if (m.data?.tipo === 'eventos' && Array.isArray(m.data.eventos)) aplicarNaMemoria(m.data.eventos)
      else if (m.data?.tipo === 'recarregar') void carregarEstado()
    }
    // No Node (testes), o canal não segura o processo aberto.
    ;(canal as unknown as { unref?: () => void }).unref?.()
  }
  return canal
}

function avisarOutrasAbas(m: Mensagem): void {
  try {
    obterCanal()?.postMessage(m)
  } catch {
    // Sem canal, as outras abas veem a mudança na próxima carga.
  }
}

// ------------------------------------------------------------ API

/** O estado fundido atual (imutável; cada mudança publica um novo). */
export function estadoAtual(): Estado {
  return estado
}

/** Chama `avisar` a cada estado novo. Devolve a função que cancela a assinatura. */
export function assinarEstado(avisar: () => void): () => void {
  obterCanal()
  assinantes.add(avisar)
  return () => {
    assinantes.delete(avisar)
  }
}

/**
 * Funde a base guardada com todos os eventos do IndexedDB e publica, salvo se uma carga iniciada depois
 * desta já publicou (então devolve o estado atual). Se a leitura falha, rejeita e o estado publicado não muda.
 */
export async function carregarEstado(): Promise<Estado> {
  obterCanal()
  const minha = ++geracao
  const durante: Evento[] = []
  cargas.add(durante)
  try {
    const [base, eventos] = await Promise.all([lerBase(), todosEventos()])
    if (minha < ultimaPublicada) return estado
    const fundido = fundir(eventos, base ?? undefined)
    ultimaPublicada = minha
    publicar(durante.length ? aplicar(fundido, durante) : fundido)
    return estado
  } finally {
    cargas.delete(durante)
  }
}

/** Grava vários eventos numa só transação (tudo ou nada) e só então os aplica e avisa (uma vez). */
export async function registrarVarios(pedidos: readonly PedidoDeEvento[]): Promise<Evento[]> {
  const eventos = await gravarNovosEventos(pedidos)
  aplicarNaMemoria(eventos)
  avisarOutrasAbas({ tipo: 'eventos', eventos })
  return eventos
}

/** Grava um evento (IndexedDB primeiro), aplica no estado, avisa e devolve o evento. */
export async function registrar(tipo: Tipo, reg: string, op: Op, campos: Campos = {}): Promise<Evento> {
  const [evento] = await registrarVarios([{ tipo, reg, op, campos }])
  return evento!
}

/**
 * O que a sincronização baixou: eventos de outros aparelhos (malformados são contados e ignorados) e,
 * opcionalmente, uma base consolidada nova (estado.json, já validada). A base é unida à guardada numa só
 * transação (armazem.unirBase: nada do que só a antiga tinha se perde, nem com chamadas simultâneas) e o
 * relógio avança além dela e dos eventos. Cópias diferentes de um id já conhecido são contadas em
 * `conflitos`; se alguma vence a guardada, o estado é refundido do zero.
 */
export async function receberEventos(eventos: Iterable<unknown>, base?: EstadoConsolidado): Promise<{ novos: number; ignorados: number; conflitos: number }> {
  if (base) {
    await unirBase(base)
    let maior: string | null = null
    for (const r of base.registros) if (maior === null || r.alteradoEm > maior) maior = r.alteradoEm
    if (maior) await avancarRelogio(maior)
  }
  const { novos, ignorados, conflitos, substituidos } = await guardarEventosRemotos(eventos)
  if (base || substituidos.length) {
    await carregarEstado()
    avisarOutrasAbas({ tipo: 'recarregar' })
  } else if (novos.length) {
    aplicarNaMemoria(novos)
    avisarOutrasAbas({ tipo: 'eventos', eventos: novos })
  }
  return { novos: novos.length, ignorados, conflitos }
}

/**
 * Lê uma parte do estado e re-renderiza quando ela muda. O seletor roda uma vez por estado novo; se o
 * resultado for o mesmo (Object.is), o componente não re-renderiza.
 */
export function useEstado<T>(seletor: (e: Estado) => T): T {
  const memoria = useRef<{ estado: Estado; seletor: (e: Estado) => T; valor: T } | null>(null)
  const ler = (): T => {
    const atual = estadoAtual()
    const m = memoria.current
    if (m && m.estado === atual && m.seletor === seletor) return m.valor
    const valor = seletor(atual)
    const igual = m !== null && Object.is(m.valor, valor)
    memoria.current = { estado: atual, seletor, valor: igual ? m.valor : valor }
    return memoria.current.valor
  }
  return useSyncExternalStore(assinarEstado, ler, ler)
}
