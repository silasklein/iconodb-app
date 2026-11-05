import { useCallback, useEffect, useRef, useState } from 'react'
import { mapaDeCodepoints, paraUtf16 } from '../item/offsets'
import { estadoAtual } from '../usuario/estado'
import { ancoraDoTrecho, posicaoNoTexto } from './ancora'
import { useSelecaoNaLeitura, type Selecao } from './BotaoDoTrecho'
import type { AncoraDaHipoteseSkc } from './modelo'
import { apagarRascunhoDaHipotese, chaveDoRascunho, guardarRascunhoDaHipotese, lerRascunhoDaHipotese, rascunhoNovo, rascunhoTemConteudo, type RascunhoDaHipotese } from './rascunho'
import { blocoDaFonte, intervaloNoBloco, type TrechoNaTela } from './selecao'

/** O nome do destaque (CSS Custom Highlight API) do trecho da nova hipótese, no texto (Leitura.css). */
const DESTAQUE = 'trecho-da-hipotese'

type Destaques = { set(nome: string, h: unknown): void; delete(nome: string): void }
type ComDestaques = { highlights?: Destaques }

/**
 * Com o formulário aberto, o trecho fica marcado na leitura (PC-ItemNovaHipotese.dc.html), sem mexer no DOM: um
 * destaque do CSS (`::highlight`). Onde o navegador não tem a API (Safari antes do 17.2), nada aparece, e nada quebra.
 */
function destacarTrecho(a: AncoraDaHipoteseSkc, texto: string): (() => void) | null {
  const css = (typeof CSS === 'undefined' ? undefined : (CSS as unknown as ComDestaques)) ?? undefined
  const Destaque = (globalThis as { Highlight?: new (r: Range) => unknown }).Highlight
  if (!css?.highlights || !Destaque) return null
  const bloco = blocoDaFonte(a.fonte, a.lingua) as HTMLElement | null
  const pos = posicaoNoTexto(a, texto)
  if (!bloco || !pos) return null
  const mapa = mapaDeCodepoints(texto)
  const r = intervaloNoBloco(bloco, paraUtf16(mapa, pos.inicio)!, paraUtf16(mapa, pos.fim)!)
  if (!r) return null
  css.highlights.set(DESTAQUE, new Destaque(r))
  return () => css.highlights!.delete(DESTAQUE)
}

/**
 * O rascunho guardado deste objeto, aberto ou fechado, se ainda é de uma hipótese por registrar. Um já registrado é
 * apagado: `criado`, ou a reserva cujo registro já existe (recarregou entre gravar e marcar `criado`; revisão 1, M4).
 */
export function rascunhoGuardado(objeto: string): RascunhoDaHipotese | null {
  const r = lerRascunhoDaHipotese(objeto)
  const gravada = (id: string | null | undefined) => !!id && !!estadoAtual().registro('hipotese', id)
  if (r && (gravada(r.criado) || gravada(r.reserva?.hipotese))) {
    apagarRascunhoDaHipotese(objeto)
    return null
  }
  return r
}

/**
 * Uma hipótese em preparo que se perderia se outro rascunho fosse gravado por cima: com algo preenchido, ou com ids já
 * reservados (revisão 3, M5). Um rascunho vazio (o formulário aberto e nada escrito) não conta.
 */
export function hipoteseEmPreparo(objeto: string): RascunhoDaHipotese | null {
  const r = rascunhoGuardado(objeto)
  return r && (rascunhoTemConteudo(r) || r.reserva) ? r : null
}

/** O rascunho que reabre sozinho ao montar a tela: só o de um formulário que estava aberto. */
export function rascunhoAberto(objeto: string): RascunhoDaHipotese | null {
  const r = rascunhoGuardado(objeto)
  return r?.aberto ? r : null
}

export interface NovaHipoteseNaTela {
  /** O formulário aberto (o rascunho com que abriu), ou null. */
  nova: RascunhoDaHipotese | null
  /** O trecho selecionado agora numa leitura (para o botão "Registrar hipótese" e o Shift+H). */
  selecao: Selecao | null
  /** Abre o formulário (com a âncora, ou sem trecho). */
  abrir: (ancora: AncoraDaHipoteseSkc | null) => void
  /** Abre com o trecho selecionado: calcula a âncora (o sha) e abre. */
  abrirComTrecho: (t: TrechoNaTela) => Promise<void>
  /** Shift+H: com seleção, ancorado nela; sem seleção, sem trecho. Com o formulário aberto, nada. */
  atalho: () => void
  /** O formulário fechou (Esc, ×, "Descartar" ou registrada); o rascunho já foi guardado ou apagado por ele. */
  fechar: () => void
  /** Há uma hipótese em preparo (rascunho fechado) para retomar. */
  emPreparo: boolean
  devolverFoco: () => HTMLElement | null
}

