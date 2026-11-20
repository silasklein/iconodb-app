/**
 * As peças comuns da página do § (o GGG; src/telas/Paragrafo.tsx) e da página de leitura (o IPIAO; src/telas/Leitura.tsx),
 * tiradas de `Paragrafo.tsx` sem mudar o que elas desenham (plano «O IPIAO lido no formato do §», Tarefa 4): o caminho, as
 * setas dos vizinhos, a faixa das figuras citadas, as abas das línguas no celular, a grade das colunas (subgrid) com os
 * trilhos do computador e o pé com a frase dos vizinhos. O CSS está em `pecas.css` (as classes continuam `paragrafo-*`).
 */
import { Fragment, useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { LinkComOrigem } from '../app/OrigemDosLinks'
import type { GrupoNoCaminho, ObjetoResumo } from '../banco/tipos'
import { MiniaturaDoObjeto } from '../imagens-usuario/MiniaturaDoObjeto'
import { useSitiosVivos } from '../sitios/doUsuario'
import { Icon } from '../ui/Icon'
import './pecas.css'

export type Lingua = 'de' | 'pt' | 'en'

export const NOME: Record<Lingua, string> = { de: 'Alemão', pt: 'Português', en: 'Inglês' }
export const ABA: Record<Lingua, string> = { de: 'DE', pt: 'PT', en: 'EN' }
export const LANG: Record<Lingua, string> = { de: 'de', pt: 'pt-BR', en: 'en' }

/** O caminho em português: o livro e os grupos, cada grupo um link (` · ` depois do livro, ` › ` entre os grupos). */
export function Caminho({ livro, grupos }: { livro: string; grupos: readonly GrupoNoCaminho[] }) {
  return (
    <p className="paragrafo-caminho" data-testid="paragrafo-caminho">
      <span className="paragrafo-livro">{livro}</span>
      {grupos.map((g, i) => (
        <Fragment key={g.id}>
          <span className="paragrafo-sep" aria-hidden="true">
            {i === 0 ? ' · ' : ' › '}
          </span>
          <Link to={`/grupo/${encodeURIComponent(g.id)}`}>{g.rotulo}</Link>
        </Fragment>
      ))}
    </p>
  )
}

/** Um vizinho nas setas do alto: a rota e o rótulo («§ 3», «p. 10», «TESTE I: 2»). */
export interface SetaDoVizinho {
  para: string
  rotulo: string
}

interface PropsDasSetas {
  rotulo: string
  anterior: SetaDoVizinho | null
  seguinte: SetaDoVizinho | null
  estado: unknown
  /** O nome acessível diz o sentido («Anterior: p. 10», «Seguinte: TESTE I: 2»); sem ele, só o rótulo (o § de sempre). */
  comDirecao?: boolean
}

/** ‹ › do alto: trocam a entrada do histórico (`replace`), levando o estado (a origem, decisão 85). */
export function SetasDosVizinhos({ rotulo, anterior, seguinte, estado, comDirecao = false }: PropsDasSetas) {
  return (
    <nav className="paragrafo-setas" aria-label={rotulo}>
      {anterior && (
        <Link to={anterior.para} replace state={estado} aria-label={comDirecao ? `Anterior: ${anterior.rotulo}` : anterior.rotulo}>
          <Icon name="anterior" size={18} />
          <span>{anterior.rotulo}</span>
        </Link>
      )}
      {seguinte && (
        <Link to={seguinte.para} replace state={estado} aria-label={comDirecao ? `Seguinte: ${seguinte.rotulo}` : seguinte.rotulo}>
          <span>{seguinte.rotulo}</span>
          <Icon name="proximo" size={18} />
        </Link>
      )}
    </nav>
  )
}

interface PropsDasFiguras {
  figuras: readonly ObjetoResumo[]
  /** O título da faixa e o nome da região. */
  titulo?: string
  /** Quantas aparecem antes de «Mostrar todas (N)» (uma linha); sem limite, todas (a faixa rola no celular). */
  limite?: number
}

/** A faixa «Figuras citadas»: a miniatura, o rótulo do livro («TESTEG: 1a») e o sítio; cada uma leva a origem (decisão 85). */
export function FigurasCitadas({ figuras, titulo = 'Figuras citadas', limite }: PropsDasFiguras) {
  const sitios = useSitiosVivos(false)
  const [todas, setTodas] = useState(false)
  const idDaFaixa = useId()
  const corta = limite !== undefined && figuras.length > limite
  const visiveis = corta && !todas ? figuras.slice(0, limite) : figuras
  return (
    <section className="paragrafo-figuras" aria-label={titulo}>
      <h2 className="paragrafo-cab-secao">
        {titulo} <span className="codigo">{figuras.length}</span>
      </h2>
      <div className="paragrafo-faixa" id={idDaFaixa}>
        {visiveis.map((f) => {
          const s = sitios.doResumo(f)
          return (
            <LinkComOrigem key={f.numero} className="paragrafo-figura" to={`/item/${encodeURIComponent(f.numero)}`}>
              <span className="paragrafo-figura-imagem">
                <MiniaturaDoObjeto numero={f.numero} caminho={f.miniatura} alt={f.tipo ?? `Objeto ${f.numero}`} />
              </span>
              <span className="paragrafo-figura-rotulo">{f.origem}</span>
              <span className="paragrafo-figura-sitio">{[s.nome, s.marca].filter(Boolean).join(' · ') || 'sem sítio'}</span>
            </LinkComOrigem>
          )
        })}
      </div>
      {corta && (
        <button type="button" className="paragrafo-mais-figuras" aria-expanded={todas} aria-controls={idDaFaixa} onClick={() => setTodas((t) => !t)}>
          {todas ? 'Mostrar menos' : `Mostrar todas (${figuras.length})`}
        </button>
      )}
    </section>
  )
}

/**
 * O trilho fechado do alemão ou do inglês, no computador: abre a coluna. O nome acessível contém o texto à vista («Abrir o
 * Alemão · TESTEG 2021»; WCAG 2.5.3, revisão da Tarefa 25, 8): o «Abrir o» só para o leitor de tela.
 */
export function Trilho({ lingua, fonte, linhas, aoAbrir }: { lingua: 'de' | 'en'; fonte: string; linhas: number; aoAbrir: () => void }) {
  return (
    <button type="button" className={`paragrafo-trilho paragrafo-trilho-${lingua}`} style={{ gridRow: `1 / span ${linhas}` }} onClick={aoAbrir}>
      <Icon name="adicionar" size={18} />
      <span>
        <span className="so-leitor">Abrir o</span> <b>{NOME[lingua]}</b> · {fonte}
      </span>
    </button>
  )
}

/** As abas das línguas no celular (`linguas` na ordem das abas); ← → andam entre elas, Home e End vão às pontas. `id`: o prefixo dos ids. */
export function AbasDasLinguas({ linguas, atual, aoEscolher, id }: { linguas: readonly Lingua[]; atual: Lingua; aoEscolher: (l: Lingua) => void; id: string }) {
  return (
    <div className="paragrafo-abas">
      <div className="paragrafo-abas-lista" role="tablist" aria-label="Língua">
        {linguas.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            id={`${id}-${l}`}
            aria-selected={atual === l}
            aria-controls={`${id}-painel`}
            tabIndex={atual === l ? 0 : -1}
            onClick={() => aoEscolher(l)}
            onKeyDown={(e) => {
              const i = linguas.indexOf(l)
              // ← → andam em volta; Home e End vão à primeira e à última (revisão da Tarefa 25, 8)
              const proxima =
                e.key === 'ArrowRight'
                  ? linguas[(i + 1) % linguas.length]
                  : e.key === 'ArrowLeft'
                    ? linguas[(i + linguas.length - 1) % linguas.length]
                    : e.key === 'Home'
                      ? linguas[0]
                      : e.key === 'End'
                        ? linguas.at(-1)
                        : null
              if (!proxima) return
              e.preventDefault()
              aoEscolher(proxima)
              document.getElementById(`${id}-${proxima}`)?.focus()
            }}
          >
            {ABA[l]}
          </button>
        ))}
      </div>
    </div>
  )
}

