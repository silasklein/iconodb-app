import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { LinkComOrigem, OrigemDosLinks, useOrigemDosLinks } from '../app/OrigemDosLinks'
import { comVoltar } from '../app/voltar'
import { useAtalhos } from '../app/useAtalhos'
import { dobrar } from '../glossario/modelo'
import { alvoDaLigacao, fotografia, ligacaoDaCitacao, obraAgora, pedidosDeLigarOCaso, pedidosDeVoltar, TIPO_DA_CITACAO } from '../revisao/citacoes'
import { DetalheDoCaso, type CasoEscolhido } from '../revisao/DetalheDoCaso'
import { desfazerResolvido, marcarComoResolvido } from '../revisao/operacoes'
import { casosIguais, type Caso, type Fila, type GrupoDaFila } from '../revisao/fila'
import { ID_DOS_PARES } from '../revisao/pares'
import { rotuloDaPendencia } from '../revisao/rotulos'
import { ROTULO_DOS_SITIOS } from '../sitios/pendencias'
import { useFilaComCarga } from '../revisao/useFila'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { numeroPtBr } from '../ui/numero'
import { useBreakpoint } from '../ui/useBreakpoint'
import { comModificador, temEntradaAnterior } from '../ui/useVoltar'
import { estadoAtual, registrarVarios } from '../usuario/estado'
import { GrupoDosPares, type Decisao } from './ParesNaRevisao'
import '../objetos-skc/Formulario.css'
import './Estado.css'
import './Revisao.css'

/** Quantos casos de um grupo aparecem de início, e quantos mais cada «Mostrar mais» traz (a página nunca desenha milhares de uma vez). */
const VISIVEIS = 25
const PASSO = 100
/** Quanto tempo o aviso de «marcado como resolvido» fica na tela (a tecla U ainda desfaz depois). */
export const TEMPO_DO_AVISO_MS = 8000
const PARAMETRO_ABERTOS = 'abrir'
/** Quantos casos estão mostrados em cada lista, no endereço: `ate=<grupo>:<n>`; `<grupo>~r` é a lista dos resolvidos. */
const PARAMETRO_ATE = 'ate'
/** O caso escolhido (Tarefa 11): no computador, o detalhe à direita; no celular, a página do caso. */
export const PARAMETRO_CASO = 'caso'
/** O filtro da lista no computador (quadro 1). */
const PARAMETRO_FILTRO = 'filtro'
/** As linhas que ↑ ↓ percorrem: os cabeçalhos dos grupos e os casos. */
const LINHAS_DA_REVISAO = '.revisao-grupo-cabeca, .revisao-caso-linha'
const ERRO_AO_GUARDAR = 'Não foi possível guardar; tente de novo. Nada foi perdido.'

const lista = (p: URLSearchParams, nome: string) => new Set((p.get(nome) ?? '').split(',').filter(Boolean))
const mostrados = (p: URLSearchParams): Map<string, number> => {
  const m = new Map<string, number>()
  for (const par of (p.get(PARAMETRO_ATE) ?? '').split(',')) {
    const i = par.lastIndexOf(':')
    const n = Number(par.slice(i + 1))
    if (i > 0 && Number.isInteger(n) && n > 0) m.set(par.slice(0, i), n)
  }
  return m
}
const plural = (n: number, um: string, varios: string) => `${numeroPtBr(n)} ${n === 1 ? um : varios}`
const resumoDoCaso = (c: Caso) => (c.numero !== '—' ? c.numero : c.o_que.length > 40 ? `${c.o_que.slice(0, 39)}…` : c.o_que)

/** O caso escolhido na fila: aberto, resolvido por você, ou ligado por você (a citação que saiu da fila). */
export function acharEscolhido(fila: Fila | null, chave: string | null): CasoEscolhido | null {
  if (!fila || !chave) return null
  for (const g of fila.grupos) {
    const i = g.abertos.findIndex((c) => c.chave === chave)
    if (i >= 0) return { caso: g.abertos[i]!, grupo: g, situacao: 'aberto', posicao: i + 1 }
    const r = g.resolvidos.find((c) => c.chave === chave)
    if (r) return { caso: r, grupo: g, situacao: 'resolvido', posicao: null }
  }
  const l = fila.ligadas.find((x) => x.caso.chave === chave)
  if (l) return { caso: l.caso, grupo: fila.grupos.find((g) => g.rotulo === rotuloDaPendencia(TIPO_DA_CITACAO)) ?? null, situacao: 'ligado', posicao: null, obra: l.obra }
  return null
}

/** O texto em que o filtro procura cada caso (o número, o que falta, onde), dobrado; uma vez por caso. */
const TEXTO_DO_CASO = new WeakMap<Caso, string>()
const textoDoCaso = (c: Caso) => {
  let t = TEXTO_DO_CASO.get(c)
  if (t === undefined) TEXTO_DO_CASO.set(c, (t = dobrar(`${c.numero} ${c.o_que} ${c.onde}`)))
  return t
}

/** Os grupos com os casos que têm o texto do filtro (os grupos só de contagem saem, e os vazios também). */
export function filtrarGrupos(grupos: readonly GrupoDaFila[], filtro: string): GrupoDaFila[] {
  const p = dobrar(filtro)
  if (!p) return [...grupos]
  const saida: GrupoDaFila[] = []
  for (const g of grupos) {
    if (g.link) continue
    const abertos = g.abertos.filter((c) => textoDoCaso(c).includes(p))
    const resolvidos = g.resolvidos.filter((c) => textoDoCaso(c).includes(p))
    if (abertos.length + resolvidos.length > 0) saida.push({ ...g, abertos, resolvidos, quantidade: abertos.length })
  }
  return saida
}

