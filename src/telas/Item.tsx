import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { estadoDoGrupo, type EstadoDeOrigem } from '../app/origem'
import { useAtalhos } from '../app/useAtalhos'
import { elementosDoObjeto, fontesDosObjetos, item, regioes as regioesDaImagem, vizinhos } from '../banco/consultas'
import type { ContextoDeNavegacao, Hipotese, ItemDetalhe, Regiao } from '../banco/tipos'
import { NIVEIS } from '../banco/tipos'
import { comImagemAberta, lerImagemAberta, semImagemAberta, type EstadoDoVisualizador } from '../imagem/estado'
import { ImagemItem } from '../item/ImagemItem'
import { Leitura, type Idioma } from '../item/Leitura'
import { acharLinks } from '../item/links'
import { trechosEmUtf16 } from '../item/offsets'
import { PainelHipotese, type OrdemNoTexto } from '../item/PainelHipotese'
import { LARGURA_DO_PAINEL_LATERAL } from '../item/CascaDoPainel'
import { semPonto, textoDaData } from '../item/ficha'
import { useResumoDasHipoteses } from '../item/resumoDasHipoteses'
import { Bibliografia, Catalogo, contarHipoteses, HipotesesPorNivel, Relacoes, Secao } from '../item/Secoes'
import { BotaoDoTrecho } from '../hipoteses/BotaoDoTrecho'
import { chaveDoTexto } from '../hipoteses/ConteudoSkc'
import { ancorasDasHipoteses, porNivel as agruparPorNivel, useElementosSkc, useHipotesesSkc } from '../hipoteses/doUsuario'
import { eHipoteseSkc, type AncoraDaHipoteseSkc } from '../hipoteses/modelo'
import { NovaHipotese, type ElementoParaEscolher } from '../hipoteses/NovaHipotese'
import { desfazerRegistro, type Reserva } from '../hipoteses/operacoes'
import { guardarRascunhoDaHipotese, type RascunhoDaHipotese } from '../hipoteses/rascunho'
import type { PontoRelativo } from '../imagem/desenhar'
import { useNovaHipotese } from '../hipoteses/useNovaHipotese'
import { textoGuardado } from '../hipoteses/textosNaTela'
import { rotuloDaFonteNaTela } from '../hipoteses/selecao'
import { verbetesDaAncora, type LinkNoTexto } from '../item/trechos'
import { ancorasDe } from '../notas/ancora'
import { FolhaDeColecao } from '../colecoes/FolhaDeColecao'
import { useAdicionarAComparar } from '../comparar/AdicionarAComparar'
import { useSitiosVivos } from '../sitios/doUsuario'
import { TrocarSitio } from '../sitios/TrocarSitio'
import { juntarImagens, useImagensDoUsuario } from '../imagens-usuario/exibicao'
import { excluirImagem, restaurarImagem } from '../imagens-usuario/operacoes'
import { regioesDoUsuario } from '../imagens-usuario/regioes'
import type { ImagemDoUsuario } from '../imagens-usuario/registro'
import { estadoAtual, useEstado, type Estado } from '../usuario/estado'
import { useSincronizacao } from '../usuario/useSincronizacao'
import { plural } from '../usuario/textosDaSync'
import { caminhoDaNotaNova } from '../notas/formato'
import { NotasDoAlvo } from '../notas/NotasDoAlvo'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { Icon, type IconName } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint, useLarguraMinima } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { useTema } from '../ui/useTema'
import { AdicionarImagem, EditarImagem } from './AdicionarImagem'
import { fontesDosLivros, LeiturasDosLivros, ObjetoSKC, useLivrosLigados } from './ObjetoSKC'
import { LeituraSkc } from '../objetos-skc/LeituraSkc'
import { useNumeracao } from '../objetos-skc/atual'
import { useResolucaoDoObjeto } from '../objetos-skc/resolucao'
import { textoDosNumerosNasFontes } from '../objetos-skc/numerosNasFontes'
import '../imagens-usuario/MarcaSkc.css'
import './Item.css'

/** O estado do roteador, se for um dos que o app passa ao item (Busca ou Grupo). */
function lerEstado(state: unknown): EstadoDeOrigem | null {
  const e = state as Partial<EstadoDeOrigem> | null
  if (!e || typeof e !== 'object' || !e.contexto || !e.origem) return null
  // Sem `imagemAberta` (a imagem do visualizador não vai junto para outro item).
  if (e.contexto.tipo === 'grupo' && typeof e.contexto.id === 'string') return semImagemAberta(e) as EstadoDeOrigem
  if (e.contexto.tipo === 'lista' && Array.isArray(e.contexto.ids)) return semImagemAberta(e) as EstadoDeOrigem
  return null
}

/**
 * O Item (Item.dc.html e Hipotese.dc.html no celular; ItemDesktop.dc.html e PC-ItemHipotese.dc.html
 * no computador). `/item/:numero` aceita o número do objeto ou o id de um item; com o id, troca o
 * endereço (replace) pelo do número. O estado do roteador (Busca ou Grupo) dá o contexto de
 * anterior/próximo e o Voltar; sem estado, vale o primeiro grupo do objeto. A hipótese aberta
 * fica no endereço (`?hipotese=<id>`).
 */
export function Item() {
  useTema('item')
  const { numero = '' } = useParams()
  const { search, state } = useLocation()
  const r = useResolucaoDoObjeto(numero, search)
  const lido = state as { ligadoDe?: unknown; numeroAntigo?: unknown } | null
  const de = typeof lido?.ligadoDe === 'string' ? lido.ligadoDe : null
  const numeroAntigo = typeof lido?.numeroAntigo === 'string' ? lido.numeroAntigo : null
  if (r.tipo === 'esperando') return <div className="item" aria-busy="true" />
  if (r.tipo === 'redirecionar') {
    const { ligadoDe: _l, numeroAntigo: _n, ...anterior } = (state && typeof state === 'object' ? state : {}) as Record<string, unknown>
    void _l
    void _n
    return <Navigate to={r.para} replace state={{ ...anterior, [r.motivo === 'ligado' ? 'ligadoDe' : 'numeroAntigo']: r.de }} />
  }
  if (r.tipo === 'skc') return <ObjetoSKC key={r.id} id={r.id} membros={r.membros} ligadoDe={de} numeroAntigo={numeroAntigo} />
  return <ItemDoLivro key={r.numero} numero={r.numero} ligados={r.ligados} ligadoDe={de} />
}

