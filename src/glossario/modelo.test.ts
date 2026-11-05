import { ev, A, B, T0 } from '../../tests/suporte/eventosDeTeste'
import { fundir, estadoCanonico } from '../usuario/fusao'
import { PREFIXOS } from '../usuario/eventos'
import { camposDoVerbeteNovo, chaveDaForma, eVerbeteSkc, lerVerbeteSkc, normalizarForma, RE_VERBETE_SKC, ROTULO_DO_STATUS } from './modelo'

describe('o verbete do usuário (decisão 41)', () => {
  it('o id segue o padrão dos registros do usuário, com o prefixo GL (o gerador de ids o conhece)', () => {
    expect(PREFIXOS).toContain('GL')
    expect(eVerbeteSkc('GL-ab12cd34-1')).toBe(true)
    expect(eVerbeteSkc('GL-ab12cd34-12')).toBe(true)
    // os do pacote, e o que não é deste formato, não são
    for (const x of ['GL-900001', 'GL-000038', 'GL-ab12cd34-0', 'GL-AB12CD34-1', 'GL-ab12cd3-1', 'GL-ab12cd34-1\n', 'GL-SKC-1']) expect(eVerbeteSkc(x), x).toBe(false)
    expect(RE_VERBETE_SKC.source).toBe('^GL-[a-z0-9]{8}-[1-9][0-9]*$')
  })

  it('a forma digitada é normalizada: NFC, sem espaço nas pontas, cada sequência de espaços vira um', () => {
    expect(normalizarForma('  leão \t  íbex\n')).toBe('leão íbex')
    // "ô" decomposto (o + U+0302) vira o composto
    expect(normalizarForma('demônio')).toBe('demônio')
    expect(normalizarForma('demônio')).toBe('demônio'.normalize('NFC'))
    expect(normalizarForma('   ')).toBe('')
  })

  it('a chave de comparação ignora caixa e diacríticos (e os espaços a mais)', () => {
    expect(chaveDaForma('Leão  Íbex')).toBe(chaveDaForma('leao ibex'))
    expect(chaveDaForma('LEÃO-de-teste')).toBe(chaveDaForma('leao-de-teste'))
    expect(chaveDaForma('leão')).not.toBe(chaveDaForma('leoa'))
  })

  it('revisão 3, Minor 2: uma normalização só, a do filtro do campo (dobrar): sem ʿ ʾ \' ’ ` ´ também', async () => {
    const { dobrar } = await import('../objetos-skc/CampoDeEscolha')
    for (const x of ['Baʿal', 'Baʾal', "Ba'al", 'Ba’al', 'Ba`al', 'Ba´al']) {
      expect(chaveDaForma(x), x).toBe(chaveDaForma('baal'))
      expect(chaveDaForma(x), x).toBe(dobrar(x))
    }
    // O hífen fica (é parte da forma: "leão-de-teste" não é "leão de teste").
    expect(chaveDaForma('leão-de-teste')).not.toBe(chaveDaForma('leão de teste'))
    expect(dobrar('  Leão   Íbex ')).toBe(chaveDaForma('leao ibex'))
  })

  it('o criar tem a forma (normalizada) e o estado "a revisar"; a leitura dá a forma em uso e o status', () => {
    expect(camposDoVerbeteNovo('  termo   novo ')).toEqual({ forma: 'termo novo', status: 'proposed' })
    expect(() => camposDoVerbeteNovo('   ')).toThrow()
    const est = fundir([ev({ ap: A, seq: 1, tipo: 'verbete', reg: 'GL-aaaaaaaa-1', op: 'criar', campos: camposDoVerbeteNovo('termo novo') })])
    const v = lerVerbeteSkc(est.registro('verbete', 'GL-aaaaaaaa-1')!)
    expect(v).toEqual({ id: 'GL-aaaaaaaa-1', forma: 'termo novo', formaEmUso: null, emUso: 'termo novo', status: 'proposed', aprovacaoDesatualizada: false, criadoEm: est.registro('verbete', 'GL-aaaaaaaa-1')!.criadoEm, excluido: false })
    expect(ROTULO_DO_STATUS[v.status]).toBe('a revisar')
  })

  it('o lugar da Tarefa 11: formaEmUso e status num alterar (null volta à forma criada); valores fora da lista ficam "a revisar"', () => {
    const est = fundir([
      ev({ ap: A, seq: 1, tipo: 'verbete', reg: 'GL-aaaaaaaa-1', op: 'criar', campos: { forma: 'termo novo', status: 'proposed' } }),
      ev({ ap: A, seq: 2, tipo: 'verbete', reg: 'GL-aaaaaaaa-1', op: 'alterar', campos: { formaEmUso: 'termo revisto', status: 'approved', formaAprovada: 'termo revisto' } }),
    ])
    expect(lerVerbeteSkc(est.registro('verbete', 'GL-aaaaaaaa-1')!)).toMatchObject({ forma: 'termo novo', formaEmUso: 'termo revisto', emUso: 'termo revisto', status: 'approved' })
    const est2 = fundir([
      ev({ ap: A, seq: 1, tipo: 'verbete', reg: 'GL-aaaaaaaa-1', op: 'criar', campos: { forma: 'termo novo', status: 'xyz' } }),
      ev({ ap: A, seq: 2, tipo: 'verbete', reg: 'GL-aaaaaaaa-1', op: 'alterar', campos: { formaEmUso: null } }),
    ])
    expect(lerVerbeteSkc(est2.registro('verbete', 'GL-aaaaaaaa-1')!)).toMatchObject({ formaEmUso: null, emUso: 'termo novo', status: 'proposed' })
  })

  it('dois aparelhos sem internet criam o "mesmo" termo: dois verbetes, e a fusão converge em qualquer ordem', () => {
    const eventos = [
      ev({ ap: A, seq: 1, ms: T0, tipo: 'verbete', reg: 'GL-aaaaaaaa-1', op: 'criar', campos: camposDoVerbeteNovo('termo novo') }),
      ev({ ap: A, seq: 2, ms: T0 + 1, tipo: 'hipotese', reg: 'HY-aaaaaaaa-1', op: 'criar', campos: { objeto: 'CA00001', termos: ['GL-aaaaaaaa-1'], termosRotulos: ['termo novo'] } }),
      ev({ ap: B, seq: 1, ms: T0 + 5, tipo: 'verbete', reg: 'GL-bbbbbbbb-1', op: 'criar', campos: camposDoVerbeteNovo('Termo  Novo') }),
      ev({ ap: B, seq: 2, ms: T0 + 6, tipo: 'hipotese', reg: 'HY-bbbbbbbb-1', op: 'criar', campos: { objeto: 'CA00002', termos: ['GL-bbbbbbbb-1'], termosRotulos: ['Termo Novo'] } }),
    ]
    const ordens = [[0, 1, 2, 3], [3, 2, 1, 0], [2, 0, 3, 1], [1, 3, 0, 2, 1, 3]]
    const estados = ordens.map((o) => fundir(o.map((i) => eventos[i]!)))
    const canonico = estadoCanonico(estados[0]!)
    for (const e of estados) expect(estadoCanonico(e)).toBe(canonico)
    const verbetes = [...estados[0]!.registros.get('verbete')!.values()].map(lerVerbeteSkc)
    expect(verbetes.map((v) => [v.id, v.forma, v.status])).toEqual([
      ['GL-aaaaaaaa-1', 'termo novo', 'proposed'],
      ['GL-bbbbbbbb-1', 'Termo Novo', 'proposed'],
    ])
    expect(new Set(verbetes.map((v) => chaveDaForma(v.forma))).size).toBe(1)
  })
})
