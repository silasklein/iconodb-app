import { lazy, memo, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useNavigationType, useParams } from 'react-router'
import { sitios, type SitioResumo } from '../banco/consultas'
import { dadosDoDestino, totalDeObjetos } from '../sitios/contagem'
import { useCorrecoesDosSitios, useObjetosPorSitio, useResolucaoDaLista, useSitiosSkc, useTodosOsSitiosSkc, useTrocasDeSitio } from '../sitios/doUsuario'
import type { DadosDoSitio, SitioSkc } from '../sitios/modelo'
import { restaurarSitio } from '../sitios/operacoes'
import { fold, tabelaDoPacote } from '../busca/fold'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { Contagem } from '../ui/Contagem'
import { CampoDeFiltro } from '../ui/CampoDeFiltro'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { ListaEDetalhe } from '../ui/ListaEDetalhe'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { numeroPtBr } from '../ui/numero'
import '../ui/Tooltip.css'
import { coordenadaAte5, coordenadaEmGraus } from './coordenada'
import { agrupar, filtrar, indexar, inicialDe, type Entrada, type Grupo } from './lista'
import { Sitio } from './Sitio'
import { useParametrosNaUrl } from './useParametrosNaUrl'
import { FiltroDeRegioes } from '../sitios/FiltroDeRegioes'
import { agruparPontos, chaveDaCoordenada, type SitioNoMapa } from '../sitios/mapa'
import { useObjetosDoPacoteSemRepetir } from '../sitios/useResolucao'
import { CHAVE_FORA, CHAVE_SEM_COORDENADA, REGIOES, nomeDaRegiao, regiaoDe } from '../sitios/regioes'
import '../imagens-usuario/MarcaSkc.css'
import '../sitios/Sitios.css'
import './Lista.css'

