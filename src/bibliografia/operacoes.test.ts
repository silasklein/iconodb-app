/**
 * «Restaurar» uma obra trocada por outra («É esta» ao editar; `trocarPorEsta` / `restaurarObra`). Revisão final do bloco 3,
 * M2: o objeto SKC só volta se ainda está como a troca o deixou (a outra obra E o rótulo que a troca escreveu); o que a
 * pessoa mudou depois (em outro aparelho, numa corrida) fica como está. Só obras e objetos inventados.
 */
import { estadoAtual, registrar } from '../usuario/estado'
import { restaurarObra, trocarPorEsta } from './operacoes'

const OUTRA = 'BIB-900001'
let n = 0

/** Uma obra do usuário com um objeto SKC que a cita, trocada por OUTRA («Autor 1999»). Devolve os ids. */
async function obraTrocada(): Promise<{ obra: string; objeto: string }> {
  n += 1
  const obra = `BIB-toper00${n}-1`
  const objeto = `OB-toper00${n}-1`
  await registrar('obra', obra, 'criar', { csl: { type: 'book', title: `Trocável de teste ${n}` }, curta: `Trocável 200${n}` })
  await registrar('objeto', objeto, 'criar', { periodo: 'CA', titulo: 'Objeto da troca', origemTipo: 'publicacao', obra, obraRotulo: `Trocável 200${n}` })
  await trocarPorEsta(obra, OUTRA, 'Autor 1999')
  expect(estadoAtual().registro('objeto', objeto)!.campos).toMatchObject({ obra: OUTRA, obraRotulo: 'Autor 1999' })
  return { obra, objeto }
}

describe('restaurarObra depois de «É esta»', () => {
  it('devolve o objeto que continua como a troca o deixou, com o rótulo de antes', async () => {
    const { obra, objeto } = await obraTrocada()
    await restaurarObra(obra)
    expect(estadoAtual().registro('obra', obra)!.excluido).toBe(false)
    expect(estadoAtual().registro('objeto', objeto)!.campos).toMatchObject({ obra, obraRotulo: `Trocável 200${n}` })
  })

  it('não toca um objeto reapontado para uma terceira obra depois da troca', async () => {
    const { obra, objeto } = await obraTrocada()
    await registrar('objeto', objeto, 'alterar', { obra: 'BIB-900002', obraRotulo: 'Terceira 2003' })
    await restaurarObra(obra)
    expect(estadoAtual().registro('obra', obra)!.excluido).toBe(false)
    expect(estadoAtual().registro('objeto', objeto)!.campos).toMatchObject({ obra: 'BIB-900002', obraRotulo: 'Terceira 2003' })
  })

  it('não toca um objeto cujo rótulo mudou depois da troca (a corrida entre dois aparelhos)', async () => {
    const { obra, objeto } = await obraTrocada()
    // o id continua o da troca (a escrita dele em outro aparelho perdeu a fusão), mas o rótulo é o que a pessoa digitou
    await registrar('objeto', objeto, 'alterar', { obraRotulo: 'Digitado em outro aparelho' })
    await restaurarObra(obra)
    expect(estadoAtual().registro('obra', obra)!.excluido).toBe(false)
    expect(estadoAtual().registro('objeto', objeto)!.campos).toMatchObject({ obra: OUTRA, obraRotulo: 'Digitado em outro aparelho' })
  })
})
