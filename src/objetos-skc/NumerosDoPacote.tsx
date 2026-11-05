import { useEffect } from 'react'
import { aoReabrir } from '../banco/cliente'
import { numerosDosObjetos } from '../banco/consultas'
import { lerConfirmados } from './confirmados'
import { definirFonteDosNumerosDoPacote, recarregarNumerosDoPacote } from './pacote'

/**
 * Liga a numeração SKC ao banco (montado no App): os números dos objetos do pacote vêm da tabela `object`, e são
 * consultados de novo quando o pacote é trocado. Lê também os números confirmados guardados neste aparelho.
 */
export function NumerosDoPacote(): null {
  useEffect(() => {
    definirFonteDosNumerosDoPacote(numerosDosObjetos)
    void recarregarNumerosDoPacote()
    void lerConfirmados().catch(() => undefined)
    const parar = aoReabrir(() => void recarregarNumerosDoPacote())
    return () => {
      parar()
      definirFonteDosNumerosDoPacote(null)
    }
  }, [])
  return null
}
