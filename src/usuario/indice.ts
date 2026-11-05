/**
 * O índice da camada do usuário na busca (Parte 2B, Tarefa 4).
 *
 * O que o usuário escreve (notas, objetos, coleções, sítios e hipóteses SKC) vira linhas de `doc` + FTS5 num
 * banco SQLite EM MEMÓRIA, separado do pacote, que mora no worker do banco (src/banco/nucleo.ts: `escreverUsuario`
 * e `consultarUsuario`). Tem o mesmo formato do índice do pacote (busca.doc: rowid, tipo, ref, publicacao, objeto,
 * rotulo) e o mesmo FTS5 (`unicode61 remove_diacritics 2`), e o texto entra pela mesma dobra
 * (`textoIndexado`, com a forma colada), então "mahtes" acha "Maḥteṣ". `buscar()` (src/busca/consulta.ts) consulta
 * os dois e junta.
 *
 * - Em memória: a verdade é o `Estado` (eventos no IndexedDB); o índice é refeito dele a cada abertura do app.
 * - `indexarUsuario(estado)` aplica a DIFERENÇA: (tipo, reg) + assinatura do conteúdo indexado contra o que já está.
 *   Registros excluídos não entram (e saem, se estavam); restaurar os traz de volta.
 * - O índice sobrevive à troca do pacote (`reabrirBanco`): é outro banco. Só se refaz por inteiro quando o motor
 *   mudou (worker que morreu, testes) ou a tabela de dobra do pacote é outra.
 * - `iniciarIndiceDoUsuario()` segue o estado (toda gravação e toda sincronização passam por `assinarEstado`) com
 *   uma passada por vez e no máximo uma a cada 300 ms. `buscar()` ainda confere antes de consultar
 *   (`garantirIndiceDoUsuario`), então nunca devolve um índice velho.
 */
import { aoReabrir, consultarUsuario, escreverUsuario, geracaoDoBanco, type Instrucao } from '../banco/cliente'
import { textoIndexado, tabelaDoPacote, type FoldTabela } from '../busca/fold'
import { lerColecao } from '../colecoes/modelo'
import { formasEmUso } from '../glossario/doUsuario'
import { formasDoPacote, nomeDoPacote, type FormasDoPacote } from '../glossario/formasDoPacote'
import { eVerbeteSkc, lerEdicaoDoVerbete, lerVerbeteSkc } from '../glossario/modelo'
import { versaoDosDonos } from '../hipoteses/donos'
import { lerAncora, objetoDaHipotese } from '../hipoteses/modelo'
import { numeracaoDe } from '../objetos-skc/atual'
import { assinarConfirmados } from '../objetos-skc/confirmados'
import { eObjetoSkc, lerFicha, textoDaOrigem, textoDasMedidas } from '../objetos-skc/modelo'
import { idDeObjetoSkc, lerNrSkc, RE_NUMERO_DIGITADO, type Numeracao } from '../objetos-skc/numeracao'
import { assinarNumerosDoPacote, numerosDoPacote } from '../objetos-skc/pacote'
import { eSitioSkc, lerDadosDoSitio } from '../sitios/modelo'
import { sitiosDoPacote, type SitiosDoPacote } from '../sitios/pacote'
import type { Campos, Json, Tipo } from './eventos'
import { assinarEstado, estadoAtual, type Estado } from './estado'
import type { Registro } from './fusao'

/** Valor de `doc.publicacao` e do filtro "Publicação" para tudo o que é do usuário. */
export const SIGLA_SKC = 'SKC'
export const ESPERA_DO_INDICE_MS = 300

/** Os escopos (além de "tudo") em que um registro do usuário também aparece. */
export type EscopoDoUsuario = 'termo' | 'local' | 'bibliografia' | 'colecao'

/** O que um registro põe no índice. */
export interface EntradaDoIndice {
  /** Como o acerto aparece numa lista. */
  rotulo: string
  /** O texto buscado (o rótulo já deve estar nele, se for para achá-lo). */
  texto: string
  /** O objeto (número, "CA00005") a que o registro pertence: o acerto conta como acerto desse objeto. */
  objeto?: string | null
  /** Vários objetos (coleção): a coleção em si é um acerto à parte, e o escopo "Coleção" traz estes objetos. */
  objetos?: readonly string[]
  /** O escopo (além de "tudo") do registro e dos objetos dele. */
  escopo?: EscopoDoUsuario
}

