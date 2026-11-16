/**
 * Revisão final do bloco 3 (M3): os objetos dos livros cujas citações a pessoa ligou a uma obra NO APP, antes do pacote
 * seguinte. A página da obra os lista junto aos que o pacote traz, e a Bibliografia os conta: as duas telas concordam.
 *
 * As citações são as que a fila da Revisão já carrega (`citacoesNaoResolvidasNoPacote`, uma leitura por pacote: as não
 * resolvidas e as ligadas pelo usuário no pacote), e a obra de cada uma é a que o app mostra (`obraDaCitacao`, por
 * `obraAgora`). Só se SOMA: a citação que o pacote traz ligada pelo usuário e que a camada desfez continua contada na obra do
 * pacote até o build seguinte (saber se o objeto ainda cita a obra por outra citação pediria todas as citações dele).
 */
import { useMemo } from 'react'
import { citacoesNaoResolvidasNoPacote, objetosDasObrasComLigados, resumosDosItens, type CitacaoDoPacote } from '../banco/consultas'
import type { ObjetoResumo } from '../banco/tipos'
import type { ObraDaLista } from '../bibliografia/doUsuario'
import { destinosCriadosOuNenhum, useRedirecionamentos, type Redirecionamentos } from '../pacote/redirecionamentos'
import { useCarregar } from '../ui/useCarregar'
import { estadoAtual, useEstado, type Estado } from '../usuario/estado'
import { obraAgora } from './citacoes'
import type { ObrasCriadas } from './ligacoes'

/** Os objetos de cada obra com citações ligadas no app: os itens (os do pacote e os ligados) e quantos objetos são. */
export type ObjetosLigados = ReadonlyMap<string, { itens: readonly string[]; objetos: number }>
const NENHUM: ObjetosLigados = new Map()

/**
 * obra → os itens das citações que a camada liga a ela e que o pacote não liga a ela (a obra que o app mostra difere da do
 * pacote). Uma obra sua publicada (`BIB-<aparelho>-<n>` com redirecionamento) conta pelo id do livro, a página que abre.
 */
export function itensLigadosNoApp(estado: Estado, citacoes: readonly CitacaoDoPacote[], criadas?: ObrasCriadas, redirecionamentos?: Redirecionamentos | null): Map<string, string[]> {
  const saida = new Map<string, string[]>()
  for (const c of citacoes) {
    if (!c.itemId) continue
    const agora = obraAgora(estado, c, criadas)
    if (agora === null || agora === c.obraId) continue
    const obra = redirecionamentos?.get(agora) ?? agora
    if (obra === c.obraId) continue
    const itens = saida.get(obra) ?? []
    if (!itens.includes(c.itemId)) itens.push(c.itemId)
    saida.set(obra, itens)
  }
  return saida
}

/** A chave estável de um mapa de `itensLigadosNoApp` (para recarregar só quando muda). */
const chaveDe = (m: ReadonlyMap<string, readonly string[]>): string =>
  [...m]
    .map(([obra, itens]) => `${obra}:${[...itens].sort().join(',')}`)
    .sort()
    .join('|')

/** Os objetos das obras com citações ligadas no app (vazio enquanto carrega, sem pacote, ou se a leitura falhou). */
export function useObjetosLigadosNoApp(): ObjetosLigados {
  const fonte = useCarregar(() => Promise.all([citacoesNaoResolvidasNoPacote(), destinosCriadosOuNenhum()]).catch(() => null), 'citacoes-ligaveis')
  const redirecionamentos = useRedirecionamentos()
  const ligacoes = useEstado((e) => e.registros.get('citacao'))
  const obras = useEstado((e) => e.registros.get('obra'))
  const ligados = useMemo(
    () => (fonte.fase === 'ok' && fonte.dados ? itensLigadosNoApp(estadoAtual(), fonte.dados[0], fonte.dados[1], redirecionamentos) : new Map<string, string[]>()),
    [fonte, redirecionamentos, ligacoes, obras], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const chave = chaveDe(ligados)
  // `manter`: ligar mais uma citação não esvazia a contagem enquanto a nova é lida
  const carga = useCarregar(() => objetosDasObrasComLigados(ligados).catch(() => NENHUM), `objetos-ligados:${chave}`, { manter: true })
  return carga.fase === 'ok' ? carga.dados : NENHUM
}

/**
 * A contagem da Bibliografia com os objetos ligados no app: a obra do pacote conta os objetos dos itens dela e dos ligados (um
 * por objeto, como a página); a obra sua ainda não publicada soma aos objetos SKC os objetos dos livros ligados a ela.
 */
export function comObjetosLigados(obras: readonly ObraDaLista[], ligados: ObjetosLigados): readonly ObraDaLista[] {
  if (ligados.size === 0) return obras
  return obras.map((o) => {
    const l = ligados.get(o.id)
    return l ? { ...o, objetos: o.skc ? o.objetos + l.objetos : l.objetos } : o
  })
}

/**
 * Os objetos dos livros da obra `id` com os ligados no app (os do pacote e os ligados, na ordem da fonte), ou null se nada foi
 * ligado a ela no app (a página fica com os do pacote) ou enquanto lê.
 */
export function useObjetosDaObraComLigados(id: string): ObjetoResumo[] | null {
  const itens = useObjetosLigadosNoApp().get(id)?.itens ?? null
  const chave = itens ? [...itens].sort().join(',') : ''
  const carga = useCarregar<{ id: string; objetos: ObjetoResumo[] | null }>(
    () => (itens ? resumosDosItens(itens, 'fonte').then((objetos) => ({ id, objetos })) : Promise.resolve({ id, objetos: null })),
    `objetos-da-obra:${id}:${chave}`,
    { manter: true },
  )
  return carga.fase === 'ok' && carga.dados.id === id ? carga.dados.objetos : null
}
