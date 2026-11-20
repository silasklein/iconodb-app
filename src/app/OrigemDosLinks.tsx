import { createContext, useCallback, useContext, useMemo, type ComponentProps, type MouseEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { comModificador, temEntradaAnterior } from '../ui/useVoltar'
import { comoVoltar, comVoltar, indiceNoHistorico, voltarPara, type VoltarDaOrigem } from './voltar'

const Contexto = createContext<VoltarDaOrigem | null>(null)

/**
 * A tela de onde se abrem objetos (decisão 85): o verbete, o sítio, a obra, a Busca, as notas, Comparar, uma coleção SKC.
 * Os links para `/item/…` dentro dela levam `{ voltar: { rotulo, caminho, indice } }`, com o caminho de agora (o `?…`
 * junto) e a posição desta entrada no histórico. Sem rótulo, não passa nada.
 */
export function OrigemDosLinks({ rotulo, children }: { rotulo: string | null | undefined; children: ReactNode }) {
  const { pathname, search, key } = useLocation()
  // `key` refaz a conta a cada entrada do histórico (a posição muda com ela).
  const valor = useMemo(() => (rotulo && rotulo.trim() ? voltarPara(rotulo, `${pathname}${search}`) : null), [rotulo, pathname, search, key]) // eslint-disable-line react-hooks/exhaustive-deps
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

/** A origem que os links para objetos daqui levam (null fora de uma tela de origem). */
export const useOrigemDosLinks = (): VoltarDaOrigem | null => useContext(Contexto)

/**
 * As telas que mostram o «‹ origem» (decisão 85): o objeto, desde a Tarefa 25 a página do § e, desde a Tarefa 5 da leitura
 * do IPIAO, a página de leitura da obra de catálogo (`/ler/…`).
 */
const levaAOrigem = (to: ComponentProps<typeof Link>['to']) => {
  const caminho = typeof to === 'string' ? to : (to.pathname ?? '')
  return caminho.startsWith('/item/') || caminho.startsWith('/paragrafo/') || caminho.startsWith('/ler/')
}

/**
 * O `Link` dos lugares que levam a objetos e a outras telas (as notas, as hipóteses de um verbete, Comparar): só o que
 * vai a `/item/…`, a `/paragrafo/…` ou a `/ler/…` leva a origem, junto do estado que já tinha.
 */
export function LinkComOrigem(props: ComponentProps<typeof Link>) {
  const origem = useOrigemDosLinks()
  const state = levaAOrigem(props.to) ? comVoltar(props.state, origem) : props.state
  return <Link {...props} state={state} />
}

/**
 * O clique do «‹ …» do objeto: volta no histórico quando a entrada anterior é a origem (a tela reaparece como estava);
 * senão vai ao caminho dela. Clique com modificador abre o `href` como o navegador quiser.
 */
export function useAoVoltarParaOrigem(v: VoltarDaOrigem | null): (e: MouseEvent<HTMLAnchorElement>) => void {
  const navegar = useNavigate()
  const location = useLocation()
  return useCallback(
    (e) => {
      if (!v || e.defaultPrevented || comModificador(e)) return
      e.preventDefault()
      if (comoVoltar(v, indiceNoHistorico(), temEntradaAnterior(location)) === 'historico') void navegar(-1)
      // sem a origem logo atrás: empilha a tela de origem (de propósito, ao contrário do `replace` de useIrParaTras: o objeto
      // fica no histórico, sem apagar uma entrada que a pessoa ainda queira)
      else void navegar(v.caminho)
    },
    [v, navegar, location],
  )
}
