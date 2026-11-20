import { useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { estadoDoGrupo } from '../app/origem'
import { grupo, type GrupoDetalhe, type ObjetoResumo, type SubcolecaoResumo, type TextoDaIntroducao } from '../banco/consultas'
import { passoDoGrupo } from '../banco/leitura'
import { BotaoDaLeitura, useRotaDaLeitura } from '../leitura/LerNoLivro'
import { NotasDoAlvo } from '../notas/NotasDoAlvo'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { CartaoDeObjeto } from '../ui/CartaoDeObjeto'
import { useCarregar } from '../ui/useCarregar'
import { comModificador } from '../ui/useVoltar'
import { numeroPtBr, textoDeObjetos as objetos, textoDeSubcolecoes as subcolecoes } from '../ui/numero'
import { TrechosDaIntroducao } from './TrechosDaIntroducao'
import { caminhoNoGrupo, chaveDaObra, rotuloDaObra, rotuloDaSubcolecao, tituloDoGrupo } from './obras'
import { useParametrosNaUrl } from './useParametrosNaUrl'
import {
  LerOsParagrafos,
  ParagrafosDaSecao,
  numeroDaSecao,
  rotuloDaSecao,
  rotuloDaSecaoNaLista,
  rotuloDoCapitulo,
  textoDeFiguras,
  textoDeParagrafos,
  textoDeSecoes,
  textoDoIntervalo,
  tituloDaSecao,
} from './LivroEmParagrafos'
import './LivroEmParagrafos.css'
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

  // O capítulo do livro em parágrafos (Tarefa 26): seções, figuras e §§ no lugar de subcoleções e objetos.
  const livro = g.paragrafos !== null
  const anuncio = sub
    ? livro
      ? rotuloDaSecaoNaLista(sub)
      : rotuloDaSubcolecao(sub)
    : livro
      ? `Todas as figuras do capítulo, ${textoDeFiguras(g.objetos)}`
      : `Todos os objetos, ${objetos(g.objetos)}`

  return (
    <main className="grupo-dividido">
      <Lateral g={g} escolhida={sub?.id ?? null} aoEscolher={escolher} />
      <div className="grupo-dividido-principal">
        {sub ? (
          livro ? (
            <PainelDaSecao key={sub.id} pai={g} sub={sub} />
          ) : (
            <PainelDaSubcolecao key={sub.id} pai={g.id} sub={sub} />
          )
        ) : (
          <>
            <Grade rotulo={livro ? 'Figuras do capítulo' : 'Objetos do grupo'} itens={g.itens} estado={estadoDoGrupo(g.id, tituloDoGrupo(g).texto, caminhoNoGrupo(g.id))}>
              <div className="grupo-objetos-topo">
                <h2>
                  {livro ? 'Todas as figuras' : 'Todos os objetos'} <span className="codigo">{numeroPtBr(g.objetos)}</span>
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
  const livro = g.paragrafos
  // «Ler no livro» (Tarefa 5 da leitura): o 1º passo do grupo; o capítulo do livro em parágrafos tem o «Ler o capítulo» dele.
  const leitura = useRotaDaLeitura(passoDoGrupo, livro ? null : g.id)

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
      {livro ? (
        <span className="grupo-dividido-periodo">{rotuloDoCapitulo(rotuloDaObra(g.publicacao, g.volume), g.numero)}</span>
      ) : (
        g.periodo && <span className="grupo-dividido-periodo">{g.periodo}</span>
      )}
      <h1>{tituloDoGrupo(g).texto}</h1>
      <span className="grupo-dividido-contagem">
        {livro
          ? `${textoDeFiguras(g.objetos)} · ${textoDeParagrafos(livro.total)} · ${textoDeSecoes(g.subcolecoes.length)}`
          : `${objetos(g.objetos)} · ${subcolecoes(g.subcolecoes.length)}`}
      </span>
      {livro && <LerOsParagrafos sigla={g.publicacao} intervalo={livro} rotulo="Ler o capítulo" />}
      {!livro && (g.introducao.length > 0 || leitura) && (
        <>
          <div className="leitura-botoes grupo-dividido-botoes">
            {g.introducao.length > 0 && (
              <button type="button" className="grupo-dividido-ler hit" aria-expanded={lendo} aria-controls={lendo ? idIntro : undefined} onClick={() => setLendo((v) => !v)}>
                {lendo ? 'Recolher a introdução' : 'Ler a introdução'}
              </button>
            )}
            {leitura && <BotaoDaLeitura para={leitura} rotulo="Ler no livro" cheio />}
          </div>
          {lendo && (
            <section id={idIntro} className="grupo-dividido-introducao" aria-label="Introdução do grupo">
              <TrechosDaIntroducao trechos={g.introducao} />
            </section>
          )}
        </>
      )}

      <nav className="grupo-dividido-lista" aria-label={livro ? 'Seções' : 'Subcoleções'}>
        <ul>
          <li>
            <Linha
              to={caminhoNoGrupo(g.id)}
              numero={livro ? 'Todas' : 'Todos'}
              titulo={livro ? 'Todas as figuras do capítulo' : 'Todos os objetos do grupo'}
              n={g.objetos}
              atual={escolhida === null}
              onClick={(e) => aoEscolher(e, null)}
              rotulo={livro ? `Todas as figuras do capítulo, ${textoDeFiguras(g.objetos)}` : undefined}
            />
          </li>
          {g.subcolecoes.map((s) => (
            <li key={s.id}>
              <Linha
                to={caminhoNoGrupo(g.id, s.id)}
                numero={livro && s.numero ? numeroDaSecao(s.numero) : s.numero}
                titulo={s.titulo}
                detalhe={livro && s.paragrafos ? textoDoIntervalo(s.paragrafos) : undefined}
                n={s.objetos}
                atual={escolhida === s.id}
                onClick={(e) => aoEscolher(e, s.id)}
                rotulo={livro ? rotuloDaSecaoNaLista(s) : rotuloDaSubcolecao(s)}
              />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

function Linha(p: {
  to: string
  numero: string
  titulo: string
  /** Sob o título: os §§ da seção (o livro em parágrafos). */
  detalhe?: string
  n: number
  atual: boolean
  rotulo?: string
  onClick: (e: MouseEvent<HTMLAnchorElement>) => void
}) {
  return (
    <Link
      className="grupo-dividido-linha"
      to={p.to}
      onClick={p.onClick}
      aria-current={p.atual ? 'true' : undefined}
      aria-label={p.rotulo ?? `${p.titulo}, ${objetos(p.n)}`}
    >
      <span className="grupo-dividido-linha-numero codigo">{p.numero}</span>
      <span className="grupo-dividido-linha-titulo">
        {p.titulo}
        {p.detalhe && <span className="secao-intervalo">{p.detalhe}</span>}
      </span>
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
  const leitura = useRotaDaLeitura(passoDoGrupo, sub.id)
  const estado = estadoDoGrupo(sub.id, sub.titulo, caminhoNoGrupo(pai, sub.id), true)
  const cabecalho = (
    <div className="grupo-dividido-cabecalho">
      <span className="grupo-dividido-numero codigo">{sub.numero}</span>
      <h2>{sub.titulo}</h2>
      <span className="grupo-dividido-n">{objetos(sub.objetos)}</span>
      {(trechos.length > 0 || leitura) && (
        <span className="leitura-botoes grupo-dividido-botoes">
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
          {leitura && <BotaoDaLeitura para={leitura} rotulo="Ler no livro" rotuloAcessivel={`Ler no livro: subcoleção ${sub.numero || sub.titulo}`} cheio />}
        </span>
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

/**
 * A seção do livro em parágrafos escolhida, à direita (Tarefa 26, tela 3): «TESTEG · Seção 1», o título com o número, «N figuras ·
 * §§ a–b», «Ler a seção» (o primeiro §), «§§ desta seção» com a primeira frase de cada um, e «Figuras da seção».
 */
function PainelDaSecao({ pai, sub }: { pai: GrupoDetalhe; sub: SubcolecaoResumo }) {
  const carga = useCarregar(() => grupo(sub.id), sub.id)
  const titulo = tituloDaSecao(sub)
  const estado = estadoDoGrupo(sub.id, titulo, caminhoNoGrupo(pai.id, sub.id), true)
  const paragrafos = carga.fase === 'ok' ? (carga.dados?.paragrafosDaSecao ?? []) : []
  return (
    <>
      <div className="grupo-dividido-secao">
        <span className="grupo-dividido-periodo">{rotuloDaSecao(rotuloDaObra(pai.publicacao, pai.volume), sub.numero)}</span>
        <h2 className="grupo-dividido-secao-titulo">{titulo}</h2>
        <span className="grupo-dividido-n">{[textoDeFiguras(sub.objetos), sub.paragrafos ? textoDoIntervalo(sub.paragrafos) : null].filter(Boolean).join(' · ')}</span>
        {sub.paragrafos && <LerOsParagrafos sigla={pai.publicacao} intervalo={sub.paragrafos} rotulo="Ler a seção" botao />}
      </div>
      {carga.fase === 'erro' ? (
        <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />
      ) : (
        <>
          <ParagrafosDaSecao sigla={pai.publicacao} paragrafos={paragrafos} />
          <Grade rotulo="Figuras da seção" itens={carga.fase === 'ok' ? (carga.dados?.itens ?? []) : []} ocupada={carga.fase === 'carregando'} estado={estado}>
            <div className="grupo-objetos-topo">
              <h2>
                Figuras da seção <span className="codigo">{numeroPtBr(sub.objetos)}</span>
              </h2>
            </div>
          </Grade>
        </>
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
