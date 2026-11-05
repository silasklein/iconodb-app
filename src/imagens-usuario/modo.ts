/**
 * Modo de exibição de uma imagem do usuário (decisão 33): `traco` (desenho de traço, mostrado INVERTIDO sobre o painel
 * preto, como os desenhos do livro) ou `tons` (foto ou impressão tonal, mostrada como está).
 *
 * Porta FIEL de `iconodb/images/display.py` (`classify_display`, repositório privado): os mesmos limiares, a mesma
 * redução (o `thumbnail((400, 400), LANCZOS)` do Pillow, com o `reduce` inteiro antes, pelo `reducing_gap` 2,0) e as
 * mesmas duas métricas:
 * - `extremes`: fração de pixels extremos (< 60 ou > 200). Desenho de traço é papel branco com tinta preta; a
 *   impressão tonal tem muito tom médio. Abaixo de `EXTREMOS_MIN`: `tons`.
 * - `grey_core`: fração coberta por cinza médio (60–200) que sobrevive a `EROSOES` erosões 3×3 (a borda conta como
 *   fora). A borda de um traço, o pontilhado e a hachura espaçada dão cinza só em faixas finas, que a erosão apaga; a
 *   área de cinza chapado (ou a hachura fina demais, que na redução vira cinza) sobra. Acima de `CINZA_MAX`: `tons`.
 * No limiar exato, `tons` (não inverter é o erro mais seguro). O teste (`modo.test.ts`) usa as mesmas imagens
 * sintéticas do teste do pipeline e confere o modo e as métricas tiradas do Python.
 *
 * Funções puras, sem DOM: rodam no worker, na thread principal e no Node. Quem chama entrega a imagem em tons de
 * cinza (`cinzaDeRgba` converte o RGBA de um canvas com a fórmula do Pillow).
 */

export type Modo = 'traco' | 'tons'

export const LADO = 400
export const ESCURO = 60
export const CLARO = 200
export const EXTREMOS_MIN = 0.6
export const EROSOES = 2
export const CINZA_MAX = 0.03

export interface ImagemCinza {
  largura: number
  altura: number
  /** Um byte por pixel, linha a linha. */
  px: Uint8Array
}

/** As métricas com os nomes do pipeline (`extremes`, `grey_core`), frações de 0 a 1 com 4 casas. */
export interface Metricas {
  extremes: number
  grey_core: number
}

/** RGBA (o `getImageData` do canvas) → L do Pillow: `(R·19595 + G·38470 + B·7471 + 0x8000) >> 16`. O alfa é ignorado. */
export function cinzaDeRgba(rgba: ArrayLike<number>, largura: number, altura: number): ImagemCinza {
  const n = largura * altura
  const px = new Uint8Array(n)
  for (let i = 0, j = 0; i < n; i++, j += 4) px[i] = (rgba[j]! * 19595 + rgba[j + 1]! * 38470 + rgba[j + 2]! * 7471 + 0x8000) >>> 16
  return { largura, altura, px }
}

/**
 * O tamanho que o `Image.thumbnail((lado, lado))` do Pillow escolhe (`preserve_aspect_ratio`); null se a imagem já
 * cabe (o Pillow não mexe nela).
 */
export function tamanhoDaMiniaturaPil(largura: number, altura: number, lado = LADO): [number, number] | null {
  let x = lado
  let y = lado
  if (x >= largura && y >= altura) return null
  const aspecto = largura / altura
  const arredondar = (numero: number, chave: (n: number) => number) => {
    const a = Math.floor(numero)
    const b = Math.ceil(numero)
    // min(floor, ceil, key=chave): no empate, o primeiro (floor), como o min do Python.
    return Math.max(chave(b) < chave(a) ? b : a, 1)
  }
  if (x / y >= aspecto) x = arredondar(y * aspecto, (n) => Math.abs(aspecto - n / y))
  else y = arredondar(x / aspecto, (n) => (n === 0 ? 0 : Math.abs(aspecto - x / n)))
  return [x, y]
}

// ---------------------------------------------------------------------------------------------------- Pillow: reduce

