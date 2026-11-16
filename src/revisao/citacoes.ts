/**
 * As citações não resolvidas na Revisão (Parte 2C, bloco 3, Tarefa 11): de que citações dos livros (`bib_ref`) é cada linha
 * `citacao_nao_resolvida` da fila, quais delas a camada do usuário já liga a uma obra, quantas «iguais» um «Ligar» alcança e
 * o que ele grava. Puro sobre o `Estado` e as citações do pacote (`citacoesNaoResolvidasNoPacote`).
 *
 * A linha da fila não diz o `bib_ref.id`: o build escreve uma linha por chave (ou citação impressa, sem autor) e entidade, com
 * o texto da PRIMEIRA citação (`_write_citations`, `_write_undivided_citations`, `_write_passage_citations` e a posição
 * relatada, em iconodb/db/build.py). Aqui se faz o caminho de volta: a entidade (o trecho, o item com o campo, a hipótese),
 * a citação impressa que começa o texto da linha (o resto é «; sem autor na citação» e parecidos), e então todas as não
 * resolvidas da mesma entidade com o mesmo rótulo (a chave, ou o `raw` sem autor). São as `bib_refs` da linha no build. Num
 * item, os campos 7 e 8 são UMA entidade para o build (um `seen_unresolved` só em `_write_citations`): a linha «campo 7: X»
 * cobre também as citações do campo 8 com o rótulo X, e não há linha «campo 8: X». O aparato não dividido é outra.
 *
 * A linha sai da fila quando a camada liga TODAS as citações dela (`obraDaCitacao` não nula), como `_Queue.sem_as_ligadas` do
 * build. E uma citação que o pacote 10 traz ligada PELO USUÁRIO (`resolved_by 'user'`; o build tirou a linha dela) e que a
 * camada desfez (a obra excluída, a chave desligada; foco 3) VOLTA à fila: a linha é refeita com o texto que o build
 * escreveria (a da posição relatada com os autores relatados, `hypothesis_author` com `role 'reported'`).
 *
 * POR QUE PELO TEXTO: o pacote não grava o mapa linha → `bib_ref.id` que o build tem em memória (`_Queue.citacoes`). O
 * casamento pelo texto cobre as 428 linhas reais do IPIAO (revisão da Tarefa 11); gravar o mapa no pacote ficou para quando
 * o GGG entrar (decisão do controlador, fix round 1 da Tarefa 11). Até lá, uma mudança na redação do `detail` deixa a linha
 * sem citações: ela fica na fila, sem o detalhe de ligar.
 */
import type { CitacaoDoPacote, LinhaDaFila } from '../banco/consultas'
import { chaveDaCitacao } from '../bibliografia/chave'
import type { PedidoDeEvento } from '../usuario/armazem'
import type { Estado } from '../usuario/fusao'
import { alvoDaCitacao, excecaoViva, idDaOcorrencia, ligacaoDe, obraDaCitacao, pedidosDeLigar, resolvidaPeloProcessamento, type CitacaoDoLivro, type ObrasCriadas } from './ligacoes'

export const TIPO_DA_CITACAO = 'citacao_nao_resolvida'

/**
 * O lugar que o pipeline escreve na frente do texto de uma citação não resolvida (`detail`): «campo 7: …» (item),
 * «aparato não dividido: …» (item) e «posição relatada de <nomes>: …» (hipótese). O resto é a citação.
 */
const LUGAR_DA_CITACAO = /^(campo \d+|aparato não dividido|posição relatada de [^:]+): /u

/** Separa o lugar («campo 7») da citação. Sem prefixo, o lugar é null e a citação é o texto todo. */
export function separarLugarDaCitacao(detalhe: string): { lugar: string | null; citacao: string } {
  const m = LUGAR_DA_CITACAO.exec(detalhe)
  return m ? { lugar: m[1]!, citacao: detalhe.slice(m[0].length) } : { lugar: null, citacao: detalhe }
}

/** A citação do pacote como a camada a vê (`CitacaoDoLivro`): a sigla, o alvo da exceção, o `raw`, a curta e se o processamento a resolveu. */
export const citacaoDoLivro = (c: Pick<CitacaoDoPacote, 'sigla' | 'passagemId' | 'itemId' | 'bruto' | 'curta' | 'resolvida' | 'resolvidaPor'>): CitacaoDoLivro => ({
  sigla: c.sigla,
  alvo: alvoDaCitacao(c) ?? '',
  raw: c.bruto,
  curta: c.curta,
  resolvida: resolvidaPeloProcessamento(c),
})

