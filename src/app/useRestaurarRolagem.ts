import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import { alturaSuficiente, decidirRolagem, guardarPosicao, lerPosicoes } from './rolagem'

const ESPERA_MAXIMA_MS = 1000

/**
 * Monta uma vez, em AppRoutes. Ao sair de uma tela guarda a rolagem dela; ao chegar numa tela nova começa no
 * topo; ao voltar restaura a posição, esperando (por alguns quadros, até ~1 s) a página ficar alta o bastante,
 * porque as listas chegam depois do banco. Quem rola de novo no meio da espera cancela a restauração.
 */
export function useRestaurarRolagem(): void {
  const { key, pathname } = useLocation()
  const tipo = useNavigationType()
  const atual = useRef<{ key: string; pathname: string | null; y: number }>({ key, pathname: null, y: 0 })

  // A rolagem corrente, a cada `scroll`. Ao sair da tela vale este valor, não `window.scrollY` (que, depois
  // de a tela nova entrar no DOM, já viria cortado pela altura menor).
  useEffect(() => {
    const ao = () => (atual.current.y = window.scrollY)
    window.addEventListener('scroll', ao, { passive: true })
    return () => window.removeEventListener('scroll', ao)
  }, [])

  useEffect(() => {
    try {
      history.scrollRestoration = 'manual'
    } catch {
      /* sem history.scrollRestoration */
    }
  }, [])

  useLayoutEffect(() => {
    const anterior = atual.current
    if (anterior.pathname !== null && anterior.key !== key) guardarPosicao(anterior.key, anterior.y)
    const decisao = decidirRolagem({ tipo, pathnameAnterior: anterior.pathname, pathname, salva: lerPosicoes()[key] })
    atual.current = { key, pathname, y: decisao.acao === 'topo' ? 0 : window.scrollY }

    if (decisao.acao === 'topo') window.scrollTo(0, 0)
    if (decisao.acao !== 'restaurar') return

    let quadro = 0
    let cancelado = false
    const inicio = performance.now()
    const parar = () => {
      cancelado = true
      cancelAnimationFrame(quadro)
      window.removeEventListener('wheel', parar)
      window.removeEventListener('touchstart', parar)
      window.removeEventListener('keydown', parar)
    }
    const tentar = () => {
      if (cancelado) return
      const pronta = alturaSuficiente({ scrollHeight: document.documentElement.scrollHeight, innerHeight: window.innerHeight, y: decisao.y })
      if (pronta || performance.now() - inicio >= ESPERA_MAXIMA_MS) {
        window.scrollTo(0, decisao.y)
        atual.current.y = decisao.y
        parar()
        return
      }
      quadro = requestAnimationFrame(tentar)
    }
    window.addEventListener('wheel', parar, { passive: true })
    window.addEventListener('touchstart', parar, { passive: true })
    window.addEventListener('keydown', parar)
    quadro = requestAnimationFrame(tentar)
    return parar
    // key identifica a entrada do histórico: o efeito roda uma vez por entrada
  }, [key])
}
