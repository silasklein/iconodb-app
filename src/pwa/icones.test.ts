import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { ALTURA_DA_GRADE, ICONES, LARGURA_DA_GRADE, margens, retangulosDoLogo } from '../../scripts/gerar-icones.ts'

const RAIZ = join(import.meta.dirname, '..', '..')

/** Lê um PNG de tons de cinza de 8 bits (sem entrelaçamento), como o gerador grava: devolve o lado e os pixels. */
function lerPng(caminho: string): { lado: number; altura: number; pixels: Uint8Array } {
  const b = readFileSync(caminho)
  expect([...b.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  let pos = 8
  let ihdr: Buffer | null = null
  const dados: Buffer[] = []
  while (pos < b.length) {
    const tamanho = b.readUInt32BE(pos)
    const tipo = b.toString('ascii', pos + 4, pos + 8)
    const corpo = b.subarray(pos + 8, pos + 8 + tamanho)
    if (tipo === 'IHDR') ihdr = corpo
    if (tipo === 'IDAT') dados.push(corpo)
    pos += 12 + tamanho
  }
  if (!ihdr) throw new Error('PNG sem IHDR')
  const lado = ihdr.readUInt32BE(0)
  const altura = ihdr.readUInt32BE(4)
  expect([ihdr[8], ihdr[9], ihdr[10], ihdr[11], ihdr[12]]).toEqual([8, 0, 0, 0, 0]) // 8 bits, cinza, sem entrelaçamento
  const bruto = inflateSync(Buffer.concat(dados))
  const pixels = new Uint8Array(lado * altura)
  for (let y = 0; y < altura; y++) {
    expect(bruto[y * (lado + 1)], 'filtro da linha').toBe(0)
    pixels.set(bruto.subarray(y * (lado + 1) + 1, (y + 1) * (lado + 1)), y * lado)
  }
  return { lado, altura, pixels }
}

const retangulos = retangulosDoLogo(readFileSync(join(RAIZ, 'src/ui/Logo.tsx'), 'utf8'))

describe('ícones do app: pixel perfeito', () => {
  it('a grade lida do Logo é a 19 x 11', () => {
    expect(retangulos).toHaveLength(7)
    expect(Math.max(...retangulos.map((r) => r.x + r.w))).toBe(LARGURA_DA_GRADE)
    expect(Math.max(...retangulos.map((r) => r.y + r.h))).toBe(ALTURA_DA_GRADE)
  })

  it('os tamanhos e as escalas pedidos', () => {
    expect(ICONES.map((i) => [i.arquivo, i.lado, i.escala])).toEqual([
      ['icon-192.png', 192, 8],
      ['icon-512.png', 512, 24],
      ['icon-512-maskable.png', 512, 18],
      ['apple-touch-icon.png', 180, 8],
    ])
    expect(margens(ICONES[0]!)).toEqual({ x: 20, y: 52 })
    expect(margens(ICONES[1]!)).toEqual({ x: 28, y: 124 })
    expect(margens(ICONES[3]!)).toEqual({ x: 14, y: 46 })
  })

  describe.each(ICONES)('$arquivo', (espec) => {
    const png = lerPng(join(RAIZ, 'public', espec.arquivo))
    const { x: mx, y: my } = margens(espec)

    it(`é ${espec.lado} x ${espec.lado}`, () => {
      expect([png.lado, png.altura]).toEqual([espec.lado, espec.lado])
    })

    it('só tem preto puro e branco puro (sem suavização)', () => {
      const valores = new Set(png.pixels)
      expect([...valores].sort((a, b) => a - b)).toEqual([0, 255])
    })

    it(`cada quadrado da grade é um bloco de ${espec.escala} x ${espec.escala} pixels pretos, e o resto é branco`, () => {
      const esperado = new Uint8Array(espec.lado * espec.lado).fill(255)
      for (let gy = 0; gy < ALTURA_DA_GRADE; gy++) {
        for (let gx = 0; gx < LARGURA_DA_GRADE; gx++) {
          const preto = retangulos.some((r) => gx >= r.x && gx < r.x + r.w && gy >= r.y && gy < r.y + r.h)
          if (!preto) continue
          for (let dy = 0; dy < espec.escala; dy++) for (let dx = 0; dx < espec.escala; dx++) esperado[(my + gy * espec.escala + dy) * espec.lado + mx + gx * espec.escala + dx] = 0
        }
      }
      expect(png.pixels).toEqual(esperado)
    })

    it('as margens são inteiras e iguais dos dois lados', () => {
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (let y = 0; y < espec.lado; y++) {
        for (let x = 0; x < espec.lado; x++) {
          if (png.pixels[y * espec.lado + x] !== 0) continue
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
        }
      }
      expect(minX).toBe(mx)
      expect(espec.lado - 1 - maxX).toBe(mx)
      expect(minY).toBe(my)
      expect(espec.lado - 1 - maxY).toBe(my)
    })
  })

  it('o ícone "maskable" cabe no círculo de segurança (raio de 40% do lado)', () => {
    const espec = ICONES.find((i) => i.arquivo === 'icon-512-maskable.png')!
    const { x, y } = margens(espec)
    const meio = espec.lado / 2
    const raio = espec.lado * 0.4
    for (const [cx, cy] of [
      [x, y],
      [espec.lado - x, y],
      [x, espec.lado - y],
      [espec.lado - x, espec.lado - y],
    ] as const) expect(Math.hypot(cx - meio, cy - meio)).toBeLessThanOrEqual(raio)
  })
})
