/**
 * O processamento de uma imagem escolhida (decisão 33; Foco 5: a foto de 12–48 MP do iPhone). O jsdom não tem canvas
 * nem createImageBitmap: o "ambiente" (decodificar, quadro, ceder) é trocado por um falso que registra cada passo, e a
 * lógica (tamanhos, decodificação reduzida, formatos, ordem dos passos) é testada como no navegador.
 */
import { ErroDeFormato, LADO_DA_MINIATURA, LADO_DA_TELA, MSG_FORMATO, processarCom, processarImagem, type Ambiente, type Bitmap, type Quadro } from './processar'

const u16 = (v: number) => [(v >> 8) & 255, v & 255]
const u32 = (v: number) => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255]

/** Um JPEG mínimo (SOI, EXIF com orientação, SOF0) seguido de bytes quaisquer: só o cabeçalho importa aqui. */
function jpeg(largura: number, altura: number, orientacao = 1, nome = 'IMG_0001.JPG'): File {
  const tiff = [77, 77, ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientacao), 0, 0, ...u32(0)]
  const app1 = [69, 120, 105, 102, 0, 0, ...tiff]
  const bytes = [0xff, 0xd8, 0xff, 0xe1, ...u16(app1.length + 2), ...app1, 0xff, 0xc0, ...u16(17), 8, ...u16(altura), ...u16(largura), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]
  return new File([new Uint8Array([...bytes, ...new Array(64).fill(7)])], nome, { type: 'image/jpeg' })
}

interface Registro {
  passos: string[]
  decodificacoes: { opcoes: ImageBitmapOptions | undefined }[]
  bitmapsAbertos: number
  quadrosAbertos: number
  maiorQuadro: number
  pixelsLidos: { largura: number; altura: number }[]
  codificacoes: { tipo: string; largura: number; altura: number }[]
}

/**
 * Um ambiente falso. `natural`: o tamanho que a imagem tem depois de orientada (o que o navegador entregaria sem
 * redução). `webp`: se o "navegador" sabe gravar WebP (o Safari antigo devolve PNG). `padrao`: o desenho que os pixels
 * mostram (linhas pretas em papel branco, ou um degradê).
 */
function ambienteFalso({ natural = { largura: 8000, altura: 6000 }, webp = true, padrao = 'linhas', falhaAoDecodificar = false } = {}) {
  const r: Registro = { passos: [], decodificacoes: [], bitmapsAbertos: 0, quadrosAbertos: 0, maiorQuadro: 0, pixelsLidos: [], codificacoes: [] }
  const amb: Ambiente = {
    async decodificar(_fonte, opcoes) {
      r.passos.push('decodificar')
      r.decodificacoes.push({ opcoes })
      if (falhaAoDecodificar) throw new DOMException('The source image could not be decoded.', 'InvalidStateError')
      let { largura, altura } = natural
      if (opcoes?.resizeWidth) {
        altura = Math.round((altura * opcoes.resizeWidth) / largura)
        largura = opcoes.resizeWidth
      }
      r.bitmapsAbertos++
      const b: Bitmap = {
        width: largura,
        height: altura,
        close: () => {
          r.bitmapsAbertos--
        },
      }
      return b
    },
    quadro(largura, altura) {
      r.passos.push(`quadro ${largura}x${altura}`)
      r.quadrosAbertos++
      r.maiorQuadro = Math.max(r.maiorQuadro, largura * altura)
      const q: Quadro = {
        largura,
        altura,
        desenhar: () => void r.passos.push(`desenhar ${largura}x${altura}`),
        pixels: () => {
          r.passos.push('pixels')
          r.pixelsLidos.push({ largura, altura })
          const px = new Uint8ClampedArray(largura * altura * 4)
          for (let y = 0; y < altura; y++)
            for (let x = 0; x < largura; x++) {
              const v = padrao === 'linhas' ? (x % 20 === 0 || y % 20 === 0 ? 0 : 255) : Math.round(40 + (180 * x) / largura)
              px.set([v, v, v, 255], (y * largura + x) * 4)
            }
          return px
        },
        async codificar(tipo, qualidade) {
          r.passos.push(`codificar ${tipo} ${qualidade}`)
          r.codificacoes.push({ tipo, largura, altura })
          const real = tipo === 'image/webp' && !webp ? 'image/png' : tipo
          return new Blob([new Uint8Array(largura % 251)], { type: real })
        },
        liberar: () => {
          r.quadrosAbertos--
        },
      }
      return q
    },
    async ceder() {
      r.passos.push('ceder')
    },
  }
  return { amb, r }
}

