import { useEffect, useState, useSyncExternalStore } from 'react'
import { Rascunho, type EstadoDoRascunho, type OpcoesDoRascunho } from './rascunho'

/**
 * Cria o rascunho de uma nota (uma vez por montagem: use `key` para trocar de nota) e o finaliza ao sair da tela:
 * grava o que falta e só então se solta da lista de pendentes. As opções valem as da primeira montagem.
 */
export function useRascunho(opcoes: OpcoesDoRascunho): Rascunho {
  const [rascunho] = useState(() => new Rascunho(opcoes))
  useEffect(() => {
    rascunho.reativar()
    return () => {
      void rascunho.finalizar()
    }
  }, [rascunho])
  return rascunho
}

/** O estado do rascunho e a mensagem da última falha, para a tela. */
export function useSituacaoDoRascunho(r: Rascunho): { estado: EstadoDoRascunho; erro: string | null } {
  const estado = useSyncExternalStore(
    (fn) => r.assinar(fn),
    () => r.estado,
  )
  const erro = useSyncExternalStore(
    (fn) => r.assinar(fn),
    () => r.erro,
  )
  return { estado, erro }
}
