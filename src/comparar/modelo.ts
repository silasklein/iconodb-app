/**
 * A bandeja de comparação (Parte 2B, Tarefa 14): até 4 objetos que a pessoa quer ver lado a lado. Puro: sem React, sem
 * IndexedDB.
 *
 * FORMATO (congelado: a porta em Python da Tarefa 16 lê e escreve exatamente isto). A bandeja é UM registro do tipo
 * `comparar`, com `reg` = "bandeja" (o mesmo para todos os aparelhos, então a bandeja é uma só, sincronizada). Os campos
 * são os das coleções SKC (src/colecoes/modelo.ts), um par por objeto, com a mesma `ref`:
 * - `m:<ref>`: a PRESENÇA. `true` = está na bandeja; `null` = foi tirado;
 * - `i:<ref>`: a ORDEM, um inteiro seguro (passo de 1024: o fim da lista é o maior mais 1024).
 * A `ref` é o número de um objeto do livro (`CA00023`, em maiúsculas) ou o id de um objeto SKC (`OB-<aparelho>-<n>`), que
 * não muda quando o número provisório muda. Leitura: é membro quem tem `m:<ref>` `true` E `i:<ref>` inteiro seguro; a
 * lista sai por `i:` e, nos empates, pela ref em ponto de código (`refDeObjeto` decide quais refs valem; as outras são ignoradas).
 *
 * Por que um par por objeto, e não a lista inteira num campo só: a fusão é por campo e a escrita mais nova vence. Se a
 * lista fosse um campo, dois aparelhos que acrescentassem objetos diferentes sem internet perderiam um dos acréscimos (a
 * versão perdedora iria só para o histórico). Com um par por objeto, os dois acréscimos ficam.
 *
 * O LIMITE DE 4 é da LEITURA, não da escrita. Depois de uma fusão a bandeja pode ter mais de 4 membros (cada aparelho
 * acrescentou o seu); um Desfazer (de tirar, de esvaziar ou de «Comparar todos») também pode criar excedentes, se outro
 * acréscimo veio antes dele. Os 4 primeiros pela ordem (e, nos empates, pela ref) são a bandeja; os outros são os
 * EXCEDENTES, na mesma ordem: a tela os mostra ("não couberam") e a pessoa pode tirá-los. Nada é descartado em silêncio, e
 * como a ordem e o desempate não dependem do aparelho, todos veem os mesmos 4 e os mesmos excedentes. Quando alguém sai da
 * bandeja, o primeiro excedente entra no lugar.
 *
 * A ORDEM NOVA parte do maior `i:` que o registro já teve, de quem está presente ou não (`maiorOrdem`): assim, depois de
 * esvaziar, o que entra fica depois do que saiu, e o Desfazer de esvaziar (que devolve as ordens antigas) nunca empata com o novo.
 *
 * «COMPARAR TODOS» (decisão 44) SUBSTITUI a bandeja: UM evento tira (`m:` null) todos os que estavam, inclusive os excedentes,
 * e põe os citados (os 4 primeiros) com ordens novas, na ordem da citação. O Desfazer é UM evento que devolve os de antes com
 * as ordens que tinham e tira os citados que não estavam. Nenhum dos dois cria estado intermediário, e cada um se funde por
 * campo com o que outro aparelho escreveu ao mesmo tempo (um acréscimo dele aparece, como excedente se não couber).
 */
import { campoDaOrdem, campoDaPresenca, compararMembros, PASSO_DA_ORDEM, refDeObjeto, type Membro } from '../colecoes/modelo'
import type { Campos } from '../usuario/eventos'
import type { Registro } from '../usuario/fusao'

export const MAXIMO_DA_BANDEJA = 4
/** O `reg` do único registro `comparar`. */
export const REG_DA_BANDEJA = 'bandeja'

export interface BandejaVista {
  /** Os objetos da bandeja (no máximo 4), na ordem. */
  itens: readonly string[]
  /** Os que sobraram de uma fusão e ainda não couberam, na ordem. */
  excedentes: readonly string[]
  /** Todos os membros presentes, com a ordem. */
  todos: readonly Membro[]
  /** O maior `i:` válido do registro, de quem está presente ou não (0 sem nenhum): a ordem nova parte dele. */
  maiorOrdem: number
}

const ordemValida = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)