/**
 * O que a regra de um registro sabe além dele: o número de um objeto SKC pelo id (Tarefa 9: o número é calculado,
 * veja src/objetos-skc/numeracao.ts). Sem contexto (testes da regra), vale a testemunha `numero` do próprio registro.
 */
export interface ContextoDoIndice {
  numeroDe(id: string): string | null
  /** O SKC, Nr. (decisão 38) do objeto SKC pelo id. */
  nrSkcDe?(id: string): number | null
  /** O nome de agora de um verbete (Tarefa 11): a forma em uso, senão o nome do pacote; null se não há nenhum (o verbete não existe). */
  nomeDeAgoraDe?(id: string): string | null
  /** O nome de um sítio do livro, pelo id do pacote (Tarefa 12): o rótulo de uma correção que só mudou as grafias. */
  nomeDoSitio?(id: string): string | null
}

/** `null`: este registro não entra no índice. */
export type CampoIndexavel = (r: Registro, ctx?: ContextoDoIndice) => EntradaDoIndice | null

const contextoDe = (n: Numeracao, formas: ReadonlyMap<string, string>, pacote: FormasDoPacote, sitios: SitiosDoPacote): ContextoDoIndice => ({
  numeroDe: (id) => n.porId.get(id)?.numero ?? null,
  nrSkcDe: (id) => n.porId.get(id)?.nrSkc ?? null,
  nomeDeAgoraDe: (id) => formas.get(id) ?? nomeDoPacote(pacote.get(id)),
  nomeDoSitio: (id) => sitios.get(id)?.nome ?? null,
})

/** Um número de objeto, ou o id de um objeto SKC resolvido para o número dele. */
function objetoDe(v: unknown, ctx?: ContextoDoIndice): string | null {
  if (ctx && typeof v === 'string' && idDeObjetoSkc(v.trim())) return ctx.numeroDe(v.trim())
  return numeroDeObjeto(v)
}

// ---------------------------------------------------------------------------
// O que cada tipo indexa
// ---------------------------------------------------------------------------


/** O valor JSON como texto buscável: textos, números, listas e (um nível de) objetos. */
function comoTexto(v: Json | undefined): string {
  if (v == null || typeof v === 'boolean') return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) return v.map(comoTexto).filter(Boolean).join(' ')
  return Object.values(v).map(comoTexto).filter(Boolean).join(' ')
}

const texto = (campos: Readonly<Campos>, ...nomes: string[]): string =>
  nomes
    .map((n) => comoTexto(campos[n]))
    .filter((t) => t.trim() !== '')
    .join('\n')

/** `[[GL-900001|íbex]]` entra como "íbex"; `[[CA00001]]`, como "CA00001". */
function semLinks(t: string): string {
  return t.replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_, id: string, rotulo?: string) => rotulo ?? id)
}

/** O número de objeto ('CA00005') que um valor escreve, em maiúsculas; null se não for um. */
export function numeroDeObjeto(v: unknown): string | null {
  return typeof v === 'string' && RE_NUMERO_DIGITADO.test(v.trim()) ? v.trim().toUpperCase() : null
}

function primeiraLinha(t: string, maximo = 60): string {
  const linha = semLinks(t).replace(/\s+/g, ' ').trim()
  return linha.length > maximo ? `${linha.slice(0, maximo - 1).trimEnd()}…` : linha
}

const ESCOPO_DO_ALVO: Record<string, EscopoDoUsuario> = {
  verbete: 'termo',
  termo: 'termo',
  sitio: 'local',
  obra: 'bibliografia',
  grupo: 'colecao',
  colecao: 'colecao',
  // a nota de um item dentro de uma coleção (Tarefa 7): alvo `CO-…/CA00001`
  'colecao-item': 'colecao',
}

