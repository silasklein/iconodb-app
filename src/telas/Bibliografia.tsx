import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { obra, obras, type ObraResumo } from '../banco/consultas'
import { tabelaDoPacote } from '../busca/fold'
import { htmlComItalico } from '../item/Secoes'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { CampoDeFiltro } from '../ui/CampoDeFiltro'
import { IconButton } from '../ui/IconButton'
import { ListaEDetalhe } from '../ui/ListaEDetalhe'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { AvisoDeCopia, useCopiar } from '../ui/useCopiar'
import { numeroPtBr } from '../ui/usePendencias'
import { CabecalhoDoDetalhe, ErroNoDetalhe, MolduraDoDetalhe, NaoEncontrado, SecaoDeObjetos } from './detalhe'
import { agrupar, filtrar, indexar, inicialDe, type Entrada } from './lista'
import './Lista.css'

const ANO = /\b(1[0-9]{3}|20[0-9]{2})\b/
/** O ano da citação curta ("Stern et al. 1993 (NEAEHL)" → "1993"); "Sem ano" quando não há. */
const anoDe = (o: ObraResumo) => (o.curta ? ANO.exec(o.curta)?.[1] : undefined) ?? 'Sem ano'

async function carregar() {
  const [lista, tabela] = await Promise.all([obras(), tabelaDoPacote()])
  const entradas = indexar(
    lista,
    tabela,
    (o) => o.curta ?? o.titulo ?? o.id,
    (o) => [o.curta, o.titulo, o.id].filter(Boolean).join(' '),
  )
  return { entradas, tabela }
}

/** Uma linha da lista, memoizada (digitar no filtro só refaz as que entram ou saem). */
const LinhaDaObra = memo(function LinhaDaObra({ o, atual, busca }: { o: ObraResumo; atual: boolean; busca: string }) {
  return (
    <Link className="lista-linha obra-linha" to={{ pathname: `/obra/${o.id}`, search: busca }} aria-current={atual ? 'page' : undefined} data-atual={atual ? '' : undefined}>
      <span className="lista-nome">{o.curta ?? o.titulo ?? o.id}</span>
      <span className="lista-n">{o.objetos}</span>
      {o.titulo && o.curta && <span className="lista-sub">{o.titulo}</span>}
    </Link>
  )
})

/**
 * A Bibliografia (Bibliografia.dc.html no celular, PC-Bibliografia.dc.html no computador): as obras pela citação
 * curta, com a busca por autor, ano ou título (dobrada) e a ordem por autor ou por ano. É também a tela de
 * /obra/:id: no computador a lista e a referência juntas, no celular a referência ocupa a tela.
 */
