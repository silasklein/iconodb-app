import { useEffect, useRef, type KeyboardEvent as TeclaDoReact, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAtalhos } from '../app/useAtalhos'
import type { Acao } from '../app/atalhos'
import './PainelHipotese.css'

/** R17: a partir desta largura a hipótese (e a nova hipótese) abre no painel lateral (terceira coluna); abaixo, na folha de baixo. */
export const LARGURA_DO_PAINEL_LATERAL = 1160

const FOCAVEIS = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

interface Props {
  /** "folha": a folha de baixo (celular, e computador abaixo de 1160 px), modal. "lateral": a terceira coluna do item. */
  variante: 'folha' | 'lateral'
  rotulo: string
  ocupado?: boolean
  aoFechar: () => void
  /** Onde o foco volta ao fechar (a âncora, ou quem abriu). */
  devolverFoco?: () => HTMLElement | null
  /** Mais teclas do painel (além de Esc), no contexto "hipotese". */
  atalhos?: Record<string, Acao>
  /** Muda quando o conteúdo é outro (hipótese seguinte): o foco volta ao painel se o botão usado sumiu. */
  chave?: string
  className?: string
  children: ReactNode
}

/**
 * A casca do painel da hipótese (PainelHipotese) e da nova hipótese (NovaHipotese): no celular, uma folha modal (foco
 * preso, Esc, fundo que fecha, o resto inerte); no computador, um painel lateral não modal na terceira coluna do item.
 * Em ambos o foco entra no painel e volta a quem abriu ao fechar.
 */
export function CascaDoPainel({ variante, rotulo, ocupado = false, aoFechar, devolverFoco, atalhos = {}, chave, className = '', children }: Props) {
  const raiz = useRef<HTMLDivElement>(null)
  const atual = useRef({ aoFechar, devolverFoco })
  atual.current = { aoFechar, devolverFoco }
  const folha = variante === 'folha'

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    const portal = folha ? raiz.current?.closest('.painel-hipotese-camada') : null
    const inertes = portal ? [...document.body.children].filter((el) => el !== portal && !el.hasAttribute('inert')) : []
    for (const el of inertes) el.setAttribute('inert', '')
    raiz.current?.focus()
    return () => {
      for (const el of inertes) el.removeAttribute('inert')
      const destino = atual.current.devolverFoco?.() ?? anterior
      if (destino?.isConnected) destino.focus()
    }
  }, [folha])

  useEffect(() => {
    const ativo = document.activeElement
    if (raiz.current && (!ativo || ativo === document.body || !raiz.current.contains(ativo))) raiz.current.focus()
  }, [chave])

  useAtalhos({ Escape: () => atual.current.aoFechar(), ...atalhos }, 'hipotese', { raiz: () => raiz.current })

  const prender = (e: TeclaDoReact) => {
    if (!folha || e.key !== 'Tab' || !raiz.current) return
    const itens = [...raiz.current.querySelectorAll<HTMLElement>(FOCAVEIS)].filter((el) => !el.closest('[hidden]'))
    if (itens.length === 0) return
    const primeiro = itens[0]!
    const ultimo = itens[itens.length - 1]!
    const dentro = raiz.current.contains(document.activeElement) && document.activeElement !== raiz.current
    if (e.shiftKey && (document.activeElement === primeiro || !dentro)) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && (document.activeElement === ultimo || !dentro)) {
      e.preventDefault()
      primeiro.focus()
    }
  }

  const painel = (
    <div
      ref={raiz}
      className={`painel-hipotese painel-hipotese-${variante}${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-modal={folha ? true : undefined}
      aria-label={rotulo}
      aria-busy={ocupado || undefined}
      tabIndex={-1}
      onKeyDown={prender}
    >
      {folha && <div className="painel-hipotese-alca" aria-hidden="true" />}
      {children}
    </div>
  )
  if (!folha) return painel
  return createPortal(
    <div className="painel-hipotese-camada">
      <div className="painel-hipotese-fundo" onClick={aoFechar} aria-hidden="true" />
      {painel}
    </div>,
    document.body,
  )
}
