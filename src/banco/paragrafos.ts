/**
 * O livro em parágrafos (etapa 4: o GGG e o GGIG), as peças PURAS: o número do § no `locator`, a rota da página do §, as
 * correções de leitura em UTF-16 e a frase do § que cita uma figura (decisão 91, a3). As consultas estão em consultas.ts.
 */
import { trechosEmUtf16 } from '../item/offsets'
import type { CorrecaoDeLeitura } from './tipos'

/** A rota da página do § (Tarefa 25 a registra). */
export const ROTA_DO_PARAGRAFO = '/paragrafo/:sigla/:numero'

export const caminhoDoParagrafo = (sigla: string, numero: number): string => `/paragrafo/${encodeURIComponent(sigla)}/${numero}`

/** «§29» → 29. Outro locator («NW», a parte fora da tradução; «0060»; «I.S.12»): null. */
export function numeroDoParagrafo(locator: string | null | undefined): number | null {
  const m = /^§(\d{1,6})$/.exec(locator ?? '')
  const numero = m ? Number(m[1]) : 0
  return numero >= 1 ? numero : null
}

/**
 * As correções de um texto (`correcao_de_leitura`: [inicio, fim) em CODE POINTS do texto corrigido, como o pipeline em
 * Python as grava) em posições UTF-16 de `texto`, na ordem dada. Uma correção vazia, invertida ou com posição inválida some
 * (nada sublinha o texto inteiro); uma que passa do fim é cortada nele.
 */
export function correcoesEmUtf16(texto: string, correcoes: readonly CorrecaoDeLeitura[]): CorrecaoDeLeitura[] {
  if (correcoes.length === 0) return []
  return trechosEmUtf16(
    texto,
    correcoes.map((c) => ({ inicio: c.inicio, fim: c.fim, lido: c.lido, regra: c.regra })),
  )
}

/**
 * As abreviações depois das quais um ponto não fecha a frase (alemão, português e inglês dos livros): «Abb. 1a», «vgl. Pl. 3»,
 * «cf. fig. 2», «Taf.», «Nr.», «S.», «Anm.», «ca.», «v. Chr.», «z. B.», «Jh.»… Uma maiúscula só antes do ponto (uma inicial,
 * «O. Probe») também não fecha; uma minúscula só fecha, fora «v», «n» e «z» («212a und b. Der…» acaba a frase).
 */
const ABREVIACOES = new Set(
  [
    'abb', 'abbn', 'taf', 'tf', 'pl', 'pls', 'fig', 'figs', 'illus', 'illuss', 'vgl', 'cf', 'nr', 'nrn', 'anm', 'ca', 'bzw',
    'chr', 'jh', 'jt', 'jhs', 'jts', 'bd', 'bde', 'hg', 'hrsg', 'ders', 'dies', 'ebd', 'ibid', 'op', 'cit', 'loc', 'sog',
    'usw', 'etc', 'evtl', 'vs', 'p', 'pp', 'nn', 'no', 'nos', 'vol', 'vols', 'ed', 'eds', 'al', 'sr', 'dr',
    'prof', 'st', 'vv', 'i.e', 'e.g', 'z.b', 'u.a', 'd.h', 's.o', 's.u', 'o.ä', 'v', 'n', 'z',
  ].map((a) => a.toLowerCase()),
)

/** A palavra (com pontos internos: «z.B», «s.o») que termina logo antes da posição `fim` (o ponto). */
function palavraAntes(texto: string, fim: number): string {
  let i = fim
  while (i > 0 && /[\p{L}\p{N}.]/u.test(texto[i - 1]!)) i--
  return texto.slice(i, fim).replace(/^\.+/, '')
}

/**
 * O texto em frases: corta depois de «.», «!» ou «?» (e de aspas ou parêntese que fechem logo em seguida) quando vem espaço e,
 * depois dele, uma maiúscula, uma aspa ou um parêntese que abre; nunca depois de uma abreviação conhecida nem de uma inicial.
 */
export function dividirEmFrases(texto: string): string[] {
  const frases: string[] = []
  let inicio = 0
  const re = /[.!?][»"”’)\]]*(?=\s+[\p{Lu}«"„“(\[])/gu
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    if (m[0][0] === '.') {
      const palavra = palavraAntes(texto, m.index)
      if (ABREVIACOES.has(palavra) || (palavra.length > 1 && ABREVIACOES.has(palavra.toLowerCase())) || /^\p{Lu}$/u.test(palavra)) continue
    }
    const fim = m.index + m[0].length
    const frase = texto.slice(inicio, fim).trim()
    if (frase) frases.push(frase)
    inicio = fim
  }
  const resto = texto.slice(inicio).trim()
  if (resto) frases.push(resto)
  return frases
}

