/**
 * As escritas da bandeja de comparação. Cada uma é UM evento `comparar` (reg "bandeja"), gravado por `registrar`: o
 * IndexedDB primeiro, a rede depois (a sincronização lê os eventos não enviados). Nada aqui toca a rede. O formato dos
 * campos e a regra dos 4 estão em ./modelo.ts.
 */
import { carregarEstado, estadoAtual, registrar } from '../usuario/estado'
import type { Campos } from '../usuario/eventos'
import type { Membro } from '../colecoes/modelo'
import { campoDaOrdem, campoDaPresenca, lerBandeja, planejarDesfazerSubstituicao, planejarEntrada, planejarSubstituicao, planejarVarias, REG_DA_BANDEJA, type BandejaVista, type Entrada, type EntradaDeVarias, type Substituicao } from './modelo'

/** A bandeja de agora (o estado de agora, não o que uma tela viu há pouco). */
export const bandejaAtual = (): BandejaVista => lerBandeja(estadoAtual().registro('comparar', REG_DA_BANDEJA))

/** O primeiro evento cria o registro; os outros o alteram. */
const gravar = (campos: Campos) => registrar('comparar', REG_DA_BANDEJA, estadoAtual().registro('comparar', REG_DA_BANDEJA) ? 'alterar' : 'criar', campos)

/** Põe o objeto no fim da bandeja. Já está, ou a bandeja está cheia: nada é gravado e o resultado diz qual dos dois. */
export async function acrescentarABandeja(ref: string): Promise<Entrada> {
  const e = planejarEntrada(bandejaAtual(), ref)
  if (e.tipo === 'entrou') await gravar(e.campos)
  return e
}

/** Põe vários de uma vez (um só evento): os que cabem entram na ordem pedida; o resultado diz os que já estavam e os que ficaram de fora. */
export async function acrescentarVariasABandeja(refs: readonly string[]): Promise<EntradaDeVarias> {
  const p = planejarVarias(bandejaAtual(), refs)
  if (p.entraram.length > 0) await gravar(p.campos)
  return p
}

/** Tira o objeto (escreve `null` na PRESENÇA; a ordem fica). Devolve a ordem que ele tinha, para o "Desfazer"; `null` se não estava. */
export async function tirarDaBandeja(ref: string): Promise<number | null> {
  const m = bandejaAtual().todos.find((x) => x.ref === ref)
  if (!m) return null
  await gravar({ [campoDaPresenca(ref)]: null })
  return m.ordem
}

/** Põe o objeto de volta com a ordem que tinha (o "Desfazer" de tirar). Quem já está não grava nada. */
export async function devolverABandeja(ref: string, ordem: number): Promise<void> {
  if (bandejaAtual().todos.some((m) => m.ref === ref)) return
  await gravar({ [campoDaPresenca(ref)]: true, [campoDaOrdem(ref)]: ordem })
}

/** Tira todos (inclusive os que não couberam), num só evento. Devolve o que havia, na ordem, para o "Desfazer". */
export async function esvaziarBandeja(): Promise<Membro[]> {
  const havia = [...bandejaAtual().todos]
  if (havia.length === 0) return []
  await gravar(Object.fromEntries(havia.map((m) => [campoDaPresenca(m.ref), null])))
  return havia
}

/** O "Desfazer" de esvaziar: põe de volta, num só evento, os que ainda não estão (cada um com a ordem que tinha). */
export async function desfazerEsvaziar(havia: readonly Membro[]): Promise<void> {
  const atual = new Set(bandejaAtual().todos.map((m) => m.ref))
  const faltam = havia.filter((m) => !atual.has(m.ref))
  if (faltam.length === 0) return
  await gravar(Object.fromEntries(faltam.flatMap((m) => [[campoDaPresenca(m.ref), true], [campoDaOrdem(m.ref), m.ordem]])))
}

/**
 * «Comparar todos» (decisão 44): troca a bandeja pelos objetos citados (os 4 primeiros) num só evento. O resultado traz a
 * bandeja de antes (`previa`) para o Desfazer, os que entraram, os que ficaram de fora e se já era exatamente esta lista
 * (`igual`: nada é gravado). Sem nenhum objeto para pôr, não grava nada (não esvazia).
 */
export async function substituirBandeja(refs: readonly string[]): Promise<Substituicao> {
  const p = planejarSubstituicao(bandejaAtual(), refs)
  if (Object.keys(p.campos).length === 0) return p
  const evento = await gravar(p.campos)
  return { ...p, hlc: evento.hlc }
}

/** O registro da bandeja ainda foi alterado, por último, pelo evento `hlc`? (Nenhuma escrita veio depois, nem desta tela, nem de outro aparelho.) */
export const bandejaParouEm = (hlc: string): boolean => estadoAtual().registro('comparar', REG_DA_BANDEJA)?.alteradoEm === hlc

/** A bandeja de agora é exatamente esta lista de refs, na mesma ordem e sem excedentes? */
export function bandejaEhExatamente(refs: readonly string[]): boolean {
  const atual = bandejaAtual().todos
  return atual.length === refs.length && atual.every((m, i) => m.ref === refs[i])
}

/**
 * O Desfazer de `substituirBandeja`, num só evento: a bandeja de antes (mesmos objetos, mesma ordem). Só vale enquanto a bandeja
 * ainda é exatamente o que a troca produziu (`entraram`) E nenhuma escrita veio depois do evento dela (`hlc`): se mudou (trabalho
 * depois da troca, outro aparelho), mesmo voltando ao mesmo conteúdo por outro caminho, NÃO grava nada e devolve `false`, para o
 * Desfazer nunca tirar em silêncio o que veio depois.
 */
export async function desfazerSubstituicao(previa: readonly Membro[], entraram: readonly string[], hlc: string): Promise<boolean> {
  // Outra aba pode ter gravado há instantes: o aviso dela (BroadcastChannel) ainda pode não ter chegado. Relê o que está no disco
  // antes de conferir e gravar (T17-C-6).
  await carregarEstado()
  if (!bandejaParouEm(hlc) || !bandejaEhExatamente(entraram)) return false
  const campos = planejarDesfazerSubstituicao(previa, entraram)
  if (Object.keys(campos).length > 0) await gravar(campos)
  return true
}
