/// <reference types="node" />
/**
 * Parte 2C, bloco 2 (Foco da revisão 3): dois aparelhos que decidem o contrário sobre os sítios, ou um aparelho com o app
 * antigo (só `variantes`). Cada aparelho tem o próprio IndexedDB e o mesmo Dropbox em memória; o relógio é o de `Date.now`,
 * que o teste avança (a ordem «depois» não depende da sorte do milissegundo). Nada some sem aviso: vale o mais recente, e o
 * círculo vira conflito só no aparelho que perdeu.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { novoAparelho, type AparelhoSimulado } from '../../tests/suporte/aparelhoSimulado'
import { DropboxEmMemoria } from '../../tests/suporte/dropboxEmMemoria'
import { T0 } from '../../tests/suporte/eventosDeTeste'
import { hlcDoSitio, lerDadosDoSitio } from './modelo'
import { conflitosDesteAparelho, resolverSitios, type PacoteDeSitios } from './resolucao'

const PACOTE: PacoteDeSitios = {
  sitios: new Set(['TESTE-1', 'TESTE-2', 'TESTE-3', 'TESTE-4', 'TESTE-5']),
  publicados: new Map(),
  criados: new Set(),
  mesclas: new Map(),
  partes: new Map(),
  grafias: [],
  pares: [],
}

let nuvem: DropboxEmMemoria
let agora: number
beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', undefined)
  nuvem = new DropboxEmMemoria()
  agora = T0
  vi.spyOn(Date, 'now').mockImplementation(() => agora)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** O relógio anda um minuto (a ação seguinte é «depois»). */
const depois = () => {
  agora += 60_000
}
const sincronizar = (ap: AparelhoSimulado) => ap.sync.sincronizar(ap.escrita, { motivo: 'manual' })
async function sincronizarOsDois(A: AparelhoSimulado, B: AparelhoSimulado) {
  await sincronizar(A)
  await sincronizar(B)
  await sincronizar(A)
  expect(A.fusao.estadoCanonico(A.estado.estadoAtual())).toBe(B.fusao.estadoCanonico(B.estado.estadoAtual()))
}
const resolver = (ap: AparelhoSimulado) => resolverSitios(ap.estado.estadoAtual(), PACOTE)

describe('dois aparelhos e os sítios', () => {
  it('(a) A mescla X em Y; B, sem ter visto, mescla Y em X depois: os dois resolvem igual (X fica) e só A tem o conflito', async () => {
    const A = await novoAparelho(nuvem, 'Mac')
    const B = await novoAparelho(nuvem, 'iPhone')
    await A.sitios.mesclarSitios('TESTE-2', 'TESTE-1')
    depois()
    await B.sitios.mesclarSitios('TESTE-1', 'TESTE-2')
    depois()
    await sincronizarOsDois(A, B)
    for (const ap of [A, B]) {
      const r = resolver(ap)
      expect(r.destino('TESTE-1')).toBe('TESTE-1')
      expect(r.destino('TESTE-2')).toBe('TESTE-1')
      expect(r.conflitos).toHaveLength(1)
      expect(conflitosDesteAparelho(r, A.id)).toEqual([
        expect.objectContaining({ tipo: 'mescla', registro: 'TESTE-1', valor: 'TESTE-2', aparelho: A.id, vencedor: expect.objectContaining({ registro: 'TESTE-2', valor: 'TESTE-1', aparelho: B.id }) }),
      ])
      expect(conflitosDesteAparelho(r, B.id)).toEqual([])
    }
  })

  it('(b) A desfaz a mescla que B fez, e B não faz mais nada: fica desfeita nos dois', async () => {
    const A = await novoAparelho(nuvem, 'Mac')
    const B = await novoAparelho(nuvem, 'iPhone')
    await B.sitios.mesclarSitios('TESTE-4', 'TESTE-3')
    depois()
    await sincronizarOsDois(A, B)
    expect(resolver(A).destino('TESTE-3')).toBe('TESTE-4')
    depois()
    await A.sitios.desfazerMescla('TESTE-3', [])
    depois()
    await sincronizarOsDois(A, B)
    for (const ap of [A, B]) {
      const r = resolver(ap)
      expect(r.destino('TESTE-3')).toBe('TESTE-3')
      expect(r.absorvidos('TESTE-4')).toEqual([])
      expect(r.conflitos).toEqual([])
    }
  })

  it('(c) A (app novo) grava grafias e B (app antigo) grava variantes depois: as duas listas juntas, sem repetir', async () => {
    const A = await novoAparelho(nuvem, 'Mac')
    const B = await novoAparelho(nuvem, 'iPhone')
    await A.sitios.corrigirGrafias('TESTE-5', [{ texto: 'Tel Cinco', tradicao: 'arabe', livro: 'TESTE' }])
    depois()
    // o app antigo só conhece `variantes` (a lista de textos que ele lia antes, mais uma)
    await B.estado.registrar('sitio', 'TESTE-5', 'alterar', { variantes: ['tel cinco', 'Tall Cinco'] })
    depois()
    await sincronizarOsDois(A, B)
    for (const ap of [A, B]) {
      expect(resolver(ap).grafiasDoUsuario('TESTE-5')).toEqual([{ texto: 'Tel Cinco', tradicao: 'arabe', livro: 'TESTE' }, { texto: 'Tall Cinco' }])
      const e = ap.estado.estadoAtual()
      expect(lerDadosDoSitio(e.registro('sitio', 'TESTE-5')!, hlcDoSitio(e, 'TESTE-5')).variantes).toEqual(['Tel Cinco', 'Tall Cinco'])
    }
  })

  it('(c) na ordem inversa (variantes do app antigo, depois grafias do novo): só as grafias', async () => {
    const A = await novoAparelho(nuvem, 'Mac')
    const B = await novoAparelho(nuvem, 'iPhone')
    await B.estado.registrar('sitio', 'TESTE-5', 'alterar', { variantes: ['Tel Cinco', 'Tall Cinco'] })
    depois()
    await A.sitios.corrigirGrafias('TESTE-5', [{ texto: 'Tel Cinco', tradicao: 'arabe' }])
    depois()
    await sincronizarOsDois(A, B)
    for (const ap of [A, B]) expect(resolver(ap).grafiasDoUsuario('TESTE-5')).toEqual([{ texto: 'Tel Cinco', tradicao: 'arabe' }])
  })

  it('os vetores da fusão e da numeração continuam os de sempre', () => {
    const sha = (nome: string) => createHash('sha256').update(readFileSync(join(import.meta.dirname, '..', '..', 'tests', 'fixtures', nome))).digest('hex')
    expect(sha('fusao-vetores.json')).toBe('57a058a0a8aeb0f2a40895a27d1f7e00cc4e04afab1ebf4d7baeaac309821fe7')
    expect(sha('numerar-vetores.json')).toBe('00db81646ec838d40c906e9e9ba5cbd3f3c01c6a07096754062169c2f86e5ffa')
  })
})
