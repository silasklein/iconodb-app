/**
 * Rede de segurança do rascunho. Quando a página se esconde ou é descartada (`pagehide`, `visibilitychange`), gravar no
 * IndexedDB leva vários passos assíncronos e o navegador pode derrubar a página no meio (recarregar logo após digitar,
 * aba morta em segundo plano no iPhone): num teste real com o Chromium o texto ficava de fora. O `localStorage` é
 * síncrono: nesse instante o texto ainda não gravado é guardado aqui, na mesma tarefa do evento, e `recuperarEmergencias`
 * (na abertura do app) o transforma em nota. Quando o IndexedDB confirma a gravação, o rascunho limpa o que guardou aqui.
 *
 * É só para o que está por gravar, por segundos: nunca é a cópia de referência de uma nota.
 *
 * Regras da recuperação:
 * - NUNCA passa por cima de um texto mais novo. A entrada leva `base`, o hlc do `texto` de que o rascunho partiu. Se o
 *   `texto` da nota ainda tem esse hlc, ninguém mexeu nele depois e o texto guardado entra como `alterar`. Se o hlc
 *   mudou (outra aba ou aparelho editou, ou a nota é outra), a nota fica como está e o texto guardado vira uma NOVA nota
 *   no mesmo lugar, que começa com "Texto recuperado de dd/mm/aaaa hh:mm", para a pessoa conferir e juntar à mão.
 *   Um `alterar` com hlc de agora venceria a edição mais nova (o hlc é do momento da gravação, não da digitação).
 * - Uma gravação em voo no `pagehide` (A-5 da Tarefa 17): a entrada leva `emVoo`, o texto que estava sendo gravado. Se a
 *   página morreu depois de ele chegar ao IndexedDB, a nota tem esse texto com um hlc além da `base`: é o próprio rascunho,
 *   não outra edição, e o texto guardado entra como `alterar` (sem cópia). Se a gravação volta com o texto já sujo de novo,
 *   o rascunho regrava a entrada com a base nova.
 * - Nunca duplica. O id da nota vai para a entrada antes de qualquer `registrar` (uma queda entre os dois não gera uma
 *   segunda nota na próxima abertura), e uma nota que já existe com o mesmo texto não é tocada.
 * - Não pega entrada de aba viva. Cada entrada leva `aba` (um id guardado no sessionStorage: sobrevive a recarregar, que é
 *   justamente o caso de recuperar na hora; uma aba duplicada ganha outro, veja `idDaAba`) e `salvoEm`. De OUTRA aba, com menos de 5 s, a entrada fica onde está (sem ser
 *   apagada): aquela aba pode estar só escondida e prestes a gravar. Fica para a próxima abertura do app. A recuperação só
 *   decide quais entradas são desta aba depois da resposta das outras abas (`abaConfirmada`, até 250 ms); sem
 *   BroadcastChannel, um id herdado não basta, e a entrada recente com ele também espera a próxima abertura.
 *
 * Além das notas, há a entrada de CAMPO (`guardarEmergenciaDeCampo`): o texto de UM campo de qualquer registro
 * (`tipo`, `reg`, `campo`), que é o que `useCampoSalvo` guarda no `pagehide`. As mesmas regras, em versão mais simples:
 * - Só se aplica por cima se o hlc do campo ainda é a `base` (o hlc de quando a pessoa começou a mexer). Se mudou, o valor
 *   mais novo fica e a entrada é descartada: o texto guardado NÃO é escrito em lugar nenhum (nem no histórico do campo, que
 *   só guarda o que um evento gravado perdeu). Diferente da nota, que nesse caso é salva como cópia "Texto recuperado de …".
 * - Idempotente: se o campo já tem o texto, nada é escrito; a entrada some. Repetir a recuperação não cria outro evento.
 * - O registro tem de existir e não estar excluído (o campo não cria registros); do contrário a entrada é descartada. A
 *   exceção é a entrada com `criar` (o verbete do pacote da Tarefa 11, que não tem `criar`): ela vale mesmo sem o registro.
 * - A regra dos 5 s de outra aba é a mesma. Se a gravação falhar, a entrada fica para a próxima abertura.
 */
