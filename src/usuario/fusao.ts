/**
 * A fusão da camada do usuário: eventos (de todos os aparelhos, em qualquer ordem, com repetições)
 * → estado. Pura e determinística: sem IndexedDB, sem relógio, sem React.
 *
 * MUDAM JUNTOS: esta fusão e o seu porte em Python (`iconodb/usuario.py` no repositório privado do pipeline, Tarefa 16;
 * também `eventos.ts`, `hlc.ts`, a numeração SKC e o sha das âncoras). Quem mudar uma regra aqui muda lá, regenera os vetores
 * (`ATUALIZAR_VETORES=1`, src/usuario/fusao.vetores.test.ts) e os copia para `tests/fixtures/` do pipeline, que tem de
 * reproduzir cada estado canônico byte a byte.
 *
 * Regras (as mesmas da porta em Python, Tarefa 16; vetores em tests/fixtures/fusao-vetores.json):
 * - Um registro é identificado por (tipo, reg). Ele existe se algum evento válido o cita.
 * - Cada evento válido escreve cada um dos seus `campos` (qualquer op). Por (tipo, reg, campo) guardamos
 *   TODAS as escritas, em ordem de (hlc, id do evento); a última é o valor atual, as outras são o histórico.
 *   O hlc já desempata pelo aparelho; o id do evento só desempata um hlc repetido (aparelho com defeito).
 * - Eventos com o mesmo id contam uma vez. Cópias DIFERENTES do mesmo id (corrompidas) são um conflito:
 *   vence a de maior hlc e, com o mesmo hlc, a de maior JSON canônico (compararCopias); os conflitos são
 *   contados em `conflitos`. O armazém (armazem.ts) aplica a mesma regra ao guardar.
 * - Escritas com o mesmo id de evento contam uma vez também por campo: fica a maior em (hlc, JSON canônico
 *   do valor). Isso só decide entre uma base e uma cópia diferente de um evento que já está nela.
 * - excluir/restaurar formam uma marca à parte: vale a de maior (hlc, id do evento, op). `excluido` é
 *   "a marca vencedora é excluir". Editar depois de excluir muda os campos mas não desfaz a exclusão.
 * - criadoEm = o menor hlc dos eventos do registro; alteradoEm = o maior.
 * - Eventos inválidos (validarEvento) são ignorados e contados; registros inválidos de uma base também
 *   (validarBase).
 *
 * Como cada parte é um máximo, um mínimo ou uma união com máximo por id, a fusão é comutativa, associativa
 * e idempotente: fundir(novos, consolidar(fundir(antigos))) = fundir(antigos + novos).
 */
import { compararCopias, compararPorPontoDeCodigo, jsonCanonico, TIPOS, tipoValido, validarEvento, valorJson, type Campos, type Evento, type Json, type MotivoDeRecusa, type Tipo } from './eventos'
import { validoHlc } from './hlc'

// ---------------------------------------------------------------- tipos públicos

/** Uma escrita de um campo. */
export interface Entrada {
  hlc: string
  evento: string
  valor: Json
}

/** A marca de exclusão vencedora de um registro. */
export interface Marca {
  hlc: string
  evento: string
  op: 'excluir' | 'restaurar'
}

/** Um registro consolidado: todas as escritas de cada campo (em ordem; a última é a atual). */
export interface RegistroConsolidado {
  tipo: Tipo
  id: string
  criadoEm: string
  alteradoEm: string
  exclusao: Marca | null
  campos: { [campo: string]: Entrada[] }
}

/** A base de estado.json: o estado fundido sem perda (todas as escritas), serializável. */
export interface EstadoConsolidado {
  v: 1
  registros: RegistroConsolidado[]
}

export interface Registro {
  readonly id: string
  readonly tipo: Tipo
  /** O valor atual de cada campo já escrito (null é um valor; campo nunca escrito fica ausente). */
  readonly campos: Readonly<Campos>
  /** hlc do primeiro evento do registro. */
  readonly criadoEm: string
  /** hlc do último evento do registro (inclusive excluir/restaurar). */
  readonly alteradoEm: string
  readonly excluido: boolean
}

