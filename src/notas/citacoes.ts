/**
 * Citações reconhecidas no texto do usuário (decisão 40): a pessoa escreve "IPIAO I: 60-62, 64" ou "CA00046" em texto
 * puro, sem `[[…]]`, e o app desenha cada número e cada intervalo como link. PURO: sem React, sem banco. O texto
 * guardado nunca muda; só a exibição (o hífen de um intervalo aparece como travessão curto, U+2013).
 *
 * GRAMÁTICA. `OBRA H*:H* LISTA`, onde H = espaço horizontal: tab ou \p{Zs} (espaço, NBSP U+00A0, espaço fino U+202F,
 * U+3000…); nunca uma quebra de linha, U+2028/U+2029, \v, \f ou U+FEFF: uma citação não atravessa linhas. FRONTEIRA = nem letra, nem
 * algarismo, nem marca combinante (\p{M}: assim NFC e NFD dão o mesmo), nem `_`.
 * - OBRA = SIGLA, ou SIGLA + H+ + VOLUME. SIGLA = 2+ letras [A-Z] com FRONTEIRA antes; VOLUME = [IVXLC]+. A obra (com um
 *   espaço comum entre sigla e volume) precisa ser aceita por `ehObra`: na tela, as planejadas (OBRAS_PLANEJADAS), o SKC
 *   e as abertas no pacote; no índice, QUALQUER uma (`qualquerObra`), para que uma citação de um volume que ainda não
 *   chegou já ligue quando ele chegar.
 * - LISTA = ITEM (SEP ITEM)*. SEP = H* , H*. A lista PARA no primeiro SEP que não é seguido de um ITEM
 *   ("IPIAO I: 60, 62 e 64": 60 e 62; "IPIAO I: 60. Depois": 60).
 * - ITEM, nesta ordem de tentativa; NUM = [1-9][0-9]{0,5} (sem zero, sem zero à esquerda); FIM = FRONTEIRA depois;
 *   TRACO = H*, um de - U+2010…U+2015 U+2212, H*; SEM_TRACO = não seguido de TRACO + [0-9]:
 *   1. intervalo: NUM (TRACO NUM)+ FIM SEM_TRACO. Válido só com DOIS números, de < até e até − de + 1 ≤
 *      MAXIMO_DO_INTERVALO; senão (três números como "60-61-62", invertido, longo demais) o casamento inteiro vira texto
 *      sem link e a lista continua.
 *   2. figura: `Abb.` H* NUM FIM SEM_TRACO. Não vale para o SKC.
 *   3. número: NUM, uma letra [a-z] opcional (não vale para o SKC), FIM, SEM_TRACO (assim "60-62a" não vira "60").
 *   Uma lista sem nenhum item válido não é citação (o texto fica como está).
 * - NÚMERO DO SISTEMA: o padrão único de objetos-skc/numeracao.ts (`FONTE_DO_NUMERO`: os 13 códigos de período, F1–F3
 *   inclusive, + 5 algarismos), n ≥ 1, só maiúsculas, com FRONTEIRA e sem `/` antes e FRONTEIRA depois.
 * - FORA DO RECONHECIMENTO: `[[…]]` (analisarTexto, links.ts); endereços: `https?://` ou `www.` até o próximo espaço, e
 *   os sem esquema com caminho (`rótulo(.rótulo)*.tld/…` com o tld de 2+ letras, como "museu.org/obj/CA00046"; não
 *   "Abb.1/2" nem "1.2/3"); código em linha (entre crases, na
 *   mesma linha). Cada trecho fora deles é lido sozinho (o começo dele é uma fronteira).
 *
 * PARA O PORTE PARA PYTHON (Tarefa 16: o pipeline lê as citações das notas para o índice):
 * - NÃO use `re.ASCII`. Escreva as classes ASCII explicitamente (`[0-9]`, `[A-Z]`, `[a-z]`, `[IVXLC]`), porque `\d` e
 *   `\w` sem `re.ASCII` aceitam outros alfabetos, e a fronteira precisa ser Unicode.
 * - FRONTEIRA: `(?<!\w)` / `(?!\w)` (Unicode: letras, algarismos e `_`) MAIS as marcas combinantes, que o `re` não
 *   cobre: use o módulo `regex` com `(?<![\w\p{M}])` / `(?![\w\p{M}])`, ou teste à mão `unicodedata.category(c)[0] ==
 *   'M'` no caractere vizinho. O número do sistema também recusa `/` antes.
 * - H: `[\t\p{Zs}]`, com o módulo `regex` (o `re` não tem `\p{Zs}`; e `[^\S\r\n]` NÃO é igual: o `\s` também casa
 *   U+2028/U+2029, \v, \f e, no JS, U+FEFF). TRACO: `[-\u2010-\u2015\u2212]` (hífen-menos, U+2010–U+2015, U+2212).
 * - URL sem esquema: `[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/\S*`, sem letra, algarismo, marca, `_`, `.` ou
 *   `-` imediatamente antes.
 * - O pipeline, que monta o índice, aceita QUALQUER sigla bem formada (como `qualquerObra`), não só as conhecidas.
 * - Varrer da esquerda para a direita; em cada posição, o primeiro casamento (o mais à esquerda) entre o início de
 *   citação e o número do sistema; uma citação recusada (obra desconhecida ou lista sem item válido) avança UM caractere
 *   a partir do início dela. Guarde os casamentos já achados enquanto o índice deles não ficou para trás (senão o custo
 *   é quadrático em textos como "AB: AB: AB: …").
 * - A chave de cada número citado (`chaveDaFonte`): `f"{obra}:{'Abb. ' if abb else ''}{numero}{sufixo.lower()}"`; um
 *   intervalo cobre cada número de `de` a `ate`. É a chave dos links reversos (indiceDeNotas.ts).
 * - Teste de aceitação: os casos de citacoes.test.ts (tabela) dão o mesmo resultado.
 */
