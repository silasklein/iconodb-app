/**
 * As ligações de citações a obras (Parte 2C, bloco 3, spec §5.1): o registro `citacao` da camada do usuário.
 *
 * FORMATO (congelado: o `user-import` do processamento o lê, `iconodb/usuario_import.py`, `citacoes_do_usuario`, e o build o
 * aplica com `obra_da_citacao`).
 *
 * `citacao`, reg = uma de duas formas:
 * - a CHAVE da citação (`chaveDaCitacao`, src/bibliografia/chave.ts: «inventado 2001»): liga todas as citações NÃO
 *   RESOLVIDAS PELO PROCESSAMENTO com essa chave, nos livros de agora e nos que vierem. Só essas: a mesma chave aponta para
 *   obras diferentes entre os volumes, e a resolução do processamento nunca é trocada por uma chave;
 * - a OCORRÊNCIA, a exceção de uma citação só (`idDaOcorrencia`, src/bibliografia/chave.ts):
 *   `<chave ou "-">@<SIGLA>|<alvo>|<raw>`, com o alvo = o `passage_id` quando a citação tem trecho, senão o `item_id`
 *   (também na citação da posição relatada, cuja linha da fila está na hipótese). A exceção vence a chave e pode religar até
 *   uma citação resolvida pelo processamento. Uma citação sem trecho e sem item não tem alvo: não tem exceção (no build, um
 *   alvo None nunca casa), mas a chave ainda vale para ela.
 *
 * Campo `obra`: o id da obra (`BIB-<aparelho>-<n>` do usuário ou `BIB-<dígitos>` dos livros), ou `null`:
 * - numa chave, `null` = a chave desligada (nada se liga por ela);
 * - numa ocorrência, `null` = «Desligar esta citação»: ela fica como o processamento a deixou, mesmo com a chave ligada.
 * `excluir` / `restaurar`: a marca de sempre. A exceção excluída devolve a ocorrência à chave; a chave excluída não liga nada.
 *
 * Duas escritas da mesma chave em aparelhos diferentes (foco 2): é o MESMO registro (o reg é a chave), e vale a escrita de
 * maior hlc do campo `obra`, como em toda a fusão. Duas exceções da mesma ocorrência com chaves impressas diferentes (o
 * processamento mudou a citação curta): vale a de escrita mais nova do campo `obra`, como no `user-import`.
 *
 * A obra de uma ligação vale como no `user-import` (`obra_do_livro`): uma obra do usuário (`BIB-<aparelho>-<n>`) só vale
 * com o registro dela aqui, vivo e com um CSL que se formata (`lerObra`); excluída, ainda não sincronizada ou com o CSL
 * quebrado, a ligação não liga (foco 3). Uma obra dos livros (`BIB-<dígitos>`) vale, salvo a publicada que sai (abaixo).
 *
 * O QUE O APP MOSTRA (`obraDaCitacao`), juntando a camada e o pacote:
 * - a camada liga a citação (uma ligação viva com obra que vale): a obra da camada;
 * - a camada não diz nada da citação (nenhum registro da chave nem da ocorrência): o que o pacote diz;
 * - a camada a toca mas não a liga (a obra excluída, a chave desligada ou excluída, a exceção nula ou excluída): se o pacote
 *   a traz resolvida PELO USUÁRIO (pacote 10, `resolved_by 'user'`), ela está «não resolvida»: a ligação do pacote veio da
 *   camada, e o build seguinte também a desfaz. Senão, vale o pacote (uma resolução do processamento nunca é desfeita pela
 *   camada, a não ser por uma exceção que liga a outra obra).
 * LIMITES (até o build seguinte, que acerta tudo):
 * - uma exceção que religou uma citação resolvida pelo processamento e depois foi desligada ou excluída mostra «não
 *   resolvida»: o pacote só guarda a obra da exceção, não a automática de antes;
 * - por isso mesmo (o pacote a traz `resolved_by 'user'`), a chave passa a valer para essa citação no app, e no build não.
 * A OBRA PUBLICADA QUE SAI (Tarefa 14, fix round 1): uma ligação feita pelo `BIB-<dígitos>` de uma obra dos livros que o
 * pacote criou de obras suas (`criadas`, os redirecionamentos com `criado`) deixa de valer quando TODAS as origens dela estão
 * excluídas na camada: a regra de `obras_que_saem` do `user-import` (a obra sai no build seguinte, e as citações voltam a não
 * resolvidas). «Restaurar» uma origem a faz valer de novo. Sem `criadas` (os testes antigos, sem pacote), como antes.
 */
