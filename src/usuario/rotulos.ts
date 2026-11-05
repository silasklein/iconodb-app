/**
 * O que a pessoa reconhece de um registro (A-11 da Tarefa 17), lido do estado de agora: os campos do registro e o número
 * de agora dos objetos SKC (`OB-…`). As telas da sincronização ("Vai subir", "Mesmo campo nos dois aparelhos") usam isto
 * em vez do id. Os textos em si são de textosDaSync.ts (puro).
 */
import { numeracaoDe } from '../objetos-skc/atual'
import { estadoAtual } from './estado'
import type { Op, Tipo } from './eventos'
import { caminhoDoRegistro, descreverMudanca, descreverRegistro } from './textosDaSync'

type NumeroDe = (ref: string) => string | null

/** O número de agora de um objeto SKC, com a numeração calculada uma vez (só se alguém perguntar) para o estado dado. */
function numerosDe(estado: ReturnType<typeof estadoAtual>): NumeroDe {
  let numeracao: ReturnType<typeof numeracaoDe> | null = null
  return (ref) => {
    if (!ref.startsWith('OB-')) return null
    try {
      numeracao ??= numeracaoDe(estado)
      return numeracao.porId.get(ref)?.numero ?? null
    } catch {
      return null
    }
  }
}

/** "Nota em CA00001", "Coleção «Selos»"… (o id só quando o registro não é conhecido aqui). */
export function rotuloDoRegistro(tipo: Tipo, reg: string): string {
  const estado = estadoAtual()
  return descreverRegistro(tipo, reg, estado.registro(tipo, reg)?.campos ?? null, numerosDe(estado))
}

export interface LinhaDaMudanca {
  texto: string
  /** A tela do registro (null se não há). */
  caminho: string | null
}

/**
 * As linhas de "Vai subir", na ordem dada. A numeração dos objetos SKC é calculada uma vez para a lista toda (revisão 1 da
 * Tarefa 17a, m6), e só se alguma linha cita um objeto SKC.
 */
export function linhasDasMudancas(lista: readonly { tipo: Tipo; reg: string; op: Op }[]): LinhaDaMudanca[] {
  const estado = estadoAtual()
  const numeroDe = numerosDe(estado)
  return lista.map(({ tipo, reg, op }) => {
    const campos = estado.registro(tipo, reg)?.campos ?? null
    return { texto: descreverMudanca(tipo, reg, op, campos, numeroDe), caminho: caminhoDoRegistro(tipo, reg, campos) }
  })
}
