import type { ReactNode } from 'react'
import { IconButton } from './IconButton'
import { useBreakpoint } from './useBreakpoint'
import './TopoDoCelular.css'

interface Props {
  /** O destino do Voltar, no formato do HashRouter ("#/colecoes"). */
  voltar: { href: string; rotulo?: string }
  /** A lupa à direita (padrão): leva à Busca. */
  busca?: boolean
  /** Ícones da tela, à direita, depois da lupa (o Item: hipóteses por nível e original alemão). */
  acoes?: ReactNode
}

/**
 * O topo das telas do celular (Grupos.dc.html e outras): Voltar à esquerda, lupa à direita.
 * No computador não há nada: a barra superior traz o logo, a busca e as seções.
 */
export function TopoDoCelular({ voltar, busca = true, acoes }: Props) {
  if (useBreakpoint() === 'computador') return null
  return (
    <div className="topo-celular">
      <IconButton icon="voltar" label={voltar.rotulo ?? 'Voltar'} href={voltar.href} tipPosition="start" />
      {acoes ? (
        <span className="topo-celular-acoes">
          {busca && <IconButton icon="buscar" label="Buscar" shortcut="/" href="#/busca" />}
          {acoes}
        </span>
      ) : (
        busca && <IconButton icon="buscar" label="Buscar" shortcut="/" href="#/busca" />
      )}
    </div>
  )
}
