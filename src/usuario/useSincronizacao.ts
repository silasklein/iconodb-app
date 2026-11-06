/**
 * O controle da sincronização no app: quando sincronizar, uma rodada por vez, e o estado que as telas
 * mostram (decisão 29: sincronizado, N alterações por enviar, sincronizando, sem internet, erro).
 *
 * - Automática (se ligada): ao abrir o app, 5 s depois da última mudança local, quando a rede volta
 *   (`online`) e quando o app volta a ficar visível. Manual: o botão "Salvar e sincronizar" e Ctrl/⌘S.
 * - Uma rodada por vez: nesta aba, pedidos durante uma rodada viram UMA rodada a seguir; entre abas, o Web
 *   Lock `iconodb-usuario` (sem Web Locks, só a fila da aba).
 * - Sem login (ou expirado): "Entre de novo para sincronizar". O trabalho local continua e fica por enviar.
 * - O que a tela de Sincronização mostra fica guardado no IndexedDB (`sync:info`): a última sincronização,
 *   o histórico recente, o que chegou do outro aparelho e os arquivos malformados que foram ignorados.
 * - As imagens do usuário (Tarefa 8, `imagens-usuario/fila.ts`): a tela e a miniatura sobem na rodada e sob a trava
 *   dela, ANTES dos eventos (o outro aparelho recebe o evento já com a imagem para mostrar); a falta de rede, de login
 *   ou de permissão (`missing_scope`) ao enviá-las vira o mesmo estado e a mesma mensagem dos eventos. Os originais
 *   sobem DEPOIS de a rodada estar registrada, fora da trava dela (trava própria, `iconodb-imagens-originais`, que
 *   outra aba não espera: `ifAvailable`): um original grande numa rede lenta nem segura a sincronização nem a faz
 *   falhar; a demora ou a queda é uma espera daquela imagem (fila.ts). Cada imagem por subir conta como uma
 *   alteração por enviar (as paradas por erro permanente, não: elas aparecem na tela de Sincronização).
 */
import { lerConfirmados } from '../objetos-skc/confirmados'
import { useEffect, useSyncExternalStore } from 'react'
import { useAtalhos } from '../app/useAtalhos'
import { escritaDropbox, type Escrita } from '../dropbox/escrita'
import { MSG_SEM_PERMISSAO } from '../dropbox/mensagens'
import { eErroDeRede } from '../dropbox/rede'
import { ErroDePermissao, resumoDoErro } from '../dropbox/tentativas'
import { assinarFila, contarImagensPorEnviar, enviarImagensPendentes, liberarEsperasDeRede } from '../imagens-usuario/fila'
import { idsLocais } from '../imagens-usuario/local'
import { ErroDeLogin } from '../pacote/manifesto'
import { aparelhoAtual, avisarTrocaDeAparelho } from './aparelho'
import { atualizarConfig, lerConfig } from './diarioLocal'
import { assinarEstado, carregarEstado } from './estado'
import { perguntarPelaAba, recuperarEmergencias } from './emergencia'
import { descarregarPendentes } from './pendentes'
import { contarPorEnviar, type Malformado, type Motivo, type ResumoSync, sincronizar } from './sincronizar'
import { rotuloDoRegistro } from './rotulos'
import { doAparelho, horaDoHlc, plural, removerChaves } from './textosDaSync'

export const ATRASO_DEPOIS_DA_MUDANCA_MS = 5000
/**
 * Depois de uma rodada que falhou (com a rede de pé) ou que deixou algo por enviar, tenta de novo sozinha:
 * 30 s, 1 min, 5 min e, daí em diante, a cada 5 min. Uma rodada limpa zera a contagem.
 */
export const ATRASOS_DA_NOVA_TENTATIVA_MS = [30_000, 60_000, 300_000] as const
/** Ao voltar a ficar visível sem nada por enviar, só sincroniza se a última tentativa foi há mais que isto. */
const INTERVALO_AO_VOLTAR_MS = 60_000
const TRAVA = 'iconodb-usuario'
const TRAVA_DOS_ORIGINAIS = 'iconodb-imagens-originais'
const CANAL = 'iconodb-sync'
const CHAVE_INFO = 'sync:info'
const MAXIMO_DO_HISTORICO = 30
const MAXIMO_DE_AVISOS = 20

