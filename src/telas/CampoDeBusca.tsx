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
}

/**
 * O campo de busca (Busca.dc.html, Main.dc.html): rótulo "Buscar", lupa, campo, limpar.
 * É controlado; quem usa decide o que fazer ao digitar (a Busca atualiza o resultado) e ao
 * enviar (o Início vai para a Busca, com useIrParaBusca).
 */
export function CampoDeBusca({ id, valor, aoMudar, aoEnviar, atalho = false, placeholder }: Props) {
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

  return (
    <form
      className="campo-busca"
      role="search"
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        aoEnviar(valor)
      }}
    >
      <label className="campo-busca-rotulo" htmlFor={id}>
        Buscar
      </label>
      <div className="campo-busca-caixa">
        <Icon name="buscar" size={20} />
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
        {valor !== '' && (
          <IconButton icon="fechar" label="Limpar a busca" shortcut="Escape" shortcutLabel="Esc" size={18} onClick={limpar} />
        )}
      </div>
    </form>
  )
}
