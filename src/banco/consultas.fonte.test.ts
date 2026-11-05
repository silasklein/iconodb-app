import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from './cliente'
import { trechosDaFonte } from './consultas'

const aberto = vi.hoisted(() => ({ vazio: false }))
vi.mock('./cliente', async (original) => {
  const m = await original<typeof import('./cliente')>()
  return { ...m, publicacoesAbertas: async () => (aberto.vazio ? [] : m.publicacoesAbertas()) }
})

beforeAll(async () => usarMotor(await bancoDeTeste()))
afterAll(() => usarMotor(null))

describe('trechosDaFonte', () => {
  it('devolve os trechos que existem no pacote de agora', async () => {
    const r = await trechosDaFonte(['PA-TESTE-0001-cat-1', 'PA-NAO-EXISTE'])
    expect(r?.map((t) => t.id)).toEqual(['PA-TESTE-0001-cat-1'])
  })

  it('sem nenhuma publicação aberta devolve null ("fonte indisponível"), não [] (que diria "os trechos saíram")', async () => {
    aberto.vazio = true
    try {
      expect(await trechosDaFonte(['PA-TESTE-0001-cat-1'])).toBeNull()
    } finally {
      aberto.vazio = false
    }
  })

  it('sem ids pedidos não há o que comparar: lista vazia', async () => {
    expect(await trechosDaFonte([])).toEqual([])
  })
})
