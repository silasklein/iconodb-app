import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type MouseEvent } from 'react'
import { Link, useLocation } from 'react-router'
import type { Ancora, Modalidade, Nivel, Termo } from '../banco/tipos'
import { eHipoteseSkc } from '../hipoteses/modelo'
import { useFormasEmUso } from '../glossario/doUsuario'
import { ajustarDica } from './posicaoDaDica'
import { exibirTermo, type TermoExibido } from '../glossario/exibirTermo'
import { useFormasDoPacote } from '../glossario/formasDoPacote'
import { useTextoNaTela } from '../hipoteses/textosNaTela'
import { MarcadorDeNivel } from '../ui/MarcadorDeNivel'
import { usePodePassarOMouse } from '../ui/usePodePassarOMouse'
import { posicaoDaPrevia, type Retangulo } from './posicaoDaPrevia'
import { partesDaFonte, ROTULO_DA_MODALIDADE, ROTULO_DO_NIVEL, type ResumoDaHipotese } from './rotulos'
import { chaveDoTermo, chavesDosTermos, montarTrechos, type LinkNoTexto, type Peca } from './trechos'
import './Leitura.css'

export type Idioma = 'pt' | 'de'

const SEM_LINKS: readonly LinkNoTexto[] = []
const SEM_ANCORAS: readonly Ancora[] = []

interface Props {
  /** "TESTE I: 2". */
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
  /**
   * O id do trecho (`PA-…`): o texto ganha `data-trecho-fonte` e `data-trecho-lingua`, e uma seleção nele pode virar
   * hipótese SKC (Tarefa 10, src/hipoteses/selecao.ts).
   */
  trechoId?: string
  /**
   * Do que cada hipótese fala (o termo em uso e o alvo): a prévia ao passar o mouse diz «Termo: … · sobre …». Sem ela, a
   * prévia fica sem essa linha.
   */
  resumoDaHipotese?: (id: string) => ResumoDaHipotese | null
  /** As âncoras das hipóteses SKC no ORIGINAL (`lingua: "de"`), desenhadas quando o original está à vista. */
  ancorasDoOriginal?: readonly Ancora[]
}

/**
 * A leitura de uma fonte (Item.dc.html): o rótulo da fonte na coluna da esquerda e o texto.
 * Em português, os termos são links finos ao verbete, os trechos de hipótese são pontilhados e
 * abrem o painel (`?hipotese=<id>`, trocando a entrada do histórico), e citações e números
 * levam à obra e ao item. Em alemão (`idioma="de"`), só o original, sem marcas.
 */
export function Leitura({ fonte, publicacao, texto, original, termos, ancoras, links = SEM_LINKS, idioma = 'pt', hipoteseAtiva = null, aoAbrirHipotese, trechoId, ancorasDoOriginal = SEM_ANCORAS, resumoDaHipotese }: Props) {
  const { sigla, resto } = partesDaFonte(fonte, publicacao)
  const emPortugues = idioma === 'pt' && texto !== null
  const pecas = useMemo(() => (texto === null ? [] : montarTrechos(texto, { termos, ancoras, links })), [texto, termos, ancoras, links])
  // A forma em uso do usuário (Tarefa 11) aparece no lugar do termo só quando o trecho é o termo INTEIRO e está como o pacote
  // o escreve (`exibirTermo`: nada de flexões, nada de verbete com `pt_text`); senão o texto fica e a forma vai na dica. É só o
  // que se vê: o texto guardado, as posições (`data-b`, `data-b-fim`) e o registro do texto não mudam.
  const formas = useFormasEmUso()
  const doPacote = useFormasDoPacote()
  const inteiros = useMemo(() => (texto === null ? new Set<string>() : chavesDosTermos(texto, termos)), [texto, termos])
  const exibir = (glId: string, guardado: string, b: number): TermoExibido => {
    const forma = formas.get(glId)
    return forma !== undefined && inteiros.has(chaveDoTermo(b, b + guardado.length, glId)) ? exibirTermo(guardado, forma, doPacote?.get(glId)) : { texto: guardado, dica: null, nome: null, apoio: null }
  }
  const pecasDoOriginal = useMemo(() => (ancorasDoOriginal.length === 0 ? null : montarTrechos(original, { ancoras: ancorasDoOriginal })), [original, ancorasDoOriginal])
  // O texto guardado fica registrado: a âncora de uma hipótese SKC é calculada sobre ele (revisão 1, I7).
  useTextoNaTela(trechoId, 'pt', texto)
  useTextoNaTela(trechoId, 'de', original)

  return (
    <div className="leitura">
      <div className="leitura-fonte" data-testid="leitura-fonte">
        <span className="leitura-sigla">{sigla}</span>
        {resto && <span className="leitura-numero">{resto}</span>}
      </div>
      <div className="leitura-corpo">
        {idioma === 'pt' && texto === null && <p className="leitura-aviso">Sem tradução ainda; o original, em alemão.</p>}
        {emPortugues ? (
          <p className="leitura-texto" lang="pt-BR" data-trecho-fonte={trechoId} data-trecho-lingua={trechoId ? 'pt' : undefined}>
            {comInicios(pecas).map(([p, b], i) => (
              <PecaDoTexto key={i} peca={p} b={b} ativa={hipoteseAtiva} aoAbrir={aoAbrirHipotese} exibir={exibir} resumoDaHipotese={resumoDaHipotese} />
            ))}
          </p>
        ) : (
          // Sem âncoras, o original é um texto só: o próprio parágrafo diz que ele começa em 0 do texto guardado.
          <p className="leitura-texto" lang="de" data-trecho-fonte={trechoId} data-trecho-lingua={trechoId ? 'de' : undefined} data-b={pecasDoOriginal ? undefined : 0}>
            {pecasDoOriginal
              ? comInicios(pecasDoOriginal).map(([p, b], i) => <PecaDoTexto key={i} peca={p} b={b} ativa={hipoteseAtiva} aoAbrir={aoAbrirHipotese} />)
              : original}
          </p>
        )}
      </div>
    </div>
  )
}

