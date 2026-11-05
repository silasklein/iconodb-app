import { dimensoesOrientadas, extensaoDoOriginal, lerCabecalho, tamanhoAlvo } from './cabecalho'

const u16 = (v: number) => [(v >> 8) & 255, v & 255]
const u32 = (v: number) => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255]
const le16 = (v: number) => [v & 255, (v >> 8) & 255]
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))

/** Um JPEG mínimo: SOI, APP1 com EXIF (orientação), um APP2 grande antes do SOF0 (como o MPF do iPhone), SOF0. */
function jpeg(largura: number, altura: number, orientacao?: number, { motorola = true, grande = 0 } = {}): Uint8Array {
  const partes: number[] = [0xff, 0xd8]
  if (orientacao !== undefined) {
    const e16 = motorola ? u16 : le16
    const e32 = motorola ? u32 : (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]
    const tiff = [...(motorola ? ascii('MM') : ascii('II')), ...e16(42), ...e32(8), ...e16(1), ...e16(0x0112), ...e16(3), ...e32(1), ...e16(orientacao), 0, 0, ...e32(0)]
    const corpo = [...ascii('Exif'), 0, 0, ...tiff]
    partes.push(0xff, 0xe1, ...u16(corpo.length + 2), ...corpo)
  }
  if (grande) partes.push(0xff, 0xe2, ...u16(grande + 2), ...new Array(grande).fill(0))
  partes.push(0xff, 0xc0, ...u16(17), 8, ...u16(altura), ...u16(largura), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1)
  partes.push(0xff, 0xd9)
  return new Uint8Array(partes)
}

function png(largura: number, altura: number): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32(13), ...ascii('IHDR'), ...u32(largura), ...u32(altura), 8, 6, 0, 0, 0, 0, 0, 0, 0])
}

function caixa(tipo: string, corpo: number[]): number[] {
  return [...u32(corpo.length + 8), ...ascii(tipo), ...corpo]
}

/** Um HEIC com duas `ispe` (miniatura 320×240 e a imagem 4032×3024) e um `irot` de 90°. */
function heic(irot: number | null): Uint8Array {
  const ispe = (w: number, h: number) => caixa('ispe', [0, 0, 0, 0, ...u32(w), ...u32(h)])
  const iprp = caixa('iprp', caixa('ipco', [...ispe(320, 240), ...ispe(4032, 3024), ...(irot === null ? [] : caixa('irot', [irot]))]))
  return new Uint8Array([...caixa('ftyp', [...ascii('heic'), 0, 0, 0, 0, ...ascii('mif1'), ...ascii('heic')]), ...caixa('meta', [0, 0, 0, 0, ...iprp])])
}