/**
 * Revisão (Revisao.dc.html, PC-Revisao.dc.html; Parte 2C, bloco 3, quadro 1): a fila do que o processamento não decidiu
 * sozinho, em grupos que abrem.
 *
 * - **No computador**, a lista fica à esquerda (com o filtro) e o caso escolhido à direita (`?caso=<chave>`). ↑ ↓ andam pela
 *   lista, Enter abre o caso (no caso já aberto, leva ao detalhe), D marca o caso em foco como resolvido e U desfaz o último.
 * - **No celular**, a lista é a de hoje, e cada caso abre numa página própria (o mesmo `?caso=`) com o mesmo detalhe.
 *
 * O detalhe genérico mostra o que a linha mostra, a ação («Abrir…», «Escolher…») e «Marcar como resolvido»; a citação não
 * resolvida tem «Onde aparece», a busca e as parecidas com «Ligar» (todas as iguais, Tarefa 7), «Nova obra com esta citação»
 * (que volta para cá) e «Marcar como resolvida sem ligar». A citação ligada sai da fila na hora, e as iguais também.
 *
 * Os grupos abertos, quantos casos cada lista mostra, o caso e o filtro ficam no endereço (`?abrir=`, `?ate=`, `?caso=`,
 * `?filtro=`): voltar de um objeto (o «‹ Revisão» da decisão 85, que leva o caminho com o `?…`) encontra a tela como estava,
 * no mesmo caso. A conta é a de `montarFila`, a mesma do Menu e do ponto da barra.
 */
export function Revisao() {
  return (
    <OrigemDosLinks rotulo="Revisão">
      <TelaDaRevisao />
    </OrigemDosLinks>
  )
}

/** O que o aviso guarda: a decisão, e se ela é de um caso (o U o escolhe de novo no computador). */
type DecisaoDaTela = Decisao & { caso?: boolean }

