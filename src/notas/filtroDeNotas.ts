import { fold, textoIndexado, type FoldTabela } from '../busca/fold'
import { dataDaNota } from './formato'
import type { NotaVista } from './indiceDeNotas'
import { textoSemLinks, type TipoDeRef } from './links'
import type { Registro } from '../usuario/estado'

/** "Ligada a", o filtro de Minhas notas (MinhasNotas.dc.html): o tipo de coisa a que a nota se liga. */
export type LigadaA = '' | 'objeto' | 'verbete' | 'hipotese' | 'obra' | 'sitio' | 'grupo' | 'colecao'

export const OPCOES_LIGADA: readonly { valor: LigadaA; rotulo: string }[] = [
  { valor: '', rotulo: 'qualquer coisa' },
  { valor: 'objeto', rotulo: 'um objeto' },
  { valor: 'verbete', rotulo: 'um verbete' },
  { valor: 'hipotese', rotulo: 'uma hipótese' },
  { valor: 'obra', rotulo: 'uma obra' },
  { valor: 'sitio', rotulo: 'um sítio' },
  { valor: 'grupo', rotulo: 'um grupo' },
  { valor: 'colecao', rotulo: 'uma coleção' },
]

export const ehLigadaA = (x: unknown): x is LigadaA => OPCOES_LIGADA.some((o) => o.valor === x)

/** O tipo da lista que um tipo de referência conta (um objeto SKC citado pelo número é um objeto). */
const tipoDoFiltro = (t: TipoDeRef): LigadaA | null => (t === 'objeto-skc' ? 'objeto' : t === 'colecao-item' ? 'colecao' : t)

/** A nota se liga a uma coisa deste tipo? Pelo alvo dela ou por um `[[…]]` do texto. */
export function ligadaA(nota: Pick<NotaVista, 'alvoTipo' | 'ligacoes'>, tipo: LigadaA): boolean {
  if (tipo === '') return true
  if (nota.alvoTipo === tipo || (tipo === 'colecao' && nota.alvoTipo === 'colecao-item')) return true
  return nota.ligacoes.some((l) => tipoDoFiltro(l.tipo) === tipo)
}

export interface GrupoDeNotas {
  /** "31/10/2026". */
  data: string
  notas: NotaVista[]
}

/** Junta as notas seguidas do mesmo dia (a lista já vem pela data). */
export function agruparPorData(notas: readonly NotaVista[]): GrupoDeNotas[] {
  const grupos: GrupoDeNotas[] = []
  for (const n of notas) {
    const data = dataDaNota(n)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo?.data === data) ultimo.notas.push(n)
    else grupos.push({ data, notas: [n] })
  }
  return grupos
}

const buscaDeCadaNota = new WeakMap<Registro, { tabela: FoldTabela; busca: string }>()

/** O que a busca de Minhas notas procura numa nota, dobrado: o texto (os links pelo rótulo), o alvo e o que ela cita. */
function buscaDa(nota: NotaVista, tabela: FoldTabela): string {
  const guardada = buscaDeCadaNota.get(nota.registro)
  if (guardada && guardada.tabela === tabela) return guardada.busca
  const partes = [textoSemLinks(nota.texto), nota.alvo ?? '', ...nota.ligacoes.map((l) => l.ref)]
  const busca = textoIndexado(partes.join(' '), tabela)
  buscaDeCadaNota.set(nota.registro, { tabela, busca })
  return busca
}

/** As notas que têm todas as palavras da consulta (dobrada) e se ligam ao tipo escolhido. Sem filtro, a mesma lista. */
export function filtrarNotas(notas: readonly NotaVista[], filtro: { consulta: string; ligada: LigadaA }, tabela: FoldTabela): readonly NotaVista[] {
  const palavras = fold(filtro.consulta, tabela).split(' ').filter(Boolean)
  if (palavras.length === 0 && filtro.ligada === '') return notas
  return notas.filter((n) => ligadaA(n, filtro.ligada) && palavras.every((p) => buscaDa(n, tabela).includes(p)))
}

