import { Fragment, type MouseEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import type { CampoDoCatalogo, Hipotese, ItemDetalhe, Nivel } from '../banco/tipos'
import { NIVEIS } from '../banco/tipos'
import { Icon } from '../ui/Icon'
import type { Idioma } from './Leitura'
import { nomeDaHipotese, ROTULO_DA_MODALIDADE, ROTULO_DO_NIVEL, sobreDaHipotese, temAncora } from './rotulos'
import { montarTrechos } from './trechos'
import './Secoes.css'

interface PropsDaSecao {
  id: string
  titulo: string
  contagem?: string | number | null
  aberta: boolean
  aoAlternar: () => void
  children: ReactNode
}

/** Uma seção recolhível (Item.dc.html): o título é um botão com aria-expanded; aberta, vira uma região. */
export function Secao({ id, titulo, contagem, aberta, aoAlternar, children }: PropsDaSecao) {
  return (
    <section className="secao" id={`secao-${id}`}>
      <h2 className="secao-titulo">
        <button type="button" aria-expanded={aberta} aria-controls={aberta ? `secao-${id}-corpo` : undefined} onClick={aoAlternar}>
          <span>{titulo}</span>
          <span className="secao-meta">
            {contagem !== null && contagem !== undefined && contagem !== '' && <span className="codigo">{contagem}</span>}
            <Icon name={aberta ? 'recolher' : 'adicionar'} size={18} />
          </span>
        </button>
      </h2>
      {aberta && (
        <div className="secao-corpo" id={`secao-${id}-corpo`} role="region" aria-label={titulo}>
          {children}
        </div>
      )}
    </section>
  )
}

/** As linhas de "Hipóteses por nível": cada uma abre o painel da hipótese (`?hipotese=<id>`). */
export function HipotesesPorNivel({
  item,
  aoAbrir,
}: {
  item: Pick<ItemDetalhe, 'hipotesesPorNivel' | 'outrasHipoteses'>
  aoAbrir?: (id: string, gatilho: HTMLElement) => void
}) {
  const niveis = NIVEIS.filter((n) => item.hipotesesPorNivel[n].length > 0)
  if (niveis.length === 0 && item.outrasHipoteses.length === 0) return <p className="secao-vazia">Nenhuma hipótese registrada para este objeto.</p>
  return (
    <>
      {niveis.map((n: Nivel) => (
        <div key={n} className="hipoteses-nivel">
          <h3>{`${ROTULO_DO_NIVEL[n]} · ${item.hipotesesPorNivel[n].length}`}</h3>
          {item.hipotesesPorNivel[n].map((h) => (
            <LinhaDeHipotese key={h.id} h={h} aoAbrir={aoAbrir} />
          ))}
        </div>
      ))}
      {item.outrasHipoteses.length > 0 && (
        <div className="hipoteses-nivel">
          <h3>{`Sobre outros objetos · ${item.outrasHipoteses.length}`}</h3>
          {item.outrasHipoteses.map((h) => (
            <LinhaDeHipotese key={h.id} h={h} aoAbrir={aoAbrir} outro />
          ))}
        </div>
      )}
    </>
  )
}

function LinhaDeHipotese({ h, aoAbrir, outro = false }: { h: Hipotese; aoAbrir?: (id: string, gatilho: HTMLElement) => void; outro?: boolean }) {
  const { pathname, state } = useLocation()
  const sobre = outro ? [h.alvo.numero ?? h.alvo.id, h.alvo.rotulo].filter(Boolean).join(', ') : sobreDaHipotese(h)
  return (
    <Link
      className="item-hipotese-linha"
      to={{ pathname, search: `?hipotese=${encodeURIComponent(h.id)}` }}
      state={state}
      replace
      aria-haspopup="dialog"
      data-hipotese-linha={h.id}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => aoAbrir?.(h.id, e.currentTarget)}
    >
      <span className="item-hipotese-linha-texto">
        <span className="item-hipotese-linha-nome">{nomeDaHipotese(h)}</span>
        <span className="item-hipotese-linha-sobre">
          {` · ${sobre}`}
          {!temAncora(h) && ' · sem trecho no texto PT'}
        </span>
      </span>
      <span className="item-hipotese-linha-modalidade codigo">{ROTULO_DA_MODALIDADE[h.modalidade]}</span>
    </Link>
  )
}

const ROTULO_DA_CATEGORIA: Record<number, string> = {
  0: 'Aparato',
  3: 'Sítio e achado',
  4: 'Datação',
  5: 'Descrição',
  6: 'Medidas',
  7: 'Acervo e publicação',
  8: 'Paralelos',
}

