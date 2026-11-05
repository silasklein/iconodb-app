import { Fragment, useId, type MouseEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import type { CampoDoCatalogo, Hipotese, ItemDetalhe, Nivel } from '../banco/tipos'
import { formatarLocalizador } from '../banco/referencias'
import { NIVEIS } from '../banco/tipos'
import { Icon } from '../ui/Icon'
import { MarcadorDeNivel, TEXTO_DO_NIVEL } from '../ui/MarcadorDeNivel'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useFormasEmUso, useNomeVivo } from '../glossario/doUsuario'
import { exibirTermo } from '../glossario/exibirTermo'
import { useFormasDoPacote } from '../glossario/formasDoPacote'
import type { PorNivel } from '../hipoteses/doUsuario'
import { nomeDaHipoteseSkc, type HipoteseSkc } from '../hipoteses/modelo'
import type { Idioma } from './Leitura'
import { ajustarDica } from './posicaoDaDica'
import { LEGENDA_CURTA, LINHA_DO_NIVEL, nomeDaHipotese, ROTULO_DA_MODALIDADE, ROTULO_DO_NIVEL, sobreDaHipotese, temAncora } from './rotulos'
import { chaveDoTermo, chavesDosTermos, montarTrechos } from './trechos'
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

const SEM_SKC: PorNivel = { pre_iconographic: [], iconographic: [], iconological: [], semNivel: [] }

/** Quantas hipóteses (do livro e SKC) há por nível: a contagem da seção. */
export const contarHipoteses = (item: Pick<ItemDetalhe, 'hipotesesPorNivel'>, skc: PorNivel = SEM_SKC) =>
  NIVEIS.reduce((n, nv) => n + item.hipotesesPorNivel[nv].length + skc[nv].length, 0) + skc.semNivel.length

/**
 * Uma parte de "Hipóteses por nível": o nível (com marcador e linha explicativa), ou um grupo sem nível. A coluna do
 * marcador existe sempre (vazia, sem nível), para os títulos ficarem na mesma vertical. O marcador do título não diz o nível
 * ao leitor de tela: o nome está escrito ao lado, e a região e o título já o dizem.
 */
function BlocoDoNivel({ titulo, nivel, quantas, children }: { titulo: string; nivel?: Nivel; quantas: number; children: ReactNode }) {
  const id = useId()
  return (
    <section className="hipoteses-nivel" aria-labelledby={id}>
      <div className="nivel-cabeca">
        {nivel ? <MarcadorDeNivel nivel={nivel} tamanho="titulo" comTexto={false} /> : <span aria-hidden="true" />}
        <div className="nivel-titulos">
          <h3 id={id}>{titulo}</h3>
          {nivel && <p className="nivel-explica">{LINHA_DO_NIVEL[nivel]}</p>}
        </div>
        {/* O número é só visual; o leitor de tela ouve «2 hipóteses» (um aria-label num span não vale: o papel genérico não tem nome). */}
        <span className="nivel-contagem codigo">
          <span aria-hidden="true">{quantas}</span>
          <span className="so-leitor">{`${quantas} ${quantas === 1 ? 'hipótese' : 'hipóteses'}`}</span>
        </span>
      </div>
      <div className="nivel-linhas">{children}</div>
    </section>
  )
}

/**
 * A legenda dos marcadores, uma vez por seção, depois de «Registrar hipótese» (decisão 52). No computador, a do desenho: uma
 * linha por nível, o nome e a explicação, e a regra dos quadrados. No celular, uma linha só («■□□ vê · ■■□ significa · ■■■ cultura»);
 * os nomes completos ficam para o leitor de tela.
 */
