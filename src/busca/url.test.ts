import { describe, expect, it } from 'vitest'
import { caminhoDaBusca, estadoDoResultado, lerParametros, MAXIMO_DA_LISTA, montarParametros, temFiltros } from './url'

describe('endereço da busca', () => {
  it('caminhoDaBusca() codifica o texto e some com o escopo "tudo"', () => {
    expect(caminhoDaBusca('íbex & CA00001')).toBe('/busca?q=%C3%ADbex+%26+CA00001')
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

  it('o estado para o item leva a lista de números, o total e o caminho de volta', () => {
    expect(estadoDoResultado(['CA00001', 'CA00002'], '/busca?q=x')).toEqual({
      contexto: { tipo: 'lista', ids: ['CA00001', 'CA00002'] },
      inicio: 0,
      total: 2,
      origem: { rotulo: 'Busca', caminho: '/busca?q=x' },
    })
  })

  describe('lista maior que o teto', () => {
    const lista = Array.from({ length: MAXIMO_DA_LISTA * 2 + 500 }, (_, i) => `N${i}`)
    const estado = (aberto: string) => estadoDoResultado(lista, '/busca?q=x', aberto)

    it('guarda uma janela em volta do objeto aberto, com o início e o total reais', () => {
      const e = estado('N3000')
      expect(e.total).toBe(lista.length)
      expect(e.contexto.ids).toHaveLength(MAXIMO_DA_LISTA)
      expect(e.contexto.ids).toContain('N3000')
      expect(e.contexto.ids[3000 - e.inicio]).toBe('N3000')
      expect(e.inicio).toBe(3000 - MAXIMO_DA_LISTA / 2)
    })

    it('a janela não passa das pontas da lista', () => {
      expect(estado('N0').inicio).toBe(0)
      expect(estado('N0').contexto.ids[0]).toBe('N0')
      const ultimo = estado(lista.at(-1)!)
      expect(ultimo.inicio).toBe(lista.length - MAXIMO_DA_LISTA)
      expect(ultimo.contexto.ids.at(-1)).toBe(lista.at(-1))
    })
  })
})
