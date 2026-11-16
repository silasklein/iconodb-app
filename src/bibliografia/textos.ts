/**
 * Os textos de «É esta» ao editar (`trocarPorEsta`) e da volta com «Restaurar» (`restaurarObra`): o que passa para a outra
 * obra, e o que volta. Os mesmos na confirmação, na página da obra e em «Excluídos».
 */
import type { TrocaDaObra } from './modelo'

const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** «1 ligação de citação e 2 objetos SKC»; '' sem nada. */
export function oQueMove(ligacoes: number, objetos: number): string {
  return [ligacoes ? contar(ligacoes, 'ligação de citação', 'ligações de citação') : '', objetos ? contar(objetos, 'objeto SKC', 'objetos SKC') : '']
    .filter(Boolean)
    .join(' e ')
}

/** A confirmação de «É esta» ao editar. */
export function textoDaTroca(ligacoes: number, objetos: number, rotulo: string): string {
  const move = oQueMove(ligacoes, objetos)
  const passa = ligacoes + objetos === 1 ? 'passa' : 'passam'
  return (
    (move ? `A sua obra é excluída e ${move} ${passa} para «${rotulo}». ` : `A sua obra é excluída; nada está ligado a ela. `) +
    '«Restaurar», em «Excluídos» ou na página da obra, traz a obra de volta' +
    (move ? ' e devolve a ela o que passou.' : '.')
  )
}

/** O que «Restaurar» devolve a uma obra trocada. */
export function textoDaVolta(t: TrocaDaObra): string {
  const move = oQueMove(t.ligacoes.length, t.objetos.length)
  return move
    ? `Ela foi trocada por «${t.rotulo}»: ${move} que ${t.ligacoes.length + t.objetos.length === 1 ? 'passou volta' : 'passaram voltam'} para ela.`
    : `Ela foi trocada por «${t.rotulo}»; nada estava ligado a ela.`
}
