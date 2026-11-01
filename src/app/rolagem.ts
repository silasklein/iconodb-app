/**
 * A rolagem entre telas. Navegar para outra tela (PUSH ou REPLACE com outro caminho) começa no topo;
 * voltar (POP) volta à posição em que a tela estava; mudar só o `?…` da mesma tela (filtros, ?hipotese=,
 * ?imagem=) não mexe. As posições ficam na sessão, por `location.key`.
 */
export type TipoDeNavegacao = 'POP' | 'PUSH' | 'REPLACE'

export interface EntradaDaRolagem {
  tipo: TipoDeNavegacao
  /** O caminho da tela de que se saiu; null na primeira tela. */
  pathnameAnterior: string | null
  pathname: string
  /** A posição guardada para esta entrada do histórico, se há. */
  salva: number | undefined
}

export type DecisaoDeRolagem = { acao: 'nada' } | { acao: 'topo' } | { acao: 'restaurar'; y: number }

const valida = (y: number | undefined): y is number => typeof y === 'number' && Number.isFinite(y) && y > 0

export function decidirRolagem({ tipo, pathnameAnterior, pathname, salva }: EntradaDaRolagem): DecisaoDeRolagem {
  const outraTela = pathnameAnterior !== null && pathnameAnterior !== pathname
  if (tipo === 'POP') {
    if (valida(salva)) return { acao: 'restaurar', y: salva }
    return outraTela ? { acao: 'topo' } : { acao: 'nada' }
  }
  return outraTela ? { acao: 'topo' } : { acao: 'nada' }
}

/** A página já é alta o bastante para chegar a `y`? (As listas chegam depois, de forma assíncrona.) */
export function alturaSuficiente({ scrollHeight, innerHeight, y }: { scrollHeight: number; innerHeight: number; y: number }): boolean {
  return scrollHeight - innerHeight >= y
}

const CHAVE = 'iconodb:rolagem'
const MAXIMO = 100

export function lerPosicoes(): Record<string, number> {
  try {
    const dados: unknown = JSON.parse(sessionStorage.getItem(CHAVE) ?? '{}')
    if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) return {}
    return Object.fromEntries(Object.entries(dados).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)))
  } catch {
    return {}
  }
}

export function guardarPosicao(chave: string, y: number): void {
  try {
    const todas = lerPosicoes()
    delete todas[chave] // regrava no fim: as mais recentes ficam
    todas[chave] = Math.round(y)
    const manter = Object.entries(todas).slice(-MAXIMO)
    sessionStorage.setItem(CHAVE, JSON.stringify(Object.fromEntries(manter)))
  } catch {
    /* sem sessionStorage: a restauração só deixa de existir */
  }
}