/**
 * O objeto de livro (o pacote) em `/item/:numero`, com as leituras, as notas e as referências dos outros membros do grupo
 * de ligação (objetos SKC e outros livros; Tarefa 9, revisão 4).
 */
function ItemDoLivro({ numero, ligados, ligadoDe }: { numero: string; ligados: readonly string[]; ligadoDe: string | null }) {
  const { search, state } = useLocation()
  const carga = useCarregar(() => item(numero), numero)

  if (carga.fase === 'carregando') return <div className="item" aria-busy="true" />
  if (carga.fase === 'erro') {
    return (
      <div className="item">
        <TopoDoCelular voltar={{ href: '#/colecoes', rotulo: 'Voltar às coleções' }} />
        <div className="item-aviso">
          <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />
        </div>
      </div>
    )
  }
  const d = carga.dados
  if (d === null) {
    return (
      <div className="item">
        <TopoDoCelular voltar={{ href: '#/colecoes', rotulo: 'Voltar às coleções' }} />
        <div className="item-aviso" role="status">
          <p>Objeto não encontrado.</p>
          <p>
            <Link to="/busca">Buscar</Link> · <Link to="/colecoes">Ver as coleções</Link>
          </p>
        </div>
      </div>
    )
  }
  if (d.numero !== numero) {
    // O id de um item deste objeto: troca pelo número. Senão é a carga anterior (o número acabou de mudar).
    if (d.itens.some((i) => i.id === numero)) return <Navigate to={`/item/${encodeURIComponent(d.numero)}${search}`} replace state={state} />
    return <div className="item" aria-busy="true" />
  }
  return <ItemCarregado key={d.numero} d={d} ligados={ligados} ligadoDe={ligadoDe} />
}

interface Posicao {
  rotulo: string
  caminho: string
  tipo: ContextoDeNavegacao['tipo']
  /** A origem é uma coleção SKC (a lista que o item recebeu é a ordem dela). */
  colecao: boolean
  texto: string | null
  anterior: string | null
  proximo: string | null
}

/** R17: a partir desta largura a hipótese abre no painel lateral (terceira coluna); abaixo, na folha de baixo. */
export { LARGURA_DO_PAINEL_LATERAL }

