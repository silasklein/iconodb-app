/**
 * O que as telas da Tarefa 10 gravam: hipóteses SKC, regiões e a posição sobre as hipóteses dos livros. Formato dos
 * campos em ./modelo.ts. Toda escrita vai primeiro ao IndexedDB (`registrar`/`registrarVarios`, Tarefa 2).
 *
 * Nunca duas hipóteses por um salvar repetido: o id é RESERVADO antes de gravar e a tela o guarda no rascunho na hora
 * (`aoReservar`, síncrono, localStorage). Um "Registrar" de novo com o rascunho que tem a reserva: se o registro já
 * existe, nada é gravado; se não existe (a página fechou entre reservar e gravar), grava com o MESMO id. A região nova
 * e a hipótese vão na mesma gravação (uma transação: as duas ou nenhuma).
 *
 * Termos novos (decisão 41; formato em src/glossario/modelo.ts): cada termo com `novo` vira um verbete do usuário. O id
 * `GL-<aparelho>-<n>` é reservado junto com o da hipótese (`Reserva.termos`, pela chave da forma) e guardado no
 * rascunho; o verbete vai na MESMA gravação da hipótese, antes dela. Se já há um verbete do usuário vivo com a mesma
 * chave (sem caixa, sem acento), a hipótese usa esse e nada é criado; também quando o rascunho traz uma reserva cujo
 * verbete nunca foi gravado (o salvar falhou antes, e o termo foi criado depois em outra hipótese; revisão 3, Minor 1).
 */
import { seletorDoPoligono, poligonoValido, type PontoRelativo } from '../imagem/desenhar'
import type { Modalidade, Nivel } from '../banco/tipos'
import { estadoAtual, proximoId, registrar, registrarVarios } from '../usuario/estado'
import type { PedidoDeEvento } from '../usuario/armazem'
import type { Campos } from '../usuario/eventos'
import { usosDoVerbete, verbeteSkcDaChave } from '../glossario/doUsuario'
import { camposDoVerbeteNovo, chaveDaForma, eVerbeteSkc, normalizarForma } from '../glossario/modelo'
import {
  camposDaHipoteseNova,
  eElemento,
  eHipoteseDoLivro,
  lerHipotese,
  lerRegiao,
  MODALIDADES,
  NIVEIS_SKC,
  objetoCanonico,
  type AncoraDaHipoteseSkc,
  type Posicao,
  type Sobre,
  type TermoEscolhido,
} from './modelo'

export interface RegiaoNova {
  imagem: string
  pontos: readonly PontoRelativo[]
  /** O nome do elemento novo. */
  nome: string
  /** "Pertence a": o elemento de que este é parte. */
  pai: string | null
}

export type SobreAoGravar = Sobre | { tipo: 'nova'; regiao: RegiaoNova }

export interface NovaHipoteseParaGravar {
  objeto: string
  sobre: SobreAoGravar
  termos: readonly TermoEscolhido[]
  nivel: Nivel
  modalidade: Modalidade
  justificativa: string
  ancora: AncoraDaHipoteseSkc | null
}

export interface Reserva {
  hipotese: string
  regiao: string | null
  /**
   * Os verbetes do usuário reservados para os termos novos, pela chave da forma (decisão 41). Só os que ESTE registro
   * cria (um termo que reusa um verbete que já existia não entra): "Desfazer" exclui estes, se nada mais os usa.
   */
  termos?: Record<string, string>
}

export interface OpcoesDoRegistro {
  /** Os ids já reservados (do rascunho). */
  reserva?: Reserva | null
  /** Logo depois de reservar, antes de gravar: a tela guarda a reserva no rascunho (de forma síncrona). */
  aoReservar?: (r: Reserva) => void
  /** Logo depois de gravar. */
  aoCriar?: (id: string) => void
}

function validar(d: NovaHipoteseParaGravar): void {
  validarTermos(d.termos)
  if (objetoCanonico(d.objeto) === null) throw new Error(`objeto inválido: ${JSON.stringify(d.objeto)}`)
  if (!NIVEIS_SKC.includes(d.nivel)) throw new Error(`nível inválido: ${JSON.stringify(d.nivel)}`)
  if (!MODALIDADES.includes(d.modalidade)) throw new Error(`modalidade inválida: ${JSON.stringify(d.modalidade)}`)
  if (d.sobre.tipo === 'elemento' && !eElemento(d.sobre.id)) throw new Error(`elemento inválido: ${JSON.stringify(d.sobre.id)}`)
  if (d.sobre.tipo === 'nova') {
    if (!poligonoValido(d.sobre.regiao.pontos)) throw new Error('região sem área')
    if (d.sobre.regiao.nome.trim() === '') throw new Error('região sem nome')
    if (!d.sobre.regiao.imagem) throw new Error('região sem imagem')
  }
}

