import { useId } from 'react'
import { Link } from 'react-router'
import type { NoLivro as LugarNoLivro } from '../banco/tipos'
import { chaveDaObra, rotuloDaObra, tituloDoGrupo, type TituloDoLivro as Titulo } from '../telas/obras'
import type { Idioma } from './Leitura'
import './NoLivro.css'

/** O título da subcoleção no caminho: o número do sumário e o título («1.2–1.3 Figuras de prova e sinais de teste»). */
function tituloDaSubcolecao(s: NonNullable<LugarNoLivro['subcolecao']>, idioma: Idioma): Titulo {
  const titulo = idioma === 'de' ? s.tituloDe : s.titulo
  return { texto: [s.numero, titulo].filter(Boolean).join(' '), ...(idioma === 'de' ? { lang: 'de' as const } : {}) }
}

/**
 * «No livro» (quadro `Objeto`): uma linha por lugar do objeto nos livros, com o caminho em links: o período (a obra nas
 * Coleções) › o grupo › a subcoleção, quando há. Com o original alemão ligado, os títulos do livro em alemão; o período não
 * tem original no pacote e fica em português. Sem lugar (objeto fora de grupo), nada.
 */
export function NoLivro({ lugares, idioma }: { lugares: readonly LugarNoLivro[]; idioma: Idioma }) {
  const id = useId()
  if (lugares.length === 0) return null
  return (
    <section className="no-livro" aria-labelledby={id}>
      <h2 className="no-livro-rotulo" id={id}>
        No livro
      </h2>
      {lugares.map((l) => {
        const grupo = tituloDoGrupo(l.grupo, idioma)
        const sub = l.subcolecao ? { id: l.subcolecao.id, ...tituloDaSubcolecao(l.subcolecao, idioma) } : null
        return (
          <p className="no-livro-caminho" key={`${l.grupo.id}|${l.subcolecao?.id ?? ''}`}>
            <Link to={`/colecoes?obra=${encodeURIComponent(chaveDaObra(l.publicacao, l.volume))}`}>{l.periodo ?? rotuloDaObra(l.publicacao, l.volume)}</Link>
            <Separador />
            <Link to={`/grupo/${encodeURIComponent(l.grupo.id)}`} lang={grupo.lang}>
              {grupo.texto}
            </Link>
            {sub && (
              <>
                <Separador />
                <Link to={`/grupo/${encodeURIComponent(sub.id)}`} lang={sub.lang}>
                  {sub.texto}
                </Link>
              </>
            )}
          </p>
        )
      })}
    </section>
  )
}

function Separador() {
  return (
    <span className="no-livro-sep" aria-hidden="true">
      {' › '}
    </span>
  )
}
