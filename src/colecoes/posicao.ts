/** Uma caixa na tela (como `getBoundingClientRect`). */
export interface Caixa {
  left: number
  top: number
  right: number
  bottom: number
}

const distancia = (c: Caixa, x: number, y: number): number => {
  const dx = Math.max(c.left - x, 0, x - c.right)
  const dy = Math.max(c.top - y, 0, y - c.bottom)
  return dx * dx + dy * dy
}

/**
 * O índice da caixa sob o ponto, ou a mais próxima dele (as frestas entre linhas e cartões e o que passa das pontas
 * da lista caem no vizinho mais perto). Serve à lista e à grade. `-1` sem caixas.
 */
export function indiceSobOPonto(caixas: readonly Caixa[], x: number, y: number): number {
  let melhor = -1
  let menor = Infinity
  caixas.forEach((c, i) => {
    const d = distancia(c, x, y)
    if (d < menor) {
      menor = d
      melhor = i
    }
  })
  return melhor
}
