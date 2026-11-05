/**
 * O texto GUARDADO de cada leitura à vista (revisão 1, I4 e I7), por fonte e língua: a Leitura do livro (tradução e
 * original) e a leitura SKC o registram ao montar. A âncora de uma hipótese é calculada sobre ele, nunca sobre o que
 * aparece na tela (que pode ser diferente: a forma em uso de um termo, Tarefa 11; o rótulo de um link).
 */
import { useEffect } from 'react'

const textos = new Map<string, { texto: string; vezes: number }>()
const chave = (fonte: string, lingua: string) => `${fonte}|${lingua}`

export function textoGuardado(fonte: string, lingua: string): string | null {
  return textos.get(chave(fonte, lingua))?.texto ?? null
}

/** Registra o texto enquanto o componente está montado (`fonte` null: nada). */
export function useTextoNaTela(fonte: string | null | undefined, lingua: string, texto: string | null): void {
  useEffect(() => {
    if (!fonte || texto === null) return
    const k = chave(fonte, lingua)
    const atual = textos.get(k)
    textos.set(k, { texto, vezes: (atual && atual.texto === texto ? atual.vezes : 0) + 1 })
    return () => {
      const agora = textos.get(k)
      if (!agora || agora.texto !== texto) return
      if (agora.vezes <= 1) textos.delete(k)
      else textos.set(k, { texto, vezes: agora.vezes - 1 })
    }
  }, [fonte, lingua, texto])
}
