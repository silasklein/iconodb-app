import { act, renderHook, waitFor } from '@testing-library/react'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { reabrirBanco, usarMotor } from '../banco/cliente'
import { registrar } from '../usuario/estado'
import { useHipotesesSkc } from './doUsuario'
import { useDonosDosTrechos } from './garantirDonos'
import { esquecerOsDonos, objetoDoTrecho, versaoDosDonos } from './donos'

const contagem = vi.hoisted(() => ({ n: 0, falhar: false }))
vi.mock('../banco/consultas', async (original) => {
  const real = await original<typeof import('../banco/consultas')>()
  return {
    ...real,
    numerosDosTrechos: async (t: readonly string[]) => {
      contagem.n++
      if (contagem.falhar) throw new Error('ocupado')
      return real.numerosDosTrechos(t)
    },
  }
})

beforeAll(async () => usarMotor(await bancoDeTeste()))
afterAll(() => usarMotor(null))
afterEach(() => esquecerOsDonos())

describe('T17-B-4: a tela do objeto do livro acha a hipótese registrada no principal de um grupo desfeito', () => {
  it('a hipótese guarda objeto = o principal SKC, mas o trecho é de CA00003: aparece em CA00003 quando o pacote responde, e não mais no principal', async () => {
    const ancora = { fonte: 'PA-TESTE-0003-cat-1', lingua: 'pt', inicio: 0, fim: 3, trecho: 'Uma', sha: 'a'.repeat(64) }
    await registrar('hipotese', 'HY-donoaaaa-1', 'criar', { objeto: 'OB-donoaaaa-1', sobre: 'objeto', termos: [], termosRotulos: [], nivel: 'iconographic', modalidade: 'probable', justificativa: '', ancora })
    const noMembro = renderHook(() => useHipotesesSkc(['CA00003']))
    await waitFor(() => expect(noMembro.result.current.map((h) => h.id)).toEqual(['HY-donoaaaa-1']))
    const noPrincipal = renderHook(() => useHipotesesSkc(['OB-donoaaaa-1']))
    await waitFor(() => expect(noPrincipal.result.current).toEqual([]))
  })
})

describe('T17-D-14 (m5): a troca do pacote com a tela aberta', () => {
  const ancora = { fonte: 'PA-TESTE-0003-cat-1', lingua: 'pt', inicio: 0, fim: 3, trecho: 'Uma', sha: 'a'.repeat(64) }
  /** Deixa passar o que estiver pendente (promessas e efeitos) sem esperar um tempo fixo. */
  const assentar = async () => {
    for (let i = 0; i < 5; i++) await act(async () => {})
  }

  it('pergunta de novo uma vez depois da troca, sem laço; se o banco falha, não insiste', async () => {
    contagem.n = 0
    contagem.falhar = false
    await registrar('hipotese', 'HY-sondam5-1', 'criar', { objeto: 'CA00001', sobre: 'objeto', termos: [], termosRotulos: ['x'], nivel: 'iconological', modalidade: 'probable', justificativa: 'j', ancora })
    let renders = 0
    renderHook(() => {
      renders++
      return useDonosDosTrechos()
    })
    await waitFor(() => expect(objetoDoTrecho('PA-TESTE-0003-cat-1', 'CA00001')).toBe('CA00003'))
    await assentar()
    expect(contagem.n).toBe(1) // uma pergunta só, mesmo com a versão mudando
    const rendersAntes = renders

    // Troca do pacote: o cache se esvazia e a tela aberta pergunta de novo, uma vez.
    await act(async () => void (await reabrirBanco()))
    await waitFor(() => expect(contagem.n).toBe(2))
    await waitFor(() => expect(objetoDoTrecho('PA-TESTE-0003-cat-1', 'CA00001')).toBe('CA00003'))
    await assentar()
    expect(contagem.n).toBe(2)
    expect(renders - rendersAntes).toBeLessThan(10) // sem laço de renderizações

    // Banco "ocupado" na troca seguinte: a pergunta falha uma vez e não é repetida em laço.
    contagem.falhar = true
    await act(async () => void (await reabrirBanco()))
    await waitFor(() => expect(contagem.n).toBe(3))
    await assentar()
    expect(contagem.n).toBe(3)
    expect(versaoDosDonos()).toBeGreaterThan(0)
  })
})