describe('processarCom: a foto grande é reduzida sem ser decodificada inteira', () => {
  it('8000×6000: o navegador decodifica já reduzida (resizeWidth 1600, orientação do EXIF), uma vez só', async () => {
    const { amb, r } = ambienteFalso()
    const res = await processarCom(amb, jpeg(8000, 6000))
    expect(r.decodificacoes).toHaveLength(1)
    expect(r.decodificacoes[0]!.opcoes).toMatchObject({ resizeWidth: 1600, resizeQuality: 'high', imageOrientation: 'from-image' })
    // Nenhum quadro do tamanho da foto: o maior é a tela (1600 × 1200).
    expect(r.maiorQuadro).toBe(1600 * 1200)
    expect([res.largura, res.altura]).toEqual([1600, 1200])
    expect([res.miniaturaLargura, res.miniaturaAltura]).toEqual([320, 240])
  })

  it('foto do iPhone em pé (4032×3024 com orientação 6): pede a largura já orientada (1200) e sai 1200×1600', async () => {
    const { amb, r } = ambienteFalso({ natural: { largura: 3024, altura: 4032 } })
    const res = await processarCom(amb, jpeg(4032, 3024, 6))
    expect(r.decodificacoes[0]!.opcoes).toMatchObject({ resizeWidth: 1200, imageOrientation: 'from-image' })
    expect([res.largura, res.altura]).toEqual([1200, 1600])
    expect(res.originalLargura).toBe(3024)
    expect(res.originalAltura).toBe(4032)
  })

  it('imagem pequena (800×600): decodifica sem redimensionar e não amplia', async () => {
    const { amb, r } = ambienteFalso({ natural: { largura: 800, altura: 600 } })
    const res = await processarCom(amb, jpeg(800, 600))
    expect(r.decodificacoes[0]!.opcoes?.resizeWidth).toBeUndefined()
    expect([res.largura, res.altura]).toEqual([800, 600])
  })

  it('cabeçalho desconhecido: decodifica como vier e reduz no quadro (a tela nunca passa de 1600)', async () => {
    const { amb, r } = ambienteFalso({ natural: { largura: 3000, altura: 2000 } })
    const res = await processarCom(amb, new File([new Uint8Array([1, 2, 3, 4])], 'x.bmp', { type: 'image/bmp' }))
    expect(r.decodificacoes[0]!.opcoes?.resizeWidth).toBeUndefined()
    expect([res.largura, res.altura]).toEqual([1600, 1067])
  })

  it('libera cada bitmap (close) e cada quadro', async () => {
    const { amb, r } = ambienteFalso()
    await processarCom(amb, jpeg(8000, 6000))
    expect(r.bitmapsAbertos).toBe(0)
    expect(r.quadrosAbertos).toBe(0)
  })

  it('o original é o próprio arquivo, byte a byte', async () => {
    const { amb } = ambienteFalso()
    const arquivo = jpeg(8000, 6000)
    const res = await processarCom(amb, arquivo)
    expect(res.original).toBe(arquivo)
    expect(res.extensao).toBe('jpg')
  })
})

