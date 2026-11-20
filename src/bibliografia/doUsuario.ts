/**
 * As obras do usuário nas telas (Parte 2C, bloco 3): a lista viva (Bibliografia, escolha de obra dos objetos SKC, as
 * parecidas da Nova obra), a obra pelo id e quem a cita. Puro sobre o `Estado`, mais os hooks.
 *
 * A obra do usuário que o pacote publicou (redirecionamento `tipo 'obra'`, `BIB-<aparelho>-<n>` → `BIB-<dígitos>`) não
 * entra: quem aparece é a do livro, uma vez só.
 */
import { useMemo } from 'react'
import { obras as obrasDoPacote } from '../banco/consultas'
import type { ObraResumo } from '../banco/tipos'
import type { OpcaoDeEscolha } from '../objetos-skc/CampoDeEscolha'
import { eObjetoSkc } from '../objetos-skc/modelo'
import { useDestinosCriados, useOrigensQueCriaram, useRedirecionamentos, type Redirecionamentos } from '../pacote/redirecionamentos'
import { jsonCanonico } from '../usuario/eventos'
import { useCarregar, type Carga } from '../ui/useCarregar'
import type { Estado } from '../usuario/estado'
import { useLido } from '../usuario/useLido'
import { normalizarForma } from '../glossario/modelo'
import { obraPublicadaSai } from '../revisao/ligacoes'
import { eCslValido, eObraSkc, lerObra, RE_OBRA_DO_LIVRO, type Csl, type ObraSkc } from './modelo'

/** Uma obra da lista: a do pacote (`skc: false`) ou a do usuário ainda não publicada (`skc: true`, `origem` null). */
export interface ObraDaLista extends ObraResumo {
  skc: boolean
  /** A sigla do livro em parágrafos (ou da tradução dele) que é esta obra (Tarefa 26): a etiqueta na lista. */
  livro?: string
}

