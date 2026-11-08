import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { objetosDosSitios, resumosDosObjetos, sitio } from '../banco/consultas'
import type { ObjetoResumo, Sitio as SitioDoLivro } from '../banco/tipos'
import { caminhoDaBusca } from '../busca/url'
import { useObjetosSkc } from '../colecoes/objetosSkc'
import { AvisoDeSitioParecido } from '../sitios/AvisoDeSitioParecido'
import { CampoDeTextoDoSitio, CampoNomeDoSitio, CoordenadaDoSitio, GrafiasDoSitio, mesmaCoordenada } from '../sitios/CorrigirSitio'
import { sitiosComEsteNome, useDadosDoSitio, useSitiosParaComparar, useTrocasDeSitio } from '../sitios/doUsuario'
import { GrafiasAgrupadas, nomeImpressoNasGrafias } from '../sitios/Grafias'
import { eSitioSkc } from '../sitios/modelo'
import { AvisosDeConflito, esquecerMesclaAnunciada, Mesclar, MescladoAqui, mesclaAnunciada, useSobreOsSitios } from '../sitios/Mesclar'
import { dadosDoDestino } from '../sitios/contagem'
import { usePacoteDeSitios, useResolucaoDeSitios } from '../sitios/useResolucao'
import { excluirSitio, marcarComoParte, restaurarSitio, soltarParte } from '../sitios/operacoes'
import { arvoreDasPartes, CaminhoDoSitio, MarcarComoParte, SecaoDePartes } from '../sitios/Partes'
import { grupoDeCadaSitio, gruposDaArvore, objetosDaArvore, type ObjetoLigado } from '../sitios/objetosDaArvore'
import { campoEscrito, grafiasDoSitio, grafiasProprias, PACOTE_VAZIO, type GrafiaVista } from '../sitios/resolucao'
import { useRascunhoDaCoordenada } from '../sitios/rascunho'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { useCarregar } from '../ui/useCarregar'
import { AvisoDeCopia, useCopiar } from '../ui/useCopiar'
import { numeroPtBr } from '../ui/numero'
import { NotasDoAlvo } from '../notas/NotasDoAlvo'
import { origensDe, useRedirecionamentos } from '../pacote/redirecionamentos'
import { estadoAtual } from '../usuario/estado'
import { coordenadaAte5, coordenadaEmGraus, enderecoDoMapa } from './coordenada'
import { CabecalhoDoDetalhe, ErroNoDetalhe, Linha, MolduraDoDetalhe, NaoEncontrado, SecaoDeObjetos } from './detalhe'
import { VeioDeVoce } from './VeioDeVoce'
import '../imagens-usuario/MarcaSkc.css'
import '../sitios/Sitios.css'
import './Lista.css'

const METODO = { grid: 'Calculada da grade impressa', gazetteer: 'Gazetteer' } as const
/** `/sitio/<a>?mesclar=<b>` (o «Mesclar…» da Revisão, Tarefa 15): a página abre já em «Qual fica?» com o par preenchido. */
export const PARAMETRO_MESCLAR = 'mesclar'
const ehLink = (texto: string) => /^https?:\/\/\S+$/.test(texto)

interface Props {
  id: string
  /** Celular: a página inteira do sítio. Computador: o painel à direita da lista. */
  pagina: boolean
  voltarPara: string
  computador: boolean
}

/** Um objeto da grade do sítio; `parte`: a parte (um destino abaixo do sítio) de onde ele vem, ou ausente (o próprio sítio). */
export type ObjetoDoSitio = ObjetoResumo & { parte?: string }

/**
 * Os objetos do sítio: os do livro que o achado dele cita (só um sítio do livro), os objetos SKC cuja ficha o escolheu e os do
 * livro que a pessoa ligou a ele (`item-sitio`). Um número aparece uma vez. A busca e as listas são aditivas: o livro ainda
 * diz que o objeto foi achado lá, mesmo que a pessoa o tenha ligado a outro sítio. Num sítio do livro que é o destino de um
 * sítio do usuário publicado (Tarefa 16, revisão 1), também os ligados ao `SI-…` de antes.
 *
 * Parte 2C, bloco 2: também os dos sítios mesclados nele (`absorvidos` da resolução; F13) e os das partes abaixo dele, em todos
 * os níveis, com os mesclados nelas (Tarefa 12): os do livro que o achado deles cita (`objetosDosSitios`), os SKC e os ligados a
 * eles. Cada objeto fica no grupo mais fundo em que aparece (`objetosDaArvore`): o que a pessoa ligou a uma parte conta nela,
 * como na página da parte, na lista e no mapa. Os de uma parte levam `parte`.
 */