const lidas = new WeakMap<Registro, BandejaVista>()
const VAZIA: BandejaVista = { itens: [], excedentes: [], todos: [], maiorOrdem: 0 }

/** A bandeja lida de um registro `comparar` (o mesmo objeto enquanto o registro não muda). Tudo o que vem de evento é tratado como possivelmente malformado. */
export function lerBandeja(r: Registro | undefined): BandejaVista {
  if (!r) return VAZIA
  const guardada = lidas.get(r)
  if (guardada) return guardada
  const todos: Membro[] = []
  let maiorOrdem = 0
  for (const [campo, valor] of Object.entries(r.campos)) {
    if (campo.startsWith('i:') && refDeObjeto(campo.slice(2)) === campo.slice(2) && ordemValida(valor)) maiorOrdem = Math.max(maiorOrdem, valor)
    if (!campo.startsWith('m:') || valor !== true) continue
    const ref = campo.slice(2)
    const ordem = r.campos[campoDaOrdem(ref)]
    if (refDeObjeto(ref) !== ref || !ordemValida(ordem)) continue
    todos.push({ ref, ordem })
  }
  todos.sort(compararMembros)
  const refs = todos.map((m) => m.ref)
  const lida: BandejaVista = { itens: refs.slice(0, MAXIMO_DA_BANDEJA), excedentes: refs.slice(MAXIMO_DA_BANDEJA), todos, maiorOrdem }
  lidas.set(r, lida)
  return lida
}

/** Os campos que põem estas refs (novas, sem repetir) no fim, depois do maior `i:` que o registro já teve. */
function acrescentarNoFim(b: BandejaVista, refs: readonly string[]): Campos {
  const campos: Campos = {}
  let ultima = b.maiorOrdem
  for (const ref of refs) {
    ultima += PASSO_DA_ORDEM
    campos[campoDaPresenca(ref)] = true
    campos[campoDaOrdem(ref)] = ultima
  }
  return campos
}

export type Entrada =
  | { tipo: 'entrou'; ref: string; campos: Campos }
  | { tipo: 'ja-estava'; ref: string; onde: 'bandeja' | 'espera' }
  | { tipo: 'cheia'; ref: string }

/** O que acontece ao pôr `ref` na bandeja: entra (com os campos a gravar), já estava (nada a gravar) ou a bandeja está cheia (nada a gravar). */
export function planejarEntrada(b: BandejaVista, ref: string): Entrada {
  const r = refDeObjeto(ref)
  if (!r) throw new Error(`Não é um objeto: ${ref}`)
  if (b.itens.includes(r)) return { tipo: 'ja-estava', ref: r, onde: 'bandeja' }
  if (b.excedentes.includes(r)) return { tipo: 'ja-estava', ref: r, onde: 'espera' }
  if (b.todos.length >= MAXIMO_DA_BANDEJA) return { tipo: 'cheia', ref: r }
  return { tipo: 'entrou', ref: r, campos: acrescentarNoFim(b, [r]) }
}

export interface EntradaDeVarias {
  campos: Campos
  entraram: string[]
  jaEstavam: string[]
  /** Os que não couberam, na ordem em que foram pedidos. */
  deFora: string[]
}

/** O mesmo para vários objetos de uma vez ("Comparar todos"): os que cabem entram na ordem pedida; a repetição conta uma vez. */
export function planejarVarias(b: BandejaVista, refs: readonly string[]): EntradaDeVarias {
  const vagas = Math.max(0, MAXIMO_DA_BANDEJA - b.todos.length)
  const entraram: string[] = []
  const jaEstavam: string[] = []
  const deFora: string[] = []
  const vistos = new Set<string>()
  for (const bruto of refs) {
    const ref = refDeObjeto(bruto)
    if (!ref) throw new Error(`Não é um objeto: ${bruto}`)
    if (vistos.has(ref)) continue
    vistos.add(ref)
    if (b.todos.some((m) => m.ref === ref)) jaEstavam.push(ref)
    else if (entraram.length < vagas) entraram.push(ref)
    else deFora.push(ref)
  }
  return { campos: acrescentarNoFim(b, entraram), entraram, jaEstavam, deFora }
}

