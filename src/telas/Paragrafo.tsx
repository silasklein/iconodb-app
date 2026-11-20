import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { LinkComOrigem, OrigemDosLinks, useAoVoltarParaOrigem } from '../app/OrigemDosLinks'
import { comVoltar, lerVoltar, rotuloDoIconeDeVoltar, voltarDaOrigem } from '../app/voltar'
import { paragrafo as consultarParagrafo } from '../banco/consultas'
import { caminhoDoParagrafo } from '../banco/paragrafos'
import type { CorrecaoDeLeitura, ParagrafoDetalhe, ReferenciaDoParagrafo, Termo, TrechoDoParagrafo } from '../banco/tipos'
import { useFormasEmUso } from '../glossario/doUsuario'
import { exibirTermo } from '../glossario/exibirTermo'
import { useFormasDoPacote } from '../glossario/formasDoPacote'
import { VoltarDaOrigem } from '../item/VoltarDaOrigem'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { IconButton } from '../ui/IconButton'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { comModificador } from '../ui/useVoltar'
import { AbasDasLinguas, Caminho, FigurasCitadas, GradeDasLinguas, LANG, NOME, PeDosVizinhos, SetasDosVizinhos, Trilho, type Lingua } from '../paragrafo/pecas'
import {
  chamadasDeNota,
  descricaoDaRegra,
  gravarLinguasAbertas,
  lerLinguasAbertas,
  linksDasFiguras,
  pecasDoParagrafo,
  posicaoNaSecao,
  type LinguasAbertas,
  type PecaDoParagrafo,
} from './textoDoParagrafo'
import './Paragrafo.css'

/**
 * A página do § (Etapa 4, Tarefa 25; tela 2 aprovada; decisão 91, a4, a5 e a8), rota `/paragrafo/:sigla/:numero`: o livro em
 * parágrafos (o GGG) com o português no centro e o alemão (o texto lido e corrigido) e o inglês (o GGIG alinhado) ao lado.
 * - Fundo claro, como as telas de consulta (a5).
 * - Computador: abre só com o português; o alemão e o inglês ficam fechados nos trilhos e abrem em colunas, cada trecho e
 *   cada nota alinhados nas três línguas; o aparelho lembra a última escolha (a4). Celular: as abas PT · DE · EN.
 * - O alemão e o inglês têm «Mostrar o que foi corrigido»: o sublinhado duplo das correções de leitura e, no toque, o cartão
 *   «Lido · Corrigido · Regra».
 * - ‹ › anda pelos §§ em ordem, com «terceiro de 5 §§ da seção» e «ler a seção do começo» (a8), trocando a entrada do
 *   histórico (como o anterior/próximo do objeto, R20): o «‹ origem» (decisão 85) volta à tela de onde se veio.
 */
export function Paragrafo() {
  const { sigla = '', numero: n = '' } = useParams()
  const numero = /^\d{1,6}$/.test(n) ? Number(n) : NaN
  // `manter`: andar de um § ao outro não esvazia a tela enquanto o novo chega.
  const carga = useCarregar(() => (Number.isSafeInteger(numero) ? consultarParagrafo(sigla, numero) : Promise.resolve(null)), `${sigla}|${n}`, { manter: true })
  const location = useLocation()
  const deOnde = voltarDaOrigem(location.state)
  const aoVoltarParaOrigem = useAoVoltarParaOrigem(deOnde)

  if (carga.fase === 'carregando') return <main className="paragrafo" aria-busy="true" />
  if (carga.fase === 'erro')
    return (
      <>
        <TopoDoCelular voltar={{ href: '#/colecoes', rotulo: 'Voltar às coleções' }} />
        <main className="paragrafo">
          <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />
        </main>
      </>
    )
  const p = carga.dados
  const voltar = deOnde
    ? { href: `#${deOnde.caminho}`, rotulo: rotuloDoIconeDeVoltar(deOnde), aoClicar: aoVoltarParaOrigem }
    : p?.secao
      ? { href: `#/grupo/${encodeURIComponent(p.secao.id)}`, rotulo: p.secao.subcolecao ? 'Voltar à seção' : 'Voltar ao capítulo' }
      : { href: '#/colecoes', rotulo: 'Voltar às coleções' }
  if (!p)
    return (
      <>
        <TopoDoCelular voltar={voltar} />
        <main className="paragrafo">
          {deOnde && <VoltarDaOrigem voltar={deOnde} />}
          <h1 className="paragrafo-vazio-titulo">{sigla ? `${sigla} § ${n}` : '§'}</h1>
          <p className="paragrafo-vazio">Este § não está no pacote.</p>
          <p>
            <Link to="/colecoes">Ir às coleções</Link>
          </p>
        </main>
      </>
    )
  return (
    <OrigemDosLinks rotulo={`${p.sigla} § ${p.numero}`}>
      <TopoDoCelular voltar={voltar} />
      <PaginaDoParagrafo key={`${p.sigla}|${p.numero}`} p={p} />
    </OrigemDosLinks>
  )
}