function validarTermos(termos: readonly TermoEscolhido[]): void {
  for (const t of termos) if (t.novo && normalizarForma(t.rotulo) === '') throw new Error('termo novo sem forma')
}

interface TermosResolvidos {
  /** Os termos com os ids definitivos (sem `novo`), sem repetidos. */
  termos: TermoEscolhido[]
  /** As reservas (as que vieram e as novas), pela chave. */
  reservados: Record<string, string>
  /** Os `criar` dos verbetes reservados que ainda não existem. */
  criar: PedidoDeEvento[]
}

/** Troca cada termo novo pelo verbete reservado (ou pelo existente de mesma chave), reservando o que faltar. */
async function resolverTermos(termos: readonly TermoEscolhido[], reservados: Readonly<Record<string, string>> = {}): Promise<TermosResolvidos> {
  const reservas: Record<string, string> = {}
  const porChave = new Map<string, TermoEscolhido>()
  for (const t of termos) {
    if (!t.novo) continue
    const chave = chaveDaForma(t.rotulo)
    if (porChave.has(chave)) continue
    // A reserva vale se o verbete dela já foi gravado (o mesmo registro, retomado). Uma reserva que nunca foi gravada (o
    // salvar falhou antes) perde para um verbete vivo com a mesma chave criado depois: nada de duplicado no mesmo
    // aparelho (revisão 3, Minor 1).
    const reservado = reservados[chave] && estadoAtual().registro('verbete', reservados[chave]) ? reservados[chave] : undefined
    const existente = reservado ? null : verbeteSkcDaChave(estadoAtual(), chave)
    if (existente) {
      porChave.set(chave, { id: existente.id, rotulo: existente.emUso })
      continue
    }
    const id = reservado ?? reservados[chave] ?? (await proximoId('GL'))
    reservas[chave] = id
    porChave.set(chave, { id, rotulo: normalizarForma(t.rotulo) })
  }
  const criar: PedidoDeEvento[] = []
  for (const [chave, id] of Object.entries(reservas)) {
    if (!estadoAtual().registro('verbete', id)) criar.push({ tipo: 'verbete', reg: id, op: 'criar', campos: camposDoVerbeteNovo(porChave.get(chave)!.rotulo) })
  }
  const vistos = new Set<string>()
  const finais: TermoEscolhido[] = []
  for (const t of termos) {
    const f = t.novo ? porChave.get(chaveDaForma(t.rotulo))! : { id: t.id, rotulo: t.rotulo }
    if (vistos.has(f.id)) continue
    vistos.add(f.id)
    finais.push(f)
  }
  return { termos: finais, reservados: reservas, criar }
}

function camposDaRegiao(r: { imagem: string; objeto: string; pontos: readonly PontoRelativo[]; elemento: string; elementoId: string | null; pai: string | null }): Campos {
  return {
    imagem: r.imagem,
    objeto: r.objeto,
    seletor: seletorDoPoligono(r.pontos),
    elemento: r.elemento.trim(),
    elementoId: r.elementoId,
    pai: r.pai,
  }
}

export async function registrarHipotese(d: NovaHipoteseParaGravar, opcoes: OpcoesDoRegistro = {}): Promise<Reserva> {
  validar(d)
  const nova = d.sobre.tipo === 'nova' ? d.sobre.regiao : null
  const hipotese = opcoes.reserva?.hipotese ?? (await proximoId('HY'))
  const regiao = nova ? (opcoes.reserva?.regiao ?? (await proximoId('RG'))) : null
  const termos = await resolverTermos(d.termos, opcoes.reserva?.termos)
  const reserva: Reserva = { hipotese, regiao, termos: termos.reservados }
  opcoes.aoReservar?.(reserva)
  if (estadoAtual().registro('hipotese', reserva.hipotese)) {
    opcoes.aoCriar?.(reserva.hipotese)
    return reserva
  }
  // Os verbetes novos primeiro: a hipótese que aponta para eles nunca existe sem eles.
  const pedidos: PedidoDeEvento[] = [...termos.criar]
  let sobre: Sobre
  if (nova) {
    const rotulo = nova.nome.trim()
    if (!estadoAtual().registro('regiao', reserva.regiao!)) {
      pedidos.push({ tipo: 'regiao', reg: reserva.regiao!, op: 'criar', campos: camposDaRegiao({ imagem: nova.imagem, objeto: d.objeto, pontos: nova.pontos, elemento: rotulo, elementoId: null, pai: nova.pai }) })
    }
    sobre = { tipo: 'elemento', id: reserva.regiao!, rotulo }
  } else {
    sobre = d.sobre as Sobre
  }
  pedidos.push({
    tipo: 'hipotese',
    reg: reserva.hipotese,
    op: 'criar',
    campos: camposDaHipoteseNova({ ...d, sobre, termos: termos.termos, justificativa: d.justificativa.trim() }),
  })
  await registrarVarios(pedidos)
  opcoes.aoCriar?.(reserva.hipotese)
  return reserva
}

