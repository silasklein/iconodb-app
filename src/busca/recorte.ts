import { destacar, type Trecho } from './destaque'
import type { FoldTabela } from './fold'

/**
 * O recorte de um trecho de § na Busca (Tarefa 26, tela 4: «…a mesma postura da **deusa** volta nas figuras…»): o texto em
 * volta do primeiro destaque (`antes` caracteres antes e `depois` a partir dele), cortado entre palavras, com «…» onde se cortou,
 * e os pedaços em destaque de `destacar`. Sem destaque, o começo do texto. Um texto que cabe vai inteiro.
 */
export function recorteDoTrecho(texto: string, digitado: string, tabela: FoldTabela, antes = 70, depois = 170): Trecho[] {
  const pecas = destacar(texto, digitado, tabela)
  let pos = 0
  let ancora = 0
  for (const p of pecas) {
    if (p.forte) {
      ancora = pos
      break
    }
    pos += p.texto.length
  }
  // o começo: o primeiro espaço depois de `ancora - antes` (nunca depois do destaque); o fim: o último espaço antes de
  // `ancora + depois` (nunca antes do destaque)
  let de = Math.max(0, ancora - antes)
  if (de > 0) {
    const espaco = texto.indexOf(' ', de)
    de = espaco >= 0 && espaco < ancora ? espaco + 1 : ancora
  }
  let ate = Math.min(texto.length, ancora + depois)
  if (ate < texto.length) {
    const espaco = texto.lastIndexOf(' ', ate)
    ate = espaco > ancora ? espaco : ate
  }
  const saida: Trecho[] = []
  pos = 0
  for (const p of pecas) {
    const a = pos
    const b = pos + p.texto.length
    pos = b
    const x = Math.max(a, de)
    const y = Math.min(b, ate)
    if (x < y) saida.push({ texto: p.texto.slice(x - a, y - a), forte: p.forte })
  }
  if (saida.length === 0) return []
  if (de > 0) {
    if (saida[0]!.forte) saida.unshift({ texto: '…', forte: false })
    else saida[0] = { texto: `…${saida[0]!.texto}`, forte: false }
  }
  if (ate < texto.length) {
    const ultimo = saida.at(-1)!
    if (ultimo.forte) saida.push({ texto: '…', forte: false })
    else saida[saida.length - 1] = { texto: `${ultimo.texto.trimEnd()}…`, forte: false }
  }
  return saida
}
