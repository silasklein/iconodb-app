/**
 * O mapa dos sítios (decisão 36; SitiosMapa.dc.html, PC-SitiosMapa.dc.html): mapa vetorial OFFLINE (mapa-base.json, Natural
 * Earth, gerado por scripts/gerar-mapa.ts), sem servidor de mapas e sem nenhum pedido de rede. Terra cinza-claro, mar branco,
 * fronteiras atuais fracas, lagos; um ponto por coordenada, com o tamanho pelo número de objetos.
 *
 * Este módulo e o JSON só são carregados quando o mapa aparece (import dinâmico em Sitios.tsx): o pacote principal não cresce.
 *
 * O mapa é controlado por quem o usa (Sitios): os pontos, o ponto selecionado, os sítios acesos (passar o mouse numa linha
 * acende o ponto e vice-versa), o foco («Mostrar no mapa» / «Abrir no mapa»), as regiões do filtro. A lista é a alternativa em
 * texto do mapa (o palco tem nome e descrição; cada ponto tem o nome do sítio e a contagem).
 *
 * Teclado: o palco e o grupo de pontos são uma parada de Tab cada (um ponto de cada vez tem tabindex 0; as setas, PageUp, PageDown,
 * Home e End andam entre os pontos, e Enter ou Espaço abre o cartão); + − 0 R e as setas (com o foco no palco) valem no contexto
 * «mapa» do catálogo de atalhos. Toque e mouse: arrastar (também começando num ponto), pinça, roda; um toque sem mover escolhe o
 * ponto MAIS PERTO dentro do raio (os alvos de pontos vizinhos se sobrepõem). Movimento reduzido: sem transições.
 */
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as PointerDoReact } from 'react'
import { useAtalhos } from '../app/useAtalhos'
import { Icon } from '../ui/Icon'
import { CartaoDoPonto } from './CartaoDoPonto'
import base from './mapa-base.json'
import {
  ALTURA_DA_EXTENSAO,
  LARGURA_DA_EXTENSAO,
  ajustarA,
  aproximar,
  caixaDosPontos,
  caminhoDasArestas,
  caminhoDoPoligono,
  caminhoDosAneis,
  centrarEm,
  desprojetar,
  diametroDoPonto,
  escalaDaBarra,
  mover,
  ordemDeLeitura,
  pontoNaPosicao,
  projetar,
  raioDoToque,
  retanguloVisivel,
  rotulosDeRegiao,
  rotulosVisiveis,
  segurar,
  vizinhoNaDirecao,
  type Estagio,
  type PontoDoMapa,
  type Visao,
} from './mapa'
import { REGIOES, regiaoDe } from './regioes'
import './Mapa.css'

export interface MapaProps {
  pontos: readonly PontoDoMapa[]
  /** A chave do ponto selecionado (o cartão está aberto), ou null. */
  selecionada: string | null
  aoSelecionar: (chave: string | null) => void
  /** Os ids dos sítios acesos (a linha da lista sob o mouse, ou o ponto sob o mouse). */
  destaque: ReadonlySet<string>
  aoDestacar: (ids: ReadonlySet<string> | null) => void
  /** Pede para centrar num ponto («Mostrar no mapa», «Abrir no mapa»); `n` muda a cada pedido. */
  foco: { chave: string; n: number } | null
  /** As regiões do filtro; tocar numa região (com os limites ligados) as liga e desliga. */
  regioesAtivas: ReadonlySet<string>
  aoAlternarRegiao: (id: string) => void
  computador: boolean
  /** Muda quando o conjunto de pontos mostrado muda por filtro: o mapa refaz o «Ver tudo». */
  assinatura: string
}

const CAMINHOS = {
  terra: caminhoDosAneis(base.terra, base.unidade, 'fechado'),
  costa: caminhoDosAneis(base.terra, base.unidade, 'costa'),
  lagos: caminhoDosAneis(base.lagos, base.unidade, 'fechado'),
  limites: caminhoDosAneis(base.limites, base.unidade, 'aberto'),
  regioes: REGIOES.map((r) => ({ id: r.id, d: caminhoDoPoligono(r.poligono) })),
  arestas: caminhoDasArestas(REGIOES.map((r) => r.poligono)).caminho,
}

/** Nomes de mares e lugares, escritos no mapa entre dois zooms (k do plano base). */
const LUGARES: readonly { nome: string; lat: number; lon: number; kmin?: number; kmax?: number }[] = [
  { nome: 'Mar Mediterrâneo', lat: 33.0, lon: 33.0 },
  { nome: 'Mar Vermelho', lat: 25.0, lon: 36.4, kmax: 1.1 },
  { nome: 'Golfo Pérsico', lat: 27.2, lon: 50.9, kmax: 1.1 },
  { nome: 'Mar Cáspio', lat: 40.0, lon: 51.0, kmax: 1.1 },
  { nome: 'Mar Negro', lat: 42.0, lon: 34.0, kmax: 1.1 },
  { nome: 'Mar Morto', lat: 31.4, lon: 35.9, kmin: 1.5 },
  { nome: 'Sinai', lat: 29.5, lon: 33.4, kmin: 1.5 },
  { nome: 'Golfo de Aqaba', lat: 29.1, lon: 34.85, kmin: 1.5 },
]

