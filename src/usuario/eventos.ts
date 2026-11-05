/**
 * O evento da camada do usuário (uma linha JSON do diário) e a sua validação. Puro.
 *
 *   {"v":1,"id":"<aparelho>-<seq>-<n>","hlc":"<ms 13 díg>-<contador 4 díg>-<aparelho>","aparelho":"…",
 *    "tipo":"nota|…","reg":"<id do registro>","op":"criar|alterar|excluir|restaurar","campos":{…}}
 *
 * - `seq` é o número do evento neste aparelho (crescente) e `n` a posição do evento dentro de uma gravação
 *   de vários eventos de uma vez (0 quando é um só).
 * - Os valores dos campos são valores JSON. `null` é um valor (limpa o campo), diferente de ausente.
 *
 * Também aqui: `jsonCanonico`, a serialização canônica (chaves ordenadas por ponto de código, sem espaços),
 * usada pelo estado canônico da fusão e pela porta em Python (Tarefa 16).
 */
import { validoHlc } from './hlc'

export const TIPOS = ['nota', 'colecao', 'hipotese', 'regiao', 'posicao', 'verbete', 'sitio', 'item-sitio', 'revisao', 'objeto', 'imagem', 'ligacao', 'comparar'] as const
export type Tipo = (typeof TIPOS)[number]

export const OPS = ['criar', 'alterar', 'excluir', 'restaurar'] as const
export type Op = (typeof OPS)[number]

/** Prefixos dos ids de registro "<PREFIXO>-<aparelho>-<n>" (`GL`: os verbetes do usuário, decisão 41; src/glossario/modelo.ts). */
export const PREFIXOS = ['NT', 'CO', 'HY', 'RG', 'SI', 'OB', 'IM', 'GL'] as const
export type Prefixo = (typeof PREFIXOS)[number]
/** O prefixo de cada tipo que cria registros com id próprio. */
export const PREFIXO_DO_TIPO: Partial<Record<Tipo, Prefixo>> = { nota: 'NT', colecao: 'CO', hipotese: 'HY', regiao: 'RG', sitio: 'SI', objeto: 'OB', imagem: 'IM', verbete: 'GL' }

export type Json = null | boolean | number | string | Json[] | { [chave: string]: Json }
export type Campos = { [campo: string]: Json }

export interface Evento {
  v: 1
  id: string
  hlc: string
  aparelho: string
  tipo: Tipo
  reg: string
  op: Op
  campos: Campos
}

export type MotivoDeRecusa = 'objeto' | 'versao' | 'aparelho' | 'id' | 'hlc' | 'tipo' | 'reg' | 'op' | 'campos' | 'numero'
export type Validacao = { ok: true; evento: Evento } | { ok: false; motivo: MotivoDeRecusa }

const APARELHO = /^[a-z0-9]{8}$/
const ID = /^([a-z0-9]{8})-[0-9]+-[0-9]+$/
const CONJUNTO_TIPOS: ReadonlySet<string> = new Set(TIPOS)
const CONJUNTO_OPS: ReadonlySet<string> = new Set(OPS)

export const tipoValido = (t: unknown): t is Tipo => typeof t === 'string' && CONJUNTO_TIPOS.has(t)
export const opValida = (o: unknown): o is Op => typeof o === 'string' && CONJUNTO_OPS.has(o)

function objetoSimples(x: unknown): x is Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false
  const proto = Object.getPrototypeOf(x)
  return proto === Object.prototype || proto === null
}

/**
 * O maior inteiro exato num número do JavaScript (2^53 − 1). Todo double com módulo acima disso é inteiro e
 * pode já ter sido arredondado (9007199254740993 vira …992), e o Python os leria exatos: números assim são
 * recusados (motivo "numero"), para o app e a porta em Python nunca divergirem.
 */
export const MAIOR_NUMERO = Number.MAX_SAFE_INTEGER