import { chaveDaFonte } from '../banco/referencias'
import { FONTE_DO_NUMERO } from '../objetos-skc/numeracao'
import { analisarTexto, type PedacoDoTexto } from './links'

export { chaveDaFonte }

/** As obras que o app já conhece antes de o volume chegar (decisão 40). As abertas no pacote se somam a estas. */
export const OBRAS_PLANEJADAS: readonly string[] = ['IPIAO I', 'IPIAO II', 'IPIAO III', 'IPIAO IV', 'GGG', 'GGIG']
export const OBRA_SKC = 'SKC'

/** Um intervalo com mais números que isto fica como texto, sem link. */
export const MAXIMO_DO_INTERVALO = 100

export type PedacoDeCitacao =
  | { tipo: 'texto'; texto: string }
  /** "IPIAO I: ": a obra e os dois pontos; aparece como texto. */
  | { tipo: 'prefixo'; texto: string; obra: string }
  | { tipo: 'numero'; bruto: string; obra: string; numero: number; sufixo: string; abb: boolean }
  | { tipo: 'intervalo'; bruto: string; obra: string; de: number; ate: number }
  | { tipo: 'sistema'; bruto: string; numero: string }

export type PedacoComCitacao = PedacoDoTexto | PedacoDeCitacao

const PLANEJADAS = new Set([...OBRAS_PLANEJADAS, OBRA_SKC])
/** As obras planejadas e o SKC (sem o pacote). */
export const obraConhecida = (obra: string): boolean => PLANEJADAS.has(obra)
/** Qualquer obra bem formada (o índice dos links reversos). */
export const qualquerObra = (): boolean => true

const NUM = '[1-9][0-9]{0,5}'
/**
 * Espaço horizontal: tab ou um separador de espaço Unicode (\p{Zs}: espaço, NBSP U+00A0, espaço fino U+202F, U+3000…).
 * Não: quebras de linha, U+2028/U+2029, \v, \f, nem U+FEFF.
 */
