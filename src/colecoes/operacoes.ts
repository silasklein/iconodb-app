/**
 * As escritas das coleções SKC. Cada uma é um (ou, ao renumerar, um só) evento `colecao` gravado por `registrar`:
 * o IndexedDB primeiro, a rede depois (a sincronização lê os eventos não enviados). Nada aqui toca a rede.
 *
 * A ordem das mudanças é calculada sobre o estado de agora (`estadoAtual`), não sobre o que uma tela viu há
 * pouco: duas ações seguidas contam a primeira.
 */
import { estadoAtual, proximoId, registrar } from '../usuario/estado'
import type { Campos } from '../usuario/eventos'
import { campoDaOrdem, campoDaPresenca, lerColecao, planejarAcrescentar, planejarDevolver, planejarMover, refDeObjeto, type ColecaoVista, type Lugar, type Plano } from './modelo'

export const TAMANHO_MAXIMO_DO_NOME = 120

/** A mensagem de erro do nome (para mostrar ao lado do campo) ou `null` se serve. */
export function validarNome(nome: string): string | null {
  const limpo = nome.trim()
  if (limpo === '') return 'Escreva um nome para a coleção.'
  if ([...limpo].length > TAMANHO_MAXIMO_DO_NOME) return `O nome pode ter até ${TAMANHO_MAXIMO_DO_NOME} caracteres.`
  return null
}

function nomeValido(nome: string): string {
  const erro = validarNome(nome)
  if (erro) throw new Error(erro)
  return nome.trim()
}

function refsValidas(refs: readonly string[]): string[] {
  return refs.map((r) => {
    const ref = refDeObjeto(r)
    if (!ref) throw new Error(`Não é um objeto: ${r}`)
    return ref
  })
}

function colecaoAtual(id: string): ColecaoVista {
  const r = estadoAtual().registro('colecao', id)
  if (!r) throw new Error(`Coleção não encontrada: ${id}`)
  return lerColecao(r)
}

/** Cria a coleção (opcionalmente já com objetos, no mesmo evento). Devolve o id `CO-<aparelho>-<n>`. */
export async function criarColecao(nome: string, opcoes: { descricao?: string; membros?: readonly string[] } = {}): Promise<string> {
  const limpo = nomeValido(nome)
  const campos: Campos = { nome: limpo, ...planejarAcrescentar([], refsValidas(opcoes.membros ?? [])) }
  if (opcoes.descricao?.trim()) campos.descricao = opcoes.descricao.trim()
  const id = await proximoId('CO')
  await registrar('colecao', id, 'criar', campos)
  return id
}

export async function renomearColecao(id: string, nome: string): Promise<void> {
  await registrar('colecao', id, 'alterar', { nome: nomeValido(nome) })
}

export async function descreverColecao(id: string, descricao: string): Promise<void> {
  await registrar('colecao', id, 'alterar', { descricao: descricao.trim() })
}

export async function excluirColecao(id: string): Promise<void> {
  await registrar('colecao', id, 'excluir')
}

export async function restaurarColecao(id: string): Promise<void> {
  await registrar('colecao', id, 'restaurar')
}

/** Põe os objetos no fim da lista, num só evento. Devolve as refs que entraram (quem já era membro fica de fora e nada é gravado). */
export async function acrescentarMembros(id: string, refs: readonly string[]): Promise<string[]> {
  const campos = planejarAcrescentar(colecaoAtual(id).membros, refsValidas(refs))
  const entraram = Object.keys(campos)
  if (entraram.length === 0) return []
  await registrar('colecao', id, 'alterar', campos)
  return refsValidas(refs).filter((r, i, todas) => campoDaPresenca(r) in campos && todas.indexOf(r) === i)
}

/**
 * Tira o objeto da coleção (escreve `null` na PRESENÇA dele; a ordem fica como está). Devolve o lugar que ele tinha (a ordem
 * e os vizinhos de então), para o "Desfazer"; `null` se não era membro.
 */
export async function tirarMembro(id: string, ref: string): Promise<Lugar | null> {
  const r = refsValidas([ref])[0]!
  const membros = colecaoAtual(id).membros
  const i = membros.findIndex((m) => m.ref === r)
  if (i < 0) return null
  await registrar('colecao', id, 'alterar', { [campoDaPresenca(r)]: null })
  return { ordem: membros[i]!.ordem, antes: membros[i - 1]?.ref ?? null, depois: membros[i + 1]?.ref ?? null }
}

/**
 * Põe o objeto de volta (o "Desfazer" de tirar): escreve a PRESENÇA (`m:true`). Se os vizinhos de antes continuam presentes
 * e vizinhos entre si, ele volta no meio deles, mesmo que a ordem guardada tenha ficado empatada ou longe (uma renumeração
 * sem ele, de outro aparelho); se a ordem guardada já cai entre eles, ela fica. Sem os vizinhos vale a ordem que ficou no
 * registro, e só se ela sumiu ou ficou inválida é que a de antes de tirar é escrita (ver `planejarDevolver`). Um evento;
 * sem duplicar, é o mesmo campo. Quem já é membro não grava nada. O 3º argumento pode ser só o número da ordem de antes.
 */
export async function devolverMembro(id: string, ref: string, lugar: Lugar | number): Promise<void> {
  const r = refsValidas([ref])[0]!
  const atual = colecaoAtual(id).membros
  if (atual.some((m) => m.ref === r)) return
  await registrar('colecao', id, 'alterar', planejarDevolver(atual, r, lugar, estadoAtual().registro('colecao', id)?.campos[campoDaOrdem(r)]))
}

export interface Movimento extends Plano {
  ref: string
  de: number
  para: number
  /** Quantos membros a lista tem. */
  total: number
}

/** Leva o membro da posição `de` à posição `para` (a que ele terá na lista nova). Um evento, um campo; sem espaço, um evento com todas as ordens. */
export async function moverMembro(id: string, de: number, para: number): Promise<Movimento> {
  const membros = colecaoAtual(id).membros
  const plano = planejarMover(membros, de, para)
  if (Object.keys(plano.campos).length > 0) await registrar('colecao', id, 'alterar', plano.campos)
  return { ...plano, ref: membros[de]!.ref, de, para, total: membros.length }
}

/** O mesmo, achando a posição de agora pela ref: a tela pode ter visto uma ordem velha (outro aparelho, outra aba). */
export async function moverMembroPara(id: string, ref: string, para: number): Promise<Movimento> {
  const alvo = refsValidas([ref])[0]!
  const de = colecaoAtual(id).membros.findIndex((m) => m.ref === alvo)
  if (de < 0) throw new Error(`${alvo} não é membro da coleção`)
  return moverMembro(id, de, Math.min(Math.max(para, 0), colecaoAtual(id).membros.length - 1))
}
