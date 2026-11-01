/**
 * Deslocamentos: o pipeline (Python) grava `inicio`/`fim` de termos, âncoras e citações em
 * CODE POINTS; as strings do JavaScript contam em UTF-16. Um caractere fora do BMP (𓀀) ocupa
 * um code point e dois code units, então cada um deles antes do trecho o desloca em 1.
 */

/** A posição UTF-16 do code point `pos` de `texto` (cortada a [0, texto.length]). */
export function codepointsParaUtf16(texto: string, pos: number): number {
  if (pos <= 0) return 0
  let cps = 0
  let i = 0
  while (i < texto.length && cps < pos) {
    const c = texto.charCodeAt(i)
    i += c >= 0xd800 && c <= 0xdbff && i + 1 < texto.length ? 2 : 1
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
    const c = texto.charCodeAt(i)
    i += c >= 0xd800 && c <= 0xdbff && i + 1 < texto.length ? 2 : 1
  }
  mapa.push(texto.length)
  return mapa
}