export interface EntradaDeHistorico {
  valor: Json
  hlc: string
  aparelho: string
  evento: string
}

export interface Ignorados {
  total: number
  motivos: Partial<Record<MotivoDeRecusa, number>>
}

export interface Estado {
  /** Um mapa por tipo (os 13 sempre presentes), com todos os registros, inclusive os excluídos. */
  readonly registros: ReadonlyMap<Tipo, ReadonlyMap<string, Registro>>
  /** Os registros excluídos (marca vencedora = excluir), em ordem (tipo, id). */
  readonly excluidos: readonly Registro[]
  /** Eventos inválidos recebidos nas fusões que deram este estado. */
  readonly ignorados: Ignorados
  /** Ids recebidos com conteúdos diferentes (cópias corrompidas) nas fusões que deram este estado. */
  readonly conflitos: number
  registro(tipo: Tipo, id: string): Registro | undefined
  /** Os valores anteriores de um campo (todas as escritas menos a atual), em ordem de (hlc, evento). */
  historico(reg: string, campo: string, tipo: Tipo): EntradaDeHistorico[]
  /** O hlc da escrita que vale agora em um campo (a maior); null se o campo nunca foi escrito. */
  hlcDoCampo(tipo: Tipo, reg: string, campo: string): string | null
  /** A marca de excluir/restaurar que vale agora (com o id do evento), ou null se nunca houve uma. */
  marcaDeExclusao(tipo: Tipo, reg: string): Marca | null
}

// ---------------------------------------------------------------- interno

interface Interno {
  tipo: Tipo
  id: string
  criadoEm: string
  alteradoEm: string
  exclusao: Marca | null
  campos: Map<string, Entrada[]>
}
type Internos = Map<Tipo, Map<string, Interno>>

/** O aparelho de um hlc: o que vem depois de "<13>-<4>-". */
const aparelhoDoHlc = (hlc: string) => hlc.slice(19)

const comparar = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function compararEntradas(a: Entrada, b: Entrada): number {
  return comparar(a.hlc, b.hlc) || comparar(a.evento, b.evento) || (a === b ? 0 : compararPorPontoDeCodigo(jsonCanonico(a.valor), jsonCanonico(b.valor)))
}

function compararMarcas(a: Marca, b: Marca): number {
  return comparar(a.hlc, b.hlc) || comparar(a.evento, b.evento) || comparar(a.op, b.op)
}

/** Ordena por (hlc, evento, valor) e deixa uma entrada por evento: a maior. Muda a lista no lugar. */
function normalizar(lista: Entrada[]): void {
  if (lista.length < 2) return
  lista.sort(compararEntradas)
  const vistos = new Set<string>()
  let escrever = lista.length
  for (let i = lista.length - 1; i >= 0; i--) {
    const e = lista[i]!
    if (vistos.has(e.evento)) continue
    vistos.add(e.evento)
    lista[--escrever] = e
  }
  if (escrever > 0) lista.splice(0, escrever)
}

/**
 * Junta eventos (e registros de uma base) num conjunto de internos. Com `copiar`, os internos de entrada
 * são de um Estado já publicado: nada deles é mudado; o que for tocado é copiado antes (copy-on-write).
 */
class Acumulador {
  readonly internos: Internos
  /** (tipo → ids) dos registros tocados. */
  readonly tocados = new Map<Tipo, Set<string>>()
  readonly ignorados: Ignorados
  private readonly sujas = new Set<Entrada[]>()
  private readonly proprios = new Set<object>()

  constructor(internos: Internos, ignorados: Ignorados, private readonly copiar: boolean) {
    this.internos = copiar ? new Map(internos) : internos
    this.ignorados = { total: ignorados.total, motivos: { ...ignorados.motivos } }
  }

  private mapa(tipo: Tipo): Map<string, Interno> {
    let m = this.internos.get(tipo)!
    if (this.copiar && !this.proprios.has(m)) {
      m = new Map(m)
      this.internos.set(tipo, m)
      this.proprios.add(m)
    }
    return m
  }