/** «p. 6», «p. 41–42»: as páginas dos trechos e das notas. */
function paginas(p: ParagrafoDetalhe): string | null {
  const ps = [...p.trechos, ...p.notas].map((t) => t.pagina).filter((x): x is number => x !== null)
  if (ps.length === 0) return null
  const a = Math.min(...ps)
  const b = Math.max(...ps)
  return a === b ? `p. ${a}` : `p. ${a}–${b}`
}

/** A aba do celular fica a mesma de um § ao outro (só nesta sessão; a escolha lembrada no aparelho é a do computador, a4). */
let ultimaAba: Lingua = 'pt'

/** Volta a aba do celular ao PT (testes). */
export const esquecerAbaDoCelular = (): void => {
  ultimaAba = 'pt'
}

const temIngles = (p: ParagrafoDetalhe) => p.traducao !== null && [...p.trechos, ...p.notas].some((t) => t.ingles !== null)

function PaginaDoParagrafo({ p }: { p: ParagrafoDetalhe }) {
  const computador = useBreakpoint() === 'computador'
  const location = useLocation()
  // ‹ › levam a origem adiante (decisão 85), trocando a entrada do histórico.
  const estadoAdiante = comVoltar(undefined, lerVoltar(location.state))
  const deOnde = voltarDaOrigem(location.state)
  const linguas: Lingua[] = temIngles(p) ? ['de', 'pt', 'en'] : ['de', 'pt']
  const [abertas, setAbertas] = useState<LinguasAbertas>(lerLinguasAbertas)
  const [aba, setAbaAgora] = useState<Lingua>(() => ultimaAba)
  const setAba = (l: Lingua) => {
    ultimaAba = l
    setAbaAgora(l)
  }
  const [corrigido, setCorrigido] = useState<Record<Lingua, boolean>>({ de: false, pt: false, en: false })
  const raiz = useRef<HTMLDivElement>(null)
  const cartao = useCartaoDoLido(raiz)

  const mudarAberta = (l: 'de' | 'en', aberta: boolean) => {
    const nova = { ...abertas, [l]: aberta }
    setAbertas(nova)
    gravarLinguasAbertas(nova)
    if (!aberta) mostrarCorrigido(l, false)
  }
  const mostrarCorrigido = (l: Lingua, sim: boolean) => {
    setCorrigido((c) => ({ ...c, [l]: sim }))
    if (!sim && cartao.aberto?.lingua === l) cartao.fechar()
  }
  const posicao = posicaoNaSecao(p.numero, p.secao)
  const primeiro = p.secao?.paragrafos[0]
  const pags = paginas(p)

  // a aba de agora: a lembrada, ou o PT num § sem ela (o EN num § sem inglês; revisão do branch, M2)
  const atual: Lingua = linguas.includes(aba) ? aba : 'pt'
  const visiveis: Lingua[] = computador ? linguas.filter((l) => l === 'pt' || (l === 'de' ? abertas.de : abertas.en)) : [atual]
  // as linhas da grade das línguas: o cabeçalho, um trecho por linha, o «Notas» e uma nota por linha
  const linhas = 1 + p.trechos.length + (p.notas.length > 0 ? 1 + p.notas.length : 0)
  const colunas = (
    <>
      {visiveis.map((l) => (
        <Coluna
          key={l}
          lingua={l}
          p={p}
          computador={computador}
          linhas={linhas}
          corrigido={corrigido[l]}
          aoMostrarCorrigido={(sim) => mostrarCorrigido(l, sim)}
          aoFechar={l === 'pt' ? undefined : () => mudarAberta(l, false)}
          cartao={cartao}
        />
      ))}
    </>
  )
  const idAba = useId()

  return (
    <div className="paragrafo" ref={raiz}>
      <main className="paragrafo-corpo">
        {/* O «‹ origem» (decisão 85): no computador, em cima; no celular, o ícone do topo diz a origem (o desenho). */}
        {computador && deOnde && <VoltarDaOrigem voltar={deOnde} />}
        {p.caminho.length > 0 && <Caminho livro={p.caminho[0]!} grupos={p.grupos} />}
        <div className="paragrafo-titulo">
          <h1>
            {p.sigla} § {p.numero}
          </h1>
          <SetasDosVizinhos
            rotulo="§§ vizinhos"
            anterior={p.anterior && { para: caminhoDoParagrafo(p.sigla, p.anterior.numero), rotulo: `§ ${p.anterior.numero}` }}
            seguinte={p.seguinte && { para: caminhoDoParagrafo(p.sigla, p.seguinte.numero), rotulo: `§ ${p.seguinte.numero}` }}
            estado={estadoAdiante}
          />
        </div>
        {(pags || posicao) && (
          <p className="paragrafo-meta" data-testid="paragrafo-meta">
            {[pags, posicao].filter(Boolean).join(' · ')}
            {primeiro !== undefined && primeiro !== p.numero && posicao && (
              <>
                {' · '}
                <Link to={caminhoDoParagrafo(p.sigla, primeiro)} replace state={estadoAdiante}>
                  {p.secao?.subcolecao ? 'ler a seção do começo' : 'ler o capítulo do começo'}
                </Link>
              </>
            )}
          </p>
        )}

        {p.figuras.length > 0 && <FigurasCitadas figuras={p.figuras} />}

        {!computador && <AbasDasLinguas linguas={(['pt', 'de', 'en'] as const).filter((l) => linguas.includes(l))} atual={atual} aoEscolher={setAba} id={idAba} />}

        <GradeDasLinguas computador={computador} linhas={linhas} deAberto={abertas.de} enAberto={abertas.en && linguas.includes('en')} id={idAba} atual={visiveis[0] ?? atual}>
          {computador && !abertas.de && <Trilho lingua="de" fonte={`${p.sigla}${p.ano ? ` ${p.ano}` : ''}`} linhas={linhas} aoAbrir={() => mudarAberta('de', true)} />}
          {colunas}
          {computador && linguas.includes('en') && !abertas.en && p.traducao && (
            <Trilho lingua="en" fonte={`${p.traducao.sigla}${p.traducao.ano ? ` ${p.traducao.ano}` : ''}`} linhas={linhas} aoAbrir={() => mudarAberta('en', true)} />
          )}
        </GradeDasLinguas>

        <PeDosVizinhos
          rotulo="§ anterior e seguinte"
          anterior={p.anterior && { para: caminhoDoParagrafo(p.sigla, p.anterior.numero), titulo: `§ ${p.anterior.numero}`, frase: p.anterior.frase }}
          seguinte={p.seguinte && { para: caminhoDoParagrafo(p.sigla, p.seguinte.numero), titulo: `§ ${p.seguinte.numero}`, frase: p.seguinte.frase }}
          estado={estadoAdiante}
        />
      </main>
      <CartaoDoLido cartao={cartao} />
    </div>
  )
}

