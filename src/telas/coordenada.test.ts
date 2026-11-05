import { coordenadaAte5, coordenadaEmGraus, enderecoDoMapa, lerCoordenada, lerLatitude, lerLongitude, lerTextoDeCoordenada, pareceCoordenadaInteira } from './coordenada'

describe('coordenada', () => {
  it('graus decimais com vírgula, hemisfério e o número de casas pedido', () => {
    expect(coordenadaEmGraus(31.9132, 35.2071, 3)).toBe('31,913 N · 35,207 E')
    expect(coordenadaEmGraus(31.9132, 35.2071, 5)).toBe('31,91320 N · 35,20710 E')
    expect(coordenadaEmGraus(-12.5, -70.25, 2)).toBe('12,50 S · 70,25 W')
    expect(coordenadaEmGraus(0, 0, 1)).toBe('0,0 N · 0,0 E')
  })

  it('o endereço do OpenStreetMap leva a marca e o zoom 12, com os números como estão no banco', () => {
    expect(enderecoDoMapa(31.9132, 35.2071)).toBe('https://www.openstreetmap.org/?mlat=31.9132&mlon=35.2071#map=12/31.9132/35.2071')
  })

  it('latitude ou longitude 0 são coordenadas de verdade (equador, meridiano de Greenwich)', () => {
    expect(coordenadaEmGraus(0, 35.2, 2)).toBe('0,00 N · 35,20 E')
    expect(enderecoDoMapa(0, 35.2)).toBe('https://www.openstreetmap.org/?mlat=0&mlon=35.2#map=12/0/35.2')
    expect(enderecoDoMapa(31.9, 0)).toBe('https://www.openstreetmap.org/?mlat=31.9&mlon=0#map=12/31.9/0')
  })
})

describe('lerCoordenada (Tarefa 12): digitada ou colada', () => {
  const ok = (texto: string) => {
    const r = lerCoordenada(texto)
    if (!r.ok) throw new Error(`esperava uma coordenada: ${r.erro}`)
    return [r.lat, r.lon]
  }
  const erro = (texto: string) => {
    const r = lerCoordenada(texto)
    if (r.ok) throw new Error(`esperava um erro para «${texto}»`)
    return r.erro
  }

  it('lat, lon com ponto decimal (a vírgula separa)', () => {
    expect(ok('31.77, 35.21')).toEqual([31.77, 35.21])
    expect(ok('31.77,35.21')).toEqual([31.77, 35.21])
    expect(ok('-12.5, -70.25')).toEqual([-12.5, -70.25])
    expect(ok('31, 35')).toEqual([31, 35])
  })

  it('lat lon / lat; lon com vírgula decimal (pt-BR)', () => {
    expect(ok('31,77; 35,21')).toEqual([31.77, 35.21])
    expect(ok('31,77 35,21')).toEqual([31.77, 35.21])
    expect(ok('31,77;35,21')).toEqual([31.77, 35.21])
    expect(ok('31.77 35.21')).toEqual([31.77, 35.21])
    expect(ok('  31,38834   35,32897 ')).toEqual([31.38834, 35.32897])
  })

  it('o que o próprio app mostra ("31,913 N · 35,207 E") volta a valer, com o hemisfério', () => {
    expect(ok('31,913 N · 35,207 E')).toEqual([31.913, 35.207])
    expect(ok('12,50 S · 70,25 W')).toEqual([-12.5, -70.25])
    expect(ok('12,50 S; 70,25 O')).toEqual([-12.5, -70.25])
    expect(ok('31.9 N 35.2 E')).toEqual([31.9, 35.2])
  })

  it('link do OpenStreetMap: #map=z/lat/lon e ?mlat=…&mlon=…', () => {
    expect(ok('https://www.openstreetmap.org/#map=12/31.7683/35.2137')).toEqual([31.7683, 35.2137])
    expect(ok('https://www.openstreetmap.org/?mlat=31.9132&mlon=35.2071#map=12/31.9/35.2')).toEqual([31.9132, 35.2071])
    expect(ok('https://www.openstreetmap.org/?mlat=-12.5&mlon=-70.25')).toEqual([-12.5, -70.25])
    expect(ok('https://osm.org/go/xyz?mlat=1.5&mlon=2.5')).toEqual([1.5, 2.5])
    // o que o app gera em "Abrir no mapa" volta a valer
    expect(ok(enderecoDoMapa(31.9132, 35.2071))).toEqual([31.9132, 35.2071])
  })

  it('link do Google Maps: @lat,lon,zoom', () => {
    expect(ok('https://www.google.com/maps/@31.7683,35.2137,15z')).toEqual([31.7683, 35.2137])
    expect(ok('https://www.google.com/maps/place/Jerusal%C3%A9m/@31.7683,35.2137,13z/data=!3m1')).toEqual([31.7683, 35.2137])
    expect(ok('https://maps.google.com/maps/@-12.5,-70.25,10z')).toEqual([-12.5, -70.25])
  })

  it('o ambíguo é recusado com a lista dos formatos que valem', () => {
    const msg = erro('31,77,35,21')
    expect(msg).toContain('ambígu')
    expect(msg).toMatch(/31\.77, 35\.21/)
    expect(msg).toMatch(/31,77; 35,21/)
    expect(msg).toMatch(/OpenStreetMap/)
    expect(msg).toMatch(/Google Maps/)
    // "31,77" sozinho pode ser um número com vírgula: não adivinha uma longitude
    expect(erro('31,77')).toMatch(/longitude/i)
    expect(erro('31,77')).toMatch(/31,77; 35,21/)
  })

  it('fora da faixa: diz qual valor e a faixa', () => {
    expect(erro('131.2, 35.2')).toMatch(/Latitude.*−90 e 90.*131,2/)
    expect(erro('31.2; 235,2')).toMatch(/Longitude.*−180 e 180.*235,2/)
    expect(erro('https://www.openstreetmap.org/#map=12/95/35')).toMatch(/Latitude/)
    expect(erro('91, 35')).toMatch(/Latitude/)
  })

  it('o que não é coordenada: vazio, texto solto, link que não é de mapa, números demais', () => {
    expect(erro('')).toMatch(/Escreva|Cole/)
    expect(erro('Cidade de Teste')).toMatch(/OpenStreetMap/)
    expect(erro('https://example.org/x')).toMatch(/OpenStreetMap/)
    expect(erro('1 2 3')).toMatch(/OpenStreetMap/)
    expect(erro('NaN, 3')).toMatch(/OpenStreetMap/)
    expect(erro('1e3, 2')).toMatch(/OpenStreetMap/)
  })

  it('o hemisfério e o sinal não se contradizem', () => {
    expect(erro('-12,5 N; 70,25 E')).toMatch(/hemisf/i)
  })
})

