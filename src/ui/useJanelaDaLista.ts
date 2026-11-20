import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type RefObject } from 'react'

/** Quantas linhas se desenham de começo, e quantas a mais (no mínimo) a cada vez. */
export const LINHAS_DE_COMECO = 200
/** O máximo de linhas desenhadas num passo (um quadro): End ou arrastar a barra até o fim não desenham milhares de uma vez. */
export const PASSO_MAXIMO = 1000
/** Linhas antes do alvo quando a janela começa nele (a obra escolhida aberta a frio). */
export const ANTES_DO_ALVO = 100
/** Linhas depois do alvo que têm de estar desenhadas (a rolagem até ele o põe no meio da lista). */
const DEPOIS_DO_ALVO = 20
/** A altura estimada de uma linha (px): só para os espaços das que faltam, que dão à lista a altura de todas. */
export const ALTURA_ESTIMADA = 56
/** Quanto antes de um espaço entrar na tela as linhas dele já se desenham (px). */
const MARGEM = 800
/** O foco numa destas linhas das pontas desenha as seguintes (o teclado e o leitor de tela). */
const PERTO_DA_PONTA = 20

interface Opcoes {
  /** A linha que tem de estar desenhada (a obra escolhida); -1 sem. */
  alvo?: number
  /**
   * Há uma posição guardada para restaurar (o Voltar com a lista rolada): a janela começa no topo e vai até o alvo, para a
   * posição restaurada mostrar as mesmas linhas. Sem ela, a janela começa em volta do alvo. Só vale na primeira vez que a
   * lista chega.
   */
  restaurar?: boolean
}

interface Janela {
  /** As linhas desenhadas: [inicio, fim). */
  inicio: number
  fim: number
  /** O espaço de cima (as linhas antes de `inicio`) e o de baixo (depois de `fim`): a altura estimada delas (px). */
  espacoDeCima: number
  espaco: number
  refDoEspacoDeCima: RefObject<HTMLDivElement | null>
  /** O espaço de baixo: quem usa o desenha sempre (mesmo com altura 0); ele mede o deslocamento ao crescer para cima. */
  refDoEspaco: RefObject<HTMLDivElement | null>
  /** Para o `onFocus` do contêiner da lista: o foco perto de uma ponta desenha mais daquele lado. */
  aoFocar: (e: FocusEvent<HTMLElement>) => void
}

interface Estado {
  chave: string
  inicio: number
  fim: number
  /** A primeira chegada da lista ainda vai restaurar uma posição guardada. */
  restaurar: boolean
}

const passo = (falta: number) => Math.min(PASSO_MAXIMO, Math.max(LINHAS_DE_COMECO / 2, Math.ceil(falta / ALTURA_ESTIMADA)))

/** O elemento que rola o `el` (o painel da lista no computador), ou null: a janela. */
function quemRola(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if (overflowY === 'auto' || overflowY === 'scroll') return p
  }
  return null
}

/**
 * Uma lista longa desenhada aos poucos (Tarefa 6c: a Bibliografia, ~4 900 obras, levava ~2 s para aparecer). Desenha-se uma
 * janela de linhas e, em cima e embaixo, espaços com a altura estimada das que faltam: a lista já tem a altura de todas (a
 * barra de rolagem e a restauração da rolagem ao voltar valem). Quando um espaço chega perto da tela (rolando a janela ou o
 * painel, ou pela restauração), desenham-se as linhas dele, no máximo `PASSO_MAXIMO` por quadro; o foco perto de uma ponta
 * também desenha mais. As linhas desenhadas não saem.
 * - Sem alvo, ou com uma posição guardada a restaurar, a janela começa no topo (e vai até o alvo): o que está acima da
 *   posição é sempre o de verdade, e a posição restaurada mostra as mesmas linhas.
 * - Com alvo e sem posição guardada (a obra aberta a frio, fix round 1 da Tarefa 6), a janela começa em volta dele, com o
 *   espaço de cima; rolando para cima, as linhas de cima se desenham e a rolagem é corrigida pelo quanto elas mudaram a
 *   altura (a âncora é feita aqui: quem usa põe `overflow-anchor: none` no contêiner das linhas, para o navegador não
 *   corrigir de novo).
 * `chave`: quando muda (outro filtro, outra ordem), a janela volta ao começo.
 */