/** A obra que o app mostra agora para a citação (a camada sobre o pacote), ou null: não resolvida. */
export const obraAgora = (estado: Estado, c: CitacaoDoPacote, criadas?: ObrasCriadas): string | null =>
  obraDaCitacao(estado, citacaoDoLivro(c), { obraId: c.obraId, resolvidaPor: c.resolvidaPor }, criadas)

/** O rótulo com que o build junta as citações de uma linha: a chave impressa (`short_cite`) ou, sem autor, o `raw`. */
const rotuloDoBuild = (c: CitacaoDoPacote): string => c.curta ?? c.bruto

/** O índice das citações para a fila: as de cada linha (pela posição em `linhas`) e as iguais de cada chave. */
export interface IndiceDasCitacoes {
  /** A posição da linha `citacao_nao_resolvida` em `linhas` → as citações dela (na ordem do pacote). */
  porLinha: Map<number, CitacaoDoPacote[]>
  /** A chave (`chaveDaCitacao`) → as citações com ela, de todas as publicações. */
  porChave: Map<string, CitacaoDoPacote[]>
  /**
   * As que o pacote traz ligadas pelo usuário (`resolved_by 'user'`) e que não estão numa linha do pacote: voltam à fila, numa
   * linha refeita, se a camada as desfaz.
   */
  doUsuario: CitacaoDoPacote[]
}

const porEntidade = (lista: readonly CitacaoDoPacote[], campo: 'passagemId' | 'hipoteseId' | 'itemId') => {
  const m = new Map<string, CitacaoDoPacote[]>()
  for (const c of lista) {
    const id = c[campo]
    if (id === null) continue
    if (campo === 'itemId' && (c.passagemId !== null || c.hipoteseId !== null)) continue
    const l = m.get(id)
    if (l) l.push(c)
    else m.set(id, [c])
  }
  return m
}

/** A primeira citação de uma linha: a de `raw` que começa o texto dela (o mais longo, se dois começam), na ordem do pacote. */
function primeiraDaLinha(citacao: string, candidatas: readonly CitacaoDoPacote[]): CitacaoDoPacote | null {
  let achada: CitacaoDoPacote | null = null
  for (const c of candidatas) {
    if (!c.bruto) continue
    const resto = citacao.startsWith(c.bruto) ? citacao.slice(c.bruto.length) : null
    if (resto === null || !(resto === '' || /^[;:]/.test(resto))) continue
    if (!achada || c.bruto.length > achada.bruto.length) achada = c
  }
  return achada
}

/** A classe do campo de uma citação de item, como o build junta: os campos 7 e 8 numa linha, o aparato não dividido em outra. */
const classeDoCampo = (c: Pick<CitacaoDoPacote, 'categoria'>): 'campos' | 'aparato' => (c.categoria === null ? 'aparato' : 'campos')

/** As citações de uma linha `citacao_nao_resolvida` (vazio quando o pacote não as tem, como num pacote de antes). */
export function citacoesDaLinha(
  l: Pick<LinhaDaFila, 'entidade' | 'entidadeId' | 'detalhe'>,
  ind: { passagens: Map<string, CitacaoDoPacote[]>; hipoteses: Map<string, CitacaoDoPacote[]>; itens: Map<string, CitacaoDoPacote[]> },
): CitacaoDoPacote[] {
  if (!l.entidadeId) return []
  const { lugar, citacao } = separarLugarDaCitacao(l.detalhe)
  let candidatas: CitacaoDoPacote[]
  if (l.entidade === 'passage') candidatas = ind.passagens.get(l.entidadeId) ?? []
  else if (l.entidade === 'hypothesis') candidatas = ind.hipoteses.get(l.entidadeId) ?? []
  else if (l.entidade === 'item') {
    // «campo N»: os campos 7 e 8 juntos (como o build); «aparato não dividido»: a categoria NULL
    const classe = lugar && /^campo \d+$/.test(lugar) ? 'campos' : lugar === 'aparato não dividido' ? 'aparato' : null
    candidatas = (ind.itens.get(l.entidadeId) ?? []).filter((c) => classe === null || classeDoCampo(c) === classe)
  } else return []
  // as ligadas pelo usuário no pacote 10 também são da linha (o build a escreveu antes de ligá-las)
  candidatas = candidatas.filter((c) => !resolvidaPeloProcessamento(c))
  const primeira = primeiraDaLinha(citacao, candidatas)
  if (!primeira) return []
  const rotulo = rotuloDoBuild(primeira)
  return candidatas.filter((c) => rotuloDoBuild(c) === rotulo)
}

const indices = new WeakMap<readonly LinhaDaFila[], WeakMap<readonly CitacaoDoPacote[], IndiceDasCitacoes>>()

