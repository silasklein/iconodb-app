/**
 * As referências nas fontes (decisão 39): o formato com DOIS PONTOS, o mesmo em todo o app.
 *
 * - Um número: "IPIAO I: 60", "IPIAO I: 95a", "IPIAO I: Abb. 1", "GGG: 40", "SKC: 12". Substitui "IPIAO I, 60" e
 *   "SKC, Nr. 12".
 * - Vários números da mesma obra (a linha "números nas fontes" de um grupo ligado, um objeto com vários itens): um só
 *   prefixo, os números em ordem; três ou mais seguidos viram uma faixa com travessão (U+2013), dois seguidos ficam
 *   "60, 61"; números com sufixo, figuras (Abb.) e números provisórios nunca entram numa faixa. Obras separadas por
 *   " · ", na ordem em que aparecem: "IPIAO I: 60–62, 64 · GGG: 40–59, 62, 67 · SKC: 12".
 *
 * Só a renderização do APP muda: o texto dos livros (e os rótulos do índice do pacote, "TESTE I, Nr. 1 — …") ficam como
 * vieram. Quem lê uma origem gerada pelo app (links.ts, Item) aceita a forma nova e a antiga.
 *
 * `lerReferenciaDigitada` reconhece o que a pessoa digita na busca para responder EXATAMENTE (consulta.ts e
 * sugestoes.ts): "IPIAO I: 60", "IPIAO I, Nr. 60", "IPIAO 60", "SKC: 12", "SKC 12", "SKC, Nr. 12", "skc nr 12". PURO.
 */

export interface ReferenciaDeFonte {
  /** A obra e o volume ("IPIAO I", "GGG") ou "SKC". */
  obra: string
  numero: number
  /** A letra depois do número ("a" em 95a); '' ou ausente sem letra. */
  sufixo?: string
  /** Figura da introdução ("Abb. 1"). */
  abb?: boolean
  /** Número ainda não confirmado (SKC: só até sincronizar): " (provisório)" depois dele. */
  provisorio?: boolean
}

const textoDoNumero = (r: ReferenciaDeFonte) => `${r.abb ? 'Abb. ' : ''}${r.numero}${r.sufixo ?? ''}${r.provisorio ? ' (provisório)' : ''}`
/** Entra numa faixa: número de catálogo simples, confirmado. */
const simples = (r: ReferenciaDeFonte) => !r.abb && !r.sufixo && !r.provisorio

function numerosDaObra(itens: readonly ReferenciaDeFonte[]): string {
  const vistos = new Set<string>()
  const lista = [...itens]
    .sort((a, b) => Number(!!a.abb) - Number(!!b.abb) || a.numero - b.numero || (a.sufixo ?? '').localeCompare(b.sufixo ?? '') || Number(!!a.provisorio) - Number(!!b.provisorio))
    .filter((r) => {
      const chave = `${r.abb ? 'A' : 'C'}${r.numero}${r.sufixo ?? ''}`
      if (vistos.has(chave)) return false
      vistos.add(chave)
      return true
    })
  const partes: string[] = []
  for (let i = 0; i < lista.length; ) {
    let fim = i
    if (simples(lista[i]!)) while (fim + 1 < lista.length && simples(lista[fim + 1]!) && lista[fim + 1]!.numero === lista[fim]!.numero + 1) fim++
    if (fim - i >= 2) partes.push(`${lista[i]!.numero}–${lista[fim]!.numero}`)
    else for (let k = i; k <= fim; k++) partes.push(textoDoNumero(lista[k]!))
    i = fim + 1
  }
  return partes.join(', ')
}

/**
 * A chave de um número citado (decisão 40; links reversos e resolução das citações no texto do usuário): "IPIAO I:60",
 * "IPIAO I:95a", "IPIAO I:Abb. 1", "SKC:12". A letra vai SEMPRE em minúscula, aqui e só aqui (o pacote, o texto e as
 * telas podem trazê-la em qualquer caixa). Em Python: `f"{obra}:{'Abb. ' if abb else ''}{numero}{sufixo.lower()}"`.
 */
