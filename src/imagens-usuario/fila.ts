/**
 * A fila de envio das imagens do usuário. A fila É o OPFS (`local.ts`): cada imagem criada neste aparelho tem a sua
 * pasta até o Dropbox confirmar os três arquivos; `envio.json` diz o que já subiu. Por isso sobrevive a recarregar,
 * fechar o app e a aba suspensa do iPhone, sem um índice à parte que pudesse discordar dos arquivos.
 *
 * Quem envia é a sincronização (`useSincronizacao.ts`), com os mesmos gatilhos (abrir, mudança, rede de volta, aba
 * visível, Ctrl/⌘S):
 * 1. `telas`: tela e miniatura de cada imagem pendente (o que o outro aparelho precisa para mostrar), na rodada e sob
 *    a trava da sincronização;
 * 2. os eventos (sincronizar.ts);
 * 3. `originais`: DEPOIS da rodada, fora da trava dela (uma trava só sua, `iconodb-imagens-originais`). A rodada já
 *    foi registrada como feita; um original numa rede lenta não a segura nem a desfaz.
 * Assim o evento quase nunca chega ao outro aparelho antes da imagem de tela.
 *
 * Originais acima de `LIMIAR_EM_PARTES` (8 MB) sobem em partes de 4 MB (`Escrita.enviarEmPartes`, upload_session),
 * cada parte com o próprio prazo. A sessão vai para `envio.json` a cada parte: fechar o app, cair a rede ou passar o
 * prazo retoma de onde parou (sessão vencida no Dropbox: recomeça). O arquivo é fatiado direto do OPFS, sem cópia
 * inteira na memória; o original menor vai numa cópia só (a leitura do OPFS).
 *
 * Erros:
 * - nas telas: sem rede, sem login, sem permissão (`missing_scope`: ErroDePermissao) param a rodada e SOBEM para a
 *   sincronização, que mostra a mensagem de sempre (MSG_SEM_PERMISSAO, "Entrar de novo"). A imagem continua na fila e
 *   isso não conta como tentativa;
 * - nos originais nada sobe: sem rede ou prazo estourado é uma espera desta imagem (a fase para: a rede caiu para
 *   todas); sem login ou permissão, a fase para sem contar tentativa (a rodada seguinte mostra o erro);
 * - outro erro passageiro é só daquela imagem: ela espera (30 s, 2 min, 10 min, depois 1 h) e as outras seguem;
 * - erro PERMANENTE (outro conteúdo no mesmo caminho, arquivo grande demais, cópia local sumida): a imagem para de
 *   tentar sozinha, sai da conta "por enviar" e aparece na tela de Sincronização (`imagensComProblema`) com a
 *   explicação e "Tentar de novo" (`tentarImagemDeNovo`).
 * O envio é idempotente (`Escrita.enviar`: o mesmo conteúdo no mesmo caminho é ok), então reenviar depois de uma
 * resposta perdida não muda nada.
 *
 * Pasta sem evento (o app morreu entre gravar os arquivos e gravar o evento): não sobe e não é apagada (não há como
 * saber se outra aba está no meio de criá-la); fica no OPFS, invisível.
 */
import { ErroDeConflito, ErroDeLimiteDoEnvio, type Escrita, type SessaoDeEnvio } from '../dropbox/escrita'
import { eErroDeRede } from '../dropbox/rede'
import { ErroDePermissao } from '../dropbox/tentativas'
import { ErroDeLogin, ErroDeRede } from '../pacote/manifesto'
import { estadoAtual, type Estado } from '../usuario/estado'
import { arquivoLocal, bytesLocais, cacheDasImagens, gravarJsonLocal, idsLocais, lerJsonLocal, lerLocal, removerLocal, tipoDoArquivo } from './local'
import { arquivosDaImagem, lerImagem, type ArquivoDaImagem, type ImagemDoUsuario } from './registro'

export type Fase = 'telas' | 'originais' | 'tudo'

