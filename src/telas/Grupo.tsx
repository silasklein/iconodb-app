import { useRef, useState } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router'
import { estadoDoGrupo, estadoVindoDoPai } from '../app/origem'
import { grupo, type GrupoDetalhe, type SubcolecaoResumo } from '../banco/consultas'
import { passoDoGrupo } from '../banco/leitura'
import { BotaoDaLeitura, useRotaDaLeitura } from '../leitura/LerNoLivro'
import { Colecao } from '../colecoes/Colecao'
import { NotasDoAlvo } from '../notas/NotasDoAlvo'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { CartaoDeObjeto } from '../ui/CartaoDeObjeto'
import { Icon } from '../ui/Icon'
import { ImagemDeCapa } from '../ui/ImagemDeCapa'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { numeroPtBr, textoDeObjetos as objetos } from '../ui/numero'
import { GrupoDividido } from './GrupoDividido'
import { Subcolecao } from './Subcolecao'
import { TrechoDaIntroducao, TrechosDaIntroducao } from './TrechosDaIntroducao'
import { caminhoNoGrupo, chaveDaObra, rotuloDaObra, rotuloDaSubcolecao, tituloDoGrupo } from './obras'
import { LerOsParagrafos, numeroDaSecao, rotuloDaSecaoNaLista, rotuloDoCapitulo, textoDeFiguras, textoDoIntervalo } from './LivroEmParagrafos'
import './Grupo.css'

/**
 * O Grupo (Grupo.dc.html no celular, PC-Grupo.dc.html no computador): capa, título, contagens,
 * a introdução (que se abre no lugar), as subcoleções (schema 9; o quadro «Grupo» do canvas das subcoleções) e a grade
 * de objetos na ordem da autora («Todos os objetos» quando há subcoleções). Cada cartão leva
 * ao item com o grupo como contexto (anterior/próximo) e como origem do "voltar".
 *
 * Com subcoleções, no computador, o grupo é o dividido (GrupoDividido: a lista à esquerda e a grade da escolhida, com
 * `?sub=`); no celular, `?sub=<id>` de uma subcoleção do grupo leva à página dela (e, no computador, a página da
 * subcoleção leva de volta ao grupo com `?sub=`).
 */
export function Grupo() {
  const { id = '' } = useParams()
  // `/grupo/CO-…` é uma coleção SKC do usuário (Tarefa 7): a mesma rota, outra tela. Os ids do pacote nunca começam por CO-.
  return id.startsWith('CO-') ? <Colecao id={id} /> : <GrupoDoPacote id={id} />
}

