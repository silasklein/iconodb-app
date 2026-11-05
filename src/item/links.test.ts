import type { ReferenciaBibliografica, Remissao } from '../banco/tipos'
import { acharLinks, numeroDoCatalogo } from './links'

function ref(parcial: Partial<ReferenciaBibliografica>): ReferenciaBibliografica {
  return {
    id: 1,
    itemId: 'T-1',
    categoria: 7,
    bruto: 'Autor 1999: 12 Nr. 3',
    curta: 'Autor 1999',
    paginas: '12 Nr. 3',
    obraId: 'BIB-1',
    resolvida: true,
    chicago: null,
    chicagoHtml: null,
    hipoteseId: null,
    passagemId: null,
    ...parcial,
  }
}
const rem = (numero: string | null, origem: string | null, itemId = 'T-2'): Remissao => ({ itemId, numero, origem })
const base = { fonte: 'TESTE I: 1', itemId: 'T-1' }
const recorte = (texto: string, l: { inicio: number; fim: number }) => texto.slice(l.inicio, l.fim)

describe('numeroDoCatalogo', () => {
  it('decisão 39: é o número depois dos dois pontos da origem ("TESTE I: 2")', () => {
    expect(numeroDoCatalogo('TESTE I: 2')).toBe('2')
    expect(numeroDoCatalogo('TESTE I: 58a')).toBe('58a')
    expect(numeroDoCatalogo('TESTE I: Abb. 1')).toBeNull()
  })

  it('a forma antiga ("TESTE I, 2") continua aceita', () => {
    expect(numeroDoCatalogo('TESTE I, 2')).toBe('2')
    expect(numeroDoCatalogo('TESTE I, 58a')).toBe('58a')
    expect(numeroDoCatalogo('TESTE I, Abb. 1')).toBeNull()
    expect(numeroDoCatalogo(null)).toBeNull()
  })
})

describe('acharLinks', () => {
  it('a citação pelo texto inteiro (bruto) leva à obra', () => {
    const texto = 'Como em Autor 1999: 12 Nr. 3, o leão.'
    const [l, ...resto] = acharLinks(texto, [], { ...base, bibliografia: [ref({})], remissoes: [] })
    expect(resto).toEqual([])
    expect(recorte(texto, l!)).toBe('Autor 1999: 12 Nr. 3')
    expect(l).toMatchObject({ destino: '/obra/BIB-1' })
  })

  it('sem o bruto, procura a forma curta', () => {
    const texto = 'Como em Autor 1999 e passim.'
    const [l] = acharLinks(texto, [], { ...base, bibliografia: [ref({})], remissoes: [] })
    expect(recorte(texto, l!)).toBe('Autor 1999')
  })

  it('duas referências com a mesma forma curta pegam a primeira e a segunda ocorrência', () => {
    const texto = 'Autor 1999 diz; Autor 1999 repete.'
    const links = acharLinks(texto, [], {
      ...base,
      bibliografia: [ref({ id: 1, bruto: 'x', obraId: 'BIB-1' }), ref({ id: 2, bruto: 'y', obraId: 'BIB-2' })],
      remissoes: [],
    })
    expect(links.map((l) => [l.inicio, l.destino])).toEqual([
      [0, '/obra/BIB-1'],
      [16, '/obra/BIB-2'],
    ])
  })

  it('referência não resolvida, sem obra ou de outro item não vira link', () => {
    const texto = 'Autor 1999 e Outro 2000 e Mais 2001.'
    const links = acharLinks(texto, [], {
      ...base,
      bibliografia: [ref({ resolvida: false }), ref({ bruto: 'Outro 2000', curta: null, obraId: null }), ref({ bruto: 'Mais 2001', itemId: 'T-9' })],
      remissoes: [],
    })
    expect(links).toEqual([])
  })

  it('nunca se sobrepõe a termos e âncoras (trechos ocupados, em UTF-16): usa a ocorrência seguinte', () => {
    const texto = 'Autor 1999 aqui; Autor 1999 ali.'
    const links = acharLinks(texto, [{ inicio: 3, fim: 8 }], { ...base, bibliografia: [ref({})], remissoes: [] })
    expect(links.map((l) => l.inicio)).toEqual([17])
  })

  it('a remissão acha o número do catálogo entre parênteses ou depois de "cf." e leva ao outro item', () => {
    const texto = 'Uma gravação de teste (cf. 2). Outra (12; 5).'
    const links = acharLinks(texto, [], {
      ...base,
      bibliografia: [],
      remissoes: [rem('CA00002', 'TESTE I: 2'), rem('CA00005', 'TESTE I: 5', 'T-5'), rem('CA00012', 'TESTE I: 12', 'T-12')],
    })
    expect(links.map((l) => [recorte(texto, l), l.destino])).toEqual([
      ['2', '/item/CA00002'],
      ['12', '/item/CA00012'],
      ['5', '/item/CA00005'],
    ])
    expect(links[0]!.rotulo).toBe('Abrir CA00002, TESTE I: 2')
  })

  it('o número de uma citação ("Autor 1999: 12 Nr. 3"), um ano ou um decimal não é remissão', () => {
    const texto = 'Mede 4,2 cm (Autor 1999: 12 Nr. 3), de 1999.'
    const links = acharLinks(texto, [], {
      ...base,
      bibliografia: [],
      remissoes: [rem('CA00003', 'TESTE I: 3'), rem('CA00012', 'TESTE I: 12'), rem('CA00004', 'TESTE I: 4'), rem('CA00099', 'TESTE I: 1999')],
    })
    expect(links).toEqual([])
  })

  it('a lista "(51.52)" liga os dois números', () => {
    const texto = 'outros objetos (51.52).'
    const links = acharLinks(texto, [], { ...base, bibliografia: [], remissoes: [rem('CA00051', 'TESTE I: 51'), rem('CA00052', 'TESTE I: 52')] })
    expect(links.map((l) => recorte(texto, l))).toEqual(['51', '52'])
  })

  it('remissão órfã (sem número no pacote) ou de outra obra não vira link', () => {
    const texto = 'veja (cf. 2) e (cf. 7).'
    const links = acharLinks(texto, [], { ...base, bibliografia: [], remissoes: [rem(null, null), rem('BA00007', 'OUTRA I: 7')] })
    expect(links).toEqual([])
  })

  it('os links saem em ordem e sem sobreposição entre si', () => {
    const texto = '(cf. 2) e Autor 1999.'
    const links = acharLinks(texto, [], { ...base, bibliografia: [ref({})], remissoes: [rem('CA00002', 'TESTE I: 2')] })
    expect(links.map((l) => recorte(texto, l))).toEqual(['2', 'Autor 1999'])
  })
})

