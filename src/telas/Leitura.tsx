import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigationType, useParams } from 'react-router'
import { LinkComOrigem, OrigemDosLinks, useAoVoltarParaOrigem } from '../app/OrigemDosLinks'
import { decidirRolagem, lerPosicoes } from '../app/rolagem'
import { comVoltar, lerVoltar, rotuloDoIconeDeVoltar, voltarDaOrigem } from '../app/voltar'
import { passoDaLeitura, rotaDaEntrada, rotaDoTrecho } from '../banco/leitura'
import type { LinhaDaLeitura, PassoDetalhe, ReferenciaDoParagrafo, Termo, VizinhoDaLeitura } from '../banco/tipos'
import { useFormasEmUso } from '../glossario/doUsuario'
import { exibirTermo } from '../glossario/exibirTermo'
import { useFormasDoPacote } from '../glossario/formasDoPacote'
import { MiniaturaDoObjeto } from '../imagens-usuario/MiniaturaDoObjeto'
import type { LinkNoTexto } from '../item/trechos'
import { VoltarDaOrigem } from '../item/VoltarDaOrigem'
import { linksDaLinha } from '../leitura/linksDaLeitura'
import type { TipoDeTexto } from '../leitura/ordem'
import { ROTULO_DO_TIPO } from '../leitura/rotulos'
import { gravarColunasDaLeitura, gravarPosicao, lerColunasDaLeitura, type ColunasDaLeitura } from '../leitura/preferencias'
import {
  AbasDasLinguas,
  Caminho,
  FigurasCitadas,
  GradeDasLinguas,
  LANG,
  NOME,
  PeDosVizinhos,
  SetasDosVizinhos,
  Trilho,
  type Lingua,
  type VizinhoNoPe,
} from '../paragrafo/pecas'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { pecasDoParagrafo } from './textoDoParagrafo'
import './Leitura.css'

export const ROTA_DA_LEITURA_DO_TRECHO = '/ler/:sigla/trecho/:id'
export const ROTA_DA_LEITURA_DA_ENTRADA = '/ler/:sigla/entrada/:chave'

/** A etiqueta do tipo do passo (junto do título e, quando muda, no pé): src/leitura/rotulos.ts, que a busca também usa. */
export { ROTULO_DO_TIPO }

/** «da introdução do grupo», na meta do passo de texto. */
const DO_BLOCO: Record<TipoDeTexto, string> = {
  'introducao-geral': 'da introdução geral',
  panorama: 'do panorama do período',
  grupo: 'da introdução do grupo',
  subcolecao: 'da introdução da subcoleção',
}

/** No computador, a faixa das figuras mostra uma linha (8) e «Mostrar todas (N)»; no celular ela rola, sem o botão. */
const FIGURAS_NUMA_LINHA = 8

/**
 * A página de leitura de uma obra de catálogo (o IPIAO no formato do §; plano «O IPIAO lido no formato do §», Tarefa 4;
 * desenhos 1 e 2 aprovados), rotas `/ler/:sigla/trecho/:id` (o passo de texto que contém o trecho, rolado até ele) e
 * `/ler/:sigla/entrada/:chave` (o passo da entrada). As mesmas peças da página do § (src/paragrafo/pecas.tsx):
 * - o caminho, o título com a etiqueta do tipo, ‹ › com os rótulos dos vizinhos e a meta com «ler do começo»;
 * - no texto, a faixa das figuras citadas; na entrada, a peça grande, «Abrir a ficha completa» e as citadas na descrição;
 * - DE | PT no computador, com o alemão aberto por padrão (q2 A), lembrado à parte do §; as abas PT · DE no celular;
 * - o pé com a frase dos vizinhos e a etiqueta do tipo quando ele muda.
 * Cada passo aberto fica guardado como a posição da obra neste aparelho (o «Continuar» das Coleções).
 */
