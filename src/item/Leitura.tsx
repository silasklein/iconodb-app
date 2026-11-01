import { useMemo, type MouseEvent } from 'react'
import { Link, useLocation } from 'react-router'
import type { Ancora, Termo } from '../banco/tipos'
import { partesDaFonte, ROTULO_DA_MODALIDADE, ROTULO_DO_NIVEL } from './rotulos'
import { montarTrechos, type LinkNoTexto, type Peca } from './trechos'
import './Leitura.css'

export type Idioma = 'pt' | 'de'

const SEM_LINKS: readonly LinkNoTexto[] = []

interface Props {
  /** "TESTE I, 2". */
  fonte: string
  publicacao: string
  /** Português; null quando ainda não há tradução. */
  texto: string | null
  /** Alemão, como impresso. */
  original: string
  termos: readonly Termo[]
  ancoras: readonly Ancora[]
  /** Links achados no texto português (citação → obra, número → item), em UTF-16. */
  links?: readonly LinkNoTexto[]
  idioma?: Idioma
  /** A hipótese aberta no painel: a âncora dela fica destacada. */
  hipoteseAtiva?: string | null
  /** Quem abre uma hipótese (para devolver o foco a ela ao fechar o painel). */
  aoAbrirHipotese?: (id: string, gatilho: HTMLElement) => void
}

/**
 * A leitura de uma fonte (Item.dc.html): o rótulo da fonte na coluna da esquerda e o texto.
 * Em português, os termos são links finos ao verbete, os trechos de hipótese são pontilhados e
 * abrem o painel (`?hipotese=<id>`, trocando a entrada do histórico), e citações e números
 * levam à obra e ao item. Em alemão (`idioma="de"`), só o original, sem marcas.
 */
export function Leitura({ fonte, publicacao, texto, original, termos, ancoras, links = SEM_LINKS, idioma = 'pt', hipoteseAtiva = null, aoAbrirHipotese }: Props) {
  const { sigla, resto } = partesDaFonte(fonte, publicacao)
  const emPortugues = idioma === 'pt' && texto !== null
  const pecas = useMemo(() => (texto === null ? [] : montarTrechos(texto, { termos, ancoras, links })), [texto, termos, ancoras, links])

  return (
    <div className="leitura">
      <div className="leitura-fonte" data-testid="leitura-fonte">
        <span className="leitura-sigla">{sigla}</span>
        {resto && <span className="leitura-numero">{resto}</span>}
      </div>
      <div className="leitura-corpo">
        {idioma === 'pt' && texto === null && <p className="leitura-aviso">Sem tradução ainda; o original, em alemão.</p>}
        {emPortugues ? (
          <p className="leitura-texto" lang="pt-BR">
            {pecas.map((p, i) => (
              <PecaDoTexto key={i} peca={p} ativa={hipoteseAtiva} aoAbrir={aoAbrirHipotese} />
            ))}
          </p>
        ) : (
          <p className="leitura-texto" lang="de">
            {original}
          </p>
        )}
      </div>
    </div>
  )
}

function PecaDoTexto({ peca, ativa, aoAbrir }: { peca: Peca; ativa: string | null; aoAbrir?: Props['aoAbrirHipotese'] }) {
  const { pathname, state } = useLocation()
  switch (peca.tipo) {
    case 'texto':
      return <>{peca.texto}</>
    case 'termo':
      return (
        <Link className="termo" to={`/verbete/${encodeURIComponent(peca.glId)}`}>
          {peca.texto}
        </Link>
      )
    case 'link':
      return (
        <Link className="link-texto" to={peca.destino} aria-label={peca.rotulo}>
          {peca.texto}
        </Link>
      )
    case 'ancora': {
      const id = peca.hipoteses[0]!
      const aberta = ativa !== null && peca.hipoteses.includes(ativa)
      const nota = `${ROTULO_DO_NIVEL[peca.nivel].toLowerCase()}, ${ROTULO_DA_MODALIDADE[peca.modalidade]}`
      const mais = peca.hipoteses.length > 1 ? `; mais ${peca.hipoteses.length - 1} no mesmo trecho` : ''
      return (
        <Link
          className={`ancora${aberta ? ' ancora-ativa' : ''}`}
          to={{ pathname, search: `?hipotese=${encodeURIComponent(id)}` }}
          state={state}
          replace
          aria-haspopup="dialog"
          aria-expanded={aberta}
          data-hipotese={id}
          data-hipoteses={peca.hipoteses.join(' ')}
          onClick={(e: MouseEvent<HTMLAnchorElement>) => aoAbrir?.(id, e.currentTarget)}
        >
          {peca.partes.map((parte, i) =>
            parte.tipo === 'termo' ? (
              <span key={i} className="termo-marcado" data-verbete={parte.glId}>
                {parte.texto}
              </span>
            ) : (
              <span key={i}>{parte.texto}</span>
            ),
          )}
          <span className="so-leitor">{`, hipótese: ${nota}${mais}`}</span>
        </Link>
      )
    }
  }
}
