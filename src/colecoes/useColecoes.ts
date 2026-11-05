import { useMemo } from 'react'
import { useEstado, type Registro } from '../usuario/estado'
import { lerColecao, type ColecaoVista } from './modelo'

const SEM_REGISTROS: ReadonlyMap<string, Registro> = new Map()
const porCriacao = (a: ColecaoVista, b: ColecaoVista) => (a.criadaEm < b.criadaEm ? -1 : a.criadaEm > b.criadaEm ? 1 : a.id < b.id ? -1 : 1)

export interface Colecoes {
  /** As coleções que existem, da mais antiga à mais nova. */
  vivas: readonly ColecaoVista[]
  /** As excluídas (reversível), da mais antiga à mais nova. */
  excluidas: readonly ColecaoVista[]
}

/** As coleções SKC do estado: lidas uma vez por registro (cache) e refeitas só quando o mapa de coleções muda. */
export function useColecoes(): Colecoes {
  const registros = useEstado((e) => e.registros.get('colecao')) ?? SEM_REGISTROS
  return useMemo(() => {
    const todas = [...registros.values()].map(lerColecao).sort(porCriacao)
    return { vivas: todas.filter((c) => !c.excluida), excluidas: todas.filter((c) => c.excluida) }
  }, [registros])
}

/** Uma coleção pelo id (inclusive a excluída); `null` se o id não existe. */
export function useColecao(id: string): ColecaoVista | null {
  const registro = useEstado((e) => e.registro('colecao', id)) ?? null
  return useMemo(() => (registro ? lerColecao(registro) : null), [registro])
}

/** Em quais coleções vivas o objeto está. */
export function colecoesDoObjeto(colecoes: readonly ColecaoVista[], ref: string): ColecaoVista[] {
  return colecoes.filter((c) => c.membros.some((m) => m.ref === ref))
}
