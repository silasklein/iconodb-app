/**
 * O número de um objeto SKC (decisões 30 e 34): `<código do período><5 dígitos>`, o próximo do período depois do maior
 * entre os objetos do pacote e os objetos SKC do estado fundido. Este módulo é PURO (sem IndexedDB, sem rede, sem React).
 *
 * ESQUEMA ESCOLHIDO: DERIVADO, com a confirmação ancorada na cadeia do `estado.json`.
 * - O número NÃO é um campo que alguém escreve e outros corrigem. Cada objeto guarda o PEDIDO (o período, `periodo`, e,
 *   só para o aviso, o número que a tela mostrou ao salvar, `pedido`); o número é calculado por `numerar` a partir de
 *   (estado fundido, números do pacote, mapa de confirmados). Mesmos dados → mesmo número, em qualquer aparelho e em
 *   qualquer ordem de eventos.
 * - CONFIRMADO = o id está no mapa `numeros` de um `estado.json` que este aparelho baixou ou gravou (guardado no
 *   IndexedDB, `numeros:confirmados`), OU o registro tem a TESTEMUNHA `numero` (um `alterar {numero}` escrito depois
 *   da confirmação, que deixa a confirmação no diário imutável e sobrevive a um `estado.json` apagado).
 *   Por que a cadeia do `estado.json`: é o único ponto do Dropbox com escrita condicional (rev). Quem grava o
 *   `estado.json` no rev R acabou de ler (e unir) o mapa do rev R (Tarefa 3: o arquivo é baixado sempre que o rev
 *   listado é outro; a gravação usa o rev listado; no conflito, relê). Então os mapas formam uma cadeia M1 ⊆ M2 ⊆ …,
 *   e quem consolida só acrescenta números a objetos ainda não confirmados, sempre acima de tudo o que está ocupado.
 * - PROVISÓRIO = tem período mas não está confirmado. Os provisórios são numerados depois dos confirmados, por ordem de
 *   pedido (o hlc da escrita do `periodo`, desempate pelo id): o de hlc menor fica com o número mais baixo.
 *
 * O ALGORITMO (`numerar`), na ordem — é ESTE o que a Tarefa 16 porta para Python:
 *  1. Para cada registro `objeto`: candidato confirmado = a testemunha `campos.numero` (se `lerNumero` a aceita), senão
 *     `confirmados[id]` (se válido). Ids do mapa sem registro no estado também ocupam o número (o registro chega depois).
 *  2. Candidatos iguais a um número do pacote: se o registro é uma RESERVA (veja abaixo: reserva da Tarefa 16), vale
 *     (é o objeto do livro que a cumpre); senão perde (`conflito: 'livro'`). Candidatos repetidos entre si: fica o de
 *     menor (chave, id), onde chave = hlc do `periodo` (ou '' sem registro); os outros perdem (`conflito: 'skc'`).
 *     Fora desses casos de falha (veja o relatório), um confirmado nunca perde.
 *  3. Ocupados = números do pacote + vencedores. maior[período] = o maior n ocupado no período (0 se nenhum), contando
 *     também o valor de toda chave `LIVRO:<id>` válida do mapa (revisão 3: veja NÚMERO TOMADO POR UM LIVRO).
 *  4. Pedidos = registros não excluídos, não vencedores, com `periodo` válido (ou, para um perdedor sem período válido, o
 *     período do número perdido), em ordem (hlc do `periodo` ou `criadoEm`, id) por ponto de código. Cada um recebe
 *     período + (maior + 1) e o maior sobe. Acima de 99999, fica sem número (`sem-numero`).
 *  5. Os demais: excluído sem confirmação → 'excluido' (sem número); sem período → 'rascunho'.
 *
 * NÚMERO TOMADO POR UM LIVRO (decisão 48; revisão 1 da Tarefa 16). Se, apesar da regra de operação (o `user-import` antes do
 * `objects-assign`), um volume novo dá a um objeto do livro um número já confirmado de um objeto SKC, o passo 2 dá o número
 * ao livro e o objeto SKC recebe um provisório (`conflito: 'livro'`). A consolidação que grava o estado.json escreve então,
 * para esse objeto, a TESTEMUNHA NOVA `alterar {numero: <o provisório de agora>, numeroTomadoPeloLivro: <o tomado>}`
 * (`testemunhasDoLivro`): como a testemunha vence o mapa (passo 1), o número novo fica confirmado e definitivo e deixa de
 * andar quando outros objetos do período se confirmam. É a mesma escrita condicional da cadeia do estado.json: o número
 * novo é o que essa consolidação calculou ao lado dos que ela confirmou. Dois aparelhos que consolidam o mesmo estado
 * escrevem a mesma testemunha. O mapa continua com o número antigo (a união fica com o menor), o que não importa: a
 * testemunha vence. `numeroTomadoPeloLivro` (só para o aviso) = o número perdido no conflito ou, depois, o campo do
 * registro (se é um número e não é o de agora). Uma reserva e um conflito entre objetos SKC (`'skc'`) nunca recebem a
 * testemunha do livro.
 * REVISÃO 2 (o número novo no estado.json): a testemunha só viaja pelo diário, e um aparelho que lê o estado.json antes de
 * recebê-la calcularia outro número. Por isso a mesma consolidação grava também, no mapa `numeros`, a chave
 * `LIVRO:<id>` → o número novo (`confirmacoes`), na mesma escrita condicional. No passo 1, um candidato (testemunha ou
 * mapa) que é número do pacote, de um registro que não é reserva, dá lugar a `confirmados['LIVRO:' + id]` (se é um número
 * e é outro): esse vira o candidato e `numeroTomadoPeloLivro` = o tomado. Se o número novo também é do pacote (um livro
 * tomou os dois: falha dupla), o passo 2 o perde como 'livro' e a consolidação grava outro, maior (a união de `LIVRO:`
 * fica com o MAIOR). `testemunhasFaltando` também escreve a testemunha do número novo (com `numeroTomadoPeloLivro`) num
 * registro sem testemunha ou com a do número tomado.
 * REVISÃO 3 (m-I3a): o valor de toda chave `LIVRO:<id>` válida (id de objeto SKC, número válido) sobe o maior do período
 * antes do passo 1, tenha ou não o pacote deste aparelho o número tomado: num aparelho com o pacote velho, o objeto ainda
 * mostra o número antigo, mas o novo já é dele, e nenhum pedido do período o recebe. Vetores compartilhados com o porte: tests/fixtures/numerar-vetores.json.
 *
 *
 * SKC, Nr. (decisão 38): a numeração da coleção SKC, 1, 2, 3… na ordem em que os objetos ganham número do sistema.
 * Definitivo e nunca repetido; é UMA SEQUÊNCIA A MAIS na mesma máquina (derivada + confirmada pela cadeia do
 * estado.json + testemunha no diário), com as mesmas garantias. Calculado DEPOIS do passo 5, sobre o resultado dele:
 *  6. Para cada registro que NÃO é reserva: candidato confirmado = a testemunha `campos.nrSkc` (se `lerNrSkc` a aceita),
 *     senão `confirmados['SKC:' + id]`. Ids do mapa (`SKC:<id>`) sem registro também ocupam o Nr.
 *  7. Repetidos: fica o de menor (chave do pedido, id), como no passo 2; os outros perdem (`conflitoNrSkc`).
 *  8. maiorNrSkc = o maior Nr. ocupado (0 se nenhum).
 *  9. Recebem Nr. provisório, em ordem (chave do pedido, id), maiorNrSkc + 1 cada: os registros não excluídos, que não
 *     são reserva, que têm número do sistema (confirmado ou provisório) e ainda não têm Nr. vencedor. Rascunho (sem
 *     período), 'sem-numero' e reserva nunca recebem; o rascunho recebe no mesmo passo em que ganha o período (a chave
 *     do pedido é a hora do `periodo`). Excluído sem Nr. confirmado fica sem Nr.; excluído confirmado guarda o seu.
 *  A consolidação confirma os dois juntos: `confirmacoes` devolve `{id: número, 'SKC:'+id: '<Nr.>'}`.
 *
 * PARA O PORTE PARA PYTHON (Tarefa 16):
 * - `lerNumero`: `re.fullmatch(r'(NT|NE|CA|BA|BI|BM|BT|F1|F2|F3|PE|HE|RO)([0-9]{5})', v, flags=re.ASCII)` e n >= 1; só `str`.
 * - `periodo` válido: só um `str` da tabela (nunca `None`, número ou minúsculas).
 * - RESERVA (revisão 3): o registro tem `reserva` (`str` não vazio depois de `strip()`) OU o id começa por
 *   `OB-pipeline-` (o aparelho `pipeline` é reservado pelo protocolo; o app nunca o sorteia). Pelo id, porque a
 *   testemunha `alterar {numero}` de quem consolidou pode chegar a um aparelho antes do `criar` do pipeline: sem a regra,
 *   esse registro viraria objeto SKC (tomaria o número do livro em porNumero, entraria em Meus objetos, ganharia SKC, Nr.
 *   e, consolidando, gravaria `SKC:OB-pipeline-…` para sempre). `def e_reserva(id, campos): return
 *   (isinstance(campos.get('reserva'), str) and campos['reserva'].strip() != '') or id.startswith('OB-pipeline-')`.
 *   Uma reserva nunca é rascunho, nunca recebe SKC, Nr., e uma entrada `SKC:OB-pipeline-…` do mapa é ignorada.
 * - Ordenações por ponto de código: as chaves são ASCII (hlc `<ms 13>-<contador 4>-<aparelho>`, ids `OB-…`), então
 *   `sorted()` de tuplas `(chave, id)` dá o mesmo. A chave do pedido é o hlc da escrita VENCEDORA do campo `periodo` (a
 *   última por (hlc, evento) na fusão), ou `criadoEm` (o menor hlc do registro) se o campo nunca foi escrito.
 * - Confirmados: o `numeros` do estado.json (dict id → número; entradas inválidas ignoradas) unido ao que a importação já
 *   tem; testemunha = o valor atual do campo `numero` do registro, se `lerNumero` o aceita.
 * - `numeroTomadoPeloLivro` (decisão 48) está também no `info` do porte (`iconodb/usuario.py`), com a mesma regra: o
 *   número perdido num conflito 'livro', senão o campo do registro se é um número e não é o de agora. Mudam juntos.
 * - O mapa final que a Tarefa 16 reserva em `registry.json` = `confirmacoes(numerar(...))` SÓ dos `situacao == 'confirmado'`
 *   (os provisórios ainda podem mudar). Veja no relatório da Tarefa 9 o protocolo para um volume novo (reservas).
 * - FORMATO DO SKC, Nr. (decisão 38): no MESMO mapa `numeros` do estado.json (e do IndexedDB), a chave `"SKC:" + id`
 *   com o Nr. em decimal (`{"OB-x-1": "CA00046", "SKC:OB-x-1": "12"}`); a testemunha é o campo `nrSkc` ("12") no
 *   mesmo `alterar` que escreve `numero`; o pedido mostrado ao salvar é `pedidoNrSkc` (só para o aviso).
 *   `lerNrSkc`: `re.fullmatch(r'[1-9][0-9]{0,8}', v, flags=re.ASCII)`, só `str`; `int(v)`. Na união de dois mapas,
 *   `SKC:<id>` com valores diferentes fica com o MENOR INTEIRO (não o menor texto: '9' < '12').
 *   O pipeline (Tarefa 16) NUNCA escreve, altera ou dá SKC, Nr.: as reservas (veja RESERVA) nunca o recebem, e o
 *   `registry.json` não o guarda. Ao reescrever qualquer coisa do usuário, o pipeline preserva as entradas `SKC:`.
 *
 * Por que derivado e não "atribuição e renumeração como eventos": uma renumeração escrita como evento seria decidida por
 * cada aparelho com a visão que ele tem; dois aparelhos que veem a mesma colisão escrevem renumerações diferentes, e a
 * correção da correção vira uma cascata. Aqui o diário guarda só fatos imutáveis (o pedido, a testemunha), e o número é
 * uma função pura deles: fácil de portar (Tarefa 16) e de provar.
 */
