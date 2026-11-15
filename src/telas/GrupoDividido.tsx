import { useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { estadoDoGrupo } from '../app/origem'
import { grupo, type GrupoDetalhe, type ObjetoResumo, type SubcolecaoResumo, type TextoDaIntroducao } from '../banco/consultas'
import { NotasDoAlvo } from '../notas/NotasDoAlvo'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { CartaoDeObjeto } from '../ui/CartaoDeObjeto'
import { useCarregar } from '../ui/useCarregar'
import { comModificador } from '../ui/useVoltar'
import { numeroPtBr, textoDeObjetos as objetos, textoDeSubcolecoes as subcolecoes } from '../ui/numero'
import { TrechosDaIntroducao } from './TrechosDaIntroducao'
import { caminhoNoGrupo, chaveDaObra, rotuloDaObra, rotuloDaSubcolecao, tituloDoGrupo } from './obras'
import { useParametrosNaUrl } from './useParametrosNaUrl'
import './Grupo.css'
import './GrupoDividido.css'

/**
 * O grupo com subcoleções no computador (quadro «Mac» do canvas das subcoleções): à esquerda (380 px, presa abaixo da
 * barra, com a sua rolagem) a trilha, o período, o título, «N objetos · M subcoleções», «Ler a introdução» e a lista
 * («Todos» e as subcoleções, a escolhida invertida); à direita, a grade da escolhida. Escolher não troca de rota: grava
 * `?sub=<id>` com `replace`, que sobrevive ao recarregar e ao voltar do objeto. Um `sub` que não é do grupo vale «Todos».
 */
export function GrupoDividido({ g }: { g: GrupoDetalhe }) {
  const { valores, definir } = useParametrosNaUrl(['sub'] as const)
  const sub = g.subcolecoes.find((s) => s.id === valores.sub) ?? null

  // Um clique simples troca a grade no lugar; com modificador, o link abre a escolhida noutra aba.
  const escolher = (e: MouseEvent<HTMLAnchorElement>, id: string | null) => {
    if (e.defaultPrevented || comModificador(e)) return
    e.preventDefault()
    definir({ sub: id })
    // Com a página rolada (a grade de «Todos» é longa), a grade nova começa do alto; a lista fica presa.
    if (window.scrollY > 0) window.scrollTo(0, 0)
  }

  const anuncio = sub ? rotuloDaSubcolecao(sub) : `Todos os objetos, ${objetos(g.objetos)}`

  return (
    <main className="grupo-dividido">
      <Lateral g={g} escolhida={sub?.id ?? null} aoEscolher={escolher} />
      <div className="grupo-dividido-principal">
        {sub ? (
          <PainelDaSubcolecao key={sub.id} pai={g.id} sub={sub} />
        ) : (
          <>
            <Grade rotulo="Objetos do grupo" itens={g.itens} estado={estadoDoGrupo(g.id, tituloDoGrupo(g).texto, caminhoNoGrupo(g.id))}>
              <div className="grupo-objetos-topo">
                <h2>
                  Todos os objetos <span className="codigo">{numeroPtBr(g.objetos)}</span>
                </h2>
              </div>
            </Grade>
            <div className="grupo-dividido-notas">
              <NotasDoAlvo tipo="grupo" ref_={g.id} variante="secao" />
            </div>
          </>
        )}
      </div>
      <div className="so-leitor" aria-live="polite" aria-atomic="true">
        {anuncio}
      </div>
    </main>
  )
}

function Lateral({
  g,
  escolhida,
  aoEscolher,
}: {
  g: GrupoDetalhe
  escolhida: string | null
  aoEscolher: (e: MouseEvent<HTMLAnchorElement>, id: string | null) => void
}) {
  const [lendo, setLendo] = useState(false)
  const idIntro = useId()
  const coluna = useRef<HTMLDivElement>(null)
  const obra = chaveDaObra(g.publicacao, g.volume)

  // Ao montar (de volta do objeto, ao recarregar, vindo de `/grupo/<sub>` ou do «No livro»), a escolhida aparece na
  // lista: só a rolagem da coluna se ajusta (a da janela é a que se restaura, e o foco não muda). Depois, quem escolhe
  // clica numa linha que já está à vista.
  useLayoutEffect(() => {
    const c = coluna.current
    const linha = c?.querySelector<HTMLElement>('.grupo-dividido-lista [aria-current]')
    if (!c || !linha) return
    const caixa = c.getBoundingClientRect()
    const r = linha.getBoundingClientRect()
    const folga = 16
    if (r.bottom > caixa.bottom) c.scrollTop += r.bottom - caixa.bottom + folga
    else if (r.top < caixa.top) c.scrollTop -= caixa.top - r.top + folga
  }, [])

  return (
    <div className="grupo-dividido-lateral" ref={coluna}>
      <nav aria-label="Trilha">
        <Link className="grupo-dividido-trilha" to={`/colecoes?obra=${encodeURIComponent(obra)}`}>
          <span aria-hidden="true">‹</span>
          Coleções · {rotuloDaObra(g.publicacao, g.volume)}
        </Link>
      </nav>
      {g.periodo && <span className="grupo-dividido-periodo">{g.periodo}</span>}
      <h1>{tituloDoGrupo(g).texto}</h1>
      <span className="grupo-dividido-contagem">
        {objetos(g.objetos)} · {subcolecoes(g.subcolecoes.length)}
      </span>
      {g.introducao.length > 0 && (
        <>
          <button type="button" className="grupo-dividido-ler hit" aria-expanded={lendo} aria-controls={lendo ? idIntro : undefined} onClick={() => setLendo((v) => !v)}>
            {lendo ? 'Recolher a introdução' : 'Ler a introdução'}
          </button>
          {lendo && (
            <section id={idIntro} className="grupo-dividido-introducao" aria-label="Introdução do grupo">
              <TrechosDaIntroducao trechos={g.introducao} />
            </section>
          )}
        </>
      )}

      <nav className="grupo-dividido-lista" aria-label="Subcoleções">
        <ul>
          <li>
            <Linha
              to={caminhoNoGrupo(g.id)}
              numero="Todos"
              titulo="Todos os objetos do grupo"
              n={g.objetos}
              atual={escolhida === null}
              onClick={(e) => aoEscolher(e, null)}
            />
          </li>
          {g.subcolecoes.map((s) => (
            <li key={s.id}>
              <Linha
                to={caminhoNoGrupo(g.id, s.id)}
                numero={s.numero}
                titulo={s.titulo}
                n={s.objetos}
                atual={escolhida === s.id}
                onClick={(e) => aoEscolher(e, s.id)}
                rotulo={rotuloDaSubcolecao(s)}
              />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

function Linha(p: { to: string; numero: string; titulo: string; n: number; atual: boolean; rotulo?: string; onClick: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <Link
      className="grupo-dividido-linha"
      to={p.to}
      onClick={p.onClick}
      aria-current={p.atual ? 'true' : undefined}
      aria-label={p.rotulo ?? `${p.titulo}, ${objetos(p.n)}`}
    >
      <span className="grupo-dividido-linha-numero codigo">{p.numero}</span>
      <span className="grupo-dividido-linha-titulo">{p.titulo}</span>
      <span className="grupo-dividido-linha-n">{numeroPtBr(p.n)}</span>
    </Link>
  )
}

/**
 * A subcoleção escolhida, à direita: o número, o título, «N objetos», «Ler a introdução» dela e a grade. O cabeçalho vem
 * da lista do grupo (aparece já); a introdução e os objetos chegam com `grupo(sub.id)`.
 */
function PainelDaSubcolecao({ pai, sub }: { pai: string; sub: SubcolecaoResumo }) {
  const carga = useCarregar(() => grupo(sub.id), sub.id)
  const [lendo, setLendo] = useState(false)
  const idIntro = useId()
  const trechos: TextoDaIntroducao[] = carga.fase === 'ok' ? (carga.dados?.introducao ?? []) : []
  const estado = estadoDoGrupo(sub.id, sub.titulo, caminhoNoGrupo(pai, sub.id), true)
  const cabecalho = (
    <div className="grupo-dividido-cabecalho">
      <span className="grupo-dividido-numero codigo">{sub.numero}</span>
      <h2>{sub.titulo}</h2>
      <span className="grupo-dividido-n">{objetos(sub.objetos)}</span>
      {trechos.length > 0 && (
        <button
          type="button"
          className="grupo-dividido-ler hit"
          aria-expanded={lendo}
          aria-controls={lendo ? idIntro : undefined}
          aria-label={lendo ? 'Recolher a introdução da subcoleção' : 'Ler a introdução da subcoleção'}
          onClick={() => setLendo((v) => !v)}
        >
          {lendo ? 'Recolher a introdução' : 'Ler a introdução'}
        </button>
      )}
    </div>
  )

  return (
    <>
      {carga.fase === 'erro' ? (
        <>
          {cabecalho}
          <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />
        </>
      ) : (
        <Grade
          rotulo={`Objetos da subcoleção ${sub.numero}`.trim()}
          itens={carga.fase === 'ok' ? (carga.dados?.itens ?? []) : []}
          ocupada={carga.fase === 'carregando'}
          estado={estado}
        >
          {cabecalho}
          {lendo && (
            <section id={idIntro} className="grupo-dividido-introducao grupo-dividido-introducao-sub" aria-label="Introdução da subcoleção">
              <TrechosDaIntroducao trechos={trechos} />
            </section>
          )}
        </Grade>
      )}
      <div className="grupo-dividido-notas">
        <NotasDoAlvo tipo="grupo" ref_={sub.id} variante="secao" />
      </div>
    </>
  )
}

function Grade({
  rotulo,
  itens,
  estado,
  ocupada = false,
  children,
}: {
  rotulo: string
  itens: ObjetoResumo[]
  estado: ReturnType<typeof estadoDoGrupo>
  ocupada?: boolean
  children: ReactNode
}) {
  return (
    <section className="grupo-dividido-objetos" aria-label={rotulo} aria-busy={ocupada || undefined}>
      {children}
      <div className="grupo-grade grupo-dividido-grade">
        {itens.map((o) => (
          <CartaoDeObjeto key={o.numero} objeto={o} grande state={estado} />
        ))}
      </div>
    </section>
  )
}