function TelaDaRevisao() {
  const { carga, fila, pares } = useFilaComCarga({ lugares: true, exigirBanco: true })
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const { pathname } = location
  const navegar = useNavigate()
  const computador = useBreakpoint() === 'computador'
  const abertos = lista(params, PARAMETRO_ABERTOS)
  const ate = mostrados(params)
  const casoNoEndereco = params.get(PARAMETRO_CASO)
  const filtro = computador ? (params.get(PARAMETRO_FILTRO) ?? '') : ''
  const escolhido = useMemo(() => acharEscolhido(fila, casoNoEndereco), [fila, casoNoEndereco])
  /**
   * A última decisão (um caso deixado como está ou ligado; um par de sítios decidido, Tarefa 15): o texto do aviso e o que a
   * tecla U desfaz (o aviso some sozinho, o U não).
   */
  const [ultimo, setUltimo] = useState<DecisaoDaTela | null>(null)
  const [avisoVisivel, setAvisoVisivel] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  /** Para onde o foco vai depois de uma ação: a linha de um caso, o grupo, ou o título do detalhe do caso `detalhe`. */
  const [foco, setFoco] = useState<{ chave?: string; grupo?: string; detalhe?: string; primeiroGrupo?: boolean } | null>(null)
  /** Depois de uma ação no computador: o caso a escolher (o primeiro destes que continuar na fila). */
  const [aEscolher, setAEscolher] = useState<{ sai: string; candidatos: string[]; detalhe: boolean; grupo: string | null } | null>(null)
  /** Com o filtro, os grupos abrem sozinhos; estes a pessoa recolheu (valem até o filtro mudar). */
  const [recolhidosNoFiltro, setRecolhidosNoFiltro] = useState<ReadonlySet<string>>(new Set())
  /** O caso cujo grupo já foi aberto ao escolhê-lo (uma vez só: depois a pessoa pode recolhê-lo). */
  const abertoAoEscolher = useRef<string | null>(null)
  const raiz = useRef<HTMLElement>(null)
  const tituloDoDetalhe = useRef<HTMLHeadingElement>(null)
  const filaAtual = useRef(fila)
  filaAtual.current = fila
  // Tarefa 14 (fix round 1): as obras dos livros criadas de obras suas, para a ligação a uma obra publicada que sai
  const criadasAtuais = useRef<ReadonlyMap<string, string> | undefined>(undefined)
  criadasAtuais.current = carga.fase === 'ok' ? carga.dados?.obrasCriadas : undefined

  const enderecoCom = useCallback(
    (mudar: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(params)
      mudar(p)
      const q = p.toString()
      return `${pathname}${q ? `?${q}` : ''}`
    },
    [params, pathname],
  )
  const hrefDoCaso = useCallback((chave: string) => enderecoCom((p) => p.set(PARAMETRO_CASO, chave)), [enderecoCom])
  const enderecoDaLista = enderecoCom((p) => p.delete(PARAMETRO_CASO))
  const enderecoAgora = enderecoCom(() => undefined)
  /**
   * A volta da página do caso (celular) à lista: no histórico, quando a página foi aberta da lista (o estado `daLista`); senão
   * (um link direto, a volta da Nova obra) vai à lista trocando a entrada, para o Voltar não cair de novo no caso.
   */
  const daLista = (location.state as { daLista?: unknown } | null)?.daLista === true
  const voltarALista = useCallback(() => {
    if (daLista && temEntradaAnterior(location)) void navegar(-1)
    else void navegar(enderecoDaLista, { replace: true })
  }, [daLista, location, navegar, enderecoDaLista])
  const aoVoltarALista = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.defaultPrevented || comModificador(e)) return
      e.preventDefault()
      voltarALista()
    },
    [voltarALista],
  )

  const mudar = useCallback(
    (nome: string, id: string, ligar: boolean) =>
      setParams(
        (atual) => {
          const p = new URLSearchParams(atual)
          const l = lista(p, nome)
          if (ligar) l.add(id)
          else l.delete(id)
          if (l.size === 0) p.delete(nome)
          else p.set(nome, [...l].join(','))
          return p
        },
        { replace: true },
      ),
    [setParams],
  )
  const verAte = useCallback(
    (lista: string, n: number) =>
      setParams(
        (atual) => {
          const p = new URLSearchParams(atual)
          const m = mostrados(p)
          m.set(lista, n)
          p.set(PARAMETRO_ATE, [...m].map(([k, v]) => `${k}:${v}`).join(','))
          return p
        },
        { replace: true },
      ),
    [setParams],
  )
  /** Escolhe o caso no computador (troca a entrada do histórico: andar pela lista não enche o Voltar). */
  const escolher = useCallback(
    (chave: string | null) =>
      setParams(
        (atual) => {
          const p = new URLSearchParams(atual)
          if (chave) p.set(PARAMETRO_CASO, chave)
          else p.delete(PARAMETRO_CASO)
          return p
        },
        { replace: true },
      ),
    [setParams],
  )
  const mudarFiltro = useCallback(
    (texto: string) =>
      setParams(
        (atual) => {
          const p = new URLSearchParams(atual)
          if (texto) p.set(PARAMETRO_FILTRO, texto)
          else p.delete(PARAMETRO_FILTRO)
          return p
        },
        { replace: true },
      ),
    [setParams],
  )

  // O aviso fica uns segundos; um novo caso marcado recomeça a contagem.
  useEffect(() => {
    if (!avisoVisivel) return
    const t = setTimeout(() => setAvisoVisivel(false), TEMPO_DO_AVISO_MS)
    return () => clearTimeout(t)
  }, [avisoVisivel, ultimo])

  // Depois de uma ação no computador, o detalhe passa ao primeiro vizinho que continua na fila (ou a nenhum).
  useEffect(() => {
    if (!aEscolher || !fila) return
    const naFila = new Set(fila.grupos.flatMap((g) => g.abertos.map((c) => c.chave)))
    if (naFila.has(aEscolher.sai)) return // a fila ainda não refez a conta: espera (as iguais saem junto)
    const proximo = aEscolher.candidatos.find((c) => naFila.has(c)) ?? null
    setAEscolher(null)
    escolher(proximo)
    if (aEscolher.detalhe && proximo) setFoco({ detalhe: proximo })
    // sem vizinho, o botão clicado some com o detalhe: o foco vai ao cabeçalho do grupo (ou ao primeiro, se o grupo esvaziou)
    else if (aEscolher.detalhe) setFoco({ grupo: aEscolher.grupo ?? undefined, primeiroGrupo: true })
  }, [aEscolher, fila, escolher])

  // No computador, o grupo do caso escolhido abre (no endereço, `?abrir=`), uma vez por caso: recolhê-lo depois vale.
  useEffect(() => {
    if (!computador || filtro || !escolhido?.grupo || abertoAoEscolher.current === escolhido.caso.chave) return
    abertoAoEscolher.current = escolhido.caso.chave
    if (!abertos.has(escolhido.grupo.id)) mudar(PARAMETRO_ABERTOS, escolhido.grupo.id, true)
  }, [computador, filtro, escolhido, abertos, mudar])

  // Um filtro novo abre de novo todos os grupos com casos.
  useEffect(() => setRecolhidosNoFiltro(new Set()), [filtro])

  // Depois de uma ação o caso muda de lugar: o foco vai ao botão do caso (ou ao do vizinho / do grupo), nunca se perde.
  useEffect(() => {
    if (!foco) return
    if (!computador && casoNoEndereco && !foco.detalhe) return // na página do caso: espera a volta à lista
    if (foco.detalhe) {
      // espera o detalhe do caso pedido (a troca do endereço pode vir depois)
      if (escolhido?.caso.chave !== foco.detalhe || !tituloDoDetalhe.current) return
      tituloDoDetalhe.current.focus()
      setFoco(null)
      return
    }
    const linha = foco.chave ? [...(raiz.current?.querySelectorAll<HTMLElement>('.revisao-tipos [data-chave]') ?? [])].find((e) => e.dataset.chave === foco.chave) : undefined
    const el =
      (linha ? (linha.querySelector<HTMLElement>('button') ?? linha.querySelector<HTMLElement>('.revisao-caso-linha')) : null) ??
      (foco.grupo ? raiz.current?.querySelector<HTMLElement>(`[data-grupo="${foco.grupo}"] > button, [data-grupo="${foco.grupo}"] > a`) : null) ??
      (foco.primeiroGrupo ? raiz.current?.querySelector<HTMLElement>('.revisao-tipos .revisao-grupo-cabeca') : null)
    el?.focus()
    setFoco(null)
  }, [foco, fila, casoNoEndereco, escolhido, computador])

  /** Os vizinhos de um caso no grupo dele (os seguintes, depois os anteriores): quem o detalhe mostra depois que ele sai. */
  const vizinhosDe = useCallback((grupo: string | null, chave: string): string[] => {
    const g = filaAtual.current?.grupos.find((x) => x.id === grupo)
    const doGrupo = g?.abertos ?? []
    const i = doGrupo.findIndex((x) => x.chave === chave)
    if (i < 0) return []
    return [...doGrupo.slice(i + 1), ...doGrupo.slice(0, i).reverse()].map((x) => x.chave)
  }, [])

  /** Depois de uma ação sobre o caso escolhido: no computador, o detalhe passa ao vizinho; no celular, volta à lista. */
  const depoisDoCaso = useCallback(
    (chave: string, vizinhos: string[], doDetalhe: boolean, grupo: string | null) => {
      if (casoNoEndereco !== chave) return
      if (computador) setAEscolher({ sai: chave, candidatos: vizinhos, detalhe: doDetalhe, grupo })
      else voltarALista()
    },
    [casoNoEndereco, computador, voltarALista],
  )

  const resolver = useCallback(
    async (grupo: string, c: Caso, doDetalhe = false) => {
      if (!c.deixavel) return
      const g = filaAtual.current?.grupos.find((x) => x.id === grupo)
      const doGrupo = g?.abertos.filter((x) => x.deixavel) ?? []
      const i = doGrupo.findIndex((x) => x.chave === c.chave)
      const vizinho = doGrupo[i + 1] ?? doGrupo[i - 1] ?? null
      const vizinhos = vizinhosDe(grupo, c.chave) // antes de gravar: depois o caso já saiu da lista
      setErro(null)
      try {
        await marcarComoResolvido(c.chave, c.tipo)
        setUltimo({ chave: c.chave, caso: true, texto: `${c.numero !== '—' ? c.numero : resumoDoCaso(c)}: marcado como resolvido.`, desfazer: () => desfazerResolvido(c.chave) })
        setAvisoVisivel(true)
        if (!doDetalhe || !computador) setFoco({ chave: vizinho?.chave, grupo })
        depoisDoCaso(c.chave, vizinhos, doDetalhe, grupo)
      } catch {
        setErro(ERRO_AO_GUARDAR)
      }
    },
    [computador, depoisDoCaso, vizinhosDe],
  )
  const desfazer = useCallback(async (chave: string) => {
    setErro(null)
    try {
      await desfazerResolvido(chave)
      setUltimo((u) => (u?.chave === chave ? null : u))
      setFoco({ chave })
    } catch {
      setErro(ERRO_AO_GUARDAR)
    }
  }, [])
  const aoDesfazerUm = useCallback((c: Caso) => void desfazer(c.chave), [desfazer])
  /** «Desfazer» do aviso e a tecla U: a ação que a decisão guardou. No computador, o caso desfeito volta ao detalhe. */
  const desfazerDecisao = useCallback(
    async (d: DecisaoDaTela) => {
      setErro(null)
      try {
        await d.desfazer()
        setUltimo((u) => (u?.chave === d.chave ? null : u))
        setFoco({ chave: d.chave })
        if (d.caso && computador) escolher(d.chave)
      } catch {
        setErro(ERRO_AO_GUARDAR)
      }
    },
    [computador, escolher],
  )

  /** «Ligar» no detalhe da citação: liga a chave (as iguais) ou a ocorrência, numa gravação, com o aviso e o U. */
  const ligarOCaso = useCallback(
    async (e: CasoEscolhido, obra: { id: string; rotulo: string }) => {
      const f = filaAtual.current
      const citacoes = f?.citacoes.get(e.caso.chave)
      if (!f || !citacoes) return
      const estado = estadoAtual()
      const alvo = alvoDaLigacao(estado, citacoes, f.citacoesPorChave)
      if (!alvo) return
      const vizinhos = vizinhosDe(e.grupo?.id ?? null, e.caso.chave)
      setErro(null)
      setOcupado(true)
      try {
        const { pedidos, antes } = pedidosDeLigarOCaso(estado, citacoes, alvo, obra.id)
        await registrarVarios(pedidos)
        // M1 (revisão final): a ligação só vale se a obra vale (`obraQueVale`: não a obra dos livros que sai no build
        // seguinte). Se não pegou, o caso fica na fila: a gravação volta, o aviso diz por quê, e nada passa ao vizinho
        if (obraAgora(estadoAtual(), citacoes[0]!, criadasAtuais.current) === null) {
          await registrarVarios(pedidosDeVoltar(estadoAtual(), antes))
          setErro(`«${obra.rotulo}» sai dos livros no próximo pacote (as obras suas de que ela veio estão excluídas); a citação não foi ligada.`)
          setFoco({ detalhe: e.caso.chave })
          return
        }
        setUltimo({
          chave: e.caso.chave,
          caso: true,
          texto: `«${alvo.rotulo}»: ${alvo.iguais === 1 ? 'ligada' : `as ${numeroPtBr(alvo.iguais)} citações ligadas`} a «${obra.rotulo}».`,
          desfazer: () => registrarVarios(pedidosDeVoltar(estadoAtual(), antes)),
        })
        setAvisoVisivel(true)
        if (!computador) setFoco({ grupo: e.grupo?.id })
        // um caso já resolvido por você, ligado agora, fica no detalhe (passa a «ligada»); o aberto dá lugar ao seguinte
        if (e.situacao === 'aberto') depoisDoCaso(e.caso.chave, vizinhos, true, e.grupo?.id ?? null)
        else if (!computador) voltarALista()
      } catch {
        setErro(ERRO_AO_GUARDAR)
      } finally {
        setOcupado(false)
      }
    },
    [computador, depoisDoCaso, vizinhosDe, voltarALista],
  )

  /** «Desfazer a ligação» do caso ligado: tira o registro que o liga (a chave: as iguais voltam juntas), com o U. */
  const desfazerLigacao = useCallback(async (e: CasoEscolhido) => {
    const citacao = filaAtual.current?.citacoes.get(e.caso.chave)?.[0]
    if (!citacao) return
    const estado = estadoAtual()
    const ligacao = ligacaoDaCitacao(estado, citacao, criadasAtuais.current)
    if (!ligacao) return
    const antes = [fotografia(estado, ligacao.registro)]
    // pela chave, as iguais voltam juntas (as que a chave ligava: as não resolvidas pelo processamento com essa chave)
    const iguais = ligacao.por === 'chave' ? (filaAtual.current?.citacoesPorChave.get(ligacao.registro)?.filter((x) => obraAgora(estado, x, criadasAtuais.current) !== null).length ?? 1) : 1
    setErro(null)
    setOcupado(true)
    try {
      await registrarVarios([{ tipo: 'citacao', reg: ligacao.registro, op: 'excluir', campos: {} }])
      setUltimo({ chave: e.caso.chave, caso: true, texto: `«${citacao.curta ?? citacao.bruto}»: ligação desfeita; ${iguais > 1 ? `as ${numeroPtBr(iguais)} citações voltaram` : 'a citação voltou'} à fila.`, desfazer: () => registrarVarios(pedidosDeVoltar(estadoAtual(), antes)) })
      setAvisoVisivel(true)
      setFoco({ detalhe: e.caso.chave })
    } catch {
      setErro(ERRO_AO_GUARDAR)
    } finally {
      setOcupado(false)
    }
  }, [])

  // Os pares de sítios (Tarefa 15): decidir mostra o aviso e leva o foco ao par vizinho (ou ao grupo); desfazer pela linha o
  // devolve aos abertos, com o foco nele.
  const aoDecidirPar = useCallback((d: Decisao, vizinho: string | null) => {
    setErro(null)
    setUltimo(d)
    setAvisoVisivel(true)
    setFoco({ chave: vizinho ?? undefined, grupo: ID_DOS_PARES })
  }, [])
  const aoDesfazerPar = useCallback((chave: string) => {
    setErro(null)
    setUltimo((u) => (u?.chave === chave ? null : u))
    setFoco({ chave })
  }, [])
  const aoFalharPar = useCallback(() => setErro(ERRO_AO_GUARDAR), [])
  const aoResolverUm = useCallback((grupo: string, c: Caso) => void resolver(grupo, c), [resolver])
  /** Enter (ou o clique) no caso que já está no detalhe: o foco vai ao detalhe. */
  const aoAbrirEscolhido = useCallback(() => tituloDoDetalhe.current?.focus(), [])

  /** ↑ ↓: o cabeçalho ou o caso anterior / seguinte da lista (só com um deles em foco; senão as setas rolam a página). */
  const moverNaLista = useCallback((passo: 1 | -1): void | false => {
    const itens = [...(raiz.current?.querySelectorAll<HTMLElement>(LINHAS_DA_REVISAO) ?? [])]
    const i = itens.findIndex((el) => el === document.activeElement)
    if (i < 0) return false
    const destino = itens[i + passo]
    if (!destino) return
    destino.focus()
    destino.scrollIntoView?.({ block: 'nearest' })
  }, [])

  // D: deixar como está o caso em foco (a linha ou o detalhe). U: desfazer o último. ↑ ↓: andar pela lista. (Fora dos campos de texto.)
  useAtalhos(
    {
      d: () => {
        const el = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-chave]')
        const chave = el?.dataset.chave
        if (!chave) return false
        for (const g of filaAtual.current?.grupos ?? []) {
          const c = g.abertos.find((x) => x.chave === chave)
          if (c?.deixavel) {
            void resolver(g.id, c, !!el.closest('.revisao-detalhe-caso'))
            return
          }
        }
        return false
      },
      u: () => {
        if (!ultimo) return false
        void desfazerDecisao(ultimo)
      },
      ArrowDown: () => moverNaLista(1),
      ArrowUp: () => moverNaLista(-1),
    },
    'revisao',
  )

  // Tarefa 15: o grupo dos pares de sítios vem logo antes de «Sítios não resolvidos» (sem ele, no começo da lista).
  const temPares = !filtro && !!pares && (pares.abertos.length > 0 || pares.resolvidos.length > 0)
  const grupos = useMemo(() => filtrarGrupos(fila?.grupos ?? [], filtro), [fila, filtro])
  const iDosSitios = grupos.findIndex((g) => g.rotulo === ROTULO_DOS_SITIOS)
  const corte = iDosSitios >= 0 ? iDosSitios : 0
  const gruposAntesDosPares = grupos.slice(0, corte)
  const gruposDepoisDosPares = grupos.slice(corte)
  const modo = computador ? 'mac' : 'celular'
  const escolhidoNaLista = computador ? casoNoEndereco : null
  const linhaDoGrupo = (g: GrupoDaFila) => (
    <li key={g.id} data-grupo={g.id}>
      <Grupo
        g={g}
        aberto={abertos.has(g.id) || (!!filtro && !recolhidosNoFiltro.has(g.id))}
        ateAbertos={ate.get(g.id) ?? VISIVEIS}
        ateResolvidos={ate.get(`${g.id}~r`) ?? VISIVEIS}
        aoAbrir={(a) => {
          if (filtro)
            setRecolhidosNoFiltro((r) => {
              const n = new Set(r)
              if (a) n.delete(g.id)
              else n.add(g.id)
              return n
            })
          mudar(PARAMETRO_ABERTOS, g.id, a)
        }}
        aoVerAte={verAte}
        aoResolver={aoResolverUm}
        aoDesfazer={aoDesfazerUm}
        modo={modo}
        escolhido={escolhidoNaLista}
        hrefDoCaso={hrefDoCaso}
        aoAbrirEscolhido={aoAbrirEscolhido}
      />
    </li>
  )

  const detalhe = escolhido ? (
    <DetalheDoCaso
      key={escolhido.caso.chave}
      escolhido={escolhido}
      citacoes={fila?.citacoes.get(escolhido.caso.chave)}
      porChave={fila?.citacoesPorChave ?? new Map()}
      volta={enderecoAgora}
      computador={computador}
      ocupado={ocupado}
      tituloRef={tituloDoDetalhe}
      aoMarcar={() => escolhido.grupo && void resolver(escolhido.grupo.id, escolhido.caso, true)}
      aoDesfazer={() => void desfazer(escolhido.caso.chave)}
      aoLigar={(obra) => void ligarOCaso(escolhido, obra)}
      aoDesfazerLigacao={() => void desfazerLigacao(escolhido)}
    />
  ) : null

  const aviso = (
    <p className="revisao-aviso" role="status" aria-live="polite" hidden={!ultimo || !avisoVisivel}>
      {ultimo && avisoVisivel && (
        <>
          <span>{ultimo.texto}</span>
          <button type="button" className="revisao-desfazer" aria-keyshortcuts="U" onClick={() => void desfazerDecisao(ultimo)}>
            <Icon name="desfazer" size={16} />
            Desfazer
          </button>
        </>
      )}
    </p>
  )
  const avisoDeErro = erro && (
    <p className="form-erro revisao-erro" role="alert">
      <Icon name="aviso" size={16} />
      {erro}
    </p>
  )

  // O celular com um caso no endereço: a página do caso.
  if (!computador && casoNoEndereco) {
    return (
      <div className="pagina-consulta">
        <TopoDoCelular voltar={{ href: `#${enderecoDaLista}`, rotulo: 'Voltar à Revisão', aoClicar: aoVoltarALista }} />
        <main ref={raiz} className="pagina-consulta-corpo revisao revisao-pagina-do-caso">
          {carga.fase === 'erro' && <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />}
          {avisoDeErro}
          {fila &&
            (detalhe ?? (
              <div className="revisao-detalhe-vazio">
                <p>Este caso não está mais na fila.</p>
                <Link to={enderecoDaLista} replace>
                  Ver a Revisão
                </Link>
              </div>
            ))}
        </main>
        {aviso}
      </div>
    )
  }

  // as citações (não os casos) que você ligou: um caso pode ter várias
  const citacoesLigadas = fila ? fila.ligadas.reduce((n, l) => n + (fila.citacoes.get(l.caso.chave)?.length ?? 1), 0) : 0
  const listaDosGrupos = fila && (
    <>
      <p className="pagina-consulta-apoio">
        {numeroPtBr(fila.total)} {fila.total === 1 ? 'caso' : 'casos'} · o que o processamento não decidiu sozinho
      </p>
      {fila.resolvidosPelaPessoa > 0 && <p className="pagina-consulta-apoio">{plural(fila.resolvidosPelaPessoa, 'resolvido', 'resolvidos')} por você, fora da contagem.</p>}
      {fila.sitiosLigados > 0 && <p className="pagina-consulta-apoio">{plural(fila.sitiosLigados, 'resolvido', 'resolvidos')} por você, trocando o sítio do objeto na ficha.</p>}
      {citacoesLigadas > 0 && <p className="pagina-consulta-apoio">{plural(citacoesLigadas, 'citação ligada', 'citações ligadas')} por você a obras, fora da fila.</p>}
      {computador && (
        <div className="form-campo revisao-filtro">
          <label htmlFor="revisao-filtro">Filtrar</label>
          <input id="revisao-filtro" type="search" value={filtro} onChange={(e) => mudarFiltro(e.target.value)} autoComplete="off" />
        </div>
      )}
      {avisoDeErro}
      {filtro && grupos.length === 0 ? (
        <p className="pagina-consulta-vazio">Nenhum caso com «{filtro}».</p>
      ) : fila.grupos.length === 0 && !temPares ? (
        <p className="pagina-consulta-vazio">Nada a revisar.</p>
      ) : (
        <ul className="revisao-tipos" aria-label="Casos por tipo">
          {gruposAntesDosPares.map(linhaDoGrupo)}
          {pares && temPares && (
            <li data-grupo={ID_DOS_PARES}>
              <GrupoDosPares
                pares={pares}
                aberto={abertos.has(ID_DOS_PARES)}
                abertos={abertos}
                aoAbrir={(id, a) => mudar(PARAMETRO_ABERTOS, id, a)}
                aoDecidir={aoDecidirPar}
                aoDesfazer={aoDesfazerPar}
                aoFalhar={aoFalharPar}
              />
            </li>
          )}
          {gruposDepoisDosPares.map(linhaDoGrupo)}
        </ul>
      )}
    </>
  )

  if (computador) {
    return (
      <div className="pagina-consulta">
        <main ref={raiz} className="revisao revisao-dividida">
          <div className="revisao-lateral">
            <h1>Revisão</h1>
            {carga.fase === 'erro' && <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />}
            {listaDosGrupos}
          </div>
          <section className="revisao-detalhe" aria-label="O caso escolhido">
            {fila &&
              (detalhe ?? (
                <p className="revisao-detalhe-vazio">{casoNoEndereco ? 'Este caso não está mais na fila.' : 'Escolha um caso na lista. ↑ ↓ andam pela lista; Enter abre.'}</p>
              ))}
          </section>
        </main>
        {aviso}
      </div>
    )
  }

  return (
    <div className="pagina-consulta">
      <TopoDoCelular voltar={{ href: '#/' }} />
      <main ref={raiz} className="pagina-consulta-corpo revisao">
        <h1>Revisão</h1>
        {carga.fase === 'erro' && <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />}
        {listaDosGrupos}
      </main>
      {aviso}
    </div>
  )
}

