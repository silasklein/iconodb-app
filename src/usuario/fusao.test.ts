import { A, B, C, embaralhar, ev, eventosAleatorios, gerador, hlc, HORA, MINUTO, T0 } from '../../tests/suporte/eventosDeTeste'
import { jsonCanonico, type Evento } from './eventos'
import { aplicar, consolidar, entradasDoCampo, estadoCanonico, fundir, validarBase, type Estado } from './fusao'
import { LIMITE_MS, novoHlc, receberHlc } from './hlc'

const NOTA = 'NT-aaaaaaaa-1'
const nota = (e: Estado, reg = NOTA) => e.registros.get('nota')!.get(reg)

/** O estado canônico sem a contagem de ignorados (que só conta os eventos recebidos nesta fusão). */
const semIgnorados = (e: Estado) => jsonCanonico(consolidar(e))

describe('fundir: forma do estado', () => {
  it('estado vazio tem um mapa (vazio) para cada um dos 13 tipos', () => {
    const e = fundir([])
    expect(e.registros.size).toBe(13)
    expect([...e.registros.values()].every((m) => m.size === 0)).toBe(true)
    expect(e.excluidos).toEqual([])
    expect(e.ignorados).toEqual({ total: 0, motivos: {} })
  })

  it('Registro = {id, tipo, campos, criadoEm, alteradoEm, excluido}', () => {
    const e1 = ev({ seq: 1, op: 'criar', campos: { titulo: 'Íbex' } })
    const e2 = ev({ seq: 2, campos: { texto: 'chifres' } })
    const r = nota(fundir([e2, e1]))!
    expect(r).toEqual({ id: NOTA, tipo: 'nota', campos: { titulo: 'Íbex', texto: 'chifres' }, criadoEm: e1.hlc, alteradoEm: e2.hlc, excluido: false })
    expect(fundir([e1]).registro('nota', NOTA)).toEqual(nota(fundir([e1])))
    expect(fundir([e1]).registro('nota', 'outro')).toBeUndefined()
  })

  it('um campo com null é um valor (limpa), diferente de ausente', () => {
    const e = fundir([ev({ seq: 1, campos: { texto: 'a' } }), ev({ seq: 2, campos: { texto: null } })])
    const r = nota(e)!
    expect('texto' in r.campos).toBe(true)
    expect(r.campos.texto).toBeNull()
    expect('titulo' in r.campos).toBe(false)
    expect(e.historico(NOTA, 'texto', 'nota').map((h) => h.valor)).toEqual(['a'])
  })

  it('hlcDoCampo: o hlc da escrita que vale agora (a maior), null se o campo nunca foi escrito', () => {
    const e1 = ev({ seq: 1, op: 'criar', campos: { texto: 'a', titulo: 't' } })
    const e2 = ev({ seq: 2, campos: { texto: 'b' } })
    const e = fundir([e2, e1])
    expect(e.hlcDoCampo('nota', NOTA, 'texto')).toBe(e2.hlc)
    expect(e.hlcDoCampo('nota', NOTA, 'titulo')).toBe(e1.hlc)
    expect(e.hlcDoCampo('nota', NOTA, 'ausente')).toBeNull()
    expect(e.hlcDoCampo('nota', 'outro', 'texto')).toBeNull()
  })

  it('o mesmo reg em tipos diferentes são registros diferentes', () => {
    const e = fundir([ev({ seq: 1, tipo: 'posicao', reg: 'X', campos: { a: 1 } }), ev({ seq: 2, tipo: 'revisao', reg: 'X', campos: { a: 2 } })])
    expect(e.registros.get('posicao')!.get('X')!.campos).toEqual({ a: 1 })
    expect(e.registros.get('revisao')!.get('X')!.campos).toEqual({ a: 2 })
  })

  it('o campo "__proto__" é só um campo', () => {
    const bruto = JSON.parse(`{"v":1,"id":"${A}-1-0","hlc":"${hlc(T0, 0, A)}","aparelho":"${A}","tipo":"nota","reg":"${NOTA}","op":"criar","campos":{"__proto__":{"x":1}}}`)
    const r = nota(fundir([bruto]))!
    expect(Object.keys(r.campos)).toEqual(['__proto__'])
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })
})

