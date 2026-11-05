import { fundir } from '../usuario/fusao'
import type { Evento, Json } from '../usuario/eventos'
import { A, B, C, T0, embaralhar, ev, gerador } from '../../tests/suporte/eventosDeTeste'
import { agruparObjetos, chaveDoPrincipal, lerLigacoes, refDoObjeto, regDaLigacao } from './ligacoes'
import { formatarNumero, numerar } from './numeracao'

const PACOTE = new Set([...Array.from({ length: 45 }, (_, i) => formatarNumero('CA', i + 1)), 'BA00001', 'BA00002'])
/** O pacote depois de um volume novo (Tarefa 16): CA00046 e CA00047 podem ser de livro, cumprindo reservas. */
const COM_LIVRO_NOVO = new Set([...PACOTE, 'CA00046', 'CA00047'])
let seqs: Record<string, number> = {}
beforeEach(() => {
  seqs = {}
})
function evento(ap: string, tipo: 'objeto' | 'ligacao', reg: string, op: 'criar' | 'alterar' | 'excluir' | 'restaurar', campos: Record<string, Json>, ms: number): Evento {
  seqs[ap] = (seqs[ap] ?? 0) + 1
  return ev({ ap, seq: seqs[ap]!, ms, tipo, reg, op, campos })
}
const ligar = (ap: string, x: string, y: string, ms: number, ativa = true, op: 'criar' | 'alterar' = 'criar') =>
  evento(ap, 'ligacao', regDaLigacao(x, y), op, op === 'criar' ? { a: x < y ? x : y, b: x < y ? y : x, ativa } : { ativa }, ms)

function grupos(eventos: Evento[], confirmados: Record<string, string> = {}, pacote: ReadonlySet<string> = PACOTE) {
  const e = fundir(eventos)
  return agruparObjetos(e, numerar(e, pacote, confirmados))
}

