import { useRef, type KeyboardEvent } from 'react'
import './Hipoteses.css'

interface Props<T extends string> {
  rotulo: string
  opcoes: readonly { valor: T; rotulo: string }[]
  valor: T | null
  aoEscolher: (v: T) => void
  /** Id do rótulo visível (senão o `rotulo` vira aria-label). */
  rotuloId?: string
}

/**
 * Um grupo de rádio em segmentos (NovaHipotese.dc.html: Nível e Certeza; a posição sobre a hipótese do livro). Teclado
 * de grupo de rádio: Tab entra no escolhido (ou no primeiro), as setas andam e escolhem.
 */
export function Segmentos<T extends string>({ rotulo, opcoes, valor, aoEscolher, rotuloId }: Props<T>) {
  const grupo = useRef<HTMLDivElement>(null)
  const marcado = opcoes.findIndex((o) => o.valor === valor)
  const focoEm = marcado >= 0 ? marcado : 0
  const teclar = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!passo) return
    e.preventDefault()
    const j = (i + passo + opcoes.length) % opcoes.length
    aoEscolher(opcoes[j]!.valor)
    grupo.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[j]?.focus()
  }
  return (
    <div ref={grupo} role="radiogroup" aria-label={rotuloId ? undefined : rotulo} aria-labelledby={rotuloId} className="segmentos" style={{ ['--n' as string]: opcoes.length }}>
      {opcoes.map((o, i) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={o.valor === valor}
          tabIndex={i === focoEm ? 0 : -1}
          className="segmento"
          onClick={() => aoEscolher(o.valor)}
          onKeyDown={(e) => teclar(e, i)}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}