describe('fundir: comutatividade e idempotência', () => {
  it('200 permutações aleatórias do mesmo conjunto dão o mesmo estado', () => {
    const eventos = eventosAleatorios(7, 120)
    const esperado = estadoCanonico(fundir(eventos))
    const aleatorio = gerador(42)
    for (let i = 0; i < 200; i++) {
      expect(estadoCanonico(fundir(embaralhar(eventos, aleatorio)))).toBe(esperado)
    }
  })

  it('vale para outros conjuntos (sementes) também', () => {
    for (const semente of [1, 2, 3, 4, 5]) {
      const eventos = eventosAleatorios(semente, 60)
      const aleatorio = gerador(semente * 100)
      const esperado = estadoCanonico(fundir(eventos))
      for (let i = 0; i < 20; i++) expect(estadoCanonico(fundir(embaralhar(eventos, aleatorio)))).toBe(esperado)
    }
  })

  it('eventos repetidos não mudam nada', () => {
    const eventos = eventosAleatorios(11, 80)
    const esperado = estadoCanonico(fundir(eventos))
    expect(estadoCanonico(fundir([...eventos, ...eventos]))).toBe(esperado)
    const aleatorio = gerador(3)
    const comRepeticoes = embaralhar([...eventos, ...eventos.slice(0, 30), ...eventos.slice(10, 20), ...eventos.slice(10, 20)], aleatorio)
    expect(estadoCanonico(fundir(comRepeticoes))).toBe(esperado)
  })

  it('uma cópia (JSON) do evento conta como o mesmo evento', () => {
    const eventos = eventosAleatorios(12, 40)
    const copias = eventos.map((e) => JSON.parse(JSON.stringify(e)) as Evento)
    expect(estadoCanonico(fundir([...eventos, ...copias]))).toBe(estadoCanonico(fundir(eventos)))
  })

  it('aceita qualquer iterável (um gerador, um Set)', () => {
    const eventos = eventosAleatorios(13, 30)
    function* gerar() {
      yield* eventos
    }
    expect(estadoCanonico(fundir(gerar()))).toBe(estadoCanonico(fundir(eventos)))
    expect(estadoCanonico(fundir(new Set(eventos)))).toBe(estadoCanonico(fundir(eventos)))
  })

  it('é pura: não altera os eventos recebidos', () => {
    const eventos = eventosAleatorios(14, 50)
    const antes = JSON.stringify(eventos)
    fundir(eventos)
    expect(JSON.stringify(eventos)).toBe(antes)
  })
})

describe('fundir: por campo', () => {
  it('A muda o título e B muda o texto da mesma nota: os dois ficam', () => {
    const criar = ev({ ap: A, seq: 1, ms: T0, op: 'criar', campos: { titulo: 'Nota', texto: 'Texto' } })
    const deA = ev({ ap: A, seq: 2, ms: T0 + 10 * MINUTO, campos: { titulo: 'Título de A' } })
    const deB = ev({ ap: B, seq: 1, ms: T0 + 5 * MINUTO, campos: { texto: 'Texto de B' } })
    for (const ordem of [[criar, deA, deB], [deB, deA, criar], [deA, criar, deB]]) {
      const r = nota(fundir(ordem))!
      expect(r.campos).toEqual({ titulo: 'Título de A', texto: 'Texto de B' })
    }
  })
})

