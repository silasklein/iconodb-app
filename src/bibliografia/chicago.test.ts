// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CampoNaoSuportado, chicago, chicagoHtml, foraDoAlcance, ForaDoAlcance, noAlcance, TIPOS_DO_CHICAGO, TipoNaoSuportado,
} from './chicago'
import type { Csl } from './modelo'

/** O gabarito do processamento (`python -m iconodb chicago-gabarito`), copiado byte a byte do pacote sintético 10. */
const gabarito = JSON.parse(readFileSync(join(import.meta.dirname, '../../tests/fixtures/chicago-gabarito.json'), 'utf8')) as {
  casos: { csl: Csl; chicago: string; chicago_html: string }[]
}

describe('chicago e chicagoHtml: o porte de iconodb.biblio.chicago', () => {
  it('o gabarito tem os casos do processamento', () => {
    expect(gabarito.casos.length).toBeGreaterThanOrEqual(55)
  })

  it.each(gabarito.casos.map((c) => [c.csl.id as string, c] as const))('%s', (_, caso) => {
    expect(chicago(caso.csl)).toBe(caso.chicago)
    expect(chicagoHtml(caso.csl)).toBe(caso.chicago_html)
  })

  it('não muda o CSL que recebe', () => {
    const csl: Csl = {
      type: 'book', title: 'Teste', editor: [{ family: 'Amostra', given: 'Ana' }], 'et-al': true, 'number-of-volumes': '2',
    }
    const copia = structuredClone(csl)
    chicago(csl)
    expect(csl).toEqual(copia)
  })

  it('o ano em texto do Zotero vale como número, com o «ed.» (TESTE-51, TESTE-52)', () => {
    const csl = (id: string) => gabarito.casos.find((c) => c.csl.id === id)!.csl
    expect(chicago(csl('TESTE-52'))).toBe('Exemplo, Bruno, ed. 2000. Ano em texto com organizador. Vila Imaginária.')
    expect(chicago({ ...csl('TESTE-52'), issued: { 'date-parts': [[2000]] } })).toBe(chicago(csl('TESTE-52')))
  })
})

describe('o alcance: os quatro tipos e os campos conhecidos', () => {
  const base: Csl = { type: 'book', title: 'Teste fora do alcance', author: [{ family: 'Amostra', given: 'Ana' }], issued: { 'date-parts': [[2000]] } }

  it('exporta os quatro tipos', () => {
    expect([...TIPOS_DO_CHICAGO]).toEqual(['book', 'chapter', 'article-journal', 'document'])
  })

  it('todos os casos do gabarito estão no alcance', () => {
    for (const c of gabarito.casos) expect(foraDoAlcance(c.csl)).toBeNull()
  })

  it.each(['thesis', 'report', 'paper-conference', 'webpage', 'article-magazine', 'tipo-inventado', '', 'Book'])(
    'o tipo %j não se adivinha: TipoNaoSuportado', (tipo) => {
      const csl: Csl = { ...base, type: tipo }
      expect(noAlcance(csl)).toBe(false)
      expect(() => chicago(csl)).toThrow(TipoNaoSuportado)
      expect(() => chicagoHtml(csl)).toThrow(TipoNaoSuportado)
      expect(foraDoAlcance(csl)).toMatchObject({ tipo })
    })

  it('sem tipo, também TipoNaoSuportado', () => {
    const { type: _t, ...semTipo } = base
    expect(() => chicago(semTipo as unknown as Csl)).toThrow(TipoNaoSuportado)
  })

  it.each([
    ['translator', [{ family: 'Exemplo', given: 'Bruno' }]],
    ['DOI', '10.0000/teste'],
    ['URL', 'https://example.org/teste'],
    ['genre', 'Tese de teste'],
    ['number', '5'],
    ['container_title', 'Revista Inventada'],
  ] as const)('o campo %s fica fora: CampoNaoSuportado', (campo, valor) => {
    const csl = { ...base, [campo]: valor } as Csl
    expect(() => chicago(csl)).toThrow(CampoNaoSuportado)
    expect(foraDoAlcance(csl)).toMatchObject({ campos: [campo] })
    expect(foraDoAlcance(csl)).toBeInstanceOf(ForaDoAlcance)
  })
})