export interface EstadoDoEnvio {
  v: 1
  /** Os nomes dos arquivos que o Dropbox confirmou. */
  enviados: string[]
  /** Falhas seguidas desta imagem (não conta rede, login, permissão). */
  tentativas: number
  /** Antes disto (ms), não tenta de novo. */
  proxima: number | null
  erro: string | null
  /** Erro que não passa sozinho: não tenta mais até a pessoa pedir ("Tentar de novo"). */
  permanente?: boolean
  /** A sessão do envio em partes em andamento (para retomar). */
  sessao?: (SessaoDeEnvio & { nome: string }) | null
  /** O tipo do erro permanente (a tela oferece a ação que serve a cada um). */
  causa?: CausaPermanente | null
  /** Espera curta, que não conta tentativa: sem rede/prazo (zerada quando a rede volta) ou falta de memória. */
  espera?: 'rede' | 'memoria' | null
  /** Esperas de rede seguidas (30 s na primeira, depois 2 min). */
  esperasDeRede?: number
}

export type CausaPermanente = 'conflito' | 'limite' | 'copia-ausente'
/** Espera de rede ou prazo nos originais: 30 s e depois 2 min (não vira 1 h: a rede costuma voltar logo). */
export const ESPERAS_DE_REDE_MS = [30_000, 120_000] as const
/** Espera depois de faltar memória ao ler ou enviar (o aparelho pode liberar em seguida). */
export const ESPERA_DE_MEMORIA_MS = 30_000

export const ESTADO_INICIAL: EstadoDoEnvio = Object.freeze({ v: 1, enviados: [], tentativas: 0, proxima: null, erro: null }) as EstadoDoEnvio
export const ATRASOS_DO_ENVIO_MS = [30_000, 120_000, 600_000, 3_600_000] as const
/** Originais acima disto sobem em partes (upload_session). */
export const LIMIAR_EM_PARTES = 8 * 1024 * 1024

// ---------------------------------------------------------------------------------------------------- pura

export function faltando<T extends Pick<ArquivoDaImagem, 'nome' | 'fase'>>(estado: EstadoDoEnvio, arquivos: readonly T[], fase: Fase = 'tudo'): T[] {
  return arquivos.filter((a) => !estado.enviados.includes(a.nome) && (fase === 'tudo' || (fase === 'telas' ? a.fase === 'tela' : a.fase === 'original')))
}

export function completo(estado: EstadoDoEnvio, arquivos: readonly Pick<ArquivoDaImagem, 'nome'>[]): boolean {
  return arquivos.every((a) => estado.enviados.includes(a.nome))
}

export function podeTentar(estado: EstadoDoEnvio, agora: number): boolean {
  return !estado.permanente && (estado.proxima === null || agora >= estado.proxima)
}

export function aposEnvio(estado: EstadoDoEnvio, nome: string): EstadoDoEnvio {
  return { v: 1, enviados: estado.enviados.includes(nome) ? [...estado.enviados] : [...estado.enviados, nome], tentativas: 0, proxima: null, erro: null, sessao: null, esperasDeRede: 0 }
}

/** Espera curta que NÃO conta tentativa (revisão 2): rede/prazo (30 s, depois 2 min) ou memória (30 s). */
export function aposEsperaCurta(estado: EstadoDoEnvio, mensagem: string, agora: number, motivo: 'rede' | 'memoria'): EstadoDoEnvio {
  const esperasDeRede = motivo === 'rede' ? (estado.esperasDeRede ?? 0) + 1 : (estado.esperasDeRede ?? 0)
  const atraso = motivo === 'rede' ? ESPERAS_DE_REDE_MS[Math.min(esperasDeRede, ESPERAS_DE_REDE_MS.length) - 1]! : ESPERA_DE_MEMORIA_MS
  return { ...estado, v: 1, enviados: [...estado.enviados], proxima: agora + atraso, erro: mensagem.slice(0, 200), permanente: false, espera: motivo, esperasDeRede }
}

export function aposFalha(estado: EstadoDoEnvio, mensagem: string, agora: number): EstadoDoEnvio {
  const tentativas = estado.tentativas + 1
  const atraso = ATRASOS_DO_ENVIO_MS[Math.min(tentativas, ATRASOS_DO_ENVIO_MS.length) - 1]!
  return { ...estado, v: 1, enviados: [...estado.enviados], tentativas, proxima: agora + atraso, erro: mensagem.slice(0, 200), permanente: false, espera: null }
}