function ItemCarregado({ d, ligados = [], ligadoDe = null }: { d: ItemDetalhe; ligados?: readonly string[]; ligadoDe?: string | null }) {
  const numeracao = useNumeracao()
  const skcLigados = ligados.filter((m) => m.startsWith('OB-'))
  const livrosLigados = useMemo(() => ligados.filter((m) => !m.startsWith('OB-')), [ligados])
  // Os livros ligados (revisão 3 da Tarefa 10, M13): as leituras, e o rótulo e o texto guardado de cada trecho.
  const itensDosLivros = useLivrosLigados(livrosLigados)
  const dosLivros = useMemo(() => fontesDosLivros(itensDosLivros), [itensDosLivros])
  const location = useLocation()
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const computador = useBreakpoint() === 'computador'
  const lateral = useLarguraMinima(LARGURA_DO_PAINEL_LATERAL) && computador
  const [idioma, setIdioma] = useState<Idioma>('pt')
  const [secoes, setSecoes] = useState<Record<string, boolean>>({})
  // Computador: cada pedido (tecla N, ícone) abre o editor de nota nova na voz "SKC notas".
  const [pedidoDeNota, setPedidoDeNota] = useState(0)
  // "Adicionar à coleção" (Tarefa 7): a folha das coleções SKC e quem a abriu (o foco volta a ele).
  const [folhaDeColecao, setFolhaDeColecao] = useState(false)
  const gatilhoDaFolha = useRef<HTMLElement | null>(null)
  const gatilho = useRef<HTMLElement | null>(null)
  const aberta = params.get('hipotese')
  // "Comparar (n/4)" (Tarefa 14): põe o objeto na bandeja de comparação.
  const comparar = useAdicionarAComparar(d.numero, d.numero)

  // Contexto: o do estado (Busca ou Grupo) ou, sem estado, o primeiro grupo do objeto.
  const estado = lerEstado(location.state)
  const primeiro = d.grupos[0] ?? null
  const adiante = estado ?? (primeiro ? estadoDoGrupo(primeiro.id, primeiro.titulo, `/grupo/${encodeURIComponent(primeiro.id)}`) : null)
  const contexto = adiante?.contexto ?? null
  const chaveDoContexto = !contexto ? '' : contexto.tipo === 'grupo' ? `g:${contexto.id}` : `l:${contexto.ids.length}:${contexto.ids[0]}:${contexto.ids.at(-1)}`
  const viz = useCarregar(() => (contexto ? vizinhos(d.numero, contexto) : Promise.resolve(null)), `${d.numero}|${chaveDoContexto}`)
  const v = viz.fase === 'ok' ? viz.dados : null
  const posicao: Posicao | null = adiante && {
    rotulo: adiante.origem.rotulo,
    caminho: adiante.origem.caminho,
    tipo: adiante.contexto.tipo,
    colecao: 'colecao' in adiante.origem && adiante.origem.colecao === true,
    texto: !v ? null : 'inicio' in adiante ? `${adiante.inicio + v.posicao} / ${adiante.total}` : `${v.posicao} / ${v.total}`,
    anterior: v?.anterior ?? null,
    proximo: v?.proximo ?? null,
  }
  const voltar = !adiante
    ? { href: '#/colecoes', rotulo: 'Voltar às coleções' }
    : {
        href: `#${adiante.origem.caminho}`,
        rotulo: posicao?.colecao ? 'Voltar à coleção' : adiante.contexto.tipo === 'lista' ? 'Voltar à busca' : 'Voltar ao grupo',
      }

  // As regiões marcadas de cada imagem (poucas imagens por objeto).
  const cargaDasRegioes = useCarregar(
    async () => Object.fromEntries(await Promise.all(d.imagens.map(async (img) => [img.id, await regioesDaImagem(img.id)] as const))) as Record<string, Regiao[]>,
    d.numero,
  )
  const regioesDoLivro = cargaDasRegioes.fase === 'ok' ? cargaDasRegioes.dados : null

  // As imagens do usuário (decisão 33): depois das do livro. As regiões marcadas pelo usuário valem nas duas.
  const { imagens: doUsuario, principal } = useImagensDoUsuario(d.numero)
  const imagensExibidas = useMemo(() => juntarImagens(d.imagens, doUsuario), [d.imagens, doUsuario])
  const mapaDeRegioes = useEstado(useCallback((e: Estado) => e.registros.get('regiao'), []))
  const regioes = useMemo(() => {
    const r: Record<string, Regiao[]> = { ...(regioesDoLivro ?? {}) }
    if (!mapaDeRegioes?.size) return r
    const estado = estadoAtual()
    for (const img of imagensExibidas) {
      const doUsuarioAqui = regioesDoUsuario(estado, img.id)
      if (doUsuarioAqui.length) r[img.id] = [...(r[img.id] ?? []), ...doUsuarioAqui]
    }
    return r
  }, [regioesDoLivro, mapaDeRegioes, imagensExibidas])
  const [adicionando, setAdicionando] = useState<{ arquivos?: File[] } | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [mostrar, setMostrar] = useState<{ id: string; vez: number } | null>(null)
  const [aviso, setAviso] = useState<AvisoDoItem | null>(null)
  const gatilhoDaImagem = useRef<HTMLElement | null>(null)

  // As hipóteses SKC (Tarefa 10) deste objeto e dos ligados a ele: em "Hipóteses por nível" e marcadas nos trechos.
  const refsDoGrupo = useMemo(() => [d.numero, ...ligados], [d.numero, ligados])
  const hipotesesSkc = useHipotesesSkc(refsDoGrupo)
  const skcPorNivel = useMemo(() => agruparPorNivel(hipotesesSkc), [hipotesesSkc])
  const ancorasSkc = useMemo(
    () => d.leituras.map((l) => ({ pt: l.texto === null ? [] : ancorasDasHipoteses(hipotesesSkc, l.passagemId, 'pt', l.texto), de: ancorasDasHipoteses(hipotesesSkc, l.passagemId, 'de', l.original) })),
    [d, hipotesesSkc],
  )
  const ancorasDaLeitura = useMemo(() => d.leituras.map((l, i) => (ancorasSkc[i]!.pt.length ? [...l.ancoras, ...ancorasSkc[i]!.pt].sort((a, b) => a.inicio - b.inicio) : l.ancoras)), [d, ancorasSkc])

  const todas = useMemo(() => [...NIVEIS.flatMap((n) => d.hipotesesPorNivel[n]), ...d.outrasHipoteses], [d])
  const resumoDaHipotese = useResumoDasHipoteses(todas, hipotesesSkc)
  const hAberta: Hipotese | null = (aberta && todas.find((h) => h.id === aberta)) || null
  const hSkcAberta = aberta && eHipoteseSkc(aberta) ? (hipotesesSkc.find((h) => h.id === aberta) ?? null) : null
  const verbetes = useMemo(() => (aberta ? verbetesDaAncora(d.leituras, aberta) : []), [aberta, d])
  const elementoAceso = hAberta?.alvo.tipo === 'element' ? hAberta.alvo.id : hSkcAberta?.sobre.tipo === 'elemento' ? hSkcAberta.sobre.id : null
  const regiaoAcesa = !!elementoAceso && Object.values(regioes).some((rs) => rs.some((r) => r.elementoId === elementoAceso))

  // Os textos das leituras como guardados (a âncora de uma hipótese SKC é no texto guardado) e o rótulo de cada fonte.
  const textoDe = useCallback(
    (fonte: string, lingua: AncoraDaHipoteseSkc['lingua']): string | null => {
      if (lingua === 'skc') {
        const v = estadoAtual().registro('objeto', fonte)?.campos.leitura
        return typeof v === 'string' ? v : null
      }
      const l = d.leituras.find((x) => x.passagemId === fonte)
      // A leitura de um livro ligado (revisão 1, I4): o texto guardado que ela registrou ao aparecer.
      if (!l) return textoGuardado(fonte, lingua)
      return lingua === 'pt' ? l.texto : l.original
    },
    [d],
  )
  const textos = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of d.leituras) {
      if (l.texto !== null) m.set(chaveDoTexto(l.passagemId, 'pt'), l.texto)
      m.set(chaveDoTexto(l.passagemId, 'de'), l.original)
    }
    for (const id of skcLigados) {
      const t = textoDe(id, 'skc')
      if (t !== null) m.set(chaveDoTexto(id, 'skc'), t)
    }
    for (const [k, t] of dosLivros.textos) if (!m.has(k)) m.set(k, t)
    return m
  }, [d, skcLigados, textoDe, hipotesesSkc, dosLivros])
  const rotulosDasFontes = useMemo(() => new Map([...dosLivros.rotulos, ...d.leituras.map((l) => [l.passagemId, l.fonte] as const)]), [d, dosLivros])

  // A nova hipótese (NovaHipotese.dc.html, PC-ItemNovaHipotese.dc.html): o trecho selecionado numa leitura, ou Shift+H.
  const novaHipotese = useNovaHipotese(d.numero, textoDe, () => document.querySelector('.item-leituras'))
  const nova = novaHipotese.nova
  const cargaDosElementos = useCarregar(() => elementosDoObjeto(d.numero), d.numero)
  const elementosSkc = useElementosSkc(refsDoGrupo)
  const elementos = useMemo<ElementoParaEscolher[]>(
    () => [...(cargaDosElementos.fase === 'ok' ? cargaDosElementos.dados.map((e) => ({ id: e.id, rotulo: e.rotulo })) : []), ...elementosSkc.map((e) => ({ id: e.id, rotulo: e.rotulo }))],
    [cargaDosElementos, elementosSkc],
  )
  const imagemAtual = useRef<string | null>(null)

  // A ordem das hipóteses no texto (âncoras, leitura por leitura, com as SKC), para "[" e "]".
  const noTexto = useMemo(() => [...new Set(ancorasDaLeitura.flatMap((as) => as.map((a) => a.hipoteseId)))], [ancorasDaLeitura])
  const ordem: OrdemNoTexto | null = useMemo(() => {
    const i = aberta ? noTexto.indexOf(aberta) : -1
    if (i < 0) return null
    return { posicao: i + 1, total: noTexto.length, anterior: noTexto[i - 1] ?? null, seguinte: noTexto[i + 1] ?? null }
  }, [aberta, noTexto])

  // Links do texto (R14): citações e números, achados na hora, fora dos trechos de termo e âncora.
  const linksPorLeitura = useMemo(
    () =>
      d.leituras.map((l, i): LinkNoTexto[] => {
        if (l.texto === null) return []
        const ocupados = trechosEmUtf16(l.texto, [...l.termos, ...ancorasDaLeitura[i]!])
        return acharLinks(l.texto, ocupados, { fonte: l.fonte, itemId: l.itemId, bibliografia: d.bibliografia, remissoes: d.relacoes.remissoes })
      }),
    [d, ancorasDaLeitura],
  )

  const irPara = useCallback(
    // R20: anterior e próximo trocam a entrada do histórico (replace), com o mesmo estado (janela da busca ou
    // grupo): o Voltar e o botão do navegador voltam ao grupo ou à busca, não ao objeto vizinho.
    (outro: string | null) => {
      if (outro) void navegar(`/item/${encodeURIComponent(outro)}`, { replace: true, state: adiante ?? undefined })
    },
    [navegar, adiante],
  )
  const abrirHipotese = useCallback(
    (id: string) => {
      novaHipotese.fechar()
      void navegar({ pathname: location.pathname, search: `?hipotese=${encodeURIComponent(id)}` }, { replace: true, state: location.state })
    },
    [navegar, location.pathname, location.state, novaHipotese.fechar],
  )
  const fecharHipotese = useCallback(
    () => navegar({ pathname: location.pathname, search: '' }, { replace: true, state: location.state }),
    [navegar, location.pathname, location.state],
  )
  const devolverFoco = useCallback((): HTMLElement | null => {
    const id = aberta
    const seletor = (attr: string) => `[${attr}~="${CSS.escape(id ?? '')}"]`
    const naLeitura = id ? document.querySelector<HTMLElement>(`.item-leituras ${seletor('data-hipoteses')}`) : null
    if (naLeitura) return naLeitura
    if (gatilho.current?.isConnected) return gatilho.current
    return id ? document.querySelector<HTMLElement>(seletor('data-hipotese-linha')) : null
  }, [aberta])
  const lembrarGatilho = useCallback((_: string, el: HTMLElement) => {
    gatilho.current = el
  }, [])

  // Com a folha de baixo (celular e computador abaixo de 1160 px, R17), o trecho da hipótese sobe
  // para ficar inteiro acima dela (scroll-margin-top de 96 px; a folha cobre no máximo ~55% no
  // computador). No painel lateral o trecho já está à vista.
  useEffect(() => {
    if (!aberta || lateral) return
    const seletor = `.item-leituras [data-hipoteses~="${CSS.escape(aberta)}"]`
    document.querySelector<HTMLElement>(seletor)?.scrollIntoView({ block: 'start' })
  }, [aberta, lateral])

  const porNivel = !!secoes.hipoteses
  const alternar = (id: string) => setSecoes((s) => ({ ...s, [id]: !s[id] }))
  // H (ou o ícone) abre a seção e rola até ela; o clique no título da seção só a abre.
  const rolarParaNivel = useRef(false)
  const alternarPorNivel = useCallback(() => {
    setSecoes((s) => {
      rolarParaNivel.current = !s.hipoteses
      return { ...s, hipoteses: !s.hipoteses }
    })
  }, [])
  useEffect(() => {
    if (!porNivel || !rolarParaNivel.current) return
    rolarParaNivel.current = false
    const quadro = requestAnimationFrame(() => document.getElementById('secao-hipoteses')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
    return () => cancelAnimationFrame(quadro)
  }, [porNivel])
  const alternarIdioma = useCallback(() => setIdioma((i) => (i === 'pt' ? 'de' : 'pt')), [])
  const pedirNota = useCallback(() => {
    if (computador) setPedidoDeNota((n) => n + 1)
    else void navegar(caminhoDaNotaNova('objeto', d.numero))
  }, [computador, navegar, d.numero])
  const abrirFolhaDeColecao = useCallback((de?: HTMLElement | null) => {
    gatilhoDaFolha.current = de ?? (document.activeElement as HTMLElement | null)
    setFolhaDeColecao(true)
  }, [])
  const fecharFolhaDeColecao = useCallback(() => setFolhaDeColecao(false), [])
  const devolverFocoDaFolha = useCallback((): HTMLElement | null => {
    if (gatilhoDaFolha.current?.isConnected && gatilhoDaFolha.current !== document.body) return gatilhoDaFolha.current
    return document.querySelector<HTMLElement>('[aria-label="Adicionar à coleção"][aria-haspopup]')
  }, [])
  const abrirAdicionar = useCallback((de?: HTMLElement | null, arquivos?: File[]) => {
    gatilhoDaImagem.current = de ?? (document.activeElement as HTMLElement | null)
    setEditando(null)
    setAdicionando({ arquivos })
  }, [])
  const devolverFocoDaImagem = useCallback((): HTMLElement | null => {
    if (gatilhoDaImagem.current?.isConnected && gatilhoDaImagem.current !== document.body) return gatilhoDaImagem.current
    return document.querySelector<HTMLElement>('[aria-label="Adicionar imagem"]')
  }, [])
  const mostrarImagem = useCallback((id: string) => setMostrar((m) => ({ id, vez: (m?.vez ?? 0) + 1 })), [])
  const aoAdicionarImagens = useCallback(
    (ids: string[]) => {
      setAdicionando(null)
      const ultima = ids.at(-1)
      if (!ultima) return
      mostrarImagem(ultima)
      setAviso({
        texto: ids.length === 1 ? 'Imagem adicionada' : `${ids.length} imagens adicionadas`,
        porEnviar: true,
        desfazer: async () => {
          for (const id of ids) await excluirImagem(id)
        },
      })
    },
    [mostrarImagem],
  )
  const aoExcluirImagem = useCallback(
    (id: string) => {
      setEditando(null)
      setAviso({
        texto: 'Imagem excluída',
        porEnviar: false,
        desfazer: async () => {
          await restaurarImagem(id)
          mostrarImagem(id)
        },
      })
    },
    [mostrarImagem],
  )
  // Computador: soltar uma imagem sobre o item abre o diálogo já com ela.
  const soltavel = computador
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (!adicionando && [...e.dataTransfer.types].includes('Files')) e.preventDefault()
        },
        onDrop: (e: React.DragEvent) => {
          const arquivos = [...e.dataTransfer.files]
          if (adicionando || arquivos.length === 0) return
          e.preventDefault()
          abrirAdicionar(null, arquivos)
        },
      }
    : {}

  // O sha do texto de cada trecho que descreve o objeto fica na nota, para avisar se a fonte mudar (spec §7.6).
  const ancorar = useCallback(() => ancorasDe(d.leituras.map((l) => ({ id: l.passagemId, texto: l.original }))), [d])

  // Teclas do item (← →, H, L): o registro de atalhos cuida de campos de texto, modificadores, diálogos
  // modais e do "g" + letra. ← e → sem objeto para onde ir não tomam a tecla.
  useAtalhos(
    {
      ArrowLeft: () => (posicao?.anterior ? irPara(posicao.anterior) : false),
      ArrowRight: () => (posicao?.proximo ? irPara(posicao.proximo) : false),
      h: alternarPorNivel,
      l: alternarIdioma,
      n: pedirNota,
      c: () => (folhaDeColecao ? fecharFolhaDeColecao() : abrirFolhaDeColecao()),
      'Shift+C': comparar.adicionar,
      a: () => (adicionando ? false : abrirAdicionar()),
      'Shift+H': () => {
        if (nova) return
        if (aberta) fecharHipotese()
        novaHipotese.atalho()
      },
    },
    'item',
  )

  // Abrir o formulário fecha a hipótese aberta (os dois ocupam o mesmo lugar).
  const abrirComTrecho = useCallback(
    (t: Parameters<typeof novaHipotese.abrirComTrecho>[0]) => {
      if (aberta) fecharHipotese()
      void novaHipotese.abrirComTrecho(t)
    },
    [aberta, fecharHipotese, novaHipotese.abrirComTrecho], // eslint-disable-line react-hooks/exhaustive-deps
  )
  // "Marcar uma região nova na imagem": o visualizador desenha e volta (com o polígono no rascunho).
  // No computador (PC-ItemNovaHipotese.dc.html), a região é marcada aqui mesmo, na coluna da imagem.
  const [desenhoNoItem, setDesenhoNoItem] = useState(false)
  const [regiaoDesenhada, setRegiaoDesenhada] = useState<{ imagem: string; pontos: readonly PontoRelativo[] } | null>(null)
  const marcarNoItem = useMemo(
    () =>
      desenhoNoItem && nova
        ? {
            aoConcluir: (imagem: string, pontos: readonly PontoRelativo[]) => {
              setDesenhoNoItem(false)
              setRegiaoDesenhada({ imagem, pontos })
            },
            aoCancelar: () => setDesenhoNoItem(false),
          }
        : null,
    [desenhoNoItem, nova],
  )
  useEffect(() => {
    if (!nova) setDesenhoNoItem(false)
  }, [nova])
  const marcarRegiao = useCallback(
    (r: RascunhoDaHipotese) => {
      if (computador) {
        setDesenhoNoItem(true)
        return
      }
      const img = imagemAtual.current ?? imagensExibidas[0]?.id
      if (!img) return
      guardarRascunhoDaHipotese(r)
      void navegar({ pathname: location.pathname, search: location.search }, { replace: true, state: comImagemAberta(location.state, { imagemId: img, original: false }) })
      setMarcando(img)
    },
    [computador, imagensExibidas, navegar, location.pathname, location.search, location.state],
  )
  const [marcando, setMarcando] = useState<string | null>(null)
  useEffect(() => {
    if (!marcando) return
    const img = marcando
    setMarcando(null)
    void navegar(`/imagem/${encodeURIComponent(img)}`, { state: { ampliada: true, original: false, marcarPara: d.numero } satisfies EstadoDoVisualizador })
  }, [marcando, navegar, d.numero])
  const aoRegistrada = useCallback(
    (r: Reserva) => {
      novaHipotese.fechar()
      setAviso({ texto: 'Hipótese registrada', porEnviar: true, desfazer: () => desfazerRegistro(r) })
    },
    [novaHipotese.fechar], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const acoes = (
    <>
      <IconButton
        icon="niveis"
        label="Ver todas as hipóteses por nível"
        shortcut="H"
        expandido={porNivel}
        onClick={alternarPorNivel}
      />
      <IconButton icon="traducao" label="Mostrar o original alemão" shortcut="L" pressionado={idioma === 'de'} onClick={alternarIdioma} />
      {computador ? (
        <IconButton icon="escrever" label="Escrever nota" shortcut="N" onClick={pedirNota} />
      ) : (
        <Link className="icon-button" to={caminhoDaNotaNova('objeto', d.numero)} aria-label="Escrever nota" aria-keyshortcuts="N" data-tip="Escrever nota (N)">
          <Icon name="escrever" size={20} />
        </Link>
      )}
      <IconButton
        icon="guardar"
        label="Adicionar à coleção"
        shortcut="C"
        expandido={folhaDeColecao}
        abre="dialog"
        onClick={(e) => (folhaDeColecao ? fecharFolhaDeColecao() : abrirFolhaDeColecao(e.currentTarget))}
      />
      <IconButton icon="comparar" label={comparar.rotulo} shortcut="Shift+C" onClick={comparar.adicionar} />
    </>
  )

  // Ampliar: o visualizador recebe o original ligado. Antes de ir, o item guarda no estado da própria
  // entrada do histórico a imagem à vista e o original; ao fechar (voltar no histórico) ele monta de
  // novo, lê isso e reabre na mesma imagem. O contexto (Busca ou Grupo) e `?hipotese=` seguem como estavam.
  const imagemAberta = lerImagemAberta(location.state)
  // Em dois tempos: o replace primeiro; o push do visualizador só depois de a entrada trocada estar na
  // tela. O roteador junta num só os dois navegar() de um mesmo clique, e então a rolagem (useRestaurarRolagem)
  // nunca veria a entrada a que o Voltar do visualizador volta, e o item reabriria no topo.
  const [ampliando, setAmpliando] = useState<{ imagemId: string; original: boolean; chaveAntes: string } | null>(null)
  const ampliarImagem = useCallback(
    (imagemId: string, original: boolean) => {
      void navegar({ pathname: location.pathname, search: location.search }, { replace: true, state: comImagemAberta(location.state, { imagemId, original }) })
      setAmpliando({ imagemId, original, chaveAntes: location.key })
    },
    [navegar, location.pathname, location.search, location.state, location.key],
  )
  useEffect(() => {
    if (!ampliando || location.key === ampliando.chaveAntes) return
    setAmpliando(null)
    void navegar(`/imagem/${encodeURIComponent(ampliando.imagemId)}`, { state: { ampliada: true, original: ampliando.original } satisfies EstadoDoVisualizador })
  }, [ampliando, location.key, navegar])
  const imagem = (
    <ImagemItem
      numero={d.numero}
      imagens={imagensExibidas}
      regioes={regioes}
      elementoAceso={elementoAceso}
      comDica={computador}
      aoAmpliar={ampliarImagem}
      inicial={imagemAberta}
      principal={principal?.id ?? null}
      mostrar={mostrar}
      aoMostrar={(id) => {
        imagemAtual.current = id
      }}
      marcar={marcarNoItem}
      aoAdicionar={(e) => abrirAdicionar(e.currentTarget)}
      aoEditar={(id, e) => {
        gatilhoDaImagem.current = e.currentTarget
        setEditando(id)
      }}
    />
  )
  const nav = posicao && <NavDePosicao posicao={posicao} estado={adiante} />
  const painel = nova ? (
    <NovaHipotese
      key={`nova-${lateral ? 'lateral' : 'folha'}`}
      variante={lateral ? 'lateral' : 'folha'}
      inicial={nova}
      elementos={elementos}
      rotuloDaFonte={(a) => (a.lingua === 'skc' ? 'SKC' : (rotulosDasFontes.get(a.fonte) ?? rotuloDaFonteNaTela(a.fonte, a.lingua) ?? a.fonte))}
      podeMarcar={imagensExibidas.length > 0}
      aoMarcarRegiao={marcarRegiao}
      aoFechar={novaHipotese.fechar}
      aoRegistrada={aoRegistrada}
      devolverFoco={novaHipotese.devolverFoco}
      desenhando={desenhoNoItem}
      regiaoDesenhada={regiaoDesenhada}
      aoAbrirHipotese={abrirHipotese}
    />
  ) : (
    aberta && (
      <PainelHipotese
        key={lateral ? 'lateral' : 'folha'}
        id={aberta}
        variante={lateral ? 'lateral' : 'folha'}
        aoFechar={fecharHipotese}
        devolverFoco={devolverFoco}
        ordem={ordem}
        aoIr={abrirHipotese}
        regiaoAcesa={regiaoAcesa}
        verbetes={verbetes}
        textos={textos}
        rotulosDasFontes={rotulosDasFontes}
      />
    )
  )
  const comPainel = !!(nova || aberta)
  // O aviso do pé ("Hipótese registrada · Desfazer") some quando um painel abre: ele cobriria o pé do painel.
  useEffect(() => {
    if (comPainel) setAviso(null)
  }, [comPainel, aberta])

  const conteudo = (
    <>
      {ligadoDe && ligadoDe !== d.numero && (
        <p className="objeto-aviso" role="status">
          {ligadoDe} está ligado a {d.numero}: as leituras aparecem juntas aqui.
        </p>
      )}
      <Cabeca d={d} skcLigados={skcLigados} livrosLigados={livrosLigados} />
      <Ficha d={d} doUsuario={doUsuario} />
      {!computador && (
        <section className="item-imagem" aria-label="Imagem">
          {imagem}
        </section>
      )}
      <section className="item-leituras" aria-label="Leituras">
        {d.leituras.length === 0 && <p className="item-sem-leitura">Nenhuma fonte tem texto sobre este objeto.</p>}
        {d.leituras.map((l, i) => (
          <Leitura
            key={l.passagemId}
            fonte={l.fonte}
            publicacao={l.publicacao}
            texto={l.texto}
            original={l.original}
            termos={l.termos}
            links={linksPorLeitura[i]}
            idioma={idioma}
            hipoteseAtiva={aberta}
            aoAbrirHipotese={lembrarGatilho}
            ancoras={ancorasDaLeitura[i]!}
            ancorasDoOriginal={ancorasSkc[i]!.de}
            trechoId={l.passagemId}
            resumoDaHipotese={resumoDaHipotese}
          />
        ))}
        <LeiturasDosLivros numeros={livrosLigados} itens={itensDosLivros} idioma={idioma} semAviso hipoteses={hipotesesSkc} hipoteseAtiva={aberta} aoAbrirHipotese={lembrarGatilho} />
        {skcLigados.map((id) => (
          <LeituraSkc key={id} id={id} numero={numeracao.porId.get(id)?.numero ?? 'sem número'} ligada hipoteses={hipotesesSkc} hipoteseAtiva={aberta} aoAbrirHipotese={lembrarGatilho} />
        ))}
        <NotasDoAlvo tipo="objeto" ref_={d.numero} variante="leitura" ancorar={ancorar} pedido={pedidoDeNota} />
        {/* As notas escritas nos outros membros do grupo (revisões 3 e 4), cada uma com o número dele; a nota nova vai ao principal. */}
        {livrosLigados.map((nr) => (
          <NotasDoAlvo key={nr} tipo="objeto" ref_={nr} variante="leitura" membro={nr} />
        ))}
        {skcLigados.map((id) => (
          <NotasDoAlvo key={id} tipo="objeto" ref_={id} variante="leitura" membro={numeracao.porId.get(id)?.numero ?? 'sem número'} />
        ))}
      </section>
      <div className="secoes">
        <Secao
          id="hipoteses"
          titulo="Hipóteses por nível"
          contagem={contarHipoteses(d, skcPorNivel)}
          aberta={porNivel}
          aoAlternar={() => alternar('hipoteses')}
        >
          <HipotesesPorNivel
            item={d}
            aoAbrir={lembrarGatilho}
            skc={skcPorNivel}
            acoes={
              <div className="objeto-hipoteses-acoes">
                <button type="button" className="objeto-botao" aria-keyshortcuts="Shift+H" onClick={() => novaHipotese.atalho()}>
                  <Icon name="registrarHipotese" size={18} />
                  {novaHipotese.emPreparo ? 'Retomar a hipótese em preparo' : 'Registrar hipótese'}
                </button>
              </div>
            }
          />
        </Secao>
        <Secao id="catalogo" titulo="Catálogo" contagem={d.catalogo.length || null} aberta={!!secoes.catalogo} aoAlternar={() => alternar('catalogo')}>
          <Catalogo campos={d.catalogo} idioma={idioma} />
        </Secao>
        <Secao
          id="relacoes"
          titulo="Paralelos e relações"
          contagem={d.relacoes.paralelos.length + d.relacoes.remissoes.length || null}
          aberta={!!secoes.relacoes}
          aoAlternar={() => alternar('relacoes')}
        >
          <Relacoes relacoes={d.relacoes} />
        </Secao>
        <Secao id="bibliografia" titulo="Bibliografia" contagem={d.bibliografia.length || null} aberta={!!secoes.bibliografia} aoAlternar={() => alternar('bibliografia')}>
          <Bibliografia referencias={d.bibliografia} />
        </Secao>
      </div>
    </>
  )

  const folhaDasColecoes = folhaDeColecao && (
    <FolhaDeColecao objeto={d.numero} variante={computador ? 'painel' : 'folha'} aoFechar={fecharFolhaDeColecao} devolverFoco={devolverFocoDaFolha} />
  )
  const rotuloDoLivro = d.itens[0]?.referencia.obra || undefined
  const folhasDaImagem = (
    <>
      {adicionando && (
        <AdicionarImagem
          objeto={d.numero}
          rotuloDoLivro={rotuloDoLivro}
          variante={computador ? 'dialogo' : 'folha'}
          arquivos={adicionando.arquivos}
          aoFechar={() => setAdicionando(null)}
          aoAdicionar={aoAdicionarImagens}
          devolverFoco={devolverFocoDaImagem}
        />
      )}
      {editando && (
        <EditarImagem
          key={editando}
          id={editando}
          rotuloDoLivro={rotuloDoLivro}
          variante={computador ? 'dialogo' : 'folha'}
          aoFechar={() => setEditando(null)}
          aoExcluir={aoExcluirImagem}
          devolverFoco={devolverFocoDaImagem}
        />
      )}
      {/* As duas mensagens do pé (a da imagem e a de Comparar) vivem num só lugar fixo e se empilham: antes cada uma era fixa no mesmo canto e uma cobria a outra (T17-C-8). */}
      <div className="item-avisos-do-pe">
        <AvisoDaImagem aviso={aviso} comPorEnviar={computador} aoFechar={() => setAviso(null)} />
        {comparar.aviso}
      </div>
    </>
  )

  if (!computador) {
    return (
      <div className={`item${comPainel ? ' item-com-folha' : ''}`}>
        <TopoDoCelular voltar={voltar} acoes={acoes} />
        {nav}
        <main className="item-conteudo">{conteudo}</main>
        {painel}
        <BotaoDoTrecho selecao={nova ? null : novaHipotese.selecao} aoRegistrar={abrirComTrecho} />
        {folhaDasColecoes}
        {folhasDaImagem}
      </div>
    )
  }
  return (
    <div className={`item item-pc${comPainel ? (lateral ? ' item-pc-com-painel' : ' item-com-folha') : ''}`} {...soltavel}>
      <section className="item-coluna-imagem item-imagem" aria-label="Imagem">
        <div className="item-coluna-imagem-fixa">
          {nav}
          {imagem}
        </div>
      </section>
      <div className="item-coluna-leitura" data-testid="item-leitura-coluna">
        <main className="item-conteudo">
          <div role="toolbar" aria-label="Ações do item" className="item-acoes">
            {acoes}
          </div>
          {conteudo}
        </main>
        {folhaDasColecoes}
      </div>
      {painel}
      {folhasDaImagem}
      <BotaoDoTrecho selecao={nova ? null : novaHipotese.selecao} aoRegistrar={abrirComTrecho} />
    </div>
  )
}

