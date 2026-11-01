import { coordenadaEmGraus, enderecoDoMapa } from './coordenada'

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
