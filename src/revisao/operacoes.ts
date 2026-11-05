/**
 * As ações da Revisão: "Deixar como está" (marcar o caso como resolvido) e "Desfazer". Cada uma grava UM evento do tipo
 * `revisao`, pelo `registrar` de sempre (IndexedDB primeiro). O registro tem como `reg` a chave estável do caso
 * (src/revisao/chave.ts); ele existe e não está excluído = o caso está resolvido. Desfazer é `excluir` (reversível), e marcar de
 * novo é `restaurar`. Tudo se funde como o resto: dois aparelhos que marcam e desfazem convergem pela marca de maior hlc.
 */
import { estadoAtual, registrar, registrarVarios } from '../usuario/estado'
import type { Evento } from '../usuario/eventos'

/**
 * Marca o caso como resolvido. Já resolvido: não grava nada (devolve null). `tipo` é o motivo, para quem ler o diário.
 * Um caso que este aparelho não conhece ainda grava `criar` + `restaurar` numa só gravação: se outro aparelho já o resolveu e
 * desfez antes (sem este aparelho ver), a marca mais nova vence, e é a desta pessoa; um `criar` sozinho não desfaria o `excluir`
 * de lá.
 */
export async function marcarComoResolvido(chave: string, tipo: string): Promise<Evento | null> {
  const r = estadoAtual().registro('revisao', chave)
  if (!r) {
    const eventos = await registrarVarios([
      { tipo: 'revisao', reg: chave, op: 'criar', campos: { tipo } },
      { tipo: 'revisao', reg: chave, op: 'restaurar', campos: {} },
    ])
    return eventos[0] ?? null
  }
  if (r.excluido) return registrar('revisao', chave, 'restaurar')
  return null
}

/** Desfaz: o caso volta à fila. Já em aberto: não grava nada (devolve null). */
export async function desfazerResolvido(chave: string): Promise<Evento | null> {
  const r = estadoAtual().registro('revisao', chave)
  if (!r || r.excluido) return null
  return registrar('revisao', chave, 'excluir')
}
