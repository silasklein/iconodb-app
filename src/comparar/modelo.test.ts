import { A, B, embaralhar, ev, gerador, T0 } from '../../tests/suporte/eventosDeTeste'
import { campoDaOrdem, campoDaPresenca } from '../colecoes/modelo'
import type { Campos, Evento } from '../usuario/eventos'
import { estadoCanonico, fundir } from '../usuario/fusao'
import { contadorDaBandeja, lerBandeja, MAXIMO_DA_BANDEJA, planejarDesfazerSubstituicao, planejarEntrada, planejarSubstituicao, planejarVarias, REG_DA_BANDEJA } from './modelo'

const bandejaDe = (eventos: Evento[]) => lerBandeja(fundir(eventos).registro('comparar', REG_DA_BANDEJA))
/** Os campos de objetos presentes, como um evento os escreveria. */
const cam = (...pares: [string, number][]): Campos => Object.fromEntries(pares.flatMap(([ref, ordem]) => [[campoDaPresenca(ref), true], [campoDaOrdem(ref), ordem]]))
const escreve = (ap: string, seq: number, campos: Campos, ms = T0 + seq * 1000): Evento => ev({ ap, seq, ms, tipo: 'comparar', reg: REG_DA_BANDEJA, op: seq === 1 ? 'criar' : 'alterar', campos })

describe('a bandeja de comparação (um registro `comparar`, reg "bandeja")', () => {
  it('sem registro, a bandeja está vazia', () => {
    expect(lerBandeja(undefined)).toMatchObject({ itens: [], excedentes: [], todos: [] })
  })

  it('o formato dos campos é o das coleções: `m:<ref>` a presença e `i:<ref>` a ordem', () => {
    const b = bandejaDe([escreve(A, 1, cam(['CA00007', 2048], ['OB-aaaaaaaa-1', 1024]))])
    expect(b.itens).toEqual(['OB-aaaaaaaa-1', 'CA00007'])
    expect(b.todos).toEqual([
      { ref: 'OB-aaaaaaaa-1', ordem: 1024 },
      { ref: 'CA00007', ordem: 2048 },
    ])
  })

  it('só os 4 primeiros pela ordem ficam na bandeja; os outros são os excedentes, na mesma ordem (nada some)', () => {
    const b = bandejaDe([escreve(A, 1, cam(['CA00001', 1024], ['CA00002', 2048], ['CA00003', 3072], ['CA00004', 4096], ['CA00005', 5120], ['CA00006', 6144]))])
    expect(b.itens).toEqual(['CA00001', 'CA00002', 'CA00003', 'CA00004'])
    expect(b.excedentes).toEqual(['CA00005', 'CA00006'])
    expect(MAXIMO_DA_BANDEJA).toBe(4)
  })

  it('tirar (m: null) tira o objeto; o primeiro excedente entra no lugar dele', () => {
    const b = bandejaDe([
      escreve(A, 1, cam(['CA00001', 1024], ['CA00002', 2048], ['CA00003', 3072], ['CA00004', 4096], ['CA00005', 5120])),
      escreve(A, 2, { [campoDaPresenca('CA00002')]: null }),
    ])
    expect(b.itens).toEqual(['CA00001', 'CA00003', 'CA00004', 'CA00005'])
    expect(b.excedentes).toEqual([])
  })

  it('campo malformado é ignorado: ref que não é objeto, ordem que não é inteiro, presença que não é true', () => {
    const b = bandejaDe([
      escreve(A, 1, {
        'm:ZZ00001': true,
        'i:ZZ00001': 1024,
        'm:CA00002': true,
        'i:CA00002': 'x',
        'm:CA00003': 'true',
        'i:CA00003': 1024,
        ...cam(['CA00004', 1024]),
      }),
    ])
    expect(b.itens).toEqual(['CA00004'])
  })

  it('o número que um objeto SKC teve não importa: a ref é o id OB-…', () => {
    const b = bandejaDe([escreve(A, 1, cam(['OB-aaaaaaaa-7', 1024]))])
    expect(b.itens).toEqual(['OB-aaaaaaaa-7'])
  })
})