/**
 * `division_UINT32(divisor, 8)` do Reduce.c: `(UINT32)(4294967296.0f / (float)(256 · divisor))`, em float de 32 bits
 * (por isso o `Math.fround`). Para divisores que não são potência de 2 o resultado fica 1 abaixo da divisão exata, e
 * isso muda alguns pixels (fator 3, por exemplo): por isso a conta é a mesma, não uma equivalente.
 */
const multiplicador = (divisor: number) => Math.trunc(Math.fround(4294967296 / Math.fround(256 * divisor)))
const UINT32 = 2 ** 32

/**
 * `Image.reduce((fx, fy))` do Pillow para L: média de cada bloco fx × fy, arredondada como o Reduce.c
 * (`((soma + n/2) · multiplicador) >> 24`); o último bloco de cada linha e coluna pode ser menor.
 */
export function reduzirPil(img: ImagemCinza, fx: number, fy: number): ImagemCinza {
  const largura = Math.ceil(img.largura / fx)
  const altura = Math.ceil(img.altura / fy)
  const px = new Uint8Array(largura * altura)
  for (let yy = 0; yy < altura; yy++) {
    const y0 = yy * fy
    const y1 = Math.min(y0 + fy, img.altura)
    for (let xx = 0; xx < largura; xx++) {
      const x0 = xx * fx
      const x1 = Math.min(x0 + fx, img.largura)
      let soma = 0
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) soma += img.px[y * img.largura + x]!
      const n = (y1 - y0) * (x1 - x0)
      // `((amend + soma) * multiplier) >> 24` em UINT32 (com o estouro do C, que aqui não chega a acontecer).
      px[yy * largura + xx] = Math.floor((((soma + Math.floor(n / 2)) * multiplicador(n)) % UINT32) / 2 ** 24)
    }
  }
  return { largura, altura, px }
}

// ---------------------------------------------------------------------------------------------------- Pillow: LANCZOS

const BITS = 32 - 8 - 2 // PRECISION_BITS do Resample.c
const APOIO_LANCZOS = 3

function sinc(x: number): number {
  if (x === 0) return 1
  const t = x * Math.PI
  return Math.sin(t) / t
}
const lanczos = (x: number) => (x >= -3 && x < 3 ? sinc(x) * sinc(x / 3) : 0)

interface Coeficientes {
  tamanho: number
  limites: Int32Array // (início, quantos) por pixel de saída
  pesos: Int32Array // tamanho × saída, inteiros em ponto fixo (normalize_coeffs_8bpc)
}

/** `precompute_coeffs` + `normalize_coeffs_8bpc` do Resample.c. */
function coeficientes(entrada: number, in0: number, in1: number, saida: number): Coeficientes {
  // A caixa chega em float de 32 bits (`float box[4]` do ImagingResample); a conta da escala, em double.
  const escala = (Math.fround(in1) - Math.fround(in0)) / saida
  const escalaDoFiltro = Math.max(escala, 1)
  const apoio = APOIO_LANCZOS * escalaDoFiltro
  const tamanho = Math.ceil(apoio) * 2 + 1
  const limites = new Int32Array(saida * 2)
  const pesos = new Int32Array(saida * tamanho)
  const k = new Float64Array(tamanho)
  for (let xx = 0; xx < saida; xx++) {
    const centro = Math.fround(in0) + (xx + 0.5) * escala
    const ss = 1 / escalaDoFiltro
    let xmin = Math.trunc(centro - apoio + 0.5)
    if (xmin < 0) xmin = 0
    let xmax = Math.trunc(centro + apoio + 0.5)
    if (xmax > entrada) xmax = entrada
    xmax -= xmin
    let ww = 0
    k.fill(0)
    for (let x = 0; x < xmax; x++) {
      const w = lanczos((x + xmin - centro + 0.5) * ss)
      k[x] = w
      ww += w
    }
    for (let x = 0; x < xmax; x++) {
      const v = ww !== 0 ? k[x]! / ww : k[x]!
      pesos[xx * tamanho + x] = v < 0 ? Math.trunc(-0.5 + v * (1 << BITS)) : Math.trunc(0.5 + v * (1 << BITS))
    }
    limites[xx * 2] = xmin
    limites[xx * 2 + 1] = xmax
  }
  return { tamanho, limites, pesos }
}