interface PropsDaColuna {
  lingua: Lingua
  p: ParagrafoDetalhe
  computador: boolean
  linhas: number
  corrigido: boolean
  aoMostrarCorrigido: (sim: boolean) => void
  aoFechar?: () => void
  cartao: CartaoDoLido
}

/** As correções do trecho na língua (o português não tem: a tradução é do texto já corrigido). */
/** A lista vazia estável (as dependências dos `useMemo` não mudam a cada desenho). */
const NENHUM: readonly never[] = []

// o português não tem correções: a lista vazia estável (`NENHUM`), para o `useMemo` de `TextoNaLingua` (revisão da Tarefa 25, 7)
const correcoesDe = (t: TrechoDoParagrafo, l: Lingua): readonly CorrecaoDeLeitura[] => (l === 'de' ? t.correcoes : l === 'en' ? t.correcoesDoIngles : NENHUM)

/**
 * Uma língua: o cabeçalho, os trechos e as notas. No computador ela ocupa uma coluna da grade das línguas e as suas linhas
 * são as da grade (subgrid): cada trecho e cada nota ficam na mesma linha nas três línguas.
 */
function Coluna({ lingua, p, computador, linhas, corrigido, aoMostrarCorrigido, aoFechar, cartao }: PropsDaColuna) {
  const idNotas = useId()
  // As chamadas de nota (fix 1, I1): no alemão e no português, a chamada leva à nota e a nota volta à primeira chamada dela.
  // O inglês (o GGIG) numera as notas por capítulo, e os números não batem com os do GGG: as chamadas dele ficam texto.
  const notas = useMemo(() => (lingua === 'en' ? [] : p.notas.map((n) => n.ordinal)), [lingua, p.notas])
  const saltos = useMemo(() => saltosDasNotas(p, lingua, notas, idNotas), [p, lingua, notas, idNotas])
  const quantas = [...p.trechos, ...p.notas].reduce((n, t) => n + correcoesDe(t, lingua).length, 0)
  const fonte =
    lingua === 'de'
      ? [`${p.sigla}${p.ano ? ` ${p.ano}` : ''}${paginas(p) ? `, ${paginas(p)}` : ''}`, 'lido e corrigido'].join(' · ')
      : lingua === 'en' && p.traducao
        ? [`${p.traducao.sigla}${p.traducao.ano ? ` ${p.traducao.ano}` : ''} § ${p.numero}${paginasDoIngles(p) ? `, ${paginasDoIngles(p)}` : ''}`, 'lido e corrigido'].join(' · ')
        : p.trechos.some((t) => t.estado === 'machine')
          ? 'tradução automática do alemão corrigido'
          : 'tradução do alemão corrigido'
  const estilo: CSSProperties | undefined = computador ? { gridRow: `1 / span ${linhas}` } : undefined
  return (
    <section className={`paragrafo-coluna paragrafo-coluna-${lingua}`} aria-label={NOME[lingua]} lang={lingua === 'pt' ? undefined : LANG[lingua]} style={estilo}>
      <div className="paragrafo-cab">
        <div className="paragrafo-cab-linha">
          <span className="paragrafo-cab-nome">
            <b>{NOME[lingua]}</b>
            <small lang="pt-BR">{fonte}</small>
          </span>
          {computador && aoFechar && <IconButton icon="fechar" label={lingua === 'de' ? 'Fechar o alemão' : 'Fechar o inglês'} size={18} onClick={aoFechar} />}
        </div>
        {quantas > 0 && (
          <button type="button" role="switch" aria-checked={corrigido} className="paragrafo-chave" lang="pt-BR" onClick={() => aoMostrarCorrigido(!corrigido)}>
            <span className="paragrafo-chave-trilho" aria-hidden="true" />
            Mostrar o que foi corrigido <span className="codigo">{quantas}</span>
          </button>
        )}
      </div>
      {p.trechos.map((t) => (
        <TextoNaLingua key={t.id} t={t} lingua={lingua} referencias={p.referencias} corrigido={corrigido} cartao={cartao} classe="paragrafo-trecho" notas={notas} saltos={saltos} />
      ))}
      {p.notas.length > 0 && (
        <>
          <h3 className="paragrafo-notas-cab" id={idNotas} lang="pt-BR">
            Notas
          </h3>
          <ol className="paragrafo-notas" aria-labelledby={idNotas} style={computador ? { gridRow: `span ${p.notas.length}` } : undefined}>
            {p.notas.map((t) => (
              <li key={t.id} className="paragrafo-nota" id={saltos.nota(t.ordinal)} tabIndex={-1}>
                {saltos.primeiraChamada.has(t.ordinal) ? (
                  <Salto alvo={saltos.chamada(t.ordinal)} className="paragrafo-nota-volta" rotulo={`Voltar à chamada da nota ${t.ordinal}`}>
                    {t.ordinal}
                  </Salto>
                ) : (
                  <b>{t.ordinal}</b>
                )}
                <TextoNaLingua t={t} lingua={lingua} referencias={p.referencias} corrigido={corrigido} cartao={cartao} classe="paragrafo-nota-texto" nota />
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

/** As âncoras das notas e das chamadas de uma coluna (os ids, únicos na página) e o trecho da primeira chamada de cada nota. */
interface SaltosDasNotas {
  nota: (n: number) => string
  chamada: (n: number) => string
  /** número da nota → id do trecho em que está a primeira chamada dela, na ordem do texto */
  primeiraChamada: ReadonlyMap<number, string>
}

function saltosDasNotas(p: ParagrafoDetalhe, lingua: Lingua, notas: readonly number[], prefixo: string): SaltosDasNotas {
  const primeira = new Map<number, string>()
  if (notas.length > 0)
    for (const t of p.trechos) {
      const texto = lingua === 'de' || t.portugues === null ? t.texto : t.portugues
      for (const ch of chamadasDeNota(texto)) if (notas.includes(ch.numero) && !primeira.has(ch.numero)) primeira.set(ch.numero, t.id)
    }
  return { nota: (n) => `${prefixo}-nota-${n}`, chamada: (n) => `${prefixo}-chamada-${n}`, primeiraChamada: primeira }
}

/**
 * Um salto dentro da página (a chamada → a nota, a nota → a chamada): rola até o alvo e põe o foco nele. O `href` é o da
 * própria página (no HashRouter, `#id` seria outra rota); o clique com modificador fica com o navegador.
 */
function Salto({ alvo, rotulo, className, id, children }: { alvo: string; rotulo: string; className: string; id?: string; children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <a
      href={`#${pathname}`}
      id={id}
      className={className}
      aria-label={rotulo}
      onClick={(e) => {
        if (comModificador(e)) return
        e.preventDefault()
        const el = document.getElementById(alvo)
        if (!el) return
        el.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
        el.focus({ preventScroll: true })
      }}
    >
      {children}
    </a>
  )
}

/** «p. 6», «p. 38–39»: as páginas do inglês alinhado. */
function paginasDoIngles(p: ParagrafoDetalhe): string | null {
  const ps = [...p.trechos, ...p.notas].map((t) => t.paginaDoIngles).filter((x): x is number => x !== null)
  if (ps.length === 0) return null
  const a = Math.min(...ps)
  const b = Math.max(...ps)
  return a === b ? `p. ${a}` : `p. ${a}–${b}`
}

interface PropsDoTexto {
  t: TrechoDoParagrafo
  lingua: Lingua
  referencias: readonly ReferenciaDoParagrafo[]
  corrigido: boolean
  cartao: CartaoDoLido
  classe: string
  nota?: boolean
  /** Os números das notas cujas chamadas viram links (vazio: nenhuma). */
  notas?: readonly number[]
  saltos?: SaltosDasNotas
}

/** Um trecho (ou uma nota) numa língua, com os termos (no português), os links das figuras e, ligadas, as correções. */
function TextoNaLingua({ t, lingua, referencias, corrigido, cartao, classe, nota = false, notas = NENHUM, saltos }: PropsDoTexto) {
  const Tag = nota ? 'span' : 'p'
  const semTraducao = lingua === 'pt' && t.portugues === null
  const texto = lingua === 'de' || semTraducao ? t.texto : lingua === 'pt' ? t.portugues! : t.ingles
  const correcoes = corrigido ? correcoesDe(t, lingua) : NENHUM
  const termos: readonly Termo[] = lingua === 'pt' && !semTraducao ? t.termos : NENHUM
  const pecas = useMemo(
    () => (texto === null ? [] : pecasDoParagrafo(texto, { termos, links: linksDasFiguras(texto, referencias), correcoes, notas })),
    [texto, termos, referencias, correcoes, notas],
  )
  // a primeira chamada de cada nota na coluna recebe a âncora para a qual a nota volta
  const vistas = new Set<number>()
  const ancoras = pecas.map((peca) => {
    if (peca.tipo !== 'chamada' || vistas.has(peca.numero)) return false
    vistas.add(peca.numero)
    return saltos?.primeiraChamada.get(peca.numero) === t.id
  })
  if (texto === null)
    return <Tag className={`${classe} paragrafo-falta`}>{nota ? 'Sem inglês para esta nota.' : 'Sem inglês para este trecho.'}</Tag>
  return (
    <Tag className={classe} lang={semTraducao ? 'de' : undefined}>
      {semTraducao && <small className="paragrafo-sem-traducao" lang="pt-BR">sem tradução ainda; o original: </small>}
      {pecas.map((peca, i) => (
        <PecaNoTexto
          key={i}
          peca={peca}
          chave={`${t.id}|${lingua}|${i}`}
          lingua={lingua}
          cartao={cartao}
          saltos={saltos}
          ancora={ancoras[i]}
        />
      ))}
    </Tag>
  )
}

interface PropsDaPeca {
  peca: PecaDoParagrafo
  chave: string
  lingua: Lingua
  cartao: CartaoDoLido
  saltos?: SaltosDasNotas
  /** Esta chamada é a primeira da nota na coluna: a nota volta a ela. */
  ancora?: boolean
}

function PecaNoTexto({ peca, chave, lingua, cartao, saltos, ancora = false }: PropsDaPeca) {
  const formas = useFormasEmUso()
  const doPacote = useFormasDoPacote()
  switch (peca.tipo) {
    case 'texto':
      return <>{peca.texto}</>
    case 'termo': {
      const { texto, nome } = exibirTermo(peca.texto, formas.get(peca.glId), doPacote?.get(peca.glId))
      return (
        <Link className="termo" to={`/verbete/${encodeURIComponent(peca.glId)}`} aria-label={nome ?? undefined}>
          {texto}
        </Link>
      )
    }
    case 'chamada':
      return saltos ? (
        <Salto alvo={saltos.nota(peca.numero)} className="paragrafo-chamada" rotulo={`nota ${peca.numero}`} id={ancora ? saltos.chamada(peca.numero) : undefined}>
          {peca.texto}
        </Salto>
      ) : (
        <>{peca.texto}</>
      )
    case 'link':
      return (
        <LinkComOrigem className="paragrafo-fig" to={peca.destino}>
          {peca.texto}
        </LinkComOrigem>
      )
    case 'correcao': {
      const aberto = cartao.aberto?.chave === chave
      return (
        <button
          type="button"
          className={`paragrafo-corrigido${aberto ? ' paragrafo-corrigido-aberto' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={aberto}
          aria-controls={aberto ? cartao.id : undefined}
          onClick={(e) => (aberto ? cartao.fechar() : cartao.abrir({ chave, lingua, lido: peca.lido, corrigido: peca.texto, regra: peca.regra }, e.currentTarget))}
        >
          {peca.texto}
        </button>
      )
    }
  }
}

// ---------------------------------------------------------------------------
// O cartão «Lido · Corrigido · Regra»
// ---------------------------------------------------------------------------

interface LidoAberto {
  chave: string
  lingua: Lingua
  lido: string
  corrigido: string
  regra: string
}

interface CartaoDoLido {
  id: string
  aberto: LidoAberto | null
  posicao: { top: number; left: number } | null
  abrir: (l: LidoAberto, gatilho: HTMLElement) => void
  fechar: (devolverFoco?: boolean) => void
}

/** O cartão aberto por uma correção, posto logo abaixo dela, dentro da página (cortado nas margens de 16 px). */
function useCartaoDoLido(raiz: RefObject<HTMLDivElement | null>): CartaoDoLido {
  const id = useId()
  const [aberto, setAberto] = useState<LidoAberto | null>(null)
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(null)
  const gatilho = useRef<HTMLElement | null>(null)
  const fechar = useCallback((devolverFoco = false) => {
    setAberto(null)
    setPosicao(null)
    if (devolverFoco) gatilho.current?.focus()
  }, [])
  // logo abaixo da correção, dentro da página: medido ao abrir e de novo quando a janela muda (o texto reflui; revisão da
  // Tarefa 25, 8)
  const medir = useCallback(() => {
    const g = gatilho.current
    const caixa = raiz.current?.getBoundingClientRect()
    if (!g || !caixa) return setPosicao(null)
    const r = g.getBoundingClientRect()
    const largura = Math.min(300, caixa.width - 32)
    setPosicao({ top: r.bottom - caixa.top + 8, left: Math.max(16, Math.min(r.left - caixa.left, caixa.width - largura - 16)) })
  }, [raiz])
  const abrir = useCallback(
    (l: LidoAberto, g: HTMLElement) => {
      gatilho.current = g
      setAberto(l)
      medir()
    },
    [medir],
  )
  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar(true)
    }
    const aoTocar = (e: PointerEvent) => {
      const alvo = e.target as Element | null
      if (alvo?.closest?.('.paragrafo-lido, .paragrafo-corrigido')) return
      fechar()
    }
    document.addEventListener('keydown', aoTeclar)
    document.addEventListener('pointerdown', aoTocar)
    window.addEventListener('resize', medir)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.removeEventListener('pointerdown', aoTocar)
      window.removeEventListener('resize', medir)
    }
  }, [aberto, fechar, medir])
  return { id, aberto, posicao, abrir, fechar }
}

function CartaoDoLido({ cartao }: { cartao: CartaoDoLido }) {
  const ref = useRef<HTMLDivElement>(null)
  // Num aparelho estreito o cartão pode passar da margem direita: ajusta depois de medir.
  useLayoutEffect(() => {
    const el = ref.current
    const pai = el?.parentElement
    if (!el || !pai || !cartao.posicao) return
    const maximo = pai.clientWidth - el.offsetWidth - 16
    if (maximo >= 16 && cartao.posicao.left > maximo) el.style.left = `${maximo}px`
  }, [cartao.posicao])
  if (!cartao.aberto) return null
  const { lido, corrigido, regra } = cartao.aberto
  return (
    <div
      ref={ref}
      className="paragrafo-lido"
      role="dialog"
      id={cartao.id}
      aria-label="O que foi lido"
      style={cartao.posicao ? { top: cartao.posicao.top, left: cartao.posicao.left } : undefined}
    >
      <dl>
        <dt>Lido</dt>
        <dd className="codigo">«{lido}»</dd>
        <dt>Corrigido</dt>
        <dd>«{corrigido}»</dd>
        <dt>Regra</dt>
        <dd>{descricaoDaRegra(regra)}</dd>
      </dl>
      <p>A tradução, a busca e o app usam o texto corrigido.</p>
    </div>
  )
}