describe('fundir: mesmo campo', () => {
  it('vence o hlc maior e o outro fica no histórico', () => {
    const deA = ev({ ap: A, seq: 1, ms: T0 + 1000, campos: { titulo: 'de A' } })
    const deB = ev({ ap: B, seq: 1, ms: T0 + 2000, campos: { titulo: 'de B' } })
    for (const ordem of [[deA, deB], [deB, deA]]) {
      const e = fundir(ordem)
      expect(nota(e)!.campos.titulo).toBe('de B')
      expect(e.historico(NOTA, 'titulo', 'nota')).toEqual([{ valor: 'de A', hlc: deA.hlc, aparelho: A, evento: deA.id }])
    }
  })

  it('o histórico guarda todos os valores anteriores, em ordem de hlc', () => {
    const v1 = ev({ ap: A, seq: 1, ms: T0, campos: { titulo: 'um' } })
    const v2 = ev({ ap: B, seq: 1, ms: T0 + 1, campos: { titulo: 'dois' } })
    const v3 = ev({ ap: A, seq: 2, ms: T0 + 2, campos: { titulo: 'um' } })
    const v4 = ev({ ap: C, seq: 1, ms: T0 + 3, campos: { titulo: 'quatro' } })
    const e = fundir([v4, v2, v3, v1])
    expect(nota(e)!.campos.titulo).toBe('quatro')
    expect(e.historico(NOTA, 'titulo', 'nota').map((h) => [h.valor, h.evento])).toEqual([
      ['um', v1.id],
      ['dois', v2.id],
      ['um', v3.id],
    ])
    expect(e.historico(NOTA, 'outro', 'nota')).toEqual([])
    expect(e.historico('nada', 'titulo', 'nota')).toEqual([])
  })

  it('mesmo milissegundo: o contador desempata; mesmo contador: o aparelho', () => {
    const a = ev({ ap: A, seq: 1, ms: T0, c: 1, campos: { titulo: 'A1' } })
    const b0 = ev({ ap: B, seq: 1, ms: T0, c: 0, campos: { titulo: 'B0' } })
    expect(nota(fundir([a, b0]))!.campos.titulo).toBe('A1')
    const b1 = ev({ ap: B, seq: 2, ms: T0, c: 1, campos: { titulo: 'B1' } })
    expect(nota(fundir([b1, a]))!.campos.titulo).toBe('B1') // "bbbbbbbb" > "aaaaaaaa"
  })

  it('a ordem de uma coleção (lista inteira) converge e a perdedora fica no histórico (Foco 1)', () => {
    const CO = 'CO-aaaaaaaa-1'
    const criar = ev({ ap: A, seq: 1, ms: T0, tipo: 'colecao', reg: CO, op: 'criar', campos: { nome: 'Íbex', itens: ['IT-1', 'IT-2', 'IT-3'] } })
    const ordemA = ev({ ap: A, seq: 2, ms: T0 + HORA, tipo: 'colecao', reg: CO, campos: { itens: ['IT-3', 'IT-1', 'IT-2'] } })
    const ordemB = ev({ ap: B, seq: 1, ms: T0 + HORA + 1, tipo: 'colecao', reg: CO, campos: { itens: ['IT-2', 'IT-3'] } })
    const noA = fundir([criar, ordemA, ordemB])
    const noB = fundir([ordemB, criar, ordemA])
    expect(estadoCanonico(noA)).toBe(estadoCanonico(noB))
    expect(noA.registros.get('colecao')!.get(CO)!.campos.itens).toEqual(['IT-2', 'IT-3'])
    expect(noA.historico(CO, 'itens', 'colecao').map((h) => h.valor)).toEqual([
      ['IT-1', 'IT-2', 'IT-3'],
      ['IT-3', 'IT-1', 'IT-2'],
    ])
  })

  it('historico(reg, campo, tipo) separa tipos com o mesmo reg', () => {
    const p = ev({ seq: 1, ms: T0 + 2, tipo: 'posicao', reg: 'X', campos: { a: 'p1' } })
    const p2 = ev({ seq: 2, ms: T0 + 4, tipo: 'posicao', reg: 'X', campos: { a: 'p2' } })
    const r = ev({ seq: 3, ms: T0 + 1, tipo: 'revisao', reg: 'X', campos: { a: 'r1' } })
    const r2 = ev({ seq: 4, ms: T0 + 3, tipo: 'revisao', reg: 'X', campos: { a: 'r2' } })
    const e = fundir([p, p2, r, r2])
    expect(e.historico('X', 'a', 'posicao').map((h) => h.valor)).toEqual(['p1'])
    expect(e.historico('X', 'a', 'revisao').map((h) => h.valor)).toEqual(['r1'])
    expect(e.historico('X', 'a', 'nota')).toEqual([])
  })
})

