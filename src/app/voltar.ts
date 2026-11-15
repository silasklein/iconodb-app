/**
 * A origem leve de um objeto (decisão 85): quem abre `/item/<n>` de um verbete, de um sítio, de uma obra, da Busca, das
 * notas, de uma coleção SKC ou de Comparar passa no estado do roteador `{ voltar: { rotulo, caminho, indice } }`, e a
 * página do objeto mostra «‹ <rotulo>», que volta no histórico para a tela de onde se veio (com a rolagem e as seções
 * abertas). O grupo e a subcoleção têm a origem deles (origem.ts) e ficam como estão.
 */

/** De onde se veio: o rótulo visível («Verbete: leão-de-teste»), o caminho da tela (com o `?…`) e a posição dela no histórico. */
export interface VoltarDaOrigem {
  rotulo: string
  caminho: string
  /** `history.state.idx` da tela de origem, quando se sabe: o voltar só usa o histórico se a entrada anterior é ela. */
  indice?: number
}

export interface EstadoComVoltar {
  voltar: VoltarDaOrigem
}

const MAXIMO_DO_ROTULO = 200

/** A posição da entrada corrente no histórico (o React Router numera em `history.state.idx`); null fora do navegador de verdade. */
export function indiceNoHistorico(): number | null {
  const estado: unknown = typeof window === 'undefined' ? null : window.history.state
  if (typeof estado !== 'object' || estado === null) return null
  const idx = (estado as { idx?: unknown }).idx
  return typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 ? idx : null
}

/** Um caminho do próprio app: começa com uma barra só (nada de `//outro.site` nem de endereço completo). */
const caminhoDoApp = (c: unknown): c is string => typeof c === 'string' && c.startsWith('/') && !c.startsWith('//') && !/[\s\\]/.test(c)

const rotuloValido = (r: unknown): r is string => typeof r === 'string' && r.trim() !== '' && r.length <= MAXIMO_DO_ROTULO

/** Rótulos mais longos que isto são encurtados (com «…») por quem passa a origem: o limite de leitura (200) é só a defesa. */
export const ROTULO_ATE = 120

/** Encurta o rótulo para caber (o título longo de uma obra sem forma curta), sem cortar no meio de um par de surrogates. */
export function encurtarRotulo(rotulo: string, ate = ROTULO_ATE): string {
  const r = rotulo.trim().replace(/\s+/g, ' ')
  const chars = [...r]
  return chars.length <= ate ? r : `${chars.slice(0, ate - 1).join('').trimEnd()}…`
}

/** A origem leve da tela corrente (lida na hora: a posição no histórico é a da entrada à vista). O rótulo vem encurtado. */
export function voltarPara(rotulo: string, caminho: string, indice: number | null = indiceNoHistorico()): VoltarDaOrigem {
  const r = encurtarRotulo(rotulo)
  return indice === null ? { rotulo: r, caminho } : { rotulo: r, caminho, indice }
}

/** A origem leve do estado do roteador, se ela é válida; senão null. */
export function lerVoltar(state: unknown): VoltarDaOrigem | null {
  if (typeof state !== 'object' || state === null) return null
  const v = (state as { voltar?: unknown }).voltar
  if (typeof v !== 'object' || v === null) return null
  const { rotulo, caminho, indice } = v as Record<string, unknown>
  if (!rotuloValido(rotulo) || !caminhoDoApp(caminho)) return null
  const comIndice = typeof indice === 'number' && Number.isInteger(indice) && indice >= 0
  return comIndice ? { rotulo: rotulo.trim(), caminho, indice } : { rotulo: rotulo.trim(), caminho }
}

/**
 * De onde se veio, para o «‹ …» do objeto: a origem leve, ou a de uma lista (a Busca e as coleções SKC já passam
 * `origem` com o contexto da lista: «Busca», «Coleção: <nome>»). O estado de um grupo ou de uma subcoleção não vale
 * aqui (eles têm o seu voltar), nem um estado de outro tipo: sem origem, null (o objeto fica como sempre foi).
 */
export function voltarDaOrigem(state: unknown): VoltarDaOrigem | null {
  const leve = lerVoltar(state)
  if (leve) return leve
  if (typeof state !== 'object' || state === null) return null
  const { contexto, origem } = state as { contexto?: unknown; origem?: unknown }
  if (typeof contexto !== 'object' || contexto === null || (contexto as { tipo?: unknown }).tipo !== 'lista') return null
  if (typeof origem !== 'object' || origem === null) return null
  const { rotulo, caminho, colecao } = origem as Record<string, unknown>
  if (!rotuloValido(rotulo) || !caminhoDoApp(caminho)) return null
  return { rotulo: colecao === true ? `Coleção: ${rotulo.trim()}` : rotulo.trim(), caminho }
}

/** O estado do roteador com a origem leve junto (o estado de antes fica; sem origem, fica como veio). */
export function comVoltar(state: unknown, voltar: VoltarDaOrigem | null): unknown {
  if (!voltar) return state
  if (typeof state === 'object' && state !== null) return { ...state, voltar } satisfies EstadoComVoltar
  return { voltar } satisfies EstadoComVoltar
}

/** O nome do ícone de voltar do topo do celular, quando há origem. */
export const rotuloDoIconeDeVoltar = (v: Pick<VoltarDaOrigem, 'rotulo'>) => `Voltar (${v.rotulo})`

/**
 * Voltar no histórico ou ir ao caminho? Com a posição da origem, só se a entrada anterior é ela (`atual - 1`); sem a
 * posição (a origem de uma lista, os testes), vale o voltar de sempre: há entrada anterior do app.
 */
export function comoVoltar(v: VoltarDaOrigem, atual: number | null, temAnterior: boolean): 'historico' | 'caminho' {
  if (v.indice !== undefined && atual !== null) return atual - 1 === v.indice ? 'historico' : 'caminho'
  return temAnterior ? 'historico' : 'caminho'
}
