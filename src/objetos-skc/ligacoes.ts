/**
 * Ligações entre objetos (decisões 30 e 34): o mesmo objeto físico em duas fontes (dois objetos SKC, ou um SKC e um
 * objeto de livro que um volume processado depois traz). As leituras se juntam na tela do PRINCIPAL; o outro número
 * continua achável na busca e redireciona. PURO.
 *
 * FORMATO (congelado para a Tarefa 16): registro `ligacao`, reg = `<a>|<b>` com a < b por ponto de código.
 *   a, b: a ref de cada objeto: o id `OB-<aparelho>-<n>` para um objeto SKC (o número dele pode ainda ser provisório e
 *         mudar; o id não muda) e o número (`CA00012`) para um objeto de livro.
 *   criar {a, b, ativa: true}; desfazer = alterar {ativa: false}; refazer = alterar {ativa: true}. Vence o hlc maior.
 *   Uma ligação vale se `ativa === true` (só o booleano do JSON), a e b são refs válidas e diferentes e a reg bate.
 * GRUPOS: as componentes conexas das ligações ativas (cadeias e ciclos, por mais concorrentes que sejam, dão sempre o
 * mesmo grupo: é uma função do conjunto). Um objeto SKC excluído sai dos grupos.
 * PRINCIPAL (decisão 38, que corrige a leitura "período mais antigo" da decisão 34): o número do sistema DADO PRIMEIRO.
 * O membro de menor chave, onde (tuplas comparadas em ordem, textos por ponto de código):
 *   objeto SKC com número → (0, hlc do pedido, 1, número)   o hlc do pedido = o da escrita do `periodo` (a criação,
 *                                                            ou a hora em que o rascunho ganhou período);
 *   objeto de livro       → (0, hora da atribuição, 0, número)
 *   objeto SKC sem número → (1, hlc do pedido, id)            (rascunho: nunca é principal de quem tem número).
 * A HORA DA ATRIBUIÇÃO de um número de livro: o pacote não traz data por objeto (a tabela `object` tem só id,
 * period_code e first_pub_year; o manifesto tem `gerado_em`, que muda a cada build e não serve). A data mais precisa é
 * a da RESERVA da Tarefa 16 que deu o número (o registro `OB-pipeline-…` em `numeracao.reservas`): o hlc do pedido
 * dela. Sem reserva (o IPIAO I, numerado em 31/10/2026, antes de existir objeto SKC), a hora é desconhecida e vale ''
 * (antes de qualquer hlc): o livro estava no banco antes. Empate na hora: livro antes de SKC, depois o número.
 * Em Python: a tupla `(0, hora, tipo, numero)` / `(1, hlc, id)` com `sorted`; '' < qualquer hlc.
 */
import type { Estado, Registro } from '../usuario/fusao'
import { chaveDoPedidoDe, idDeObjetoSkc, lerNumero, type Numeracao } from './numeracao'

export interface Ligacao {
  reg: string
  a: string
  b: string
  ativa: boolean
}

const comparar = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
export const refValida = (x: unknown): x is string => idDeObjetoSkc(x) || lerNumero(x) !== null

export function regDaLigacao(x: string, y: string): string {
  return comparar(x, y) <= 0 ? `${x}|${y}` : `${y}|${x}`
}

/** Todas as ligações bem formadas (ativas e desfeitas), por reg. */
export function lerLigacoes(estado: Estado): Ligacao[] {
  const saida: Ligacao[] = []
  for (const r of estado.registros.get('ligacao')?.values() ?? []) {
    const l = lerLigacao(r)
    if (l) saida.push(l)
  }
  return saida.sort((x, y) => comparar(x.reg, y.reg))
}

function lerLigacao(r: Registro): Ligacao | null {
  const { a, b, ativa } = r.campos
  if (!refValida(a) || !refValida(b) || a === b || comparar(a, b) > 0 || r.id !== `${a}|${b}`) return null
  return { reg: r.id, a, b, ativa: ativa === true && !r.excluido }
}