/**
 * O formulário "Nova hipótese" numa tela de objeto (Item do livro e ObjetoSKC): reabre o rascunho guardado ao montar
 * (recarregar, ou voltar do visualizador depois de desenhar a região), segue a seleção nas leituras de `raiz()` e abre
 * com o trecho. `textoDe` dá o texto guardado de uma leitura (para o sha e as posições da âncora).
 */
export function useNovaHipotese(objeto: string, textoDe: (fonte: string, lingua: AncoraDaHipoteseSkc['lingua']) => string | null, raiz: () => Element | null): NovaHipoteseNaTela {
  const [nova, setNova] = useState<RascunhoDaHipotese | null>(() => rascunhoAberto(objeto))
  const [emPreparo, setEmPreparo] = useState(() => rascunhoGuardado(objeto) !== null)
  const selecao = useSelecaoNaLeitura(raiz, nova === null)
  const gatilho = useRef<HTMLElement | null>(null)
  const atual = useRef({ textoDe, selecao })
  atual.current = { textoDe, selecao }

  const abrir = useCallback(
    (ancora: AncoraDaHipoteseSkc | null) => {
      const ativo = document.activeElement as HTMLElement | null
      if (ativo && ativo !== document.body) gatilho.current = ativo
      // Uma hipótese em preparo é retomada de onde estava; um trecho novo selecionado entra nela (revisão 1, I2).
      const guardado = rascunhoGuardado(objeto)
      const r: RascunhoDaHipotese = guardado ? { ...guardado, aberto: true, ancora: ancora ?? guardado.ancora } : rascunhoNovo(objeto, ancora)
      guardarRascunhoDaHipotese(r)
      window.getSelection?.()?.removeAllRanges()
      setNova(r)
    },
    [objeto],
  )

  const abrirComTrecho = useCallback(
    async (t: TrechoNaTela) => {
      gatilho.current = t.bloco
      const texto = atual.current.textoDe(t.fonte, t.lingua)
      const ancora = texto === null ? null : await ancoraDoTrecho({ fonte: t.fonte, lingua: t.lingua, texto, inicio: t.inicio, fim: t.fim })
      abrir(ancora)
      gatilho.current = t.bloco
    },
    [abrir],
  )

  const aberto = useRef(false)
  aberto.current = nova !== null
  const atalho = useCallback(() => {
    // Com o formulário já aberto, Shift+H não recomeça (o que foi preenchido continua lá).
    if (aberto.current) return
    const s = atual.current.selecao
    if (s) void abrirComTrecho(s.trecho)
    else abrir(null)
  }, [abrir, abrirComTrecho])

  // O trecho da nova hipótese fica destacado na leitura enquanto o formulário está aberto.
  const ancora = nova?.ancora ?? null
  useEffect(() => {
    if (!ancora) return
    const texto = atual.current.textoDe(ancora.fonte, ancora.lingua)
    if (texto === null) return
    const desfazer = destacarTrecho(ancora, texto)
    return desfazer ?? undefined
  }, [ancora])

  const fechar = useCallback(() => {
    setNova(null)
    setEmPreparo(rascunhoGuardado(objeto) !== null)
  }, [objeto])

  // Outra aba guardou ou apagou o rascunho deste objeto (o localStorage é um só para as abas; revisão 3, M5): o botão
  // "Retomar a hipótese em preparo" acompanha. O formulário aberto aqui cuida do conflito dele (NovaHipotese).
  useEffect(() => {
    const chave = chaveDoRascunho(objeto)
    const ouvir = (e: StorageEvent) => {
      if (e.key === null || e.key === chave) setEmPreparo(rascunhoGuardado(objeto) !== null)
    }
    window.addEventListener('storage', ouvir)
    return () => window.removeEventListener('storage', ouvir)
  }, [objeto])
  const devolverFoco = useCallback(() => (gatilho.current?.isConnected ? gatilho.current : null), [])

  return { nova, selecao, abrir, abrirComTrecho, atalho, fechar, devolverFoco, emPreparo }
}
