/**
 * Duas pessoas-aparelho na Revisão: um marca o caso como resolvido, o outro desfaz (e marca de novo), sem se ver. Em qualquer
 * ordem de chegada e com repetições, os dois convergem para o mesmo estado, e o que perde fica no histórico.
 */
import { A, B, embaralhar, ev, gerador, T0 } from '../../tests/suporte/eventosDeTeste'
import { estadoCanonico, fundir } from '../usuario/fusao'
import { chaveDoCaso } from './chave'
import { chavesResolvidas } from './fila'

const CHAVE = chaveDoCaso({ tipo: 'citacao_nao_resolvida', entidade: 'passage', entidadeId: 'PA-TESTE-0001-cat-1', detalhe: 'Amostra 1999: 9' })
const rv = (ap: string, seq: number, ms: number, op: 'criar' | 'excluir' | 'restaurar', campos: Record<string, string> = {}) => ev({ ap, seq, ms, tipo: 'revisao', reg: CHAVE, op, campos })

function permutacoes<T>(eventos: readonly T[], vezes = 80): T[][] {
  const sorteio = gerador(13)
  return Array.from({ length: vezes }, (_, i) => embaralhar([...eventos, ...(i % 3 === 0 ? eventos.slice(0, 2) : [])], sorteio))
}

const resolvido = (e: ReturnType<typeof fundir>) => chavesResolvidas(e).has(CHAVE)

describe('A resolve e B desfaz', () => {
  // B viu a marca de A (veio antes dele desfazer): o `excluir` de B é o mais novo.
  const eventos = [rv(A, 1, T0, 'criar', { tipo: 'citacao_nao_resolvida' }), rv(B, 1, T0 + 1000, 'excluir')]

  it('o desfazer mais novo vence em todas as ordens e com repetições', () => {
    const referencia = estadoCanonico(fundir(eventos))
    for (const ordem of permutacoes(eventos)) {
      const e = fundir(ordem)
      expect(estadoCanonico(e)).toBe(referencia)
      expect(resolvido(e)).toBe(false)
      expect(e.registro('revisao', CHAVE)).toMatchObject({ excluido: true, campos: { tipo: 'citacao_nao_resolvida' } })
    }
  })

  it('A marca de novo (restaurar) depois do desfazer de B: volta a resolvido, em todas as ordens', () => {
    const todos = [...eventos, rv(A, 2, T0 + 2000, 'restaurar')]
    const referencia = estadoCanonico(fundir(todos))
    for (const ordem of permutacoes(todos)) {
      const e = fundir(ordem)
      expect(estadoCanonico(e)).toBe(referencia)
      expect(resolvido(e)).toBe(true)
    }
  })

  it('um criar (mesmo mais novo) não desfaz um excluir: só restaurar desfaz; igual em todas as ordens', () => {
    const cruzados = [rv(B, 1, T0, 'excluir'), rv(A, 1, T0 + 500, 'criar', { tipo: 'x' })]
    const referencia = estadoCanonico(fundir(cruzados))
    for (const ordem of permutacoes(cruzados)) {
      const e = fundir(ordem)
      expect(estadoCanonico(e)).toBe(referencia)
      expect(resolvido(e)).toBe(false)
    }
  })
})

describe('os dois resolvem o mesmo caso sem se ver', () => {
  it('convergem: um registro só, resolvido, com a escrita que perde no histórico do campo', () => {
    const eventos = [rv(A, 1, T0, 'criar', { tipo: 'a' }), rv(B, 1, T0 + 5, 'criar', { tipo: 'b' })]
    const referencia = estadoCanonico(fundir(eventos))
    for (const ordem of permutacoes(eventos)) {
      const e = fundir(ordem)
      expect(estadoCanonico(e)).toBe(referencia)
      expect(resolvido(e)).toBe(true)
      expect(e.registro('revisao', CHAVE)!.campos.tipo).toBe('b')
      expect(e.historico(CHAVE, 'tipo', 'revisao').map((h) => h.valor)).toEqual(['a'])
    }
  })
})

describe('A desfaz sem B ver; B resolve o mesmo caso (que não conhecia): vence a marca mais nova', () => {
  // `marcarComoResolvido` num aparelho que não conhece o caso grava `criar` + `restaurar`.
  const deA = [rv(A, 1, T0, 'criar', { tipo: 't' }), rv(A, 2, T0 + 1000, 'excluir')]
  const deB = (ms: number) => [rv(B, 1, ms, 'criar', { tipo: 't' }), ev({ ap: B, seq: 1, n: 1, ms, tipo: 'revisao', reg: CHAVE, op: 'restaurar' })]

  it('B depois do desfazer de A: resolvido, em todas as ordens', () => {
    const todos = [...deA, ...deB(T0 + 2000)]
    const referencia = estadoCanonico(fundir(todos))
    for (const ordem of permutacoes(todos)) {
      const e = fundir(ordem)
      expect(estadoCanonico(e)).toBe(referencia)
      expect(resolvido(e)).toBe(true)
    }
  })

  it('B antes do desfazer de A: o desfazer de A (mais novo) vence, em todas as ordens', () => {
    const todos = [...deA, ...deB(T0 + 500)]
    const referencia = estadoCanonico(fundir(todos))
    for (const ordem of permutacoes(todos)) {
      const e = fundir(ordem)
      expect(estadoCanonico(e)).toBe(referencia)
      expect(resolvido(e)).toBe(false)
    }
  })

  it('o relógio de B adiantado 1 h não faz um desfazer novo de A perder para uma marca velha', () => {
    // B (relógio adiantado) marcou "antes" no tempo real, mas com hlc de 1 h depois; A desfaz agora, já tendo recebido o hlc de B (o HLC de A avança além dele)
    const marcaDeB = deB(T0 + 3_600_000)
    const desfazDeA = rv(A, 3, T0 + 3_600_000 + 1, 'excluir') // o HLC de A, ao receber o evento de B, passa a ser maior
    const todos = [...deA, ...marcaDeB, desfazDeA]
    for (const ordem of permutacoes(todos)) expect(resolvido(fundir(ordem))).toBe(false)
  })
})
