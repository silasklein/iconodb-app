import { A, B, C, embaralhar, ev, gerador, HORA, T0 } from '../../tests/suporte/eventosDeTeste'
import type { Campos, Evento } from '../usuario/eventos'
import { estadoCanonico, fundir } from '../usuario/fusao'
import {
  campoDaOrdem,
  campoDaPresenca,
  extrairCodigos,
  lerColecao,
  MAXIMO_DA_ORDEM,
  PASSO_DA_ORDEM,
  planejarAcrescentar,
  planejarMover,
  refDeObjeto,
  refDoCampo,
  type Membro,
} from './modelo'

const CO = 'CO-aaaaaaaa-1'
const colecaoDe = (eventos: Evento[], id = CO) => lerColecao(fundir(eventos).registro('colecao', id)!)
const membros = (...pares: [string, number][]): Membro[] => pares.map(([ref, ordem]) => ({ ref, ordem }))
const refs = (m: readonly Membro[]) => m.map((x) => x.ref)
/** Os campos de membros presentes, como um evento os escreveria: `m:<ref>` = true e `i:<ref>` = a ordem. */
const cam = (...pares: [string, number][]): Campos => Object.fromEntries(pares.flatMap(([ref, ordem]) => [[`m:${ref}`, true], [`i:${ref}`, ordem]]))

/** Aplica os campos do plano sobre a lista (como a fusão faria) e devolve a lista ordenada. */
function aplicarPlano(atual: readonly Membro[], campos: Campos): Membro[] {
  const mapa = new Map(atual.map((m) => [m.ref, m.ordem]))
  for (const [campo, valor] of Object.entries(campos)) {
    const ref = refDoCampo(campo)!
    if (campo.startsWith('m:')) {
      if (valor === null) mapa.delete(ref)
      else if (!mapa.has(ref)) mapa.set(ref, 0)
    } else if (mapa.has(ref)) mapa.set(ref, valor as number)
  }
  return [...mapa].map(([ref, ordem]) => ({ ref, ordem })).sort((x, y) => x.ordem - y.ordem || (x.ref < y.ref ? -1 : 1))
}

describe('refs e campos', () => {
  it('a PRESENÇA é "m:<ref>" (true ou null) e a ORDEM é "i:<ref>" (inteiro); a ref volta dos dois campos', () => {
    expect(campoDaPresenca('CA00023')).toBe('m:CA00023')
    expect(campoDaOrdem('CA00023')).toBe('i:CA00023')
    for (const campo of ['i:CA00023', 'm:CA00023']) expect(refDoCampo(campo)).toBe('CA00023')
    expect(refDoCampo('m:OB-aaaaaaaa-3')).toBe('OB-aaaaaaaa-3')
    expect(refDoCampo('i:OB-aaaaaaaa-3')).toBe('OB-aaaaaaaa-3')
    expect(refDoCampo('nome')).toBeNull()
    expect(refDoCampo('i:')).toBeNull()
    expect(refDoCampo('m:')).toBeNull()
  })

  it('refDeObjeto: número em maiúsculas, id de objeto SKC como está, o resto não vale', () => {
    expect(refDeObjeto('ca00023')).toBe('CA00023')
    expect(refDeObjeto(' CA00023 ')).toBe('CA00023')
    expect(refDeObjeto('OB-aaaaaaaa-3')).toBe('OB-aaaaaaaa-3')
    expect(refDeObjeto('f100001')).toBe('F100001')
    expect(refDeObjeto('ZZ00001')).toBeNull()
    for (const ruim of ['', 'CA23', 'XYZ', 'GL-900001', 'CO-aaaaaaaa-1', null, 4, undefined]) expect(refDeObjeto(ruim)).toBeNull()
  })
})