interface PropsDaGrade {
  computador: boolean
  /** As linhas da grade (subgrid): cada coluna as ocupa todas, e cada trecho fica na mesma linha nas línguas. */
  linhas: number
  deAberto: boolean
  enAberto: boolean
  /** Uma classe a mais (a leitura do IPIAO, só com DE | PT). */
  classe?: string
  /** O prefixo dos ids das abas (o painel do celular é rotulado pela aba de `atual`). */
  id: string
  atual: Lingua
  children: ReactNode
}

/** A grade das línguas: no computador, as colunas (e os trilhos) lado a lado; no celular, o painel da aba. */
export function GradeDasLinguas({ computador, linhas, deAberto, enAberto, classe, id, atual, children }: PropsDaGrade) {
  const extra = classe ? ` ${classe}` : ''
  return computador ? (
    <div className={`paragrafo-linguas${deAberto ? ' de-aberto' : ''}${enAberto ? ' en-aberto' : ''}${extra}`} style={{ gridTemplateRows: `repeat(${linhas}, auto)` }}>
      {children}
    </div>
  ) : (
    <div className={`paragrafo-linguas${extra}`} role="tabpanel" id={`${id}-painel`} aria-labelledby={`${id}-${atual}`}>
      {children}
    </div>
  )
}

/** Um vizinho no pé: a rota, o título («§ 1», «p. 10»), a primeira frase e, quando o tipo muda, a etiqueta dele. */
export interface VizinhoNoPe {
  para: string
  titulo: string
  frase: string | null
  /** «Entrada do catálogo», «Introdução do grupo»…: antes da frase, quando o passo vizinho é de outro tipo. */
  tipo?: string | null
}

function FraseDoVizinho({ v }: { v: VizinhoNoPe }) {
  if (!v.frase && !v.tipo) return null
  return (
    <span>
      {v.tipo && <span className="paragrafo-pe-tipo">{v.tipo} · </span>}
      {v.frase}
    </span>
  )
}

/** O pé: o vizinho anterior e o seguinte, com a primeira frase; trocam a entrada do histórico, levando o estado. */
export function PeDosVizinhos({ rotulo, anterior, seguinte, estado }: { rotulo: string; anterior: VizinhoNoPe | null; seguinte: VizinhoNoPe | null; estado: unknown }) {
  if (!anterior && !seguinte) return null
  return (
    <nav className="paragrafo-pe" aria-label={rotulo}>
      {anterior ? (
        <Link to={anterior.para} replace state={estado} className="paragrafo-pe-anterior">
          <b>‹ {anterior.titulo}</b>
          <FraseDoVizinho v={anterior} />
        </Link>
      ) : (
        <span />
      )}
      {seguinte && (
        <Link to={seguinte.para} replace state={estado} className="paragrafo-pe-seguinte">
          <b>{seguinte.titulo} ›</b>
          <FraseDoVizinho v={seguinte} />
        </Link>
      )}
    </nav>
  )
}
