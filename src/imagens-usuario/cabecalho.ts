/**
 * O tamanho e a orientação de uma imagem lidos do CABEÇALHO, sem decodificar (Foco 5: uma foto de 48 MP não pode ser
 * aberta inteira só para saber o tamanho). Com isso o processamento pede ao navegador a imagem já reduzida
 * (`createImageBitmap` com `resizeWidth`). Cobre JPEG (SOFn + orientação do EXIF), PNG, GIF, WebP e HEIC/HEIF/AVIF
 * (a maior caixa `ispe` e o `irot`). O que não reconhece dá null: o processamento decodifica sem reduzir e reduz
 * depois (o caso raro; ver processar.ts).
 *
 * Funções puras sobre os primeiros bytes do arquivo (o processamento lê o primeiro 1 MB).
 */

export type FormatoDoArquivo = 'jpeg' | 'png' | 'gif' | 'webp' | 'heic'

export interface Cabecalho {
  formato: FormatoDoArquivo
  /** Como está no arquivo (antes de aplicar a orientação). */
  largura: number
  altura: number
  /** EXIF 1–8 (1 = como está; 5–8 trocam largura e altura). No HEIC, o `irot` traduzido para EXIF. */
  orientacao: number
}

export interface Tamanho {
  largura: number
  altura: number
}

