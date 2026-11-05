import { useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { estadoDoGrupo } from '../app/origem'
import { grupo, type GrupoDetalhe } from '../banco/consultas'
import { Colecao } from '../colecoes/Colecao'
import { NotasDoAlvo } from '../notas/NotasDoAlvo'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { CartaoDeObjeto } from '../ui/CartaoDeObjeto'
import { Icon } from '../ui/Icon'
import { ImagemDeCapa } from '../ui/ImagemDeCapa'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { numeroPtBr } from '../ui/numero'
import { chaveDaObra, rotuloDaObra } from './obras'
import './Grupo.css'

const objetos = (n: number) => `${numeroPtBr(n)} ${n === 1 ? 'objeto' : 'objetos'}`

/**
 * O Grupo (Grupo.dc.html no celular, PC-Grupo.dc.html no computador): capa, título, contagens,
 * a introdução (que se abre no lugar) e a grade de objetos na ordem da autora. Cada cartão leva
 * ao item com o grupo como contexto (anterior/próximo) e como origem do "voltar".
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

  const obra = chaveDaObra(g.publicacao, g.volume)
  const rotuloObra = rotuloDaObra(g.publicacao, g.volume)
  const caminhoDasColecoes = `/colecoes?obra=${encodeURIComponent(obra)}`
  const estado = estadoDoGrupo(g.id, g.titulo, `${pathname}${search}`)
  const descer = () => grade.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

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
          <span className="grupo-etiqueta">{[g.periodo, `Grupo ${g.ordinal}`, rotuloObra].filter(Boolean).join(' · ')}</span>
          <div className="grupo-titulo">
            <h1>{g.titulo}</h1>
            <span className="grupo-filete" aria-hidden="true" />
          </div>

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

          <Introducao g={g} lendo={lendo} aoAlternar={() => setLendo((v) => !v)} />

          <button type="button" className="grupo-descer" onClick={descer}>
            <Icon name="descer" size={18} />
            {objetos(g.objetos)}
          </button>
        </main>
      </div>

      <section className="grupo-objetos" id="objetos-do-grupo" aria-label="Objetos do grupo" ref={grade}>
        {computador && (
          <div className="grupo-objetos-topo">
            <h2>
              Objetos <span className="codigo">{numeroPtBr(g.objetos)}</span>
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

function Introducao({ g, lendo, aoAlternar }: { g: GrupoDetalhe; lendo: boolean; aoAlternar: () => void }) {
  const intro = g.introducao
  if (!intro) return null
  const traduzida = intro.texto !== null
  const texto = intro.texto ?? intro.original
  return (
    <>
      {lendo ? (
        <section id="grupo-introducao" className="grupo-introducao" aria-label="Introdução do grupo">
          {!traduzida && <p className="grupo-introducao-aviso">Sem tradução ainda; o original, em alemão.</p>}
          <p lang={traduzida ? 'pt-BR' : 'de'}>{texto}</p>
        </section>
      ) : (
        <p className="grupo-resumo" lang={traduzida ? 'pt-BR' : 'de'}>
          {texto}
        </p>
      )}
      <button type="button" className="grupo-ler hit" aria-expanded={lendo} aria-controls={lendo ? 'grupo-introducao' : undefined} onClick={aoAlternar}>
        {lendo ? 'Recolher a introdução' : 'Ler a introdução'}
      </button>
    </>
  )
}