/**
 * O que cada tipo de registro indexa. Os nomes dos campos são os que as telas das Tarefas 6 a 12 gravam; cada
 * tarefa que mudar ou acrescentar um campo ajusta a regra do seu tipo AQUI (e o teste de `indice.test.ts`):
 *
 * - nota: `titulo`, `texto`; o alvo é `alvoTipo` ('objeto' | 'verbete' | 'obra' | 'sitio' | 'grupo' | 'colecao') e
 *   `alvo` (o id; para um objeto, o número). Um alvo com cara de número de objeto (CA00001) vale como objeto.
 * - objeto (Tarefa 9, formato em src/objetos-skc/modelo.ts): o número calculado (ctx), o SKC, Nr. (decisão 38) como
 *   `skc skcnr12` (veja `termoDoNrSkc`), `titulo`, `sitioNome`, `datacao`,
 *   `material`, medidas, `acervo`, `inventario`, a origem (obra, página, figura ou a nota do achado) e a `leitura`.
 *   Reservas de livro (`reserva`) não entram. Um id `OB-…` no alvo de uma nota, numa coleção ou numa hipótese vale
 *   pelo número do objeto.
 * - colecao: `nome`, `descricao` e um campo `i:<ref>` por membro (ver colecoes/modelo.ts).
 * - sitio (Tarefa 12, src/sitios/modelo.ts): `nome`, `variantes`, `regiao`, `pais`, `nota`. Um sítio NOVO (`SI-…`) sem nome não entra.
 *   A correção de um sítio do LIVRO (reg = o id do pacote) entra quando mudou nome, grafias, região ou nota (o rótulo é o nome
 *   corrigido, senão o do livro); `buscar()` e `sugerir()` a tratam como o sítio do livro, com os objetos dele.
 * - hipotese: `termos` (rótulos e/ou ids), `termosRotulos`, a forma em uso de cada termo de agora (Tarefa 11: a forma
 *   nova e o rótulo guardado, de antes, acham a hipótese), `justificativa`, `objeto` (ou `alvo`) com o número do alvo.
 * - verbete do USUÁRIO (`GL-<aparelho>-<n>`, decisão 41; src/glossario/modelo.ts): `forma` e `formaEmUso`, escopo Termo;
 *   o rótulo é a forma em uso.
 * - verbete do PACOTE (`GL-` + dígitos; Tarefa 11): só se tem `formaEmUso`; a forma em uso é o rótulo e o texto, no
 *   escopo Termo. A forma do pacote já está no índice do pacote, então as duas acham o verbete; `buscar()` e `sugerir()`
 *   tratam esse acerto como o verbete do livro (com os objetos dele), não como um acerto "na sua camada".
 *
 * Fora da Tarefa 4 (null): regiao, posicao, item-sitio, revisao,
 * imagem (a Tarefa 8 indexa a legenda), ligacao, comparar.
 */
