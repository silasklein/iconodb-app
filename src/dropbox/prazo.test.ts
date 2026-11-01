import { fetchComPrazo } from './prazo'

/** Um fetch falso que respeita o sinal: aborta a espera e o corpo. */
function fetchFalso(comportamento: 'nunca-responde' | { pedacos: string[]; trava?: boolean; intervaloMs?: number }) {
  return vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
    const sinal = init!.signal!
    if (comportamento === 'nunca-responde') {
      return new Promise<Response>((_ok, falha) => sinal.addEventListener('abort', () => falha(sinal.reason)))
    }
    const { pedacos, trava, intervaloMs = 0 } = comportamento
    let i = 0
    const corpo = new ReadableStream<Uint8Array>({
      async pull(saida) {
        if (i < pedacos.length) {
          if (intervaloMs) await new Promise((r) => setTimeout(r, intervaloMs))
          saida.enqueue(new TextEncoder().encode(pedacos[i++]))
          return
        }
        if (!trava) return saida.close()
        await new Promise<void>((_ok, falha) => sinal.addEventListener('abort', () => falha(sinal.reason)))
      },
    })
    return new Response(corpo, { status: 200, headers: { 'x-teste': 'sim' } })
  })
}

describe('fetchComPrazo', () => {
  it('sem resposta no prazo: TimeoutError', async () => {
    const f = fetchComPrazo(20, fetchFalso('nunca-responde') as unknown as typeof fetch)
    const erro = await f('https://x').catch((e: unknown) => e)
    expect((erro as DOMException).name).toBe('TimeoutError')
  })

  it('corpo que para no meio: TimeoutError na leitura (nunca um corpo cortado como se fosse inteiro)', async () => {
    const f = fetchComPrazo(30, fetchFalso({ pedacos: ['abc'], trava: true }) as unknown as typeof fetch)
    const r = await f('https://x')
    const erro = await r.arrayBuffer().catch((e: unknown) => e)
    expect((erro as DOMException).name).toBe('TimeoutError')
  })

  it('o prazo é de inatividade: bytes chegando devagar, mas sempre, não estouram', async () => {
    const pedacos = Array.from({ length: 6 }, (_, i) => String(i))
    const f = fetchComPrazo(40, fetchFalso({ pedacos, intervaloMs: 15 }) as unknown as typeof fetch)
    const r = await f('https://x')
    expect(await r.text()).toBe('012345')
    expect(r.status).toBe(200)
    expect(r.headers.get('x-teste')).toBe('sim')
  })

  it('passa o pedido adiante (URL, método, corpo) e respeita um sinal de fora', async () => {
    const base = vi.fn(async () => new Response('ok'))
    const f = fetchComPrazo(1000, base as unknown as typeof fetch)
    expect(await (await f('https://x/y', { method: 'POST', body: 'a=1' })).text()).toBe('ok')
    expect(base).toHaveBeenCalledWith('https://x/y', expect.objectContaining({ method: 'POST', body: 'a=1' }))
    const fora = new AbortController()
    fora.abort(new DOMException('parou', 'AbortError'))
    const lento = fetchComPrazo(1000, fetchFalso('nunca-responde') as unknown as typeof fetch)
    expect(((await lento('https://x', { signal: fora.signal }).catch((e: unknown) => e)) as DOMException).name).toBe('AbortError')
  })
})
