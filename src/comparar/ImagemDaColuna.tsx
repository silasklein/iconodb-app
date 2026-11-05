import { useMemo } from 'react'
import { juntarImagens, useImagensDoUsuario } from '../imagens-usuario/exibicao'
import type { ImagemAberta } from '../imagem/estado'
import { ImagemItem } from '../item/ImagemItem'
import type { Coluna } from './linhas'

/**
 * A imagem de um objeto na comparação: o mesmo visualizador do Item (`ImagemItem`), com as imagens do livro e depois as do
 * usuário (decisão 33). O desenho de traço vem invertido; tocar nele mostra o original; as imagens SKC levam a marca e o
 * crédito. Sem os atalhos Z e I (e sem anunciá-los): com várias imagens na tela, a tecla não saberia de qual delas é.
 * «Ampliar a imagem» passa por `aoAmpliar` (a tela guarda a coluna e a imagem, para a volta do visualizador).
 */
export function ImagemDaColuna({
  coluna,
  aoAmpliar,
  voltouDoVisualizador,
  inicial,
}: {
  coluna: Coluna
  aoAmpliar?: (imagemId: string, original: boolean) => void
  voltouDoVisualizador?: boolean
  inicial?: ImagemAberta | null
}) {
  const alvo = coluna.alvo ?? coluna.ref
  const { imagens: doUsuario, principal } = useImagensDoUsuario(alvo)
  const imagens = useMemo(() => juntarImagens(coluna.imagens, doUsuario), [coluna.imagens, doUsuario])
  return (
    <ImagemItem
      numero={coluna.numero ?? coluna.ref}
      imagens={imagens}
      principal={principal?.id ?? null}
      atalhos={false}
      aoAmpliar={aoAmpliar}
      inicial={inicial ?? null}
      devolverFoco={voltouDoVisualizador ?? true}
    />
  )
}
