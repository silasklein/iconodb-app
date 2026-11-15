import type { MouseEvent, ReactNode } from 'react'
import { IconButton } from './IconButton'
import { useVoltar } from './useVoltar'
import { useBreakpoint } from './useBreakpoint'
import './TopoDoCelular.css'

interface Props {
  /** O destino do Voltar, no formato do HashRouter ("#/colecoes"). `aoClicar` troca o voltar de sempre (o da origem do objeto). */
  voltar: { href: string; rotulo?: string; aoClicar?: (e: MouseEvent<HTMLAnchorElement>) => void }
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
  const aoVoltar = useVoltar(voltar.href)
  if (useBreakpoint() === 'computador') return null
  return (
    <div className="topo-celular">
      <IconButton icon="voltar" label={voltar.rotulo ?? 'Voltar'} href={voltar.href} onClick={voltar.aoClicar ?? aoVoltar} tipPosition="start" />
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