import { estadoAtual, proximoId, registrar } from './estado'
import { jsonCanonico, TIPOS, type Campos, type Json, type Tipo } from './eventos'

const PREFIXO = 'iconodb:emergencia:'
/** Entradas de outra aba mais novas que isto podem ser de uma aba ainda viva. */
export const JANELA_DA_ABA_VIVA_MS = 5000

export interface Emergencia {
  /** O id da nota, se já foi reservado; sem ele a recuperação pede um novo (e o guarda antes de criar). */
  reg: string | null
  /** O hlc do `texto` de que o rascunho partiu (a nota nova: null). Só se aplica por cima se a nota ainda o tem. */
  base: string | null
  /** O que a nota tem: `texto`, `alvoTipo`, `alvo`, `rascunho` e, ao criar, `ancoras`. */
  campos: Campos
  /**
   * O texto de uma gravação que estava em andamento quando a entrada foi guardada (A-5 da Tarefa 17). Ela pode ter chegado ao
   * IndexedDB sem a página ver: então a nota tem este texto com um hlc depois da `base`, e a recuperação o trata como a base.
   */
  emVoo?: string
}

/** O texto de um campo de um registro qualquer, por gravar. */
export interface EmergenciaDeCampo {
  tipo: Tipo
  reg: string
  campo: string
  /** O texto já como será gravado (aparado, se o campo apara). */
  texto: string
  /** O hlc do campo quando a pessoa começou a mexer (`null`: o campo ainda não tinha valor). */
  base: string | null
  /** O valor que iria no evento, quando não é o texto (por exemplo `null` para "voltar à forma original", `valorGravado` do campo). */
  valor?: Json
  /** O registro pode não existir ainda e o `alterar` o cria (um verbete do pacote, Tarefa 11; `criaRegistro` do campo). */
  criar?: boolean
  /** O valor da gravação que estava em andamento (A-5 da Tarefa 17; veja `Emergencia.emVoo`). */
  emVoo?: Json
}

interface Guardada extends Emergencia {
  salvoEm: number
  aba: string
  /** O id da nota recuperada como cópia, guardado antes de criá-la. */
  copia?: string
}

interface CampoGuardado extends EmergenciaDeCampo {
  salvoEm: number
  aba: string
}

/** Uma entrada lida do localStorage: de nota (a primeira forma) ou de campo. */
type Lida = { nota: Guardada } | { campo: CampoGuardado }

const guardas = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

let abaSemStorage: string | null = null
const sorteio = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
const CHAVE_DA_ABA = 'iconodb:aba'
const CANAL_DAS_ABAS = 'iconodb-abas'
/** Quanto tempo depois de perguntar uma resposta "esse id é meu" ainda conta (A-6). */
const JANELA_DA_PERGUNTA_MS = 3000
/**
 * Quanto a recuperação da abertura espera a resposta "esse id é meu" de outra aba viva antes de decidir quais entradas são
 * desta aba (revisão 1 da Tarefa 17a). Duas abas do mesmo navegador respondem em poucos milissegundos.
 */
export const ESPERA_DA_RESPOSTA_DA_ABA_MS = 250
/** O id desta página (lido uma vez por carga). */
let abaDestaPagina: string | null = null
let canal: BroadcastChannel | null = null
let perguntouEm = 0
/** O id desta aba depois da pergunta pelo canal (ver `abaConfirmada`). */
let confirmacao: Promise<AbaConfirmada> | null = null
let confirmar: ((c: AbaConfirmada) => void) | null = null

/**
 * `certa`: só esta aba pode ter este id. Falso quando o id veio do sessionStorage (recarregar, voltar/avançar, ou uma aba
 * duplicada que o navegador marca assim) e não houve como perguntar às outras abas (sem BroadcastChannel).
 */
interface AbaConfirmada {
  id: string
  certa: boolean
}

function tipoDeNavegacao(): string | undefined {
  try {
    return (performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined)?.type
  } catch {
    return undefined
  }
}

