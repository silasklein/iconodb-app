import { PACOTE_VAZIO, resolverSitios, type Conflito } from './resolucao'
import { conteudoDoSitio, sugestaoDeQualFica, textoDaMescla, textoDoConflito, textoDoDesfazer, type Contagens, type FontesDoConteudo } from './textos'
import { ev } from '../../tests/suporte/eventosDeTeste'
import type { Json } from '../usuario/eventos'
import { fundir } from '../usuario/fusao'

let seq = 0
/** Os sítios criados (cada um com os campos dados), na ordem. */
const estadoDeTeste = (sitios: readonly [string, Record<string, Json>][]) =>
  fundir(sitios.map(([reg, campos]) => ev({ seq: ++seq, tipo: 'sitio', reg, op: 'criar', campos })))

const c = (x: Partial<Contagens>): Contagens => ({ objetos: 0, notas: 0, partes: 0, correcoes: 0, grafias: 0, ...x })

describe('textoDaMescla (telas aprovadas §1)', () => {
  it('os dois exemplos das telas', () => {
    expect(textoDaMescla('Tell Teste', 'Tell Exemplo', ['Tell Exemplo', 'Tel Exemplo'], c({ objetos: 3, notas: 1, partes: 1, grafias: 1 }), 'fica')).toEqual([
      'o nome «Tell Exemplo» e a grafia «Tel Exemplo» passam a ser grafias de Tell Teste;',
      'os 3 objetos, a nota e a parte de Tell Exemplo passam a contar em Tell Teste;',
      'a coordenada que vale é a de Tell Teste.',
    ])
    expect(textoDaMescla('Tell Teste', 'Tall Teste', ['Tall Teste'], c({ objetos: 4, correcoes: 2 }), 'fica')).toEqual([
      'o nome «Tall Teste» passa a ser grafia de Tell Teste;',
      'os 4 objetos e as 2 correções de Tall Teste passam a contar em Tell Teste;',
      'a coordenada que vale é a de Tell Teste.',
    ])
  })

  it('plurais: as grafias «A» e «B»; o objeto, a nota, a parte, a correção; um item só no singular passa a contar', () => {
    expect(textoDaMescla('X', 'Y', ['Y', 'A', 'B'], c({ objetos: 1 }), 'fica')).toEqual([
      'o nome «Y» e as grafias «A» e «B» passam a ser grafias de X;',
      'o objeto de Y passa a contar em X;',
      'a coordenada que vale é a de X.',
    ])
    expect(textoDaMescla('X', 'Y', ['Y', 'A', 'B', 'C'], c({ notas: 2, partes: 3, correcoes: 1 }), null)).toEqual([
      'o nome «Y» e as grafias «A», «B» e «C» passam a ser grafias de X;',
      'as 2 notas, as 3 partes e a correção de Y passam a contar em X.',
    ])
    expect(textoDaMescla('X', 'Y', ['Y'], c({ notas: 1 }), 'entra')[1]).toBe('a nota de Y passa a contar em X;')
    expect(textoDaMescla('X', 'Y', ['Y'], c({ partes: 1 }), null)[1]).toBe('a parte de Y passa a contar em X.')
    expect(textoDaMescla('X', 'Y', ['Y'], c({ correcoes: 1 }), null)[1]).toBe('a correção de Y passa a contar em X.')
    expect(textoDaMescla('X', 'Y', ['Y'], c({ objetos: 2 }), null)[1]).toBe('os 2 objetos de Y passam a contar em X.')
  })

  it('só cita o que existe (nunca «0 notas»); a coordenada do que entra; sem coordenada, sem a linha', () => {
    expect(textoDaMescla('Tell Teste', 'Tell Exemplo', ['Tell Exemplo'], c({}), 'entra')).toEqual([
      'o nome «Tell Exemplo» passa a ser grafia de Tell Teste;',
      'a coordenada que vale é a de Tell Exemplo.',
    ])
    expect(textoDaMescla('Tell Teste', 'Tell Exemplo', ['Tell Exemplo'], c({}), null)).toEqual(['o nome «Tell Exemplo» passa a ser grafia de Tell Teste.'])
    expect(textoDaMescla('X', 'Y', ['Y'], c({ objetos: 2 }), null).join(' ')).not.toMatch(/\b0 /)
  })
})

