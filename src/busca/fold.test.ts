// @vitest-environment node
/**
 * A dobra de texto no app (JavaScript) tem de dar exatamente o que o pipeline (Python) dá.
 * Os vetores vêm do pacote sintético (tests/fixtures/pacote/nucleo/vetores-fold.json),
 * a tabela vem do fold.json do mesmo pacote: nada está escrito à mão aqui.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import { fold, lerTabelaDeFold, textoIndexado } from './fold'

const lerJson = (nome: string): unknown => JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo', nome), 'utf8'))
const tabela = lerTabelaDeFold(lerJson('fold.json'))
const vetores = lerJson('vetores-fold.json') as [string, string][]

describe('fold() contra os vetores do pipeline', () => {
  it('há uma boa quantidade de vetores, com os casos em que casefold e toLowerCase divergem', () => {
    expect(vetores.length).toBeGreaterThan(200)
    const dobrados = vetores.map(([e]) => e).join('')
    for (const caractere of ['ς', 'ϲ', 'ᲀ', 'Ꭰ', 'ẞ']) expect(dobrados).toContain(caractere)
  })

  it.each(vetores)('fold(%j) === %j', (entrada, saida) => {
    expect(fold(entrada, tabela)).toBe(saida)
  })

  it('é idempotente nos vetores', () => {
    for (const [, saida] of vetores) expect(fold(saida, tabela)).toBe(saida)
  })
})

describe('lerTabelaDeFold()', () => {
  it('recusa dados que não são uma tabela de dobra', () => {
    expect(() => lerTabelaDeFold(null)).toThrow()
    expect(() => lerTabelaDeFold({})).toThrow()
    expect(() => lerTabelaDeFold({ ...(lerJson('fold.json') as object), ordem: ['passo-que-nao-existe'] })).toThrow(/passo/i)
  })
})

describe('textoIndexado() (forma colada, só para texto que vai ao índice)', () => {
  it('"Marduk\'s" vira "marduk s marduks" e "As\'ad" vira "as ad asad"', () => {
    expect(textoIndexado("Marduk's", tabela)).toBe('marduk s marduks')
    expect(textoIndexado("As'ad", tabela)).toBe('as ad asad')
    expect(textoIndexado('Marduk’s Probe', tabela)).toBe('marduk s marduks probe')
  })

  it('texto sem apóstrofo é só dobrado', () => {
    expect(textoIndexado('Maḥraṣ Teste', tabela)).toBe('mahras teste')
  })
})
