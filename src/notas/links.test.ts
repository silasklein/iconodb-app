import { analisarTexto, chaveDoAlvo, citacoesDe, limparRotulo, montarLink, referenciasDe, textoSemLinks, tipoDoRef } from './links'

describe('analisarTexto: [[ref|rótulo]]', () => {
  it('separa texto e links, na ordem', () => {
    expect(analisarTexto('antes [[GL-900038|íbex]] depois [[CA00019]].')).toEqual([
      { tipo: 'texto', texto: 'antes ' },
      { tipo: 'link', ref: 'GL-900038', rotulo: 'íbex', bruto: '[[GL-900038|íbex]]' },
      { tipo: 'texto', texto: ' depois ' },
      { tipo: 'link', ref: 'CA00019', rotulo: null, bruto: '[[CA00019]]' },
      { tipo: 'texto', texto: '.' },
    ])
  })

  it('texto sem links é um só pedaço; vazio não tem pedaços', () => {
    expect(analisarTexto('só texto')).toEqual([{ tipo: 'texto', texto: 'só texto' }])
    expect(analisarTexto('')).toEqual([])
  })

  it('o rótulo vazio vale como sem rótulo', () => {
    expect(analisarTexto('[[BIB-900001|]]')).toEqual([{ tipo: 'link', ref: 'BIB-900001', rotulo: null, bruto: '[[BIB-900001|]]' }])
  })

  it('colchetes soltos, links abertos e quebras de linha não são links', () => {
    for (const t of ['[[sem fim', '[ref]', '[[a\nb]]', '[[]]', '[[ |x]]', 'a]] [[']) {
      expect(analisarTexto(t).every((p) => p.tipo === 'texto'), t).toBe(true)
      expect(analisarTexto(t).map((p) => (p as { texto: string }).texto).join(''), t).toBe(t)
    }
  })

  it('HTML no rótulo ou no texto continua texto: nada é interpretado', () => {
    const [, link] = analisarTexto('x [[GL-1|<img src=x onerror=alert(1)>]] y')
    expect(link).toMatchObject({ tipo: 'link', ref: 'GL-1', rotulo: '<img src=x onerror=alert(1)>' })
  })

  it('juntar os pedaços devolve o texto original', () => {
    const t = 'a [[X-1|b]] c [[CA00001]] [[sem fim'
    const volta = analisarTexto(t)
      .map((p) => (p.tipo === 'texto' ? p.texto : p.bruto))
      .join('')
    expect(volta).toBe(t)
  })
})

describe('montarLink e limparRotulo', () => {
  it('monta [[ref|rótulo]]; sem rótulo, só [[ref]]', () => {
    expect(montarLink('GL-900038', 'leão-de-teste')).toBe('[[GL-900038|leão-de-teste]]')
    expect(montarLink('CA00019', '')).toBe('[[CA00019]]')
    expect(montarLink('CA00019', null)).toBe('[[CA00019]]')
  })

  it('tira do rótulo o que quebraria o link: colchetes, barra vertical e quebras de linha', () => {
    expect(limparRotulo('a|b]c[d\ne')).toBe('a b c d e')
    expect(limparRotulo('  vários   espaços  ')).toBe('vários espaços')
    const l = montarLink('GL-1', 'x]] [[GL-2|y')
    expect(analisarTexto(l)).toHaveLength(1)
    expect(analisarTexto(l)[0]).toMatchObject({ tipo: 'link', ref: 'GL-1' })
  })

  it('o que montarLink escreve, analisarTexto lê de volta', () => {
    const rotulo = 'Hipótese: “vielleicht ein Testlöwe” (Maḥteṣ Teste)'
    expect(analisarTexto(montarLink('HY-900203', rotulo))[0]).toMatchObject({ ref: 'HY-900203', rotulo })
  })
})

describe('tipoDoRef', () => {
  it.each([
    ['GL-900038', 'verbete'],
    ['BIB-900001', 'obra'],
    ['CA00023', 'objeto'],
    ['ca00023', 'objeto'],
    ['BA00001', 'objeto'],
    ['F100001', 'objeto'],
    ['f200002', 'objeto'],
    ['ZZ00001', null],
    ['TESTE-1', 'sitio'],
    ['SI-aaaaaaaa-1', 'sitio'],
    ['CO-aaaaaaaa-2', 'colecao'],
    ['HY-900203', 'hipotese'],
    ['OB-aaaaaaaa-1', 'objeto-skc'],
    ['GR-TESTE-I-01', 'grupo'],
    ['qualquer coisa', null],
  ])('%s é %s', (ref, tipo) => expect(tipoDoRef(ref)).toBe(tipo))
})

describe('chaveDoAlvo, referenciasDe, textoSemLinks', () => {
  it('a chave junta o tipo e o id, e põe o número do objeto em maiúsculas', () => {
    expect(chaveDoAlvo('objeto', 'ca00023')).toBe('objeto\u0000CA00023')
    expect(chaveDoAlvo('verbete', 'GL-1')).toBe('verbete\u0000GL-1')
  })

  it('referenciasDe lista as ligações sem repetir, na ordem em que aparecem', () => {
    expect(referenciasDe('[[GL-1|a]] [[CA00001]] [[GL-1|de novo]] [[ca00001]] [[nada que se reconheça]]')).toEqual([
      { tipo: 'verbete', ref: 'GL-1' },
      { tipo: 'objeto', ref: 'CA00001' },
    ])
  })

  it('textoSemLinks troca cada link pelo rótulo (ou pelo id)', () => {
    expect(textoSemLinks('o [[GL-1|íbex]] e o [[CA00001]]')).toBe('o íbex e o CA00001')
  })
})

describe('citacoesDe: o que o texto liga, com o rótulo que a pessoa escreveu', () => {
  it('um item por alvo, na ordem; o primeiro rótulo escrito vale', () => {
    expect(citacoesDe('ver [[GL-900001|leão]], [[ca00001]] e de novo [[GL-900001|outro nome]]')).toEqual([
      { tipo: 'verbete', ref: 'GL-900001', rotulo: 'leão' },
      { tipo: 'objeto', ref: 'CA00001', rotulo: null },
    ])
  })
  it('um rótulo escrito depois, num link repetido sem rótulo, completa o primeiro', () => {
    expect(citacoesDe('[[GL-900001]] ... [[GL-900001|leão]]')).toEqual([{ tipo: 'verbete', ref: 'GL-900001', rotulo: 'leão' }])
  })
  it('ids que não se reconhecem ficam de fora; sem links, lista vazia', () => {
    expect(citacoesDe('[[XYZ]] e texto')).toEqual([])
    expect(citacoesDe('nada')).toEqual([])
  })
})
