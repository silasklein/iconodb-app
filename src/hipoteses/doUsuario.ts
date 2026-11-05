/**
 * O que as telas leem da camada do usuário sobre as hipóteses (Tarefa 10): as hipóteses SKC de um objeto (ou do grupo
 * de ligação, Tarefa 9), as regiões, os elementos novos e a posição sobre uma hipótese do livro. Puro sobre o `Estado`,
 * mais os hooks que re-renderizam só quando a parte lida muda.
 */
import { useMemo } from 'react'
import type { Ancora, Nivel } from '../banco/tipos'
import { posicaoNoTexto } from './ancora'
import { useDonosDosTrechos } from './garantirDonos'
import { useEstado, type Estado } from '../usuario/estado'
import { useLido } from '../usuario/useLido'
import { lerHipotese, lerPosicao, lerRegiao, objetoDaHipotese, type HipoteseSkc, type PosicaoSkc, type RegiaoSkc } from './modelo'

const porCriacao = <T extends { id: string }>(a: T & { criadoEm?: string }, b: T & { criadoEm?: string }) =>
  (a.criadoEm ?? '') < (b.criadoEm ?? '') ? -1 : (a.criadoEm ?? '') > (b.criadoEm ?? '') ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0

/**
 * As hipóteses SKC vivas sobre estes objetos (números ou ids `OB-…`), na ordem em que foram registradas. Uma hipótese
 * ancorada numa leitura SKC é do dono da leitura (`objetoDaHipotese`; revisão 3, M13).
 */
export function hipotesesSkcDosObjetos(estado: Estado, refs: readonly string[]): HipoteseSkc[] {
  if (refs.length === 0) return []
  const alvos = new Set(refs)
  const saida: HipoteseSkc[] = []
  for (const r of estado.registros.get('hipotese')?.values() ?? []) {
    if (r.excluido) continue
    const h = lerHipotese(r)
    const objeto = objetoDaHipotese(h)
    if (objeto !== null && alvos.has(objeto)) saida.push(h)
  }
  return saida.sort(porCriacao)
}

export type PorNivel = Record<Nivel, HipoteseSkc[]> & { semNivel: HipoteseSkc[] }

export function porNivel(lista: readonly HipoteseSkc[]): PorNivel {
  const p: PorNivel = { pre_iconographic: [], iconographic: [], iconological: [], semNivel: [] }
  for (const h of lista) (h.nivel ? p[h.nivel] : p.semNivel).push(h)
  return p
}

/** As regiões vivas (com polígono) desenhadas nestes objetos. */
export function regioesDosObjetos(estado: Estado, refs: readonly string[]): RegiaoSkc[] {
  const alvos = new Set(refs)
  const saida: RegiaoSkc[] = []
  for (const r of estado.registros.get('regiao')?.values() ?? []) {
    if (r.excluido) continue
    const g = lerRegiao(r)
    if (g.objeto !== null && alvos.has(g.objeto) && g.pontos.length >= 3) saida.push(g)
  }
  return saida.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export interface ElementoSkc {
  id: string
  rotulo: string
  pai: string | null
}

/** Os elementos novos (regiões que são o próprio elemento) destes objetos. */
export function elementosSkcDosObjetos(estado: Estado, refs: readonly string[]): ElementoSkc[] {
  return regioesDosObjetos(estado, refs)
    .filter((r) => r.elementoId === r.id)
    .map((r) => ({ id: r.id, rotulo: r.elemento || 'região', pai: r.pai }))
}

/** A posição viva do usuário sobre uma hipótese do livro, ou null. */
export function posicaoDaHipotese(estado: Estado, hipotese: string): PosicaoSkc | null {
  const r = estado.registro('posicao', hipotese)
  return r && !r.excluido ? lerPosicao(r) : null
}

export function useHipotesesSkc(refs: readonly string[]): HipoteseSkc[] {
  const donos = useDonosDosTrechos() // uma hipótese ancorada num trecho do livro é do objeto dele (T17-B-4)
  const chave = `${refs.join('|')}#${donos}`
  return useLido(['hipotese'], chave, (e) => hipotesesSkcDosObjetos(e, refs))
}

export function useRegioesDosObjetos(refs: readonly string[]): RegiaoSkc[] {
  const chave = refs.join('|')
  return useLido(['regiao'], chave, (e) => regioesDosObjetos(e, refs))
}

export function useElementosSkc(refs: readonly string[]): ElementoSkc[] {
  const chave = refs.join('|')
  return useLido(['regiao'], chave, (e) => elementosSkcDosObjetos(e, refs))
}

/** A posição viva sobre uma hipótese do livro; re-renderiza só quando o registro dela muda. */
export function usePosicao(hipotese: string): PosicaoSkc | null {
  const seletor = useMemo(() => {
    let reg: unknown = undefined
    let valor: PosicaoSkc | null = null
    return (e: Estado) => {
      const r = e.registro('posicao', hipotese) ?? null
      if (r !== reg) {
        reg = r
        valor = r && !r.excluido ? lerPosicao(r) : null
      }
      return valor
    }
  }, [hipotese])
  return useEstado(seletor)
}

/**
 * As âncoras das hipóteses SKC num texto de leitura do livro (`fonte` = o trecho `PA-…`, `lingua` "pt" ou "de"), no
 * formato das âncoras do pacote (code points), para a Leitura marcá-las como as dos livros. O trecho que sumiu do texto
 * não é marcado (a hipótese continua na lista e no painel, com o aviso).
 */
export function ancorasDasHipoteses(hipoteses: readonly HipoteseSkc[], fonte: string, lingua: 'pt' | 'de', texto: string): Ancora[] {
  const saida: Ancora[] = []
  for (const h of hipoteses) {
    if (!h.ancora || h.ancora.fonte !== fonte || h.ancora.lingua !== lingua) continue
    const pos = posicaoNoTexto(h.ancora, texto)
    if (!pos) continue
    saida.push({ hipoteseId: h.id, glId: h.termos[0]?.id ?? '', inicio: pos.inicio, fim: pos.fim, nivel: h.nivel, modalidade: h.modalidade })
  }
  return saida
}
