import type { ReferenciaBibliografica, Remissao } from '../banco/tipos'
import type { LinkNoTexto } from './trechos'

/** Um trecho já ocupado (termo ou âncora), em UTF-16. */
export interface Ocupado {
  inicio: number
  fim: number
}

interface Contexto {
  /** O rótulo da leitura ("TESTE I, 1"): a remissão só vale dentro da mesma obra e volume. */
  fonte: string
  /** O item da leitura: só as referências bibliográficas dele (ou sem item) entram. */
  itemId: string
  bibliografia: readonly ReferenciaBibliografica[]
  remissoes: readonly Remissao[]
}

/** O número do catálogo de uma origem ("TESTE I, 2" → "2"); null se não for um número ("TESTE I, Abb. 1"). */
export function numeroDoCatalogo(origem: string | null): string | null {
  const m = origem ? /,\s*(\d+[a-z]?)$/.exec(origem) : null
  return m ? m[1]! : null
}

/** "TESTE I, 2" → "TESTE I" (a obra e o volume). */
const obraDe = (origem: string) => origem.replace(/,\s*[^,]*$/, '')

const SEPARADOR = String.raw`(?:[.,–-]|\be\b|\bund\b|\bou\b)`
/** Antes do número: "(", ";" (dentro de parênteses) ou "cf."/"vgl.", e no máximo outros números da lista. */
const ANTES = new RegExp(String.raw`(\(|;|\b(?:cf|vgl|cp)\.)\s*(?:\d+[a-z]?\s*${SEPARADOR}\s*)*$`, 'i')
/** Depois do número: talvez mais números da lista, e então ")", ";", fim de frase, vírgula ou o fim do texto. */
const DEPOIS = new RegExp(String.raw`^(?:\s*${SEPARADOR}\s*\d+[a-z]?)*\s*(?:[);]|\.(?:\s|$)|,\s|$)`, 'i')

function dentroDeParenteses(antes: string): boolean {
  let nivel = 0
  for (const c of antes) {
    if (c === '(') nivel += 1
    else if (c === ')') nivel = Math.max(0, nivel - 1)
  }
  return nivel > 0
}

/** O número aparece aqui como uma remissão: entre parênteses ou depois de "cf.", numa lista só de números. */
function emListaDeNumeros(texto: string, inicio: number, fim: number): boolean {
  const antes = texto.slice(0, inicio)
  if (/[\p{L}\p{N}]$/u.test(antes)) return false
  const m = ANTES.exec(antes)
  if (!m) return false
  if (m[1] === ';' && !dentroDeParenteses(antes)) return false
  return DEPOIS.test(texto.slice(fim))
}

/**
 * Os links do texto que o banco não grava como trechos (R14), achados na hora de desenhar:
 *
 * - cada referência bibliográfica resolvida do item (`bruto`, senão `curta`) → `/obra/<obraId>`,
 *   na primeira ocorrência ainda livre;
 * - cada remissão com número no pacote → `/item/<número>`, onde o número do catálogo dela aparece
 *   como remissão (entre parênteses ou depois de "cf.", numa lista de números) na mesma obra.
 *
 * Nenhum link cobre um trecho ocupado (termo ou âncora) nem outro link. Os que não se acham
 * aparecem só nas seções Relações e Bibliografia. Posições em UTF-16; saem em ordem.
 */
export function acharLinks(texto: string, ocupados: readonly Ocupado[], ctx: Contexto): LinkNoTexto[] {
  const tomados: Ocupado[] = [...ocupados]
  const livre = (inicio: number, fim: number) => tomados.every((o) => fim <= o.inicio || inicio >= o.fim)
  const links: LinkNoTexto[] = []

  const primeiraLivre = (alvo: string, aceita: (inicio: number, fim: number) => boolean = () => true): number => {
    if (!alvo) return -1
    for (let i = texto.indexOf(alvo); i >= 0; i = texto.indexOf(alvo, i + 1)) {
      if (livre(i, i + alvo.length) && aceita(i, i + alvo.length)) return i
    }
    return -1
  }
  const tomar = (inicio: number, fim: number, destino: string, rotulo: string) => {
    tomados.push({ inicio, fim })
    links.push({ inicio, fim, destino, rotulo })
  }

  for (const r of ctx.bibliografia) {
    if (!r.resolvida || !r.obraId || (r.itemId !== null && r.itemId !== ctx.itemId)) continue
    for (const forma of [r.bruto, r.curta]) {
      if (!forma) continue
      const i = primeiraLivre(forma)
      if (i < 0) continue
      tomar(i, i + forma.length, `/obra/${encodeURIComponent(r.obraId)}`, `${forma}, na bibliografia`)
      break
    }
  }

  const obra = obraDe(ctx.fonte)
  for (const r of ctx.remissoes) {
    const numero = numeroDoCatalogo(r.origem)
    if (!r.numero || !numero || obraDe(r.origem!) !== obra) continue
    const limite = (i: number, f: number) => !/\d/.test(texto[i - 1] ?? '') && !/[\p{L}\p{N}]/u.test(texto[f] ?? '')
    const i = primeiraLivre(numero, (i, f) => limite(i, f) && emListaDeNumeros(texto, i, f))
    if (i >= 0) tomar(i, i + numero.length, `/item/${encodeURIComponent(r.numero)}`, `Abrir ${r.numero}, ${r.origem}`)
  }

  return links.sort((x, y) => x.inicio - y.inicio)
}