/** A chave de uma referência de figura no texto: alemão («Abb.», «Abbn.»), português («fig.», «figs.») e inglês («illus.»). */
const CHAVE_DA_FIGURA = /(?<![\p{L}\p{N}])(?:Abbn?|Figs?|figs?|Illuss?|illuss?)\.\s*(?=\d)/gu
// `\p{Nd}`, não `\p{N}`: a chamada de nota colada («Abb. 12²⁰», «fig. 3a²⁰»; os sobrescritos são `No`) não impede a referência.
const NUMERO = /^(\d{1,4})([a-z])?(?![\p{L}\p{Nd}])/u
const LETRA = /^([a-z])(?![\p{L}\p{Nd}])/u
/**
 * A letra solta que continua uma parte com letra («3a, c», «212a und b»): só quando a lista acaba nela (o fim, a pontuação, a
 * chamada de nota) ou segue para outra parte. Em «fig. 7a, o motivo» e «fig. 3b e a deusa» o «o» e o «a» são palavras.
 */
const LETRA_QUE_CONTINUA = /^([a-z])(?![\p{L}\p{Nd}])(?=[⁰¹²³⁴⁵⁶⁷⁸⁹]|\s*$|\s*[),;.\]–-]|\s+(?:und|u\.|and|e|&|sowie)\s)/u
const TRACO = /^\s*[-–]\s*/
const SEPARADOR = /^\s*(?:,|;|\.(?=\d)|und\b|u\.|and\b|e\b|&|sowie\b)\s*/u

type Parte = { numero: number; letra: string }

/**
 * As figuras de uma lista depois da chave («3b-c», «52-53», «210-211,213», «212a und b», «3a; 5b»), expandidas, e quanto do
 * texto a lista ocupa (até o fim da última parte; o separador que não leva a outra parte fica fora).
 */
function lerListaDeFiguras(texto: string): { partes: Parte[]; comprimento: number } {
  const partes: Parte[] = []
  let resto = texto
  let ultimo: Parte | null = null
  let comprimento = 0
  for (;;) {
    const num = NUMERO.exec(resto)
    // a letra solta só continua uma parte com letra («3a, c», «212a und b»): em «Abb. 7, o motivo» o «o» é palavra
    const letraSo = num ? null : ultimo?.letra ? LETRA_QUE_CONTINUA.exec(resto) : null
    if (!num && !letraSo) break
    const atual: Parte = num ? { numero: Number(num[1]), letra: num[2] ?? '' } : { numero: ultimo!.numero, letra: letraSo![1]! }
    resto = resto.slice((num ?? letraSo)![0].length)
    const traco = TRACO.exec(resto)
    const ate = traco ? (NUMERO.exec(resto.slice(traco[0].length)) ?? (atual.letra ? LETRA.exec(resto.slice(traco[0].length)) : null)) : null
    if (traco && ate) {
      resto = resto.slice(traco[0].length + ate[0].length)
      const fimNumerico = /^\d/.test(ate[0])
      if (fimNumerico) {
        const fim = Number(ate[1])
        if (fim >= atual.numero && fim - atual.numero <= 500) for (let k = atual.numero; k <= fim; k++) partes.push({ numero: k, letra: '' })
        else partes.push(atual)
        ultimo = { numero: fim, letra: ate[2] ?? '' }
      } else {
        const de = atual.letra.charCodeAt(0)
        const a = ate[1]!.charCodeAt(0)
        for (let c = de; c <= Math.max(de, a); c++) partes.push({ numero: atual.numero, letra: String.fromCharCode(c) })
        ultimo = { numero: atual.numero, letra: ate[1]! }
      }
    } else {
      partes.push(atual)
      ultimo = atual
    }
    comprimento = texto.length - resto.length
    const sep = SEPARADOR.exec(resto)
    if (!sep) break
    resto = resto.slice(sep[0].length)
  }
  return { partes, comprimento }
}

/** Uma referência a figuras no texto: a chave e a lista («Abb. 1a», «figs. 3a–b»), [inicio, fim) em UTF-16, e as figuras dela. */
export interface ReferenciaNoTexto {
  inicio: number
  fim: number
  figuras: { numero: number; letra: string }[]
}