/** O tamanho da peça no texto guardado (as peças, juntas, recompõem o texto). */
const tamanho = (p: Peca) => (p.tipo === 'ancora' ? p.partes.reduce((n, x) => n + x.texto.length, 0) : p.texto.length)

/** Cada peça com onde ela começa no texto guardado (UTF-16). */
function comInicios(pecas: readonly Peca[]): [Peca, number][] {
  let b = 0
  return pecas.map((p) => {
    const inicio = b
    b += tamanho(p)
    return [p, inicio]
  })
}

/**
 * Uma peça do texto. Cada uma leva `data-b` (onde começa no texto GUARDADO) e os termos e links também `data-b-fim`
 * (indivisíveis): a seleção vira posições do texto guardado mesmo que o que aparece numa peça seja outro (a forma em uso
 * de um termo, Tarefa 11; revisão 1 da Tarefa 10, I7). Ver src/hipoteses/selecao.ts.
 */
function PecaDoTexto({
  peca,
  b,
  ativa,
  aoAbrir,
  exibir = (_glId, guardado) => ({ texto: guardado, dica: null, nome: null, apoio: null }),
  resumoDaHipotese,
}: {
  peca: Peca
  b: number
  ativa: string | null
  aoAbrir?: Props['aoAbrirHipotese']
  /** O que a peça de um termo mostra (a forma em uso, se há); a posição é sempre a do texto guardado. */
  exibir?: (glId: string, guardado: string, b: number) => TermoExibido
  resumoDaHipotese?: Props['resumoDaHipotese']
}) {
  switch (peca.tipo) {
    case 'texto':
      return <span data-b={b}>{peca.texto}</span>
    case 'termo':
      return (
        <TermoNoTexto glId={peca.glId} guardado={peca.texto} b={b} exibir={exibir} />
      )
    case 'link':
      return (
        <Link className="link-texto" to={peca.destino} aria-label={peca.rotulo} data-b={b} data-b-fim={b + peca.texto.length}>
          {peca.texto}
        </Link>
      )
    case 'ancora':
      return <AncoraNoTexto peca={peca} b={b} ativa={ativa} aoAbrir={aoAbrir} exibir={exibir} resumoDaHipotese={resumoDaHipotese} />
  }
}

/** O foco veio do teclado (e não de um clique)? Onde o navegador não sabe responder, vale como sim. */
function focoVisivel(el: HTMLElement): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}

/**
 * O trecho de uma hipótese (um link pontilhado que abre o painel). Em aparelhos com mouse, ao passar ou focar, abre a
 * prévia (decisão 35, PC-ItemNiveis.dc.html): uma caixa só, que também traz a dica do termo (forma em uso, texto do
 * tradutor), logo abaixo da linha do trecho. WCAG 1.4.13: dispensável com Esc (sem chegar ao painel), pairável (a caixa
 * é filha do link: o mouse pode ir até ela) e persistente enquanto o mouse ou o foco ficam. No toque nunca abre.
 */
