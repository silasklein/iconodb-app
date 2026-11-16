/**
 * O nível revisto de uma hipótese dos livros (Parte 2C, bloco 3, spec §5.4): o registro `nivel` da camada do usuário.
 *
 * FORMATO (congelado: o `user-import` do processamento o lê, `iconodb/usuario_import.py`, `niveis_do_usuario`).
 *
 * `nivel`, reg = o id da hipótese dos livros (`HY-<dígitos>`; a hipótese SKC tem o nível nela mesma).
 * - Campo `nivel`: `pre_iconographic` | `iconographic` | `iconological` (os códigos do pacote). Vale a última escrita.
 * - «Voltar ao nível automático» = `excluir` (a hipótese volta ao nível do pacote; o registro vai para «Excluídos», e
 *   «Restaurar» devolve o nível revisto). O processamento também lê `nivel` null como o automático.
 * - Uma hipótese que some num pacote novo: o registro fica na camada, sem erro (foco 4); o app só não tem onde mostrá-lo.
 *
 * O NÍVEL QUE VALE (Tarefa 13; fix round 1, decisão do controlador): o registro vivo da pessoa; sem ele, o `level_auto` (o pacote
 * já publicou uma revisão que depois foi desfeita); sem ele, o `level`. Vale no marcador do texto, nos blocos e nas contagens de
 * «Hipóteses por nível», no painel, no verbete, na faceta Nível da busca e em «Comparar». A nota «Nível revisto por você»
 * aparece só enquanto um registro vivo difere do automático.
 *
 * «Voltar ao nível automático» (e escolher o automático no seletor) SEMPRE exclui o registro, antes e depois de publicado:
 * nunca grava um registro que fixe um nível, porque ele passaria por cima de um automático novo de uma passada seguinte. O
 * `user-import` tira de `niveis.json` a hipótese do registro excluído, e o build seguinte publica o automático, com
 * `level_auto` NULL. «Restaurar» (Excluídos) devolve o nível da pessoa.
 */
import { useMemo } from 'react'
import { ordenarHipoteses, porNivel } from '../banco/consultas'
import { NIVEIS, type Ancora, type Hipotese, type ItemDetalhe, type Nivel } from '../banco/tipos'
import { estadoAtual, registrarVarios, useEstado } from '../usuario/estado'
import type { Evento } from '../usuario/eventos'
import type { Estado, Registro } from '../usuario/fusao'
import { eHipoteseDoLivro } from './modelo'

const eNivel = (x: unknown): x is Nivel => typeof x === 'string' && (NIVEIS as readonly string[]).includes(x)

/** O nível que a pessoa deu a uma hipótese dos livros, ou null (vale o automático, o do pacote). */
export function nivelRevisto(estado: Estado, hipotese: string): Nivel | null {
  const r = estado.registro('nivel', hipotese)
  if (!r || r.excluido) return null
  return eNivel(r.campos.nivel) ? r.campos.nivel : null
}

/**
 * Revê o nível de uma hipótese dos livros. Um registro que este aparelho não conhece, ou que está excluído (voltou ao
 * automático), grava também um `restaurar` na mesma gravação: a revisão mais nova vence uma volta ao automático feita em outro
 * aparelho sem este ver.
 */
export async function reverNivel(hipotese: string, nivel: Nivel): Promise<Evento> {
  if (!eHipoteseDoLivro(hipotese)) throw new Error(`não é uma hipótese dos livros: ${JSON.stringify(hipotese)}`)
  if (!eNivel(nivel)) throw new Error(`nível desconhecido: ${JSON.stringify(nivel)}`)
  const r = estadoAtual().registro('nivel', hipotese)
  const eventos = await registrarVarios([
    { tipo: 'nivel', reg: hipotese, op: r ? 'alterar' : 'criar', campos: { nivel } },
    ...(!r || r.excluido ? [{ tipo: 'nivel' as const, reg: hipotese, op: 'restaurar' as const, campos: {} }] : []),
  ])
  return eventos[0]!
}

/** Volta ao nível automático (exclui a revisão). Sem revisão viva: não grava nada (null). */
export async function voltarAoAutomatico(hipotese: string): Promise<Evento | null> {
  const r = estadoAtual().registro('nivel', hipotese)
  if (!r || r.excluido) return null
  const [evento] = await registrarVarios([{ tipo: 'nivel', reg: hipotese, op: 'excluir', campos: {} }])
  return evento ?? null
}

// ---------------------------------------------------------------------------
// O nível que vale (Tarefa 13)
// ---------------------------------------------------------------------------

/** Os registros `nivel` da camada (o mapa do tipo; o mesmo objeto enquanto nenhum nível muda). */
export type NiveisDaCamada = ReadonlyMap<string, Registro> | undefined