/** Os campos 3–8 (e 0) do catálogo, cada um em português quando há, senão como impresso. */
export function Catalogo({ campos, idioma }: { campos: readonly CampoDoCatalogo[]; idioma: Idioma }) {
  if (campos.length === 0) return <p className="secao-vazia">Sem campos de catálogo.</p>
  return (
    <dl className="catalogo">
      {campos.map((c) => {
        const pt = idioma === 'pt' && c.texto !== null
        return (
          <Fragment key={c.unidade}>
            <dt>
              <span className="codigo">{c.categoria}</span> {ROTULO_DA_CATEGORIA[c.categoria] ?? 'Campo'}
            </dt>
            <dd lang={pt ? 'pt-BR' : 'de'}>{pt ? <TextoComTermos texto={c.texto!} termos={c.termos} /> : c.literal}</dd>
          </Fragment>
        )
      })}
    </dl>
  )
}

function TextoComTermos({ texto, termos }: { texto: string; termos: CampoDoCatalogo['termos'] }) {
  return (
    <>
      {montarTrechos(texto, { termos }).map((p, i) =>
        p.tipo === 'termo' ? (
          <Link key={i} className="termo" to={`/verbete/${encodeURIComponent(p.glId)}`}>
            {p.texto}
          </Link>
        ) : (
          <Fragment key={i}>{p.tipo === 'ancora' ? p.partes.map((x) => x.texto).join('') : p.texto}</Fragment>
        ),
      )}
    </>
  )
}

const GRAU = { strict: 'estrito', comparable: 'comparável' } as const

/** Paralelos (comparison) e remissões do texto (passage_item `mentions`). */
export function Relacoes({ relacoes }: { relacoes: ItemDetalhe['relacoes'] }) {
  const { paralelos, remissoes } = relacoes
  if (paralelos.length === 0 && remissoes.length === 0) return <p className="secao-vazia">Sem paralelos nem remissões.</p>
  return (
    <>
      {paralelos.length > 0 && (
        <div className="relacoes-grupo">
          <h3>Paralelos</h3>
          <ul>
            {paralelos.map((p, i) => (
              <li key={i}>
                <span className="relacoes-grau">{GRAU[p.grau]}</span>
                {p.numero ? (
                  <Link className="codigo" to={`/item/${encodeURIComponent(p.numero)}`}>
                    {p.numero}
                  </Link>
                ) : (
                  <span>{p.externo ?? p.itemId ?? '—'}</span>
                )}
                {p.semelhanca && <span className="relacoes-nota">{p.semelhanca}</span>}
                {p.locator && <span className="relacoes-nota">{p.locator}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {remissoes.length > 0 && (
        <div className="relacoes-grupo">
          <h3>Citados no texto</h3>
          <ul>
            {remissoes.map((r) => (
              <li key={r.itemId}>
                {r.numero ? (
                  <Link className="codigo" to={`/item/${encodeURIComponent(r.numero)}`}>
                    {r.numero}
                  </Link>
                ) : (
                  <span className="codigo">{r.itemId}</span>
                )}
                <span className="relacoes-nota">{r.origem ?? 'fora do pacote'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

/** As referências do objeto: a citação como impressa (link à obra quando resolvida) e a forma Chicago. */
export function Bibliografia({ referencias }: { referencias: ItemDetalhe['bibliografia'] }) {
  if (referencias.length === 0) return <p className="secao-vazia">Sem referências.</p>
  return (
    <ul className="bibliografia-item">
      {referencias.map((r) => (
        <li key={r.id}>
          {r.resolvida && r.obraId ? (
            <Link to={`/obra/${encodeURIComponent(r.obraId)}`} className="bibliografia-citacao">
              {r.bruto}
            </Link>
          ) : (
            <span className="bibliografia-citacao">{r.bruto}</span>
          )}
          {(r.chicagoHtml || r.chicago) && <span className="bibliografia-chicago">{r.chicagoHtml ? htmlComItalico(r.chicagoHtml) : r.chicago}</span>}
        </li>
      ))}
    </ul>
  )
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' }
/** As entidades HTML que a forma Chicago usa, em texto. */
export const decodificar = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e: string) => ENTIDADES[e]!)

/** O HTML da forma Chicago só usa <i>: desenha o itálico e descarta qualquer outra marcação (sem innerHTML). */
export function htmlComItalico(html: string): ReactNode[] {
  return html.split(/(<i>[\s\S]*?<\/i>)/).map((parte, i) => {
    const italico = /^<i>([\s\S]*)<\/i>$/.exec(parte)
    const texto = decodificar((italico ? italico[1]! : parte).replace(/<[^>]*>/g, ''))
    return italico ? <i key={i}>{texto}</i> : <Fragment key={i}>{texto}</Fragment>
  })
}
