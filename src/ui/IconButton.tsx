import { Icon, type IconName, type IconSize } from './Icon'
import './Tooltip.css'
import './IconButton.css'

interface Comum {
  icon: IconName
  /** Nome acessível (aria-label) e texto da dica. Ícones nunca têm rótulo visível. */
  label: string
  /** Atalho no formato de aria-keyshortcuts, por exemplo "/", "g c" ou "Escape". */
  shortcut?: string
  /** Como o atalho aparece na dica, quando difere do valor de aria-keyshortcuts (ex.: "Esc"). */
  shortcutLabel?: string
  size?: IconSize
  /** "end" (padrão): dica alinhada à direita do botão. "start": alinhada à esquerda. */
  tipPosition?: 'start' | 'end'
  /** Dica acima do botão (barras de ferramentas no pé da tela). */
  tipAbove?: boolean
  /** Botão que abre um painel ou menu: `aria-expanded` / `aria-haspopup`. */
  expandido?: boolean
  abre?: 'dialog' | 'menu'
}

type AcaoBotao = { onClick: () => void; href?: never }
/** Links usam o href do HashRouter, por exemplo "#/busca". */
type AcaoLink = { href: string; onClick?: never }

export type IconButtonProps = Comum & (AcaoBotao | AcaoLink)

export function IconButton(props: IconButtonProps) {
  const { icon, label, shortcut, shortcutLabel, size = 20, tipPosition = 'end', tipAbove = false } = props
  const dica = shortcut ? `${label} (${shortcutLabel ?? shortcut})` : label
  const classes = ['icon-button', tipPosition === 'start' ? 'tip-start' : '', tipAbove ? 'tip-up' : '']
    .filter(Boolean)
    .join(' ')
  const comum = {
    className: classes,
    'aria-label': label,
    'aria-keyshortcuts': shortcut,
    'aria-expanded': props.expandido,
    'aria-haspopup': props.abre,
    'data-tip': dica,
  }
  const glifo = <Icon name={icon} size={size} />

  if (props.href !== undefined) {
    return (
      <a {...comum} href={props.href}>
        {glifo}
      </a>
    )
  }
  return (
    <button {...comum} type="button" onClick={props.onClick}>
      {glifo}
    </button>
  )
}
