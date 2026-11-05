import { useCallback, useEffect, useRef, type MouseEvent } from 'react'

/** Quanto se espera por um segundo clique antes de abrir o editor (o intervalo do duplo clique, com folga). */
export const ESPERA_DO_DUPLO_CLIQUE_MS = 350

/**
 * Tocar ou clicar no texto lido abre o editor (decisão 37), mas o duplo e o triplo clique são para SELECIONAR uma palavra
 * ou um trecho (revisão 1 da Tarefa 10, I8: a hipótese nasce de uma seleção). Então o clique espera um instante: um
 * segundo clique (`detail > 1`) cancela, e uma seleção feita nesse meio-tempo também. Links e botões não abrem o editor.
 */
export function useCliqueParaEditar(editar: () => void): (e: MouseEvent<HTMLElement>) => void {
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null)
  const atual = useRef(editar)
  atual.current = editar
  const cancelar = () => {
    if (relogio.current !== null) clearTimeout(relogio.current)
    relogio.current = null
  }
  useEffect(() => cancelar, [])
  return useCallback((e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('a, button')) return
    cancelar()
    if (e.detail > 1) return
    if (window.getSelection()?.toString()) return
    relogio.current = setTimeout(() => {
      relogio.current = null
      if (window.getSelection()?.toString()) return
      atual.current()
    }, ESPERA_DO_DUPLO_CLIQUE_MS)
  }, [])
}
