/**
 * A fila de revisão de AGORA: a fila do pacote (`review_queue`), mais os objetos SKC com sítio solto ou sem número, mais os
 * verbetes ainda "a revisar", MENOS o que a pessoa resolveu (ligando o sítio de um objeto, dando o período a um rascunho,
 * aprovando um verbete ou marcando o caso como resolvido). Pura sobre o `Estado`: a Revisão, o Menu e o ponto da barra usam
 * esta mesma função (`total`), então os três concordam o tempo todo.
 *
 * Decisões (Tarefa 13):
 * - Os "sítios não resolvidos" seguem src/sitios/doUsuario.ts: um objeto cujo sítio ainda não chegou a este aparelho
 *   («ainda não sincronizado») NÃO conta, porque não é problema da pessoa e se acerta sozinho na sincronização; só a
 *   exclusão (`excluir` sem `restaurar` depois) faz o objeto voltar a contar.
 * - Corrigir um sítio do livro ("Corrigir" no sítio) NÃO resolve linhas da fila: no pacote real as linhas de sítio
 *   (`sitio_nao_resolvido`, e `sitio_nao_normalizado` quando a quadrícula não é reconhecida) apontam para um ITEM cujo campo 3 o
 *   processamento não ligou a um sítio, e esse item não tem registro de sítio a corrigir (há só um candidato no detalhe). Só
 *   ligá-lo a um sítio (ou deixar como está) o tira da fila. Veja o relatório da Tarefa 13.
 * - «Deixar como está» não existe para o rascunho sem número: o objeto continuaria sem número, e o que o resolve é dar o período.
 * - "a revisar" no glossário é o estado derivado (`situacaoDoVerbete`), nunca o `status` cru; é um grupo só de contagem, que
 *   leva ao Glossário filtrado (Revisao.dc.html), e aprovar um verbete o desconta.
 * - «Regiões a desenhar»: os elementos do livro sem região no pacote (`element` sem `element_region`). Contam no total. Saem sozinhos
 *   quando há uma região viva do usuário para o elemento (`regiao` com `elementoId` = o `EL-…`); excluir essa região os
 *   reabre. «Deixar como está» também vale, e «Desfazer».
 * - «Traduções não revisadas»: as traduções de máquina (`translation_state = 'machine'`) de trechos e campos do catálogo. Só LISTA
 *   (`soConsulta`): não entra no total, no Menu nem no ponto da barra, e não tem «Deixar como está» (o app da 2B não tem uma
 *   ação «li e aprovo esta tradução»).
 * - Um caso resolvido pela pessoa sai da contagem mas continua listado no grupo, em "Resolvidos por você", com "Desfazer".
 * - Parte 2C, bloco 2 (Tarefa 15): os pares de sítios que podem ser o mesmo (src/revisao/pares.ts) não são linhas da fila: a
 *   página os mostra num grupo próprio, e quem monta a fila dá quantos estão abertos (`paresAbertos`), que somam no total.
 */
import type { ElementoSemRegiao, LinhaDaFila, LugarDoCaso, TraducaoNaoRevisada } from '../banco/consultas'
import { lerRegiao, RE_ELEMENTO_DO_LIVRO } from '../hipoteses/modelo'
import { rotuloDaPendencia } from './rotulos'
import { situacaoDoVerbete } from '../glossario/modelo'
import { edicoesDosVerbetes, verbetesSkc } from '../glossario/doUsuario'
import type { Redirecionamentos } from '../pacote/redirecionamentos'
import { lerObjeto, tituloDe } from '../objetos-skc/modelo'
import type { Numeracao } from '../objetos-skc/numeracao'
import { ROTULO_DOS_SITIOS, ehMotivoDeSitio } from '../sitios/pendencias'
import { sitiosNaoResolvidos, type LinhaDeSitioNaoResolvido } from '../sitios/doUsuario'
import { resolverSitios, type PacoteDeSitios } from '../sitios/resolucao'
import { destinosDosSitios } from '../sitios/useResolucao'
import type { Estado } from '../usuario/estado'
import { chaveDoElementoSemRegiao, chaveDoRascunho, chaveDoSitioSolto, chavesDosCasos } from './chave'

