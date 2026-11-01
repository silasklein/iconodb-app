import { useEffect, useState } from 'react'
import { pendencias, type Pendencias } from '../banco/consultas'

/** A fila de revisão do pacote (null enquanto carrega ou se não há pacote). */
export function usePendencias(): Pendencias | null {
  const [valor, setValor] = useState<Pendencias | null>(null)
  useEffect(() => {
    let vivo = true
    pendencias().then(
      (p) => vivo && setValor(p),
      () => vivo && setValor(null),
    )
    return () => {
      vivo = false
    }
  }, [])
  return valor
}

export const numeroPtBr = (n: number) => n.toLocaleString('pt-BR')

/** "4.248 pendências", "1 pendência". */
export const textoDePendencias = (n: number) => `${numeroPtBr(n)} ${n === 1 ? 'pendência' : 'pendências'}`
