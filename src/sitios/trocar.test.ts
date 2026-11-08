/**
 * Parte 2C, bloco 2 (Tarefa 14; telas aprovadas §5): as linhas da folha «Sítio deste objeto» em árvore (`opcoesDaTroca`). A
 * árvore e os números são os das telas: Tell Teste (o atual) › Área Teste BB › Túmulo T-1; Área Teste CC; Khirbet Modelo e Tell
 * Modelo («antes: Tall Modelo») à parte; Tell Exemplo mesclado em Tell Teste.
 */
import { dobrar } from '../glossario/modelo'
import type { Json } from '../usuario/eventos'
import { fundir } from '../usuario/fusao'
import { A, ev } from '../../tests/suporte/eventosDeTeste'
import type { OpcaoDeSitio } from './doUsuario'
import { PACOTE_VAZIO, resolverSitios } from './resolucao'
import { opcoesDaTroca } from './trocar'

let seq = 0
const sit = (reg: string, campos: Record<string, Json>) => ev({ ap: A, seq: ++seq, tipo: 'sitio', reg, op: 'criar', campos })
// Os ids estão fora da ordem alfabética dos nomes, para a árvore mostrar que a ordem é a dos nomes.
const estado = fundir([
  sit('SI-aaaaaaaa-1', { nome: 'Área Teste CC', parteDe: 'TESTE-3' }),
  sit('SI-aaaaaaaa-2', { nome: 'Túmulo T-1', parteDe: 'SI-aaaaaaaa-3' }),
  sit('SI-aaaaaaaa-3', { nome: 'Área Teste BB', parteDe: 'TESTE-3' }),
  sit('SI-aaaaaaaa-4', { nome: 'Tell Exemplo', mescladoEm: 'TESTE-3' }),
  sit('SI-aaaaaaaa-7', { nome: 'Khirbet Modelo' }),
])
const r = resolverSitios(estado, { ...PACOTE_VAZIO, sitios: new Set(['TESTE-3', 'TESTE-4']) })
const op = (id: string, nome: string, objetos: number, mais: Partial<OpcaoDeSitio> = {}): OpcaoDeSitio => ({
  id,
  nome,
  regiao: 'Região Teste',
  doUsuario: id.startsWith('SI-'),
  nomeDoLivro: null,
  grafias: [],
  objetos,
  ...mais,
})
// como `opcoesDeSitio` as dá: sem o absorvido (o nome dele é grafia do destino), em ordem alfabética, as contagens já com as partes
const opcoes = [
  op('SI-aaaaaaaa-3', 'Área Teste BB', 4, { regiao: null }),
  op('SI-aaaaaaaa-1', 'Área Teste CC', 1, { regiao: null }),
  op('SI-aaaaaaaa-7', 'Khirbet Modelo', 2),
  op('TESTE-4', 'Tell Modelo', 6, { nomeDoLivro: 'Tall Modelo', grafias: ['Tall Modelo'] }),
  op('TESTE-3', 'Tell Teste', 12, { grafias: ['Tell Exemplo'] }),
  op('SI-aaaaaaaa-2', 'Túmulo T-1', 1, { regiao: null }),
]
const palavras = (texto: string) => dobrar(texto).split(' ').filter(Boolean)
const ver = (lista: ReturnType<typeof opcoesDaTroca>) => lista.map((l) => [l.opcao.nome, l.nivel, l.apoio])