/** clip8 do Resample.c. */
function clip8(v: number): number {
  if (v >= 256 * (1 << BITS)) return 255
  if (v <= 0) return 0
  return Math.floor(v / (1 << BITS))
}

/** `im.resize((w, h), LANCZOS, box)` do Pillow para L: passada horizontal (só nas linhas usadas) e depois vertical. */
export function redimensionarLanczos(img: ImagemCinza, largura: number, altura: number, caixa: [number, number, number, number] = [0, 0, img.largura, img.altura]): ImagemCinza {
  const h = coeficientes(img.largura, caixa[0], caixa[2], largura)
  const v = coeficientes(img.altura, caixa[1], caixa[3], altura)
  const precisaH = largura !== img.largura || caixa[0] !== 0 || caixa[2] !== largura
  const precisaV = altura !== img.altura || caixa[1] !== 0 || caixa[3] !== altura
  let atual = img
  const limitesV = v.limites.slice()
  if (precisaH) {
    const primeira = limitesV[0]!
    const ultima = limitesV[altura * 2 - 2]! + limitesV[altura * 2 - 1]!
    for (let i = 0; i < altura; i++) limitesV[i * 2] = limitesV[i * 2]! - primeira
    const linhas = ultima - primeira
    const px = new Uint8Array(largura * linhas)
    const meio = 1 << (BITS - 1)
    for (let yy = 0; yy < linhas; yy++) {
      const base = (yy + primeira) * img.largura
      for (let xx = 0; xx < largura; xx++) {
        const xmin = h.limites[xx * 2]!
        const xmax = h.limites[xx * 2 + 1]!
        const k = xx * h.tamanho
        let ss = meio
        for (let x = 0; x < xmax; x++) ss += img.px[base + x + xmin]! * h.pesos[k + x]!
        px[yy * largura + xx] = clip8(ss)
      }
    }
    atual = { largura, altura: linhas, px }
  }
  if (!precisaV) return atual
  const px = new Uint8Array(largura * altura)
  const meio = 1 << (BITS - 1)
  for (let yy = 0; yy < altura; yy++) {
    const ymin = limitesV[yy * 2]!
    const ymax = limitesV[yy * 2 + 1]!
    const k = yy * v.tamanho
    for (let xx = 0; xx < largura; xx++) {
      let ss = meio
      for (let y = 0; y < ymax; y++) ss += atual.px[(y + ymin) * atual.largura + xx]! * v.pesos[k + y]!
      px[yy * largura + xx] = clip8(ss)
    }
  }
  return { largura, altura, px }
}

/** `_get_safe_box` do Pillow: a caixa alargada pelo apoio do filtro, para o `reduce` não cortar o que o LANCZOS usa. */
function caixaSegura(img: ImagemCinza, largura: number, altura: number): [number, number, number, number] {
  const apoio = APOIO_LANCZOS - 0.5
  const sx = (apoio * img.largura) / largura
  const sy = (apoio * img.altura) / altura
  return [Math.max(0, Math.trunc(0 - sx)), Math.max(0, Math.trunc(0 - sy)), Math.min(img.largura, Math.ceil(img.largura + sx)), Math.min(img.altura, Math.ceil(img.altura + sy))]
}

/**
 * `Image.thumbnail((lado, lado), LANCZOS)` (reducing_gap 2,0) para L: se a imagem é mais de 2× maior que o alvo,
 * primeiro o `reduce` inteiro, depois o LANCZOS. A imagem que já cabe volta como está.
 */
