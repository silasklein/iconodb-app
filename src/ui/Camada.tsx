/**
 * A camada modal das folhas (celular, de baixo) e dos diálogos (computador), criada para "Adicionar imagem" (Tarefa 8)
 * e reusada pela folha de um intervalo citado (Tarefa 9b): o resto da tela fica inerte, o foco entra e fica dentro
 * (Tab circula), Esc e o fundo fecham, e ao fechar o foco volta (`devolverFoco`, senão a quem estava focado). A página
 * de trás não rola enquanto houver uma camada aberta (o contador abaixo), e a camada acompanha a área visível (o
 * teclado do iPhone).
 */
import { useEffect, useRef, type DragEvent, type KeyboardEvent as TeclaDoReact, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAtalhos } from '../app/useAtalhos'

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([type="file"]), select, textarea, [tabindex]:not([tabindex="-1"])'

export interface PropsDaCamada {
  variante: 'folha' | 'dialogo'
  rotulo: string
  aoFechar: () => void
  /** Esc e o fundo (gestos fáceis de fazer sem querer): padrão `aoFechar`. */
  aoPedirFechar?: () => void
  devolverFoco?: () => HTMLElement | null
  children: ReactNode
  className?: string
  /** Soltar arquivos em qualquer lugar do diálogo. */
  aoSoltar?: (arquivos: File[]) => void
  /**
   * O começo dos nomes de classe (`<prefixo>-camada`, `-fundo`, `-folha`/`-dialogo`, `-alca`, e `<prefixo>` na caixa):
   * cada folha tem o seu CSS. Padrão: 'adicionar-imagem' (a primeira que usou esta camada, Tarefa 8).
   */
  prefixo?: string
}

/**
 * A trava de rolagem da página conta as camadas abertas (revisão 2): a primeira guarda o valor de antes e a ÚLTIMA a
 * fechar o devolve, em qualquer ordem de fechamento.
 */
let camadasAbertas = 0
let rolagemDeAntes = ''
function travarRolagem(): void {
  if (camadasAbertas++ === 0) {
    rolagemDeAntes = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
  }
}
function destravarRolagem(): void {
  if (camadasAbertas === 0) return
  if (--camadasAbertas === 0) document.documentElement.style.overflow = rolagemDeAntes
}

/** A folha (celular) ou o diálogo (computador), sempre modal: o resto da tela fica inerte, o foco fica dentro, Esc fecha. */
export function Camada({ variante, rotulo, aoFechar, aoPedirFechar, devolverFoco, children, className = '', aoSoltar, prefixo = 'adicionar-imagem' }: PropsDaCamada) {
  const raiz = useRef<HTMLDivElement>(null)
  const camadaRef = useRef<HTMLDivElement>(null)
  const atual = useRef({ aoFechar: aoPedirFechar ?? aoFechar, devolverFoco })
  atual.current = { aoFechar: aoPedirFechar ?? aoFechar, devolverFoco }

  // Revisão 1, M8: com a folha aberta a página de trás não rola, e a camada acompanha a área visível (o teclado do
  // iPhone encolhe o visualViewport e o rola; sem isto, o campo focado empurrava a página e aparecia uma faixa branca).
  useEffect(() => {
    travarRolagem()
    const vv = window.visualViewport
    const camada = camadaRef.current
    const acompanhar = () => {
      if (!vv || !camada) return
      camada.style.top = `${vv.offsetTop}px`
      camada.style.height = `${vv.height}px`
      camada.style.bottom = 'auto'
    }
    acompanhar()
    vv?.addEventListener('resize', acompanhar)
    vv?.addEventListener('scroll', acompanhar)
    return () => {
      destravarRolagem()
      vv?.removeEventListener('resize', acompanhar)
      vv?.removeEventListener('scroll', acompanhar)
    }
  }, [])

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    const camada = raiz.current?.closest(`.${prefixo}-camada`)
    const inertes = camada ? [...document.body.children].filter((el) => el !== camada && !el.hasAttribute('inert')) : []
    for (const el of inertes) el.setAttribute('inert', '')
    raiz.current?.focus()
    return () => {
      for (const el of inertes) el.removeAttribute('inert')
      const destino = atual.current.devolverFoco?.() ?? anterior
      if (destino?.isConnected) destino.focus()
    }
  }, [])

  useAtalhos({ Escape: () => atual.current.aoFechar() }, 'item', { raiz: () => raiz.current })

  const prender = (e: TeclaDoReact) => {
    if (e.key !== 'Tab' || !raiz.current) return
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

  const soltavel = aoSoltar
    ? {
        onDragOver: (e: DragEvent) => {
          if ([...e.dataTransfer.types].includes('Files')) e.preventDefault()
        },
        onDrop: (e: DragEvent) => {
          const arquivos = [...e.dataTransfer.files]
          if (arquivos.length === 0) return
          e.preventDefault()
          aoSoltar(arquivos)
        },
      }
    : {}

  return createPortal(
    <div ref={camadaRef} className={`${prefixo}-camada ${prefixo}-camada-${variante}`}>
      <div className={`${prefixo}-fundo`} onClick={() => atual.current.aoFechar()} aria-hidden="true" />
      <div
        ref={raiz}
        className={`${prefixo} ${prefixo}-${variante} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        tabIndex={-1}
        onKeyDown={prender}
        {...soltavel}
      >
        {variante === 'folha' && <div className={`${prefixo}-alca`} aria-hidden="true" />}
        {children}
      </div>
    </div>,
    document.body,
  )
}