describe('opcoesDaTroca: a lista da folha «Sítio deste objeto» em árvore', () => {
  it('sem busca («Sítios 5»): o atual sai, e as partes dele vêm PRIMEIRO, recuadas, com «parte de…»; depois a árvore dos outros', () => {
    const linhas = opcoesDaTroca(r, opcoes, 'TESTE-3', [])
    expect(linhas).toHaveLength(5)
    expect(ver(linhas)).toEqual([
      ['Área Teste BB', 1, 'parte de Tell Teste · 4 objetos'],
      ['Túmulo T-1', 2, 'parte de Área Teste BB · 1 objeto'],
      ['Área Teste CC', 1, 'parte de Tell Teste · 1 objeto'],
      ['Khirbet Modelo', 0, 'Região Teste · 2 objetos'],
      ['Tell Modelo', 0, 'antes: Tall Modelo · Região Teste · 6 objetos'],
    ])
    expect(linhas[1]!.opcao.id).toBe('SI-aaaaaaaa-2')
  })

  it('com mais de 8 sítios de cima, as partes do atual continuam nas 8 primeiras linhas (o limite da folha)', () => {
    // nove sítios de cima antes de «Tell Teste» na ordem alfabética: no lugar dele, as partes ficariam depois da 8ª linha
    const muitos = [...'ABCDEFGHI'].map((l, i) => op(`TESTE-${20 + i}`, `Abu ${l} Teste`, 1))
    const r2 = resolverSitios(estado, { ...PACOTE_VAZIO, sitios: new Set(['TESTE-3', 'TESTE-4', ...muitos.map((o) => o.id)]) })
    const todas = [...muitos, ...opcoes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
    const linhas = opcoesDaTroca(r2, todas, 'TESTE-3', [])
    expect(linhas).toHaveLength(14)
    expect(ver(linhas.slice(0, 8)).map(([nome, nivel]) => [nome, nivel])).toEqual([
      ['Área Teste BB', 1],
      ['Túmulo T-1', 2],
      ['Área Teste CC', 1],
      ['Abu A Teste', 0],
      ['Abu B Teste', 0],
      ['Abu C Teste', 0],
      ['Abu D Teste', 0],
      ['Abu E Teste', 0],
    ])
    // a árvore dos outros, como antes, depois das partes do atual
    expect(linhas.slice(3).map((l) => l.opcao.nome)).toEqual([...muitos.map((o) => o.nome), 'Khirbet Modelo', 'Tell Modelo'])
  })

  it('com a busca «túmulo» («Resultado 1»): a parte cujo todo não está no resultado vem sem recuo e com o caminho inteiro', () => {
    expect(ver(opcoesDaTroca(r, opcoes, 'TESTE-3', palavras('túmulo')))).toEqual([['Túmulo T-1', 0, 'Tell Teste › Área Teste BB · 1 objeto']])
  })

  it('um todo que está no resultado traz recuadas sob ele as partes que também casam (a busca procura também na região)', () => {
    expect(ver(opcoesDaTroca(r, opcoes, 'SI-aaaaaaaa-7', palavras('teste')))).toEqual([
      ['Tell Modelo', 0, 'antes: Tall Modelo · Região Teste · 6 objetos'],
      ['Tell Teste', 0, 'Região Teste · 12 objetos'],
      ['Área Teste BB', 1, 'parte de Tell Teste · 4 objetos'],
      ['Área Teste CC', 1, 'parte de Tell Teste · 1 objeto'],
    ])
  })

  it('o atual dado por um sítio mesclado é o destino dele; sem sítio atual, o todo aparece com as partes', () => {
    expect(ver(opcoesDaTroca(r, opcoes, 'SI-aaaaaaaa-4', []))).toEqual(ver(opcoesDaTroca(r, opcoes, 'TESTE-3', [])))
    expect(ver(opcoesDaTroca(r, opcoes, null, [])).map(([nome, nivel]) => [nome, nivel])).toEqual([
      ['Khirbet Modelo', 0],
      ['Tell Modelo', 0],
      ['Tell Teste', 0],
      ['Área Teste BB', 1],
      ['Túmulo T-1', 2],
      ['Área Teste CC', 1],
    ])
  })

  it('a parte atual sai, e as partes dela vêm primeiro, com o recuo de antes', () => {
    expect(ver(opcoesDaTroca(r, opcoes, 'SI-aaaaaaaa-3', []))).toEqual([
      ['Túmulo T-1', 2, 'parte de Área Teste BB · 1 objeto'],
      ['Khirbet Modelo', 0, 'Região Teste · 2 objetos'],
      ['Tell Modelo', 0, 'antes: Tall Modelo · Região Teste · 6 objetos'],
      ['Tell Teste', 0, 'Região Teste · 12 objetos'],
      ['Área Teste CC', 1, 'parte de Tell Teste · 1 objeto'],
    ])
    // com busca, nada muda: as partes do atual que casam ficam no lugar dele
    expect(ver(opcoesDaTroca(r, opcoes, 'TESTE-3', palavras('teste')))).toEqual([
      ['Khirbet Modelo', 0, 'Região Teste · 2 objetos'],
      ['Tell Modelo', 0, 'antes: Tall Modelo · Região Teste · 6 objetos'],
      ['Área Teste BB', 1, 'parte de Tell Teste · 4 objetos'],
      ['Área Teste CC', 1, 'parte de Tell Teste · 1 objeto'],
    ])
    expect(ver(opcoesDaTroca(r, opcoes, 'SI-aaaaaaaa-7', palavras('modelo teste'))).map(([nome]) => nome)).toEqual(['Tell Modelo'])
  })

  it('sem a resolução (ainda não chegou): a lista simples, como antes', () => {
    expect(ver(opcoesDaTroca(null, opcoes, 'TESTE-3', palavras('modelo')))).toEqual([
      ['Khirbet Modelo', 0, 'Região Teste · 2 objetos'],
      ['Tell Modelo', 0, 'antes: Tall Modelo · Região Teste · 6 objetos'],
    ])
  })
})