/** Erro que não passa sozinho: para de tentar até "Tentar de novo". */
export function aposErroPermanente(estado: EstadoDoEnvio, mensagem: string, causa: CausaPermanente | null = null): EstadoDoEnvio {
  return { ...estado, v: 1, enviados: [...estado.enviados], proxima: null, erro: mensagem.slice(0, 300), permanente: true, sessao: null, causa, espera: null }
}

/** "Tentar de novo": zera a espera e o erro (as partes já confirmadas e a sessão ficam). */
export function aposPedidoDeNovaTentativa(estado: EstadoDoEnvio): EstadoDoEnvio {
  return { ...estado, v: 1, enviados: [...estado.enviados], tentativas: 0, proxima: null, erro: null, permanente: false, causa: null, espera: null, esperasDeRede: 0 }
}

function lerEstadoDoEnvio(x: unknown): EstadoDoEnvio {
  const e = x as Partial<EstadoDoEnvio> | null
  if (!e || typeof e !== 'object' || !Array.isArray(e.enviados)) return ESTADO_INICIAL
  return {
    v: 1,
    enviados: e.enviados.filter((n): n is string => typeof n === 'string'),
    tentativas: typeof e.tentativas === 'number' && e.tentativas >= 0 ? e.tentativas : 0,
    proxima: typeof e.proxima === 'number' ? e.proxima : null,
    erro: typeof e.erro === 'string' ? e.erro : null,
    permanente: e.permanente === true,
    causa: e.causa === 'conflito' || e.causa === 'limite' || e.causa === 'copia-ausente' ? e.causa : null,
    espera: e.espera === 'rede' || e.espera === 'memoria' ? e.espera : null,
    esperasDeRede: typeof e.esperasDeRede === 'number' && e.esperasDeRede >= 0 ? e.esperasDeRede : 0,
    sessao:
      e.sessao && typeof e.sessao.id === 'string' && typeof e.sessao.nome === 'string' && Number.isSafeInteger(e.sessao.offset) && e.sessao.offset >= 0
        ? { id: e.sessao.id, offset: e.sessao.offset, nome: e.sessao.nome }
        : null,
  }
}

/** O arquivo não está mais no aparelho (o OPFS foi apagado, ou o navegador o tirou). */
class ErroDeCopiaAusente extends Error {
  constructor(nome: string) {
    super(`a cópia local de ${nome} não está no aparelho`)
    this.name = 'ErroDeCopiaAusente'
  }
}

/** Erros que nenhuma nova tentativa sozinha resolve, com a causa e a explicação para a tela. */
function explicacaoPermanente(erro: unknown): { causa: CausaPermanente; mensagem: string } | null {
  const nome = (erro as { name?: unknown } | null)?.name
  if (erro instanceof ErroDeConflito || nome === 'ErroDeConflito') {
    return { causa: 'conflito', mensagem: 'Já existe no Dropbox um arquivo com este nome e outro conteúdo; nada foi sobrescrito.' }
  }
  // Só o limite explícito do envio simples; outro RangeError (falta de memória) é passageiro (revisão 2).
  if (erro instanceof ErroDeLimiteDoEnvio || nome === 'ErroDeLimiteDoEnvio') return { causa: 'limite', mensagem: 'O arquivo é grande demais para enviar ao Dropbox.' }
  if (erro instanceof ErroDeCopiaAusente) {
    return { causa: 'copia-ausente', mensagem: 'O arquivo da imagem não está mais neste aparelho (o navegador pode ter apagado os dados do app); daqui ele não tem como subir.' }
  }
  return null
}

/** Faltou memória (ArrayBuffer que não coube, leitura que o navegador recusou): passageiro, espera curta. */
const eFaltaDeMemoria = (erro: unknown) => {
  const nome = (erro as { name?: unknown } | null)?.name
  return (erro instanceof RangeError && !(erro instanceof ErroDeLimiteDoEnvio)) || nome === 'NotReadableError'
}

