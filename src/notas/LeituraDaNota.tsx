import { forwardRef, type KeyboardEvent, type MouseEvent } from 'react'
import { TextoDaNota } from './TextoDaNota'
import './Notas.css'

interface Props {
  texto: string
  /** O id do rótulo visível ("Nota [2] · 01/11/2026"): é o nome do bloco. */
  rotuloId: string
  /** Tocar no texto, Enter ou E: passar para o campo, com o código `[[…]]`. */
  aoEditar: () => void
  /** Esc na leitura: fechar o editor. */
  aoFechar?: () => void
  /** Letras maiores, sem moldura (a tela da nota, no celular). */
  grande?: boolean
  descritoPor?: string
}

/**
 * A nota que não se edita (decisão do usuário, 01/11: "ler limpo, editar com o código"): o texto como no quadro, cada
 * `[[ref|rótulo]]` só o rótulo, sublinhado e clicável (`TextoDaNota`, nunca HTML). Tocar no texto, Enter ou E no bloco
 * focado abrem o campo; tocar num link segue o link e NÃO entra na edição. O botão "Editar" fica com as ações (EditorDeNota).
 */
export const LeituraDaNota = forwardRef<HTMLDivElement, Props>(function LeituraDaNota({ texto, rotuloId, aoEditar, aoFechar, grande = false, descritoPor }, ref) {
  const clicou = (e: MouseEvent<HTMLDivElement>) => {
    // Um link (ou o que está dentro dele) é do roteador, e um intervalo citado abre a lista (decisão 40); selecionar
    // texto com o mouse também não é "tocar para editar".
    if ((e.target as HTMLElement).closest('a, button')) return
    if (window.getSelection()?.toString()) return
    aoEditar()
  }
  const teclou = (e: KeyboardEvent<HTMLDivElement>) => {
    // Só quando o foco está no próprio bloco (um link dentro dele usa Enter para seguir).
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Enter' || e.key === 'e' || e.key === 'E') {
      e.preventDefault()
      e.stopPropagation()
      aoEditar()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      aoFechar?.()
    }
  }
  return (
    <div
      ref={ref}
      className={`nota-leitura-bloco${grande ? ' nota-leitura-grande' : ''}`}
      role="group"
      tabIndex={0}
      aria-labelledby={rotuloId}
      aria-describedby={descritoPor}
      data-leitura-da-nota=""
      onClick={clicou}
      onKeyDown={teclou}
    >
      {texto.trim() ? <TextoDaNota texto={texto} /> : <span className="nota-leitura-vazia">Nota em branco. Toque para escrever.</span>}
    </div>
  )
})