function LegendaDosNiveis() {
  const compacta = useBreakpoint() === 'celular'
  if (compacta) {
    return (
      <div className="nivel-legenda nivel-legenda-compacta" role="group" aria-label="Legenda dos níveis">
        {NIVEIS.map((n, i) => (
          <Fragment key={n}>
            {i > 0 && (
              <span className="nivel-legenda-ponto" aria-hidden="true">
                ·
              </span>
            )}
            <span className="nivel-legenda-item">
              <MarcadorDeNivel nivel={n} tamanho="painel" comTexto={false} />
              <span aria-hidden="true">{LEGENDA_CURTA[n]}</span>
              <span className="so-leitor">{`${ROTULO_DO_NIVEL[n]}, ${LINHA_DO_NIVEL[n].toLowerCase()}`}</span>
            </span>
          </Fragment>
        ))}
      </div>
    )
  }
  return (
    <div className="nivel-legenda" role="group" aria-label="Legenda dos níveis">
      <span className="nivel-legenda-titulo" aria-hidden="true">
        Legenda
      </span>
      {NIVEIS.map((n) => (
        <div key={n} className="nivel-legenda-linha">
          <MarcadorDeNivel nivel={n} tamanho="painel" comTexto={false} />
          <span>
            <strong>{ROTULO_DO_NIVEL[n]}</strong> <span className="nivel-legenda-explica">· {LINHA_DO_NIVEL[n]}</span>
          </span>
        </div>
      ))}
      <p>Quadrados cheios = profundidade da interpretação. O nome escrito fica sempre ao lado no título do nível e no painel.</p>
    </div>
  )
}

/**
 * As linhas de "Hipóteses por nível" (decisão 35): cada nível é um bloco, com o marcador ■□□ / ■■□ / ■■■, o nome, a linha
 * "O que se vê / O que significa / O que revela da cultura" e a contagem. Cada linha abre o painel da hipótese
 * (`?hipotese=<id>`) e leva o marcador do nível dela. As hipóteses SKC (Tarefa 10) entram no nível delas, depois das do
 * livro, com a marca SKC. Nível sem hipótese não aparece; uma SKC sem nível fica em "Sem nível", sem marcador. `acoes` (o botão
 * «Registrar hipótese») vem logo depois dos blocos, e a legenda depois dele (decisão 52).
 */
export function HipotesesPorNivel({
  item,
  aoAbrir,
  skc = SEM_SKC,
  acoes,
}: {
  item: Pick<ItemDetalhe, 'hipotesesPorNivel' | 'outrasHipoteses'>
  aoAbrir?: (id: string, gatilho: HTMLElement) => void
  skc?: PorNivel
  acoes?: ReactNode
}) {
  const niveis = NIVEIS.filter((n) => item.hipotesesPorNivel[n].length + skc[n].length > 0)
  if (niveis.length === 0 && item.outrasHipoteses.length === 0 && skc.semNivel.length === 0)
    return (
      <>
        <p className="secao-vazia">Nenhuma hipótese registrada para este objeto.</p>
        {acoes}
      </>
    )
  return (
    <>
      {niveis.map((n: Nivel) => (
        <BlocoDoNivel key={n} titulo={ROTULO_DO_NIVEL[n]} nivel={n} quantas={item.hipotesesPorNivel[n].length + skc[n].length}>
          {item.hipotesesPorNivel[n].map((h) => (
            <LinhaDeHipotese key={h.id} h={h} aoAbrir={aoAbrir} />
          ))}
          {skc[n].map((h) => (
            <LinhaSkc key={h.id} h={h} aoAbrir={aoAbrir} />
          ))}
        </BlocoDoNivel>
      ))}
      {skc.semNivel.length > 0 && (
        <BlocoDoNivel titulo="Sem nível" quantas={skc.semNivel.length}>
          {skc.semNivel.map((h) => (
            <LinhaSkc key={h.id} h={h} aoAbrir={aoAbrir} />
          ))}
        </BlocoDoNivel>
      )}
      {item.outrasHipoteses.length > 0 && (
        <BlocoDoNivel titulo="Sobre outros objetos" quantas={item.outrasHipoteses.length}>
          {item.outrasHipoteses.map((h) => (
            <LinhaDeHipotese key={h.id} h={h} aoAbrir={aoAbrir} outro />
          ))}
        </BlocoDoNivel>
      )}
      {acoes}
      {(niveis.length > 0 || item.outrasHipoteses.length > 0) && <LegendaDosNiveis />}
    </>
  )
}

