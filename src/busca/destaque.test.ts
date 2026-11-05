// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import { destacar } from './destaque'
import { lerTabelaDeFold } from './fold'

const tabela = lerTabelaDeFold(JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo/fold.json'), 'utf8')))
/** "íb|ex": o trecho em negrito entre barras, para ler os casos de relance. */
const marcado = (texto: string, digitado: string) =>
  destacar(texto, digitado, tabela)
    .map((t) => (t.forte ? `|${t.texto}|` : t.texto))
    .join('')

describe('destacar(): o negrito das sugestões', () => {
  it('"ib" marca "íb" de "íbex": sem acento na digitação, o acento do texto entra no negrito', () => {
    expect(destacar('íbex', 'ib', tabela)).toEqual([
      { texto: 'íb', forte: true },
      { texto: 'ex', forte: false },
    ])
    expect(marcado('íbex', 'íb')).toBe('|íb|ex')
    expect(marcado('Íbex', 'IB')).toBe('|Íb|ex')
  })

  it('a última palavra vale como início de qualquer palavra do texto', () => {
    expect(marcado('íbex de teste', 'ib')).toBe('|íb|ex de teste')
    expect(marcado('leão-íbex', 'ib')).toBe('leão-|íb|ex')
  })

  it('as palavras anteriores valem inteiras; a última, como prefixo', () => {
    expect(marcado('filhote de leão-de-teste', 'de lea')).toBe('filhote |de| |leã|o-|de|-teste')
    expect(marcado('selo de teste', 'sel de te')).toBe('selo |de| |te|ste') // "sel" não é palavra inteira: não marca
  })

  it('a digitação de letras com marcas (Maḥteṣ) marca a letra e a sua marca juntas', () => {
    expect(marcado('Maḥteṣ Teste', 'mah')).toBe('|Maḥ|teṣ Teste')
    // a mesma letra em forma decomposta (h + ponto combinante)
    expect(marcado('Maḥteṣ Teste', 'mah')).toBe('|Maḥ|teṣ Teste')
    expect(marcado('ʿĒn Tāstiye', 'en ta')).toBe('ʿ|Ēn| |Tā|stiye')
  })

  it('um casamento no meio de um agrupamento marca o agrupamento inteiro (ß = ss)', () => {
    expect(marcado('Straße', 'stras')).toBe('|Straß|e')
    expect(marcado('Straße', 'strass')).toBe('|Straß|e')
  })

  it('não corta um par substituto (UTF-16) ao meio', () => {
    const texto = '𓀀 leão 𓀁'
    const trechos = destacar(texto, 'lea', tabela)
    expect(trechos.map((t) => t.texto).join('')).toBe(texto)
    for (const t of trechos) expect(t.texto).toBe(String.fromCodePoint(...[...t.texto].map((c) => c.codePointAt(0)!)))
    expect(marcado(texto, 'lea')).toBe('𓀀 |leã|o 𓀁')
  })

  it('sem casamento ou sem o que digitar, o texto vem inteiro, sem negrito', () => {
    expect(destacar('selo de teste', 'zzz', tabela)).toEqual([{ texto: 'selo de teste', forte: false }])
    expect(destacar('selo de teste', '  ', tabela)).toEqual([{ texto: 'selo de teste', forte: false }])
    expect(destacar('', 'ib', tabela)).toEqual([])
  })

  it('os trechos sempre refazem o texto original', () => {
    for (const [texto, digitado] of [['Ἀθηνᾶ e Ḫirbet', 'αθη hi'], ['A  B', 'a b'], ['x', 'x']] as const) {
      expect(
        destacar(texto, digitado, tabela)
          .map((t) => t.texto)
          .join(''),
      ).toBe(texto)
    }
  })
})