import { formatarReferencias } from '../banco/referencias'
import type { Json } from '../usuario/eventos'
import type { Estado, Registro } from '../usuario/fusao'

export const PERIODOS = [
  { codigo: 'NT', nome: 'Natufiano' },
  { codigo: 'NE', nome: 'Neolítico' },
  { codigo: 'CA', nome: 'Calcolítico' },
  { codigo: 'BA', nome: 'Bronze Antigo' },
  { codigo: 'BI', nome: 'Bronze Intermediário' },
  { codigo: 'BM', nome: 'Bronze Médio' },
  { codigo: 'BT', nome: 'Bronze Tardio' },
  { codigo: 'F1', nome: 'Ferro I' },
  { codigo: 'F2', nome: 'Ferro II' },
  { codigo: 'F3', nome: 'Ferro III' },
  { codigo: 'PE', nome: 'Persa' },
  { codigo: 'HE', nome: 'Helenístico' },
  { codigo: 'RO', nome: 'Romano' },
] as const

export type CodigoDePeriodo = (typeof PERIODOS)[number]['codigo']

const CODIGOS: ReadonlySet<string> = new Set(PERIODOS.map((p) => p.codigo))

/**
 * O NÚMERO DO SISTEMA, a única fonte do padrão no app (links, coleções, índice, busca, sugestões, citações): um código
 * de período (NT NE CA BA BI BM BT F1 F2 F3 PE HE RO) e 5 algarismos. Nunca `[A-Za-z]{2}\d{5}`: os de Ferro têm um
 * algarismo no código (F100001), e só estes treze códigos existem. Em Python:
 * `(?:NT|NE|CA|BA|BI|BM|BT|F1|F2|F3|PE|HE|RO)[0-9]{5}` (classes explícitas, sem depender de `re.ASCII`).
 */