  private registro(tipo: Tipo, id: string, criadoEm: string, alteradoEm: string): Interno {
    const m = this.mapa(tipo)
    let r = m.get(id)
    if (!r) {
      r = { tipo, id, criadoEm, alteradoEm, exclusao: null, campos: new Map() }
      m.set(id, r)
      this.proprios.add(r)
    } else {
      if (this.copiar && !this.proprios.has(r)) {
        r = { ...r, campos: new Map(r.campos) }
        m.set(id, r)
        this.proprios.add(r)
      }
      if (criadoEm < r.criadoEm) r.criadoEm = criadoEm
      if (alteradoEm > r.alteradoEm) r.alteradoEm = alteradoEm
    }
    let ids = this.tocados.get(tipo)
    if (!ids) this.tocados.set(tipo, (ids = new Set()))
    ids.add(id)
    return r
  }

  private marcar(r: Interno, marca: Marca | null): void {
    if (marca && (!r.exclusao || compararMarcas(marca, r.exclusao) > 0)) r.exclusao = marca
  }

  private escrever(r: Interno, campo: string, entradas: readonly Entrada[]): void {
    let lista = r.campos.get(campo)
    if (!lista) {
      lista = entradas.slice()
      r.campos.set(campo, lista)
      this.proprios.add(lista)
    } else {
      if (this.copiar && !this.proprios.has(lista)) {
        lista = lista.slice()
        r.campos.set(campo, lista)
        this.proprios.add(lista)
      }
      for (const e of entradas) lista.push(e)
    }
    if (lista.length > 1) this.sujas.add(lista)
  }

  ignorar(motivo: MotivoDeRecusa): void {
    this.ignorados.total++
    this.ignorados.motivos[motivo] = (this.ignorados.motivos[motivo] ?? 0) + 1
  }

  /** O evento validado, ou null (ignorado e contado). */
  validar(x: unknown): Evento | null {
    const v = validarEvento(x)
    if (v.ok) return v.evento
    this.ignorar(v.motivo)
    return null
  }

  evento(ev: Evento): void {
    const r = this.registro(ev.tipo, ev.reg, ev.hlc, ev.hlc)
    if (ev.op === 'excluir' || ev.op === 'restaurar') this.marcar(r, { hlc: ev.hlc, evento: ev.id, op: ev.op })
    for (const campo of Object.keys(ev.campos)) this.escrever(r, campo, [{ hlc: ev.hlc, evento: ev.id, valor: ev.campos[campo]! }])
  }

  base(rc: RegistroConsolidado): void {
    const r = this.registro(rc.tipo, rc.id, rc.criadoEm, rc.alteradoEm)
    this.marcar(r, rc.exclusao)
    for (const campo of Object.keys(rc.campos)) this.escrever(r, campo, rc.campos[campo]!)
  }

  terminar(): void {
    for (const lista of this.sujas) normalizar(lista)
    this.sujas.clear()
  }
}

function publico(r: Interno): Registro {
  const campos: Campos = Object.create(null)
  for (const campo of [...r.campos.keys()].sort(compararPorPontoDeCodigo)) {
    const lista = r.campos.get(campo)!
    campos[campo] = lista[lista.length - 1]!.valor
  }
  return Object.freeze({ id: r.id, tipo: r.tipo, campos: Object.freeze(campos), criadoEm: r.criadoEm, alteradoEm: r.alteradoEm, excluido: r.exclusao?.op === 'excluir' })
}

const INTERNOS = new WeakMap<Estado, Internos>()

class EstadoFundido implements Estado {
  constructor(
    readonly registros: ReadonlyMap<Tipo, ReadonlyMap<string, Registro>>,
    readonly excluidos: readonly Registro[],
    readonly ignorados: Ignorados,
    readonly conflitos: number,
  ) {}

  registro(tipo: Tipo, id: string): Registro | undefined {
    return this.registros.get(tipo)?.get(id)
  }

  hlcDoCampo(tipo: Tipo, reg: string, campo: string): string | null {
    return INTERNOS.get(this)!.get(tipo)?.get(reg)?.campos.get(campo)?.at(-1)?.hlc ?? null
  }

  marcaDeExclusao(tipo: Tipo, reg: string): Marca | null {
    const m = INTERNOS.get(this)!.get(tipo)?.get(reg)?.exclusao
    return m ? { ...m } : null
  }

