import { useEffect, useState } from 'react'
import { MINIMO_DE_CARACTERES } from './consulta'
import { sugerir, type Sugestoes } from './sugestoes'

/** Espera depois da última tecla antes de consultar (as sugestões são leves, mas não precisam de uma consulta por tecla). */
export const ESPERA_DAS_SUGESTOES_MS = 120

export interface EstadoDasSugestoes {
  /** As sugestões mais recentes que chegaram; `null` enquanto nenhuma chegou para o texto atual (ou sem texto). */
  resultado: Sugestoes | null
  /** O texto a que `resultado` responde. */
  para: string | null
}

/**
 * As sugestões para `digitado`, consultadas depois de uma pequena espera. Uma resposta que chega depois que o texto
 * mudou é descartada (nunca uma resposta velha substitui uma nova). Enquanto a nova não chega, a anterior continua
 * na tela, para a lista não piscar a cada tecla; texto curto demais ou `ativo = false` limpam.
 */
export function useSugestoes(digitado: string, ativo: boolean, espera = ESPERA_DAS_SUGESTOES_MS): EstadoDasSugestoes {
  const [estado, setEstado] = useState<EstadoDasSugestoes>({ resultado: null, para: null })
  const consultar = ativo && digitado.trim().length >= MINIMO_DE_CARACTERES

  useEffect(() => {
    if (!consultar) {
      setEstado((e) => (e.resultado === null ? e : { resultado: null, para: null }))
      return
    }
    let vivo = true
    const temporizador = setTimeout(() => {
      sugerir(digitado).then(
        (resultado) => vivo && setEstado({ resultado, para: digitado }),
        () => vivo && setEstado({ resultado: null, para: null }),
      )
    }, espera)
    return () => {
      vivo = false
      clearTimeout(temporizador)
    }
  }, [digitado, consultar, espera])

  return estado
}
