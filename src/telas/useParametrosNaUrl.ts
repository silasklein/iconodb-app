import { useEffect, useState } from 'react'
import { useLocation, useNavigationType, useSearchParams } from 'react-router'

/**
 * Os parâmetros de uma lista guardados no endereço (Sítios: `filtro`, `regioes`, `vista`), com `replace`, como
 * `useFiltroNaUrl` faz com o texto do filtro.
 *
 * - `persistentes`: viajam com a pessoa. O valor mora num estado local (mudar não espera o roteador); ao abrir um item pela lista
 *   (os links das linhas não os levam) o hook os devolve ao endereço; ao voltar ou avançar no histórico (POP) são lidos de
 *   novo do endereço. Todos numa só atualização do endereço (o roteador não enfileira atualizações: duas seguidas se perderiam).
 * - `transitorios`: só vivem no endereço (`foco`, de «Abrir no mapa»): são lidos a cada renderização e nunca são devolvidos.
 *
 * `definir` muda vários de uma vez; `null` ou texto vazio tira o parâmetro.
 */
export function useParametrosNaUrl<P extends string, T extends string = never>(
  persistentes: readonly P[],
  transitorios: readonly T[] = [],
): {
  valores: Record<P, string>
  transitorios: Record<T, string | undefined>
  definir: (parcial: Partial<Record<P | T, string | null>>) => void
} {
  const [params, setParams] = useSearchParams()
  const { key } = useLocation()
  const tipo = useNavigationType()
  const doEndereco = () => Object.fromEntries(persistentes.map((n) => [n, params.get(n) ?? ''])) as Record<P, string>
  const [valores, setValores] = useState<Record<P, string>>(doEndereco)

  const gravar = (mudancas: Partial<Record<string, string | null>>) =>
    setParams(
      (atual) => {
        const p = new URLSearchParams(atual)
        for (const [nome, valor] of Object.entries(mudancas) as [string, string | null | undefined][]) {
          if (valor === null || valor === undefined || valor === '') p.delete(nome)
          else p.set(nome, valor)
        }
        return p
      },
      { replace: true },
    )

  useEffect(() => {
    const lidos = doEndereco()
    if (tipo === 'POP') setValores(lidos)
    else if (persistentes.some((n) => lidos[n] !== valores[n])) gravar(valores)
    // roda uma vez por entrada do histórico; `valores` e o endereço são os desta entrada
  }, [key])

  return {
    valores,
    transitorios: Object.fromEntries(transitorios.map((n) => [n, params.get(n) ?? undefined])) as Record<T, string | undefined>,
    definir: (parcial) => {
      const proprios = Object.fromEntries(Object.entries(parcial).filter(([n]) => (persistentes as readonly string[]).includes(n))) as Partial<Record<P, string | null>>
      if (Object.keys(proprios).length > 0) setValores((v) => ({ ...v, ...Object.fromEntries(Object.entries(proprios).map(([n, x]) => [n, x ?? ''])) }))
      gravar(parcial)
    },
  }
}
