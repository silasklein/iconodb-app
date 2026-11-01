import { useEffect, useRef, useState, type KeyboardEvent as TeclaDoReact, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { useAtalhos } from '../app/useAtalhos'
import { sitios } from '../banco/consultas'
import { IconButton } from '../ui/IconButton'
import { numeroPtBr, usePendencias } from '../ui/usePendencias'
import './Menu.css'

export const MSG_PROXIMA_VERSAO = 'na próxima versão'

interface Props {
  /** "folha": a folha de baixo do celular (Menu.dc.html). "popover": o mesmo conteúdo, preso à barra superior. */
  variante: 'folha' | 'popover'
  aoFechar: () => void
  /** Quem abriu o menu; recebe o foco de volta ao fechar. */
  gatilho?: HTMLElement | null
}

const FOCAVEIS = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * O menu do app (Menu.dc.html no celular, o popover do ícone Menu no computador).
 * Um diálogo modal: o foco começa nele e não sai (Tab dá a volta), Esc fecha, tocar no fundo fecha,
 * o resto da tela fica inerte e o foco volta ao gatilho ao fechar.
 *
 * Na 2A: Revisão (com a contagem), Minhas notas, Sítios e "Atalhos e convenções" funcionam;
 * Comparar, Sincronização e Ajustes aparecem desabilitados, "na próxima versão".
 */
export function Menu({ variante, aoFechar, gatilho }: Props) {
  const raiz = useRef<HTMLDivElement>(null)
  const fechar = useRef(aoFechar)
  fechar.current = aoFechar
  const pend = usePendencias()
  const [totalDeSitios, setTotalDeSitios] = useState<number | null>(null)

  useEffect(() => {
    let vivo = true
    sitios().then(
      (s) => vivo && setTotalDeSitios(s.length),
      () => undefined,
    )
    return () => {
      vivo = false
    }
  }, [])

  // O foco entra no menu; o resto da tela fica inerte; ao sair, o foco volta a quem abriu.
  useEffect(() => {
    const anterior = (gatilho ?? document.activeElement) as HTMLElement | null
    const portal = raiz.current?.parentElement
    const inertes = [...document.body.children].filter((el) => el !== portal && !el.hasAttribute('inert'))
    for (const el of inertes) el.setAttribute('inert', '')
    raiz.current?.querySelector<HTMLElement>('button, a[href]')?.focus()
    return () => {
      for (const el of inertes) el.removeAttribute('inert')
      anterior?.focus?.()
    }
  }, [gatilho])

  // Esc fecha: o menu é um diálogo modal, e o registro de atalhos deixa só as teclas dele valerem.
  useAtalhos({ Escape: () => fechar.current() }, 'global', { raiz: () => raiz.current })

  const prender = (e: TeclaDoReact) => {
    if (e.key !== 'Tab' || !raiz.current) return
    const itens = [...raiz.current.querySelectorAll<HTMLElement>(FOCAVEIS)]
    if (itens.length === 0) return
    const primeiro = itens[0]!
    const ultimo = itens[itens.length - 1]!
    if (e.shiftKey && (document.activeElement === primeiro || !raiz.current.contains(document.activeElement))) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && (document.activeElement === ultimo || !raiz.current.contains(document.activeElement))) {
      e.preventDefault()
      primeiro.focus()
    }
  }

  const sitiosMeta = totalDeSitios === null ? null : `${numeroPtBr(totalDeSitios)} ${totalDeSitios === 1 ? 'sítio' : 'sítios'}`
  const revisaoMeta = pend === null ? null : `${numeroPtBr(pend.total)} ${pend.total === 1 ? 'caso' : 'casos'}`

  const link = (to: string, rotulo: string, meta: ReactNode, opcoes: { forte?: boolean; atalho?: string } = {}) => (
    <Link
      to={to}
      className={`menu-item${opcoes.forte ? ' menu-item-forte' : ''}`}
      aria-keyshortcuts={opcoes.atalho}
      onClick={aoFechar}
    >
      <span className="menu-item-nome">{rotulo}</span>
      {meta !== null && <span className={`menu-item-meta${opcoes.atalho ? ' codigo' : ''}`}>{meta}</span>}
    </Link>
  )
  const desabilitado = (rotulo: string) => (
    <button type="button" className="menu-item" disabled>
      <span className="menu-item-nome">{rotulo}</span>
      <span className="menu-item-meta">{MSG_PROXIMA_VERSAO}</span>
    </button>
  )

  return createPortal(
    <div className={`menu-camada menu-${variante}-camada`}>
      <div className="menu-fundo" data-testid="menu-fundo" onClick={aoFechar} />
      <div
        ref={raiz}
        className={`menu menu-${variante}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        onKeyDown={prender}
      >
        {variante === 'folha' && <div className="menu-alca" aria-hidden="true" />}
        <div className="menu-topo">
          <span className="menu-titulo">Menu</span>
          <IconButton icon="fechar" label="Fechar o menu" shortcut="Escape" shortcutLabel="Esc" onClick={aoFechar} />
        </div>
        <nav aria-label="Menu" className="menu-lista">
          {link('/revisao', 'Revisão', revisaoMeta, { forte: true })}
          {desabilitado('Comparar')}
          {link('/notas', 'Minhas notas', null)}
          {link('/sitios', 'Sítios', sitiosMeta)}
          {desabilitado('Ajustes')}
          {link('/atalhos', 'Atalhos e convenções', '?', { atalho: '?' })}
          <div className="menu-secao">{desabilitado('Sincronização')}</div>
        </nav>
      </div>
    </div>,
    document.body,
  )
}
