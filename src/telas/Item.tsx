import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { estadoDoGrupo, type EstadoDeOrigem } from '../app/origem'
import { ATALHOS_DE_IR, emCampoDeTexto } from '../app/useAtalhosDeNavegacao'
import { item, regioes as regioesDaImagem, vizinhos } from '../banco/consultas'
import type { ContextoDeNavegacao, Hipotese, ItemDetalhe, Regiao } from '../banco/tipos'
import { NIVEIS } from '../banco/tipos'
import type { EstadoDoVisualizador } from '../imagem/estado'
import { ImagemItem } from '../item/ImagemItem'
import { Leitura, type Idioma } from '../item/Leitura'
import { acharLinks } from '../item/links'
import { trechosEmUtf16 } from '../item/offsets'
import { PainelHipotese, type OrdemNoTexto } from '../item/PainelHipotese'
import { Bibliografia, Catalogo, HipotesesPorNivel, Relacoes, Secao } from '../item/Secoes'
import { verbetesDaAncora, type LinkNoTexto } from '../item/trechos'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { Icon, type IconName } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint, useLarguraMinima } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { useTema } from '../ui/useTema'
import './Item.css'

/** O estado do roteador, se for um dos que o app passa ao item (Busca ou Grupo). */
function lerEstado(state: unknown): EstadoDeOrigem | null {
  const e = state as Partial<EstadoDeOrigem> | null
  if (!e || typeof e !== 'object' || !e.contexto || !e.origem) return null
  if (e.contexto.tipo === 'grupo' && typeof e.contexto.id === 'string') return e as EstadoDeOrigem
  if (e.contexto.tipo === 'lista' && Array.isArray(e.contexto.ids)) return e as EstadoDeOrigem
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
  const carga = useCarregar(() => item(numero), numero)

  if (carga.fase === 'carregando') return <div className="item" aria-busy="true" />
  if (carga.fase === 'erro') {
    return (
      <div className="item">
        <TopoDoCelular voltar={{ href: '#/colecoes', rotulo: 'Voltar às coleções' }} />
        <div className="item-aviso">
          <AvisoDeErro erro={carga.erro} />
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
  return <ItemCarregado key={d.numero} d={d} />
}

interface Posicao {
  rotulo: string
  caminho: string
  tipo: ContextoDeNavegacao['tipo']
  texto: string | null
  anterior: string | null
  proximo: string | null
}

/** R17: a partir desta largura a hipótese abre no painel lateral (terceira coluna); abaixo, na folha de baixo. */
export const LARGURA_DO_PAINEL_LATERAL = 1160

function ItemCarregado({ d }: { d: ItemDetalhe }) {
  const location = useLocation()
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const computador = useBreakpoint() === 'computador'
  const lateral = useLarguraMinima(LARGURA_DO_PAINEL_LATERAL) && computador
  const [idioma, setIdioma] = useState<Idioma>('pt')
  const [secoes, setSecoes] = useState<Record<string, boolean>>({})
  const gatilho = useRef<HTMLElement | null>(null)
  const aberta = params.get('hipotese')

  // Contexto: o do estado (Busca ou Grupo) ou, sem estado, o primeiro grupo do objeto.
  const estado = lerEstado(location.state)
  const primeiro = d.grupos[0] ?? null
  const adiante = estado ?? (primeiro ? estadoDoGrupo(primeiro.id, primeiro.titulo, `/grupo/${primeiro.id}`) : null)
  const contexto = adiante?.contexto ?? null
  const chaveDoContexto = !contexto ? '' : contexto.tipo === 'grupo' ? `g:${contexto.id}` : `l:${contexto.ids.length}:${contexto.ids[0]}:${contexto.ids.at(-1)}`
  const viz = useCarregar(() => (contexto ? vizinhos(d.numero, contexto) : Promise.resolve(null)), `${d.numero}|${chaveDoContexto}`)
  const v = viz.fase === 'ok' ? viz.dados : null
  const posicao: Posicao | null = adiante && {
    rotulo: adiante.origem.rotulo,
    caminho: adiante.origem.caminho,
    tipo: adiante.contexto.tipo,
    texto: !v ? null : 'inicio' in adiante ? `${adiante.inicio + v.posicao} / ${adiante.total}` : `${v.posicao} / ${v.total}`,
    anterior: v?.anterior ?? null,
    proximo: v?.proximo ?? null,
  }
  const voltar = !adiante
    ? { href: '#/colecoes', rotulo: 'Voltar às coleções' }
    : { href: `#${adiante.origem.caminho}`, rotulo: adiante.contexto.tipo === 'lista' ? 'Voltar à busca' : 'Voltar ao grupo' }

  // As regiões marcadas de cada imagem (poucas imagens por objeto).
  const cargaDasRegioes = useCarregar(
    async () => Object.fromEntries(await Promise.all(d.imagens.map(async (img) => [img.id, await regioesDaImagem(img.id)] as const))) as Record<string, Regiao[]>,
    d.numero,
  )
  const regioes = cargaDasRegioes.fase === 'ok' ? cargaDasRegioes.dados : {}

  const todas = useMemo(() => [...NIVEIS.flatMap((n) => d.hipotesesPorNivel[n]), ...d.outrasHipoteses], [d])
  const hAberta: Hipotese | null = (aberta && todas.find((h) => h.id === aberta)) || null
  const verbetes = useMemo(() => (aberta ? verbetesDaAncora(d.leituras, aberta) : []), [aberta, d])
  const elementoAceso = hAberta?.alvo.tipo === 'element' ? hAberta.alvo.id : null
  const regiaoAcesa = !!elementoAceso && Object.values(regioes).some((rs) => rs.some((r) => r.elementoId === elementoAceso))

  // A ordem das hipóteses no texto (âncoras, leitura por leitura), para "[" e "]".
  const noTexto = useMemo(() => [...new Set(d.leituras.flatMap((l) => l.ancoras.map((a) => a.hipoteseId)))], [d])
  const ordem: OrdemNoTexto | null = useMemo(() => {
    const i = aberta ? noTexto.indexOf(aberta) : -1
    if (i < 0) return null
    return { posicao: i + 1, total: noTexto.length, anterior: noTexto[i - 1] ?? null, seguinte: noTexto[i + 1] ?? null }
  }, [aberta, noTexto])

  // Links do texto (R14): citações e números, achados na hora, fora dos trechos de termo e âncora.
  const linksPorLeitura = useMemo(
    () =>
      d.leituras.map((l): LinkNoTexto[] => {
        if (l.texto === null) return []
        const ocupados = trechosEmUtf16(l.texto, [...l.termos, ...l.ancoras])
        return acharLinks(l.texto, ocupados, { fonte: l.fonte, itemId: l.itemId, bibliografia: d.bibliografia, remissoes: d.relacoes.remissoes })
      }),
    [d],
  )

  const irPara = useCallback(
    (outro: string | null) => outro && navegar(`/item/${encodeURIComponent(outro)}`, { state: adiante ?? undefined }),
    [navegar, adiante],
  )
  const abrirHipotese = useCallback(
    (id: string) => navegar({ pathname: location.pathname, search: `?hipotese=${encodeURIComponent(id)}` }, { replace: true, state: location.state }),
    [navegar, location.pathname, location.state],
  )
  const fecharHipotese = useCallback(
    () => navegar({ pathname: location.pathname, search: '' }, { replace: true, state: location.state }),
    [navegar, location.pathname, location.state],
  )
  const devolverFoco = useCallback((): HTMLElement | null => {
    const id = aberta
    const seletor = (attr: string) => `[${attr}~="${(id ?? '').replace(/["\\]/g, '\\$&')}"]`
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
    const seletor = `.item-leituras [data-hipoteses~="${aberta.replace(/["\\]/g, '\\$&')}"]`
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

  // Teclas do item (L, H, ← →). Fora de campos de texto e de diálogos modais; a Tarefa 11 centraliza.
  const teclas = useRef({ alternarIdioma, alternarPorNivel, irPara, posicao })
  teclas.current = { alternarIdioma, alternarPorNivel, irPara, posicao }
  useEffect(() => {
    let gArmado = 0
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || emCampoDeTexto(e.target)) return
      if (document.querySelector('[aria-modal="true"]')) return
      const t = teclas.current
      const k = e.key
      // "g" e uma letra de ATALHOS_DE_IR é ir a uma seção (useAtalhosDeNavegacao): essa letra não é
      // do item. Qualquer outra tecla depois do "g" (setas, H…) segue normal.
      const depoisDoG = Date.now() - gArmado < 1500
      gArmado = 0
      if (depoisDoG && k.toLowerCase() in ATALHOS_DE_IR) return
      if (k === 'g') gArmado = Date.now()
      else if (k === 'l' || k === 'L') {
        e.preventDefault()
        t.alternarIdioma()
      } else if (k === 'h' || k === 'H') {
        e.preventDefault()
        t.alternarPorNivel()
      } else if (k === 'ArrowLeft' && t.posicao?.anterior) {
        e.preventDefault()
        t.irPara(t.posicao.anterior)
      } else if (k === 'ArrowRight' && t.posicao?.proximo) {
        e.preventDefault()
        t.irPara(t.posicao.proximo)
      }
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [])

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
    </>
  )

  // Ampliar: o visualizador recebe o original ligado; ao fechar, o histórico volta a esta tela e o foco, ao botão.
  const ampliarImagem = useCallback(
    (imagemId: string, original: boolean) => navegar(`/imagem/${encodeURIComponent(imagemId)}`, { state: { ampliada: true, original } satisfies EstadoDoVisualizador }),
    [navegar],
  )
  const imagem = (
    <ImagemItem
      numero={d.numero}
      imagens={d.imagens}
      regioes={regioes}
      elementoAceso={elementoAceso}
      comDica={computador}
      aoAmpliar={ampliarImagem}
    />
  )
  const nav = posicao && <NavDePosicao posicao={posicao} estado={adiante} />
  const painel = aberta && (
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
    />
  )

  const conteudo = (
    <>
      <Cabeca d={d} />
      <Ficha d={d} />
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
            ancoras={l.ancoras}
            links={linksPorLeitura[i]}
            idioma={idioma}
            hipoteseAtiva={aberta}
            aoAbrirHipotese={lembrarGatilho}
          />
        ))}
      </section>
      <div className="secoes">
        <Secao
          id="hipoteses"
          titulo="Hipóteses por nível"
          contagem={NIVEIS.reduce((n, nv) => n + d.hipotesesPorNivel[nv].length, 0)}
          aberta={porNivel}
          aoAlternar={() => alternar('hipoteses')}
        >
          <HipotesesPorNivel item={d} aoAbrir={lembrarGatilho} />
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

  if (!computador) {
    return (
      <div className={`item${aberta ? ' item-com-folha' : ''}`}>
        <TopoDoCelular voltar={voltar} acoes={acoes} />
        {nav}
        <main className="item-conteudo">{conteudo}</main>
        {painel}
      </div>
    )
  }
  return (
    <div className={`item item-pc${aberta ? (lateral ? ' item-pc-com-painel' : ' item-com-folha') : ''}`}>
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
      </div>
      {painel}
    </div>
  )
}

function Cabeca({ d }: { d: ItemDetalhe }) {
  return (
    <div className="item-cabeca" data-testid="item-cabeca">
      <p className="item-rotulo">
        <span className="item-numero codigo">{d.numero}</span>
        <span className="item-origem">{d.origem}</span>
      </p>
      <h1>{d.descricao ?? d.tipo ?? d.numero}</h1>
    </div>
  )
}

const semPonto = (s: string) => s.replace(/\.\s*$/, '')
const ano = (a: number) => (a < 0 ? `${-a} aEC` : `${a} dC`)

/** A datação em português: o campo 4 traduzido, senão o período e os anos. */
function textoDaData(d: ItemDetalhe): string | null {
  const campo = d.catalogo.find((c) => c.categoria === 4 && c.texto)
  if (campo) return semPonto(campo.texto!)
  const dt = d.datacoes[0]
  if (!dt) return null
  const periodo = [dt.periodoDe, dt.periodoAte].filter(Boolean).join('–')
  let anos = ''
  if (dt.anoDe !== null && dt.anoAte !== null) anos = dt.anoDe < 0 && dt.anoAte < 0 ? `${-dt.anoDe}–${-dt.anoAte} aEC` : `${ano(dt.anoDe)}–${ano(dt.anoAte)}`
  else if (dt.anoDe !== null) anos = ano(dt.anoDe)
  return [periodo, anos].filter(Boolean).join(', ') || null
}

function Ficha({ d }: { d: ItemDetalhe }) {
  const data = textoDaData(d)
  const linhas: [string, ReactNode][] = []
  if (d.sitio) {
    linhas.push([
      'Sítio',
      <Link className="item-ficha-link" to={`/sitio/${encodeURIComponent(d.sitio.id)}`}>
        {d.sitio.nome}
      </Link>,
    ])
  }
  if (data) linhas.push(['Data', data])
  if (d.acervo) linhas.push(['Acervo', d.acervo])
  if (d.medidas?.texto) linhas.push(['Medidas', semPonto(d.medidas.texto)])
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
  const nome = posicao.tipo === 'lista' ? 'Posição na busca' : 'Posição no grupo'
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
      state={estado ?? undefined}
      aria-label={`${rotulo}: ${destino}`}
      aria-keyshortcuts={atalho}
      data-tip={`${rotulo} (${dica})`}
    >
      <Icon name={icon} size={20} />
    </Link>
  )
}
