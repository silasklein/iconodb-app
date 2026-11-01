import { useEffect, useState } from 'react'
import { aoReabrir } from '../banco/cliente'
import { pendencias, type Pendencias } from '../banco/consultas'
import { lerEstado } from '../pacote/local'

/**
 * A fila de revisão do pacote (null enquanto carrega ou se não há pacote; sem pacote o banco nem é
 * consultado). Conta de novo quando o banco é reaberto (uma sincronização trocou o pacote).
 */
export function usePendencias(): Pendencias | null {
  const [valor, setValor] = useState<Pendencias | null>(null)
  const [versao, setVersao] = useState(0)
  useEffect(() => aoReabrir(() => setVersao((v) => v + 1)), [])
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
  }, [versao])
  return valor
}

export const numeroPtBr = (n: number) => n.toLocaleString('pt-BR')

/** "4.248 pendências", "1 pendência". */
export const textoDePendencias = (n: number) => `${numeroPtBr(n)} ${n === 1 ? 'pendência' : 'pendências'}`