/** «nome · alvo · sem trecho»: no celular o alvo e o aviso descem para uma segunda linha; no computador ficam na mesma (CSS). */
function TextoDaLinha({ nome, aposONome, sobre, aviso }: { nome: string; aposONome?: ReactNode; sobre: string; aviso: string | null }) {
  return (
    <span className="item-hipotese-linha-texto">
      <span className="item-hipotese-linha-nome">{nome}</span>
      {aposONome}{' '}
      <span className="item-hipotese-linha-sep" aria-hidden="true">
        ·{' '}
      </span>
      <span className="item-hipotese-linha-sobre">
        {sobre}
        {aviso && (
          <>
            {' '}
            <span className="item-hipotese-linha-aviso">
              {/* espaço que não quebra: o «·» fica colado à primeira palavra do aviso (T17-C-23) */}
              <span aria-hidden="true">·{'\u00a0'}</span>
              {aviso}
            </span>
          </>
        )}
      </span>
    </span>
  )
}

function LinhaDeHipotese({ h, aoAbrir, outro = false }: { h: Hipotese; aoAbrir?: (id: string, gatilho: HTMLElement) => void; outro?: boolean }) {
  const { pathname, state } = useLocation()
  const formas = useFormasEmUso()
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
      <span className="item-hipotese-linha-marcador">
        <MarcadorDeNivel nivel={h.nivel} comTexto={false} />
      </span>
      {/* Num bloco de nível o nível já está no nome da região; em «Sobre outros objetos» os níveis se misturam, e o nível vem DEPOIS do termo. */}
      <TextoDaLinha
        nome={nomeDaHipotese(h, formas)}
        aposONome={outro && <span className="so-leitor">{`, ${TEXTO_DO_NIVEL[h.nivel]}`}</span>}
        sobre={sobre}
        aviso={temAncora(h) ? null : 'sem trecho no texto PT'}
      />{' '}
      <span className="item-hipotese-linha-modalidade codigo">{ROTULO_DA_MODALIDADE[h.modalidade]}</span>
    </Link>
  )
}

function LinhaSkc({ h, aoAbrir }: { h: HipoteseSkc; aoAbrir?: (id: string, gatilho: HTMLElement) => void }) {
  const { pathname, state } = useLocation()
  const nomeDe = useNomeVivo()
  const nome = nomeDaHipoteseSkc(h, nomeDe)
  const sobre = h.sobre.tipo === 'elemento' ? h.sobre.rotulo || 'região' : 'objeto inteiro'
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
      <span className="item-hipotese-linha-marcador">
        <MarcadorDeNivel nivel={h.nivel} comTexto={false} />
      </span>
      <TextoDaLinha nome={nome} sobre={sobre} aviso={h.ancora ? null : 'sem trecho'} />{' '}
      <span className="item-hipotese-linha-modalidade codigo">
        <span className="marca-skc">SKC</span> {h.modalidade ? ROTULO_DA_MODALIDADE[h.modalidade] : ''}
      </span>
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
  // Como na Leitura: o termo inteiro aparece com a forma em uso do usuário (Tarefa 11); aqui não há posições a guardar.
  const formas = useFormasEmUso()
  const doPacote = useFormasDoPacote()
  const inteiros = chavesDosTermos(texto, termos)
  let b = 0
  return (
    <>
      {montarTrechos(texto, { termos }).map((p, i) => {
        const inicio = b
        b += p.tipo === 'ancora' ? p.partes.reduce((n, x) => n + x.texto.length, 0) : p.texto.length
        if (p.tipo !== 'termo') return <Fragment key={i}>{p.tipo === 'ancora' ? p.partes.map((x) => x.texto).join('') : p.texto}</Fragment>
        const forma = formas.get(p.glId)
        const { texto: mostrado, dica, nome } = forma !== undefined && inteiros.has(chaveDoTermo(inicio, inicio + p.texto.length, p.glId)) ? exibirTermo(p.texto, forma, doPacote?.get(p.glId)) : { texto: p.texto, dica: null, nome: null }
        return (
          <Link
            key={i}
            className={`termo${dica ? ' tip-start' : ''}`}
            to={`/verbete/${encodeURIComponent(p.glId)}`}
            aria-label={nome ?? undefined}
            data-tip={dica ?? undefined}
            onPointerEnter={dica ? (e) => ajustarDica(e.currentTarget) : undefined}
            onFocus={dica ? (e) => ajustarDica(e.currentTarget) : undefined}
          >
            {mostrado}
          </Link>
        )
      })}
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
                {p.locator && <span className="relacoes-nota">{formatarLocalizador(p.locator)}</span>}
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
