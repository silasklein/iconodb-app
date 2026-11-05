/**
 * O que `/item/:numero` mostra (Tarefa 9): um número pode ser de um livro (o pacote) ou de um objeto SKC (confirmado ou
 * provisório), e `/item/OB-…` é o objeto SKC pelo id (o rascunho sem número só tem o id). Um objeto ligado que não é o
 * principal redireciona ao principal, que mostra as leituras juntas; `?sozinho=1` o mostra sem redirecionar.
 * Um número que um objeto SKC TEVE como provisório e perdeu leva a esse objeto (com o aviso de que o número mudou).
 */
import { useMemo } from 'react'
import { useGrupos, useNumeracao } from './atual'
import { idDeObjetoSkc, lerNumero, type Numeracao } from './numeracao'
import { useEsperandoNumerosDoPacote, useNumerosDoPacote } from './pacote'

export type Resolucao =
  | { tipo: 'esperando' }
  /** `motivo`: 'ligado' (um secundário que leva ao principal) ou 'numero-antigo' (o provisório que o objeto perdeu). */
  | { tipo: 'redirecionar'; para: string; de: string; motivo: 'ligado' | 'numero-antigo' }
  | { tipo: 'skc'; id: string; membros: string[] }
  /** `ligados`: todos os outros membros do grupo (objetos SKC e outros livros), na ordem do grupo (revisão 4). */
  | { tipo: 'livro'; numero: string; ligados: string[] }

/** O caminho de um objeto pela ref: o número quando há; o id de um objeto SKC sem número. */
export function rotaDoObjeto(ref: string, numeracao: Numeracao): string {
  const numero = idDeObjetoSkc(ref) ? numeracao.porId.get(ref)?.numero : ref
  return `/item/${encodeURIComponent(numero ?? ref)}`
}

export function useResolucaoDoObjeto(param: string, search: string): Resolucao {
  const numeracao = useNumeracao()
  const grupos = useGrupos()
  const esperando = useEsperandoNumerosDoPacote()
  const pacote = useNumerosDoPacote()
  const sozinho = new URLSearchParams(search).get('sozinho') === '1'
  return useMemo((): Resolucao => {
    let ref = param
    if (!idDeObjetoSkc(param)) {
      const n = param.trim().toUpperCase()
      if (lerNumero(n)) {
        const skc = numeracao.porNumero.get(n)
        if (skc) ref = skc
        else {
          // Os números do pacote ainda chegando: um provisório pode estar por calcular.
          if (esperando) return { tipo: 'esperando' }
          // O número provisório que um objeto SKC teve e perdeu (outro aparelho o tinha antes) leva ao objeto, com o aviso.
          // Um número que o pacote tem é do livro: nunca redireciona (nem o de um conflito com o livro).
          const antigo = pacote?.has(n) ? undefined : [...numeracao.porId.values()].find((i) => i.pedido === n && i.numero !== n && i.numero !== null && !i.reserva)
          if (antigo) return { tipo: 'redirecionar', para: rotaDoObjeto(antigo.id, numeracao), de: n, motivo: 'numero-antigo' }
          ref = n
        }
      }
    }
    const principal = sozinho ? ref : grupos.principal(ref)
    if (principal !== ref) {
      const de = idDeObjetoSkc(ref) ? (numeracao.porId.get(ref)?.numero ?? 'Este objeto') : ref
      return { tipo: 'redirecionar', para: rotaDoObjeto(principal, numeracao), de, motivo: 'ligado' }
    }
    const membros = sozinho ? [ref] : grupos.membros(ref)
    if (idDeObjetoSkc(ref)) return { tipo: 'skc', id: ref, membros }
    return { tipo: 'livro', numero: ref, ligados: membros.filter((m) => m !== ref) }
  }, [param, numeracao, grupos, esperando, pacote, sozinho])
}
