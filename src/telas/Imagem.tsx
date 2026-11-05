import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { temEntradaAnterior } from '../ui/useVoltar'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAtalhos } from '../app/useAtalhos'
import { elementosDoObjeto, imagem as buscarImagem, quantasImagensDoObjeto, regioes as buscarRegioes } from '../banco/consultas'
import { DesenhoDeRegiao } from '../imagem/DesenhoDeRegiao'
import { desfazer as desfazerPasso, fechar as fecharDesenho, novaEdicao, type Edicao } from '../imagem/desenhar'
import { useElementosSkc } from '../hipoteses/doUsuario'
import type { ElementoParaEscolher } from '../hipoteses/NovaHipotese'
import { alterarRegiao, dependentesDaRegiao, excluirRegiao, restaurarRegiao } from '../hipoteses/operacoes'
import { guardarRascunhoDaHipotese, lerRascunhoDaHipotese, rascunhoNovo } from '../hipoteses/rascunho'
import { hipoteseEmPreparo } from '../hipoteses/useNovaHipotese'
import { gruposDe } from '../objetos-skc/atual'
import { RegiaoNova } from '../hipoteses/RegiaoNova'
import { emCampoDeTexto } from '../app/atalhos'
import type { Regiao } from '../banco/tipos'
import { comoImagemExibida, creditoDaImagem, type ImagemExibida } from '../imagens-usuario/exibicao'
import { regioesDoUsuario } from '../imagens-usuario/regioes'
import { imagensDoObjeto, lerImagem, type ImagemDoUsuario } from '../imagens-usuario/registro'
import { estadoAtual, useEstado, type Estado } from '../usuario/estado'
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
import { estiloDeInversao, giroDaImagem, pontosDoPoligono, transformDoGiro, useUrlDaImagemExibida } from '../item/imagemComum'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { IconButton } from '../ui/IconButton'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { useTema } from '../ui/useTema'
import './Imagem.css'

type ImagemComNumero = ImagemExibida & { numero: string; total: number }

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
  // Uma imagem do usuário (decisão 33) vem da camada do usuário; as do livro, do pacote.
  if (/^IM-/.test(id)) return <ImagemDoUsuarioNoVisualizador key={id} id={id} origem={origem} />
  return <ImagemDoLivro key={id} id={id} origem={origem} />
}

const NAO_ENCONTRADA = (
  <>
    <h1>Imagem não encontrada</h1>
    <p>
      <Link to="/colecoes">Ver as coleções</Link> · <Link to="/busca">Buscar</Link>
    </p>
  </>
)

/**
 * Uma imagem do usuário no visualizador: a posição conta as do livro primeiro (como no item); as regiões são as
 * marcadas pelo usuário nela. Excluída ou desconhecida: "Imagem não encontrada".
 */
function ImagemDoUsuarioNoVisualizador({ id, origem }: { id: string; origem: EstadoDoVisualizador | null }) {
  const img = useEstado(
    useMemo(() => {
      let reg: unknown = null
      let lida: ImagemDoUsuario | null = null
      return (e: Estado) => {
        const r = e.registro('imagem', id) ?? null
        if (r !== reg) {
          reg = r
          lida = r ? lerImagem(r) : null
        }
        return lida
      }
    }, [id]),
  )
  const alvo = img?.alvo ?? ''
  const todas = useEstado(useCallback((e: Estado) => imagensDoObjeto(e, alvo), [alvo]))
  const doLivro = useCarregar(() => (alvo ? quantasImagensDoObjeto(alvo) : Promise.resolve(0)), alvo)
  const mapaDeRegioes = useEstado(useCallback((e: Estado) => e.registros.get('regiao'), []))
  const regioes = useMemo(() => regioesDoUsuario(estadoAtual(), id), [id, mapaDeRegioes])
  if (!img || img.excluido) return <Casca origem={origem}>{NAO_ENCONTRADA}</Casca>
  if (doLivro.fase === 'carregando') return <Casca origem={origem} ocupada />
  const livro = doLivro.fase === 'ok' ? doLivro.dados : 0
  const posicao = Math.max(todas.findIndex((i) => i.id === id), 0)
  const exibida: ImagemComNumero = { ...comoImagemExibida(img, livro + posicao + 1), numero: img.alvo, total: livro + todas.length }
  return <Visualizador img={exibida} regioes={regioes} origem={origem} />
}

