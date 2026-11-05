import { montarLinhas, textoDasHipoteses, type Coluna } from './linhas'

const coluna = (ref: string, extra: Partial<Coluna> = {}): Coluna => ({
  ref,
  situacao: 'ok',
  skc: false,
  numero: ref,
  ligadoA: null,
  marcas: [],
  origem: 'TESTE I: 1',
  titulo: 'Remate',
  rota: `/item/${ref}`,
  campos: {},
  leituras: {},
  imagens: [],
  alvo: ref,
  ...extra,
})

describe('textoDasHipoteses', () => {
  it('os três níveis, como no desenho: "8 pré-iconográficas · 0 iconográficas · 4 iconológicas"', () => {
    expect(textoDasHipoteses({ pre_iconographic: 8, iconographic: 0, iconological: 4, semNivel: 0 })).toBe('8 pré-iconográficas · 0 iconográficas · 4 iconológicas')
  })
  it('no singular, e o "sem nível" só aparece quando existe', () => {
    expect(textoDasHipoteses({ pre_iconographic: 1, iconographic: 1, iconological: 1, semNivel: 2 })).toBe('1 pré-iconográfica · 1 iconográfica · 1 iconológica · 2 sem nível')
  })
  it('nenhuma hipótese', () => {
    expect(textoDasHipoteses({ pre_iconographic: 0, iconographic: 0, iconological: 0, semNivel: 0 })).toBe('Nenhuma hipótese')
  })
})

describe('montarLinhas: as linhas alinhadas por seção', () => {
  const a = coluna('CA00001', { campos: { sitio: 'Sítio de teste', data: 'Período de teste', medidas: 'H 1; B 2 cm' }, leituras: { IPIAO: { texto: 'Leitura A de teste.', lang: 'pt' } } })
  const b = coluna('CA00002', { campos: { sitio: 'Sítio de teste', data: 'Período de teste', medidas: 'H 3 cm', acervo: 'Museu X' }, leituras: { IPIAO: { texto: 'Fantasma.', lang: 'pt' }, SKC: { texto: 'Minha leitura', lang: 'pt' } } })

  it('uma linha por campo que ao menos um objeto tem, na ordem da ficha, depois uma por leitura', () => {
    const l = montarLinhas([a, b])
    expect(l.map((x) => x.chave)).toEqual(['sitio', 'data', 'medidas', 'acervo', 'leitura:IPIAO', 'leitura:SKC'])
    expect(l.map((x) => x.grupo)).toEqual(['ficha', 'ficha', 'ficha', 'ficha', 'leitura', 'leitura'])
  })

  it('uma célula por objeto, na ordem das colunas; o que falta num objeto é uma célula vazia (null), não um deslocamento', () => {
    const l = montarLinhas([a, b])
    const acervo = l.find((x) => x.chave === 'acervo')!
    expect(acervo.celulas).toEqual([null, { texto: 'Museu X', lang: 'pt' }])
    const skc = l.find((x) => x.chave === 'leitura:SKC')!
    expect(skc.celulas).toHaveLength(2)
    expect(skc.celulas[0]).toBeNull()
  })

  it('marca o que difere: o que é igual nos dois não leva ≠; o que falta num dos dois leva', () => {
    const l = montarLinhas([a, b])
    const dif = Object.fromEntries(l.map((x) => [x.chave, x.difere]))
    expect(dif).toEqual({ sitio: false, data: false, medidas: true, acervo: true, 'leitura:IPIAO': true, 'leitura:SKC': true })
  })

  it('a comparação ignora maiúsculas e espaços a mais', () => {
    const x = coluna('CA00001', { campos: { sitio: 'Tell  Abu' } })
    const y = coluna('CA00002', { campos: { sitio: ' tell abu ' } })
    expect(montarLinhas([x, y])[0]!.difere).toBe(false)
  })

  it('com um objeto só, nada difere (não há com o que comparar)', () => {
    expect(montarLinhas([a]).every((x) => !x.difere)).toBe(true)
  })

  it('colunas sem dados (excluído, ainda não sincronizado) viram células vazias e não somem da grade', () => {
    const ausente = coluna('OB-aaaaaaaa-9', { situacao: 'ausente', skc: true, numero: null })
    const l = montarLinhas([a, ausente, b])
    expect(l.length).toBeGreaterThan(0)
    for (const linha of l) expect(linha.celulas).toHaveLength(3)
    expect(l.find((x) => x.chave === 'sitio')!.celulas[1]).toBeNull()
  })

  it('o texto de uma leitura sem tradução vem em alemão, marcado', () => {
    const c = coluna('CA00003', { leituras: { IPIAO: { texto: 'Ein Paar Steinböcke.', lang: 'de' } } })
    expect(montarLinhas([c])[0]!.celulas[0]).toEqual({ texto: 'Ein Paar Steinböcke.', lang: 'de' })
  })

  it('sem nenhum dado, nenhuma linha', () => {
    expect(montarLinhas([coluna('CA00001'), coluna('CA00002')])).toEqual([])
  })
})