describe('lerCabecalho: tamanho e orientação sem decodificar a imagem', () => {
  it('JPEG: tamanho do SOF0 e orientação do EXIF (big e little endian), mesmo depois de um APP2 grande', () => {
    expect(lerCabecalho(jpeg(4032, 3024, 6))).toEqual({ formato: 'jpeg', largura: 4032, altura: 3024, orientacao: 6 })
    expect(lerCabecalho(jpeg(800, 600, 3, { motorola: false }))).toEqual({ formato: 'jpeg', largura: 800, altura: 600, orientacao: 3 })
    expect(lerCabecalho(jpeg(8000, 6000, undefined, { grande: 60_000 }))).toEqual({ formato: 'jpeg', largura: 8000, altura: 6000, orientacao: 1 })
  })

  it('PNG, GIF e WebP (VP8, VP8L, VP8X)', () => {
    expect(lerCabecalho(png(1200, 1600))).toEqual({ formato: 'png', largura: 1200, altura: 1600, orientacao: 1 })
    expect(lerCabecalho(new Uint8Array([...ascii('GIF89a'), ...le16(320), ...le16(200), 0, 0, 0]))).toMatchObject({ formato: 'gif', largura: 320, altura: 200 })
    const riff = (chunk: number[]) => new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...chunk, 0, 0, 0, 0, 0, 0, 0, 0])
    // VP8X: largura-1 e altura-1 em 24 bits little endian.
    expect(lerCabecalho(riff([...ascii('VP8X'), 10, 0, 0, 0, 0, 0, 0, 0, 0x3f, 0x1f, 0, 0xef, 0x0b, 0]))).toMatchObject({ formato: 'webp', largura: 8000, altura: 3056 })
    // VP8 (com perdas): depois da assinatura 9d 01 2a, largura e altura em 14 bits.
    expect(lerCabecalho(riff([...ascii('VP8 '), 10, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(1600), ...le16(1200)]))).toMatchObject({ formato: 'webp', largura: 1600, altura: 1200 })
    // VP8L (sem perdas): 0x2f e 14+14 bits.
    const w = 1599
    const h = 899
    const bits = w | (h << 14)
    expect(lerCabecalho(riff([...ascii('VP8L'), 10, 0, 0, 0, 0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >>> 24) & 255]))).toMatchObject({ largura: 1600, altura: 900 })
  })

  it('HEIC: a maior ispe; o irot de 90° (ou 270°) troca os lados na hora de orientar', () => {
    expect(lerCabecalho(heic(null))).toEqual({ formato: 'heic', largura: 4032, altura: 3024, orientacao: 1 })
    expect(lerCabecalho(heic(1))).toEqual({ formato: 'heic', largura: 4032, altura: 3024, orientacao: 8 })
    expect(lerCabecalho(heic(3))).toEqual({ formato: 'heic', largura: 4032, altura: 3024, orientacao: 6 })
  })

  it('o que não reconhece (ou cortado) dá null, sem lançar', () => {
    expect(lerCabecalho(new Uint8Array([1, 2, 3]))).toBeNull()
    expect(lerCabecalho(new Uint8Array(0))).toBeNull()
    expect(lerCabecalho(jpeg(10, 10, 6).slice(0, 12))).toBeNull()
    expect(lerCabecalho(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]))).toBeNull()
  })
})

describe('dimensoesOrientadas e tamanhoAlvo', () => {
  it('orientação 5 a 8 troca largura e altura (a foto do iPhone deitada no arquivo, em pé na tela)', () => {
    expect(dimensoesOrientadas({ largura: 4032, altura: 3024, orientacao: 6 })).toEqual({ largura: 3024, altura: 4032 })
    expect(dimensoesOrientadas({ largura: 4032, altura: 3024, orientacao: 3 })).toEqual({ largura: 4032, altura: 3024 })
  })

  it('o lado maior vai ao limite; nunca amplia; nunca zero', () => {
    expect(tamanhoAlvo(8000, 6000, 1600)).toEqual({ largura: 1600, altura: 1200 })
    expect(tamanhoAlvo(3024, 4032, 1600)).toEqual({ largura: 1200, altura: 1600 })
    expect(tamanhoAlvo(1600, 1200, 320)).toEqual({ largura: 320, altura: 240 })
    expect(tamanhoAlvo(800, 600, 1600)).toEqual({ largura: 800, altura: 600 })
    expect(tamanhoAlvo(20000, 3, 1600)).toEqual({ largura: 1600, altura: 1 })
  })
})

describe('extensaoDoOriginal: o nome do arquivo no Dropbox (original.<ext>)', () => {
  it('a extensão do nome, em minúsculas, se for simples; senão a do tipo; senão "bin"', () => {
    expect(extensaoDoOriginal('IMG_2041.HEIC', 'image/heic')).toBe('heic')
    expect(extensaoDoOriginal('foto.JPEG', '')).toBe('jpeg')
    expect(extensaoDoOriginal('sem-extensao', 'image/png')).toBe('png')
    expect(extensaoDoOriginal('x.tão', 'image/jpeg')).toBe('jpg')
    expect(extensaoDoOriginal('x.muitolonga', 'image/webp')).toBe('webp')
    expect(extensaoDoOriginal('', '')).toBe('bin')
  })
})