/** O índice das citações das linhas (feito uma vez por par de listas: as duas só mudam com o pacote). */
export function indiceDasCitacoes(linhas: readonly LinhaDaFila[], citacoes: readonly CitacaoDoPacote[]): IndiceDasCitacoes {
  let porCitacoes = indices.get(linhas)
  if (!porCitacoes) indices.set(linhas, (porCitacoes = new WeakMap()))
  const guardado = porCitacoes.get(citacoes)
  if (guardado) return guardado
  const ind = { passagens: porEntidade(citacoes, 'passagemId'), hipoteses: porEntidade(citacoes, 'hipoteseId'), itens: porEntidade(citacoes, 'itemId') }
  const porLinha = new Map<number, CitacaoDoPacote[]>()
  linhas.forEach((l, i) => {
    if (l.tipo !== TIPO_DA_CITACAO) return
    const daLinha = citacoesDaLinha(l, ind)
    if (daLinha.length > 0) porLinha.set(i, daLinha)
  })
  const porChave = new Map<string, CitacaoDoPacote[]>()
  for (const c of citacoes) {
    const chave = chaveDaCitacao(c.curta)
    if (chave === null) continue
    const l = porChave.get(chave)
    if (l) l.push(c)
    else porChave.set(chave, [c])
  }
  // as ligadas pelo usuário que já são de uma linha do pacote não precisam de linha refeita
  const naFila = new Set([...porLinha.values()].flat())
  const saida: IndiceDasCitacoes = { porLinha, porChave, doUsuario: citacoes.filter((c) => c.resolvidaPor === 'user' && !naFila.has(c)) }
  porCitacoes.set(citacoes, saida)
  return saida
}

/**
 * As linhas que o build escreveria para as citações ligadas pelo usuário no pacote que a camada desfez (foco 3): uma por
 * entidade e rótulo, como o build, na ordem do pacote. Cada uma com as suas citações.
 */
export function linhasDesfeitas(estado: Estado, doUsuario: readonly CitacaoDoPacote[], criadas?: ObrasCriadas): { linha: LinhaDaFila; citacoes: CitacaoDoPacote[] }[] {
  const saida = new Map<string, { linha: LinhaDaFila; citacoes: CitacaoDoPacote[] }>()
  for (const c of doUsuario) {
    if (obraAgora(estado, c, criadas) !== null) continue
    const semAutor = c.curta === null ? '; sem autor na citação' : ''
    const linha: LinhaDaFila | null = c.passagemId
      ? { tipo: TIPO_DA_CITACAO, entidade: 'passage', entidadeId: c.passagemId, detalhe: `${c.bruto}${semAutor}`, numero: null }
      : c.hipoteseId
        ? {
            tipo: TIPO_DA_CITACAO,
            entidade: 'hypothesis',
            entidadeId: c.hipoteseId,
            detalhe: c.relatadoPor && c.relatadoPor.length > 0 ? `posição relatada de ${c.relatadoPor.join('; ')}: ${c.bruto}` : c.bruto,
            numero: null,
          }
        : c.itemId
          ? { tipo: TIPO_DA_CITACAO, entidade: 'item', entidadeId: c.itemId, detalhe: `${c.categoria === null ? 'aparato não dividido' : `campo ${c.categoria}`}: ${c.bruto}${semAutor}`, numero: null }
          : null
    if (!linha) continue
    // a mesma entidade do build: no item, os campos 7 e 8 juntos (a linha diz o campo da primeira, na ordem do pacote)
    const k = `${c.sigla}|${linha.entidade}|${linha.entidadeId}|${linha.entidade === 'item' ? classeDoCampo(c) : ''}|${rotuloDoBuild(c)}`
    const ja = saida.get(k)
    if (ja) ja.citacoes.push(c)
    else saida.set(k, { linha, citacoes: [c] })
  }
  return [...saida.values()]
}

/** O que um «Ligar» do caso grava e alcança. */
export interface AlvoDaLigacao {
  /** O id do registro `citacao`: a chave, ou a ocorrência (a citação sem autor). */
  id: string
  porChave: boolean
  /** A citação como o botão a mostra: a curta impressa («Inventado 2001»), ou o `raw` da sem autor («1999: 12»). */
  rotulo: string
  /** Quantas citações o «Ligar» liga: as iguais (a mesma chave, em todas as publicações), ou 1. */
  iguais: number
}

/**
 * O alvo do «Ligar» de um caso: a chave da citação (todas as iguais não resolvidas pelo processamento, menos as que têm uma
 * exceção de ocorrência viva, que a vence), ou, sem autor, a ocorrência (só ela). Null: a citação sem autor e sem trecho
 * nem item não tem exceção possível (no build, um alvo None nunca casa).
 */
