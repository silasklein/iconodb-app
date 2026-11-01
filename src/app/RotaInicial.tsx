import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { estadoLogin } from '../dropbox/auth'
import { lerEstado } from '../pacote/local'

export type Destino = 'inicio' | '/preparando' | '/entrar'

/**
 * Para onde o app vai ao abrir:
 * - há pacote no aparelho: o Início, seja qual for o estado do token (um acesso expirado ou
 *   revogado nunca impede de consultar o que já está aqui);
 * - não há pacote e o login está ativo: /preparando (o primeiro download);
 * - não há pacote e não há login válido: /entrar.
 */
export async function decidirDestino(): Promise<Destino> {
  const pacote = await lerEstado().catch(() => null)
  if (pacote !== null) return 'inicio'
  const login = await estadoLogin().catch(() => 'sem-login' as const)
  return login === 'ativo' ? '/preparando' : '/entrar'
}

/** Guarda da rota "/": mostra o Início (os filhos) ou manda para a tela certa. Não mostra nada enquanto decide. */
export function RotaInicial({ children }: { children: ReactNode }) {
  const [destino, setDestino] = useState<Destino | null>(null)
  useEffect(() => {
    let vivo = true
    decidirDestino().then((d) => vivo && setDestino(d))
    return () => {
      vivo = false
    }
  }, [])
  if (destino === null) return null
  return destino === 'inicio' ? <>{children}</> : <Navigate to={destino} replace />
}
