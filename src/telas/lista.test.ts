import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import { lerTabelaDeFold } from '../busca/fold'
import { agrupar, filtrar, indexar, inicialDe } from './lista'

const tabela = lerTabelaDeFold(JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo/fold.json'), 'utf8')))
const nome = (s: string) => s
const entradas = (nomes: string[]) => indexar(nomes, tabela, nome, nome)

describe('lista: índice dobrado', () => {
  it('ordena pela forma dobrada, de modo que as letras ficam contíguas (ʿ e diacríticos não dispersam a letra)', () => {
    const ordem = entradas(['Zebra', 'ʿĒn Teste', 'Ábaco', 'abelha', '3 pontos', 'Maḥraṣ']).map((e) => e.item)
    expect(ordem).toEqual(['3 pontos', 'Ábaco', 'abelha', 'ʿĒn Teste', 'Maḥraṣ', 'Zebra'])
    expect(agrupar(entradas(['Zebra', 'ʿĒn Teste', 'Ábaco', 'abelha', '3 pontos']), (e) => inicialDe(e.ordem)).map((g) => [g.chave, g.entradas.length])).toEqual([
      ['#', 1],
      ['A', 2],
      ['E', 1],
      ['Z', 1],
    ])
  })

  it('filtra pelas palavras dobradas, em qualquer ordem: "mahras", "MAHRAS", "tell probe"', () => {
    const e = indexar(['Maḥraṣ Teste', 'Tell Probe Teste', "Marduk's"], tabela, nome, nome)
    expect(filtrar(e, 'mahras', tabela).map((x) => x.item)).toEqual(['Maḥraṣ Teste'])
    expect(filtrar(e, 'MAHRAS', tabela).map((x) => x.item)).toEqual(['Maḥraṣ Teste'])
    expect(filtrar(e, 'probe tell', tabela).map((x) => x.item)).toEqual(['Tell Probe Teste'])
    expect(filtrar(e, 'marduk', tabela).map((x) => x.item)).toEqual(["Marduk's"])
    expect(filtrar(e, 'marduks', tabela).map((x) => x.item)).toEqual(["Marduk's"])
  })

  it('consulta vazia ou só de espaços devolve tudo, na mesma lista', () => {
    const e = entradas(['b', 'a'])
    expect(filtrar(e, '', tabela)).toBe(e)
    expect(filtrar(e, '   ', tabela)).toBe(e)
  })
})
