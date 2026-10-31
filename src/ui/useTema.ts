import { useEffect } from 'react'

export type Tema = 'consulta' | 'item'

/** Quantas telas montadas pedem o tema escuro (ao trocar de tela, a nova monta antes da antiga sair). */
let pedidosItem = 0

/**
 * Aplica o tema ao documento inteiro enquanto a tela está montada: o fundo do
 * <body>, a rolagem elástica do iOS e a cor do texto seguem o tema.
 * Telas de item e imagem chamam useTema("item"); as de consulta são o padrão
 * e não precisam chamar nada. Para pintar só um contêiner, use a classe
 * `tema-item` direto.
 */
export function useTema(tema: Tema) {
  useEffect(() => {
    if (tema !== 'item') return
    const raiz = document.documentElement
    pedidosItem += 1
    raiz.classList.add('tema-item')
    return () => {
      pedidosItem -= 1
      if (pedidosItem === 0) raiz.classList.remove('tema-item')
    }
  }, [tema])
}
