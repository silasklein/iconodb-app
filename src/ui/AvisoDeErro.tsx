import { Link } from 'react-router'
import { ErroSemPacote } from '../banco/cliente'

export const MSG_SEM_PACOTE = 'O banco ainda não está no aparelho.'
export const MSG_ERRO_GERAL = 'Não foi possível carregar agora. Tente de novo.'

/** O aviso de uma tela que não conseguiu ler o banco: sem pacote leva a prepará-lo. */
export function AvisoDeErro({ erro }: { erro: unknown }) {
  const semPacote = erro instanceof ErroSemPacote
  return (
    <div className="aviso-de-erro" role="alert">
      <p>{semPacote ? MSG_SEM_PACOTE : MSG_ERRO_GERAL}</p>
      {semPacote && (
        <p>
          <Link to="/preparando">Preparar o banco</Link>
        </p>
      )}
    </div>
  )
}