describe('fundir: relógio adiantado (Foco 3)', () => {
  it('B está 1 h à frente; A edita depois de receber o evento de B; a edição de A vence', () => {
    // A cria a nota no horário certo.
    const hCriar = novoHlc(null, T0, A)
    const criar = ev({ ap: A, seq: 1, h: hCriar, op: 'criar', campos: { titulo: 'Original' } })
    // B (1 h adiantado) edita 1 min depois, no relógio dele.
    const hB = novoHlc(null, T0 + MINUTO + HORA, B)
    const deB = ev({ ap: B, seq: 1, h: hB, campos: { titulo: 'Edição de B (velha)' } })
    // A recebe o evento de B 2 min depois (no relógio certo) e então edita.
    const hRecebido = receberHlc(hCriar, hB, T0 + 2 * MINUTO)
    const hA = novoHlc(hRecebido, T0 + 3 * MINUTO, A)
    const deA = ev({ ap: A, seq: 2, h: hA, campos: { titulo: 'Edição de A (nova)' } })

    expect(hA > hB).toBe(true)
    for (const ordem of [[criar, deB, deA], [deA, deB, criar]]) {
      const e = fundir(ordem)
      expect(nota(e)!.campos.titulo).toBe('Edição de A (nova)')
      expect(e.historico(NOTA, 'titulo', 'nota').map((h) => h.valor)).toEqual(['Original', 'Edição de B (velha)'])
    }
    // Sem o receberHlc, só pelo relógio, a edição nova de A perderia para a velha de B.
    const ingenuo = ev({ ap: A, seq: 2, h: novoHlc(hCriar, T0 + 3 * MINUTO, A), campos: { titulo: 'nova' } })
    expect(nota(fundir([criar, deB, ingenuo]))!.campos.titulo).toBe('Edição de B (velha)')
  })
})

describe('fundir: exclusão', () => {
  const criar = ev({ seq: 1, ms: T0, op: 'criar', campos: { titulo: 'x' } })
  const excluir = ev({ seq: 2, ms: T0 + 1000, op: 'excluir' })
  const restaurar = ev({ seq: 3, ms: T0 + 2000, op: 'restaurar' })

  it('excluir marca o registro (reversível) sem perder nada', () => {
    const e = fundir([criar, excluir])
    expect(nota(e)).toMatchObject({ excluido: true, campos: { titulo: 'x' }, alteradoEm: excluir.hlc })
    expect(e.excluidos.map((r) => r.id)).toEqual([NOTA])
  })

  it('excluir e depois restaurar volta o registro', () => {
    for (const ordem of [[criar, excluir, restaurar], [restaurar, criar, excluir]]) {
      const e = fundir(ordem)
      expect(nota(e)).toMatchObject({ excluido: false, campos: { titulo: 'x' } })
      expect(e.excluidos).toEqual([])
    }
  })

  it('restaurar e depois excluir (hlc maior) deixa excluído', () => {
    const excluirDeNovo = ev({ seq: 4, ms: T0 + 3000, op: 'excluir' })
    expect(nota(fundir([excluirDeNovo, restaurar, criar, excluir]))!.excluido).toBe(true)
  })

  it('uma edição feita depois de excluir não desfaz a exclusão (e não se perde)', () => {
    const editar = ev({ ap: B, seq: 1, ms: T0 + 1500, campos: { titulo: 'editado' } })
    const e = fundir([editar, excluir, criar])
    expect(nota(e)).toMatchObject({ excluido: true, campos: { titulo: 'editado' } })
    const restaurado = fundir([editar, excluir, criar, restaurar])
    expect(nota(restaurado)).toMatchObject({ excluido: false, campos: { titulo: 'editado' } })
    expect(restaurado.historico(NOTA, 'titulo', 'nota').map((h) => h.valor)).toEqual(['x'])
  })

  it('excluídos lista os registros marcados de todos os tipos, em ordem (tipo, id)', () => {
    const outros = [
      ev({ seq: 10, tipo: 'colecao', reg: 'CO-aaaaaaaa-2', op: 'excluir' }),
      ev({ seq: 11, tipo: 'colecao', reg: 'CO-aaaaaaaa-1', op: 'excluir' }),
    ]
    expect(fundir([criar, excluir, ...outros]).excluidos.map((r) => `${r.tipo}/${r.id}`)).toEqual(['colecao/CO-aaaaaaaa-1', 'colecao/CO-aaaaaaaa-2', `nota/${NOTA}`])
  })
})

