import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useAtalhos } from '../app/useAtalhos'
import { imagem as buscarImagem, regioes as buscarRegioes } from '../banco/consultas'
import type { Imagem as ImagemDoBanco, Regiao } from '../banco/tipos'
import { comImagemAberta, lerEstadoDoVisualizador, pedirFocoNoAmpliar, type EstadoDoVisualizador } from '../imagem/estado'
import {
  ajustar,
  alternarZoom,
  caixaGirada,
  emPorcento,
  fatorDaRoda,
  limitarVista,
  mover,
  passo,
  pinca,
  VISTA_INICIAL,
  zoomEm,
  type Ponto,
  type Tamanho,
  type Vista,
} from '../imagem/zoom'
import { estiloDeInversao, giroDaImagem, pontosDoPoligono, transformDoGiro, useUrlDaImagem } from '../item/imagemComum'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { IconButton } from '../ui/IconButton'
import { MSG_IMAGEM_OFFLINE } from '../ui/Miniatura'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { useTema } from '../ui/useTema'
import './Imagem.css'

type ImagemComNumero = ImagemDoBanco & { numero: string; total: number }

/** Quanto uma seta anda a figura ampliada (px). */
const PASSO_DA_SETA = 60
/** Toque ou clique: no máximo isto parado (px) e rápido (ms); dois seguidos, a esta distância (px), são um toque duplo. */
const TOQUE_MAX_MOVIMENTO = 8
const TOQUE_MAX_DURACAO = 400
const TOQUE_DUPLO_JANELA = 400
const TOQUE_DUPLO_DISTANCIA = 40

/**
 * O visualizador de imagem em tela cheia (Imagem.dc.html no celular; PC-Imagem.dc.html no
 * computador): a imagem sobre o preto, ampliável de 1× a 8× (pinça, roda, toque duplo, teclas),
 * com o original/invertido (`I`) e as regiões marcadas por cima (`R`). `/imagem/:id`. A marcação de
 * regiões (desenhar) é da Parte 2B: aqui só se lê.
 */
export function Imagem() {
  useTema('item')
  const { id = '' } = useParams()
  const { state } = useLocation()
  const origem = lerEstadoDoVisualizador(state)
  const carga = useCarregar(() => buscarImagem(id), id)
  const cargaDasRegioes = useCarregar(() => buscarRegioes(id), id)

  if (carga.fase === 'carregando') return <Casca origem={origem} ocupada />
  if (carga.fase === 'erro') {
    return (
      <Casca origem={origem}>
        <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />
      </Casca>
    )
  }
  if (carga.dados === null) {
    return (
      <Casca origem={origem}>
        <h1>Imagem não encontrada</h1>
        <p>
          <Link to="/colecoes">Ver as coleções</Link> · <Link to="/busca">Buscar</Link>
        </p>
      </Casca>
    )
  }
  return <Visualizador key={carga.dados.id} img={carga.dados} regioes={cargaDasRegioes.fase === 'ok' ? cargaDasRegioes.dados : []} origem={origem} />
}

/**
 * A casca do visualizador enquanto não há imagem (carregando, erro, não encontrada): o botão Fechar
 * visível e `Esc` fecham, para nunca prender a pessoa nesta tela. Sem saber o objeto, vindo do item
 * volta no histórico; aberto direto, vai às coleções.
 */
function Casca({ origem, ocupada = false, children }: { origem: EstadoDoVisualizador | null; ocupada?: boolean; children?: ReactNode }) {
  const navegar = useNavigate()
  const topo = useRef<HTMLDivElement>(null)
  const fechar = useCallback(() => {
    pedirFocoNoAmpliar()
    if (origem) navegar(-1)
    else navegar('/colecoes', { replace: true })
  }, [origem, navegar])
  const aoFechar = useRef(fechar)
  aoFechar.current = fechar
  useEffect(() => {
    topo.current?.querySelector<HTMLElement>('button')?.focus()
  }, [])
  useAtalhos({ Escape: () => aoFechar.current() }, 'visualizador')
  return (
    <main className="visualizador visualizador-aviso" aria-busy={ocupada || undefined}>
      <div className="vis-topo-solto" ref={topo}>
        <IconButton icon="fechar" label="Fechar o visualizador" shortcut="Escape" shortcutLabel="Esc" tipPosition="start" onClick={fechar} />
      </div>
      {children}
    </main>
  )
}

