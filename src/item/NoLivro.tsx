import { useId } from 'react'
import { Link } from 'react-router'
import { OrigemDosLinks } from '../app/OrigemDosLinks'
import { passoDoItem } from '../banco/leitura'
import type { NoLivro as LugarNoLivro } from '../banco/tipos'
import { BotaoDaLeitura, useRotaDaLeitura } from '../leitura/LerNoLivro'
import { chaveDaObra, rotuloDaObra, tituloDoGrupo, type TituloDoLivro as Titulo } from '../telas/obras'
import { rotuloDaSubcolecao } from '../ui/tituloDoGrupo'
import type { Idioma } from './Leitura'
import './NoLivro.css'

/**
 * O título da subcoleção no caminho: o número do sumário e o título («1.2–1.3 Figuras de prova e sinais de teste»; «1. Selos
 * de prova…» na seção do livro em parágrafos), pela regra do caminho da página do § (`rotuloDaSubcolecao`, Tarefa 6).
 */
function tituloDaSubcolecao(s: NonNullable<LugarNoLivro['subcolecao']>, idioma: Idioma): Titulo {
  return { texto: rotuloDaSubcolecao(s.numero, idioma === 'de' ? s.tituloDe : s.titulo), ...(idioma === 'de' ? { lang: 'de' as const } : {}) }
}

/**
 * «No livro» (quadro `Objeto`): uma linha por lugar do objeto nos livros. A linha começa com o nome do livro em texto
 * («IPIAO III · …», decisões 83 e 87), para distinguir as linhas quando o objeto está em mais de um livro, e segue com o
 * caminho em links: o período (a obra nas Coleções) › o grupo › a subcoleção, quando há. Sem período, o link já mostra o
 * nome do livro, que então não se repete. Com o original alemão ligado, os títulos do livro em alemão; o nome do livro e o
 * período não têm original no pacote e ficam como estão. Sem lugar (objeto fora de grupo), nada.
 * A linha do livro em parágrafos (o GGG, Tarefa 26) não tem período: «GGG · III. capítulo › 1. seção», com o capítulo e a seção
 * em links (o capítulo é o grupo de cima).
 * A linha do catálogo leva, embaixo, «Ler no livro» (Tarefa 5 da leitura): o passo da entrada do item na leitura da obra.
 * `origens`: o rótulo de cada item do objeto («TESTE I: 3»), a origem que o botão leva à leitura.
 */
export function NoLivro({ lugares, idioma, origens }: { lugares: readonly LugarNoLivro[]; idioma: Idioma; origens?: ReadonlyMap<string, string | null> }) {
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
          <div className="no-livro-lugar" key={`${l.grupo.id}|${l.subcolecao?.id ?? ''}`}>
            <p className="no-livro-caminho">
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
            <LerAEntrada itemId={l.itemId} origem={origens?.get(l.itemId) ?? null} />
          </div>
        )
      })}
    </section>
  )
}

/**
 * «Ler no livro» da linha do catálogo (Tarefa 5 da leitura, desenho 3): abre o passo da entrada do item na leitura da obra,
 * levando a origem (decisão 85) com o rótulo do item («TESTE I: 3»): a leitura mostra «‹ TESTE I: 3». O livro em parágrafos
 * (o GGG) não tem passo de leitura: a linha dele fica sem o botão.
 */
function LerAEntrada({ itemId, origem }: { itemId: string; origem: string | null }) {
  const leitura = useRotaDaLeitura(passoDoItem, itemId)
  return leitura ? (
    <OrigemDosLinks rotulo={origem}>
      <BotaoDaLeitura para={leitura} rotulo="Ler no livro" />
    </OrigemDosLinks>
  ) : null
}

function Separador() {
  return (
    <span className="no-livro-sep" aria-hidden="true">
      {' › '}
    </span>
  )
}
