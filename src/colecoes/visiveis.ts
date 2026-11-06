/**
 * Os membros de uma coleção que a pessoa vê: sem os objetos SKC excluídos (2C, bloco 1, §3). Nada é escrito na coleção ao
 * excluir o objeto: a presença (`m:<ref>`) e a ordem (`i:<ref>`) continuam no registro, e por isso «Restaurar» devolve a linha
 * ao mesmo lugar. A ref pode ser o id (`OB-…`) ou o número (`CA00005`) do objeto.
 */
import { numeracaoDe } from '../objetos-skc/atual'
import type { Estado } from '../usuario/estado'
import type { ColecaoVista } from './modelo'

/** As refs (ids e números) dos objetos SKC excluídos. Vazio, o caso comum, sem calcular a numeração. */
export function refsDeObjetosExcluidos(estado: Estado): ReadonlySet<string> {
  const saida = new Set<string>()
  const excluidos = [...(estado.registros.get('objeto')?.values() ?? [])].filter((r) => r.excluido && r.id.startsWith('OB-'))
  if (excluidos.length === 0) return saida
  const numeracao = numeracaoDe(estado)
  for (const r of excluidos) {
    saida.add(r.id)
    const numero = numeracao.porId.get(r.id)?.numero
    if (numero) saida.add(numero)
  }
  return saida
}

/** A coleção sem os membros excluídos; a mesma coleção (a mesma identidade) quando nenhum membro está excluído. */
export function semMembrosExcluidos(c: ColecaoVista, estado: Estado): ColecaoVista {
  if (c.membros.length === 0) return c
  const fora = refsDeObjetosExcluidos(estado)
  if (fora.size === 0 || !c.membros.some((m) => fora.has(m.ref))) return c
  return { ...c, membros: c.membros.filter((m) => !fora.has(m.ref)) }
}