describe('lerColecao', () => {
  it('lê o nome, a descrição e os membros pela ordem (inteiros), com o desempate pela ref', () => {
    const c = colecaoDe([
      ev({ seq: 1, tipo: 'colecao', reg: CO, op: 'criar', campos: { nome: 'Íbices em selos', descricao: 'Notas soltas', ...cam(['CA00003', 3072], ['CA00001', 1024], ['BA00002', 2048], ['BA00001', 2048]) } }),
    ])
    expect(c.nome).toBe('Íbices em selos')
    expect(c.descricao).toBe('Notas soltas')
    expect(c.membros).toEqual(membros(['CA00001', 1024], ['BA00001', 2048], ['BA00002', 2048], ['CA00003', 3072]))
    expect(c.excluida).toBe(false)
  })

  it('só é membro quem tem m:true E uma ordem inteira válida; o resto é ignorado (tirado, sem ordem, ordem ruim, ordem sem presença, outros campos)', () => {
    const c = colecaoDe([
      ev({
        seq: 1,
        tipo: 'colecao',
        reg: CO,
        op: 'criar',
        campos: {
          nome: 'x',
          'm:CA00001': null, 'i:CA00001': 100, // tirado: a ordem que sobra não o traz de volta
          'm:CA00002': true, 'i:CA00002': 1.5, // ordem não inteira
          'm:CA00003': true, 'i:CA00003': '4', // ordem de texto
          'm:CA00004': true, // sem ordem
          'i:CA00007': 9, // ordem sem presença
          'm:CA00005': true, 'i:CA00005': -7,
          'm:XYZ': true, 'i:XYZ': 3,
          'm:CA00006': true, 'i:CA00006': 5,
          'm:CA00008': 'sim', 'i:CA00008': 8, // presença que não é true
          membros: ['CA00009'], itens: ['CA00008'],
        },
      }),
    ])
    expect(c.membros).toEqual(membros(['CA00005', -7], ['CA00006', 5]))
  })

  it('as regras de leitura que o porte para Python (Tarefa 16) copia: m: só com o true do JSON; i: só inteiro seguro (nem booleano, nem texto, nem fracionário; o limite ±(2^53 − 1) é do validador de eventos); ref só ASCII e canônica', () => {
    const c = colecaoDe([
      ev({
        seq: 1,
        tipo: 'colecao',
        reg: CO,
        op: 'criar',
        campos: {
          nome: 'x',
          'm:CA00001': 1, 'i:CA00001': 10, // 1 não é true
          'm:CA00002': 'true', 'i:CA00002': 20, // texto não é true
          'm:CA00003': true, 'i:CA00003': true, // booleano não é inteiro
          'm:CA00005': true, 'i:CA00005': Number.MAX_SAFE_INTEGER, // o último inteiro seguro vale
          'm:CA00006': true, 'i:CA00006': -Number.MAX_SAFE_INTEGER,
          'm:ca00007': true, 'i:ca00007': 7, // minúsculas: não é canônica (a canônica é CA00007)
          'm:f100008': true, 'i:f100008': 8, // idem para Ferro I
          'm:CA０００08': true, 'i:CA０００08': 8, // dígitos de largura total: o \d do JS é só ASCII
          'm: CA00009': true, 'i: CA00009': 9, // espaço na ponta do nome do campo
          'm:OB-ABCDEFGH-1': true, 'i:OB-ABCDEFGH-1': 11, // o id de objeto SKC é em minúsculas
          'm:OB-abcdefgh-1': true, 'i:OB-abcdefgh-1': 12,
        },
      }),
    ])
    expect(c.membros).toEqual(membros(['CA00006', -Number.MAX_SAFE_INTEGER], ['OB-abcdefgh-1', 12], ['CA00005', Number.MAX_SAFE_INTEGER]))
    expect(refDeObjeto('ca00007')).toBe('CA00007') // refDeObjeto normaliza; o campo é que tem de já estar normalizado
  })

  it('sem nome vale texto vazio; excluída aparece como excluída e volta ao restaurar', () => {
    const c = colecaoDe([ev({ seq: 1, tipo: 'colecao', reg: CO, op: 'excluir' })])
    expect(c.nome).toBe('')
    expect(c.excluida).toBe(true)
    const volta = colecaoDe([ev({ seq: 1, tipo: 'colecao', reg: CO, op: 'excluir' }), ev({ seq: 2, tipo: 'colecao', reg: CO, op: 'restaurar' })])
    expect(volta.excluida).toBe(false)
  })

  it('devolve o mesmo objeto enquanto o registro não muda (cache)', () => {
    const e = fundir([ev({ seq: 1, tipo: 'colecao', reg: CO, op: 'criar', campos: { nome: 'a' } })])
    const r = e.registro('colecao', CO)!
    expect(lerColecao(r)).toBe(lerColecao(r))
  })
})

