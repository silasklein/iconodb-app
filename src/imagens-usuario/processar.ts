/**
 * O processamento de uma imagem que a pessoa escolheu (decisão 33): a versão de TELA (lado maior 1600 px, WebP 0,82),
 * a MINIATURA (320 px, mesmo formato), o ORIGINAL como veio (o próprio arquivo, byte a byte) e o MODO sugerido pela
 * regra do pipeline (`modo.ts`).
 *
 * Foco 5 (a foto de 12–48 MP do iPhone, ou 8000 × 6000):
 * - o tamanho e a orientação vêm do cabeçalho (`cabecalho.ts`), sem decodificar; o navegador decodifica JÁ REDUZIDA,
 *   com `createImageBitmap(arquivo, {resizeWidth, resizeQuality: 'high', imageOrientation: 'from-image'})`. O Chrome e o
 *   Safari reduzem na decodificação quando o formato permite (o JPEG decodifica em 1/2, 1/4, 1/8); onde não permite,
 *   a imagem inteira existe só dentro do decodificador do navegador, nunca num canvas nosso. O maior quadro que o
 *   app cria é a tela (1600 × 1200 = 7,7 MB);
 * - só um valor de redução é passado (`resizeWidth`): se um navegador o aplicasse antes de girar pelo EXIF, a
 *   proporção continuaria certa e o quadro da tela corrige o tamanho;
 * - cabeçalho desconhecido: decodifica como vier e reduz no quadro (raro; os formatos de foto são todos lidos);
 * - cada bitmap é fechado (`close()`) e cada quadro liberado assim que deixa de servir;
 * - o trabalho roda num Worker com OffscreenCanvas (`processar.worker.ts`). Sem isso (Safari anterior ao 16.4), roda
 *   na thread principal em passos curtos: entre dois passos pesados, `ceder()` devolve a vez ao laço de eventos
 *   (a decodificação e a gravação do canvas já são assíncronas no navegador).
 *
 * WebP: o Safari antigo, pedido WebP, devolve PNG sem avisar. Um quadro de 1×1 testa uma vez por ambiente; sem WebP,
 * grava JPEG 0,85 (tela e miniatura); o tipo de cada blob ainda é conferido. O formato real vai no resultado (e daí no evento e no nome dos arquivos).
 *
 * Fundo branco: o quadro é pintado de branco antes de desenhar (a transparência de um PNG vira papel, e o JPEG não
 * fica preto).
 */
import { dimensoesOrientadas, extensaoDoOriginal, lerCabecalho, tamanhoAlvo } from './cabecalho'
import { cinzaDeRgba, classificarModo, type Metricas, type Modo } from './modo'

export const LADO_DA_TELA = 1600
export const LADO_DA_MINIATURA = 320
/** O lado da cópia em que o modo é medido (o pipeline mede a tela reduzida a 400 com LANCZOS; aqui, 800 → 400). */
export const LADO_DA_MEDICAO = 800
export const QUALIDADE_WEBP = 0.82
export const QUALIDADE_JPEG = 0.85
/** Quanto do começo do arquivo é lido para achar o tamanho (o EXIF e o SOF de um JPEG, as caixas de um HEIC). */
const INICIO_LIDO = 1 << 20

export const MSG_FORMATO = 'Este formato não abre neste aparelho. Escolha uma foto em JPEG ou PNG (no iPhone, pela opção Fotos, a foto vem em JPEG).'

/** A imagem não decodifica neste navegador (HEIC fora do Safari, arquivo estragado, formato desconhecido). */
export class ErroDeFormato extends Error {
  constructor() {
    super(MSG_FORMATO)
    this.name = 'ErroDeFormato'
  }
}

/** O ambiente não tem o que o processamento precisa (o worker devolve isto; a thread principal assume). */
export class ErroSemSuporte extends Error {
  constructor(o_que: string) {
    super(`sem suporte: ${o_que}`)
    this.name = 'ErroSemSuporte'
  }
}

export type FormatoDaTela = 'webp' | 'jpeg'