describe('textoDoDesfazer (telas aprovadas §2)', () => {
  it('o exemplo das telas', () => {
    expect(textoDoDesfazer('Tell Exemplo', 'Tell Teste', c({ objetos: 3, notas: 1, partes: 1, grafias: 1 }))).toBe(
      'Desfazer a mesclagem de Tell Exemplo? Ele volta a ser um sítio à parte, com o nome, a grafia, os 3 objetos, a nota e a parte que tinha. Tell Teste fica como estava antes dele.',
    )
  })
  it('só o nome; e os plurais', () => {
    expect(textoDoDesfazer('Y', 'X', c({}))).toBe('Desfazer a mesclagem de Y? Ele volta a ser um sítio à parte, com o nome que tinha. X fica como estava antes dele.')
    expect(textoDoDesfazer('Y', 'X', c({ grafias: 2, objetos: 1, correcoes: 2 }))).toBe(
      'Desfazer a mesclagem de Y? Ele volta a ser um sítio à parte, com o nome, as 2 grafias, o objeto e as 2 correções que tinha. X fica como estava antes dele.',
    )
  })
})

describe('textoDoConflito (telas aprovadas §7)', () => {
  const nomes: Record<string, string> = { 'SI-aaaaaaaa-1': 'Tell Exemplo', 'SI-bbbbbbbb-1': 'Khirbet Modelo' }
  const nome = (id: string) => nomes[id] ?? id
  const base = { hlc: '1-aaaaaaaa', aparelho: 'aaaaaaaa' }
  it('mescla', () => {
    const cf: Conflito = { tipo: 'mescla', registro: 'SI-aaaaaaaa-1', valor: 'SI-bbbbbbbb-1', ...base, vencedor: { registro: 'SI-bbbbbbbb-1', valor: 'SI-aaaaaaaa-1', hlc: '2-bbbbbbbb', aparelho: 'bbbbbbbb' } }
    expect(textoDoConflito(cf, nome)).toBe('Neste aparelho você mesclou Tell Exemplo em Khirbet Modelo, mas outro aparelho mesclou Khirbet Modelo em Tell Exemplo depois; ficou a mais recente.')
  })
  it('parte (texto proposto)', () => {
    const cf: Conflito = { tipo: 'parte', registro: 'SI-aaaaaaaa-1', valor: 'SI-bbbbbbbb-1', ...base, vencedor: { registro: 'SI-bbbbbbbb-1', valor: 'SI-aaaaaaaa-1', hlc: '2-bbbbbbbb', aparelho: 'bbbbbbbb' } }
    expect(textoDoConflito(cf, nome)).toBe('Neste aparelho você marcou Tell Exemplo como parte de Khirbet Modelo, mas outro aparelho marcou Khirbet Modelo como parte de Tell Exemplo depois; ficou a mais recente.')
  })
})

describe('sugestaoDeQualFica', () => {
  it('o do livro antes do seu, nas duas ordens', () => {
    const livro = { id: 'TESTE-3', doLivro: true }
    const seu = { id: 'SI-aaaaaaaa-3', doLivro: false, criadoEm: '1' }
    expect(sugestaoDeQualFica(livro, seu)).toEqual({ fica: 'TESTE-3', motivo: 'livro' })
    expect(sugestaoDeQualFica(seu, livro)).toEqual({ fica: 'TESTE-3', motivo: 'livro' })
  })
  it('M-1: um sítio seu publicado (id de livro, TESTE-91) é seu: o do livro fica, mesmo com número maior', () => {
    const publicado = { id: 'TESTE-91', doLivro: false, criadoEm: '1' }
    const livro = { id: 'TESTE-1001', doLivro: true }
    expect(sugestaoDeQualFica(publicado, livro)).toEqual({ fica: 'TESTE-1001', motivo: 'livro' })
    expect(sugestaoDeQualFica(livro, publicado)).toEqual({ fica: 'TESTE-1001', motivo: 'livro' })
  })
  it('dois do livro: o de número menor (TESTE-3 antes de TESTE-14, não pela ordem do texto)', () => {
    expect(sugestaoDeQualFica({ id: 'TESTE-14', doLivro: true }, { id: 'TESTE-3', doLivro: true })).toEqual({ fica: 'TESTE-3', motivo: 'menor' })
    expect(sugestaoDeQualFica({ id: 'TESTE-3', doLivro: true }, { id: 'TESTE-14', doLivro: true })).toEqual({ fica: 'TESTE-3', motivo: 'menor' })
  })
  it('dois seus: o de criadoEm menor; empate, o id', () => {
    expect(sugestaoDeQualFica({ id: 'SI-aaaaaaaa-1', doLivro: false, criadoEm: '0000000002000-0000-x' }, { id: 'SI-bbbbbbbb-1', doLivro: false, criadoEm: '0000000001000-0000-x' })).toEqual({
      fica: 'SI-bbbbbbbb-1',
      motivo: 'menor',
    })
    expect(sugestaoDeQualFica({ id: 'SI-bbbbbbbb-1', doLivro: false, criadoEm: 'h' }, { id: 'SI-aaaaaaaa-1', doLivro: false, criadoEm: 'h' })).toEqual({ fica: 'SI-aaaaaaaa-1', motivo: 'menor' })
  })
})

