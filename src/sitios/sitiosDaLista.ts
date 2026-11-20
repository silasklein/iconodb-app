/**
 * Os sítios como a lista e o mapa dos Sítios os mostram (tirado de src/telas/Sitios.tsx sem mudar nada, para o mapa da leitura
 * usar o mesmo caminho; plano «Os mapas da introdução pelo mapa do app», Tarefa 1): os do livro com as correções do usuário
 * (nome, grafias, região, coordenada), os novos do usuário, a resolução (mesclas e partes) e a contagem de objetos. A conta
 * (`juntar`) está em ./juntar.ts, pura, para o scripts/conferir-leitura.ts a usar no Node (Tarefa 2 do mesmo plano).
 */
import { useMemo } from 'react'
import type { SitioResumo } from '../banco/consultas'
import { useCorrecoesDosSitios, useObjetosPorSitio, useResolucaoDaLista, useSitiosSkc, useTodosOsSitiosSkc, useTrocasDeSitio } from './doUsuario'
import { juntar, type SitioDaLista } from './juntar'
import { useObjetosDoPacoteSemRepetir } from './useResolucao'

export { juntar, type SitioDaLista }

/**
 * `juntar` sobre os sítios do pacote (`lista`, de `sitios()`; null enquanto não chegam), com a camada do usuário de agora; e a
 * resolução (`daLista`: os destinos dos sítios mesclados). Refaz quando o pacote ou a camada do usuário mudam.
 */
export function useSitiosDaLista(lista: readonly SitioResumo[] | null): {
  juntos: { itens: SitioDaLista[]; busca: Map<string, string> } | null
  daLista: ReturnType<typeof useResolucaoDaLista>
} {
  const correcoes = useCorrecoesDosSitios()
  const novos = useSitiosSkc()
  const todosSkc = useTodosOsSitiosSkc()
  const contagem = useObjetosPorSitio()
  const daLista = useResolucaoDaLista()
  const trocas = useTrocasDeSitio()
  const distintos = useObjetosDoPacoteSemRepetir(daLista?.resolucao ?? null, trocas)
  const juntos = useMemo(
    () => (lista ? juntar(lista, correcoes, novos, contagem, daLista, todosSkc, distintos) : null),
    [lista, correcoes, novos, contagem, daLista, todosSkc, distintos],
  )
  return { juntos, daLista }
}
