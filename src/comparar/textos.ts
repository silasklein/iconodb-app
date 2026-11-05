import { plural } from '../usuario/textosDaSync'

export interface ResultadoDaTroca {
  /** Os que ficaram na bandeja, na ordem da citação. */
  entraram: readonly string[]
  /** Os citados que passaram de 4 e ficaram de fora. */
  deFora: readonly string[]
  /** Quantos objetos da bandeja de antes saíram: os que não estão na citação (os que também estão nela ficam, e o Desfazer devolve os que saíram). */
  tiradas: number
  /** A bandeja já era exatamente esta lista, nesta ordem: nada mudou. */
  igual: boolean
}

/**
 * O que «Comparar todos» diz em Comparar (decisão 44: ele SUBSTITUI a bandeja): quantos objetos da citação entraram, no lugar
 * de quantos, e quais ficaram de fora, pelo número. Os de fora NÃO são gravados em lugar nenhum, então a mensagem nunca promete
 * que entram depois: diz como comparar um deles (tirar um objeto e escrever o número no +). `nome` dá o número de uma ref da bandeja.
 */
export function textoDaSubstituicao(titulo: string, r: ResultadoDaTroca, nome: (ref: string) => string): string {
  if (r.igual) return r.entraram.length === 1 ? `O objeto de ${titulo} já estava na comparação.` : `Os ${r.entraram.length} objetos de ${titulo} já estavam na comparação, nesta ordem.`
  const partes: string[] = []
  const entrou = `${plural(r.entraram.length, 'objeto', 'objetos')} de ${titulo} ${r.entraram.length === 1 ? 'entrou' : 'entraram'} na comparação`
  partes.push(r.tiradas > 0 ? `${entrou}, no lugar de ${plural(r.tiradas, 'objeto', 'objetos')} que ${r.tiradas === 1 ? 'estava' : 'estavam'}.` : `${entrou}.`)
  if (r.deFora.length > 0) {
    partes.push(`${plural(r.deFora.length, 'objeto ficou', 'objetos ficaram')} de fora (a comparação leva até 4): ${r.deFora.map(nome).join(', ')}. Para comparar um deles, tire um objeto e use o + para escrever o número.`)
  }
  return partes.join(' ')
}