/**
 * Grava o estado do envio de uma imagem UNINDO com o que já está no disco (revisão 2): as fases das telas e dos
 * originais podem ter lido o arquivo em momentos diferentes, e nenhuma confirmação pode se perder por uma gravação
 * feita a partir de uma leitura velha. Os `enviados` se somam; a sessão do envio em partes só muda por quem a avança
 * (`avancaSessao`), e some quando o arquivo dela já está confirmado. As gravações de uma imagem saem uma de cada vez
 * nesta aba. Devolve o estado que ficou gravado.
 */
const filas = new Map<string, Promise<unknown>>()
export function gravarEstadoDoEnvio(id: string, novo: EstadoDoEnvio, opcoes: { avancaSessao?: boolean } = {}): Promise<EstadoDoEnvio> {
  const anterior = filas.get(id) ?? Promise.resolve()
  const feito = anterior
    .catch(() => undefined)
    .then(async () => {
      const disco = lerEstadoDoEnvio(await lerJsonLocal(id, 'envio.json'))
      const enviados = [...disco.enviados, ...novo.enviados.filter((n) => !disco.enviados.includes(n))]
      let sessao = opcoes.avancaSessao ? (novo.sessao ?? null) : (disco.sessao ?? null)
      if (sessao && enviados.includes(sessao.nome)) sessao = null
      const final: EstadoDoEnvio = { ...novo, v: 1, enviados, sessao }
      await gravarJsonLocal(id, 'envio.json', final)
      return final
    })
  filas.set(
    id,
    feito.finally(() => {
      if (filas.get(id) === feito) filas.delete(id)
    }),
  )
  return feito
}

const lerEnvio = async (id: string) => lerEstadoDoEnvio(await lerJsonLocal(id, 'envio.json'))

const eRedeOuPrazo = (erro: unknown) => erro instanceof ErroDeRede || eErroDeRede(erro) || (erro as { name?: unknown } | null)?.name === 'ErroDeRede'
const eLoginOuPermissao = (erro: unknown) => {
  const nome = (erro as { name?: unknown } | null)?.name
  return erro instanceof ErroDeLogin || erro instanceof ErroDePermissao || nome === 'ErroDeLogin' || nome === 'ErroDePermissao'
}


// ---------------------------------------------------------------------------------------------------- avisos

const assinantes = new Set<() => void>()
/** Quem quer saber que a fila mudou (uma imagem entrou ou subiu). */
export function assinarFila(fn: () => void): () => void {
  assinantes.add(fn)
  return () => void assinantes.delete(fn)
}
export function avisarFila(): void {
  for (const fn of [...assinantes]) fn()
}

// ---------------------------------------------------------------------------------------------------- com OPFS

interface Pendente {
  img: ImagemDoUsuario
  arquivos: ArquivoDaImagem[]
  estado: EstadoDoEnvio
}

async function pendentes(estado: Estado = estadoAtual()): Promise<Pendente[]> {
  const lista: Pendente[] = []
  for (const id of await idsLocais()) {
    const reg = estado.registro('imagem', id)
    const img = reg ? lerImagem(reg) : null
    if (!img) continue
    lista.push({ img, arquivos: arquivosDaImagem(img), estado: lerEstadoDoEnvio(await lerJsonLocal(id, 'envio.json')) })
  }
  return lista
}

/** Quantas imagens deste aparelho ainda têm arquivo por subir. */
export async function contarImagensPorEnviar(): Promise<number> {
  try {
    return (await pendentes()).filter((p) => !completo(p.estado, p.arquivos) && !p.estado.permanente).length
  } catch {
    return 0
  }
}

/**
 * As imagens deste aparelho que ainda não estão inteiras no Dropbox (algum arquivo por subir, na fila ou parada por um
 * erro): a cópia de segurança (Tarefa 15) as marca com `enviada: false`. Sem OPFS, ou se ele falha, nenhuma.
 */
export async function imagensAindaNesteAparelho(estado: Estado = estadoAtual()): Promise<Set<string>> {
  try {
    return new Set((await pendentes(estado)).filter((p) => !completo(p.estado, p.arquivos)).map((p) => p.img.id))
  } catch {
    return new Set()
  }
}

