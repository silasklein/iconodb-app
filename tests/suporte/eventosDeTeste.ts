/**
 * Eventos da camada do usuário para os testes: aparelhos fixos, um relógio de base e um gerador
 * pseudoaleatório com semente (os testes de permutação são reprodutíveis). Só os testes importam.
 */
import type { Evento, Json, Op, Tipo } from '../../src/usuario/eventos'

export const A = 'aaaaaaaa'
export const B = 'bbbbbbbb'
export const C = 'cccccccc'
/** 2026-09-21 (13 dígitos). */
export const T0 = 1_790_000_000_000
export const MINUTO = 60_000
export const HORA = 60 * MINUTO

export function hlc(ms: number, contador: number, aparelho: string): string {
  return `${String(ms).padStart(13, '0')}-${String(contador).padStart(4, '0')}-${aparelho}`
}

export interface Pedido {
  ap?: string
  seq: number
  n?: number
  ms?: number
  c?: number
  /** O hlc pronto (senão é montado de ms, c e ap). */
  h?: string
  tipo?: Tipo
  reg?: string
  op?: Op
  campos?: Record<string, Json>
}

export function ev(p: Pedido): Evento {
  const ap = p.ap ?? A
  return {
    v: 1,
    id: `${ap}-${p.seq}-${p.n ?? 0}`,
    hlc: p.h ?? hlc(p.ms ?? T0 + p.seq * 1000, p.c ?? 0, ap),
    aparelho: ap,
    tipo: p.tipo ?? 'nota',
    reg: p.reg ?? 'NT-aaaaaaaa-1',
    op: p.op ?? 'alterar',
    campos: p.campos ?? {},
  }
}

/** mulberry32: um gerador pequeno e determinístico. */
export function gerador(semente: number): () => number {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function embaralhar<T>(lista: readonly T[], aleatorio: () => number): T[] {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j]!, copia[i]!]
  }
  return copia
}

/**
 * Um conjunto realista de eventos de três aparelhos sobre poucos registros: criar, alterar campos
 * (inclusive o mesmo campo em aparelhos diferentes, com relógios que divergem), excluir e restaurar,
 * valores nulos, listas (a ordem de uma coleção) e objetos.
 */
export function eventosAleatorios(semente: number, quantos = 80): Evento[] {
  const aleatorio = gerador(semente)
  const aparelhos = [A, B, C]
  const seqs: Record<string, number> = { [A]: 0, [B]: 0, [C]: 0 }
  const regs: Array<[Tipo, string]> = [
    ['nota', 'NT-aaaaaaaa-1'],
    ['nota', 'NT-bbbbbbbb-1'],
    ['colecao', 'CO-aaaaaaaa-1'],
    ['hipotese', 'HY-cccccccc-1'],
    ['posicao', 'IT-0001'],
  ]
  const campos = ['titulo', 'texto', 'itens', 'cor']
  const valores: Json[] = ['a', 'b', 'Maḥteṣ', null, 0, 1.5, true, [], ['IT-1', 'IT-2'], ['IT-2', 'IT-1'], { x: 1, y: [2] }, '']
  const ops: Op[] = ['criar', 'alterar', 'alterar', 'alterar', 'alterar', 'excluir', 'restaurar']
  const lista: Evento[] = []
  for (let i = 0; i < quantos; i++) {
    const ap = aparelhos[Math.floor(aleatorio() * 3)]!
    const seq = ++seqs[ap]!
    const [tipo, reg] = regs[Math.floor(aleatorio() * regs.length)]!
    const op = ops[Math.floor(aleatorio() * ops.length)]!
    const c: Record<string, Json> = {}
    const nCampos = op === 'excluir' || op === 'restaurar' ? 0 : Math.floor(aleatorio() * 3)
    for (let k = 0; k < nCampos; k++) c[campos[Math.floor(aleatorio() * campos.length)]!] = valores[Math.floor(aleatorio() * valores.length)]!
    // Relógios próximos, com colisões de milissegundo (o contador e o aparelho desempatam).
    const ms = T0 + Math.floor(aleatorio() * 40) * 1000
    lista.push(ev({ ap, seq, ms, c: Math.floor(aleatorio() * 3), tipo, reg, op, campos: c }))
  }
  return lista
}