describe('ligações entre objetos', () => {
  it('a reg é o par em ordem; refs inválidas, iguais ou reg que não bate são ignoradas', () => {
    expect(regDaLigacao('OB-bbbbbbbb-1', 'CA00012')).toBe('CA00012|OB-bbbbbbbb-1')
    const e = fundir([
      ligar(A, 'CA00012', 'OB-aaaaaaaa-1', T0),
      evento(A, 'ligacao', 'CA00001|CA00001', 'criar', { a: 'CA00001', b: 'CA00001', ativa: true }, T0),
      evento(A, 'ligacao', 'x|y', 'criar', { a: 'x', b: 'y', ativa: true }, T0),
      evento(A, 'ligacao', 'CA00002|CA00003', 'criar', { a: 'CA00003', b: 'CA00002', ativa: true }, T0),
    ])
    expect(lerLigacoes(e).map((l) => l.reg)).toEqual(['CA00012|OB-aaaaaaaa-1'])
  })

  // Decisão 38: o principal é o número do sistema DADO PRIMEIRO. SKC: o hlc do pedido. Livro: o hlc da reserva da Tarefa 16
  // que o deu (o pacote não traz data por objeto); sem reserva (IPIAO I, numerado em 31/10/2026, antes de existir
  // objeto SKC), o livro conta como anterior a qualquer SKC.
  it('decisão 38: um objeto SKC criado ANTES do livro que o publicou depois é o principal; o número do livro é apelido', () => {
    const skc = evento(A, 'objeto', 'OB-aaaaaaaa-1', 'criar', { periodo: 'CA' }, T0)
    const reserva = evento('pipeline', 'objeto', 'OB-pipeline-1', 'criar', { periodo: 'CA', reserva: 'TESTE II' }, T0 + 5000)
    const confirmados = { 'OB-aaaaaaaa-1': 'CA00046', 'OB-pipeline-1': 'CA00047' }
    const g = grupos([skc, reserva, ligar(A, 'CA00047', 'OB-aaaaaaaa-1', T0 + 9000)], confirmados, COM_LIVRO_NOVO)
    expect(g.principal('CA00047')).toBe('OB-aaaaaaaa-1')
    expect(g.membros('CA00047')).toEqual(['OB-aaaaaaaa-1', 'CA00047'])
  })

  it('decisão 38: o inverso, o livro deu o número antes da criação do objeto SKC: o livro é o principal', () => {
    const reserva = evento('pipeline', 'objeto', 'OB-pipeline-1', 'criar', { periodo: 'CA', reserva: 'TESTE II' }, T0)
    const skc = evento(A, 'objeto', 'OB-aaaaaaaa-1', 'criar', { periodo: 'CA' }, T0 + 5000)
    const confirmados = { 'OB-pipeline-1': 'CA00046', 'OB-aaaaaaaa-1': 'CA00047' }
    const g = grupos([skc, reserva, ligar(A, 'CA00046', 'OB-aaaaaaaa-1', T0 + 9000)], confirmados, COM_LIVRO_NOVO)
    expect(g.principal('OB-aaaaaaaa-1')).toBe('CA00046')
    expect(g.membros('OB-aaaaaaaa-1')).toEqual(['CA00046', 'OB-aaaaaaaa-1'])
  })

  it('decisão 38: livro sem data de atribuição (sem reserva, como o IPIAO I) vem antes de qualquer SKC, mesmo de período mais antigo', () => {
    const skc = evento(A, 'objeto', 'OB-aaaaaaaa-1', 'criar', { periodo: 'NE' }, T0)
    const g = grupos([skc, ligar(A, 'CA00012', 'OB-aaaaaaaa-1', T0 + 10)], { 'OB-aaaaaaaa-1': 'NE00001' })
    expect(g.principal('OB-aaaaaaaa-1')).toBe('CA00012')
    // A regra antiga ("período mais antigo") daria NE00001.
    expect(g.membros('CA00012')).toEqual(['CA00012', 'OB-aaaaaaaa-1'])
  })

  it('decisão 38: entre dois SKC vale o pedido mais antigo, não o período nem o número', () => {
    const primeiro = evento(A, 'objeto', 'OB-aaaaaaaa-1', 'criar', { periodo: 'BA' }, T0)
    const depois = evento(B, 'objeto', 'OB-bbbbbbbb-1', 'criar', { periodo: 'NE' }, T0 + 1000)
    const g = grupos([depois, primeiro, ligar(B, 'OB-aaaaaaaa-1', 'OB-bbbbbbbb-1', T0 + 2000)])
    expect(g.principal('OB-bbbbbbbb-1')).toBe('OB-aaaaaaaa-1')
  })

  it('decisão 38: empates: no mesmo hlc, livro antes de SKC, depois o número; dois livros sem data, pelo número', () => {
    const reserva = evento('pipeline', 'objeto', 'OB-pipeline-1', 'criar', { periodo: 'CA', reserva: 'TESTE II' }, T0 + 1000)
    const reserva2 = evento('pipeline', 'objeto', 'OB-pipeline-2', 'criar', { periodo: 'CA', reserva: 'TESTE II' }, T0 + 1000)
    const skc = evento('aaaaaaa0', 'objeto', 'OB-aaaaaaa0-1', 'criar', { periodo: 'CA' }, T0 + 1000)
    // O mesmo ms e o mesmo contador: os hlc só diferem pelo aparelho ('aaaaaaa0' < 'pipeline'), então o pedido do SKC é
    // ANTERIOR e o SKC é o principal (não há empate de verdade).
    expect(skc.hlc < reserva.hlc).toBe(true)
    // O SKC tem o número MENOR (CA00045 < CA00046 < CA00047): se o número decidisse antes do tipo, o SKC venceria.
    const pacote = new Set([...COM_LIVRO_NOVO].filter((x) => x !== 'CA00045'))
    const confirmados = { 'OB-aaaaaaa0-1': 'CA00045', 'OB-pipeline-1': 'CA00047', 'OB-pipeline-2': 'CA00046' }
    const e = fundir([skc, reserva, reserva2])
    const n = numerar(e, pacote, confirmados)
    expect(n.porId.get('OB-aaaaaaa0-1')).toMatchObject({ numero: 'CA00045', situacao: 'confirmado' })
    expect(chaveDoPrincipal('CA00047', e, n) > chaveDoPrincipal('OB-aaaaaaa0-1', e, n)).toBe(true)
    // Um empate EXATO de hlc entre aparelhos diferentes não acontece com eventos válidos (o hlc leva o aparelho), mas a
    // regra é total: com o pedido do SKC e o das reservas no MESMO hlc, o livro vem antes do SKC, e entre os dois livros,
    // o menor número.
    const h = e.hlcDoCampo('objeto', 'OB-pipeline-1', 'periodo')!
    const mesmo: typeof e = Object.create(e)
    mesmo.hlcDoCampo = (tipo, id, campo) => (campo === 'periodo' ? h : e.hlcDoCampo(tipo, id, campo))
    const chaves = ['OB-aaaaaaa0-1', 'CA00047', 'CA00046'].map((ref) => [chaveDoPrincipal(ref, mesmo, n), ref] as const)
    expect(chaves.map(([c]) => c.split(' ')[1])).toEqual([h, h, h])
    expect(chaves.sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, ref]) => ref)).toEqual(['CA00046', 'CA00047', 'OB-aaaaaaa0-1'])
    // Dois livros sem data: o menor número (por ponto de código).
    const g = grupos([ligar(A, 'CA00030', 'BA00001', T0)])
    expect(g.principal('CA00030')).toBe('BA00001')
  })

  it('decisão 38: cadeia de três (SKC, livro novo, SKC) em qualquer ordem: o dado primeiro é o principal; membros na ordem de atribuição', () => {
    // a é do Neolítico (pela regra antiga, "período mais antigo", seria o principal), mas foi o último a ganhar número.
    const a = evento(A, 'objeto', 'OB-aaaaaaaa-1', 'criar', { periodo: 'NE' }, T0 + 3000)
    const reserva = evento('pipeline', 'objeto', 'OB-pipeline-1', 'criar', { periodo: 'CA', reserva: 'TESTE II' }, T0 + 1000)
    const c = evento(C, 'objeto', 'OB-cccccccc-1', 'criar', { periodo: 'CA' }, T0 + 2000)
    const ligs = [ligar(A, 'OB-aaaaaaaa-1', 'CA00046', T0 + 5000), ligar(C, 'CA00046', 'OB-cccccccc-1', T0 + 5000)]
    const confirmados = { 'OB-pipeline-1': 'CA00046', 'OB-cccccccc-1': 'CA00047', 'OB-aaaaaaaa-1': 'NE00001' }
    const aleatorio = gerador(11)
    for (let i = 0; i < 40; i++) {
      const g = grupos(embaralhar([a, reserva, c, ...ligs], aleatorio), confirmados, COM_LIVRO_NOVO)
      for (const r of ['OB-aaaaaaaa-1', 'CA00046', 'OB-cccccccc-1']) {
        expect(g.principal(r)).toBe('CA00046')
        expect(g.membros(r)).toEqual(['CA00046', 'OB-cccccccc-1', 'OB-aaaaaaaa-1'])
      }
    }
  })

  it('SKC↔SKC; desfazer separa e refazer junta de novo (o último hlc vale)', () => {
    const x = evento(A, 'objeto', 'OB-aaaaaaaa-1', 'criar', { periodo: 'CA' }, T0)
    const y = evento(B, 'objeto', 'OB-bbbbbbbb-1', 'criar', { periodo: 'CA' }, T0 + 1)
    const liga = ligar(A, 'OB-aaaaaaaa-1', 'OB-bbbbbbbb-1', T0 + 10)
    expect(grupos([x, y, liga]).principal('OB-bbbbbbbb-1')).toBe('OB-aaaaaaaa-1')
    const desfaz = ligar(B, 'OB-aaaaaaaa-1', 'OB-bbbbbbbb-1', T0 + 20, false, 'alterar')
    expect(grupos([x, y, liga, desfaz]).principal('OB-bbbbbbbb-1')).toBe('OB-bbbbbbbb-1')
    const refaz = ligar(A, 'OB-aaaaaaaa-1', 'OB-bbbbbbbb-1', T0 + 30, true, 'alterar')
    expect(grupos([refaz, desfaz, liga, y, x]).principal('OB-bbbbbbbb-1')).toBe('OB-aaaaaaaa-1')
  })

  it('duas ligações concorrentes em cadeia ou em ciclo dão o mesmo grupo e o mesmo principal em qualquer ordem', () => {
    const objs = [A, B, C].map((ap, i) => evento(ap, 'objeto', `OB-${ap}-1`, 'criar', { periodo: 'CA' }, T0 + i))
    const cadeia = [ligar(A, 'OB-aaaaaaaa-1', 'OB-bbbbbbbb-1', T0 + 10), ligar(C, 'OB-bbbbbbbb-1', 'OB-cccccccc-1', T0 + 10), ligar(B, 'CA00030', 'OB-cccccccc-1', T0 + 11)]
    const ciclo = [...cadeia, ligar(B, 'OB-aaaaaaaa-1', 'OB-cccccccc-1', T0 + 12)]
    const aleatorio = gerador(3)
    for (const ligs of [cadeia, ciclo]) {
      const ref = grupos([...objs, ...ligs])
      expect(ref.principal('OB-bbbbbbbb-1')).toBe('CA00030')
      expect(ref.membros('OB-aaaaaaaa-1')).toEqual(['CA00030', 'OB-aaaaaaaa-1', 'OB-bbbbbbbb-1', 'OB-cccccccc-1'])
      for (let i = 0; i < 40; i++) {
        const g = grupos(embaralhar([...objs, ...ligs], aleatorio))
        for (const r of ['OB-aaaaaaaa-1', 'OB-bbbbbbbb-1', 'OB-cccccccc-1', 'CA00030']) {
          expect(g.principal(r)).toBe('CA00030')
          expect(g.membros(r)).toEqual(ref.membros(r))
        }
      }
    }
  })

  it('revisão 1: um objeto SKC excluído sai do grupo (nunca é o principal; a página do livro não redireciona a ele); restaurar o traz de volta', () => {
    const skc = evento(A, 'objeto', 'OB-aaaaaaaa-1', 'criar', { periodo: 'CA' }, T0)
    // O livro novo (reserva da Tarefa 16, depois do SKC): sem a exclusão, o SKC é o principal (decisão 38).
    const reserva = evento('pipeline', 'objeto', 'OB-pipeline-1', 'criar', { periodo: 'CA', reserva: 'TESTE II' }, T0 + 5)
    const liga = ligar(A, 'CA00047', 'OB-aaaaaaaa-1', T0 + 10)
    const confirmados = { 'OB-aaaaaaaa-1': 'CA00046', 'OB-pipeline-1': 'CA00047' }
    const g0 = (eventos: Evento[]) => grupos(eventos, confirmados, COM_LIVRO_NOVO)
    expect(g0([skc, reserva, liga]).principal('CA00047')).toBe('OB-aaaaaaaa-1')
    const fora = evento(A, 'objeto', 'OB-aaaaaaaa-1', 'excluir', {}, T0 + 20)
    const g = g0([skc, reserva, liga, fora])
    expect(g.principal('CA00047')).toBe('CA00047')
    expect(g.membros('CA00047')).toEqual(['CA00047'])
    expect(g.ligacoesDe('CA00047')).toEqual([])
    const volta = evento(A, 'objeto', 'OB-aaaaaaaa-1', 'restaurar', {}, T0 + 30)
    expect(g0([skc, reserva, liga, fora, volta]).principal('CA00047')).toBe('OB-aaaaaaaa-1')
  })

  it('revisão 1: a regra do principal está numa função só (chaveDoPrincipal): livro sem data < SKC pelo hlc < sem número', () => {
    const e = fundir([evento(A, 'objeto', 'OB-aaaaaaaa-1', 'criar', { periodo: 'BA' }, T0), evento(A, 'objeto', 'OB-aaaaaaaa-2', 'criar', { periodo: null }, T0 + 1)])
    const n = numerar(e, PACOTE, {})
    expect(chaveDoPrincipal('CA00012', e, n) < chaveDoPrincipal('BA00001', e, n)).toBe(false) // dois livros sem data: pelo número
    expect(chaveDoPrincipal('BA00001', e, n) < chaveDoPrincipal('OB-aaaaaaaa-1', e, n)).toBe(true)
    expect(chaveDoPrincipal('OB-aaaaaaaa-1', e, n) < chaveDoPrincipal('OB-aaaaaaaa-2', e, n)).toBe(true) // o rascunho por último
  })

  it('refDoObjeto: o número de um objeto SKC vira o id dele; o do livro fica número', () => {
    const e = fundir([evento(A, 'objeto', 'OB-aaaaaaaa-1', 'criar', { periodo: 'CA' }, T0)])
    const n = numerar(e, PACOTE, {})
    expect(refDoObjeto('CA00046', n)).toBe('OB-aaaaaaaa-1')
    expect(refDoObjeto('ca00012', n)).toBe('CA00012')
    expect(refDoObjeto('OB-aaaaaaaa-1', n)).toBe('OB-aaaaaaaa-1')
    expect(refDoObjeto('nada', n)).toBeNull()
  })
})