export function Leitura() {
  const { sigla = '', id, chave } = useParams()
  const rota = id !== undefined ? rotaDoTrecho(sigla, id) : rotaDaEntrada(sigla, chave ?? '')
  // `manter`: andar de um passo ao outro não esvazia a tela enquanto o novo chega; a rota vem junto do passo dela.
  const carga = useCarregar(
    () => passoDaLeitura(sigla, id !== undefined ? { trecho: id } : { entrada: chave ?? '' }).then((passo) => ({ passo, rota })),
    rota,
    { manter: true },
  )
  const location = useLocation()
  const deOnde = voltarDaOrigem(location.state)
  const aoVoltarParaOrigem = useAoVoltarParaOrigem(deOnde)

  if (carga.fase === 'carregando') return <main className="paragrafo ler-pagina" aria-busy="true" />
  const daOrigem = deOnde && { href: `#${deOnde.caminho}`, rotulo: rotuloDoIconeDeVoltar(deOnde), aoClicar: aoVoltarParaOrigem }
  // no erro, o «‹ origem» também (fix final, m5), como no passo que não existe
  if (carga.fase === 'erro')
    return (
      <>
        <TopoDoCelular voltar={daOrigem ?? { href: '#/colecoes', rotulo: 'Voltar às coleções' }} />
        <main className="paragrafo ler-pagina">
          {deOnde && <VoltarDaOrigem voltar={deOnde} />}
          <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />
        </main>
      </>
    )
  const p = carga.dados.passo
  const voltar =
    daOrigem ??
    (p && p.grupos.length > 0
      ? { href: `#/grupo/${encodeURIComponent(p.grupos.at(-1)!.id)}`, rotulo: p.grupos.length > 1 ? 'Voltar à subcoleção' : 'Voltar ao grupo' }
      : { href: '#/colecoes', rotulo: 'Voltar às coleções' })
  if (!p)
    return (
      <>
        <TopoDoCelular voltar={voltar} />
        <main className="paragrafo ler-pagina">
          {deOnde && <VoltarDaOrigem voltar={deOnde} />}
          <h1 className="paragrafo-vazio-titulo">{sigla ? `Leitura de ${sigla}` : 'Leitura'}</h1>
          <p className="paragrafo-vazio">Este passo não está no pacote.</p>
          <p>
            <Link to="/colecoes">Ir às coleções</Link>
          </p>
        </main>
      </>
    )
  return (
    <OrigemDosLinks rotulo={p.titulo}>
      <TopoDoCelular voltar={voltar} />
      <PaginaDaLeitura key={carga.dados.rota} p={p} rota={carga.dados.rota} />
    </OrigemDosLinks>
  )
}

/** A aba do celular fica a mesma de um passo ao outro (só nesta sessão). */
let ultimaAba: Lingua = 'pt'

/** Volta a aba do celular ao PT (testes). */
export const esquecerAbaDaLeitura = (): void => {
  ultimaAba = 'pt'
}

/** A meta: «p. 11 · página 2 de 2 da introdução da subcoleção» e o link «ler do começo» (só quando há começo antes). */
function metaDoPasso(p: PassoDetalhe): { texto: string; comeco: string } {
  const { n, total, de } = p.posicao
  let posicao: string
  let comeco: string
  if (p.tipo === 'texto') {
    const onde = DO_BLOCO[p.rotuloDoTipo as TipoDeTexto] ?? 'do bloco'
    posicao = total === 1 ? `a única página ${onde}` : `página ${n} de ${total} ${onde}`
    comeco = 'ler do começo'
  } else {
    // a entrada fora de grupo conta entre as entradas sem grupo, sem dizer «do grupo»
    const onde = p.grupos.length === 0 ? '' : de === 'subcolecao' ? ' da subcoleção' : ' do grupo'
    posicao = total === 1 ? `a única entrada${onde}` : `entrada ${n} de ${total}${onde}`
    comeco = onde === '' ? 'ler do começo' : de === 'subcolecao' ? 'ler a subcoleção do começo' : 'ler o grupo do começo'
  }
  return { texto: [p.pagina !== null ? `p. ${p.pagina}` : null, posicao].filter(Boolean).join(' · '), comeco }
}

/** «TESTE I 2020»: a obra com o ano do volume (o cabeçalho do alemão e o trilho, como o «TESTEG 2021» do §); sem ano, a obra. */
const obraComAno = (p: PassoDetalhe) => (p.ano !== null ? `${p.obra} ${p.ano}` : p.obra)

/** O vizinho no pé: a etiqueta do tipo antes da frase quando ele é de outro tipo. */
const noPe = (v: VizinhoDaLeitura | null, tipo: PassoDetalhe['rotuloDoTipo']): VizinhoNoPe | null =>
  v && { para: v.rota, titulo: v.rotulo, frase: v.frase, tipo: v.tipo !== tipo ? ROTULO_DO_TIPO[v.tipo] : null }

