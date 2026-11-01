import { useRef, type FormEvent } from 'react'
import { useAtalhos } from '../app/useAtalhos'
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

  // "/" (fora de campos de texto) leva o foco ao campo: o registro de atalhos cuida das regras comuns.
  useAtalhos(
    {
      '/': () => {
        campo.current?.focus()
        campo.current?.select()
      },
    },
    'global',
    { ativo: atalho },
  )

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
            // Esc: limpa o texto e, com o campo já vazio, sai do campo.
            if (e.key !== 'Escape') return
            e.preventDefault()
            if (valor !== '') aoMudar('')
            else e.currentTarget.blur()
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