export interface ImagemComProblema {
  id: string
  alvo: string
  nome: string
  mensagem: string
  causa: CausaPermanente | null
}

/** As imagens paradas por um erro permanente (a tela de Sincronização as mostra com "Tentar de novo"). */
export async function imagensComProblema(): Promise<ImagemComProblema[]> {
  try {
    return (await pendentes())
      .filter((p) => p.estado.permanente && !completo(p.estado, p.arquivos))
      .map((p) => ({ id: p.img.id, alvo: p.img.alvo, nome: p.img.nome, mensagem: p.estado.erro ?? 'Não foi possível enviar esta imagem.', causa: p.estado.causa ?? null }))
  } catch {
    return []
  }
}

/** "Tentar de novo": a imagem volta à fila já (a sincronização seguinte a tenta). */
export async function tentarImagemDeNovo(id: string): Promise<void> {
  await gravarEstadoDoEnvio(id, aposPedidoDeNovaTentativa(await lerEnvio(id)))
  avisarFila()
}

/**
 * "Remover da fila" (só para a cópia local sumida, que nenhuma tentativa resolve): tira a pasta da imagem do OPFS
 * deste aparelho. O evento `imagem` fica (o registro continua, com a marca e o crédito); se o arquivo existir no
 * Dropbox ou no outro aparelho, ele continua lá e a imagem aparece por ele.
 */
export async function removerDaFila(id: string): Promise<void> {
  await removerLocal(id)
  avisarFila()
}

/** A rede voltou (evento `online`) ou uma rodada passou: as esperas de rede terminam já (revisão 2). */
export async function liberarEsperasDeRede(): Promise<void> {
  for (const id of await idsLocais().catch(() => [] as string[])) {
    const e = await lerEnvio(id)
    if (e.espera === 'rede' && e.proxima !== null) await gravarEstadoDoEnvio(id, { ...e, proxima: null })
  }
}

/**
 * Tudo confirmado: a tela e a miniatura vão ao Cache Storage e a pasta sai do OPFS. Sem Cache Storage (ou se ele
 * falha), só o original sai.
 */
async function concluir(p: Pendente): Promise<void> {
  const cache = cacheDasImagens()
  let guardou = false
  if (cache) {
    try {
      for (const a of p.arquivos.filter((x) => x.fase === 'tela')) {
        const blob = await lerLocal(p.img.id, a.nome)
        if (blob) await cache.guardar(a.caminho, new Uint8Array(await blob.arrayBuffer()), tipoDoArquivo(a.nome))
      }
      guardou = true
    } catch {
      guardou = false
    }
  }
  if (guardou) await removerLocal(p.img.id)
  else {
    const original = p.arquivos.find((a) => a.fase === 'original')
    if (original) await removerLocal(p.img.id, original.nome)
  }
}

export interface ResumoDoEnvio {
  enviados: number
  falhas: number
  concluidas: number
}

export interface OpcoesDoEnvioDasImagens {
  agora?: () => number
  /** Acima disto, o original vai em partes (padrão `LIMIAR_EM_PARTES`; testes usam menos). */
  limiarEmPartes?: number
  /** O tamanho de cada parte (padrão o da Escrita, 4 MB). */
  parte?: number
}

/** Envia um arquivo da imagem: simples (uma cópia, a do OPFS) ou em partes (fatias do File, sessão em envio.json). */
async function enviarArquivo(escrita: Escrita, p: Pendente, a: ArquivoDaImagem, opcoes: OpcoesDoEnvioDasImagens): Promise<void> {
  const limiar = opcoes.limiarEmPartes ?? LIMIAR_EM_PARTES
  if (a.fase === 'original' && escrita.enviarEmPartes) {
    const arquivo = await arquivoLocal(p.img.id, a.nome)
    if (!arquivo) throw new ErroDeCopiaAusente(a.nome)
    if (arquivo.size > limiar) {
      const guardada = p.estado.sessao?.nome === a.nome ? p.estado.sessao : null
      await escrita.enviarEmPartes(a.caminho, arquivo, {
        sessao: guardada,
        parte: opcoes.parte,
        aoAvancar: async (sessao) => {
          p.estado = await gravarEstadoDoEnvio(p.img.id, { ...p.estado, sessao: sessao ? { ...sessao, nome: a.nome } : null }, { avancaSessao: true })
        },
      })
      return
    }
  }
  const bytes = await bytesLocais(p.img.id, a.nome)
  if (!bytes) throw new ErroDeCopiaAusente(a.nome)
  await escrita.enviar(a.caminho, bytes)
}

