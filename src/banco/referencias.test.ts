/**
 * Decisão 39: o formato das referências nas fontes ("IPIAO I: 60–62, 64 · GGG: 40 · SKC: 12") e a leitura do que se
 * digita na busca ("IPIAO I: 60", "IPIAO 60", "SKC: 12", "SKC 12", "SKC, Nr. 12", "skc nr 12").
 */
import { formatarLocalizador, formatarReferencias, lerReferenciaDigitada, type ReferenciaDeFonte } from './referencias'

const r = (obra: string, numero: number, extra: Partial<ReferenciaDeFonte> = {}): ReferenciaDeFonte => ({ obra, numero, ...extra })

describe('formatarReferencias', () => {
  it('um número: "OBRA: n", com sufixo e com Abb.', () => {
    expect(formatarReferencias([r('IPIAO I', 60)])).toBe('IPIAO I: 60')
    expect(formatarReferencias([r('IPIAO I', 95, { sufixo: 'a' })])).toBe('IPIAO I: 95a')
    expect(formatarReferencias([r('IPIAO I', 1, { abb: true })])).toBe('IPIAO I: Abb. 1')
    expect(formatarReferencias([r('SKC', 12)])).toBe('SKC: 12')
    expect(formatarReferencias([])).toBe('')
  })

  it('faixas: três ou mais seguidos com travessão (U+2013); dois seguidos com vírgula', () => {
    expect(formatarReferencias([60, 61, 62, 64].map((n) => r('IPIAO I', n)))).toBe('IPIAO I: 60–62, 64')
    expect(formatarReferencias([60, 61].map((n) => r('IPIAO I', n)))).toBe('IPIAO I: 60, 61')
    expect(formatarReferencias([1, 2, 3, 5, 6, 8, 9, 10, 11].map((n) => r('X', n)))).toBe('X: 1–3, 5, 6, 8–11')
  })

  it('ordena dentro da obra e tira repetidos; as obras na ordem em que aparecem, separadas por " · "', () => {
    const itens = [r('IPIAO I', 64), r('GGG', 62), r('IPIAO I', 61), r('GGG', 67), r('IPIAO I', 60), r('IPIAO I', 62), r('IPIAO I', 60), r('SKC', 12)]
    for (let n = 40; n <= 59; n++) itens.push(r('GGG', n))
    expect(formatarReferencias(itens)).toBe('IPIAO I: 60–62, 64 · GGG: 40–59, 62, 67 · SKC: 12')
  })

  it('sufixos e Abb. nunca entram numa faixa; Abb. vem depois do catálogo', () => {
    const itens = [r('T I', 60), r('T I', 61), r('T I', 61, { sufixo: 'a' }), r('T I', 62), r('T I', 63), r('T I', 2, { abb: true }), r('T I', 1, { abb: true }), r('T I', 3, { abb: true })]
    expect(formatarReferencias(itens)).toBe('T I: 60, 61, 61a, 62, 63, Abb. 1, Abb. 2, Abb. 3')
  })

  it('um número provisório leva " (provisório)" e não entra numa faixa', () => {
    expect(formatarReferencias([r('SKC', 1), r('SKC', 2), r('SKC', 3, { provisorio: true })])).toBe('SKC: 1, 2, 3 (provisório)')
    expect(formatarReferencias([r('SKC', 1, { provisorio: true })])).toBe('SKC: 1 (provisório)')
  })
})

describe('formatarLocalizador (o locator do pacote, na hora de mostrar)', () => {
  it.each([
    ['TESTE I, Nr. 1', 'TESTE I: 1'],
    ['IPIAO I, Nr. 60', 'IPIAO I: 60'],
    ['GGG, Nr. 36d', 'GGG: 36d'],
    ['IPIAO I, Abb. 3', 'IPIAO I: Abb. 3'],
    ['IPIAO I, Nr. 60, S. 112', 'IPIAO I: 60, S. 112'],
    ['IPIAO I, Nr. 60, § 4', 'IPIAO I: 60, § 4'],
    ['IPIAO I: 60', 'IPIAO I: 60'],
  ])('%s → %s', (locator, esperado) => {
    expect(formatarLocalizador(locator)).toBe(esperado)
  })

  it('revisão 4: sem a obra no locator, fica como veio (a sigla sozinha perderia o volume: "IPIAO: 60" no lugar de "IPIAO I: 60")', () => {
    expect(formatarLocalizador('Nr. 60')).toBe('Nr. 60')
    expect(formatarLocalizador('Abb. 3')).toBe('Abb. 3')
    expect(formatarLocalizador('Nr. 60, S. 112')).toBe('Nr. 60, S. 112')
  })

  it.each(['S. 112', 'IPIAO I, S. 112', 'Taf. 12', 'IPIAO I, Nr. 60–62', 'IPIAO I, Nr. 60 und 61', 'texto livre, Nr. x', ''])('forma que não se lê com segurança fica como veio: %s', (locator) => {
    expect(formatarLocalizador(locator)).toBe(locator)
  })
})

describe('lerReferenciaDigitada', () => {
  it.each([
    ['SKC 12', 'SKC', null],
    ['SKC: 12', 'SKC', null],
    ['SKC, Nr. 12', 'SKC', null],
    ['skc nr 12', 'SKC', null],
    ['  skc nr.12 ', 'SKC', null],
    ['IPIAO I: 60', 'IPIAO', 'I'],
    ['IPIAO I, Nr. 60', 'IPIAO', 'I'],
    ['IPIAO I 60', 'IPIAO', 'I'],
    ['ipiao ii: 60', 'IPIAO', 'II'],
    ['IPIAO 60', 'IPIAO', null],
    ['IPIAO: 60', 'IPIAO', null],
  ])('%s', (digitado, sigla, volume) => {
    expect(lerReferenciaDigitada(digitado)).toEqual({ sigla, volume, numero: sigla === 'SKC' ? 12 : 60, sufixo: '', abb: false })
  })

  it('sufixo e Abb.', () => {
    expect(lerReferenciaDigitada('IPIAO I: 95a')).toEqual({ sigla: 'IPIAO', volume: 'I', numero: 95, sufixo: 'a', abb: false })
    expect(lerReferenciaDigitada('IPIAO I: Abb. 1')).toEqual({ sigla: 'IPIAO', volume: 'I', numero: 1, sufixo: '', abb: true })
  })

  it.each(['skc', 'skc12', 'SKC 12 vaso', 'vaso de leão', '12', 'SKC 0', 'SKC: ', 'IPIAO I: 60–62', ''])('não é uma referência: %s', (digitado) => {
    expect(lerReferenciaDigitada(digitado)).toBeNull()
  })
})
