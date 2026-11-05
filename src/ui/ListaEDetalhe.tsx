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
  /** `mapa`: o lado direito é o mapa dos sítios, sem margem nem rolagem (PC-SitiosMapa.dc.html). */
  modo?: 'mapa'
  /** A lista de 480 px (a dos Sítios, com as etiquetas de região), em vez de 400 px. */
  listaLarga?: boolean
}

/**
 * O computador (a partir de 768 px): a lista à esquerda, com a rolagem dela, e o detalhe à direita
 * (PC-Glossario.dc.html e irmãs). Como é o mesmo elemento em /glossario e em /verbete/:id, trocar de
 * item não remonta a lista: o texto do filtro e a posição da rolagem ficam.
 */
export function ListaEDetalhe({ rotulo, lista, detalhe, chave, anuncio, modo, listaLarga }: Props) {
  const principal = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (principal.current) principal.current.scrollTop = 0
  }, [chave])
  return (
    <div className={`lista-detalhe${modo === 'mapa' ? ' lista-detalhe-mapa' : ''}${listaLarga ? ' lista-detalhe-larga' : ''}`}>
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
