/**
 * O modelo das coleções SKC (Tarefa 7): a leitura de um registro `colecao` e as regras da ordem. Puro: sem React,
 * sem IndexedDB.
 *
 * FORMATO DOS CAMPOS (congelado: o porte para Python da Tarefa 16 lê e escreve exatamente isto):
 * - `nome` (texto) e `descricao` (texto, opcional);
 * - para CADA membro, DOIS campos independentes, com a mesma `ref`:
 *   - `m:<ref>`: a PRESENÇA. `true` = está na coleção; `null` = foi tirado. Só acrescentar, tirar e "Desfazer" escrevem.
 *   - `i:<ref>`: a ORDEM, um inteiro seguro (passo de 1024, no meio entre os vizinhos ao mover). Só mover e renumerar
 *     escrevem. Nunca vale `null`: tirar não toca nela.
 *   A `ref` é o número do objeto (`CA00023`, em maiúsculas) ou, para um objeto SKC, o id dele (`OB-<aparelho>-<n>`),
 *   que não muda se o número provisório mudar.
 * - Leitura: o objeto é membro se, e só se, `m:<ref>` é `true` E `i:<ref>` é um inteiro seguro. A lista sai ordenada
 *   por `i:`, com a ref (ponto de código) desempatando.
 * - Escrita: acrescentar (e pôr de volta depois de tirar) grava `m:<ref>: true` e `i:<ref>` = fim da lista, num evento.
 *   Tirar grava só `m:<ref>: null`. "Desfazer" de tirar grava `m:<ref>: true` e, no máximo, `i:<ref>` (ver
 *   `planejarDevolver`: onde cai a ordem é escolha do app; o contrato é o formato dos campos). Mover grava só `i:<ref>`.
 *   Renumerar grava `i:` de TODOS os presentes (mesmo dos que não mudam de valor), num só evento.
 *
 * PARA O PORTE PARA PYTHON (Tarefa 16), a leitura tem de dar exatamente o que `lerColecao` dá:
 * - `m:<ref>` só conta se o valor é exatamente o `true` do JSON. `1`, `"true"`, `"yes"` e qualquer outro valor NÃO contam
 *   (em Python, compare com `is True`, não use o valor como booleano).
 * - `i:<ref>` tem de ser um inteiro do JSON, de módulo no máximo 2^53 − 1. Um booleano não é inteiro (em Python
 *   `isinstance(True, int)` é verdadeiro: exclua `bool` à mão). Um float como `1024.0` também não vale (o JS lê `1024.0`
 *   como 1024 e o aceitaria; o app nunca o escreve, e o porte também só escreve inteiros).
 * - A `ref` do nome do campo é um NÚMERO DO SISTEMA (o padrão único de objetos-skc/numeracao.ts, `FONTE_DO_NUMERO`):
 *   `(?:NT|NE|CA|BA|BI|BM|BT|F1|F2|F3|PE|HE|RO)[0-9]{5}`, que inclui Ferro I–III (`F100001`; revisão 1 da Tarefa 9b),
 *   ou um id de objeto SKC `OB-[a-z0-9]{8}-[0-9]+`, inteira (sem espaços nas pontas). Em Python, com as classes
 *   explícitas acima (nada de `\d`, que aceita dígitos de outros alfabetos) e `re.fullmatch` (o `$` do Python casa
 *   também antes de um `\n` no fim). A ref canônica é a que não muda ao normalizar: o número em MAIÚSCULAS
 *   (`ca00001` e `f100001` não são canônicas; `re.fullmatch` sem `re.IGNORECASE` sobre a ref tal como está). Nenhum outro
 *   par de letras vale (`ZZ00001` não é membro).
 * - Campo cuja ref não é canônica é IGNORADO na leitura (não é membro, não dá erro): nunca o corrija nem o apague.
 * - Membro: `m:` é `true` E `i:` é um inteiro válido. A ordenação é por `i:` e, nos empates, pela ref em ponto de código.
 *
 * Por que um campo por membro, e presença separada da ordem: a fusão da Tarefa 2 é por (tipo, reg, campo), a escrita
 * mais nova vence.
 * - Dois aparelhos que acrescentam objetos diferentes ficam os dois (campos diferentes). Uma lista inteira num só
 *   campo perderia um dos acréscimos.
 * - Tirar e pôr de novo é `m:` null e depois true: a ref é a chave, então nunca há duplicata.
 * - Mover ou renumerar escreve só `i:`, então NUNCA traz de volta quem outro aparelho tirou (se a presença e a ordem
 *   dividissem o campo, uma renumeração ou um movimento mais novo ressuscitaria o objeto tirado).
 * - Mover um objeto escreve UM campo: a ordem nova, no meio entre os vizinhos (inteiros esparsos). Só quando não há
 *   espaço entre os vizinhos (ou há ordens iguais, ou o valor fugiria do limite) renumera todos, num só evento.
 * - Como a renumeração escreve TODOS os presentes, duas renumerações concorrentes não se misturam: a mais nova vence
 *   inteira, sem empates, e é exatamente a visão de um dos aparelhos.
 * - Ordens iguais (dois aparelhos pararam no mesmo meio) não quebram a convergência: o desempate é a ref, por
 *   ponto de código, igual em todos os aparelhos.
 * - Os eventos antigos de cada campo (as ordens e presenças que perderam) ficam no histórico da Tarefa 2.
 */
