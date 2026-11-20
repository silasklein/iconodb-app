/**
 * As peças puras da página do § (Etapa 4, Tarefa 25; tela 2 aprovada; decisão 91, a4 e a8): os links das referências a
 * figuras, o destaque da figura na frase de «Discutida em», o texto em peças (termo, link, correção), a posição do § na
 * seção, o que cada regra de correção fez, e as línguas abertas no computador, lembradas neste aparelho.
 */
import { destaqueDaFigura, parteCitaAFigura, referenciasDeFiguras } from '../banco/paragrafos'
import type { CorrecaoDeLeitura, ReferenciaDoParagrafo, SecaoDoParagrafo, Termo } from '../banco/tipos'
import { mapaDeCodepoints, paraUtf16 } from '../item/offsets'
import type { LinkNoTexto } from '../item/trechos'

export { destaqueDaFigura, referenciasDeFiguras }

/**
 * Os links das referências a figuras do texto: cada referência («Abb. 1a», «figs. 3a–b») vai ao objeto da primeira figura dela
 * que o § cita (`referencias`, na ordem das fontes). A referência a uma figura que o § não cita fica texto.
 */
export function linksDasFiguras(texto: string, referencias: readonly ReferenciaDoParagrafo[]): LinkNoTexto[] {
  if (referencias.length === 0) return []
  const links: LinkNoTexto[] = []
  for (const r of referenciasDeFiguras(texto)) {
    const alvo = r.figuras.map((p) => referencias.find((f) => parteCitaAFigura(p, f.numero, f.sufixo))).find((f) => f !== undefined)
    if (alvo) links.push({ inicio: r.inicio, fim: r.fim, destino: `/item/${encodeURIComponent(alvo.objeto)}`, rotulo: texto.slice(r.inicio, r.fim) })
  }
  return links
}

export type PecaDoParagrafo =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'termo'; texto: string; glId: string }
  | { tipo: 'link'; texto: string; destino: string }
  | { tipo: 'correcao'; texto: string; lido: string; regra: string; indice: number }
  | { tipo: 'chamada'; texto: string; numero: number }

const SOBRESCRITOS = '⁰¹²³⁴⁵⁶⁷⁸⁹'

/**
 * As chamadas de nota do texto (fix 1 da Tarefa 25): o leitor dos §§ (iconodb/paragrafos/leitor.py) escreve cada chamada como
 * algarismos sobrescritos colados à palavra («Probesiegel¹», «Abb. 12²⁰»), e a tradução os mantém. [inicio, fim) em UTF-16 e o
 * número (o `ordinal` da nota é o número impresso dela).
 */
export function chamadasDeNota(texto: string): { inicio: number; fim: number; numero: number }[] {
  return [...texto.matchAll(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/gu)].map((m) => ({
    inicio: m.index,
    fim: m.index + m[0].length,
    numero: Number([...m[0]].map((c) => SOBRESCRITOS.indexOf(c)).join('')),
  }))
}

interface Entrada {
  /** Em CODE POINTS, como no banco. */
  termos?: readonly Termo[]
  /** Em UTF-16. */
  links?: readonly LinkNoTexto[]
  /** Em UTF-16 (as consultas já as convertem). Vazio: não se mostram as correções. */
  correcoes?: readonly CorrecaoDeLeitura[]
  /** Os números das notas do § (`ordinal`): a chamada a uma delas vira a peça `chamada`; vazio (o inglês), nenhuma. */
  notas?: readonly number[]
}

/**
 * O texto de um trecho do § em peças para desenhar: a correção de leitura (quando se mostram) ganha de tudo o que ela cruza,
 * porque não se aninha um botão num link; depois a chamada de uma nota que o § tem (a que cruza uma correção fica texto);
 * depois o termo; depois o link da figura. As peças, juntas, recompõem o texto, e
 * nenhuma é vazia. Trechos vazios, invertidos ou fora do texto somem.
 */
export function pecasDoParagrafo(texto: string, { termos = [], links = [], correcoes = [], notas = [] }: Entrada): PecaDoParagrafo[] {
  if (texto === '') return []
  const mapa = mapaDeCodepoints(texto)
  const corte = (a: number | null, b: number | null) => (a === null || b === null ? null : { a: Math.max(0, a), b: Math.min(texto.length, b) })
  type Faixa<T> = { a: number; b: number; i: number; dado: T }
  const faixas = <T>(lista: readonly T[], pos: (d: T) => { a: number; b: number } | null): Faixa<T>[] =>
    lista.flatMap((dado, i) => {
      const p = pos(dado)
      return p && p.a < p.b ? [{ ...p, i, dado }] : []
    })
  const fCorrecoes = faixas(correcoes, (c) => corte(c.inicio, c.fim))
  const fTermos = faixas(termos, (t) => corte(paraUtf16(mapa, t.inicio), paraUtf16(mapa, t.fim)))
  const fLinks = faixas(links, (l) => corte(l.inicio, l.fim))
  const fChamadas = notas.length === 0
    ? []
    : faixas(
        chamadasDeNota(texto).filter((ch) => notas.includes(ch.numero)),
        (ch) => (fCorrecoes.some((c) => c.a < ch.fim && c.b > ch.inicio) ? null : { a: ch.inicio, b: ch.fim }),
      )
  const pontos = [...new Set([0, texto.length, ...[...fCorrecoes, ...fChamadas, ...fTermos, ...fLinks].flatMap((f) => [f.a, f.b])])].sort((x, y) => x - y)

  const pecas: PecaDoParagrafo[] = []
  let chaveAnterior = ''
  for (let k = 0; k + 1 < pontos.length; k++) {
    const x = pontos[k]!
    const y = pontos[k + 1]!
    const cobre = <T>(f: Faixa<T>) => f.a <= x && f.b >= y
    const pedaco = texto.slice(x, y)
    const c = fCorrecoes.find(cobre)
    const n = c ? undefined : fChamadas.find(cobre)
    const t = c || n ? undefined : fTermos.find(cobre)
    const l = c || n || t ? undefined : fLinks.find(cobre)
    const chave = c ? `c${c.i}` : n ? `n${n.i}` : t ? `t${t.i}` : l ? `l${l.i}` : 'x'
    const ultima = pecas[pecas.length - 1]
    if (ultima && chave === chaveAnterior) ultima.texto += pedaco
    else if (c) pecas.push({ tipo: 'correcao', texto: pedaco, lido: c.dado.lido, regra: c.dado.regra, indice: c.i })
    else if (n) pecas.push({ tipo: 'chamada', texto: pedaco, numero: n.dado.numero })
    else if (t) pecas.push({ tipo: 'termo', texto: pedaco, glId: t.dado.glId })
    else if (l) pecas.push({ tipo: 'link', texto: pedaco, destino: l.dado.destino })
    else pecas.push({ tipo: 'texto', texto: pedaco })
    chaveAnterior = chave
  }
  return pecas
}

