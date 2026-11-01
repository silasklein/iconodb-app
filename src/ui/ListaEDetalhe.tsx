import type { ReactNode } from 'react'
import './ListaEDetalhe.css'

interface Props {
  /** Nome da região da lista (leitor de tela). */
  rotulo: string
  lista: ReactNode
  detalhe: ReactNode
}

/**
 * O computador (a partir de 768 px): a lista à esquerda, com a rolagem dela, e o detalhe à direita
 * (PC-Glossario.dc.html e irmãs). Como é o mesmo elemento em /glossario e em /verbete/:id, trocar de
 * item não remonta a lista: o texto do filtro e a posição da rolagem ficam.
 */
export function ListaEDetalhe({ rotulo, lista, detalhe }: Props) {
  return (
    <div className="lista-detalhe">
      <aside className="lista-lateral" aria-label={rotulo}>
        <div className="lista-rolagem">{lista}</div>
      </aside>
      <main className="lista-principal">{detalhe}</main>
    </div>
  )
}