interface AvisoDoItem {
  texto: string
  /** Computador: diz quantas alterações esperam a sincronização (PC-ItemAdicionarImagem). */
  porEnviar: boolean
  desfazer: () => Promise<void>
}

/**
 * "Imagem adicionada · Desfazer" (ItemAdicionarImagem (c), PC-ItemAdicionarImagem (b)) e "Imagem excluída · Desfazer".
 * A região viva existe sempre (vazia sem aviso), para o leitor de tela anunciar quando o texto chega.
 */
function AvisoDaImagem({ aviso, comPorEnviar, aoFechar }: { aviso: AvisoDoItem | null; comPorEnviar: boolean; aoFechar: () => void }) {
  const { porEnviar } = useSincronizacao()
  const [falhou, setFalhou] = useState(false)
  useEffect(() => setFalhou(false), [aviso])
  const desfazer = async () => {
    if (!aviso) return
    try {
      await aviso.desfazer()
      aoFechar()
    } catch {
      setFalhou(true)
    }
  }
  const extra = aviso?.porEnviar && comPorEnviar && porEnviar > 0 ? ` · ${plural(porEnviar, 'alteração por enviar', 'alterações por enviar')}` : ''
  return (
    <div className={`item-aviso-imagem${aviso ? ' item-aviso-imagem-visivel' : ''}`} role="status" aria-label="Aviso">
      {aviso && (
        <>
          <span>{falhou ? 'Não foi possível desfazer; tente de novo.' : `${aviso.texto}${extra}`}</span>
          <button type="button" className="item-aviso-imagem-desfazer" onClick={() => void desfazer()}>
            Desfazer
          </button>
        </>
      )}
    </div>
  )
}

