/**
 * Editar o glossário (Tarefa 11): a forma em uso, voltar à proposta, aprovar e excluir. Cada operação grava UM evento
 * `alterar` (ou `excluir`/`restaurar`) no `verbete`, pelo `registrar` de sempre (IndexedDB primeiro). Os verbetes do
 * pacote e os do usuário são editados do mesmo jeito; o formato está em src/glossario/modelo.ts.
 */
import { criadosDoPacote, destinoDe, origensDe, redirecionamentosDoPacote, SEM_REDIRECIONAMENTOS } from '../pacote/redirecionamentos'
import { registrar } from '../usuario/estado'
import type { Evento } from '../usuario/eventos'
import { camposParaGravar, eVerbeteSkc, normalizarForma, RE_VERBETE_DO_PACOTE, type CamposCompletos } from './modelo'

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

/**
 * Grava campos completos de um verbete (Tarefa 12; o formato está em src/glossario/modelo.ts): um `alterar` com os campos
 * dados, normalizados (vazio = `null`, que limpa o campo). A tela grava um campo por vez, na hora. Nada é gravado (erro)
 * com um valor fora do formato, nenhum campo, ou o próprio verbete como termo mais geral (também pelo id do livro que o
 * pacote deu a ele: o `user-import` o deixaria de fora).
 *
 * O id: um verbete do usuário (`GL-<aparelho>-<n>`) ou, fix round 1 da Tarefa 12, o id do livro (`GL-<dígitos>`) de um
 * verbete que o pacote CRIOU de verbetes do usuário (redirecionamento com `criado`): o `user-import` lê, para cada origem
 * viva, o registro dela e o do id do livro (`dados_do_verbete`, a escrita mais nova de cada campo). Um verbete puro dos
 * livros não aceita: os campos ficariam na camada sem nunca chegar aos dados.
 */
export async function alterarCamposDoVerbete(id: string, campos: Partial<CamposCompletos>): Promise<Evento> {
  const doLivro = RE_VERBETE_DO_PACOTE.test(id)
  if (!eVerbeteSkc(id) && !doLivro) throw new Error(`não é o id de um verbete: ${id}`)
  const gravar = camposParaGravar(id, campos)
  if (doLivro || typeof gravar.pai === 'string') {
    // sem pacote (ou a leitura falhou): nenhum redirecionamento
    const [mapa, criados] = await Promise.all([redirecionamentosDoPacote().catch(() => SEM_REDIRECIONAMENTOS), criadosDoPacote().catch(() => new Set<string>())])
    if (doLivro && !origensDe(mapa, id).some((o) => criados.has(o)))
      throw new Error(`${id} não veio de um verbete seu: os campos de um verbete dos livros não se editam no app`)
    if (typeof gravar.pai === 'string' && destinoDe(mapa, gravar.pai) === destinoDe(mapa, id)) throw new Error('o verbete não é o termo mais geral dele mesmo')
  }
  return registrar('verbete', id, 'alterar', gravar)
}
