/**
 * O que um sítio soma dos que estão nele (Parte 2C, bloco 2; especificação §5, regras 3–5): os objetos dos absorvidos e das
 * partes (`contagemDoSitio`, a contagem de toda lista e de toda página) e os campos simples que, vazios no destino, vêm de um
 * absorvido (`dadosDoDestino`). Puro sobre a `Resolucao`. Um id absorvido responde pelo destino dele.
 */
import type { Coordenada } from './modelo'
import type { Resolucao } from './resolucao'

export interface ContagemDoSitio {
  /** Os objetos do sítio e dos absorvidos nele. */
  proprios: number
  /** A soma dos `proprios` de todas as partes abaixo (em todos os níveis). */
  nasPartes: number
  total: number
}

/**
 * Os objetos de um sítio: `objetosDe(id)` = os do pacote mais os que a pessoa ligou a ele (`objetosPorSitio`). Um objeto que a
 * pessoa ligou a um absorvido conta no destino (pelo `objetosPorSitio`) ou no absorvido (o pacote): nos dois casos, uma vez.
 */
export function contagemDoSitio(r: Resolucao, id: string, objetosDe: (id: string) => number): ContagemDoSitio {
  const proprios = (k: string) => [k, ...r.absorvidos(k)].reduce((n, x) => n + objetosDe(x), 0)
  const d = r.destino(id)
  const meus = proprios(d)
  const nasPartes = r.descendentes(d).reduce((n, p) => n + proprios(p), 0)
  return { proprios: meus, nasPartes, total: meus + nasPartes }
}

/**
 * O número que uma lista mostra de um sítio: os objetos do pacote dele, dos absorvidos e das partes, e os que a pessoa ligou a
 * eles. `distintos` (`objetosDoPacoteSemRepetir`): para um destino com absorvidos ou partes, os objetos do pacote dessa árvore
 * contados uma vez só (um objeto que o livro põe em dois deles conta uma vez, como na página); sem a entrada, a soma.
 */
export function totalDeObjetos(
  r: Resolucao,
  id: string,
  doPacote: (id: string) => number,
  daPessoa: (id: string) => number,
  distintos?: ReadonlyMap<string, number> | null,
): number {
  const d = r.destino(id)
  return (distintos?.get(d) ?? contagemDoSitio(r, d, doPacote).total) + contagemDoSitio(r, d, daPessoa).total
}

/**
 * Quantos objetos do pacote há numa árvore sem os que a pessoa ligou a um sítio da MESMA árvore (`trocas`, `item-sitio`): esses
 * já contam pela pessoa (`objetosPorSitio`, no sítio a que ela os ligou), e a página do sítio mostra cada um uma vez. Os que ela
 * ligou a um sítio de fora continuam aqui (a contagem é aditiva entre sítios, como as páginas).
 */
export function objetosDoPacoteNaArvore(
  r: Resolucao,
  arvore: readonly string[],
  numeros: ReadonlySet<string>,
  trocas?: ReadonlyMap<string, { sitio: string | null }> | null,
): number {
  if (!trocas) return numeros.size
  const ids = new Set(arvore)
  let ligadosDentro = 0
  for (const n of numeros) {
    const sitio = trocas.get(n)?.sitio
    if (sitio && ids.has(r.canonico(sitio))) ligadosDentro++
  }
  return numeros.size - ligadosDentro
}

/** Os ids da árvore de um destino, do topo para baixo: ele, os absorvidos, e cada parte (em árvore) com os absorvidos dela. */
export const arvoreDoSitio = (r: Resolucao, id: string): string[] => [r.destino(id), ...r.descendentes(r.destino(id))].flatMap((x) => [x, ...r.absorvidos(x)])

/** Os campos simples de um sítio (regra 4 do §5). */
export interface CamposSimples {
  coordenada: Coordenada | null
  regiao: string | null
  pais: string | null
  nota: string | null
}

const CAMPOS = ['coordenada', 'regiao', 'pais', 'nota'] as const
type CampoSimples = (typeof CAMPOS)[number]

const vazio = (v: unknown) => v === null || v === undefined || v === ''

/**
 * Os campos simples do destino de `id`: cada um vem do destino (`dadosDe`: a correção, senão o do livro) e, vazio, do primeiro
 * absorvido em ordem de id por ponto de código que o tem (a mesma regra do processamento, iconodb/sitios_relacoes.py). `origem`
 * diz de que sítio veio cada campo que tem valor.
 */
export function dadosDoDestino(
  r: Resolucao,
  id: string,
  dadosDe: (id: string) => CamposSimples,
): CamposSimples & { origem: Partial<Record<CampoSimples, string>> } {
  const d = r.destino(id)
  const fontes = [d, ...r.absorvidos(d)].map((x) => [x, dadosDe(x)] as const)
  const saida: CamposSimples & { origem: Partial<Record<CampoSimples, string>> } = { coordenada: null, regiao: null, pais: null, nota: null, origem: {} }
  for (const campo of CAMPOS) {
    const achado = fontes.find(([, dados]) => !vazio(dados[campo]))
    if (!achado) continue
    ;(saida as unknown as Record<CampoSimples, unknown>)[campo] = achado[1][campo]
    saida.origem[campo] = achado[0]
  }
  return saida
}
