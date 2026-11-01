import { describe, expect, it } from 'vitest'
import { caminhoDaBusca, estadoDoResultado, lerParametros, MAXIMO_DA_LISTA, montarParametros, temFiltros } from './url'

describe('endereço da busca', () => {
  it('caminhoDaBusca() codifica o texto e some com o escopo "tudo"', () => {
    expect(caminhoDaBusca('íbex & CA00023')).toBe('/busca?q=%C3%ADbex+%26+CA00023')
    expect(caminhoDaBusca('x', { escopo: 'termo' })).toBe('/busca?q=x&escopo=termo')
  })

  it('ida e volta com escopo e filtros repetidos', () => {
    const original = { q: '"leão" *', escopo: 'local' as const, filtros: { sitio: ['TESTE-1', 'TESTE-2'], nivel: ['iconographic'] } }
    expect(lerParametros(montarParametros(original))).toEqual(original)
  })

  it('escopo desconhecido vira "tudo"; sem q é texto vazio; filtro vazio não conta', () => {
    expect(lerParametros(new URLSearchParams('escopo=nada&tipo='))).toEqual({ q: '', escopo: 'tudo', filtros: {} })
    expect(temFiltros({ tipo: [] })).toBe(false)
    expect(temFiltros({ tipo: ['Selo'] })).toBe(true)
  })

  it('o estado para o item leva a lista de números e o caminho de volta, com teto', () => {
    expect(estadoDoResultado(['CA00001', 'CA00002'], '/busca?q=x')).toEqual({
      contexto: { tipo: 'lista', ids: ['CA00001', 'CA00002'] },
      origem: { rotulo: 'Busca', caminho: '/busca?q=x' },
    })
    expect(estadoDoResultado(Array.from({ length: MAXIMO_DA_LISTA + 5 }, (_, i) => `N${i}`), '/busca?q=x').contexto.ids).toHaveLength(MAXIMO_DA_LISTA)
  })
})
