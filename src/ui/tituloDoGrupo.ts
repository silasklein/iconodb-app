/** Um título do livro na língua escolhida: o português, ou o original alemão (com `lang`). */
export interface TituloDoLivro {
  texto: string
  lang?: 'de'
}

/** O que `tituloDoGrupo` lê de um grupo: `subcolecoes` é a contagem (`Grupo`) ou a lista (`GrupoDetalhe`). */
export interface GrupoComTitulo {
  titulo: string
  tituloDe: string
  /** No grupo de cima, o número do título do livro ('1'), só quando tem subcoleções (schema 9, decisão 81). */
  numero?: string | null
  /** Não nulo numa subcoleção: é só por ele que a subcoleção se distingue do grupo de cima. */
  paiId?: string | null
  subcolecoes?: number | readonly unknown[]
}

/** O texto já começa pelo número («1. Testtiere …», o título alemão do livro): não repete. */
const comecaPeloNumero = (texto: string, numero: string) => new RegExp(`^${numero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[.\\s]`).test(texto)

/**
 * O título de um grupo de cima onde ele aparece: a linha das Coleções, o `h1` do grupo (nos dois tamanhos e no grupo
 * dividido), a «Posição no grupo» do objeto, o caminho do «No livro», o «‹ grupo» da subcoleção, a origem dos casos da
 * Revisão e o rótulo do grupo nas notas. Decisão 81 (a1 = B): o grupo com subcoleções leva o número do livro antes do
 * título («1. Animais de teste e figuras de prova»); o grupo sem subcoleções, ou sem `numero` (pacote 5–8), só o
 * título. Numa subcoleção (`paiId`) não põe número: ela o mostra à parte.
 * «Sem número» vale para o português: em alemão o título é o que o livro imprime, e o de um grupo de cima (com ou sem
 * subcoleções) já começa por «N.»; nesse caso nada se acrescenta.
 */
export function tituloDoGrupo(g: GrupoComTitulo, idioma: 'pt' | 'de' = 'pt'): TituloDoLivro {
  const titulo = idioma === 'de' ? g.tituloDe : g.titulo
  const quantas = typeof g.subcolecoes === 'number' ? g.subcolecoes : (g.subcolecoes?.length ?? 0)
  const numero = g.numero?.trim().replace(/\.$/, '')
  const texto = !g.paiId && quantas > 0 && numero && !comecaPeloNumero(titulo, numero) ? `${numero}. ${titulo}` : titulo
  return idioma === 'de' ? { texto, lang: 'de' } : { texto }
}

/**
 * O rótulo de uma subcoleção (ou da seção do livro em parágrafos) onde ela aparece no caminho: o «No livro» do objeto e o
 * caminho da página do § e da leitura (Tarefa 6, revisão da Tarefa 25, 4: antes eram duas regras, «1 Selos…» e «1. Selos…»).
 * O número simples (arábico ou romano) leva o ponto («1. Selos de prova»); o composto e a faixa, não («1.2–1.3 Figuras…»).
 * O título que já começa pelo número (o alemão impresso, «1. Testsiegel») fica como está.
 */
export function rotuloDaSubcolecao(numero: string | null | undefined, titulo: string): string {
  const n = numero?.trim().replace(/\.$/, '')
  if (!n || comecaPeloNumero(titulo, n)) return titulo
  return /^[\dIVXLC]+$/i.test(n) ? `${n}. ${titulo}` : `${n} ${titulo}`
}