/**
 * O id desta aba: o mesmo depois de RECARREGAR (sessionStorage), que é justamente o caso de recuperar na hora o que a página
 * guardou ao ir embora; sem sessionStorage, um por carga da página. A-6 da Tarefa 17: uma aba duplicada (ou aberta por
 * outra) herda o sessionStorage, e com ele o id; então o id guardado só vale numa recarga ou num voltar/avançar
 * (`performance.getEntriesByType('navigation')`); numa navegação nova, a aba ganha outro. E como o Chromium marca a aba
 * duplicada como `back_forward`, a página também pergunta pelo BroadcastChannel se outra aba viva tem o mesmo id; se tem,
 * esta (a que perguntou) troca o seu. A recuperação espera essa resposta (`abaConfirmada`).
 */
function idDaAba(): string {
  if (abaDestaPagina) return abaDestaPagina
  try {
    const tipo = tipoDeNavegacao()
    let id = tipo === 'reload' || tipo === 'back_forward' ? sessionStorage.getItem(CHAVE_DA_ABA) : null
    const herdado = id !== null
    if (!id) {
      id = sorteio()
      sessionStorage.setItem(CHAVE_DA_ABA, id)
    }
    abaDestaPagina = id
    vigiarAAba(herdado)
    return id
  } catch {
    abaSemStorage ??= sorteio()
    confirmacao ??= Promise.resolve({ id: abaSemStorage, certa: true })
    return abaSemStorage
  }
}

/**
 * O id desta aba para decidir quais entradas são dela. Com um id herdado do sessionStorage, espera a resposta das outras
 * abas (até `ESPERA_DA_RESPOSTA_DA_ABA_MS`): se uma aba viva tem o mesmo id, esta é a duplicada e já trocou o seu. Sem
 * BroadcastChannel, o id herdado fica `certa: false` (pode ser o de uma aba viva). Um id sorteado agora não espera.
 */
function abaConfirmada(): Promise<AbaConfirmada> {
  const id = idDaAba()
  return confirmacao ?? Promise.resolve({ id, certa: true })
}

/** Começa a pergunta pelo id desta aba (na abertura do app, para a espera correr junto com o carregamento). */
export function perguntarPelaAba(): void {
  idDaAba()
}

/** Resolve a espera da pergunta com o id que a aba tem agora (o mesmo, ou o novo, se outra aba respondeu). */
function terminar(): void {
  const f = confirmar
  confirmar = null
  if (f && abaDestaPagina) f({ id: abaDestaPagina, certa: true })
}

function vigiarAAba(herdado: boolean): void {
  const id = abaDestaPagina!
  // Um id sorteado agora é só desta aba. Um herdado, sem canal para perguntar, pode ser o de uma aba viva.
  const semPergunta = (): void => {
    confirmacao = Promise.resolve({ id, certa: !herdado })
  }
  if (typeof BroadcastChannel === 'undefined') return semPergunta()
  try {
    canal = new BroadcastChannel(CANAL_DAS_ABAS)
  } catch {
    return semPergunta()
  }
  if (!herdado) confirmacao = Promise.resolve({ id, certa: true })
  else {
    confirmacao = new Promise<AbaConfirmada>((resolve) => {
      confirmar = resolve
    })
    // Ninguém respondeu a tempo: nenhuma aba viva tem este id (a página de antes morreu, num recarregar).
    setTimeout(() => terminar(), ESPERA_DA_RESPOSTA_DA_ABA_MS)
  }
  canal.onmessage = (e: MessageEvent) => {
    const m = e.data as { tipo?: unknown; id?: unknown } | null
    if (!m || typeof m.id !== 'string' || m.id !== abaDestaPagina) return
    if (m.tipo === 'quem') canal?.postMessage({ tipo: 'eu', id: m.id })
    else if (m.tipo === 'eu' && Date.now() - perguntouEm < JANELA_DA_PERGUNTA_MS) {
      // Outra aba viva tem este id (esta é a duplicada): esta passa a ter outro.
      const novo = sorteio()
      abaDestaPagina = novo
      perguntouEm = 0
      try {
        sessionStorage.setItem(CHAVE_DA_ABA, novo)
      } catch {
        // sem sessionStorage, o id novo vale até a página fechar
      }
      terminar()
    }
  }
  perguntouEm = Date.now()
  canal.postMessage({ tipo: 'quem', id: abaDestaPagina })
}

