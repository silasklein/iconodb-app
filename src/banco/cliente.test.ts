/**
 * O cliente com um Worker falso: um worker que morre (chunk ou wasm que não carregou)
 * não pode deixar o app esperando para sempre; a próxima chamada cria outro.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { abrirBanco, usarMotor } from './cliente'
import type { Pedido, Resposta } from './protocolo'

class WorkerFalso {
  static criados: WorkerFalso[] = []
  onmessage: ((e: MessageEvent<Resposta>) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  onmessageerror: ((e: MessageEvent) => void) | null = null
  pedidos: Pedido[] = []
  encerrado = false
  constructor() {
    WorkerFalso.criados.push(this)
  }
  postMessage(pedido: Pedido) {
    this.pedidos.push(pedido)
  }
  terminate() {
    this.encerrado = true
  }
  responder(resultado: unknown) {
    const id = this.pedidos.at(-1)!.id
    this.onmessage?.({ data: { id, ok: true, resultado } } as MessageEvent<Resposta>)
  }
}

describe('cliente: worker que morre', () => {
  beforeEach(() => {
    WorkerFalso.criados = []
    vi.stubGlobal('Worker', WorkerFalso)
    usarMotor(null)
  })
  afterEach(() => {
    usarMotor(null)
    vi.unstubAllGlobals()
  })

  it('erro do worker rejeita o pendente, encerra o worker, e a próxima chamada usa um worker novo', async () => {
    const primeira = abrirBanco()
    const morto = WorkerFalso.criados[0]!
    expect(morto.pedidos).toEqual([{ op: 'abrir', id: 1 }])
    morto.onerror?.({ message: 'falha ao carregar o módulo' } as ErrorEvent)
    await expect(primeira).rejects.toThrow('falha ao carregar o módulo')
    expect(morto.encerrado).toBe(true)

    const segunda = abrirBanco()
    expect(WorkerFalso.criados).toHaveLength(2)
    const novo = WorkerFalso.criados[1]!
    novo.responder({ estado: 'sem-pacote' })
    await expect(segunda).resolves.toEqual({ estado: 'sem-pacote' })
  })

  it('messageerror também encerra e troca o worker', async () => {
    const primeira = abrirBanco()
    WorkerFalso.criados[0]!.onmessageerror?.({} as MessageEvent)
    await expect(primeira).rejects.toThrow(/ilegível/)
    expect(WorkerFalso.criados[0]!.encerrado).toBe(true)
    const segunda = abrirBanco()
    WorkerFalso.criados[1]!.responder({ estado: 'sem-pacote' })
    await expect(segunda).resolves.toEqual({ estado: 'sem-pacote' })
  })

  it('o worker morto de um motor já trocado não apaga o motor atual', async () => {
    const primeira = abrirBanco()
    const antigo = WorkerFalso.criados[0]!
    const outro = { abrir: vi.fn(async () => ({ estado: 'sem-pacote' as const })), reabrir: vi.fn(), executar: vi.fn() }
    usarMotor(outro)
    antigo.onerror?.({ message: 'x' } as ErrorEvent)
    await expect(primeira).rejects.toThrow('x')
    await abrirBanco()
    expect(outro.abrir).toHaveBeenCalledTimes(1)
    expect(WorkerFalso.criados).toHaveLength(1)
  })
})