function AncoraNoTexto({
  peca,
  b,
  ativa,
  aoAbrir,
  exibir,
  resumoDaHipotese,
}: {
  peca: Extract<Peca, { tipo: 'ancora' }>
  b: number
  ativa: string | null
  aoAbrir?: Props['aoAbrirHipotese']
  exibir: (glId: string, guardado: string, b: number) => TermoExibido
  resumoDaHipotese?: Props['resumoDaHipotese']
}) {
  const { pathname, state } = useLocation()
  const comMouse = usePodePassarOMouse()
  // Três coisas separadas (T17-C-22): o mouse em cima (com a altura em que entrou), o foco visível no trecho e a dispensa por Esc. A
  // prévia fica aberta enquanto UM dos dois ficar (WCAG 1.4.13, persistente): tirar o mouse com o foco ali não a fecha.
  const [pairando, setPairando] = useState<{ y: number } | null>(null)
  const [focado, setFocado] = useState(false)
  const [dispensada, setDispensada] = useState(false)
  const aberta = comMouse && (pairando !== null || focado) && !dispensada

  useEffect(() => {
    if (!aberta) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      // A Esc é da prévia enquanto ela está aberta: não fecha o painel nem chega às outras teclas (WCAG 1.4.13).
      e.preventDefault()
      e.stopPropagation()
      setDispensada(true)
    }
    document.addEventListener('keydown', aoTeclar, true)
    return () => document.removeEventListener('keydown', aoTeclar, true)
  }, [aberta])

  const sairDoMouse = () => {
    setPairando(null)
    if (!focado) setDispensada(false)
  }
  const sairDoFoco = () => {
    setFocado(false)
    if (pairando === null) setDispensada(false)
  }
  const id = peca.hipoteses[0]!
  const aberto = ativa !== null && peca.hipoteses.includes(ativa)
  const nota = [peca.nivel ? ROTULO_DO_NIVEL[peca.nivel].toLowerCase() : 'sem nível', peca.modalidade ? ROTULO_DA_MODALIDADE[peca.modalidade] : null].filter(Boolean).join(', ')
  const mais = peca.hipoteses.length > 1 ? `; mais ${peca.hipoteses.length - 1} no mesmo trecho` : ''
  const skc = eHipoteseSkc(id)
  const partes = partesComInicios(peca.partes, b)
  return (
    <Link
      className={`ancora${skc ? ' ancora-skc' : ''}${aberto ? ' ancora-ativa' : ''}`}
      to={{ pathname, search: `?hipotese=${encodeURIComponent(id)}` }}
      state={state}
      replace
      aria-haspopup="dialog"
      aria-expanded={aberto}
      data-hipotese={id}
      data-hipoteses={peca.hipoteses.join(' ')}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => aoAbrir?.(id, e.currentTarget)}
      onMouseEnter={(e: MouseEvent<HTMLAnchorElement>) => {
        if (!comMouse) return
        // Entrar de novo rearma a prévia dispensada com Esc (o navegador não avisa a saída quando a caixa some debaixo do mouse).
        setDispensada(false)
        setPairando({ y: e.clientY })
      }}
      onMouseLeave={sairDoMouse}
      onFocus={(e: FocusEvent<HTMLAnchorElement>) => {
        e.currentTarget.querySelectorAll<HTMLElement>('.termo-marcado[data-tip]').forEach(ajustarDica)
        if (comMouse && focoVisivel(e.currentTarget)) setFocado(true)
      }}
      onBlur={sairDoFoco}
    >
      {partes.map(([parte, pb], i) =>
        parte.tipo === 'termo' ? (
          <TermoMarcado key={i} glId={parte.glId} guardado={parte.texto} b={pb} exibir={exibir} />
        ) : (
          <span key={i} data-b={pb}>
            {parte.texto}
          </span>
        ),
      )}
      <span className="so-leitor">{`, hipótese${skc ? ' SKC' : ''}: ${nota}${mais}`}</span>
      {aberta && (
        <PreviaDaHipotese
          nivel={peca.nivel}
          modalidade={peca.modalidade}
          outras={peca.hipoteses.length - 1}
          resumo={resumoDaHipotese?.(id) ?? null}
          dicas={[...new Set(partes.flatMap(([parte, pb]) => (parte.tipo === 'termo' ? [exibir(parte.glId, parte.texto, pb).dica] : [])).filter((d): d is string => d !== null))]}
          y={pairando?.y ?? null}
        />
      )}
    </Link>
  )
}

/**
 * A caixa da prévia: o marcador do nível, «Nível · certeza», «Termo: … · sobre …», a dica do termo (se há), quantas mais
 * hipóteses no trecho e a dica de clique. Fica logo abaixo da linha do trecho em que o mouse está (ou acima, se embaixo não
 * cabe na janela), dentro da coluna do parágrafo. É só visual (aria-hidden): o leitor de tela já ouve o nível e a certeza
 * na nota do link e a forma em uso no nome do termo.
 */
