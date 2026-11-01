import { useSyncExternalStore } from 'react'

export type Breakpoint = 'celular' | 'computador'

/** Um só app: a partir de 768 px valem as telas de computador. */
const CONSULTA = '(min-width: 768px)'

function assinar(aoMudar: () => void) {
  const m = window.matchMedia(CONSULTA)
  m.addEventListener('change', aoMudar)
  return () => m.removeEventListener('change', aoMudar)
}

function ler(): Breakpoint {
  return window.matchMedia(CONSULTA).matches ? 'computador' : 'celular'
}

export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(assinar, ler, () => 'celular')
}

/**
 * A janela tem pelo menos `px` de largura? (Para limites além do 768, como o painel lateral do
 * item a partir de 1160 px, R17.)
 */
export function useLarguraMinima(px: number): boolean {
  const consulta = `(min-width: ${px}px)`
  return useSyncExternalStore(
    (aoMudar) => {
      const m = window.matchMedia(consulta)
      m.addEventListener('change', aoMudar)
      return () => m.removeEventListener('change', aoMudar)
    },
    () => window.matchMedia(consulta).matches,
    () => false,
  )
}