function GrupoDoPacote({ id }: { id: string }) {
  const carga = useCarregar(() => grupo(id), id)
  const computador = useBreakpoint() === 'computador'
  const { pathname, search } = useLocation()
  const [params] = useSearchParams()
  const [lendo, setLendo] = useState(false)
  const grade = useRef<HTMLElement>(null)

  if (carga.fase === 'carregando') return <div className="grupo" aria-busy="true" />
  if (carga.fase === 'erro') {
    return (
      <div className="grupo">
        <TopoDoCelular voltar={{ href: '#/colecoes', rotulo: 'Voltar às coleções' }} />
        <div className="grupo-aviso">
          <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />
        </div>
      </div>
    )
  }
  const g = carga.dados
  if (g === null) {
    return (
      <div className="grupo">
        <TopoDoCelular voltar={{ href: '#/colecoes', rotulo: 'Voltar às coleções' }} />
        <div className="grupo-aviso" role="status">
          <p>Grupo não encontrado.</p>
          <p>
            <Link to="/colecoes">Ver as coleções</Link>
          </p>
        </div>
      </div>
    )
  }

  // Uma subcoleção (schema 9) tem a sua página; a `key` zera o estado (a introdução aberta) ao ir à vizinha.
  if (g.pai) return <Subcolecao key={g.id} g={g} pai={g.pai} />

  // Com subcoleções, o computador mostra a lista e a grade lado a lado (`?sub=`); o celular, a página da escolhida.
  if (g.subcolecoes.length > 0) {
    if (computador) return <GrupoDividido key={g.id} g={g} />
    const sub = g.subcolecoes.find((s) => s.id === params.get('sub'))
    if (sub) return <Navigate replace to={caminhoNoGrupo(sub.id)} />
  }

  const obra = chaveDaObra(g.publicacao, g.volume)
  const rotuloObra = rotuloDaObra(g.publicacao, g.volume)
  const caminhoDasColecoes = `/colecoes?obra=${encodeURIComponent(obra)}`
  // A «Posição no grupo» do objeto leva o título como aqui, com o número do livro (decisão 81).
  const estado = estadoDoGrupo(g.id, tituloDoGrupo(g).texto, `${pathname}${search}`)
  const descer = () => grade.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const comSubcolecoes = g.subcolecoes.length > 0
  // O capítulo do livro em parágrafos (Tarefa 26): figuras, §§ e seções, e «Ler o capítulo» no lugar da introdução.
  const livro = g.paragrafos

  return (
    <div className="grupo">
      <div className="grupo-alto">
        <div className="grupo-capa" aria-hidden="true">
          <ImagemDeCapa caminho={g.capa?.miniatura ?? null} />
        </div>

        <TopoDoCelular voltar={{ href: `#${caminhoDasColecoes}`, rotulo: 'Voltar às coleções' }} />
        {computador && (
          <nav aria-label="Trilha" className="grupo-trilha">
            <Link className="hit" to={caminhoDasColecoes}>
              Coleções
            </Link>{' '}
            · {rotuloObra}
            {g.periodo ? ` · ${g.periodo}` : ''}
          </nav>
        )}

        <main className="grupo-apresentacao">
          <span className="grupo-etiqueta">{livro ? rotuloDoCapitulo(rotuloObra, g.numero) : [g.periodo, `Grupo ${g.ordinal}`, rotuloObra].filter(Boolean).join(' · ')}</span>
          <div className="grupo-titulo">
            <h1>{tituloDoGrupo(g).texto}</h1>
            <span className="grupo-filete" aria-hidden="true" />
          </div>

          {livro ? (
            <dl className="grupo-contagens" role="group" aria-label="O que há no capítulo">
              <div>
                <dt>Figuras</dt>
                <dd>{numeroPtBr(g.objetos)}</dd>
              </div>
              <div>
                <dt>§§</dt>
                <dd>{numeroPtBr(livro.total)}</dd>
              </div>
              <div>
                <dt>Seções</dt>
                <dd>{numeroPtBr(g.subcolecoes.length)}</dd>
              </div>
            </dl>
          ) : (
            <dl className="grupo-contagens" role="group" aria-label="O que há no grupo">
              <div>
                <dt>Objetos</dt>
                <dd>{numeroPtBr(g.objetos)}</dd>
              </div>
              <div>
                <dt>Imagens</dt>
                <dd>{numeroPtBr(g.imagens)}</dd>
              </div>
              <div>
                <dt>Hipóteses</dt>
                <dd>{numeroPtBr(g.hipoteses)}</dd>
              </div>
            </dl>
          )}

          {livro ? (
            <LerOsParagrafos sigla={g.publicacao} intervalo={livro} rotulo="Ler o capítulo" />
          ) : (
            <Introducao g={g} lendo={lendo} aoAlternar={() => setLendo((v) => !v)} />
          )}

          <button type="button" className="grupo-descer" onClick={descer}>
            <Icon name="descer" size={18} />
            {livro ? textoDeFiguras(g.objetos) : objetos(g.objetos)}
          </button>
        </main>
      </div>

      {comSubcolecoes && <ListaDeSubcolecoes pai={g.id} subcolecoes={g.subcolecoes} livro={!!livro} />}

      <section className="grupo-objetos" id="objetos-do-grupo" aria-label={livro ? 'Figuras do capítulo' : 'Objetos do grupo'} ref={grade}>
        {(computador || comSubcolecoes) && (
          <div className="grupo-objetos-topo">
            <h2>
              {livro ? 'Todas as figuras' : comSubcolecoes ? 'Todos os objetos' : 'Objetos'} <span className="codigo">{numeroPtBr(g.objetos)}</span>
            </h2>
          </div>
        )}
        <div className="grupo-grade">
          {g.itens.map((o) => (
            <CartaoDeObjeto key={o.numero} objeto={o} grande={computador} state={estado} />
          ))}
        </div>
      </section>

      <div className="grupo-notas">
        <NotasDoAlvo tipo="grupo" ref_={g.id} variante="secao" />
      </div>
    </div>
  )
}