describe('planejarEntrada', () => {
  const vazia = lerBandeja(undefined)
  const com = (...refs: string[]) => bandejaDe([escreve(A, 1, cam(...refs.map((r, i): [string, number] => [r, 1024 * (i + 1)])))])

  it('acrescenta ao fim: presença e ordem num só evento', () => {
    const e = planejarEntrada(com('CA00001'), 'ca00002')
    expect(e).toEqual({ tipo: 'entrou', ref: 'CA00002', campos: { 'm:CA00002': true, 'i:CA00002': 2048 } })
  })

  it('o mesmo objeto duas vezes não grava nada ("já está")', () => {
    expect(planejarEntrada(com('CA00001'), 'CA00001')).toEqual({ tipo: 'ja-estava', ref: 'CA00001', onde: 'bandeja' })
  })

  it('um objeto que está entre os excedentes também já está (não entra duas vezes)', () => {
    const cinco = com('CA00001', 'CA00002', 'CA00003', 'CA00004', 'CA00005')
    expect(planejarEntrada(cinco, 'CA00005')).toEqual({ tipo: 'ja-estava', ref: 'CA00005', onde: 'espera' })
  })

  it('com 4 na bandeja, está cheia e não grava nada', () => {
    expect(planejarEntrada(com('CA00001', 'CA00002', 'CA00003', 'CA00004'), 'CA00009')).toEqual({ tipo: 'cheia', ref: 'CA00009' })
  })

  it('o que não é objeto é recusado', () => {
    expect(() => planejarEntrada(vazia, 'GL-900001')).toThrow(/objeto/)
  })
})

describe('planejarVarias (Comparar todos)', () => {
  const com = (...refs: string[]) => bandejaDe([escreve(A, 1, cam(...refs.map((r, i): [string, number] => [r, 1024 * (i + 1)])))])

  it('põe os que cabem e diz quais ficaram de fora e quais já estavam', () => {
    const p = planejarVarias(com('CA00001', 'CA00002'), ['CA00002', 'CA00010', 'CA00011', 'CA00012', 'CA00010'])
    expect(p.entraram).toEqual(['CA00010', 'CA00011'])
    expect(p.jaEstavam).toEqual(['CA00002'])
    expect(p.deFora).toEqual(['CA00012'])
    expect(Object.keys(p.campos).sort()).toEqual(['i:CA00010', 'i:CA00011', 'm:CA00010', 'm:CA00011'])
    expect(p.campos['i:CA00010']).toBe(3072)
    expect(p.campos['i:CA00011']).toBe(4096)
  })

  it('bandeja vazia e 6 objetos: 4 entram, 2 ficam de fora na ordem citada', () => {
    const p = planejarVarias(lerBandeja(undefined), ['CA00001', 'CA00002', 'CA00003', 'CA00004', 'CA00005', 'CA00006'])
    expect(p.entraram).toEqual(['CA00001', 'CA00002', 'CA00003', 'CA00004'])
    expect(p.deFora).toEqual(['CA00005', 'CA00006'])
  })

  it('bandeja cheia: ninguém entra e nada é gravado', () => {
    const p = planejarVarias(com('CA00001', 'CA00002', 'CA00003', 'CA00004'), ['CA00005'])
    expect(p.entraram).toEqual([])
    expect(p.deFora).toEqual(['CA00005'])
    expect(p.campos).toEqual({})
  })
})