describe('processarCom: formatos', () => {
  it('tela em WebP 0,82 e miniatura de 320 px no mesmo formato', async () => {
    const { amb, r } = ambienteFalso()
    const res = await processarCom(amb, jpeg(8000, 6000))
    expect(res.formato).toBe('webp')
    expect(res.tela.type).toBe('image/webp')
    expect(res.miniatura.type).toBe('image/webp')
    expect(r.passos).toContain('codificar image/webp 0.82')
    expect(LADO_DA_TELA).toBe(1600)
    expect(LADO_DA_MINIATURA).toBe(320)
  })

  it('navegador que não grava WebP (o Safari antigo devolve PNG): detecta e grava JPEG 0,85; o formato vai no resultado', async () => {
    const { amb, r } = ambienteFalso({ webp: false })
    const res = await processarCom(amb, jpeg(8000, 6000))
    expect(res.formato).toBe('jpeg')
    expect(res.tela.type).toBe('image/jpeg')
    expect(res.miniatura.type).toBe('image/jpeg')
    expect(r.passos).toContain('codificar image/jpeg 0.85')
    // A miniatura já vai direto em JPEG (o teste do WebP não se repete).
    expect(r.passos.filter((p) => p.startsWith('codificar image/webp'))).toHaveLength(1)
  })

  it('revisão 1 (M9): o WebP é testado num quadro de 1×1, uma vez por ambiente; a tela nunca é gravada em PNG à toa', async () => {
    const { amb, r } = ambienteFalso({ webp: false })
    await processarCom(amb, jpeg(8000, 6000))
    expect(r.codificacoes.filter((c) => c.tipo === 'image/webp')).toEqual([{ tipo: 'image/webp', largura: 1, altura: 1 }])
    expect(r.codificacoes.filter((c) => c.largura > 1).map((c) => c.tipo)).toEqual(['image/jpeg', 'image/jpeg'])
    await processarCom(amb, jpeg(8000, 6000))
    expect(r.codificacoes.filter((c) => c.tipo === 'image/webp')).toHaveLength(1)
    const comWebp = ambienteFalso({ webp: true })
    await processarCom(comWebp.amb, jpeg(8000, 6000))
    expect(comWebp.r.codificacoes.map((c) => `${c.tipo} ${c.largura}x${c.altura}`)).toEqual(['image/webp 1x1', 'image/webp 1600x1200', 'image/webp 320x240'])
    expect(r.quadrosAbertos).toBe(0)
  })

  it('o que não decodifica (HEIC no Chrome, arquivo estragado) dá ErroDeFormato com a mensagem em português', async () => {
    const { amb } = ambienteFalso({ falhaAoDecodificar: true })
    const erro = await processarCom(amb, new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99])], 'IMG_2041.HEIC', { type: 'image/heic' })).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroDeFormato)
    expect((erro as Error).message).toBe(MSG_FORMATO)
    expect(MSG_FORMATO).toMatch(/^Este formato não abre neste aparelho/)
  })
})

describe('processarCom: o modo sugerido (a regra do pipeline) e a thread livre', () => {
  it('linhas pretas em papel branco: traco; degradê: tons', async () => {
    const a = ambienteFalso({ padrao: 'linhas' })
    expect((await processarCom(a.amb, jpeg(8000, 6000))).modoSugerido).toBe('traco')
    const b = ambienteFalso({ padrao: 'degrade' })
    const res = await processarCom(b.amb, jpeg(8000, 6000))
    expect(res.modoSugerido).toBe('tons')
    expect(Object.keys(res.metricas).sort()).toEqual(['extremes', 'grey_core'])
  })

  it('os pixels medidos são de uma cópia de no máximo 800 px (nunca da tela inteira)', async () => {
    const { amb, r } = ambienteFalso()
    await processarCom(amb, jpeg(8000, 6000))
    expect(r.pixelsLidos).toEqual([{ largura: 800, altura: 600 }])
  })

  it('cede a thread entre os passos pesados: nenhum passo segue o outro sem uma volta ao laço de eventos', async () => {
    const { amb, r } = ambienteFalso()
    await processarCom(amb, jpeg(8000, 6000))
    const pesados = r.passos.map((p, i) => [p, i] as const).filter(([p]) => /^(decodificar|codificar|pixels)/.test(p))
    expect(pesados.length).toBeGreaterThanOrEqual(4)
    for (let k = 1; k < pesados.length; k++) {
      const entre = r.passos.slice(pesados[k - 1]![1] + 1, pesados[k]![1])
      expect(entre, `${pesados[k - 1]![0]} → ${pesados[k]![0]}`).toContain('ceder')
    }
    // E depois do último (a medição do modo vem a seguir, no mesmo passo curto).
    expect(r.passos.slice(pesados.at(-1)![1] + 1)).toContain('ceder')
  })
})

describe('processarImagem', () => {
  it('sem Worker (jsdom), usa o ambiente dado na thread principal', async () => {
    const { amb } = ambienteFalso({ natural: { largura: 1000, altura: 500 } })
    const res = await processarImagem(jpeg(1000, 500), { ambiente: amb })
    expect([res.largura, res.altura]).toEqual([1000, 500])
  })
})
