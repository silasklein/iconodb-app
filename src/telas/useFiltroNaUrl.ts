import { useEffect, useState } from 'react'
import { useLocation, useNavigationType, useSearchParams } from 'react-router'

/** O parâmetro do endereço que guarda o texto do filtro de uma lista. */
export const PARAMETRO_DO_FILTRO = 'filtro'

/**
 * O texto do filtro de uma lista (Glossário, Bibliografia, Sítios), guardado no endereço (`?filtro=`) com
 * `replace`: sobrevive a recarregar a página e a voltar de um detalhe. O campo usa um estado local (digitar não
 * espera o roteador). Ao voltar ou avançar no histórico (POP) o texto é lido de novo do endereço. Abrir um
 * item pela lista (os links das linhas não levam o texto, para não refazer todas) devolve o `?filtro=` ao
 * endereço logo depois.
 */
export function useFiltroNaUrl(): [string, (texto: string, tambem?: Record<string, string | null>) => void] {
  const [params, setParams] = useSearchParams()
  const { key } = useLocation()
  const tipo = useNavigationType()
  const doEndereco = params.get(PARAMETRO_DO_FILTRO) ?? ''
  const [texto, setTexto] = useState(doEndereco)

  /** `tambem` muda outros parâmetros na mesma atualização (o roteador não enfileira atualizações do endereço). */
  const gravar = (novo: string, tambem: Record<string, string | null> = {}) =>
    setParams(
      (atual) => {
        const p = new URLSearchParams(atual)
        if (novo === '') p.delete(PARAMETRO_DO_FILTRO)
        else p.set(PARAMETRO_DO_FILTRO, novo)
        for (const [chave, valor] of Object.entries(tambem)) valor === null ? p.delete(chave) : p.set(chave, valor)
        return p
      },
      { replace: true },
    )

  useEffect(() => {
    if (tipo === 'POP') setTexto(doEndereco)
    else if (doEndereco !== texto) gravar(texto)
    // roda uma vez por entrada do histórico; `texto` e `doEndereco` são os desta entrada
  }, [key])

  return [
    texto,
    (novo, tambem) => {
      setTexto(novo)
      gravar(novo, tambem)
    },
  ]
}
