import { useCallback, type MouseEvent } from 'react'
import { useLocation, useNavigate, type Location } from 'react-router'

/**
 * Há uma entrada anterior do próprio app no histórico? O React Router numera as entradas em
 * `history.state.idx` (a primeira é 0); fora do navegador de verdade (testes com MemoryRouter) vale a
 * chave: a primeira entrada é a única com a chave "default".
 */
export function temEntradaAnterior(location: Pick<Location, 'key'>): boolean {
  const estado: unknown = typeof window === 'undefined' ? null : window.history.state
  if (typeof estado === 'object' && estado !== null && typeof (estado as { idx?: unknown }).idx === 'number') return (estado as { idx: number }).idx > 0
  return location.key !== 'default'
}

const comModificador = (e: MouseEvent) => e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey

/**
 * O Voltar das telas: um voltar de verdade no histórico (a tela anterior reaparece como estava, com a
 * rolagem e o `?filtro=`); só sem entrada anterior (link direto, aba nova) vai ao `href`, trocando a
 * entrada. O `href` fica no elemento para abrir em outra aba (clique do meio, pressionar e segurar).
 * Devolve o `onClick` do link.
 */
export function useVoltar(href: string): (e: MouseEvent<HTMLAnchorElement>) => void {
  const navegar = useNavigate()
  const location = useLocation()
  return useCallback(
    (e) => {
      if (e.defaultPrevented || comModificador(e)) return
      e.preventDefault()
      if (temEntradaAnterior(location)) void navegar(-1)
      else void navegar(href.replace(/^#/, ''), { replace: true })
    },
    [navegar, location, href],
  )
}