  historico(reg: string, campo: string, tipo: Tipo): EntradaDeHistorico[] {
    const lista = INTERNOS.get(this)!.get(tipo)?.get(reg)?.campos.get(campo)
    if (!lista) return []
    return lista.slice(0, -1).map((e) => ({ valor: e.valor, hlc: e.hlc, aparelho: aparelhoDoHlc(e.hlc), evento: e.evento }))
  }
}

const compararRegistros = (a: { tipo: string; id: string }, b: { tipo: string; id: string }) =>
  compararPorPontoDeCodigo(a.tipo, b.tipo) || compararPorPontoDeCodigo(a.id, b.id)

function listarExcluidos(registros: ReadonlyMap<Tipo, ReadonlyMap<string, Registro>>): Registro[] {
  const excluidos: Registro[] = []
  for (const m of registros.values()) for (const r of m.values()) if (r.excluido) excluidos.push(r)
  return excluidos.sort(compararRegistros)
}

function publicar(registros: Map<Tipo, ReadonlyMap<string, Registro>>, internos: Internos, ignorados: Ignorados, conflitos: number): Estado {
  const estado = new EstadoFundido(registros, Object.freeze(listarExcluidos(registros)), Object.freeze({ total: ignorados.total, motivos: Object.freeze(ignorados.motivos) }), conflitos)
  INTERNOS.set(estado, internos)
  return Object.freeze(estado)
}

function internosDe(estado: Estado): Internos {
  const i = INTERNOS.get(estado)
  if (!i) throw new TypeError('estado não veio de fundir/aplicar')
  return i
}

// ---------------------------------------------------------------- API

/**
 * Funde eventos (de qualquer origem: os inválidos são ignorados e contados) sobre uma base consolidada
 * opcional (estado.json, já validada com validarBase), ou várias (a união delas). Pura: não muda os
 * eventos nem a base. O(n log n) no número de escritas.
 */
export function fundir(eventos: Iterable<unknown>, base?: EstadoConsolidado | readonly EstadoConsolidado[]): Estado {
  const internos: Internos = new Map(TIPOS.map((t) => [t, new Map<string, Interno>()]))
  const acc = new Acumulador(internos, { total: 0, motivos: {} }, false)
  for (const b of base === undefined ? [] : Array.isArray(base) ? base : [base as EstadoConsolidado]) for (const rc of b.registros) acc.base(rc)
  // Uma cópia por id: a vencedora entre cópias diferentes (compararCopias), contando o conflito.
  const porId = new Map<string, Evento>()
  let conflitos = 0
  for (const x of eventos) {
    const ev = acc.validar(x)
    if (!ev) continue
    const outro = porId.get(ev.id)
    if (outro === undefined) porId.set(ev.id, ev)
    else {
      const c = compararCopias(ev, outro)
      if (c !== 0) conflitos++
      if (c > 0) porId.set(ev.id, ev)
    }
  }
  for (const ev of porId.values()) acc.evento(ev)
  acc.terminar()
  const registros = new Map<Tipo, ReadonlyMap<string, Registro>>()
  for (const [tipo, m] of internos) {
    const pub = new Map<string, Registro>()
    for (const [id, r] of m) pub.set(id, publico(r))
    registros.set(tipo, pub)
  }
  return publicar(registros, internos, acc.ignorados, conflitos)
}

/**
 * Acrescenta eventos a um estado já fundido: aplicar(fundir(a), b) = fundir(a + b). Não muda `estado`;
 * os registros não tocados (e os mapas dos tipos não tocados) são os mesmos objetos do estado anterior.
 * Supõe que `eventos` não traz uma cópia DIFERENTE de um id já fundido (o armazém garante: quando uma
 * cópia diferente vence, ele pede uma nova fusão completa); repetições idênticas não mudam nada.
 */
