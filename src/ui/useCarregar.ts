import { useEffect, useState } from 'react'

export type Carga<T> = { fase: 'carregando' } | { fase: 'ok'; dados: T } | { fase: 'erro'; erro: unknown }

/** Roda `buscar` ao montar e quando `chave` muda; ignora a resposta de uma chave que já foi trocada. */
export function useCarregar<T>(buscar: () => Promise<T>, chave: string = ''): Carga<T> {
  const [carga, setCarga] = useState<Carga<T>>({ fase: 'carregando' })
  useEffect(() => {
    let vivo = true
    setCarga({ fase: 'carregando' })
    buscar().then(
      (dados) => vivo && setCarga({ fase: 'ok', dados }),
      (erro: unknown) => vivo && setCarga({ fase: 'erro', erro }),
    )
    return () => {
      vivo = false
    }
    // `chave` resume o que `buscar` usa
  }, [chave])
  return carga
}
