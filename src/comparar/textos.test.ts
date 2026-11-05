import { textoDaSubstituicao } from './textos'

const nome = (r: string) => r.replace('OB-aaaaaaaa-1', 'CA00099')
const base = { entraram: [], deFora: [], tiradas: 0, igual: false }

describe('o texto de «Comparar todos» (decisão 44: substitui)', () => {
  it('bandeja que estava vazia: só diz o que entrou', () => {
    expect(textoDaSubstituicao('TESTE I: 1–3', { ...base, entraram: ['CA00001', 'CA00002', 'CA00003'] }, nome)).toBe('3 objetos de TESTE I: 1–3 entraram na comparação.')
  })
  it('um só objeto, no singular', () => {
    expect(textoDaSubstituicao('TESTE I: 1–1', { ...base, entraram: ['CA00001'] }, nome)).toBe('1 objeto de TESTE I: 1–1 entrou na comparação.')
  })
  it('havia outros: diz quantos saíram, para a pessoa saber que dá para desfazer', () => {
    expect(textoDaSubstituicao('TESTE I: 1–2', { ...base, entraram: ['CA00001', 'CA00002'], tiradas: 4 }, nome)).toBe('2 objetos de TESTE I: 1–2 entraram na comparação, no lugar de 4 objetos que estavam.')
    expect(textoDaSubstituicao('TESTE I: 1–1', { ...base, entraram: ['CA00001'], tiradas: 1 }, nome)).toBe('1 objeto de TESTE I: 1–1 entrou na comparação, no lugar de 1 objeto que estava.')
  })
  it('os que não couberam são nomeados e a mensagem NÃO promete que entram depois', () => {
    const t = textoDaSubstituicao('TESTE I: 1–6', { ...base, entraram: ['CA00001', 'CA00002', 'CA00003', 'CA00004'], deFora: ['CA00005', 'OB-aaaaaaaa-1'], tiradas: 2 }, nome)
    expect(t).toBe(
      '4 objetos de TESTE I: 1–6 entraram na comparação, no lugar de 2 objetos que estavam. 2 objetos ficaram de fora (a comparação leva até 4): CA00005, CA00099. Para comparar um deles, tire um objeto e use o + para escrever o número.',
    )
    expect(t).not.toMatch(/próximo|para entrar|entra depois/)
  })
  it('um objeto de fora, no singular', () => {
    expect(textoDaSubstituicao('TESTE I: 1–5', { ...base, entraram: ['CA00001', 'CA00002', 'CA00003', 'CA00004'], deFora: ['CA00005'] }, nome)).toContain('1 objeto ficou de fora (a comparação leva até 4): CA00005.')
  })
  it('a mesma lista já estava na comparação: nada mudou e a mensagem diz isso', () => {
    expect(textoDaSubstituicao('TESTE I: 1–2', { ...base, entraram: ['CA00001', 'CA00002'], igual: true }, nome)).toBe('Os 2 objetos de TESTE I: 1–2 já estavam na comparação, nesta ordem.')
    expect(textoDaSubstituicao('TESTE I: 1–1', { ...base, entraram: ['CA00001'], igual: true }, nome)).toBe('O objeto de TESTE I: 1–1 já estava na comparação.')
  })
})
