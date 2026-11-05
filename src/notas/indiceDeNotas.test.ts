import { ev, T0, A, B } from '../../tests/suporte/eventosDeTeste'
import { fundir, aplicar } from '../usuario/fusao'
import { indiceDeNotas } from './indiceDeNotas'

const SHA = 'a'.repeat(64)
let seq = 0
const nota = (reg: string, campos: Record<string, unknown>, extra: { ap?: string; ms?: number; op?: 'criar' | 'alterar' | 'excluir' | 'restaurar' } = {}) =>
  ev({ ap: extra.ap ?? A, seq: ++seq, ms: extra.ms ?? T0 + seq * 1000, tipo: 'nota', reg, op: extra.op ?? 'criar', campos: campos as never })

describe('indiceDeNotas: o que cada nota diz e a quem se liga', () => {
  it('lê os campos da nota; ligações vêm do texto', () => {
    const e = fundir([
      nota('NT-aaaaaaaa-1', {
        texto: 'ver [[GL-900001|leão]] e [[CA00002]]',
        alvoTipo: 'objeto',
        alvo: 'ca00001',
        rascunho: false,
        ancoras: [{ p: 'PA-1', sha: SHA }],
      }),
    ])
    const { porId } = indiceDeNotas(e)
    const n = porId.get('NT-aaaaaaaa-1')!
    expect(n).toMatchObject({ id: 'NT-aaaaaaaa-1', alvoTipo: 'objeto', alvo: 'CA00001', rascunho: false, excluida: false, ordinal: 1 })
    expect(n.ancoras).toEqual([{ p: 'PA-1', sha: SHA }])
    expect(n.ligacoes).toEqual([
      { tipo: 'verbete', ref: 'GL-900001' },
      { tipo: 'objeto', ref: 'CA00002' },
    ])
  })

  it('campos malformados não derrubam: texto que não é string vira vazio; alvo desconhecido vira nulo', () => {
    const e = fundir([nota('NT-aaaaaaaa-1', { texto: 42, alvoTipo: 'planeta', alvo: 7, ancoras: 'x' })])
    const n = indiceDeNotas(e).porId.get('NT-aaaaaaaa-1')!
    expect(n).toMatchObject({ texto: '', alvoTipo: null, alvo: null, ancoras: [], ligacoes: [] })
  })

  it('"rascunho" só vale se for verdadeiro de fato', () => {
    const e = fundir([nota('NT-aaaaaaaa-1', { texto: 'a', rascunho: 'sim' })])
    expect(indiceDeNotas(e).porId.get('NT-aaaaaaaa-1')!.rascunho).toBe(false)
  })
})

describe('links reversos', () => {
  const estado = fundir([
    nota('NT-aaaaaaaa-1', { texto: 'sobre o objeto, citando [[GL-900001|leão]]', alvoTipo: 'objeto', alvo: 'CA00001' }, { ms: T0 + 1000 }),
    nota('NT-aaaaaaaa-2', { texto: 'sobre o verbete', alvoTipo: 'verbete', alvo: 'GL-900001' }, { ms: T0 + 2000 }),
    nota('NT-aaaaaaaa-3', { texto: 'cita [[ca00001]] e [[GL-900001]] e [[GL-900001|de novo]]', alvoTipo: 'obra', alvo: 'BIB-900001' }, { ms: T0 + 3000 }),
    nota('NT-aaaaaaaa-4', { texto: 'solta', alvoTipo: 'sitio', alvo: 'TESTE-1' }, { ms: T0 + 4000 }),
  ])

  it('o verbete mostra as notas feitas nele e as que o citam, do mais antigo ao mais novo', () => {
    const r = indiceDeNotas(estado).ligadasA('verbete', 'GL-900001')
    expect(r.map((x) => [x.nota.id, x.direta])).toEqual([
      ['NT-aaaaaaaa-1', false],
      ['NT-aaaaaaaa-2', true],
      ['NT-aaaaaaaa-3', false],
    ])
  })

  it('o objeto: a nota dele (direta) e a que o cita; o número vale em qualquer caixa', () => {
    const idx = indiceDeNotas(estado)
    expect(idx.ligadasA('objeto', 'CA00001').map((x) => [x.nota.id, x.direta])).toEqual([
      ['NT-aaaaaaaa-1', true],
      ['NT-aaaaaaaa-3', false],
    ])
    expect(idx.ligadasA('objeto', 'ca00001')).toHaveLength(2)
  })

  it('uma nota que se liga duas vezes ao mesmo alvo conta uma vez', () => {
    expect(indiceDeNotas(estado).ligadasA('verbete', 'GL-900001').filter((x) => x.nota.id === 'NT-aaaaaaaa-3')).toHaveLength(1)
  })

  it('uma nota sobre o alvo que também o cita é direta, uma vez só', () => {
    const e = fundir([nota('NT-aaaaaaaa-9', { texto: 'eu mesmo [[CA00001]]', alvoTipo: 'objeto', alvo: 'CA00001' })])
    expect(indiceDeNotas(e).ligadasA('objeto', 'CA00001').map((x) => [x.nota.id, x.direta])).toEqual([['NT-aaaaaaaa-9', true]])
  })

  it('sem notas, lista vazia', () => {
    expect(indiceDeNotas(estado).ligadasA('verbete', 'GL-999')).toEqual([])
    expect(indiceDeNotas(fundir([])).todas).toEqual([])
  })
})

