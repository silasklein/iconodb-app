export interface Retangulo {
  left: number
  top: number
  right: number
  bottom: number
}

interface Entrada {
  /** A linha do trecho em que o mouse (ou o foco) está, em coordenadas da janela. */
  linha: Retangulo
  /** O parágrafo, em coordenadas da janela: a prévia é posicionada em relação a ele. */
  pai: Retangulo
  caixa: { largura: number; altura: number }
  alturaDaJanela: number
}

/**
 * Onde a prévia da hipótese fica, em relação ao parágrafo: logo abaixo da linha do trecho (ou logo acima, se embaixo
 * não cabe na janela e em cima cabe), com o canto esquerdo no do trecho, mas nunca fora da coluna de leitura.
 */
export function posicaoDaPrevia({ linha, pai, caixa, alturaDaJanela }: Entrada): { top: number; left: number; acima: boolean } {
  const maximo = Math.max(0, pai.right - pai.left - caixa.largura)
  const left = Math.min(Math.max(0, linha.left - pai.left), maximo)
  const acima = linha.bottom + caixa.altura > alturaDaJanela && linha.top - caixa.altura >= 0
  const top = (acima ? linha.top - caixa.altura : linha.bottom) - pai.top
  return { top, left, acima }
}