describe('conteudoDoSitio: o que vai junto numa mescla ou volta num desfazer', () => {
  const fontes = (extra: Partial<FontesDoConteudo> = {}): FontesDoConteudo => ({
    objetosDe: (id) => ({ 'SI-aaaaaaaa-1': 2, 'SI-aaaaaaaa-2': 1, 'SI-aaaaaaaa-3': 5 })[id] ?? 0,
    notasDe: (id) => (id === 'SI-aaaaaaaa-1' ? 1 : id === 'SI-aaaaaaaa-2' ? 2 : 0),
    correcoesDe: () => 0,
    grafiasDe: (id) => (id === 'SI-aaaaaaaa-1' ? ['Tel A'] : []),
    mescladoEmEscrito: () => null,
    parteDeEscrito: () => null,
    ...extra,
  })

  it('um destino: os objetos e as notas dele e dos absorvidos, as partes diretas e as grafias', () => {
    const estado = estadoDeTeste([
      ['SI-aaaaaaaa-1', { nome: 'A' }],
      ['SI-aaaaaaaa-2', { nome: 'B', mescladoEm: 'SI-aaaaaaaa-1' }],
      ['SI-aaaaaaaa-3', { nome: 'C', parteDe: 'SI-aaaaaaaa-1' }],
    ])
    const r = resolverSitios(estado, PACOTE_VAZIO)
    expect(conteudoDoSitio(r, 'SI-aaaaaaaa-1', fontes())).toEqual({ objetos: 3, notas: 3, partes: 1, correcoes: 0, grafias: 1 })
  })

  it('um absorvido (o desfazer): só o dele e o que estava mesclado nele, e as partes que apontam para ele', () => {
    const estado = estadoDeTeste([
      ['SI-aaaaaaaa-1', { nome: 'A' }],
      ['SI-aaaaaaaa-2', { nome: 'B', mescladoEm: 'SI-aaaaaaaa-1' }],
      ['SI-aaaaaaaa-4', { nome: 'D', mescladoEm: 'SI-aaaaaaaa-2' }],
      ['SI-aaaaaaaa-3', { nome: 'C', parteDe: 'SI-aaaaaaaa-2' }],
    ])
    const r = resolverSitios(estado, PACOTE_VAZIO)
    expect(r.destino('SI-aaaaaaaa-2')).toBe('SI-aaaaaaaa-1')
    const escrito = (campo: string) => (id: string) => {
      const v = estado.registro('sitio', id)?.campos[campo]
      return typeof v === 'string' ? v : null
    }
    const f = fontes({ objetosDe: (id) => ({ 'SI-aaaaaaaa-2': 1, 'SI-aaaaaaaa-4': 7 })[id] ?? 0, mescladoEmEscrito: escrito('mescladoEm'), parteDeEscrito: escrito('parteDe') })
    expect(conteudoDoSitio(r, 'SI-aaaaaaaa-2', f)).toEqual({ objetos: 8, notas: 2, partes: 1, correcoes: 0, grafias: 0 })
  })
})
