/**
 * Revisão 1, M7: dois aparelhos editando o mesmo verbete (da forma em uso e do estado), em qualquer ordem de chegada e com
 * repetições, convergem para o mesmo estado; cada campo é um LWW por hlc, e o valor que perde fica no histórico.
 */
import { A, B, embaralhar, ev, gerador, HORA, T0 } from '../../tests/suporte/eventosDeTeste'
import { estadoCanonico, fundir } from '../usuario/fusao'
import { lerEdicaoDoVerbete, situacaoDoVerbete, type StatusDoVerbete } from './modelo'

const efetivo = (e: ReturnType<typeof fundir>, reg = 'GL-900001', original = 'leão-de-teste', statusDoPacote: StatusDoVerbete = 'approved') =>
  situacaoDoVerbete(lerEdicaoDoVerbete(e.registro('verbete', reg)!), original, statusDoPacote)

const alt = (ap: string, seq: number, ms: number, campos: Record<string, unknown>, reg = 'GL-900001') =>
  ev({ ap, seq, ms, tipo: 'verbete', reg, op: 'alterar', campos: campos as never })

function permutacoes<T>(eventos: readonly T[], vezes = 60): T[][] {
  const sorteio = gerador(11)
  return Array.from({ length: vezes }, (_, i) => embaralhar([...eventos, ...(i % 3 === 0 ? eventos.slice(0, 2) : [])], sorteio))
}

describe('A edita a forma enquanto B aprova: os dois campos sobrevivem, em qualquer ordem', () => {
  // B aprova sem ter visto a forma de A (a original, formaAprovada null): os dois campos sobrevivem, mas a aprovação não vale
  // para a forma de A.
  const eventos = [alt(A, 1, T0, { formaEmUso: 'cria de leão' }), alt(B, 1, T0 + 5, { status: 'approved', formaAprovada: null })]

  it('forma de A e estado de B, nas duas ordens e com repetições', () => {
    const referencia = estadoCanonico(fundir(eventos))
    for (const ordem of permutacoes(eventos)) {
      const e = fundir(ordem)
      expect(estadoCanonico(e)).toBe(referencia)
      expect(lerEdicaoDoVerbete(e.registro('verbete', 'GL-900001')!)).toEqual({ formaEmUso: 'cria de leão', status: 'approved', formaAprovada: null })
      expect(efetivo(e)).toEqual({ status: 'proposed', aprovacaoDesatualizada: true })
    }
  })
})

describe('A volta à proposta (null) enquanto B escreve outra forma: ganha o hlc maior, nos dois aparelhos', () => {
  const base = alt(A, 1, T0, { formaEmUso: 'primeira' })
  it('B depois de A: o texto de B vence e o null de A fica no histórico', () => {
    const eventos = [base, alt(A, 2, T0 + 10, { formaEmUso: null }), alt(B, 1, T0 + 20, { formaEmUso: 'texto de B' })]
    const referencia = estadoCanonico(fundir(eventos))
    for (const ordem of permutacoes(eventos)) {
      const e = fundir(ordem)
      expect(estadoCanonico(e)).toBe(referencia)
      expect(lerEdicaoDoVerbete(e.registro('verbete', 'GL-900001')!).formaEmUso).toBe('texto de B')
      expect(e.historico('GL-900001', 'formaEmUso', 'verbete').map((h) => h.valor)).toEqual(['primeira', null])
    }
  })

  it('A depois de B: o null de A vence (a forma original) e o texto de B fica no histórico', () => {
    const eventos = [base, alt(B, 1, T0 + 10, { formaEmUso: 'texto de B' }), alt(A, 2, T0 + 20, { formaEmUso: null })]
    for (const ordem of permutacoes(eventos)) {
      const e = fundir(ordem)
      expect(lerEdicaoDoVerbete(e.registro('verbete', 'GL-900001')!).formaEmUso).toBeNull()
      expect(e.registro('verbete', 'GL-900001')!.campos.formaEmUso).toBeNull()
      expect(e.historico('GL-900001', 'formaEmUso', 'verbete').map((h) => h.valor)).toEqual(['primeira', 'texto de B'])
    }
  })

  it('um relógio adiantado 1 h em B não faz uma edição velha vencer uma nova só pelo relógio do aparelho (o hlc manda)', () => {
    // B, com o relógio 1 h adiantado, escreveu às T0+HORA; A escreve depois, mas o hlc de A já viu o de B (recebeu antes) e passa dele.
    const eventos = [alt(B, 1, T0 + HORA, { status: 'approved', formaAprovada: null }), ev({ ap: A, seq: 1, ms: T0 + HORA, c: 1, tipo: 'verbete', reg: 'GL-900001', op: 'alterar', campos: { status: 'proposed' } })]
    for (const ordem of permutacoes(eventos)) expect(lerEdicaoDoVerbete(fundir(ordem).registro('verbete', 'GL-900001')!).status).toBe('proposed')
  })

  it('o verbete do usuário: o criar de A, a forma de B e a aprovação de A convergem', () => {
    const eventos = [
      ev({ ap: A, seq: 1, ms: T0, tipo: 'verbete', reg: 'GL-aaaaaaaa-1', op: 'criar', campos: { forma: 'termo', status: 'proposed' } }),
      alt(B, 1, T0 + 10, { formaEmUso: 'termo revisto' }, 'GL-aaaaaaaa-1'),
      alt(A, 2, T0 + 20, { status: 'approved', formaAprovada: null }, 'GL-aaaaaaaa-1'),
    ]
    const referencia = estadoCanonico(fundir(eventos))
    for (const ordem of permutacoes(eventos)) {
      const e = fundir(ordem)
      expect(estadoCanonico(e)).toBe(referencia)
      expect(e.registro('verbete', 'GL-aaaaaaaa-1')!.campos).toEqual({ forma: 'termo', status: 'approved', formaAprovada: null, formaEmUso: 'termo revisto' })
      // A aprovou a forma criada; a de B, 'termo revisto', não foi aprovada
      expect(efetivo(e, 'GL-aaaaaaaa-1', 'termo', 'proposed').status).toBe('proposed')
    }
  })
})