describe('dois aparelhos sem internet (a fusão da bandeja)', () => {
  // Os dois partem da mesma bandeja (CA00001) e cada um acrescenta objetos diferentes.
  const base = escreve(A, 1, cam(['CA00001', 1024]), T0)
  const doA = [escreve(A, 2, cam(['CA00010', 2048]), T0 + 10_000), escreve(A, 3, cam(['CA00011', 3072]), T0 + 20_000)]
  const doB = [escreve(B, 1, cam(['CA00020', 2048]), T0 + 12_000), escreve(B, 2, cam(['OB-bbbbbbbb-1', 3072]), T0 + 22_000)]
  const todos = [base, ...doA, ...doB]

  it('em qualquer ordem e com repetições, convergem ao mesmo estado e à mesma lista de 4', () => {
    const referencia = bandejaDe(todos)
    const canonico = estadoCanonico(fundir(todos))
    const aleatorio = gerador(14)
    for (let i = 0; i < 40; i++) {
      const embaralhados = embaralhar([...todos, ...todos.slice(0, 3)], aleatorio)
      expect(estadoCanonico(fundir(embaralhados))).toBe(canonico)
      const b = bandejaDe(embaralhados)
      expect(b.itens).toEqual(referencia.itens)
      expect(b.excedentes).toEqual(referencia.excedentes)
    }
  })

  it('ordens iguais (cada um acrescentou no fim) se desempatam pela ref, igual nos dois', () => {
    const b = bandejaDe(todos)
    // 1024: CA00001; 2048: CA00010 e CA00020 (empate: pela ref); 3072: CA00011 e OB-bbbbbbbb-1 (idem).
    expect(b.itens).toEqual(['CA00001', 'CA00010', 'CA00020', 'CA00011'])
    expect(b.excedentes).toEqual(['OB-bbbbbbbb-1'])
  })

  it('o que não coube aparece: nenhum acréscimo é descartado em silêncio', () => {
    const b = bandejaDe(todos)
    expect([...b.itens, ...b.excedentes].sort()).toEqual(['CA00001', 'CA00010', 'CA00011', 'CA00020', 'OB-bbbbbbbb-1'])
  })

  it('um aparelho tira um objeto e o outro o acrescenta de novo mais tarde: vale a escrita mais nova', () => {
    const tira = escreve(A, 4, { [campoDaPresenca('CA00001')]: null }, T0 + 30_000)
    const poeDeVolta = escreve(B, 3, cam(['CA00001', 5120]), T0 + 40_000)
    expect(bandejaDe([...todos, tira, poeDeVolta]).todos.map((m) => m.ref)).toContain('CA00001')
    expect(bandejaDe([...todos, poeDeVolta, tira]).todos.map((m) => m.ref)).toContain('CA00001')
    expect(bandejaDe([...todos, tira]).todos.map((m) => m.ref)).not.toContain('CA00001')
  })

  it('esvaziar num aparelho e acrescentar no outro: o acréscimo mais novo sobrevive', () => {
    const esvazia = escreve(A, 4, Object.fromEntries(['CA00001', 'CA00010', 'CA00011'].map((r) => [campoDaPresenca(r), null])), T0 + 30_000)
    const acrescenta = escreve(B, 3, cam(['CA00030', 4096]), T0 + 31_000)
    for (const ordem of [[...todos, esvazia, acrescenta], [acrescenta, esvazia, ...todos]]) {
      expect(bandejaDe(ordem).todos.map((m) => m.ref).sort()).toEqual(['CA00020', 'CA00030', 'OB-bbbbbbbb-1'])
    }
  })
})