/** Para onde uma ação leva: um caminho do app (com `?corrigir=` quando a tela de destino deve abrir já no que falta). */
export interface Destino {
  rotulo: string
  para: string
}

export interface Caso {
  /** O `reg` do registro `revisao`. */
  chave: string
  /** O motivo (do pacote) ou `sitio-skc` / `rascunho`. */
  tipo: string
  /** A coluna da esquerda: o número do objeto (ou "—"). */
  numero: string
  /** O que falta. */
  o_que: string
  /** Onde: a referência na fonte e o tipo do trecho. */
  onde: string
  /** O número leva ao objeto (ou ao grupo), quando há. */
  abrir: string | null
  /** A ação do tipo: o lugar certo para resolver. */
  acao: Destino | null
  /** Pode ser deixado como está (marcado como resolvido)? O rascunho sem número, não. */
  deixavel: boolean
}

/** Dois casos iguais em tudo o que a linha mostra? (Cada `montarFila` cria casos novos; a linha só se refaz quando algo mudou.) */
export function casosIguais(a: Caso, b: Caso): boolean {
  return (
    a === b ||
    (a.chave === b.chave &&
      a.tipo === b.tipo &&
      a.numero === b.numero &&
      a.o_que === b.o_que &&
      a.onde === b.onde &&
      a.abrir === b.abrir &&
      a.deixavel === b.deixavel &&
      a.acao?.rotulo === b.acao?.rotulo &&
      a.acao?.para === b.acao?.para)
  )
}

export interface GrupoDaFila {
  id: string
  rotulo: string
  apoio: string
  /** Casos em aberto (a contagem do grupo). */
  quantidade: number
  abertos: Caso[]
  /** Os que a pessoa marcou como resolvidos (com "Desfazer"). */
  resolvidos: Caso[]
  /** Grupo só de contagem que leva a outra tela (os verbetes a revisar). */
  link: Destino | null
  /** Grupo só para consulta: aparece com a sua contagem, mas NÃO entra no total, no Menu nem no ponto da barra. */
  soConsulta: boolean
}

export interface Fila {
  total: number
  grupos: GrupoDaFila[]
  /** Quantos casos a pessoa marcou como resolvidos (em todos os grupos). */
  resolvidosPelaPessoa: number
  /** Quantos objetos do livro a pessoa resolveu ligando o sítio (já descontados). */
  sitiosLigados: number
  /** Os pares de sítios que podem ser o mesmo ainda abertos (já somados no `total`). */
  paresAbertos: number
}

export interface EntradaDaFila {
  /** As linhas da fila do pacote (`linhasDaFila`). */
  linhas: readonly LinhaDaFila[]
  /** Onde cada caso está (`lugaresDosCasos`); null enquanto não chegou (os casos saem sem a referência). */
  lugares: ReadonlyMap<string, LugarDoCaso> | null
  /** Os verbetes do pacote a revisar (`verbetesAReverNoPacote`). */
  verbetesDoPacote: readonly { id: string; original: string }[]
  /** Os elementos do livro sem região (`elementosSemRegiaoNoPacote`). */
  elementos?: readonly ElementoSemRegiao[]
  /** As traduções de máquina não revisadas (`traducoesNaoRevisadasNoPacote`); só a Revisão as carrega. */
  traducoes?: readonly TraducaoNaoRevisada[]
  numeracao: Pick<Numeracao, 'porId' | 'rascunhos'>
  estado: Estado
  /**
   * Os redirecionamentos do pacote (Tarefa 16): o verbete do usuário publicado não conta como "a revisar" do usuário, e um
   * sítio do usuário publicado é o do livro (nunca "excluído" nem com o nome de antes nos sítios não resolvidos).
   */
  redirecionamentos?: Redirecionamentos | null
  /**
   * Parte 2C, bloco 2: o pacote dos sítios (`pacoteDeSitios`), para a resolução. Nos «sítios não resolvidos», um sítio mesclado
   * vale pelo destino (o nome dele; um objeto ligado a um sítio absorvido não fica sem sítio).
   */
  pacoteDeSitios?: PacoteDeSitios | null
  /** Tarefa 15: quantos pares de sítios que podem ser o mesmo estão abertos (`paresDaRevisao(…).abertos`); somam no total. */
  paresAbertos?: number
}

