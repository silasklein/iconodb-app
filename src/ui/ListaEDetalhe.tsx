import { useLayoutEffect, useRef, type ReactNode } from 'react'
import './ListaEDetalhe.css'

interface Props {
  /** Nome da região da lista (leitor de tela). */
  rotulo: string
  lista: ReactNode
  detalhe: ReactNode
  /** Identifica o item mostrado: ao mudar, o painel do detalhe volta ao topo. */
  chave?: string
  /** O que o leitor de tela anuncia (educadamente) ao escolher um item: o título dele. */
  anuncio?: string
}

/**
 * O computador (a partir de 768 px): a lista à esquerda, com a rolagem dela, e o detalhe à direita
 * (PC-Glossario.dc.html e irmãs). Como é o mesmo elemento em /glossario e em /verbete/:id, trocar de
 * item não remonta a lista: o texto do filtro e a posição da rolagem ficam.
 */
export function ListaEDetalhe({ rotulo, lista, detalhe, chave, anuncio }: Props) {
  const principal = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (principal.current) principal.current.scrollTop = 0
  }, [chave])
  return (
    <div className="lista-detalhe">
      <aside className="lista-lateral" aria-label={rotulo}>
        <div className="lista-rolagem">{lista}</div>
      </aside>
      <main className="lista-principal" ref={principal}>
        {detalhe}
      </main>
      <div className="so-leitor" aria-live="polite" aria-atomic="true" data-anuncio="">
        {anuncio}
      </div>
    </div>
  )
}
