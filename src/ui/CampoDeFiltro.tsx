import { useId } from 'react'
import { Icon } from './Icon'
import './CampoDeFiltro.css'

interface Props {
  rotulo: string
  placeholder: string
  valor: string
  aoMudar: (texto: string) => void
}

/**
 * O campo de busca dentro de uma lista (Glossário, Bibliografia, Sítios): filtra a lista na própria tela.
 * O rótulo só aparece no computador (no celular o ícone e o texto de exemplo bastam, como no design).
 */
export function CampoDeFiltro({ rotulo, placeholder, valor, aoMudar }: Props) {
  const id = useId()
  return (
    <div className="campo-filtro">
      <label htmlFor={id} className="campo-filtro-rotulo">
        {rotulo}
      </label>
      <div className="campo-filtro-caixa">
        <Icon name="buscar" size={18} />
        <input id={id} type="search" value={valor} placeholder={placeholder} autoComplete="off" autoCorrect="off" spellCheck={false} onChange={(e) => aoMudar(e.target.value)} />
      </div>
    </div>
  )
}