const H = '[\\t\\p{Zs}]'
/** Os traços: hífen-menos, U+2010–U+2015 (hífen, hífen inseparável, figura, en, em, barra horizontal) e o menos U+2212. */
const TRACO = `${H}*[\\-\\u2010-\\u2015\\u2212]${H}*`
/** Fronteira: nem letra, nem algarismo, nem marca combinante (NFC e NFD dão o mesmo), nem `_`. */
const FIM = '(?![\\p{L}\\p{N}\\p{M}_])'
const SEM_TRACO = `(?!${TRACO}[0-9])`
const RE_INICIO = new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])([A-Z]{2,})(?:${H}+([IVXLC]+))?${H}*:${H}*`, 'gu')
/** O número do sistema (o padrão único, objetos-skc/numeracao.ts), n ≥ 1, sem `/` antes (o fim de um caminho). */
const RE_SISTEMA = new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_/])(?!..0{5})${FONTE_DO_NUMERO}${FIM}`, 'gu')
/** Dois números com traço; um terceiro ("60-61-62") entra no casamento e invalida o intervalo inteiro. */
const RE_INTERVALO = new RegExp(`(${NUM})${TRACO}(${NUM})((?:${TRACO}${NUM})*)${FIM}${SEM_TRACO}`, 'uy')
const RE_FIGURA = new RegExp(`Abb\\.${H}*(${NUM})${FIM}${SEM_TRACO}`, 'uy')
const RE_NUMERO = new RegExp(`(${NUM})([a-z]?)${FIM}${SEM_TRACO}`, 'uy')
const RE_SEP = new RegExp(`${H}*,${H}*`, 'uy')
/**
 * O que não se lê: endereços com esquema ou `www.`, endereços sem esquema com caminho ("museu.org/obj/CA00046": o último
 * rótulo antes da barra tem 2+ letras, para que "Abb.1/2" e "1.2/3" não contem como endereço) e código em linha.
 */
