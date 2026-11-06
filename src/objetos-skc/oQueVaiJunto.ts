/**
 * O que fica guardado junto de um objeto SKC quando ele é excluído (spec 2C, §3): só os registros VIVOS que apontam para
 * ele (`imagem.alvo`, `nota.alvo` com `alvoTipo` «objeto», `hipotese.objeto` e `regiao.objeto`). Nada disso é apagado nem
 * escrito: fica escondido enquanto o objeto estiver excluído e volta com «Restaurar». PURO.
 */
import type { Estado, Registro } from '../usuario/fusao'
import type { Tipo } from '../usuario/eventos'

export interface Juncao {
  fotos: number
  notas: number
  hipoteses: number
  regioes: number
}

function contar(estado: Estado, tipo: Tipo, vale: (r: Registro) => boolean): number {
  let n = 0
  for (const r of estado.registros.get(tipo)?.values() ?? []) if (!r.excluido && vale(r)) n++
  return n
}

export function oQueVaiJunto(estado: Estado, objetoId: string): Juncao {
  return {
    fotos: contar(estado, 'imagem', (r) => r.campos.alvo === objetoId),
    notas: contar(estado, 'nota', (r) => r.campos.alvoTipo === 'objeto' && r.campos.alvo === objetoId),
    hipoteses: contar(estado, 'hipotese', (r) => r.campos.objeto === objetoId),
    regioes: contar(estado, 'regiao', (r) => r.campos.objeto === objetoId),
  }
}

/**
 * «A foto e a nota dele», «As 2 fotos, a nota e as 3 hipóteses dele»: na ordem fotos, notas, hipóteses, regiões; o que é
 * zero não aparece; vazio quando tudo é zero.
 */
export function textoDaJuncao(j: Juncao): string {
  const partes = (
    [
      [j.fotos, 'foto', 'fotos'],
      [j.notas, 'nota', 'notas'],
      [j.hipoteses, 'hipótese', 'hipóteses'],
      [j.regioes, 'região', 'regiões'],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, um, varios]) => (n === 1 ? `a ${um}` : `as ${n} ${varios}`))
  if (partes.length === 0) return ''
  const lista = partes.length === 1 ? partes[0]! : `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)!}`
  return `${lista[0]!.toUpperCase()}${lista.slice(1)} dele`
}

/** O que a junção tem no plural? (a frase da confirmação concorda com isto: «ficam guardadas e voltam» / «fica guardada e volta»). */
export const juncaoNoPlural = (j: Juncao): boolean => j.fotos + j.notas + j.hipoteses + j.regioes > 1