describe('fundir: eventos malformados', () => {
  it('um evento com v desconhecido ou malformado é ignorado e contado, sem quebrar', () => {
    const bom = ev({ seq: 1, op: 'criar', campos: { titulo: 'ok' } })
    const ruins: unknown[] = [
      { ...ev({ seq: 2, campos: { titulo: 'v2' } }), v: 2 },
      { ...ev({ seq: 3 }), hlc: 'lixo' },
      { ...ev({ seq: 4 }), tipo: 'livro' },
      { ...ev({ seq: 5 }), campos: { x: Number.NaN } },
      null,
      'texto',
      42,
      [bom],
    ]
    const e = fundir([...ruins, bom])
    expect(nota(e)!.campos).toEqual({ titulo: 'ok' })
    expect(e.ignorados.total).toBe(8)
    expect(e.ignorados.motivos).toEqual({ versao: 1, hlc: 1, tipo: 1, campos: 1, objeto: 4 })
  })

  it('o mesmo id com conteúdo diferente (corrompido): a escolha é determinística e contada', () => {
    const e1 = ev({ seq: 1, ms: T0, campos: { titulo: 'um' } })
    const e2 = { ...e1, campos: { titulo: 'dois', outro: 1 } }
    expect(estadoCanonico(fundir([e1, e2]))).toBe(estadoCanonico(fundir([e2, e1])))
    expect(estadoCanonico(fundir([e1, e2, e1]))).toBe(estadoCanonico(fundir([e2, e2, e1])))
    // Vence UMA cópia inteira (não a união dos campos): mesmo hlc, maior JSON canônico.
    expect(nota(fundir([e2, e1]))!.campos).toEqual({ titulo: 'um' })
    expect(fundir([e1, e2, e1]).conflitos).toBe(1)
    expect(fundir([e1, e1]).conflitos).toBe(0)
  })

  it('cópias com chaves extras (Infinity, inteiro enorme) não quebram a fusão e não são conflito', () => {
    const e1 = ev({ seq: 1, ms: T0, campos: { titulo: 'um' } })
    const inf = JSON.parse(`{${JSON.stringify(e1).slice(1, -1)},"extra":1e400}`)
    const enorme = JSON.parse(`{${JSON.stringify(e1).slice(1, -1)},"extra":123456789012345678901234567890}`)
    const outra = JSON.parse(`{${JSON.stringify({ ...e1, campos: { titulo: 'dois' } }).slice(1, -1)},"extra":1e400}`)
    const e = fundir([inf, enorme, e1])
    expect(e.conflitos).toBe(0)
    expect(nota(e)!.campos).toEqual({ titulo: 'um' })
    expect(estadoCanonico(fundir([outra, inf]))).toBe(estadoCanonico(fundir([enorme, outra])))
    expect(fundir([outra, inf]).conflitos).toBe(1)
  })

  it('cópia corrompida com hlc ou op diferente: vence a de maior hlc, em qualquer ordem', () => {
    const original = ev({ seq: 1, ms: T0, op: 'alterar', campos: { titulo: 'original' } })
    const corrompida = { ...original, hlc: hlc(T0 + 5, 0, A), op: 'excluir' as const, campos: {} }
    for (const ordem of [[original, corrompida], [corrompida, original, corrompida]]) {
      const e = fundir(ordem)
      expect(nota(e)).toMatchObject({ excluido: true, campos: {}, criadoEm: corrompida.hlc })
      expect(e.conflitos).toBe(1)
    }
  })

  it('números além de 2^53 − 1 tornam o evento inválido (motivo numero)', () => {
    const e = fundir([
      ev({ seq: 1, campos: { n: 9007199254740991, m: -9007199254740991 } }),
      ev({ seq: 2, campos: { n: 9007199254740992 } }),
      ev({ seq: 3, campos: { lista: [1, { fundo: -1e300 }] } }),
    ])
    expect(nota(e)!.campos).toEqual({ n: 9007199254740991, m: -9007199254740991 })
    expect(e.ignorados).toEqual({ total: 2, motivos: { numero: 2 } })
  })

  it('hlc além de 2250-01-01 (LIMITE_MS) é inválido (motivo hlc) e não entra no estado', () => {
    const futuro = ev({ seq: 2, h: '9999999999999-9999-aaaaaaaa', campos: { titulo: 'do futuro' } })
    const limite = ev({ seq: 3, h: hlc(LIMITE_MS, 0, A), campos: { titulo: 'no limite' } })
    const e = fundir([ev({ seq: 1, campos: { titulo: 'agora' } }), futuro, limite, { ...futuro, id: `${A}-4-0`, hlc: hlc(LIMITE_MS + 1, 0, A) }])
    expect(nota(e)!.campos.titulo).toBe('no limite')
    expect(e.ignorados).toEqual({ total: 2, motivos: { hlc: 2 } })
  })
})