export interface MudancaDaHipotese {
  sobre?: Sobre
  termos?: readonly TermoEscolhido[]
  nivel?: Nivel
  modalidade?: Modalidade
  ancora?: AncoraDaHipoteseSkc | null
}

/**
 * Uma mudança num campo (ou num par de campos) de uma hipótese SKC: um `alterar` só com isso. Um termo novo nos
 * `termos` cria o verbete na mesma gravação (decisão 41).
 */
export async function alterarHipotese(id: string, m: MudancaDaHipotese): Promise<void> {
  const campos: Campos = {}
  let criar: PedidoDeEvento[] = []
  if (m.nivel !== undefined) {
    if (!NIVEIS_SKC.includes(m.nivel)) throw new Error('nível inválido')
    campos.nivel = m.nivel
  }
  if (m.modalidade !== undefined) {
    if (!MODALIDADES.includes(m.modalidade)) throw new Error('modalidade inválida')
    campos.modalidade = m.modalidade
  }
  if (m.termos !== undefined) {
    validarTermos(m.termos)
    if (!estadoAtual().registro('hipotese', id)) throw new Error(`hipótese desconhecida: ${id}`)
    const r = await resolverTermos(m.termos)
    criar = r.criar
    campos.termos = r.termos.map((t) => t.id)
    campos.termosRotulos = r.termos.map((t) => t.rotulo)
  }
  if (m.sobre !== undefined) {
    if (m.sobre.tipo === 'elemento' && !eElemento(m.sobre.id)) throw new Error('elemento inválido')
    campos.sobre = m.sobre.tipo
    campos.elemento = m.sobre.tipo === 'elemento' ? m.sobre.id : null
    campos.elementoRotulo = m.sobre.tipo === 'elemento' ? m.sobre.rotulo : ''
  }
  if (m.ancora !== undefined) campos.ancora = m.ancora ? { ...m.ancora } : null
  if (Object.keys(campos).length === 0) return
  if (!estadoAtual().registro('hipotese', id)) throw new Error(`hipótese desconhecida: ${id}`)
  if (criar.length > 0) await registrarVarios([...criar, { tipo: 'hipotese', reg: id, op: 'alterar', campos }])
  else await registrar('hipotese', id, 'alterar', campos)
}

export const excluirHipotese = (id: string) => registrar('hipotese', id, 'excluir').then(() => undefined)
/** A gravação (aparelho e seq) de um evento: os eventos de um `registrarVarios` têm ids `<aparelho>-<seq>-<n>`. */
const gravacaoDoEvento = (evento: string) => evento.split('-').slice(0, 2).join('-')

/**
 * Restaurar uma hipótese (o "Restaurar" do painel, também depois do "Desfazer"): os verbetes do usuário dos termos dela
 * que estão excluídos (o Desfazer exclui o verbete criado só para ela) voltam na MESMA gravação, antes dela: a hipótese
 * restaurada nunca aponta para um verbete que o Glossário esconde (revisão 3, Minor 3). A região do elemento dela volta
 * também, mas só se foi excluída na MESMA gravação que a hipótese (o Desfazer; revisão 4, m5): uma região excluída de
 * propósito no visualizador continua excluída.
 */
export async function restaurarHipotese(id: string): Promise<void> {
  const estado = estadoAtual()
  const r = estado.registro('hipotese', id)
  const h = r ? lerHipotese(r) : null
  const pedidos: PedidoDeEvento[] = []
  for (const t of h?.termos ?? []) {
    if (eVerbeteSkc(t.id) && estado.registro('verbete', t.id)?.excluido) pedidos.push({ tipo: 'verbete', reg: t.id, op: 'restaurar', campos: {} })
  }
  if (h?.sobre.tipo === 'elemento' && estado.registro('regiao', h.sobre.id)?.excluido) {
    const daHipotese = estado.marcaDeExclusao('hipotese', id)
    const daRegiao = estado.marcaDeExclusao('regiao', h.sobre.id)
    if (daHipotese?.op === 'excluir' && daRegiao?.op === 'excluir' && gravacaoDoEvento(daHipotese.evento) === gravacaoDoEvento(daRegiao.evento)) {
      pedidos.push({ tipo: 'regiao', reg: h.sobre.id, op: 'restaurar', campos: {} })
    }
  }
  pedidos.push({ tipo: 'hipotese', reg: id, op: 'restaurar', campos: {} })
  await registrarVarios(pedidos)
}