describe('planejarAcrescentar', () => {
  it('numa coleção vazia começa em um passo e segue de passo em passo', () => {
    expect(planejarAcrescentar([], ['CA00001', 'CA00002'])).toEqual(cam(['CA00001', PASSO_DA_ORDEM], ['CA00002', 2 * PASSO_DA_ORDEM]))
  })
  it('vai depois do último; quem já é membro não entra de novo; repetidos na entrada contam uma vez', () => {
    const atual = membros(['CA00001', 1024], ['CA00002', 5000])
    expect(planejarAcrescentar(atual, ['CA00002', 'CA00003', 'CA00003', 'CA00004'])).toEqual(cam(['CA00003', 5000 + PASSO_DA_ORDEM], ['CA00004', 5000 + 2 * PASSO_DA_ORDEM]))
    expect(planejarAcrescentar(atual, ['CA00001'])).toEqual({})
  })
})

describe('planejarMover: poucos eventos', () => {
  const base = membros(['A', 1024], ['B', 2048], ['C', 3072], ['D', 4096])

  it('sem mudança de posição não há o que gravar', () => {
    expect(planejarMover(base, 2, 2)).toEqual({ campos: {}, renumerou: false })
  })
  it('para o fim: um só campo, um passo depois do último', () => {
    const p = planejarMover(base, 0, 3)
    expect(p).toEqual({ campos: { 'i:A': 4096 + PASSO_DA_ORDEM }, renumerou: false })
  })
  it('para o início: um só campo, um passo antes do primeiro', () => {
    expect(planejarMover(base, 3, 0)).toEqual({ campos: { 'i:D': 1024 - PASSO_DA_ORDEM }, renumerou: false })
  })
  it('para o meio: um só campo, no meio entre os vizinhos', () => {
    expect(planejarMover(base, 3, 1)).toEqual({ campos: { 'i:D': 1536 }, renumerou: false })
    expect(planejarMover(base, 0, 2)).toEqual({ campos: { 'i:A': 3584 }, renumerou: false })
  })
  it('em cada caso a nova lista tem a ordem esperada', () => {
    for (let de = 0; de < 4; de++) {
      for (let para = 0; para < 4; para++) {
        const esperado = refs(base)
        esperado.splice(para, 0, esperado.splice(de, 1)[0]!)
        expect(refs(aplicarPlano(base, planejarMover(base, de, para).campos))).toEqual(esperado)
      }
    }
  })
  it('sem espaço entre os vizinhos, renumera todos de uma vez (um só evento) na ordem nova', () => {
    const apertada = membros(['A', 10], ['B', 11], ['C', 12], ['D', 13])
    const p = planejarMover(apertada, 3, 1) // D entre A e B: 10 e 11 não têm espaço
    expect(p.renumerou).toBe(true)
    expect(Object.keys(p.campos).length).toBeGreaterThan(1)
    expect(refs(aplicarPlano(apertada, p.campos))).toEqual(['A', 'D', 'B', 'C'])
    // renumera com passos largos
    const ordens = aplicarPlano(apertada, p.campos).map((m) => m.ordem)
    expect(ordens).toEqual([1024, 2048, 3072, 4096])
  })
  it('ao renumerar escreve a ordem de TODOS os presentes, mesmo dos que não mudam de valor, e só a ordem (nunca a presença)', () => {
    const quase = membros(['A', 1024], ['B', 2048], ['C', 2049], ['D', 3072])
    const p = planejarMover(quase, 3, 2) // D entre B(2048) e C(2049): sem espaço
    expect(p.renumerou).toBe(true)
    expect(Object.keys(p.campos).sort()).toEqual(['i:A', 'i:B', 'i:C', 'i:D'])
    expect(p.campos).toEqual({ 'i:A': 1024, 'i:B': 2048, 'i:D': 3072, 'i:C': 4096 })
    expect(Object.keys(p.campos).every((c) => c.startsWith('i:'))).toBe(true)
  })
  it('mover nunca escreve a presença (m:): só quem entra ou sai da coleção escreve', () => {
    for (let de = 0; de < 4; de++) for (let para = 0; para < 4; para++) expect(Object.keys(planejarMover(base, de, para).campos).filter((c) => c.startsWith('m:'))).toEqual([])
  })
  it('com duas ordens iguais (dois aparelhos pararam no mesmo meio) a próxima mudança renumera', () => {
    const empate = membros(['A', 1024], ['B', 2048], ['C', 2048], ['D', 4096])
    const p = planejarMover(empate, 3, 2) // D entre B e C, que têm a mesma ordem
    expect(p.renumerou).toBe(true)
    expect(refs(aplicarPlano(empate, p.campos))).toEqual(['A', 'B', 'D', 'C'])
  })
  it('um valor fora do limite seguro também renumera', () => {
    const longe = membros(['A', MAXIMO_DA_ORDEM], ['B', MAXIMO_DA_ORDEM + 1])
    const p = planejarMover(longe, 0, 1)
    expect(p.renumerou).toBe(true)
    expect(refs(aplicarPlano(longe, p.campos))).toEqual(['B', 'A'])
  })
  it('uma coleção de um só membro não muda', () => {
    expect(planejarMover(membros(['A', 5]), 0, 0).campos).toEqual({})
  })
  it('índices fora da lista são erro', () => {
    expect(() => planejarMover(base, -1, 0)).toThrow()
    expect(() => planejarMover(base, 0, 4)).toThrow()
  })

  it('movimentos aleatórios: a ordem sempre fica certa e quase todos gravam um só campo', () => {
    const sorteio = gerador(7)
    let atual = membros(...Array.from({ length: 30 }, (_, i): [string, number] => [`CA${String(i + 1).padStart(5, '0')}`, (i + 1) * PASSO_DA_ORDEM]))
    let esperado = refs(atual)
    let renumeracoes = 0
    let campos = 0
    const movimentos = 400
    for (let k = 0; k < movimentos; k++) {
      const de = Math.floor(sorteio() * atual.length)
      const para = Math.floor(sorteio() * atual.length)
      const p = planejarMover(atual, de, para)
      esperado.splice(para, 0, esperado.splice(de, 1)[0]!)
      atual = aplicarPlano(atual, p.campos)
      expect(refs(atual)).toEqual(esperado)
      if (p.renumerou) renumeracoes++
      campos += Object.keys(p.campos).length
    }
    expect(renumeracoes / movimentos).toBeLessThan(0.1)
    // escrever pouco: a média fica perto de um campo por movimento
    expect(campos / movimentos).toBeLessThan(3)
    esperado = []
  })
})