/**
 * O que impede `x` de ser um valor JSON aceito: "campos" (undefined, NaN/Infinity, função, data, ciclo,
 * lista esparsa), "numero" (|n| > 2^53 − 1) ou null (é aceito).
 */
export function problemaJson(x: unknown, vistos: Set<object> = new Set()): 'campos' | 'numero' | null {
  switch (typeof x) {
    case 'string':
    case 'boolean':
      return null
    case 'number':
      if (!Number.isFinite(x)) return 'campos'
      return Math.abs(x) > MAIOR_NUMERO ? 'numero' : null
    case 'object': {
      if (x === null) return null
      if (vistos.has(x)) return 'campos'
      vistos.add(x)
      let problema: 'campos' | 'numero' | null = null
      // Um for (não every) para recusar listas esparsas: os buracos não são JSON.
      if (Array.isArray(x)) {
        for (let i = 0; i < x.length && !problema; i++) problema = i in x ? problemaJson(x[i], vistos) : 'campos'
      } else if (!objetoSimples(x)) problema = 'campos'
      else for (const y of Object.values(x)) if ((problema = problemaJson(y, vistos))) break
      vistos.delete(x)
      return problema
    }
    default:
      return 'campos'
  }
}

/** É um valor JSON aceito (veja problemaJson)? */
export function valorJson(x: unknown): x is Json {
  return problemaJson(x) === null
}

/**
 * Valida um evento vindo de qualquer lugar (diário de outro aparelho, IndexedDB). Regras, na ordem
 * (a primeira que falha dá o motivo):
 * 1. objeto: é um objeto JSON (não nulo, não lista);
 * 2. versao: `v` é o número 1;
 * 3. aparelho: `aparelho` casa /^[a-z0-9]{8}$/;
 * 4. id: `id` casa /^<aparelho>-[0-9]+-[0-9]+$/ com o mesmo aparelho;
 * 5. hlc: `hlc` casa /^\d{13}-\d{4}-[a-z0-9]{8}$/, os ms não passam de LIMITE_MS (2250-01-01,
 *    8835955200000) e termina com "-<aparelho>";
 * 6. tipo: um dos TIPOS; 7. reg: texto não vazio; 8. op: uma das OPS;
 * 9. campos: objeto JSON (não lista) cujos valores são valores JSON;
 * 10. numero: nenhum número dentro dos campos tem módulo acima de 2^53 − 1 (9007199254740991).
 * Chaves extras são aceitas e DESCARTADAS: o evento devolvido é um objeto novo só com as 8 chaves do
 * contrato (v, id, hlc, aparelho, tipo, reg, op, campos).
 */
export function validarEvento(x: unknown): Validacao {
  if (!objetoSimples(x)) return { ok: false, motivo: 'objeto' }
  if (x.v !== 1) return { ok: false, motivo: 'versao' }
  const aparelho = x.aparelho
  if (typeof aparelho !== 'string' || !APARELHO.test(aparelho)) return { ok: false, motivo: 'aparelho' }
  if (typeof x.id !== 'string' || ID.exec(x.id)?.[1] !== aparelho) return { ok: false, motivo: 'id' }
  if (!validoHlc(x.hlc) || !x.hlc.endsWith(`-${aparelho}`)) return { ok: false, motivo: 'hlc' }
  if (!tipoValido(x.tipo)) return { ok: false, motivo: 'tipo' }
  if (typeof x.reg !== 'string' || x.reg === '') return { ok: false, motivo: 'reg' }
  if (!opValida(x.op)) return { ok: false, motivo: 'op' }
  if (!objetoSimples(x.campos)) return { ok: false, motivo: 'campos' }
  const problema = problemaJson(x.campos)
  if (problema) return { ok: false, motivo: problema }
  // Só as chaves do contrato: as outras não têm sentido na v1 e nunca entram em comparação, armazenamento
  // ou fusão (uma chave extra "1e400" vira Infinity no JSON.parse, que o JSON canônico não aceita).
  const evento: Evento = { v: 1, id: x.id, hlc: x.hlc, aparelho, tipo: x.tipo, reg: x.reg, op: x.op, campos: x.campos as Campos }
  return { ok: true, evento }
}

