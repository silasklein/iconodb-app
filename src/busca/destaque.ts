/**
 * O negrito das sugestões: dado um texto como está escrito ("Íbex", "Maḥteṣ") e o que foi digitado ("ib", "mah"),
 * diz que trechos do texto casam. A comparação é feita no texto dobrado (a mesma dobra da busca: sem acentos nem
 * maiúsculas), mas o resultado volta em pedaços do texto ORIGINAL: o acento que o usuário não digitou também fica
 * em negrito ("ib" marca "Íb").
 *
 * Como volta ao original sem errar: o texto é cortado em agrupamentos (uma letra base e as marcas combinantes que
 * vêm depois, como "ḥ" solto ou "h" + ponto), cada agrupamento é dobrado sozinho e a posição de cada caractere
 * dobrado guarda de que agrupamento veio. Um casamento que cobre só parte de um agrupamento ("s" em "ß", dobrado
 * "ss") marca o agrupamento inteiro. Os cortes caem sempre entre agrupamentos: nunca no meio de um par substituto
 * (UTF-16) nem entre a letra e a sua marca.
 *
 * O que casa é o mesmo que o FTS5 acha: a última palavra digitada vale como início de palavra ("ib" marca "íb" em
 * "íbex" e em "leão-íbex"); as anteriores, como palavra inteira.
 */
import { fold, type FoldTabela } from './fold'

export interface Trecho {
  texto: string
  /** O trecho casa com o que foi digitado: vai em negrito. */
  forte: boolean
}

/** Uma letra base com as marcas combinantes que a seguem (ou marcas soltas no começo do texto). */
const AGRUPAMENTO = /\P{M}\p{M}*|\p{M}+/gu
const PALAVRA = /[\p{L}\p{N}]+/gu

/** As palavras do que foi digitado, dobradas (as mesmas de `palavrasDaConsulta`). */
function palavrasDe(digitado: string, tabela: FoldTabela): string[] {
  return fold(digitado, tabela)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((p) => p !== '')
}

export function destacar(texto: string, digitado: string, tabela: FoldTabela): Trecho[] {
  if (texto === '') return []
  const palavras = palavrasDe(digitado, tabela)
  if (palavras.length === 0) return [{ texto, forte: false }]

  const agrupamentos = texto.match(AGRUPAMENTO) ?? [texto]
  // Dobrar cada agrupamento sozinho, sem aparar as pontas (um espaço sozinho não pode sumir).
  const semAparar: FoldTabela = { ...tabela, espacos: { ...tabela.espacos, aparar: false } }
  let dobrado = ''
  const dono: number[] = [] // posição (UTF-16) no texto dobrado → índice do agrupamento
  agrupamentos.forEach((a, i) => {
    const f = fold(a, semAparar)
    for (let k = 0; k < f.length; k++) dono.push(i)
    dobrado += f
  })

  const fortes = new Set<number>()
  const ultima = palavras.length - 1
  for (const m of dobrado.matchAll(PALAVRA)) {
    const inicio = m.index
    palavras.forEach((p, i) => {
      if (i === ultima ? !m[0].startsWith(p) : m[0] !== p) return
      for (let k = inicio; k < inicio + p.length; k++) fortes.add(dono[k]!)
    })
  }

  const trechos: Trecho[] = []
  agrupamentos.forEach((a, i) => {
    const forte = fortes.has(i)
    const anterior = trechos[trechos.length - 1]
    if (anterior && anterior.forte === forte) anterior.texto += a
    else trechos.push({ texto: a, forte })
  })
  return trechos
}
