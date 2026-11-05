/**
 * O endereço da busca: `#/busca?q=…&escopo=termo&publicacao=TESTE&sitio=TESTE-3`.
 * `escopo` some quando é "tudo"; cada filtro é uma chave repetida (uma por valor).
 * O Início e a barra superior mandam para `caminhoDaBusca(texto)`.
 */
import { CHAVES_DE_FILTRO, ESCOPOS, type ChaveDeFiltro, type Escopo, type Filtros } from './consulta'
import type { ContextoDeNavegacao } from '../banco/tipos'

export interface ParametrosDaBusca {
  q: string
  escopo: Escopo
  filtros: Filtros
}

export function lerParametros(params: URLSearchParams): ParametrosDaBusca {
  const escopo = params.get('escopo')
  const filtros: Filtros = {}
  for (const chave of CHAVES_DE_FILTRO) {
    const valores = params.getAll(chave).filter((v) => v !== '')
    if (valores.length > 0) filtros[chave] = valores
  }
  return {
    q: params.get('q') ?? '',
    escopo: (ESCOPOS as readonly string[]).includes(escopo ?? '') ? (escopo as Escopo) : 'tudo',
    filtros,
  }
}

export function montarParametros({ q, escopo, filtros }: ParametrosDaBusca): URLSearchParams {
  const params = new URLSearchParams()
  params.set('q', q)
  if (escopo !== 'tudo') params.set('escopo', escopo)
  for (const chave of CHAVES_DE_FILTRO) for (const v of filtros[chave] ?? []) params.append(chave, v)
  return params
}

/** O caminho da rota (para navigate/Link): `/busca?q=íbex`. */
export function caminhoDaBusca(q: string, resto: Partial<Omit<ParametrosDaBusca, 'q'>> = {}): string {
  return `/busca?${montarParametros({ q, escopo: resto.escopo ?? 'tudo', filtros: resto.filtros ?? {} }).toString()}`
}

export function temFiltros(filtros: Filtros): boolean {
  return CHAVES_DE_FILTRO.some((c: ChaveDeFiltro) => (filtros[c]?.length ?? 0) > 0)
}

/**
 * O que um resultado da busca passa à tela do item pelo estado do roteador (`location.state`):
 * a lista ordenada dos números dos objetos do resultado, que a Tarefa 8 entrega a
 * `vizinhos(numero, state.contexto)` para o "anterior / próximo", e o caminho de volta à busca
 * (com a consulta e os filtros).
 *
 * Se o resultado tem mais de MAXIMO_DA_LISTA objetos, `contexto.ids` é uma janela dessa lista
 * em volta do objeto aberto, e `inicio` diz onde a janela começa na lista inteira. Para mostrar
 * "n / total": `n = inicio + vizinhos(...).posicao` e `total = state.total`.
 */
export interface EstadoVindoDaBusca {
  contexto: Extract<ContextoDeNavegacao, { tipo: 'lista' }>
  /** Posição (a partir de 0) do primeiro número de `contexto.ids` na lista inteira do resultado. */
  inicio: number
  /** Quantos objetos o resultado tem de verdade. */
  total: number
  /** `rotulo` é 'Busca' para o resultado de uma busca; uma coleção SKC (Tarefa 7) usa o nome dela e `colecao: true`. */
  origem: { rotulo: string; caminho: string; colecao?: true }
}

/** Mais que isto na lista e o estado do histórico fica pesado: vai só uma janela em volta do objeto aberto. */
export const MAXIMO_DA_LISTA = 2000

export function estadoDoResultado(numeros: readonly string[], caminhoDaBuscaAtual: string, aberto?: string): EstadoVindoDaBusca {
  const total = numeros.length
  const posicao = aberto === undefined ? 0 : Math.max(0, numeros.indexOf(aberto))
  const inicio = total <= MAXIMO_DA_LISTA ? 0 : Math.min(Math.max(0, posicao - MAXIMO_DA_LISTA / 2), total - MAXIMO_DA_LISTA)
  return {
    contexto: { tipo: 'lista', ids: total <= MAXIMO_DA_LISTA ? [...numeros] : numeros.slice(inicio, inicio + MAXIMO_DA_LISTA) },
    inicio,
    total,
    origem: { rotulo: 'Busca', caminho: caminhoDaBuscaAtual },
  }
}