const porCriacao = (a: ObraSkc, b: ObraSkc) => (a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** As obras do usuário vivas, que se formatam (`lerObra`), na ordem em que foram criadas; sem as que o pacote publicou. */
export function obrasSkc(estado: Estado, redirecionados?: Redirecionamentos | null): ObraSkc[] {
  const saida: ObraSkc[] = []
  for (const r of estado.registros.get('obra')?.values() ?? []) {
    if (r.excluido || !eObraSkc(r.id) || redirecionados?.has(r.id)) continue
    const o = lerObra(r)
    if (o) saida.push(o)
  }
  return saida.sort(porCriacao)
}

/** Os objetos SKC vivos que citam cada obra (o campo `obra` da ficha): id da obra → ids dos objetos. */
export function objetosSkcPorObra(estado: Estado): Map<string, string[]> {
  const mapa = new Map<string, string[]>()
  for (const r of estado.registros.get('objeto')?.values() ?? []) {
    const obra = r.campos.obra
    if (r.excluido || !eObjetoSkc(r) || typeof obra !== 'string' || obra === '') continue
    mapa.set(obra, [...(mapa.get(obra) ?? []), r.id])
  }
  return mapa
}

/** A obra do usuário como uma linha da lista. */
export function obraSkcNaLista(o: ObraSkc, objetos: number): ObraDaLista {
  return { id: o.id, curta: o.curta || null, titulo: o.csl.title, origem: null, objetos, curtas: o.curta ? [o.curta] : [], csl: o.csl, skc: true }
}

/**
 * As obras do pacote e as do usuário juntas, pela citação curta (a ordem de `obras()`). Tarefa 14 (fix round 1): `edicoes`
 * (`edicoesDasObrasPublicadas`) põe na obra dos livros que veio de você o que a camada escreveu depois (a citação curta, o
 * título e o CSL), como a página dela, como as correções dos sítios nas linhas dos sítios dos livros.
 */
export function juntarObras(
  doPacote: readonly ObraResumo[],
  skc: readonly ObraSkc[],
  objetos: ReadonlyMap<string, readonly string[]>,
  edicoes: ReadonlyMap<string, EdicaoSobreOPacote> = new Map(),
): ObraDaLista[] {
  const comEdicao = (o: ObraResumo): ObraResumo => {
    const e = edicoes.get(o.id)
    if (!e) return o
    const curta = e.curta ?? o.curta
    return {
      ...o,
      curta,
      titulo: e.csl ? e.csl.title : o.titulo,
      csl: e.csl ? { ...e.csl, id: o.id } : o.csl,
      curtas: e.curta ? [e.curta, ...o.curtas.filter((c) => c !== e.curta)] : o.curtas,
    }
  }
  const todas: ObraDaLista[] = [...doPacote.map((o) => ({ ...comEdicao(o), skc: false })), ...skc.map((o) => obraSkcNaLista(o, objetos.get(o.id)?.length ?? 0))]
  return todas.sort((x, y) => (x.curta ?? x.titulo ?? x.id).localeCompare(y.curta ?? y.titulo ?? y.id, 'pt'))
}

const lerObrasSkc = (e: Estado) => obrasSkc(e)

/** O que a camada mudou numa obra publicada, só o que difere do pacote (null no campo que não mudou). */
export interface EdicaoSobreOPacote {
  csl: Csl | null
  curta: string | null
}

/** O CSL sem o `id` (o do pacote o traz; o da camada, não), para comparar. */
const cslSemId = (csl: Record<string, unknown> | null | undefined): string => {
  if (!csl) return ''
  const { id: _id, ...resto } = csl
  return jsonCanonico(resto)
}

/**
 * A edição da camada sobre o pacote (Tarefa 14): o CSL e a citação curta da camada só valem quando diferem dos do pacote (o
 * CSL que o pacote publicou é o da origem; uma obra que você não mudou depois de publicada fica com o Chicago do pacote,
 * exatamente). null se nada difere.
 */
export function edicaoSobreOPacote(doPacote: { csl: Record<string, unknown> | null; curta: string | null }, camada: { csl: Csl | null; curta: string | null }): EdicaoSobreOPacote | null {
  const csl = camada.csl && cslSemId(camada.csl) !== cslSemId(doPacote.csl) ? camada.csl : null
  const curta = camada.curta && camada.curta !== doPacote.curta ? camada.curta : null
  return csl || curta ? { csl, curta } : null
}

/**
 * Tarefa 14 (fix round 1): as obras dos livros criadas de obras suas (`criadas`, os redirecionamentos com `criado`) com uma
 * origem viva neste aparelho: id do livro → o que a camada escreveu (`camposDaObraNaCamada`; a regra de `useObraPublicada`).
 * Quem usa compara com o pacote (`edicaoSobreOPacote`).
 */
export function camposDasObrasPublicadas(estado: Estado, criadas: Redirecionamentos): Map<string, { csl: Csl | null; curta: string | null }> {
  const origens = new Map<string, string[]>()
  for (const [de, para] of criadas) if (RE_OBRA_DO_LIVRO.test(para)) origens.set(para, [...(origens.get(para) ?? []), de])
  const saida = new Map<string, { csl: Csl | null; curta: string | null }>()
  for (const [id, os] of origens) {
    const vivas = os.filter((o) => {
      const r = estado.registro('obra', o)
      return !!r && !r.excluido
    })
    if (vivas.length > 0) saida.set(id, camposDaObraNaCamada(estado, [...vivas, id]))
  }
  return saida
}

/** As edições da camada nas obras publicadas que vieram de você, só as que diferem do pacote. */
export function edicoesDasObrasPublicadas(doPacote: readonly ObraResumo[], campos: ReadonlyMap<string, { csl: Csl | null; curta: string | null }>): Map<string, EdicaoSobreOPacote> {
  const saida = new Map<string, EdicaoSobreOPacote>()
  if (campos.size === 0) return saida
  for (const o of doPacote) {
    const c = campos.get(o.id)
    const e = c ? edicaoSobreOPacote(o, c) : null
    if (e) saida.set(o.id, e)
  }
  return saida
}

/** `camposDasObrasPublicadas` para as telas (acompanha as obras e os redirecionamentos com `criado`). */
function useCamposDasObrasPublicadas(): Map<string, { csl: Csl | null; curta: string | null }> {
  const criadas = useDestinosCriados()
  const chave = `obras-publicadas:${[...criadas].filter(([, p]) => RE_OBRA_DO_LIVRO.test(p)).map(([de, p]) => `${de}>${p}`).join('|')}`
  return useLido(['obra'], chave, (e) => camposDasObrasPublicadas(e, criadas))
}

/** As obras do usuário vivas (sem as publicadas pelo pacote). */
export function useObrasSkc(): ObraSkc[] {
  const todas = useLido(['obra'], 'obras-skc', lerObrasSkc)
  const redirecionados = useRedirecionamentos()
  return useMemo(() => (redirecionados && redirecionados.size > 0 ? todas.filter((o) => !redirecionados.has(o.id)) : todas), [todas, redirecionados])
}

/** Os objetos SKC por obra (`objetosSkcPorObra`). */
export function useObjetosSkcPorObra(): Map<string, string[]> {
  return useLido(['objeto'], 'objetos-skc-por-obra', objetosSkcPorObra)
}

/** O registro da obra do usuário (também excluída), ou null. */
export function useObraSkc(id: string): ObraSkc | null {
  return useLido(['obra'], `obra-skc:${id}`, (e) => {
    const r = e.registro('obra', id)
    return r ? lerObra(r) : null
  })
}

/**
 * As obras da Bibliografia: as do pacote (`obras()`) e as do usuário, juntas. Enquanto o pacote carrega, 'carregando'; se
 * ele falha, o erro (as do usuário não aparecem sozinhas numa lista que diz que falhou).
 */
export function useObrasDaBibliografia(): Carga<ObraDaLista[]> {
  const carga = useCarregar(obrasDoPacote, 'obras')
  const skc = useObrasSkc()
  const objetos = useObjetosSkcPorObra()
  const publicadas = useCamposDasObrasPublicadas()
  return useMemo(
    (): Carga<ObraDaLista[]> => (carga.fase === 'ok' ? { fase: 'ok', dados: juntarObras(carga.dados, skc, objetos, edicoesDasObrasPublicadas(carga.dados, publicadas)) } : carga),
    [carga, skc, objetos, publicadas],
  )
}

/**
 * Revisão final do bloco 3 (M1): as obras que se oferecem para LIGAR uma citação (a busca e as parecidas da Revisão, e as
 * parecidas da Nova obra aberta com `?citacao=`): as da Bibliografia sem as obras dos livros que saem no build seguinte
 * (`obraPublicadaSai`: criadas de obras suas, todas excluídas). Uma ligação a elas não valeria (`obraQueVale`) e o caso
 * ficaria na fila. A escolha de obra dos objetos SKC continua com todas (`useOpcoesDeObra`): o processamento trata o objeto.
 * Com `ativo` falso, as obras da Bibliografia como estão.
 */
export function useObrasParaLigar(ativo = true): Carga<ObraDaLista[]> {
  const carga = useObrasDaBibliografia()
  const criadas = useDestinosCriados()
  const chave = `obras-que-saem:${[...criadas].filter(([, p]) => RE_OBRA_DO_LIVRO.test(p)).map(([de, p]) => `${de}>${p}`).join('|')}`
  const saem = useLido(['obra'], chave, (e) => new Set([...new Set(criadas.values())].filter((id) => RE_OBRA_DO_LIVRO.test(id) && obraPublicadaSai(e, criadas, id))))
  return useMemo(
    (): Carga<ObraDaLista[]> => (ativo && carga.fase === 'ok' && saem.size > 0 ? { fase: 'ok', dados: carga.dados.filter((o) => !saem.has(o.id)) } : carga),
    [ativo, carga, saem],
  )
}

/** Uma obra como opção da escolha de obra dos objetos SKC: a citação curta (ou o título), o título de apoio e a marca SKC. */
export const opcaoDeObra = (o: ObraDaLista): OpcaoDeEscolha => ({
  id: o.id,
  rotulo: o.curta ?? o.titulo ?? o.id,
  apoio: o.curta && o.titulo ? o.titulo : undefined,
  ...(o.skc ? { skc: true } : {}),
})

/** As opções da escolha de obra dos objetos SKC (NovoObjeto, «Editar a ficha»): as obras dos livros e as do usuário juntas. */
export function useOpcoesDeObra(): OpcaoDeEscolha[] {
  const carga = useObrasDaBibliografia()
  return useMemo(() => (carga.fase === 'ok' ? carga.dados.map(opcaoDeObra) : []), [carga])
}

/**
 * Tarefa 14: a obra dos livros que veio de uma obra sua continua editável (spec §5.2, escolha do controlador; como o verbete,
 * `useEdicaoPublicada`). O que a camada escreveu volta para os dados pelo `user-import` (`dados_da_obra`), que lê o registro
 * da obra de origem e o registro `obra` com o id do livro, campo a campo a escrita mais nova.
 */
export interface ObraPublicada {
  /** As obras suas que criaram esta obra dos livros (do pacote; algumas podem faltar neste aparelho). */
  origens: string[]
  /** As origens vivas que este aparelho tem. Sem nenhuma, a obra não se edita (excluídas, ela sai dos livros). */
  vivas: string[]
  /**
   * Onde gravar: a origem, quando é uma só; com duas ou mais, o registro com o id do livro, que o `user-import` lê junto com a
   * origem que a criou (o app não sabe qual delas é).
   */
  alvo: string
  /** O que a camada escreveu (`camposDaObraNaCamada`): null no campo que ela não tem. */
  csl: Csl | null
  curta: string | null
}

/**
 * Os campos de obra (`csl`, `curta`) que a camada escreveu nos registros `regs` (as origens vivas e o registro com o id do
 * livro), campo a campo a escrita mais nova: a regra de `dados_da_obra` do `user-import`. Um registro excluído não conta; um
 * `csl` que não se formata, também não.
 */
export function camposDaObraNaCamada(estado: Estado, regs: readonly string[]): { csl: Csl | null; curta: string | null } {
  let csl: { hlc: string; valor: Csl } | null = null
  let curta: { hlc: string; valor: string } | null = null
  for (const reg of regs) {
    const r = estado.registro('obra', reg)
    if (!r || r.excluido) continue
    const c = r.campos.csl
    if (eCslValido(c)) {
      const hlc = estado.hlcDoCampo('obra', reg, 'csl') ?? r.criadoEm
      if (!csl || hlc > csl.hlc) csl = { hlc, valor: c }
    }
    if (typeof r.campos.curta === 'string') {
      const hlc = estado.hlcDoCampo('obra', reg, 'curta') ?? r.criadoEm
      if (!curta || hlc > curta.hlc) curta = { hlc, valor: normalizarForma(r.campos.curta) }
    }
  }
  return { csl: csl?.valor ?? null, curta: curta?.valor ?? null }
}

/**
 * A edição de uma obra dos livros que o pacote CRIOU de obras suas (`useOrigensQueCriaram`). null se ela não veio de você,
 * se nenhuma origem viva está neste aparelho, ou enquanto o pacote é lido.
 */
export function useObraPublicada(id: string): ObraPublicada | null {
  const origens = useOrigensQueCriaram(id)
  return useLido(['obra'], `obra-publicada:${id}:${(origens ?? []).join('|')}`, (e) => {
    if (!origens || origens.length === 0) return null
    const vivas = origens.filter((o) => {
      const r = e.registro('obra', o)
      return !!r && !r.excluido
    })
    if (vivas.length === 0) return null
    const alvo = origens.length === 1 ? origens[0]! : id
    return { origens, vivas, alvo, ...camposDaObraNaCamada(e, [...vivas, id]) }
  })
}