describe('aprovação sob LWW: aprovado só se a forma aprovada é a forma de agora (revisão 2, I-A), em qualquer ordem', () => {
  const todas = (eventos: ReturnType<typeof alt>[], reg: string, original: string, statusDoPacote: StatusDoVerbete) => {
    const referencia = estadoCanonico(fundir(eventos))
    return permutacoes(eventos).map((ordem) => {
      const e = fundir(ordem)
      expect(estadoCanonico(e)).toBe(referencia)
      return efetivo(e, reg, original, statusDoPacote)
    })
  }

  it('cenário 1, edição tardia: A aprova F, B (que ainda via "a revisar") edita G depois: não está aprovado', () => {
    const eventos = [alt(A, 1, T0, { formaEmUso: 'F' }), alt(A, 2, T0 + 10, { status: 'approved', formaAprovada: 'F' }), alt(B, 1, T0 + 20, { formaEmUso: 'G' })]
    for (const r of todas(eventos, 'GL-900001', 'orig', 'proposed')) expect(r).toEqual({ status: 'proposed', aprovacaoDesatualizada: true })
  })

  it('cenário 2, edição concorrente: A edita G (t1), B aprova F (t2 > t1) sem ter visto G: o hlc não diz o que B viu; não está aprovado', () => {
    const eventos = [alt(A, 1, T0, { formaEmUso: 'F' }), alt(A, 2, T0 + 10, { formaEmUso: 'G' }), alt(B, 1, T0 + 20, { status: 'approved', formaAprovada: 'F' })]
    for (const r of todas(eventos, 'GL-900001', 'orig', 'proposed')) expect(r.status).toBe('proposed')
  })

  it('B aprova a forma que viu e é a de agora: aprovado, nas duas ordens; as duas aprovações: vale a de maior hlc', () => {
    const so = [alt(A, 1, T0, { formaEmUso: 'F' }), alt(B, 1, T0 + 10, { status: 'approved', formaAprovada: 'F' })]
    for (const r of todas(so, 'GL-900001', 'orig', 'proposed')) expect(r.status).toBe('approved')
    // A aprova F (t2), B edita G (t3) e aprova G (t4): a aprovação de G é a que vale, e a forma de agora é G
    const duas = [alt(A, 1, T0, { formaEmUso: 'F' }), alt(A, 2, T0 + 10, { status: 'approved', formaAprovada: 'F' }), alt(B, 1, T0 + 20, { formaEmUso: 'G' }), alt(B, 2, T0 + 30, { status: 'approved', formaAprovada: 'G' })]
    for (const r of todas(duas, 'GL-900001', 'orig', 'proposed')) expect(r.status).toBe('approved')
    // A aprova F (t4) depois de B ter aprovado G (t3), mas a forma de agora é G (t2): a última aprovação, F, não vale
    const cruzada = [alt(B, 1, T0 + 10, { formaEmUso: 'G' }), alt(B, 2, T0 + 20, { status: 'approved', formaAprovada: 'G' }), alt(A, 1, T0 + 30, { status: 'approved', formaAprovada: 'F' })]
    for (const r of todas(cruzada, 'GL-900001', 'orig', 'proposed')) expect(r.status).toBe('proposed')
  })

  it('o pacote aprova o pt: uma forma em uso o desaprova, e voltar à original (null) o aprova de novo, sem reescrever nada', () => {
    const eventos = [alt(A, 1, T0, { formaEmUso: 'G' }), alt(B, 1, T0 + 10, { formaEmUso: null })]
    for (const r of todas(eventos, 'GL-900001', 'leão-de-teste', 'approved')) expect(r.status).toBe('approved')
    for (const r of todas([alt(A, 1, T0, { formaEmUso: 'G' })], 'GL-900001', 'leão-de-teste', 'approved')) expect(r).toEqual({ status: 'proposed', aprovacaoDesatualizada: true })
  })
})
