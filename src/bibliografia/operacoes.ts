/**
 * Escrever as obras do usuário (Parte 2C, bloco 3). Tudo passa por `registrarVarios` (IndexedDB antes de qualquer rede). O
 * formato do registro `obra` está em src/bibliografia/modelo.ts.
 *
 * - `criarObra`: a obra nova (`BIB-<aparelho>-<n>`), com o CSL do formulário e a citação curta. Com `ligarA` (a chave de
 *   uma citação, da Revisão), liga a citação a ela na MESMA gravação: nunca fica uma sem a outra.
 * - `editarObra`: um `alterar` só com o que mudou (`csl` inteiro e/ou `curta`). Vale a última escrita de cada campo.
 * - `excluirObra` / `restaurarObra`: a marca de sempre. As citações ligadas a uma obra excluída voltam a «não resolvidas» e
 *   voltam ligadas com «Restaurar» (foco 3; `obraLigada`, src/revisao/ligacoes.ts).
 * - `trocarPorEsta`: a obra do usuário é a mesma que outra («É esta» ao editar): as ligações de citação e os objetos SKC
 *   que apontam para ela passam para a outra, e ela é excluída, numa gravação só, guardando o que foi movido.
 *   `restaurarObra` (na página da obra e em «Excluídos») devolve tudo.
 */
import { pedidosDeLigar, pedidosDeTirarExcecoes } from '../revisao/ligacoes'
import type { PedidoDeEvento } from '../usuario/armazem'
import { estadoAtual, proximoId, registrar, registrarVarios, type Estado } from '../usuario/estado'
import type { Campos, Evento } from '../usuario/eventos'
import { objetosSkcPorObra } from './doUsuario'
import { camposDaObraNova, eObraDoLivro, eObraSkc, lerObra, lerTroca, type Csl } from './modelo'
import { normalizarForma } from '../glossario/modelo'
import { criadosDoPacote, origensDe, redirecionamentosDoPacote, SEM_REDIRECIONAMENTOS } from '../pacote/redirecionamentos'
import { jsonCanonico } from '../usuario/eventos'

/** Reserva o id de uma obra nova (o contador do aparelho; nunca reusado). */
export const reservarIdDaObra = (): Promise<string> => proximoId('BIB')

/**
 * Cria a obra e devolve o id. `id`: o reservado antes (um segundo «Salvar» com o mesmo id só repete o `criar`). `ligarA`:
 * a chave (ou a ocorrência) de uma citação para ligar a ela.
 */
export async function criarObra(csl: Csl, curta: string, opcoes: { id?: string; ligarA?: string | null; tirarExcecoes?: readonly string[] } = {}): Promise<string> {
  const campos = camposDaObraNova(csl, curta)
  const id = opcoes.id ?? (await reservarIdDaObra())
  if (!eObraSkc(id)) throw new Error('id de obra inválido')
  // `tirarExcecoes`: as exceções nulas das citações do caso da Revisão, que venceriam a chave (fix round 1 da Tarefa 11)
  const ligar = opcoes.ligarA ? [...pedidosDeLigar(opcoes.ligarA, id), ...pedidosDeTirarExcecoes(opcoes.ligarA, opcoes.tirarExcecoes ?? [])] : []
  await registrarVarios([{ tipo: 'obra', reg: id, op: 'criar', campos }, ...ligar])
  return id
}

/**
 * Grava o que mudou na obra (`csl` e/ou `curta`); null se nada mudou.
 *
 * Tarefa 14: `id` pode ser o `BIB-<dígitos>` de uma obra dos livros que veio de obras suas (com duas ou mais origens, o
 * registro que o `user-import` lê junto com a que a criou; `useObraPublicada`), e o primeiro `alterar` cria o registro. Uma
 * obra dos livros que não veio de você não se edita. Com `antes` (o que a tela da obra publicada mostrava: o pacote com a
 * camada por cima), ele é a base da comparação em qualquer id, também na origem.
 */
export async function editarObra(id: string, csl: Csl, curta: string, antes?: { csl: Csl; curta: string }): Promise<Evento | null> {
  if (eObraDoLivro(id)) {
    const [mapa, criados] = await Promise.all([redirecionamentosDoPacote().catch(() => SEM_REDIRECIONAMENTOS), criadosDoPacote().catch(() => new Set<string>())])
    if (!antes || !origensDe(mapa, id).some((o) => criados.has(o))) throw new Error(`${id} não veio de uma obra sua: as obras dos livros não se editam no app`)
  } else {
    const r = estadoAtual().registro('obra', id)
    if (!eObraSkc(id) || !r || !lerObra(r)) throw new Error(`não é uma obra sua: ${JSON.stringify(id)}`)
  }
  // Fix round 1 (M2): com `antes` (a obra publicada), a base é o que a tela mostrava, também na origem: a página mostra a
  // escrita mais nova entre a origem e o registro do livro, e voltar ao valor da origem tem de ser gravado
  const r = estadoAtual().registro('obra', id)
  const atual = antes ?? (r ? lerObra(r) : null)
  if (!atual) throw new Error(`não é uma obra sua: ${JSON.stringify(id)}`)
  const { csl: novo = null, curta: novaCurta = '' } = camposDaObraNova(csl, curta)
  const campos: Campos = {}
  const { id: _id, ...cslDeAntes } = atual.csl
  if (jsonCanonico(novo) !== jsonCanonico(cslDeAntes)) campos.csl = novo
  if (novaCurta !== atual.curta) campos.curta = novaCurta
  if (Object.keys(campos).length === 0) return null
  return registrar('obra', id, 'alterar', campos)
}