/**
 * O número e, ao lado, os "números nas fontes" (decisões 38 e 39): as referências de todos os itens do objeto e dos outros
 * livros ligados, na ordem das fontes ("TESTE I: 1, 3, Abb. 2"), e o SKC, Nr. de cada objeto SKC ligado ("SKC: 12").
 * Com outro livro no grupo, a linha espera as referências dele (para não mudar de tamanho duas vezes).
 */
function Cabeca({ d, skcLigados, livrosLigados }: { d: ItemDetalhe; skcLigados: readonly string[]; livrosLigados: readonly string[] }) {
  const numeracao = useNumeracao()
  const outros = useCarregar(() => fontesDosObjetos(livrosLigados), livrosLigados.join('|'))
  const esperando = livrosLigados.length > 0 && outros.fase === 'carregando'
  const fontes = esperando
    ? ''
    : textoDosNumerosNasFontes([...d.itens.map((i) => i.referencia), ...(outros.fase === 'ok' ? outros.dados : [])], skcLigados, numeracao)
  return (
    <div className="item-cabeca" data-testid="item-cabeca">
      <p className="item-rotulo">
        <span className="item-numero codigo">{d.numero}</span>
        <span className="item-origem" data-testid="numeros-nas-fontes">
          {fontes}
        </span>
      </p>
      <h1>{d.descricao ?? d.tipo ?? d.numero}</h1>
    </div>
  )
}