interface PropsDoGrupo {
  g: GrupoDaFila
  aberto: boolean
  ateAbertos: number
  ateResolvidos: number
  aoAbrir: (aberto: boolean) => void
  aoVerAte: (lista: string, n: number) => void
  aoResolver: (grupo: string, c: Caso) => void
  aoDesfazer: (c: Caso) => void
  modo: 'mac' | 'celular'
  /** A chave do caso no detalhe (computador). */
  escolhido: string | null
  hrefDoCaso: (chave: string) => string
  aoAbrirEscolhido: () => void
}

function Grupo({ g, aberto, ateAbertos, ateResolvidos, aoAbrir, aoVerAte, aoResolver, aoDesfazer, modo, escolhido, hrefDoCaso, aoAbrirEscolhido }: PropsDoGrupo) {
  const cabeca = (
    <>
      <span className="revisao-grupo-nome">
        <span className="revisao-grupo-rotulo">{g.rotulo}</span>
        <span className="revisao-grupo-apoio">{g.apoio}</span>
      </span>
      <span className="revisao-grupo-fim">
        <span className={`codigo revisao-grupo-quantidade${g.soConsulta ? ' revisao-grupo-quantidade-so-consulta' : ''}`}>{numeroPtBr(g.quantidade)}</span>
        <Icon name={g.link ? 'detalhe' : aberto ? 'recolher' : 'adicionar'} size={16} />
      </span>
    </>
  )
  if (g.link) {
    return (
      <LinkComOrigem className="revisao-grupo-cabeca" to={g.link.para} aria-label={`${g.rotulo}, ${numeroPtBr(g.quantidade)}: ${g.link.rotulo}`}>
        {cabeca}
      </LinkComOrigem>
    )
  }
  const idLista = `revisao-casos-${g.id}`
  // Ao «Mostrar mais», o botão some (ou muda de nome) e o foco iria junto: vai à primeira linha que apareceu (T17-B-19).
  const listaDosAbertos = useRef<HTMLUListElement>(null)
  const listaDosResolvidos = useRef<HTMLUListElement>(null)
  const focarDepois = useRef<{ lista: 'abertos' | 'resolvidos'; indice: number } | null>(null)
  useEffect(() => {
    const pedido = focarDepois.current
    if (!pedido) return
    const ul = (pedido.lista === 'abertos' ? listaDosAbertos : listaDosResolvidos).current
    const linha = ul?.querySelectorAll<HTMLElement>(':scope > li')[pedido.indice]
    if (!linha) return
    focarDepois.current = null
    linha.querySelector<HTMLElement>('a, button')?.focus()
  }, [ateAbertos, ateResolvidos])
  const dosAbertos = g.abertos.slice(0, ateAbertos)
  const dosResolvidos = g.resolvidos.slice(0, ateResolvidos)
  const linha = (c: Caso, resolvido: boolean) => (
    <LinhaDoCaso
      key={c.chave}
      grupo={g.id}
      c={c}
      resolvido={resolvido}
      aoResolver={resolvido ? undefined : aoResolver}
      aoDesfazer={resolvido ? aoDesfazer : undefined}
      modo={modo}
      escolhido={escolhido === c.chave}
      href={hrefDoCaso(c.chave)}
      aoAbrirEscolhido={aoAbrirEscolhido}
    />
  )
  return (
    <>
      <button type="button" className="revisao-grupo-cabeca" aria-expanded={aberto} aria-controls={idLista} onClick={() => aoAbrir(!aberto)}>
        {cabeca}
      </button>
      {aberto && (
        <div id={idLista} className="revisao-casos">
          {g.soConsulta && <p className="revisao-so-consulta">Só para consulta: não entra no total.</p>}
          {g.abertos.length > 0 && (
            <ul ref={listaDosAbertos} aria-label={`Casos de ${g.rotulo}`}>
              {dosAbertos.map((c) => linha(c, false))}
            </ul>
          )}
          {g.abertos.length > dosAbertos.length && (
            <button
              type="button"
              className="revisao-ver-todas hit"
              onClick={() => {
                focarDepois.current = { lista: 'abertos', indice: dosAbertos.length }
                aoVerAte(g.id, dosAbertos.length + Math.min(PASSO, g.abertos.length - dosAbertos.length))
              }}
            >
              Mostrar mais {numeroPtBr(Math.min(PASSO, g.abertos.length - dosAbertos.length))} ({numeroPtBr(dosAbertos.length)} de {numeroPtBr(g.abertos.length)})
            </button>
          )}
          {g.resolvidos.length > 0 && (
            <>
              <h3 className="revisao-resolvidos-titulo">Resolvidos por você · {numeroPtBr(g.resolvidos.length)}</h3>
              <ul ref={listaDosResolvidos} aria-label={`Resolvidos de ${g.rotulo}`}>
                {dosResolvidos.map((c) => linha(c, true))}
              </ul>
              {g.resolvidos.length > dosResolvidos.length && (
                <button
                  type="button"
                  className="revisao-ver-todas hit"
                  onClick={() => {
                    focarDepois.current = { lista: 'resolvidos', indice: dosResolvidos.length }
                    aoVerAte(`${g.id}~r`, dosResolvidos.length + Math.min(PASSO, g.resolvidos.length - dosResolvidos.length))
                  }}
                >
                  Mostrar mais {numeroPtBr(Math.min(PASSO, g.resolvidos.length - dosResolvidos.length))} resolvidos ({numeroPtBr(dosResolvidos.length)} de {numeroPtBr(g.resolvidos.length)})
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}

interface PropsDaLinha {
  grupo: string
  c: Caso
  resolvido?: boolean
  aoResolver?: (grupo: string, c: Caso) => void
  aoDesfazer?: (c: Caso) => void
  modo: 'mac' | 'celular'
  /** O caso está no detalhe (computador)? */
  escolhido: boolean
  /** O endereço do caso (`?caso=`). */
  href: string
  aoAbrirEscolhido: () => void
}

/** O estado da página do caso aberta da lista (celular): o Voltar dela volta no histórico. */
const DA_LISTA = { daLista: true }

/** Uma linha só se refaz quando o seu caso muda (as listas têm centenas de linhas e cada ação refaz a fila inteira). */
const LinhaDoCaso = memo(
  function LinhaDoCaso({ grupo, c, resolvido = false, aoResolver, aoDesfazer, modo, escolhido, href, aoAbrirEscolhido }: PropsDaLinha) {
    const resumo = resumoDoCaso(c)
    const navegar = useNavigate()
    const origem = useOrigemDosLinks()
    // A ação navega pelo roteador (uma entrada de histórico do app): a tela aberta sabe que há para onde voltar (T17-B-22). Ao
    // objeto vai junto a origem (decisão 85): «‹ Revisão».
    const irPara = (para: string) => (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.defaultPrevented || comModificador(e)) return
      e.preventDefault()
      void navegar(para, para.startsWith('/item/') ? { state: comVoltar(undefined, origem) } : para === href ? { state: DA_LISTA } : undefined)
    }

    // No computador a linha inteira escolhe o caso (o detalhe à direita tem as ações). Só o caso escolhido entra no Tab: as
    // setas andam pelos outros, e o Tab passa da lista ao detalhe.
    if (modo === 'mac') {
      return (
        <li className={`revisao-caso revisao-caso-mac${resolvido ? ' revisao-caso-resolvido' : ''}${escolhido ? ' revisao-caso-escolhido' : ''}`} data-chave={c.chave}>
          <Link
            className="revisao-caso-linha"
            to={href}
            replace
            aria-current={escolhido ? 'true' : undefined}
            tabIndex={escolhido ? 0 : -1}
            onClick={(e) => {
              if (!escolhido || comModificador(e)) return
              e.preventDefault()
              aoAbrirEscolhido()
            }}
          >
            <span className="revisao-caso-o-que">{c.o_que}</span>
            <span className="revisao-caso-onde">
              {c.numero !== '—' && <span className="codigo">{c.numero} · </span>}
              {c.onde}
              {resolvido && ' · resolvido por você'}
            </span>
          </Link>
        </li>
      )
    }

    // O número leva ao objeto; sem número (um «—») não há o que abrir por ele, e a ação da linha já leva ao mesmo lugar.
    const comNumero = c.abrir && c.numero !== '—'
    // A citação abre a página do caso, onde se liga a uma obra (Tarefa 11).
    const acao = c.tipo === TIPO_DA_CITACAO && !resolvido ? { rotulo: 'Ligar a uma obra', para: href } : c.acao
    return (
      <li className={`revisao-caso${resolvido ? ' revisao-caso-resolvido' : ''}`} data-chave={c.chave}>
        {comNumero ? (
          <LinkComOrigem className="hit revisao-caso-numero" to={c.abrir!} aria-label={`Abrir ${c.numero}`}>
            {c.numero}
          </LinkComOrigem>
        ) : (
          <span className="revisao-caso-numero">{c.numero}</span>
        )}
        <Link className="revisao-caso-texto revisao-caso-linha" to={href} state={DA_LISTA}>
          <span className="revisao-caso-o-que">{c.o_que}</span>
          <span className="revisao-caso-onde">{c.onde}</span>
        </Link>
        <span className="revisao-caso-acoes">
          {resolvido ? (
            <button type="button" className="revisao-desfazer" aria-label={`Desfazer: ${resumo}`} onClick={() => aoDesfazer?.(c)}>
              <Icon name="desfazer" size={16} />
              Desfazer
            </button>
          ) : (
            <>
              {/* Só «Resolver», «Escolher» e «Ligar» mexem em algo (lápis); «Abrir …» só leva ao lugar (seta). */}
              {acao && <IconButton icon={acao.rotulo.startsWith('Abrir') ? 'detalhe' : 'editarFicha'} size={18} label={acao.rotulo} href={`#${acao.para}`} onClick={irPara(acao.para)} />}
              {c.deixavel && <IconButton icon="arquivar" size={18} label={`Deixar como está: ${resumo}`} shortcut="D" onClick={() => aoResolver?.(grupo, c)} />}
            </>
          )}
        </span>
      </li>
    )
  },
  (a, b) =>
    a.grupo === b.grupo &&
    a.resolvido === b.resolvido &&
    a.aoResolver === b.aoResolver &&
    a.aoDesfazer === b.aoDesfazer &&
    a.modo === b.modo &&
    a.escolhido === b.escolhido &&
    a.href === b.href &&
    a.aoAbrirEscolhido === b.aoAbrirEscolhido &&
    casosIguais(a.c, b.c),
)
