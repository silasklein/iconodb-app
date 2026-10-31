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