/**
 * Duas cópias com o mesmo id (uma corrompida, ou um id reutilizado por defeito): vence a de maior hlc e,
 * com o mesmo hlc, a de maior JSON canônico das 8 chaves do contrato (por ponto de código; chaves extras
 * não contam). Determinístico, em qualquer ordem. Recebe eventos já validados.
 * Devolve > 0 se `a` vence, < 0 se `b` vence, 0 se são iguais.
 */
export function compararCopias(a: Evento, b: Evento): number {
  if (a === b) return 0
  if (a.hlc !== b.hlc) return a.hlc > b.hlc ? 1 : -1
  return compararPorPontoDeCodigo(jsonCanonico(doContrato(a)), jsonCanonico(doContrato(b)))
}

/** Só as chaves do contrato (defesa: validarEvento já as deixa só essas). */
const doContrato = (e: Evento) => ({ v: e.v, id: e.id, hlc: e.hlc, aparelho: e.aparelho, tipo: e.tipo, reg: e.reg, op: e.op, campos: e.campos })

export interface DadosDoEvento {
  aparelho: string
  seq: number
  n: number
  hlc: string
  tipo: Tipo
  reg: string
  op: Op
  campos: Campos
}

/**
 * Monta e valida um evento local. Lança Error com o motivo se ele não for válido. Os campos são copiados:
 * mudar depois o objeto de quem chamou não muda o evento (nem o estado nem o histórico).
 */
export function montarEvento(d: DadosDoEvento): Evento {
  const evento = { v: 1, id: `${d.aparelho}-${d.seq}-${d.n}`, hlc: d.hlc, aparelho: d.aparelho, tipo: d.tipo, reg: d.reg, op: d.op, campos: d.campos }
  const r = validarEvento(evento)
  if (!r.ok) throw new Error(`evento inválido (${r.motivo}): ${d.tipo} ${JSON.stringify(d.reg)} ${d.op}`)
  return { ...r.evento, campos: JSON.parse(JSON.stringify(d.campos)) as Campos }
}

/** Compara textos por ponto de código (a ordem de `sorted()` em Python), não por unidade UTF-16. */
export function compararPorPontoDeCodigo(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a.charCodeAt(i)
    const y = b.charCodeAt(i)
    if (x === y) continue
    // Só diferem de UTF-16 quando um dos dois é surrogate (>= U+D800) e o outro está em U+E000–U+FFFF.
    const sx = x >= 0xd800 && x <= 0xdfff
    const sy = y >= 0xd800 && y <= 0xdfff
    if (sx === sy) return x - y
    return sx ? 1 : -1
  }
  return a.length - b.length
}

/**
 * JSON canônico: chaves de objeto ordenadas por ponto de código, recursivamente; listas na ordem;
 * sem espaços; textos e números como JSON.stringify (equivale a Python json.dumps(..., ensure_ascii=False,
 * separators=(",", ":"), sort_keys=True) com números no formato do JavaScript). Lança para valores fora do JSON.
 */
export function jsonCanonico(valor: unknown): string {
  switch (typeof valor) {
    case 'string':
    case 'boolean':
      return JSON.stringify(valor)
    case 'number':
      if (!Number.isFinite(valor)) throw new TypeError('número fora do JSON')
      return JSON.stringify(valor)
    case 'object': {
      if (valor === null) return 'null'
      if (Array.isArray(valor)) return `[${Array.from(valor, jsonCanonico).join(',')}]`
      if (!objetoSimples(valor)) throw new TypeError('objeto fora do JSON')
      const chaves = Object.keys(valor).sort(compararPorPontoDeCodigo)
      return `{${chaves.map((k) => `${JSON.stringify(k)}:${jsonCanonico(valor[k])}`).join(',')}}`
    }
    default:
      throw new TypeError(`valor fora do JSON: ${typeof valor}`)
  }
}
