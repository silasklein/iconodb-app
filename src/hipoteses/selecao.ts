/**
 * A seleção de um trecho numa leitura (Tarefa 10), em posições do texto GUARDADO da leitura.
 *
 * Quem desenha uma leitura marca o bloco do texto com `data-trecho-fonte` (o id do trecho do livro, `PA-…`, ou o id do
 * objeto SKC, `OB-…`) e `data-trecho-lingua` (`pt`, `de` ou `skc`). Dentro do bloco:
 * - Leitura do livro (Leitura.tsx): o texto visível É o texto guardado, peça por peça (`montarTrechos`); só o texto
 *   para leitor de tela das âncoras (`.so-leitor`, ou qualquer `[data-fora-do-texto]`) não conta.
 * - Leitura SKC (TextoDaNota com `posicoes`): cada peça vem num `<span data-b="<início no texto guardado>">`; um link
 *   ou citação (que aparece com outro texto) também tem `data-b-fim` e é indivisível: uma ponta dentro dele vai à
 *   borda dele (o início ao começo, o fim ao fim).
 * Posições em UTF-16 (como as strings do JavaScript); `ancoraDoTrecho` converte em code points.
 */

export interface TrechoNaTela {
  bloco: HTMLElement
  fonte: string
  lingua: 'pt' | 'de' | 'skc'
  inicio: number
  fim: number
}

const FORA = '.so-leitor, [data-fora-do-texto]'

function blocoDe(no: Node): HTMLElement | null {
  const el = no.nodeType === Node.ELEMENT_NODE ? (no as Element) : no.parentElement
  return el?.closest<HTMLElement>('[data-trecho-fonte]') ?? null
}

interface PedacoDeTexto {
  no: Text
  /** Onde o texto deste nó começa e termina no texto guardado. */
  comeco: number
  final: number
  /** Um link ou citação (indivisível): `el` é o elemento dele. */
  atomico: Element | null
}

/** Os nós de texto do bloco, em ordem, com as posições no texto guardado (sem o texto só para leitor de tela). */
function pedacos(bloco: HTMLElement): PedacoDeTexto[] {
  const saida: PedacoDeTexto[] = []
  const caminhante = document.createTreeWalker(bloco, NodeFilter.SHOW_TEXT)
  const usadoNoEl = new Map<Element, number>()
  let visivel = 0
  for (let t = caminhante.nextNode() as Text | null; t; t = caminhante.nextNode() as Text | null) {
    if (t.parentElement?.closest(FORA)) continue
    const tam = t.data.length
    const el = t.parentElement?.closest('[data-b]') ?? null
    if (el && bloco.contains(el)) {
      const b = Number(el.getAttribute('data-b'))
      if (el.hasAttribute('data-b-fim')) {
        saida.push({ no: t, comeco: b, final: Number(el.getAttribute('data-b-fim')), atomico: el })
      } else {
        const usado = usadoNoEl.get(el) ?? 0
        usadoNoEl.set(el, usado + tam)
        saida.push({ no: t, comeco: b + usado, final: b + usado + tam, atomico: null })
      }
    } else {
      saida.push({ no: t, comeco: visivel, final: visivel + tam, atomico: null })
      visivel += tam
    }
  }
  return saida
}

/** A posição da ponta (`no`, `deslocamento`) no texto guardado do bloco. */
function posicao(bloco: HTMLElement, no: Node, deslocamento: number, lado: 'inicio' | 'fim'): number {
  const ponta = document.createRange()
  ponta.setStart(no, deslocamento)
  ponta.collapse(true)
  let ate = 0
  for (const p of pedacos(bloco)) {
    if (p.no === no) return p.atomico ? (lado === 'inicio' ? p.comeco : p.final) : p.comeco + Math.min(deslocamento, p.no.data.length)
    // O fim deste texto está antes da ponta (ou nela): ele inteiro vem antes.
    if (ponta.comparePoint(p.no, p.no.data.length) <= 0) {
      ate = p.final
      continue
    }
    // A ponta está antes deste texto (entre elementos).
    return lado === 'inicio' ? p.comeco : ate
  }
  return ate
}

/**
 * O contrário de `trechoDoIntervalo`: o intervalo na tela das posições `inicio`–`fim` (UTF-16) do texto guardado, ou
 * null se elas passam do texto. Um link ou citação tocado pelo trecho entra inteiro.
 */
export function intervaloNoBloco(bloco: HTMLElement, inicio: number, fim: number): Range | null {
  if (!(fim > inicio)) return null
  const lista = pedacos(bloco)
  const r = document.createRange()
  const a = lista.find((p) => p.final > inicio)
  const b = lista.find((p) => p.final >= fim)
  if (!a || !b) return null
  if (a.atomico) r.setStartBefore(a.atomico)
  else r.setStart(a.no, Math.max(0, inicio - a.comeco))
  if (b.atomico) r.setEndAfter(b.atomico)
  else r.setEnd(b.no, Math.min(b.no.data.length, fim - b.comeco))
  return r
}

/** O trecho de um intervalo selecionado, se começa e termina dentro do mesmo bloco de leitura e não é vazio. */
export function trechoDoIntervalo(r: Range): TrechoNaTela | null {
  if (r.collapsed) return null
  const bloco = blocoDe(r.startContainer)
  if (!bloco || blocoDe(r.endContainer) !== bloco) return null
  const lingua = bloco.getAttribute('data-trecho-lingua')
  if (lingua !== 'pt' && lingua !== 'de' && lingua !== 'skc') return null
  const inicio = posicao(bloco, r.startContainer, r.startOffset, 'inicio')
  const fim = posicao(bloco, r.endContainer, r.endOffset, 'fim')
  if (fim <= inicio) return null
  return { bloco, fonte: bloco.getAttribute('data-trecho-fonte')!, lingua, inicio, fim }
}

/** O bloco de leitura de `fonte` na tela, se há. */
export function blocoDaFonte(fonte: string, lingua: string): Element | null {
  return document.querySelector(`[data-trecho-fonte="${CSS.escape(fonte)}"][data-trecho-lingua="${CSS.escape(lingua)}"]`)
}

/** O rótulo da fonte de uma leitura como está na tela ("TESTE I: 2"), pelo bloco do texto dela. */
export function rotuloDaFonteNaTela(fonte: string, lingua: string): string | null {
  const caixa = blocoDaFonte(fonte, lingua)?.closest('.leitura')?.querySelector('.leitura-fonte')
  if (!caixa) return null
  return [...caixa.children].map((c) => c.textContent?.trim() ?? '').filter(Boolean).join(' ') || null
}