export function useJanelaDaLista(total: number, chave: string, { alvo = -1, restaurar = false }: Opcoes = {}): Janela {
  const [estado, setEstado] = useState<Estado>(() => ({ chave, inicio: 0, fim: LINHAS_DE_COMECO, restaurar }))
  // O estado se ajusta no próprio render (sem um quadro com a janela velha): outra lista volta ao começo; o alvo fora da
  // janela a traz até ele.
  let atual = estado
  if (atual.chave !== chave) atual = { chave, inicio: 0, fim: LINHAS_DE_COMECO, restaurar: false }
  if (total > 0 && alvo >= 0 && alvo < total && (alvo < atual.inicio || alvo >= atual.fim)) {
    if (atual.restaurar) atual = { ...atual, inicio: 0, fim: alvo + 1 + DEPOIS_DO_ALVO }
    else {
      const inicio = Math.max(0, alvo - ANTES_DO_ALVO)
      atual = { ...atual, inicio, fim: Math.max(inicio + LINHAS_DE_COMECO, alvo + 1 + DEPOIS_DO_ALVO) }
    }
  }
  if (total > 0 && atual.restaurar) atual = { ...atual, restaurar: false }
  if (atual !== estado) setEstado(atual)

  const fim = Math.min(total, atual.fim)
  const inicio = Math.min(atual.inicio, fim)
  const refDoEspacoDeCima = useRef<HTMLDivElement>(null)
  const refDoEspaco = useRef<HTMLDivElement>(null)
  // ao crescer para cima: onde estava o espaço de baixo, para corrigir a rolagem depois do desenho
  const antesDeCrescer = useRef<number | null>(null)

  const crescerEmbaixo = useCallback((mais: number) => setEstado((e) => ({ ...e, fim: Math.min(total, Math.max(e.fim, fim) + mais) })), [total, fim])
  const crescerEmCima = useCallback(
    (mais: number) => {
      const baixo = refDoEspaco.current
      antesDeCrescer.current = baixo ? baixo.getBoundingClientRect().top : null
      setEstado((e) => ({ ...e, inicio: Math.max(0, Math.min(e.inicio, inicio) - mais) }))
    },
    [inicio],
  )

  // As linhas de cima entraram: as da tela desceram pelo quanto a altura de cima mudou (as linhas de verdade no lugar do
  // espaço estimado). Sobe-se a rolagem do mesmo tanto, antes de pintar: nada pula.
  useLayoutEffect(() => {
    const antes = antesDeCrescer.current
    const baixo = refDoEspaco.current
    antesDeCrescer.current = null
    if (antes === null || !baixo) return
    const delta = baixo.getBoundingClientRect().top - antes
    if (delta === 0) return
    const rola = quemRola(baixo)
    if (rola) rola.scrollTop += delta
    else window.scrollBy(0, delta)
  }, [inicio])

  // um espaço perto da tela: desenha as linhas que o cobrem, de um lado por vez (embaixo antes)
  const conferir = useCallback(() => {
    const baixo = refDoEspaco.current
    if (baixo && fim < total) {
      const r = baixo.getBoundingClientRect()
      // sem medida (num ambiente sem layout) não há o que cobrir
      const falta = window.innerHeight + MARGEM - r.top
      if (r.height > 0 && falta > 0) return crescerEmbaixo(passo(falta))
    }
    const cima = refDoEspacoDeCima.current
    if (cima && inicio > 0) {
      const r = cima.getBoundingClientRect()
      const falta = r.bottom + MARGEM
      if (r.height > 0 && falta > 0) crescerEmCima(passo(falta))
    }
  }, [fim, inicio, total, crescerEmbaixo, crescerEmCima])

  // Depois de cada desenho, e a cada rolagem (da janela ou de um painel: `scroll` não sobe, por isso a captura) e mudança de
  // tamanho: num quadro seguinte, para um passo por quadro.
  useEffect(() => {
    let quadro = requestAnimationFrame(conferir)
    const agendar = () => {
      cancelAnimationFrame(quadro)
      quadro = requestAnimationFrame(conferir)
    }
    document.addEventListener('scroll', agendar, { capture: true, passive: true })
    window.addEventListener('resize', agendar, { passive: true })
    return () => {
      cancelAnimationFrame(quadro)
      document.removeEventListener('scroll', agendar, { capture: true })
      window.removeEventListener('resize', agendar)
    }
  }, [conferir])

  const aoFocar = useCallback(
    (e: FocusEvent<HTMLElement>) => {
      const linhas = e.currentTarget.querySelectorAll('[data-linha-da-janela]')
      const i = Array.prototype.indexOf.call(linhas, (e.target as Element).closest('[data-linha-da-janela]'))
      if (i < 0) return
      if (fim < total && i >= linhas.length - PERTO_DA_PONTA) crescerEmbaixo(LINHAS_DE_COMECO / 2)
      else if (inicio > 0 && i < PERTO_DA_PONTA) crescerEmCima(LINHAS_DE_COMECO / 2)
    },
    [fim, inicio, total, crescerEmbaixo, crescerEmCima],
  )

  return {
    inicio,
    fim,
    espacoDeCima: inicio * ALTURA_ESTIMADA,
    espaco: Math.max(0, total - fim) * ALTURA_ESTIMADA,
    refDoEspacoDeCima,
    refDoEspaco,
    aoFocar,
  }
}
