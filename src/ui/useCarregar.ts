import { useCallback, useEffect, useState } from 'react'

export type Carga<T> =
  | { fase: 'carregando' }
  | { fase: 'ok'; dados: T }
  /** `tentarDeNovo` roda `buscar` outra vez (o "Tentar de novo" do AvisoDeErro). */
  | { fase: 'erro'; erro: unknown; tentarDeNovo: () => void }

/**
 * Roda `buscar` ao montar e quando `chave` muda; ignora a resposta de uma chave que já foi trocada.
 * Com `manter`, trocar a chave não esvazia a tela: o resultado anterior fica até o novo chegar (o painel de
 * detalhe do computador, que não deve piscar a cada item escolhido).
 */
export function useCarregar<T>(buscar: () => Promise<T>, chave: string = '', opcoes: { manter?: boolean } = {}): Carga<T> {
  const [carga, setCarga] = useState<Carga<T>>({ fase: 'carregando' })
  const [tentativa, setTentativa] = useState(0)
  const tentarDeNovo = useCallback(() => setTentativa((t) => t + 1), [])
  useEffect(() => {
    let vivo = true
    setCarga((atual) => (opcoes.manter && atual.fase === 'ok' ? atual : { fase: 'carregando' }))
    buscar().then(
      (dados) => vivo && setCarga({ fase: 'ok', dados }),
      (erro: unknown) => vivo && setCarga({ fase: 'erro', erro, tentarDeNovo }),
    )
    return () => {
      vivo = false
    }
    // `chave` resume o que `buscar` usa; `tentativa` muda só com "Tentar de novo".
  }, [chave, tentativa])
  return carga
}