describe('substituir a bandeja (decisão 44: «Comparar todos»)', () => {
  const quatro = escreve(A, 1, cam(['CA00001', 1024], ['CA00002', 2048], ['CA00003', 3072], ['CA00004', 4096]), T0)

  it('um só conjunto de campos: tira todos os que estavam e põe os citados, na ordem da citação, depois de qualquer ordem que já houve', () => {
    const b = bandejaDe([quatro])
    const p = planejarSubstituicao(b, ['BA00001', 'BA00002', 'CA00002'])
    expect(p.entraram).toEqual(['BA00001', 'BA00002', 'CA00002'])
    expect(p.deFora).toEqual([])
    expect(p.previa).toEqual(b.todos)
    expect(p.campos).toMatchObject({ 'm:CA00001': null, 'm:CA00003': null, 'm:CA00004': null, 'm:BA00001': true, 'm:BA00002': true, 'm:CA00002': true })
    const ordens = ['BA00001', 'BA00002', 'CA00002'].map((r) => p.campos[`i:${r}`] as number)
    expect(ordens[0]).toBeGreaterThan(4096)
    expect(ordens[1]).toBeGreaterThan(ordens[0]!)
    expect(ordens[2]).toBeGreaterThan(ordens[1]!)
    const depois = bandejaDe([quatro, escreve(A, 2, p.campos)])
    expect(depois.itens).toEqual(['BA00001', 'BA00002', 'CA00002'])
    expect(depois.excedentes).toEqual([])
  })

  it('mais de 4 citados: entram os 4 primeiros pela ordem da citação e os outros vão em `deFora`, em ordem; repetidos contam uma vez', () => {
    const p = planejarSubstituicao(bandejaDe([quatro]), ['CA00010', 'CA00011', 'CA00010', 'ca00012', 'CA00013', 'CA00014', 'OB-aaaaaaaa-1'])
    expect(p.entraram).toEqual(['CA00010', 'CA00011', 'CA00012', 'CA00013'])
    expect(p.deFora).toEqual(['CA00014', 'OB-aaaaaaaa-1'])
    expect(Object.keys(p.campos).filter((c) => c.startsWith('m:') && p.campos[c] === true)).toHaveLength(4)
  })

  it('a bandeja de antes inclui os excedentes; todos saem e todos voltam no desfazer', () => {
    const seis = escreve(A, 1, cam(['CA00001', 1024], ['CA00002', 2048], ['CA00003', 3072], ['CA00004', 4096], ['BA00001', 5120], ['BA00002', 6144]), T0)
    const b = bandejaDe([seis])
    const p = planejarSubstituicao(b, ['CA00020'])
    expect(p.previa.map((m) => m.ref)).toEqual(['CA00001', 'CA00002', 'CA00003', 'CA00004', 'BA00001', 'BA00002'])
    const trocada = bandejaDe([seis, escreve(A, 2, p.campos)])
    expect(trocada.todos.map((m) => m.ref)).toEqual(['CA00020'])
    const desfeita = bandejaDe([seis, escreve(A, 2, p.campos), escreve(A, 3, planejarDesfazerSubstituicao(p.previa, p.entraram))])
    expect(desfeita.itens).toEqual(b.itens)
    expect(desfeita.excedentes).toEqual(b.excedentes)
    expect(desfeita.todos).toEqual(b.todos)
  })

  it('desfazer restaura exatamente (mesmos objetos, mesma ordem), também quando um citado já estava na bandeja com outra ordem', () => {
    const b = bandejaDe([quatro])
    const p = planejarSubstituicao(b, ['CA00004', 'CA00001', 'BA00009'])
    const trocada = bandejaDe([quatro, escreve(A, 2, p.campos)])
    expect(trocada.itens).toEqual(['CA00004', 'CA00001', 'BA00009'])
    const desfeita = bandejaDe([quatro, escreve(A, 2, p.campos), escreve(A, 3, planejarDesfazerSubstituicao(p.previa, p.entraram))])
    expect(desfeita.todos).toEqual(b.todos)
    expect(desfeita.itens).toEqual(['CA00001', 'CA00002', 'CA00003', 'CA00004'])
  })

  it('desfazer uma troca de bandeja vazia deixa a bandeja vazia', () => {
    const p = planejarSubstituicao(bandejaDe([]), ['CA00001', 'CA00002'])
    expect(p.previa).toEqual([])
    const depois = bandejaDe([escreve(A, 1, p.campos), escreve(A, 2, planejarDesfazerSubstituicao(p.previa, p.entraram))])
    expect(depois.todos).toEqual([])
  })

  it('a mesma lista, na mesma ordem, e nada mais na bandeja: `igual`, nada a gravar', () => {
    const p = planejarSubstituicao(bandejaDe([quatro]), ['CA00001', 'CA00002', 'CA00003', 'CA00004'])
    expect(p.igual).toBe(true)
    expect(p.campos).toEqual({})
    // a mesma lista em outra ordem não é igual: a ordem da citação vale
    expect(planejarSubstituicao(bandejaDe([quatro]), ['CA00002', 'CA00001', 'CA00003', 'CA00004']).igual).toBe(false)
  })

  it('refs que não são objetos são recusadas', () => {
    expect(() => planejarSubstituicao(bandejaDe([quatro]), ['xyz'])).toThrow()
  })

  describe('com outro aparelho mexendo ao mesmo tempo (sem internet)', () => {
    const base = escreve(A, 1, cam(['CA00001', 1024], ['CA00002', 2048], ['CA00003', 3072], ['CA00004', 4096]), T0)
    const b = bandejaDe([base])
    const troca = planejarSubstituicao(b, ['BA00001', 'BA00002'])
    const aTroca = escreve(A, 2, troca.campos, T0 + 10_000)
    const aDesfaz = escreve(A, 3, planejarDesfazerSubstituicao(troca.previa, troca.entraram), T0 + 50_000)
    // o outro aparelho, que não viu a troca, acrescenta e tira
    const bAcrescenta = escreve(B, 1, cam(['CA00030', 5120]), T0 + 12_000)
    const bTira = escreve(B, 2, { [campoDaPresenca('CA00002')]: null }, T0 + 14_000)

    it('converge em qualquer ordem e com repetições, e o acréscimo do outro aparelho aparece (nada some em silêncio)', () => {
      const todos = [base, aTroca, bAcrescenta, bTira]
      const referencia = bandejaDe(todos)
      const canonico = estadoCanonico(fundir(todos))
      const aleatorio = gerador(44)
      for (let i = 0; i < 40; i++) {
        const emb = embaralhar([...todos, ...todos.slice(1, 3)], aleatorio)
        expect(estadoCanonico(fundir(emb))).toBe(canonico)
        expect(bandejaDe(emb).itens).toEqual(referencia.itens)
        expect(bandejaDe(emb).excedentes).toEqual(referencia.excedentes)
      }
      expect([...referencia.itens, ...referencia.excedentes].sort()).toEqual(['BA00001', 'BA00002', 'CA00030'])
    })

    it('desfazer depois de a troca ter ido ao outro aparelho também converge, em qualquer ordem', () => {
      const todos = [base, aTroca, aDesfaz, bAcrescenta, bTira]
      const referencia = bandejaDe(todos)
      const aleatorio = gerador(45)
      for (let i = 0; i < 40; i++) {
        const emb = embaralhar([...todos, ...todos.slice(2, 4)], aleatorio)
        expect(bandejaDe(emb).todos).toEqual(referencia.todos)
      }
      // os quatro de antes voltam (o CA00002 que o outro aparelho tirou depois da base e antes do desfazer volta, que é o que desfazer diz: restaurar)
      expect(referencia.todos.map((m) => m.ref)).toEqual(expect.arrayContaining(['CA00001', 'CA00003', 'CA00004', 'CA00030']))
      expect(referencia.todos.map((m) => m.ref)).not.toContain('BA00001')
    })
  })
})

