import { useMemo } from 'react'
import type { Pendencias } from '../banco/consultas'
import { pendenciasDaFila, useFila } from '../revisao/useFila'

/**
 * A fila de revisão de agora (null enquanto carrega ou se não há pacote; sem pacote o banco nem é consultado): a MESMA conta da
 * Revisão (src/revisao/fila.ts), então o Menu, o ponto da barra e a página concordam sempre — também logo depois de resolver
 * um caso e quando uma sincronização traz mudanças do outro aparelho.
 */
export function usePendencias(): Pendencias | null {
  const fila = useFila()
  return useMemo(() => (fila ? pendenciasDaFila(fila) : null), [fila])
}

export { numeroPtBr, textoDePendencias } from './numero'