describe('lerLatitude / lerLongitude (um campo de cada)', () => {
  it('aceitam vírgula ou ponto decimal e conferem a faixa', () => {
    expect(lerLatitude('31,38834')).toEqual({ ok: true, valor: 31.38834 })
    expect(lerLatitude(' -31.5 ')).toEqual({ ok: true, valor: -31.5 })
    expect(lerLongitude('35,32897')).toEqual({ ok: true, valor: 35.32897 })
    expect(lerLatitude('131,2')).toEqual({ ok: false, erro: expect.stringMatching(/Latitude entre −90 e 90/) })
    expect(lerLongitude('181')).toEqual({ ok: false, erro: expect.stringMatching(/Longitude entre −180 e 180/) })
    expect(lerLatitude('abc')).toEqual({ ok: false, erro: expect.stringMatching(/número/) })
    expect(lerLatitude('31,7,7')).toEqual({ ok: false, erro: expect.stringMatching(/número/) })
    expect(lerLatitude('')).toEqual({ ok: false, erro: expect.stringMatching(/Escreva/) })
  })
})

describe('coordenadaAte5: até 5 casas, sem zeros à direita', () => {
  it('31,77 N · 35,21 E; 5 casas no máximo', () => {
    expect(coordenadaAte5(31.77, 35.21)).toBe('31,77 N · 35,21 E')
    expect(coordenadaAte5(31.123456789, -35.5)).toBe('31,12346 N · 35,5 W')
    expect(coordenadaAte5(0, 0)).toBe('0 N · 0 E')
  })
})

describe('links curtos do Google Maps (maps.app.goo.gl): dito com clareza, sem rede', () => {
  const MSG = /link curto do Google Maps/
  it('com ou sem https://, a recusa explica que o app não abre o link e manda copiar as coordenadas', () => {
    for (const t of ['https://maps.app.goo.gl/AbC123xyz', 'maps.app.goo.gl/AbC123xyz', 'https://goo.gl/maps/AbC123']) {
      const r = lerCoordenada(t)
      expect(r.ok).toBe(false)
      const erro = (r as { erro: string }).erro
      expect(erro).toMatch(MSG)
      expect(erro).toMatch(/internet/)
      expect(erro).toMatch(/copie as coordenadas/)
    }
  })
  it('um link longo do Google sem @ continua sendo recusado com a lista dos formatos', () => {
    const r = lerCoordenada('https://www.google.com/maps/place/Tell+Teste')
    expect(r).toEqual({ ok: false, erro: expect.stringContaining('@latitude,longitude') })
  })
})

describe('pareceCoordenadaInteira / lerTextoDeCoordenada: o que vai para o leitor do par, e não para um campo só', () => {
  it('reconhece pares, links e o ambíguo; deixa passar um número só e texto comum', () => {
    for (const t of ['31,77,35,21', '31.77, 35.21', '31,77; 35,21', '31,77 35,21', '31,913 N · 35,207 E', 'https://www.openstreetmap.org/#map=12/31/35', 'maps.app.goo.gl/x', '95, 35']) {
      expect(pareceCoordenadaInteira(t), t).toBe(true)
    }
    for (const t of ['', '31,77', '31.77', '-12', 'abc', 'Tell Teste', '31,']) expect(pareceCoordenadaInteira(t), t).toBe(false)
  })
  it('lerTextoDeCoordenada: null para um número só; o par ou a recusa para o resto', () => {
    expect(lerTextoDeCoordenada('31,77')).toBeNull()
    expect(lerTextoDeCoordenada('31.77, 35.21')).toEqual({ ok: true, lat: 31.77, lon: 35.21 })
    expect(lerTextoDeCoordenada('31,77,35,21')).toEqual({ ok: false, erro: expect.stringMatching(/ambígua/) })
  })
})
