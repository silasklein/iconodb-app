/**
 * Quem são os membros de uma coleção: cada ref (número do pacote, ou id/número de um objeto SKC) vira o resumo do
 * objeto. O pacote responde pelos números dele; a camada do usuário, pelos objetos SKC (por id ou por número).
 *
 * No mapa: o resumo; `null` quando se SABE que não existe (o pacote respondeu e não o tem, e nenhum objeto SKC vivo
 * tem aquele id ou número); ausente quando não deu para saber (o pacote não respondeu), e a tela mostra a ref sem
 * dizer que o objeto sumiu.
 */
import { useEffect, useMemo, useState } from 'react'
import { resumosDosObjetos } from '../banco/consultas'
import type { ObjetoResumo } from '../banco/tipos'
import { estadoAtual, useEstado, type Estado } from '../usuario/estado'
import { useSitiosDoPacote } from '../sitios/pacote'
import { resumoDeObjetoSkc } from './objetosSkc'

export type MembrosResolvidos = ReadonlyMap<string, ObjetoResumo | null>

export async function resolverMembros(refs: readonly string[], estado: Estado): Promise<Map<string, ObjetoResumo | null>> {
  const mapa = new Map<string, ObjetoResumo | null>()
  const skc = new Map<string, ObjetoResumo>()
  for (const r of estado.registros.get('objeto')?.values() ?? []) {
    if (r.excluido) continue
    const resumo = resumoDeObjetoSkc(r)
    skc.set(r.id, resumo)
    if (resumo.numero !== r.id) skc.set(resumo.numero, resumo)
  }
  const doPacote: string[] = []
  for (const ref of refs) {
    const achado = skc.get(ref)
    if (achado) mapa.set(ref, achado)
    else if (!ref.startsWith('OB-')) doPacote.push(ref)
    else mapa.set(ref, null)
  }
  if (doPacote.length > 0) {
    try {
      const achados = new Map((await resumosDosObjetos(doPacote)).map((r) => [r.numero, r]))
      for (const ref of doPacote) mapa.set(ref, achados.get(ref) ?? null)
    } catch {
      // sem pacote ou banco ocupado: fica sem resposta
    }
  }
  return mapa
}

const SEM_RESPOSTA: MembrosResolvidos = new Map()

/** Os resumos dos membros; refaz quando a lista de refs ou os objetos SKC mudam. Enquanto a resposta não chega, o mapa é vazio. */
export function useMembrosResolvidos(refs: readonly string[]): MembrosResolvidos {
  const chave = refs.join('|')
  const objetos = useEstado((e) => e.registros.get('objeto'))
  // O nome do sítio de um objeto SKC é o de agora (T17-B-17).
  const sitios = useEstado((e) => e.registros.get('sitio'))
  const livro = useSitiosDoPacote()
  const [resolvidos, setResolvidos] = useState<MembrosResolvidos>(SEM_RESPOSTA)
  const lista = useMemo(() => refs, [chave]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (lista.length === 0) {
      setResolvidos(SEM_RESPOSTA)
      return
    }
    let vivo = true
    resolverMembros(lista, estadoAtual()).then(
      (m) => vivo && setResolvidos(m),
      () => vivo && setResolvidos(SEM_RESPOSTA),
    )
    return () => {
      vivo = false
    }
  }, [lista, objetos, sitios, livro]) // eslint-disable-line react-hooks/exhaustive-deps

  return resolvidos
}