/** Fecha o canal das abas (testes). */
export function pararDeVigiarAAba(): void {
  canal?.close()
  canal = null
}

export function guardarEmergencia(chave: string, dado: Emergencia): void {
  gravar(PREFIXO + chave, { ...dado, salvoEm: Date.now(), aba: idDaAba() })
}

/** Guarda, de forma síncrona, o texto de um campo por gravar. `chave` é única por campo em edição (o `useCampoSalvo` sorteia uma). */
export function guardarEmergenciaDeCampo(chave: string, dado: EmergenciaDeCampo): void {
  gravar(PREFIXO + chave, { ...dado, salvoEm: Date.now(), aba: idDaAba() })
}

/** `chave` é a chave completa do localStorage. */
function gravar(chave: string, dado: Guardada | CampoGuardado): void {
  try {
    guardas()?.setItem(chave, JSON.stringify(dado))
  } catch {
    // Sem espaço ou bloqueado: o IndexedDB ainda é a via principal.
  }
}

/** Há uma entrada guardada com esta chave? */
export function temEmergencia(chave: string): boolean {
  try {
    return guardas()?.getItem(PREFIXO + chave) != null
  } catch {
    return false
  }
}

export function limparEmergencia(chave: string): void {
  try {
    guardas()?.removeItem(PREFIXO + chave)
  } catch {
    // idem
  }
}

const chaves = (): string[] => {
  const s = guardas()
  if (!s) return []
  const lista: string[] = []
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i)
    if (k?.startsWith(PREFIXO)) lista.push(k)
  }
  return lista
}

/** Quantos rascunhos de emergência há guardados (para os testes). */
export const totalDeEmergencias = (): number => chaves().length

function lerEmergencia(bruto: string | null): Lida | null {
  if (!bruto) return null
  try {
    const v = JSON.parse(bruto) as (Partial<Guardada> & Partial<EmergenciaDeCampo>) | null
    if (!v || typeof v !== 'object') return null
    const salvoEm = typeof v.salvoEm === 'number' ? v.salvoEm : 0
    const aba = typeof v.aba === 'string' ? v.aba : ''
    const base = typeof v.base === 'string' ? v.base : null
    if (v.campo !== undefined) {
      // Entrada de campo: precisa de um tipo conhecido, do registro, do nome do campo e do texto.
      if (!TIPOS.includes(v.tipo as Tipo) || typeof v.reg !== 'string' || typeof v.campo !== 'string' || typeof v.texto !== 'string') return null
      return { campo: { tipo: v.tipo as Tipo, reg: v.reg, campo: v.campo, texto: v.texto, base, salvoEm, aba, ...(v.criar === true ? { criar: true } : {}), ...(v.valor !== undefined ? { valor: v.valor } : {}), ...(v.emVoo !== undefined ? { emVoo: v.emVoo } : {}) } }
    }
    if (v.reg !== null && typeof v.reg !== 'string') return null
    const c = v.campos as Record<string, unknown> | undefined
    if (!c || typeof c !== 'object' || typeof c.texto !== 'string') return null
    return { nota: { reg: v.reg ?? null, base, campos: c as Campos, salvoEm, aba, copia: typeof v.copia === 'string' ? v.copia : undefined, ...(typeof v.emVoo === 'string' ? { emVoo: v.emVoo } : {}) } }
  } catch {
    return null
  }
}

const dois = (n: number) => String(n).padStart(2, '0')
function marcaDeRecuperacao(em: number): string {
  const d = new Date(em || Date.now())
  return `Texto recuperado de ${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`
}

/**
 * Na abertura do app, com o estado já carregado: cada texto guardado vira nota (se o IndexedDB não chegou a criá-la), atualiza
 * o texto dela (se ninguém mexeu nele desde a base) ou vira uma nota nova marcada "Texto recuperado de …". Notas excluídas
 * não voltam. Devolve quantas notas foram escritas. O que está malformado é descartado; o que não pôde ser gravado fica.
 */