export interface ImagemProcessada {
  tela: Blob
  miniatura: Blob
  /** O arquivo como veio. */
  original: Blob
  /** A extensão do original no Dropbox (`original.<ext>`). */
  extensao: string
  nome: string
  formato: FormatoDaTela
  modoSugerido: Modo
  metricas: Metricas
  /** A tela. */
  largura: number
  altura: number
  miniaturaLargura: number
  miniaturaAltura: number
  /** O original, já orientado (null se o cabeçalho não disse). */
  originalLargura: number | null
  originalAltura: number | null
}

/** O que o processamento usa de um ImageBitmap. */
export interface Bitmap {
  readonly width: number
  readonly height: number
  close(): void
}

/** Um canvas (OffscreenCanvas no worker; <canvas> na página). */
export interface Quadro {
  readonly largura: number
  readonly altura: number
  /** Pinta de branco e desenha a fonte esticada no quadro inteiro. */
  desenhar(fonte: Bitmap | Quadro): void
  pixels(): Uint8ClampedArray
  codificar(tipo: string, qualidade: number): Promise<Blob>
  liberar(): void
}

export interface Ambiente {
  decodificar(fonte: Blob, opcoes?: ImageBitmapOptions): Promise<Bitmap>
  quadro(largura: number, altura: number): Quadro
  /** Devolve a vez ao laço de eventos (na thread principal); no worker, nada. */
  ceder(): Promise<void>
}

/**
 * O navegador grava WebP? Testado UMA vez por ambiente, num quadro de 1×1 (o Safari antigo, pedido WebP, devolve PNG:
 * testar com a tela inteira gravaria um PNG de 1600 px à toa). Revisão 1, M9.
 */
const sondas = new WeakMap<Ambiente, Promise<FormatoDaTela>>()
function formatoDoAmbiente(amb: Ambiente): Promise<FormatoDaTela> {
  let s = sondas.get(amb)
  if (!s) {
    s = (async () => {
      const q = amb.quadro(1, 1)
      try {
        return (await q.codificar('image/webp', QUALIDADE_WEBP)).type === 'image/webp' ? 'webp' : 'jpeg'
      } catch {
        return 'jpeg'
      } finally {
        q.liberar()
      }
    })()
    sondas.set(amb, s)
  }
  return s
}

async function codificarNaTela(q: Quadro, formato: FormatoDaTela): Promise<{ blob: Blob; formato: FormatoDaTela }> {
  if (formato === 'webp') {
    const blob = await q.codificar('image/webp', QUALIDADE_WEBP)
    // A sonda disse WebP; se ainda assim não veio WebP, grava JPEG (nunca um formato que o nome do arquivo não diz).
    if (blob.type === 'image/webp') return { blob, formato: 'webp' }
  }
  const blob = await q.codificar('image/jpeg', QUALIDADE_JPEG)
  if (blob.type !== 'image/jpeg') throw new ErroSemSuporte('JPEG')
  return { blob, formato: 'jpeg' }
}

