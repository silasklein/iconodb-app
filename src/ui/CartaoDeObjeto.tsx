import { Link } from 'react-router'
import type { ObjetoResumo } from '../banco/tipos'
import { Miniatura } from './Miniatura'
import './CartaoDeObjeto.css'

interface Props {
  objeto: ObjetoResumo
  /** Estado do roteador para a tela do item (por exemplo a lista do resultado, para anterior/próximo). */
  state?: unknown
  /** Cartão grande das telas de computador (mostra também a origem). */
  grande?: boolean
}

/** Um objeto na grade: miniatura, número (o identificador principal), tipo e sítio. Leva a /item/<número>. */
export function CartaoDeObjeto({ objeto, state, grande = false }: Props) {
  return (
    <Link className={`cartao-objeto${grande ? ' cartao-grande' : ''}`} to={`/item/${encodeURIComponent(objeto.numero)}`} state={state}>
      <span className="cartao-imagem">
        <Miniatura caminho={objeto.miniatura} alt={objeto.tipo ?? `Objeto ${objeto.numero}`} />
      </span>
      <span className="cartao-texto">
        <span className="cartao-numero codigo">{objeto.numero}</span>
        <span className="cartao-tipo">{objeto.tipo ?? '—'}</span>
        <span className="cartao-sitio">{grande ? [objeto.sitio, objeto.origem].filter(Boolean).join(' · ') : (objeto.sitio ?? '')}</span>
      </span>
    </Link>
  )
}
