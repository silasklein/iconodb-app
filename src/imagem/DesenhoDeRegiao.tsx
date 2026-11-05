import { useRef, type PointerEvent as PonteiroDoReact } from 'react'
import { pontosDoPoligono } from '../item/imagemComum'
import { aplicarEdicao, clienteParaRelativo, moverPonto, pontoSob, tocar, type Edicao, type PontoRelativo, type Tolerancia } from './desenhar'
import './Desenho.css'

/** Até quantos pixels da tela um toque pega um ponto (e o primeiro ponto, para fechar). */
const TOLERANCIA_PX = 14
/** Um toque que andou mais que isto é um arrasto (não põe ponto). */
const TOQUE_MAX_PX = 8

interface Props {
  edicao: Edicao
  aoMudar: (e: Edicao) => void
  /** O giro da figura (graus, sentido horário), o mesmo da imagem por baixo. */
  giro: number
}

interface Arrasto {
  id: number
  x: number
  y: number
  movido: boolean
  /** O ponto sendo arrastado (-1: um toque, que põe ponto ao soltar). */
  ponto: number
  base: Edicao
}

/**
 * A camada do desenho da região (Tarefa 10): por cima da figura, no mesmo quadro dela (0 a 1, girando junto). Um toque
 * ou clique põe um ponto; no primeiro ponto (com 3 ou mais), fecha; um ponto arrastado se move (um passo de "Desfazer").
 * Dois dedos não desenham: a pinça e o arrasto da imagem seguem com o palco. Um arrasto interrompido (`pointercancel`,
 * ou um segundo dedo que pousa) devolve o ponto: nenhum passo fica aplicado sem entrar no histórico (revisão 3, M7).
 */
export function DesenhoDeRegiao({ edicao, aoMudar, giro }: Props) {
  const camada = useRef<HTMLDivElement>(null)
  const arrasto = useRef<Arrasto | null>(null)
  const ponteiros = useRef(new Set<number>())
  const { pontos, fechado } = edicao.atual

  const medir = (x: number, y: number): { p: PontoRelativo; tol: Tolerancia } | null => {
    const el = camada.current
    if (!el) return null
    const caixa = el.getBoundingClientRect()
    const tam = { w: el.offsetWidth, h: el.offsetHeight }
    const p = clienteParaRelativo({ x, y }, caixa, tam, giro)
    if (!p) return null
    const r = (giro * Math.PI) / 180
    const escala = caixa.width / (tam.w * Math.abs(Math.cos(r)) + tam.h * Math.abs(Math.sin(r)))
    return { p, tol: { x: TOLERANCIA_PX / (tam.w * escala), y: TOLERANCIA_PX / (tam.h * escala) } }
  }

  const aoPressionar = (e: PonteiroDoReact<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    ponteiros.current.add(e.pointerId)
    if (ponteiros.current.size > 1) {
      // Um segundo dedo no meio de um arrasto: o ponto volta para onde estava (sem passo no histórico; M7).
      interromper()
      return
    }
    const m = medir(e.clientX, e.clientY)
    if (!m) return
    const i = pontoSob(edicao.atual, m.p, m.tol)
    // O primeiro ponto, com a região aberta e 3 ou mais pontos, é para fechar (um toque), não para arrastar.
    const arrastavel = i >= 0 && (fechado || i !== 0 || pontos.length < 3)
    arrasto.current = { id: e.pointerId, x: e.clientX, y: e.clientY, movido: false, ponto: arrastavel ? i : -1, base: edicao }
    if (arrastavel) {
      e.stopPropagation()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* sem captura, o arrasto segue enquanto o ponteiro estiver sobre a camada */
      }
    }
  }
  const aoMover = (e: PonteiroDoReact<HTMLDivElement>) => {
    const a = arrasto.current
    if (!a || a.id !== e.pointerId) return
    if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > TOQUE_MAX_PX) a.movido = true
    if (a.ponto < 0 || !a.movido) return
    e.stopPropagation()
    const m = medir(e.clientX, e.clientY)
    if (m) aoMudar({ atual: moverPonto(a.base.atual, a.ponto, m.p), antes: a.base.antes })
  }
  /** O arrasto parou no meio (cancelado, ou outro dedo pousou): o ponto arrastado volta, e o histórico fica como antes. */
  const interromper = () => {
    const a = arrasto.current
    arrasto.current = null
    if (a && a.ponto >= 0 && a.movido) aoMudar(a.base)
  }
  const aoCancelar = (e: PonteiroDoReact<HTMLDivElement>) => {
    ponteiros.current.delete(e.pointerId)
    if (arrasto.current?.id === e.pointerId) interromper()
  }
  const aoSoltar = (e: PonteiroDoReact<HTMLDivElement>) => {
    ponteiros.current.delete(e.pointerId)
    const a = arrasto.current
    arrasto.current = null
    if (!a || a.id !== e.pointerId || e.type !== 'pointerup') return
    const m = medir(e.clientX, e.clientY)
    if (!m) return
    if (a.ponto >= 0) {
      if (a.movido) aoMudar(aplicarEdicao(a.base, moverPonto(a.base.atual, a.ponto, m.p)))
      return
    }
    if (!a.movido) aoMudar(aplicarEdicao(a.base, tocar(a.base.atual, m.p, m.tol)))
  }

  return (
    <div
      ref={camada}
      className={`desenho${fechado ? ' desenho-fechado' : ''}`}
      data-testid="desenho-camada"
      onPointerDown={aoPressionar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoCancelar}
    >
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        {pontos.length >= 2 &&
          (fechado ? (
            <polygon points={pontosDoPoligono(pontos)} vectorEffect="non-scaling-stroke" />
          ) : (
            <>
              <polyline points={pontosDoPoligono(pontos)} vectorEffect="non-scaling-stroke" />
              {pontos.length >= 3 && <line className="desenho-fecho" x1={pontos.at(-1)![0]} y1={pontos.at(-1)![1]} x2={pontos[0]![0]} y2={pontos[0]![1]} vectorEffect="non-scaling-stroke" />}
            </>
          ))}
      </svg>
      {pontos.map(([x, y], i) => (
        <span key={i} className={`desenho-ponto${i === 0 && !fechado ? ' desenho-ponto-primeiro' : ''}`} style={{ left: `${x * 100}%`, top: `${y * 100}%` }} aria-hidden="true" />
      ))}
    </div>
  )
}