/** Quanto a busca espera parada antes de o mapa se reenquadrar. */
const PAUSA_DA_BUSCA_NO_MAPA_MS = 300
/** O valor de agora só depois de `ms` sem mudar (o primeiro valor vale já). */
function useAposPausa<T>(valor: T, ms: number): T {
  const [atual, setAtual] = useState(valor)
  useEffect(() => {
    if (Object.is(atual, valor)) return
    const t = setTimeout(() => setAtual(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms, atual])
  return atual
}

const SEM_REGIAO = 'Sem região'

/** O mapa e o JSON dele só são baixados quando a tela do mapa aparece (decisão 36: o pacote principal não cresce). */
const Mapa = lazy(() => import('../sitios/Mapa'))

const IDS_DE_REGIAO = new Set([...REGIOES.map((r) => r.id), CHAVE_SEM_COORDENADA, CHAVE_FORA])
const SEM_DESTAQUE: ReadonlySet<string> = new Set()

/** Um sítio da lista: do livro (com a correção do usuário, se há) ou novo do usuário. */
interface SitioDaLista extends SitioResumo {
  doUsuario: boolean
  /** A coordenada é a que a pessoa escreveu (até 5 casas, sem zeros à direita). */
  coordenadaDoUsuario: boolean
  /** A região geográfica deduzida da coordenada (src/sitios/regioes.ts), ou «sem-coordenada». */
  regiaoGeo: string
}

async function carregar() {
  const [lista, tabela] = await Promise.all([sitios(), tabelaDoPacote()])
  return { lista, tabela }
}

/**
 * Os sítios do livro com o nome, as grafias, a região e a coordenada corrigidos, e os sítios novos do usuário. A busca da lista
 * acha pelo nome de agora e pelo do livro (e pelas grafias).
 *
 * Parte 2C, bloco 2 (`daLista`, a resolução): um sítio mesclado em outro não aparece; o nome dele e as grafias novas acham o
 * destino (`nomes`), os objetos dele, os do destino e os das partes somam na contagem (`totalDeObjetos`, cada objeto do pacote uma vez), e a coordenada e a
 * região que faltam ao destino vêm do absorvido de menor id (`dadosDoDestino`). Enquanto a resolução não chega, como antes.
 */
function juntar(
  lista: readonly SitioResumo[],
  correcoes: ReadonlyMap<string, DadosDoSitio>,
  novos: readonly SitioSkc[],
  contagem: ReadonlyMap<string, number>,
  daLista: ReturnType<typeof useResolucaoDaLista>,
  todosSkc: readonly SitioSkc[],
  distintos: ReadonlyMap<string, number> | null,
): { itens: SitioDaLista[]; busca: Map<string, string> } {
  const busca = new Map<string, string>()
  const itens: SitioDaLista[] = []
  const doLivro = new Map(lista.map((s) => [s.id, s] as const))
  const skc = new Map(todosSkc.map((s) => [s.id, s] as const))
  const doPacote = (id: string) => doLivro.get(id)?.objetos ?? 0
  const daPessoaNoSitio = (id: string) => contagem.get(id) ?? 0
  // A coordenada (e se é a da pessoa) e a região de um sítio só, como a lista as mostrava antes. A região leva o id e o nome
  // da mesma fonte: a do livro (o verbete-pai), ou o texto da pessoa (sem id).
  const dadosDe = (id: string) => {
    const s = doLivro.get(id)
    const c = s ? correcoes.get(id) : skc.get(id)
    const livro = s && s.lat !== null && s.lon !== null ? { lat: s.lat, lon: s.lon } : null
    const regiaoObjeto: SitioResumo['regiao'] = c?.regiao ? { id: '', nome: c.regiao } : (s?.regiao ?? null)
    return { coordenada: c?.coordenada ?? livro, regiao: regiaoObjeto?.nome ?? null, regiaoObjeto, pais: null, nota: null, daPessoa: !s || !!c?.coordenada }
  }
  /**
   * O que a linha mostra de um sítio: com a resolução, os campos que faltam vêm do absorvido de menor id, e a contagem soma os
   * absorvidos e as partes (cada objeto do pacote uma vez: `distintos`).
   */
  const linha = (id: string) => {
    if (!daLista) {
      const d = dadosDe(id)
      return { coordenada: d.coordenada, regiao: d.regiaoObjeto, daPessoa: d.daPessoa, objetos: doPacote(id) + daPessoaNoSitio(id) }
    }
    const d = dadosDoDestino(daLista.resolucao, id, dadosDe)
    const daPessoa = d.origem.coordenada !== undefined && dadosDe(d.origem.coordenada).daPessoa
    const regiao = d.origem.regiao !== undefined ? dadosDe(d.origem.regiao).regiaoObjeto : null
    return { coordenada: d.coordenada, regiao, daPessoa, objetos: totalDeObjetos(daLista.resolucao, id, doPacote, daPessoaNoSitio, distintos) }
  }
  for (const s of lista) {
    if (daLista?.destinos.has(s.id)) continue
    const c = correcoes.get(s.id)
    const l = linha(s.id)
    busca.set(s.id, [s.nome, s.literal, s.id, c?.nome, ...(c?.variantes ?? []), c?.regiao, c?.pais, ...(daLista?.nomes.get(s.id) ?? [])].filter(Boolean).join(' '))
    itens.push({
      ...s,
      nome: c?.nome ?? s.nome,
      regiao: l.regiao,
      lat: l.coordenada?.lat ?? null,
      lon: l.coordenada?.lon ?? null,
      objetos: l.objetos,
      doUsuario: false,
      coordenadaDoUsuario: l.daPessoa,
      regiaoGeo: regiaoDe(l.coordenada?.lat, l.coordenada?.lon),
    })
  }
  for (const s of novos) {
    const l = linha(s.id)
    busca.set(s.id, [s.nomeDeAgora, s.id, ...s.variantes, s.regiao, s.pais, s.nota, ...(daLista?.nomes.get(s.id) ?? [])].filter(Boolean).join(' '))
    itens.push({
      id: s.id,
      nome: s.nomeDeAgora,
      literal: s.nomeDeAgora,
      glId: null,
      lat: l.coordenada?.lat ?? null,
      lon: l.coordenada?.lon ?? null,
      regiao: l.regiao,
      objetos: l.objetos,
      doUsuario: true,
      coordenadaDoUsuario: l.coordenada === null || l.daPessoa,
      regiaoGeo: regiaoDe(l.coordenada?.lat, l.coordenada?.lon),
    })
  }
  return { itens, busca }
}

type Entradas = Entrada<SitioDaLista>[]

/** Os nomes das regiões marcadas, na ordem das etiquetas do filtro (não na ordem dos toques). */
const nomesDasRegioesAtivas = (ativas: ReadonlySet<string>): string =>
  [...REGIOES.map((r) => r.id), CHAVE_SEM_COORDENADA, CHAVE_FORA].filter((id) => ativas.has(id)).map(nomeDaRegiao).join(', ')

/** E-5: a região no fim da linha sai da coordenada (a mesma do filtro); sem coordenada ou fora das regiões, nada. */
const regiaoDaLinha = (regiaoGeo: string): string | null => (regiaoGeo === CHAVE_SEM_COORDENADA || regiaoGeo === CHAVE_FORA ? null : nomeDaRegiao(regiaoGeo))

/**
 * Os grupos da lista (R18). Não há coluna de região nos sítios: a região é o verbete-pai do verbete que dá nome
 * ao sítio. Quando o pacote tem regiões, um grupo por região (os sem região no fim); senão uma lista só,
 * alfabética, com cabeçalho por letra. Com uma região geográfica no filtro (decisão 36), a lista é uma só, plana (como nas
 * telas SitiosMapa e PC-SitiosMapa).
 */
function gruposDa(entradas: Entradas, comRegiao: boolean, tabela: Parameters<typeof fold>[1], plana = false): (Grupo<SitioDaLista> & { regiao: boolean; plana?: boolean })[] {
  if (plana) return [{ chave: 'Sítios', entradas, regiao: false, plana: true }]
  if (!comRegiao) return agrupar(entradas, (e) => inicialDe(e.ordem)).map((g) => ({ ...g, regiao: false }))
  const porRegiao = new Map<string, Entradas>()
  for (const e of entradas) {
    const nome = e.item.regiao?.nome ?? SEM_REGIAO
    porRegiao.set(nome, [...(porRegiao.get(nome) ?? []), e])
  }
  return [...porRegiao]
    .sort(([a], [b]) => (a === SEM_REGIAO ? 1 : b === SEM_REGIAO ? -1 : fold(a, tabela) < fold(b, tabela) ? -1 : 1))
    .map(([chave, es]) => ({ chave, entradas: es, regiao: true }))
}

interface PropsDaLinha {
  s: SitioDaLista
  atual: boolean
  /** A linha está acesa: o mouse está nela ou no ponto dela no mapa. */
  aceso: boolean
  /** O ponto dela está selecionado no mapa (o cartão está aberto). */
  selecionado: boolean
  aoDestacar: (id: string | null) => void
  aoMostrar: (id: string) => void
  /** O computador usa a mira (PC-SitiosMapa); o celular, o alfinete (SitiosMapa). */
  computador: boolean
}

/**
 * Uma linha da lista: o nome, a coordenada em graus e quantos objetos há lá, e «Mostrar no mapa» (PC-SitiosMapa.dc.html,
 * SitiosMapa.dc.html): leva ao ponto do sítio no mapa interno. Passar o mouse acende o ponto (e o ponto acende a linha).
 */
const LinhaDoSitio = memo(function LinhaDoSitio({ s, atual, aceso, selecionado, aoDestacar, aoMostrar, computador }: PropsDaLinha) {
  const comCoordenada = s.lat !== null && s.lon !== null
  return (
    <div
      className={`sitio-linha${aceso ? ' sitio-linha-acesa' : ''}${selecionado ? ' sitio-linha-selecionada' : ''}`}
      data-sitio={s.id}
      onPointerEnter={(e) => e.pointerType === 'mouse' && aoDestacar(s.id)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && aoDestacar(null)}
      onFocus={() => aoDestacar(s.id)}
      onBlur={() => aoDestacar(null)}
    >
      <Link className="lista-linha" to={`/sitio/${encodeURIComponent(s.id)}`} aria-current={atual ? 'page' : undefined} data-atual={atual ? '' : undefined}>
        <span className="lista-textos">
          <span className="lista-nome sitio-skc">
            {s.nome}
            {s.doUsuario && <span className="marca-skc sitio-marca">SKC</span>}
          </span>
          <span className="sitio-coord">
            {[comCoordenada ? (s.coordenadaDoUsuario ? coordenadaAte5(s.lat!, s.lon!) : coordenadaEmGraus(s.lat!, s.lon!, 3)) : 'sem coordenada', regiaoDaLinha(s.regiaoGeo)].filter(Boolean).join(' · ')}
          </span>
        </span>
      </Link>
      <Contagem n={s.objetos} um="objeto" varios="objetos" />
      {comCoordenada ? (
        <button type="button" className="icon-button sitio-mapa sitio-mostrar" aria-label={`Mostrar ${s.nome} no mapa`} data-tip="Mostrar no mapa" onClick={() => aoMostrar(s.id)}>
          <Icon name={computador ? 'mira' : 'alfinete'} />
        </button>
      ) : (
        <span className="sitio-mapa" aria-hidden="true" />
      )}
    </div>
  )
})

/**
 * Os Sítios (Sitios.dc.html no celular, PC-Sitio.dc.html no computador), só leitura. Também é a tela de
 * /sitio/:id: no computador a lista à esquerda e o sítio à direita, sem remontar a lista; no celular o sítio
 * ocupa a tela. Tarefa 12: junta os sítios novos do usuário (marca SKC) e mostra o nome de agora dos do livro; a busca da
 * lista acha o nome de agora e o do livro; "Novo sítio" leva ao formulário.
 *
 * Tarefa 19 (decisão 36): as regiões geográficas viram etiquetas que se combinam e filtram a lista e o mapa
 * (`?regioes=levante-sul,egito` no endereço, como o texto do filtro). No computador, sem sítio aberto, o mapa ocupa o lado
 * direito (PC-SitiosMapa.dc.html); no celular, «Lista | Mapa» (`?vista=mapa`). `?foco=<sítio>` (de «Abrir no mapa») abre o mapa
 * centrado no sítio. O mapa e o JSON dele são um pacote à parte, baixado só quando o mapa aparece.
 */
export function Sitios() {
  const { id } = useParams()
  const computador = useBreakpoint() === 'computador'
  const navegar = useNavigate()
  const { key: chaveDoEndereco } = useLocation()
  const tipoDeNavegacao = useNavigationType()
  const { valores, transitorios, definir } = useParametrosNaUrl(['filtro', 'regioes', 'vista'] as const, ['foco'] as const)
  const texto = valores.filtro
  const setTexto = (t: string) => definir({ filtro: t })
  const consulta = useDeferredValue(texto)
  const regioesAtivas = useMemo(() => new Set(valores.regioes.split(',').filter((r) => IDS_DE_REGIAO.has(r))), [valores.regioes])
  const focoDaUrl = transitorios.foco
  const vista: 'lista' | 'mapa' = valores.vista === 'mapa' || focoDaUrl ? 'mapa' : 'lista'
  const carga = useCarregar(carregar)
  const correcoes = useCorrecoesDosSitios()
  const novos = useSitiosSkc()
  const todosSkc = useTodosOsSitiosSkc()
  const contagem = useObjetosPorSitio()
  const daLista = useResolucaoDaLista()
  const trocas = useTrocasDeSitio()
  const distintos = useObjetosDoPacoteSemRepetir(daLista?.resolucao ?? null, trocas)
  const rolagem = useRef<HTMLDivElement>(null)
  const { state } = useLocation() as { state: { sitioExcluido?: { id: string; nome: string } } | null }
  const [restaurando, setRestaurando] = useState<{ id: string; nome: string } | null>(state?.sitioExcluido ?? null)
  const [falhou, setFalhou] = useState(false)
  const restaurarRef = useRef<HTMLButtonElement>(null)
  // O mapa: o ponto selecionado (o cartão aberto), os sítios acesos pelo mouse e o último pedido de «Mostrar no mapa».
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [destaque, setDestaque] = useState<ReadonlySet<string>>(SEM_DESTAQUE)
  const [foco, setFoco] = useState<{ chave: string; n: number } | null>(null)
  // O aviso de "excluído" chega no estado da navegação, também quando a lista já estava montada (o computador).
  useEffect(() => {
    if (state?.sitioExcluido) setRestaurando(state.sitioExcluido)
  }, [state])
  // O foco vai a "Restaurar o sítio" quando o aviso chega (como no glossário), para quem usa o teclado.
  useEffect(() => {
    if (restaurando) restaurarRef.current?.focus()
  }, [restaurando])
  // No celular as regiões abrem e fecham; a primeira vem aberta, e quem busca vê tudo aberto.
  const [abertas, setAbertas] = useState<Record<string, boolean>>({})

  const dados = useMemo(() => {
    if (carga.fase !== 'ok') return null
    const { itens, busca } = juntar(carga.dados.lista, correcoes, novos, contagem, daLista, todosSkc, distintos)
    const entradas = indexar(itens, carga.dados.tabela, (s) => s.nome, (s) => busca.get(s.id) ?? s.nome)
    const porRegiao = new Map<string, number>()
    for (const s of itens) porRegiao.set(s.regiaoGeo, (porRegiao.get(s.regiaoGeo) ?? 0) + 1)
    return { itens, entradas, tabela: carga.dados.tabela, porRegiao, // As regiões agrupam a lista só quando o PACOTE as tem (R18); o texto de região do usuário não muda o modo da lista.
      comRegiao: carga.dados.lista.some((s) => s.regiao !== null), comCoordenada: itens.filter((s) => s.lat !== null && s.lon !== null).length }
  }, [carga, correcoes, novos, contagem, daLista, todosSkc, distintos])
  const visiveis = useMemo(() => {
    const porTexto = dados ? filtrar(dados.entradas, consulta, dados.tabela) : []
    return regioesAtivas.size === 0 ? porTexto : porTexto.filter((e) => regioesAtivas.has(e.item.regiaoGeo))
  }, [dados, consulta, regioesAtivas])
  const grupos = useMemo(() => (dados ? gruposDa(visiveis, dados.comRegiao, dados.tabela, regioesAtivas.size > 0) : []), [dados, visiveis, regioesAtivas])
  // A região que vem aberta é a primeira da lista inteira (pelo nome), não a primeira que sobrou numa busca.
  const primeiraRegiao = useMemo(() => (dados ? gruposDa(dados.entradas, dados.comRegiao, dados.tabela)[0]?.chave : undefined), [dados])
  const escolhido = useMemo(() => (id ? dados?.entradas.find((e) => e.item.id === id)?.item.nome : undefined), [dados, id])

  // Os pontos do mapa: os sítios que a lista mostra e têm coordenada, os de mesma coordenada fundidos num ponto só.
  const pontos = useMemo(
    () =>
      agruparPontos(
        visiveis
          .filter((e) => e.item.lat !== null && e.item.lon !== null)
          .map((e): SitioNoMapa => ({ id: e.item.id, nome: e.item.nome, lat: e.item.lat!, lon: e.item.lon!, objetos: e.item.objetos, regiao: e.item.regiaoGeo, doUsuario: e.item.doUsuario })),
      ),
    [visiveis],
  )
  // O mapa se reenquadra quando o conjunto de pontos muda de propósito: a etiqueta de região na hora; a busca só depois de uma pausa,
  // para o mapa não correr a cada letra digitada (T17-C-25). Os pontos, esses, acompanham cada letra.
  const consultaDoMapa = useAposPausa(consulta.trim(), PAUSA_DA_BUSCA_NO_MAPA_MS)
  const assinatura = useMemo(() => `${[...regioesAtivas].sort().join(',')}|${consultaDoMapa}`, [regioesAtivas, consultaDoMapa])
  const selecionados = useMemo(() => new Set(pontos.find((p) => p.chave === selecionada)?.sitios.map((s) => s.id)), [pontos, selecionada])
  useEffect(() => {
    if (selecionada !== null && !pontos.some((p) => p.chave === selecionada)) setSelecionada(null)
  }, [pontos, selecionada])

  useEffect(() => {
    if (computador && id) rolagem.current?.querySelector('[data-atual]')?.scrollIntoView?.({ block: 'nearest' })
  }, [computador, id, dados])

  /** Põe o ponto de um sítio no foco do mapa e abre o cartão dele. */
  const mostrarNoMapa = (sitioId: string, doEndereco = false) => {
    const item = dados?.itens.find((i) => i.id === sitioId)
    if (!item || item.lat === null || item.lon === null) return
    // Com o sítio aberto à direita (computador), o mapa volta ao lugar do sítio: é a rota da lista.
    if (id && !doEndereco) {
      navegar(`/sitios?foco=${encodeURIComponent(sitioId)}`)
      return
    }
    const chave = chaveDaCoordenada(item.lat, item.lon)
    // Um filtro que esconde o sítio é desfeito: «Abrir no mapa» sempre mostra o sítio.
    if (!visiveis.some((e) => e.item.id === sitioId)) definir({ filtro: '', regioes: '' })
    setSelecionada(chave)
    setFoco((f) => ({ chave, n: (f?.n ?? 0) + 1 }))
    if (!computador && !doEndereco) definir({ vista: 'mapa' })
  }
  const mostrarRef = useRef(mostrarNoMapa)
  mostrarRef.current = mostrarNoMapa
  const aoMostrar = useCallback((sitioId: string) => mostrarRef.current(sitioId), [])
  const aoDestacarLinha = useCallback((sitioId: string | null) => setDestaque((atual) => (sitioId === null ? (atual.size === 0 ? atual : SEM_DESTAQUE) : atual.size === 1 && atual.has(sitioId) ? atual : new Set([sitioId]))), [])
  // «Abrir no mapa» (a página do sítio) chega com ?foco=<sítio>: abre o mapa centrado nele, uma vez por chegada. Só uma chegada
  // (PUSH ou POP) conta: as trocas do próprio endereço (REPLACE: o filtro, a vista) não centram de novo nem desfazem o filtro.
  const pendente = useRef<string | null>(null)
  useEffect(() => {
    if (focoDaUrl && tipoDeNavegacao !== 'REPLACE') pendente.current = focoDaUrl
  }, [chaveDoEndereco])
  useEffect(() => {
    // Espera a resolução dos sítios: o foco num sítio mesclado vai ao destino (Parte 2C, bloco 2).
    if (!pendente.current || !dados || !daLista) return
    const alvo = pendente.current
    pendente.current = null
    mostrarRef.current(daLista.destinos.get(alvo) ?? alvo, true)
  }, [chaveDoEndereco, focoDaUrl, dados, daLista])

  if (!computador && id) return <Sitio id={id} pagina voltarPara="/sitios" computador={false} />

  const total = dados?.entradas.length ?? 0
  const apoio = !dados
    ? ' '
    : consulta.trim()
      ? `${numeroPtBr(visiveis.length)} de ${numeroPtBr(total)} ${total === 1 ? 'sítio' : 'sítios'}`
      : `${numeroPtBr(total)} ${total === 1 ? 'sítio' : 'sítios'} · ${numeroPtBr(dados.comCoordenada)} com coordenada${dados.comRegiao ? ' · por região' : ''}`
  const buscando = consulta.trim() !== ''
  const mostraMapa = !id && (computador || vista === 'mapa')
  const alternarRegiao = (regiaoId: string) => {
    const novo = new Set(regioesAtivas)
    if (!novo.delete(regiaoId)) novo.add(regiaoId)
    definir({ regioes: [...novo].join(',') })
  }
  const limparFiltro = () => definir({ regioes: '', filtro: '' })

  const filtroDeRegioes = (
    <FiltroDeRegioes contagens={dados?.porRegiao ?? new Map()} total={total} ativas={regioesAtivas} aoAlternar={alternarRegiao} aoLimpar={() => definir({ regioes: '' })} />
  )
  const mapa = (
    <Suspense
      fallback={
        <p className="mapa-carregando" role="status">
          Carregando o mapa…
        </p>
      }
    >
      <Mapa
        pontos={pontos}
        selecionada={selecionada}
        aoSelecionar={setSelecionada}
        destaque={destaque}
        aoDestacar={(ids) => setDestaque(ids ?? SEM_DESTAQUE)}
        foco={foco}
        regioesAtivas={regioesAtivas}
        aoAlternarRegiao={alternarRegiao}
        computador={computador}
        assinatura={assinatura}
      />
    </Suspense>
  )
  const modoDoCelular = !computador && vista === 'mapa'

  const novoSitio = (
    <Link className="sitio-novo" to="/sitios/novo">
      <Icon name="adicionar" size={18} />
      Novo sítio
    </Link>
  )
  const lista = (
    <>
      <div className="lista-cabeca">
        {/* Computador: «Novo sítio» à direita do título (PC-SitiosMapa, E-5). Celular: abaixo da contagem (no modo mapa, o «+» do topo). */}
        {computador ? (
          <div className="sitios-titulo-linha">
            <h1>Sítios</h1>
            {novoSitio}
          </div>
        ) : (
          <h1>Sítios</h1>
        )}
        {!modoDoCelular && <span className="lista-apoio">{apoio}</span>}
      </div>
      {!computador && !modoDoCelular && novoSitio}
      {!computador && (
        <div className="sitios-vista" role="group" aria-label="Modo de exibição">
          <button type="button" aria-pressed={vista === 'lista'} onClick={() => definir({ vista: 'lista', foco: null })}>
            Lista
          </button>
          <button type="button" aria-pressed={vista === 'mapa'} onClick={() => definir({ vista: 'mapa' })}>
            Mapa
          </button>
        </div>
      )}
      {(!modoDoCelular || texto !== '') && (
        <div className="lista-ferramentas">
          <CampoDeFiltro rotulo="Buscar sítio" placeholder="nome antigo ou moderno…" valor={texto} aoMudar={setTexto} />
        </div>
      )}
      {filtroDeRegioes}
      {restaurando && (
        <p className="sitio-restaurar" role="status" aria-label="Sítio excluído">
          Sítio «{restaurando.nome}» excluído.{' '}
          <button
            ref={restaurarRef}
            type="button"
            className="sitio-link-botao"
            onClick={() => {
              setFalhou(false)
              restaurarSitio(restaurando.id).then(
                () => setRestaurando(null),
                () => setFalhou(true),
              )
            }}
          >
            Restaurar o sítio
          </button>
        </p>
      )}
      {falhou && (
        <p className="form-erro" role="alert">
          Não foi possível restaurar; tente de novo.
        </p>
      )}
      {carga.fase === 'erro' && <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />}
      {!modoDoCelular && regioesAtivas.size > 0 && dados && (
        <div className="sitios-contagem">
          <span role="status">
            {numeroPtBr(visiveis.length)} {visiveis.length === 1 ? 'sítio' : 'sítios'}
            {/* Celular: a região na faixa («8 SÍTIOS · LEVANTE NORTE», SitiosMapa); o computador só conta (PC-SitiosMapa). */}
            {!computador && ` · ${nomesDasRegioesAtivas(regioesAtivas)}`}
          </span>
          <button type="button" className="hit" onClick={limparFiltro}>
            Limpar filtro
          </button>
        </div>
      )}
      {!modoDoCelular && dados && visiveis.length === 0 && <p className="lista-vazia">Nenhum sítio encontrado.</p>}
      {!modoDoCelular && dados && visiveis.length > 0 && (
        <div className="lista-letras">
          {grupos.map((g, i) => {
            const linhas = g.entradas.map((e) => (
              <LinhaDoSitio key={e.item.id} s={e.item} atual={e.item.id === id} aceso={destaque.has(e.item.id)} selecionado={selecionados.has(e.item.id)} aoDestacar={aoDestacarLinha} aoMostrar={aoMostrar} computador={computador} />
            ))
            if (g.plana) {
              return (
                <section key={g.chave} aria-label="Sítios das regiões escolhidas">
                  {linhas}
                </section>
              )
            }
            if (g.regiao && !computador) {
              const aberta = buscando || (abertas[g.chave] ?? g.chave === primeiraRegiao)
              return (
                <section key={g.chave}>
                  <h2 className="sitio-regiao-titulo">
                    <button type="button" className="sitio-regiao" aria-expanded={aberta} onClick={() => setAbertas((a) => ({ ...a, [g.chave]: !aberta }))}>
                      <span>
                        <strong>{g.chave}</strong>
                        <small>
                          {numeroPtBr(g.entradas.length)} {g.entradas.length === 1 ? 'sítio' : 'sítios'}
                        </small>
                      </span>
                      <Icon name={aberta ? 'recolher' : 'adicionar'} />
                    </button>
                  </h2>
                  {aberta && linhas}
                </section>
              )
            }
            return (
              <section key={g.chave} aria-label={g.regiao ? `Sítios de ${g.chave}` : `Sítios com ${g.chave}`}>
                <div className="lista-letra">
                  <h2>{g.chave}</h2>
                  <span>{g.regiao ? `${numeroPtBr(g.entradas.length)} ${g.entradas.length === 1 ? 'sítio' : 'sítios'}` : i === 0 ? 'objetos' : ''}</span>
                </div>
                {linhas}
              </section>
            )
          })}
        </div>
      )}
    </>
  )

  if (computador) {
    return (
      <ListaEDetalhe
        rotulo="Lista de sítios"
        chave={id}
        anuncio={escolhido}
        modo={id ? undefined : 'mapa'}
        listaLarga
        lista={<div ref={rolagem}>{lista}</div>}
        detalhe={id ? <Sitio id={id} pagina={false} voltarPara="/sitios" computador /> : mapa}
      />
    )
  }
  return (
    <div className={`lista-pagina${modoDoCelular ? ' lista-pagina-mapa' : ''}`}>
      {/* Modo mapa: o «Novo sítio» vira o «+» do topo, antes da lupa (SitiosMapa.dc.html, decisão 53); na lista fica o botão. */}
      <TopoDoCelular
        voltar={{ href: '#/' }}
        busca={!modoDoCelular}
        acoes={
          modoDoCelular ? (
            <>
              <IconButton icon="adicionar" label="Novo sítio" href="#/sitios/novo" />
              <IconButton icon="buscar" label="Buscar" shortcut="/" href="#/busca" />
            </>
          ) : undefined
        }
      />
      <main className="lista-corpo">
        {lista}
        {mostraMapa && <div className="sitios-mapa-celular">{mapa}</div>}
      </main>
    </div>
  )
}