import { chaveDaCitacao, chaveDaOcorrencia, eIdDeLigacao, RE_OCORRENCIA } from '../bibliografia/chave'
import { eObraDoLivro, eObraSkc, lerObra } from '../bibliografia/modelo'
import { estadoAtual, registrarVarios } from '../usuario/estado'
import type { PedidoDeEvento } from '../usuario/armazem'
import { compararPorPontoDeCodigo, type Evento } from '../usuario/eventos'
import type { Estado, Registro } from '../usuario/fusao'

export { eIdDeLigacao, idDaOcorrencia, RE_OCORRENCIA } from '../bibliografia/chave'

/** Uma citação dos livros, pelo que a identifica entre os pacotes (nunca o `bib_ref.id`). */
export interface CitacaoDoLivro {
  /** A sigla da publicação (`bib_ref.publication`). */
  sigla: string
  /**
   * O `passage_id` quando a citação tem trecho; senão o `item_id` (`alvoDaCitacao`). Sem os dois, nenhuma exceção casa com
   * ela; passe '' (só a chave vale).
   */
  alvo: string
  /** A citação como impressa (`bib_ref.raw`). */
  raw: string
  /** A citação curta (`bib_ref.short_cite`), ou null (a citação sem autor). */
  curta: string | null
  /**
   * A citação foi resolvida PELO PROCESSAMENTO (`status` 'resolved' e `resolved_by` ≠ 'user'; `resolvidaPeloProcessamento`)?
   * Então a chave não a liga: só a exceção da ocorrência.
   */
  resolvida: boolean
}

/** O que o pacote diz da citação (`bib_ref.bib_entry_id` e `resolved_by`). */
export interface CitacaoNoPacote {
  obraId: string | null
  resolvidaPor: 'auto' | 'user' | null
}

/**
 * O alvo da exceção de uma citação: o trecho, quando ela tem; senão o item. null: uma citação sem os dois não tem exceção
 * (no build, um alvo None nunca casa); a chave ainda vale para ela.
 */
export const alvoDaCitacao = (r: { passagemId: string | null; itemId: string | null }): string | null => r.passagemId ?? r.itemId

/** Resolvida pelo processamento: a resolvida pelo usuário (pacote 10, `resolved_by` 'user') conta como não resolvida. */
export const resolvidaPeloProcessamento = (r: { resolvida: boolean; resolvidaPor?: 'auto' | 'user' | null }): boolean =>
  r.resolvida && r.resolvidaPor !== 'user'

interface Excecao {
  hlc: string
  id: string
  obra: unknown
}

/**
 * As exceções por ocorrência (`<SIGLA>|<alvo>|<raw>`): as vivas, uma por ocorrência (a de escrita mais nova), e, à parte, as
 * excluídas (a camada tocou a ocorrência e a devolveu à chave). Guardadas por mapa de registros `citacao`.
 */
interface Excecoes {
  vivas: Map<string, Excecao>
  excluidas: Map<string, Excecao>
}
const indices = new WeakMap<ReadonlyMap<string, Registro>, Excecoes>()
const NENHUMA: Excecoes = { vivas: new Map(), excluidas: new Map() }

function excecoes(estado: Estado): Excecoes {
  const regs = estado.registros.get('citacao')
  if (!regs) return NENHUMA
  const guardado = indices.get(regs)
  if (guardado) return guardado
  const ind: Excecoes = { vivas: new Map(), excluidas: new Map() }
  for (const r of regs.values()) {
    if (!('obra' in r.campos)) continue
    const m = RE_OCORRENCIA.exec(r.id)
    if (!m) continue
    const chave = chaveDaOcorrencia(m[2]!, m[3]!, m[4]!)
    const hlc = estado.hlcDoCampo('citacao', r.id, 'obra') ?? r.alteradoEm
    const mapa = r.excluido ? ind.excluidas : ind.vivas
    const ja = mapa.get(chave)
    // a de maior hlc; no empate, a de menor id (a ordem `sorted` + `>` do processamento)
    if (!ja || hlc > ja.hlc || (hlc === ja.hlc && compararPorPontoDeCodigo(r.id, ja.id) < 0)) mapa.set(chave, { hlc, id: r.id, obra: r.campos.obra })
  }
  indices.set(regs, ind)
  return ind
}

