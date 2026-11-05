// @vitest-environment node
/**
 * T17-B-4: a faceta Nível da busca conta a hipótese ancorada num trecho do livro para o objeto DESSE trecho, mesmo registrada
 * no principal de um grupo que depois foi desfeito.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { ev, A, T0 } from '../../tests/suporte/eventosDeTeste'
import { RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import { lerTabelaDeFold } from './fold'
import type { Evento, Json, Tipo } from '../usuario/eventos'

const tabela = lerTabelaDeFold(JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo/fold.json'), 'utf8')))

type Modulos = { donos: typeof import('../hipoteses/donos'); estado: typeof import('../usuario/estado'); consulta: typeof import('./consulta'); cliente: typeof import('../banco/cliente') }
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
  m = { donos: await import('../hipoteses/donos'), estado: await import('../usuario/estado'), consulta: await import('./consulta'), cliente: await import('../banco/cliente') }
  m.cliente.usarMotor(await bancoDeTeste())
})
afterEach(() => m.cliente.usarMotor(null))

let seq = 0
const e = (tipo: Tipo, reg: string, campos: Record<string, Json>): Evento => ev({ ap: A, seq: ++seq, ms: T0 + seq * 10, tipo, reg, op: 'alterar', campos })
const ancora = { fonte: 'PA-TESTE-0003-cat-1', lingua: 'pt', inicio: 0, fim: 3, trecho: 'Uma', sha: 'a'.repeat(64) }

describe('a faceta Nível e a hipótese ancorada num trecho do livro', () => {
  it('o objeto do trecho (CA00003) ganha o nível da hipótese: uma opção a mais contada', async () => {
    const contagem = async () => {
      const r = await m.consulta.buscar('probe', { escopo: 'local', filtros: {}, tabela })
      return r.facetas.find((f) => f.chave === 'nivel')?.opcoes.find((o) => o.valor === 'iconological')?.n ?? 0
    }
    const antes = await contagem()
    await m.estado.receberEventos([e('hipotese', 'HY-aaaaaaaa-1', { objeto: 'OB-aaaaaaaa-1', sobre: 'objeto', termos: [], termosRotulos: [], nivel: 'iconological', modalidade: 'probable', justificativa: '', ancora })])
    expect(await contagem()).toBe(antes + 1)
  })
})

describe('o objeto do acerto da hipótese não depende de o cache dos donos estar cheio (revisão 1, I1)', () => {
  // Registrada em CA00001 (o principal gravado), ancorada no trecho de CA00003 (pacote sintético).
  const hipotese = () => e('hipotese', 'HY-aaaaaaaa-2', { objeto: 'CA00001', sobre: 'objeto', termos: [], termosRotulos: ['zebroide'], nivel: 'iconological', modalidade: 'probable', justificativa: 'zebroide de prova', ancora })
  // Busca e devolve o objeto com que a entrada da hipótese ficou no índice (o que o acerto usa para ir à tela).
  const objetosDoAcerto = async () => {
    await m.consulta.buscar('zebroide', { escopo: 'tudo', filtros: {}, tabela })
    const linhas = await m.cliente.consultarUsuario<{ objeto: string | null }>("SELECT objeto FROM doc WHERE tipo = 'hipotese'")
    return linhas.map((l) => l.objeto)
  }

  it('cache vazio na primeira busca: o acerto vai ao objeto do trecho', async () => {
    await m.estado.receberEventos([hipotese()])
    m.donos.esquecerOsDonos()
    expect(await objetosDoAcerto()).toEqual(['CA00003'])
  })

  it('esquecer os donos e buscar de novo: o mesmo resultado', async () => {
    await m.estado.receberEventos([hipotese()])
    m.donos.esquecerOsDonos()
    expect(await objetosDoAcerto()).toEqual(['CA00003'])
    m.donos.esquecerOsDonos()
    expect(await objetosDoAcerto()).toEqual(['CA00003'])
  })

  it('o cache enchido por fora (uma tela) depois de um índice montado sem ele: a próxima busca reindexa', async () => {
    await m.estado.receberEventos([hipotese()])
    m.donos.esquecerOsDonos()
    // Monta o índice com o cache vazio e o estado já aberto (como se a busca fosse a primeira coisa).
    const { garantirIndiceDoUsuario } = await import('../usuario/indice')
    await garantirIndiceDoUsuario(tabela)
    m.donos.guardarOsDonos(['PA-TESTE-0003-cat-1'], new Map([['PA-TESTE-0003-cat-1', ['CA00003']]]))
    expect(await objetosDoAcerto()).toEqual(['CA00003'])
  })

  it('o fluxo: a faceta Nível e o acerto concordam', async () => {
    await m.estado.receberEventos([hipotese()])
    m.donos.esquecerOsDonos()
    const r = await m.consulta.buscar('zebroide', { escopo: 'tudo', filtros: {}, tabela })
    const nivel = r.facetas.find((f) => f.chave === 'nivel')?.opcoes.find((o) => o.valor === 'iconological')?.n ?? 0
    expect(await objetosDoAcerto()).toEqual(['CA00003'])
    expect(nivel).toBe(1)
    expect(r.objetos.map((o) => o.numero)).toEqual(['CA00003'])
  })
})