export function useObjetosDoSitio(id: string, doLivro: readonly ObjetoResumo[]): ObjetoDoSitio[] {
  const skc = useObjetosSkc()
  const trocas = useTrocasDeSitio()
  const redirecionamentos = useRedirecionamentos()
  const resolucao = useResolucaoDeSitios()
  // Uma chave em texto, para não refazer as leituras a cada resolução nova que dá a mesma árvore.
  const chaveDosGrupos = useMemo(() => gruposDaArvore(resolucao, id).map((g) => g.join(',')).join(';'), [resolucao, id])
  const grupos = useMemo(() => chaveDosGrupos.split(';').map((g) => g.split(',')), [chaveDosGrupos])
  const grupoDe = useMemo(() => grupoDeCadaSitio(grupos, (x) => (eSitioSkc(x) ? [] : origensDe(redirecionamentos, x))), [grupos, redirecionamentos])
  const outrosDoLivro = useMemo(() => grupos.flat().filter((x) => x !== id && !eSitioSkc(x)), [grupos, id])
  const dosOutros = useCarregar(
    () =>
      outrosDoLivro.length === 0
        ? Promise.resolve([])
        : objetosDosSitios(outrosDoLivro).then((m) => outrosDoLivro.flatMap((x) => (m.get(x) ?? []).map((o) => ({ o, sitio: x, daPessoa: false })))),
    `${id}|${outrosDoLivro.join(',')}`,
    { manter: true },
  )
  const doLivroNaArvore = useMemo(
    () => [...doLivro.map((o) => ({ o, sitio: id, daPessoa: false })), ...(dosOutros.fase === 'ok' ? dosOutros.dados : [])],
    [doLivro, dosOutros, id],
  )
  // As trocas para um sítio da árvore; as dos objetos que já vieram do livro não precisam ser lidas de novo.
  const trocasNaArvore = useMemo(() => [...trocas].filter(([, t]) => t.sitio !== null && grupoDe.has(t.sitio)), [trocas, grupoDe])
  const ligados = useMemo(
    () => trocasNaArvore.map(([numero]) => numero).filter((numero) => !doLivroNaArvore.some((x) => x.o.numero === numero)),
    [trocasNaArvore, doLivroNaArvore],
  )
  const carga = useCarregar(() => resumosDosObjetos(ligados), `${id}|${ligados.join(',')}`, { manter: true })
  return useMemo(() => {
    const conhecidos = new Map<string, ObjetoResumo>([
      ...(carga.fase === 'ok' ? carga.dados.map((o) => [o.numero, o] as const) : []),
      ...doLivroNaArvore.map(({ o }) => [o.numero, o] as const),
    ])
    const entradas: ObjetoLigado<ObjetoResumo>[] = [
      ...doLivroNaArvore,
      ...trocasNaArvore.flatMap(([numero, t]) => {
        const o = conhecidos.get(numero)
        return o ? [{ o, sitio: t.sitio!, daPessoa: true }] : []
      }),
      ...skc.flatMap((o) => (o.sitioId ? [{ o, sitio: o.sitioId, daPessoa: true }] : [])),
    ]
    return objetosDaArvore(resolucao, grupos, grupoDe, entradas)
  }, [doLivroNaArvore, carga, trocasNaArvore, skc, resolucao, grupos, grupoDe])
}

/**
 * O Sítio (Sitio.dc.html no celular, o painel de PC-Sitio.dc.html no computador): o nome, a região, a coordenada com a fonte,
 * "abrir no mapa" (link externo ao OpenStreetMap, sem mapa dentro do app) e os objetos achados lá.
 *
 * Tarefa 12: "Corrigir" abre os campos no lugar. A correção de um sítio do livro fica na camada do usuário (SKC) e o valor do
 * livro continua à vista ("no livro: …"); um sítio novo (`SI-…`) tem a mesma página, sem dados do livro, e se exclui (reversível).
 */
