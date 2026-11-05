/**
 * A bandeja sincroniza como o resto da camada do usuário: dois aparelhos (cada um com o próprio IndexedDB, ligados ao mesmo
 * Dropbox em memória) acrescentam objetos diferentes sem internet; depois de sincronizar convergem à mesma lista de 4 e aos
 * mesmos que não couberam. Sem rede.
 */
import { novoAparelho, type AparelhoSimulado } from '../../tests/suporte/aparelhoSimulado'
import { DropboxEmMemoria } from '../../tests/suporte/dropboxEmMemoria'
import { campoDaPresenca, lerBandeja, planejarEntrada, REG_DA_BANDEJA } from './modelo'

let nuvem: DropboxEmMemoria
beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', undefined)
  nuvem = new DropboxEmMemoria()
})
afterEach(() => vi.unstubAllGlobals())

const sincronizar = (ap: AparelhoSimulado) => ap.sync.sincronizar(ap.escrita, { motivo: 'manual' })
const bandeja = (ap: AparelhoSimulado) => lerBandeja(ap.estado.estadoAtual().registro('comparar', REG_DA_BANDEJA))
/** O que a tela faz ao tocar em "Comparar": planeja pela bandeja deste aparelho e grava o evento no IndexedDB dele. */
async function poe(ap: AparelhoSimulado, ref: string) {
  const e = planejarEntrada(bandeja(ap), ref)
  if (e.tipo !== 'entrou') return e
  await ap.estado.registrar('comparar', REG_DA_BANDEJA, ap.estado.estadoAtual().registro('comparar', REG_DA_BANDEJA) ? 'alterar' : 'criar', e.campos)
  return e
}

describe('a bandeja entre dois aparelhos', () => {
  it('um põe, o outro vê (a bandeja é uma só)', async () => {
    const A = await novoAparelho(nuvem, 'Mac')
    const B = await novoAparelho(nuvem, 'iPhone')
    await poe(A, 'CA00001')
    await sincronizar(A)
    await sincronizar(B)
    expect(bandeja(B).itens).toEqual(['CA00001'])
  })

  it('cada um acrescenta, sem internet, objetos diferentes: depois de sincronizar os dois veem a mesma lista de 4 e os mesmos excedentes', async () => {
    const A = await novoAparelho(nuvem, 'Mac')
    const B = await novoAparelho(nuvem, 'iPhone')
    await poe(A, 'CA00001')
    await sincronizar(A)
    await sincronizar(B)
    // sem internet: nenhum sincroniza enquanto acrescenta
    for (const ref of ['CA00002', 'CA00003']) await poe(A, ref)
    for (const ref of ['BA00001', 'BA00002']) await poe(B, ref)
    expect(bandeja(A).itens).toEqual(['CA00001', 'CA00002', 'CA00003'])
    expect(bandeja(B).itens).toEqual(['CA00001', 'BA00001', 'BA00002'])
    // volta a internet
    await sincronizar(A)
    await sincronizar(B)
    await sincronizar(A)
    expect(A.fusao.estadoCanonico(A.estado.estadoAtual())).toBe(B.fusao.estadoCanonico(B.estado.estadoAtual()))
    const a = bandeja(A)
    const b = bandeja(B)
    expect(a.itens).toHaveLength(4)
    expect(b.itens).toEqual(a.itens)
    expect(b.excedentes).toEqual(a.excedentes)
    expect(a.excedentes).toHaveLength(1)
    // nada se perdeu: os cinco estão ou na bandeja ou entre os que não couberam
    expect([...a.itens, ...a.excedentes].sort()).toEqual(['BA00001', 'BA00002', 'CA00001', 'CA00002', 'CA00003'])
  })

  it('um tira um objeto da bandeja e, depois de sincronizar, no outro o primeiro que não coube entra no lugar', async () => {
    const A = await novoAparelho(nuvem, 'Mac')
    const B = await novoAparelho(nuvem, 'iPhone')
    for (const ref of ['CA00001', 'CA00002', 'CA00003']) await poe(A, ref)
    for (const ref of ['BA00001', 'BA00002']) await poe(B, ref)
    for (let i = 0; i < 3; i++) {
      await sincronizar(A)
      await sincronizar(B)
    }
    const antes = bandeja(B)
    expect(antes.excedentes).toHaveLength(1)
    const sai = antes.itens[0]!
    await A.estado.registrar('comparar', REG_DA_BANDEJA, 'alterar', { [campoDaPresenca(sai)]: null })
    for (let i = 0; i < 2; i++) {
      await sincronizar(A)
      await sincronizar(B)
    }
    expect(bandeja(B).itens).toEqual([...antes.itens.slice(1), antes.excedentes[0]!])
    expect(bandeja(B).excedentes).toEqual([])
    expect(bandeja(A).itens).toEqual(bandeja(B).itens)
  })
})
