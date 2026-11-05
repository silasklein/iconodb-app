/**
 * Reordenar os objetos de uma coleção: três jeitos que dão no mesmo evento (`moverMembroPara`, um campo só).
 *
 *  - Arrastar pelo puxador (eventos de ponteiro: mouse, toque e caneta). Enquanto arrasta a lista só MOSTRA onde o item
 *    ficará; nada é gravado até soltar. Esc, `pointercancel` ou soltar no lugar de origem não gravam.
 *  - Alt+↑ / Alt+↓ com o foco em qualquer controle da linha (menos num campo de texto).
 *  - "Pegar" o item (tocar no puxador, ou Espaço/Enter nele): Subir / Descer e as setas movem, Esc solta. É o jeito
 *    de quem não arrasta (teclado, leitor de tela, toque sem precisão).
 *
 * Cada mudança é anunciada numa região viva ("CA00001 movido para a posição 2 de 3"), o foco acompanha o item, e a
 * ordem nova aparece na hora (otimista) enquanto o evento vai ao IndexedDB.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as TeclaDoReact, type PointerEvent as PonteiroDoReact, type RefObject } from 'react'
import { emCampoDeTexto } from '../app/atalhos'
import { moverMembroPara } from './operacoes'
import { indiceSobOPonto, type Caixa } from './posicao'

/** Quanto o ponteiro precisa andar para um toque virar arrasto. */
export const LIMIAR_DO_ARRASTO_PX = 4
/** A faixa junto à borda da janela em que arrastar rola a página. */
const FAIXA_DA_ROLAGEM_PX = 56
const PASSO_DA_ROLAGEM_PX = 14

export const movido = <T,>(lista: readonly T[], de: number, para: number): T[] => {
  const nova = lista.slice()
  const [x] = nova.splice(de, 1)
  nova.splice(para, 0, x!)
  return nova
}

interface Arrasto {
  pointerId: number
  ref: string
  x0: number
  y0: number
  ativo: boolean
  de: number
  para: number
  cancelado: boolean
}

export interface PropsDoPuxador {
  onPointerDown: (e: PonteiroDoReact<HTMLButtonElement>) => void
  onClick: () => void
  onKeyDown: (e: TeclaDoReact<HTMLButtonElement>) => void
}

export interface Ordenacao {
  /** As refs na ordem a mostrar: a da coleção, ou a prévia do arrasto, ou a otimista de um movimento em curso. */
  ordem: readonly string[]
  arrastando: string | null
  pegado: string | null
  /**
   * O que se anuncia agora e em qual das DUAS regiões vivas irmãs (`no` 0 ou 1; cada uma com `role="status"` e
   * `aria-live="polite"`). Um aviso igual ao anterior só é lido de novo se o leitor de tela vê uma região mudar: cada aviso
   * vai à região que não foi usada por último, e a outra fica vazia.
   */
  anuncio: { texto: string; no: 0 | 1 }
  lista: RefObject<HTMLUListElement | null>
  propsDoPuxador: (ref: string) => PropsDoPuxador
  /** O Alt+↑/↓ de qualquer controle da linha. */
  aoTeclarNaLinha: (ref: string) => (e: TeclaDoReact<HTMLElement>) => void
  /** Sobe (-1) ou desce (+1) o item uma posição. */
  deslocar: (ref: string, passo: -1 | 1) => Promise<void>
  /** Anuncia sem mover (por exemplo, que o item foi tirado). */
  anunciar: (texto: string) => void
}

