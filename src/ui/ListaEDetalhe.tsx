import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import { aindaCarregando, ESPERA_COM_CARREGANDO_MS, guardarPaineis, lerPaineis, type RolagemDosPaineis } from '../app/rolagem'
import './ListaEDetalhe.css'

const ESPERA_MAXIMA_MS = 1000

/**
 * A rolagem dos dois painéis fica com a entrada do histórico: ao sair (para o objeto, por exemplo) se guarda; ao voltar
 * (POP) se restaura, esperando o conteúdo chegar (até ~1 s depois de os painéis pararem de carregar, `aindaCarregando`),
 * como a da janela (useRestaurarRolagem). Quem rola no meio
 * da espera assume a posição. Decisão 85: do objeto se volta ao verbete como estava.
 */
function useRolagemDosPaineis(lista: RefObject<HTMLElement | null>, principal: RefObject<HTMLElement | null>) {
  const { key } = useLocation()
  const tipo = useNavigationType()
  const atual = useRef<RolagemDosPaineis>({ lista: 0, principal: 0 })
  const restaurando = useRef(false)

  useEffect(() => {
    const l = lista.current
    const p = principal.current
    const aoRolar = () => {
      if (!restaurando.current) atual.current = { lista: l?.scrollTop ?? 0, principal: p?.scrollTop ?? 0 }
    }
    l?.addEventListener('scroll', aoRolar, { passive: true })
    p?.addEventListener('scroll', aoRolar, { passive: true })
    return () => {
      l?.removeEventListener('scroll', aoRolar)
      p?.removeEventListener('scroll', aoRolar)
    }
  }, [lista, principal])

  useLayoutEffect(() => {
    const entrada = key
    const salva = tipo === 'POP' ? lerPaineis()[key] : undefined
    atual.current = { lista: lista.current?.scrollTop ?? 0, principal: principal.current?.scrollTop ?? 0 }
    let quadro = 0
    let cancelado = !salva
    const entradas = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
    const parar = (porQuemRola: boolean) => {
      if (cancelado) return
      cancelado = true
      restaurando.current = false
      cancelAnimationFrame(quadro)
      for (const e of entradas) window.removeEventListener(e, aoEntrar)
      if (porQuemRola) atual.current = { lista: lista.current?.scrollTop ?? 0, principal: principal.current?.scrollTop ?? 0 }
    }
    const aoEntrar = () => parar(true)
    if (salva) {
      restaurando.current = true
      atual.current = salva
      const comeco = performance.now()
      // o ~1 s conta a partir de quando os painéis param de carregar (aria-busy; Tarefa 6e), até o teto
      let inicio = comeco
      const tentar = () => {
        if (cancelado) return
        const pares = [
          [lista.current, salva.lista],
          [principal.current, salva.principal],
        ] as const
        const agora = performance.now()
        const carregando = aindaCarregando([lista.current, principal.current])
        if (carregando && agora - comeco < ESPERA_COM_CARREGANDO_MS) inicio = agora
        const prontos = pares.every(([el, y]) => !el || y <= 0 || el.scrollHeight - el.clientHeight >= y)
        if (prontos || agora - inicio >= ESPERA_MAXIMA_MS) {
          for (const [el, y] of pares) if (el && y > 0) el.scrollTop = y
          parar(false)
          return
        }
        quadro = requestAnimationFrame(tentar)
      }
      for (const e of entradas) window.addEventListener(e, aoEntrar, { passive: true })
      tentar()
    }
    return () => {
      parar(false)
      guardarPaineis(entrada, atual.current)
    }
    // key identifica a entrada do histórico: o efeito roda uma vez por entrada
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
}

interface Props {
  /** Nome da região da lista (leitor de tela). */
  rotulo: string
  lista: ReactNode
  detalhe: ReactNode
  /** Identifica o item mostrado: ao mudar, o painel do detalhe volta ao topo. */
  chave?: string
  /** O que o leitor de tela anuncia (educadamente) ao escolher um item: o título dele. */
  anuncio?: string
  /** `mapa`: o lado direito é o mapa dos sítios, sem margem nem rolagem (PC-SitiosMapa.dc.html). */
  modo?: 'mapa'
  /** A lista de 480 px (a dos Sítios, com as etiquetas de região), em vez de 400 px. */
  listaLarga?: boolean
}

/**
 * O computador (a partir de 768 px): a lista à esquerda, com a rolagem dela, e o detalhe à direita
 * (PC-Glossario.dc.html e irmãs). Como é o mesmo elemento em /glossario e em /verbete/:id, trocar de
 * item não remonta a lista: o texto do filtro e a posição da rolagem ficam.
 */
export function ListaEDetalhe({ rotulo, lista, detalhe, chave, anuncio, modo, listaLarga }: Props) {
  const principal = useRef<HTMLElement>(null)
  const rolagem = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (principal.current) principal.current.scrollTop = 0
  }, [chave])
  // Depois do topo de cima: voltando a uma entrada, a posição guardada dela vale sobre o topo.
  useRolagemDosPaineis(rolagem, principal)
  return (
    <div className={`lista-detalhe${modo === 'mapa' ? ' lista-detalhe-mapa' : ''}${listaLarga ? ' lista-detalhe-larga' : ''}`}>
      <aside className="lista-lateral" aria-label={rotulo}>
        <div className="lista-rolagem" ref={rolagem}>
          {lista}
        </div>
      </aside>
      <main className="lista-principal" ref={principal}>
        {detalhe}
      </main>
      <div className="so-leitor" aria-live="polite" aria-atomic="true" data-anuncio="">
        {anuncio}
      </div>
    </div>
  )
}