/** O processamento, num ambiente dado (o worker, a página, ou um falso nos testes). */
export async function processarCom(amb: Ambiente, arquivo: File | Blob): Promise<ImagemProcessada> {
  const nome = arquivo instanceof File ? arquivo.name : ''
  const formatoSuportado = await formatoDoAmbiente(amb)
  await amb.ceder()
  const cabecalho = lerCabecalho(new Uint8Array(await arquivo.slice(0, INICIO_LIDO).arrayBuffer()))
  const orientada = cabecalho ? dimensoesOrientadas(cabecalho) : null

  const opcoes: ImageBitmapOptions = { imageOrientation: 'from-image' }
  if (orientada && Math.max(orientada.largura, orientada.altura) > LADO_DA_TELA) {
    opcoes.resizeWidth = tamanhoAlvo(orientada.largura, orientada.altura, LADO_DA_TELA).largura
    opcoes.resizeQuality = 'high'
  }
  let bitmap: Bitmap
  try {
    bitmap = await amb.decodificar(arquivo, opcoes)
  } catch (erro) {
    if (erro instanceof ErroSemSuporte) throw erro
    throw new ErroDeFormato()
  }
  await amb.ceder()

  const quadros: Quadro[] = []
  const novoQuadro = (l: number, a: number) => {
    const q = amb.quadro(l, a)
    quadros.push(q)
    return q
  }
  try {
    let tela: Quadro
    try {
      const t = tamanhoAlvo(bitmap.width, bitmap.height, LADO_DA_TELA)
      tela = novoQuadro(t.largura, t.altura)
      tela.desenhar(bitmap)
    } finally {
      bitmap.close()
    }
    const { blob: telaBlob, formato } = await codificarNaTela(tela, formatoSuportado)
    await amb.ceder()

    const m = tamanhoAlvo(tela.largura, tela.altura, LADO_DA_MINIATURA)
    const mini = novoQuadro(m.largura, m.altura)
    mini.desenhar(tela)
    const { blob: miniBlob } = await codificarNaTela(mini, formato)
    await amb.ceder()

    const c = tamanhoAlvo(tela.largura, tela.altura, LADO_DA_MEDICAO)
    const medir = novoQuadro(c.largura, c.altura)
    medir.desenhar(tela)
    const px = medir.pixels()
    await amb.ceder()
    const { modo, metricas } = classificarModo(cinzaDeRgba(px, c.largura, c.altura))

    return {
      tela: telaBlob,
      miniatura: miniBlob,
      original: arquivo,
      extensao: extensaoDoOriginal(nome, arquivo.type),
      nome,
      formato,
      modoSugerido: modo,
      metricas,
      largura: tela.largura,
      altura: tela.altura,
      miniaturaLargura: m.largura,
      miniaturaAltura: m.altura,
      originalLargura: orientada?.largura ?? null,
      originalAltura: orientada?.altura ?? null,
    }
  } finally {
    for (const q of quadros) q.liberar()
  }
}

// ---------------------------------------------------------------------------------------------------- no navegador

interface Pedido {
  arquivo: File | Blob
}
export type RespostaDoWorker = { ok: ImagemProcessada } | { erro: { nome: string; mensagem: string } }

/** O worker existe e tem OffscreenCanvas (o próprio worker confere o resto e responde "sem suporte" se faltar). */
function podeUsarWorker(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
}

function noWorker(arquivo: File | Blob): Promise<ImagemProcessada> {
  return new Promise((ok, falha) => {
    const worker = new Worker(new URL('./processar.worker.ts', import.meta.url), { type: 'module' })
    const fim = () => worker.terminate()
    worker.onmessage = (e: MessageEvent<RespostaDoWorker>) => {
      fim()
      const r = e.data
      if ('ok' in r) return ok({ ...r.ok, original: arquivo })
      if (r.erro.nome === 'ErroDeFormato') return falha(new ErroDeFormato())
      if (r.erro.nome === 'ErroSemSuporte') return falha(new ErroSemSuporte(r.erro.mensagem))
      falha(new Error(r.erro.mensagem))
    }
    worker.onerror = (e) => {
      fim()
      e.preventDefault()
      falha(new ErroSemSuporte(e.message || 'worker'))
    }
    worker.postMessage({ arquivo } satisfies Pedido)
  })
}

/**
 * Processa a imagem: num worker quando há OffscreenCanvas; senão (ou se o worker não dá conta) na thread principal,
 * em passos curtos. `ambiente` troca o ambiente (testes).
 */
export async function processarImagem(arquivo: File | Blob, opcoes: { ambiente?: Ambiente } = {}): Promise<ImagemProcessada> {
  if (opcoes.ambiente) return processarCom(opcoes.ambiente, arquivo)
  if (podeUsarWorker()) {
    try {
      return await noWorker(arquivo)
    } catch (erro) {
      if (!(erro instanceof ErroSemSuporte)) throw erro
    }
  }
  const { ambienteDaPagina } = await import('./ambiente')
  return processarCom(ambienteDaPagina(), arquivo)
}
