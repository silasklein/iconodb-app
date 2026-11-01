/**
 * A dobra de texto da busca ("Maḥraṣ" = "mahras"), a mesma do pipeline em Python
 * (iconodb/search/fold.py). O índice guarda o texto já dobrado; o app dobra a consulta
 * do mesmo jeito, a partir da tabela `nucleo/fold.json` do pacote. A tabela define o
 * algoritmo (`ordem` lista os passos), então o app a lê em vez de ter uma cópia fixa.
 *
 * O que o JavaScript não tem pronto é o `str.casefold` do Python. Aqui ele é o
 * `toUpperCase().toLowerCase()` de cada code point, sozinho (assim o sigma final não
 * depende do vizinho), mais os poucos casos em que os dois divergem (CASOS_DO_CASEFOLD).
 * Os vetores do pacote (vetores-fold.json) decidem: veja fold.test.ts.
 */
import { ErroSemPacote, abrirBanco } from '../banco/cliente'
import { lerArquivoDoPacote } from '../pacote/local'

export const PASSOS = ['normalizacao', 'remover_marcas', 'casefold', 'extra', 'espacos'] as const
export type Passo = (typeof PASSOS)[number]

export interface FoldTabela {
  ordem: readonly Passo[]
  normalizacao: 'NFC' | 'NFD' | 'NFKC' | 'NFKD'
  removerMarcas: boolean
  casefold: boolean
  extra: ReadonlyMap<string, string>
  espacos: { substituto: string; aparar: boolean }
  /** Os apóstrofos de grafia, que ganham a forma colada no texto indexado. */
  apostrofos: readonly string[]
  /** Categorias gerais de `marcas`, como expressão (null se não há marcas a tirar). */
  readonly marcas: RegExp | null
  /** Qualquer sequência de caracteres de `espacos.caracteres`. */
  readonly sequenciaDeEspacos: RegExp
}

const erro = (mensagem: string) => new Error(`fold.json inválido: ${mensagem}`)

/** Valida os dados lidos de fold.json e monta a tabela. */
export function lerTabelaDeFold(dados: unknown): FoldTabela {
  if (typeof dados !== 'object' || dados === null) throw erro('não é um objeto')
  const d = dados as Record<string, unknown>

  if (!Array.isArray(d.ordem) || d.ordem.length === 0) throw erro('falta `ordem`')
  const ordem = d.ordem.map((p) => {
    if (typeof p !== 'string' || !(PASSOS as readonly string[]).includes(p)) throw erro(`passo desconhecido: ${String(p)}`)
    return p as Passo
  })

  const normalizacao = d.normalizacao
  if (normalizacao !== 'NFC' && normalizacao !== 'NFD' && normalizacao !== 'NFKC' && normalizacao !== 'NFKD') throw erro('`normalizacao`')

  const categorias = Array.isArray(d.marcas) ? d.marcas : []
  if (!categorias.every((c) => typeof c === 'string' && /^[A-Z][a-z]?$/.test(c))) throw erro('`marcas`')
  const marcas = categorias.length > 0 ? new RegExp(`[${categorias.map((c) => `\\p{${c as string}}`).join('')}]`, 'gu') : null

  if (typeof d.extra !== 'object' || d.extra === null) throw erro('`extra`')
  const extra = new Map<string, string>()
  for (const [de, para] of Object.entries(d.extra)) {
    if (typeof para !== 'string') throw erro('`extra`')
    extra.set(de, para)
  }

  const e = d.espacos as { caracteres?: unknown; substituto?: unknown; aparar_pontas?: unknown } | undefined
  if (!e || !Array.isArray(e.caracteres) || !e.caracteres.every((c) => Number.isInteger(c) && c >= 0 && c <= 0x10ffff)) throw erro('`espacos`')
  if (typeof e.substituto !== 'string') throw erro('`espacos.substituto`')
  const classe = (e.caracteres as number[]).map((c) => `\\u{${c.toString(16)}}`).join('')

  const colada = d.forma_colada as { apostrofos?: unknown } | undefined
  const apostrofos = Array.isArray(colada?.apostrofos) ? colada.apostrofos.filter((a): a is string => typeof a === 'string') : []

  return {
    ordem,
    normalizacao,
    removerMarcas: d.remover_marcas === true,
    casefold: d.casefold === true,
    extra,
    espacos: { substituto: e.substituto, aparar: e.aparar_pontas === true },
    apostrofos,
    marcas,
    sequenciaDeEspacos: new RegExp(`[${classe}]+`, 'gu'),
  }
}