describe('acharLinks: correções do matcher (correção 2)', () => {
  it('a forma bibliográfica casa só em fronteira de palavra: "Autor 1995" não casa dentro de "Autor 1995a: 12"', () => {
    const texto = 'Ver Autor 1995a: 12 e depois Autor 1995: 30.'
    const links = acharLinks(texto, [], { ...base, bibliografia: [ref({ bruto: 'Autor 1995: 30x', curta: 'Autor 1995' })], remissoes: [] })
    expect(links.map((l) => [l.inicio, recorte(texto, l)])).toEqual([[texto.indexOf('Autor 1995:'), 'Autor 1995']])
  })

  it('nada antes nem depois colado: "XAutor 1995" e "Autor 19950" não casam', () => {
    const texto = 'XAutor 1995 e Autor 19950.'
    expect(acharLinks(texto, [], { ...base, bibliografia: [ref({ bruto: 'Autor 1995', curta: null })], remissoes: [] })).toEqual([])
  })

  it('";" só continua uma lista de remissões aberta como remissão: "(Abb. 3; 4)" e "(Taf. 12; 5)" não ligam nada', () => {
    const texto = 'Veja (Abb. 3; 4) e (Taf. 12; 5).'
    const links = acharLinks(texto, [], {
      ...base,
      bibliografia: [],
      remissoes: [rem('CA00003', 'TESTE I: 3'), rem('CA00004', 'TESTE I: 4'), rem('CA00012', 'TESTE I: 12'), rem('CA00005', 'TESTE I: 5')],
    })
    expect(links).toEqual([])
  })

  it('"(cf. 2; 5)" e "(12; 5)" continuam valendo', () => {
    const texto = 'Um (cf. 2; 5) e outro (12; 7).'
    const links = acharLinks(texto, [], {
      ...base,
      bibliografia: [],
      remissoes: [rem('CA00002', 'TESTE I: 2'), rem('CA00005', 'TESTE I: 5'), rem('CA00012', 'TESTE I: 12'), rem('CA00007', 'TESTE I: 7')],
    })
    expect(links.map((l) => recorte(texto, l))).toEqual(['2', '5', '12', '7'])
  })

  it('prefere o número depois de "cf." ou fechado por ")": em "Camada (3. fase) e (cf. 3)" o link vai em "(cf. 3)"', () => {
    const texto = 'Camada (3. fase) e (cf. 3).'
    const [l, ...resto] = acharLinks(texto, [], { ...base, bibliografia: [], remissoes: [rem('CA00003', 'TESTE I: 3')] })
    expect(resto).toEqual([])
    expect(l!.inicio).toBe(texto.lastIndexOf('3'))
  })
})
