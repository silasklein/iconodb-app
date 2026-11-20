/**
 * Plano «Os mapas da introdução pelo mapa do app», Tarefa 1 (desenho § 9, decisão 94): a tabela dos mapas do livro e a escolha
 * das entradas de cada mapa. Com uma tabela sintética (ids e códigos inventados), salvo o teste da forma da tabela real.
 */
import { describe, expect, it } from 'vitest'
import { MAPAS_DO_LIVRO, PARES_DOS_MAPAS, conferirParesDosMapas, contarSitios, entradasDoMapa, sitiosDasEntradas } from './mapasDoLivro'

const TABELA = { 'CAP-A': ['XA', 'XB'], 'CAP-B': ['YA'], 'CAP-SO': ['ZA'] } as const

const E = (itemId: string, ...ebw: string[]) => ({ itemId, ebw })
const ENTRADAS = [E('i1', 'XA'), E('i2', 'YA'), E('i3'), E('i4', 'QQ'), E('i5', 'XB', 'YA'), E('i6', 'YA', 'QQ'), E('i7', 'XB')]

describe('entradasDoMapa', () => {
  it('a legenda fora da tabela: todas as entradas da parte, na ordem dada', () => {
    expect(entradasDoMapa('CAP-FORA', ['CAP-FORA'], ENTRADAS, TABELA)).toEqual(['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7'])
    // fora da tabela mesmo quando a outra legenda da parte está nela
    expect(entradasDoMapa('CAP-FORA', ['CAP-FORA', 'CAP-A'], ENTRADAS, TABELA)).toEqual(['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7'])
  })

  it('o par na tabela: cada legenda com as suas; sem código ou fora dos dois mapas, nas duas', () => {
    const par = ['CAP-A', 'CAP-B']
    // i3 sem código e i4 com um código de nenhum dos dois: nas duas; i5 (XB e YA) e i6 (YA e um de fora): pelas que tem
    expect(entradasDoMapa('CAP-A', par, ENTRADAS, TABELA)).toEqual(['i1', 'i3', 'i4', 'i5', 'i7'])
    expect(entradasDoMapa('CAP-B', par, ENTRADAS, TABELA)).toEqual(['i2', 'i3', 'i4', 'i5', 'i6'])
  })

  it('uma legenda da tabela sozinha na parte: todas (não há o outro mapa)', () => {
    expect(entradasDoMapa('CAP-SO', ['CAP-SO'], ENTRADAS, TABELA)).toEqual(['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7'])
  })

  it('sem entradas, nada', () => {
    expect(entradasDoMapa('CAP-A', ['CAP-A', 'CAP-B'], [], TABELA)).toEqual([])
  })

  it('a tabela padrão é MAPAS_DO_LIVRO', () => {
    const [legenda, codigos] = Object.entries(MAPAS_DO_LIVRO)[0]!
    const outra = Object.keys(MAPAS_DO_LIVRO).find((k) => k !== legenda && MAPAS_DO_LIVRO[k]!.every((c) => !codigos.includes(c)))!
    const entradas = [E('a', codigos[0]!), E('b', MAPAS_DO_LIVRO[outra]![0]!)]
    expect(entradasDoMapa(legenda, [legenda, outra], entradas)).toEqual(['a'])
  })
})

describe('MAPAS_DO_LIVRO (§ 9: os três pares de legendas do IPIAO)', () => {
  it('as seis legendas, pelos ids dos trechos, com os códigos EBW de cada mapa', () => {
    expect(MAPAS_DO_LIVRO).toEqual({
      'PA-IPIAO-I.S.51-cap-1': ['PPNA', 'PPNB', 'PPNC'],
      'PA-IPIAO-I.S.53-cap-1': ['PNE'],
      'PA-IPIAO-I.S.157-cap-1': ['EBI'],
      'PA-IPIAO-I.S.159-cap-1': ['EBII', 'EBIII'],
      'PA-IPIAO-IV.S.13-cap-1': ['LBIII', 'IAI', 'EIIA', 'LIIA'],
      'PA-IPIAO-IV.S.14-cap-1': ['IIB', 'IIC', 'IID', 'EPER'],
    })
  })

  it('os dois mapas de cada par não dividem nenhum código', () => {
    const pares = [
      ['PA-IPIAO-I.S.51-cap-1', 'PA-IPIAO-I.S.53-cap-1'],
      ['PA-IPIAO-I.S.157-cap-1', 'PA-IPIAO-I.S.159-cap-1'],
      ['PA-IPIAO-IV.S.13-cap-1', 'PA-IPIAO-IV.S.14-cap-1'],
    ] as const
    for (const [a, b] of pares) expect(MAPAS_DO_LIVRO[a]!.filter((c) => MAPAS_DO_LIVRO[b]!.includes(c))).toEqual([])
  })
})

