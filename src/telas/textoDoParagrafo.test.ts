/**
 * Etapa 4, Tarefa 25: as peças puras da página do § (tela 2 aprovada). Linhas sintéticas, inventadas (repositório público).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  chamadasDeNota,
  descricaoDaRegra,
  destaqueDaFigura,
  esquecerLinguasDaMemoria,
  gravarLinguasAbertas,
  lerLinguasAbertas,
  linksDasFiguras,
  ordinalPorExtenso,
  pecasDoParagrafo,
  posicaoNaSecao,
  referenciasDeFiguras,
} from './textoDoParagrafo'

describe('referenciasDeFiguras: onde o texto cita figuras', () => {
  it('a chave e a lista («Abb. 1a», «figs. 3a–b», «illus. 4»), em UTF-16; a prancha não conta', () => {
    const t = 'Ein Testlöwe (Abb. 1a) und die Rückseite (Abb. 1b); vgl. Pl. 3.'
    expect(referenciasDeFiguras(t).map((r) => [t.slice(r.inicio, r.fim), r.figuras])).toEqual([
      ['Abb. 1a', [{ numero: 1, letra: 'a' }]],
      ['Abb. 1b', [{ numero: 1, letra: 'b' }]],
    ])
    const pt = 'Um selo de prova (figs. 3a–b) e outro (cf. fig. 4).'
    expect(referenciasDeFiguras(pt).map((r) => [pt.slice(r.inicio, r.fim), r.figuras])).toEqual([
      ['figs. 3a–b', [{ numero: 3, letra: 'a' }, { numero: 3, letra: 'b' }]],
      ['fig. 4', [{ numero: 4, letra: '' }]],
    ])
    // um caractere fora do BMP antes: as posições são as do JavaScript
    const en = '𓀀 A test lion (illus. 12).'
    const [r] = referenciasDeFiguras(en)
    expect(en.slice(r!.inicio, r!.fim)).toBe('illus. 12')
    expect(referenciasDeFiguras('Nenhuma figura aqui; cf. Pl. 4.')).toEqual([])
  })

  it('fix 1, I2: a referência colada à chamada de nota («fig. 12²⁰», «Abb. 3a²⁰») é achada, sem a chamada', () => {
    const t = 'Um selo na fig. 12²⁰ mostra; outro na Abb. 3a²⁰ e na Abb. 3a, b¹ também.'
    expect(referenciasDeFiguras(t).map((r) => [t.slice(r.inicio, r.fim), r.figuras])).toEqual([
      ['fig. 12', [{ numero: 12, letra: '' }]],
      ['Abb. 3a', [{ numero: 3, letra: 'a' }]],
      ['Abb. 3a, b', [{ numero: 3, letra: 'a' }, { numero: 3, letra: 'b' }]],
    ])
  })

  it('fix 1, menor: a letra solta depois de uma parte com letra só continua a lista quando acaba nela («fig. 7a, o motivo»)', () => {
    const casos: [string, string, { numero: number; letra: string }[]][] = [
      ['A fig. 7a, o motivo volta.', 'fig. 7a', [{ numero: 7, letra: 'a' }]],
      ['Na fig. 3b e a deusa.', 'fig. 3b', [{ numero: 3, letra: 'b' }]],
      ['Abb. 212a und b. Der Test.', 'Abb. 212a und b', [{ numero: 212, letra: 'a' }, { numero: 212, letra: 'b' }]],
      ['(Abb. 3a, c) und', 'Abb. 3a, c', [{ numero: 3, letra: 'a' }, { numero: 3, letra: 'c' }]],
      ['figs. 3b, c e 4.', 'figs. 3b, c e 4', [{ numero: 3, letra: 'b' }, { numero: 3, letra: 'c' }, { numero: 4, letra: '' }]],
    ]
    for (const [t, trecho, figuras] of casos) {
      const [r] = referenciasDeFiguras(t)
      expect([t.slice(r!.inicio, r!.fim), r!.figuras], t).toEqual([trecho, figuras])
    }
    expect(destaqueDaFigura('Na fig. 3b e a deusa.', 3, 'a')).toBeNull()
  })

  it('fix 1, menor: a referência a várias figuras é um link só, à primeira que o § cita (como no desenho)', () => {
    const t = 'Dois selos (figs. 1a–b) e o verso.'
    const refs = [
      { itemId: 'TESTEG-0001a', objeto: 'F200001', numero: 1, sufixo: 'a' },
      { itemId: 'TESTEG-0001b', objeto: 'CA00004', numero: 1, sufixo: 'b' },
    ]
    expect(linksDasFiguras(t, refs).map((l) => [t.slice(l.inicio, l.fim), l.destino])).toEqual([['figs. 1a–b', '/item/F200001']])
    // a primeira que o § cita, não a primeira da lista
    expect(linksDasFiguras('Ver figs. 9 e 1b.', refs).map((l) => l.destino)).toEqual(['/item/CA00004'])
  })

  it('linksDasFiguras: cada referência vai ao objeto da primeira figura que o § cita; a que o § não cita fica texto', () => {
    const t = 'Um leão (Abb. 1a), o verso (Abb. 1b) e um terceiro (Abb. 9).'
    const refs = [
      { itemId: 'TESTEG-0001a', objeto: 'F200001', numero: 1, sufixo: 'a' },
      { itemId: 'TESTEG-0001b', objeto: 'CA00004', numero: 1, sufixo: 'b' },
    ]
    expect(linksDasFiguras(t, refs).map((l) => [t.slice(l.inicio, l.fim), l.destino])).toEqual([
      ['Abb. 1a', '/item/F200001'],
      ['Abb. 1b', '/item/CA00004'],
    ])
    // «Abb. 1» sem letra vale para a primeira parte; a figura sem letra vale para qualquer letra
    expect(linksDasFiguras('Ver Abb. 1.', refs).map((l) => l.destino)).toEqual(['/item/F200001'])
    expect(linksDasFiguras('Ver Abb. 2c.', [{ itemId: 'TESTEG-0002', objeto: 'F200002', numero: 2, sufixo: '' }]).map((l) => l.destino)).toEqual(['/item/F200002'])
  })

  it('destaqueDaFigura: a referência à figura na frase, com o parêntese em volta quando ela está num', () => {
    const f = 'Dois selos mostram um leão (Abb. 1a) e o seu verso (Abb. 1b); cf. Pl. 3.'
    const d = destaqueDaFigura(f, 1, 'b')!
    expect(f.slice(d.inicio, d.fim)).toBe('(Abb. 1b)')
    const g = 'A mesma postura volta (cf. figs. 3b e 12a).'
    const e = destaqueDaFigura(g, 12, 'a')!
    expect(g.slice(e.inicio, e.fim)).toBe('(cf. figs. 3b e 12a)')
    // fora de parêntese: só a referência
    const h = 'Como mostra fig. 7, o motivo volta.'
    const x = destaqueDaFigura(h, 7, '')!
    expect(h.slice(x.inicio, x.fim)).toBe('fig. 7')
    expect(destaqueDaFigura(f, 5, '')).toBeNull()
  })
})

describe('pecasDoParagrafo: o texto em peças (termo, link de figura, correção)', () => {
  it('recompõe o texto; o termo vem de code points; a correção ganha do link que cruza', () => {
    const t = '𓀀 Um leão-de-teste (Abb. 1a) de Maḥteṣ.'
    const cps = [...t]
    const inicioTermo = cps.indexOf('l')
    const termos = [{ glId: 'GL-900001', inicio: inicioTermo, fim: inicioTermo + 'leão-de-teste'.length }]
    const links = [{ inicio: t.indexOf('Abb.'), fim: t.indexOf('Abb.') + 7, destino: '/item/F200001', rotulo: 'Abb. 1a' }]
    const correcoes = [{ inicio: t.indexOf('Maḥteṣ'), fim: t.indexOf('Maḥteṣ') + 6, lido: 'Mahtes', regra: 'ACENTO' }]
    const pecas = pecasDoParagrafo(t, { termos, links, correcoes })
    expect(pecas.map((p) => p.texto).join('')).toBe(t)
    expect(pecas.filter((p) => p.tipo !== 'texto').map((p) => [p.tipo, p.texto])).toEqual([
      ['termo', 'leão-de-teste'],
      ['link', 'Abb. 1a'],
      ['correcao', 'Maḥteṣ'],
    ])
    // sem mostrar as correções: o texto corrido, sem a peça
    expect(pecasDoParagrafo(t, { links, correcoes: [] }).filter((p) => p.tipo === 'correcao')).toEqual([])
    // a correção dentro de um link: a correção (não se aninha um botão num link)
    const cruzada = pecasDoParagrafo(t, { links, correcoes: [{ inicio: t.indexOf('Abb.'), fim: t.indexOf('Abb.') + 4, lido: 'Abh.', regra: 'X' }] })
    expect(cruzada.filter((p) => p.tipo !== 'texto').map((p) => [p.tipo, p.texto])).toEqual([
      ['correcao', 'Abb.'],
      ['link', ' 1a'],
    ])
    expect(pecasDoParagrafo('', {})).toEqual([])
  })
})

describe('fix 1, I1: as chamadas de nota', () => {
  it('chamadasDeNota: as sequências de algarismos sobrescritos, com o número; pecasDoParagrafo dá a peça só às notas que o § tem', () => {
    const t = 'Ein Probesiegel¹ aus Abb. 12²⁰ und ein Testsatz⁹.'
    expect(chamadasDeNota(t).map((c) => [t.slice(c.inicio, c.fim), c.numero])).toEqual([
      ['¹', 1],
      ['²⁰', 20],
      ['⁹', 9],
    ])
    const links = linksDasFiguras(t, [{ itemId: 'X-12', objeto: 'F200012', numero: 12, sufixo: '' }])
    const pecas = pecasDoParagrafo(t, { links, notas: [1, 20] })
    expect(pecas.map((p) => p.texto).join('')).toBe(t)
    expect(pecas.filter((p) => p.tipo !== 'texto').map((p) => [p.tipo, p.texto, p.tipo === 'chamada' ? p.numero : null])).toEqual([
      ['chamada', '¹', 1],
      ['link', 'Abb. 12', null],
      ['chamada', '²⁰', 20],
    ])
    // sem notas (o inglês: o GGIG numera as notas por capítulo), nenhuma chamada vira peça
    expect(pecasDoParagrafo(t, { links }).some((p) => p.tipo === 'chamada')).toBe(false)
    // a correção que cobre a chamada ganha dela
    const c = t.indexOf('¹')
    expect(pecasDoParagrafo(t, { notas: [1], correcoes: [{ inicio: c - 1, fim: c + 1, lido: 'l1', regra: 'CHAMADA_DE_NOTA' }] }).map((p) => p.tipo)).toEqual(['texto', 'correcao', 'texto'])
  })
})

describe('os textos da página', () => {
  it('ordinalPorExtenso e posicaoNaSecao (decisão 91, a8)', () => {
    expect([1, 2, 3, 10].map(ordinalPorExtenso)).toEqual(['primeiro', 'segundo', 'terceiro', 'décimo'])
    expect(ordinalPorExtenso(12)).toBe('12.º')
    expect(posicaoNaSecao(29, { id: 'G', subcolecao: true, paragrafos: [27, 28, 29, 30, 31] })).toBe('terceiro de 5 §§ da seção')
    expect(posicaoNaSecao(1, { id: 'G', subcolecao: false, paragrafos: [1, 4] })).toBe('primeiro de 2 §§ do capítulo')
    expect(posicaoNaSecao(1, { id: 'G', subcolecao: false, paragrafos: [1] })).toBe('o único § do capítulo')
    expect(posicaoNaSecao(9, { id: 'G', subcolecao: true, paragrafos: [1, 2] })).toBeNull()
    expect(posicaoNaSecao(9, null)).toBeNull()
  })

  it('descricaoDaRegra: o que cada regra corrigiu; as regras unidas por «+»; a desconhecida fica como veio', () => {
    expect(descricaoDaRegra('VGL')).toBe('«I» maiúsculo lido no lugar de «l» em «vgl.»')
    expect(descricaoDaRegra('ACENTO')).toBe('acento restaurado pela lista de formas certas (IPIAO e glossário)')
    expect(descricaoDaRegra('RESTO_DE_DIACRITICO+ACENTO')).toBe(`${descricaoDaRegra('RESTO_DE_DIACRITICO')}; ${descricaoDaRegra('ACENTO')}`)
    expect(descricaoDaRegra('REGRA_NOVA')).toBe('REGRA_NOVA')
  })
})

describe('as línguas abertas no computador (decisão 91, a4): lembradas neste aparelho', () => {
  afterEach(() => {
    localStorage.clear()
    esquecerLinguasDaMemoria()
    vi.restoreAllMocks()
  })

  it('abre só com o português; a escolha fica lembrada', () => {
    expect(lerLinguasAbertas()).toEqual({ de: false, en: false })
    gravarLinguasAbertas({ de: true, en: false })
    expect(lerLinguasAbertas()).toEqual({ de: true, en: false })
    localStorage.setItem('iconodb:paragrafo-linguas', '{"de":"sim"}')
    expect(lerLinguasAbertas()).toEqual({ de: false, en: false })
  })

  it('sem localStorage (modo privado): vale na memória até recarregar, sem erro', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    expect(lerLinguasAbertas()).toEqual({ de: false, en: false })
    gravarLinguasAbertas({ de: false, en: true })
    expect(lerLinguasAbertas()).toEqual({ de: false, en: true })
  })
})
