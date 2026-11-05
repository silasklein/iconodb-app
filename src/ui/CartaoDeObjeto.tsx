import { Link } from 'react-router'
import type { ObjetoResumo } from '../banco/tipos'
import { MiniaturaDoObjeto } from '../imagens-usuario/MiniaturaDoObjeto'
import { textoDoNrSkc } from '../objetos-skc/numeracao'
import { useSitiosVivos } from '../sitios/doUsuario'
import './CartaoDeObjeto.css'

interface Props {
  objeto: ObjetoResumo
  /** Estado do roteador para a tela do item (por exemplo a lista do resultado, para anterior/próximo). */
  state?: unknown
  /** Cartão grande das telas de computador (mostra também a origem). */
  grande?: boolean
}

/** Um objeto na grade: miniatura (a principal do usuário, se houver), número (o identificador principal), tipo e sítio. Leva a /item/<número>. */
export function CartaoDeObjeto({ objeto, state, grande = false }: Props) {
  // O sítio de agora (Tarefa 12): o nome corrigido, o sítio que a pessoa escolheu para o objeto; excluído, com a marca.
  const s = useSitiosVivos(false).doResumo(objeto)
  const sitio = [s.nome, s.marca].filter(Boolean).join(' · ')
  return (
    <Link className={`cartao-objeto${grande ? ' cartao-grande' : ''}`} to={`/item/${encodeURIComponent(objeto.numero)}`} state={state}>
      <span className="cartao-imagem">
        {/* As imagens de um objeto SKC são do id dele (o número provisório pode mudar). */}
        <MiniaturaDoObjeto numero={objeto.skc ? objeto.itemId : objeto.numero} caminho={objeto.miniatura} alt={objeto.tipo ?? `Objeto ${objeto.numero}`} />
      </span>
      <span className="cartao-texto">
        <span className="cartao-numero codigo">
          {objeto.semNumero ? 'Sem número' : objeto.numero}
          {objeto.skc && <span className="cartao-skc"> · SKC{objeto.provisorio ? ' · provisório' : objeto.semNumero ? ' · rascunho' : ''}</span>}
        </span>
        {/* O SKC, Nr. (decisão 38), pequeno, sob o número: "SKC: 12" (decisão 39). */}
        {objeto.nrSkc !== undefined && <span className="cartao-nr-skc">{textoDoNrSkc(objeto.nrSkc)}</span>}
        <span className="cartao-tipo">{objeto.tipo ?? '—'}</span>
        <span className="cartao-sitio">{grande ? [sitio, objeto.origem].filter(Boolean).join(' · ') : sitio}</span>
      </span>
    </Link>
  )
}
