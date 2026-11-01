import { useLocation } from 'react-router'
import { useAtualizacaoPendente } from './atualizacao'
import './AvisoDeAtualizacao.css'

/**
 * "Nova versão disponível": uma faixa discreta no pé, que não bloqueia nada. Só recarrega quando o
 * usuário toca em "Recarregar". Fica escondida durante o primeiro download (/preparando): recarregar
 * ali interromperia a sincronização.
 */
export function AvisoDeAtualizacao() {
  const { pendente, recarregar } = useAtualizacaoPendente()
  const { pathname } = useLocation()
  if (!pendente || pathname === '/preparando') return null
  return (
    <div className="aviso-atualizacao" role="status">
      <span>Nova versão disponível</span>
      <button type="button" className="aviso-atualizacao-botao" onClick={recarregar}>
        Recarregar
      </button>
    </div>
  )
}