/** As obras dos livros criadas de obras suas: os redirecionamentos com `criado` (de → para; `useDestinosCriados`). */
export type ObrasCriadas = ReadonlyMap<string, string>
const NENHUMA_CRIADA: ObrasCriadas = new Map()

/**
 * A obra dos livros `obra` sai no build seguinte: ela foi criada de obras suas (`criadas`), e todas elas estão excluídas na
 * camada (a regra de `obras_que_saem`; uma origem que ainda não chegou a este aparelho continua viva).
 */
export function obraPublicadaSai(estado: Estado, criadas: ObrasCriadas, obra: string): boolean {
  let alguma = false
  for (const [de, para] of criadas) {
    if (para !== obra) continue
    if (!estado.registro('obra', de)?.excluido) return false
    alguma = true
  }
  return alguma
}

/**
 * A obra de uma ligação, se ela vale (a regra de `obra_do_livro` do `user-import`): uma obra dos livros que não sai
 * (`obraPublicadaSai`); ou uma obra do usuário com o registro aqui, vivo e com um CSL que se formata.
 */
function obraQueVale(estado: Estado, obra: unknown, criadas: ObrasCriadas): string | null {
  if (eObraDoLivro(obra)) return estado.registro('obra', obra)?.excluido || obraPublicadaSai(estado, criadas, obra) ? null : obra
  if (!eObraSkc(obra)) return null
  const r = estado.registro('obra', obra)
  return r && !r.excluido && lerObra(r) ? obra : null
}

/**
 * O id da exceção VIVA da ocorrência da citação (a que vence a chave), ou null. A Revisão a tira junto quando liga pela chave
 * uma citação que a pessoa tinha desligado no objeto: senão a exceção nula continuaria a vencer, e o caso ficaria na fila.
 */
export function excecaoViva(estado: Estado, ref: Pick<CitacaoDoLivro, 'sigla' | 'alvo' | 'raw'>): string | null {
  if (ref.alvo === '') return null
  return excecoes(estado).vivas.get(chaveDaOcorrencia(ref.sigla, ref.alvo, ref.raw))?.id ?? null
}

/** O que a camada diz de uma citação: a obra (null: a camada a toca mas não a liga), de onde vem e o registro que decide. */
export interface Ligacao {
  /** A obra, ou null: a exceção nula, a chave desligada, a ligação excluída, a obra excluída ou que ainda não vale. */
  obra: string | null
  por: 'ocorrencia' | 'chave'
  /** O id do registro `citacao` que decide. */
  registro: string
}

/**
 * O que a camada do usuário diz de uma citação, ou null se nada nela a toca. Na ordem: a exceção viva da ocorrência; a chave
 * (só para a não resolvida pelo processamento), viva, desligada ou excluída; a exceção excluída (ela devolveu a citação à
 * chave, e a chave não diz nada).
 */
export function ligacaoDe(estado: Estado, ref: CitacaoDoLivro, criadas: ObrasCriadas = NENHUMA_CRIADA): Ligacao | null {
  const ex = excecoes(estado)
  const ocorrencia = chaveDaOcorrencia(ref.sigla, ref.alvo, ref.raw)
  const viva = ref.alvo !== '' ? ex.vivas.get(ocorrencia) : undefined
  if (viva) return { obra: obraQueVale(estado, viva.obra, criadas), por: 'ocorrencia', registro: viva.id }
  const chave = ref.resolvida ? null : chaveDaCitacao(ref.curta)
  const r = chave === null ? undefined : estado.registro('citacao', chave)
  if (r && chave !== null) return { obra: r.excluido ? null : obraQueVale(estado, r.campos.obra, criadas), por: 'chave', registro: chave }
  const excluida = ref.alvo !== '' ? ex.excluidas.get(ocorrencia) : undefined
  if (excluida) return { obra: null, por: 'ocorrencia', registro: excluida.id }
  return null
}

/**
 * A obra que a CAMADA liga a uma citação, ou null (a camada não a liga: veja `obraDaCitacao` para o que mostrar). A exceção
 * vence a chave; uma exceção `null` devolve null; a chave só vale para a não resolvida pelo processamento; uma ligação a uma
 * obra excluída devolve null (foco 3). A regra é a de `obra_da_citacao` do processamento.
 */