function ImagemDoLivro({ id, origem }: { id: string; origem: EstadoDoVisualizador | null }) {
  const carga = useCarregar(() => buscarImagem(id), id)
  const cargaDasRegioes = useCarregar(() => buscarRegioes(id), id)
  // As regiões que o usuário marcou nesta imagem do livro (Tarefa 10) entram depois das do pacote.
  const mapaDeRegioes = useEstado(useCallback((e: Estado) => e.registros.get('regiao'), []))
  const doUsuario = useMemo(() => regioesDoUsuario(estadoAtual(), id), [id, mapaDeRegioes])
  const regioes = useMemo(() => [...(cargaDasRegioes.fase === 'ok' ? cargaDasRegioes.dados : []), ...doUsuario], [cargaDasRegioes, doUsuario])

  if (carga.fase === 'carregando') return <Casca origem={origem} ocupada />
  if (carga.fase === 'erro') {
    return (
      <Casca origem={origem}>
        <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />
      </Casca>
    )
  }
  if (carga.dados === null) return <Casca origem={origem}>{NAO_ENCONTRADA}</Casca>
  return <Visualizador key={carga.dados.id} img={carga.dados} regioes={regioes} origem={origem} />
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
  // `?desenhar=EL-…` (a Revisão, «Regiões a desenhar»): abre já marcando, e a região é mais uma desse elemento do livro.
  const [parametros, definirParametros] = useSearchParams()
  const elementoADesenhar = parametros.get('desenhar')
  // Veio da Revisão por uma navegação DESTE app (T17-B-22): a primeira entrada da sessão não tem entrada anterior, e voltar sairia do app.
  // Lido na montagem: tirar o `?desenhar=` depois de salvar (T17-B-21) troca a chave sem mudar de onde se veio.
  const localizacao = useLocation()
  const { state } = localizacao
  const veioDaRevisao = useRef(!!elementoADesenhar && temEntradaAnterior(localizacao))
  const computador = useBreakpoint() === 'computador'
  const palcoRef = useRef<HTMLDivElement>(null)
  const topoRef = useRef<HTMLDivElement>(null)
  const palco = useTamanhoDoPalco(palcoRef)
  const [vista, setVista] = useState<Vista>(VISTA_INICIAL)
  const [original, setOriginal] = useState(origem?.original ?? false)
  const [mostrarRegioes, setMostrarRegioes] = useState(true)
  const [ocultas, setOcultas] = useState<ReadonlySet<number | string>>(new Set())
  const [natural, setNatural] = useState<Tamanho | null>(null)

  const { url, aviso, aoFalhar } = useUrlDaImagemExibida(img)
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

  // ---- marcar uma região (Tarefa 10; Imagem.dc.html, PC-Imagem.dc.html) ----
  // Vindo da nova hipótese (`marcarPara`), abre já marcando; concluir põe o polígono no rascunho dela e volta ao item.
  const marcarPara = origem?.marcarPara ?? null
  const [marcando, setMarcando] = useState(() => !!marcarPara || !!elementoADesenhar)
  const [edicao, setEdicao] = useState<Edicao>(() => {
    const r = marcarPara ? lerRascunhoDaHipotese(marcarPara) : null
    return r?.sobre.tipo === 'nova' && r.sobre.regiao?.imagem === img.id ? novaEdicao({ pontos: r.sobre.regiao.pontos, fechado: true }) : novaEdicao()
  })
  /** A região do usuário cujos pontos estão sendo editados (null: uma região nova). */
  const [editandoRegiao, setEditandoRegiao] = useState<string | null>(null)
  const [falhaDaRegiao, setFalhaDaRegiao] = useState(false)
  const [faltamPontos, setFaltamPontos] = useState(false)
  const [regiaoExcluida, setRegiaoExcluida] = useState<Regiao | null>(null)
  useEffect(() => setFaltamPontos(false), [edicao])
  // Os elementos (para "mais uma região de" e "Pertence a") só são lidos quando se marca.
  const elementosDoLivro = useCarregar(() => (!marcando || img.numero.startsWith('OB-') ? Promise.resolve([]) : elementosDoObjeto(img.numero)), `${img.numero}|${marcando}`)
  const elementosSkc = useElementosSkc([img.numero])
  const elementos = useMemo<ElementoParaEscolher[]>(
    () => [...(elementosDoLivro.fase === 'ok' ? elementosDoLivro.dados.map((e) => ({ id: e.id, rotulo: e.rotulo })) : []), ...elementosSkc.map((e) => ({ id: e.id, rotulo: e.rotulo }))],
    [elementosDoLivro, elementosSkc],
  )
  const comecarAMarcar = useCallback(() => {
    setEdicao(novaEdicao())
    setEditandoRegiao(null)
    setMarcando(true)
    setMostrarRegioes(true)
  }, [])
  const pararDeMarcar = useCallback(() => {
    setMarcando(false)
    setEdicao(novaEdicao())
    setEditandoRegiao(null)
  }, [])
  const editarPontos = useCallback((r: Regiao) => {
    setEdicao(novaEdicao({ pontos: r.pontos, fechado: true }))
    setEditandoRegiao(String(r.id))
    setMarcando(true)
  }, [])

  // Fechar: vindo do item, volta no histórico (o item reaparece como estava); aberto direto, leva ao item do objeto.
  // O item devolve o foco ao "Ampliar a imagem" ao montar (ver estado.ts).
  const fechar = useCallback(() => {
    pedirFocoNoAmpliar()
    // Vindo da Revisão (`?desenhar=`, um link comum, sem estado) volta a ela; aberto direto (sem histórico) vai ao objeto.
    if (origem || veioDaRevisao.current) navegar(-1)
    else navegar(`/item/${encodeURIComponent(img.numero)}`, { replace: true, state: comImagemAberta(null, { imagemId: img.id, original }) })
  }, [origem, navegar, img.numero, img.id, original])

  /** Concluir (Enter): fecha a região e, conforme o caso, volta à nova hipótese, grava os pontos editados ou pede o nome. */
  const concluir = useCallback(() => {
    if (!marcando) return false
    // Já fechada, dando nome à região: não há o que concluir aqui (o Enter fica com o formulário do nome).
    if (edicao.atual.fechado && !marcarPara && !editandoRegiao) return false
    const fechado = edicao.atual.fechado ? edicao.atual : fecharDesenho(edicao.atual)
    // Menos de 3 pontos (ou sem área): a instrução diz por que não concluiu (M6).
    if (!fechado.fechado) {
      setFaltamPontos(true)
      return
    }
    if (fechado !== edicao.atual) setEdicao((e) => ({ atual: fechado, antes: [...e.antes, e.atual] }))
    if (marcarPara) {
      const r = lerRascunhoDaHipotese(marcarPara) ?? rascunhoNovo(marcarPara, null)
      const antes = r.sobre.tipo === 'nova' ? r.sobre.regiao : null
      guardarRascunhoDaHipotese({ ...r, sobre: { tipo: 'nova', regiao: { imagem: img.id, pontos: fechado.pontos, nome: antes?.nome ?? '', pai: antes?.pai ?? null } } })
      fechar()
      return
    }
    if (editandoRegiao) {
      setFalhaDaRegiao(false)
      alterarRegiao(editandoRegiao, fechado.pontos).then(pararDeMarcar, () => setFalhaDaRegiao(true))
    }
  }, [marcando, edicao, marcarPara, editandoRegiao, img.id, fechar, pararDeMarcar])

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
  const desfazerPonto = () => {
    if (!marcando || emCampoDeTexto(document.activeElement)) return false
    setEdicao(desfazerPasso)
  }
  useAtalhos(
    {
      Escape: () => (marcando && !marcarPara ? pararDeMarcar() : fechar()),
      e: () => (url ? (marcando ? (marcarPara ? fechar() : pararDeMarcar()) : comecarAMarcar()) : false),
      // Com o foco num botão, Enter é dele (o navegador o aciona; revisão 4, I1).
      Enter: () => (marcando && !emCampoDeTexto(document.activeElement) && !(document.activeElement as HTMLElement | null)?.closest('button, a') ? concluir() : false),
      'Control+Z': desfazerPonto,
      'Meta+Z': desfazerPonto,
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
      // Marcando, o palco não captura: o soltar tem de chegar à camada do desenho (que põe o ponto).
      if (!marcando) e.currentTarget.setPointerCapture(e.pointerId)
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
      // Marcando, um dedo desenha (DesenhoDeRegiao); a imagem anda com dois.
      if (!marcando) alterarVista((v, p, c) => (v.escala > 1 ? mover(v, agora.x - antes.x, agora.y - antes.y, p, c) : v))
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
    if (marcando || e.type !== 'pointerup' || ponteiros.current.size > 0 || !t || t.movido || Date.now() - t.t > TOQUE_MAX_DURACAO) return
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
  const visiveis = mostrarRegioes && url ? regioes.filter((r) => !ocultas.has(r.id) && String(r.id) !== editandoRegiao) : []
  const n = edicao.atual.pontos.length
  const fechada = edicao.atual.fechado
  const nomeando = marcando && fechada && !marcarPara && !editandoRegiao
  const instrucao = computador
    ? 'Clique põe pontos · clique no 1º ponto para fechar · Enter conclui · Esc cancela a marcação'
    : 'Toque para pôr pontos · toque no primeiro para fechar a região'
  const principalDaImagem = () => gruposDe(estadoAtual()).principal(img.numero)
  const regiaoNova = nomeando && (
    <RegiaoNova
      key={edicao.antes.length}
      objeto={img.numero}
      imagem={img.id}
      pontos={edicao.atual.pontos}
      elementos={elementos}
      elementoInicial={elementoADesenhar}
      aoDescartar={pararDeMarcar}
      emPreparo={() => {
        const r = hipoteseEmPreparo(principalDaImagem())
        if (!r) return null
        // O "Sobre" que a região tomaria na hipótese em preparo (revisão 4, m4).
        const s = r.sobre
        const substitui = s.tipo === 'elemento' ? s.rotulo || 'região' : s.tipo === 'nova' && s.regiao ? `região nova ${s.regiao.nome.trim() || 'sem nome'}, ainda não salva` : null
        return { substitui }
      }}
      aoSalva={(r, destino) => {
        pararDeMarcar()
        // O elemento que veio da Revisão já foi atendido: «Marcar região» de novo não volta travado nele (T17-B-21).
        if (elementoADesenhar) {
          definirParametros(
            (atual) => {
              const p = new URLSearchParams(atual)
              p.delete('desenhar')
              return p
            },
            { replace: true, state },
          )
        }
        if (destino === 'so-a-regiao') return
        // A hipótese sobre o elemento da região, no item do objeto. O rascunho é o do PRINCIPAL do grupo de ligação (a
        // tela que o abre), não o do membro dono da imagem (revisão 3, M5). "em-preparo": a região entra na que já existe.
        const objeto = principalDaImagem()
        const sobre = { tipo: 'elemento' as const, id: r.elementoId, rotulo: r.rotulo }
        const emPreparo = destino === 'em-preparo' ? hipoteseEmPreparo(objeto) : null
        guardarRascunhoDaHipotese(emPreparo ? { ...emPreparo, aberto: true, sobre } : { ...rascunhoNovo(objeto, null), sobre })
        pedirFocoNoAmpliar()
        if (origem) navegar(-1)
        else navegar(`/item/${encodeURIComponent(objeto)}`, { replace: true })
      }}
    />
  )
  const alternarRegiao = (id: number | string) =>
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
              {marcando && <DesenhoDeRegiao edicao={edicao} aoMudar={setEdicao} giro={giro} />}
              {visiveis.length > 0 && (
                <>
                  <svg className="vis-regioes" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
                    {visiveis.flatMap((r) => [
                      <polygon key={`${r.id}-h`} className="regiao-halo" points={pontosDoPoligono(r.pontos)} vectorEffect="non-scaling-stroke" />,
                      <polygon key={`${r.id}-t`} className="regiao-traco" points={pontosDoPoligono(r.pontos)} vectorEffect="non-scaling-stroke" />,
                    ])}
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
            <p className="vis-aviso" aria-hidden={!aviso}>
              {aviso ?? ''}
            </p>
          )}
        </div>

        {img.skc ? (
          <p className="vis-credito vis-credito-skc">
            <span className="marca-skc">SKC</span>
            <span>{creditoDaImagem(img.skc)}</span>
          </p>
        ) : (
          img.credito && <p className="vis-credito">{img.credito}</p>
        )}

        {url && (
          <div className="vis-rodape">
            <div role="toolbar" aria-label="Ferramentas da imagem" className="vis-ferramentas">
              {/* No celular, marcando, a barra fica com as ferramentas do desenho (a pinça continua ampliando). */}
              {(computador || !marcando) && (
                <>
                  <IconButton icon="recolher" label="Reduzir" shortcut="-" shortcutLabel="−" tipAbove onClick={() => alterarVista((v, p, c) => passo(v, -1, p, c))} />
                  <span className="vis-escala codigo">{`${emPorcento(vista.escala)} %`}</span>
                  <IconButton icon="adicionar" label="Ampliar" shortcut="Z +" shortcutLabel="Z ou +" tipAbove onClick={() => alterarVista((v, p, c) => passo(v, 1, p, c))} />
                </>
              )}
              <IconButton icon="ajustar" label="Ajustar à tela" shortcut="0" tipAbove onClick={ajustarATela} />
              {(temRegioes || (computador && inverter)) && <span className="vis-separador" aria-hidden="true" />}
              {temRegioes && <IconButton icon="regioes" label="Mostrar as regiões" shortcut="R" pressionado={mostrarRegioes} tipAbove onClick={alternarRegioes} />}
              {computador && inverter}
              <span className="vis-separador" aria-hidden="true" />
              <IconButton
                icon="marcarRegiao"
                label="Marcar região"
                shortcut="E"
                pressionado={marcando}
                tipAbove
                onClick={() => (marcando ? (marcarPara ? fechar() : pararDeMarcar()) : comecarAMarcar())}
              />
              {marcando && (
                <>
                  <IconButton icon="desfazer" label="Desfazer o último ponto" shortcut="Control+Z Meta+Z" shortcutLabel="Ctrl/⌘Z" tipAbove onClick={() => setEdicao(desfazerPasso)} />
                  <IconButton icon="confirmar" label={marcarPara ? 'Concluir e voltar à hipótese' : 'Concluir a região'} shortcut="Enter" tipAbove onClick={() => void concluir()} />
                </>
              )}
            </div>
          </div>
        )}
        {marcando && (
          <p className="desenho-instrucao" role="status">
            {faltamPontos && !fechada ? 'Ponha pelo menos 3 pontos que formem uma área para concluir.' : fechada ? (marcarPara ? 'Região fechada · arraste os pontos para ajustar · Enter volta à hipótese' : editandoRegiao ? 'Arraste os pontos · Enter grava' : elementoADesenhar ? 'Região fechada · confira o elemento e salve' : 'Região fechada · dê um nome ao elemento') : instrucao}
            {' · '}
            <span className="desenho-contagem">{`${editandoRegiao ? 'Região' : 'Região nova'}: ${n} ${n === 1 ? 'ponto' : 'pontos'}`}</span>
            {falhaDaRegiao && ' · não foi possível gravar; tente de novo'}
          </p>
        )}
        {!computador && regiaoNova}
      </main>

      {(temRegioes || (computador && (nomeando || regiaoExcluida))) && (
        <ListaDeRegioes
          excluida={regiaoExcluida}
          setExcluida={setRegiaoExcluida}
          regioes={regioes}
          ocultas={ocultas}
          aoAlternar={alternarRegiao}
          comPainel={computador}
          aoEditar={marcando ? undefined : editarPontos}
          podeExcluir={!marcando}
        >
          {computador && regiaoNova}
        </ListaDeRegioes>
      )}
    </div>
  )
}

const arred = (v: number) => Number(v.toFixed(2))

/**
 * A lista das regiões: para leitores de tela (celular) ou o painel "Elementos e regiões" (computador),
 * onde cada região liga e desliga.
 */
function ListaDeRegioes({
  regioes,
  ocultas,
  aoAlternar,
  comPainel,
  aoEditar,
  podeExcluir = false,
  excluida = null,
  setExcluida = () => undefined,
  children,
}: {
  regioes: readonly Regiao[]
  ocultas: ReadonlySet<number | string>
  aoAlternar: (id: number | string) => void
  comPainel: boolean
  /** Regiões do usuário (`RG-…`, Tarefa 10): editar os pontos e excluir (com confirmação e "Desfazer"). */
  aoEditar?: (r: Regiao) => void
  podeExcluir?: boolean
  /** A região que acabou de ser excluída ("Desfazer"); fica no Visualizador, para o painel continuar mesmo sem regiões. */
  excluida?: Regiao | null
  setExcluida?: (r: Regiao | null) => void
  /** "Nomear o elemento da região nova", no pé do painel. */
  children?: ReactNode
}) {
  const [excluindo, setExcluindo] = useState<Regiao | null>(null)
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
                {typeof r.id === 'string' && <span className="vis-painel-de">SKC · região sua</span>}
              </span>
              {typeof r.id === 'string' && aoEditar && <IconButton icon="editarFicha" label={`Editar os pontos da região ${r.elemento}`} onClick={() => aoEditar(r)} />}
              {typeof r.id === 'string' && podeExcluir && <IconButton icon="excluir" label={`Excluir a região ${r.elemento}`} onClick={() => setExcluindo(r)} />}
            </li>
          )
        })}
      </ul>
      {excluindo && <ConfirmarExclusao regiao={excluindo} aoCancelar={() => setExcluindo(null)} aoExcluida={(r) => {
        setExcluindo(null)
        setExcluida(r)
      }} />}
      <p className="vis-painel-aviso" role="status">
        {excluida && (
          <>
            {`Região excluída: ${excluida.elemento}. `}
            <button type="button" className="vis-painel-botao" onClick={() => void restaurarRegiao(String(excluida.id)).then(() => setExcluida(null))}>
              Desfazer
            </button>
          </>
        )}
      </p>
      {children}
    </aside>
  )
}

