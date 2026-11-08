/**
 * Os objetos da página de um sítio com as partes (Parte 2C, bloco 2; Tarefa 12): em que grupo da árvore cada objeto fica. Os
 * grupos são o próprio sítio (com os mesclados nele) e cada parte abaixo dele, em todos os níveis (cada uma com os mesclados
 * nela). Um objeto pode chegar por vários caminhos — o achado do livro, a troca de sítio da pessoa (`item-sitio`), a ficha de um
 * objeto SKC — e fica num grupo só: o MAIS FUNDO em que aparece (ligar um objeto do tell ao túmulo o põe no túmulo, que é o que
 * a página do túmulo, a lista e o mapa também contam); na mesma profundidade, o que a pessoa ligou vence o achado do livro.
 * Puro, sobre a `Resolucao`.
 */
import type { Resolucao } from './resolucao'

/** Os grupos da árvore de `id`: [o sítio e os mesclados nele, e cada descendente (na ordem de `descendentes`) com os dele]. */
export function gruposDaArvore(r: Resolucao | null, id: string): string[][] {
  if (!r || r.destino(id) !== r.canonico(id)) return [[id]]
  return [id, ...r.descendentes(id)].map((x) => [x, ...r.absorvidos(x)])
}

/** sítio → o índice do grupo; também cada `SI-…` publicado como um sítio do livro do grupo (`origens`). */
export function grupoDeCadaSitio(grupos: readonly (readonly string[])[], origens: (id: string) => readonly string[]): Map<string, number> {
  const m = new Map<string, number>()
  grupos.forEach((g, i) => {
    for (const x of g) {
      m.set(x, i)
      for (const o of origens(x)) m.set(o, i)
    }
  })
  return m
}

/** Um caminho pelo qual um objeto chega à árvore: o sítio a que ele está ligado, e se foi a pessoa que o ligou. */
export interface ObjetoLigado<T> {
  o: T
  sitio: string
  daPessoa: boolean
}

/**
 * Cada objeto uma vez, no grupo mais fundo (desempate: o que a pessoa ligou; depois o que veio primeiro), na ordem dos grupos e,
 * dentro de um grupo, na ordem de chegada. O de uma parte leva `parte` (o id da parte). As entradas de sítios fora da árvore saem.
 */
export function objetosDaArvore<T extends { numero: string }>(
  r: Resolucao | null,
  grupos: readonly (readonly string[])[],
  grupoDe: ReadonlyMap<string, number>,
  entradas: readonly ObjetoLigado<T>[],
): (T & { parte?: string })[] {
  const profundidade = grupos.map((g) => (r ? r.caminho(g[0]!).length : 0))
  const melhor = new Map<string, { o: T; grupo: number; daPessoa: boolean; ordem: number }>()
  entradas.forEach(({ o, sitio, daPessoa }, ordem) => {
    const grupo = grupoDe.get(sitio)
    if (grupo === undefined) return
    const atual = melhor.get(o.numero)
    const maisFundo = atual === undefined || profundidade[grupo]! > profundidade[atual.grupo]!
    const mesmaProfundidade = atual !== undefined && profundidade[grupo] === profundidade[atual.grupo]
    if (maisFundo || (mesmaProfundidade && daPessoa && !atual.daPessoa)) melhor.set(o.numero, { o, grupo, daPessoa, ordem })
  })
  return [...melhor.values()]
    .sort((a, b) => a.grupo - b.grupo || a.ordem - b.ordem)
    .map(({ o, grupo }) => (grupo === 0 ? o : { ...o, parte: grupos[grupo]![0]! }))
}