export const FONTE_DO_NUMERO = `(?:${PERIODOS.map((p) => p.codigo).join('|')})[0-9]{5}`
/** O número canônico, inteiro, em maiúsculas. */
export const RE_NUMERO_DO_SISTEMA = new RegExp(`^${FONTE_DO_NUMERO}$`)
/** O número como alguém digita: inteiro, em qualquer caixa (quem o usa põe em maiúsculas). */
export const RE_NUMERO_DIGITADO = new RegExp(`^${FONTE_DO_NUMERO}$`, 'i')
const RE_NUMEROS_NO_TEXTO = new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])${FONTE_DO_NUMERO}(?![\\p{L}\\p{N}\\p{M}_])`, 'giu')
const RE_COMECO = new RegExp(`^(?:${PERIODOS.map((p) => p.codigo).join('|')})[0-9]{0,5}$`, 'i')

/** Os números do sistema escritos num texto (qualquer caixa, entre fronteiras de palavra), em maiúsculas, sem repetir. */
export const numerosNoTexto = (texto: string): string[] => [...new Set((texto.match(RE_NUMEROS_NO_TEXTO) ?? []).map((x) => x.toUpperCase()))]
/** O que foi digitado já é o começo de um número ("CA", "ca0", "F10"): as sugestões procuram os números por prefixo. */
export const pareceComecoDeNumero = (digitado: string): boolean => RE_COMECO.test(digitado.trim())

/** ASCII só (em Python: `re.fullmatch(..., flags=re.ASCII)`). */
const RE_NUMERO = new RegExp(`^(${PERIODOS.map((p) => p.codigo).join('|')})([0-9]{5})$`)
const RE_ID = /^OB-[a-z0-9]{8}-[1-9][0-9]*$/
export const MAIOR_N = 99999

export const periodoValido = (x: unknown): x is CodigoDePeriodo => typeof x === 'string' && CODIGOS.has(x)
export const nomeDoPeriodo = (codigo: string): string => PERIODOS.find((p) => p.codigo === codigo)?.nome ?? codigo
export const idDeObjetoSkc = (x: unknown): x is `OB-${string}` => typeof x === 'string' && RE_ID.test(x)

/**
 * Os ids das reservas da Tarefa 16: o aparelho `pipeline` é reservado pelo protocolo (o app nunca o sorteia; veja
 * src/usuario/aparelho.ts), então todo registro `OB-pipeline-…` é uma reserva, tenha ou não chegado o `criar` com o campo
 * `reserva` (revisão 3: a testemunha `alterar {numero}` de quem consolidou pode chegar antes dele).
 */
export const PREFIXO_DAS_RESERVAS = 'OB-pipeline-'

/**
 * A reserva de um registro `objeto`: o texto `reserva` (a sigla do volume) ou, num id `OB-pipeline-…` que ainda não o
 * tem, 'livro'. null: não é reserva (é um objeto SKC).
 */
export function reservaDe(r: { id: string; campos: Readonly<Record<string, Json>> }): string | null {
  const t = typeof r.campos.reserva === 'string' ? r.campos.reserva.trim() : ''
  return t !== '' ? t : r.id.startsWith(PREFIXO_DAS_RESERVAS) ? 'livro' : null
}

/** 'CA00046' → {periodo: 'CA', n: 46}; null para qualquer outra coisa (minúsculas, largura total, espaços, 00000). */
export function lerNumero(v: unknown): { periodo: CodigoDePeriodo; n: number } | null {
  if (typeof v !== 'string') return null
  const m = RE_NUMERO.exec(v)
  if (!m) return null
  const n = Number(m[2])
  return n >= 1 ? { periodo: m[1] as CodigoDePeriodo, n } : null
}

export function formatarNumero(periodo: string, n: number): string {
  return `${periodo}${String(n).padStart(5, '0')}`
}

const RE_NR_SKC = /^[1-9][0-9]{0,8}$/
/** '12' → 12; null para qualquer outra coisa (0, zeros à esquerda, sinais, espaços, número JSON). */
export function lerNrSkc(v: unknown): number | null {
  return typeof v === 'string' && RE_NR_SKC.test(v) ? Number(v) : null
}
const PREFIXO_NR_SKC = 'SKC:'
/** A chave do SKC, Nr. de um objeto no mapa de confirmados: `SKC:<id>`. */
export const chaveDoNrSkc = (id: string): string => `${PREFIXO_NR_SKC}${id}`
/** O id de uma chave `SKC:<id>` (null se não é uma). */
export const idDaChaveDoNrSkc = (chave: string): string | null => {
  if (!chave.startsWith(PREFIXO_NR_SKC)) return null
  const id = chave.slice(PREFIXO_NR_SKC.length)
  return idDeObjetoSkc(id) ? id : null
}
const PREFIXO_DO_LIVRO = 'LIVRO:'
/**
 * A chave do NÚMERO NOVO de um objeto cujo número confirmado um livro tomou (decisão 48; revisão 2 da Tarefa 16) no mapa
 * de confirmados: `LIVRO:<id>` → o número novo. Só a consolidação a escreve, na mesma escrita condicional do estado.json.
 */
export const chaveDoNumeroNovo = (id: string): string => `${PREFIXO_DO_LIVRO}${id}`
/** O id de uma chave `LIVRO:<id>` (null se não é uma). */
export const idDaChaveDoNumeroNovo = (chave: string): string | null => {
  if (!chave.startsWith(PREFIXO_DO_LIVRO)) return null
  const id = chave.slice(PREFIXO_DO_LIVRO.length)
  return idDeObjetoSkc(id) ? id : null
}
/** O id do objeto de qualquer chave do mapa de confirmados (`OB-…`, `SKC:OB-…`, `LIVRO:OB-…`). */
export const idDaChaveDoMapa = (chave: string): string => idDaChaveDoNrSkc(chave) ?? idDaChaveDoNumeroNovo(chave) ?? chave

/** "SKC: 12" (decisão 39: o formato de `formatarReferencias`; antes, "SKC, Nr. 12"). */
export const textoDoNrSkc = (n: number): string => formatarReferencias([{ obra: 'SKC', numero: n }])

/** Os números de objeto do pacote (a tabela `object` do comum.sqlite: só os objetos dos livros). */
export type NumerosDoPacote = ReadonlySet<string>
/**
 * id do objeto SKC → número confirmado; `SKC:<id>` → SKC, Nr. confirmado (decisão 38); e `LIVRO:<id>` → o número novo de
 * um objeto cujo número confirmado um livro tomou (decisão 48, revisão 2).
 */
export type Confirmados = Readonly<Record<string, string>>

export type Situacao = 'confirmado' | 'provisorio' | 'rascunho' | 'excluido' | 'sem-numero'

export interface NumeroDoObjeto {
  id: string
  numero: string | null
  situacao: Situacao
  /** O período do pedido (null num rascunho). */
  periodo: CodigoDePeriodo | null
  /** O número que a tela mostrou ao salvar (só para o aviso). */
  pedido: string | null
  /** O número de agora não é o que a tela mostrou ao salvar: avisar ("outro aparelho deu CA00046 antes"). */
  mudou: boolean
  /** Um número confirmado que se perdeu (falha: veja o algoritmo, passo 2). */
  conflito: 'livro' | 'skc' | null
  /** O número confirmado que um objeto do livro tomou (decisão 48; veja NÚMERO TOMADO POR UM LIVRO), para o aviso. */
  numeroTomadoPeloLivro: string | null
  /** Reserva de número para um livro (Tarefa 16): não é um objeto SKC e não aparece nas listas. */
  reserva: string | null
  /** SKC, Nr. (decisão 38): null num rascunho, numa reserva, ou num excluído sem Nr. confirmado. */
  nrSkc: number | null
  situacaoNrSkc: 'confirmado' | 'provisorio' | null
  /** O SKC, Nr. que a tela mostrou ao salvar (só para o aviso). */
  pedidoNrSkc: number | null
  /** O Nr. de agora não é o que a tela mostrou ao salvar: avisar. */
  mudouNrSkc: boolean
  /** Um Nr. confirmado que se perdeu (só em falha dupla, como `conflito: 'skc'`). */
  conflitoNrSkc: boolean
}

export interface Numeracao {
  porId: ReadonlyMap<string, NumeroDoObjeto>
  /**
   * número → id do OBJETO SKC que o tem (confirmado ou provisório). Só objetos SKC cujo registro está no estado: nem as
   * reservas de livro (Tarefa 16; o número delas é o do objeto do livro, e quem o mostra é o pacote) nem ids do mapa de
   * confirmados cujo registro ainda não chegou. Todos esses ocupam o número (`maiores`), mas não respondem por ele.
   */
  porNumero: ReadonlyMap<string, string>
  /** número → id da reserva de livro (Tarefa 16) que o ocupa. */
  reservas: ReadonlyMap<string, string>
  /** Ids sem período e sem número (os rascunhos da Revisão), na ordem de criação. */
  rascunhos: readonly string[]
  /** Ids com número provisório (o que a próxima consolidação confirma). */
  provisorios: readonly string[]
  /** Período → maior n ocupado (pacote + SKC). */
  maiores: ReadonlyMap<string, number>
  /** SKC, Nr. → id do objeto SKC (com registro no estado) que o tem. */
  porNrSkc: ReadonlyMap<number, string>
  /** O maior SKC, Nr. ocupado (0 se nenhum). */
  maiorNrSkc: number
  /** Ids com SKC, Nr. provisório (a próxima consolidação também os confirma). */
  nrSkcProvisorios: readonly string[]
}

const comparar = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Ordena por ponto de código (o `<` do JS compara UTF-16; as chaves aqui são ASCII, então dá o mesmo que o Python). */
const porChave = (a: { chave: string; id: string }, b: { chave: string; id: string }) => comparar(a.chave, b.chave) || comparar(a.id, b.id)

const VAZIO: ReadonlyMap<string, Registro> = new Map()

function objetosDe(estado: Estado): ReadonlyMap<string, Registro> {
  return estado.registros.get('objeto') ?? VAZIO
}

/** A chave do pedido: o hlc da escrita que vale no `periodo` (ou a criação do registro). */
const chaveDoPedido = (estado: Estado, r: Registro): string => estado.hlcDoCampo('objeto', r.id, 'periodo') ?? r.criadoEm

/**
 * A hora em que o objeto pediu o número do sistema (o hlc do `periodo`, ou a criação): é a ordem dos pedidos, a do SKC,
 * Nr. e, na ligação (decisão 38), a hora em que o número foi DADO. null se o registro não existe.
 */
export function chaveDoPedidoDe(estado: Estado, id: string): string | null {
  const r = objetosDe(estado).get(id)
  return r ? chaveDoPedido(estado, r) : null
}

export function numerar(estado: Estado, pacote: NumerosDoPacote, confirmados: Confirmados): Numeracao {
  const objetos = objetosDe(estado)
  const porId = new Map<string, NumeroDoObjeto>()
  const porNumero = new Map<string, string>()
  const reservas = new Map<string, string>()
  /** Todo número já dado (objeto SKC, reserva ou id sem registro): é por ele que se acham os repetidos. */
  const ocupados = new Set<string>()
  const ocupar = (numero: string, id: string, r: Registro | undefined) => {
    ocupados.add(numero)
    if (r && reservaDe(r) !== null) reservas.set(numero, id)
    else if (r) porNumero.set(numero, id)
  }
  const maiores = new Map<string, number>()
  const subir = (numero: string) => {
    const l = lerNumero(numero)!
    if ((maiores.get(l.periodo) ?? 0) < l.n) maiores.set(l.periodo, l.n)
  }
  for (const n of pacote) if (lerNumero(n)) subir(n)
  // Revisão 3 (m-I3a): todo número novo válido do mapa (`LIVRO:<id>`) ocupa o período, também num aparelho com o pacote
  // velho, em que o livro ainda não tomou o número antigo: assim nenhum outro objeto recebe o número novo de outro.
  for (const [chave, valor] of Object.entries(confirmados)) if (idDaChaveDoNumeroNovo(chave) && lerNumero(valor)) subir(valor)

  // 1. Candidatos confirmados (os do mapa sem registro também).
  const candidatos: { id: string; numero: string; chave: string; r: Registro | undefined; tomado: string | null }[] = []
  const ids = new Set<string>([...objetos.keys()])
  for (const id of Object.keys(confirmados)) if (idDeObjetoSkc(id)) ids.add(id)
  for (const id of ids) {
    const r = objetos.get(id)
    const testemunha = r && lerNumero(r.campos.numero) ? (r.campos.numero as string) : null
    const doMapa = lerNumero(confirmados[id]) ? confirmados[id]! : null
    let numero = testemunha ?? doMapa
    // Decisão 48 (revisão 2): o número que um livro tomou dá lugar ao número novo que a consolidação gravou no mapa.
    const novo = confirmados[chaveDoNumeroNovo(id)]
    let tomado: string | null = null
    if (numero && pacote.has(numero) && !(r && reservaDe(r) !== null) && lerNumero(novo) && novo !== numero) {
      tomado = numero
      numero = novo!
    }
    if (numero) candidatos.push({ id, numero, chave: r ? chaveDoPedido(estado, r) : '', r, tomado })
  }

  // 2. Conflitos (só em falhas): o pacote vence o SKC; entre SKC, o menor (chave, id).
  candidatos.sort(porChave)
  const perdeu = new Map<string, { conflito: 'livro' | 'skc'; numero: string }>()
  for (const c of candidatos) {
    const reserva = c.r ? reservaDe(c.r) : null
    if (pacote.has(c.numero) && !reserva) perdeu.set(c.id, { conflito: 'livro', numero: c.numero })
    else if (ocupados.has(c.numero)) perdeu.set(c.id, { conflito: 'skc', numero: c.numero })
    else {
      ocupar(c.numero, c.id, c.r)
      subir(c.numero)
      if (c.r) porId.set(c.id, info(c.r, c.numero, 'confirmado', null, c.tomado))
    }
  }

  const tomadoDe = (id: string) => (perdeu.get(id)?.conflito === 'livro' ? perdeu.get(id)!.numero : null)

  // 4. Os pedidos ainda sem número, por ordem de pedido.
  const pedidos: { id: string; chave: string; r: Registro; periodo: CodigoDePeriodo }[] = []
  for (const r of objetos.values()) {
    if (porId.has(r.id)) continue
    const perda = perdeu.get(r.id)
    const periodo = periodoValido(r.campos.periodo) ? r.campos.periodo : perda ? lerNumero(perda.numero)!.periodo : null
    if (r.excluido || periodo === null) continue
    pedidos.push({ id: r.id, chave: chaveDoPedido(estado, r), r, periodo })
  }
  pedidos.sort(porChave)
  for (const p of pedidos) {
    const n = (maiores.get(p.periodo) ?? 0) + 1
    const conflito = perdeu.get(p.id)?.conflito ?? null
    if (n > MAIOR_N) {
      porId.set(p.id, info(p.r, null, 'sem-numero', conflito, tomadoDe(p.id)))
      continue
    }
    const numero = formatarNumero(p.periodo, n)
    maiores.set(p.periodo, n)
    ocupar(numero, p.id, p.r)
    porId.set(p.id, info(p.r, numero, 'provisorio', conflito, tomadoDe(p.id)))
  }

  // 5. Os demais.
  const rascunhos: Registro[] = []
  for (const r of objetos.values()) {
    if (porId.has(r.id)) continue
    const conflito = perdeu.get(r.id)?.conflito ?? null
    if (r.excluido) porId.set(r.id, info(r, null, 'excluido', conflito, tomadoDe(r.id)))
    else {
      porId.set(r.id, info(r, null, 'rascunho', conflito, tomadoDe(r.id)))
      if (reservaDe(r) === null) rascunhos.push(r)
    }
  }
  rascunhos.sort((a, b) => comparar(a.criadoEm, b.criadoEm) || comparar(a.id, b.id))

  // 6–9. SKC, Nr. (decisão 38).
  const { porNrSkc, maiorNrSkc } = numerarNrSkc(estado, objetos, confirmados, porId)

  // Ordem estável do mapa (por id), para comparar resultados entre aparelhos.
  const ordenado = new Map([...porId].sort((a, b) => comparar(a[0], b[0])))
  const provisorios = [...ordenado.values()].filter((i) => i.situacao === 'provisorio').map((i) => i.id)
  const nrSkcProvisorios = [...ordenado.values()].filter((i) => i.situacaoNrSkc === 'provisorio').map((i) => i.id)
  return { porId: ordenado, porNumero, reservas, rascunhos: rascunhos.map((r) => r.id), provisorios, maiores, porNrSkc, maiorNrSkc, nrSkcProvisorios }
}

/** Os passos 6–9 do algoritmo (veja o cabeçalho): completa `porId` com o SKC, Nr. */
function numerarNrSkc(
  estado: Estado,
  objetos: ReadonlyMap<string, Registro>,
  confirmados: Confirmados,
  porId: Map<string, NumeroDoObjeto>,
): { porNrSkc: Map<number, string>; maiorNrSkc: number } {
  const porNrSkc = new Map<number, string>()
  const ocupados = new Set<number>()
  let maior = 0
  const ocupar = (n: number, id: string, r: Registro | undefined) => {
    ocupados.add(n)
    if (n > maior) maior = n
    if (r) porNrSkc.set(n, id)
  }
  const dar = (id: string, n: number | null, situacao: NumeroDoObjeto['situacaoNrSkc'], conflito = false) => {
    const i = porId.get(id)
    if (!i) return
    porId.set(id, { ...i, nrSkc: n, situacaoNrSkc: situacao, mudouNrSkc: n !== null && i.pedidoNrSkc !== null && i.pedidoNrSkc !== n, conflitoNrSkc: conflito })
  }
  const reserva = (r: Registro) => reservaDe(r) !== null

  // 6. Candidatos confirmados (testemunha, senão mapa; ids do mapa sem registro também).
  const ids = new Set<string>()
  for (const r of objetos.values()) if (!reserva(r)) ids.add(r.id)
  for (const chave of Object.keys(confirmados)) {
    const id = idDaChaveDoNrSkc(chave)
    // Uma reserva nunca tem SKC, Nr.: uma entrada `SKC:OB-pipeline-…` (de antes da revisão 3) não vale.
    if (id && !objetos.has(id) && !id.startsWith(PREFIXO_DAS_RESERVAS)) ids.add(id)
  }
  const candidatos: { id: string; n: number; chave: string; r: Registro | undefined }[] = []
  for (const id of ids) {
    const r = objetos.get(id)
    const n = (r ? lerNrSkc(r.campos.nrSkc) : null) ?? lerNrSkc(confirmados[chaveDoNrSkc(id)])
    if (n !== null) candidatos.push({ id, n, chave: r ? chaveDoPedido(estado, r) : '', r })
  }
  // 7. Repetidos: fica o de menor (chave, id).
  candidatos.sort(porChave)
  const perdeu = new Set<string>()
  for (const c of candidatos) {
    if (ocupados.has(c.n)) perdeu.add(c.id)
    else {
      ocupar(c.n, c.id, c.r)
      dar(c.id, c.n, 'confirmado')
    }
  }
  // 9. Provisórios: quem tem número do sistema e nenhum Nr. vencedor, na ordem do pedido.
  const pedidos: { id: string; chave: string }[] = []
  for (const r of objetos.values()) {
    const i = porId.get(r.id)
    if (!i || i.situacaoNrSkc !== null || reserva(r) || r.excluido || i.numero === null) continue
    pedidos.push({ id: r.id, chave: chaveDoPedido(estado, r) })
  }
  pedidos.sort(porChave)
  for (const p of pedidos) {
    const n = maior + 1
    ocupar(n, p.id, objetos.get(p.id))
    dar(p.id, n, 'provisorio', perdeu.has(p.id))
  }
  for (const id of perdeu) if (porId.get(id)?.situacaoNrSkc === null) dar(id, null, null, true)
  return { porNrSkc, maiorNrSkc: maior }
}

function info(r: Registro, numero: string | null, situacao: Situacao, conflito: 'livro' | 'skc' | null, tomado: string | null = null): NumeroDoObjeto {
  const pedido = lerNumero(r.campos.pedido) ? (r.campos.pedido as string) : null
  const antigo = lerNumero(r.campos.numeroTomadoPeloLivro) && r.campos.numeroTomadoPeloLivro !== numero ? (r.campos.numeroTomadoPeloLivro as string) : null
  const periodo = periodoValido(r.campos.periodo) ? r.campos.periodo : numero ? lerNumero(numero)!.periodo : null
  return {
    id: r.id,
    numero,
    situacao,
    periodo,
    pedido,
    mudou: numero !== null && pedido !== null && pedido !== numero,
    conflito,
    numeroTomadoPeloLivro: tomado ?? antigo,
    reserva: reservaDe(r),
    nrSkc: null,
    situacaoNrSkc: null,
    pedidoNrSkc: lerNrSkc(r.campos.pedidoNrSkc),
    mudouNrSkc: false,
    conflitoNrSkc: false,
  }
}

/**
 * O número que um pedido NOVO do período receberia agora (`proximoNumero(periodo, estado, pacote)` do plano): o maior
 * ocupado no período (pacote, SKC confirmados e provisórios) + 1. Um pedido novo tem o maior hlc, então vai para o fim:
 * é o mesmo número que `numerar` lhe dá logo depois de gravado (salvo um pedido de outro aparelho que chegue antes).
 */
export function proximoNumero(periodo: CodigoDePeriodo, estado: Estado, pacote: NumerosDoPacote, confirmados: Confirmados = {}): string | null {
  const n = (numerar(estado, pacote, confirmados).maiores.get(periodo) ?? 0) + 1
  return n > MAIOR_N ? null : formatarNumero(periodo, n)
}

/** O SKC, Nr. que um objeto NOVO receberia agora: o maior ocupado + 1 (decisão 38). */
export function proximoNrSkc(estado: Estado, pacote: NumerosDoPacote, confirmados: Confirmados = {}): number {
  return numerar(estado, pacote, confirmados).maiorNrSkc + 1
}

/**
 * O que uma consolidação confirma: todos os números dados agora (confirmados e provisórios), os SKC, Nr. (`SKC:<id>`) e,
 * para o objeto cujo número um livro tomou, o número novo (`LIVRO:<id>`, o de `testemunhasDoLivro`; decisão 48).
 */
export function confirmacoes(numeracao: Numeracao): Record<string, string> {
  const saida: Record<string, string> = {}
  for (const i of numeracao.porId.values()) {
    if (i.numero !== null && (i.situacao === 'confirmado' || i.situacao === 'provisorio')) saida[i.id] = i.numero
    if (i.nrSkc !== null) saida[chaveDoNrSkc(i.id)] = String(i.nrSkc)
  }
  for (const t of testemunhasDoLivro(numeracao)) saida[chaveDoNumeroNovo(t.id)] = t.campos.numero
  return saida
}

/**
 * A união de dois mapas de confirmados (o deste aparelho e o de um estado.json). Comutativa e idempotente. Dentro de uma
 * cadeia os mapas nunca discordam; se discordarem (falha dupla: estado.json apagado logo depois de uma confirmação),
 * fica o menor número por ponto de código, igual em todo aparelho. Entradas malformadas são ignoradas.
 * `LIVRO:<id>` fica com o MAIOR: na cadeia, uma consolidação só escreve um número novo diferente se um livro tomou
 * também o anterior (falha dupla), e o de agora está sempre acima de tudo o que estava ocupado.
 */
export function unirConfirmados(a: Confirmados, b: Confirmados): Record<string, string> {
  const saida: Record<string, string> = {}
  for (const m of [a, b]) {
    for (const [id, numero] of Object.entries(m)) {
      const atual = saida[id]
      if (idDeObjetoSkc(id) && lerNumero(numero)) {
        if (atual === undefined || comparar(numero, atual) < 0) saida[id] = numero
      } else if (idDaChaveDoNrSkc(id) && lerNrSkc(numero) !== null) {
        // SKC, Nr.: o menor INTEIRO ('9' antes de '12').
        if (atual === undefined || lerNrSkc(numero)! < lerNrSkc(atual)!) saida[id] = numero
      } else if (idDaChaveDoNumeroNovo(id) && lerNumero(numero)) {
        // O número novo da decisão 48: o MAIOR (veja acima).
        if (atual === undefined || comparar(numero, atual) > 0) saida[id] = numero
      }
    }
  }
  return Object.fromEntries(Object.entries(saida).sort((x, y) => comparar(x[0], y[0])))
}

/** Confere um mapa vindo de fora (o `numeros` do estado.json): só entradas válidas. */
export function validarConfirmados(x: unknown): Record<string, string> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return {}
  return unirConfirmados(x as Confirmados, {})
}

/**
 * Decisão 48 (veja NÚMERO TOMADO POR UM LIVRO): os objetos SKC cujo número confirmado um objeto do livro tomou e que têm
 * agora um provisório; a testemunha nova (`numero` = o provisório, `numeroTomadoPeloLivro` = o tomado) que a consolidação
 * escreve no diário junto com o estado.json que ela grava. Calculado sobre a MESMA numeração da consolidação.
 */
export function testemunhasDoLivro(numeracao: Pick<Numeracao, 'porId'>): { id: string; campos: { numero: string; numeroTomadoPeloLivro: string } }[] {
  const saida: { id: string; campos: { numero: string; numeroTomadoPeloLivro: string } }[] = []
  for (const i of numeracao.porId.values()) {
    if (i.conflito !== 'livro' || i.situacao !== 'provisorio' || i.numero === null || i.reserva !== null || i.numeroTomadoPeloLivro === null) continue
    saida.push({ id: i.id, campos: { numero: i.numero, numeroTomadoPeloLivro: i.numeroTomadoPeloLivro } })
  }
  return saida.sort((a, b) => comparar(a.id, b.id))
}

/**
 * Os confirmados cujo registro existe e ainda não tem a testemunha (`numero` e/ou `nrSkc`): o que falta escrever no
 * diário, um `alterar` por objeto com os campos que faltam. O número novo da decisão 48 (`LIVRO:<id>`) vale mais que o
 * do mapa (o tomado): falta a testemunha dele se o registro não tem nenhuma ou tem a do número tomado.
 */
export function testemunhasFaltando(estado: Estado, confirmados: Confirmados): { id: string; campos: CamposDaTestemunha }[] {
  const objetos = objetosDe(estado)
  const ids = new Set<string>()
  for (const chave of Object.keys(confirmados)) {
    const id = idDaChaveDoMapa(chave)
    if (objetos.has(id)) ids.add(id)
  }
  const faltam: { id: string; campos: CamposDaTestemunha }[] = []
  for (const id of [...ids].sort(comparar)) {
    const campos = testemunhaDoObjeto(objetos.get(id)!, confirmados)
    if (Object.keys(campos).length > 0) faltam.push({ id, campos })
  }
  return faltam
}

/** Os campos de uma testemunha do número (veja `testemunhaDoObjeto`). */
export type CamposDaTestemunha = {
  numero?: string
  numeroTomadoPeloLivro?: string
  nrSkc?: string
}

/**
 * A regra da testemunha de UM objeto, com um dono só (`testemunhasFaltando` e a restauração de uma cópia,
 * src/copias/restaurar.ts): dado o registro (os valores que ele tem, ou terá) e o mapa de confirmados, os campos que faltam.
 * - `numero`: o confirmado (`<id>`), se o registro não tem um número válido;
 * - o número novo da decisão 48 (`LIVRO:<id>`, diferente do tomado, num objeto que não é reserva) vale mais que o do mapa:
 *   `numero` = o novo e `numeroTomadoPeloLivro` = o tomado, se o registro não tem número ou tem o tomado;
 * - `nrSkc`: o confirmado (`SKC:<id>`), se o registro não tem um válido.
 * Vazio para um id que não é de objeto SKC.
 */
export function testemunhaDoObjeto(r: { id: string; campos: Readonly<Record<string, Json>> }, confirmados: Confirmados): CamposDaTestemunha {
  const t: CamposDaTestemunha = {}
  if (!idDeObjetoSkc(r.id)) return t
  const tomado = confirmados[r.id]
  const novo = confirmados[chaveDoNumeroNovo(r.id)]
  const temNumero = lerNumero(r.campos.numero) !== null
  if (lerNumero(novo) && lerNumero(tomado) && tomado !== novo && reservaDe(r) === null && (!temNumero || r.campos.numero === tomado)) {
    t.numero = novo
    t.numeroTomadoPeloLivro = tomado
  } else if (lerNumero(tomado) && !temNumero) {
    t.numero = tomado
  }
  const nr = confirmados[chaveDoNrSkc(r.id)]
  if (lerNrSkc(nr) !== null && lerNrSkc(r.campos.nrSkc) === null) t.nrSkc = nr
  return t
}
