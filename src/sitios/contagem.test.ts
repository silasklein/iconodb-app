/**
 * Parte 2C, bloco 2: o que o destino soma — os objetos dele, dos absorvidos e das partes (`contagemDoSitio`) e os campos simples
 * vazios que vêm de um absorvido (`dadosDoDestino`, regra 4 do §5: o de menor id por ponto de código primeiro, como o
 * processamento, iconodb/sitios_relacoes.py).
 */
import { A, ev } from '../../tests/suporte/eventosDeTeste'
import type { Json } from '../usuario/eventos'
import { fundir } from '../usuario/fusao'
import { arvoreDoSitio, contagemDoSitio, dadosDoDestino, objetosDoPacoteNaArvore, totalDeObjetos } from './contagem'
import { PACOTE_VAZIO, resolverSitios, type PacoteDeSitios } from './resolucao'
import type { Coordenada } from './modelo'

let seq = 0
const sit = (reg: string, campos: Record<string, Json>, op: 'criar' | 'alterar' = 'alterar') => ev({ ap: A, seq: ++seq, tipo: 'sitio', reg, op, campos })
const pacote = (ids: readonly string[], mais: Partial<PacoteDeSitios> = {}): PacoteDeSitios => ({ ...PACOTE_VAZIO, sitios: new Set(ids), ...mais })

describe('contagemDoSitio', () => {
  // A árvore das telas aprovadas: Tell Teste (TESTE-3, 7 objetos) com as partes Área Teste BB (3 próprios; o Túmulo T-1 dentro
  // dela com 1) e Área Teste CC (1). «12 objetos, 5 nas partes».
  const arvore = [
    sit('SI-aaaaaaaa-1', { nome: 'Área Teste BB', parteDe: 'TESTE-3' }, 'criar'),
    sit('SI-aaaaaaaa-2', { nome: 'Túmulo T-1', parteDe: 'SI-aaaaaaaa-1' }, 'criar'),
    sit('SI-aaaaaaaa-3', { nome: 'Área Teste CC', parteDe: 'TESTE-3' }, 'criar'),
  ]
  const estado = fundir(arvore)
  const objetos = new Map([
    ['TESTE-3', 7],
    ['SI-aaaaaaaa-1', 3],
    ['SI-aaaaaaaa-2', 1],
    ['SI-aaaaaaaa-3', 1],
  ])
  const objetosDe = (id: string) => objetos.get(id) ?? 0

  it('o todo: os próprios, os das partes (em todos os níveis) e o total', () => {
    const r = resolverSitios(estado, pacote(['TESTE-3']))
    expect(contagemDoSitio(r, 'TESTE-3', objetosDe)).toEqual({ proprios: 7, nasPartes: 5, total: 12 })
    expect(contagemDoSitio(r, 'SI-aaaaaaaa-1', objetosDe)).toEqual({ proprios: 3, nasPartes: 1, total: 4 })
    expect(contagemDoSitio(r, 'SI-aaaaaaaa-2', objetosDe)).toEqual({ proprios: 1, nasPartes: 0, total: 1 })
    expect(contagemDoSitio(r, 'SI-aaaaaaaa-3', objetosDe)).toEqual({ proprios: 1, nasPartes: 0, total: 1 })
  })

  it('os absorvidos somam nos próprios do destino (também os de uma parte); o absorvido conta como o destino', () => {
    const comMescla = fundir([...arvore, sit('TESTE-4', { mescladoEm: 'TESTE-3' }), sit('TESTE-5', { mescladoEm: 'SI-aaaaaaaa-3' })])
    const r = resolverSitios(comMescla, pacote(['TESTE-3', 'TESTE-4', 'TESTE-5']))
    const mais = (id: string) => (id === 'TESTE-4' ? 2 : id === 'TESTE-5' ? 4 : objetosDe(id))
    expect(contagemDoSitio(r, 'TESTE-3', mais)).toEqual({ proprios: 9, nasPartes: 9, total: 18 })
    expect(contagemDoSitio(r, 'SI-aaaaaaaa-3', mais)).toEqual({ proprios: 5, nasPartes: 0, total: 5 })
    expect(contagemDoSitio(r, 'TESTE-4', mais)).toEqual(contagemDoSitio(r, 'TESTE-3', mais))
  })

  it('um sítio sem partes nem absorvidos: só os dele', () => {
    const r = resolverSitios(fundir([]), pacote(['TESTE-1']))
    expect(contagemDoSitio(r, 'TESTE-1', () => 6)).toEqual({ proprios: 6, nasPartes: 0, total: 6 })
  })
})

describe('totalDeObjetos e arvoreDoSitio', () => {
  const estado = fundir([sit('TESTE-4', { mescladoEm: 'TESTE-2' }), sit('TESTE-5', { parteDe: 'TESTE-2' }), sit('TESTE-6', { mescladoEm: 'TESTE-5' })])
  const r = resolverSitios(estado, pacote(['TESTE-2', 'TESTE-4', 'TESTE-5', 'TESTE-6']))

  it('a árvore de um destino: ele, os absorvidos, e cada parte com os absorvidos dela', () => {
    expect(arvoreDoSitio(r, 'TESTE-2')).toEqual(['TESTE-2', 'TESTE-4', 'TESTE-5', 'TESTE-6'])
    expect(arvoreDoSitio(r, 'TESTE-4')).toEqual(arvoreDoSitio(r, 'TESTE-2'))
  })

  it('os do pacote: os sem repetir da árvore, quando há; senão a soma. Os da pessoa: sempre a soma', () => {
    const pacoteDe = (id: string) => ({ 'TESTE-2': 3, 'TESTE-4': 2, 'TESTE-5': 1 })[id] ?? 0
    const daPessoa = (id: string) => (id === 'TESTE-6' ? 1 : 0)
    expect(totalDeObjetos(r, 'TESTE-2', pacoteDe, daPessoa)).toBe(7)
    expect(totalDeObjetos(r, 'TESTE-2', pacoteDe, daPessoa, new Map([['TESTE-2', 4]]))).toBe(5)
    expect(totalDeObjetos(r, 'TESTE-4', pacoteDe, daPessoa, new Map([['TESTE-2', 4]]))).toBe(5)
  })
})

