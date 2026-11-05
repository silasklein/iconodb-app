import { A, B, hlc, HORA, MINUTO, T0 } from '../../tests/suporte/eventosDeTeste'
import { compararHlc, HLC_ZERO, LIMITE_MS, lerHlc, novoHlc, receberHlc, TETO_MS, validoHlc } from './hlc'

describe('formato do hlc', () => {
  it('"<ms 13 dígitos>-<contador 4 dígitos>-<aparelho>"', () => {
    const h = novoHlc(null, T0, A)
    expect(h).toBe(`${T0}-0000-${A}`)
    expect(h).toMatch(/^\d{13}-\d{4}-[a-z0-9]{8}$/)
    expect(lerHlc(h)).toEqual({ ms: T0, contador: 0, aparelho: A })
  })

  it('valida o formato', () => {
    expect(validoHlc(hlc(T0, 3, A))).toBe(true)
    for (const ruim of ['', 'x', `${T0}-0-${A}`, `${T0}-0000-AAAAAAAA`, `${T0}-0000-aaaa`, `0${T0}-0000-${A}`, `${T0}-0000-${A} `, 12]) {
      expect(validoHlc(ruim)).toBe(false)
    }
    expect(lerHlc('lixo')).toBeNull()
  })

  it('HLC_ZERO de um aparelho é menor que qualquer hlc dele', () => {
    expect(HLC_ZERO(A)).toBe(`0000000000000-0000-${A}`)
    expect(HLC_ZERO(A) < novoHlc(null, 0, A)).toBe(false) // ms 0, contador 0: igual
    expect(HLC_ZERO(A) < novoHlc(HLC_ZERO(A), 0, A)).toBe(true)
  })

  it('a comparação lexicográfica é a ordem (ms, contador, aparelho)', () => {
    const ordem = [hlc(999, 9999, B), hlc(1000, 0, B), hlc(1000, 1, A), hlc(1000, 1, B), hlc(T0, 0, A), hlc(T0 + 1, 0, A)]
    const embaralhada = [...ordem].reverse()
    expect(embaralhada.sort()).toEqual(ordem)
    expect(embaralhada.sort(compararHlc)).toEqual(ordem)
  })
})

describe('novoHlc', () => {
  it('usa o relógio quando ele avançou; senão incrementa o contador', () => {
    const h1 = novoHlc(null, T0, A)
    const h2 = novoHlc(h1, T0 + 5, A)
    expect(h2).toBe(hlc(T0 + 5, 0, A))
    const h3 = novoHlc(h2, T0 + 5, A)
    expect(h3).toBe(hlc(T0 + 5, 1, A))
  })

  it('nunca volta para trás, mesmo com o relógio do aparelho recuando', () => {
    let h = novoHlc(null, T0, A)
    const vistos = [h]
    for (const agora of [T0 - HORA, T0 - 1, T0, T0 + 1, T0 - 10 * HORA, T0 + 1]) {
      const n = novoHlc(h, agora, A)
      expect(n > h).toBe(true)
      h = n
      vistos.push(h)
    }
    expect(new Set(vistos).size).toBe(vistos.length)
  })

  it('contador estourado (9999) passa para o milissegundo seguinte e continua crescendo', () => {
    const h = novoHlc(hlc(T0, 9999, A), T0, A)
    expect(h).toBe(hlc(T0 + 1, 0, A))
    expect(h > hlc(T0, 9999, A)).toBe(true)
  })

  it('arredonda o relógio para baixo (Date.now é inteiro, performance.now não)', () => {
    expect(novoHlc(null, T0 + 0.9, A)).toBe(hlc(T0, 0, A))
  })

  it('um hlc anterior malformado é erro de programação', () => {
    expect(() => novoHlc('lixo', T0, A)).toThrow()
    expect(() => novoHlc(null, T0, 'ABC')).toThrow()
  })
})

