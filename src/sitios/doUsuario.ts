/**
 * O que as telas leem dos sítios do usuário (Tarefa 12): os sítios novos, as correções dos sítios do livro, o sítio de cada
 * objeto (a troca `item-sitio` ou o da ficha de um objeto SKC), o nome de agora, o aviso de nome repetido e os "sítios não
 * resolvidos". Puro sobre o `Estado`, mais os hooks. O formato está em src/sitios/modelo.ts.
 *
 * Parte 2C, bloco 2: onde se lista, se conta ou se dá nome a um sítio, vale o DESTINO (src/sitios/useResolucao.ts). As funções
 * que recebem `redirecionados` para isso (`sitiosSkc`, `objetosPorSitio`, o nome de agora, a situação, os não resolvidos)
 * recebem dos hooks `destinosDosSitios` (os `SI-…` publicados e os absorvidos → o destino); as que leem os dados de um sítio
 * (`dadosDoSitioComOrigens`, `correcoesDosSitios`) continuam com os redirecionamentos das publicações e leem as grafias da
 * resolução (`resolucao`), para a página e a resolução dizerem o mesmo.
 */
import { useMemo } from 'react'
import type { ObjetoResumo } from '../banco/tipos'
import { eObjetoSkc, lerFicha } from '../objetos-skc/modelo'
import { useEstado, type Estado } from '../usuario/estado'
import { useLido } from '../usuario/useLido'
import type { Registro } from '../usuario/fusao'
import { destinoDe, origensDe, useRedirecionamentos, type Redirecionamentos } from '../pacote/redirecionamentos'
import { totalDeObjetos } from './contagem'
import { chaveDaGrafia, chaveDoNome, eSitioSkc, hlcDoSitio, lerDadosDoSitio, lerSitioSkc, lerTrocaDeSitio, textosDasGrafias, type DadosDoSitio, type SitioSkc, type TrocaDeSitio } from './modelo'
import { useSitiosDoPacote, type SitiosDoPacote } from './pacote'
import type { GrafiaDoPacote, Resolucao } from './resolucao'
import { chaveDoObjeto, destinosDosSitios, useDestinosDosSitios, useObjetosDoPacoteSemRepetir, usePacoteDeSitios, useResolucaoDeSitios } from './useResolucao'