/**
 * A introdução: o resumo é o primeiro trecho; «Ler a introdução» abre todos, um parágrafo cada (schema 9: os trechos de
 * `author_group_passage`; antes, só o `intro_passage_id`). Sem trechos, nem resumo nem botão.
 * Ao lado, «Ler no livro» (Tarefa 5 da leitura, desenho 3) abre o 1º passo do grupo na leitura da obra de catálogo; ele
 * aparece também no grupo sem introdução, quando o grupo tem passo.
 */
function Introducao({ g, lendo, aoAlternar }: { g: GrupoDetalhe; lendo: boolean; aoAlternar: () => void }) {
  const leitura = useRotaDaLeitura(passoDoGrupo, g.id)
  const [primeiro] = g.introducao
  if (!primeiro && !leitura) return null
  return (
    <>
      {primeiro &&
        (lendo ? (
          <section id="grupo-introducao" className="grupo-introducao" aria-label="Introdução do grupo">
            <TrechosDaIntroducao trechos={g.introducao} />
          </section>
        ) : (
          <TrechoDaIntroducao className="grupo-resumo" trecho={primeiro} />
        ))}
      <div className="leitura-botoes grupo-botoes">
        {primeiro && (
          <button type="button" className="grupo-ler hit" aria-expanded={lendo} aria-controls={lendo ? 'grupo-introducao' : undefined} onClick={aoAlternar}>
            {lendo ? 'Recolher a introdução' : 'Ler a introdução'}
          </button>
        )}
        {leitura && <BotaoDaLeitura para={leitura} rotulo="Ler no livro" cheio />}
      </div>
    </>
  )
}

/**
 * As subcoleções do grupo (schema 9), na ordem do sumário: o número, o título em português e os objetos; cada linha abre
 * a sua página, com a marca de que veio do grupo (o «‹ grupo» da subcoleção volta no histórico, sem laço).
 */
function ListaDeSubcolecoes({ pai, subcolecoes, livro }: { pai: string; subcolecoes: SubcolecaoResumo[]; livro: boolean }) {
  return (
    <section className="grupo-subcolecoes" aria-labelledby="grupo-subcolecoes-titulo">
      <div className="grupo-objetos-topo">
        <h2 id="grupo-subcolecoes-titulo">{livro ? 'Seções' : 'Subcoleções'}</h2>
      </div>
      <ul className="grupo-subcolecoes-lista">
        {subcolecoes.map((s) => (
          <li key={s.id}>
            <Link
              className="grupo-subcolecao"
              to={`/grupo/${encodeURIComponent(s.id)}`}
              state={estadoVindoDoPai(pai)}
              aria-label={livro ? rotuloDaSecaoNaLista(s) : rotuloDaSubcolecao(s)}
            >
              <span className="grupo-subcolecao-numero codigo">{livro && s.numero ? numeroDaSecao(s.numero) : s.numero}</span>
              <span className="grupo-subcolecao-titulo">
                {s.titulo}
                {livro && s.paragrafos && <span className="secao-intervalo">{textoDoIntervalo(s.paragrafos)}</span>}
              </span>
              <span className="grupo-subcolecao-n">{numeroPtBr(s.objetos)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