export function useOrdenacao(colecaoId: string, refs: readonly string[]): Ordenacao {
  const lista = useRef<HTMLUListElement>(null)
  const [provisoria, setProvisoria] = useState<string[] | null>(null)
  const [previa, setPrevia] = useState<{ de: number; para: number } | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [pegado, setPegado] = useState<string | null>(null)
  const [anuncio, setAnuncioBruto] = useState<{ texto: string; no: 0 | 1 }>({ texto: '', no: 0 })
  const setAnuncio = useCallback((texto: string) => setAnuncioBruto((a) => ({ texto, no: a.no === 0 ? 1 : 0 })), [])
  const [foco, setFoco] = useState<{ ref: string; n: number } | null>(null)
  const arrasto = useRef<Arrasto | null>(null)
  const suprimirClique = useRef(false)
  const atual = useRef({ refs, colecaoId })
  atual.current = { refs, colecaoId }

  const base = provisoria ?? refs
  const ordem = previa ? movido(base, previa.de, previa.para) : base

  // Quem sai da coleção deixa de estar "pegado".
  useEffect(() => {
    if (pegado && !refs.includes(pegado)) setPegado(null)
  }, [refs, pegado])

  // O foco acompanha o item movido: o React reinsere o nó e o navegador pode soltá-lo.
  useEffect(() => {
    if (!foco) return
    const linha = [...(lista.current?.children ?? [])].find((el) => (el as HTMLElement).dataset.ref === foco.ref)
    linha?.querySelector<HTMLElement>('[data-puxador]')?.focus()
  }, [foco])

  const anunciar = setAnuncio

  const gravar = useCallback(async (ref: string, para: number) => {
    const { colecaoId: id } = atual.current
    const de = atual.current.refs.indexOf(ref)
    if (de < 0 || de === para) return
    setProvisoria(movido(atual.current.refs, de, para))
    try {
      const r = await moverMembroPara(id, ref, para)
      setAnuncio(`${ref} movido para a posição ${r.para + 1} de ${r.total}`)
    } catch {
      setAnuncio(`Não foi possível guardar a nova ordem de ${ref}; tente de novo.`)
    } finally {
      setProvisoria(null)
      setFoco((f) => ({ ref, n: (f?.n ?? 0) + 1 }))
    }
  }, [setAnuncio])

  const deslocar = useCallback(
    async (ref: string, passo: -1 | 1) => {
      const todas = provisoria ?? atual.current.refs
      const i = todas.indexOf(ref)
      if (i < 0) return
      const para = i + passo
      if (para < 0) return setAnuncio(`${ref} já é o primeiro`)
      if (para >= todas.length) return setAnuncio(`${ref} já é o último`)
      await gravar(ref, para)
    },
    [gravar, provisoria, setAnuncio],
  )

  // ---- arrastar ----
  // O arrasto escuta o DOCUMENTO, não o puxador: reordenar a lista reinsere o nó do item arrastado, e o navegador
  // solta a captura do ponteiro quando isso acontece (o `pointerup` nunca chegaria ao puxador).
  const soltarOuvintes = useRef<(() => void) | null>(null)
  useEffect(() => () => soltarOuvintes.current?.(), [])

  const encerrar = useCallback(
    (cancelar: boolean) => {
      const a = arrasto.current
      arrasto.current = null
      soltarOuvintes.current?.()
      setPrevia(null)
      setArrastando(null)
      if (!a?.ativo) return
      suprimirClique.current = true
      if (!cancelar && !a.cancelado && a.para !== a.de) void gravar(a.ref, a.para)
      else setFoco((f) => ({ ref: a.ref, n: (f?.n ?? 0) + 1 }))
    },
    [gravar],
  )

  // Esc no meio do arrasto cancela (o ouvinte só existe enquanto se arrasta).
  useEffect(() => {
    if (!arrastando) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (arrasto.current) arrasto.current.cancelado = true
      encerrar(true)
      setAnuncio('Arrasto cancelado')
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [arrastando, encerrar])

  const caixas = (): Caixa[] =>
    [...(lista.current?.children ?? [])].map((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    })

  const aoMoverPonteiro = (e: PointerEvent) => {
    const a = arrasto.current
    if (!a || a.pointerId !== e.pointerId || a.cancelado) return
    if (!a.ativo) {
      if (Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < LIMIAR_DO_ARRASTO_PX) return
      a.ativo = true
      setArrastando(a.ref)
      setPegado(null)
    }
    const i = indiceSobOPonto(caixas(), e.clientX, e.clientY)
    if (i >= 0 && i !== a.para) {
      a.para = i
      setPrevia({ de: a.de, para: i })
    }
    // perto da borda da janela, rola a página
    if (e.clientY < FAIXA_DA_ROLAGEM_PX) window.scrollBy?.(0, -PASSO_DA_ROLAGEM_PX)
    else if (e.clientY > window.innerHeight - FAIXA_DA_ROLAGEM_PX) window.scrollBy?.(0, PASSO_DA_ROLAGEM_PX)
  }

  const propsDoPuxador = (ref: string): PropsDoPuxador => ({
    onPointerDown: (e) => {
      suprimirClique.current = false
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const de = (provisoria ?? refs).indexOf(ref)
      if (de < 0) return
      soltarOuvintes.current?.()
      arrasto.current = { pointerId: e.pointerId, ref, x0: e.clientX, y0: e.clientY, ativo: false, de, para: de, cancelado: false }
      const aoSoltar = (ev: PointerEvent) => {
        if (arrasto.current?.pointerId === ev.pointerId) encerrar(false)
      }
      const aoCancelar = (ev: PointerEvent) => {
        if (arrasto.current?.pointerId === ev.pointerId) encerrar(true)
      }
      document.addEventListener('pointermove', aoMoverPonteiro)
      document.addEventListener('pointerup', aoSoltar)
      document.addEventListener('pointercancel', aoCancelar)
      soltarOuvintes.current = () => {
        document.removeEventListener('pointermove', aoMoverPonteiro)
        document.removeEventListener('pointerup', aoSoltar)
        document.removeEventListener('pointercancel', aoCancelar)
        soltarOuvintes.current = null
      }
    },
    onClick: () => {
      // O clique que sobra de um arrasto (ou de um Esc) não "pega" o item.
      if (suprimirClique.current) {
        suprimirClique.current = false
        return
      }
      setPegado((p) => {
        const novo = p === ref ? null : ref
        setAnuncio(novo ? `${ref} pego. Use as setas para mover, Esc para soltar.` : `${ref} solto`)
        return novo
      })
    },
    onKeyDown: (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'Escape' && pegado === ref) {
        e.preventDefault()
        e.stopPropagation()
        setPegado(null)
        setAnuncio(`${ref} solto`)
        return
      }
      if (pegado !== ref) return
      const passo = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 0
      if (passo === 0) return
      e.preventDefault()
      void deslocar(ref, passo)
    },
  })

  const aoTeclarNaLinha = (ref: string) => (e: TeclaDoReact<HTMLElement>) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    if (emCampoDeTexto(e.target)) return
    e.preventDefault()
    void deslocar(ref, e.key === 'ArrowUp' ? -1 : 1)
  }

  return { ordem, arrastando, pegado, anuncio, lista, propsDoPuxador, aoTeclarNaLinha, deslocar, anunciar }
}
