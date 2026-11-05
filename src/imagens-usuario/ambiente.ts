/**
 * Os ambientes reais do processamento (processar.ts): o do worker (OffscreenCanvas) e o da página (<canvas>, com a
 * vez devolvida ao laço de eventos entre os passos). Não há teste no jsdom (ele não tem canvas): a e2e no Chromium
 * os exercita.
 */
import { ErroSemSuporte, type Ambiente, type Bitmap, type Quadro } from './processar'

type Contexto = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
type Superficie = { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Contexto }

const superficies = new WeakMap<Quadro, Superficie>()

/**
 * `createImageBitmap` com as opções; se o navegador recusa uma opção que não conhece (TypeError), tenta sem a
 * orientação e depois sem a redução (o quadro da tela reduz de qualquer jeito).
 */
async function decodificar(fonte: Blob, opcoes?: ImageBitmapOptions): Promise<Bitmap> {
  const tentativas: (ImageBitmapOptions | undefined)[] = [opcoes]
  if (opcoes?.imageOrientation) {
    const { imageOrientation: _, ...semOrientacao } = opcoes
    tentativas.push(semOrientacao)
  }
  tentativas.push(undefined)
  let ultimo: unknown
  for (const t of tentativas) {
    try {
      return t ? await createImageBitmap(fonte, t) : await createImageBitmap(fonte)
    } catch (erro) {
      ultimo = erro
      if (!(erro instanceof TypeError)) throw erro
    }
  }
  throw ultimo
}

function quadroDe(canvas: OffscreenCanvas | HTMLCanvasElement, paraBlob: (tipo: string, q: number) => Promise<Blob>): Quadro {
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false }) as Contexto | null
  if (!ctx) throw new ErroSemSuporte('canvas 2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const q: Quadro = {
    largura: canvas.width,
    altura: canvas.height,
    desenhar(fonte) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const outra = superficies.get(fonte as Quadro)
      ctx.drawImage((outra ? outra.canvas : fonte) as CanvasImageSource, 0, 0, canvas.width, canvas.height)
    },
    pixels: () => ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    codificar: paraBlob,
    liberar() {
      // Zerar o tamanho solta a memória do canvas na hora (sem esperar o coletor).
      canvas.width = 0
      canvas.height = 0
      superficies.delete(q)
    },
  }
  superficies.set(q, { canvas, ctx })
  return q
}

/** No worker: OffscreenCanvas e convertToBlob. Lança ErroSemSuporte se faltar algo (a página assume). */
export function ambienteDoWorker(): Ambiente {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') throw new ErroSemSuporte('OffscreenCanvas')
  if (typeof OffscreenCanvas.prototype.convertToBlob !== 'function') throw new ErroSemSuporte('convertToBlob')
  return {
    decodificar,
    quadro(largura, altura) {
      const canvas = new OffscreenCanvas(largura, altura)
      return quadroDe(canvas, (type, quality) => canvas.convertToBlob({ type, quality }))
    },
    ceder: async () => undefined,
  }
}

/** Devolve a vez ao laço de eventos (scheduler.yield onde houver; senão um setTimeout 0). */
function ceder(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  if (typeof s?.yield === 'function') return s.yield()
  return new Promise((ok) => setTimeout(ok, 0))
}

let daPagina: Ambiente | null = null

/** Na página: <canvas> e toBlob (assíncrono), cedendo a vez entre os passos. Um só por página (a sonda do WebP fica). */
export function ambienteDaPagina(): Ambiente {
  daPagina ??= {
    decodificar,
    quadro(largura, altura) {
      const canvas = document.createElement('canvas')
      canvas.width = largura
      canvas.height = altura
      return quadroDe(canvas, (type, quality) => new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new ErroSemSuporte(type))), type, quality)))
    },
    ceder,
  }
  return daPagina
}
