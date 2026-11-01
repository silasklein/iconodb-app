import { useLocation, useNavigate } from 'react-router'
import { emCampoDeTexto, IR_PARA } from './atalhos'
import { useAtalhos } from './useAtalhos'

/**
 * Os atalhos de ir a uma seção (auditoria UX, seção 4): `g` e depois a letra; `?` abre a lista de atalhos
 * e convenções. Ficam no registro de atalhos (atalhos.ts), que cuida das regras comuns: nada em campos de
 * texto, com modificadores nem com um diálogo modal aberto. Valem no app todo, com ou sem barra superior.
 */
export const ATALHOS_DE_IR: Record<string, string> = Object.fromEntries(Object.entries(IR_PARA).map(([letra, v]) => [letra, v.caminho]))

export const CAMINHO_DOS_ATALHOS = '/atalhos'
export { emCampoDeTexto }

export function useAtalhosDeNavegacao(): void {
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const mapa: Record<string, () => void | false> = {
    '?': () => {
      if (pathname === CAMINHO_DOS_ATALHOS) return false
      void navegar(CAMINHO_DOS_ATALHOS)
    },
  }
  for (const [letra, caminho] of Object.entries(ATALHOS_DE_IR)) mapa[`g ${letra}`] = () => void navegar(caminho)
  useAtalhos(mapa, 'global')
}

/** As linhas que as teclas J e K (e as setas) percorrem: cartões de objeto, linhas das listas e grupos das coleções. */
export const LINHAS_DA_LISTA = '.cartao-objeto, .lista-linha, .colecoes-grupo'

/** Move o foco ao item seguinte (+1) ou anterior (-1) da lista ou da grade. Sem item para ir, não toma a tecla. */
function mover(passo: 1 | -1, soComFoco: boolean): void | false {
  const itens = [...document.querySelectorAll<HTMLElement>(LINHAS_DA_LISTA)].filter((el) => !el.closest('[inert], [hidden], [aria-hidden="true"]'))
  if (itens.length === 0) return false
  const ativo = document.activeElement
  const i = itens.findIndex((el) => el === ativo || el.contains(ativo))
  if (i < 0 && soComFoco) return false
  const destino = i < 0 ? (passo > 0 ? itens[0] : itens[itens.length - 1]) : itens[i + passo]
  if (!destino) return false
  destino.focus()
  destino.scrollIntoView?.({ block: 'nearest' })
}

/** J e K percorrem a lista; as setas ↑ ↓ também, mas só quando um item já está em foco (senão rolam a página). */
export function useAtalhosDeLista(): void {
  useAtalhos(
    {
      j: () => mover(1, false),
      k: () => mover(-1, false),
      ArrowDown: () => mover(1, true),
      ArrowUp: () => mover(-1, true),
    },
    'lista',
  )
}

/** Os atalhos que valem em qualquer tela: ir a uma seção, `?` e percorrer listas. */
export function AtalhosGlobais(): null {
  useAtalhosDeNavegacao()
  useAtalhosDeLista()
  return null
}
