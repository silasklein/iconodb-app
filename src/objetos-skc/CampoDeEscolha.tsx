import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { dobrar } from '../glossario/modelo'
import './Formulario.css'

export interface OpcaoDeEscolha {
  id: string
  rotulo: string
  apoio?: string
  /** O recuo da opção numa árvore (0 ou ausente: sem recuo; cada nível, um passo). */
  nivel?: number
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
  /**
   * Uma linha que explica, no topo da lista, por que o que se digitou não está entre as opções (não se escolhe): o texto para o
   * que está escrito (com 2 letras ou mais), ou null.
   */
  aviso?: (texto: string) => string | null
  /**
   * As opções já vêm filtradas pelo texto (quem chama decide o que casa: «Marcar como parte de…» traz também as partes do sítio
   * que casou). O campo só corta no `limite` e espera as 2 letras.
   */
  filtradas?: boolean
}

/**
 * Um toque ou clique em andamento (do `pointerdown` ao `click` que ele dá, ou ao `pointercancel`), em qualquer lugar da página.
 * Tarefa 16: o campo fecha a lista (e o aviso) quando perde o foco; fechá-los no `mousedown` de um botão logo abaixo (Cancelar)
 * sobe o botão antes de o toque terminar, e o clique se perdia. Durante um toque, a lista só fecha depois do clique.
 *
 * Um gesto que não dá `click` (um botão desabilitado, o botão direito ou o do meio, um `click` que não chega ao documento) não
 * deixa a marca valendo: com o mouse ou a caneta, ela sai logo depois do `pointerup` (numa tarefa à parte, então depois do
 * `click` do mesmo gesto). No toque o `pointerup` vem ANTES do `mousedown` que tira o foco do campo, e a marca só sai no `click`
 * (ou no `pointercancel`); uma tecla também a tira.
 */
let toqueEmAndamento = false
const semToque = () => (toqueEmAndamento = false)
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => (toqueEmAndamento = true), true)
  document.addEventListener('pointercancel', semToque, true)
  document.addEventListener('pointerup', (e) => e.pointerType !== 'touch' && setTimeout(semToque, 0), true)
  document.addEventListener('auxclick', semToque, true)
  document.addEventListener('contextmenu', semToque, true)
  // um toque que não deu clique não fica valendo para a próxima tecla
  document.addEventListener('keydown', semToque, true)
  // na fase de borbulha, no fim: os `click` do alvo já rodaram
  document.addEventListener('click', semToque)
}
/** Os eventos que terminam um gesto sem que o foco tenha voltado ao campo (veja `fecharAoPerderOFoco`). */
const FIM_DO_GESTO = ['pointercancel', 'auxclick', 'contextmenu', 'keydown'] as const

// A dobra (sem acento, sem caixa, sem ʿ ʾ e apóstrofos) é uma só no app: a mesma da chave da forma de um verbete
// (revisão 3 da Tarefa 10, Minor 2), para "a forma exata" do campo Termo e o "Criar termo" nunca discordarem.
export { dobrar }

/**
 * Um campo com sugestões para escolher (Sítio, Obra): um combobox ARIA de verdade. ↓/↑ percorrem, Enter escolhe, Esc
 * fecha a lista; tocar numa opção escolhe. O que a pessoa digita fica no campo (a escolha só troca o texto pelo rótulo).
 */
export function CampoDeEscolha({ rotulo, valor, aoMudarTexto, opcoes, aoEscolher, livre, ajuda, placeholder, limite = 6, aoFocar, aoDesfocar, prefixo, aviso, filtradas = false }: Props) {
  const id = useId()
  const [aberta, setAberta] = useState(false)
  const [ativo, setAtivo] = useState(-1)
  const visiveis = useMemo(() => {
    const d = dobrar(valor)
    if (d.length < 2) return []
    const achadas = (filtradas ? opcoes : opcoes.filter((o) => dobrar(o.rotulo).includes(d) || (o.apoio ? dobrar(o.apoio).includes(d) : false))).slice(0, limite)
    const extra = livre?.(valor.trim())
    return extra && !achadas.some((o) => dobrar(o.rotulo) === d) ? [...achadas, extra] : achadas
  }, [valor, opcoes, limite, livre, filtradas])
  const textoDoAviso = useMemo(() => (aviso && dobrar(valor).length >= 2 ? aviso(valor.trim()) : null), [aviso, valor])
  const mostrar = aberta && visiveis.length > 0
  const mostrarAviso = aberta && textoDoAviso !== null
  const campo = useRef<HTMLInputElement>(null)
  // O fechamento adiado para o fim de um toque (veja `toqueEmAndamento`); desmontado o campo, nada a fazer.
  const adiado = useRef<(() => void) | null>(null)
  useEffect(() => () => adiado.current?.(), [])
  const fecharAoPerderOFoco = () => {
    adiado.current?.()
    if (!toqueEmAndamento) {
      setAberta(false)
      return
    }
    // o `pointerup` deste gesto (que já tirou o foco do campo): fecha numa tarefa à parte, depois do `click` do mesmo gesto, para
    // um gesto sem `click` (botão desabilitado, `click` parado antes do documento) também fechar a lista
    let espera: ReturnType<typeof setTimeout> | undefined
    const aoSoltar = () => {
      clearTimeout(espera)
      espera = setTimeout(fechar, 0)
    }
    const fechar = () => {
      parar()
      semToque()
      // o toque trouxe o foco de volta ao campo: a lista continua
      if (document.activeElement !== campo.current) setAberta(false)
    }
    const parar = () => {
      clearTimeout(espera)
      document.removeEventListener('click', fechar)
      document.removeEventListener('pointerup', aoSoltar, true)
      for (const tipo of FIM_DO_GESTO) document.removeEventListener(tipo, fechar, true)
      adiado.current = null
    }
    document.addEventListener('click', fechar)
    document.addEventListener('pointerup', aoSoltar, true)
    for (const tipo of FIM_DO_GESTO) document.addEventListener(tipo, fechar, true)
    adiado.current = parar
  }
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
      ref={campo}
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
        fecharAoPerderOFoco()
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
      {aviso && (
        // Sempre montada (vazia quando não há aviso), para o leitor de tela anunciar quando o texto aparece.
        <p role="status" className={mostrarAviso ? `form-escolha-aviso${mostrar ? ' form-escolha-aviso-junto' : ''}` : 'form-escolha-aviso-vazio'}>
          {mostrarAviso ? textoDoAviso : null}
        </p>
      )}
      <ul id={`${id}-lista`} role="listbox" aria-label={rotulo} className={`form-escolha-lista${mostrarAviso ? ' form-escolha-lista-com-aviso' : ''}`} hidden={!mostrar}>
        {mostrar &&
          visiveis.map((o, i) => (
            <li
              key={o.id}
              id={`${id}-op-${i}`}
              role="option"
              aria-selected={i === ativo}
              className="form-escolha-opcao"
              data-nivel={o.nivel ? Math.min(o.nivel, 6) : undefined}
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
