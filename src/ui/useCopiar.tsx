import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export const MSG_COPIADA = 'Referência copiada'
export const MSG_SELECIONE = 'Selecione e copie'
const DURACAO_DO_AVISO_MS = 4000

/** Marca o texto do elemento como selecionado (o que fazer quando a área de transferência não deixa copiar). */
function selecionar(elemento: HTMLElement | null) {
  const selecao = window.getSelection()
  if (!elemento || !selecao) return
  const faixa = document.createRange()
  faixa.selectNodeContents(elemento)
  selecao.removeAllRanges()
  selecao.addRange(faixa)
}

/**
 * "Copiar referência": copia o texto para a área de transferência e devolve o aviso ("Referência copiada").
 * Sem área de transferência (ou se ela recusar), seleciona o texto de `alvo` e avisa "Selecione e copie".
 * O aviso vai num `<AvisoDeCopia>` (região viva) e some sozinho.
 */
export function useCopiar(alvo: RefObject<HTMLElement | null>) {
  const [aviso, setAviso] = useState('')
  const relogio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(relogio.current), [])

  const copiar = useCallback(
    async (texto: string) => {
      let mensagem = MSG_COPIADA
      try {
        if (!navigator.clipboard?.writeText) throw new Error('sem área de transferência')
        await navigator.clipboard.writeText(texto)
      } catch {
        selecionar(alvo.current)
        mensagem = MSG_SELECIONE
      }
      setAviso(mensagem)
      clearTimeout(relogio.current)
      relogio.current = setTimeout(() => setAviso(''), DURACAO_DO_AVISO_MS)
    },
    [alvo],
  )
  return { aviso, copiar }
}

/** A região viva (educada) do aviso de cópia: fica no documento, vazia, para o leitor de tela anunciar a mudança. */
export function AvisoDeCopia({ aviso }: { aviso: string }) {
  return (
    <p className="aviso-de-copia" role="status" aria-live="polite">
      {aviso}
    </p>
  )
}