export const ROTULO_DOS_RASCUNHOS = 'Objetos sem número'
export const ROTULO_DAS_REGIOES = 'Regiões a desenhar'
export const ROTULO_DAS_TRADUCOES = 'Traduções não revisadas'
const APOIO: Record<string, string> = {
  [ROTULO_DAS_REGIOES]: 'partes do desenho do livro sem região: desenhe a região na imagem',
  [ROTULO_DAS_TRADUCOES]: 'traduções automáticas ainda sem revisão · só para consulta, não entram no total',
  'Tabelas na introdução': 'tabela impressa na introdução que o processamento não leu como texto',
  'Traduções fora do escopo': 'trecho do aparato que ficou sem tradução, por estar fora do que se traduz',
  'Traduções com exceção de preservação': 'tradução que manteve termos do original de propósito; confira se está certo',
  'Obras de capítulo não encontradas': 'a obra em que o capítulo foi publicado não está na bibliografia',
  'Entradas bibliográficas ilegíveis': 'entrada da bibliografia que o processamento não conseguiu ler',
  'Citações não resolvidas': 'a obra citada não foi achada na bibliografia',
  'Traduções com termo alterado': 'a tradução usa um verbete cuja forma mudou',
  'Traduções desatualizadas': 'o texto mudou depois da tradução',
  'Aparato do catálogo a conferir': 'divisão dos campos 3–8 incerta',
  'Medidas não organizadas': 'dimensões que ficaram só como impressas',
  'Datações não organizadas': 'datação sem anos explícitos ou sem rótulo',
  [ROTULO_DOS_SITIOS]: 'objetos cujo sítio não está ligado a um sítio do banco',
  'Créditos de desenho ausentes': 'imagem sem crédito',
}
export const ROTULO_DOS_VERBETES = 'Verbetes a revisar'

const REVISAR_VERBETES: Destino = { rotulo: 'Abrir o Glossário', para: '/glossario?revisar=1' }
const MAX_TEXTO = 200

const enc = encodeURIComponent
const paraObjeto = (numero: string) => `/item/${enc(numero)}`