describe('receberHlc (relógio adiantado, Foco 3)', () => {
  it('avança além do remoto adiantado 1 h; a edição seguinte vence a remota', () => {
    const remoto = hlc(T0 + HORA, 0, B) // B está 1 h à frente
    const local = hlc(T0, 3, A)
    const depois = receberHlc(local, remoto, T0 + MINUTO)
    expect(depois > remoto).toBe(true)
    expect(lerHlc(depois)!.aparelho).toBe(A)
    const edicao = novoHlc(depois, T0 + 2 * MINUTO, A)
    expect(edicao > remoto).toBe(true)
  })

  it('remoto atrasado: só o relógio local conta', () => {
    expect(receberHlc(hlc(T0, 2, A), hlc(T0 - HORA, 7, B), T0 + 10)).toBe(hlc(T0 + 10, 0, A))
    expect(receberHlc(hlc(T0, 2, A), hlc(T0 - HORA, 7, B), T0)).toBe(hlc(T0, 3, A))
  })

  it('mesmo milissegundo nos três: o maior contador + 1', () => {
    expect(receberHlc(hlc(T0, 2, A), hlc(T0, 5, B), T0)).toBe(hlc(T0, 6, A))
    expect(receberHlc(hlc(T0, 8, A), hlc(T0, 5, B), T0)).toBe(hlc(T0, 9, A))
  })

  it('remoto à frente do relógio e do local: contador do remoto + 1', () => {
    expect(receberHlc(hlc(T0, 8, A), hlc(T0 + 5, 2, B), T0)).toBe(hlc(T0 + 5, 3, A))
  })

  it('nunca volta para trás e é sempre maior que os dois', () => {
    const casos: Array<[string, string, number]> = [
      [hlc(T0, 0, A), hlc(T0, 9999, B), T0],
      [hlc(T0 + HORA, 0, A), hlc(T0, 0, B), T0],
      [HLC_ZERO(A), hlc(T0, 0, B), 0],
    ]
    for (const [l, r, agora] of casos) {
      const h = receberHlc(l, r, agora)
      expect(h > l && h > r).toBe(true)
    }
  })

  it('formatos malformados são erro', () => {
    expect(() => receberHlc('lixo', hlc(T0, 0, B), T0)).toThrow()
    expect(() => receberHlc(hlc(T0, 0, A), 'lixo', T0)).toThrow()
  })
})

describe('limites do relógio (TETO 2200, LIMITE 2250)', () => {
  it('TETO_MS = 2200-01-01 e LIMITE_MS = 2250-01-01; acima do LIMITE o hlc é inválido', () => {
    expect(TETO_MS).toBe(Date.UTC(2200, 0, 1))
    expect(LIMITE_MS).toBe(Date.UTC(2250, 0, 1))
    expect(validoHlc(hlc(TETO_MS + 1, 0, A))).toBe(true)
    expect(validoHlc(hlc(LIMITE_MS, 9999, A))).toBe(true)
    expect(validoHlc(hlc(LIMITE_MS + 1, 0, A))).toBe(false)
    expect(validoHlc(`9999999999999-9999-${A}`)).toBe(false)
  })

  it('receberHlc ignora um remoto além do teto (não lança, não fixa o relógio)', () => {
    const local = hlc(T0, 3, A)
    for (const remoto of [`9999999999999-9999-${B}`, `9999999999999-0000-${B}`, hlc(TETO_MS + 1, 0, B), hlc(LIMITE_MS, 0, B)]) {
      expect(receberHlc(local, remoto, T0 + 10)).toBe(hlc(T0 + 10, 0, A))
      expect(receberHlc(local, remoto, T0)).toBe(hlc(T0, 4, A))
    }
  })

  it('preso no teto, 30 mil escritas seguem válidas (o estouro do contador fica muito abaixo do limite)', () => {
    let h = receberHlc(hlc(T0, 0, A), hlc(TETO_MS, 9998, B), T0)
    for (let i = 0; i < 30_000; i++) {
      h = novoHlc(h, T0, A)
      if (!validoHlc(h)) throw new Error(`inválido: ${h}`)
    }
    expect(lerHlc(h)!.ms).toBe(TETO_MS + 3)
  })

  it('um relógio de aparelho além do teto é limitado ao teto', () => {
    expect(novoHlc(null, 9_999_999_999_999, A)).toBe(hlc(TETO_MS, 0, A))
  })
})