describe('a ordem fica sempre à frente de tudo o que já houve (m1)', () => {
  it('depois de esvaziar, o que entra tem ordem maior que a de qualquer objeto que já saiu, para o desfazer não empatar', () => {
    const antes = escreve(A, 1, cam(['CA00001', 1024], ['CA00002', 2048]), T0)
    const esvazia = escreve(A, 2, { [campoDaPresenca('CA00001')]: null, [campoDaPresenca('CA00002')]: null }, T0 + 1000)
    const b = bandejaDe([antes, esvazia])
    expect(b.todos).toEqual([])
    expect(b.maiorOrdem).toBe(2048)
    const e = planejarEntrada(b, 'CA00009')
    expect(e.tipo === 'entrou' && e.campos['i:CA00009']).toBe(3072)
    const v = planejarVarias(b, ['CA00008', 'CA00009'])
    expect([v.campos['i:CA00008'], v.campos['i:CA00009']]).toEqual([3072, 4096])
  })
})

describe('o contador (uma só fonte: Menu, Item e Comparar)', () => {
  it('"n/4", sem passar de 4', () => {
    expect(contadorDaBandeja(0)).toBe('0/4')
    expect(contadorDaBandeja(2)).toBe('2/4')
    expect(contadorDaBandeja(4)).toBe('4/4')
    expect(contadorDaBandeja(6)).toBe('4/4')
  })
})
