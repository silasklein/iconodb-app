/** "Fonte indisponível" (nenhuma publicação aberta) não é "o trecho saiu": as âncoras nunca são trocadas nem apagadas nesse estado. */
import { act, renderHook, waitFor } from '@testing-library/react'
import { registrar, estadoAtual } from '../usuario/estado'
import { shaDoTrecho } from './ancora'
import { indiceDeNotas, type NotaVista } from './indiceDeNotas'
import { useConferencia } from './useConferencia'

const consultas = vi.hoisted(() => ({ trechos: null as null | { id: string; texto: string }[] }))
vi.mock('../banco/consultas', () => ({ trechosDaFonte: vi.fn(async () => consultas.trechos) }))
vi.mock('../banco/cliente', () => ({ aoReabrir: () => () => undefined }))

async function notaAncorada(): Promise<NotaVista> {
  const sha = await shaDoTrecho('Texto do livro.')
  await registrar('nota', 'NT-conf0000-1', 'criar', { texto: 'x', alvoTipo: 'objeto', alvo: 'CA00001', rascunho: false, ancoras: [{ p: 'PA-1', sha }] } as never)
  return indiceDeNotas(estadoAtual()).porId.get('NT-conf0000-1') as NotaVista
}

describe('useConferencia sem fonte', () => {
  it('fonte indisponível (null): nenhum aviso, e "Já conferi" recusa sem tocar nas âncoras', async () => {
    const nota = await notaAncorada()
    consultas.trechos = null
    const { result } = renderHook(() => useConferencia(nota))
    await new Promise((r) => setTimeout(r, 100))
    expect(result.current.conferencia).toBeNull()
    await act(async () => {
      await expect(result.current.conferi()).rejects.toThrow(/indispon/i)
    })
    expect(estadoAtual().registro('nota', 'NT-conf0000-1')?.campos.ancoras).toEqual(nota.ancoras)
  })

  it('com a fonte aberta e o trecho ausente, o aviso aparece (a diferença entre "indisponível" e "saiu")', async () => {
    const nota = await notaAncorada()
    consultas.trechos = []
    const { result } = renderHook(() => useConferencia(nota))
    await waitFor(() => expect(result.current.conferencia?.sumiram).toEqual(['PA-1']))
  })
})
