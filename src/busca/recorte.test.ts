// @vitest-environment node
/** Tarefa 26: o recorte de um trecho de § na Busca («…a mesma postura da **deusa** volta…»), em volta do primeiro destaque. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import { lerTabelaDeFold } from './fold'
import { recorteDoTrecho } from './recorte'

const tabela = lerTabelaDeFold(JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo/fold.json'), 'utf8')))
const texto = (r: { texto: string }[]) => r.map((p) => p.texto).join('')

describe('recorteDoTrecho', () => {
  it('um texto curto vai inteiro, com o termo em destaque (sem acento e sem maiúscula)', () => {
    expect(recorteDoTrecho('A deusa de teste.', 'DEUSA', tabela)).toEqual([
      { texto: 'A ', forte: false },
      { texto: 'deusa', forte: true },
      { texto: ' de teste.', forte: false },
    ])
  })

  it('um texto longo é cortado em palavras, com «…» antes e depois, em volta do primeiro destaque', () => {
    const longo = `${'palavra '.repeat(30)}a deusa de teste ${'outra '.repeat(60)}fim.`
    const r = recorteDoTrecho(longo, 'deusa', tabela, 30, 60)
    expect(r[0]!.texto.startsWith('…')).toBe(true)
    expect(r.at(-1)!.texto.endsWith('…')).toBe(true)
    expect(r.filter((p) => p.forte).map((p) => p.texto)).toEqual(['deusa'])
    expect(texto(r).length).toBeLessThan(100)
    // o corte cai entre palavras
    expect(texto(r)).toMatch(/^…palavra /)
    expect(texto(r)).toMatch(/ outra…$/)
  })

  it('sem destaque, o começo do texto', () => {
    const r = recorteDoTrecho(`${'palavra '.repeat(40)}fim.`, 'nada', tabela, 30, 60)
    expect(r[0]).toEqual({ texto: expect.stringMatching(/^palavra /), forte: false })
    expect(r.at(-1)!.texto.endsWith('…')).toBe(true)
  })
})
