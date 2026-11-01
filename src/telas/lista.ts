/**
 * O que as listas (Glossário, Bibliografia, Sítios) têm em comum: um índice com o texto já dobrado
 * (a mesma dobra da busca, `nucleo/fold.json`), a ordem alfabética pela forma dobrada e o filtro
 * por palavras. O índice é montado uma vez, quando a lista chega; cada tecla só percorre as chaves.
 */
import { fold, textoIndexado, type FoldTabela } from '../busca/fold'

export interface Entrada<T> {
  item: T
  /** O nome dobrado: define a ordem e a letra do cabeçalho. */
  ordem: string
  /** Tudo o que a busca da lista procura neste item, dobrado (inclui a forma colada dos apóstrofos). */
  busca: string
}

/** Monta as entradas, já em ordem alfabética (pela forma dobrada, sem diacríticos nem sinais de grafia). */
export function indexar<T>(itens: readonly T[], tabela: FoldTabela, nomeDe: (item: T) => string, buscaDe: (item: T) => string): Entrada<T>[] {
  return itens
    .map((item): Entrada<T> => ({ item, ordem: fold(nomeDe(item), tabela), busca: textoIndexado(buscaDe(item), tabela) }))
    .sort((x, y) => (x.ordem < y.ordem ? -1 : x.ordem > y.ordem ? 1 : 0))
}

/**
 * As entradas que têm todas as palavras da consulta (dobrada). Consulta vazia: a mesma lista, sem copiar
 * (o React vê o mesmo array e não refaz o que depende dele).
 */
export function filtrar<T>(entradas: Entrada<T>[], consulta: string, tabela: FoldTabela): Entrada<T>[] {
  const palavras = fold(consulta, tabela).split(' ').filter(Boolean)
  if (palavras.length === 0) return entradas
  return entradas.filter((e) => palavras.every((p) => e.busca.includes(p)))
}

/** A letra do cabeçalho: a inicial da forma dobrada, em maiúscula; "#" para números e sinais. */
export function inicialDe(ordem: string): string {
  const primeira = [...ordem][0] ?? ''
  return /^\p{L}$/u.test(primeira) ? primeira.toLocaleUpperCase('pt') : '#'
}

export interface Grupo<T> {
  chave: string
  entradas: Entrada<T>[]
}

/** Junta as entradas seguidas que têm a mesma chave (a lista já vem ordenada pela chave). */
export function agrupar<T>(entradas: readonly Entrada<T>[], chaveDe: (e: Entrada<T>) => string): Grupo<T>[] {
  const grupos: Grupo<T>[] = []
  for (const e of entradas) {
    const chave = chaveDe(e)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo?.chave === chave) ultimo.entradas.push(e)
    else grupos.push({ chave, entradas: [e] })
  }
  return grupos
}