export type TipoDeErro = 'login' | 'permissao' | 'geral'
export type EstadoDaSync = 'sincronizado' | { porEnviar: number } | 'sincronizando' | 'sem-internet' | { erro: TipoDeErro; mensagem: string }

export interface EntradaDoHistorico {
  em: number
  titulo: string
  detalhe: string
}

export interface Recebidas {
  em: number
  porAparelho: { aparelho: string; nome: string | null; eventos: number }[]
}

export interface Aviso extends Malformado {
  em: number
}

export interface InfoDaSync {
  estado: EstadoDaSync
  /** Eventos deste aparelho ainda não enviados. */
  porEnviar: number
  /** Quando a última sincronização terminou bem (null: nunca neste aparelho). */
  ultimaEm: number | null
  automatico: boolean
  historico: EntradaDoHistorico[]
  /** O que chegou do outro aparelho na última rodada que trouxe algo. */
  recebidas: Recebidas | null
  /** Arquivos do Dropbox ignorados por estarem malformados (os "detalhes" da tela). */
  avisos: Aviso[]
  /** Por que o estado.json do Dropbox não pôde ser lido (versão mais nova do app, malformado, grande demais); null se pôde. */
  estadoIlegivel: string | null
  /** O estado.json foi lido só em parte (A-7): a tela mostra o aviso próprio, sem sugerir apagar o arquivo. */
  estadoLidoEmParte: boolean
  /** Com `estadoLidoEmParte`: só registros ilegíveis (A-28); apagar o estado.json é seguro. */
  estadoSoIlegiveis: boolean
  /** Segmentos de outro aparelho que ainda não apareceram (lidos quando aparecerem). */
  faltando: { aparelho: string; segmento: number }[]
  nomeDoAparelho: string
  /** O estado guardado já foi lido (antes disso, os valores são os padrões). */
  iniciado: boolean
}

interface Guardado {
  ultimaEm: number | null
  automatico: boolean
  historico: EntradaDoHistorico[]
  recebidas: Recebidas | null
  avisos: Aviso[]
  estadoIlegivel?: string | null
  estadoLidoEmParte?: boolean
  estadoSoIlegiveis?: boolean
}

export interface OpcoesDoControle {
  /** De onde vem a Escrita (padrão: o Dropbox; null = sem login). */
  obterEscrita?: () => Promise<Escrita | null>
  /** Espera depois da última mudança (padrão: 5 s). */
  atrasoMs?: number
  /** Falso: nenhuma rodada automática nesta sessão, seja qual for a preferência guardada (testes). */
  automatica?: boolean
}

// ------------------------------------------------------------------ o estado exposto

type Resultado = 'ok' | 'sem-internet' | { erro: TipoDeErro; mensagem: string }

let info: InfoDaSync = {
  estado: 'sincronizado',
  porEnviar: 0,
  ultimaEm: null,
  automatico: true,
  historico: [],
  recebidas: null,
  avisos: [],
  estadoIlegivel: null,
  estadoLidoEmParte: false,
  estadoSoIlegiveis: false,
  faltando: [],
  nomeDoAparelho: '',
  iniciado: false,
}
let resultado: Resultado = 'ok'
let rodando = false
const assinantes = new Set<() => void>()

function compor(): EstadoDaSync {
  if (rodando) return 'sincronizando'
  if (resultado === 'sem-internet') return 'sem-internet'
  if (resultado !== 'ok') return resultado
  return info.porEnviar > 0 ? { porEnviar: info.porEnviar } : 'sincronizado'
}

function publicar(mudanca: Partial<InfoDaSync> = {}): void {
  info = { ...info, ...mudanca }
  info = { ...info, estado: compor() }
  for (const avisar of [...assinantes]) avisar()
}