describe('ordem concorrente em vários aparelhos converge (Tarefa 2)', () => {
  // A cria a coleção com 4 objetos. Depois, sem se ver, A e B mexem na ordem; C mexe em outro objeto.
  const criar = ev({ ap: A, seq: 1, ms: T0, tipo: 'colecao', reg: CO, op: 'criar', campos: { nome: 'Íbices', ...cam(['CA00001', 1024], ['CA00002', 2048], ['CA00003', 3072], ['CA00004', 4096]) } })
  const eventos: Evento[] = [
    criar,
    // A move CA00004 para o início
    ev({ ap: A, seq: 2, ms: T0 + HORA, tipo: 'colecao', reg: CO, campos: { 'i:CA00004': 0 } }),
    // B (relógio adiantado) move CA00001 para o fim e o mesmo CA00004 para o meio
    ev({ ap: B, seq: 1, ms: T0 + 2 * HORA, tipo: 'colecao', reg: CO, campos: { 'i:CA00001': 5120 } }),
    ev({ ap: B, seq: 2, ms: T0 + 2 * HORA + 1000, tipo: 'colecao', reg: CO, campos: { 'i:CA00004': 2560 } }),
    // C tira CA00002 e põe um novo
    ev({ ap: C, seq: 1, ms: T0 + HORA + 5, tipo: 'colecao', reg: CO, campos: { 'm:CA00002': null } }),
    ev({ ap: C, seq: 2, ms: T0 + HORA + 6, tipo: 'colecao', reg: CO, campos: cam(['CA00009', 6144]) }),
    // C mexe também no nome
    ev({ ap: C, seq: 3, ms: T0 + HORA + 7, tipo: 'colecao', reg: CO, campos: { nome: 'Íbices em selos' } }),
  ]

  it('a mais nova vence por membro e a lista final é a mesma em qualquer ordem de chegada', () => {
    const esperado = colecaoDe(eventos)
    expect(refs(esperado.membros)).toEqual(['CA00004', 'CA00003', 'CA00001', 'CA00009'])
    expect(esperado.nome).toBe('Íbices em selos')
    const canonico = estadoCanonico(fundir(eventos))
    const sorteio = gerador(42)
    for (let i = 0; i < 300; i++) {
      const misturado = embaralhar([...eventos, ...(i % 3 === 0 ? eventos : [])], sorteio)
      const e = fundir(misturado)
      expect(estadoCanonico(e)).toBe(canonico)
      expect(lerColecao(e.registro('colecao', CO)!).membros).toEqual(esperado.membros)
    }
  })

  it('o perdedor fica no histórico do membro', () => {
    const e = fundir(eventos)
    const historico = e.historico(CO, 'i:CA00004', 'colecao').map((h) => h.valor)
    expect(historico).toEqual([4096, 0])
    expect(lerColecao(e.registro('colecao', CO)!).membros.find((m) => m.ref === 'CA00004')!.ordem).toBe(2560)
  })

  it('tirar e pôr o mesmo objeto: vence o mais novo, sem duplicar', () => {
    const base = [criar]
    const tirou = ev({ ap: A, seq: 2, ms: T0 + HORA, tipo: 'colecao', reg: CO, campos: { 'm:CA00002': null } })
    const pos = ev({ ap: B, seq: 1, ms: T0 + 2 * HORA, tipo: 'colecao', reg: CO, campos: cam(['CA00002', 2048]) })
    expect(refs(colecaoDe([...base, tirou, pos]).membros)).toEqual(['CA00001', 'CA00002', 'CA00003', 'CA00004'])
    expect(refs(colecaoDe([...base, pos, tirou]).membros)).toEqual(['CA00001', 'CA00002', 'CA00003', 'CA00004'])
    const tirouDepois = ev({ ap: B, seq: 2, ms: T0 + 3 * HORA, tipo: 'colecao', reg: CO, campos: { 'm:CA00002': null } })
    expect(refs(colecaoDe([tirouDepois, pos, ...base, tirou]).membros)).toEqual(['CA00001', 'CA00003', 'CA00004'])
  })

  it('dois aparelhos põem objetos diferentes no mesmo meio: a ordem empata e todos concordam (ref desempata)', () => {
    const x = ev({ ap: A, seq: 2, ms: T0 + HORA, tipo: 'colecao', reg: CO, campos: { 'i:CA00004': 1536 } })
    const y = ev({ ap: B, seq: 1, ms: T0 + HORA, tipo: 'colecao', reg: CO, campos: { 'i:CA00003': 1536 } })
    const a = colecaoDe([criar, x, y])
    const b = colecaoDe([y, x, criar])
    expect(a.membros).toEqual(b.membros)
    expect(refs(a.membros)).toEqual(['CA00001', 'CA00003', 'CA00004', 'CA00002'])
  })
})

