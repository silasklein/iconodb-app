import { useEffect } from 'react'
import { iniciarIndiceDoUsuario } from './indice'

/** Mantém o índice de busca da camada do usuário em dia com o estado (montado no App, ao lado da sincronização). */
export function IndiceDoUsuario(): null {
  useEffect(() => iniciarIndiceDoUsuario(), [])
  return null
}