export interface Substituicao {
  /** Os campos a gravar, num só evento (vazio quando `igual` ou quando não há nada para pôr). */
  campos: Campos
  /** A bandeja de antes, inclusive os excedentes, na ordem: o que o Desfazer devolve. */
  previa: Membro[]
  /** Os que ficam na bandeja (no máximo 4), na ordem da citação. */
  entraram: string[]
  /** Os citados que passaram de 4 e ficaram de fora, na ordem da citação. */
  deFora: string[]
  /** A bandeja de antes já era exatamente esta lista, nesta ordem, e sem excedentes: nada a gravar. */
  igual: boolean
  /**
   * O hlc do evento da troca (`null` enquanto nada foi gravado). O Desfazer só vale enquanto o registro da bandeja ainda foi alterado
   * por ESTE evento: qualquer escrita depois dele (mesmo uma que devolva a bandeja ao mesmo conteúdo) o invalida.
   */
  hlc: string | null
}

/** «Comparar todos» (decisão 44): troca a bandeja pelos citados (os 4 primeiros, na ordem; a repetição conta uma vez). */
export function planejarSubstituicao(b: BandejaVista, refs: readonly string[]): Substituicao {
  const unicos: string[] = []
  for (const bruto of refs) {
    const ref = refDeObjeto(bruto)
    if (!ref) throw new Error(`Não é um objeto: ${bruto}`)
    if (!unicos.includes(ref)) unicos.push(ref)
  }
  const entraram = unicos.slice(0, MAXIMO_DA_BANDEJA)
  const deFora = unicos.slice(MAXIMO_DA_BANDEJA)
  const previa = [...b.todos]
  const igual = entraram.length > 0 && previa.length === entraram.length && previa.every((m, i) => m.ref === entraram[i])
  if (entraram.length === 0 || igual) return { campos: {}, previa, entraram, deFora, igual, hlc: null }
  const campos: Campos = {}
  for (const m of previa) if (!entraram.includes(m.ref)) campos[campoDaPresenca(m.ref)] = null
  Object.assign(campos, acrescentarNoFim(b, entraram))
  return { campos, previa, entraram, deFora, igual: false, hlc: null }
}

/** O Desfazer de `planejarSubstituicao`: os de antes voltam com a ordem que tinham; os citados que não estavam saem. */
export function planejarDesfazerSubstituicao(previa: readonly Membro[], entraram: readonly string[]): Campos {
  const campos: Campos = {}
  const antes = new Set(previa.map((m) => m.ref))
  for (const ref of entraram) if (!antes.has(ref)) campos[campoDaPresenca(ref)] = null
  for (const m of previa) {
    campos[campoDaPresenca(m.ref)] = true
    campos[campoDaOrdem(m.ref)] = m.ordem
  }
  return campos
}

/** O contador de todo lugar (Menu, botão do Item, tela Comparar): "2/4". Uma só fonte. */
export const contadorDaBandeja = (n: number): string => `${Math.min(n, MAXIMO_DA_BANDEJA)}/${MAXIMO_DA_BANDEJA}`

/** O campo de presença de uma ref (para quem escreve fora deste módulo). */
export { campoDaOrdem, campoDaPresenca }

/**
 * O Desfazer de «Comparar todos» como vem do estado do histórico (`state.desfazer`): a bandeja de antes e os que entraram.
 * Tudo o que vem de fora é tratado como possivelmente malformado; um formato que não confere vira `null` (sem Desfazer).
 */
export function lerDesfazerDaTroca(valor: unknown): { previa: Membro[]; entraram: string[]; hlc: string } | null {
  const v = valor as { previa?: unknown; entraram?: unknown; hlc?: unknown } | null
  if (!v || typeof v !== 'object' || !Array.isArray(v.previa) || !Array.isArray(v.entraram) || typeof v.hlc !== 'string' || v.hlc === '') return null
  const previa: Membro[] = []
  for (const m of v.previa as unknown[]) {
    const x = m as { ref?: unknown; ordem?: unknown } | null
    if (!x || typeof x !== 'object' || typeof x.ref !== 'string' || refDeObjeto(x.ref) !== x.ref || !ordemValida(x.ordem)) return null
    previa.push({ ref: x.ref, ordem: x.ordem })
  }
  const entraram: string[] = []
  for (const r of v.entraram as unknown[]) {
    if (typeof r !== 'string' || refDeObjeto(r) !== r) return null
    entraram.push(r)
  }
  return { previa, entraram, hlc: v.hlc }
}