/** O tamanho do palco, medido ao montar e a cada mudança. */
function useTamanhoDoPalco(ref: React.RefObject<HTMLElement | null>): Tamanho {
  const [tamanho, setTamanho] = useState<Tamanho>({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => {
      const r = el.getBoundingClientRect()
      setTamanho((t) => (t.w === r.width && t.h === r.height ? t : { w: r.width, h: r.height }))
    }
    medir()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', medir)
      return () => window.removeEventListener('resize', medir)
    }
    const o = new ResizeObserver(medir)
    o.observe(el)
    return () => o.disconnect()
  }, [ref])
  return tamanho
}

const distancia = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.y - b.y)

interface Props {
  img: ImagemComNumero
  regioes: readonly Regiao[]
  origem: EstadoDoVisualizador | null
}

function Visualizador({ img, regioes, origem }: Props) {
  const navegar = useNavigate()
  const computador = useBreakpoint() === 'computador'
  const palcoRef = useRef<HTMLDivElement>(null)
  const topoRef = useRef<HTMLDivElement>(null)
  const palco = useTamanhoDoPalco(palcoRef)
  const [vista, setVista] = useState<Vista>(VISTA_INICIAL)
  const [original, setOriginal] = useState(origem?.original ?? false)
  const [mostrarRegioes, setMostrarRegioes] = useState(true)
  const [ocultas, setOcultas] = useState<ReadonlySet<number>>(new Set())
  const [natural, setNatural] = useState<Tamanho | null>(null)

  const caminho = img.tela ?? img.miniatura
  const { url, falhou, aoFalhar } = useUrlDaImagem(caminho)
  const traco = img.display_mode === 'traco'
  const invertida = traco && !original
  const giro = giroDaImagem(img.rotacao)
  const dimensoes = natural ?? (img.largura && img.altura ? { w: img.largura, h: img.altura } : { w: 0, h: 0 })
  const figura = ajustar(palco, dimensoes, giro)
  const caixa = caixaGirada(figura, giro)

  // As teclas, o roteador e os ponteiros leem sempre o valor mais novo destas medidas.
  const geometria = useRef({ palco, caixa })
  geometria.current = { palco, caixa }
  const vistaAtual = useRef(vista)
  vistaAtual.current = vista

  const alterarVista = useCallback((f: (v: Vista, palco: Tamanho, caixa: Tamanho) => Vista) => setVista((v) => f(v, geometria.current.palco, geometria.current.caixa)), [])
  const ajustarATela = useCallback(() => setVista(VISTA_INICIAL), [])
  const alternarOriginal = useCallback(() => setOriginal((o) => !o), [])
  const alternarRegioes = useCallback(() => setMostrarRegioes((m) => !m), [])

  // Fechar: vindo do item, volta no histórico (o item reaparece como estava); aberto direto, leva ao item do objeto.
  // O item devolve o foco ao "Ampliar a imagem" ao montar (ver estado.ts).
  const fechar = useCallback(() => {
    pedirFocoNoAmpliar()
    if (origem) navegar(-1)
    else navegar(`/item/${encodeURIComponent(img.numero)}`, { replace: true, state: comImagemAberta(null, { imagemId: img.id, original }) })
  }, [origem, navegar, img.numero, img.id, original])

  // O foco começa no Fechar: Esc e Tab agem a partir dele.
  useEffect(() => {
    topoRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [])

  // ---- teclado ----
  const temRegioes = regioes.length > 0 && !!url
  // As teclas são do registro de atalhos (campos de texto, modificadores, diálogos modais e o "g" + letra ficam com ele).
  // Cada ação devolve false quando não há o que fazer agora, e a tecla segue para o navegador.
  const ampliarUm = () => (url ? alterarVista((v, p, c) => passo(v, 1, p, c)) : false)
  const reduzirUm = () => (url ? alterarVista((v, p, c) => passo(v, -1, p, c)) : false)
  const seta = (dx: number, dy: number) => () => {
    if (!url || vistaAtual.current.escala <= 1) return false
    alterarVista((v, p, c) => mover(v, dx, dy, p, c))
  }
  useAtalhos(
    {
      Escape: fechar,
      i: () => (url && traco ? alternarOriginal() : false),
      '+': ampliarUm,
      '=': ampliarUm,
      z: ampliarUm,
      '-': reduzirUm,
      _: reduzirUm,
      '0': () => (url ? ajustarATela() : false),
      r: () => (url && temRegioes ? alternarRegioes() : false),
      ArrowLeft: seta(PASSO_DA_SETA, 0),
      ArrowRight: seta(-PASSO_DA_SETA, 0),
      ArrowUp: seta(0, PASSO_DA_SETA),
      ArrowDown: seta(0, -PASSO_DA_SETA),
    },
    'visualizador',
  )

  // ---- roda do mouse e pinça do trackpad do Safari (gesture*) ----
  const ponteiros = useRef(new Map<number, Ponto>())
  const relativo = useCallback((x: number, y: number): Ponto => {
    const r = palcoRef.current!.getBoundingClientRect()
    return { x: x - (r.left + r.width / 2), y: y - (r.top + r.height / 2) }
  }, [])
  useEffect(() => {
    const el = palcoRef.current
    if (!el) return
    // Ouvintes nativos e não passivos: o React registra a roda como passiva e não deixaria cancelar a rolagem da página.
    const aoRodar = (e: WheelEvent) => {
      e.preventDefault()
      const ponto = relativo(e.clientX, e.clientY)
      const fator = fatorDaRoda(e.deltaY, e.deltaMode, e.ctrlKey)
      alterarVista((v, p, c) => zoomEm(v, v.escala * fator, ponto, p, c))
    }
    let base = 1
    const aoComecarGesto = (e: Event) => {
      e.preventDefault()
      base = vistaAtual.current.escala
    }
    const aoGestualizar = (e: Event) => {
      e.preventDefault()
      if (ponteiros.current.size >= 2) return // no toque a pinça já vem dos ponteiros
      const g = e as Event & { scale: number; clientX?: number; clientY?: number }
      const ponto = g.clientX === undefined ? { x: 0, y: 0 } : relativo(g.clientX, g.clientY!)
      alterarVista((v, p, c) => zoomEm(v, base * g.scale, ponto, p, c))
    }
    el.addEventListener('wheel', aoRodar, { passive: false })
    el.addEventListener('gesturestart', aoComecarGesto)
    el.addEventListener('gesturechange', aoGestualizar)
    return () => {
      el.removeEventListener('wheel', aoRodar)
      el.removeEventListener('gesturestart', aoComecarGesto)
      el.removeEventListener('gesturechange', aoGestualizar)
    }
  }, [alterarVista, relativo])

  // ---- ponteiros: arrastar, pinça de dois dedos, toque duplo ----
  const toque = useRef<{ x: number; y: number; t: number; movido: boolean } | null>(null)
  const ultimoToque = useRef<{ x: number; y: number; t: number } | null>(null)

  const aoPressionar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* sem captura, o arrasto segue enquanto o ponteiro estiver sobre o palco */
    }
    const p = relativo(e.clientX, e.clientY)
    ponteiros.current.set(e.pointerId, p)
    toque.current = ponteiros.current.size === 1 ? { ...p, t: Date.now(), movido: false } : null
    if (ponteiros.current.size > 1) ultimoToque.current = null
  }
  const aoMover = (e: React.PointerEvent<HTMLDivElement>) => {
    const antes = ponteiros.current.get(e.pointerId)
    if (!antes) return
    const agora = relativo(e.clientX, e.clientY)
    const n = ponteiros.current.size
    if (n === 2) {
      const de = [...ponteiros.current.values()] as [Ponto, Ponto]
      const para = [...ponteiros.current.entries()].map(([id, p]) => (id === e.pointerId ? agora : p)) as [Ponto, Ponto]
      alterarVista((v, p, c) => pinca(v, de, para, p, c))
    } else if (n === 1) {
      if (toque.current && distancia(agora, toque.current) > TOQUE_MAX_MOVIMENTO) toque.current.movido = true
      alterarVista((v, p, c) => (v.escala > 1 ? mover(v, agora.x - antes.x, agora.y - antes.y, p, c) : v))
    }
    // Com três ou mais dedos não há gesto, mas a posição de cada um continua sendo acompanhada: ao
    // sobrar dois, a pinça parte de onde eles estão e não de onde estavam.
    ponteiros.current.set(e.pointerId, agora)
  }
  const aoPerderACaptura = (e: React.PointerEvent<HTMLDivElement>) => {
    ponteiros.current.delete(e.pointerId)
    toque.current = null
  }
  const aoSoltar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ponteiros.current.delete(e.pointerId)) return
    const t = toque.current
    toque.current = null
    if (e.type !== 'pointerup' || ponteiros.current.size > 0 || !t || t.movido || Date.now() - t.t > TOQUE_MAX_DURACAO) return
    const anterior = ultimoToque.current
    if (anterior && t.t - anterior.t < TOQUE_DUPLO_JANELA && distancia(t, anterior) < TOQUE_DUPLO_DISTANCIA) {
      ultimoToque.current = null
      alterarVista((v, p, c) => alternarZoom(v, t, p, c))
    } else {
      ultimoToque.current = { x: t.x, y: t.y, t: t.t }
    }
  }

  // A janela perdeu o foco no meio de um gesto (alt-tab, chamada no iPhone): sem ponteiros pendurados.
  useEffect(() => {
    const limpar = () => {
      ponteiros.current.clear()
      toque.current = null
    }
    window.addEventListener('blur', limpar)
    return () => window.removeEventListener('blur', limpar)
  }, [])

  // O palco ou a figura mudou de tamanho (girar o aparelho, redimensionar a janela) com a vista ampliada:
  // refaz o limite, para a figura não ficar fora do palco.
  useEffect(() => {
    setVista((v) => {
      const n = limitarVista(v, palco, caixa)
      return n.escala === v.escala && n.x === v.x && n.y === v.y ? v : n
    })
  }, [palco.w, palco.h, caixa.w, caixa.h])

  // ---- regiões ----
  const visiveis = mostrarRegioes && url ? regioes.filter((r) => !ocultas.has(r.id)) : []
  const alternarRegiao = (id: number) =>
    setOcultas((o) => {
      const n = new Set(o)
      if (!n.delete(id)) n.add(id)
      return n
    })

  const transformada = `translate(${arred(vista.x)}px, ${arred(vista.y)}px) scale(${Number(vista.escala.toFixed(4))}) ${transformDoGiro(giro)}`
  const inverter = traco && url && (
    <IconButton icon="inverter" label="Mostrar o original sem inversão" shortcut="I" pressionado={original} tipAbove={computador} onClick={alternarOriginal} />
  )
  const estado = !traco ? null : invertida ? 'desenho invertido' : 'original'

  return (
    <div className="visualizador">
      <main className="vis-coluna">
        <h1 className="so-leitor">{`Visualizador de imagem ${img.numero}`}</h1>
        <header className="vis-topo">
          <div ref={topoRef}>
            <IconButton icon="fechar" label="Fechar o visualizador" shortcut="Escape" shortcutLabel="Esc" tipPosition="start" onClick={fechar} />
          </div>
          <p className="vis-titulo">
            <span className="codigo vis-numero">{`${img.numero} · ${img.ordinal}/${img.total}`}</span>
            {computador && estado && <span className="vis-estado">{` · ${estado}`}</span>}
          </p>
          <div className="vis-topo-acoes">{!computador && inverter}</div>
        </header>

        <div
          ref={palcoRef}
          className={`vis-palco${vista.escala > 1 ? ' vis-palco-ampliado' : ''}`}
          onPointerDown={aoPressionar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
          onLostPointerCapture={aoPerderACaptura}
        >
          {url ? (
            <div
              className="vis-figura"
              style={
                {
                  width: figura.w,
                  height: figura.h,
                  left: `calc(50% - ${figura.w / 2}px)`,
                  top: `calc(50% - ${figura.h / 2}px)`,
                  transform: transformada,
                  '--escala': vista.escala,
                  '--giro': `${giro}deg`,
                } as React.CSSProperties
              }
            >
              <img
                src={url}
                alt={`Imagem ${img.ordinal} de ${img.numero}${invertida ? ', invertida' : ''}`}
                decoding="async"
                draggable={false}
                style={estiloDeInversao(img.display_mode, original)}
                onError={aoFalhar}
                onLoad={(e) => {
                  const { naturalWidth: w, naturalHeight: h } = e.currentTarget
                  if (w > 0 && h > 0) setNatural({ w, h })
                }}
              />
              {visiveis.length > 0 && (
                <>
                  <svg className="vis-regioes" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
                    {visiveis.map((r) => (
                      <polygon key={r.id} points={pontosDoPoligono(r.pontos)} vectorEffect="non-scaling-stroke" />
                    ))}
                  </svg>
                  {visiveis.map((r) => {
                    const x = Math.min(...r.pontos.map((p) => p[0]))
                    const y = Math.min(...r.pontos.map((p) => p[1]))
                    return (
                      <span key={r.id} className="vis-rotulo" aria-hidden="true" style={{ left: `${x * 100}%`, bottom: `${(1 - y) * 100}%` }}>
                        {r.elemento}
                      </span>
                    )
                  })}
                </>
              )}
            </div>
          ) : (
            <p className="vis-aviso" aria-hidden={!falhou}>
              {falhou ? MSG_IMAGEM_OFFLINE : ''}
            </p>
          )}
        </div>

        {img.credito && <p className="vis-credito">{img.credito}</p>}

        {url && (
          <div className="vis-rodape">
            <div role="toolbar" aria-label="Ferramentas da imagem" className="vis-ferramentas">
              <IconButton icon="recolher" label="Reduzir" shortcut="-" shortcutLabel="−" tipAbove onClick={() => alterarVista((v, p, c) => passo(v, -1, p, c))} />
              <span className="vis-escala codigo">{`${emPorcento(vista.escala)} %`}</span>
              <IconButton icon="adicionar" label="Ampliar" shortcut="Z +" shortcutLabel="Z ou +" tipAbove onClick={() => alterarVista((v, p, c) => passo(v, 1, p, c))} />
              <IconButton icon="ajustar" label="Ajustar à tela" shortcut="0" tipAbove onClick={ajustarATela} />
              {(temRegioes || (computador && inverter)) && <span className="vis-separador" aria-hidden="true" />}
              {temRegioes && <IconButton icon="regioes" label="Mostrar as regiões" shortcut="R" pressionado={mostrarRegioes} tipAbove onClick={alternarRegioes} />}
              {computador && inverter}
            </div>
          </div>
        )}
      </main>

      {temRegioes && (
        <ListaDeRegioes regioes={regioes} ocultas={ocultas} aoAlternar={alternarRegiao} comPainel={computador} />
      )}
    </div>
  )
}

