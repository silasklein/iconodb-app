/**
 * A matemática da ampliação do visualizador, pura (sem DOM). A figura fica centrada no palco; a
 * vista é `translate(x, y) scale(escala)` com a origem no centro do palco. Todas as coordenadas de
 * ponto são em pixels, relativas ao centro do palco.
 */
export const ESCALA_MIN = 1
export const ESCALA_MAX = 8
/** Cada toque em + ou − (ou nas teclas) multiplica ou divide a escala por isto. */
const PASSO = 1.5
/** A escala a que o toque duplo leva a partir de 1×. */
const ESCALA_DO_TOQUE_DUPLO = 2

export interface Vista {
  escala: number
  x: number
  y: number
}
export interface Ponto {
  x: number
  y: number
}
export interface Tamanho {
  w: number
  h: number
}

export const VISTA_INICIAL: Vista = { escala: ESCALA_MIN, x: 0, y: 0 }

const entre = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
/** Arredonda a 0,01 px (tira o ruído de ponto flutuante dos tamanhos). */
const centesimos = (v: number) => Math.round(v * 100) / 100
/** NaN e -0 viram 0. */
const limpo = (v: number) => (Number.isFinite(v) ? v || 0 : 0)

/** A caixa que contém a figura girada `graus` em torno do centro. */
export function caixaGirada(figura: Tamanho, graus: number): Tamanho {
  const r = (graus * Math.PI) / 180
  const c = Math.abs(Math.cos(r))
  const s = Math.abs(Math.sin(r))
  return { w: figura.w * c + figura.h * s, h: figura.w * s + figura.h * c }
}

/** O tamanho (antes do giro) da figura a 1×: ela, já girada, cabe inteira no palco. */
export function ajustar(palco: Tamanho, imagem: Tamanho, graus: number): Tamanho {
  if (palco.w <= 0 || palco.h <= 0 || imagem.w <= 0 || imagem.h <= 0) return { w: 0, h: 0 }
  const caixa = caixaGirada(imagem, graus)
  const k = Math.min(palco.w / caixa.w, palco.h / caixa.h)
  return { w: centesimos(imagem.w * k), h: centesimos(imagem.h * k) }
}

/**
 * Mantém a vista válida: escala de 1× a 8×; a figura (a caixa a 1×, já girada) nunca sai do palco,
 * isto é, a borda dela para na borda do palco. Menor que o palco numa direção, fica centrada nela.
 */
export function limitarVista(v: Vista, palco: Tamanho, caixa: Tamanho): Vista {
  const escala = Number.isFinite(v.escala) ? entre(v.escala, ESCALA_MIN, ESCALA_MAX) : ESCALA_MIN
  const folgaX = Math.max(0, (caixa.w * escala - palco.w) / 2)
  const folgaY = Math.max(0, (caixa.h * escala - palco.h) / 2)
  return { escala, x: limpo(entre(limpo(v.x), -folgaX, folgaX)), y: limpo(entre(limpo(v.y), -folgaY, folgaY)) }
}

/** Muda a escala mantendo parado o ponto de conteúdo que está sob `ponto` (o cursor ou o dedo). */
export function zoomEm(v: Vista, escala: number, ponto: Ponto, palco: Tamanho, caixa: Tamanho): Vista {
  const nova = entre(escala, ESCALA_MIN, ESCALA_MAX)
  const razao = nova / v.escala
  return limitarVista({ escala: nova, x: ponto.x - (ponto.x - v.x) * razao, y: ponto.y - (ponto.y - v.y) * razao }, palco, caixa)
}

export function mover(v: Vista, dx: number, dy: number, palco: Tamanho, caixa: Tamanho): Vista {
  return limitarVista({ ...v, x: v.x + dx, y: v.y + dy }, palco, caixa)
}

const distancia = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.y - b.y)
const meio = (a: Ponto, b: Ponto): Ponto => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/**
 * A pinça: dos dois dedos antes (`de`) para os dois dedos agora (`para`). A escala segue a razão das
 * distâncias; o conteúdo que estava sob o ponto médio antigo vai para o ponto médio novo (assim
 * arrastar com dois dedos também anda).
 */
export function pinca(v: Vista, de: readonly [Ponto, Ponto], para: readonly [Ponto, Ponto], palco: Tamanho, caixa: Tamanho): Vista {
  const antes = distancia(de[0], de[1])
  const razao = antes < 1e-6 ? 1 : distancia(para[0], para[1]) / antes
  const escala = entre(v.escala * razao, ESCALA_MIN, ESCALA_MAX)
  const m0 = meio(de[0], de[1])
  const m1 = meio(para[0], para[1])
  const cx = (m0.x - v.x) / v.escala
  const cy = (m0.y - v.y) / v.escala
  return limitarVista({ escala, x: m1.x - cx * escala, y: m1.y - cy * escala }, palco, caixa)
}

/** Toque duplo ou clique duplo: de 1× vai a 2× no ponto; ampliada, volta a 1×. */
export function alternarZoom(v: Vista, ponto: Ponto, palco: Tamanho, caixa: Tamanho): Vista {
  return v.escala > ESCALA_MIN + 1e-6 ? VISTA_INICIAL : zoomEm(v, ESCALA_DO_TOQUE_DUPLO, ponto, palco, caixa)
}

/** As teclas + e − e os botões: um passo, em torno do centro do palco. */
export function passo(v: Vista, direcao: 1 | -1, palco: Tamanho, caixa: Tamanho): Vista {
  const escala = direcao > 0 ? v.escala * PASSO : v.escala / PASSO
  return zoomEm(v, escala < ESCALA_MIN + 1e-4 ? ESCALA_MIN : escala, { x: 0, y: 0 }, palco, caixa)
}

/** O fator de escala de um evento da roda: `deltaMode` 0 = pixels, 1 = linhas, 2 = páginas; ctrl = pinça do trackpad. */
export function fatorDaRoda(deltaY: number, deltaMode: number, ctrl: boolean): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY
  return Math.exp(-px * (ctrl ? 0.01 : 0.0015))
}

export const emPorcento = (escala: number) => Math.round(escala * 100)
