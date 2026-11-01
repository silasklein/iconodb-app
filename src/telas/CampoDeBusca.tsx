import { useEffect, useRef, type FormEvent } from 'react'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import './CampoDeBusca.css'

interface Props {
  id: string
  valor: string
  aoMudar: (texto: string) => void
  aoEnviar: (texto: string) => void
  /** A tecla "/" (fora de campos de texto) leva o foco a este campo. */
  atalho?: boolean
  placeholder?: string
  /**
   * "pagina" (padrão): o campo das telas de busca e do Início no celular.
   * "inicio": o campo grande do Início no computador, com o rótulo visível e a dica "/".
   * "barra": o campo da barra superior, com o rótulo "Buscar" dentro da caixa e a dica "/".
   */
  variante?: 'pagina' | 'inicio' | 'barra'
}

/**
 * O campo de busca (Busca.dc.html, Main.dc.html): rótulo "Buscar", lupa, campo, limpar.
 * É controlado; quem usa decide o que fazer ao digitar (a Busca atualiza o resultado) e ao
 * enviar (o Início vai para a Busca, com useIrParaBusca).
 */
export function CampoDeBusca({ id, valor, aoMudar, aoEnviar, atalho = false, placeholder, variante = 'pagina' }: Props) {
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!atalho) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const alvo = e.target as HTMLElement | null
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return
      e.preventDefault()
      campo.current?.focus()
      campo.current?.select()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [atalho])

  const limpar = () => {
    aoMudar('')
    campo.current?.focus()
  }

  const noBotao = variante === 'barra'
  const dicaDoAtalho = variante !== 'pagina' && atalho && valor === ''
  return (
    <form
      className={`campo-busca${variante === 'pagina' ? '' : ` campo-busca-${variante}`}`}
      role="search"
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        aoEnviar(valor)
      }}
    >
      {!noBotao && (
        <label className="campo-busca-rotulo" htmlFor={id}>
          Buscar
        </label>
      )}
      <div className="campo-busca-caixa">
        {noBotao ? (
          <label className="campo-busca-rotulo" htmlFor={id}>
            <Icon name="buscar" size={18} />
            Buscar
          </label>
        ) : (
          <Icon name="buscar" size={20} />
        )}
        <input
          id={id}
          ref={campo}
          name="q"
          type="search"
          value={valor}
          placeholder={placeholder}
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-keyshortcuts={atalho ? '/' : undefined}
          onChange={(e) => aoMudar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && valor !== '') {
              e.preventDefault()
              aoMudar('')
            }
          }}
        />
        {dicaDoAtalho && (
          <kbd className="campo-busca-tecla" aria-hidden="true">
            /
          </kbd>
        )}
        {valor !== '' && (
          <IconButton icon="fechar" label="Limpar a busca" shortcut="Escape" shortcutLabel="Esc" size={18} onClick={limpar} />
        )}
      </div>
    </form>
  )
}
