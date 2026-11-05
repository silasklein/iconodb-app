import { CHAVE_SEM_COORDENADA, CHAVE_FORA, REGIOES, dentroDoPoligono, regiaoDe, regioesQueContem, type Poligono } from './regioes'

const ids = REGIOES.map((r) => r.id)

describe('regiões dos sítios (decisão 36)', () => {
  it('são as oito regiões da decisão, na ordem dos filtros', () => {
    expect(REGIOES.map((r) => r.nome)).toEqual(['Levante Sul', 'Levante Norte', 'Transjordânia', 'Egito', 'Mesopotâmia', 'Anatólia', 'Chipre', 'Irã'])
    expect(new Set(ids).size).toBe(ids.length)
    for (const r of REGIOES) {
      expect(r.poligono.length).toBeGreaterThanOrEqual(3)
      expect(r.rotulo.lon).toBeGreaterThan(20)
    }
  })

  // Pontos INVENTADOS (nenhum é a coordenada de um sítio de livro), descritos pela geografia.
  it.each([
    ['planalto central do Levante Sul', 31.82, 35.17, 'levante-sul'],
    ['Galileia, no extremo norte do Levante Sul', 33.04, 35.52, 'levante-sul'],
    ['cabeceira do golfo de Aqaba, do lado leste do vértice deslocado', 29.62, 34.9, 'levante-sul'],
    ['cabeceira do golfo de Aqaba, do lado oeste do vértice deslocado', 29.62, 34.78, 'egito'],
    ['planalto da Transjordânia', 31.9, 35.88, 'transjordania'],
    ['margem oriental do Jordão, junto do vale', 32.52, 35.9, 'transjordania'],
    ['médio Eufrates', 34.6, 40.85, 'levante-norte'],
    ['alto Khabur, no limite do Levante Norte', 36.6, 41.0, 'levante-norte'],
    ['interior da planície do Levante Norte', 35.75, 36.75, 'levante-norte'],
    ['planície aluvial do Tigre e do Eufrates', 32.5, 44.3, 'mesopotamia'],
    ['planície a leste do Tigre', 32.1, 48.2, 'ira'],
    ['planalto iraniano, ao sul do Cáspio', 36.1, 54.5, 'ira'],
    ['vale do Nilo, ao norte', 30.1, 31.3, 'egito'],
    ['vale do Nilo, ao sul', 26.2, 31.9, 'egito'],
    ['interior do Sinai', 29.1, 33.5, 'egito'],
    ['extremo sul do Sinai', 27.9, 34.3, 'egito'],
    ['planalto central da Anatólia', 40.0, 34.6, 'anatolia'],
    ['interior de Chipre', 35.1, 33.4, 'chipre'],
  ])('%s cai em %s', (_nome, lat, lon, esperado) => {
    expect(regiaoDe(lat, lon)).toBe(esperado)
  })

  it('sem coordenada (ausente, nula ou não numérica) é «Sem coordenada»', () => {
    expect(regiaoDe(null, null)).toBe(CHAVE_SEM_COORDENADA)
    expect(regiaoDe(31, null)).toBe(CHAVE_SEM_COORDENADA)
    expect(regiaoDe(Number.NaN, 35)).toBe(CHAVE_SEM_COORDENADA)
    expect(regiaoDe(undefined, undefined)).toBe(CHAVE_SEM_COORDENADA)
  })

  it('uma coordenada fora de todos os polígonos não some: vai para «Fora das regiões»', () => {
    expect(regiaoDe(0, 0)).toBe(CHAVE_FORA)
    expect(regiaoDe(-33.9, 151.2)).toBe(CHAVE_FORA)
  })

  describe('regra de borda: um ponto sobre uma borda comum cai em uma região só', () => {
    const arestas: { de: string; para: string; lon: number; lat: number }[] = []
    for (const r of REGIOES) {
      r.poligono.forEach((p, i) => {
        const q = r.poligono[(i + 1) % r.poligono.length]!
        arestas.push({ de: r.id, para: r.id, lon: (p[0] + q[0]) / 2, lat: (p[1] + q[1]) / 2 })
        arestas.push({ de: r.id, para: r.id, lon: p[0], lat: p[1] })
      })
    }

    it('em cada vértice e no meio de cada aresta, a resposta é a primeira região da ordem que contém o ponto', () => {
      let compartilhados = 0
      for (const a of arestas) {
        const todas = regioesQueContem(a.lat, a.lon)
        expect(todas.length).toBeGreaterThanOrEqual(1)
        if (todas.length > 1) compartilhados++
        expect(regiaoDe(a.lat, a.lon)).toBe(todas[0])
        expect(todas).toEqual(ids.filter((i) => todas.includes(i))) // sempre na ordem das regiões
      }
      expect(compartilhados).toBeGreaterThan(10) // as bordas comuns existem de fato (a regra é exercida)
    })

    it('exemplo: o meio da borda entre o Levante Sul e a Transjordânia fica no Levante Sul (a primeira da ordem), nunca nas duas', () => {
      const sul = REGIOES.find((r) => r.id === 'levante-sul')!
      const trans = REGIOES.find((r) => r.id === 'transjordania')!
      const comuns = sul.poligono.filter((p) => trans.poligono.some((q) => q[0] === p[0] && q[1] === p[1]))
      expect(comuns.length).toBeGreaterThanOrEqual(2)
      const [a, b] = [comuns[0]!, comuns[1]!]
      const lon = (a[0] + b[0]) / 2
      const lat = (a[1] + b[1]) / 2
      expect(regioesQueContem(lat, lon)).toEqual(['levante-sul', 'transjordania'])
      expect(regiaoDe(lat, lon)).toBe('levante-sul')
      // um passo para cada lado, dentro de cada uma
      expect(regiaoDe(lat, lon + 0.05)).toBe('transjordania')
      expect(regiaoDe(lat, lon - 0.05)).toBe('levante-sul')
    })

    it('nenhum ponto do interior cai em duas regiões (varredura de 0,05° sobre a extensão)', () => {
      let sobrepostos = 0
      for (let lat = 21; lat <= 43; lat += 0.05) {
        for (let lon = 23; lon <= 62; lon += 0.05) {
          // pontos fora das bordas (a malha de 0,05° quase nunca cai numa aresta): uma região só, ou nenhuma
          if (regioesQueContem(lat, lon).length > 1) sobrepostos++
        }
      }
      // só pode haver pontos sobre as bordas retas (meridianos e paralelos de vértices em múltiplos de 0,05)
      expect(sobrepostos).toBeLessThan(60)
    })
  })

  it('dentroDoPoligono é inclusivo nas bordas e nos vértices', () => {
    const quadrado: Poligono = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ]
    expect(dentroDoPoligono(1, 1, quadrado)).toBe(true)
    expect(dentroDoPoligono(2, 1, quadrado)).toBe(true) // aresta direita
    expect(dentroDoPoligono(0, 1, quadrado)).toBe(true) // aresta esquerda
    expect(dentroDoPoligono(2, 2, quadrado)).toBe(true) // vértice
    expect(dentroDoPoligono(2.0001, 1, quadrado)).toBe(false)
    expect(dentroDoPoligono(1, -0.0001, quadrado)).toBe(false)
  })
})