export const chaveDaFonte = (obra: string, numero: number, sufixo = '', abb = false): string => `${obra}:${abb ? 'Abb. ' : ''}${numero}${sufixo.toLowerCase()}`

/** As referências no formato da decisão 39 (veja o cabeçalho). Lista vazia → ''. */
export function formatarReferencias(itens: readonly ReferenciaDeFonte[]): string {
  const porObra = new Map<string, ReferenciaDeFonte[]>()
  for (const r of itens) porObra.set(r.obra, [...(porObra.get(r.obra) ?? []), r])
  return [...porObra].map(([obra, lista]) => `${obra}: ${numerosDaObra(lista)}`).join(' · ')
}

/**
 * O locator de uma hipótese ou de um paralelo vem do pacote no estilo do livro ("IPIAO I, Nr. 60", como o pipeline o
 * escreve: `locator_prefix` + número). Na hora de MOSTRAR (decisão 39: em todas as telas), vira "IPIAO I: 60"; o pacote
 * não muda. Lê só formas seguras: obra (sigla e volume), "Nr."|"Abb." número[letra], e depois, opcionalmente, ", S. …" ou
 * ", § …", que ficam como vieram. Qualquer outra forma volta sem mudança: página solta, lista, faixa, texto livre, o
 * formato novo, e também um locator SEM a obra ("Nr. 60"; revisão 4: a sigla da publicação sozinha perderia o volume).
 */
const RE_LOCALIZADOR = /^([A-Z][A-Za-z]*(?: [IVXLC]+)?)\s*,\s*(Nr|Abb)\.\s*(\d{1,9})([a-z]?)((?:,\s*(?:S\.|§)\s*[^,]+)?)$/

export function formatarLocalizador(locator: string): string {
  const m = RE_LOCALIZADOR.exec(locator.trim())
  if (!m) return locator
  return `${formatarReferencias([{ obra: m[1]!, numero: Number(m[3]), sufixo: m[4], abb: m[2] === 'Abb' }])}${m[5]}`
}

/** Uma referência digitada na busca. `sigla` e `volume` em maiúsculas; `sufixo` em minúscula. */
export interface ReferenciaDigitada {
  sigla: string
  volume: string | null
  numero: number
  sufixo: string
  abb: boolean
}

/**
 * Sigla, volume em algarismos romanos (opcional), separador (espaços, ",", "." ou ":"), "Nr." ou "Abb." (opcionais) e o
 * número, com uma letra opcional. Nada mais na consulta. ASCII só.
 */
const RE_REFERENCIA = /^\s*([a-z]+)(?:\s+([ivxlc]+))?\b[\s,.:]*(?:(nr|abb)\.?\s*)?(\d{1,9})([a-z]?)\s*$/i

/**
 * "IPIAO I: 60" → {sigla: 'IPIAO', volume: 'I', numero: 60, sufixo: '', abb: false}; null se o digitado não tem essa
 * forma. Quem chama decide se a sigla é de uma obra aberta (senão, é uma busca comum). "SKC" só com número simples
 * (sem volume, letra ou Abb.).
 */
export function lerReferenciaDigitada(digitado: string): ReferenciaDigitada | null {
  const m = RE_REFERENCIA.exec(digitado)
  if (!m) return null
  const numero = Number(m[4])
  if (numero < 1) return null
  const r: ReferenciaDigitada = {
    sigla: m[1]!.toUpperCase(),
    volume: m[2] ? m[2].toUpperCase() : null,
    numero,
    sufixo: m[5]!.toLowerCase(),
    abb: m[3]?.toLowerCase() === 'abb',
  }
  if (r.sigla === 'SKC' && (r.volume !== null || r.sufixo !== '' || r.abb)) return null
  return r
}
