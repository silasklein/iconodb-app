/**
 * Deslocamentos: o pipeline (Python) grava `inicio`/`fim` de termos, âncoras e citações em
 * CODE POINTS; as strings do JavaScript contam em UTF-16. Um caractere fora do BMP (𓀀) ocupa
 * um code point e dois code units, então cada um deles antes do trecho o desloca em 1.
 */

/** Quantas unidades UTF-16 tem o code point que começa em `i`: 2 só para um par de surrogates válido. */
function unidades(texto: string, i: number): 1 | 2 {
  const c = texto.charCodeAt(i)
  if (c < 0xd800 || c > 0xdbff) return 1
  const d = texto.charCodeAt(i + 1)
  return d >= 0xdc00 && d <= 0xdfff ? 2 : 1
}

/** A posição UTF-16 do code point `pos` de `texto` (cortada a [0, texto.length]). */
export function codepointsParaUtf16(texto: string, pos: number): number {
  if (pos <= 0) return 0
  let cps = 0
  let i = 0
  while (i < texto.length && cps < pos) {
    i += unidades(texto, i)
    cps += 1
  }
  return i
}

/**
 * O mapa inteiro de uma vez: `mapa[cp]` é a posição UTF-16 do code point `cp`, de 0 até o
 * número de code points (inclusive, o fim do texto). Quem desenha um texto com muitos trechos
 * converte todos por este mapa, numa passada só, em vez de percorrer o texto a cada trecho.
 */
export function mapaDeCodepoints(texto: string): number[] {
  const mapa: number[] = []
  let i = 0
  while (i < texto.length) {
    mapa.push(i)
    i += unidades(texto, i)
  }
  mapa.push(texto.length)
  return mapa
}

/**
 * O conversor único (com corte) de code point para UTF-16, por um mapa de `mapaDeCodepoints`:
 * arredonda para baixo e corta a [0, fim do texto]. NaN ou infinito não são posição: null
 * (quem converte um trecho o descarta, em vez de ocupar o texto inteiro).
 */
export function paraUtf16(mapa: readonly number[], cp: number): number | null {
  if (!Number.isFinite(cp)) return null
  const i = Math.min(Math.max(0, Math.floor(cp)), mapa.length - 1)
  return mapa[i]!
}

/** Trechos em code points → UTF-16, numa passada; somem os vazios, invertidos ou com posição inválida. */
export function trechosEmUtf16(texto: string, trechos: readonly { inicio: number; fim: number }[], mapa: readonly number[] = mapaDeCodepoints(texto)): { inicio: number; fim: number }[] {
  const saida: { inicio: number; fim: number }[] = []
  for (const t of trechos) {
    const inicio = paraUtf16(mapa, t.inicio)
    const fim = paraUtf16(mapa, t.fim)
    if (inicio !== null && fim !== null && inicio < fim) saida.push({ inicio, fim })
  }
  return saida
}