/** O estado da sincronização agora. */
export function estadoDaSync(): EstadoDaSync {
  return info.estado
}

/** Tudo o que as telas mostram da sincronização. */
export function infoDaSync(): InfoDaSync {
  return info
}

export function assinarSync(avisar: () => void): () => void {
  assinantes.add(avisar)
  return () => {
    assinantes.delete(avisar)
  }
}

/** O estado da sincronização numa tela (re-renderiza a cada mudança). */
export function useSincronizacao(): InfoDaSync {
  return useSyncExternalStore(assinarSync, infoDaSync, infoDaSync)
}

// ------------------------------------------------------------------ o que fica guardado

const guardadoPadrao = (): Guardado => ({ ultimaEm: null, automatico: true, historico: [], recebidas: null, avisos: [], estadoIlegivel: null, estadoLidoEmParte: false, estadoSoIlegiveis: false })

async function lerGuardado(): Promise<Guardado> {
  const g = await lerConfig<Partial<Guardado>>(CHAVE_INFO).catch(() => undefined)
  return { ...guardadoPadrao(), ...(g ?? {}) }
}

async function guardar(mudar: (g: Guardado) => Guardado): Promise<Guardado> {
  const novo = await atualizarConfig<Guardado>(CHAVE_INFO, (atual) => mudar({ ...guardadoPadrao(), ...(atual ?? {}) }))
  publicar({ ultimaEm: novo.ultimaEm, automatico: novo.automatico, historico: novo.historico, recebidas: novo.recebidas, avisos: novo.avisos, estadoIlegivel: novo.estadoIlegivel ?? null, estadoLidoEmParte: novo.estadoLidoEmParte === true, estadoSoIlegiveis: novo.estadoSoIlegiveis === true })
  return novo
}

async function recontar(): Promise<number> {
  try {
    const n = (await contarPorEnviar()) + (await contarImagensPorEnviar())
    if (n !== info.porEnviar) publicar({ porEnviar: n })
    return n
  } catch {
    return info.porEnviar
  }
}

// ------------------------------------------------------------------ uma rodada

let config: Required<Omit<OpcoesDoControle, 'automatica'>> & { automatica: boolean } = {
  obterEscrita: () => escritaDropbox(),
  atrasoMs: ATRASO_DEPOIS_DA_MUDANCA_MS,
  automatica: true,
}
let atual: Promise<ResumoSync | null> | null = null
let seguinte: Promise<ResumoSync | null> | null = null
let ultimaTentativa = 0
let novaTentativa: ReturnType<typeof setTimeout> | undefined
let falhasSeguidas = 0
let semInternetDesde: number | null = null

/**
 * Roda `fazer` com a trava da sincronização (o Web Lock `iconodb-usuario`; sem Web Locks, direto). Também a restauração
 * (src/copias/restaurar.ts) a usa para pôr fotos na fila sem que a rodada as veja pela metade.
 */
export function comTrava<T>(fazer: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { locks?: LockManager }).locks
  if (locks?.request) return locks.request(TRAVA, fazer) as Promise<T>
  return fazer()
}

const eNome = (erro: unknown, nome: string) => (erro as { name?: unknown } | null)?.name === nome

function classificar(erro: unknown): Resultado {
  if (erro instanceof ErroDeLogin || eNome(erro, 'ErroDeLogin')) return { erro: 'login', mensagem: 'Entre de novo para sincronizar' }
  if (erro instanceof ErroDePermissao || eNome(erro, 'ErroDePermissao')) {
    const escopo = (erro as { escopo?: unknown }).escopo
    const mensagem = typeof escopo === 'string' && !MSG_SEM_PERMISSAO.includes(escopo) ? `${MSG_SEM_PERMISSAO} (falta ${escopo})` : MSG_SEM_PERMISSAO
    return { erro: 'permissao', mensagem }
  }
  if (eErroDeRede(erro) || eNome(erro, 'ErroDeRede')) return 'sem-internet'
  // O detalhe para a tela: a resposta do Dropbox (código e resumo), o nome do erro, ou a mensagem.
  const status = (erro as { status?: unknown } | null)?.status
  const resumo = resumoDoErro(erro)
  const detalhe =
    typeof status === 'number'
      ? `resposta ${status}${resumo ? `: ${resumo}` : ''}`
      : erro instanceof Error && erro.name !== 'Error'
        ? erro.name
        : erro instanceof Error && erro.message
          ? erro.message.slice(0, 160)
          : null
  return { erro: 'geral', mensagem: detalhe ? `Não foi possível falar com o Dropbox (${removerChaves(detalhe)})` : 'Não foi possível falar com o Dropbox' }
}