function PreviaDaHipotese({
  nivel,
  modalidade,
  outras,
  resumo,
  dicas,
  y,
}: {
  nivel: Nivel | null
  modalidade: Modalidade | null
  outras: number
  resumo: ResumoDaHipotese | null
  dicas: readonly string[]
  y: number | null
}) {
  const caixa = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = caixa.current
    const link = el?.parentElement
    const pai = el?.closest<HTMLElement>('.leitura-texto')
    if (!el || !link || !pai) return
    const posicionar = () => {
      const linhas = [...link.getClientRects()].filter((r) => r.width > 0 && r.height > 0)
      const linha: Retangulo | undefined = (y === null ? undefined : linhas.find((r) => y >= r.top - 1 && y <= r.bottom + 1)) ?? linhas[0]
      if (!linha) return
      const { top, left } = posicaoDaPrevia({ linha, pai: pai.getBoundingClientRect(), caixa: { largura: el.offsetWidth, altura: el.offsetHeight }, alturaDaJanela: window.innerHeight })
      el.style.top = `${top}px`
      el.style.left = `${left}px`
    }
    posicionar()
    // Com a prévia aberta o parágrafo pode se reajustar (uma imagem ou a fonte carrega, a janela muda de tamanho, o mouse parado): a
    // caixa acompanha a linha do trecho (T17-C-21). Sem ResizeObserver (testes antigos), só a janela.
    window.addEventListener('resize', posicionar)
    const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(posicionar)
    observador?.observe(pai)
    return () => {
      window.removeEventListener('resize', posicionar)
      observador?.disconnect()
    }
  }, [y])
  const texto = [nivel ? ROTULO_DO_NIVEL[nivel] : 'Sem nível', modalidade ? ROTULO_DA_MODALIDADE[modalidade] : null].filter(Boolean).join(' · ')
  return (
    <span ref={caixa} className="ancora-previa" aria-hidden="true" data-fora-do-texto="">
      <span className="ancora-previa-caixa">
        <span className="ancora-previa-nivel">
          <MarcadorDeNivel nivel={nivel} comTexto={false} />
          {texto}
        </span>
        {resumo && (
          <span>
            {resumo.termo ? (
              <>
                Termo: <strong>{resumo.termo}</strong> · sobre {resumo.sobre}
              </>
            ) : (
              <>Sobre {resumo.sobre}</>
            )}
          </span>
        )}
        {dicas.map((d) => (
          <span key={d} className="ancora-previa-termo">
            {d}
          </span>
        ))}
        {outras > 0 && <span className="ancora-previa-dica">{`mais ${outras} no mesmo trecho`}</span>}
        <span className="ancora-previa-dica">Clique no trecho para fixar o painel</span>
      </span>
    </span>
  )
}

interface PropsDoTermo {
  glId: string
  guardado: string
  b: number
  exibir: (glId: string, guardado: string, b: number) => TermoExibido
}

/** O link de um termo. A dica e o nome acessível dizem a forma em uso quando o texto não a mostra. */
function TermoNoTexto({ glId, guardado, b, exibir }: PropsDoTermo) {
  const { texto, dica, nome } = exibir(glId, guardado, b)
  return (
    <Link
      className={`termo${dica ? ' tip-start' : ''}`}
      to={`/verbete/${encodeURIComponent(glId)}`}
      aria-label={nome ?? undefined}
      data-tip={dica ?? undefined}
      onPointerEnter={dica ? (e) => ajustarDica(e.currentTarget) : undefined}
      onFocus={dica ? (e) => ajustarDica(e.currentTarget) : undefined}
      data-b={b}
      data-b-fim={b + guardado.length}
    >
      {texto}
    </Link>
  )
}

/** O termo dentro de uma âncora (não é um link à parte); a forma em uso vai para o leitor de tela (fora das posições) e a dica. */
function TermoMarcado({ glId, guardado, b, exibir }: PropsDoTermo) {
  const { texto, dica, apoio } = exibir(glId, guardado, b)
  return (
    <span className={`termo-marcado${dica ? ' tip-start' : ''}`} data-verbete={glId} data-tip={dica ?? undefined} data-b={b} data-b-fim={b + guardado.length} onPointerEnter={dica ? (e) => ajustarDica(e.currentTarget) : undefined}>
      {texto}
      {apoio && <span className="so-leitor">{`, ${apoio}`}</span>}
    </span>
  )
}

function partesComInicios<T extends { texto: string }>(partes: readonly T[], b: number): [T, number][] {
  let pos = b
  return partes.map((p) => {
    const inicio = pos
    pos += p.texto.length
    return [p, inicio]
  })
}