/** O fold.json como bytes (como vem do pacote). */
export function lerTabelaDeBytes(bytes: Uint8Array): FoldTabela {
  return lerTabelaDeFold(JSON.parse(new TextDecoder().decode(bytes)))
}

/**
 * Onde `toUpperCase().toLowerCase()` de um code point difere do `casefold` do Python:
 * o "ı" sem pingo (o casefold o mantém; o passo `extra` o troca por "i"), o "ẞ" maiúsculo
 * e o alfabeto cherokee (o casefold leva tudo para as maiúsculas, o JavaScript para as minúsculas).
 */
function casefoldDoCaractere(c: string): string {
  const cp = c.codePointAt(0)!
  if (cp === 0x131) return c
  if (cp === 0x1e9e) return 'ss'
  if (cp >= 0x13a0 && cp <= 0x13f5) return c
  if (cp >= 0x13f8 && cp <= 0x13fd) return String.fromCodePoint(cp - 8)
  if (cp >= 0xab70 && cp <= 0xabbf) return String.fromCodePoint(cp - 0xab70 + 0x13a0)
  return c.toUpperCase().toLowerCase()
}

/** `str.casefold` do Python, caractere por caractere. */
export function casefold(texto: string): string {
  let saida = ''
  for (const c of texto) saida += casefoldDoCaractere(c)
  return saida
}

function aplicar(passo: Passo, texto: string, t: FoldTabela): string {
  switch (passo) {
    case 'normalizacao':
      return texto.normalize(t.normalizacao)
    case 'remover_marcas':
      return t.removerMarcas && t.marcas ? texto.replace(t.marcas, '') : texto
    case 'casefold':
      return t.casefold ? casefold(texto) : texto
    case 'extra': {
      let saida = ''
      for (const c of texto) saida += t.extra.get(c) ?? c
      return saida
    }
    case 'espacos': {
      const unidos = texto.replace(t.sequenciaDeEspacos, t.espacos.substituto)
      return t.espacos.aparar ? unidos.replace(/^ +| +$/g, '') : unidos
    }
  }
}

/** O texto dobrado: os passos de `tabela.ordem`, na sequência. `fold("ʿĒn el-Ǧarbā") === "en el-garba"`. */
export function fold(texto: string, tabela: FoldTabela): string {
  let atual = texto
  for (const passo of tabela.ordem) atual = aplicar(passo, atual, tabela)
  return atual
}

/**
 * O texto como vai para o índice: a forma colada, dobrada. Cada sequência sem espaço que
 * tem um apóstrofo de grafia é seguida de uma cópia sem os apóstrofos ("Marduk's" vira
 * "marduk s marduks"). Vale só para texto INDEXADO (o do núcleo e, mais adiante, as notas);
 * a consulta digitada não passa por aqui.
 */
export function textoIndexado(texto: string, tabela: FoldTabela): string {
  const partes: string[] = []
  for (const palavra of texto.split(tabela.sequenciaDeEspacos)) {
    partes.push(palavra)
    if (tabela.apostrofos.some((a) => palavra.includes(a))) {
      partes.push([...palavra].filter((c) => !tabela.apostrofos.includes(c)).join(''))
    }
  }
  return fold(partes.join(' '), tabela)
}

// ---------------------------------------------------------------------------
// A tabela do pacote
// ---------------------------------------------------------------------------

let doPacote: { chave: string; tabela: Promise<FoldTabela> } | null = null
let fixa: FoldTabela | null = null

/** Só nos testes: usa esta tabela em vez de ler a do pacote. `null` volta à do pacote. */
export function usarTabelaDeFold(tabela: FoldTabela | null): void {
  fixa = tabela
  doPacote = null
}

/**
 * A tabela de dobra do pacote que está aberto (`nucleo/fold.json` no aparelho). É lida de
 * novo quando o pacote muda (uma nova sincronização troca `geradoEm`).
 */
export async function tabelaDoPacote(): Promise<FoldTabela> {
  if (fixa) return fixa
  const estado = await abrirBanco()
  if (estado.estado !== 'aberto') throw new ErroSemPacote()
  if (doPacote?.chave !== estado.geradoEm) {
    const tabela = lerArquivoDoPacote('nucleo/fold.json').then((bytes) => {
      if (!bytes) throw new ErroSemPacote()
      return lerTabelaDeBytes(bytes)
    })
    const entrada = { chave: estado.geradoEm, tabela }
    doPacote = entrada
    tabela.catch(() => {
      if (doPacote === entrada) doPacote = null
    })
  }
  return doPacote.tabela
}