describe('exclusão e restauração', () => {
  it('uma nota excluída some das listas e dos links reversos; restaurar a traz de volta', () => {
    const base = [nota('NT-aaaaaaaa-1', { texto: 'cita [[GL-900001]]', alvoTipo: 'objeto', alvo: 'CA00001' })]
    const excluida = fundir([...base, nota('NT-aaaaaaaa-1', {}, { op: 'excluir', ms: T0 + 99_000 })])
    const idx = indiceDeNotas(excluida)
    expect(idx.todas).toEqual([])
    expect(idx.ligadasA('verbete', 'GL-900001')).toEqual([])
    expect(idx.ligadasA('objeto', 'CA00001')).toEqual([])
    expect(idx.porId.get('NT-aaaaaaaa-1')!.excluida).toBe(true)
    const restaurada = aplicar(excluida, [nota('NT-aaaaaaaa-1', {}, { op: 'restaurar', ms: T0 + 199_000 })])
    expect(indiceDeNotas(restaurada).todas.map((n) => n.id)).toEqual(['NT-aaaaaaaa-1'])
    expect(indiceDeNotas(restaurada).ligadasA('verbete', 'GL-900001')).toHaveLength(1)
  })

  it('o número "[n]" da nota não muda quando uma anterior é excluída', () => {
    const e = fundir([
      nota('NT-aaaaaaaa-1', { texto: 'a', alvoTipo: 'objeto', alvo: 'CA00001' }, { ms: T0 + 1000 }),
      nota('NT-aaaaaaaa-2', { texto: 'b', alvoTipo: 'objeto', alvo: 'CA00001' }, { ms: T0 + 2000 }),
      nota('NT-aaaaaaaa-1', {}, { op: 'excluir', ms: T0 + 3000 }),
    ])
    expect(indiceDeNotas(e).porId.get('NT-aaaaaaaa-2')!.ordinal).toBe(2)
  })
})

describe('Minhas notas: a ordem', () => {
  it('a mais recente primeiro, pela data de criação; empate pelo id', () => {
    const e = fundir([
      nota('NT-aaaaaaaa-1', { texto: 'velha' }, { ms: T0 + 1000 }),
      nota('NT-bbbbbbbb-1', { texto: 'nova' }, { ap: B, ms: T0 + 5000 }),
      nota('NT-aaaaaaaa-2', { texto: 'do meio' }, { ms: T0 + 3000 }),
    ])
    expect(indiceDeNotas(e).todas.map((n) => n.texto)).toEqual(['nova', 'do meio', 'velha'])
  })

  it('editar uma nota velha não a leva para o topo (a data é a da criação)', () => {
    const e = fundir([
      nota('NT-aaaaaaaa-1', { texto: 'velha' }, { ms: T0 + 1000 }),
      nota('NT-aaaaaaaa-2', { texto: 'nova' }, { ms: T0 + 3000 }),
      nota('NT-aaaaaaaa-1', { texto: 'velha, revista' }, { op: 'alterar', ms: T0 + 9000 }),
    ])
    expect(indiceDeNotas(e).todas.map((n) => n.texto)).toEqual(['nova', 'velha, revista'])
  })
})

describe('custo: não varre as notas a cada pergunta', () => {
  it('o mesmo estado devolve o mesmo índice; outro tipo de registro mudando não o refaz', () => {
    const e1 = fundir([nota('NT-aaaaaaaa-1', { texto: 'a' })])
    expect(indiceDeNotas(e1)).toBe(indiceDeNotas(e1))
    const e2 = aplicar(e1, [ev({ ap: A, seq: 900, tipo: 'colecao', reg: 'CO-aaaaaaaa-1', op: 'criar', campos: { nome: 'x' } })])
    expect(e2).not.toBe(e1)
    expect(indiceDeNotas(e2)).toBe(indiceDeNotas(e1))
  })

  it('uma nota alterada refaz o índice, mas reaproveita a leitura das outras (mesmo objeto NotaVista)', () => {
    const e1 = fundir([nota('NT-aaaaaaaa-1', { texto: 'a' }), nota('NT-aaaaaaaa-2', { texto: 'b' })])
    const antes = indiceDeNotas(e1).porId.get('NT-aaaaaaaa-1')!.registro
    const e2 = aplicar(e1, [nota('NT-aaaaaaaa-2', { texto: 'b2' }, { op: 'alterar' })])
    const idx2 = indiceDeNotas(e2)
    expect(idx2).not.toBe(indiceDeNotas(e1))
    expect(idx2.porId.get('NT-aaaaaaaa-1')!.registro).toBe(antes)
    expect(idx2.porId.get('NT-aaaaaaaa-2')!.texto).toBe('b2')
  })

  it('3000 notas: montar o índice e perguntar 1000 vezes é rápido', () => {
    const eventos = Array.from({ length: 3000 }, (_, i) =>
      nota(`NT-aaaaaaaa-${i + 1}`, { texto: `nota ${i} cita [[GL-90000${i % 7}]]`, alvoTipo: 'objeto', alvo: `CA${String(i % 50).padStart(5, '0')}` }, { ms: T0 + i }),
    )
    const e = fundir(eventos)
    const t0 = performance.now()
    const idx = indiceDeNotas(e)
    for (let i = 0; i < 1000; i++) idx.ligadasA('verbete', `GL-90000${i % 7}`)
    expect(performance.now() - t0).toBeLessThan(1000)
    expect(idx.todas).toHaveLength(3000)
  })
})

