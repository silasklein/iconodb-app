import { tituloDoGrupo } from './tituloDoGrupo'

// Decisão 81 (a1 = B): o grupo de cima com subcoleções leva o número do livro antes do título.
const G1 = { titulo: 'Animais de teste e figuras de prova', tituloDe: '1. Testtiere und Probefiguren' }

describe('tituloDoGrupo', () => {
  it('com subcoleções e número: «1. <título>»; a contagem (Grupo) ou a lista (GrupoDetalhe)', () => {
    expect(tituloDoGrupo({ ...G1, numero: '1', paiId: null, subcolecoes: 2 })).toEqual({ texto: '1. Animais de teste e figuras de prova' })
    expect(tituloDoGrupo({ ...G1, numero: '1', subcolecoes: [{}, {}] }).texto).toBe('1. Animais de teste e figuras de prova')
  })

  it('sem subcoleções: só o título, mesmo com número', () => {
    expect(tituloDoGrupo({ ...G1, numero: '1', subcolecoes: 0 }).texto).toBe('Animais de teste e figuras de prova')
    expect(tituloDoGrupo({ ...G1, numero: '1', subcolecoes: [] }).texto).toBe('Animais de teste e figuras de prova')
  })

  it('com subcoleções e numero NULL (ou sem o campo, pacote 5–8): só o título', () => {
    expect(tituloDoGrupo({ ...G1, numero: null, subcolecoes: 2 }).texto).toBe('Animais de teste e figuras de prova')
    expect(tituloDoGrupo({ ...G1, subcolecoes: 2 }).texto).toBe('Animais de teste e figuras de prova')
    expect(tituloDoGrupo(G1).texto).toBe('Animais de teste e figuras de prova')
  })

  it('numa subcoleção (paiId) não põe número: ela o mostra à parte', () => {
    expect(tituloDoGrupo({ titulo: 'Animais de prova', tituloDe: 'Probetiere', numero: '1.1', paiId: 'GR-TESTE-I-01', subcolecoes: 0 }).texto).toBe('Animais de prova')
  })

  it('o número com ponto no fim não dobra o ponto', () => {
    expect(tituloDoGrupo({ ...G1, numero: '2.', subcolecoes: 1 }).texto).toBe('2. Animais de teste e figuras de prova')
  })

  it('em alemão: o título do livro, marcado `de`; não repete o número que ele já traz', () => {
    expect(tituloDoGrupo({ ...G1, numero: '1', subcolecoes: 2 }, 'de')).toEqual({ texto: '1. Testtiere und Probefiguren', lang: 'de' })
    expect(tituloDoGrupo({ titulo: 'x', tituloDe: 'Testtiere', numero: '1', subcolecoes: 2 }, 'de')).toEqual({ texto: '1. Testtiere', lang: 'de' })
  })
})
