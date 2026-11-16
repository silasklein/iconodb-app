// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chaveDaCitacao } from './chave'

/** O gabarito do processamento (`python -m iconodb chicago-gabarito`), copiado byte a byte do pacote sintético 10. */
const gabarito = JSON.parse(readFileSync(join(import.meta.dirname, '../../tests/fixtures/chicago-gabarito.json'), 'utf8')) as {
  chaves: { short_cite: string | null; chave: string | null }[]
}

describe('chaveDaCitacao: o porte de chave_da_citacao', () => {
  it('o gabarito tem os pares do processamento', () => {
    expect(gabarito.chaves.length).toBeGreaterThanOrEqual(21)
  })

  it.each(gabarito.chaves.map((c) => [JSON.stringify(c.short_cite), c.short_cite, c.chave] as const))('%s', (_, curta, chave) => {
    expect(chaveDaCitacao(curta)).toBe(chave)
  })

  it('as citações iguais do pacote 10 têm a mesma chave; a sem autor não tem', () => {
    expect(chaveDaCitacao('Inventado 2001')).toBe('inventado 2001')
    expect(chaveDaCitacao('Imaginária 2010')).toBe('imaginaria 2010')
    expect(chaveDaCitacao(null)).toBeNull()
  })
})