export function Sitio(props: Props) {
  // Um sítio do usuário que o pacote publicou com um id do livro (Tarefa 16) leva ao sítio do livro; um sítio mesclado em
  // outro (Parte 2C, bloco 2), ao destino, com `state.mescladoDe` (o id que foi mesclado: o do livro, num `SI-…` publicado).
  const redirecionamentos = useRedirecionamentos()
  const resolucao = useResolucaoDeSitios()
  const { search } = useLocation()
  if (resolucao === null || (eSitioSkc(props.id) && redirecionamentos === null)) return <div className={props.pagina ? 'detalhe-pagina' : 'detalhe'} aria-busy="true" />
  const publicado = eSitioSkc(props.id) ? redirecionamentos?.get(props.id) : undefined
  const canonico = publicado ?? props.id
  const destino = resolucao.destino(canonico)
  if (destino !== props.id) {
    // Quem acabou de mesclar este sítio no outro (ficando com o outro) chega sem «Você abriu…»: com «A e B agora são um só.».
    const acabou = destino !== canonico ? mesclaAnunciada(props.id, canonico) : null
    const estado = acabou ? { juntos: { fica: acabou.nomeFica, entra: acabou.nomeEntra } } : destino !== canonico ? { mescladoDe: canonico } : undefined
    // `?mesclar=` (a Revisão) é um pedido para a página que o tinha: não segue para o destino (a mescla acabou de juntá-los).
    const resto = new URLSearchParams(search)
    resto.delete(PARAMETRO_MESCLAR)
    const busca = resto.size > 0 ? `?${resto}` : ''
    return <Navigate replace to={`/sitio/${encodeURIComponent(destino)}${busca}`} state={estado} />
  }
  return <SitioDaPagina {...props} />
}

function SitioDaPagina({ id, pagina, voltarPara, computador }: Props) {
  const ehNovo = eSitioSkc(id)
  const carga = useCarregar(() => (ehNovo ? Promise.resolve(null) : sitio(id)), id, { manter: !pagina })
  const voltar = { href: `#${voltarPara}`, rotulo: 'Voltar aos sítios' }

  if (!ehNovo && carga.fase === 'carregando') return <div className={pagina ? 'detalhe-pagina' : 'detalhe'} aria-busy="true" />
  if (!ehNovo && carga.fase === 'erro') return <ErroNoDetalhe pagina={pagina} voltar={voltar} erro={carga.erro} aoTentar={carga.tentarDeNovo} />
  const livro = carga.fase === 'ok' ? carga.dados : null
  return <Pagina key={id} id={id} livro={livro} ehNovo={ehNovo} pagina={pagina} voltar={voltar} voltarPara={voltarPara} computador={computador} />
}

interface PaginaProps {
  id: string
  livro: SitioDoLivro | null
  ehNovo: boolean
  pagina: boolean
  voltar: { href: string; rotulo: string }
  voltarPara: string
  computador: boolean
}