export function miniaturaPil(img: ImagemCinza, lado = LADO): ImagemCinza {
  const alvo = tamanhoDaMiniaturaPil(img.largura, img.altura, lado)
  if (!alvo) return img
  const [largura, altura] = alvo
  const fx = Math.trunc(img.largura / largura / 2) || 1
  const fy = Math.trunc(img.altura / altura / 2) || 1
  let fonte = img
  let caixa: [number, number, number, number] = [0, 0, img.largura, img.altura]
  if (fx > 1 || fy > 1) {
    // A caixa segura de uma imagem inteira é a própria imagem (o apoio cai fora dela dos dois lados).
    const segura = caixaSegura(img, largura, altura)
    fonte = reduzirPil(img, fx, fy)
    caixa = [(caixa[0] - segura[0]) / fx, (caixa[1] - segura[1]) / fy, (caixa[2] - segura[0]) / fx, (caixa[3] - segura[1]) / fy]
  }
  return redimensionarLanczos(fonte, largura, altura, caixa)
}

// ---------------------------------------------------------------------------------------------------- métricas

/**
 * `round(x, 4)` do Python: o valor EXATO do double arredondado a 4 casas, com o empate (exatamente na metade) indo para o
 * par. O `toFixed(4)` do JavaScript também parte do valor exato, mas no empate sobe: 3750/120000 = 0,03125 (exato em
 * binário) daria 0,0313, e o Python dá 0,0312. O empate é conferido nos dígitos exatos do double (`toFixed(100)`).
 */
export function arredondarComoPython(x: number): number {
  const exato = Math.abs(x).toFixed(100)
  const ponto = exato.indexOf('.')
  const resto = exato.slice(ponto + 5)
  if (/^50*$/.test(resto)) {
    const baixo = Number(exato.slice(0, ponto + 5))
    const ultimo = Number(exato[ponto + 4])
    const r = ultimo % 2 === 0 ? baixo : Number((baixo + 0.0001).toFixed(4))
    return x < 0 ? -r : r
  }
  return Number(x.toFixed(4))
}
const quatroCasas = arredondarComoPython

/** Uma erosão 3×3; a borda conta como fora (o `np.pad(..., constant_values=False)` do Python). */
function erodir(m: Uint8Array, largura: number, altura: number): Uint8Array {
  const saida = new Uint8Array(m.length)
  for (let y = 1; y < altura - 1; y++) {
    const r0 = (y - 1) * largura
    const r1 = y * largura
    const r2 = (y + 1) * largura
    for (let x = 1; x < largura - 1; x++) {
      saida[r1 + x] = m[r0 + x - 1]! & m[r0 + x]! & m[r0 + x + 1]! & m[r1 + x - 1]! & m[r1 + x]! & m[r1 + x + 1]! & m[r2 + x - 1]! & m[r2 + x]! & m[r2 + x + 1]!
    }
  }
  return saida
}

/** As duas métricas da imagem como está (sem reduzir). */
export function metricas(img: ImagemCinza): Metricas {
  const n = img.px.length
  let mascara: Uint8Array = new Uint8Array(n)
  let medios = 0
  for (let i = 0; i < n; i++) {
    const v = img.px[i]!
    if (v >= ESCURO && v <= CLARO) {
      mascara[i] = 1
      medios++
    }
  }
  for (let i = 0; i < EROSOES; i++) mascara = erodir(mascara, img.largura, img.altura)
  let nucleo = 0
  for (let i = 0; i < n; i++) nucleo += mascara[i]!
  return { extremes: quatroCasas(1 - medios / n), grey_core: quatroCasas(nucleo / n) }
}

/** `display_margin`: positiva = traço; negativa ou zero = tons. A menor das duas distâncias relativas aos limiares. */
export function margem(m: Metricas): number {
  return Math.min((m.extremes - EXTREMOS_MIN) / EXTREMOS_MIN, (CINZA_MAX - m.grey_core) / CINZA_MAX)
}

/** `classify_display`: reduz a no máximo 400 px (como o Pillow), mede e decide. Não altera a imagem recebida. */
export function classificarModo(img: ImagemCinza): { modo: Modo; metricas: Metricas } {
  const m = metricas(miniaturaPil(img))
  return { modo: margem(m) > 0 ? 'traco' : 'tons', metricas: m }
}
