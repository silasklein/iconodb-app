import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { dobrar } from '../glossario/modelo'
import './Formulario.css'

export interface OpcaoDeEscolha {
  id: string
  rotulo: string
  apoio?: string
}

interface Props {
  rotulo: string
  /** O texto do campo (o rótulo do que foi escolhido, ou o que a pessoa digita). */
  valor: string
  aoMudarTexto: (t: string) => void
  /** Todas as opções; o campo filtra pelo texto (sem acento, sem caixa). */
  opcoes: readonly OpcaoDeEscolha[]
  aoEscolher: (o: OpcaoDeEscolha) => void
  /** A opção "usar o que digitei" (ex.: «Miš» como nome livre), sempre a última da lista. */
  livre?: (texto: string) => OpcaoDeEscolha | null
  ajuda?: string
  placeholder?: string
  /** Quantas opções aparecem. */
  limite?: number
  aoFocar?: () => void
  aoDesfocar?: () => void
  /**
   * O que vem dentro da caixa, antes do campo (os termos já escolhidos, em pílulas: NovaHipotese.dc.html). `null` = a
   * caixa sem pílulas: quem usa pílulas passa sempre algo (null quando não há), para o campo não ser remontado (e perder
   * o foco) quando a primeira pílula entra.
   */
  prefixo?: ReactNode
}

// A dobra (sem acento, sem caixa, sem ʿ ʾ e apóstrofos) é uma só no app: a mesma da chave da forma de um verbete
// (revisão 3 da Tarefa 10, Minor 2), para "a forma exata" do campo Termo e o "Criar termo" nunca discordarem.
export { dobrar }

/**
 * Um campo com sugestões para escolher (Sítio, Obra): um combobox ARIA de verdade. ↓/↑ percorrem, Enter escolhe, Esc
 * fecha a lista; tocar numa opção escolhe. O que a pessoa digita fica no campo (a escolha só troca o texto pelo rótulo).
 */
export function CampoDeEscolha({ rotulo, valor, aoMudarTexto, opcoes, aoEscolher, livre, ajuda, placeholder, limite = 6, aoFocar, aoDesfocar, prefixo }: Props) {
  const id = useId()
  const [aberta, setAberta] = useState(false)
  const [ativo, setAtivo] = useState(-1)
  const visiveis = useMemo(() => {
    const d = dobrar(valor)
    if (d.length < 2) return []
    const achadas = opcoes.filter((o) => dobrar(o.rotulo).includes(d) || (o.apoio ? dobrar(o.apoio).includes(d) : false)).slice(0, limite)
    const extra = livre?.(valor.trim())
    return extra && !achadas.some((o) => dobrar(o.rotulo) === d) ? [...achadas, extra] : achadas
  }, [valor, opcoes, limite, livre])
  const mostrar = aberta && visiveis.length > 0
  const escolher = (o: OpcaoDeEscolha) => {
    aoEscolher(o)
    setAberta(false)
    setAtivo(-1)
  }
  const teclar = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAberta(true)
      setAtivo((a) => Math.min(a + 1, visiveis.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAtivo((a) => Math.max(a - 1, -1))
    } else if (e.key === 'Enter' && mostrar && ativo >= 0) {
      e.preventDefault()
      escolher(visiveis[ativo]!)
    } else if (e.key === 'Escape' && mostrar) {
      e.preventDefault()
      e.stopPropagation()
      setAberta(false)
    }
  }
  const entrada = (
    <input
      id={`${id}-campo`}
      type="text"
      role="combobox"
      aria-expanded={mostrar}
      aria-controls={`${id}-lista`}
      aria-autocomplete="list"
      aria-activedescendant={mostrar && ativo >= 0 ? `${id}-op-${ativo}` : undefined}
      aria-describedby={ajuda ? `${id}-ajuda` : undefined}
      autoComplete="off"
      placeholder={placeholder}
      value={valor}
      onChange={(e) => {
        aoMudarTexto(e.target.value)
        setAberta(true)
        setAtivo(-1)
      }}
      onKeyDown={teclar}
      onFocus={aoFocar}
      onBlur={() => {
        setAberta(false)
        aoDesfocar?.()
      }}
    />
  )
  return (
    <div className="form-campo form-escolha">
      <label htmlFor={`${id}-campo`}>{rotulo}</label>
      {prefixo !== undefined ? (
        <div className="form-escolha-caixa">
          {prefixo}
          {entrada}
        </div>
      ) : (
        entrada
      )}
      <ul id={`${id}-lista`} role="listbox" aria-label={rotulo} className="form-escolha-lista" hidden={!mostrar}>
        {mostrar &&
          visiveis.map((o, i) => (
            <li
              key={o.id}
              id={`${id}-op-${i}`}
              role="option"
              aria-selected={i === ativo}
              className="form-escolha-opcao"
              // O clique não pode tirar o foco do campo antes de escolher (o blur fecharia a lista).
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => escolher(o)}
            >
              <span className="form-escolha-rotulo">{o.rotulo}</span>
              {o.apoio && <span className="form-escolha-apoio">{o.apoio}</span>}
            </li>
          ))}
      </ul>
      {ajuda && (
        <span id={`${id}-ajuda`} className="form-ajuda">
          {ajuda}
        </span>
      )}
    </div>
  )
}