function Pagina({ id, livro, ehNovo, pagina, voltar, voltarPara, computador }: PaginaProps) {
  const registro = useDadosDoSitio(id)
  const rascunhoGuardado = useRascunhoDaCoordenada(id) // refeito quando o rascunho muda (gravar, descartar, outra aba)
  const objetos = useObjetosDoSitio(id, livro?.objetos ?? [])
  const todos = useSitiosParaComparar()
  const sobre = useSobreOsSitios()
  const pacoteDeSitios = usePacoteDeSitios()
  const navegar = useNavigate()
  const local = useLocation()
  const blocoRef = useRef<HTMLElement>(null)
  const { aviso, copiar } = useCopiar(blocoRef)
  const [corrigindo, setCorrigindo] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [falhou, setFalhou] = useState(false)
  // Parte 2C, bloco 2: a caixa «Mesclar com outro sítio…», a mensagem depois de «desfazer» e o aviso do endereço antigo (só na
  // chegada: o `state` da navegação que trouxe de um sítio mesclado aqui; abrir «Corrigir» ou «Mesclar» o tira).
  const [mesclandoAqui, setMesclandoAqui] = useState(false)
  // Tarefa 15: `?mesclar=<outro>` abre a caixa já em «Qual fica?»; fechar a caixa tira o parâmetro (sem nova entrada no histórico).
  const [params, setParams] = useSearchParams()
  const pedidoDeMescla = params.get(PARAMETRO_MESCLAR)
  const mesclando = mesclandoAqui || pedidoDeMescla !== null
  const setMesclando = (abrir: boolean) => {
    setMesclandoAqui(abrir)
    if (!abrir && pedidoDeMescla !== null)
      setParams(
        (atual) => {
          const p = new URLSearchParams(atual)
          p.delete(PARAMETRO_MESCLAR)
          return p
        },
        { replace: true },
      )
  }
  const [voltou, setVoltou] = useState<{ id: string; nome: string } | null>(null)
  // Tarefa 12: a caixa «Marcar como parte de…» e o aviso depois de «Não é parte de outro» (com o `parteDe` de antes, para o
  // «Desfazer» gravar de volta).
  const [marcando, setMarcando] = useState(false)
  const [solta, setSolta] = useState<{ nome: string; todo: string; antes: string } | null>(null)
  const [focarNoSoltar, setFocarNoSoltar] = useState(false)
  const [mescladoDe, setMescladoDe] = useState<string | null>(() => {
    const m = (local.state as { mescladoDe?: unknown } | null)?.mescladoDe
    return typeof m === 'string' ? m : null
  })
  // Chegou aqui logo depois de mesclar a página de antes neste sítio (M1): o aviso curto e o foco no título.
  const [juntos, setJuntos] = useState<{ fica: string; entra: string } | null>(() => {
    const j = (local.state as { juntos?: { fica?: unknown; entra?: unknown } } | null)?.juntos
    return j && typeof j.fica === 'string' && typeof j.entra === 'string' ? { fica: j.fica, entra: j.entra } : null
  })
  const tituloRef = useRef<HTMLHeadingElement>(null)
  // O botão do aviso flutuante (que recebe o foco) é descrito pela mensagem: o leitor de tela diz os dois.
  const mensagemDaSoltaId = useId()
  const mensagemDoVoltouId = useId()
  const focarNoTitulo = () => {
    const h = tituloRef.current
    if (!h) return
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1')
    h.focus()
  }
  useEffect(() => {
    if (!juntos) return
    esquecerMesclaAnunciada()
    focarNoTitulo()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const mesclarRef = useRef<HTMLButtonElement>(null)
  const verRef = useRef<HTMLAnchorElement>(null)
  const mesclarAbriu = useRef(false)
  useEffect(() => {
    if (mesclando) mesclarAbriu.current = true
    else if (mesclarAbriu.current) {
      mesclarAbriu.current = false
      mesclarRef.current?.focus()
    }
  }, [mesclando])
  const marcarRef = useRef<HTMLButtonElement>(null)
  const marcarAbriu = useRef(false)
  useEffect(() => {
    if (marcando) marcarAbriu.current = true
    else if (marcarAbriu.current) {
      marcarAbriu.current = false
      marcarRef.current?.focus()
    }
  }, [marcando])
  // Abrir uma caixa fecha a outra sem levar o foco ao link dela.
  const fecharAsCaixas = () => {
    mesclarAbriu.current = false
    marcarAbriu.current = false
    setMesclando(false)
    setMarcando(false)
  }
  useEffect(() => {
    if (voltou) verRef.current?.focus()
  }, [voltou])
  const desfazerSoltaRef = useRef<HTMLButtonElement>(null)
  const soltarRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (solta) desfazerSoltaRef.current?.focus()
  }, [solta])
  // Desfeito o «Não é parte de outro», o link volta quando a resolução refaz: o foco vai a ele.
  useEffect(() => {
    if (focarNoSoltar && soltarRef.current) {
      soltarRef.current.focus()
      setFocarNoSoltar(false)
    }
  })
  const outraAcao = () => {
    setMescladoDe(null)
    setJuntos(null)
    setVoltou(null)
    setSolta(null)
  }
  const gatilhoRef = useRef<HTMLButtonElement>(null)
  const cancelarRef = useRef<HTMLButtonElement>(null)
  const jaAbriu = useRef(false)
  useEffect(() => {
    if (excluindo) {
      jaAbriu.current = true
      cancelarRef.current?.focus()
    } else if (jaAbriu.current) {
      jaAbriu.current = false
      gatilhoRef.current?.focus()
    }
  }, [excluindo])

  // Um sítio novo que não existe (id inventado, ou um registro que ainda não chegou deste aparelho): não encontrado.
  if (ehNovo && !registro) return <NaoEncontrado pagina={pagina} voltar={voltar} titulo="Sítio não encontrado" destino="/sitios" rotuloDoDestino="Ver os sítios" />
  if (!ehNovo && !livro) return <NaoEncontrado pagina={pagina} voltar={voltar} titulo="Sítio não encontrado" destino="/sitios" rotuloDoDestino="Ver os sítios" />

  const d = registro?.dados ?? null
  const nomeDoLivro = livro?.nome ?? null
  const nomeAgora = d?.nome ?? nomeDoLivro ?? id
  const regiaoDoLivro = livro?.regiao?.nome ?? null
  const coordDoLivro = livro && livro.lat !== null && livro.lon !== null ? { lat: livro.lat, lon: livro.lon } : null
  const coordPropria = d?.coordenada ?? coordDoLivro
  // Parte 2C, bloco 2: o que falta a este sítio vem do sítio mesclado nele de menor id (`dadosDoDestino`), como na lista e no mapa.
  const proprios = { coordenada: coordPropria, regiao: d?.regiao ?? regiaoDoLivro, pais: d?.pais ?? null, nota: d?.nota ?? null }
  const herdados = sobre ? dadosDoDestino(sobre.resolucao, id, (x) => (x === id ? proprios : sobre.dadosDe(x))) : null
  const deOutro = (campo: 'coordenada' | 'regiao' | 'nota'): string | null => {
    const origem = herdados?.origem[campo]
    return origem !== undefined && origem !== id ? origem : null
  }
  const regiaoAgora = herdados?.regiao ?? proprios.regiao
  const coordAgora = herdados?.coordenada ?? coordPropria
  const coordenadaDe = deOutro('coordenada')
  const notaAgora = herdados?.nota ?? proprios.nota
  const notaDe = deOutro('nota')
  const regiaoDe = deOutro('regiao')
  const corrigidaACoordenada = coordenadaDe === null ? d?.coordenada != null : eSitioSkc(coordenadaDe)
  const excluido = registro?.excluido ?? false
  const mapa = coordAgora ? enderecoDoMapa(coordAgora.lat, coordAgora.lon) : null
  const verCoordenada = (c: { lat: number; lon: number }, doUsuario: boolean) => (doUsuario ? coordenadaAte5(c.lat, c.lon) : coordenadaEmGraus(c.lat, c.lon, 5))
  const copia = [nomeAgora, coordAgora ? verCoordenada(coordAgora, corrigidaACoordenada) : null].filter(Boolean).join(' · ')
  const parecidos = !ehNovo ? [] : sitiosComEsteNome(todos, nomeAgora, id)
  // Uma coordenada escrita em «Corrigir» e não gravada (par pela metade ou inválido) não se perde: a página avisa.
  // (Um rascunho igual à coordenada de agora não é «ainda não salva»: T17-B-13.)
  const rascunhoDaCoordenada = !corrigindo && !excluido && rascunhoGuardado && !mesmaCoordenada(rascunhoGuardado, coordPropria) ? rascunhoGuardado : null
  const mescladosAqui = sobre && !excluido ? sobre.resolucao.absorvidos(id) : []
  // Parte 2C, bloco 2 (Tarefa 13): as outras grafias com a origem (as dos livros deste sítio e dos mesclados nele, as suas, os
  // nomes dos mesclados); antes de a resolução chegar, e num sítio excluído, as do registro, sem origem.
  const grafias: GrafiaVista[] =
    sobre && pacoteDeSitios && !excluido
      ? grafiasDoSitio(sobre.resolucao, id, pacoteDeSitios, sobre.nome, sobre.nomeDoLivro)
      : (d?.variantes ?? []).map((texto) => ({ texto, tradicao: null, livros: [], doUsuario: true, grupo: 'sem-origem' }))
  // Com o pacote 8, o nome impresso mostrado entre as grafias do livro (com a página) tira o «como impresso: …» sob o nome.
  const impressoNasGrafias = !!livro && nomeImpressoNasGrafias(grafias, livro.literal)
  const todoDireto = sobre && !excluido ? sobre.resolucao.todo(id) : null
  // Tarefa 12: a grade traz também os objetos das partes; na ordem da seção «Partes» (irmãos em ordem alfabética), depois dos
  // do próprio sítio. Sob o título, «12 objetos, 5 nas partes»; cada parte da seção conta os dela e os das partes de baixo.
  // (contas simples, sem hooks: aqui já passaram os retornos de «não encontrado»)
  const ordemDasPartes = sobre ? arvoreDasPartes(sobre.resolucao, id, sobre.nome).map((x) => x.id) : []
  const posicao = (o: ObjetoDoSitio) => (o.parte === undefined ? -1 : ordemDasPartes.indexOf(o.parte))
  const objetosEmOrdem = [...objetos].sort((a, b) => posicao(a) - posicao(b))
  const nasPartes = objetos.filter((o) => o.parte !== undefined).length
  const objetosEm = (p: string) =>
    sobre ? objetos.filter((o) => o.parte !== undefined && (o.parte === p || sobre.resolucao.caminho(o.parte).includes(p))).length : 0
  const soltar = () => {
    if (!sobre || todoDireto === null) return
    // o que a resolução lê agora (o registro dele, os `SI-…` publicados como ele, senão o pacote): o «Desfazer» grava de volta
    const antes = (pacoteDeSitios ? campoEscrito(estadoAtual(), pacoteDeSitios, id, 'parteDe') : null) ?? todoDireto
    const aviso = { nome: nomeAgora, todo: sobre.nome(todoDireto), antes }
    outraAcao()
    fecharAsCaixas()
    setFalhou(false)
    soltarParte(id).then(
      () => setSolta(aviso),
      () => setFalhou(true),
    )
  }
  const desfazerSolta = () => {
    if (!solta) return
    setFalhou(false)
    marcarComoParte(id, solta.antes).then(
      () => {
        setSolta(null)
        setFocarNoSoltar(true)
      },
      () => setFalhou(true),
    )
  }

  const acoes = (
    <>
      <IconButton icon="buscar" label="Buscar objetos deste sítio" href={`#${caminhoDaBusca(nomeAgora, { escopo: 'local' })}`} />
      <IconButton icon="copiar" label="Copiar referência" onClick={() => void copiar(copia)} />
    </>
  )
  const tentar = (p: Promise<unknown>) => {
    setFalhou(false)
    p.catch(() => setFalhou(true))
  }
  const nObjetos = `${numeroPtBr(objetos.length)} ${objetos.length === 1 ? 'objeto' : 'objetos'}${nasPartes > 0 ? `, ${numeroPtBr(nasPartes)} nas partes` : ''}`

  return (
    <MolduraDoDetalhe pagina={pagina} voltar={voltar} acoes={acoes}>
      <CabecalhoDoDetalhe
        pagina={pagina}
        etiqueta={`${ehNovo ? 'Sítio SKC' : 'Sítio'}${regiaoAgora ? ` · ${regiaoAgora}` : ''}`}
        titulo={nomeAgora}
        codigo={`${id} · ${nObjetos}`}
        acoes={acoes}
        tituloRef={tituloRef}
        antesDoTitulo={sobre && !excluido ? <CaminhoDoSitio id={id} sobre={sobre} /> : null}
      />
      <AvisoDeCopia aviso={aviso} />

      {mescladoDe && sobre && (
        <p className="sitio-caixa-aviso" role="status">
          Você abriu {sobre.nome(mescladoDe)}, que foi mesclado em {nomeAgora}.
        </p>
      )}
      {juntos && (
        <p className="sitio-caixa-aviso" role="status">
          {juntos.fica} e {juntos.entra} agora são um só.
        </p>
      )}
      {sobre && !excluido && <AvisosDeConflito id={id} sobre={sobre} aoEntender={focarNoTitulo} />}

      {excluido && (
        <p className="sitio-aviso-excluido" role="status">
          Este sítio foi excluído; os objetos ligados a ele continuam com o nome e contam como «sítios não resolvidos» na Revisão.{' '}
          <button type="button" className="sitio-link-botao" onClick={() => tentar(restaurarSitio(id))}>
            Restaurar o sítio
          </button>
        </p>
      )}
      {falhou && (
        <p className="form-erro sitio-aviso-excluido" role="alert">
          Não foi possível guardar; tente de novo.
        </p>
      )}

      {rascunhoDaCoordenada && (
        <p className="sitio-aviso-excluido" role="status" aria-label="Coordenada ainda não salva">
          Há uma coordenada ainda não salva neste sítio (a que você escreveu em «Corrigir» e não terminou). Ela fica guardada neste aparelho.{' '}
          <button type="button" className="sitio-link-botao" onClick={() => setCorrigindo(true)}>
            Continuar a coordenada
          </button>
        </p>
      )}

      <div className="sitio-fila">
        {mapa && !excluido && (
          // O mapa do app (Tarefa 19), centrado neste sítio; o OpenStreetMap continua à parte, como link externo.
          <Link className="detalhe-botao" to={`/sitios?foco=${encodeURIComponent(id)}`}>
            Abrir no mapa
            <Icon name="mapa" size={18} />
          </Link>
        )}
        {mapa && (
          <a className="detalhe-botao" href={mapa} target="_blank" rel="noopener noreferrer">
            Abrir no OpenStreetMap
            <Icon name="abrirExterno" size={18} />
          </a>
        )}
        {!excluido && (
          <button
            type="button"
            className="detalhe-botao-botao"
            aria-pressed={corrigindo}
            onClick={() => {
              outraAcao()
              setCorrigindo((c) => !c)
            }}
          >
            <Icon name="editarFicha" size={18} />
            Corrigir
          </button>
        )}
      </div>
      {!excluido && (
        <div className="sitio-links sitio-links-da-pagina">
          <button
            ref={mesclarRef}
            type="button"
            className="sitio-link-botao"
            aria-expanded={mesclando}
            onClick={() => {
              outraAcao()
              const abrir = !mesclando
              fecharAsCaixas()
              setMesclando(abrir)
            }}
          >
            Mesclar com outro sítio…
          </button>
          <button
            ref={marcarRef}
            type="button"
            className="sitio-link-botao"
            aria-expanded={marcando}
            onClick={() => {
              outraAcao()
              const abrir = !marcando
              fecharAsCaixas()
              setMarcando(abrir)
            }}
          >
            Marcar como parte de…
          </button>
          {todoDireto !== null && (
            <button ref={soltarRef} type="button" className="sitio-link-botao" onClick={soltar}>
              Não é parte de outro
            </button>
          )}
        </div>
      )}
      {mesclando && !excluido && (
        <div className="sitio-mesclar-lugar">
          <Mesclar key={pedidoDeMescla ?? ''} id={id} outroInicial={pedidoDeMescla ?? undefined} aoFechar={() => setMesclando(false)} />
        </div>
      )}
      {marcando && !excluido && sobre && (
        <div className="sitio-mesclar-lugar">
          <MarcarComoParte id={id} sobre={sobre} aoFechar={() => setMarcando(false)} />
        </div>
      )}
      {corrigindo && (
        <p className="detalhe-vazio sitio-aviso-excluido">
          {ehNovo ? 'Cada campo se grava sozinho.' : 'Toque num campo para corrigir. A correção fica na sua camada (SKC); o valor do livro continua guardado ao lado.'}
        </p>
      )}

      <section className="detalhe-bloco" aria-label="Dados do sítio" ref={blocoRef}>
        {corrigindo ? (
          <div className="sitio-corrigir">
            <CampoNomeDoSitio id={id} nomeAgora={nomeAgora} nomeDoLivro={nomeDoLivro} corrigido={d?.nome != null} />
            <GrafiasDoSitio
              id={id}
              nomeAgora={nomeAgora}
              grafias={grafias}
              listas={() => [id, ...mescladosAqui].map((x) => ({ id: x, grafias: grafiasProprias(estadoAtual(), pacoteDeSitios ?? PACOTE_VAZIO, x) }))}
            />
            <CampoDeTextoDoSitio id={id} campo="regiao" rotulo="Região ou país" valor={regiaoAgora ?? ''} original={regiaoDoLivro} doLivro={!ehNovo} />
            {livro?.nota && (
              <span className="form-ajuda" lang="de">
                No livro: {livro.nota}
              </span>
            )}
            <CampoDeTextoDoSitio id={id} campo="nota" rotulo="Nota" valor={d?.nota ?? ''} original={null} doLivro={!ehNovo} longo ajuda="De onde vem a coordenada, dúvidas, bibliografia…" />
          </div>
        ) : (
          <dl className="detalhe-dl">
            <Linha rotulo="Nome">
              {ehNovo ? (
                <span className="sitio-nome-skc">
                  {nomeAgora}
                  <span className="marca-skc">SKC</span>
                </span>
              ) : (
                nomeAgora
              )}
              {d?.nome != null && nomeDoLivro !== null && <small className="sitio-no-livro">no livro: {nomeDoLivro}</small>}
              {livro && livro.literal !== (nomeDoLivro ?? '') && !impressoNasGrafias && <small className="lista-sub">{` · como impresso: ${livro.literal}`}</small>}
            </Linha>
            <Linha rotulo="Outras grafias" vazio={grafias.length === 0}>
              <GrafiasAgrupadas grafias={grafias} />
            </Linha>
            <Linha rotulo="Região" vazio={!regiaoAgora}>
              {regiaoAgora}
              {d?.regiao != null && regiaoDoLivro !== null && <small className="sitio-no-livro">no livro: {regiaoDoLivro}</small>}
              {regiaoDe && sobre && <small className="sitio-no-livro">de {sobre.nome(regiaoDe)}, mesclado aqui</small>}
            </Linha>
            <Linha rotulo="Mesclado aqui" vazio={!sobre || mescladosAqui.length === 0}>
              {sobre && (
                <MescladoAqui
                  id={id}
                  sobre={sobre}
                  aoAbrir={outraAcao}
                  aoDesfazer={(entra, nome) => setVoltou({ id: entra, nome })}
                />
              )}
            </Linha>
            <Linha rotulo="No livro" lang="de" vazio={!livro?.nota}>
              {livro?.nota}
            </Linha>
            <Linha rotulo="Nota" vazio={!notaAgora}>
              {notaAgora}
              <span className="marca-skc sitio-marca-nota">SKC</span>
              {notaDe && sobre && <small className="sitio-no-livro">de {sobre.nome(notaDe)}, mesclado aqui</small>}
            </Linha>
          </dl>
        )}
        {!corrigindo && <AvisoDeSitioParecido parecidos={parecidos} quando="existente" />}
      </section>

      {corrigindo ? (
        <section className="detalhe-bloco">
          <CoordenadaDoSitio key={id} id={id} atual={coordPropria} doLivro={coordDoLivro} corrigida={d?.coordenada != null} ehDoLivro={!ehNovo} />
        </section>
      ) : (
        <section className="detalhe-bloco" aria-label="Coordenada">
          {coordAgora ? (
            <dl className="detalhe-dl">
              <Linha rotulo="Coordenada">
                <span className="codigo detalhe-coordenada">{verCoordenada(coordAgora, corrigidaACoordenada)}</span>
                {coordenadaDe === null && corrigidaACoordenada && coordDoLivro && <small className="sitio-no-livro">no livro: {coordenadaEmGraus(coordDoLivro.lat, coordDoLivro.lon, 5)}</small>}
                {coordenadaDe !== null && sobre && <small className="sitio-no-livro">a de {sobre.nome(coordenadaDe)}, mesclado aqui</small>}
              </Linha>
              {coordenadaDe === null && !corrigidaACoordenada && (
                <>
                  <Linha rotulo="Método" vazio={!livro?.metodo}>
                    {livro?.metodo ? METODO[livro.metodo] : null}
                  </Linha>
                  <Linha rotulo="Grade" vazio={!livro?.gradeRef}>
                    <span className="codigo">{livro?.gradeRef}</span>
                  </Linha>
                  <Linha rotulo="Fonte" vazio={!livro?.fonteDaCoordenada}>
                    {livro?.fonteDaCoordenada && ehLink(livro.fonteDaCoordenada) ? (
                      <a href={livro.fonteDaCoordenada} target="_blank" rel="noopener noreferrer">
                        {livro.fonteDaCoordenada}
                      </a>
                    ) : (
                      livro?.fonteDaCoordenada
                    )}
                  </Linha>
                  <Linha rotulo="Nota" vazio={!livro?.notaDaCoordenada}>
                    {livro?.notaDaCoordenada}
                  </Linha>
                </>
              )}
              {coordenadaDe === null && corrigidaACoordenada && <Linha rotulo="Fonte">{ehNovo ? 'informada por você (SKC)' : 'corrigida por você (SKC)'}</Linha>}
            </dl>
          ) : (
            <p className="detalhe-vazio">sem coordenada</p>
          )}
        </section>
      )}

      {sobre && !excluido && <SecaoDePartes id={id} sobre={sobre} objetosEm={objetosEm} />}

      <SecaoDeObjetos
        rotulo="Objetos deste sítio"
        titulo="Objetos"
        objetos={objetosEmOrdem}
        computador={computador}
        em={(o) => (o.parte !== undefined && sobre ? sobre.nome(o.parte) : null)}
      />

      {ehNovo && !excluido && (
        <div className="sitio-excluir">
          {excluindo ? (
            <div role="group" aria-label={`Excluir o sítio «${nomeAgora}»?`} className="sitio-confirmar">
              <p>
                {objetos.length === 0
                  ? 'Nenhum objeto usa este sítio.'
                  : `${objetos.length === 1 ? '1 objeto usa' : `${objetos.length} objetos usam`} este sítio e continua${objetos.length === 1 ? '' : 'm'} com o nome «${nomeAgora}», contando como «sítios não resolvidos» na Revisão.`}{' '}
                Dá para restaurar depois.
              </p>
              <div className="sitio-confirmar-botoes">
                <button ref={cancelarRef} type="button" className="form-botao" onClick={() => setExcluindo(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="form-botao form-botao-forte"
                  onClick={() => {
                    setFalhou(false)
                    jaAbriu.current = false
                    setExcluindo(false)
                    // Excluído, o sítio sai da lista: vai para ela, onde o aviso oferece "Restaurar".
                    excluirSitio(id).then(
                      () => navegar(voltarPara, { state: { sitioExcluido: { id, nome: nomeAgora } } }),
                      () => setFalhou(true),
                    )
                  }}
                >
                  Excluir
                </button>
              </div>
            </div>
          ) : (
            <button ref={gatilhoRef} type="button" className="form-botao" onClick={() => setExcluindo(true)}>
              <Icon name="excluir" size={18} />
              Excluir o sítio
            </button>
          )}
        </div>
      )}

      {!ehNovo && <VeioDeVoce key={id} tipo="sitio" id={id} nomeDoLivro={nomeDoLivro ?? undefined} />}

      <NotasDoAlvo tipo="sitio" ref_={id} variante="secao" outros={sobre ? sobre.resolucao.absorvidos(id) : undefined} />

      <p className="sitio-aviso-flutuante" role="status" aria-live="polite" hidden={!solta}>
        {solta && (
          <>
            <span id={mensagemDaSoltaId}>
              {solta.nome} não é mais parte de {solta.todo}.
            </span>
            <button ref={desfazerSoltaRef} type="button" className="sitio-desfazer-botao" aria-describedby={mensagemDaSoltaId} onClick={desfazerSolta}>
              <Icon name="desfazer" size={16} />
              Desfazer
            </button>
          </>
        )}
      </p>
      <p className="sitio-aviso-flutuante" role="status" aria-live="polite" hidden={!voltou}>
        {voltou && (
          <>
            <span id={mensagemDoVoltouId}>{voltou.nome} voltou a ser um sítio à parte.</span>
            <Link ref={verRef} to={`/sitio/${encodeURIComponent(voltou.id)}`} aria-describedby={mensagemDoVoltouId}>
              Ver
            </Link>
          </>
        )}
      </p>
    </MolduraDoDetalhe>
  )
}