const num = (i: number) => `CA${String(i).padStart(5, '0')}`
/** Todas as permutações que interessam: o mesmo conjunto de eventos, embaralhado e com repetições, muitas vezes. */
function emQualquerOrdem(eventos: Evento[], vezes = 120, semente = 11): Evento[][] {
  const sorteio = gerador(semente)
  return Array.from({ length: vezes }, (_, i) => embaralhar([...eventos, ...(i % 4 === 0 ? eventos.slice(0, 2) : [])], sorteio))
}

describe('presença (m:) e ordem (i:) são campos separados: mover e renumerar nunca ressuscitam quem foi tirado', () => {
  // CA00001..CA00003 estão apertados (1024, 1025, 1026): qualquer movimento para o meio renumera.
  const criar = ev({ ap: A, seq: 1, ms: T0, tipo: 'colecao', reg: CO, op: 'criar', campos: { nome: 'x', ...cam(['CA00001', 1024], ['CA00002', 1025], ['CA00003', 1026], ['CA00004', 4096]) } })

  it('A tira CA00003 enquanto B (sem saber) renumera ao mover: o tirado continua tirado, em qualquer ordem de chegada', () => {
    const tirou = ev({ ap: A, seq: 2, ms: T0 + HORA, tipo: 'colecao', reg: CO, campos: { 'm:CA00003': null } })
    const plano = planejarMover(colecaoDe([criar]).membros, 3, 1) // CA00004 entre CA00001 e CA00002: sem espaço
    expect(plano.renumerou).toBe(true)
    expect(Object.keys(plano.campos)).toContain('i:CA00003') // a renumeração de B escreve a ordem do que B ainda via
    const renumerou = ev({ ap: B, seq: 1, ms: T0 + HORA + 1, tipo: 'colecao', reg: CO, campos: plano.campos }) // hlc DEPOIS do tirar
    const todos = [criar, tirou, renumerou]
    expect(refs(colecaoDe(todos).membros)).toEqual(['CA00001', 'CA00004', 'CA00002'])
    const canonico = estadoCanonico(fundir(todos))
    for (const mix of emQualquerOrdem(todos)) {
      expect(estadoCanonico(fundir(mix))).toBe(canonico)
      expect(refs(colecaoDe(mix).membros)).toEqual(['CA00001', 'CA00004', 'CA00002'])
    }
  })

  it('A tira CA00003 e B move o MESMO objeto (hlc depois): continua tirado', () => {
    const tirou = ev({ ap: A, seq: 2, ms: T0 + HORA, tipo: 'colecao', reg: CO, campos: { 'm:CA00003': null } })
    const moveu = ev({ ap: B, seq: 1, ms: T0 + HORA + 1, tipo: 'colecao', reg: CO, campos: { 'i:CA00003': 512 } })
    const todos = [criar, tirou, moveu]
    for (const mix of emQualquerOrdem(todos)) expect(refs(colecaoDe(mix).membros)).toEqual(['CA00001', 'CA00002', 'CA00004'])
  })

  it('o contrário também vale: tirar DEPOIS de um movimento tira, e pôr de volta (m:true) traz o objeto na ordem que ele tem', () => {
    const moveu = ev({ ap: B, seq: 1, ms: T0 + HORA, tipo: 'colecao', reg: CO, campos: { 'i:CA00003': 512 } })
    const tirou = ev({ ap: A, seq: 2, ms: T0 + 2 * HORA, tipo: 'colecao', reg: CO, campos: { 'm:CA00003': null } })
    expect(refs(colecaoDe([criar, moveu, tirou]).membros)).toEqual(['CA00001', 'CA00002', 'CA00004'])
    const desfez = ev({ ap: A, seq: 3, ms: T0 + 3 * HORA, tipo: 'colecao', reg: CO, campos: { 'm:CA00003': true } })
    // "Desfazer" só escreve a presença: a ordem que ficou (a do movimento de B) continua valendo
    expect(refs(colecaoDe([criar, moveu, tirou, desfez]).membros)).toEqual(['CA00003', 'CA00001', 'CA00002', 'CA00004'])
  })

  it('pôr de novo depois de tirar escreve m:true e uma ordem nova no fim, sem duplicar', () => {
    const tirou = ev({ ap: A, seq: 2, ms: T0 + HORA, tipo: 'colecao', reg: CO, campos: { 'm:CA00001': null } })
    const depois = colecaoDe([criar, tirou]).membros
    const campos = planejarAcrescentar(depois, ['CA00001'])
    expect(campos).toEqual(cam(['CA00001', 4096 + PASSO_DA_ORDEM]))
    const poss = ev({ ap: A, seq: 3, ms: T0 + 2 * HORA, tipo: 'colecao', reg: CO, campos })
    expect(refs(colecaoDe([criar, tirou, poss]).membros)).toEqual(['CA00002', 'CA00003', 'CA00004', 'CA00001'])
  })

  it('dois aparelhos tiram e põem de volta o mesmo objeto, em qualquer ordem: vence o m: mais novo', () => {
    const tirou = ev({ ap: A, seq: 2, ms: T0 + HORA, tipo: 'colecao', reg: CO, campos: { 'm:CA00002': null } })
    const pos = ev({ ap: B, seq: 1, ms: T0 + 2 * HORA, tipo: 'colecao', reg: CO, campos: cam(['CA00002', 9999]) })
    const tiraDeNovo = ev({ ap: A, seq: 3, ms: T0 + 3 * HORA, tipo: 'colecao', reg: CO, campos: { 'm:CA00002': null } })
    for (const mix of emQualquerOrdem([criar, tirou, pos])) expect(refs(colecaoDe(mix).membros)).toContain('CA00002')
    for (const mix of emQualquerOrdem([criar, tirou, pos, tiraDeNovo])) expect(refs(colecaoDe(mix).membros)).not.toContain('CA00002')
  })
})