export function alvoDaLigacao(estado: Estado, citacoes: readonly CitacaoDoPacote[], porChave: ReadonlyMap<string, readonly CitacaoDoPacote[]>): AlvoDaLigacao | null {
  const c = citacoes[0]
  if (!c) return null
  const chave = chaveDaCitacao(c.curta)
  if (chave !== null) {
    const doCaso = new Set(citacoes)
    const iguais = (porChave.get(chave) ?? citacoes).filter((x) => doCaso.has(x) || (!resolvidaPeloProcessamento(x) && excecaoViva(estado, citacaoDoLivro(x)) === null))
    return { id: chave, porChave: true, rotulo: c.curta!.trim(), iguais: Math.max(iguais.length, citacoes.length) }
  }
  const doLivro = citacaoDoLivro(c)
  if (doLivro.alvo === '') return null
  return { id: idDaOcorrencia(doLivro), porChave: false, rotulo: c.bruto, iguais: 1 }
}

/** «Ligar as 3 citações “Inventado 2001”» / «Ligar a citação “1999: 12”» (a copy fixa do plano). */
export const rotuloDeLigar = (a: Pick<AlvoDaLigacao, 'iguais' | 'rotulo'>): string =>
  a.iguais === 1 ? `Ligar a citação “${a.rotulo}”` : `Ligar as ${a.iguais} citações “${a.rotulo}”`

/** O estado de um registro `citacao` antes de um «Ligar», para o «Desfazer» (U) o devolver como era. */
export interface Antes {
  reg: string
  existia: boolean
  excluido: boolean
  obra: unknown
}

/**
 * Os eventos de um «Ligar» do caso e o que eles mudam (para desfazer). Pela chave, as exceções vivas das citações DO CASO
 * (a pessoa as desligou no objeto) saem junto: senão venceriam a chave, e o caso ficaria na fila.
 */
export function pedidosDeLigarOCaso(estado: Estado, citacoes: readonly CitacaoDoPacote[], alvo: AlvoDaLigacao, obra: string): { pedidos: PedidoDeEvento[]; antes: Antes[] } {
  const pedidos = pedidosDeLigar(alvo.id, obra, estado)
  const regs = [alvo.id]
  if (alvo.porChave) {
    for (const c of citacoes) {
      const ex = excecaoViva(estado, citacaoDoLivro(c))
      if (ex && !regs.includes(ex)) {
        regs.push(ex)
        pedidos.push({ tipo: 'citacao', reg: ex, op: 'excluir', campos: {} })
      }
    }
  }
  return { pedidos, antes: regs.map((reg) => fotografia(estado, reg)) }
}

/** Como o registro `citacao` está agora. */
export function fotografia(estado: Estado, reg: string): Antes {
  const r = estado.registro('citacao', reg)
  return { reg, existia: !!r, excluido: !!r?.excluido, obra: r ? (r.campos.obra ?? null) : null }
}

/** Os eventos que devolvem os registros `citacao` ao que eram (`Antes`): o «Desfazer» de um «Ligar» ou de um «Desligar». */
export function pedidosDeVoltar(estado: Estado, antes: readonly Antes[]): PedidoDeEvento[] {
  const pedidos: PedidoDeEvento[] = []
  for (const a of antes) {
    const r = estado.registro('citacao', a.reg)
    if (!r) continue
    if (!a.existia) {
      if (!r.excluido) pedidos.push({ tipo: 'citacao', reg: a.reg, op: 'excluir', campos: {} })
      continue
    }
    if ((r.campos.obra ?? null) !== a.obra) pedidos.push({ tipo: 'citacao', reg: a.reg, op: 'alterar', campos: { obra: a.obra as string | null } })
    if (a.excluido && !r.excluido) pedidos.push({ tipo: 'citacao', reg: a.reg, op: 'excluir', campos: {} })
    if (!a.excluido && r.excluido) pedidos.push({ tipo: 'citacao', reg: a.reg, op: 'restaurar', campos: {} })
  }
  return pedidos
}

/** A ligação que a camada faz de uma citação ligada (a do caso), para o detalhe: o registro que decide e se é pela chave. */
export function ligacaoDaCitacao(estado: Estado, c: CitacaoDoPacote, criadas?: ObrasCriadas) {
  return ligacaoDe(estado, citacaoDoLivro(c), criadas)
}

/** A citação sem autor: o ano dela («1999: 12» → «1999»), para procurar as obras desse ano. */
export const anoDaCitacao = (texto: string): string | null => /\b(1[5-9]\d\d|20\d\d)/.exec(texto)?.[1] ?? null
