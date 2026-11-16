/**
 * A chave da citação: quando duas citações dos livros contam como iguais (Parte 2C, bloco 3). PORTE de
 * `iconodb/biblio/chave.py` (`chave_da_citacao`), conferido contra o gabarito do processamento
 * (tests/fixtures/chicago-gabarito.json, `chaves`).
 *
 * Um «Ligar» na Revisão liga todas as citações com a mesma chave, nos livros de agora e nos que vierem; a chave é o conteúdo
 * da citação, nunca o `bib_ref.id`, que o build renumera. É a citação curta sem o localizador (o que vem depois do primeiro
 * «:») e dobrada com `dobrar` (src/glossario/modelo.ts, a mesma dobra do processamento: sem acentos nem apóstrofos,
 * minúsculas, espaços juntados e aparados). A citação sem autor («1997», «1997: 96») não tem chave: liga só a si mesma.
 */
import { dobrar } from '../glossario/modelo'

/** Uma letra de qualquer escrita (o `str.isalpha` do Python: as categorias L*). */
const LETRA = /\p{L}/u

/** `"Amostra 1992a: 29–32"` → `"amostra 1992a"`; null quando não há citação ou a chave não tem letra. */
export function chaveDaCitacao(curta: string | null): string | null {
  if (curta === null) return null
  const chave = dobrar(curta.split(':', 1)[0]!)
  return LETRA.test(chave) ? chave : null
}

/**
 * O id da exceção de uma ocorrência (registro `citacao`, src/revisao/ligacoes.ts): `<chave ou "-">@<SIGLA>|<alvo>|<raw>` (o
 * `raw` pode ter «|» e «@»), como `_OCORRENCIA` do processamento. Os grupos: 1 a chave, 2 a sigla, 3 o alvo, 4 o `raw`.
 */
export const RE_OCORRENCIA = /^([\s\S]+?)@([^|@]+)\|([^|]+)\|([\s\S]+)$/

/** A chave de uma ocorrência (a de `por_ocorrencia` do processamento): `<SIGLA>|<alvo>|<raw>`. */
export const chaveDaOcorrencia = (sigla: string, alvo: string, raw: string): string => `${sigla}|${alvo}|${raw}`

/** O id do registro da exceção de uma ocorrência. */
export function idDaOcorrencia(c: { sigla: string; alvo: string; raw: string; curta: string | null }): string {
  return `${chaveDaCitacao(c.curta) ?? '-'}@${chaveDaOcorrencia(c.sigla, c.alvo, c.raw)}`
}

/** A citação como impressa (`raw`) de um id de ocorrência, ou null se o id é uma chave. */
export const rawDaOcorrencia = (id: string): string | null => RE_OCORRENCIA.exec(id)?.[4] ?? null

/** É um id de registro `citacao` aceito: uma chave (`chaveDaCitacao(id) === id`) ou uma ocorrência. */
export const eIdDeLigacao = (id: string): boolean => RE_OCORRENCIA.test(id) || chaveDaCitacao(id) === id
