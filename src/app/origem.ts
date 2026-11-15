import type { EstadoVindoDaBusca } from '../busca/url'

/**
 * O que o Grupo passa à tela do item (`location.state`): o grupo como contexto de
 * anterior/próximo e a origem para o "voltar". `origem.subcolecao`: veio de uma subcoleção
 * (o contexto é ela, não o grupo de cima).
 */
export interface EstadoVindoDoGrupo {
  contexto: { tipo: 'grupo'; id: string }
  origem: { rotulo: string; caminho: string; subcolecao?: boolean }
}

export const estadoDoGrupo = (id: string, titulo: string, caminho: string, subcolecao = false): EstadoVindoDoGrupo => ({
  contexto: { tipo: 'grupo', id },
  origem: subcolecao ? { rotulo: titulo, caminho, subcolecao: true } : { rotulo: titulo, caminho },
})

/**
 * O que a lista «Subcoleções» do grupo passa à subcoleção (`passos: 1`), e as vizinhas repassam com `passos + 1`:
 * quantas entradas o «‹ grupo» da subcoleção volta no histórico para reencontrar o grupo `subDoPai` como estava
 * (sem empilhar o grupo de novo, o que faria laço com o «Voltar às coleções» dele).
 */
export interface EstadoVindoDoPai {
  subDoPai: string
  passos: number
}

export const estadoVindoDoPai = (pai: string, passos = 1): EstadoVindoDoPai => ({ subDoPai: pai, passos })

/** Os passos até o grupo `pai` no histórico, se se chegou à subcoleção a partir dele; null sem a marca (link direto, busca, «No livro»). */
export function passosAtePai(state: unknown, pai: string): number | null {
  if (typeof state !== 'object' || state === null) return null
  const { subDoPai, passos } = state as Partial<EstadoVindoDoPai>
  return subDoPai === pai && typeof passos === 'number' && Number.isInteger(passos) && passos > 0 ? passos : null
}

/** O estado com que se chega ao item: da Busca (lista) ou de um Grupo. Sem estado, o item cai no grupo dele. */
export type EstadoDeOrigem = EstadoVindoDaBusca | EstadoVindoDoGrupo
