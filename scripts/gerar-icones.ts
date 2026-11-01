/**
 * Gera os ícones do app (PNG) a partir da grade 19 x 11 do logo SKC (src/ui/Logo.tsx),
 * pixel a pixel, sem passar por nenhum rasterizador: cada quadrado da grade vira
 * `escala x escala` pixels pretos sobre um quadrado branco, em escala INTEIRA e com
 * margens iguais dos dois lados (decisão 21: pixel perfeito, sem suavização).
 *
 * Uso: `npm run icones` (grava em public/). Os testes (src/pwa/icones.test.ts) leem os PNG
 * gravados e conferem cada pixel.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

export const LARGURA_DA_GRADE = 19
export const ALTURA_DA_GRADE = 11

export interface Retangulo {
  x: number
  y: number
  w: number
  h: number
}

/** Os retângulos da grade, lidos do componente Logo (a fonte única do desenho). */
export function retangulosDoLogo(fonte: string): Retangulo[] {
  const achados = [...fonte.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" \/>/g)]
  if (achados.length === 0) throw new Error('Nenhum <rect> em Logo.tsx')
  return achados.map((m) => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) }))
}

export interface EspecDeIcone {
  arquivo: string
  /** Lado do quadrado, em pixels. */
  lado: number
  /** Pixels por quadrado da grade. */
  escala: number
}

/**
 * - 192 e 512: o logo ocupa a maior escala inteira que deixa margem (152 x 88 e 456 x 264);
 * - maskable 512: o logo inteiro dentro do círculo de segurança (raio de 40% do lado = 204,8 px).
 *   A escala 20 (380 x 220) deixaria os cantos a 219,5 px do centro, fora do círculo; a 18
 *   (342 x 198) ficam a 197,6 px;
 * - apple-touch-icon 180: o iOS aplica a própria máscara de cantos.
 */
export const ICONES: EspecDeIcone[] = [
  { arquivo: 'icon-192.png', lado: 192, escala: 8 },
  { arquivo: 'icon-512.png', lado: 512, escala: 24 },
  { arquivo: 'icon-512-maskable.png', lado: 512, escala: 18 },
  { arquivo: 'apple-touch-icon.png', lado: 180, escala: 8 },
]

/** Margens (esquerda/direita e acima/abaixo): inteiras e iguais dos dois lados. */
export function margens({ lado, escala }: EspecDeIcone): { x: number; y: number } {
  const x = (lado - LARGURA_DA_GRADE * escala) / 2
  const y = (lado - ALTURA_DA_GRADE * escala) / 2
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) throw new Error(`Margens não inteiras em ${lado} com escala ${escala}`)
  return { x, y }
}

/** Pixels em tons de cinza (8 bits): 0 = preto, 255 = branco. */
export function desenhar(espec: EspecDeIcone, retangulos: Retangulo[]): Uint8Array {
  const { x: mx, y: my } = margens(espec)
  const { lado, escala } = espec
  const pixels = new Uint8Array(lado * lado).fill(255)
  for (const r of retangulos) {
    for (let y = my + r.y * escala; y < my + (r.y + r.h) * escala; y++) {
      for (let x = mx + r.x * escala; x < mx + (r.x + r.w) * escala; x++) pixels[y * lado + x] = 0
    }
  }
  return pixels
}

function crc32(bytes: Uint8Array): number {
  let c = ~0
  for (const b of bytes) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function bloco(tipo: string, dados: Uint8Array): Buffer {
  const nome = Buffer.from(tipo, 'ascii')
  const corpo = Buffer.concat([nome, dados])
  const saida = Buffer.alloc(8 + dados.length + 4)
  saida.writeUInt32BE(dados.length, 0)
  corpo.copy(saida, 4)
  saida.writeUInt32BE(crc32(corpo), 8 + dados.length)
  return saida
}

/** PNG de tons de cinza, 8 bits, sem entrelaçamento e sem filtro. */
export function codificarPng(lado: number, pixels: Uint8Array): Buffer {
  const cabecalho = Buffer.alloc(13)
  cabecalho.writeUInt32BE(lado, 0)
  cabecalho.writeUInt32BE(lado, 4)
  cabecalho[8] = 8 // profundidade
  cabecalho[9] = 0 // tons de cinza
  const linhas = Buffer.alloc(lado * (lado + 1))
  for (let y = 0; y < lado; y++) {
    linhas[y * (lado + 1)] = 0 // filtro "nenhum"
    Buffer.from(pixels.buffer, pixels.byteOffset + y * lado, lado).copy(linhas, y * (lado + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', cabecalho),
    bloco('IDAT', deflateSync(linhas, { level: 9 })),
    bloco('IEND', new Uint8Array()),
  ])
}

export function gerar(pastaDeSaida: string, raizDoProjeto: string): string[] {
  const retangulos = retangulosDoLogo(readFileSync(join(raizDoProjeto, 'src/ui/Logo.tsx'), 'utf8'))
  mkdirSync(pastaDeSaida, { recursive: true })
  return ICONES.map((espec) => {
    const caminho = join(pastaDeSaida, espec.arquivo)
    writeFileSync(caminho, codificarPng(espec.lado, desenhar(espec, retangulos)))
    return caminho
  })
}

// Executado direto (`node scripts/gerar-icones.ts`): grava em public/.
if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const raiz = join(import.meta.dirname, '..')
  for (const c of gerar(join(raiz, 'public'), raiz)) console.log(c)
}