describe('PARES_DOS_MAPAS e conferirParesDosMapas (Tarefa 2: as duas legendas de cada par na mesma parte)', () => {
  it('os três pares, que cobrem a tabela, cada legenda uma vez', () => {
    expect(PARES_DOS_MAPAS).toEqual([
      ['PA-IPIAO-I.S.51-cap-1', 'PA-IPIAO-I.S.53-cap-1'],
      ['PA-IPIAO-I.S.157-cap-1', 'PA-IPIAO-I.S.159-cap-1'],
      ['PA-IPIAO-IV.S.13-cap-1', 'PA-IPIAO-IV.S.14-cap-1'],
    ])
    expect(PARES_DOS_MAPAS.flat().sort()).toEqual(Object.keys(MAPAS_DO_LIVRO).sort())
  })

  const PARES = [
    ['PA-TESTE-I.S.11-cap-1', 'PA-TESTE-I.S.11-cap-2'],
    ['PA-TESTE-I.S.9-cap-1', 'PA-TESTE-I.S.19-cap-1'],
    ['PA-TESTE-I.S.9-cap-1', 'PA-TESTE-I.S.40-cap-1'],
    ['PA-OUTRA-I.S.1-cap-1', 'PA-OUTRA-I.S.2-cap-1'],
  ] as const
  const PARTES = new Map([
    ['PA-TESTE-I.S.9-cap-1', 'I, parte 1'],
    ['PA-TESTE-I.S.11-cap-1', 'I, parte 1'],
    ['PA-TESTE-I.S.11-cap-2', 'I, parte 1'],
    ['PA-TESTE-I.S.19-cap-1', 'I, parte 2'],
  ])

  it('só os pares da obra; ok quando as duas estão na mesma parte; partes diferentes ou uma legenda que falta, não', () => {
    expect(conferirParesDosMapas('TESTE', (l) => PARTES.get(l) ?? null, PARES)).toEqual([
      { par: PARES[0], partes: ['I, parte 1', 'I, parte 1'], ok: true },
      { par: PARES[1], partes: ['I, parte 1', 'I, parte 2'], ok: false },
      { par: PARES[2], partes: ['I, parte 1', null], ok: false },
    ])
  })

  it('a obra sem pares na tabela: nenhum; a tabela padrão é PARES_DOS_MAPAS', () => {
    expect(conferirParesDosMapas('TESTE', () => 'I, parte 1')).toEqual([])
    expect(conferirParesDosMapas('IPIAO', () => 'x').map((r) => r.par)).toEqual(PARES_DOS_MAPAS)
  })
})

describe('sitiosDasEntradas e contarSitios (o mapa da página e a conferência dividem a conta)', () => {
  const S = (id: string, lat: number | null = 31, lon: number | null = 35) => ({ id, lat, lon })
  const LISTA = [S('T-1'), S('T-2', null, null), S('T-3'), S('SI-x-1')]

  it('um sítio por destino, na ordem das entradas; sem sítio, ou com um sítio que a lista não tem, não conta', () => {
    const destinos = new Map([['T-9', 'T-1']])
    expect(sitiosDasEntradas(['T-3', null, 'T-1', 'T-9', 'T-2', 'T-3', 'SI-sumiu-1', 'SI-x-1'], LISTA, destinos).map((s) => s.id)).toEqual(['T-3', 'T-1', 'T-2', 'SI-x-1'])
    expect(sitiosDasEntradas(['T-9'], LISTA, null)).toEqual([])
  })

  it('contarSitios: com e sem coordenada', () => {
    expect(contarSitios(LISTA)).toEqual({ comCoordenada: 3, semCoordenada: 1 })
    expect(contarSitios([])).toEqual({ comCoordenada: 0, semCoordenada: 0 })
  })
})