/** "2 · 1 do livro; 1 SKC (Museu de Teste)" (PC-ItemAdicionarImagem (b)). */
function textoDasImagens(livro: number, doUsuario: readonly ImagemDoUsuario[]): string {
  const creditos = [...new Set(doUsuario.map((i) => i.credito.trim()).filter(Boolean))]
  const skc = `${doUsuario.length} SKC${creditos.length ? ` (${creditos.join('; ')})` : ''}`
  return `${livro + doUsuario.length} · ${livro ? `${livro} do livro; ` : ''}${skc}`
}

/**
 * O sítio na ficha (Tarefa 12): o nome de agora (corrigido, ou o do sítio que a pessoa escolheu para o objeto), com "no livro:
 * …" quando ela trocou, a marca "excluído" se o sítio escolhido foi excluído, e o botão que abre "Sítio deste objeto".
 */
function SitioDaFicha({ d }: { d: ItemDetalhe }) {
  const vivos = useSitiosVivos()
  const computador = useBreakpoint() === 'computador'
  // «Escolher o sítio» da Revisão chega com `?corrigir=sitio`: a folha já abre, e o parâmetro sai do endereço (voltar não a reabre).
  const [params, setParams] = useSearchParams()
  const [trocando, setTrocando] = useState(() => params.get('corrigir') === 'sitio')
  useEffect(() => {
    if (params.get('corrigir') === 'sitio')
      setParams(
        (atual) => {
          const p = new URLSearchParams(atual)
          p.delete('corrigir')
          return p
        },
        { replace: true },
      )
    // só ao montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const gatilho = useRef<HTMLElement | null>(null)
  const s = vivos.doObjetoDoPacote(d.numero, { id: d.sitio?.id ?? null, nome: d.sitio?.nome ?? null })
  return (
    <span className="item-ficha-sitio">
      <span className="item-ficha-sitio-nome">
        {s.id ? (
          <Link className="item-ficha-link" to={`/sitio/${encodeURIComponent(s.id)}`}>
            {s.nome ?? s.id}
          </Link>
        ) : (
          <span>sem sítio</span>
        )}
        {s.marca && <span className="marca-excluido">{s.marca}</span>}
        {s.trocado && <small className="item-ficha-no-livro">no livro: {d.sitio?.nome ?? 'sem sítio'}</small>}
      </span>
      <IconButton
        icon="editarFicha"
        label="Escolher ou trocar o sítio"
        abre="dialog"
        expandido={trocando}
        tipPosition="start"
        onClick={(e) => {
          gatilho.current = e.currentTarget
          setTrocando(true)
        }}
      />
      {trocando && (
        <TrocarSitio
          numero={d.numero}
          doLivro={{ id: d.sitio?.id ?? null, nome: d.sitio?.nome ?? null, origem: d.itens[0]?.origem ?? null }}
          variante={computador ? 'dialogo' : 'folha'}
          aoFechar={() => setTrocando(false)}
          devolverFoco={() => (gatilho.current?.isConnected ? gatilho.current : null)}
        />
      )}
    </span>
  )
}

function Ficha({ d, doUsuario = [] }: { d: ItemDetalhe; doUsuario?: readonly ImagemDoUsuario[] }) {
  const data = textoDaData(d)
  const linhas: [string, ReactNode][] = [['Sítio', <SitioDaFicha d={d} />]]
  if (data) linhas.push(['Data', data])
  if (d.acervo) linhas.push(['Acervo', d.acervo])
  if (d.medidas?.texto) linhas.push(['Medidas', semPonto(d.medidas.texto)])
  if (doUsuario.length > 0) linhas.push(['Imagens', textoDasImagens(d.imagens.length, doUsuario)])
  if (linhas.length === 0) return null
  return (
    <dl className="item-ficha" role="group" aria-label="Ficha">
      {linhas.map(([rotulo, valor]) => (
        <div key={rotulo}>
          <dt>{rotulo}</dt>
          <dd>{valor}</dd>
        </div>
      ))}
    </dl>
  )
}

function NavDePosicao({ posicao, estado }: { posicao: Posicao; estado: EstadoDeOrigem | null }) {
  const nome = posicao.colecao ? 'Posição na coleção' : posicao.tipo === 'lista' ? 'Posição na busca' : 'Posição no grupo'
  return (
    <nav aria-label={nome} className="item-posicao">
      <span className="item-posicao-origem">
        <Link to={posicao.caminho} className="item-posicao-rotulo">
          {posicao.rotulo}
        </Link>
        {posicao.texto && (
          <>
            <span aria-hidden="true"> · </span>
            <span className="item-posicao-n codigo">{posicao.texto}</span>
          </>
        )}
      </span>
      <span className="item-posicao-setas">
        <LinkIcone icon="anterior" destino={posicao.anterior} rotulo="Anterior" atalho="ArrowLeft" dica="←" estado={estado} inicio />
        <LinkIcone icon="proximo" destino={posicao.proximo} rotulo="Próximo" atalho="ArrowRight" dica="→" estado={estado} />
      </span>
    </nav>
  )
}

/** Um ícone que é link do roteador (leva o estado do contexto adiante). Sem destino, fica apagado. */
function LinkIcone({
  icon,
  destino,
  rotulo,
  atalho,
  dica,
  estado,
  inicio = false,
}: {
  icon: IconName
  destino: string | null
  rotulo: string
  atalho: string
  dica: string
  estado: EstadoDeOrigem | null
  inicio?: boolean
}) {
  if (!destino) {
    return (
      <span className="icon-button item-posicao-apagado" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
    )
  }
  return (
    <Link
      className={`icon-button${inicio ? ' tip-start' : ''}`}
      to={`/item/${encodeURIComponent(destino)}`}
      replace
      state={estado ?? undefined}
      aria-label={`${rotulo}: ${destino}`}
      aria-keyshortcuts={atalho}
      data-tip={`${rotulo} (${dica})`}
    >
      <Icon name={icon} size={20} />
    </Link>
  )
}
