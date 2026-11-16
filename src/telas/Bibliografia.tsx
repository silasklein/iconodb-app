import { memo, useDeferredValue, useEffect, useMemo, useRef } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router'
import { obra } from '../banco/consultas'
import { tabelaDoPacote } from '../busca/fold'
import { edicaoSobreOPacote, useObraPublicada, useObrasDaBibliografia, type ObraDaLista } from '../bibliografia/doUsuario'
import { anoDoCsl, chicagoDaObra } from '../bibliografia/formulario'
import { eObraSkc, type Csl } from '../bibliografia/modelo'
import { ReferenciaChicago } from '../bibliografia/ReferenciaChicago'
import { useRedirecionamentos } from '../pacote/redirecionamentos'
import { comObjetosLigados, useObjetosDaObraComLigados, useObjetosLigadosNoApp } from '../revisao/objetosLigados'
import { ObraSkcDetalhe } from '../bibliografia/ObraSkcDetalhe'
import { Icon } from '../ui/Icon'
import { decodificar, htmlComItalico } from '../item/Secoes'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { Contagem } from '../ui/Contagem'
import { CampoDeFiltro } from '../ui/CampoDeFiltro'
import { IconButton } from '../ui/IconButton'
import { ListaEDetalhe } from '../ui/ListaEDetalhe'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { AvisoDeCopia, useCopiar } from '../ui/useCopiar'
import { numeroPtBr } from '../ui/numero'
import { NotasDoAlvo } from '../notas/NotasDoAlvo'
import { CabecalhoDoDetalhe, ErroNoDetalhe, MolduraDoDetalhe, NaoEncontrado, SecaoDeObjetos, useVoltarDoDetalhe } from './detalhe'
import { agrupar, filtrar, indexar, inicialDe, type Entrada } from './lista'
import { useFiltroNaUrl } from './useFiltroNaUrl'
import { VeioDeVoce } from './VeioDeVoce'
import './Lista.css'
import '../imagens-usuario/MarcaSkc.css'

const ANO = /\b(1[0-9]{3}|20[0-9]{2})\b/
/**
 * O ano da citação curta ("Amostra et al. 1999 (TESTE)" → "1999"); sem ele, o do CSL (uma obra sua sem citação curta);
 * "Sem ano" quando não há.
 */
const anoDe = (o: ObraDaLista) => (o.curta ? ANO.exec(o.curta)?.[1] : undefined) ?? (o.curta ? undefined : anoValido(anoDoCsl(o.csl))) ?? 'Sem ano'
const anoValido = (a: string | null) => (a && /^\d{3,4}$/.test(a) ? a : undefined)

/** Uma linha da lista, memoizada (digitar no filtro só refaz as que entram ou saem). A obra do usuário tem a marca SKC. */
const LinhaDaObra = memo(function LinhaDaObra({ o, atual, busca }: { o: ObraDaLista; atual: boolean; busca: string }) {
  return (
    <Link className="lista-linha obra-linha" to={{ pathname: `/obra/${encodeURIComponent(o.id)}`, search: busca }} aria-current={atual ? 'page' : undefined} data-atual={atual ? '' : undefined}>
      <span className="lista-nome">
        {o.curta ?? o.titulo ?? o.id}
        {o.skc && <span className="marca-skc obra-linha-skc">SKC</span>}
      </span>
      <Contagem n={o.objetos} um="objeto" varios="objetos" />
      {o.titulo && o.curta && <span className="lista-sub">{o.titulo}</span>}
    </Link>
  )
})

/**
 * A Bibliografia (Bibliografia.dc.html no celular, PC-Bibliografia.dc.html no computador): as obras pela citação
 * curta, com a busca por autor, ano ou título (dobrada) e a ordem por autor ou por ano. É também a tela de
 * /obra/:id: no computador a lista e a referência juntas, no celular a referência ocupa a tela.
 * Parte 2C, bloco 3: as obras do usuário entram na lista com a marca SKC (a publicada pelo pacote aparece só pelo `BIB-`
 * do livro, sem duplicar), e «Nova obra» leva ao formulário.
 */