describe('renumerações concorrentes: a mais nova vence INTEIRA (nunca uma mistura das duas ordens)', () => {
  const base = ev({ ap: A, seq: 0, ms: T0, tipo: 'colecao', reg: CO, op: 'criar', campos: { nome: 'x', ...cam(['CA00001', 1024], ['CA00002', 1025], ['CA00003', 3072], ['CA00004', 4096], ['CA00005', 5120], ['CA00006', 6144]) } })
  const m0 = colecaoDe([base]).membros
  // as duas movem alguém para o meio do vão esgotado (1024, 1025): as duas renumeram
  const pa = planejarMover(m0, 5, 1) // A: CA00006 para o índice 1
  const pb = planejarMover(m0, 4, 1) // B: CA00005 para o índice 1

  it('as duas renumeram e a renumeração escreve todos os presentes', () => {
    expect(pa.renumerou && pb.renumerou).toBe(true)
    expect(Object.keys(pa.campos).sort()).toEqual(['i:CA00001', 'i:CA00002', 'i:CA00003', 'i:CA00004', 'i:CA00005', 'i:CA00006'])
    expect(Object.keys(pb.campos).sort()).toEqual(Object.keys(pa.campos).sort())
  })

  for (const [quemEDepois, rotulo] of [['B', 'B depois de A'], ['A', 'A depois de B']] as const) {
    it(`${rotulo}: sem empates e o resultado é exatamente a visão do aparelho mais novo`, () => {
      const ea = ev({ ap: A, seq: 1, ms: T0 + HORA + (quemEDepois === 'A' ? 5 : 0), tipo: 'colecao', reg: CO, campos: pa.campos })
      const eb = ev({ ap: B, seq: 1, ms: T0 + HORA + (quemEDepois === 'B' ? 5 : 0), tipo: 'colecao', reg: CO, campos: pb.campos })
      const visaoA = colecaoDe([base, ea]).membros
      const visaoB = colecaoDe([base, eb]).membros
      const esperado = quemEDepois === 'B' ? visaoB : visaoA
      const todos = [base, ea, eb]
      for (const mix of emQualquerOrdem(todos)) {
        const fundido = colecaoDe(mix).membros
        expect(fundido).toEqual(esperado)
        expect(new Set(fundido.map((m) => m.ordem)).size).toBe(fundido.length) // sem empates
      }
    })
  }
})

