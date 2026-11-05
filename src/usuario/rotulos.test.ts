import { registrar } from './estado'
import { linhasDasMudancas } from './rotulos'

const conta = vi.hoisted(() => ({ numeracoes: 0 }))
vi.mock('../objetos-skc/atual', async (original) => {
  const m = await original<typeof import('../objetos-skc/atual')>()
  return {
    ...m,
    numeracaoDe: ((...a: Parameters<typeof m.numeracaoDe>) => {
      conta.numeracoes++
      return m.numeracaoDe(...a)
    }) as typeof m.numeracaoDe,
  }
})

// Revisão 1 da Tarefa 17a (m6): a numeração dos objetos SKC é calculada uma vez para a lista toda de «Vai subir».
describe('linhasDasMudancas', () => {
  beforeAll(async () => {
    for (const n of [1, 2, 3]) await registrar('objeto', `OB-aaaaaaaa-${n}`, 'criar', { titulo: `Selo TESTE ${n}` })
    await registrar('nota', 'NT-aaaaaaaa-1', 'criar', { texto: 'x', alvoTipo: 'objeto', alvo: 'OB-aaaaaaaa-1', rascunho: false })
  })
  beforeEach(() => {
    conta.numeracoes = 0
  })

  it('várias linhas que citam objetos SKC: a numeração é calculada uma vez só', () => {
    const linhas = linhasDasMudancas([
      { tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'criar' },
      { tipo: 'objeto', reg: 'OB-aaaaaaaa-2', op: 'alterar' },
      { tipo: 'nota', reg: 'NT-aaaaaaaa-1', op: 'alterar' },
      { tipo: 'objeto', reg: 'OB-aaaaaaaa-3', op: 'excluir' },
    ])
    expect(linhas).toHaveLength(4)
    expect(linhas.every((l) => typeof l.texto === 'string' && l.texto.length > 0)).toBe(true)
    expect(conta.numeracoes).toBe(1)
  })

  it('sem objeto SKC na lista, a numeração nem é calculada', () => {
    linhasDasMudancas([{ tipo: 'colecao', reg: 'CO-aaaaaaaa-1', op: 'alterar' }])
    expect(conta.numeracoes).toBe(0)
  })
})