const porCriacao = (a: SitioSkc, b: SitioSkc) => (a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Os sítios novos do usuário vivos, na ordem em que foram criados. Os que o pacote publicou como sítio do livro
 * (`redirecionados`, Tarefa 16) não entram: quem aparece é o sítio do livro. Com `destinosDosSitios`, também os mesclados
 * em outro sítio.
 */
export function sitiosSkc(estado: Estado, redirecionados?: Redirecionamentos | null): SitioSkc[] {
  const saida: SitioSkc[] = []
  for (const r of estado.registros.get('sitio')?.values() ?? []) if (!r.excluido && eSitioSkc(r.id) && !redirecionados?.has(r.id)) saida.push(lerSitioSkc(r, hlcDoSitio(estado, r.id)))
  return saida.sort(porCriacao)
}

/** Os campos que um sítio do usuário publicado (Tarefa 16) passa ao sítio do livro: os que o pipeline não guarda. */
const CAMPOS_HERDADOS = ['variantes', 'regiao', 'pais'] as const

const SEM_DADOS: DadosDoSitio = { nome: null, variantes: [], regiao: null, pais: null, coordenada: null, nota: null }

/**
 * Os dados de um sítio como a tela os mostra: o registro dele e, num sítio do LIVRO que é o destino de um sítio do usuário
 * publicado (`redirecionados`, Tarefa 16, revisão 1), as outras grafias, a região e o país que a pessoa deu ao `SI-…` e que
 * o pipeline não guarda. Um campo que o próprio registro do livro já escreveu (mesmo `null`, "o do livro") vence; entre dois
 * `SI-…` publicados como o mesmo sítio, o de menor id. O nome, a coordenada e a nota do `SI-…` já estão no pacote. null se
 * não há nada.
 */
export function dadosDoSitioComOrigens(estado: Estado, id: string, redirecionados?: Redirecionamentos | null, resolucao?: Resolucao | null): DadosDoSitio | null {
  const base = dadosComOrigens(estado, id, redirecionados)
  // Parte 2C, bloco 2: as grafias de um destino são as da resolução (as do registro dele, as dos `SI-…` publicados como ele e
  // as dos absorvidos, pela escrita mais recente), não a regra de `dadosComOrigens` (o registro do livro primeiro): a página e
  // a resolução dizem o mesmo. Um absorvido fica com as dele (a tela pergunta pelo destino).
  if (!resolucao || !resolucao.existe(id) || resolucao.destino(id) !== resolucao.canonico(id)) return base
  const grafias = textosDasGrafias(resolucao.grafiasDoUsuario(id))
  if (base === null && grafias.length === 0) return null
  return { ...(base ?? SEM_DADOS), variantes: grafias }
}

function dadosComOrigens(estado: Estado, id: string, redirecionados?: Redirecionamentos | null): DadosDoSitio | null {
  const r = estado.registro('sitio', id)
  const proprio = r ? lerDadosDoSitio(r, hlcDoSitio(estado, id)) : null
  if (eSitioSkc(id)) return proprio
  const origens = origensDe(redirecionados, id)
    .sort()
    .flatMap((o) => estado.registro('sitio', o) ?? [])
  if (origens.length === 0) return proprio
  const d: DadosDoSitio = { ...(proprio ?? SEM_DADOS) }
  for (const campo of CAMPOS_HERDADOS) {
    // As outras grafias estão em `grafias` (ou nas `variantes` de antes): qualquer dos dois escrito no registro do livro vence.
    if (r && (campo in r.campos || (campo === 'variantes' && 'grafias' in r.campos))) continue
    for (const o of origens) {
      const v = lerDadosDoSitio(o, hlcDoSitio(estado, o.id))[campo]
      if (campo === 'variantes' ? (v as string[]).length > 0 : v !== null) {
        ;(d as unknown as Record<string, unknown>)[campo] = v
        break
      }
    }
  }
  return d
}

/**
 * O que a pessoa corrigiu nos sítios do LIVRO (pelo id do pacote), com o que deu aos sítios seus que o pacote publicou como
 * eles (`redirecionados`; veja `dadosDoSitioComOrigens`).
 */
export function correcoesDosSitios(estado: Estado, redirecionados?: Redirecionamentos | null, resolucao?: Resolucao | null): Map<string, DadosDoSitio> {
  const mapa = new Map<string, DadosDoSitio>()
  for (const r of estado.registros.get('sitio')?.values() ?? []) {
    if (eSitioSkc(r.id)) continue
    mapa.set(r.id, resolucao ? (dadosDoSitioComOrigens(estado, r.id, redirecionados, resolucao) ?? lerDadosDoSitio(r, hlcDoSitio(estado, r.id))) : lerDadosDoSitio(r, hlcDoSitio(estado, r.id)))
  }
  for (const [de, para] of redirecionados ?? []) {
    if (!eSitioSkc(de) || eSitioSkc(para) || !estado.registro('sitio', de)) continue
    const d = dadosDoSitioComOrigens(estado, para, redirecionados, resolucao)
    if (d) mapa.set(para, d)
  }
  return mapa
}

/** Os objetos do pacote com o sítio trocado: número do objeto → a troca (só as que escolhem um sítio). */
export function trocasDeSitio(estado: Estado): Map<string, TrocaDeSitio> {
  const mapa = new Map<string, TrocaDeSitio>()
  for (const r of estado.registros.get('item-sitio')?.values() ?? []) {
    const t = lerTrocaDeSitio(r)
    if (t.sitio !== null) mapa.set(r.id, t)
  }
  return mapa
}

/**
 * O sítio existe e vale? Um do livro sempre; um `SI-…` só se o registro existe e não foi excluído. Um `SI-…` que o pacote
 * publicou (`redirecionados`, Tarefa 16) é o sítio do livro: vale.
 */
export function sitioVivo(estado: Estado, id: string, redirecionados?: Redirecionamentos | null): boolean {
  if (!eSitioSkc(destinoDe(redirecionados, id))) return true
  const r = estado.registro('sitio', id)
  return !!r && !r.excluido
}

/** `excluido`: o registro existe e foi excluído; `ausente`: um `SI-…` que este aparelho não tem (ainda não chegou). */
export type SituacaoDoSitio = 'vivo' | 'excluido' | 'ausente'

export function situacaoDoSitio(estado: Estado, id: string, redirecionados?: Redirecionamentos | null): SituacaoDoSitio {
  if (!eSitioSkc(destinoDe(redirecionados, id))) return 'vivo'
  const r = estado.registro('sitio', id)
  return !r ? 'ausente' : r.excluido ? 'excluido' : 'vivo'
}

/** A marca que acompanha o nome de um sítio que não vale: «excluído» só para o que a pessoa excluiu; «ainda não sincronizado» para o que não está neste aparelho. */
export const marcaDaSituacao = (s: SituacaoDoSitio): string | null => (s === 'excluido' ? 'excluído' : s === 'ausente' ? 'ainda não sincronizado' : null)

/** O nome com a marca entre parênteses («Tell X (excluído)»), ou só o nome. */
export function nomeComMarcaDoSitio(estado: Estado, id: string | null, nome: string | null, redirecionados?: Redirecionamentos | null): string | null {
  const marca = id && nome !== null ? marcaDaSituacao(situacaoDoSitio(estado, id, redirecionados)) : null
  return marca ? `${nome} (${marca})` : nome
}

/**
 * O nome de agora de um sítio, nesta ordem: o nome corrigido (ou o do sítio novo) → o nome do livro (`livro`, o de `sitios()`)
 * → o rótulo guardado. Um sítio excluído conserva o nome. `null` se nada diz o nome. Um `SI-…` que o pacote publicou
 * (`redirecionados`, Tarefa 16) tem o nome do sítio do livro (sem a lista do pacote à mão, o nome que a pessoa lhe deu, que é
 * o que o pipeline publicou).
 */
export function nomeDeAgoraDoSitio(
  estado: Estado,
  id0: string,
  livro: SitiosDoPacote | null,
  guardado: string | null = null,
  redirecionados?: Redirecionamentos | null,
): string | null {
  const id = destinoDe(redirecionados, id0)
  const nomeDe = (x: string) => {
    const r = estado.registro('sitio', x)
    return r ? lerDadosDoSitio(r).nome : null
  }
  const corrigido = nomeDe(id)
  if (eSitioSkc(id)) return corrigido ?? guardado
  return corrigido ?? livro?.get(id)?.nome ?? (id !== id0 ? nomeDe(id0) : null) ?? guardado
}

/** O sítio de um objeto depois da troca da pessoa: o escolhido (`trocado`), senão o do livro. */
export interface SitioDoObjeto {
  id: string | null
  trocado: boolean
  /**
   * O sítio escolhido é um `SI-…` que a pessoa excluiu (uma exclusão sem `restaurar` depois): a Revisão o conta como não resolvido.
   * Um `SI-…` que este aparelho ainda não tem (ainda não sincronizado) NÃO é excluído: resolve-se sozinho quando chegar.
   */
  excluido: boolean
}

export function sitioDoObjetoDoPacote(estado: Estado, numero: string, doLivro: string | null, redirecionados?: Redirecionamentos | null): SitioDoObjeto {
  const r = estado.registro('item-sitio', numero)
  const troca = r ? lerTrocaDeSitio(r).sitio : null
  if (troca !== null) return { id: troca, trocado: true, excluido: situacaoDoSitio(estado, troca, redirecionados) === 'excluido' }
  return { id: doLivro, trocado: false, excluido: false }
}

/** O sítio de agora de um objeto numa lista (cartão, linha, sugestão): o id, o nome de agora e se é um `SI-…` excluído. */
export interface SitioDoResumo {
  id: string | null
  nome: string | null
  excluido: boolean
  /** O que dizer ao lado do nome: «excluído» (a pessoa o excluiu), «ainda não sincronizado» (não está neste aparelho) ou nada. */
  marca: string | null
}

/**
 * O sítio que um resumo de objeto mostra: num objeto do livro, o sítio trocado pela pessoa (`item-sitio`) ou o do livro; num
 * objeto SKC, o da ficha. Sempre com o nome de agora (corrigido → do livro → guardado).
 */
export function sitioDeAgoraDoResumo(
  estado: Estado,
  livro: SitiosDoPacote | null,
  r: Pick<ObjetoResumo, 'numero' | 'sitio' | 'sitioId' | 'skc'>,
  redirecionados?: Redirecionamentos | null,
): SitioDoResumo {
  let id = r.sitioId ?? null
  let guardado = r.sitio
  if (!r.skc) {
    const troca = estado.registro('item-sitio', r.numero)
    const escolhido = troca ? lerTrocaDeSitio(troca) : null
    if (escolhido?.sitio) {
      id = escolhido.sitio
      guardado = escolhido.sitioNome
    }
  }
  if (!id) return { id: null, nome: guardado, excluido: false, marca: null }
  return {
    id,
    nome: nomeDeAgoraDoSitio(estado, id, livro, guardado, redirecionados),
    excluido: !sitioVivo(estado, id, redirecionados),
    marca: marcaDaSituacao(situacaoDoSitio(estado, id, redirecionados)),
  }
}

/** O sítio de um objeto SKC: o da ficha (id), ou só o nome que a pessoa escreveu. */
export function sitioDoObjetoSkc(r: Registro, estado: Estado, redirecionados?: Redirecionamentos | null): { id: string | null; guardado: string | null; excluido: boolean } {
  const ficha = lerFicha(r.campos)
  const id = ficha.sitio.trim() || null
  return { id, guardado: ficha.sitioNome.trim() || null, excluido: id !== null && situacaoDoSitio(estado, id, redirecionados) === 'excluido' }
}

/**
 * Quantos objetos a pessoa ligou a cada sítio: os objetos SKC vivos cuja ficha o escolheu e os do livro que ela trocou
 * (`item-sitio`). Os objetos que o livro põe no sítio não estão aqui (a lista soma o `objetos` do pacote). Os ligados a um
 * `SI-…` que o pacote publicou (`redirecionados`, Tarefa 16) contam no sítio do livro.
 */
export function objetosPorSitio(estado: Estado, redirecionados?: Redirecionamentos | null): Map<string, number> {
  const mapa = new Map<string, number>()
  const mais = (id0: string) => {
    const id = destinoDe(redirecionados, id0)
    mapa.set(id, (mapa.get(id) ?? 0) + 1)
  }
  for (const r of estado.registros.get('objeto')?.values() ?? []) {
    if (r.excluido || !eObjetoSkc(r)) continue
    const id = lerFicha(r.campos).sitio.trim()
    if (id !== '') mais(id)
  }
  for (const t of trocasDeSitio(estado).values()) if (t.sitio) mais(t.sitio)
  return mapa
}

/**
 * Um objeto SKC que conta como "sítio não resolvido": só escreveu o nome (livre), ou o sítio dele foi excluído. Um objeto cujo
 * sítio ainda não chegou a este aparelho (`ausente`, "ainda não sincronizado") NÃO conta: não é problema da pessoa, e a conta
 * se acerta sozinha na sincronização.
 */
export interface SkcNaoResolvido {
  id: string
  motivo: 'livre' | 'excluido'
  nome: string
}

export function skcComSitioNaoResolvido(estado: Estado, redirecionados?: Redirecionamentos | null): SkcNaoResolvido[] {
  const saida: SkcNaoResolvido[] = []
  for (const r of estado.registros.get('objeto')?.values() ?? []) {
    if (r.excluido || !eObjetoSkc(r)) continue
    const s = sitioDoObjetoSkc(r, estado, redirecionados)
    if (s.id !== null) {
      if (s.excluido) saida.push({ id: r.id, motivo: 'excluido', nome: nomeDeAgoraDoSitio(estado, s.id, null, s.guardado, redirecionados) ?? s.id })
    } else if (s.guardado !== null) saida.push({ id: r.id, motivo: 'livre', nome: s.guardado })
  }
  return saida
}

/** Uma linha da fila de revisão do pacote ("sítio não normalizado"): o item e o número do objeto dele (o id do item se não tem). */
export interface LinhaDeSitioNaoResolvido {
  itemId: string
  numero: string
}

export interface SitiosNaoResolvidos {
  /** As linhas do pacote que continuam sem sítio (sem troca viva). */
  pacote: LinhaDeSitioNaoResolvido[]
  /** Quantas linhas do pacote a pessoa resolveu trocando o sítio do objeto. */
  resolvidasPeloUsuario: number
  /** Os objetos SKC com nome livre ou com o sítio excluído. */
  skc: SkcNaoResolvido[]
  /** Objetos do pacote com um sítio trocado que foi excluído (voltam a contar como não resolvidos; já estão em `pacote`). */
  excluidos: number
  /** O total que a Revisão mostra: o que o pacote ainda tem + os objetos SKC. */
  total: number
}

/**
 * Os "sítios não resolvidos" de agora (Revisão): as linhas `sitio_nao_normalizado` do pacote menos as que a pessoa resolveu
 * (o objeto tem um sítio trocado, vivo ou ainda não sincronizado), mais os objetos SKC com nome livre ou com o sítio excluído.
 * Restaurar o sítio excluído o resolve de novo. O que a pessoa marca como resolvido na Revisão desconta depois (src/revisao/fila.ts).
 */
export function sitiosNaoResolvidos(estado: Estado, linhasDoPacote: readonly LinhaDeSitioNaoResolvido[], redirecionados?: Redirecionamentos | null): SitiosNaoResolvidos {
  const trocas = trocasDeSitio(estado)
  const pacote: LinhaDeSitioNaoResolvido[] = []
  let resolvidas = 0
  let excluidos = 0
  for (const l of linhasDoPacote) {
    const t = trocas.get(l.numero)
    // Uma troca para um sítio vivo, ou que ainda não chegou a este aparelho, resolve; só a exclusão faz o objeto voltar a contar.
    if (t && situacaoDoSitio(estado, t.sitio!, redirecionados) !== 'excluido') resolvidas++
    else {
      if (t) excluidos++
      pacote.push(l)
    }
  }
  const skc = skcComSitioNaoResolvido(estado, redirecionados)
  return { pacote, resolvidasPeloUsuario: resolvidas, skc, excluidos, total: pacote.length + skc.length }
}

/** Outro sítio (do livro ou do usuário) com o mesmo nome ou grafia, pela dobra: o aviso "pode ser o mesmo sítio". */
export interface SitioParecido {
  id: string
  nome: string
  doUsuario: boolean
}

/** Um sítio do livro para comparar (o nome de agora e as grafias). */
export interface SitioParaComparar {
  id: string
  nome: string
  grafias: readonly string[]
  doUsuario: boolean
}

/**
 * Parte 2C, bloco 2: o que acha um destino além do nome dele e das correções: as grafias do usuário (a resolução, com as dos
 * absorvidos), os nomes dos absorvidos (o do livro, o impresso e o corrigido; o de um `SI-…`) e as grafias que os livros dão a
 * ele e aos absorvidos (`sitio_grafia` com `origem = 'livro'`; as do usuário vêm só da camada, F12). Sem repetir pela
 * `chaveDaGrafia`. [] para um absorvido (quem acha é o destino).
 */
export function nomesQueAchamODestino(
  estado: Estado,
  resolucao: Resolucao,
  id: string,
  livro: SitiosDoPacote | null,
  grafiasDoLivro: readonly GrafiaDoPacote[] = [],
): string[] {
  if (resolucao.destino(id) !== resolucao.canonico(id)) return []
  const absorvidos = resolucao.absorvidos(id)
  const doLivro = grafiasDoLivroPorSitio(grafiasDoLivro)
  const textos: (string | null | undefined)[] = resolucao.grafiasDoUsuario(id).map((g) => g.texto)
  textos.push(...(doLivro.get(resolucao.canonico(id)) ?? []))
  for (const a of absorvidos) {
    const r = estado.registro('sitio', a)
    textos.push(livro?.get(a)?.nome, livro?.get(a)?.literal, r ? lerDadosDoSitio(r).nome : null, ...(doLivro.get(a) ?? []))
  }
  const vistos = new Set<string>()
  const saida: string[] = []
  for (const t of textos) {
    if (!t || vistos.has(chaveDaGrafia(t))) continue
    vistos.add(chaveDaGrafia(t))
    saida.push(t)
  }
  return saida
}

const porSitio = new WeakMap<readonly GrafiaDoPacote[], ReadonlyMap<string, readonly string[]>>()

/** As grafias dos livros (`origem = 'livro'`) agrupadas por sítio, uma vez por pacote (a lista é a do pacote lido). */
function grafiasDoLivroPorSitio(grafias: readonly GrafiaDoPacote[]): ReadonlyMap<string, readonly string[]> {
  let mapa = porSitio.get(grafias)
  if (!mapa) {
    const novo = new Map<string, string[]>()
    for (const g of grafias) if (g.origem === 'livro') novo.set(g.sitio, [...(novo.get(g.sitio) ?? []), g.texto])
    porSitio.set(grafias, (mapa = novo))
  }
  return mapa
}

/** O que muda numa lista de sítios com a resolução (Parte 2C, bloco 2): quem some (os absorvidos) e o que acha cada destino. */
interface ComResolucao {
  resolucao?: Resolucao | null
  grafiasDoLivro?: readonly GrafiaDoPacote[]
  /** Os objetos do pacote de cada árvore, sem repetir (`objetosDoPacoteSemRepetir`). */
  distintos?: ReadonlyMap<string, number> | null
}

/**
 * Todos os sítios que valem (livro com as correções, e os do usuário vivos), com o nome de agora e as grafias. Com a resolução,
 * sem os absorvidos, e cada destino também com os nomes que o acham (`nomesQueAchamODestino`).
 */
export function sitiosParaComparar(estado: Estado, livro: SitiosDoPacote | null, redirecionados?: Redirecionamentos | null, comResolucao: ComResolucao = {}): SitioParaComparar[] {
  const { resolucao, grafiasDoLivro } = comResolucao
  const destinos = resolucao ? destinosDosSitios(resolucao, redirecionados) : redirecionados
  const correcoes = correcoesDosSitios(estado, redirecionados, resolucao)
  const aMais = (id: string) => (resolucao ? nomesQueAchamODestino(estado, resolucao, id, livro, grafiasDoLivro) : [])
  const saida: SitioParaComparar[] = []
  for (const s of livro?.values() ?? []) {
    if (destinos?.has(s.id)) continue
    const c = correcoes.get(s.id)
    saida.push({ id: s.id, nome: c?.nome ?? s.nome, grafias: [s.nome, s.literal, ...(c?.variantes ?? []), ...aMais(s.id)], doUsuario: false })
  }
  for (const s of sitiosSkc(estado, destinos)) saida.push({ id: s.id, nome: s.nomeDeAgora, grafias: [...s.variantes, ...aMais(s.id)], doUsuario: true })
  return saida
}

/** Os sítios (menos `exceto`) cujo nome ou grafia é o `texto`, pela dobra. */
export function sitiosComEsteNome(todos: readonly SitioParaComparar[], texto: string, exceto: string | null = null): SitioParecido[] {
  const k = chaveDoNome(texto)
  if (k === '') return []
  return todos.filter((s) => s.id !== exceto && [s.nome, ...s.grafias].some((g) => chaveDoNome(g) === k)).map((s) => ({ id: s.id, nome: s.nome, doUsuario: s.doUsuario }))
}

/** Um sítio para escolher (a folha "Sítio deste objeto" e o campo Sítio da ficha): o nome de agora e tudo o que o acha. */
export interface OpcaoDeSitio {
  id: string
  nome: string
  regiao: string | null
  doUsuario: boolean
  /** O nome do livro, quando o nome de agora é outro (a opção diz "antes: …"). */
  nomeDoLivro: string | null
  /** As outras grafias (as do livro e as do usuário) e o nome antigo: o que a busca do campo procura além do nome. */
  grafias: string[]
  objetos: number
}

/**
 * Todos os sítios que valem, para escolher: os do livro com as correções e os do usuário vivos, em ordem alfabética. Com a
 * resolução (Parte 2C, bloco 2), sem os absorvidos; cada destino acha-se também pelos nomes e grafias deles e pelas grafias do
 * usuário (`nomesQueAchamODestino`), e conta os objetos dele, dos absorvidos e das partes (`contagemDoSitio`).
 */
export function opcoesDeSitio(estado: Estado, livro: SitiosDoPacote | null, redirecionados?: Redirecionamentos | null, comResolucao: ComResolucao = {}): OpcaoDeSitio[] {
  const { resolucao, grafiasDoLivro, distintos } = comResolucao
  const destinos = resolucao ? destinosDosSitios(resolucao, redirecionados) : redirecionados
  const correcoes = correcoesDosSitios(estado, redirecionados, resolucao)
  const contagem = objetosPorSitio(estado, destinos)
  const doPacote = (id: string) => livro?.get(id)?.objetos ?? 0
  const daPessoa = (id: string) => contagem.get(id) ?? 0
  const objetos = (id: string) => (resolucao ? totalDeObjetos(resolucao, id, doPacote, daPessoa, distintos) : doPacote(id) + daPessoa(id))
  const aMais = (id: string) => (resolucao ? nomesQueAchamODestino(estado, resolucao, id, livro, grafiasDoLivro) : [])
  const semRepetir = (nome: string, lista: readonly string[]) => {
    const vistos = new Set([chaveDaGrafia(nome)])
    return lista.filter((g) => !vistos.has(chaveDaGrafia(g)) && !!vistos.add(chaveDaGrafia(g)))
  }
  const saida: OpcaoDeSitio[] = []
  for (const s of livro?.values() ?? []) {
    if (destinos?.has(s.id)) continue
    const c = correcoes.get(s.id)
    const nome = c?.nome ?? s.nome
    saida.push({
      id: s.id,
      nome,
      regiao: c?.regiao ?? s.regiao?.nome ?? null,
      doUsuario: false,
      nomeDoLivro: nome !== s.nome ? s.nome : null,
      grafias: resolucao ? semRepetir(nome, [s.literal, ...(c?.variantes ?? []), ...aMais(s.id)]) : [s.literal, ...(c?.variantes ?? [])].filter((g) => g !== nome),
      objetos: objetos(s.id),
    })
  }
  for (const s of sitiosSkc(estado, destinos)) {
    const grafias = resolucao ? semRepetir(s.nomeDeAgora, [...s.variantes, ...aMais(s.id)]) : s.variantes
    saida.push({ id: s.id, nome: s.nomeDeAgora, regiao: s.regiao, doUsuario: true, nomeDoLivro: null, grafias, objetos: objetos(s.id) })
  }
  return saida.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
}

/** Os sítios para escolher (`opcoesDeSitio`, com a resolução); o do livro só entra depois que o pacote chega. */
export function useOpcoesDeSitio(): OpcaoDeSitio[] {
  const estado = useEstado((e) => e)
  const livro = useSitiosDoPacote()
  const redirecionados = useRedirecionamentos()
  const resolucao = useResolucaoDeSitios()
  const pacote = usePacoteDeSitios()
  const trocas = useTrocasDeSitio()
  const distintos = useObjetosDoPacoteSemRepetir(resolucao, trocas)
  return useMemo(() => opcoesDeSitio(estado, livro, redirecionados, { resolucao, grafiasDoLivro: pacote?.grafias, distintos }), [estado, livro, redirecionados, resolucao, pacote, distintos])
}

// ---------------------------------------------------------------------------------------------------------- hooks

/** Os "sítios não resolvidos" de agora para as telas (`sitiosNaoResolvidos`); refaz quando um sítio, uma troca ou um objeto muda. */
export function useSitiosNaoResolvidos(linhasDoPacote: readonly LinhaDeSitioNaoResolvido[]): SitiosNaoResolvidos {
  const estado = useEstado((e) => e)
  const redirecionados = useDestinosDosSitios()
  return useMemo(() => sitiosNaoResolvidos(estado, linhasDoPacote, redirecionados), [estado, linhasDoPacote, redirecionados])
}

/** A chave de leitura de um mapa de redirecionamentos (o `useLido` refaz a leitura quando ele muda). */
const chaveDosRedirecionamentos = (r: Redirecionamentos | null): string => [...(r ?? [])].map(([de, para]) => `${de}>${para}`).join(',')

/** Quantos objetos a pessoa ligou a cada sítio (`objetosPorSitio`), no destino: os dos publicados e dos absorvidos contam nele. */
export function useObjetosPorSitio(): ReadonlyMap<string, number> {
  const redirecionados = useDestinosDosSitios()
  return useLido(['objeto', 'item-sitio'], `contagem|${chaveDosRedirecionamentos(redirecionados)}`, (e) => objetosPorSitio(e, redirecionados))
}
/** Os sítios novos do usuário vivos (`sitiosSkc`), todos: também os publicados e os mesclados (os dados de um absorvido). */
export const useTodosOsSitiosSkc = (): SitioSkc[] => useLido(['sitio'], 'skc', sitiosSkc)

/** Os sítios novos do usuário vivos (`sitiosSkc`), sem os que o pacote publicou (Tarefa 16) nem os mesclados em outro. */
export function useSitiosSkc(): SitioSkc[] {
  const todos = useTodosOsSitiosSkc()
  const redirecionados = useDestinosDosSitios()
  return useMemo(() => (redirecionados && redirecionados.size > 0 ? todos.filter((s) => !redirecionados.has(s.id)) : todos), [todos, redirecionados])
}
/** As correções dos sítios do livro (`correcoesDosSitios`), com o que a pessoa deu aos sítios seus que o pacote publicou. */
export function useCorrecoesDosSitios(): ReadonlyMap<string, DadosDoSitio> {
  const redirecionados = useRedirecionamentos()
  const resolucao = useResolucaoDeSitios()
  return useLido(['sitio'], `correcoes|${chaveDosRedirecionamentos(redirecionados)}|${chaveDoObjeto(resolucao)}`, (e) => correcoesDosSitios(e, redirecionados, resolucao))
}
export const useTrocasDeSitio = (): ReadonlyMap<string, TrocaDeSitio> => useLido(['item-sitio'], 'trocas', trocasDeSitio)

/**
 * O registro de um sítio (novo, ou a correção de um do livro) lido para a tela; null se não há registro. Num sítio do livro
 * que é o destino de um sítio do usuário publicado (Tarefa 16, revisão 1), com as grafias, a região e o país do `SI-…`
 * (`dadosDoSitioComOrigens`); `excluido` é sempre o do próprio registro.
 */
export function useDadosDoSitio(id: string): { dados: DadosDoSitio; excluido: boolean; criadoEm: string } | null {
  const redirecionados = useRedirecionamentos()
  const resolucao = useResolucaoDeSitios()
  const origens = eSitioSkc(id) ? [] : origensDe(redirecionados, id)
  return useLido(['sitio'], `dados:${id}|${origens.join(',')}|${chaveDoObjeto(resolucao)}`, (e) => {
    const r = e.registro('sitio', id)
    const dados = dadosDoSitioComOrigens(e, id, redirecionados, resolucao)
    return dados ? { dados, excluido: r?.excluido ?? false, criadoEm: r?.criadoEm ?? '' } : null
  })
}

/** Os nomes corrigidos, os sítios `SI-…` excluídos e as trocas de sítio: o bastante para dar o nome de agora sem o `Estado` inteiro. */
interface TabelaDeSitios {
  nomes: ReadonlyMap<string, string>
  excluidos: ReadonlySet<string>
  /** `SI-…` que existem (vivos ou excluídos). */
  existentes: ReadonlySet<string>
  trocas: ReadonlyMap<string, TrocaDeSitio>
}

function tabelaDeSitios(e: Estado): TabelaDeSitios {
  const nomes = new Map<string, string>()
  const excluidos = new Set<string>()
  const existentes = new Set<string>()
  for (const r of e.registros.get('sitio')?.values() ?? []) {
    const n = lerDadosDoSitio(r).nome
    if (n !== null) nomes.set(r.id, n)
    if (eSitioSkc(r.id)) existentes.add(r.id)
    if (r.excluido) excluidos.add(r.id)
  }
  return { nomes, excluidos, existentes, trocas: trocasDeSitio(e) }
}

export interface SitiosVivos {
  /** O nome de agora (corrigido → do livro → guardado). */
  nome(id: string | null | undefined, guardado?: string | null): string | null
  /** O sítio é um `SI-…` que a pessoa excluiu (um que este aparelho ainda não tem não é excluído: veja `marca`). */
  excluido(id: string | null | undefined): boolean
  /** A marca ao lado do nome: «excluído» só para o que foi excluído; «ainda não sincronizado» para o que este aparelho não tem. */
  marca(id: string | null | undefined): string | null
  /** O sítio de um objeto do pacote depois da troca, com o nome de agora. */
  doObjetoDoPacote(numero: string, doLivro: { id: string | null; nome: string | null }): { id: string | null; nome: string | null; trocado: boolean; excluido: boolean; marca: string | null }
  /** O sítio que um resumo de objeto mostra (`sitioDeAgoraDoResumo`, sem o `Estado`). */
  doResumo(r: Pick<ObjetoResumo, 'numero' | 'sitio' | 'sitioId' | 'skc'>): SitioDoResumo
}

/** Os nomes e as trocas de agora para as telas; refaz só quando um `sitio` ou `item-sitio` muda, ou o pacote chega. */
export function useSitiosVivos(comPacote = true): SitiosVivos {
  const tabela = useLido(['sitio', 'item-sitio'], 'tabela', tabelaDeSitios)
  const livro = useSitiosDoPacote(comPacote)
  const redirecionados = useDestinosDosSitios()
  return useMemo<SitiosVivos>(() => {
    // Um sítio do usuário que o pacote publicou (Tarefa 16) é o sítio do livro, e um sítio mesclado é o destino (Parte 2C,
    // bloco 2): o nome de agora dele, sem marca.
    const real = (id: string) => destinoDe(redirecionados, id)
    const nome = (id0: string | null | undefined, guardado: string | null = null) => {
      if (!id0) return guardado
      const id = real(id0)
      const corrigido = tabela.nomes.get(id)
      if (corrigido !== undefined) return corrigido
      if (!eSitioSkc(id)) return livro?.get(id)?.nome ?? guardado
      return guardado
    }
    const excluido = (id: string | null | undefined) => !!id && eSitioSkc(real(id)) && tabela.excluidos.has(id)
    const marca = (id0: string | null | undefined) => {
      const id = id0 ? real(id0) : id0
      return !id || !eSitioSkc(id) ? null : !tabela.existentes.has(id) ? marcaDaSituacao('ausente') : tabela.excluidos.has(id) ? marcaDaSituacao('excluido') : null
    }
    const doObjetoDoPacote: SitiosVivos['doObjetoDoPacote'] = (numero, doLivro) => {
      const troca = tabela.trocas.get(numero)
      if (troca?.sitio) return { id: troca.sitio, nome: nome(troca.sitio, troca.sitioNome), trocado: true, excluido: excluido(troca.sitio), marca: marca(troca.sitio) }
      return { id: doLivro.id, nome: nome(doLivro.id, doLivro.nome), trocado: false, excluido: false, marca: null }
    }
    return {
      nome,
      excluido,
      marca,
      doObjetoDoPacote,
      doResumo(r) {
        if (r.skc) return r.sitioId ? { id: r.sitioId, nome: nome(r.sitioId, r.sitio), excluido: excluido(r.sitioId), marca: marca(r.sitioId) } : { id: null, nome: r.sitio, excluido: false, marca: null }
        const s = doObjetoDoPacote(r.numero, { id: r.sitioId ?? null, nome: r.sitio })
        return { id: s.id, nome: s.nome, excluido: s.excluido, marca: s.marca }
      },
    }
  }, [tabela, livro, redirecionados])
}

/**
 * Para a lista dos sítios (Parte 2C, bloco 2): a resolução, os destinos e o que acha cada destino além do nome e das correções
 * (`nomesQueAchamODestino`; só os destinos que têm algo). null enquanto a resolução não chegou.
 */
export function useResolucaoDaLista(): { resolucao: Resolucao; destinos: Redirecionamentos; nomes: ReadonlyMap<string, string[]> } | null {
  const resolucao = useResolucaoDeSitios()
  const pacote = usePacoteDeSitios()
  const livro = useSitiosDoPacote()
  const redirecionados = useRedirecionamentos()
  return useLido(['sitio'], `lista|${chaveDoObjeto(resolucao)}|${chaveDoObjeto(pacote)}|${chaveDoObjeto(livro)}|${chaveDosRedirecionamentos(redirecionados)}`, (e) => {
    if (!resolucao) return null
    const nomes = new Map<string, string[]>()
    for (const k of resolucao.sitios) {
      const n = nomesQueAchamODestino(e, resolucao, k, livro, pacote?.grafias)
      if (n.length > 0) nomes.set(k, n)
    }
    return { resolucao, destinos: destinosDosSitios(resolucao, redirecionados), nomes }
  })
}

/** Os sítios para comparar nomes (aviso de repetido), sem os absorvidos (cada destino com os nomes deles). */
export function useSitiosParaComparar(): SitioParaComparar[] {
  const estado = useEstado((e) => e)
  const livro = useSitiosDoPacote()
  const redirecionados = useRedirecionamentos()
  const resolucao = useResolucaoDeSitios()
  const pacote = usePacoteDeSitios()
  return useMemo(() => sitiosParaComparar(estado, livro, redirecionados, { resolucao, grafiasDoLivro: pacote?.grafias }), [estado, livro, redirecionados, resolucao, pacote])
}