export function obraLigada(estado: Estado, ref: CitacaoDoLivro, criadas: ObrasCriadas = NENHUMA_CRIADA): string | null {
  return ligacaoDe(estado, ref, criadas)?.obra ?? null
}

/**
 * A obra que o app mostra para uma citação, juntando a camada e o pacote (veja «O QUE O APP MOSTRA» no cabeçalho): a da
 * camada, se ela liga; null (não resolvida) se a camada desfez uma ligação que o pacote traz do usuário; senão, a do pacote,
 * salvo se ela é uma obra publicada que sai (`obraPublicadaSai`): o build seguinte não a cria, e a citação fica sem obra.
 */
export function obraDaCitacao(estado: Estado, ref: CitacaoDoLivro, pacote: CitacaoNoPacote, criadas: ObrasCriadas = NENHUMA_CRIADA): string | null {
  const l = ligacaoDe(estado, ref, criadas)
  if (l?.obra) return l.obra
  if (l && pacote.resolvidaPor === 'user') return null
  if (pacote.obraId !== null && eObraDoLivro(pacote.obraId) && obraPublicadaSai(estado, criadas, pacote.obraId)) return null
  return pacote.obraId
}

/**
 * Liga uma chave ou uma ocorrência a uma obra (`obra` null: desliga). Um registro que este aparelho não conhece, ou que está
 * excluído, grava também um `restaurar` na mesma gravação: se outro aparelho o excluiu sem este ver, a ligação mais nova
 * vence, e é a desta pessoa (como `marcarComoResolvido`).
 */
export async function ligar(chaveOuOcorrencia: string, obra: string | null): Promise<Evento> {
  const eventos = await registrarVarios(pedidosDeLigar(chaveOuOcorrencia, obra))
  return eventos[0]!
}

/**
 * Os eventos de `ligar`, para gravar junto com outros na mesma transação (a Nova obra cria a obra e liga a citação de uma
 * vez: nunca fica uma sem a outra). Lança como `ligar`.
 */
export function pedidosDeLigar(chaveOuOcorrencia: string, obra: string | null, estado: Estado = estadoAtual()): PedidoDeEvento[] {
  if (!eIdDeLigacao(chaveOuOcorrencia)) throw new Error(`não é uma chave de citação nem uma ocorrência: ${JSON.stringify(chaveOuOcorrencia)}`)
  if (obra !== null && !eObraSkc(obra) && !eObraDoLivro(obra)) throw new Error(`não é uma obra: ${JSON.stringify(obra)}`)
  const r = estado.registro('citacao', chaveOuOcorrencia)
  return [
    { tipo: 'citacao', reg: chaveOuOcorrencia, op: r ? 'alterar' : 'criar', campos: { obra } },
    ...(!r || r.excluido ? [{ tipo: 'citacao' as const, reg: chaveOuOcorrencia, op: 'restaurar' as const, campos: {} }] : []),
  ]
}

/**
 * Os eventos que tiram as exceções de ocorrência `ids` de uma citação que se vai ligar pela `chave` (a Nova obra aberta da
 * Revisão: a citação que a pessoa desligou no objeto continuaria a vencer a chave). Só as ocorrências DESSA chave, e só as
 * vivas; as outras são ignoradas.
 */
export function pedidosDeTirarExcecoes(chave: string, ids: readonly string[], estado: Estado = estadoAtual()): PedidoDeEvento[] {
  const saida: PedidoDeEvento[] = []
  for (const id of new Set(ids)) {
    const m = RE_OCORRENCIA.exec(id)
    const r = estado.registro('citacao', id)
    if (m && m[1] === chave && r && !r.excluido) saida.push({ tipo: 'citacao', reg: id, op: 'excluir', campos: {} })
  }
  return saida
}

/** Tira a ligação (a exceção volta à chave; a chave não liga mais). Já sem ligação: não grava nada (null). */
export async function excluirLigacao(chaveOuOcorrencia: string): Promise<Evento | null> {
  const r = estadoAtual().registro('citacao', chaveOuOcorrencia)
  if (!r || r.excluido) return null
  const [evento] = await registrarVarios([{ tipo: 'citacao', reg: chaveOuOcorrencia, op: 'excluir', campos: {} }])
  return evento ?? null
}