const semRede = () => typeof navigator !== 'undefined' && navigator.onLine === false

/** O histórico em ordem do mais recente (estável: entradas do mesmo instante ficam na ordem dada), cortado. */
const maisRecentesPrimeiro = (lista: EntradaDoHistorico[]) =>
  lista
    .map((h, i) => ({ h, i }))
    .sort((a, b) => b.h.em - a.h.em || a.i - b.i)
    .map((x) => x.h)
    .slice(0, MAXIMO_DO_HISTORICO)

function minutos(ms: number): string {
  const m = Math.round(ms / 60_000)
  return m < 1 ? 'menos de 1 min' : `${m} min`
}

function entradasDoResumo(r: ResumoSync, agora: number, esperou: { desde: number; enviados: number } | null): EntradaDoHistorico[] {
  const entradas: EntradaDoHistorico[] = []
  for (const m of r.mesmoCampo) {
    const doOutro = doAparelho(m.nome)
    const hora = horaDoHlc(m.venceu === 'outro' ? m.hlcDoOutro : m.hlcDeste)
    entradas.push({
      em: agora,
      titulo: 'Mesmo campo nos dois aparelhos',
      detalhe:
        m.venceu === 'outro'
          ? `${rotuloDoRegistro(m.tipo, m.reg)}: valeu a ${doOutro} (${hora}); a deste aparelho ficou guardada no histórico`
          : `${rotuloDoRegistro(m.tipo, m.reg)}: valeu a deste aparelho (${hora}); a ${doOutro} ficou guardada no histórico`,
    })
  }
  if (esperou && esperou.enviados > 0) {
    const n = esperou.enviados
    entradas.push({
      em: esperou.desde,
      titulo: 'Sem internet',
      detalhe: `${plural(n, 'alteração', 'alterações')} ${n === 1 ? 'esperou' : 'esperaram'} ${minutos(agora - esperou.desde)} e ${n === 1 ? 'foi enviada' : 'foram enviadas'} ao voltar`,
    })
  }
  if (r.aparelhoTrocado) {
    entradas.push({
      em: agora,
      titulo: 'Este aparelho ganhou um novo identificador',
      detalhe: 'O Dropbox já tinha dados com o identificador anterior (uma cópia ou restauração do app). As alterações por enviar foram mantidas e subiram com o novo.',
    })
  }
  const partes: string[] = []
  if (r.enviados) partes.push(`${r.enviados} ${r.enviados === 1 ? 'enviada' : 'enviadas'}`)
  for (const p of r.porAparelho) partes.push(`${p.eventos} ${p.eventos === 1 ? 'recebida' : 'recebidas'} ${doAparelho(p.nome)}`)
  const manual = r.motivo === 'manual' || r.motivo === 'atalho'
  if (partes.length || manual) {
    entradas.push({ em: agora, titulo: r.motivo === 'abrir' ? 'Sincronizado ao abrir' : 'Sincronizado', detalhe: partes.length ? partes.join(' · ') : 'Nada novo para enviar ou receber' })
  }
  return entradas
}

async function rodar(motivo: Motivo): Promise<ResumoSync | null> {
  clearTimeout(novaTentativa)
  const r = await rodarUma(motivo)
  reprogramar()
  return r
}

/**
 * Agenda a nova tentativa (backoff) se a rodada que acabou falhou ou deixou algo por enviar. Não agenda se:
 * a automática está desligada, o app não está montado, falta login ou permissão (só o usuário resolve) ou o
 * navegador diz que está sem rede (o evento `online` sincroniza quando ela volta).
 */