describe('quantasDoAlvo: o número da próxima nota', () => {
  it('conta as notas do alvo, as excluídas também', () => {
    const e = fundir([
      nota('NT-aaaaaaaa-1', { texto: 'a', alvoTipo: 'objeto', alvo: 'CA00001' }),
      nota('NT-aaaaaaaa-2', { texto: 'b', alvoTipo: 'objeto', alvo: 'CA00001' }),
      nota('NT-aaaaaaaa-2', {}, { op: 'excluir' }),
      nota('NT-aaaaaaaa-3', { texto: 'c', alvoTipo: 'verbete', alvo: 'GL-1' }),
    ])
    const idx = indiceDeNotas(e)
    expect(idx.quantasDoAlvo('objeto', 'ca00001')).toBe(2)
    expect(idx.quantasDoAlvo('verbete', 'GL-1')).toBe(1)
    expect(idx.quantasDoAlvo('obra', 'BIB-1')).toBe(0)
  })
})

describe('decisão 40: citações reconhecidas no texto também são links reversos', () => {
  const estado = fundir([
    nota('NT-aaaaaaaa-1', { texto: 'parecido com TESTE I: 1-3, 5 e com CA00046.', alvoTipo: 'obra', alvo: 'BIB-900001' }, { ms: T0 + 1000 }),
    nota('NT-aaaaaaaa-2', { texto: 'TESTE I: 2, 2 e [[CA00002]] e CA00002; SKC: 7', alvoTipo: 'verbete', alvo: 'GL-900001' }, { ms: T0 + 2000 }),
    nota('NT-aaaaaaaa-3', { texto: 'a própria: TESTE I: 2', alvoTipo: 'objeto', alvo: 'CA00002' }, { ms: T0 + 3000 }),
    nota('NT-aaaaaaaa-4', { texto: 'excluída: TESTE I: 2', alvoTipo: 'verbete', alvo: 'GL-900001' }, { ms: T0 + 4000 }),
    nota('NT-aaaaaaaa-4', {}, { ms: T0 + 5000, op: 'excluir' }),
    nota('NT-aaaaaaaa-5', { texto: 'em código: `TESTE I: 2` e [[GL-1|TESTE I: 2]]' }, { ms: T0 + 6000 }),
  ])
  const indice = indiceDeNotas(estado)

  it('a nota guarda as chaves de cada número citado (o meio do intervalo também) e os números do sistema', () => {
    expect(indice.porId.get('NT-aaaaaaaa-1')!.citacoes).toEqual({ fontes: ['TESTE I:1', 'TESTE I:2', 'TESTE I:3', 'TESTE I:5'], objetos: ['CA00046'] })
    expect(indice.porId.get('NT-aaaaaaaa-5')!.citacoes).toEqual({ fontes: [], objetos: [] })
  })

  it('cada número coberto lista a nota, sem repetir; o número do sistema vale como [[…]]', () => {
    expect(indice.ligadasA('fonte', 'TESTE I:2').map((l) => [l.nota.id, l.direta])).toEqual([
      ['NT-aaaaaaaa-1', false],
      ['NT-aaaaaaaa-2', false],
      ['NT-aaaaaaaa-3', false],
    ])
    expect(indice.ligadasA('fonte', 'TESTE I:4')).toEqual([])
    expect(indice.ligadasA('fonte', 'SKC:7').map((l) => l.nota.id)).toEqual(['NT-aaaaaaaa-2'])
    expect(indice.ligadasA('objeto', 'CA00046').map((l) => l.nota.id)).toEqual(['NT-aaaaaaaa-1'])
  })

  it('ligadasAQualquer: o objeto pelo número e pelas fontes, cada nota uma vez, a direta vence, na ordem de criação', () => {
    const r = indice.ligadasAQualquer([
      { tipo: 'objeto', ref: 'CA00002' },
      { tipo: 'fonte', ref: 'TESTE I:2' },
      { tipo: 'fonte', ref: 'TESTE I:2' },
    ])
    expect(r.map((l) => [l.nota.id, l.direta])).toEqual([
      ['NT-aaaaaaaa-1', false],
      ['NT-aaaaaaaa-2', false],
      ['NT-aaaaaaaa-3', true],
    ])
    expect(indice.ligadasAQualquer([])).toEqual([])
  })
})
