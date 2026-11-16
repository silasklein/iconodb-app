// @vitest-environment node
/**
 * Parte 2C, bloco 3, Tarefa 13: a faceta Nível da busca conta e filtra o nível que vale de cada hipótese dos livros (o revisto
 * pela pessoa). «mahtes» acha BA00001, CA00001 e CA00002; em CA00001 o livro tem uma pré-iconográfica (HY-900002) e uma
 * iconográfica (HY-900001). Só ids TESTE.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { A, ev, T0 } from '../../tests/suporte/eventosDeTeste'
import { RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import type { Evento, Json, Op } from '../usuario/eventos'
import { lerTabelaDeFold } from './fold'

const tabela = lerTabelaDeFold(JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo/fold.json'), 'utf8')))

type Modulos = { estado: typeof import('../usuario/estado'); consulta: typeof import('./consulta'); cliente: typeof import('../banco/cliente') }
function apagarBanco() {
  return new Promise<void>((ok, falha) => {
    const r = indexedDB.deleteDatabase('iconodb-usuario')
    r.onsuccess = () => ok()
    r.onerror = () => falha(r.error)
    r.onblocked = () => falha(new Error('banco bloqueado'))
  })
}
let m: Modulos
beforeEach(async () => {
  await apagarBanco()
  vi.resetModules()
  m = { estado: await import('../usuario/estado'), consulta: await import('./consulta'), cliente: await import('../banco/cliente') }
  m.cliente.usarMotor(await bancoDeTeste())
})
afterEach(() => m.cliente.usarMotor(null))

let seq = 0
const nivel = (reg: string, op: Op, campos: Record<string, Json> = {}): Evento => ev({ ap: A, seq: ++seq, ms: T0 + seq * 10, tipo: 'nivel', reg, op, campos })
const buscar = (filtros: Record<string, string[]> = {}) => m.consulta.buscar('mahtes', { escopo: 'tudo', filtros, tabela })
const contagem = async (valor: string) => (await buscar()).facetas.find((f) => f.chave === 'nivel')?.opcoes.find((o) => o.valor === valor)?.n ?? 0

describe('a faceta Nível com o nível revisto', () => {
  it('rever muda o filtro e a contagem; voltar ao automático desfaz; o registro de uma hipótese que não existe é ignorado', async () => {
    expect((await buscar({ nivel: ['iconological'] })).numeros).not.toContain('CA00001')
    expect((await buscar({ nivel: ['iconographic'] })).numeros).toContain('CA00001')
    const antes = { iconographic: await contagem('iconographic'), iconological: await contagem('iconological') }

    await m.estado.receberEventos([nivel('HY-900001', 'criar', { nivel: 'iconological' })])
    expect((await buscar({ nivel: ['iconological'] })).numeros).toContain('CA00001')
    expect((await buscar({ nivel: ['iconographic'] })).numeros).not.toContain('CA00001')
    expect(await contagem('iconological')).toBe(antes.iconological + 1)
    expect(await contagem('iconographic')).toBe(antes.iconographic - 1)

    // foco 4: sem erro e sem efeito
    await m.estado.receberEventos([nivel('HY-999999', 'criar', { nivel: 'pre_iconographic' })])
    expect(await contagem('iconological')).toBe(antes.iconological + 1)

    await m.estado.receberEventos([nivel('HY-900001', 'excluir')])
    expect((await buscar({ nivel: ['iconological'] })).numeros).not.toContain('CA00001')
    expect(await contagem('iconographic')).toBe(antes.iconographic)
    expect(await contagem('iconological')).toBe(antes.iconological)
  })
})