describe('base consolidada (estado.json)', () => {
  it('a fusão sobre a base mais eventos novos é igual à fusão de tudo', () => {
    const eventos = eventosAleatorios(21, 150)
    const tudo = semIgnorados(fundir(eventos))
    for (const corte of [0, 1, 40, 75, 149, 150]) {
      const base = consolidar(fundir(eventos.slice(0, corte)))
      expect(semIgnorados(fundir(eventos.slice(corte), base))).toBe(tudo)
    }
  })

  it('também quando os eventos novos repetem os da base, em qualquer ordem', () => {
    const eventos = eventosAleatorios(22, 100)
    const tudo = semIgnorados(fundir(eventos))
    const base = consolidar(fundir(eventos.slice(0, 60)))
    const aleatorio = gerador(5)
    for (let i = 0; i < 20; i++) expect(semIgnorados(fundir(embaralhar(eventos.slice(30), aleatorio), base))).toBe(tudo)
  })

  it('a base sobrevive a JSON (estado.json) e é validada', () => {
    const eventos = eventosAleatorios(23, 80)
    const base = JSON.parse(JSON.stringify(consolidar(fundir(eventos.slice(0, 50)))))
    expect(validarBase(base)).toEqual({ base, ignorados: 0 })
    expect(validarBase(base)!.base).toBe(base)
    expect(semIgnorados(fundir(eventos.slice(50), validarBase(base)!.base))).toBe(semIgnorados(fundir(eventos)))
  })

  it('consolidar(fundir(eventos, base)) pode virar base de novo (cadeia de consolidações)', () => {
    const eventos = eventosAleatorios(24, 120)
    const b1 = consolidar(fundir(eventos.slice(0, 40)))
    const b2 = consolidar(fundir(eventos.slice(40, 80), b1))
    expect(semIgnorados(fundir(eventos.slice(80), b2))).toBe(semIgnorados(fundir(eventos)))
  })

  it('várias bases: a união delas (uma base nova não apaga o que só a antiga tinha)', () => {
    const eventos = eventosAleatorios(25, 90)
    const b1 = consolidar(fundir(eventos.slice(0, 50)))
    const b2 = consolidar(fundir(eventos.slice(30, 70)))
    expect(semIgnorados(fundir(eventos.slice(60), [b2, b1]))).toBe(semIgnorados(fundir(eventos)))
    expect(semIgnorados(fundir([], [b1, b2]))).toBe(semIgnorados(fundir(eventos.slice(0, 70))))
  })

  it('base fora de ordem é normalizada', () => {
    const v1 = ev({ ap: A, seq: 1, ms: T0, campos: { titulo: 'um' } })
    const v2 = ev({ ap: B, seq: 1, ms: T0 + 1, campos: { titulo: 'dois' } })
    const base = consolidar(fundir([v1, v2]))
    base.registros[0]!.campos.titulo!.reverse()
    expect(estadoCanonico(fundir([], base))).toBe(estadoCanonico(fundir([v1, v2])))
  })

  it.each<[string, unknown]>([
    ['nulo', null],
    ['v 2', { v: 2, registros: [] }],
    ['registros não lista', { v: 1, registros: {} }],
  ])('validarBase recusa a forma de fora: %s', (_n, base) => {
    expect(validarBase(base)).toBeNull()
  })

  const bom = { tipo: 'nota', id: 'NT-bom', criadoEm: hlc(T0, 0, A), alteradoEm: hlc(T0, 0, A), exclusao: null, campos: { t: [{ evento: `${A}-1-0`, hlc: hlc(T0, 0, A), valor: 1 }] } }
  it.each<[string, unknown]>([
    ['tipo inválido', { v: 1, registros: [{ tipo: 'livro', id: 'x', criadoEm: hlc(T0, 0, A), alteradoEm: hlc(T0, 0, A), exclusao: null, campos: {} }] }],
    ['hlc inválido', { v: 1, registros: [{ tipo: 'nota', id: 'x', criadoEm: 'lixo', alteradoEm: hlc(T0, 0, A), exclusao: null, campos: {} }] }],
    ['entrada sem evento', { v: 1, registros: [{ tipo: 'nota', id: 'x', criadoEm: hlc(T0, 0, A), alteradoEm: hlc(T0, 0, A), exclusao: null, campos: { t: [{ hlc: hlc(T0, 0, A), valor: 1 }] } }] }],
    ['campo vazio', { v: 1, registros: [{ tipo: 'nota', id: 'x', criadoEm: hlc(T0, 0, A), alteradoEm: hlc(T0, 0, A), exclusao: null, campos: { t: [] } }] }],
    ['exclusão com op errada', { v: 1, registros: [{ tipo: 'nota', id: 'x', criadoEm: hlc(T0, 0, A), alteradoEm: hlc(T0, 0, A), exclusao: { hlc: hlc(T0, 0, A), evento: `${A}-1-0`, op: 'alterar' }, campos: {} }] }],
    ['hlc além do teto', { v: 1, registros: [{ tipo: 'nota', id: 'x', criadoEm: hlc(T0, 0, A), alteradoEm: '9999999999999-9999-aaaaaaaa', exclusao: null, campos: {} }] }],
    ['número além de 2^53', { v: 1, registros: [{ tipo: 'nota', id: 'x', criadoEm: hlc(T0, 0, A), alteradoEm: hlc(T0, 0, A), exclusao: null, campos: { t: [{ evento: `${A}-1-0`, hlc: hlc(T0, 0, A), valor: 2 ** 60 }] } }] }],
  ])('validarBase deixa de fora (e conta) o registro inválido, e mantém os bons: %s', (_n, ruim) => {
    const r = validarBase({ v: 1, registros: [bom, ...(ruim as { registros: unknown[] }).registros, bom] })
    expect(r).toEqual({ base: { v: 1, registros: [bom, bom] }, ignorados: 1 })
    expect(fundir([], r!.base).registro('nota', 'NT-bom')!.campos).toEqual({ t: 1 })
  })
})