/** O trecho pedido está no meio do passo (vindo da Busca, por exemplo)? O 1º trecho é a chegada comum (‹ ›, «ler do começo»). */
const temAlvoNoMeio = (p: PassoDetalhe) => p.alvo !== null && p.linhas[0]?.id !== p.alvo

const prefereMenosMovimento = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function PaginaDaLeitura({ p, rota }: { p: PassoDetalhe; rota: string }) {
  const computador = useBreakpoint() === 'computador'
  const location = useLocation()
  // ‹ › levam a origem adiante (decisão 85), trocando a entrada do histórico.
  const estadoAdiante = comVoltar(undefined, lerVoltar(location.state))
  const deOnde = voltarDaOrigem(location.state)
  const [abertas, setAbertas] = useState<ColunasDaLeitura>(lerColunasDaLeitura)
  const [aba, setAbaAgora] = useState<Lingua>(() => ultimaAba)
  const setAba = (l: Lingua) => {
    ultimaAba = l
    setAbaAgora(l)
  }
  const mudarAberta = (aberta: boolean) => {
    setAbertas({ de: aberta })
    gravarColunasDaLeitura({ de: aberta })
  }
  const raiz = useRef<HTMLDivElement>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const idAba = useId()
  const tipoDeNavegacao = useNavigationType()
  const alvoNoMeio = temAlvoNoMeio(p)

  // a posição da obra neste aparelho: o passo aberto
  useEffect(() => gravarPosicao(p.sigla, rota), [p.sigla, rota])

  // A chegada ao passo (só ao abrir: a página remonta a cada rota):
  // - o trecho pedido no meio do passo: rola até ele e põe o foco nele (o do português, ou o da coluna à vista), marcado;
  //   no Voltar do navegador (POP) com a posição guardada, quem rola é useRestaurarRolagem, e aqui só o foco;
  // - senão (o 1º trecho, ou a entrada): o foco no título, sem rolar, para o leitor de tela dizer a página nova.
  useEffect(() => {
    if (!alvoNoMeio) {
      titulo.current?.focus({ preventScroll: true })
      return
    }
    const el = [...(raiz.current?.querySelectorAll<HTMLElement>('.ler-linha-alvo') ?? [])].sort(
      (a, b) => Number(!a.closest('.paragrafo-coluna-pt')) - Number(!b.closest('.paragrafo-coluna-pt')),
    )[0]
    if (!el) return
    const restaura = decidirRolagem({ tipo: tipoDeNavegacao, pathnameAnterior: null, pathname: location.pathname, salva: lerPosicoes()[location.key] }).acao === 'restaurar'
    if (!restaura) el.scrollIntoView({ block: 'center', behavior: prefereMenosMovimento() ? 'auto' : 'smooth' })
    el.focus({ preventScroll: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const atual: Lingua = aba === 'de' ? 'de' : 'pt'
  const visiveis: Lingua[] = computador ? (abertas.de ? ['de', 'pt'] : ['pt']) : [atual]
  // as linhas da grade: o cabeçalho e uma por linha do passo
  const linhas = 1 + p.linhas.length
  const meta = metaDoPasso(p)
  const entrada = p.tipo === 'entrada'
  const limite = computador ? FIGURAS_NUMA_LINHA : undefined

  return (
    <div className="paragrafo ler-pagina" ref={raiz}>
      <main className="paragrafo-corpo">
        {/* O «‹ origem» (decisão 85): no computador, em cima; no celular, o ícone do topo diz a origem. */}
        {computador && deOnde && <VoltarDaOrigem voltar={deOnde} />}
        {/* fora de grupo, o caminho é a obra */}
        <Caminho livro={p.caminho[0] ?? p.obra} grupos={p.grupos} />
        <div className="paragrafo-titulo ler-titulo">
          <div className="ler-titulo-linha">
            <h1 ref={titulo} tabIndex={-1}>
              {p.titulo}
            </h1>
            <span className={`ler-tipo${entrada ? ' ler-tipo-entrada' : ''}`}>{ROTULO_DO_TIPO[p.rotuloDoTipo]}</span>
          </div>
          <SetasDosVizinhos
            rotulo="Passos vizinhos"
            anterior={p.anterior && { para: p.anterior.rota, rotulo: p.anterior.rotulo }}
            seguinte={p.seguinte && { para: p.seguinte.rota, rotulo: p.seguinte.rotulo }}
            estado={estadoAdiante}
            comDirecao
          />
        </div>
        <p className="paragrafo-meta" data-testid="ler-meta">
          {meta.texto}
          {p.inicio && (
            <>
              {' · '}
              <Link to={p.inicio} replace state={estadoAdiante}>
                {meta.comeco}
              </Link>
            </>
          )}
        </p>

        {entrada ? (
          <div className="ler-entrada-topo">
            {p.entrada && (
              <div className="ler-peca">
                <LinkComOrigem className="ler-peca-imagem" to={`/item/${encodeURIComponent(p.entrada.numero)}`} aria-label={`A peça de ${p.titulo}, na ficha`}>
                  <MiniaturaDoObjeto numero={p.entrada.numero} caminho={p.entrada.miniatura} alt={p.entrada.tipo ?? `Objeto ${p.entrada.numero}`} />
                  <small className="codigo" aria-hidden="true">
                    {p.titulo}
                  </small>
                </LinkComOrigem>
                <LinkComOrigem className="ler-ficha" to={`/item/${encodeURIComponent(p.entrada.numero)}`}>
                  Abrir a ficha completa
                  <Icon name="proximo" size={18} />
                </LinkComOrigem>
              </div>
            )}
            {p.figuras.length > 0 && <FigurasCitadas figuras={p.figuras} titulo="Citadas na descrição" limite={limite} />}
          </div>
        ) : (
          p.figuras.length > 0 && <FigurasCitadas figuras={p.figuras} limite={limite} />
        )}

        {!computador && <AbasDasLinguas linguas={['pt', 'de']} atual={atual} aoEscolher={setAba} id={idAba} />}

        <GradeDasLinguas computador={computador} linhas={linhas} deAberto={abertas.de} enAberto={false} classe="ler-linguas" id={idAba} atual={atual}>
          {computador && !abertas.de && <Trilho lingua="de" fonte={obraComAno(p)} linhas={linhas} aoAbrir={() => mudarAberta(true)} />}
          {visiveis.map((l) => (
            <Coluna key={l} lingua={l} p={p} computador={computador} linhas={linhas} aoFechar={l === 'de' ? () => mudarAberta(false) : undefined} />
          ))}
        </GradeDasLinguas>

        <PeDosVizinhos rotulo="Passo anterior e seguinte" anterior={noPe(p.anterior, p.rotuloDoTipo)} seguinte={noPe(p.seguinte, p.rotuloDoTipo)} estado={estadoAdiante} />
      </main>
    </div>
  )
}

interface PropsDaColuna {
  lingua: Lingua
  p: PassoDetalhe
  computador: boolean
  linhas: number
  aoFechar?: () => void
}

/**
 * Uma língua: o cabeçalho e as linhas do passo. No computador ela ocupa uma coluna da grade e as suas linhas são as da grade
 * (subgrid): cada linha fica na mesma altura no alemão e no português.
 */
function Coluna({ lingua, p, computador, linhas, aoFechar }: PropsDaColuna) {
  const fonte =
    lingua === 'de'
      ? `${obraComAno(p)}${p.pagina !== null ? `, p. ${p.pagina}` : ''}`
      : p.linhas.some((l) => l.portugues !== null && l.estado === 'machine')
        ? 'tradução automática'
        : p.linhas.every((l) => l.portugues === null)
          ? 'sem tradução ainda'
          : 'tradução'
  const estilo: CSSProperties | undefined = computador ? { gridRow: `1 / span ${linhas}` } : undefined
  // no celular, a aba PT já diz a língua: sem o cabeçalho «Português · tradução automática» (o desenho aprovado, 01-texto)
  const comCabecalho = computador || lingua !== 'pt'
  return (
    <section className={`paragrafo-coluna paragrafo-coluna-${lingua}`} aria-label={NOME[lingua]} lang={lingua === 'pt' ? undefined : LANG[lingua]} style={estilo}>
      {comCabecalho && (
        <div className="paragrafo-cab">
          <div className="paragrafo-cab-linha">
            <span className="paragrafo-cab-nome">
              <b lang="pt-BR">{NOME[lingua]}</b>
              <small lang="pt-BR">{fonte}</small>
            </span>
            {computador && aoFechar && <IconButton icon="fechar" label="Fechar o alemão" size={18} onClick={aoFechar} />}
          </div>
        </div>
      )}
      {p.linhas.map((l) => (
        <LinhaNaLingua key={l.id} l={l} lingua={lingua} referencias={p.referencias} sigla={p.sigla} volume={p.volume} alvo={temAlvoNoMeio(p) && l.id === p.alvo} />
      ))}
    </section>
  )
}

const NENHUM: readonly never[] = []

/**
 * Uma linha numa língua: o rótulo do campo em cima (a descrição e os campos 3–5 da entrada), ou a etiqueta «Mapa» na própria
 * linha da legenda; no português, os termos ligados ao verbete; nas duas, os números do catálogo citados ligados ao objeto.
 * Sem português, o original com «sem tradução ainda; o original:»; com a tradução desatualizada, a marca.
 */
function LinhaNaLingua({
  l,
  lingua,
  referencias,
  sigla,
  volume,
  alvo,
}: {
  l: LinhaDaLeitura
  lingua: Lingua
  referencias: readonly ReferenciaDoParagrafo[]
  sigla: string
  volume: string
  alvo: boolean
}) {
  const semTraducao = lingua === 'pt' && l.portugues === null
  const texto = lingua === 'de' || semTraducao ? l.texto : l.portugues!
  const termos: readonly Termo[] = lingua === 'pt' && !semTraducao ? l.termos : NENHUM
  const links = useMemo(() => linksDaLinha(texto, termos, referencias, sigla, volume), [texto, termos, referencias, sigla, volume])
  const pecas = useMemo(() => pecasDoParagrafo(texto, { termos, links }), [texto, termos, links])
  const mapa = l.rotulo === 'Mapa'
  let pos = 0
  return (
    <div className={`ler-linha${mapa ? ' ler-linha-mapa' : ''}${alvo ? ' ler-linha-alvo' : ''}`} data-trecho={l.id} tabIndex={alvo ? -1 : undefined}>
      {l.rotulo && !mapa && (
        <span className="ler-rotulo" lang="pt-BR">
          {l.rotulo}
        </span>
      )}
      <p className="paragrafo-trecho" lang={semTraducao ? 'de' : undefined}>
        {semTraducao && (
          <small className="paragrafo-sem-traducao" lang="pt-BR">
            sem tradução ainda; o original:{' '}
          </small>
        )}
        {lingua === 'pt' && !semTraducao && l.desatualizada && (
          <small className="paragrafo-sem-traducao ler-desatualizada" lang="pt-BR">
            tradução desatualizada
          </small>
        )}
        {mapa && (
          <span className="ler-etiqueta" lang="pt-BR">
            Mapa
          </span>
        )}
        {pecas.map((peca, i) => {
          const inicio = pos
          pos += peca.texto.length
          return <PecaNaLinha key={i} peca={peca} link={peca.tipo === 'link' ? links.find((k) => k.inicio <= inicio && inicio < k.fim) : undefined} />
        })}
      </p>
    </div>
  )
}

function PecaNaLinha({ peca, link }: { peca: ReturnType<typeof pecasDoParagrafo>[number]; link: LinkNoTexto | undefined }) {
  const formas = useFormasEmUso()
  const doPacote = useFormasDoPacote()
  switch (peca.tipo) {
    case 'termo': {
      const { texto, nome } = exibirTermo(peca.texto, formas.get(peca.glId), doPacote?.get(peca.glId))
      return (
        <Link className="termo" to={`/verbete/${encodeURIComponent(peca.glId)}`} aria-label={nome ?? undefined}>
          {texto}
        </Link>
      )
    }
    case 'link':
      return (
        // o nome acessível da remissão diz o objeto («Abrir CA00001, TESTE I: 1»); o da figura é o próprio texto
        <LinkComOrigem className="paragrafo-fig" to={peca.destino} aria-label={link && link.rotulo !== peca.texto ? link.rotulo : undefined}>
          {peca.texto}
        </LinkComOrigem>
      )
    default:
      return <>{peca.texto}</>
  }
}