export const excluirObra = (id: string): Promise<Evento> => registrar('obra', id, 'excluir')

/**
 * Restaura a obra. Se ela foi trocada por outra («É esta» ao editar), devolve na mesma gravação as ligações e os objetos
 * SKC que passaram para a outra e ainda estão como a troca os deixou (o que a pessoa mudou depois fica como está), com o
 * rótulo de antes, e limpa a troca. Revisão final (M2): o objeto volta só se aponta para a outra E tem o rótulo que a troca
 * escreveu; um rótulo digitado depois (em outro aparelho: a fusão pode guardar o id da troca e o rótulo novo) fica.
 */
export async function restaurarObra(id: string): Promise<Evento> {
  const estado = estadoAtual()
  const r = estado.registro('obra', id)
  const troca = r ? lerTroca(r) : null
  const pedidos: PedidoDeEvento[] = []
  if (troca) {
    // o rótulo que a troca escreveu nos objetos (`trocarPorEsta`: o mesmo de `trocadaPorRotulo`)
    const rotuloDaTroca = typeof r!.campos.trocadaPorRotulo === 'string' ? r!.campos.trocadaPorRotulo : ''
    for (const l of troca.ligacoes) {
      const rl = estado.registro('citacao', l)
      if (rl && !rl.excluido && rl.campos.obra === troca.para) pedidos.push(...pedidosDeLigar(l, id, estado))
    }
    for (const o of troca.objetos) {
      const ro = estado.registro('objeto', o.id)
      const rotulo = typeof ro?.campos.obraRotulo === 'string' ? ro.campos.obraRotulo : ''
      if (ro && ro.campos.obra === troca.para && rotulo === rotuloDaTroca) pedidos.push({ tipo: 'objeto', reg: o.id, op: 'alterar', campos: { obra: o.obra, obraRotulo: o.obraRotulo } })
    }
    pedidos.push({ tipo: 'obra', reg: id, op: 'alterar', campos: { trocadaPor: null, trocadaPorRotulo: null, movidos: null } })
  }
  const eventos = await registrarVarios([...pedidos, { tipo: 'obra', reg: id, op: 'restaurar', campos: {} }])
  return eventos.at(-1)!
}

/** O que `trocarPorEsta` muda: as ligações de citação e os objetos SKC que apontam para a obra. */
export function usosDaObra(estado: Estado, id: string): { ligacoes: string[]; objetos: string[] } {
  const ligacoes: string[] = []
  for (const r of estado.registros.get('citacao')?.values() ?? []) if (!r.excluido && r.campos.obra === id) ligacoes.push(r.id)
  return { ligacoes, objetos: objetosSkcPorObra(estado).get(id) ?? [] }
}

/**
 * A obra do usuário `id` é a mesma que `outra` (da Bibliografia): as ligações e os objetos SKC dela passam para `outra`
 * (com o rótulo `rotulo` na ficha), e ela é excluída. Tudo numa gravação.
 */
export async function trocarPorEsta(id: string, outra: string, rotulo: string): Promise<void> {
  if (!eObraSkc(id)) throw new Error(`não é uma obra sua: ${JSON.stringify(id)}`)
  if (id === outra || (!eObraSkc(outra) && !eObraDoLivro(outra))) throw new Error(`não é outra obra: ${JSON.stringify(outra)}`)
  const estado = estadoAtual()
  const { ligacoes, objetos } = usosDaObra(estado, id)
  const nome = normalizarForma(rotulo)
  const antes = objetos.map((o) => {
    const c = estado.registro('objeto', o)?.campos ?? {}
    return { id: o, obra: typeof c.obra === 'string' ? c.obra : '', obraRotulo: typeof c.obraRotulo === 'string' ? c.obraRotulo : '' }
  })
  const pedidos: PedidoDeEvento[] = [
    ...ligacoes.flatMap((l) => pedidosDeLigar(l, outra, estado)),
    ...objetos.map((o): PedidoDeEvento => ({ tipo: 'objeto', reg: o, op: 'alterar', campos: { obra: outra, obraRotulo: nome } })),
    // o que foi movido, para «Restaurar» devolver (`restaurarObra`)
    { tipo: 'obra', reg: id, op: 'alterar', campos: { trocadaPor: outra, trocadaPorRotulo: nome, movidos: { ligacoes, objetos: antes } } },
    { tipo: 'obra', reg: id, op: 'excluir', campos: {} },
  ]
  await registrarVarios(pedidos)
}
