import { act, renderHook, waitFor } from '@testing-library/react'
import { aparelhoAtual } from '../usuario/aparelho'
import { trocarDeAparelho } from '../usuario/diarioLocal'
import { useEsteAparelho } from './exibicao'

/** Um `aparelhoAtual` que o teste pode segurar (a resposta chega só quando o teste a solta). */
const controle = vi.hoisted(() => ({ segurar: null as null | Promise<{ id: string; nome: string }> }))
vi.mock('../usuario/aparelho', async (original) => {
  const m = await original<typeof import('../usuario/aparelho')>()
  return { ...m, aparelhoAtual: (() => controle.segurar ?? m.aparelhoAtual()) as typeof m.aparelhoAtual }
})

describe('useEsteAparelho (A-23)', () => {
  it('depois de trocarDeAparelho, a tela montada passa a ter o id novo (sem recarregar a página)', async () => {
    const antes = (await aparelhoAtual()).id
    const { result } = renderHook(() => useEsteAparelho())
    await waitFor(() => expect(result.current).toBe(antes))
    let para = ''
    await act(async () => {
      para = (await trocarDeAparelho()).para
    })
    expect(para).not.toBe(antes)
    await waitFor(() => expect(result.current).toBe(para))
    // E uma tela montada depois também.
    const { result: depois } = renderHook(() => useEsteAparelho())
    await waitFor(() => expect(depois.current).toBe(para))
  })

  // Revisão 1 da Tarefa 17a (m4): um pedido do id ainda em voo na troca não pode gravar o id antigo depois dela.
  it('a resposta atrasada de um pedido feito antes da troca é descartada (o id antigo não volta)', async () => {
    const { avisarTrocaDeAparelho } = await import('../usuario/aparelho')
    // Uma troca antes, para começar sem nada guardado.
    act(() => avisarTrocaDeAparelho())
    let soltarVelho!: (a: { id: string; nome: string }) => void
    controle.segurar = new Promise((ok) => (soltarVelho = ok))
    const { result } = renderHook(() => useEsteAparelho())
    expect(result.current).toBeNull()
    // A troca acontece com o pedido em voo; a tela pede de novo e recebe o id novo.
    controle.segurar = Promise.resolve({ id: 'idnovo01', nome: 'Mac' })
    act(() => avisarTrocaDeAparelho())
    await waitFor(() => expect(result.current).toBe('idnovo01'))
    // Agora a resposta velha chega: nem a tela montada nem uma montada depois voltam ao id antigo.
    await act(async () => {
      soltarVelho({ id: 'idvelho1', nome: 'Mac' })
      await Promise.resolve()
    })
    expect(result.current).toBe('idnovo01')
    controle.segurar = null
    const { result: depois } = renderHook(() => useEsteAparelho())
    expect(depois.current).toBe('idnovo01')
  })
})