export function aplicar(estado: Estado, eventos: Iterable<unknown>): Estado {
  const acc = new Acumulador(internosDe(estado), estado.ignorados, true)
  for (const x of eventos) {
    const ev = acc.validar(x)
    if (ev) acc.evento(ev)
  }
  acc.terminar()
  if (acc.tocados.size === 0 && acc.ignorados.total === estado.ignorados.total) return estado
  const registros = new Map(estado.registros)
  for (const [tipo, ids] of acc.tocados) {
    const m = new Map(estado.registros.get(tipo))
    const doTipo = acc.internos.get(tipo)!
    for (const id of ids) m.set(id, publico(doTipo.get(id)!))
    registros.set(tipo, m)
  }
  return publicar(registros, acc.internos, acc.ignorados, estado.conflitos)
}

/** A base para estado.json: todos os registros em ordem (tipo, id), campos em ordem, todas as escritas. */
export function consolidar(estado: Estado): EstadoConsolidado {
  const registros: RegistroConsolidado[] = []
  for (const m of internosDe(estado).values()) {
    for (const r of m.values()) {
      const campos: RegistroConsolidado['campos'] = Object.create(null)
      for (const campo of [...r.campos.keys()].sort(compararPorPontoDeCodigo)) {
        campos[campo] = r.campos.get(campo)!.map((e) => ({ evento: e.evento, hlc: e.hlc, valor: e.valor }))
      }
      const exclusao = r.exclusao && { evento: r.exclusao.evento, hlc: r.exclusao.hlc, op: r.exclusao.op }
      registros.push({ alteradoEm: r.alteradoEm, campos, criadoEm: r.criadoEm, exclusao, id: r.id, tipo: r.tipo })
    }
  }
  registros.sort(compararRegistros)
  return { registros, v: 1 }
}

/**
 * Todas as escritas de um campo (em ordem de (hlc, evento); a última é a atual), ou [] se o registro ou o
 * campo não existe. Só leitura: a lista é uma cópia.
 */
export function entradasDoCampo(estado: Estado, tipo: Tipo, reg: string, campo: string): Entrada[] {
  const lista = internosDe(estado).get(tipo)?.get(reg)?.campos.get(campo)
  return lista ? lista.map((e) => ({ hlc: e.hlc, evento: e.evento, valor: e.valor })) : []
}

/**
 * O estado canônico (para comparar estados e para os vetores da porta em Python):
 * jsonCanonico({ignorados: <total>, registros: consolidar(estado).registros, v: 1}).
 */
export function estadoCanonico(estado: Estado): string {
  return jsonCanonico({ ignorados: estado.ignorados.total, registros: consolidar(estado).registros, v: 1 })
}

const objeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const textoNaoVazio = (x: unknown): x is string => typeof x === 'string' && x !== ''

function entradaValida(x: unknown): boolean {
  return objeto(x) && validoHlc(x.hlc) && textoNaoVazio(x.evento) && 'valor' in x && valorJson(x.valor)
}

function registroValido(x: unknown): boolean {
  if (!objeto(x) || !tipoValido(x.tipo) || !textoNaoVazio(x.id) || !validoHlc(x.criadoEm) || !validoHlc(x.alteradoEm)) return false
  const m = x.exclusao
  if (m !== null && !(objeto(m) && validoHlc(m.hlc) && textoNaoVazio(m.evento) && (m.op === 'excluir' || m.op === 'restaurar'))) return false
  if (!objeto(x.campos)) return false
  return Object.values(x.campos).every((lista) => Array.isArray(lista) && lista.length > 0 && lista.every(entradaValida))
}

/**
 * Confere uma base lida de estado.json, registro por registro. Um registro inválido (tipo desconhecido,
 * hlc malformado ou além de LIMITE_MS, entrada sem evento, campo sem escritas, número além de 2^53 − 1…) é
 * deixado de fora e contado em `ignorados`; os outros valem. Devolve null só se a forma de fora não
 * serve ({v: 1, registros: [...]}). Sem registros ruins, `base` é o próprio objeto recebido.
 */
export function validarBase(x: unknown): { base: EstadoConsolidado; ignorados: number } | null {
  if (!objeto(x) || x.v !== 1 || !Array.isArray(x.registros)) return null
  const bons = x.registros.filter(registroValido) as RegistroConsolidado[]
  const ignorados = x.registros.length - bons.length
  return { base: ignorados === 0 ? (x as unknown as EstadoConsolidado) : { v: 1, registros: bons }, ignorados }
}