const RE_EXCLUIDO = /(?:https?:\/\/|www\.)\S+|(?<![\p{L}\p{N}\p{M}_.-])[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}\/\S*|`[^`\n]*`/gu

type Item = Extract<PedacoDeCitacao, { tipo: 'numero' | 'intervalo' }> | { tipo: 'invalido'; bruto: string }

/** O item que começa em `pos`, ou null. */
function lerItem(texto: string, pos: number, obra: string): Item | null {
  const skc = obra === OBRA_SKC
  RE_INTERVALO.lastIndex = pos
  let m = RE_INTERVALO.exec(texto)
  if (m) {
    const de = Number(m[1])
    const ate = Number(m[2])
    return !m[3] && de < ate && ate - de + 1 <= MAXIMO_DO_INTERVALO ? { tipo: 'intervalo', bruto: m[0], obra, de, ate } : { tipo: 'invalido', bruto: m[0] }
  }
  if (!skc) {
    RE_FIGURA.lastIndex = pos
    m = RE_FIGURA.exec(texto)
    if (m) return { tipo: 'numero', bruto: m[0], obra, numero: Number(m[1]), sufixo: '', abb: true }
  }
  RE_NUMERO.lastIndex = pos
  m = RE_NUMERO.exec(texto)
  if (m && !(skc && m[2])) return { tipo: 'numero', bruto: m[0], obra, numero: Number(m[1]), sufixo: m[2]!, abb: false }
  return null
}

/** Os itens da lista que começa em `pos` (separadores como texto) e onde ela acaba; null sem item válido. */
function lerLista(texto: string, pos: number, obra: string): { pedacos: PedacoDeCitacao[]; fim: number } | null {
  const pedacos: PedacoDeCitacao[] = []
  let validos = 0
  let fim = pos
  let item = lerItem(texto, pos, obra)
  while (item) {
    if (item.tipo === 'invalido') pedacos.push({ tipo: 'texto', texto: item.bruto })
    else {
      pedacos.push(item)
      validos++
    }
    fim += item.bruto.length
    RE_SEP.lastIndex = fim
    const sep = RE_SEP.exec(texto)
    if (!sep) break
    const proximo = lerItem(texto, fim + sep[0].length, obra)
    if (!proximo) break
    pedacos.push({ tipo: 'texto', texto: sep[0] })
    fim += sep[0].length
    item = proximo
  }
  return validos > 0 ? { pedacos, fim } : null
}

/** Lê um trecho sem endereço nem código. */
function lerTrecho(texto: string, ehObra: (obra: string) => boolean, saida: PedacoDeCitacao[]): void {
  let pos = 0
  let solto = 0
  // Os últimos casamentos valem enquanto não ficaram para trás (senão "AB: " repetido refaria a busca do número do
  // sistema até o fim do texto a cada passo: quadrático). `null`: não há mais nenhum dali em diante.
  let ini: RegExpExecArray | null | undefined
  let sis: RegExpExecArray | null | undefined
  while (pos < texto.length) {
    if (ini === undefined || (ini && ini.index < pos)) {
      RE_INICIO.lastIndex = pos
      ini = RE_INICIO.exec(texto)
    }
    if (sis === undefined || (sis && sis.index < pos)) {
      RE_SISTEMA.lastIndex = pos
      sis = RE_SISTEMA.exec(texto)
    }
    if (!ini && !sis) break
    if (sis && (!ini || sis.index < ini.index)) {
      acrescentarTexto(saida, texto.slice(solto, sis.index))
      saida.push({ tipo: 'sistema', bruto: sis[0], numero: sis[0] })
      pos = solto = sis.index + sis[0].length
      continue
    }
    const m = ini!
    const obra = m[2] ? `${m[1]} ${m[2]}` : m[1]!
    const lista = ehObra(obra) ? lerLista(texto, m.index + m[0].length, obra) : null
    if (!lista) {
      pos = m.index + 1
      continue
    }
    acrescentarTexto(saida, texto.slice(solto, m.index))
    saida.push({ tipo: 'prefixo', texto: m[0], obra })
    for (const p of lista.pedacos) p.tipo === 'texto' ? acrescentarTexto(saida, p.texto) : saida.push(p)
    pos = solto = lista.fim
  }
  acrescentarTexto(saida, texto.slice(solto))
}

function acrescentarTexto(saida: PedacoDeCitacao[], t: string): void {
  if (t === '') return
  const ultimo = saida.at(-1)
  if (ultimo?.tipo === 'texto') ultimo.texto += t
  else saida.push({ tipo: 'texto', texto: t })
}

/**
 * As citações de um texto SEM `[[…]]` (veja `analisarComCitacoes`). Juntar `texto`/`bruto` dos pedaços devolve o
 * original; nunca há dois textos seguidos nem texto vazio.
 */
export function reconhecerCitacoes(texto: string, ehObra: (obra: string) => boolean = obraConhecida): PedacoDeCitacao[] {
  const saida: PedacoDeCitacao[] = []
  let fim = 0
  for (const m of texto.matchAll(RE_EXCLUIDO)) {
    lerTrecho(texto.slice(fim, m.index), ehObra, saida)
    acrescentarTexto(saida, m[0])
    fim = m.index + m[0].length
  }
  lerTrecho(texto.slice(fim), ehObra, saida)
  return saida
}

/** Os links `[[…]]` (links.ts) e, no texto entre eles, as citações. Juntar devolve o original. */
export function analisarComCitacoes(texto: string, ehObra: (obra: string) => boolean = obraConhecida): PedacoComCitacao[] {
  return analisarTexto(texto).flatMap((p): PedacoComCitacao[] => (p.tipo === 'texto' ? reconhecerCitacoes(p.texto, ehObra) : [p]))
}

/** Como o pedaço aparece: o intervalo com travessão curto ("60–62"); o resto, como foi digitado. */
export function textoDoPedaco(p: PedacoDeCitacao): string {
  switch (p.tipo) {
    case 'texto':
    case 'prefixo':
      return p.texto
    case 'intervalo':
      return `${p.de}–${p.ate}`
    default:
      return p.bruto
  }
}

/** Os números que um pedaço cita, como chaves (um intervalo, cada número dele). */
export function chavesDoPedaco(p: Extract<PedacoDeCitacao, { tipo: 'numero' | 'intervalo' }>): string[] {
  if (p.tipo === 'numero') return [chaveDaFonte(p.obra, p.numero, p.sufixo, p.abb)]
  const chaves: string[] = []
  for (let n = p.de; n <= p.ate; n++) chaves.push(chaveDaFonte(p.obra, n))
  return chaves
}

/**
 * O que o texto cita fora dos `[[…]]`, sem repetir, na ordem: as chaves das fontes (cada número de um intervalo) e os
 * números do sistema. Por padrão com `qualquerObra` (o índice dos links reversos).
 */
export function citacoesDoTexto(texto: string, ehObra: (obra: string) => boolean = qualquerObra): { fontes: string[]; objetos: string[] } {
  const fontes = new Set<string>()
  const objetos = new Set<string>()
  for (const p of analisarComCitacoes(texto, ehObra)) {
    if (p.tipo === 'numero' || p.tipo === 'intervalo') for (const c of chavesDoPedaco(p)) fontes.add(c)
    else if (p.tipo === 'sistema') objetos.add(p.numero)
  }
  return { fontes: [...fontes], objetos: [...objetos] }
}
