import { useSyncExternalStore } from 'react'

const CONSULTA = '(hover: hover)'

function assinar(aoMudar: () => void) {
  const m = window.matchMedia(CONSULTA)
  m.addEventListener('change', aoMudar)
  return () => m.removeEventListener('change', aoMudar)
}

/**
 * O aparelho tem um mouse (o dispositivo principal consegue passar por cima)? É o que decide se há «prévia ao passar o
 * mouse»: no toque ela nunca abre, e nada fica grudado depois de um toque.
 */
export function usePodePassarOMouse(): boolean {
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  )
}