const MINI = { w: 216, h: 152 }
const ESCALA_DA_MINI = Math.min(MINI.w / LARGURA_DA_EXTENSAO, MINI.h / ALTURA_DA_EXTENSAO)
const PASSO_DO_TECLADO = 80
const K_AO_MOSTRAR = 2.2
/** O raio (px) em volta do centro de um ponto em que um toque o escolhe; o mouse é mais preciso que o dedo. */
const RAIO_DE_ESCOLHA = { toque: 22, mouse: 10 }
const FOLGA_DAS_ZONAS = 6

type Zona = { esq: number; topo: number; larg: number; alt: number }
const cruza = (a: Zona, b: Zona) => a.esq < b.esq + b.larg && b.esq < a.esq + a.larg && a.topo < b.topo + b.alt && b.topo < a.topo + a.alt

/** A largura real de um texto na fonte do mapa (o canvas mede uma vez por texto); sem canvas (jsdom), uma estimativa por letra. */
const medidas = new Map<string, number>()
let contexto: CanvasRenderingContext2D | null | undefined
function larguraDoTexto(texto: string, fonte: string, porLetra: number): number {
  const chave = `${fonte}|${texto}`
  const guardada = medidas.get(chave)
  if (guardada !== undefined) return guardada
  if (contexto === undefined) {
    try {
      contexto = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent) ? null : document.createElement('canvas').getContext('2d')
    } catch {
      contexto = null
    }
  }
  let largura = texto.length * porLetra
  if (contexto) {
    contexto.font = fonte
    largura = Math.ceil(contexto.measureText(texto).width)
  }
  medidas.set(chave, largura)
  return largura
}

