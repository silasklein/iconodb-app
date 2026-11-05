/**
 * Escrever sítios (Tarefa 12). Tudo passa por `registrar`/`registrarVarios` (IndexedDB antes de qualquer rede, Tarefa 2). O
 * formato dos registros está em src/sitios/modelo.ts.
 *
 * - `criarSitio`: um sítio novo (`SI-…`). Pode levar, na MESMA transação (tudo ou nada), os eventos que o ligam a um objeto:
 *   "Novo sítio «…»" no NovoObjeto e na ficha grava o sítio e o objeto juntos, e nunca fica um sem o outro.
 * - `corrigirSitio` / `voltarAoLivro`: uma correção é um `alterar` de um campo (ou do par lat+lon) no `sitio`, no id do
 *   sítio do livro ou do sítio novo.
 * - `excluirSitio` / `restaurarSitio`: só os `SI-…`; um sítio do livro só se corrige.
 * - `trocarSitioDoObjeto`: o `item-sitio` de um objeto do pacote (o objeto SKC grava o `sitio` da ficha, em
 *   src/objetos-skc/operacoes.ts).
 */
import { registrarVarios, proximoId, registrar } from '../usuario/estado'
import type { PedidoDeEvento } from '../usuario/armazem'
import type { Evento, Json } from '../usuario/eventos'
import { normalizarForma } from '../glossario/modelo'
import { camposDoSitioNovo, coordenadaValida, eSitioSkc, normalizarVariantes, type Coordenada, type EntradaDeSitio } from './modelo'

export class ErroDeSitio extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeSitio'
  }
}

/** Reserva o id de um sítio novo (o contador do aparelho; nunca reusado). */
export const reservarIdDoSitio = (): Promise<string> => proximoId('SI')

/**
 * Cria o sítio (e, na mesma transação, os eventos de `junto`, que costumam ligá-lo a um objeto). `id`: o reservado antes
 * (um segundo "Registrar" com o mesmo id só repete o `criar`, que a fusão trata como o mesmo registro).
 */
export async function criarSitio(entrada: EntradaDeSitio, opcoes: { id?: string; junto?: (id: string, nome: string) => PedidoDeEvento[] } = {}): Promise<string> {
  const campos = camposDoSitioNovo(entrada)
  const id = opcoes.id ?? (await reservarIdDoSitio())
  if (!eSitioSkc(id)) throw new ErroDeSitio('id de sítio inválido')
  await registrarVarios([{ tipo: 'sitio', reg: id, op: 'criar', campos }, ...(opcoes.junto?.(id, campos.nome as string) ?? [])])
  return id
}

/** O pedido de evento que liga um objeto do pacote a um sítio (`item-sitio`). */
export const pedidoDeTroca = (numero: string, sitio: string | null, sitioNome: string | null): PedidoDeEvento => ({
  tipo: 'item-sitio',
  reg: numero,
  op: 'alterar',
  campos: sitio === null ? { sitio: null, sitioNome: null } : { sitio, sitioNome },
})

/** O pedido que liga um objeto SKC a um sítio (`sitio` e `sitioNome` da ficha, num evento só). */
export const pedidoDeFicha = (objeto: string, sitio: string, sitioNome: string): PedidoDeEvento => ({ tipo: 'objeto', reg: objeto, op: 'alterar', campos: { sitio, sitioNome } })

/** Troca o sítio de um objeto do pacote (`null`: volta ao do livro). */
export const trocarSitioDoObjeto = (numero: string, sitio: string | null, sitioNome: string | null = null): Promise<Evento> =>
  registrar('item-sitio', numero, 'alterar', pedidoDeTroca(numero, sitio, sitioNome).campos)

type CampoDeTexto = 'nome' | 'regiao' | 'pais' | 'nota'

/**
 * Corrige um campo de texto de um sítio (novo ou do livro). Texto vazio (ou `null`) limpa: volta ao valor do livro num sítio
 * do livro; num sítio novo, `nome` não pode ficar vazio (erro). `original`: o valor do livro; escrever igual a ele grava `null`.
 */
export function corrigirTexto(id: string, campo: CampoDeTexto, texto: string | null, original: string | null = null): Promise<Evento> {
  const limpo = texto === null ? '' : campo === 'nota' ? texto.trim() : normalizarForma(texto)
  if (campo === 'nome' && eSitioSkc(id) && limpo === '') return Promise.reject(new ErroDeSitio('o nome do sítio não pode ficar vazio'))
  // Igual ao valor do livro: é o mesmo que voltar a ele (`null`), como a forma em uso do glossário.
  if (original !== null && limpo !== '' && limpo === normalizarForma(original)) return registrar('sitio', id, 'alterar', { [campo]: null })
  return registrar('sitio', id, 'alterar', { [campo]: limpo === '' ? null : limpo })
}

/** As outras grafias (a lista inteira é um valor; as anteriores ficam no histórico). */
export function corrigirVariantes(id: string, variantes: readonly string[]): Promise<Evento> {
  const lista = normalizarVariantes(variantes)
  return registrar('sitio', id, 'alterar', { variantes: lista.length === 0 ? null : lista })
}

/** A coordenada (o par lat+lon num evento só); `null` volta ao valor do livro (ou a "sem coordenada"). */
export function corrigirCoordenada(id: string, coordenada: Coordenada | null): Promise<Evento> {
  if (coordenada === null) return registrar('sitio', id, 'alterar', { lat: null, lon: null })
  if (!coordenadaValida(coordenada.lat, coordenada.lon)) return Promise.reject(new ErroDeSitio('coordenada fora da faixa'))
  return registrar('sitio', id, 'alterar', { lat: coordenada.lat, lon: coordenada.lon })
}

/** Volta ao valor do livro: limpa os campos dados (`null`), num evento só. */
export function voltarAoLivro(id: string, campos: readonly ('nome' | 'regiao' | 'lat' | 'lon' | 'variantes' | 'nota')[]): Promise<Evento> {
  const c: Record<string, Json> = {}
  for (const k of campos) c[k] = null
  return registrar('sitio', id, 'alterar', c)
}

const soDoUsuario = (id: string) => (eSitioSkc(id) ? null : new ErroDeSitio('só um sítio seu se exclui; um sítio do livro só se corrige'))

/** Exclui um sítio do usuário (reversível). Os objetos ligados a ele seguem ligados, com o nome e a marca "excluído". */
export function excluirSitio(id: string): Promise<Evento> {
  const erro = soDoUsuario(id)
  return erro ? Promise.reject(erro) : registrar('sitio', id, 'excluir')
}

export function restaurarSitio(id: string): Promise<Evento> {
  const erro = soDoUsuario(id)
  return erro ? Promise.reject(erro) : registrar('sitio', id, 'restaurar')
}