describe('aplicar (incremental)', () => {
  it('aplicar(fundir(começo), resto) = fundir(tudo), e o estado antigo não muda', () => {
    const eventos = eventosAleatorios(31, 120)
    const tudo = estadoCanonico(fundir(eventos))
    for (const corte of [0, 1, 60, 119]) {
      const antes = fundir(eventos.slice(0, corte))
      const canonAntes = estadoCanonico(antes)
      let e = antes
      for (const evento of eventos.slice(corte)) e = aplicar(e, [evento])
      expect(estadoCanonico(e)).toBe(tudo)
      expect(estadoCanonico(aplicar(antes, eventos.slice(corte)))).toBe(tudo)
      expect(estadoCanonico(antes)).toBe(canonAntes)
    }
  })

  it('aplicar eventos já vistos não muda o estado; registros intocados mantêm a identidade', () => {
    const eventos = eventosAleatorios(32, 60)
    const e = fundir(eventos)
    const de = aplicar(e, eventos.slice(0, 10))
    expect(estadoCanonico(de)).toBe(estadoCanonico(e))
    const novo = ev({ ap: C, seq: 999, ms: T0 + 10 * HORA, tipo: 'nota', reg: 'NT-cccccccc-9', op: 'criar', campos: { t: 1 } })
    const depois = aplicar(e, [novo])
    expect(depois.registros.get('colecao')).toBe(e.registros.get('colecao'))
    expect(depois.registros.get('nota')!.get('NT-aaaaaaaa-1')).toBe(e.registros.get('nota')!.get('NT-aaaaaaaa-1'))
    expect(depois.registros.get('nota')!.get('NT-cccccccc-9')!.campos).toEqual({ t: 1 })
    expect(e.registros.get('nota')!.has('NT-cccccccc-9')).toBe(false)
  })

  it('soma os ignorados', () => {
    const e = aplicar(fundir([null]), [{ v: 9 }, ev({ seq: 1 })])
    expect(e.ignorados).toEqual({ total: 2, motivos: { objeto: 1, versao: 1 } })
  })
})

