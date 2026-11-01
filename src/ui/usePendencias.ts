import { useEffect, useState } from 'react'
import { pendencias, type Pendencias } from '../banco/consultas'
import { lerEstado } from '../pacote/local'

/** A fila de revisão do pacote (null enquanto carrega ou se não há pacote; sem pacote o banco nem é consultado). */
export function usePendencias(): Pendencias | null {
  const [valor, setValor] = useState<Pendencias | null>(null)
  useEffect(() => {
    let vivo = true
    lerEstado()
      .then((pacote) => (pacote ? pendencias() : null))
      .then(
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
