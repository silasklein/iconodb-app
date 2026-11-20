import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useOrigemDosLinks } from '../app/OrigemDosLinks'
import { comVoltar } from '../app/voltar'
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
  /** O sítio de onde o objeto vem, quando a grade é a de outro (uma parte do sítio da página): a linha do sítio diz «em …». */
  em?: string
  /**
   * Embaixo do cartão, fora do link (que não pode ter outro link dentro): a marca do achado «do texto» com o link ao § (Tarefa 26).
   */
  rodape?: ReactNode
}

/** Um objeto na grade: miniatura (a principal do usuário, se houver), número (o identificador principal), tipo e sítio. Leva a /item/<número>. */
export function CartaoDeObjeto({ objeto, state, grande = false, em, rodape }: Props) {
  // O sítio de agora (Tarefa 12): o nome corrigido, o sítio que a pessoa escolheu para o objeto; excluído, com a marca.
  const s = useSitiosVivos(false).doResumo(objeto)
  // Numa tela de origem (verbete, sítio, obra, Busca…; decisão 85) o cartão leva também o «‹ …» de volta a ela.
  const origem = useOrigemDosLinks()
  const sitio = em !== undefined ? `em ${em}` : [s.nome, s.marca].filter(Boolean).join(' · ')
  // A figura do livro em parágrafos sem tipo (fix 1 da Tarefa 26; desenhos 3, 5 e 7): o rótulo dela na linha do tipo, e
  // «sem sítio» embaixo; a origem não se repete no cartão grande.
  const figura = objeto.tipo === null ? (objeto.figura ?? null) : null
  const cartao = (
    <Link className={`cartao-objeto${grande ? ' cartao-grande' : ''}`} to={`/item/${encodeURIComponent(objeto.numero)}`} state={comVoltar(state, origem)}>
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
        <span className="cartao-tipo">{objeto.tipo ?? figura ?? '—'}</span>
        <span className="cartao-sitio">{figura ? sitio || 'sem sítio' : grande ? [sitio, objeto.origem].filter(Boolean).join(' · ') : sitio}</span>
      </span>
    </Link>
  )
  if (!rodape) return cartao
  return (
    <div className="cartao-objeto-com-rodape">
      {cartao}
      <div className="cartao-objeto-rodape">{rodape}</div>
    </div>
  )
}