function reprogramar(): void {
  clearTimeout(novaTentativa)
  const falhou = resultado !== 'ok'
  if (!falhou && info.porEnviar === 0) {
    falhasSeguidas = 0
    return
  }
  const precisaDoUsuario = typeof resultado === 'object' && (resultado.erro === 'login' || resultado.erro === 'permissao')
  if (instalacoes === 0 || !automatica() || precisaDoUsuario || semRede()) return
  const atrasos = ATRASOS_DA_NOVA_TENTATIVA_MS
  const atraso = atrasos[Math.min(falhasSeguidas, atrasos.length - 1)]!
  falhasSeguidas++
  novaTentativa = setTimeout(() => void sincronizarAgora('tentar-de-novo'), atraso)
}

async function rodarUma(motivo: Motivo): Promise<ResumoSync | null> {
  ultimaTentativa = Date.now()
  if (semRede()) {
    await falhou('sem-internet')
    return null
  }
  rodando = true
  publicar()
  try {
    const escrita = await config.obterEscrita()
    if (!escrita) {
      await falhou({ erro: 'login', mensagem: 'Entre de novo para sincronizar' })
      return null
    }
    const r = await comTrava(async () => {
      await enviarImagensPendentes(escrita, 'telas')
      return sincronizar(escrita, { motivo })
    })
    const agora = Date.now()
    const esperou = semInternetDesde !== null ? { desde: semInternetDesde, enviados: r.enviados } : null
    semInternetDesde = null
    resultado = 'ok'
    rodando = false
    await guardar((g) => ({
      ...g,
      ultimaEm: agora,
      historico: maisRecentesPrimeiro([...entradasDoResumo(r, agora, esperou), ...g.historico]),
      recebidas: r.porAparelho.length ? { em: agora, porAparelho: r.porAparelho } : g.recebidas,
      estadoIlegivel: r.estadoIlegivel,
      estadoLidoEmParte: r.estadoLidoEmParte,
      estadoSoIlegiveis: r.estadoSoIlegiveis,
      avisos: [...r.malformados.map((m) => ({ ...m, em: agora })), ...g.avisos.filter((a) => !r.malformados.some((m) => m.caminho === a.caminho))].slice(
        0,
        MAXIMO_DE_AVISOS,
      ),
    }))
    publicar({ faltando: r.faltando })
    avisarOutrasAbas(r.renumerados > 0 || r.aparelhoTrocado !== null)
    subirOriginais(escrita)
    return r
  } catch (erro) {
    await falhou(classificar(erro))
    return null
  } finally {
    rodando = false
    await recontar()
    publicar()
  }
}

let originais: Promise<void> | null = null

/**
 * Os originais das imagens, depois da rodada (já registrada) e fora da trava dela. Uma vez por aba de cada vez; entre
 * abas, a trava `iconodb-imagens-originais` com `ifAvailable` (se outra aba já está subindo, esta não espera). Nunca
 * falha: os erros ficam em cada imagem (fila.ts).
 */
function subirOriginais(escrita: Escrita): void {
  if (originais) return
  const locks = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { locks?: LockManager }).locks
  const fazer = async () => {
    // A rodada acabou de passar: a rede está de pé, as esperas de rede das imagens terminam (revisão 2).
    await liberarEsperasDeRede().catch(() => undefined)
    await enviarImagensPendentes(escrita, 'originais').catch(() => undefined)
  }
  const corrida = (async () => {
    // Nada deste aparelho no OPFS: nem pede a trava.
    if ((await idsLocais().catch(() => [])).length === 0) return
    if (locks?.request) await locks.request(TRAVA_DOS_ORIGINAIS, { ifAvailable: true }, async (trava) => (trava ? fazer() : undefined))
    else await fazer()
  })()
  originais = corrida
    .then(
      () => undefined,
      () => undefined,
    )
    .then(async () => {
      originais = null
      await recontar()
      publicar()
    })
}