/**
 * "Excluir a região" (revisão 1, I6; exclusão nomeada da auditoria): diz quantas hipóteses falam do elemento que a região
 * é, pede confirmação, e depois oferece "Desfazer". As hipóteses continuam, com o nome guardado e "(região excluída)".
 */
function ConfirmarExclusao({ regiao, aoCancelar, aoExcluida }: { regiao: Regiao; aoCancelar: () => void; aoExcluida: (r: Regiao) => void }) {
  const id = String(regiao.id)
  const { hipoteses, regioes } = dependentesDaRegiao(id)
  const [falhou, setFalhou] = useState(false)
  const partes = [
    hipoteses > 0 ? `${hipoteses === 1 ? '1 hipótese fala' : `${hipoteses} hipóteses falam`} deste elemento; ${hipoteses === 1 ? 'ela fica' : 'elas ficam'} sem região na imagem.` : 'Nenhuma hipótese fala deste elemento.',
    regioes > 0 ? `${regioes === 1 ? 'Outra região é' : `Outras ${regioes} regiões são`} deste elemento.` : '',
  ].filter(Boolean)
  return (
    <div className="vis-painel-confirmar" role="group" aria-label={`Excluir a região ${regiao.elemento}?`}>
      <p>{`Excluir a região «${regiao.elemento}»? ${partes.join(' ')}`}</p>
      {falhou && <p role="alert">Não foi possível excluir; tente de novo.</p>}
      <span className="vis-painel-confirmar-acoes">
        <button type="button" className="vis-painel-botao" autoFocus onClick={aoCancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="vis-painel-botao vis-painel-botao-forte"
          onClick={() => {
            setFalhou(false)
            excluirRegiao(id).then(() => aoExcluida(regiao), () => setFalhou(true))
          }}
        >
          Excluir
        </button>
      </span>
    </div>
  )
}
