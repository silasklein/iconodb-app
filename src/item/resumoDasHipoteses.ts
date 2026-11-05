import { useMemo } from 'react'
import type { Hipotese } from '../banco/tipos'
import { useFormasEmUso, useNomeVivo } from '../glossario/doUsuario'
import { nomeDaHipoteseSkc, type HipoteseSkc } from '../hipoteses/modelo'
import { nomeDaHipotese, type ResumoDaHipotese } from './rotulos'

/**
 * Do que cada hipótese fala, para a prévia do trecho («Termo: … · sobre …»): o termo com a forma em uso de agora (a do
 * livro e a SKC, como nas linhas de "Hipóteses por nível") e o alvo. Devolve a consulta por id.
 */
export function useResumoDasHipoteses(livro: readonly Hipotese[], skc: readonly HipoteseSkc[]): (id: string) => ResumoDaHipotese | null {
  const formas = useFormasEmUso()
  const nomeDe = useNomeVivo()
  return useMemo(() => {
    const mapa = new Map<string, ResumoDaHipotese>()
    for (const h of livro) mapa.set(h.id, { termo: nomeDaHipotese(h, formas), sobre: h.alvo.rotulo ?? 'o objeto inteiro' })
    for (const h of skc) mapa.set(h.id, { termo: nomeDaHipoteseSkc(h, nomeDe), sobre: h.sobre.tipo === 'elemento' ? h.sobre.rotulo || 'a região' : 'o objeto inteiro' })
    return (id: string) => mapa.get(id) ?? null
  }, [livro, skc, formas, nomeDe])
}
