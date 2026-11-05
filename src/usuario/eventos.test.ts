import { A, B, ev, hlc, T0 } from '../../tests/suporte/eventosDeTeste'
import { compararCopias, jsonCanonico, montarEvento, OPS, PREFIXOS, TIPOS, validarEvento } from './eventos'

describe('validarEvento', () => {
  it('aceita um evento bem formado e o devolve', () => {
    const e = ev({ seq: 1, op: 'criar', campos: { titulo: 'Íbex', texto: null, itens: ['a'], meta: { x: 1 } } })
    expect(validarEvento(e)).toEqual({ ok: true, evento: e })
  })

  it('aceita chaves extras de fora do contrato, mas as descarta (não têm sentido na v1)', () => {
    const base = ev({ seq: 1 })
    for (const extra of [1, Infinity, 2 ** 60, { x: undefined }]) {
      const r = validarEvento({ ...base, extra })
      expect(r).toEqual({ ok: true, evento: base })
      expect(r.ok && Object.keys(r.evento).sort()).toEqual(['aparelho', 'campos', 'hlc', 'id', 'op', 'reg', 'tipo', 'v'])
    }
  })

  it('o evento validado é um objeto novo só com as chaves do contrato (JSON.parse com 1e400 vira Infinity)', () => {
    const bruto = JSON.parse(`{${JSON.stringify(ev({ seq: 1 })).slice(1, -1)},"extra":1e400}`)
    expect(bruto.extra).toBe(Infinity)
    const r = validarEvento(bruto)
    expect(r.ok && 'extra' in r.evento).toBe(false)
  })

  it('tem os 13 tipos e as 4 operações do contrato', () => {
    expect(TIPOS).toEqual(['nota', 'colecao', 'hipotese', 'regiao', 'posicao', 'verbete', 'sitio', 'item-sitio', 'revisao', 'objeto', 'imagem', 'ligacao', 'comparar'])
    expect(OPS).toEqual(['criar', 'alterar', 'excluir', 'restaurar'])
    expect(PREFIXOS).toEqual(['NT', 'CO', 'HY', 'RG', 'SI', 'OB', 'IM', 'GL'])
  })

  const base = ev({ seq: 1 }) as unknown as Record<string, unknown>
  const com = (mudanca: Record<string, unknown>) => ({ ...base, ...mudanca })
  const sem = (chave: string) => Object.fromEntries(Object.entries(base).filter(([k]) => k !== chave))

  it.each<[string, unknown, string]>([
    ['nulo', null, 'objeto'],
    ['texto', 'oi', 'objeto'],
    ['número', 1, 'objeto'],
    ['lista', [base], 'objeto'],
    ['v ausente', sem('v'), 'versao'],
    ['v 2', com({ v: 2 }), 'versao'],
    ['v "1"', com({ v: '1' }), 'versao'],
    ['v true', com({ v: true }), 'versao'],
    ['aparelho maiúsculo', com({ aparelho: 'AAAAAAAA' }), 'aparelho'],
    ['aparelho curto', com({ aparelho: 'aaaa' }), 'aparelho'],
    ['id ausente', sem('id'), 'id'],
    ['id de outro aparelho', com({ id: `${B}-1-0` }), 'id'],
    ['id sem n', com({ id: `${A}-1` }), 'id'],
    ['hlc malformado', com({ hlc: '123' }), 'hlc'],
    ['hlc de outro aparelho', com({ hlc: hlc(T0, 0, B) }), 'hlc'],
    ['tipo desconhecido', com({ tipo: 'livro' }), 'tipo'],
    ['reg vazio', com({ reg: '' }), 'reg'],
    ['reg número', com({ reg: 7 }), 'reg'],
    ['op desconhecida', com({ op: 'apagar' }), 'op'],
    ['campos ausente', sem('campos'), 'campos'],
    ['campos nulo', com({ campos: null }), 'campos'],
    ['campos lista', com({ campos: [1] }), 'campos'],
    ['campo NaN', com({ campos: { x: Number.NaN } }), 'campos'],
    ['campo Infinity', com({ campos: { x: [Infinity] } }), 'campos'],
    ['campo undefined', com({ campos: { x: undefined } }), 'campos'],
    ['campo função', com({ campos: { x: { y: () => 1 } } }), 'campos'],
    ['campo Date', com({ campos: { x: new Date(0) } }), 'campos'],
    ['hlc além de 2200', com({ hlc: `9999999999999-9999-${A}` }), 'hlc'],
    ['número 2^53', com({ campos: { x: 9007199254740992 } }), 'numero'],
    ['número −2^53 numa lista', com({ campos: { x: [1, -9007199254740992] } }), 'numero'],
    ['número 1e21 num objeto', com({ campos: { x: { y: 1e21 } } }), 'numero'],
  ])('rejeita %s (motivo %s)', (_nome, entrada, motivo) => {
    expect(validarEvento(entrada)).toEqual({ ok: false, motivo })
  })

  it('não quebra com estruturas cíclicas', () => {
    const ciclo: Record<string, unknown> = {}
    ciclo.eu = ciclo
    expect(validarEvento(com({ campos: { x: ciclo } }))).toEqual({ ok: false, motivo: 'campos' })
  })
})