type DoPacote = Pick<Hipotese, 'id' | 'nivel' | 'nivelAutomatico'>

export interface NivelDaHipoteseDoLivro {
  /** O nível que vale: o do registro vivo da pessoa, ou o automático. */
  efetivo: Nivel
  /** O que a atribuição automática deu: `level_auto` (pacote já com a revisão) ou `level`. */
  automatico: Nivel
  /** Um registro vivo difere do automático: a nota «Nível revisto por você». */
  revisto: boolean
}

/** O nível de uma hipótese dos livros com a camada (veja o cabeçalho). Um registro de outra hipótese não muda nada. */
export function nivelDaHipoteseDoLivro(niveis: NiveisDaCamada, h: DoPacote): NivelDaHipoteseDoLivro {
  const automatico = h.nivelAutomatico ?? h.nivel
  const r = niveis?.get(h.id)
  const efetivo = r && !r.excluido && eNivel(r.campos.nivel) ? r.campos.nivel : automatico
  return { efetivo, automatico, revisto: efetivo !== automatico }
}

/** A hipótese com o nível que vale em `nivel` (a mesma, se nada muda). */
export function comNivelRevisto<H extends DoPacote>(niveis: NiveisDaCamada, h: H): H {
  const { efetivo } = nivelDaHipoteseDoLivro(niveis, h)
  return efetivo === h.nivel ? h : { ...h, nivel: efetivo }
}

/**
 * O objeto do livro com o nível que vale em cada hipótese: os blocos de «Hipóteses por nível» (e as contagens) refeitos, na
 * ordem de leitura, e o nível das âncoras do texto. Mesmo sem nenhum registro, uma hipótese com `level_auto` volta ao
 * automático. Sem nada que mude, o mesmo objeto.
 */
export function comNiveisRevistos(niveis: NiveisDaCamada, d: ItemDetalhe): ItemDetalhe {
  const proprias = NIVEIS.flatMap((n) => d.hipotesesPorNivel[n])
  const novas = proprias.map((h) => comNivelRevisto(niveis, h))
  const outras = d.outrasHipoteses.map((h) => comNivelRevisto(niveis, h))
  const mudou = (a: readonly Hipotese[], b: readonly Hipotese[]) => a.some((h, i) => h !== b[i])
  if (!mudou(proprias, novas) && !mudou(d.outrasHipoteses, outras)) return d
  const nivelDe = new Map([...novas, ...outras].map((h) => [h.id, h.nivel]))
  const ancora = (a: Ancora): Ancora => {
    const nivel = nivelDe.get(a.hipoteseId)
    return nivel === undefined || nivel === a.nivel ? a : { ...a, nivel }
  }
  return {
    ...d,
    hipotesesPorNivel: porNivel(ordenarHipoteses(novas)),
    outrasHipoteses: outras,
    leituras: d.leituras.map((l) => (l.ancoras.some((a) => ancora(a) !== a) ? { ...l, ancoras: l.ancoras.map(ancora) } : l)),
  }
}

const seletorDosNiveis = (e: Estado): NiveisDaCamada => e.registros.get('nivel')

/** Os registros `nivel` da camada; re-renderiza só quando um nível muda. */
export function useNiveisDaCamada(): NiveisDaCamada {
  return useEstado(seletorDosNiveis)
}

/** O objeto do livro (ou null) com os níveis revistos (`comNiveisRevistos`). */
export function useComNiveisRevistos<T extends ItemDetalhe | null>(d: T): T {
  const niveis = useNiveisDaCamada()
  return useMemo(() => (d ? (comNiveisRevistos(niveis, d) as T) : d), [niveis, d])
}

/** Os objetos do livro (ou null) com os níveis revistos. */
export function useItensComNiveisRevistos(itens: readonly ItemDetalhe[] | null): readonly ItemDetalhe[] | null {
  const niveis = useNiveisDaCamada()
  return useMemo(() => {
    if (!itens) return itens
    const novos = itens.map((d) => comNiveisRevistos(niveis, d))
    // nenhum item mudou: a mesma lista (os memos de quem a usa não refazem)
    return novos.every((d, i) => d === itens[i]) ? itens : novos
  }, [niveis, itens])
}

/** A pessoa escolhe o nível de uma hipótese dos livros. Escolher o automático é voltar a ele: exclui a revisão. */
export async function escolherNivel(h: DoPacote, nivel: Nivel): Promise<Evento | null> {
  if (nivel === (h.nivelAutomatico ?? h.nivel)) return voltarAoAutomatico(h.id)
  return reverNivel(h.id, nivel)
}

/** «Voltar ao nível automático»: exclui a revisão, antes e depois de publicado (sem revisão viva, não grava nada). */
export async function voltarAoNivelAutomatico(h: DoPacote): Promise<Evento | null> {
  return voltarAoAutomatico(h.id)
}
