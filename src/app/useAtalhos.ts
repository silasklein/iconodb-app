import { useEffect, useRef } from 'react'
import { registrarAtalhos, type Acao, type Contexto, type OpcoesDoRegistro } from './atalhos'

interface Opcoes extends OpcoesDoRegistro {
  /** Falso: o mapa não é registrado (por exemplo, o campo de busca sem a propriedade `atalho`). */
  ativo?: boolean
}

/**
 * Registra o mapa de atalhos de um contexto enquanto o componente está montado. As ações são lidas na
 * hora da tecla (sempre as da última renderização), então o mapa pode usar o estado de agora sem
 * registrar de novo; só mudar as teclas do mapa registra de novo.
 */
export function useAtalhos(mapa: Record<string, Acao>, contexto: Contexto, opcoes: Opcoes = {}): void {
  const atual = useRef(mapa)
  atual.current = mapa
  const raiz = useRef(opcoes.raiz)
  raiz.current = opcoes.raiz
  const comRaiz = !!opcoes.raiz
  const chaves = Object.keys(mapa).join('\n')
  const ativo = opcoes.ativo ?? true
  useEffect(() => {
    if (!ativo) return
    const proxy: Record<string, Acao> = {}
    for (const tecla of chaves.split('\n').filter(Boolean)) {
      proxy[tecla] = () => {
        const acao = atual.current[tecla]
        return acao ? acao() : false
      }
    }
    return registrarAtalhos(proxy, contexto, comRaiz ? { raiz: () => raiz.current?.() ?? null } : {})
  }, [chaves, contexto, ativo, comRaiz])
}
