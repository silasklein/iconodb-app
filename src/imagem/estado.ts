/**
 * O que o item e o visualizador combinam entre si ao navegar (`location.state` e um pedido de foco).
 */

/** O estado do roteador com que o item abre o visualizador. Com ele, fechar volta no histórico (`navigate(-1)`) e o item reaparece como estava. */
export interface EstadoDoVisualizador {
  ampliada: true
  /** O original (sem inversão) estava ligado no item. */
  original: boolean
}

export function lerEstadoDoVisualizador(state: unknown): EstadoDoVisualizador | null {
  const e = state as Partial<EstadoDoVisualizador> | null
  return e && typeof e === 'object' && e.ampliada === true ? { ampliada: true, original: e.original === true } : null
}

/**
 * A imagem que estava à vista no item (e se o original estava ligado) quando o visualizador abriu.
 * Fica no estado do roteador do item (`state.imagemAberta`): o item guarda antes de abrir o
 * visualizador e o lê ao montar de novo, para reabrir na mesma imagem.
 */
export interface ImagemAberta {
  imagemId: string
  original: boolean
}

export function lerImagemAberta(state: unknown): ImagemAberta | null {
  const a = (state as { imagemAberta?: Partial<ImagemAberta> } | null)?.imagemAberta
  return a && typeof a.imagemId === 'string' ? { imagemId: a.imagemId, original: a.original === true } : null
}

/** O estado do roteador com a imagem aberta (e o resto do estado como estava). */
export function comImagemAberta(state: unknown, aberta: ImagemAberta): Record<string, unknown> {
  return { ...(state && typeof state === 'object' ? (state as Record<string, unknown>) : {}), imagemAberta: aberta }
}

/** O estado sem a imagem aberta (para levar adiante, a outro item, sem arrastar a imagem do anterior). */
export function semImagemAberta<T extends object>(state: T): Omit<T, 'imagemAberta'> {
  const { imagemAberta: _, ...resto } = state as T & { imagemAberta?: unknown }
  return resto
}

/**
 * Fechar o visualizador desmonta a tela dele e monta o item de novo; o gatilho ("Ampliar a imagem")
 * é um elemento novo. Quem fecha pede o foco aqui e o item o devolve ao montar o botão. O pedido
 * vale por pouco tempo, para não roubar o foco numa visita posterior.
 */
const VALIDADE_DO_PEDIDO_MS = 10_000
let pedidoEm = 0

export function pedirFocoNoAmpliar(): void {
  pedidoEm = Date.now()
}

export function consumirPedidoDeFoco(): boolean {
  const valido = pedidoEm > 0 && Date.now() - pedidoEm < VALIDADE_DO_PEDIDO_MS
  pedidoEm = 0
  return valido
}
