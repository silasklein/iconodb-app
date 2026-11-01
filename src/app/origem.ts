import type { EstadoVindoDaBusca } from '../busca/url'

/**
 * O que o Grupo passa à tela do item (`location.state`): o grupo como contexto de
 * anterior/próximo e a origem para o "voltar".
 */
export interface EstadoVindoDoGrupo {
  contexto: { tipo: 'grupo'; id: string }
  origem: { rotulo: string; caminho: string }
}

export const estadoDoGrupo = (id: string, titulo: string, caminho: string): EstadoVindoDoGrupo => ({
  contexto: { tipo: 'grupo', id },
  origem: { rotulo: titulo, caminho },
})

/** O estado com que se chega ao item: da Busca (lista) ou de um Grupo. Sem estado, o item cai no grupo dele. */
export type EstadoDeOrigem = EstadoVindoDaBusca | EstadoVindoDoGrupo