/**
 * Sobe o que falta das imagens deste aparelho na fase pedida.
 * - `telas` (e a parte de telas de `tudo`): lança (e para) quando a rede, o login ou a permissão faltam; o que já subiu
 *   fica marcado.
 * - `originais`: nunca lança. Rede ou prazo: espera desta imagem e a fase para. Login ou permissão: a fase para.
 * Em qualquer fase, um erro permanente marca só aquela imagem. `agora` troca o relógio (testes).
 */
export async function enviarImagensPendentes(escrita: Escrita, fase: Fase = 'tudo', opcoes: OpcoesDoEnvioDasImagens = {}): Promise<ResumoDoEnvio> {
  const agora = opcoes.agora ?? Date.now
  const resumo: ResumoDoEnvio = { enviados: 0, falhas: 0, concluidas: 0 }
  let parar = false
  try {
    for (const p of await pendentes()) {
      if (parar) break
      // O estado mais novo no disco (outra fase pode ter gravado desde a listagem).
      p.estado = await lerEnvio(p.img.id)
      // Os originais só depois da tela e da miniatura confirmadas (revisão 2): o outro aparelho precisa delas primeiro,
      // e as duas fases nunca disputam a mesma imagem.
      const telasConfirmadas = p.arquivos.filter((a) => a.fase === 'tela').every((a) => p.estado.enviados.includes(a.nome))
      if (fase === 'originais' && !telasConfirmadas) continue
      if (!completo(p.estado, p.arquivos) && podeTentar(p.estado, agora())) {
        for (const a of faltando(p.estado, p.arquivos, fase)) {
          if (a.fase === 'original' && !p.arquivos.filter((x) => x.fase === 'tela').every((x) => p.estado.enviados.includes(x.nome))) break
          try {
            await enviarArquivo(escrita, p, a, opcoes)
          } catch (erro) {
            const permanente = explicacaoPermanente(erro)
            if (permanente) {
              p.estado = await gravarEstadoDoEnvio(p.img.id, aposErroPermanente(p.estado, permanente.mensagem, permanente.causa))
              resumo.falhas++
              break
            }
            const mensagem = erro instanceof Error ? erro.message : String(erro)
            if (eFaltaDeMemoria(erro)) {
              p.estado = await gravarEstadoDoEnvio(p.img.id, aposEsperaCurta(p.estado, mensagem, agora(), 'memoria'))
              resumo.falhas++
              break
            }
            const daRodada = eRedeOuPrazo(erro) || eLoginOuPermissao(erro)
            if (daRodada && a.fase === 'tela') throw erro
            if (eLoginOuPermissao(erro)) {
              parar = true
              break
            }
            if (eRedeOuPrazo(erro)) {
              // Rede ou prazo: espera curta, sem contar tentativa, e a fase para (a rede caiu para todas).
              p.estado = await gravarEstadoDoEnvio(p.img.id, aposEsperaCurta(p.estado, mensagem, agora(), 'rede'))
              resumo.falhas++
              parar = true
              break
            }
            p.estado = await gravarEstadoDoEnvio(p.img.id, aposFalha(p.estado, mensagem, agora()))
            resumo.falhas++
            break
          }
          p.estado = await gravarEstadoDoEnvio(p.img.id, aposEnvio(p.estado, a.nome), { avancaSessao: a.fase === 'original' })
          resumo.enviados++
        }
      }
      if (completo(p.estado, p.arquivos)) {
        await concluir(p)
        resumo.concluidas++
      }
    }
  } finally {
    if (resumo.enviados || resumo.concluidas || resumo.falhas) avisarFila()
  }
  return resumo
}