export function Bibliografia() {
  const { id } = useParams()
  const computador = useBreakpoint() === 'computador'
  const [params, setParams] = useSearchParams()
  const porAno = params.get('ordem') === 'ano'
  const [texto, setTexto] = useFiltroNaUrl()
  const consulta = useDeferredValue(texto)
  // As obras do pacote e as do usuário pela composição única das telas (`useObrasDaBibliografia`, M1 do fix round 1).
  const cargaDasObras = useObrasDaBibliografia()
  const cargaDaTabela = useCarregar(tabelaDoPacote, 'tabela')
  const carga = cargaDasObras.fase === 'ok' ? cargaDaTabela : cargaDasObras
  const rolagem = useRef<HTMLDivElement>(null)
  const busca = porAno ? '?ordem=ano' : ''

  // M3 (revisão final): a contagem soma os objetos cujas citações você ligou à obra no app (a página da obra os lista)
  const ligados = useObjetosLigadosNoApp()
  const lista_ = useMemo(() => (cargaDasObras.fase === 'ok' ? comObjetosLigados(cargaDasObras.dados, ligados) : null), [cargaDasObras, ligados])
  const tabela = cargaDaTabela.fase === 'ok' ? cargaDaTabela.dados : null
  const dados = useMemo(() => {
    if (!lista_ || !tabela) return null
    const entradas = indexar(
      lista_,
      tabela,
      (o) => o.curta ?? o.titulo ?? o.id,
      (o) => [o.curta, o.titulo, o.id].filter(Boolean).join(' '),
    )
    return { entradas, tabela }
  }, [lista_, tabela])
  const visiveis = useMemo(() => {
    if (!dados) return []
    const achadas = filtrar(dados.entradas, consulta, dados.tabela)
    // Por ano: do mais antigo ao mais novo, e pela ordem de autor dentro do ano ("Sem ano" no fim).
    return porAno ? [...achadas].sort((x, y) => anoDe(x.item).localeCompare(anoDe(y.item)) || (x.ordem < y.ordem ? -1 : x.ordem > y.ordem ? 1 : 0)) : achadas
  }, [dados, consulta, porAno])
  const escolhida = useMemo(() => {
    const o = id ? dados?.entradas.find((e) => e.item.id === id)?.item : undefined
    return o ? (o.curta ?? o.titulo ?? o.id) : undefined
  }, [dados, id])
  const grupos = useMemo(() => agrupar(visiveis, (e) => (porAno ? anoDe(e.item) : inicialDe(e.ordem))), [visiveis, porAno])

  useEffect(() => {
    if (computador && id) rolagem.current?.querySelector('[data-atual]')?.scrollIntoView?.({ block: 'nearest' })
  }, [computador, id, dados])

  const alternarOrdem = () =>
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual)
        if (porAno) novo.delete('ordem')
        else novo.set('ordem', 'ano')
        return novo
      },
      { replace: true },
    )

  if (!computador && id) return <DetalheDaObra id={id} pagina voltarPara={`/bibliografia${busca}`} computador={false} />

  const total = dados?.entradas.length ?? 0
  const apoio = !dados
    ? ' '
    : consulta.trim()
      ? `${numeroPtBr(visiveis.length)} de ${numeroPtBr(total)} ${total === 1 ? 'obra' : 'obras'}`
      : `${numeroPtBr(total)} ${total === 1 ? 'obra' : 'obras'} · Chicago autor-data`
  const botaoDeOrdem = <IconButton icon="ordenar" label={porAno ? 'Ordenar por autor' : 'Ordenar por ano'} onClick={alternarOrdem} />

  const novaObra = (
    <Link className="lista-novo" to="/obra/nova">
      <Icon name="adicionar" size={18} />
      Nova obra
    </Link>
  )
  const lista = (
    <>
      <div className="lista-cabeca">
        {computador ? (
          <div className="lista-titulo-linha">
            <h1>Bibliografia</h1>
            {novaObra}
          </div>
        ) : (
          <h1>Bibliografia</h1>
        )}
        <span className="lista-apoio">{apoio}</span>
      </div>
      {!computador && novaObra}
      <div className="lista-ferramentas">
        <CampoDeFiltro rotulo="Buscar na bibliografia" placeholder="autor, ano ou título…" valor={texto} aoMudar={setTexto} />
        {computador && botaoDeOrdem}
      </div>
      {carga.fase === 'erro' && <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />}
      {dados && visiveis.length === 0 && <p className="lista-vazia">Nenhuma obra encontrada.</p>}
      {dados && visiveis.length > 0 && (
        <div className="lista-letras">
          {grupos.map((g, i) => (
            <section key={g.chave} aria-label={porAno ? `Obras de ${g.chave}` : `Obras com ${g.chave}`}>
              <div className="lista-letra">
                <h2>{g.chave}</h2>
                {i === 0 && <span>objetos</span>}
              </div>
              {g.entradas.map((e: Entrada<ObraDaLista>) => (
                <LinhaDaObra key={e.item.id} o={e.item} atual={e.item.id === id} busca={busca} />
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  )

  if (computador) {
    return (
      <ListaEDetalhe
        rotulo="Lista de obras"
        chave={id}
        anuncio={escolhida}
        lista={<div ref={rolagem}>{lista}</div>}
        detalhe={id ? <DetalheDaObra id={id} pagina={false} voltarPara="/bibliografia" computador /> : <p className="detalhe-vazio">Escolha uma obra na lista.</p>}
      />
    )
  }
  return (
    <div className="lista-pagina">
      <TopoDoCelular voltar={{ href: '#/' }} acoes={botaoDeOrdem} />
      <main className="lista-corpo">{lista}</main>
    </div>
  )
}

/** O texto da referência para copiar: o Chicago em texto puro (sem a marcação do itálico). */
/** A referência em texto puro (o que "Copiar referência" copia): sem marcação e com as entidades decodificadas. */
export function chicagoEmTexto(o: { chicago: string | null; chicagoHtml: string | null; titulo: string | null; curta: string | null }): string {
  if (o.chicago) return o.chicago
  if (o.chicagoHtml) return decodificar(o.chicagoHtml.replace(/<[^>]*>/g, ''))
  return o.titulo ?? o.curta ?? ''
}

interface Props {
  id: string
  pagina: boolean
  voltarPara: string
  computador: boolean
}

/** A obra do pacote (`ObraDetalhe`) ou a do usuário (`BIB-<aparelho>-<n>`, `ObraSkcDetalhe`). */
function DetalheDaObra(props: Props) {
  return eObraSkc(props.id) ? <ObraDoUsuario {...props} /> : <ObraDetalhe {...props} />
}

/**
 * Tarefa 14: o endereço de uma obra sua que o pacote publicou (`redirecionamento tipo 'obra'`) vai para a obra dos livros (o
 * antigo some do histórico), com o `?…` e o estado (a origem leve, decisão 85) junto, como o do verbete e o do sítio.
 */
function ObraDoUsuario(props: Props) {
  const redirecionamentos = useRedirecionamentos()
  const { search, state } = useLocation()
  if (redirecionamentos === null) return <div className={props.pagina ? 'detalhe-pagina' : 'detalhe'} aria-busy="true" />
  const para = redirecionamentos.get(props.id)
  if (para) return <Navigate replace to={`/obra/${encodeURIComponent(para)}${search}`} state={state} />
  return <ObraSkcDetalhe {...props} />
}

/**
 * A obra: a referência Chicago completa, onde a citação aparece e os objetos que citam a obra. Tarefa 14: a que veio de uma
 * obra sua tem «Editar a obra» (a edição da camada vale aqui sobre o pacote) e o bloco «Esta obra veio de você».
 */
export function ObraDetalhe({ id, pagina, voltarPara, computador }: Props) {
  const carga = useCarregar(() => obra(id), id, { manter: !pagina })
  const chicagoRef = useRef<HTMLParagraphElement>(null)
  const { aviso, copiar } = useCopiar(chicagoRef)
  // Tarefa 14 (o parqueado da Tarefa 11): aberta da Revisão (ou de outra tela com a origem leve), «‹ Revisão» volta a ela
  const { voltar, deOnde } = useVoltarDoDetalhe({ href: `#${voltarPara}`, rotulo: 'Voltar à bibliografia' })
  // Tarefa 14: a obra que veio de uma obra sua continua editável, e o que a camada escreveu vale sobre o pacote
  const publicada = useObraPublicada(id)
  // M3 (revisão final): com os objetos cujas citações você ligou a ela no app (null: só os do pacote)
  const comLigados = useObjetosDaObraComLigados(id)

  if (carga.fase === 'carregando') return <div className={pagina ? 'detalhe-pagina' : 'detalhe'} aria-busy="true" />
  if (carga.fase === 'erro') return <ErroNoDetalhe pagina={pagina} voltar={voltar} erro={carga.erro} aoTentar={carga.tentarDeNovo} />
  const o = carga.dados
  if (o === null) {
    return <NaoEncontrado pagina={pagina} voltar={voltar} titulo="Obra não encontrada" destino="/bibliografia" rotuloDoDestino="Ver a bibliografia" />
  }

  // N1 (fix round 1): no computador, a obra anterior fica à vista enquanto a nova é lida; a edição é só da obra à vista
  const pub = o.id === id ? publicada : null
  // A edição da camada só vale quando difere do pacote (`edicaoSobreOPacote`; a mesma regra da lista)
  const edicao = pub ? edicaoSobreOPacote(o, pub) : null
  const cslDaCamada: Csl | null = edicao?.csl ?? null
  const curtaDaCamada = edicao?.curta ?? null
  const nome = curtaDaCamada ?? o.curta ?? (cslDaCamada ? cslDaCamada.title : o.titulo) ?? o.id
  const textoDaCamada = cslDaCamada ? (chicagoDaObra(cslDaCamada)?.texto ?? cslDaCamada.title) : null
  const acoes = <IconButton icon="copiar" label="Copiar referência completa" onClick={() => void copiar(textoDaCamada ?? chicagoEmTexto(o))} />
  const citadas = Object.entries(o.citadaComo).filter(([, curtas]) => curtas.length > 0)
  return (
    <MolduraDoDetalhe pagina={pagina} voltar={voltar} deOnde={deOnde} acoes={acoes} origem={`Obra: ${nome}`}>
      <CabecalhoDoDetalhe pagina={pagina} etiqueta="Obra" titulo={nome} codigo={o.id} acoes={acoes} />
      <p className="obra-chicago" ref={chicagoRef}>
        {cslDaCamada ? <ReferenciaChicago csl={cslDaCamada} semChicago={cslDaCamada.title} /> : o.chicagoHtml ? htmlComItalico(o.chicagoHtml) : chicagoEmTexto(o)}
      </p>
      <AvisoDeCopia aviso={aviso} />
      {citadas.length > 0 && (
        <p className="obra-citada">{citadas.map(([sigla, curtas]) => `Citada como ${curtas.map((c) => `«${c}»`).join(', ')} no ${sigla}`).join(' · ')}</p>
      )}
      {(cslDaCamada || curtaDaCamada) && (
        <p className="obra-citada">
          <span className="marca-skc">SKC</span> As suas mudanças valem aqui e entram nos livros na próxima importação
          {curtaDaCamada ? ` · citação curta «${curtaDaCamada}»` : ''}.
        </p>
      )}
      {pub && (
        <div className="detalhe-fila">
          <Link className="detalhe-botao" to={`/obra/${encodeURIComponent(o.id)}/editar`}>
            <Icon name="escrever" size={18} />
            Editar a obra
          </Link>
        </div>
      )}
      <SecaoDeObjetos rotulo="Objetos que citam esta obra" titulo="Objetos que a citam" objetos={(o.id === id ? comLigados : null) ?? o.objetos} computador={computador} />
      {/* key: no computador a tela fica montada entre uma obra e outra; o estado do bloco é de cada obra (NB-1). O nome é o dos
          livros (o do pacote): é o que fica guardado para «Excluídos» (P5) */}
      <VeioDeVoce key={o.id} tipo="obra" id={o.id} nomeDoLivro={o.curta ?? o.titulo ?? undefined} />
      <NotasDoAlvo tipo="obra" ref_={o.id} variante="secao" />
    </MolduraDoDetalhe>
  )
}
