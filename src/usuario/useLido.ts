import { useMemo } from 'react'
import type { Tipo } from './eventos'
import { useEstado, type Estado } from './estado'

/**
 * Lê do estado fundido e memoriza pelos mapas dos tipos lidos: só recalcula quando um deles muda. `chave` é o que identifica
 * a leitura (`ler` muda a cada render; a chave é o que conta). Um só hook para glossário, hipóteses e sítios.
 */
export function useLido<T>(tipos: readonly Tipo[], chave: string, ler: (e: Estado) => T): T {
  const seletor = useMemo(() => {
    let mapas: unknown[] | null = null
    let valor: T
    return (e: Estado) => {
      const m = tipos.map((t) => e.registros.get(t))
      if (!mapas || m.some((x, i) => x !== mapas![i])) {
        mapas = m
        valor = ler(e)
      }
      return valor
    }
  }, [chave]) // eslint-disable-line react-hooks/exhaustive-deps
  return useEstado(seletor)
}