describe('dadosDoDestino', () => {
  type Dados = { coordenada: Coordenada | null; regiao: string | null; pais: string | null; nota: string | null }
  const vazio: Dados = { coordenada: null, regiao: null, pais: null, nota: null }

  it('destino sem coordenada e dois absorvidos com: vale a do de menor id por ponto de código ("TESTE-10" < "TESTE-9")', () => {
    const estado = fundir([sit('TESTE-9', { mescladoEm: 'TESTE-1' }), sit('TESTE-10', { mescladoEm: 'TESTE-1' })])
    const r = resolverSitios(estado, pacote(['TESTE-1', 'TESTE-9', 'TESTE-10']))
    const dados: Record<string, Dados> = {
      'TESTE-1': { ...vazio, regiao: 'Região do destino' },
      'TESTE-9': { coordenada: { lat: 31.9, lon: 35.2 }, regiao: 'Região 9', pais: 'País 9', nota: null },
      'TESTE-10': { coordenada: { lat: 32.1, lon: 35.4 }, regiao: null, pais: null, nota: 'Nota 10' },
    }
    const d = dadosDoDestino(r, 'TESTE-1', (id) => dados[id] ?? vazio)
    expect(d).toEqual({
      coordenada: { lat: 32.1, lon: 35.4 },
      regiao: 'Região do destino',
      pais: 'País 9',
      nota: 'Nota 10',
      origem: { coordenada: 'TESTE-10', regiao: 'TESTE-1', pais: 'TESTE-9', nota: 'TESTE-10' },
    })
    // Pedido pelo absorvido: o mesmo do destino.
    expect(dadosDoDestino(r, 'TESTE-9', (id) => dados[id] ?? vazio)).toEqual(d)
  })

  it('o campo que o destino tem vence; um texto vazio conta como vazio; sem nada, null e sem origem', () => {
    const estado = fundir([sit('TESTE-2', { mescladoEm: 'TESTE-1' })])
    const r = resolverSitios(estado, pacote(['TESTE-1', 'TESTE-2']))
    const dados: Record<string, Dados> = {
      'TESTE-1': { coordenada: { lat: 1, lon: 2 }, regiao: '', pais: null, nota: null },
      'TESTE-2': { coordenada: { lat: 3, lon: 4 }, regiao: 'Região 2', pais: null, nota: null },
    }
    expect(dadosDoDestino(r, 'TESTE-1', (id) => dados[id] ?? vazio)).toEqual({
      coordenada: { lat: 1, lon: 2 },
      regiao: 'Região 2',
      pais: null,
      nota: null,
      origem: { coordenada: 'TESTE-1', regiao: 'TESTE-2' },
    })
  })
})

describe('objetosDoPacoteNaArvore (Tarefa 12, revisão 1: a lista conta como a página)', () => {
  // TESTE-2 (com TESTE-4 mesclado) › TESTE-5 › TESTE-6; SI-aaaaaaaa-9 publicado como TESTE-6
  const r = resolverSitios(fundir([sit('TESTE-4', { mescladoEm: 'TESTE-2' }), sit('TESTE-5', { parteDe: 'TESTE-2' }), sit('TESTE-6', { parteDe: 'TESTE-5' })]), {
    ...pacote(['TESTE-1', 'TESTE-2', 'TESTE-4', 'TESTE-5', 'TESTE-6']),
    publicados: new Map([['SI-aaaaaaaa-9', 'TESTE-6']]),
  })
  const arvore = arvoreDoSitio(r, 'TESTE-2')
  const numeros = new Set(['CA00003', 'CA00004', 'BA00002'])

  it('sem trocas, os objetos do pacote da árvore', () => {
    expect(objetosDoPacoteNaArvore(r, arvore, numeros, null)).toBe(3)
    expect(objetosDoPacoteNaArvore(r, arvore, numeros, new Map())).toBe(3)
  })

  it('um objeto do pacote que a pessoa ligou a um sítio da mesma árvore conta só pela pessoa; ligado a um de fora, continua', () => {
    const trocas = new Map([
      ['CA00003', { sitio: 'TESTE-6' }],
      ['CA00004', { sitio: 'SI-aaaaaaaa-9' }],
      ['BA00002', { sitio: 'TESTE-1' }],
      ['CA00009', { sitio: 'TESTE-5' }],
    ])
    // CA00003 e CA00004 (pelo `SI-…` publicado como TESTE-6) estão na árvore; BA00002 foi para fora; CA00009 não é do pacote
    expect(objetosDoPacoteNaArvore(r, arvore, numeros, trocas)).toBe(1)
    // o total da lista (pacote sem repetir + o que a pessoa ligou na árvore) é o da página: BA00002, CA00003, CA00004, CA00009
    const daPessoa = (id: string) => (id === 'TESTE-6' ? 2 : id === 'TESTE-5' ? 1 : id === 'TESTE-1' ? 1 : 0)
    expect(totalDeObjetos(r, 'TESTE-2', () => 0, daPessoa, new Map([['TESTE-2', objetosDoPacoteNaArvore(r, arvore, numeros, trocas)]]))).toBe(4)
  })
})
