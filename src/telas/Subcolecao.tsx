import { useId, useState, type MouseEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { estadoDoGrupo, estadoVindoDoPai, passosAtePai } from '../app/origem'
import type { GrupoDetalhe, SubcolecaoResumo, TextoDaIntroducao } from '../banco/tipos'
import { NotasDoAlvo } from '../notas/NotasDoAlvo'
import { CartaoDeObjeto } from '../ui/CartaoDeObjeto'
import { useBreakpoint } from '../ui/useBreakpoint'
import { comModificador, temEntradaAnterior } from '../ui/useVoltar'
import { numeroPtBr, textoDeObjetos as objetos } from '../ui/numero'
import { caminhoNoGrupo, rotuloDaObra, tituloDoGrupo } from './obras'
import { TrechoDaIntroducao, TrechosDaIntroducao } from './TrechosDaIntroducao'
import { LerOsParagrafos, ParagrafosDaSecao, rotuloDaSecao, textoDeFiguras, textoDoIntervalo, tituloDaSecao } from './LivroEmParagrafos'
import './Grupo.css'
import './Subcolecao.css'

const rotuloDaVizinha = (s: SubcolecaoResumo) => `${s.numero} ${s.titulo}`

interface Props {
  g: GrupoDetalhe
  /** O grupo de cima (`g.pai`, já não nulo). */
  pai: NonNullable<GrupoDetalhe['pai']>
}

/**
 * A página da subcoleção (schema 9; quadro «Subcolecao» do canvas das subcoleções): o link de volta ao grupo de cima,
 * o rótulo (obra · período · número), o título, «N objetos · subcoleção n de total», a caixa da introdução, a grade
 * e, no pé, a anterior e a próxima. Os cartões levam a subcoleção como contexto (`origem.subcolecao`).
 */
export function Subcolecao({ g, pai }: Props) {
  const computador = useBreakpoint() === 'computador'
  const location = useLocation()
  const navegar = useNavigate()
  const caminho = `/grupo/${encodeURIComponent(g.id)}`
  const estado = estadoDoGrupo(g.id, g.titulo, caminho, true)

  // Vinda do grupo (pela lista ou andando pelas vizinhas), o «‹ grupo» volta no histórico os passos dados: o grupo
  // reaparece como estava e o «Voltar às coleções» dele não cai de novo aqui. Sem a marca, empilha o grupo (link direto).
  const passos = passosAtePai(location.state, pai.id)
  const aoVoltar = (e: MouseEvent<HTMLAnchorElement>) => {
    if (passos === null || e.defaultPrevented || comModificador(e) || !temEntradaAnterior(location)) return
    e.preventDefault()
    void navegar(-passos)
  }
  const estadoDaVizinha = passos === null ? undefined : estadoVindoDoPai(pai.id, passos + 1)

  // No computador a subcoleção abre dentro do grupo, escolhida na lista (GrupoDividido).
  if (computador) return <Navigate replace to={caminhoNoGrupo(pai.id, g.id)} />

  // A seção do livro em parágrafos (Tarefa 26, tela 3): «Ler a seção», «§§ desta seção» e as figuras, no lugar da introdução.
  const livro = g.paragrafos
  const obra = rotuloDaObra(g.publicacao, g.volume)

  return (
    <div className="subcolecao">
      <main className="subcolecao-corpo">
        <div className="subcolecao-alto">
          <Link className="subcolecao-volta" to={`/grupo/${encodeURIComponent(pai.id)}`} onClick={aoVoltar}>
            <span aria-hidden="true">‹</span>
            {tituloDoGrupo(pai).texto}
          </Link>
          <span className="subcolecao-etiqueta">{livro ? rotuloDaSecao(obra, g.numero) : [obra, g.periodo, g.numero].filter(Boolean).join(' · ')}</span>
          <h1>{livro ? tituloDaSecao(g) : g.titulo}</h1>
          <span className="subcolecao-contagem">
            {livro
              ? [textoDeFiguras(g.objetos), textoDoIntervalo(livro)].join(' · ')
              : [objetos(g.objetos), g.posicao ? `subcoleção ${numeroPtBr(g.posicao.n)} de ${numeroPtBr(g.posicao.total)}` : null].filter(Boolean).join(' · ')}
          </span>
          {livro && <LerOsParagrafos sigla={g.publicacao} intervalo={livro} rotulo="Ler a seção" botao />}
        </div>

        {livro ? (
          <div className="subcolecao-paragrafos">
            <ParagrafosDaSecao sigla={g.publicacao} paragrafos={g.paragrafosDaSecao} />
          </div>
        ) : (
          <Introducao numero={g.numero} trechos={g.introducao} />
        )}

        <section className="grupo-objetos subcolecao-objetos" aria-label={livro ? 'Figuras da seção' : 'Objetos da subcoleção'}>
          <div className="grupo-objetos-topo">
            <h2>
              {livro ? 'Figuras da seção' : 'Objetos'} <span className="codigo">{numeroPtBr(g.objetos)}</span>
            </h2>
          </div>
          <div className="grupo-grade">
            {g.itens.map((o) => (
              <CartaoDeObjeto key={o.numero} objeto={o} state={estado} />
            ))}
          </div>
        </section>

        <div className="grupo-notas subcolecao-notas">
          <NotasDoAlvo tipo="grupo" ref_={g.id} variante="secao" />
        </div>
      </main>

      {(g.anterior || g.proxima) && (
        <nav className="subcolecao-vizinhas" aria-label="Subcoleções vizinhas">
          {g.anterior && (
            <Link
              className="subcolecao-anterior"
              to={`/grupo/${encodeURIComponent(g.anterior.id)}`}
              state={estadoDaVizinha}
              aria-label={`Subcoleção anterior: ${rotuloDaVizinha(g.anterior)}`}
            >
              <span aria-hidden="true">← </span>
              <span className="subcolecao-vizinha-texto">{rotuloDaVizinha(g.anterior)}</span>
            </Link>
          )}
          {g.proxima && (
            <Link
              className="subcolecao-proxima"
              to={`/grupo/${encodeURIComponent(g.proxima.id)}`}
              state={estadoDaVizinha}
              aria-label={`Próxima subcoleção: ${rotuloDaVizinha(g.proxima)}`}
            >
              <span className="subcolecao-vizinha-texto">{rotuloDaVizinha(g.proxima)}</span>
              <span aria-hidden="true"> →</span>
            </Link>
          )}
        </nav>
      )}
    </div>
  )
}

/**
 * A caixa da introdução: o rótulo, o primeiro trecho e «Ler a introdução», que abre todos no lugar (um parágrafo cada,
 * com os avisos de tradução do grupo). Sem trechos, não há caixa.
 */
function Introducao({ numero, trechos }: { numero: string | null; trechos: TextoDaIntroducao[] }) {
  const [lendo, setLendo] = useState(false)
  const idRotulo = useId()
  const idTexto = useId()
  const [primeiro] = trechos
  if (!primeiro) return null
  return (
    <section className="subcolecao-introducao" aria-labelledby={idRotulo}>
      <span className="subcolecao-introducao-rotulo" id={idRotulo}>
        {numero ? `Introdução · o texto do autor sobre ${numero}` : 'Introdução'}
      </span>
      <div id={idTexto} className={lendo ? 'subcolecao-introducao-texto' : 'subcolecao-introducao-texto subcolecao-resumo'}>
        {lendo ? <TrechosDaIntroducao trechos={trechos} /> : <TrechoDaIntroducao trecho={primeiro} />}
      </div>
      <button type="button" className="subcolecao-ler hit" aria-expanded={lendo} aria-controls={idTexto} onClick={() => setLendo((v) => !v)}>
        {lendo ? 'Recolher a introdução' : 'Ler a introdução'}
      </button>
    </section>
  )
}