export const camposIndexaveis: Record<Tipo, CampoIndexavel> = {
  nota: (r, ctx) => {
    const c = r.campos
    const corpo = semLinks(texto(c, 'titulo', 'texto'))
    if (corpo.trim() === '') return null
    const alvoTipo = typeof c.alvoTipo === 'string' ? c.alvoTipo : null
    const objeto = alvoTipo === 'objeto' || alvoTipo === null ? objetoDe(c.alvo, ctx) ?? objetoDe(c.objeto, ctx) : null
    const titulo = typeof c.titulo === 'string' ? c.titulo.trim() : ''
    return {
      rotulo: titulo !== '' ? titulo : primeiraLinha(comoTexto(c.texto)),
      texto: corpo,
      objeto,
      escopo: objeto ? undefined : alvoTipo ? ESCOPO_DO_ALVO[alvoTipo] : undefined,
    }
  },

  objeto: (r, ctx) => {
    if (!eObjetoSkc(r)) return null
    const c = r.campos
    const f = lerFicha(c)
    const numero = ctx ? ctx.numeroDe(r.id) : numeroDeObjeto(c.numero)
    const nrSkc = ctx ? (ctx.nrSkcDe?.(r.id) ?? null) : lerNrSkc(c.nrSkc)
    const partes = [numero ?? '', nrSkc !== null && numero ? termoDoNrSkc(nrSkc) : '', f.titulo, f.sitioNome, f.datacao, f.material, textoDasMedidas(f), f.acervo, f.inventario, f.origemTipo === 'achado' ? f.achado : textoDaOrigem(f), f.leitura]
    const corpo = semLinks(partes.filter((p) => p.trim() !== '').join('\n'))
    if (corpo.trim() === '') return null
    const titulo = f.titulo.trim()
    return { rotulo: numero ?? (titulo !== '' ? titulo : 'Objeto sem número'), texto: corpo, objeto: numero }
  },

  colecao: (r, ctx) => {
    const c = r.campos
    const nome = typeof c.nome === 'string' ? c.nome.trim() : ''
    if (nome === '') return null
    // Os membros pela ordem da coleção (Tarefa 7: dois campos por membro, `m:<ref>` a presença e `i:<ref>` a ordem; é membro
    // quem tem `m:` true e `i:` válido). O id de um objeto SKC (`OB-…`) vale pelo número dele (Tarefa 9).
    const membros = lerColecao(r).membros.map((m) => objetoDe(m.ref, ctx)).filter((n): n is string => n !== null)
    return { rotulo: nome, texto: semLinks(texto(c, 'nome', 'descricao')), objetos: membros, escopo: 'colecao' }
  },

  sitio: (r, ctx) => {
    const c = r.campos
    const d = lerDadosDoSitio(r)
    const corpo = semLinks(texto(c, 'nome', 'variantes', 'regiao', 'pais', 'nota'))
    if (eSitioSkc(r.id)) {
      if (d.nome === null) return null
      return { rotulo: d.nome, texto: corpo, escopo: 'local' }
    }
    // A correção de um sítio do LIVRO: o nome corrigido, as grafias a mais, a região e a nota acham o sítio (e os objetos
    // dele, `buscar()`). Só a coordenada mudou? Nada a achar. O nome do livro já está no índice do pacote.
    if (corpo.trim() === '') return null
    return { rotulo: d.nome ?? ctx?.nomeDoSitio?.(r.id) ?? r.id, texto: corpo, escopo: 'local' }
  },

  hipotese: (r, ctx) => {
    const c = r.campos
    // Os termos que são verbetes com forma em uso: a forma de agora acha a hipótese como o rótulo guardado de antes.
    const vivos = Array.isArray(c.termos) ? c.termos.map((t) => (typeof t === 'string' ? ctx?.nomeDeAgoraDe?.(t) : null)).filter((x): x is string => !!x) : []
    const corpo = semLinks([texto(c, 'termosRotulos', 'termos'), vivos.join('\n'), texto(c, 'justificativa')].filter((x) => x.trim() !== '').join('\n'))
    if (corpo.trim() === '') return null
    // O rótulo do acerto: o nome de cada termo de agora (a forma em uso, se há; senão o rótulo guardado).
    const guardados = Array.isArray(c.termosRotulos) ? c.termosRotulos : []
    const deAgora = (Array.isArray(c.termos) ? c.termos : []).map((t, i) => (typeof t === 'string' ? ctx?.nomeDeAgoraDe?.(t) : null) ?? comoTexto(guardados[i]))
    const rotulos = vivos.length > 0 ? deAgora.filter((x) => x.trim() !== '').join(' ') : comoTexto(c.termosRotulos) || comoTexto(c.termos)
    // Ancorada numa leitura SKC, conta para o dono da leitura, como na tela (revisão 4 da Tarefa 10, m6; M13).
    const dono = objetoDaHipotese({ objeto: typeof c.objeto === 'string' ? c.objeto : null, ancora: lerAncora(c.ancora) })
    return { rotulo: primeiraLinha(rotulos) || 'Hipótese', texto: corpo, objeto: objetoDe(dono, ctx) ?? objetoDe(c.alvo, ctx), escopo: 'termo' }
  },

  regiao: () => null,
  posicao: () => null,
  verbete: (r) => {
    if (!eVerbeteSkc(r.id)) {
      const { formaEmUso } = lerEdicaoDoVerbete(r)
      return formaEmUso === null ? null : { rotulo: formaEmUso, texto: formaEmUso, escopo: 'termo' }
    }
    const v = lerVerbeteSkc(r)
    return { rotulo: v.emUso, texto: [v.forma, v.formaEmUso].filter((x) => x !== null).join('\n'), escopo: 'termo' }
  },
  'item-sitio': () => null,
  revisao: () => null,
  imagem: () => null,
  ligacao: () => null,
  comparar: () => null,
}

/**
 * O SKC, Nr. no índice (revisões 3 e 4): a palavra `skc` e UM termo colado, `skcnr12` ("skc skcnr12"), e não as palavras
 * soltas "SKC, Nr. 12" (que faziam "SKC 1" achar o Nr. 12 pelo prefixo, e "SKC 12" achar o objeto de página ou altura
 * 12). A busca por SKC, Nr. não passa pelo FTS: "SKC 12", "SKC: 12", "SKC, Nr. 12" e "skc nr 12" respondem exatamente
 * pelo `porNrSkc` (`objetosDaReferencia`, src/busca/consulta.ts), ANTES do FTS; por isso o número solto nunca entra no
 * índice. A palavra `skc` faz "skc" valer em QUALQUER posição, como uma palavra comum: sozinho, acha os objetos SKC com
 * Nr. (como "TESTE" acha os objetos do livro, cujo rótulo no índice do pacote começa por "TESTE I"), e "skc escaravelho"
 * ou "escaravelho skc" acham o escaravelho SKC. Escolhido por ser o menos surpreendente: a sigla de uma fonte acha os
 * objetos dela, igual para os livros e para o SKC. (Para filtrar, "Publicação: SKC".) `skcnr12` não é para ninguém
 * digitar; fica para distinguir o Nr. no texto indexado.
 */
