/**
 * Tarefa 12 (revisão 1, I1): em que grupo da árvore fica cada objeto da página de um sítio. O mais fundo vence: ligar um objeto
 * do livro do tell ao túmulo o põe no túmulo (como a página do túmulo, a lista e o mapa contam); na mesma profundidade, o que a
 * pessoa ligou vence o achado do livro.
 */
import { A, ev } from '../../tests/suporte/eventosDeTeste'
import type { Json } from '../usuario/eventos'
import { fundir } from '../usuario/fusao'
import { grupoDeCadaSitio, gruposDaArvore, objetosDaArvore, type ObjetoLigado } from './objetosDaArvore'
import { PACOTE_VAZIO, resolverSitios } from './resolucao'

let seq = 0
const sit = (reg: string, campos: Record<string, Json>) => ev({ ap: A, seq: ++seq, tipo: 'sitio', reg, op: 'alterar', campos })
// Tell (TESTE-2, com TESTE-4 mesclado) › Área (TESTE-5) › Túmulo (TESTE-6); Área CC (TESTE-7) também parte do tell.
const r = resolverSitios(
  fundir([sit('TESTE-4', { mescladoEm: 'TESTE-2' }), sit('TESTE-5', { parteDe: 'TESTE-2' }), sit('TESTE-6', { parteDe: 'TESTE-5' }), sit('TESTE-7', { parteDe: 'TESTE-2' })]),
  { ...PACOTE_VAZIO, sitios: new Set(['TESTE-1', 'TESTE-2', 'TESTE-4', 'TESTE-5', 'TESTE-6', 'TESTE-7']) },
)
const obj = (numero: string) => ({ numero })
const livro = (numero: string, sitio: string): ObjetoLigado<{ numero: string }> => ({ o: obj(numero), sitio, daPessoa: false })
const pessoa = (numero: string, sitio: string): ObjetoLigado<{ numero: string }> => ({ o: obj(numero), sitio, daPessoa: true })
const ver = (lista: { numero: string; parte?: string }[]) => lista.map((o) => `${o.numero}${o.parte ? `@${o.parte}` : ''}`)

describe('gruposDaArvore e grupoDeCadaSitio', () => {
  it('o sítio com os mesclados nele, e cada parte em árvore', () => {
    expect(gruposDaArvore(r, 'TESTE-2')).toEqual([['TESTE-2', 'TESTE-4'], ['TESTE-5'], ['TESTE-6'], ['TESTE-7']])
    expect(gruposDaArvore(r, 'TESTE-6')).toEqual([['TESTE-6']])
    // sem resolução, ou num absorvido: só ele
    expect(gruposDaArvore(null, 'TESTE-2')).toEqual([['TESTE-2']])
    expect(gruposDaArvore(r, 'TESTE-4')).toEqual([['TESTE-4']])
  })
  it('um `SI-…` publicado como um sítio do grupo conta nele', () => {
    const m = grupoDeCadaSitio(gruposDaArvore(r, 'TESTE-2'), (x) => (x === 'TESTE-6' ? ['SI-aaaaaaaa-9'] : []))
    expect(m.get('SI-aaaaaaaa-9')).toBe(2)
    expect(m.get('TESTE-4')).toBe(0)
  })
})

describe('objetosDaArvore', () => {
  const grupos = gruposDaArvore(r, 'TESTE-2')
  const grupoDe = grupoDeCadaSitio(grupos, () => [])

  it('I1: um objeto do livro do tell que a pessoa ligou ao túmulo fica no túmulo', () => {
    const lista = objetosDaArvore(r, grupos, grupoDe, [livro('TESTE-0003', 'TESTE-2'), livro('TESTE-0004', 'TESTE-2'), pessoa('TESTE-0003', 'TESTE-6')])
    expect(ver(lista)).toEqual(['TESTE-0004', 'TESTE-0003@TESTE-6'])
  })

  it('o mais fundo vence também quando o livro está mais fundo que a ligação da pessoa', () => {
    expect(ver(objetosDaArvore(r, grupos, grupoDe, [livro('X', 'TESTE-6'), pessoa('X', 'TESTE-2')]))).toEqual(['X@TESTE-6'])
    expect(ver(objetosDaArvore(r, grupos, grupoDe, [pessoa('X', 'TESTE-5'), livro('X', 'TESTE-6')]))).toEqual(['X@TESTE-6'])
  })

  it('na mesma profundidade, o que a pessoa ligou vence o livro; entre dois do livro, o primeiro', () => {
    expect(ver(objetosDaArvore(r, grupos, grupoDe, [livro('X', 'TESTE-5'), pessoa('X', 'TESTE-7')]))).toEqual(['X@TESTE-7'])
    expect(ver(objetosDaArvore(r, grupos, grupoDe, [pessoa('X', 'TESTE-7'), livro('X', 'TESTE-5')]))).toEqual(['X@TESTE-7'])
    expect(ver(objetosDaArvore(r, grupos, grupoDe, [livro('X', 'TESTE-5'), livro('X', 'TESTE-7')]))).toEqual(['X@TESTE-5'])
  })

  it('um mesclado conta no grupo do destino (sem `parte` no próprio sítio); fora da árvore, sai; a ordem é a dos grupos', () => {
    const lista = objetosDaArvore(r, grupos, grupoDe, [livro('A', 'TESTE-7'), livro('B', 'TESTE-4'), livro('C', 'TESTE-1'), pessoa('D', 'TESTE-5'), livro('E', 'TESTE-2')])
    expect(ver(lista)).toEqual(['B', 'E', 'D@TESTE-5', 'A@TESTE-7'])
  })
})