import type { Campos } from '../usuario/eventos'
import { compararPorPontoDeCodigo } from '../usuario/eventos'
import type { Registro } from '../usuario/fusao'
import type { Hlc } from '../usuario/hlc'
import { RE_NUMERO_DIGITADO } from '../objetos-skc/numeracao'

export const PASSO_DA_ORDEM = 1024
/** Uma ordem com módulo acima disto força a renumeração (muito longe do zero, depois de muitas passagens ao início ou ao fim). */
export const MAXIMO_DA_ORDEM = 2 ** 40
const PREFIXO_DA_ORDEM = 'i:'
const PREFIXO_DA_PRESENCA = 'm:'

/** O campo da ORDEM do membro (`i:<ref>`): um inteiro. */
export const campoDaOrdem = (ref: string): string => `${PREFIXO_DA_ORDEM}${ref}`
/** O campo da PRESENÇA do membro (`m:<ref>`): `true` ou `null` (tirado). */
export const campoDaPresenca = (ref: string): string => `${PREFIXO_DA_PRESENCA}${ref}`

/** A ref de um campo de ordem ou de presença; `null` para qualquer outro campo. */
export function refDoCampo(campo: string): string | null {
  for (const prefixo of [PREFIXO_DA_ORDEM, PREFIXO_DA_PRESENCA]) {
    if (campo.startsWith(prefixo) && campo.length > prefixo.length) return campo.slice(prefixo.length)
  }
  return null
}

const ID_DE_OBJETO_SKC = /^OB-[a-z0-9]{8}-\d+$/

/** A ref de um objeto que um valor escreve: o número em maiúsculas ou o id de objeto SKC. `null` se não for um. */
export function refDeObjeto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const v = valor.trim()
  if (RE_NUMERO_DIGITADO.test(v)) return v.toUpperCase()
  if (ID_DE_OBJETO_SKC.test(v)) return v
  return null
}

export interface Membro {
  ref: string
  ordem: number
}

export interface ColecaoVista {
  id: string
  nome: string
  descricao: string
  /** Do primeiro ao último, já pela ordem (empates desfeitos pela ref). Sem os tirados. */
  membros: readonly Membro[]
  criadaEm: Hlc
  alteradaEm: Hlc
  excluida: boolean
  registro: Registro
}

const ordemValida = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)