export const termoDoNrSkc = (n: number): string => `skc skcnr${n}`

// ---------------------------------------------------------------------------
// A diferença
// ---------------------------------------------------------------------------

interface Desejado {
  assinatura: string
  tipo: Tipo
  ref: string
  entrada: EntradaDoIndice
}

const chaveDe = (tipo: string, reg: string) => `${tipo}\u0000${reg}`

/** cyrb53: um hash de 53 bits do texto (para a assinatura de conteúdo). */
function hash(t: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return `${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}.${t.length.toString(36)}`
}

/**
 * A assinatura de um registro é a do CONTEÚDO que ele põe no índice (e não `alteradoEm`: um evento de hlc antigo que
 * chega tarde, de outro campo, não muda o `alteradoEm` mas muda o texto). Registro excluído não tem entrada.
 */
const assinaturaDe = (tipo: Tipo, e: EntradaDoIndice) =>
  hash(JSON.stringify([tipo, e.rotulo, e.texto, e.objeto ?? null, e.objetos ?? null, e.escopo ?? null]))

function desejadoDe(estado: Estado, numeracao: Numeracao, pacote: FormasDoPacote, sitios: SitiosDoPacote): Map<string, Desejado> {
  const mapa = new Map<string, Desejado>()
  const ctx = contextoDe(numeracao, formasEmUso(estado), pacote, sitios)
  for (const [tipo, registros] of estado.registros) {
    const regra = camposIndexaveis[tipo]
    for (const r of registros.values()) {
      if (r.excluido) continue
      const entrada = regra(r, ctx)
      if (entrada) mapa.set(chaveDe(tipo, r.id), { assinatura: assinaturaDe(tipo, entrada), tipo, ref: r.id, entrada })
    }
  }
  return mapa
}

const SQL_APAGAR_FTS = 'DELETE FROM fts WHERE rowid = (SELECT rowid FROM doc WHERE chave = ?)'
const SQL_APAGAR_DOC = 'DELETE FROM doc WHERE chave = ?'
const SQL_INSERIR_DOC =
  'INSERT INTO doc (chave, tipo, ref, publicacao, objeto, objetos, rotulo, escopo, skc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)'
const SQL_INSERIR_FTS = 'INSERT INTO fts (rowid, texto) SELECT rowid, ? FROM doc WHERE chave = ?'

export interface ResumoDoIndice {
  inseridos: number
  removidos: number
  /** A passada refez o índice inteiro (motor ou tabela de dobra novos). */
  completa: boolean
}

let indexado = new Map<string, string>() // chave → assinatura
let geracaoIndexada = -1
let tabelaIndexada: FoldTabela | null = null
let estadoIndexado: Estado | null = null
let numeracaoIndexada: Numeracao | null = null
let donosIndexados = -1 // a versão dos donos dos trechos com que as hipóteses foram indexadas (I1)
let fila: Promise<unknown> = Promise.resolve()

