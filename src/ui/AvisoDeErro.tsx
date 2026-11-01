import { Link } from 'react-router'
import { ErroSemPacote } from '../banco/cliente'

export const MSG_SEM_PACOTE = 'O banco ainda não está no aparelho.'
export const MSG_ERRO_GERAL = 'Não foi possível carregar agora. Tente de novo.'

/**
 * O aviso de uma tela que não conseguiu ler o banco: sem pacote leva a prepará-lo. Com `aoTentar`,
 * o botão "Tentar de novo" carrega outra vez (o banco que falhou, ou o pacote que chegou entretanto).
 * `mensagem` troca o texto do erro geral (a Busca diz "buscar", não "carregar").
 */
export function AvisoDeErro({ erro, aoTentar, mensagem = MSG_ERRO_GERAL }: { erro: unknown; aoTentar?: () => void; mensagem?: string }) {
  const semPacote = erro instanceof ErroSemPacote
  return (
    <div className="aviso-de-erro" role="alert">
      <p>{semPacote ? MSG_SEM_PACOTE : mensagem}</p>
      {semPacote && (
        <p>
          <Link to="/preparando">Preparar o banco</Link>
        </p>
      )}
      {aoTentar && (
        <p>
          <button type="button" className="aviso-de-erro-tentar" onClick={aoTentar}>
            Tentar de novo
          </button>
        </p>
      )}
    </div>
  )
}
