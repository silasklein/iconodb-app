import { forwardRef, useImperativeHandle, useRef, type KeyboardEvent } from 'react'
import { PERIODOS, type CodigoDePeriodo } from './numeracao'
import './Formulario.css'

export interface ManejoDoPeriodo {
  focar(): void
}

interface Props {
  valor: CodigoDePeriodo | null
  /** "Ainda não sei" escolhido. */
  naoSei: boolean
  /** Mostrar "Ainda não sei" (o NovoObjeto mostra; o rascunho que ganha período, não). */
  comNaoSei?: boolean
  aoEscolher: (periodo: CodigoDePeriodo | null) => void
  invalido?: boolean
  descritoPor?: string
}

/**
 * O período do número (NovoObjeto.dc.html): um grupo de rádio em pílulas, os 13 códigos e "Ainda não sei". Teclado como
 * num grupo de rádio: Tab entra no escolhido (ou no primeiro), setas andam e escolhem, Espaço/Enter escolhem.
 */
export const EscolhaDoPeriodo = forwardRef<ManejoDoPeriodo, Props>(function EscolhaDoPeriodo({ valor, naoSei, comNaoSei = true, aoEscolher, invalido = false, descritoPor }, ref) {
  const grupo = useRef<HTMLDivElement>(null)
  const opcoes: { codigo: CodigoDePeriodo | null; nome: string }[] = [...PERIODOS.map((p) => ({ codigo: p.codigo as CodigoDePeriodo, nome: p.nome })), ...(comNaoSei ? [{ codigo: null, nome: 'Ainda não sei' }] : [])]
  const marcado = (o: { codigo: CodigoDePeriodo | null }) => (o.codigo === null ? naoSei : o.codigo === valor)
  const indiceMarcado = opcoes.findIndex(marcado)
  const focoEm = indiceMarcado >= 0 ? indiceMarcado : 0
  const botoes = () => [...(grupo.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [])]
  useImperativeHandle(ref, () => ({ focar: () => botoes()[focoEm]?.focus() }), [focoEm])
  const teclar = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!passo) return
    e.preventDefault()
    const j = (i + passo + opcoes.length) % opcoes.length
    aoEscolher(opcoes[j]!.codigo)
    botoes()[j]?.focus()
  }
  return (
    <div
      ref={grupo}
      role="radiogroup"
      aria-label="Período"
      aria-invalid={invalido || undefined}
      aria-describedby={descritoPor}
      aria-required="true"
      className="form-periodos"
    >
      {opcoes.map((o, i) => (
        <button
          key={o.codigo ?? 'nao-sei'}
          type="button"
          role="radio"
          aria-checked={marcado(o)}
          tabIndex={i === focoEm ? 0 : -1}
          className="form-periodo"
          onClick={() => aoEscolher(o.codigo)}
          onKeyDown={(e) => teclar(e, i)}
        >
          {o.codigo && <span className="form-periodo-codigo">{o.codigo}</span>}
          {o.nome}
        </button>
      ))}
    </div>
  )
})
