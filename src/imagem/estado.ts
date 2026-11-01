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