/** As referências a figuras do texto, em ordem («Pl.» e «Taf.», pranchas, não contam). */
export function referenciasDeFiguras(texto: string): ReferenciaNoTexto[] {
  const saida: ReferenciaNoTexto[] = []
  for (const m of texto.matchAll(CHAVE_DA_FIGURA)) {
    const depois = m.index + m[0].length
    const { partes, comprimento } = lerListaDeFiguras(texto.slice(depois))
    if (partes.length > 0) saida.push({ inicio: m.index, fim: depois + comprimento, figuras: partes })
  }
  return saida
}

/** A parte da referência vale para a figura (número e letra)? O número sem letra vale para todas as partes; a figura sem letra, para qualquer letra. */
export const parteCitaAFigura = (p: { numero: number; letra: string }, numero: number, sufixo: string): boolean =>
  p.numero === numero && (p.letra === '' || sufixo === '' || p.letra === sufixo.toLowerCase())

/** O parêntese mais curto que este destaque aceita levar junto («(cf. figs. 3b e 12a)»); um mais longo é uma incisa inteira. */
const PARENTESE_ATE = 60

/**
 * A referência à figura na frase de «Discutida em» (o «(fig. 3b)» do desenho): [inicio, fim) em UTF-16, com o parêntese em
 * volta quando a referência está num (curto); null se a frase não a cita.
 */
export function destaqueDaFigura(frase: string, numero: number, sufixo: string): { inicio: number; fim: number } | null {
  const r = referenciasDeFiguras(frase).find((x) => x.figuras.some((p) => parteCitaAFigura(p, numero, sufixo)))
  if (!r) return null
  const abre = frase.lastIndexOf('(', r.inicio)
  const fecha = frase.indexOf(')', r.fim)
  const dentro = abre >= 0 && fecha >= 0 && !frase.slice(abre + 1, r.inicio).includes(')') && !frase.slice(r.fim, fecha).includes('(')
  return dentro && fecha + 1 - abre <= PARENTESE_ATE ? { inicio: abre, fim: fecha + 1 } : { inicio: r.inicio, fim: r.fim }
}

/**
 * A frase cita a figura (número e letra)? Um número sem letra no texto vale para todas as partes; uma figura sem letra, para
 * qualquer letra: as referências da frase e a regra de `parteCitaAFigura` (revisão da Tarefa 25, 6: antes, uma cópia dela).
 */
function citaAFigura(frase: string, numero: number, sufixo: string): boolean {
  return referenciasDeFiguras(frase).some((r) => r.figuras.some((p) => parteCitaAFigura(p, numero, sufixo)))
}

/** A primeira frase do texto que cita a figura (`numero` e `sufixo`, «1» e «a» em «Abb. 1a»); null se nenhuma. */
export function fraseQueCita(texto: string, numero: number, sufixo: string): string | null {
  return dividirEmFrases(texto).find((f) => citaAFigura(f, numero, sufixo)) ?? null
}

/**
 * A frase de um trecho do § que cita a figura (decisão 91, a3), de preferência em português: a frase portuguesa que a cita;
 * senão, se o português tem tantas frases quanto o original, a da mesma posição da frase original que a cita; senão, a frase
 * original; e, sem nenhuma que a cite (a menção veio de outra forma), a primeira frase do português ou do original.
 */
export function fraseDoTrechoQueCita(original: string, portugues: string | null, numero: number, sufixo: string): { frase: string; lingua: 'pt' | 'original' } {
  if (portugues) {
    const pt = fraseQueCita(portugues, numero, sufixo)
    if (pt) return { frase: pt, lingua: 'pt' }
  }
  const frasesOriginais = dividirEmFrases(original)
  const i = frasesOriginais.findIndex((f) => citaAFigura(f, numero, sufixo))
  if (i >= 0 && portugues) {
    const frasesPt = dividirEmFrases(portugues)
    if (frasesPt.length === frasesOriginais.length) return { frase: frasesPt[i]!, lingua: 'pt' }
  }
  if (i >= 0) return { frase: frasesOriginais[i]!, lingua: 'original' }
  const primeira = portugues ? dividirEmFrases(portugues)[0] : undefined
  return primeira ? { frase: primeira, lingua: 'pt' } : { frase: frasesOriginais[0] ?? original.trim(), lingua: 'original' }
}