async function passada(estado: Estado, tabela: FoldTabela): Promise<ResumoDoIndice> {
  const geracao = geracaoDoBanco()
  const donosAntes = versaoDosDonos()
  let completa = geracao !== geracaoIndexada || tabela !== tabelaIndexada
  if (!completa) {
    // O índice mora no motor: se ele foi trocado por baixo (worker novo), a contagem não bate.
    const [linha] = await consultarUsuario<{ n: number }>('SELECT count(*) AS n FROM doc')
    completa = Number(linha?.n ?? 0) !== indexado.size
  }

  const numeracao = numeracaoDe(estado)
  const desejado = desejadoDe(estado, numeracao, await formasDoPacote().catch((): FormasDoPacote => new Map()), await sitiosDoPacote().catch((): SitiosDoPacote => new Map()))
  const base = completa ? new Map<string, string>() : indexado
  const lote: Instrucao[] = []
  if (completa) lote.push({ sql: 'DELETE FROM fts' }, { sql: 'DELETE FROM doc' })

  let removidos = 0
  for (const [chave, assinatura] of base) {
    if (desejado.get(chave)?.assinatura === assinatura) continue
    lote.push({ sql: SQL_APAGAR_FTS, parametros: [chave] }, { sql: SQL_APAGAR_DOC, parametros: [chave] })
    removidos++
  }
  let inseridos = 0
  for (const [chave, d] of desejado) {
    if (base.get(chave) === d.assinatura) continue
    const { entrada } = d
    lote.push(
      {
        sql: SQL_INSERIR_DOC,
        parametros: [chave, d.tipo, d.ref, SIGLA_SKC, entrada.objeto ?? null, entrada.objetos ? JSON.stringify(entrada.objetos) : null, entrada.rotulo, entrada.escopo ?? null],
      },
      { sql: SQL_INSERIR_FTS, parametros: [textoIndexado(entrada.texto, tabela), chave] },
    )
    inseridos++
  }

  // Um só pedido (uma tarefa na fila do banco, uma transação): nenhuma consulta vê a diferença pela metade.
  // Sem diferença o lote é vazio e nada é escrito.
  try {
    await escreverUsuario(lote)
  } catch (erro) {
    geracaoIndexada = -1 // meio escrito: a próxima passada refaz tudo
    throw erro
  }
  indexado = new Map([...desejado].map(([chave, d]) => [chave, d.assinatura]))
  geracaoIndexada = geracao
  tabelaIndexada = tabela
  estadoIndexado = estado
  numeracaoIndexada = numeracao
  donosIndexados = donosAntes
  return { inseridos, removidos, completa }
}

/**
 * Põe o índice em dia com `estado`, aplicando só a diferença (uma passada de cada vez; as chamadas entram em fila).
 * A tabela de dobra é a do pacote aberto, ou `opcoes.tabela`.
 */
export function indexarUsuario(estado: Estado, opcoes: { tabela?: FoldTabela } = {}): Promise<ResumoDoIndice> {
  const rodar = async () => passada(estado, opcoes.tabela ?? (await tabelaDoPacote()))
  const r = fila.then(rodar, rodar)
  fila = r.catch(() => undefined)
  return r
}

/**
 * Antes de consultar: espera a passada em curso e, se o estado (ou o motor, ou a tabela) mudou desde a última,
 * faz outra. Chamada por `buscar()`; devolve o estado que o índice reflete.
 */
export async function garantirIndiceDoUsuario(tabela: FoldTabela): Promise<Estado> {
  // Os números dos objetos SKC dependem dos números do pacote (consultados uma vez).
  await numerosDoPacote()
  await fila
  const atual = estadoAtual()
  if (atual === estadoIndexado && numeracaoDe(atual) === numeracaoIndexada && tabela === tabelaIndexada && geracaoDoBanco() === geracaoIndexada && versaoDosDonos() === donosIndexados) return atual
  await indexarUsuario(atual, { tabela })
  return estadoIndexado ?? atual
}

/** Só nos testes: esquece o que foi indexado (a próxima passada refaz o índice por inteiro). */
export function esquecerIndiceDoUsuario(): void {
  indexado = new Map()
  geracaoIndexada = -1
  tabelaIndexada = null
  estadoIndexado = null
  numeracaoIndexada = null
  donosIndexados = -1
}

/**
 * Segue o estado: a cada mudança (gravação, sincronização, outra aba) e a cada troca de pacote, agenda UMA passada
 * para dali a 300 ms; mudanças nesse meio-tempo entram na mesma passada. Devolve a função que para.
 */
export function iniciarIndiceDoUsuario(opcoes: { espera?: number; tabela?: FoldTabela } = {}): () => void {
  const espera = opcoes.espera ?? ESPERA_DO_INDICE_MS
  let timer: ReturnType<typeof setTimeout> | undefined
  let parado = false
  const agendar = () => {
    if (parado || timer !== undefined) return
    timer = setTimeout(() => {
      timer = undefined
      // Sem pacote ainda (sem tabela de dobra), ou o banco falhou: a próxima mudança ou abertura tenta de novo.
      indexarUsuario(estadoAtual(), { tabela: opcoes.tabela }).catch(() => undefined)
    }, espera)
  }
  const pararEstado = assinarEstado(agendar)
  const pararReabertura = aoReabrir(agendar)
  // Um número SKC que se confirma (ou que se calcula quando chegam os números do pacote) muda o que se indexa.
  const pararConfirmados = assinarConfirmados(agendar)
  const pararPacote = assinarNumerosDoPacote(agendar)
  agendar()
  return () => {
    parado = true
    clearTimeout(timer)
    pararEstado()
    pararReabertura()
    pararConfirmados()
    pararPacote()
  }
}