export default function Mapa({ pontos, selecionada, aoSelecionar, destaque, aoDestacar, foco, regioesAtivas, aoAlternarRegiao, computador, assinatura }: MapaProps) {
  const idDoClip = useId()
  const idDaDescricao = useId()
  const raizRef = useRef<HTMLDivElement>(null)
  const palcoRef = useRef<HTMLDivElement>(null)
  const cartaoRef = useRef<HTMLDivElement>(null)
  const [estagio, setEstagio] = useState<Estagio>({ w: 0, h: 0 })
  const [visao, setVisao] = useState<Visao | null>(null)
  const [anima, setAnima] = useState(false)
  const [comLimites, setComLimites] = useState(false)
  const focarCartao = useRef(false)
  const devolverFoco = useRef<string | null>(null)
  const mundoRef = useRef<HTMLDivElement>(null)
  const visaoRef = useRef<Visao | null>(null)
  const [tabChave, setTabChave] = useState<string | null>(null)
  const [zonas, setZonas] = useState<Zona[]>([])
  const [familia, setFamilia] = useState('system-ui, sans-serif')

  // O tamanho do palco: medido ao montar e a cada mudança (girar o aparelho, redimensionar a janela).
  useLayoutEffect(() => {
    const el = palcoRef.current
    if (!el) return
    const medir = () => {
      const r = el.getBoundingClientRect()
      // Sem layout (jsdom): um palco de tamanho padrão, para que as contas funcionem.
      setEstagio((a) => {
        const novo = { w: r.width || 800, h: r.height || 600 }
        return a.w === novo.w && a.h === novo.h ? a : novo
      })
    }
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const margem = computador ? 80 : 48
  const caixa = useMemo(() => caixaDosPontos(pontos), [pontos])

  // O primeiro enquadramento, e um novo «Ver tudo» quando o filtro muda o conjunto de pontos.
  const ultimaAssinatura = useRef<string | null>(null)
  useEffect(() => {
    if (estagio.w === 0) return
    if (visao === null) {
      setVisao(ajustarA(caixa, estagio, margem))
      ultimaAssinatura.current = assinatura
      return
    }
    if (ultimaAssinatura.current !== assinatura) {
      ultimaAssinatura.current = assinatura
      setAnima(true)
      setVisao(ajustarA(caixa, estagio, margem))
    }
  }, [estagio, assinatura, caixa, margem, visao])

  // O palco mudou de tamanho: segura a visão no novo palco.
  useEffect(() => {
    setVisao((v) => (v ? segurar(v, estagio) : v))
  }, [estagio])

  // A visão que está na tela (um quadro agendado pela pinça a substitui até chegar).
  useEffect(() => {
    if (!quadro.current) visaoRef.current = visao
  }, [visao])

  const aplicar = (f: (v: Visao) => Visao, animar: boolean) => {
    setAnima(animar)
    setVisao((v) => (v ? f(v) : v))
  }
  const verTudo = () => aplicar(() => ajustarA(caixa, estagio, margem), true)
  const zoomNoCentro = (fator: number) => aplicar((v) => aproximar(v, fator, estagio.w / 2, estagio.h / 2, estagio), true)

  // «Mostrar no mapa» / «Abrir no mapa»: centra no ponto (sem diminuir o zoom que a pessoa já tem).
  const ultimoFoco = useRef(0)
  useEffect(() => {
    if (!foco || !visao || foco.n === ultimoFoco.current) return
    const p = pontos.find((x) => x.chave === foco.chave)
    ultimoFoco.current = foco.n
    if (!p) return
    const b = projetar(p.lat, p.lon)
    aplicar((v) => centrarEm(b.x, b.y, Math.max(v.k, K_AO_MOSTRAR), estagio), true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foco, visao !== null, pontos])

  // A roda do mouse (e a pinça do trackpad, que chega como roda com Ctrl) aproxima e afasta no cursor.
  useEffect(() => {
    const el = palcoRef.current
    if (!el) return
    const aoRolar = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const fator = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
      setAnima(false)
      setVisao((v) => (v ? aproximar(v, fator, e.clientX - r.left, e.clientY - r.top, estagio) : v))
    }
    el.addEventListener('wheel', aoRolar, { passive: false })
    return () => el.removeEventListener('wheel', aoRolar)
  }, [estagio])

  // Teclado (contexto «mapa» do catálogo). As setas só movem o mapa com o foco no palco ou num ponto.
  const comFocoNoPalco = () => !!palcoRef.current?.contains(document.activeElement)
  const pontoComFoco = () => (document.activeElement as HTMLElement | null)?.closest?.<HTMLElement>('[data-ponto]')?.dataset.ponto ?? null
  const irAoPonto = (chave: string | null) => {
    if (!chave) return
    palcoRef.current?.querySelector<HTMLElement>(`[data-ponto="${CSS.escape(chave)}"]`)?.focus({ preventScroll: true })
  }
  const caixasDeNavegacao = () => caixasRef.current.map((c) => ({ chave: c.p.chave, nome: c.p.nome, x: c.x, y: c.y, d: c.d, objetos: c.p.objetos }))
  // Com o foco num ponto, as setas vão ao ponto vizinho; com o foco no palco, movem o mapa.
  const seta = (dx: number, dy: number) => () => {
    if (!comFocoNoPalco()) return false
    const atual = pontoComFoco()
    if (atual) {
      irAoPonto(vizinhoNaDirecao(caixasDeNavegacao(), atual, Math.sign(-dx), Math.sign(-dy)))
      return
    }
    aplicar((v) => mover(v, dx, dy, estagio), false)
  }
  // PageDown e PageUp percorrem TODOS os pontos em ordem de leitura (também os que ficam na mesma posição da tela); Home e End vão
  // ao primeiro e ao último.
  const sequencia = (passo: 1 | -1 | 'primeiro' | 'ultimo') => () => {
    const atual = pontoComFoco()
    if (!atual) return false
    const ordem = ordemDeLeitura(caixasDeNavegacao())
    const i = ordem.indexOf(atual)
    irAoPonto(passo === 'primeiro' ? (ordem[0] ?? null) : passo === 'ultimo' ? (ordem.at(-1) ?? null) : ordem[Math.min(ordem.length - 1, Math.max(0, i + passo))] ?? null)
  }
  const fecharCartao = () => {
    if (selecionada === null) return false
    devolverFoco.current = selecionada
    aoSelecionar(null)
  }
  useAtalhos(
    {
      '+': () => zoomNoCentro(1.5),
      '=': () => zoomNoCentro(1.5),
      '-': () => zoomNoCentro(1 / 1.5),
      _: () => zoomNoCentro(1 / 1.5),
      '0': verTudo,
      r: () => setComLimites((l) => !l),
      ArrowLeft: seta(PASSO_DO_TECLADO, 0),
      ArrowRight: seta(-PASSO_DO_TECLADO, 0),
      ArrowUp: seta(0, PASSO_DO_TECLADO),
      ArrowDown: seta(0, -PASSO_DO_TECLADO),
      PageDown: sequencia(1),
      PageUp: sequencia(-1),
      Home: sequencia('primeiro'),
      End: sequencia('ultimo'),
      Escape: fecharCartao,
    },
    'mapa',
  )

  // Avisa (para os testes de ponta a ponta) que o mapa de teclas já foi registrado: declarado depois do `useAtalhos`, o efeito
  // roda depois do registro.
  useEffect(() => {
    const el = palcoRef.current
    el?.setAttribute('data-atalhos', '')
    return () => el?.removeAttribute('data-atalhos')
  }, [])

  // Ao fechar o cartão pelo teclado ou pelo botão, o foco volta ao ponto.
  useEffect(() => {
    if (selecionada === null && devolverFoco.current) {
      const chave = devolverFoco.current
      devolverFoco.current = null
      const pontosNoPalco = [...(palcoRef.current?.querySelectorAll<HTMLElement>('[data-ponto]') ?? [])]
      pontosNoPalco.find((el) => el.dataset.ponto === chave)?.focus({ preventScroll: true })
    }
  }, [selecionada])
  // Ao abrir o cartão por um ponto, o foco vai ao primeiro «Abrir sítio».
  useEffect(() => {
    if (selecionada !== null && focarCartao.current) {
      focarCartao.current = false
      cartaoRef.current?.querySelector<HTMLElement>('[data-abrir]')?.focus({ preventScroll: true })
    }
  }, [selecionada])

  // Arrastar (um dedo ou o mouse, também começando NUM PONTO) e pinçar (dois dedos). Um gesto que começa num ponto vira
  // arrasto quando passa da folga do tipo de ponteiro (raioDoToque: 4 px o mouse, 10 px o dedo); um toque sem mover escolhe o ponto mais perto dentro do raio. O arrasto de um dedo
  // não renderiza nada por movimento: só move a camada do mundo por transform e confirma a visão ao soltar (m7).
  const ponteiros = useRef(new Map<number, { x: number; y: number }>())
  const arrasto = useRef<{ x0: number; y0: number; v0: Visao; moveu: boolean; fim: Visao | null } | null>(null)
  const pinca = useRef<{ d0: number; mx0: number; my0: number; v0: Visao } | null>(null)
  const quadro = useRef(0)
  const caixasRef = useRef<{ p: PontoDoMapa; x: number; y: number; d: number }[]>([])
  const sobre = useRef<string | null>(null)
  const ultimoToque = useRef<{ chave: string; t: number } | null>(null)
  /** Quando terminou o último arrasto: o navegador ainda manda um clique ao botão sob o dedo se o arrasto foi curto (menos que a folga dele). */
  const ultimoArrasto = useRef(0)
  const local = (e: { clientX: number; clientY: number }) => {
    const r = palcoRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  /** A visão pedida por último (a que está na tela ou a que o próximo quadro vai pôr). */
  const visaoAtual = () => visaoRef.current ?? visao
  const agendar = (v: Visao) => {
    visaoRef.current = v
    if (quadro.current) return
    quadro.current = requestAnimationFrame(() => {
      quadro.current = 0
      setVisao(visaoRef.current)
    })
  }
  /** Confirma o arrasto em curso (se houve): a visão ganha o deslocamento e a camada volta a ficar parada. */
  const confirmarArrasto = (): Visao | null => {
    const a = arrasto.current
    if (!a?.fim) return null
    const fim = a.fim
    a.fim = null
    a.v0 = fim
    visaoRef.current = fim
    setVisao(fim)
    if (mundoRef.current) mundoRef.current.style.transform = ''
    return fim
  }
  const pontoSob = (e: { clientX: number; clientY: number; pointerType: string }) => {
    const { x, y } = local(e)
    return pontoNaPosicao(
      caixasRef.current.map((c) => ({ chave: c.p.chave, nome: c.p.nome, x: c.x, y: c.y, d: c.d, objetos: c.p.objetos })),
      x,
      y,
      e.pointerType === 'mouse' ? RAIO_DE_ESCOLHA.mouse : RAIO_DE_ESCOLHA.toque,
    )
  }
  const daChave = (chave: string | null) => (chave ? pontos.find((p) => p.chave === chave) : undefined)
  const escolher = (chave: string) => {
    const marcado = chave === selecionada
    focarCartao.current = !marcado
    ultimoToque.current = { chave, t: performance.now() }
    aoSelecionar(marcado ? null : chave)
  }
  const chaveDoAlvo = (alvo: EventTarget) => (alvo as HTMLElement).closest?.<HTMLElement>('[data-ponto]')?.dataset.ponto ?? null

  const aoApertar = (e: PointerDoReact<HTMLDivElement>) => {
    const v = visaoAtual()
    if (!v || (e.pointerType === 'mouse' && e.button !== 0)) return
    ponteiros.current.set(e.pointerId, local(e))
    if (ponteiros.current.size === 1) {
      const p = local(e)
      arrasto.current = { x0: p.x, y0: p.y, v0: v, moveu: false, fim: null }
    } else if (ponteiros.current.size === 2) {
      const base = confirmarArrasto() ?? visaoAtual()!
      for (const id of ponteiros.current.keys()) palcoRef.current?.setPointerCapture?.(id)
      const [a, b] = [...ponteiros.current.values()] as [{ x: number; y: number }, { x: number; y: number }]
      pinca.current = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx0: (a.x + b.x) / 2, my0: (a.y + b.y) / 2, v0: base }
      if (arrasto.current) arrasto.current.moveu = true
    }
  }
  const aoMover = (e: PointerDoReact<HTMLDivElement>) => {
    if (!ponteiros.current.has(e.pointerId)) {
      // O mouse passando sem apertar: acende o ponto mais perto (o cursor vira mão sobre ele).
      if (e.pointerType === 'mouse') {
        const chave = pontoSob(e) ?? chaveDoAlvo(e.target)
        if (chave !== sobre.current) {
          sobre.current = chave
          const ponto = daChave(chave)
          aoDestacar(ponto ? new Set(ponto.sitios.map((s) => s.id)) : null)
          if (palcoRef.current) palcoRef.current.style.cursor = chave ? 'pointer' : ''
        }
      }
      return
    }
    const p = local(e)
    ponteiros.current.set(e.pointerId, p)
    if (pinca.current && ponteiros.current.size >= 2) {
      const [a, b] = [...ponteiros.current.values()] as [{ x: number; y: number }, { x: number; y: number }]
      const { d0, mx0, my0, v0 } = pinca.current
      const fator = (Math.hypot(a.x - b.x, a.y - b.y) || 1) / d0
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      setAnima(false)
      agendar(mover(aproximar(v0, fator, mx0, my0, estagio), mx - mx0, my - my0, estagio))
      return
    }
    const a = arrasto.current
    if (!a) return
    const dx = p.x - a.x0
    const dy = p.y - a.y0
    if (!a.moveu) {
      if (Math.hypot(dx, dy) < raioDoToque(e.pointerType)) return
      a.moveu = true
      palcoRef.current?.setPointerCapture?.(e.pointerId)
      setAnima(false)
    }
    const destino = mover(a.v0, dx, dy, estagio)
    a.fim = destino
    if (mundoRef.current) mundoRef.current.style.transform = `translate(${destino.x - a.v0.x}px, ${destino.y - a.v0.y}px)`
  }
  const aoSoltar = (e: PointerDoReact<HTMLDivElement>) => {
    if (!ponteiros.current.has(e.pointerId)) return
    const p = local(e)
    ponteiros.current.delete(e.pointerId)
    if (ponteiros.current.size < 2) pinca.current = null
    const a = arrasto.current
    if (ponteiros.current.size === 0) {
      confirmarArrasto()
      if (a?.moveu) ultimoArrasto.current = performance.now()
      arrasto.current = null
      const v = visaoAtual()
      if (e.type === 'pointerup' && a && !a.moveu && v) {
        // Um toque: escolhe o ponto mais perto dentro do raio (na falta de medidas, o botão tocado); no fundo, fecha o cartão
        // ou, com os limites ligados e nada aberto, liga ou desliga a região tocada.
        const chave = pontoSob(e) ?? chaveDoAlvo(e.target)
        if (chave) escolher(chave)
        else if (selecionada !== null) aoSelecionar(null)
        else if (comLimites) {
          const { lat, lon } = desprojetar((p.x - v.x) / v.k, (p.y - v.y) / v.k)
          const id = regiaoDe(lat, lon)
          if (REGIOES.some((r) => r.id === id)) aoAlternarRegiao(id)
        }
      }
    } else if (ponteiros.current.size === 1) {
      // Sobrou um dedo depois da pinça: continua arrastando a partir daqui.
      const [resto] = [...ponteiros.current.values()] as [{ x: number; y: number }]
      arrasto.current = { x0: resto.x, y0: resto.y, v0: visaoAtual()!, moveu: true, fim: null }
    }
  }
  const aoSairDoPalco = (e: PointerDoReact<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || ponteiros.current.size > 0) return
    if (sobre.current !== null) {
      sobre.current = null
      aoDestacar(null)
      if (palcoRef.current) palcoRef.current.style.cursor = ''
    }
  }

  const caixas = useMemo(
    () =>
      visao
        ? pontos.map((p) => {
            const b = projetar(p.lat, p.lon)
            return { p, x: b.x * visao.k + visao.x, y: b.y * visao.k + visao.y, d: diametroDoPonto(p.objetos) }
          })
        : [],
    [pontos, visao],
  )
  caixasRef.current = caixas
  const ordemDosPontos = useMemo(() => ordemDeLeitura(caixas.map((c) => ({ chave: c.p.chave, nome: c.p.nome, x: c.x, y: c.y, d: c.d, objetos: c.p.objetos }))), [caixas])
  // Uma parada de Tab para o grupo de pontos (o ponto que teve o foco por último, ou o selecionado, ou o primeiro).
  const chaveDoTab = tabChave !== null && pontos.some((p) => p.chave === tabChave) ? tabChave : selecionada !== null && pontos.some((p) => p.chave === selecionada) ? selecionada : (ordemDosPontos[0] ?? null)
  const acesos = useMemo(() => new Set(pontos.filter((p) => p.sitios.some((s) => destaque.has(s.id))).map((p) => p.chave)), [pontos, destaque])
  // Os nomes das regiões (com os limites ligados): cada um inteiro no palco e sem cobrir outro nome de região, um ponto ou os controles (m12).
  const nomesDeRegiao = useMemo(() => {
    if (!visao || !comLimites) return []
    const comSitios = new Set(pontos.flatMap((p) => p.sitios.map((s) => s.regiao)))
    return rotulosDeRegiao(
      REGIOES.map((r) => {
        const b = projetar(r.rotulo.lat, r.rotulo.lon)
        const nome = r.nome.toUpperCase()
        return { id: r.id, nome: r.nome, x: b.x * visao.k + visao.x, y: b.y * visao.k + visao.y, larg: larguraDoTexto(nome, `600 12px ${familia}`, 9.5) + nome.length * 1, alinhar: r.rotulo.alinhar,
          prioridade: regioesAtivas.has(r.id),
          temSitios: comSitios.has(r.id),
          poligono: r.poligono.map(([lon, lat]) => {
            const q = projetar(lat, lon)
            return { x: q.x * visao.k + visao.x, y: q.y * visao.k + visao.y }
          }),
        }
      }),
      { largura: estagio.w, altura: estagio.h, pontos: caixas.map((c) => ({ x: c.x, y: c.y, d: c.d })), proibidas: zonas },
    )
  }, [visao, comLimites, regioesAtivas, estagio, caixas, zonas, familia, pontos])
  const rotulos = useMemo(() => {
    if (!visao) return []
    const fortes = new Set([...acesos, ...(selecionada ? [selecionada] : [])])
    // Fora de um zoom de perto, só os pontos acesos ou selecionados levam nome (o resto seria ruído). No computador o cartão
    // do ponto selecionado traz o nome e cobriria o rótulo: ele fica sem.
    const lista = (visao.k >= 1.4 ? caixas : caixas.filter((c) => fortes.has(c.p.chave))).filter((c) => !(computador && c.p.chave === selecionada))
    return rotulosVisiveis(
      lista.map((c) => ({ chave: c.p.chave, nome: c.p.nome, x: c.x, y: c.y, d: c.p.chave === selecionada ? c.d + 5 : c.d, objetos: c.p.objetos })),
      {
        destaque: fortes,
        largura: estagio.w,
        altura: estagio.h,
        max: computador ? 10 : 7,
        larguraDe: (nome, forte) => larguraDoTexto(nome, `${forte ? 600 : 400} 13px ${familia}`, 7),
        proibidas: [...zonas, ...nomesDeRegiao.map(({ esq, topo, larg, alt }) => ({ esq, topo, larg, alt }))],
      },
    )
  }, [visao, caixas, acesos, selecionada, estagio, computador, zonas, familia, nomesDeRegiao])

  const pontoSelecionado = pontos.find((p) => p.chave === selecionada) ?? null

  // As áreas que os rótulos evitam (os controles, o minimapa, a escala, o crédito, o cartão): medidas depois de cada mudança de layout.
  useLayoutEffect(() => {
    const palco = palcoRef.current
    const raiz = raizRef.current
    if (!palco || !raiz) return
    const base = palco.getBoundingClientRect()
    const medidas: Zona[] = [...raiz.querySelectorAll<HTMLElement>('.mapa-controles, .mapa-limites, .mapa-mini, .mapa-escala, .mapa-dica, .cartao-ponto')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ esq: Math.round(r.left - base.left) - FOLGA_DAS_ZONAS, topo: Math.round(r.top - base.top) - FOLGA_DAS_ZONAS, larg: Math.round(r.width) + 2 * FOLGA_DAS_ZONAS, alt: Math.round(r.height) + 2 * FOLGA_DAS_ZONAS }))
    setZonas((antes) => (JSON.stringify(antes) === JSON.stringify(medidas) ? antes : medidas))
    setFamilia((antes) => {
      const f = getComputedStyle(raiz).fontFamily || antes
      return f === antes ? antes : f
    })
  }, [estagio, computador, comLimites, selecionada, visao !== null])
  // O cartão não pode cobrir o ponto escolhido. No computador ele fica fixo no canto de cima à esquerda (como no desenho): se o ponto
  // ficou por baixo dele, o mapa o leva para o centro. No celular a folha sobe de baixo: o mapa anda para o ponto ficar no meio da
  // parte que sobra acima dela (m13).
  useEffect(() => {
    if (selecionada === null) return
    const ajustar = () => {
      const cartao = cartaoRef.current?.getBoundingClientRect()
      const palco = palcoRef.current?.getBoundingClientRect()
      const ponto = pontos.find((x) => x.chave === selecionada)
      if (!cartao || !palco || !ponto || cartao.height === 0) return
      const b = projetar(ponto.lat, ponto.lon)
      const folga = 28
      setAnima(true)
      setVisao((v) => {
        if (!v) return v
        const x = b.x * v.k + v.x
        const y = b.y * v.k + v.y
        if (computador) {
          const coberto = x > cartao.left - palco.left - folga && x < cartao.right - palco.left + folga && y > cartao.top - palco.top - folga && y < cartao.bottom - palco.top + folga
          return coberto ? centrarEm(b.x, b.y, v.k, estagio) : v
        }
        const topoDaFolha = cartao.top - palco.top
        if (x > folga && x < estagio.w - folga && y > folga && y < topoDaFolha - folga) return v
        return segurar({ k: v.k, x: estagio.w / 2 - b.x * v.k, y: topoDaFolha / 2 - b.y * v.k }, estagio)
      })
    }
    ajustar()
    // A folha (celular) e o cartão (computador) crescem depois de abertos (as miniaturas dos objetos carregam de forma assíncrona): refaz a
    // conta a cada crescimento de altura, para o ponto não voltar a ficar sob eles (m13b, m19). O movimento é o mesmo de antes: o CSS já o tira sob «reduzir movimento».
    const cartaoEl = cartaoRef.current
    if (!cartaoEl || typeof ResizeObserver === 'undefined') return
    let altura = cartaoEl.getBoundingClientRect().height
    const observador = new ResizeObserver(() => {
      const agora = cartaoEl.getBoundingClientRect().height
      const cresceu = agora > altura + 1
      altura = agora
      if (cresceu) ajustar()
    })
    observador.observe(cartaoEl)
    return () => observador.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionada, computador])
  const escala = visao ? escalaDaBarra(visao.k, desprojetar(0, (estagio.h / 2 - visao.y) / visao.k).lat) : null
  const visivel = visao ? retanguloVisivel(visao, estagio) : null

  const aoFocarPonto = (x: number, y: number) => {
    // Um ponto que ganhou o foco fora do palco (Tab): leva o mapa até ele.
    if (x < 8 || y < 8 || x > estagio.w - 8 || y > estagio.h - 8) return true
    return false
  }

  const minimapaAte = (e: PointerDoReact<HTMLDivElement>) => {
    if (!visao) return
    const r = e.currentTarget.getBoundingClientRect()
    const ox = (MINI.w - LARGURA_DA_EXTENSAO * ESCALA_DA_MINI) / 2
    const oy = (MINI.h - ALTURA_DA_EXTENSAO * ESCALA_DA_MINI) / 2
    const bx = (e.clientX - r.left - ox) / ESCALA_DA_MINI
    const by = (e.clientY - r.top - oy) / ESCALA_DA_MINI
    aplicar((v) => centrarEm(bx, by, v.k, estagio), false)
  }
  const mox = (MINI.w - LARGURA_DA_EXTENSAO * ESCALA_DA_MINI) / 2
  const moy = (MINI.h - ALTURA_DA_EXTENSAO * ESCALA_DA_MINI) / 2

  const botaoZoom = (rotulo: string, dica: string, tecla: string, icone: 'adicionar' | 'recolher', aoClicar: () => void, forma: 'cima' | 'baixo') => (
    <button type="button" className={`mapa-botao mapa-zoom mapa-zoom-${forma}`} aria-label={rotulo} data-tip={dica} aria-keyshortcuts={tecla} onClick={aoClicar}>
      <Icon name={icone} />
    </button>
  )

  return (
    <div ref={raizRef} className={`mapa${computador ? ' mapa-computador' : ' mapa-celular'}`} data-anima={anima ? '' : undefined}>
      <div
        ref={palcoRef}
        className="mapa-palco"
        role="group"
        aria-label="Mapa dos sítios"
        aria-describedby={idDaDescricao}
        tabIndex={0}
        data-k={visao ? visao.k.toFixed(3) : undefined}
        data-x={visao ? visao.x.toFixed(1) : undefined}
        data-y={visao ? visao.y.toFixed(1) : undefined}
        data-pronto={visao ? '' : undefined}
        onPointerDown={aoApertar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onPointerLeave={aoSairDoPalco}
      >
        <p id={idDaDescricao} className="so-leitor">
          Mapa dos sítios, sem rede. A lista dos sítios é o equivalente em texto. Com o foco no mapa, as setas movem, + e − aproximam e afastam, 0 mostra tudo e R mostra os limites das regiões. Num ponto, as setas vão ao ponto vizinho; PgUp e PgDn percorrem todos; Home e End vão ao primeiro e ao último.
        </p>
        {visao && (
          <div ref={mundoRef} className="mapa-mundo">
            <svg className="mapa-svg" width={estagio.w} height={estagio.h} aria-hidden="true" focusable="false">
              <defs>
                <clipPath id={idDoClip}>
                  <path d={CAMINHOS.terra} clipRule="evenodd" />
                </clipPath>
              </defs>
              <g className="mapa-camada" style={{ transform: `translate(${visao.x}px, ${visao.y}px) scale(${visao.k})` }}>
                <path className="mapa-terra" d={CAMINHOS.terra} fillRule="evenodd" />
                <path className="mapa-costa" d={CAMINHOS.costa} />
                <path className="mapa-lago" d={CAMINHOS.lagos} fillRule="evenodd" />
                <path className="mapa-fronteira" d={CAMINHOS.limites} />
                {comLimites && (
                  <g clipPath={`url(#${idDoClip})`}>
                    <path className="mapa-regiao" d={CAMINHOS.arestas} data-regiao="todas" />
                    {CAMINHOS.regioes.filter((r) => regioesAtivas.has(r.id)).map((r) => (
                      <path key={r.id} className="mapa-regiao mapa-regiao-ativa" d={r.d} data-regiao={r.id} />
                    ))}
                  </g>
                )}
              </g>
            </svg>

            {LUGARES.filter((l) => (l.kmin === undefined || visao.k >= l.kmin) && (l.kmax === undefined || visao.k <= l.kmax)).map((l) => {
              const b = projetar(l.lat, l.lon)
              const lx = b.x * visao.k + visao.x
              const ly = b.y * visao.k + visao.y
              // o nome de um mar só aparece inteiro: cortado na borda do palco, não é escrito
              const larg = larguraDoTexto(l.nome, `12px ${familia}`, 6.6) + l.nome.length * 0.5
              const caixaDoNome = { esq: lx - larg / 2, topo: ly - 9, larg, alt: 18 }
              if (caixaDoNome.esq < 4 || caixaDoNome.esq + larg > estagio.w - 4 || ly < 8 || ly > estagio.h - 8 || zonas.some((z) => cruza(caixaDoNome, z))) return null
              // os pontos também são zona proibida para o nome de um mar (T17-C-26): o nome não se escreve por cima de um sítio
              if (caixas.some((q) => cruza(caixaDoNome, { esq: q.x - q.d / 2 - 2, topo: q.y - q.d / 2 - 2, larg: q.d + 4, alt: q.d + 4 }))) return null
              return (
                <span key={l.nome} className="mapa-lugar" aria-hidden="true" style={{ transform: `translate(${lx}px, ${ly}px) translate(-50%, -50%)` }}>
                  {l.nome}
                </span>
              )
            })}
            {nomesDeRegiao.map((r) => (
              <span key={r.id} className="mapa-rotulo-regiao" aria-hidden="true" data-nome-regiao={r.id} style={{ transform: `translate(${r.x}px, ${r.y}px) translate(${r.alinhar === 'fim' ? '-100%' : '-50%'}, -50%)` }}>
                {r.nome}
              </span>
            ))}

            {caixas.map(({ p, x, y, d }) => {
              const marcado = p.chave === selecionada
              const tam = marcado ? d + 5 : d
              return (
                <Fragment key={p.chave}>
                  {acesos.has(p.chave) && !marcado && <span className="mapa-anel" aria-hidden="true" data-anel={p.chave} style={{ transform: `translate(${x - (d + 7) / 2}px, ${y - (d + 7) / 2}px)`, width: d + 7, height: d + 7 }} />}
                  <button
                    type="button"
                    className="mapa-ponto"
                    aria-label={p.aria}
                    aria-pressed={marcado}
                    tabIndex={p.chave === chaveDoTab ? 0 : -1}
                    data-ponto={p.chave}
                    style={{ transform: `translate(${x - tam / 2}px, ${y - tam / 2}px)`, width: tam, height: tam, borderWidth: marcado ? 2 : 1 }}
                    onClick={(e) => {
                      // Um arrasto curto também vira clique no botão (a folga de toque do navegador é maior que a nossa): não é escolha.
                      if (e.detail > 0 && performance.now() - ultimoArrasto.current < 600) {
                        ultimoToque.current = null // engolido: não deixa o toque anterior engolir também o próximo clique (T17-C-30)
                        return
                      }
                      // O clique do mouse e do dedo já foi resolvido ao soltar (o ponto mais perto); aqui só o do teclado (Enter, Espaço).
                      // (O clique que o navegador manda depois de um toque cai no botão do alto da pilha, não no escolhido: some qualquer um.)
                      const t = ultimoToque.current
                      if (t && performance.now() - t.t < 600) {
                        ultimoToque.current = null
                        return
                      }
                      escolher(p.chave)
                    }}
                    onFocus={() => {
                      setTabChave(p.chave)
                      aoDestacar(new Set(p.sitios.map((s) => s.id)))
                      if (palcoRef.current) {
                        palcoRef.current.scrollLeft = 0
                        palcoRef.current.scrollTop = 0
                      }
                      if (aoFocarPonto(x, y)) {
                        const b = projetar(p.lat, p.lon)
                        aplicar((v) => centrarEm(b.x, b.y, v.k, estagio), true)
                      }
                    }}
                    onBlur={() => aoDestacar(null)}
                  />
                </Fragment>
              )
            })}

            {rotulos.map((r) => (
              <span key={r.chave} className={`mapa-rotulo${r.forte ? ' mapa-rotulo-forte' : ''}`} aria-hidden="true" style={{ transform: `translate(${r.esq}px, ${r.topo}px)`, textAlign: r.alinhar === 'fim' ? 'right' : 'left', width: r.larg }}>
                {r.nome}
              </span>
            ))}
          </div>
        )}
        {pontos.length === 0 && (
          <p className="mapa-vazio" role="status">
            Nenhum sítio com coordenada neste filtro.
          </p>
        )}
      </div>

      {computador ? (
        <>
          <label className="mapa-limites">
            <input type="checkbox" checked={comLimites} onChange={(e) => setComLimites(e.target.checked)} aria-keyshortcuts="r" />
            Limites das regiões
            <span className="mapa-tecla" aria-hidden="true">
              R
            </span>
          </label>
          <div className="mapa-controles" role="toolbar" aria-label="Zoom do mapa">
            <div className="mapa-zoom-par">
              {botaoZoom('Aproximar', 'Aproximar (+)', '+', 'adicionar', () => zoomNoCentro(1.5), 'cima')}
              {botaoZoom('Afastar', 'Afastar (−)', '-', 'recolher', () => zoomNoCentro(1 / 1.5), 'baixo')}
            </div>
            <button type="button" className="mapa-botao mapa-ver-tudo" data-tip="Ver tudo (0)" aria-keyshortcuts="0" onClick={verTudo}>
              <Icon name="ampliar" size={18} />
              Ver tudo
            </button>
          </div>
        </>
      ) : (
        <div className="mapa-controles" role="toolbar" aria-label="Controles do mapa">
          <div className="mapa-zoom-par">
            {botaoZoom('Aproximar', 'Aproximar', '+', 'adicionar', () => zoomNoCentro(1.5), 'cima')}
            {botaoZoom('Afastar', 'Afastar', '-', 'recolher', () => zoomNoCentro(1 / 1.5), 'baixo')}
          </div>
          <button type="button" className="mapa-botao mapa-quadrado" aria-label="Ver tudo" data-tip="Ver tudo" aria-keyshortcuts="0" onClick={verTudo}>
            <Icon name="ampliar" />
          </button>
          <button type="button" className={`mapa-botao mapa-quadrado${comLimites ? ' mapa-botao-ligado' : ''}`} aria-label="Limites das regiões" aria-pressed={comLimites} data-tip="Limites das regiões" aria-keyshortcuts="r" onClick={() => setComLimites((l) => !l)}>
            <Icon name="limites" />
          </button>
        </div>
      )}

      {escala && (
        <div className={`mapa-escala${!computador && comLimites ? ' mapa-escala-acima' : ''}${!computador && pontoSelecionado ? ' mapa-escala-oculta' : ''}`}>
          <span className="mapa-escala-linha">
            <span className="mapa-escala-barra" aria-hidden="true" style={{ width: escala.largura }} />
            <span aria-label="Escala">{escala.km} km</span>
          </span>
          {computador && <span>Mapa offline · Natural Earth, domínio público</span>}
        </div>
      )}
      {!computador && comLimites && !pontoSelecionado && (
        <div className="mapa-dica">
          <span className="mapa-dica-titulo">
            <Icon name="limites" size={18} />
            Limites das regiões
          </span>
          Tocar numa região filtra a lista. Mapa offline · Natural Earth, domínio público.
        </div>
      )}

      {computador && visao && visivel && (
        <div
          className="mapa-mini"
          aria-hidden="true"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId)
            minimapaAte(e)
          }}
          onPointerMove={(e) => e.buttons === 1 && minimapaAte(e)}
        >
          <svg width={MINI.w} height={MINI.h}>
            <g transform={`translate(${mox} ${moy}) scale(${ESCALA_DA_MINI})`}>
              <path className="mapa-terra" d={CAMINHOS.terra} fillRule="evenodd" />
              <path className="mapa-costa" d={CAMINHOS.costa} />
            </g>
            {caixas.length > 0 &&
              pontos.map((p) => {
                const b = projetar(p.lat, p.lon)
                return <circle key={p.chave} className="mapa-mini-ponto" cx={mox + b.x * ESCALA_DA_MINI} cy={moy + b.y * ESCALA_DA_MINI} r={1.6} />
              })}
            <rect
              className="mapa-mini-visao"
              x={mox + Math.max(0, visivel.x0) * ESCALA_DA_MINI}
              y={moy + Math.max(0, visivel.y0) * ESCALA_DA_MINI}
              width={Math.max(2, (Math.min(LARGURA_DA_EXTENSAO, visivel.x1) - Math.max(0, visivel.x0)) * ESCALA_DA_MINI)}
              height={Math.max(2, (Math.min(ALTURA_DA_EXTENSAO, visivel.y1) - Math.max(0, visivel.y0)) * ESCALA_DA_MINI)}
            />
          </svg>
        </div>
      )}

      {pontoSelecionado && (
        <CartaoDoPonto
          ref={cartaoRef}
          ponto={pontoSelecionado}
          computador={computador}
          aoFechar={() => {
            devolverFoco.current = pontoSelecionado.chave
            aoSelecionar(null)
          }}
        />
      )}
    </div>
  )
}
