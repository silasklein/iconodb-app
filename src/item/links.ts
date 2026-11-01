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

const LETRA_OU_NUMERO = /[\p{L}\p{N}]/u

/** O code point que termina em `i` (o anterior à posição), respeitando pares de surrogates. */
function anteriorA(texto: string, i: number): string {
  if (i <= 0) return ''
  const c = texto.charCodeAt(i - 1)
  if (c >= 0xdc00 && c <= 0xdfff && i >= 2) {
    const h = texto.charCodeAt(i - 2)
    if (h >= 0xd800 && h <= 0xdbff) return texto.slice(i - 2, i)
  }
  return texto[i - 1]!
}
const seguinteA = (texto: string, i: number): string => (i >= texto.length ? '' : String.fromCodePoint(texto.codePointAt(i)!))

/** Fronteira de palavra: nem letra nem algarismo colado antes ou depois. */
const emFronteira = (texto: string, inicio: number, fim: number) =>
  !LETRA_OU_NUMERO.test(anteriorA(texto, inicio)) && !LETRA_OU_NUMERO.test(seguinteA(texto, fim))

const SEPARADOR = String.raw`(?:[.,–-]|\be\b|\bund\b|\bou\b)`
const CHAMADA = String.raw`\b(?:cf|vgl|cp)\.`
/** Antes do número: "(", ";" ou "cf."/"vgl.", e no máximo outros números da lista. */
const ANTES = new RegExp(String.raw`(\(|;|${CHAMADA})\s*(?:\d+[a-z]?\s*${SEPARADOR}\s*)*$`, 'i')
/** Depois de um número chamado por "cf.": a lista, e então ")", ";", fim de frase, vírgula ou o fim do texto. */
const DEPOIS_DA_CHAMADA = new RegExp(String.raw`^(?:\s*${SEPARADOR}\s*\d+[a-z]?)*\s*(?:[);]|\.(?:\s|$)|,\s|$)`, 'i')
/** Depois de um número entre parênteses: só a lista (";" incluído), até ")" ou ";". */
const DEPOIS_NO_PARENTESE = new RegExp(String.raw`^(?:\s*(?:${SEPARADOR}|;)\s*\d+[a-z]?)*\s*[);]`, 'i')
/** A mesma lista, fechada por ")". */
const FECHA_COM_PARENTESE = new RegExp(String.raw`^(?:\s*(?:${SEPARADOR}|;)\s*\d+[a-z]?)*\s*\)`, 'i')
/** O começo de um parêntese aberto como remissão: números (talvez depois de "cf."), separados também por ";". */
const ABERTO_COMO_REMISSAO = new RegExp(String.raw`^\s*(?:${CHAMADA}\s*)?(?:\d+[a-z]?\s*(?:${SEPARADOR}|;)\s*)*$`, 'i')

/** Onde abre o parêntese em que `pos` está; -1 fora de parênteses. */
function aberturaDoParentese(texto: string, pos: number): number {
  let nivel = 0
  for (let i = pos - 1; i >= 0; i--) {
    const c = texto[i]
    if (c === ')') nivel += 1
    else if (c === '(') {
      if (nivel === 0) return i
      nivel -= 1
    }
  }
  return -1
}

/**
 * Quanto um número no texto parece uma remissão: 0 = não é; 2 = chamado por "cf."/"vgl." ou numa
 * lista entre parênteses fechada por ")"; 1 = numa lista entre parênteses que segue com ";".
 * - "(" abre a lista só se vier direto antes dos números;
 * - ";" só continua uma lista se o parêntese foi aberto como remissão ("(12; 5)", "(cf. 2; 5)"),
 *   e não "(Abb. 3; 4)" nem "(Taf. 12; 5)";
 * - entre parênteses a lista acaba em ")" ou ";": "(3. fase)" não é remissão.
 */
function prioridadeDaRemissao(texto: string, inicio: number, fim: number): number {
  const antes = texto.slice(0, inicio)
  const m = ANTES.exec(antes)
  if (!m) return 0
  const depois = texto.slice(fim)
  const abertura = m[1]!
  if (abertura !== '(' && abertura !== ';') return DEPOIS_DA_CHAMADA.test(depois) ? 2 : 0
  if (abertura === ';') {
    const abre = aberturaDoParentese(texto, inicio)
    if (abre < 0 || !ABERTO_COMO_REMISSAO.test(texto.slice(abre + 1, inicio))) return 0
  }
  if (!DEPOIS_NO_PARENTESE.test(depois)) return 0
  return FECHA_COM_PARENTESE.test(depois) ? 2 : 1
}

/**
 * Os links do texto que o banco não grava como trechos (R14), achados na hora de desenhar:
 *
 * - cada referência bibliográfica resolvida do item (`bruto`, senão `curta`) → `/obra/<obraId>`,
 *   na primeira ocorrência livre em fronteira de palavra ("Keel 1995" não casa em "Keel 1995a");
 * - cada remissão com número no pacote → `/item/<número>`, onde o número do catálogo dela aparece
 *   como remissão na mesma obra (veja `prioridadeDaRemissao`), preferindo "cf." ou ")" a ";".
 *
 * Nenhum link cobre um trecho ocupado (termo ou âncora) nem outro link. Os que não se acham
 * aparecem só nas seções Relações e Bibliografia. Posições em UTF-16; saem em ordem.
 */
export function acharLinks(texto: string, ocupados: readonly Ocupado[], ctx: Contexto): LinkNoTexto[] {
  const tomados: Ocupado[] = ocupados.filter((o) => Number.isFinite(o.inicio) && Number.isFinite(o.fim) && o.inicio < o.fim)
  const livre = (inicio: number, fim: number) => tomados.every((o) => fim <= o.inicio || inicio >= o.fim)
  const links: LinkNoTexto[] = []

  /** A melhor ocorrência livre de `alvo` (a de maior nota; empate: a primeira); -1 sem nenhuma. */
  const melhor = (alvo: string, nota: (inicio: number, fim: number) => number): number => {
    let achado = -1
    let maior = 0
    for (let i = texto.indexOf(alvo); i >= 0; i = texto.indexOf(alvo, i + 1)) {
      const f = i + alvo.length
      if (!livre(i, f) || !emFronteira(texto, i, f)) continue
      const n = nota(i, f)
      if (n > maior) {
        maior = n
        achado = i
      }
    }
    return achado
  }
  const tomar = (inicio: number, fim: number, destino: string, rotulo: string) => {
    tomados.push({ inicio, fim })
    links.push({ inicio, fim, destino, rotulo })
  }

  for (const r of ctx.bibliografia) {
    if (!r.resolvida || !r.obraId || (r.itemId !== null && r.itemId !== ctx.itemId)) continue
    for (const forma of [r.bruto, r.curta]) {
      if (!forma) continue
      const i = melhor(forma, () => 1)
      if (i < 0) continue
      tomar(i, i + forma.length, `/obra/${encodeURIComponent(r.obraId)}`, `${forma}, na bibliografia`)
      break
    }
  }

  const obra = obraDe(ctx.fonte)
  for (const r of ctx.remissoes) {
    const numero = numeroDoCatalogo(r.origem)
    if (!r.numero || !numero || obraDe(r.origem!) !== obra) continue
    const i = melhor(numero, (i, f) => prioridadeDaRemissao(texto, i, f))
    if (i >= 0) tomar(i, i + numero.length, `/item/${encodeURIComponent(r.numero)}`, `Abrir ${r.numero}, ${r.origem}`)
  }

  return links.sort((x, y) => x.inicio - y.inicio)
}