const ORDINAIS = ['primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo', 'oitavo', 'nono', 'décimo']

/** «primeiro» … «décimo»; depois, «12.º». */
export const ordinalPorExtenso = (n: number): string => ORDINAIS[n - 1] ?? `${n}.º`

/** «terceiro de 5 §§ da seção» (decisão 91, a8); «do capítulo» no grupo de cima; null quando o § não está na lista. */
export function posicaoNaSecao(numero: number, secao: SecaoDoParagrafo | null): string | null {
  if (!secao) return null
  const i = secao.paragrafos.indexOf(numero)
  if (i < 0) return null
  const onde = secao.subcolecao ? 'da seção' : 'do capítulo'
  const total = secao.paragrafos.length
  return total === 1 ? `o único § ${onde}` : `${ordinalPorExtenso(i + 1)} de ${total} §§ ${onde}`
}

/** O que cada regra da correção do texto digitalizado fez (iconodb/ocr/correcao.py), para o cartão «Lido · Corrigido · Regra». */
const REGRAS: Record<string, string> = {
  PL: '«I» maiúsculo lido no lugar de «l» em «Pl.»',
  VGL: '«I» maiúsculo lido no lugar de «l» em «vgl.»',
  ROMANO_DEPOIS_DE_PERIODO: 'algarismos lidos no lugar do romano depois do período (EZ, MB, SB, FB)',
  ROMANO_DE_VOLUME: 'algarismos lidos no lugar do romano do volume',
  AYIN: 'sinal lido no lugar do ʿ (ayin)',
  BARRA: 'letra lida no lugar da barra «/»',
  PALAVRA_COLADA: 'duas palavras lidas juntas',
  RESTO_DE_DIACRITICO: 'resto de diacrítico da leitura restaurado (ḥ, š, ṣ, Ḫ)',
  ACENTO: 'acento restaurado pela lista de formas certas (IPIAO e glossário)',
  CHAMADA_DE_NOTA: 'chamada de nota lida colada à palavra',
  GLIFOS_ESPACADOS: 'letras espaçadas lidas como palavras soltas',
  VIRGULA_SEM_ESPACO: 'espaço que faltava depois da vírgula',
  PL_INGLES: '«i» lido no lugar de «l» em «pl.»',
  TIL_TRAVESSAO: '«~» lido no lugar do travessão',
}

/** A descrição da regra («RESTO_DE_DIACRITICO+ACENTO»: as duas, por «; »); a regra que o app não conhece fica como veio. */
export const descricaoDaRegra = (regra: string): string =>
  regra
    .split('+')
    .map((r) => REGRAS[r.trim()] ?? r.trim())
    .join('; ')

// ---------------------------------------------------------------------------
// As línguas abertas no computador (decisão 91, a4)
// ---------------------------------------------------------------------------

/** O alemão e o inglês abertos ao lado do português, no computador. */
export interface LinguasAbertas {
  de: boolean
  en: boolean
}

/**
 * A escolha fica lembrada NESTE aparelho, no localStorage, como o modo das coleções: não é da camada do usuário, nunca vira
 * evento nem vai ao Dropbox. Toda leitura e escrita é protegida: sem localStorage (modo privado, dados do site bloqueados), a
 * escolha vale na memória até recarregar.
 */
const CHAVE = 'iconodb:paragrafo-linguas'
const PADRAO: LinguasAbertas = { de: false, en: false }
let naMemoria: LinguasAbertas | null = null

export function lerLinguasAbertas(): LinguasAbertas {
  if (naMemoria) return naMemoria
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? 'null')
    if (typeof v === 'object' && v !== null) {
      const { de, en } = v as Record<string, unknown>
      if (typeof de === 'boolean' && typeof en === 'boolean') return { de, en }
    }
  } catch {
    // sem localStorage ou valor estragado: o padrão
  }
  return PADRAO
}

export function gravarLinguasAbertas(l: LinguasAbertas): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ de: l.de, en: l.en }))
    naMemoria = null
  } catch {
    naMemoria = { de: l.de, en: l.en }
  }
}

/** Esquece a escolha da memória (testes). */
export const esquecerLinguasDaMemoria = (): void => {
  naMemoria = null
}