describe('estadoCanonico', () => {
  it('formato exato: chaves ordenadas, registros por (tipo, id), entradas por (hlc, evento)', () => {
    const e1 = ev({ ap: A, seq: 1, ms: T0, op: 'criar', campos: { titulo: 'a', meta: { z: 1, a: 2 } } })
    const e2 = ev({ ap: B, seq: 1, ms: T0 + 1, tipo: 'colecao', reg: 'CO-bbbbbbbb-1', op: 'excluir' })
    const e3 = ev({ ap: B, seq: 2, ms: T0 + 2, campos: { titulo: null } })
    expect(estadoCanonico(fundir([e3, e2, e1, null]))).toBe(
      '{"ignorados":1,"registros":[' +
        `{"alteradoEm":"${e2.hlc}","campos":{},"criadoEm":"${e2.hlc}","exclusao":{"evento":"${e2.id}","hlc":"${e2.hlc}","op":"excluir"},"id":"CO-bbbbbbbb-1","tipo":"colecao"},` +
        `{"alteradoEm":"${e3.hlc}","campos":{"meta":[{"evento":"${e1.id}","hlc":"${e1.hlc}","valor":{"a":2,"z":1}}],"titulo":[{"evento":"${e1.id}","hlc":"${e1.hlc}","valor":"a"},{"evento":"${e3.id}","hlc":"${e3.hlc}","valor":null}]},"criadoEm":"${e1.hlc}","exclusao":null,"id":"${NOTA}","tipo":"nota"}` +
        '],"v":1}',
    )
  })
})

describe('desempenho', () => {
  it('funde 50 mil eventos em menos de 1 s', () => {
    const aleatorio = gerador(99)
    const eventos: Evento[] = []
    const aparelhos = [A, B, C]
    const seqs = [0, 0, 0]
    for (let i = 0; i < 50_000; i++) {
      const k = Math.floor(aleatorio() * 3)
      const reg = `NT-${aparelhos[k]}-${Math.floor(aleatorio() * 5000)}`
      const campos: Record<string, unknown> = {}
      campos[['titulo', 'texto', 'itens'][Math.floor(aleatorio() * 3)]!] = aleatorio() < 0.5 ? 'texto '.repeat(10) : ['IT-1', 'IT-2']
      eventos.push(ev({ ap: aparelhos[k], seq: ++seqs[k]!, ms: T0 + Math.floor(aleatorio() * 1e9), c: 0, reg, op: aleatorio() < 0.02 ? 'excluir' : 'alterar', campos: campos as never }))
    }
    const inicio = performance.now()
    const e = fundir(eventos)
    const ms = performance.now() - inicio
    expect(e.registros.get('nota')!.size).toBeGreaterThan(10_000)
    expect(ms).toBeLessThan(1000)
    const inicioAplicar = performance.now()
    aplicar(e, [ev({ ap: A, seq: 999_999, ms: T0 + 2e9, reg: 'NT-aaaaaaaa-1', campos: { titulo: 'x' } })])
    expect(performance.now() - inicioAplicar).toBeLessThan(100)
  })
})

describe('entradasDoCampo', () => {
  it('todas as escritas do campo em ordem (a última é a atual), como cópia; [] para o que não existe', () => {
    const e = fundir([ev({ seq: 2, campos: { texto: 'b' } }), ev({ seq: 1, campos: { texto: 'a' } })])
    const lista = entradasDoCampo(e, 'nota', 'NT-aaaaaaaa-1', 'texto')
    expect(lista.map((x) => x.valor)).toEqual(['a', 'b'])
    expect(lista.map((x) => x.evento)).toEqual(['aaaaaaaa-1-0', 'aaaaaaaa-2-0'])
    lista.pop()
    expect(entradasDoCampo(e, 'nota', 'NT-aaaaaaaa-1', 'texto')).toHaveLength(2)
    expect(entradasDoCampo(e, 'nota', 'NT-aaaaaaaa-1', 'outro')).toEqual([])
    expect(entradasDoCampo(e, 'colecao', 'NT-aaaaaaaa-1', 'texto')).toEqual([])
  })
})