/** Espera os originais em andamento nesta aba (testes; e quem precisa saber que terminaram). */
export function aguardarOriginais(): Promise<void> {
  return originais ?? Promise.resolve()
}

async function falhou(novo: Resultado): Promise<void> {
  const antes = resultado
  resultado = novo
  rodando = false
  if (novo === 'sem-internet') {
    semInternetDesde ??= Date.now()
    publicar()
    return
  }
  if (novo === 'ok') return
  // Um erro novo (não o mesmo de antes) entra no histórico. Sem login, não: o estado já diz, e o app
  // aberto antes de entrar (a primeira vez) não deve deixar um erro no histórico.
  if (novo.erro !== 'login' && (antes === 'ok' || antes === 'sem-internet' || antes.mensagem !== novo.mensagem)) {
    await guardar((g) => ({ ...g, historico: maisRecentesPrimeiro([{ em: Date.now(), titulo: 'Não foi possível sincronizar', detalhe: novo.mensagem }, ...g.historico]) })).catch(
      () => publicar(),
    )
  } else publicar()
}

/**
 * Sincroniza agora (ou logo depois da rodada em andamento, juntando os pedidos numa só). Nunca rejeita:
 * devolve o resumo, ou null se não deu (o estado diz por quê).
 */
export async function sincronizarAgora(motivo: Motivo = 'manual'): Promise<ResumoSync | null> {
  // Pedido da pessoa (botão, Ctrl/⌘S): primeiro grava o que ainda está num campo ou num rascunho, para ir nesta rodada.
  // Se uma gravação falhar, o campo mostra o próprio erro e a rodada segue com o que já está guardado.
  if (motivo === 'manual' || motivo === 'atalho') await descarregarPendentes().catch(() => undefined)
  return sincronizarSemDescarga(motivo)
}

function sincronizarSemDescarga(motivo: Motivo): Promise<ResumoSync | null> {
  if (!atual) {
    atual = rodar(motivo).finally(() => {
      atual = null
    })
    return atual
  }
  seguinte ??= atual
    .catch(() => null)
    .then(() => {
      seguinte = null
      return sincronizarSemDescarga(motivo)
    })
  return seguinte
}

/** Liga ou desliga a sincronização automática (a escolha fica guardada neste aparelho). */
export async function definirAutomatico(valor: boolean): Promise<void> {
  await guardar((g) => ({ ...g, automatico: valor }))
  if (!valor) {
    clearTimeout(espera)
    clearTimeout(novaTentativa)
  }
  // Ligar com algo por enviar: sobe logo.
  else if (instalacoes > 0 && config.automatica && info.porEnviar > 0) void sincronizarAgora('mudanca')
}

// ------------------------------------------------------------------ gatilhos

let instalacoes = 0
let abriu = false
let espera: ReturnType<typeof setTimeout> | undefined
let desinstalar: (() => void) | null = null
let canal: BroadcastChannel | null = null

const automatica = () => config.automatica && info.automatico

function avisarOutrasAbas(recarregar: boolean): void {
  try {
    canal?.postMessage({ tipo: 'terminou', recarregar })
  } catch {
    // sem canal: as outras abas recontam na próxima mudança
  }
}

async function iniciar(): Promise<void> {
  // A pergunta às outras abas pelo id desta (A-6) corre junto com o carregamento; `recuperarEmergencias` espera a resposta.
  perguntarPelaAba()
  const [guardado, eu] = await Promise.all([lerGuardado(), aparelhoAtual().catch(() => ({ nome: '' }))])
  await carregarEstado().catch(() => undefined)
  await lerConfirmados().catch(() => undefined)
  // O texto que a página guardou às pressas ao ser fechada (usuario/emergencia.ts) vira nota antes de contar o que há por enviar.
  await recuperarEmergencias().catch(() => undefined)
  await recontar()
  publicar({ ...guardado, nomeDoAparelho: eu.nome, iniciado: true })
  if (!abriu && automatica()) {
    abriu = true
    void sincronizarAgora('abrir')
  }
  abriu = true
}