export async function recuperarEmergencias(): Promise<number> {
  const s = guardas()
  if (!s) return 0
  // A-6 (revisão 1): só depois da resposta das outras abas se sabe se o id herdado é desta aba ou de uma viva.
  const { id: minha, certa } = await abaConfirmada()
  let escritas = 0
  for (const chave of chaves()) {
    const lida = lerEmergencia(s.getItem(chave))
    try {
      if (!lida) {
        s.removeItem(chave)
        continue
      }
      const dado = 'nota' in lida ? lida.nota : lida.campo
      // Uma aba que pode estar viva (e prestes a gravar) não tem a entrada tomada; ela fica para a próxima abertura.
      // Sem como perguntar (sem BroadcastChannel), o id herdado pode ser o de uma aba viva: a entrada recente dele também fica.
      if ((dado.aba !== minha || !certa) && Date.now() - dado.salvoEm < JANELA_DA_ABA_VIVA_MS) continue
      escritas += 'nota' in lida ? await recuperar(chave, lida.nota) : await recuperarCampo(lida.campo)
      s.removeItem(chave)
    } catch {
      // Fica guardado para a próxima abertura (o id já escolhido também).
    }
  }
  return escritas
}

/**
 * O texto de um campo. Só entra se o hlc do campo é a base; um valor mais novo (outro aparelho ou aba) nunca é coberto. O
 * registro tem de existir e não estar excluído. Já tendo o texto, nada a fazer (idempotente).
 */
async function recuperarCampo(dado: CampoGuardado): Promise<number> {
  const registro = estadoAtual().registro(dado.tipo, dado.reg)
  if (registro ? registro.excluido : dado.criar !== true) return 0
  const valor = dado.valor !== undefined ? dado.valor : dado.texto
  if (registro && registro.campos[dado.campo] === valor) return 0
  // A base ainda vale, ou o valor por cima dela é o da gravação que estava em voo (o próprio campo chegou lá; A-5).
  const emVooChegou = dado.emVoo !== undefined && registro !== undefined && jsonCanonico(registro.campos[dado.campo] ?? null) === jsonCanonico(dado.emVoo)
  if (estadoAtual().hlcDoCampo(dado.tipo, dado.reg, dado.campo) !== dado.base && !emVooChegou) return 0
  await registrar(dado.tipo, dado.reg, 'alterar', { [dado.campo]: valor })
  return 1
}

async function recuperar(chave: string, dado: Guardada): Promise<number> {
  // O id vai para a entrada ANTES de qualquer escrita: uma queda no meio não gera uma segunda nota.
  let reg = dado.reg
  if (reg === null) {
    reg = await proximoId('NT')
    gravar(chave, { ...dado, reg })
  }
  const texto = dado.campos.texto as string
  const existente = estadoAtual().registro('nota', reg)
  if (!existente) {
    // Criar exige o lugar da nota; sem ele não há onde pôr o texto (descartado).
    if (typeof dado.campos.alvoTipo !== 'string' || typeof dado.campos.alvo !== 'string') return 0
    await registrar('nota', reg, 'criar', dado.campos)
    return 1
  }
  if (existente.excluido || existente.campos.texto === texto) return 0
  // A base ainda vale, ou o texto por cima dela é o da gravação que estava em voo (o próprio rascunho chegou lá).
  const emVooChegou = dado.emVoo !== undefined && existente.campos.texto === dado.emVoo
  if (estadoAtual().hlcDoCampo('nota', reg, 'texto') === dado.base || emVooChegou) {
    await registrar('nota', reg, 'alterar', { texto })
    return 1
  }
  // O texto da nota mudou depois da base: não se passa por cima. O guardado vira outra nota, no mesmo lugar.
  const alvoTipo = existente.campos.alvoTipo ?? dado.campos.alvoTipo
  const alvo = existente.campos.alvo ?? dado.campos.alvo
  if (typeof alvoTipo !== 'string' || typeof alvo !== 'string') return 0
  let copia = dado.copia
  if (!copia) {
    copia = await proximoId('NT')
    gravar(chave, { ...dado, reg, copia })
  }
  if (estadoAtual().registro('nota', copia)) return 0
  const campos: Campos = { texto: `${marcaDeRecuperacao(dado.salvoEm)}\n\n${texto}`, alvoTipo, alvo, rascunho: true }
  await registrar('nota', copia, 'criar', campos)
  return 1
}