export interface RegiaoParaGravar {
  imagem: string
  objeto: string
  pontos: readonly PontoRelativo[]
  elemento: string
  /** null: a região é um elemento novo (o id dela). */
  elementoId: string | null
  pai: string | null
}

/** Uma região sem hipótese ("Salvar a região"), num elemento novo ou existente. Devolve o id. */
export async function salvarRegiao(r: RegiaoParaGravar): Promise<string> {
  if (!poligonoValido(r.pontos)) throw new Error('região sem área')
  if (objetoCanonico(r.objeto) === null) throw new Error('objeto inválido')
  if (r.elementoId !== null && !eElemento(r.elementoId)) throw new Error('elemento inválido')
  if (r.elementoId === null && r.elemento.trim() === '') throw new Error('região sem nome')
  const id = await proximoId('RG')
  await registrar('regiao', id, 'criar', camposDaRegiao(r))
  return id
}

/** Os pontos editados de uma região que já existe. */
export async function alterarRegiao(id: string, pontos: readonly PontoRelativo[]): Promise<void> {
  if (!poligonoValido(pontos)) throw new Error('região sem área')
  await registrar('regiao', id, 'alterar', { seletor: seletorDoPoligono(pontos) })
}

export const excluirRegiao = (id: string) => registrar('regiao', id, 'excluir').then(() => undefined)
export const restaurarRegiao = (id: string) => registrar('regiao', id, 'restaurar').then(() => undefined)

/** A posição do usuário sobre uma hipótese do livro (null tira a posição). */
export async function escolherPosicao(hipotese: string, posicao: Posicao | null): Promise<void> {
  if (!eHipoteseDoLivro(hipotese)) throw new Error(`não é uma hipótese do livro: ${hipotese}`)
  const atual = estadoAtual().registro('posicao', hipotese)
  if (!atual) {
    // Sem `justificativa`: a fusão escreve todo campo de todo evento, e um criar mais novo, de outro aparelho que ainda não
    // recebeu a posição, apagaria a justificativa escrita no primeiro (revisão 1, I1). Só o campo da justificativa a escreve.
    await registrar('posicao', hipotese, 'criar', { hipotese, posicao })
    return
  }
  const pedidos: PedidoDeEvento[] = []
  if (atual.excluido) pedidos.push({ tipo: 'posicao', reg: hipotese, op: 'restaurar', campos: {} })
  pedidos.push({ tipo: 'posicao', reg: hipotese, op: 'alterar', campos: { posicao } })
  await registrarVarios(pedidos)
}

/**
 * "Desfazer" logo depois de registrar (revisão 1, I6): exclui a hipótese e, se o registro criou uma região nova, a região
 * também, numa só gravação. Nada fica órfão (uma região-elemento sem hipótese apareceria em "Sobre" e no visualizador).
 * Os verbetes criados por este registro (decisão 41) também saem, se nada mais os usa ainda (outra hipótese, uma nota
 * ou um texto com `[[…]]` para eles): um termo que já ganhou outro uso fica.
 */
export async function desfazerRegistro(r: Reserva): Promise<void> {
  const pedidos: PedidoDeEvento[] = [{ tipo: 'hipotese', reg: r.hipotese, op: 'excluir', campos: {} }]
  if (r.regiao) pedidos.push({ tipo: 'regiao', reg: r.regiao, op: 'excluir', campos: {} })
  const estado = estadoAtual()
  for (const id of new Set(Object.values(r.termos ?? {}))) {
    const v = estado.registro('verbete', id)
    if (v && !v.excluido && usosDoVerbete(estado, id, r.hipotese) === 0) pedidos.push({ tipo: 'verbete', reg: id, op: 'excluir', campos: {} })
  }
  await registrarVarios(pedidos)
}

/** Quem depende de uma região que é elemento: as hipóteses vivas sobre ela e as outras regiões do mesmo elemento. */
export function dependentesDaRegiao(id: string): { hipoteses: number; regioes: number } {
  const e = estadoAtual()
  let hipoteses = 0
  let regioes = 0
  // Pelos leitores únicos (M8): o que vale é o que a tela lê.
  for (const r of e.registros.get('hipotese')?.values() ?? []) {
    if (r.excluido) continue
    const h = lerHipotese(r)
    if (h.sobre.tipo === 'elemento' && h.sobre.id === id) hipoteses++
  }
  for (const g of e.registros.get('regiao')?.values() ?? []) if (!g.excluido && g.id !== id && lerRegiao(g).elementoId === id) regioes++
  return { hipoteses, regioes }
}
