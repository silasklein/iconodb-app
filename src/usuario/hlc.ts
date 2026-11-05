/**
 * Relógio lógico híbrido (HLC) da camada do usuário. Puro: sem IndexedDB, sem Date.now (quem chama
 * passa `agora`).
 *
 * Formato: "<ms 13 dígitos>-<contador 4 dígitos>-<aparelho>", por exemplo
 * "1790000000000-0003-k3x9a0qz". Como as três partes têm largura fixa, a comparação lexicográfica das
 * strings é a ordem (ms, contador, aparelho): a ordem causal, com o empate desfeito pelo aparelho.
 *
 * - `novoHlc` dá o carimbo de um evento local: nunca volta para trás, mesmo se o relógio do aparelho recuar.
 * - `receberHlc` avança o relógio local além de um carimbo remoto. Com isso, uma edição feita DEPOIS de ver
 *   a de outro aparelho (mesmo um adiantado 1 h) tem hlc maior e vence (Foco 3).
 */

export type Hlc = string

export interface PartesDoHlc {
  ms: number
  contador: number
  aparelho: string
}

const FORMATO = /^(\d{13})-(\d{4})-([a-z0-9]{8})$/
const APARELHO = /^[a-z0-9]{8}$/
const MAIOR_MS = 9_999_999_999_999
const MAIOR_CONTADOR = 9999
/**
 * Dois limites contra relógios absurdos (um hlc remoto "9999999999999-…" fixaria o relógio de todos os
 * aparelhos no máximo e, 10 mil escritas depois, o contador estouraria o formato):
 * - TETO_MS (2200-01-01T00:00:00Z): o relógio local nunca passa dele. `receberHlc` ignora remotos acima
 *   e `novoHlc` limita Date.now() a ele.
 * - LIMITE_MS (2250-01-01T00:00:00Z): um hlc com ms acima dele é inválido (o evento é ignorado e contado,
 *   motivo "hlc"; o registro de uma base também).
 * Entre os dois sobram ~1,6·10¹² ms; o estouro do contador (1 ms a cada 10 mil eventos) a partir do teto
 * nunca chega ao limite, então um evento local é sempre válido. E LIMITE_MS < MAIOR_MS (o formato).
 */
export const TETO_MS = 7_258_118_400_000
export const LIMITE_MS = 8_835_955_200_000

/** Formato certo e ms até LIMITE_MS. */
export function validoHlc(h: unknown): h is Hlc {
  if (typeof h !== 'string') return false
  const m = FORMATO.exec(h)
  return m !== null && Number(m[1]) <= LIMITE_MS
}

/** Lê as partes de um hlc bem formado (não confere o teto; veja validoHlc). */
export function lerHlc(h: string): PartesDoHlc | null {
  const m = FORMATO.exec(h)
  if (!m) return null
  return { ms: Number(m[1]), contador: Number(m[2]), aparelho: m[3]! }
}

function formatar(ms: number, contador: number, aparelho: string): Hlc {
  // Contador estourado: passa ao milissegundo seguinte (a ordem continua estritamente crescente).
  if (contador > MAIOR_CONTADOR) {
    ms += 1
    contador = 0
  }
  if (!Number.isInteger(ms) || ms < 0 || ms > MAIOR_MS) throw new RangeError(`hlc fora do intervalo: ${ms}`)
  return `${String(ms).padStart(13, '0')}-${String(contador).padStart(4, '0')}-${aparelho}`
}

function exigir(h: string, papel: string): PartesDoHlc {
  const p = lerHlc(h)
  if (!p) throw new Error(`hlc ${papel} malformado: ${JSON.stringify(h)}`)
  return p
}

function exigirAparelho(aparelho: string): void {
  if (!APARELHO.test(aparelho)) throw new Error(`id de aparelho inválido: ${JSON.stringify(aparelho)}`)
}

/** O menor hlc de um aparelho (o relógio antes do primeiro evento). */
export const HLC_ZERO = (aparelho: string): Hlc => {
  exigirAparelho(aparelho)
  return formatar(0, 0, aparelho)
}

/** Ordena como `sort()` padrão (as strings são ASCII de largura fixa). */
export function compararHlc(a: Hlc, b: Hlc): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Date.now() em ms inteiros, entre 0 e TETO_MS (um relógio de aparelho além de 2200 não passa dele). */
const relogioDe = (agora: number) => Math.min(TETO_MS, Math.max(0, Math.floor(agora)))

/**
 * O carimbo do próximo evento local. `anterior` é o último hlc deste aparelho (null antes do primeiro);
 * `agora` é Date.now(). O resultado é sempre maior que `anterior`.
 */
export function novoHlc(anterior: Hlc | null | undefined, agora: number, aparelho: string): Hlc {
  exigirAparelho(aparelho)
  const relogio = relogioDe(agora)
  if (anterior == null) return formatar(relogio, 0, aparelho)
  const a = exigir(anterior, 'anterior')
  if (relogio > a.ms) return formatar(relogio, 0, aparelho)
  return formatar(a.ms, a.contador + 1, aparelho)
}

/**
 * O relógio local depois de ver um carimbo remoto: maior que `local` e que `remoto`, com o aparelho de
 * `local`. Guarde-o como o último hlc; o próximo `novoHlc` parte dele.
 * Um remoto acima de TETO_MS (2200) é ignorado: só o relógio local avança (nunca lança por isso).
 */
export function receberHlc(local: Hlc, remoto: Hlc, agora: number): Hlc {
  const l = exigir(local, 'local')
  const lido = exigir(remoto, 'remoto')
  const r = lido.ms > TETO_MS ? l : lido
  const relogio = relogioDe(agora)
  const ms = Math.max(l.ms, r.ms, relogio)
  let contador: number
  if (ms === l.ms && ms === r.ms) contador = Math.max(l.contador, r.contador) + 1
  else if (ms === l.ms) contador = l.contador + 1
  else if (ms === r.ms) contador = r.contador + 1
  else contador = 0
  return formatar(ms, contador, l.aparelho)
}

/** O maior de dois hlc (null conta como menor). */
export function maiorHlc(a: Hlc | null | undefined, b: Hlc | null | undefined): Hlc | null {
  if (a == null) return b ?? null
  if (b == null) return a
  return a > b ? a : b
}
