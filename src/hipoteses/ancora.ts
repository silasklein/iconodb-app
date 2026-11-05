/**
 * A âncora de uma hipótese SKC: o trecho selecionado numa leitura (Tarefa 10). Formato em ./modelo.ts.
 *
 * Reusa a máquina da §7.6 das notas (src/notas/ancora.ts, Tarefa 6): `shaDoTrecho` é o SHA-256 do texto normalizado
 * (NFC, espaços colapsados). A diferença é que a hipótese guarda também ONDE está o trecho (início e fim em code
 * points) e o próprio trecho, para marcá-lo no texto:
 * - `posicaoNoTexto` (síncrono, para desenhar): no lugar guardado se lá está o trecho; senão a ocorrência mais perto
 *   dele (uma revisão que acrescenta texto antes não perde a marca); se o trecho sumiu, não desenha.
 * - `conferirAncora` (assíncrono): o sha de agora é o guardado? Diferente = o aviso "O texto da fonte mudou".
 * - `reconferirAncora` ("Já conferi"): grava o sha de agora e a posição achada.
 */
import { shaDoTrecho } from '../notas/ancora'
import type { AncoraDaHipoteseSkc } from './modelo'

/**
 * Code points de `texto` antes da posição UTF-16 `i` (um surrogate solto conta como um). Uma posição no meio de um par
 * de surrogates arredonda para baixo (o caractere fica depois) ou para cima (fica antes).
 */
export function utf16ParaCodepoints(texto: string, i: number, arredondar: 'baixo' | 'cima' = 'baixo'): number {
  let cps = 0
  let k = 0
  const fim = Math.min(Math.max(0, i), texto.length)
  while (k < fim) {
    const c = texto.charCodeAt(k)
    const par = c >= 0xd800 && c <= 0xdbff && k + 1 < texto.length && texto.charCodeAt(k + 1) >= 0xdc00 && texto.charCodeAt(k + 1) <= 0xdfff
    if (par && k + 2 > fim && arredondar === 'baixo') break
    k += par ? 2 : 1
    cps += 1
  }
  return cps
}

const ESPACO = /\s/u

export interface TrechoSelecionado {
  fonte: string
  lingua: AncoraDaHipoteseSkc['lingua']
  /** O texto inteiro da leitura, como guardado. */
  texto: string
  /** Posições UTF-16 no `texto`. */
  inicio: number
  fim: number
}

/** O trecho selecionado como âncora; null se for vazio (ou só espaços) ou se não há WebCrypto (sem sha não há âncora). */
export async function ancoraDoTrecho(t: TrechoSelecionado): Promise<AncoraDaHipoteseSkc | null> {
  if (!globalThis.crypto?.subtle) return null
  const cps = [...t.texto]
  // Uma ponta no meio de um par de surrogates inclui o caractere inteiro.
  let inicio = utf16ParaCodepoints(t.texto, t.inicio, 'baixo')
  let fim = utf16ParaCodepoints(t.texto, t.fim, 'cima')
  while (inicio < fim && ESPACO.test(cps[inicio]!)) inicio++
  while (fim > inicio && ESPACO.test(cps[fim - 1]!)) fim--
  if (fim <= inicio) return null
  return { fonte: t.fonte, lingua: t.lingua, inicio, fim, trecho: cps.slice(inicio, fim).join(''), sha: await shaDoTrecho(t.texto) }
}

/** Onde o trecho está no texto de agora (code points), ou null se sumiu. */
export function posicaoNoTexto(a: Pick<AncoraDaHipoteseSkc, 'inicio' | 'fim' | 'trecho'>, texto: string): { inicio: number; fim: number } | null {
  const cps = [...texto]
  const n = [...a.trecho].length
  if (cps.slice(a.inicio, a.fim).join('') === a.trecho) return { inicio: a.inicio, fim: a.fim }
  // As ocorrências, em UTF-16, convertidas; vale a mais perto da posição guardada.
  let melhor: number | null = null
  for (let i = texto.indexOf(a.trecho); i >= 0; i = texto.indexOf(a.trecho, i + 1)) {
    const cp = utf16ParaCodepoints(texto, i)
    if (melhor === null || Math.abs(cp - a.inicio) < Math.abs(melhor - a.inicio)) melhor = cp
  }
  return melhor === null ? null : { inicio: melhor, fim: melhor + n }
}

export async function conferirAncora(a: Pick<AncoraDaHipoteseSkc, 'sha'>, texto: string): Promise<'ok' | 'mudou'> {
  return (await shaDoTrecho(texto)) === a.sha ? 'ok' : 'mudou'
}

export async function reconferirAncora(a: AncoraDaHipoteseSkc, texto: string): Promise<AncoraDaHipoteseSkc> {
  const pos = posicaoNoTexto(a, texto)
  return { ...a, ...(pos ?? {}), sha: await shaDoTrecho(texto) }
}