export const compararMembros = (a: Membro, b: Membro): number => a.ordem - b.ordem || compararPorPontoDeCodigo(a.ref, b.ref)

const lidas = new WeakMap<Registro, ColecaoVista>()

/** A coleção lida de um registro (o mesmo objeto enquanto o registro não muda). Tudo o que vem de evento é tratado como possivelmente malformado. */
export function lerColecao(r: Registro): ColecaoVista {
  const guardada = lidas.get(r)
  if (guardada) return guardada
  const membros: Membro[] = []
  for (const [campo, valor] of Object.entries(r.campos)) {
    if (!campo.startsWith(PREFIXO_DA_PRESENCA) || valor !== true) continue
    const ref = campo.slice(PREFIXO_DA_PRESENCA.length)
    const ordem = r.campos[campoDaOrdem(ref)]
    if (refDeObjeto(ref) !== ref || !ordemValida(ordem)) continue
    membros.push({ ref, ordem })
  }
  membros.sort(compararMembros)
  const lida: ColecaoVista = {
    id: r.id,
    nome: typeof r.campos.nome === 'string' ? r.campos.nome : '',
    descricao: typeof r.campos.descricao === 'string' ? r.campos.descricao : '',
    membros,
    criadaEm: r.criadoEm,
    alteradaEm: r.alteradoEm,
    excluida: r.excluido,
    registro: r,
  }
  lidas.set(r, lida)
  return lida
}

/** Os campos que acrescentam estas refs ao fim da lista (quem já é membro e as repetidas ficam de fora): a presença e a ordem de cada uma. */
export function planejarAcrescentar(atual: readonly Membro[], refs: readonly string[]): Campos {
  const ja = new Set(atual.map((m) => m.ref))
  let ultima = atual.length > 0 ? Math.max(...atual.map((m) => m.ordem)) : 0
  const campos: Campos = {}
  for (const ref of refs) {
    if (ja.has(ref)) continue
    ja.add(ref)
    ultima += PASSO_DA_ORDEM
    campos[campoDaPresenca(ref)] = true
    campos[campoDaOrdem(ref)] = ultima
  }
  return campos
}

export interface Plano {
  campos: Campos
  /** Não havia espaço entre os vizinhos: todas as ordens foram refeitas (num só evento). */
  renumerou: boolean
}

/**
 * Os campos que levam o membro da posição `de` à posição `para` (índices da lista de agora; `para` é o índice que
 * ele terá na lista nova). Um só campo (a ordem), no meio entre os vizinhos; se não couber, renumera todos.
 */
export function planejarMover(atual: readonly Membro[], de: number, para: number): Plano {
  const n = atual.length
  if (!Number.isInteger(de) || !Number.isInteger(para) || de < 0 || de >= n || para < 0 || para >= n) throw new RangeError(`Posição fora da coleção: de ${de} para ${para} (há ${n})`)
  if (de === para) return { campos: {}, renumerou: false }
  const nova = atual.slice()
  const [movido] = nova.splice(de, 1)
  nova.splice(para, 0, movido!)
  const antes = nova[para - 1]
  const depois = nova[para + 1]
  let ordem: number | null
  if (antes && depois) ordem = depois.ordem - antes.ordem >= 2 ? antes.ordem + Math.floor((depois.ordem - antes.ordem) / 2) : null
  else if (antes) ordem = antes.ordem + PASSO_DA_ORDEM
  else ordem = depois!.ordem - PASSO_DA_ORDEM
  if (ordem !== null && Math.abs(ordem) <= MAXIMO_DA_ORDEM) return { campos: { [campoDaOrdem(movido!.ref)]: ordem }, renumerou: false }

  // Renumera: a ordem de TODOS os presentes, também dos que não mudam de valor. Assim a renumeração mais nova vence
  // inteira (uma que escrevesse só o que mudou se misturaria com a ordem de outra, concorrente, e deixaria empates).
  const campos: Campos = {}
  nova.forEach((m, i) => {
    campos[campoDaOrdem(m.ref)] = (i + 1) * PASSO_DA_ORDEM
  })
  return { campos, renumerou: true }
}

