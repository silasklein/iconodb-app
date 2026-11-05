import type { Retangulo } from './posicaoDaPrevia'

/** A largura máxima da dica de um termo (a mesma do CSS: `min(260px, …)`). */
const LARGURA_MAXIMA = 260
/** A altura que se reserva para a dica (duas linhas e o respiro). */
const ALTURA_RESERVADA = 56

/**
 * Quanto a dica de um termo anda no eixo x (em px, negativo: para a esquerda) para caber na coluna de leitura. A dica sai do
 * canto esquerdo da primeira linha do termo; perto da borda direita ela é puxada até caber, e nunca passa da borda esquerda.
 * A largura usada é a máxima possível (a real só é menor), então a conta é conservadora.
 */
export function deslocamentoDaDica({ termo, pai }: { termo: Retangulo; pai: Retangulo }): number {
  const largura = Math.min(LARGURA_MAXIMA, pai.right - pai.left)
  const excesso = termo.left + largura - pai.right
  const deslocamento = excesso > 0 ? -excesso : 0
  return Math.max(deslocamento, pai.left - termo.left)
}

/** A dica sobe (fica acima do termo) quando embaixo não cabe na janela e em cima cabe. */
export function dicaVaiAcima({ termo, alturaDaJanela }: { termo: Retangulo; alturaDaJanela: number }): boolean {
  return termo.bottom + ALTURA_RESERVADA > alturaDaJanela && termo.top - ALTURA_RESERVADA >= 0
}

/**
 * Ajusta a dica (`data-tip`) de um termo à posição atual dele: chamada ao tocar, passar o mouse ou focar. Fica no estilo do
 * próprio elemento (`--dica-x`, `data-acima`); o texto guardado e as posições não mudam.
 */
export function ajustarDica(el: HTMLElement): void {
  const pai = el.closest<HTMLElement>('.leitura-texto, dd, li, p') ?? el.parentElement
  const linha = el.getClientRects()[0]
  if (!pai || !linha) return
  const termo: Retangulo = { left: linha.left, right: linha.right, top: linha.top, bottom: linha.bottom }
  el.style.setProperty('--dica-x', `${deslocamentoDaDica({ termo, pai: pai.getBoundingClientRect() })}px`)
  if (dicaVaiAcima({ termo, alturaDaJanela: window.innerHeight })) el.setAttribute('data-acima', '')
  else el.removeAttribute('data-acima')
}