describe('convergência com dois aparelhos fora do ar, movendo, tirando e pondo (60 sementes)', () => {
  /** Um aparelho que trabalha sozinho a partir da base: movimentos, retiradas e acréscimos sorteados. */
  function aparelho(basEventos: Evento[], ap: string, semente: number, passos: number, msInicial: number): Evento[] {
    const r = gerador(semente)
    const eventos: Evento[] = []
    for (let k = 0; k < passos; k++) {
      const atual = colecaoDe([...basEventos, ...eventos]).membros
      const op = r()
      let campos: Campos
      if (op < 0.7 && atual.length > 1) campos = planejarMover(atual, Math.floor(r() * atual.length), Math.floor(r() * atual.length)).campos
      else if (op < 0.85 && atual.length > 0) campos = { [campoDaPresenca(atual[Math.floor(r() * atual.length)]!.ref)]: null }
      else campos = planejarAcrescentar(atual, [num(1 + Math.floor(r() * 40))])
      if (Object.keys(campos).length === 0) continue
      eventos.push(ev({ ap, seq: k + 1, ms: msInicial + k * 1000, tipo: 'colecao', reg: CO, campos }))
    }
    return eventos
  }

  it('converge, sem duplicatas, e o que foi tirado por último (m: mais novo) nunca volta por causa de uma ordem', () => {
    const criar = ev({ ap: A, seq: 0, ms: T0, tipo: 'colecao', reg: CO, op: 'criar', campos: { nome: 'x', ...cam(...Array.from({ length: 20 }, (_, i): [string, number] => [num(i + 1), (i + 1) * PASSO_DA_ORDEM])) } })
    for (let semente = 1; semente <= 60; semente++) {
      const todos = [criar, ...aparelho([criar], A, semente, 60, T0 + HORA), ...aparelho([criar], B, semente + 1000, 60, T0 + HORA + 500)]
      const canonico = estadoCanonico(fundir(todos))
      const lista = refs(colecaoDe(todos).membros)
      expect(new Set(lista).size).toBe(lista.length)
      // a presença de cada ref é a do `m:` mais novo, venha a ordem de onde vier
      const registro = fundir(todos).registro('colecao', CO)!
      for (const ref of new Set(Object.keys(registro.campos).map(refDoCampo).filter((x): x is string => !!x))) {
        expect(lista.includes(ref)).toBe(registro.campos[`m:${ref}`] === true && Number.isSafeInteger(registro.campos[`i:${ref}`]))
      }
      for (const mix of emQualquerOrdem(todos, 8, semente)) {
        expect(estadoCanonico(fundir(mix))).toBe(canonico)
        expect(refs(colecaoDe(mix).membros)).toEqual(lista)
      }
    }
  })
})

describe('extrairCodigos', () => {
  it('separa por espaço, vírgula, ponto e vírgula ou quebra de linha; pões em maiúsculas; sem repetir', () => {
    expect(extrairCodigos('ca00001, CA00002;BA00003\nca00001   OB-aaaaaaaa-3\t CA00004.').codigos).toEqual(['CA00001', 'CA00002', 'BA00003', 'OB-aaaaaaaa-3', 'CA00004'])
    expect(extrairCodigos('F100001 f200002 ZZ00001')).toEqual({ codigos: ['F100001', 'F200002'], ignorados: ['ZZ00001'] })
  })
  it('o que não parece um código é devolvido à parte (para avisar)', () => {
    const r = extrairCodigos('CA00001 xyz CA9 GL-900001')
    expect(r.codigos).toEqual(['CA00001'])
    expect(r.ignorados).toEqual(['xyz', 'CA9', 'GL-900001'])
  })
  it('texto vazio não tem códigos', () => {
    expect(extrairCodigos('  \n ')).toEqual({ codigos: [], ignorados: [] })
  })
})
