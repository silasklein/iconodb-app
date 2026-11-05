/**
 * Editar o glossário (Tarefa 11): a forma em uso, voltar à proposta, aprovar e excluir. Cada operação grava UM evento
 * `alterar` (ou `excluir`/`restaurar`) no `verbete`, pelo `registrar` de sempre (IndexedDB primeiro). Os verbetes do
 * pacote e os do usuário são editados do mesmo jeito; o formato está em src/glossario/modelo.ts.
 */
import { registrar } from '../usuario/estado'
import type { Evento } from '../usuario/eventos'
import { eVerbeteSkc, normalizarForma } from './modelo'

/**
 * Grava a forma em uso. `original` é a forma a que "voltar à proposta" volta (a `forma` criada de um verbete do usuário,
 * o `pt` de um do pacote): escrita igual a ela grava `null`, que é o mesmo que voltar. Forma vazia não é forma (erro).
 */
export function editarForma(id: string, texto: string, original: string): Promise<Evento> {
  const forma = normalizarForma(texto)
  if (forma === '') return Promise.reject(new Error('forma vazia'))
  return registrar('verbete', id, 'alterar', { formaEmUso: forma === normalizarForma(original) ? null : forma })
}

/** Volta à proposta original: `formaEmUso` = null. A forma que valia fica no histórico do campo. */
export const voltarAProposta = (id: string): Promise<Evento> => registrar('verbete', id, 'alterar', { formaEmUso: null })

/**
 * Aprova a forma que a pessoa está VENDO (`formaAprovada`: a forma POR EXTENSO; `null` só existe em eventos antigos e vale «a original»; T17-B-9: o app já não o escreve, para uma versão nova do pacote não herdar a aprovação), num evento só (`status` + `formaAprovada` são
 * um par, como `termos` + `termosRotulos`). Quem lê deriva o estado de agora (`situacaoDoVerbete`): uma forma que mude
 * depois, de qualquer aparelho, deixa de estar aprovada.
 */
export const aprovarVerbete = (id: string, formaAprovada: string | null): Promise<Evento> =>
  registrar('verbete', id, 'alterar', { status: 'approved', formaAprovada: formaAprovada === null ? null : normalizarForma(formaAprovada) })

/** Tira a aprovação: o verbete volta a "a revisar". */
export const reabrirVerbete = (id: string): Promise<Evento> => registrar('verbete', id, 'alterar', { status: 'proposed' })

const soDoUsuario = (id: string) => (eVerbeteSkc(id) ? null : new Error('só um verbete do usuário se exclui'))

/**
 * Exclui um verbete do usuário (reversível: `restaurar`). Um verbete do pacote não se exclui. As hipóteses que o usam
 * continuam apontando para ele, com o nome guardado (nada é reescrito).
 */
export function excluirVerbete(id: string): Promise<Evento> {
  const erro = soDoUsuario(id)
  return erro ? Promise.reject(erro) : registrar('verbete', id, 'excluir')
}

export function restaurarVerbete(id: string): Promise<Evento> {
  const erro = soDoUsuario(id)
  return erro ? Promise.reject(erro) : registrar('verbete', id, 'restaurar')
}