/**
 * A ref canônica de um objeto a partir do que a pessoa digitou ou de um link: o número de um objeto SKC vira o id dele
 * (o id não muda; o número provisório pode mudar); o número de um livro fica o número. null se não é ref de objeto.
 */
export function refDoObjeto(x: string, numeracao: Numeracao): string | null {
  const t = x.trim()
  if (idDeObjetoSkc(t)) return t
  const maiusculo = t.toUpperCase()
  if (!lerNumero(maiusculo)) return null
  return numeracao.porNumero.get(maiusculo) ?? maiusculo
}

export interface Grupos {
  /** O principal do grupo de `ref` (a própria ref, se não está ligada). */
  principal(ref: string): string
  /** O grupo de `ref`, o principal primeiro e os outros pela chave; só [ref] se não está ligada. */
  membros(ref: string): string[]
  /** As ligações ativas que tocam `ref` (para "Desfazer a ligação"). */
  ligacoesDe(ref: string): Ligacao[]
}

/**
 * A REGRA DO PRINCIPAL (decisão 38; trocar a regra é mudar só esta função): a chave de ordem de um membro do grupo; o
 * menor é o principal. Veja o cabeçalho. A chave é um texto cujas partes são separadas por ' ' (abaixo de todo caractere
 * de hlc, número e id), então a ordem do texto é a da tupla.
 */
export function chaveDoPrincipal(ref: string, estado: Estado, numeracao: Numeracao): string {
  if (idDeObjetoSkc(ref)) {
    const pedido = chaveDoPedidoDe(estado, ref) ?? ''
    const numero = numeracao.porId.get(ref)?.numero ?? null
    return numero ? `0 ${pedido} 1 ${numero}` : `1 ${pedido} ${ref}`
  }
  const reserva = numeracao.reservas.get(ref)
  const atribuido = (reserva && chaveDoPedidoDe(estado, reserva)) ?? ''
  return `0 ${atribuido} 0 ${ref}`
}

export function agruparObjetos(estado: Estado, numeracao: Numeracao): Grupos {
  // Um objeto SKC excluído sai dos grupos (nem principal, nem membro): uma página nunca redireciona a um objeto excluído.
  // Restaurá-lo traz as ligações de volta.
  const excluido = (ref: string) => idDeObjetoSkc(ref) && estado.registro('objeto', ref)?.excluido === true
  const ativas = lerLigacoes(estado).filter((l) => l.ativa && !excluido(l.a) && !excluido(l.b))
  const pai = new Map<string, string>()
  const achar = (x: string): string => {
    let r = x
    while (pai.has(r) && pai.get(r) !== r) r = pai.get(r)!
    return r
  }
  for (const l of ativas) {
    if (!pai.has(l.a)) pai.set(l.a, l.a)
    if (!pai.has(l.b)) pai.set(l.b, l.b)
    const ra = achar(l.a)
    const rb = achar(l.b)
    if (ra !== rb) pai.set(comparar(ra, rb) < 0 ? rb : ra, comparar(ra, rb) < 0 ? ra : rb)
  }
  const chave = (ref: string): string => chaveDoPrincipal(ref, estado, numeracao)
  const porRaiz = new Map<string, string[]>()
  for (const ref of pai.keys()) {
    const raiz = achar(ref)
    const lista = porRaiz.get(raiz) ?? []
    lista.push(ref)
    porRaiz.set(raiz, lista)
  }
  const grupoDe = new Map<string, string[]>()
  for (const lista of porRaiz.values()) {
    const ordenada = lista.map((ref) => ({ ref, k: chave(ref) })).sort((x, y) => comparar(x.k, y.k) || comparar(x.ref, y.ref)).map((x) => x.ref)
    for (const ref of ordenada) grupoDe.set(ref, ordenada)
  }
  return {
    principal: (ref) => grupoDe.get(ref)?.[0] ?? ref,
    membros: (ref) => [...(grupoDe.get(ref) ?? [ref])],
    ligacoesDe: (ref) => ativas.filter((l) => l.a === ref || l.b === ref),
  }
}