export function Bibliografia() {
  const { id } = useParams()
  const computador = useBreakpoint() === 'computador'
  const [params, setParams] = useSearchParams()
  const porAno = params.get('ordem') === 'ano'
  const [texto, setTexto] = useState('')
  const consulta = useDeferredValue(texto)
  const carga = useCarregar(carregar)
  const rolagem = useRef<HTMLDivElement>(null)
  const busca = porAno ? '?ordem=ano' : ''

  const dados = carga.fase === 'ok' ? carga.dados : null
  const visiveis = useMemo(() => {
    if (!dados) return []
    const achadas = filtrar(dados.entradas, consulta, dados.tabela)
    // Por ano: do mais antigo ao mais novo, e pela ordem de autor dentro do ano ("Sem ano" no fim).
    return porAno ? [...achadas].sort((x, y) => anoDe(x.item).localeCompare(anoDe(y.item)) || (x.ordem < y.ordem ? -1 : x.ordem > y.ordem ? 1 : 0)) : achadas
  }, [dados, consulta, porAno])
  const grupos = useMemo(() => agrupar(visiveis, (e) => (porAno ? anoDe(e.item) : inicialDe(e.ordem))), [visiveis, porAno])

  useEffect(() => {
    if (computador && id) rolagem.current?.querySelector('[data-atual]')?.scrollIntoView?.({ block: 'nearest' })
  }, [computador, id, dados])

  const alternarOrdem = () => setParams(porAno ? {} : { ordem: 'ano' }, { replace: true })

  if (!computador && id) return <ObraDetalhe id={id} pagina voltarPara={`/bibliografia${busca}`} computador={false} />

  const total = dados?.entradas.length ?? 0
  const apoio = !dados
    ? ' '
    : consulta.trim()
      ? `${numeroPtBr(visiveis.length)} de ${numeroPtBr(total)} ${total === 1 ? 'obra' : 'obras'}`
      : `${numeroPtBr(total)} ${total === 1 ? 'obra' : 'obras'} · Chicago autor-data`
  const botaoDeOrdem = <IconButton icon="ordenar" label={porAno ? 'Ordenar por autor' : 'Ordenar por ano'} onClick={alternarOrdem} />

  const lista = (
    <>
      <div className="lista-cabeca">
        <h1>Bibliografia</h1>
        <span className="lista-apoio">{apoio}</span>
      </div>
      <div className="lista-ferramentas">
        <CampoDeFiltro rotulo="Buscar na bibliografia" placeholder="autor, ano ou título…" valor={texto} aoMudar={setTexto} />
        {computador && botaoDeOrdem}
      </div>
      {carga.fase === 'erro' && <AvisoDeErro erro={carga.erro} />}
      {dados && visiveis.length === 0 && <p className="lista-vazia">Nenhuma obra encontrada.</p>}
      {dados && visiveis.length > 0 && (
        <div className="lista-letras">
          {grupos.map((g, i) => (
            <section key={g.chave} aria-label={porAno ? `Obras de ${g.chave}` : `Obras com ${g.chave}`}>
              <div className="lista-letra">
                <h2>{g.chave}</h2>
                {i === 0 && <span>objetos</span>}
              </div>
              {g.entradas.map((e: Entrada<ObraResumo>) => (
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
        lista={<div ref={rolagem}>{lista}</div>}
        detalhe={id ? <ObraDetalhe id={id} pagina={false} voltarPara="/bibliografia" computador /> : <p className="detalhe-vazio">Escolha uma obra na lista.</p>}
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
function chicagoEmTexto(o: { chicago: string | null; chicagoHtml: string | null; titulo: string | null; curta: string | null }): string {
  if (o.chicago) return o.chicago
  if (o.chicagoHtml) return o.chicagoHtml.replace(/<[^>]*>/g, '')
  return o.titulo ?? o.curta ?? ''
}

interface Props {
  id: string
  pagina: boolean
  voltarPara: string
  computador: boolean
}

/** A obra: a referência Chicago completa, onde a citação aparece e os objetos que citam a obra. */
export function ObraDetalhe({ id, pagina, voltarPara, computador }: Props) {
  const carga = useCarregar(() => obra(id), id)
  const chicagoRef = useRef<HTMLParagraphElement>(null)
  const { aviso, copiar } = useCopiar(chicagoRef)
  const voltar = { href: `#${voltarPara}`, rotulo: 'Voltar à bibliografia' }

  if (carga.fase === 'carregando') return <div className={pagina ? 'detalhe-pagina' : 'detalhe'} aria-busy="true" />
  if (carga.fase === 'erro') return <ErroNoDetalhe pagina={pagina} voltar={voltar} erro={carga.erro} />
  const o = carga.dados
  if (o === null) {
    return <NaoEncontrado pagina={pagina} voltar={voltar} titulo="Obra não encontrada" destino="/bibliografia" rotuloDoDestino="Ver a bibliografia" />
  }

  const acoes = <IconButton icon="copiar" label="Copiar referência completa" onClick={() => void copiar(chicagoEmTexto(o))} />
  const citadas = Object.entries(o.citadaComo).filter(([, curtas]) => curtas.length > 0)
  return (
    <MolduraDoDetalhe pagina={pagina} voltar={voltar} acoes={acoes}>
      <CabecalhoDoDetalhe pagina={pagina} etiqueta="Obra" titulo={o.curta ?? o.titulo ?? o.id} codigo={o.id} acoes={acoes} />
      <p className="obra-chicago" ref={chicagoRef}>
        {o.chicagoHtml ? htmlComItalico(o.chicagoHtml) : chicagoEmTexto(o)}
      </p>
      <AvisoDeCopia aviso={aviso} />
      {citadas.length > 0 && (
        <p className="obra-citada">{citadas.map(([sigla, curtas]) => `Citada como ${curtas.map((c) => `«${c}»`).join(', ')} no ${sigla}`).join(' · ')}</p>
      )}
      <SecaoDeObjetos rotulo="Objetos que citam esta obra" titulo="Objetos que a citam" objetos={o.objetos} computador={computador} />
    </MolduraDoDetalhe>
  )
}