/** Um id de grupo estável para o endereço: o rótulo sem acentos, em minúsculas e com hífens. */
export function idDoGrupo(rotulo: string): string {
  return rotulo
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const ROTULO_DA_ENTIDADE: Record<string, string> = {
  passage: 'trecho',
  image: 'imagem',
  bib_ref: 'citação',
  bib_entry: 'obra',
  item: 'catálogo',
  catalog_field: 'catálogo',
  hypothesis: 'hipótese',
  glossary: 'glossário',
  glossary_entry: 'glossário',
}

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

/**
 * O primeiro sobrenome de uma citação curta («campo 7: Amostra/Fulano [ed.] 1999» → «Amostra»): o que procurar na
 * bibliografia. Vem depois do lugar, é o primeiro nome com maiúscula (e ao menos duas letras) e tem de vir antes de qualquer
 * número: «12: 5a; ver adiante» não tem autor.
 */
export function autorDaCitacao(detalhe: string): string | null {
  const { citacao } = separarLugarDaCitacao(detalhe)
  const m = /^[^\p{L}\p{N}]*(?:\p{Ll}[\p{L}.'’-]*[^\p{L}\p{N}]+)*(\p{Lu}[\p{L}'’-]+)/u.exec(citacao)
  return m ? m[1]! : null
}

function acaoDoCaso(l: LinhaDaFila, abrir: string | null, grupoLugar: string | null): Destino | null {
  const objeto = abrir
  if (l.tipo === 'citacao_nao_resolvida') {
    const autor = autorDaCitacao(l.detalhe)
    return { rotulo: 'Resolver na bibliografia', para: autor ? `/bibliografia?filtro=${enc(autor)}` : '/bibliografia' }
  }
  if (l.tipo === 'traducao_termo_alterado') {
    const gl = /GL-\d+/.exec(l.detalhe)?.[0]
    if (gl) return { rotulo: 'Abrir o verbete', para: `/verbete/${enc(gl)}` }
  }
  if (ehMotivoDeSitio(l.tipo) && objeto) return { rotulo: 'Escolher o sítio', para: `${objeto}?corrigir=sitio` }
  if ((l.entidade === 'glossary_entry' || l.entidade === 'glossary') && l.entidadeId) return { rotulo: 'Abrir o verbete', para: `/verbete/${enc(l.entidadeId)}` }
  if (l.entidade === 'bib_entry' && l.entidadeId && /^BIB-\d+$/.test(l.entidadeId)) return { rotulo: 'Abrir a obra', para: `/obra/${enc(l.entidadeId)}` }
  if (objeto) return { rotulo: 'Abrir o objeto', para: objeto }
  if (grupoLugar) return { rotulo: 'Abrir o grupo', para: grupoLugar }
  return null
}

function casoDaLinha(l: LinhaDaFila, chave: string, lugares: ReadonlyMap<string, LugarDoCaso> | null): Caso {
  const lugar = l.entidadeId ? lugares?.get(`${l.entidade}|${l.entidadeId}`) : undefined
  const numero = l.numero ?? lugar?.numero ?? null
  const objeto = numero ? paraObjeto(numero) : null
  const grupo = lugar?.grupoId ? `/grupo/${enc(lugar.grupoId)}` : null
  const tipoDoLugar = ROTULO_DA_ENTIDADE[l.entidade] ?? l.entidade
  // Numa citação o pipeline escreve o lugar na frente («campo 7: …»): ele vai para «onde», e «o que» fica só com a citação.
  const { lugar: naFonte, citacao } = l.tipo === 'citacao_nao_resolvida' ? separarLugarDaCitacao(l.detalhe) : { lugar: null, citacao: l.detalhe }
  // Trecho de seção da introdução sem lugar resolvido: o mesmo rótulo legível das traduções (B-23), não o id cru.
  const introducao = !lugar && l.entidade === 'passage' && l.entidadeId ? lugarDoTrechoDeIntroducao(l.entidadeId) : null
  const onde = lugar ? `${lugar.origem} · ${naFonte ?? tipoDoLugar}` : introducao ? `${introducao} · ${naFonte ?? tipoDoLugar}` : l.entidadeId ? `${tipoDoLugar} ${l.entidadeId}${naFonte ? ` · ${naFonte}` : ''}` : (naFonte ?? tipoDoLugar)
  const texto = citacao.trim() || rotuloDaPendencia(l.tipo)
  return {
    chave,
    tipo: l.tipo,
    numero: numero ?? '—',
    o_que: texto.length > MAX_TEXTO ? `${texto.slice(0, MAX_TEXTO - 1)}…` : texto,
    onde,
    abrir: objeto ?? grupo,
    acao: acaoDoCaso(l, objeto, grupo),
    deixavel: true,
  }
}

/** Os elementos do livro com uma região VIVA do usuário (o `elementoId` da região é o `EL-…`): esses já foram desenhados. */
export function elementosComRegiaoViva(estado: Estado): Set<string> {
  const saida = new Set<string>()
  for (const r of estado.registros.get('regiao')?.values() ?? []) {
    if (r.excluido) continue
    const alvo = lerRegiao(r).elementoId // o leitor único de região (T17-B-25)
    if (typeof alvo === 'string' && RE_ELEMENTO_DO_LIVRO.test(alvo)) saida.add(alvo)
  }
  return saida
}

/**
 * Os casos que não dependem do estado do usuário (só do pacote e dos lugares) são feitos uma vez por lista: a fila se refaz a cada
 * evento, e com 767 elementos e 1.348 traduções isso seria refazer milhares de objetos à toa. Um cache de uma entrada por tipo.
 */
const ENTRADAS_DO_CACHE = 2 // a barra e a página (Mac) alternam: uma entrada só seria refeita a cada troca (T17-B-24)
function lembrar<T>(cache: T[], entrada: T): void {
  cache.unshift(entrada)
  cache.length = Math.min(cache.length, ENTRADAS_DO_CACHE)
}
const cacheDosElementos: { elementos: readonly ElementoSemRegiao[]; lugares: ReadonlyMap<string, LugarDoCaso> | null; casos: Map<string, Caso> }[] = []
function casosDosElementos(elementos: readonly ElementoSemRegiao[], lugares: ReadonlyMap<string, LugarDoCaso> | null): Map<string, Caso> {
  const guardado = cacheDosElementos.find((c) => c.elementos === elementos && c.lugares === lugares)
  if (guardado) return guardado.casos
  const casos = new Map<string, Caso>()
  for (const e of elementos) {
    const lugar = lugares?.get(`item|${e.itemId}`)
    const objeto = lugar?.numero ? paraObjeto(lugar.numero) : null
    casos.set(e.id, {
      chave: chaveDoElementoSemRegiao(e.id),
      tipo: 'regiao_a_desenhar',
      numero: lugar?.numero ?? '—',
      o_que: e.rotuloDe && e.rotuloDe !== e.rotulo ? `${e.rotulo} (${e.rotuloDe})` : e.rotulo,
      onde: `${lugar?.origem ?? e.itemId} · elemento`,
      abrir: objeto,
      acao: e.imagem ? { rotulo: 'Desenhar a região', para: `/imagem/${enc(e.imagem)}?desenhar=${enc(e.id)}` } : objeto ? { rotulo: 'Abrir o objeto', para: objeto } : null,
      deixavel: true,
    })
  }
  lembrar(cacheDosElementos, { elementos, lugares, casos })
  return casos
}

/** «TESTE I · introdução, seção 19» para o id de um trecho de seção da introdução (`PA-<obra>-<volume>.S.<n>-ovw|txt|cap-<k>`); null se o id não é desse formato. */
export function lugarDoTrechoDeIntroducao(id: string): string | null {
  const m = /^PA-([A-Za-z0-9]+)-([A-Za-z0-9]+)\.S\.(\d+)-(?:ovw|txt|cap)-\d+$/.exec(id)
  return m ? `${m[1]} ${m[2]} · introdução, seção ${m[3]}` : null
}

const cacheDasTraducoes: { traducoes: readonly TraducaoNaoRevisada[]; lugares: ReadonlyMap<string, LugarDoCaso> | null; casos: Caso[] }[] = []
function casosDasTraducoes(traducoes: readonly TraducaoNaoRevisada[], lugares: ReadonlyMap<string, LugarDoCaso> | null): Caso[] {
  const guardado = cacheDasTraducoes.find((c) => c.traducoes === traducoes && c.lugares === lugares)
  if (guardado) return guardado.casos
  const casos = traducoes.map((t): Caso => {
    const lugar = lugares?.get(`${t.entidade}|${t.entidadeId}`)
    const objeto = lugar?.numero ? paraObjeto(lugar.numero) : null
    const grupo = lugar?.grupoId ? `/grupo/${enc(lugar.grupoId)}` : null
    const campo = t.entidade === 'catalog_field' ? /#(\d+)$/.exec(t.entidadeId)?.[1] : null
    const alvo = objeto ?? grupo
    return {
      chave: `traducao-nao-revisada~${t.entidade}~${t.entidadeId}`,
      tipo: 'traducao_nao_revisada',
      numero: lugar?.numero ?? '—',
      o_que: t.entidade === 'passage' ? 'Tradução do trecho' : `Tradução do campo ${campo ?? '?'} do catálogo`,
      onde: `${lugar?.origem ?? (t.entidade === 'passage' ? lugarDoTrechoDeIntroducao(t.entidadeId) : null) ?? t.entidadeId} · ${t.entidade === 'passage' ? 'trecho' : 'catálogo'}`,
      abrir: objeto ?? grupo,
      acao: alvo ? { rotulo: t.entidade === 'passage' ? 'Abrir o trecho' : 'Abrir o campo', para: alvo } : null,
      deixavel: false,
    }
  })
  lembrar(cacheDasTraducoes, { traducoes, lugares, casos })
  return casos
}

/**
 * Quantos verbetes estão "a revisar" de agora: os do pacote que continuam assim e os do usuário vivos (menos os que o pacote
 * publicou, `redirecionados`: esses contam como o verbete do livro, Tarefa 16).
 */
export function verbetesARever(estado: Estado, doPacote: readonly { id: string; original: string }[], redirecionados?: Redirecionamentos | null): number {
  const edicoes = edicoesDosVerbetes(estado)
  let n = 0
  for (const v of doPacote) if (situacaoDoVerbete(edicoes.get(v.id) ?? null, v.original, 'proposed').status === 'proposed') n++
  for (const v of verbetesSkc(estado, redirecionados)) if (!v.excluido && v.status === 'proposed') n++
  return n
}

/** As chaves dos casos que a pessoa marcou como resolvidos (o registro `revisao` existe e não foi excluído). */
export function chavesResolvidas(estado: Estado): Set<string> {
  const saida = new Set<string>()
  for (const r of estado.registros.get('revisao')?.values() ?? []) if (!r.excluido) saida.add(r.id)
  return saida
}

/** As chaves de uma lista de linhas, guardadas por lista: a fila se refaz a cada evento, e as linhas só mudam com o pacote. */
const chavesDe = new WeakMap<readonly LinhaDaFila[], string[]>()
function chavesDas(linhas: readonly LinhaDaFila[]): string[] {
  let c = chavesDe.get(linhas)
  if (!c) chavesDe.set(linhas, (c = chavesDosCasos(linhas)))
  return c
}

export function montarFila(entrada: EntradaDaFila): Fila {
  const { linhas, lugares, estado, numeracao } = entrada
  const resolvidas = chavesResolvidas(estado)
  const chaves = chavesDas(linhas)
  const grupos = new Map<string, GrupoDaFila>()
  const grupo = (rotulo: string, apoio = APOIO[rotulo] ?? ''): GrupoDaFila => {
    const id = idDoGrupo(rotulo)
    let g = grupos.get(id)
    if (!g) grupos.set(id, (g = { id, rotulo, apoio, quantidade: 0, abertos: [], resolvidos: [], link: null, soConsulta: false }))
    return g
  }
  const colocar = (g: GrupoDaFila, caso: Caso) => (resolvidas.has(caso.chave) ? g.resolvidos : g.abertos).push(caso)

  // Os "sítios não resolvidos" do pacote: as linhas que a pessoa não resolveu ligando o sítio do objeto.
  const linhasDeSitio: (LinhaDeSitioNaoResolvido & { i: number })[] = []
  linhas.forEach((l, i) => {
    if (ehMotivoDeSitio(l.tipo) && l.entidade === 'item' && l.entidadeId && l.numero) linhasDeSitio.push({ itemId: l.entidadeId, numero: l.numero, i })
  })
  const destinos = entrada.pacoteDeSitios ? destinosDosSitios(resolverSitios(estado, entrada.pacoteDeSitios), entrada.redirecionamentos) : entrada.redirecionamentos
  const sitios = sitiosNaoResolvidos(estado, linhasDeSitio, destinos)
  const sitioEmAberto = new Set(sitios.pacote.map((p) => (p as LinhaDeSitioNaoResolvido & { i: number }).i))
  const ehSitioDoItem = new Set(linhasDeSitio.map((p) => p.i))

  linhas.forEach((l, i) => {
    if (ehSitioDoItem.has(i) && !sitioEmAberto.has(i)) return // ligado pela pessoa
    colocar(grupo(rotuloDaPendencia(l.tipo)), casoDaLinha(l, chaves[i]!, lugares))
  })

  // Objetos SKC com o sítio solto (nome livre ou sítio excluído): no mesmo grupo dos sítios.
  for (const s of sitios.skc) {
    const r = estado.registro('objeto', s.id)
    if (!r) continue
    const chave = chaveDoSitioSolto(s.id, s.nome)
    colocar(grupo(ROTULO_DOS_SITIOS), {
      chave,
      tipo: 'sitio-skc',
      numero: numeracao.porId.get(s.id)?.numero ?? '—',
      o_que: `${tituloDe(lerObjeto(r))} — ${s.motivo === 'excluido' ? `o sítio «${s.nome}» foi excluído` : `«${s.nome}» ainda não é um sítio do banco`}`,
      onde: 'Objeto SKC',
      abrir: paraObjeto(s.id),
      acao: { rotulo: 'Escolher o sítio', para: `${paraObjeto(s.id)}?corrigir=sitio` },
      deixavel: true,
    })
  }

  // Objetos SKC salvos com "Ainda não sei": rascunhos sem número, até ganharem período.
  for (const id of numeracao.rascunhos) {
    const r = estado.registro('objeto', id)
    if (!r) continue
    // Rascunho nunca vai para «Resolvidos»: não há o que deixar como está, e uma marca antiga não o esconde.
    grupo(ROTULO_DOS_RASCUNHOS, 'salvos com «Ainda não sei»: ganham o número ao escolher o período').abertos.push({
      chave: chaveDoRascunho(id),
      tipo: 'rascunho',
      numero: '—',
      o_que: tituloDe(lerObjeto(r)),
      onde: 'Objeto SKC · sem período',
      abrir: paraObjeto(id),
      acao: { rotulo: 'Escolher o período', para: `${paraObjeto(id)}?corrigir=periodo` },
      deixavel: false,
    })
  }

  // Os elementos do livro sem região: contam até alguém desenhar uma região para eles.
  const elementos = entrada.elementos ?? []
  if (elementos.length > 0) {
    const desenhados = elementosComRegiaoViva(estado)
    const casos = casosDosElementos(elementos, lugares)
    for (const e of elementos) if (!desenhados.has(e.id)) colocar(grupo(ROTULO_DAS_REGIOES), casos.get(e.id)!)
  }

  for (const g of grupos.values()) g.quantidade = g.abertos.length

  // As traduções ainda de máquina: só para consulta, fora de todas as contas.
  const traducoes = entrada.traducoes ?? []
  if (traducoes.length > 0) {
    const g = grupo(ROTULO_DAS_TRADUCOES)
    g.soConsulta = true
    g.abertos = casosDasTraducoes(traducoes, lugares)
    g.quantidade = g.abertos.length
  }

  // Os verbetes a revisar: só a contagem; abre o Glossário filtrado.
  const verbetes = verbetesARever(estado, entrada.verbetesDoPacote, entrada.redirecionamentos)
  if (verbetes > 0) {
    const g = grupo(ROTULO_DOS_VERBETES, 'formas em português ainda só propostas · abre o Glossário filtrado')
    g.quantidade = verbetes
    g.link = REVISAR_VERBETES
  }

  const lista = [...grupos.values()].filter((g) => g.quantidade > 0 || g.resolvidos.length > 0)
  // Os grupos só de consulta vão por último, e só os outros somam no total.
  lista.sort((x, y) => Number(x.soConsulta) - Number(y.soConsulta) || y.quantidade - x.quantidade || x.rotulo.localeCompare(y.rotulo, 'pt'))
  const paresAbertos = entrada.paresAbertos ?? 0
  return {
    total: lista.reduce((soma, g) => soma + (g.soConsulta ? 0 : g.quantidade), 0) + paresAbertos,
    grupos: lista,
    resolvidosPelaPessoa: lista.reduce((soma, g) => soma + g.resolvidos.length, 0),
    sitiosLigados: sitios.resolvidasPeloUsuario,
    paresAbertos,
  }
}