const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n))
const be16 = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!
const be32 = (b: Uint8Array, i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0
const le16 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8)
const le24 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16)
const le32 = (b: Uint8Array, i: number) => (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0

const valido = (c: Cabecalho | null): Cabecalho | null => (c && c.largura > 0 && c.altura > 0 ? c : null)

export function lerCabecalho(bytes: Uint8Array): Cabecalho | null {
  try {
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return valido(jpeg(bytes))
    if (bytes.length >= 24 && be32(bytes, 0) === 0x89504e47 && ascii(bytes, 12, 4) === 'IHDR') {
      return valido({ formato: 'png', largura: be32(bytes, 16), altura: be32(bytes, 20), orientacao: 1 })
    }
    if (bytes.length >= 10 && (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')) {
      return valido({ formato: 'gif', largura: le16(bytes, 6), altura: le16(bytes, 8), orientacao: 1 })
    }
    if (bytes.length >= 30 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return valido(webp(bytes))
    if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') return valido(heif(bytes))
  } catch {
    // cortado ou malformado: como desconhecido
  }
  return null
}

function jpeg(b: Uint8Array): Cabecalho | null {
  let i = 2
  let orientacao = 1
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null
    const marcador = b[i + 1]!
    if (marcador === 0xff) {
      i++
      continue
    }
    if (marcador === 0xd8 || (marcador >= 0xd0 && marcador <= 0xd7) || marcador === 0x01) {
      i += 2
      continue
    }
    if (marcador === 0xd9 || marcador === 0xda) return null // fim ou dados da imagem antes de um SOF
    const tamanho = be16(b, i + 2)
    if (tamanho < 2) return null
    const inicio = i + 4
    if (marcador === 0xe1 && inicio + 6 <= b.length && ascii(b, inicio, 4) === 'Exif') orientacao = orientacaoDoExif(b, inicio + 6, Math.min(b.length, i + 2 + tamanho)) ?? orientacao
    // SOF0–SOF15, menos DHT (C4), JPG (C8) e DAC (CC).
    if (marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
      if (inicio + 5 > b.length) return null
      return { formato: 'jpeg', altura: be16(b, inicio + 1), largura: be16(b, inicio + 3), orientacao }
    }
    i += 2 + tamanho
  }
  return null
}

function orientacaoDoExif(b: Uint8Array, tiff: number, fim: number): number | null {
  if (tiff + 8 > fim) return null
  const ordem = ascii(b, tiff, 2)
  if (ordem !== 'II' && ordem !== 'MM') return null
  const l16 = (i: number) => (ordem === 'II' ? le16(b, i) : be16(b, i))
  const l32 = (i: number) => (ordem === 'II' ? le32(b, i) : be32(b, i))
  const ifd = tiff + l32(tiff + 4)
  if (ifd + 2 > fim) return null
  const n = l16(ifd)
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12
    if (e + 12 > fim) return null
    if (l16(e) === 0x0112) {
      const v = l16(e + 8)
      return v >= 1 && v <= 8 ? v : null
    }
  }
  return null
}

function webp(b: Uint8Array): Cabecalho | null {
  const tipo = ascii(b, 12, 4)
  const d = 20
  if (tipo === 'VP8X') return { formato: 'webp', largura: le24(b, d + 4) + 1, altura: le24(b, d + 7) + 1, orientacao: 1 }
  if (tipo === 'VP8 ') {
    if (b[d + 3] !== 0x9d || b[d + 4] !== 0x01 || b[d + 5] !== 0x2a) return null
    return { formato: 'webp', largura: le16(b, d + 6) & 0x3fff, altura: le16(b, d + 8) & 0x3fff, orientacao: 1 }
  }
  if (tipo === 'VP8L') {
    if (b[d] !== 0x2f) return null
    const bits = le32(b, d + 1)
    return { formato: 'webp', largura: (bits & 0x3fff) + 1, altura: ((bits >>> 14) & 0x3fff) + 1, orientacao: 1 }
  }
  return null
}

/** HEIC/HEIF/AVIF: as caixas `ispe` (tamanho de cada imagem do arquivo) e `irot` (giro), procuradas na árvore `meta`. */
function heif(b: Uint8Array): Cabecalho | null {
  let maior: { largura: number; altura: number } | null = null
  let irot: number | null = null
  const CONTEINERES = new Set(['meta', 'iprp', 'ipco'])
  const andar = (inicio: number, fim: number, profundidade: number) => {
    let i = inicio
    while (i + 8 <= fim && profundidade < 6) {
      let tamanho = be32(b, i)
      const tipo = ascii(b, i + 4, 4)
      let cabeca = 8
      if (tamanho === 1) return // tamanho de 64 bits: só na mdat, depois do que importa
      if (tamanho === 0) tamanho = fim - i
      if (tamanho < cabeca || i + tamanho > fim) return
      if (tipo === 'ispe' && i + 20 <= fim) {
        const largura = be32(b, i + 12)
        const altura = be32(b, i + 16)
        if (!maior || largura * altura > maior.largura * maior.altura) maior = { largura, altura }
      } else if (tipo === 'irot' && i + 9 <= fim) {
        irot = b[i + 8]! & 3
      } else if (CONTEINERES.has(tipo)) {
        if (tipo === 'meta') cabeca += 4 // FullBox: versão e flags
        andar(i + cabeca, i + tamanho, profundidade + 1)
      }
      i += tamanho
    }
  }
  andar(0, b.length, 0)
  const m = maior as { largura: number; altura: number } | null
  if (!m) return null
  // irot: giro anti-horário em quartos de volta. 1 (90° anti-horário) = EXIF 8; 2 = EXIF 3; 3 (270°) = EXIF 6.
  const orientacao = irot === 1 ? 8 : irot === 2 ? 3 : irot === 3 ? 6 : 1
  return { formato: 'heic', largura: m.largura, altura: m.altura, orientacao }
}

/** O tamanho na tela, depois da orientação (5–8 trocam os lados). */
export function dimensoesOrientadas(c: { largura: number; altura: number; orientacao: number }): Tamanho {
  return c.orientacao >= 5 ? { largura: c.altura, altura: c.largura } : { largura: c.largura, altura: c.altura }
}

/** O tamanho com o lado maior em `lado` (nunca amplia; nunca zero). */
export function tamanhoAlvo(largura: number, altura: number, lado: number): Tamanho {
  const maior = Math.max(largura, altura)
  if (maior <= lado) return { largura, altura }
  const escala = lado / maior
  return largura >= altura
    ? { largura: lado, altura: Math.max(1, Math.round(altura * escala)) }
    : { largura: Math.max(1, Math.round(largura * escala)), altura: lado }
}

const POR_TIPO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/avif': 'avif',
  'image/tiff': 'tif',
  'image/bmp': 'bmp',
}

/** A extensão do original no Dropbox (`original.<ext>`): a do nome (1 a 5 letras/dígitos, minúsculas), a do tipo, ou "bin". */
export function extensaoDoOriginal(nome: string, tipo: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(nome)
  if (m) return m[1]!.toLowerCase()
  return POR_TIPO[tipo.toLowerCase()] ?? 'bin'
}