/**
 * Liga os gatilhos automáticos (uma vez por página: chamadas repetidas só contam) e devolve a função que
 * os desliga. `opcoes` troca as dependências (testes).
 */
export function iniciarSincronizacao(opcoes: OpcoesDoControle = {}): () => void {
  if (opcoes.obterEscrita) config.obterEscrita = opcoes.obterEscrita
  if (opcoes.atrasoMs !== undefined) config.atrasoMs = opcoes.atrasoMs
  if (opcoes.automatica !== undefined) config.automatica = opcoes.automatica
  instalacoes++
  if (instalacoes === 1) {
    const aoMudar = () => {
      void recontar().then((n) => {
        if (n > 0 && automatica()) {
          clearTimeout(espera)
          espera = setTimeout(() => void sincronizarAgora('mudanca'), config.atrasoMs)
        }
      })
    }
    const aoVoltarARede = () => {
      // As imagens que esperavam a rede voltam a valer já (revisão 2).
      void liberarEsperasDeRede().catch(() => undefined)
      if (automatica()) void sincronizarAgora('rede')
    }
    const aoFicarVisivel = () => {
      if (document.visibilityState !== 'visible' || !automatica()) return
      if (info.porEnviar > 0 || Date.now() - ultimaTentativa > INTERVALO_AO_VOLTAR_MS) void sincronizarAgora('visivel')
    }
    const deixarDeAssinar = assinarEstado(aoMudar)
    // A fila das imagens mudou (uma entrou, uma subiu): só reconta; quem pede a rodada é o evento da imagem (aoMudar).
    const deixarAFila = assinarFila(() => void recontar())
    window.addEventListener('online', aoVoltarARede)
    document.addEventListener('visibilitychange', aoFicarVisivel)
    canal = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CANAL)
    if (canal) {
      canal.onmessage = (m: MessageEvent<{ tipo?: string; recarregar?: boolean }>) => {
        if (m.data?.tipo !== 'terminou') return
        if (m.data.recarregar) {
          void carregarEstado().catch(() => undefined)
          avisarTrocaDeAparelho() // o id deste aparelho pode ter mudado na outra aba (A-23)
        }
        // Outra aba pode ter confirmado números de objetos SKC (estado.json): relê o mapa guardado.
        void lerConfirmados().catch(() => undefined)
        void lerGuardado().then((g) => publicar({ ...g }))
        void recontar()
      }
    }
    desinstalar = () => {
      deixarDeAssinar()
      deixarAFila()
      window.removeEventListener('online', aoVoltarARede)
      document.removeEventListener('visibilitychange', aoFicarVisivel)
      clearTimeout(espera)
      clearTimeout(novaTentativa)
      canal?.close()
      canal = null
    }
    void iniciar()
  }
  let feito = false
  return () => {
    if (feito) return
    feito = true
    instalacoes--
    if (instalacoes === 0) {
      desinstalar?.()
      desinstalar = null
    }
  }
}

/** Ctrl+S (⌘S no Mac): salvar e sincronizar, em qualquer tela; o navegador não abre o "salvar página". */
export function useAtalhoDeSalvar(): void {
  const salvar = () => void sincronizarAgora('atalho')
  useAtalhos({ 'Control+S': salvar, 'Meta+S': salvar }, 'global')
}

export function AtalhoDeSalvar(): null {
  useAtalhoDeSalvar()
  return null
}

/** Montado uma vez no app (routes.tsx): os gatilhos automáticos e o Ctrl/⌘S. */
export function SincronizacaoAutomatica(): null {
  useEffect(() => iniciarSincronizacao(), [])
  useAtalhoDeSalvar()
  return null
}

/** O atalho como aparece nas dicas: ⌘S no Mac (e iPad com teclado), Ctrl+S nos outros. */
export function atalhoDeSalvar(): string {
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  return /Mac|iPhone|iPad/.test(nav?.userAgent ?? '') ? '⌘S' : 'Ctrl+S'
}