describe('compararCopias', () => {
  const e = ev({ seq: 1, ms: T0, campos: { t: 'a' } })
  it('maior hlc vence; mesmo hlc, maior JSON canônico; iguais dão 0', () => {
    const depois = { ...e, hlc: hlc(T0 + 1, 0, A), campos: {} }
    expect(compararCopias(depois, e)).toBeGreaterThan(0)
    expect(compararCopias(e, depois)).toBeLessThan(0)
    const outra = { ...e, campos: { t: 'b' } }
    expect(compararCopias(outra, e)).toBeGreaterThan(0)
    expect(compararCopias(e, JSON.parse(JSON.stringify(e)))).toBe(0)
  })

  it('só as chaves do contrato contam: uma chave extra (mesmo Infinity ou > 2^53) não lança nem desempata', () => {
    const comInfinito = { ...e, extra: Infinity } as unknown as typeof e
    const comEnorme = { ...e, extra: 2 ** 60 } as unknown as typeof e
    expect(compararCopias(comInfinito, e)).toBe(0)
    expect(compararCopias(comEnorme, comInfinito)).toBe(0)
    const outra = { ...e, campos: { t: 'b' }, extra: Infinity } as unknown as typeof e
    expect(compararCopias(outra, comEnorme)).toBeGreaterThan(0)
  })
})

describe('montarEvento', () => {
  it('monta o id "<aparelho>-<seq>-<n>" e o hlc dado', () => {
    const e = montarEvento({ aparelho: A, seq: 12, n: 0, hlc: hlc(T0, 0, A), tipo: 'nota', reg: 'NT-aaaaaaaa-1', op: 'criar', campos: { titulo: 'x' } })
    expect(e).toEqual({ v: 1, id: `${A}-12-0`, hlc: hlc(T0, 0, A), aparelho: A, tipo: 'nota', reg: 'NT-aaaaaaaa-1', op: 'criar', campos: { titulo: 'x' } })
  })

  it('recusa montar um evento inválido', () => {
    expect(() => montarEvento({ aparelho: A, seq: 1, n: 0, hlc: hlc(T0, 0, A), tipo: 'nota', reg: '', op: 'criar', campos: {} })).toThrow(/reg/)
  })
})

describe('jsonCanonico', () => {
  it('ordena as chaves recursivamente, sem espaços; listas mantêm a ordem', () => {
    expect(jsonCanonico({ b: 1, a: [3, { d: null, c: true }], 'é': 'x' })).toBe('{"a":[3,{"c":true,"d":null}],"b":1,"é":"x"}')
  })

  it('ordena as chaves por ponto de código (como Python), não por unidade UTF-16', () => {
    // U+FF01 < U+1F600 em ponto de código; em UTF-16 o surrogate \uD83D vem antes de ！.
    expect(jsonCanonico({ '\u{1F600}': 1, '！': 2 })).toBe('{"！":2,"\u{1F600}":1}')
  })

  it('números e textos como JSON.stringify', () => {
    expect(jsonCanonico([1, 1.5, -0, 1e21, 'a"b\\c\n\u0001'])).toBe('[1,1.5,0,1e+21,"a\\"b\\\\c\\n\\u0001"]')
  })

  it('a chave __proto__ é só uma chave', () => {
    const o = JSON.parse('{"__proto__":{"x":1},"a":2}')
    expect(jsonCanonico(o)).toBe('{"__proto__":{"x":1},"a":2}')
  })

  it('textos com caracteres de controle', () => {
    expect(jsonCanonico('\u0000\u001f\u007f\b\f\n\r\t\u2028"\\')).toBe('"\\u0000\\u001f\u007f\\b\\f\\n\\r\\t\u2028\\"\\\\"')
  })

  it('recusa valores fora do JSON', () => {
    expect(() => jsonCanonico({ x: undefined })).toThrow()
    expect(() => jsonCanonico(Number.NaN)).toThrow()
  })
})
