// @vitest-environment node
/**
 * T17-B-10: quando dois verbetes têm o mesmo nome, o destaque da busca prefere o aprovado DE AGORA (o derivado por
 * `situacaoDoVerbete`), não o `status` cru do pacote.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { ev, A, T0 } from '../../tests/suporte/eventosDeTeste'
import { RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import { lerTabelaDeFold } from './fold'
import type { Evento, Json, Tipo } from '../usuario/eventos'

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
const e = (tipo: Tipo, reg: string, campos: Record<string, Json>): Evento => ev({ ap: A, seq: ++seq, ms: T0 + seq * 10, tipo, reg, op: 'alterar', campos })
const destaque = async () => (await m.consulta.buscar('nome igual de prova', { escopo: 'tudo', filtros: {}, tabela })).verbeteDestaque?.id

describe('o destaque entre dois verbetes de mesmo nome', () => {
  it('prefere o aprovado de agora: um verbete aprovado no pacote mas reaberto pelo usuário perde para um aprovado por ele', async () => {
    // GL-900003 vem aprovado no pacote; GL-900008, a revisar. Os dois passam a se chamar igual.
    await m.estado.receberEventos([e('verbete', 'GL-900003', { formaEmUso: 'nome igual de prova' }), e('verbete', 'GL-900008', { formaEmUso: 'nome igual de prova' })])
    // o pacote aprova GL-900003, mas a forma em uso mudou depois: a aprovação do pacote era da original, então de agora ele está «a revisar»
    await m.estado.receberEventos([e('verbete', 'GL-900008', { status: 'approved', formaAprovada: 'nome igual de prova' })])
    expect(await destaque()).toBe('GL-900008')
  })
})