/** Onde um membro estava quando foi tirado: a ordem e os vizinhos de então (`null`: era o primeiro ou o último). Para o "Desfazer". */
export interface Lugar {
  ordem: number
  antes: string | null
  depois: string | null
}

/**
 * Os campos do "Desfazer" de tirar: a presença (`m:<ref>: true`) e, se preciso, a ordem. `guardada` é o `i:<ref>` que o
 * registro tem agora. Se os vizinhos de antes continuam presentes e vizinhos entre si (ou, nas pontas, o vizinho
 * continua sendo o primeiro ou o último), o objeto volta ENTRE eles: no meio das ordens deles (nas pontas, um passo
 * além). A ordem guardada só fica se já cai estritamente entre eles; do contrário (por exemplo, uma renumeração feita sem o
 * objeto deixou a ordem dele empatada com a de outro membro) escreve a nova. Sem os vizinhos, ou sem espaço entre eles,
 * vale a regra de antes: a ordem guardada fica e só é reescrita se sumiu ou ficou inválida.
 */
export function planejarDevolver(atual: readonly Membro[], ref: string, lugar: Lugar | number, guardada: unknown): Campos {
  const campos: Campos = { [campoDaPresenca(ref)]: true }
  const antes = typeof lugar === 'number' ? undefined : lugar.antes
  const depois = typeof lugar === 'number' ? undefined : lugar.depois
  const ordemDeAntes = typeof lugar === 'number' ? lugar : lugar.ordem
  const entre = antes === undefined || depois === undefined ? null : entreOsVizinhos(atual, antes, depois)
  if (entre) {
    const dentro = ordemValida(guardada) && (entre.piso === null || guardada > entre.piso) && (entre.teto === null || guardada < entre.teto)
    if (!dentro) campos[campoDaOrdem(ref)] = entre.ordem
  } else if (!ordemValida(guardada)) campos[campoDaOrdem(ref)] = ordemDeAntes
  return campos
}

function entreOsVizinhos(atual: readonly Membro[], antes: string | null, depois: string | null): { ordem: number; piso: number | null; teto: number | null } | null {
  if (antes === null && depois === null) return null
  const ia = antes === null ? -1 : atual.findIndex((m) => m.ref === antes)
  const id = depois === null ? atual.length : atual.findIndex((m) => m.ref === depois)
  if ((antes !== null && ia < 0) || (depois !== null && id < 0) || id !== ia + 1) return null
  const piso = antes === null ? null : atual[ia]!.ordem
  const teto = depois === null ? null : atual[id]!.ordem
  let ordem: number
  if (piso !== null && teto !== null) {
    if (teto - piso < 2) return null
    ordem = piso + Math.floor((teto - piso) / 2)
  } else ordem = piso !== null ? piso + PASSO_DA_ORDEM : teto! - PASSO_DA_ORDEM
  return Math.abs(ordem) <= MAXIMO_DA_ORDEM ? { ordem, piso, teto } : null
}

const SEPARADORES = /[\s,;]+/

/** Os códigos de objeto de um texto colado (separados por espaço, vírgula, ponto e vírgula ou linha), sem repetir. O resto vem à parte. */
export function extrairCodigos(texto: string): { codigos: string[]; ignorados: string[] } {
  const codigos = new Set<string>()
  const ignorados: string[] = []
  for (const bruto of texto.split(SEPARADORES)) {
    const palavra = bruto.replace(/[.:]+$/, '')
    if (palavra === '') continue
    const ref = refDeObjeto(palavra)
    if (ref) codigos.add(ref)
    else if (!ignorados.includes(palavra)) ignorados.push(palavra)
  }
  return { codigos: [...codigos], ignorados }
}
