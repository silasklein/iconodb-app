import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../ui/Icon'
import { trechoDoIntervalo, type TrechoNaTela } from './selecao'
import './Hipoteses.css'

export interface Selecao {
  trecho: TrechoNaTela
  /** Onde está a seleção na tela (null onde o navegador não mede, como nos testes). */
  caixa: { top: number; bottom: number; left: number; right: number } | null
}

function lerSelecao(dentro: () => Element | null): Selecao | null {
  const sel = typeof window.getSelection === 'function' ? window.getSelection() : null
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const r = sel.getRangeAt(0)
  const raiz = dentro()
  if (!raiz || !raiz.contains(r.commonAncestorContainer)) return null
  const trecho = trechoDoIntervalo(r)
  if (!trecho) return null
  const caixa = typeof r.getBoundingClientRect === 'function' ? r.getBoundingClientRect() : null
  return { trecho, caixa: caixa && (caixa.width > 0 || caixa.height > 0) ? { top: caixa.top, bottom: caixa.bottom, left: caixa.left, right: caixa.right } : null }
}

/**
 * O trecho selecionado agora numa leitura dentro de `dentro()` (Tarefa 10): segue a seleção (`selectionchange`); null
 * sem seleção, fora de uma leitura ou atravessando duas.
 */
export function useSelecaoNaLeitura(dentro: () => Element | null, ativo = true): Selecao | null {
  const [selecao, setSelecao] = useState<Selecao | null>(null)
  useEffect(() => {
    if (!ativo) {
      setSelecao(null)
      return
    }
    let quadro = 0
    const ler = () => {
      cancelAnimationFrame(quadro)
      // A seleção ainda pode mudar no mesmo evento (arrastar): lê no quadro seguinte, uma vez.
      quadro = requestAnimationFrame(() => setSelecao(lerSelecao(dentro)))
    }
    const agora = () => setSelecao(lerSelecao(dentro))
    document.addEventListener('selectionchange', agora)
    document.addEventListener('pointerup', ler)
    document.addEventListener('keyup', ler)
    return () => {
      cancelAnimationFrame(quadro)
      document.removeEventListener('selectionchange', agora)
      document.removeEventListener('pointerup', ler)
      document.removeEventListener('keyup', ler)
    }
  }, [ativo]) // eslint-disable-line react-hooks/exhaustive-deps
  return selecao
}

const LARGURA = 220

/**
 * "Registrar hipótese" junto do trecho selecionado (PC-ItemNovaHipotese.dc.html: o trecho marcado no texto; atalho
 * Shift+H). No toque, embaixo da seleção (o menu do sistema fica em cima); com o mouse, em cima. Pressionar não tira a
 * seleção (mousedown sem padrão).
 */
export function BotaoDoTrecho({ selecao, aoRegistrar }: { selecao: Selecao | null; aoRegistrar: (t: TrechoNaTela) => void }) {
  if (!selecao) return null
  const toque = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  const c = selecao.caixa
  const largura = typeof window.innerWidth === 'number' ? window.innerWidth : 375
  const altura = typeof window.innerHeight === 'number' ? window.innerHeight : 667
  const estilo = c
    ? {
        left: Math.max(8, Math.min(largura - LARGURA - 8, (c.left + c.right) / 2 - LARGURA / 2)),
        top: toque || c.top < 64 ? Math.min(altura - 56, c.bottom + 8) : c.top - 52,
      }
    : { left: 16, bottom: 16 }
  return createPortal(
    <button
      type="button"
      className="botao-do-trecho"
      style={estilo}
      aria-keyshortcuts="Shift+H"
      data-tip="Registrar hipótese (Shift+H)"
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => aoRegistrar(selecao.trecho)}
    >
      <Icon name="registrarHipotese" size={18} />
      Registrar hipótese
    </button>,
    document.body,
  )
}
