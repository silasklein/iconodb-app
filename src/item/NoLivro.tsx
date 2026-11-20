import { useId } from 'react'
import { Link } from 'react-router'
import type { NoLivro as LugarNoLivro } from '../banco/tipos'
import { chaveDaObra, rotuloDaObra, tituloDoGrupo, type TituloDoLivro as Titulo } from '../telas/obras'
import type { Idioma } from './Leitura'
import './NoLivro.css'

/**
 * O título da subcoleção no caminho: o número do sumário e o título («1.2–1.3 Figuras de prova e sinais de teste»). Na seção
 * do livro em parágrafos, o número simples leva o ponto, como no caminho da página do § («1. Selos de prova…», Tarefa 26).
 */
function tituloDaSubcolecao(s: NonNullable<LugarNoLivro['subcolecao']>, idioma: Idioma, emParagrafos: boolean): Titulo {
  const titulo = idioma === 'de' ? s.tituloDe : s.titulo
  const numero = emParagrafos && /^[\dIVXLC]+$/i.test(s.numero) && !titulo.startsWith(`${s.numero}.`) ? `${s.numero}.` : s.numero
  return { texto: [numero, titulo].filter(Boolean).join(' '), ...(idioma === 'de' ? { lang: 'de' as const } : {}) }
}

/**
 * «No livro» (quadro `Objeto`): uma linha por lugar do objeto nos livros. A linha começa com o nome do livro em texto
 * («IPIAO III · …», decisões 83 e 87), para distinguir as linhas quando o objeto está em mais de um livro, e segue com o
 * caminho em links: o período (a obra nas Coleções) › o grupo › a subcoleção, quando há. Sem período, o link já mostra o
 * nome do livro, que então não se repete. Com o original alemão ligado, os títulos do livro em alemão; o nome do livro e o
 * período não têm original no pacote e ficam como estão. Sem lugar (objeto fora de grupo), nada.
 * A linha do livro em parágrafos (o GGG, Tarefa 26) não tem período: «GGG · III. capítulo › 1. seção», com o capítulo e a seção
 * em links (o capítulo é o grupo de cima).
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
        const sub = l.subcolecao ? { id: l.subcolecao.id, ...tituloDaSubcolecao(l.subcolecao, idioma, l.emParagrafos) } : null
        // Um período vazio ('' no pacote) conta como sem período: o nome do livro vira o link, sem repetir.
        const periodo = l.periodo?.trim() || null
        if (l.emParagrafos) {
          return (
            <p className="no-livro-caminho" key={`${l.grupo.id}|${l.subcolecao?.id ?? ''}`}>
              <span className="no-livro-livro">{rotuloDaObra(l.publicacao, l.volume)}</span>
              <span className="no-livro-sep" aria-hidden="true">
                {' · '}
              </span>
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
        }
        return (
          <p className="no-livro-caminho" key={`${l.grupo.id}|${l.subcolecao?.id ?? ''}`}>
            {periodo && (
              <>
                <span className="no-livro-livro">{rotuloDaObra(l.publicacao, l.volume)}</span>
                <span className="no-livro-sep" aria-hidden="true">
                  {' · '}
                </span>
              </>
            )}
            <Link to={`/colecoes?obra=${encodeURIComponent(chaveDaObra(l.publicacao, l.volume))}`}>{periodo ?? rotuloDaObra(l.publicacao, l.volume)}</Link>
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
