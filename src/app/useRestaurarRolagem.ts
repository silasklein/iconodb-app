import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import { alturaSuficiente, decidirRolagem, guardarPosicao, lerPosicoes } from './rolagem'

const ESPERA_MAXIMA_MS = 1000

/**
 * Monta uma vez, em AppRoutes. Ao sair de uma tela guarda a rolagem dela; ao chegar numa tela nova começa no
 * topo; ao voltar restaura a posição, esperando (por alguns quadros, até ~1 s) a página ficar alta o bastante,
 * porque as listas chegam depois do banco. Quem rola de novo no meio da espera cancela a restauração, e
 * enquanto ela está pendente o valor a guardar é o alvo (o `scrollY` de uma página ainda curta vem cortado).
 *
 * Cada entrada do histórico tem a sua chave (`location.key`). Um REPLACE na mesma tela (as letras do filtro)
 * só troca a chave da entrada: a rolagem passa para a chave nova e nada é gravado para a velha, que ninguém
 * mais alcança. O roteador junta os `navigate()` de um mesmo clique num só: quem faz `replace` e depois `push`
 * (o item ao ampliar a imagem) espera o `replace` aparecer antes do `push`, senão a entrada a que o Voltar
 * volta nunca é vista aqui e volta sem posição.
 */
export function useRestaurarRolagem(): void {
  const { key, pathname } = useLocation()
  const tipo = useNavigationType()
  const atual = useRef<{ key: string; pathname: string | null; y: number }>({ key, pathname: null, y: 0 })
  const restaurando = useRef(false)

  // A rolagem corrente, a cada `scroll`. Ao sair da tela vale este valor, não `window.scrollY` (que, depois
  // de a tela nova entrar no DOM, já viria cortado pela altura menor). Durante uma restauração o evento
  // pode vir cortado: não vale.
  useEffect(() => {
    const ao = () => {
      if (!restaurando.current) atual.current.y = window.scrollY
    }
    // Fechar a aba ou recarregar: a posição da entrada corrente fica na sessão.
    const aoSair = () => {
      if (atual.current.pathname !== null) guardarPosicao(atual.current.key, atual.current.y)
    }
    window.addEventListener('scroll', ao, { passive: true })
    window.addEventListener('pagehide', aoSair)
    return () => {
      window.removeEventListener('scroll', ao)
      window.removeEventListener('pagehide', aoSair)
    }
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
    const mesmaTela = anterior.pathname === pathname
    // Só entradas de verdade ficam guardadas: um REPLACE na mesma tela apenas renomeia a entrada.
    const renomeou = tipo === 'REPLACE' && mesmaTela
    if (anterior.pathname !== null && anterior.key !== key && !renomeou) guardarPosicao(anterior.key, anterior.y)
    const decisao = decidirRolagem({ tipo, pathnameAnterior: anterior.pathname, pathname, salva: lerPosicoes()[key] })
    atual.current = {
      key,
      pathname,
      y: decisao.acao === 'topo' ? 0 : decisao.acao === 'restaurar' ? decisao.y : renomeou ? anterior.y : window.scrollY,
    }

    if (decisao.acao === 'topo') window.scrollTo(0, 0)
    if (decisao.acao !== 'restaurar') return

    let quadro = 0
    let cancelado = false
    const inicio = performance.now()
    restaurando.current = true
    const entradas = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
    const parar = (porQuemRola: boolean) => {
      if (cancelado) return
      cancelado = true
      restaurando.current = false
      cancelAnimationFrame(quadro)
      for (const e of entradas) window.removeEventListener(e, aoEntrar)
      // Quem rolou assumiu a posição: vale onde ele está, não o alvo.
      if (porQuemRola) atual.current.y = window.scrollY
    }
    const aoEntrar = () => parar(true)
    const tentar = () => {
      if (cancelado) return
      const pronta = alturaSuficiente({ scrollHeight: document.documentElement.scrollHeight, innerHeight: window.innerHeight, y: decisao.y })
      if (pronta) {
        window.scrollTo(0, decisao.y)
        atual.current.y = decisao.y
        parar(false)
        return
      }
      if (performance.now() - inicio >= ESPERA_MAXIMA_MS) {
        // A página não chegou à altura: leva-se o que dá, mas o alvo continua sendo o que se guarda (o
        // `scrollY` cortado só vale quando a pessoa rolar de novo).
        window.scrollTo(0, decisao.y)
        atual.current.y = decisao.y
        return
      }
      quadro = requestAnimationFrame(tentar)
    }
    for (const e of entradas) window.addEventListener(e, aoEntrar, { passive: true })
    quadro = requestAnimationFrame(tentar)
    return () => parar(false)
    // key identifica a entrada do histórico: o efeito roda uma vez por entrada
  }, [key])
}
