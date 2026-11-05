import { useEffect, useMemo, useState } from 'react'
import { aoReabrir } from '../banco/cliente'
import { useNumeracao } from '../objetos-skc/atual'
import { estadoAtual } from '../usuario/estado'
import { chaveDaFonte, OBRA_SKC, obraConhecida } from './citacoes'
import { obrasAbertas, obrasAbertasJa, resolverFontes, type ObjetoCitado, type ReferenciaCitada } from './fontesCitadas'

export interface ObrasCitaveis {
  /** O texto reconhece a obra: planejada, SKC ou aberta no pacote. */
  reconhece: (obra: string) => boolean
  /** A obra tem objetos agora: o SKC sempre; uma do livro, se está aberta; null se ainda não se sabe. */
  disponivel: (obra: string) => boolean | null
}

/**
 * As obras que o texto reconhece: as planejadas, o SKC e as abertas no pacote (estas chegam depois do primeiro
 * desenho; então o texto é lido de novo).
 */
export function useObrasCitaveis(): ObrasCitaveis {
  const [abertas, setAbertas] = useState<ReadonlySet<string> | null>(obrasAbertasJa)
  useEffect(() => {
    let vivo = true
    const ler = () => void obrasAbertas().then((o) => vivo && o && setAbertas(o))
    ler()
    // Um pacote novo instalado com a tela aberta: as obras abertas são lidas de novo (T17-B-2).
    const parar = aoReabrir(() => {
      setAbertas(null)
      ler()
    })
    return () => {
      vivo = false
      parar()
    }
  }, [])
  return useMemo(
    () => ({
      reconhece: (obra: string) => obraConhecida(obra) || !!abertas?.has(obra),
      disponivel: (obra: string) => (obra === OBRA_SKC ? true : abertas ? abertas.has(obra) : null),
    }),
    [abertas],
  )
}

const NADA: ReadonlyMap<string, ObjetoCitado | null> = new Map()

/** O objeto de cada referência citada, pela `chaveDaFonte` (veja fontesCitadas.ts); refeito quando a numeração muda. */
export function useFontesCitadas(refs: readonly ReferenciaCitada[]): ReadonlyMap<string, ObjetoCitado | null> {
  const chave = refs.map((r) => chaveDaFonte(r.obra, r.numero, r.sufixo ?? '', !!r.abb)).join('|')
  const numeracao = useNumeracao()
  const [mapa, setMapa] = useState<ReadonlyMap<string, ObjetoCitado | null>>(NADA)
  useEffect(() => {
    if (refs.length === 0) {
      setMapa(NADA)
      return
    }
    let vivo = true
    resolverFontes(refs, estadoAtual()).then(
      (m) => vivo && setMapa(m),
      () => vivo && setMapa(NADA),
    )
    return () => {
      vivo = false
    }
  }, [chave, numeracao]) // eslint-disable-line react-hooks/exhaustive-deps
  return mapa
}
