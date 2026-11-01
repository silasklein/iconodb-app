import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { processarRetornoDoLogin } from '../dropbox/retorno'

/**
 * Trata a volta do login do Dropbox ao abrir o app: concluído leva a
 * /preparando; sem conseguir concluir (por exemplo, o iPhone abriu o retorno no
 * Safari, sem o login pendente) leva a /entrar, que mostra o login por código.
 */
export function RetornoDoLogin() {
  const navegar = useNavigate()
  useEffect(() => {
    void processarRetornoDoLogin().then((r) => {
      if (r === 'concluido') navegar('/preparando', { replace: true })
      else if (r === 'falhou') navegar('/entrar', { replace: true, state: { voltou: true } })
    })
  }, [navegar])
  return null
}
