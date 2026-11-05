/**
 * O desenho de uma região: um polígono livre sobre a imagem (Tarefa 10; Imagem.dc.html, PC-Imagem.dc.html,
 * PC-ItemNovaHipotese.dc.html). Puro, sem DOM: a tela converte o toque ou o clique com `clienteParaRelativo` e
 * guarda o resultado com `seletorDoPoligono`.
 *
 * O formato é o R4 do banco (registro de decisões da 2A): `<polygon points="x,y x,y …"/>`, coordenadas de 0 a 1 na
 * imagem como ela aparece ANTES do giro do livro (`rotacao`): x da esquerda para a direita, y de cima para baixo.
 * - Imagem do livro: o quadro é o da figura do pacote (`screen_path`), o mesmo das regiões do livro (`element_region`).
 * - Imagem do usuário (decisão 33): o quadro é o da imagem JÁ ORIENTADA pelo EXIF (`tela.webp` sai de
 *   `createImageBitmap(..., {imageOrientation: 'from-image'})`, src/imagens-usuario/processar.ts). O `original.<ext>`
 *   guarda o EXIF como veio: quem o abrir fora do app tem de aplicar a orientação antes de usar as coordenadas.
 * - A inversão do desenho de traço (decisão 10) é só um filtro de cor (`filter: invert(1)`): não mexe nas coordenadas.
 *   Desenhar sobre o invertido ou sobre o original dá a mesma região.
 * - 4 casas decimais (1/10 000 da imagem: menos de 0,2 px numa imagem de tela de 1600 px).
 */

export type PontoRelativo = readonly [number, number]

export interface Desenho {
  pontos: readonly PontoRelativo[]
  /** Fechado: o polígono está completo (tocou-se no primeiro ponto ou "Concluir"). */
  fechado: boolean
}

export const DESENHO_VAZIO: Desenho = Object.freeze({ pontos: Object.freeze([]) as readonly PontoRelativo[], fechado: false })

/** A distância (em fração da imagem, em cada direção) dentro da qual um toque "pega" um ponto. */
export interface Tolerancia {
  x: number
  y: number
}

const entre01 = (v: number) => Math.min(1, Math.max(0, v))

/** O ponto dentro da imagem (0 a 1); NaN ou infinito não é ponto. */
export function limitar(p: readonly [number, number]): PontoRelativo | null {
  if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null
  return [entre01(p[0]), entre01(p[1])]
}

const perto = (a: PontoRelativo, b: PontoRelativo, t: Tolerancia) => Math.abs(a[0] - b[0]) <= t.x && Math.abs(a[1] - b[1]) <= t.y

/** O dobro da área (fórmula do laço); 0 para pontos em linha. */
function areaDupla(pontos: readonly PontoRelativo[]): number {
  let s = 0
  for (let i = 0; i < pontos.length; i++) {
    const [x1, y1] = pontos[i]!
    const [x2, y2] = pontos[(i + 1) % pontos.length]!
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s)
}

/** Três pontos ou mais, com área (pontos repetidos ou em linha não formam região). */
export function poligonoValido(pontos: readonly PontoRelativo[]): boolean {
  return pontos.length >= 3 && areaDupla(pontos) > 1e-8
}

/**
 * Um toque (ou clique) no modo de marcar: com 3 pontos ou mais, perto do primeiro, fecha a região; senão põe um ponto.
 * Fechada, a região não recebe pontos (os pontos se movem com `moverPonto`).
 */
export function tocar(d: Desenho, p: readonly [number, number], tol: Tolerancia): Desenho {
  if (d.fechado) return d
  const q = limitar(p)
  if (!q) return d
  if (d.pontos.length >= 3 && perto(q, d.pontos[0]!, tol)) return fechar(d)
  return { pontos: [...d.pontos, q], fechado: false }
}

/** "Concluir" (Enter): fecha a região, se ela tem área. */
export function fechar(d: Desenho): Desenho {
  if (d.fechado || !poligonoValido(d.pontos)) return d
  return { pontos: d.pontos, fechado: true }
}

/** O ponto sob `p` (o mais próximo dentro da tolerância), ou -1. */
export function pontoSob(d: Desenho, p: readonly [number, number], tol: Tolerancia): number {
  let melhor = -1
  let menor = Infinity
  d.pontos.forEach((q, i) => {
    if (!perto([p[0], p[1]], q, tol)) return
    const dist = Math.hypot((q[0] - p[0]) / (tol.x || 1), (q[1] - p[1]) / (tol.y || 1))
    if (dist < menor) {
      menor = dist
      melhor = i
    }
  })
  return melhor
}

export function moverPonto(d: Desenho, i: number, p: readonly [number, number]): Desenho {
  const q = limitar(p)
  if (!q || i < 0 || i >= d.pontos.length) return d
  const pontos = d.pontos.slice()
  pontos[i] = q
  return { pontos, fechado: d.fechado }
}

/** O desenho atual e os anteriores, para "Desfazer" (Ctrl/⌘Z). */
export interface Edicao {
  atual: Desenho
  antes: readonly Desenho[]
}

export const novaEdicao = (inicial: Desenho = DESENHO_VAZIO): Edicao => ({ atual: inicial, antes: [] })

/** Um passo novo; o que não muda nada não entra no histórico. */
export function aplicarEdicao(e: Edicao, novo: Desenho): Edicao {
  if (novo === e.atual) return e
  return { atual: novo, antes: [...e.antes, e.atual] }
}

export function desfazer(e: Edicao): Edicao {
  const anterior = e.antes.at(-1)
  if (!anterior) return e
  return { atual: anterior, antes: e.antes.slice(0, -1) }
}

const casas = (v: number) => String(Number(v.toFixed(4)))

/** `<polygon points="x,y x,y …"/>` (R4), 4 casas, sem zeros à direita. */
export function seletorDoPoligono(pontos: readonly PontoRelativo[]): string {
  return `<polygon points="${pontos.map(([x, y]) => `${casas(x)},${casas(y)}`).join(' ')}"/>`
}

export interface Caixa {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Um ponto da tela (`clientX`, `clientY`) em 0 a 1 da imagem, antes do giro. `caixa` é o retângulo da camada do
 * desenho NA TELA (getBoundingClientRect: já com a ampliação e o giro), `tamanho` o tamanho dela no layout
 * (offsetWidth/offsetHeight: sem transformações) e `giro` os graus no sentido horário (CSS `rotate`). Vale para
 * qualquer escala uniforme e giro em torno do centro (o visualizador amplia, o item e o visualizador giram): o centro
 * da caixa é o centro da figura, a escala sai da largura da caixa e o giro é desfeito.
 */
export function clienteParaRelativo(cliente: { x: number; y: number }, caixa: Caixa, tamanho: { w: number; h: number }, giro: number): PontoRelativo | null {
  if (!(tamanho.w > 0 && tamanho.h > 0 && caixa.width > 0 && caixa.height > 0)) return null
  const r = (giro * Math.PI) / 180
  const cos = Math.cos(r)
  const sen = Math.sin(r)
  const escala = caixa.width / (tamanho.w * Math.abs(cos) + tamanho.h * Math.abs(sen))
  const dx = cliente.x - (caixa.left + caixa.width / 2)
  const dy = cliente.y - (caixa.top + caixa.height / 2)
  // Desfaz o giro (rotate(g) leva (x, y) a (x cos − y sen, x sen + y cos)).
  const lx = (dx * cos + dy * sen) / escala
  const ly = (-dx * sen + dy * cos) / escala
  return limitar([lx / tamanho.w + 0.5, ly / tamanho.h + 0.5])
}