const arred = (v: number) => Number(v.toFixed(2))

/**
 * A lista das regiões: para leitores de tela (celular) ou o painel "Elementos e regiões" (computador),
 * onde cada região liga e desliga.
 */
function ListaDeRegioes({ regioes, ocultas, aoAlternar, comPainel }: { regioes: readonly Regiao[]; ocultas: ReadonlySet<number>; aoAlternar: (id: number) => void; comPainel: boolean }) {
  if (!comPainel) {
    return (
      <ul className="so-leitor" aria-label="Regiões da imagem">
        {regioes.map((r) => (
          <li key={r.id}>{r.elemento}</li>
        ))}
      </ul>
    )
  }
  return (
    <aside className="vis-painel" aria-label="Elementos e regiões">
      <h2>Elementos e regiões</h2>
      <ul aria-label="Regiões da imagem">
        {regioes.map((r) => {
          const ligada = !ocultas.has(r.id)
          return (
            <li key={r.id}>
              <IconButton icon={ligada ? 'mostrar' : 'ocultar'} label={`${ligada ? 'Ocultar' : 'Mostrar'} a região ${r.elemento}`} pressionado={ligada} onClick={() => aoAlternar(r.id)} tipPosition="start" />
              <span className="vis-painel-nome">
                <span>{r.elemento}</span>
                {r.elementoDe && r.elementoDe !== r.elemento && <span className="vis-painel-de">{r.elementoDe}</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
