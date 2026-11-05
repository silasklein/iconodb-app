import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAtalhos } from '../app/useAtalhos'
import { resumosDosObjetos } from '../banco/consultas'
import { refDeObjeto, type Membro } from '../colecoes/modelo'
import { lerImagemAberta } from '../imagem/estado'
import { ImagemDaColuna } from '../comparar/ImagemDaColuna'
import { montarLinhas, type Celula, type Coluna, type Linha } from '../comparar/linhas'
import { lerDesfazerDaTroca, MAXIMO_DA_BANDEJA } from '../comparar/modelo'
import { acrescentarABandeja, desfazerEsvaziar, desfazerSubstituicao, devolverABandeja, esvaziarBandeja, tirarDaBandeja } from '../comparar/operacoes'
import { useBandeja } from '../comparar/useBandeja'
import { objetoQueTeveONumero, useColunas } from '../comparar/useColunas'
import { useNumeracao } from '../objetos-skc/atual'
import { idDeObjetoSkc, type Numeracao } from '../objetos-skc/numeracao'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useTema } from '../ui/useTema'
import { useIrParaTras } from '../ui/useVoltar'
import { plural } from '../usuario/textosDaSync'
import { useSincronizacao } from '../usuario/useSincronizacao'
import '../imagens-usuario/MarcaSkc.css'
import '../objetos-skc/Formulario.css'
import '../objetos-skc/ObjetoSkc.css'
import './Comparar.css'

/** Um texto com mais que isto fica recolhido, com "Ler tudo": a linha continua alinhada e o objeto de texto curto não fica com um buraco enorme. */
const LIMITE_DO_TEXTO = 420
const MSG_FALHA = 'Não foi possível guardar a mudança; tente de novo.'

interface Aviso {
  texto: string
  desfazer?: () => Promise<void>
  /**
   * O Desfazer de «Comparar todos»: só vale enquanto a bandeja é exatamente o que a troca produziu (`entraram`) e o último evento
   * do registro dela ainda é o da troca (`hlc`; T17-C-1).
   */
  troca?: { previa: Membro[]; entraram: string[]; hlc: string }
  /** O Desfazer falhou ao gravar: a oferta fica e a falha aparece ao lado dela (T17-C-5). */
  falhou?: boolean
}

/** O que sobra do estado do roteador depois de usar (ou trocar) a mensagem de «Comparar todos»: o resto (a imagem aberta…) fica. */
function semAviso(state: unknown): Record<string, unknown> | null {
  if (!state || typeof state !== 'object') return null
  const { aviso: _a, desfazer: _d, ...resto } = state as Record<string, unknown>
  return Object.keys(resto).length > 0 ? resto : null
}
/** O estado do histórico sem o Desfazer da troca (a mensagem fica). */
function semDesfazer(state: unknown): Record<string, unknown> | null {
  if (!state || typeof state !== 'object') return null
  const { desfazer: _d, ...resto } = state as Record<string, unknown>
  return resto
}
const MSG_MUDOU = 'A bandeja mudou; não dá mais para desfazer.'

/** Para onde o foco vai quando o botão clicado some (tirar, esvaziar): decidido ao clicar, cumprido quando a tela já mudou. */
type PedidoDeFoco = { tipo: 'tirar'; ref: string; onde: 'bandeja' | 'espera'; indice: number } | { tipo: 'esvaziar' }

/** Como a bandeja chama um objeto: o número do livro ou do objeto SKC; o id de um objeto SKC ainda sem número. */
function rotuloDaRef(ref: string, numeracao: Numeracao): string {
  if (!idDeObjetoSkc(ref)) return ref
  return numeracao.porId.get(ref)?.numero ?? ref
}

const rotuloDaColuna = (c: Coluna) => c.numero ?? c.ref

const TITULO_SEM_DADOS: Record<Coluna['situacao'], string> = {
  ok: 'Carregando…',
  excluido: '',
  ausente: 'Este objeto ainda não chegou a este aparelho; aparece quando a sincronização trouxer.',
  'nao-encontrado': 'Este número não está no pacote.',
  erro: 'Não foi possível ler este objeto agora.',
}

/**
 * Comparar (Comparar.dc.html): os objetos da bandeja (até 4) lado a lado no computador, com a imagem, a ficha e as leituras
 * alinhadas por seção — cada campo e cada leitura é uma linha, e o que um objeto não tem é uma célula vazia na mesma linha,
 * nunca um deslocamento. No celular, um objeto por vez: deslizar para os lados (ou os botões) anda entre eles, com a posição
 * ("2 de 3"). "≠" marca o que difere; o botão das diferenças esconde o que é igual. A bandeja é sincronizada como o resto da
 * camada do usuário (src/comparar/modelo.ts); o que não coube depois de uma fusão aparece em "Não couberam", nunca some.
 */
export function Comparar() {
  useTema('item')
  const bandeja = useBandeja()
  const { colunas, carregando } = useColunas(bandeja.itens)
  const numeracao = useNumeracao()
  const computador = useBreakpoint() === 'computador'
  const local = useLocation()
  const { state } = local
  const navegar = useNavigate()
  const [params, setParams] = useSearchParams()
  const fechar = useIrParaTras('#/')
  // A posição no celular («pos», de 1 em diante) e «só as diferenças» («dif») vivem no endereço: voltar do visualizador de imagem
  // (ou recarregar) encontra a tela como estava.
  const [diferencas, setDiferencas] = useState(() => params.get('dif') === '1')
  const [adicionando, setAdicionando] = useState(false)
  // Chegando de «Comparar todos» (decisão 44): a mensagem e o Desfazer vêm no estado do histórico, que sobrevive a recarregar.
  const [aviso, setAviso] = useState<Aviso | null>(() => {
    const e = state as { aviso?: unknown; desfazer?: unknown } | null
    if (typeof e?.aviso !== 'string') return null
    const d = lerDesfazerDaTroca(e.desfazer)
    return { texto: e.aviso, troca: d ?? undefined }
  })
  const [atual, setAtual] = useState(() => Math.max(0, (Number.parseInt(params.get('pos') ?? '', 10) || 1) - 1))
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(new Set())
  const faixa = useRef<HTMLDivElement>(null)
  const barra = useRef<HTMLDivElement>(null)
  const regiao = useRef<HTMLDivElement>(null)
  const pedidoDeFoco = useRef<PedidoDeFoco | null>(null)
  // `noRoteador` é a entrada do histórico COMO A TELA JÁ A DEIXOU (vários pedidos no mesmo instante partem uma do resultado da outra),
  // não só o que o roteador entregou. Só é refeito a partir do roteador quando ele entrega uma localização NOVA (T17-C-2).
  const noRoteador = useRef(local)
  const ultimaDoRoteador = useRef(local)
  if (ultimaDoRoteador.current !== local) {
    ultimaDoRoteador.current = local
    noRoteador.current = local
  }
  const { iniciado } = useSincronizacao()

  /** O «+» do topo, achado na hora de usar (ele não precisa ter sido clicado antes). */
  const maisDoTopo = () => barra.current?.querySelector<HTMLElement>('button[aria-label="Adicionar objeto à comparação"]') ?? null
  /**
   * Troca o estado da entrada atual do histórico (sem empilhar). Vários pedidos no mesmo instante (o aviso que sai, o Desfazer que
   * sai, o endereço que se acerta) partem do estado que o anterior deixou, não do último render: `noRoteador` é atualizado já, e só
   * volta a seguir o roteador quando ele entrega uma localização nova.
   */
  const trocarEstadoDoHistorico = (novo: (estado: unknown) => unknown) => {
    const l = noRoteador.current
    const estado = novo(l.state)
    noRoteador.current = { ...l, state: estado }
    void navegar({ pathname: l.pathname, search: l.search }, { replace: true, state: estado })
  }
  /** A mensagem de «Comparar todos» só vale uma vez: depois de usada ou trocada, sai do estado do histórico. */
  const limparAvisoDoHistorico = () => {
    const e = noRoteador.current.state as { aviso?: unknown } | null
    if (e && typeof e === 'object' && 'aviso' in e) trocarEstadoDoHistorico(semAviso)
  }
  /** O Desfazer da troca sai do estado do histórico: voltar ou recarregar não o traz de volta (a mensagem fica). */
  const limparDesfazerDoHistorico = () => {
    const e = noRoteador.current.state as { desfazer?: unknown } | null
    if (e && typeof e === 'object' && 'desfazer' in e) trocarEstadoDoHistorico(semDesfazer)
  }
  const dizer = (a: Aviso | null) => {
    setAviso(a)
    limparAvisoDoHistorico()
  }

  const n = colunas.length
  const posicao = Math.min(atual, Math.max(n - 1, 0))
  const linhas = useMemo(() => montarLinhas(colunas), [colunas])
  const comDiferencas = n > 1
  // «Só as diferenças» não faz sentido com menos de 2 objetos (não há com o que diferir): a opção fica no endereço, mas só vale com 2 ou mais.
  const filtrando = diferencas && comDiferencas
  const visiveis = filtrando ? linhas.filter((l) => l.difere) : linhas
  const totalDeLinhas = 3 + visiveis.length

  // O endereço acompanha a posição e «só as diferenças» (sem empilhar histórico). Enquanto a bandeja chega (menos de 2 colunas) o
  // `pos` do endereço fica como está: é dele que a tela vai ler a posição quando as colunas aparecerem.
  // Também confere de novo quando o roteador entrega um endereço: no celular, a rolagem suave do «Objeto seguinte» passa pela
  // coluna de antes, a tela pede «?pos=2», «» e «?pos=2» de novo, e as entregas do roteador chegam atrasadas; se a última a
  // chegar for a sem «pos», a tela a corrige (gate D-11 da Tarefa 17c, revisão 1).
  useEffect(() => {
    const proximo = new URLSearchParams(noRoteador.current.search)
    if (diferencas) proximo.set('dif', '1')
    else proximo.delete('dif')
    if (n >= 2) {
      if (posicao > 0) proximo.set('pos', String(posicao + 1))
      else proximo.delete('pos')
    }
    if (proximo.toString() !== noRoteador.current.search.replace(/^\?/, '')) {
      noRoteador.current = { ...noRoteador.current, search: `?${proximo.toString()}` }
      setParams(proximo, { replace: true, state: noRoteador.current.state })
    }
  }, [diferencas, posicao, n, local.search]) // eslint-disable-line react-hooks/exhaustive-deps
  // Ao abrir numa posição (voltando do visualizador, recarregando), a faixa rola até ela.
  const rolouAoAbrir = useRef(false)
  useEffect(() => {
    if (rolouAoAbrir.current || computador || n < 2) return
    rolouAoAbrir.current = true
    const el = faixa.current
    if (posicao > 0 && el && typeof el.scrollTo === 'function') el.scrollTo({ left: posicao * el.clientWidth, behavior: 'auto' })
  }, [n, computador]) // eslint-disable-line react-hooks/exhaustive-deps

  const irPara = useCallback(
    (i: number) => {
      if (n < 2) return
      const alvo = (i + n) % n
      setAtual(alvo)
      const el = faixa.current
      if (el && typeof el.scrollTo === 'function') el.scrollTo({ left: alvo * el.clientWidth, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    },
    [n],
  )
  const aoRolar = useCallback(() => {
    const el = faixa.current
    if (!el || el.clientWidth === 0) return
    setAtual(Math.max(0, Math.min(n - 1, Math.round(el.scrollLeft / el.clientWidth))))
  }, [n])

  useAtalhos({ Escape: fechar }, 'global')
  useAtalhos(
    {
      ArrowLeft: () => (!computador && n > 1 ? irPara(posicao - 1) : false),
      ArrowRight: () => (!computador && n > 1 ? irPara(posicao + 1) : false),
    },
    'comparar',
  )

  const tentar = async (acao: () => Promise<void>): Promise<boolean> => {
    try {
      await acao()
      return true
    } catch {
      dizer({ texto: MSG_FALHA })
      return false
    }
  }

  const tirar = async (ref: string) => {
    const nome = rotuloDaRef(ref, numeracao)
    const onde = bandeja.itens.includes(ref) ? 'bandeja' : 'espera'
    const indice = onde === 'bandeja' ? bandeja.itens.indexOf(ref) : bandeja.excedentes.indexOf(ref)
    let ordem: number | null = null
    const ok = await tentar(async () => {
      ordem = await tirarDaBandeja(ref)
    })
    if (!ok) return
    pedidoDeFoco.current = { tipo: 'tirar', ref, onde, indice }
    dizer({ texto: `${nome} tirado da comparação.`, desfazer: async () => (ordem === null ? undefined : devolverABandeja(ref, ordem)) })
  }

  const esvaziar = async () => {
    let havia: Awaited<ReturnType<typeof esvaziarBandeja>> = []
    const ok = await tentar(async () => {
      havia = await esvaziarBandeja()
    })
    if (!ok) return
    pedidoDeFoco.current = { tipo: 'esvaziar' }
    dizer({ texto: `Comparação esvaziada: ${plural(havia.length, 'objeto tirado', 'objetos tirados')}.`, desfazer: () => desfazerEsvaziar(havia) })
  }

  // O Desfazer da troca (decisão 44) só é oferecido enquanto a bandeja é exatamente o que a troca produziu: mesmos objetos, mesma
  // ordem, sem excedentes. Se deixou de ser (trabalho depois da troca, outro aparelho), o botão some e o Desfazer sai do histórico.
  const troca = aviso?.troca
  // Além do conteúdo, o último evento do registro tem de ser o da troca: se a bandeja voltou ao mesmo conteúdo por outro caminho
  // (tirou e pôs de volta, ou outro aparelho fez o mesmo), o Desfazer de antes não vale mais (T17-C-1).
  const trocaVale = !!troca && bandeja.alteradoEm === troca.hlc && bandeja.todos.length === troca.entraram.length && bandeja.todos.every((m, i) => m.ref === troca.entraram[i])
  useEffect(() => {
    // Ao abrir, o estado pode ainda estar chegando (a bandeja parece vazia): só se julga depois de ele ser lido.
    if (!troca || !iniciado || trocaVale) return
    setAviso((a) => (a?.troca === troca ? { texto: a.texto } : a))
    limparDesfazerDoHistorico()
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const desfazer = async () => {
    const a = aviso
    if (a?.troca) {
      const { previa, entraram, hlc } = a.troca
      let feito = false
      if (!(await tentarDesfazer(a, async () => void (feito = await desfazerSubstituicao(previa, entraram, hlc))))) return
      if (feito) dizer(null)
      else {
        setAviso({ texto: MSG_MUDOU })
        limparDesfazerDoHistorico()
      }
      return
    }
    if (!a?.desfazer) return
    if (await tentarDesfazer(a, a.desfazer)) dizer(null)
  }
  /** Como `tentar`, mas a falha NÃO apaga a oferta: o Desfazer continua ali, com a falha ao lado, para tentar de novo (T17-C-5). */
  const tentarDesfazer = async (a: Aviso, acao: () => Promise<void>): Promise<boolean> => {
    try {
      await acao()
      return true
    } catch {
      setAviso({ ...a, falhou: true })
      return false
    }
  }

  // O foco não se perde: o botão clicado (Tirar, Esvaziar) sai da tela, e o foco vai para a próxima ação útil, assim que a tela já
  // reflete a mudança. Depois de tirar: o «Tirar» que ocupa o lugar na lista de onde saiu, ou o «+» se não sobrou nenhum. Depois
  // de esvaziar: o «Desfazer» da mensagem.
  useEffect(() => {
    const p = pedidoDeFoco.current
    if (!p || !aviso) return
    let alvo: HTMLElement | null | undefined
    if (p.tipo === 'esvaziar') {
      if (bandeja.todos.length > 0) return
      alvo = regiao.current?.querySelector<HTMLElement>('button')
    } else {
      if (bandeja.todos.some((m) => m.ref === p.ref)) return
      const botoes = [...document.querySelectorAll<HTMLElement>(p.onde === 'bandeja' ? '.comparar-tirar' : '.comparar-excedentes button')]
      alvo = botoes[Math.min(p.indice, botoes.length - 1)] ?? maisDoTopo()
    }
    pedidoDeFoco.current = null
    alvo?.focus()
  })

  // O foco não cai no corpo da página quando o botão que o tinha SOME por outro motivo: o «Desfazer» que foi clicado, ou a coluna cujo
  // «Tirar» tinha o foco e que uma sincronização tirou (T17-C-4). Vai ao «+», a ação que sempre existe. (Os pedidos de foco acima, de
  // tirar e esvaziar, têm prioridade: este só age quando não há pedido em espera.)
  const focoDaTela = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (pedidoDeFoco.current) return
    const ativo = document.activeElement
    if (ativo instanceof HTMLElement && ativo !== document.body) return
    const antes = focoDaTela.current
    if (antes && !antes.isConnected) {
      focoDaTela.current = null
      maisDoTopo()?.focus()
    }
  })

  const alternarTexto = (chave: string) =>
    setAbertas((s) => {
      const novo = new Set(s)
      if (!novo.delete(chave)) novo.add(chave)
      return novo
    })

  // «Ampliar a imagem»: o visualizador recebe o original ligado. Antes de ir, a tela guarda no estado da própria entrada do histórico
  // de qual coluna e qual imagem (como o Item): ao fechar (voltar no histórico) a tela monta de novo, lê isso e devolve o foco a
  // ESSE «Ampliar» (são vários na tela). Em dois tempos, para o roteador não juntar os dois navegar() num só.
  const [ampliando, setAmpliando] = useState<{ imagemId: string; original: boolean; chaveAntes: string } | null>(null)
  const ampliarImagem = useCallback(
    (ref: string, imagemId: string, original: boolean) => {
      const l = noRoteador.current
      const base = l.state && typeof l.state === 'object' ? (l.state as Record<string, unknown>) : {}
      void navegar({ pathname: l.pathname, search: l.search }, { replace: true, state: { ...base, imagemAberta: { imagemId, original }, ampliouDe: ref } })
      setAmpliando({ imagemId, original, chaveAntes: l.key })
    },
    [navegar],
  )
  useEffect(() => {
    if (!ampliando || local.key === ampliando.chaveAntes) return
    setAmpliando(null)
    void navegar(`/imagem/${encodeURIComponent(ampliando.imagemId)}`, { state: { ampliada: true, original: ampliando.original } })
  }, [ampliando, local.key, navegar])
  const ampliouDe = (state as { ampliouDe?: unknown } | null)?.ampliouDe
  const imagemAberta = lerImagemAberta(state)

  const total = bandeja.todos.length

  return (
    <div className="comparar" onFocus={(e) => (focoDaTela.current = e.target as HTMLElement)}>
      <TopoDoCelular voltar={{ href: '#/', rotulo: 'Voltar' }} />
      <main className="comparar-corpo" aria-busy={carregando || undefined}>
        <div className="comparar-topo">
          <h1 className="comparar-titulo">
            Comparar · {plural(bandeja.itens.length, 'objeto', 'objetos')}
          </h1>
          <div ref={barra} role="toolbar" aria-label="Ações da comparação" className="comparar-acoes">
            <IconButton icon="adicionar" label="Adicionar objeto à comparação" expandido={adicionando} onClick={() => setAdicionando((a) => !a)} />
            {comDiferencas && <IconButton icon="diferencas" label="Mostrar só as diferenças" pressionado={diferencas} onClick={() => setDiferencas((d) => !d)} />}
            {total > 0 && <IconButton icon="excluir" label="Esvaziar a comparação" onClick={() => void esvaziar()} />}
            {computador && <IconButton icon="fechar" label="Fechar a comparação" shortcut="Escape" shortcutLabel="Esc" onClick={fechar} />}
          </div>
        </div>

        {adicionando && (
          <AdicionarPorNumero
            aoFechar={() => {
              setAdicionando(false)
              requestAnimationFrame(() => maisDoTopo()?.focus())
            }}
            aoResultar={(texto) => dizer({ texto })}
          />
        )}

        <div className="comparar-avisos">
          <div ref={regiao} className="comparar-aviso" role="status" aria-label="Mensagem de Comparar">
            {aviso && (
              <>
                <span>{aviso.texto}</span>
                {aviso.falhou && <span className="comparar-aviso-falha">{MSG_FALHA}</span>}
                {(aviso.desfazer || (aviso.troca && trocaVale)) && (
                  <button type="button" className="comparar-link" onClick={() => void desfazer()}>
                    Desfazer
                  </button>
                )}
              </>
            )}
          </div>
          {bandeja.excedentes.length > 0 && (
            <section className="comparar-excedentes" aria-labelledby="comparar-excedentes-titulo">
              <h2 id="comparar-excedentes-titulo">Não couberam</h2>
              <p>
                {plural(bandeja.excedentes.length, 'objeto não coube', 'objetos não couberam')}: a comparação mostra no máximo {MAXIMO_DA_BANDEJA}. Tire um da comparação para o próximo entrar, ou tire estes daqui.
              </p>
              <ul>
                {bandeja.excedentes.map((ref) => (
                  <li key={ref}>
                    <span className="codigo">{rotuloDaRef(ref, numeracao)}</span>
                    <button type="button" className="comparar-link" aria-label={`Tirar da comparação: ${rotuloDaRef(ref, numeracao)}`} onClick={() => void tirar(ref)}>
                      Tirar
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {n === 0 ? (
          <div className="comparar-vazio">
            <p>Nenhum objeto na comparação.</p>
            <p>
              Em um objeto, use o botão <strong>Comparar</strong> (no teclado, Shift+C) para pôr até {MAXIMO_DA_BANDEJA} aqui, ou use o + acima para escrever o número. Numa citação como «IPIAO I: 1–3», «Comparar todos» troca a comparação pelos objetos dela.
            </p>
            <p>
              <Link to="/colecoes">Ver as coleções</Link>
            </p>
          </div>
        ) : (
          <>
            {!computador && n > 1 && (
              <nav className="comparar-posicao" aria-label="Posição na comparação">
                <IconButton icon="anterior" label="Objeto anterior" shortcut="ArrowLeft" shortcutLabel="←" tipPosition="start" onClick={() => irPara(posicao - 1)} />
                <span className="comparar-posicao-n codigo" role="status">
                  {posicao + 1} de {n}
                </span>
                <IconButton icon="proximo" label="Objeto seguinte" shortcut="ArrowRight" shortcutLabel="→" onClick={() => irPara(posicao + 1)} />
              </nav>
            )}
            {filtrando && visiveis.length === 0 && (
              <p className="comparar-aviso" role="status">
                Nenhuma diferença nos dados mostrados.
              </p>
            )}
            <div
              ref={faixa}
              className="comparar-colunas"
              data-n={n}
              data-testid="comparar-colunas"
              style={{ '--n': n, gridTemplateRows: ['auto', '340px', ...visiveis.map(() => 'auto'), 'auto'].join(' ') } as React.CSSProperties}
              onScroll={aoRolar}
            >
              {colunas.map((c, i) => (
                <ColunaDoObjeto
                  key={c.ref}
                  c={c}
                  linhas={visiveis}
                  indice={i}
                  total={n}
                  totalDeLinhas={totalDeLinhas}
                  abertas={abertas}
                  aoAlternar={alternarTexto}
                  aoTirar={() => void tirar(c.ref)}
                  nomeParaTirar={rotuloDaRef(c.ref, numeracao)}
                  aoAmpliar={(imagemId, original) => ampliarImagem(c.ref, imagemId, original)}
                  voltouDoVisualizador={ampliouDe === c.ref}
                  imagemAberta={ampliouDe === c.ref ? imagemAberta : null}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function ColunaDoObjeto({
  c,
  linhas,
  indice,
  total,
  totalDeLinhas,
  abertas,
  aoAlternar,
  aoTirar,
  nomeParaTirar,
  aoAmpliar,
  voltouDoVisualizador,
  imagemAberta,
}: {
  c: Coluna
  linhas: readonly Linha[]
  indice: number
  total: number
  totalDeLinhas: number
  abertas: ReadonlySet<string>
  aoAlternar: (chave: string) => void
  aoTirar: () => void
  nomeParaTirar: string
  aoAmpliar: (imagemId: string, original: boolean) => void
  /** O visualizador acabou de fechar e foi desta coluna que se ampliou: o foco volta ao «Ampliar» dela. */
  voltouDoVisualizador: boolean
  imagemAberta: ReturnType<typeof lerImagemAberta>
}) {
  const semDados = c.situacao === 'ausente' || c.situacao === 'nao-encontrado' || c.situacao === 'erro' || (c.situacao === 'ok' && c.titulo === '')
  const titulo = semDados ? TITULO_SEM_DADOS[c.situacao] : c.titulo
  const nome = rotuloDaColuna(c)
  return (
    <section className="comparar-coluna" aria-label={nome} aria-roledescription="objeto" data-posicao={`${indice + 1} de ${total}`} style={{ gridRow: `1 / span ${totalDeLinhas}` }}>
      <header className="comparar-cabeca" style={{ gridRow: 1 }}>
        <p className="comparar-numero codigo">
          {/* o número e a origem andam juntos («CA00006 · SKC»); só as marcas descem (T17-C-7) */}
          <span className="comparar-numero-e-origem">
            <span>{c.numero ?? (c.skc && c.situacao !== 'ausente' ? 'Sem número' : c.ref)}</span>
            {c.origem && (
              <>
                {' '}
                <span className="comparar-origem">· {c.origem}</span>
              </>
            )}
          </span>
          {c.ligadoA && <span className="marca-ligado">{`ligado a ${c.ligadoA}`}</span>}
          {c.marcas.map((m) => (
            <span key={m} className="marca-excluido">
              {m}
            </span>
          ))}
        </p>
        <h2 className={semDados ? 'comparar-sem-dados' : undefined}>{titulo}</h2>
      </header>
      <div className="comparar-imagem" style={{ gridRow: 2 }}>
        {semDados ? <div className="comparar-imagem-vazia" aria-hidden="true" /> : <ImagemDaColuna coluna={c} aoAmpliar={aoAmpliar} voltouDoVisualizador={voltouDoVisualizador} inicial={imagemAberta} />}
      </div>
      <dl className="comparar-linhas">
        {linhas.map((l, k) => (
          <CelulaDaLinha key={l.chave} linha={l} celula={l.celulas[indice] ?? null} linhaDaGrade={3 + k} aberta={abertas.has(l.chave)} aoAlternar={() => aoAlternar(l.chave)} />
        ))}
      </dl>
      <footer className="comparar-pe" style={{ gridRow: totalDeLinhas }}>
        <Link className="comparar-link" to={c.rota} aria-label={`Abrir o item ${nome}`}>
          Abrir o item
        </Link>
        <button type="button" className="comparar-link comparar-tirar" aria-label={`Tirar da comparação: ${nomeParaTirar}`} onClick={aoTirar}>
          Tirar da comparação
        </button>
      </footer>
    </section>
  )
}

function CelulaDaLinha({ linha, celula, linhaDaGrade, aberta, aoAlternar }: { linha: Linha; celula: Celula | null; linhaDaGrade: number; aberta: boolean; aoAlternar: () => void }) {
  const idTexto = useId()
  const longo = !!celula && celula.texto.length > LIMITE_DO_TEXTO
  return (
    <div className={`comparar-celula comparar-celula-${linha.grupo}${celula ? '' : ' comparar-celula-vazia'}${linha.difere ? ' comparar-difere' : ''}`} style={{ gridRow: linhaDaGrade }}>
      <dt>
        {linha.rotulo}
        {linha.difere && (
          <span className="comparar-sinal" role="img" aria-label="difere">
            ≠
          </span>
        )}
      </dt>
      <dd>
        {celula ? (
          <>
            <p id={idTexto} className={`comparar-texto${longo && !aberta ? ' comparar-texto-recolhido' : ''}`} lang={celula.lang === 'de' ? 'de' : undefined}>
              {celula.texto}
            </p>
            {celula.lang === 'de' && <span className="comparar-nota">original em alemão, ainda sem tradução</span>}
            {longo && (
              <button type="button" className="comparar-link" aria-expanded={aberta} aria-controls={idTexto} onClick={aoAlternar}>
                {aberta ? 'Recolher' : 'Ler tudo'}
              </button>
            )}
          </>
        ) : (
          <>
            <span aria-hidden="true">—</span>
            <span className="so-leitor">sem dado</span>
          </>
        )}
      </dd>
    </div>
  )
}

/**
 * "+": escreve o número de um objeto (do livro ou SKC) e o põe na comparação. Confere que o objeto existe (no pacote ou entre os
 * objetos SKC) antes de gravar; a mensagem diz o que aconteceu (entrou, já estava, bandeja cheia).
 */
function AdicionarPorNumero({ aoFechar, aoResultar }: { aoFechar: () => void; aoResultar: (texto: string) => void }) {
  const numeracao = useNumeracao()
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const campo = useRef<HTMLInputElement>(null)
  const idCampo = useId()
  const idErro = useId()
  useEffect(() => campo.current?.focus(), [])

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setErro(null)
    const ref = refDeObjeto(texto)
    if (!ref) {
      setErro('Escreva o número do objeto (ex.: CA00023).')
      campo.current?.focus()
      return
    }
    setOcupado(true)
    try {
      // Um número que um objeto SKC tem agora vale pelo id dele; senão tem de existir no pacote; senão, se é o provisório que um
      // objeto SKC teve e perdeu (Tarefa 9), vale pelo id desse objeto (o mesmo que o Item faz).
      let alvo = ref
      const skc = idDeObjetoSkc(ref) ? ref : numeracao.porNumero.get(ref)
      if (skc) alvo = skc
      else {
        const achados = await resumosDosObjetos([ref]).catch(() => null)
        if (achados === null) {
          setErro('Não foi possível conferir o número agora; tente de novo.')
          campo.current?.focus()
          return
        }
        if (achados.length === 0) {
          const antigo = objetoQueTeveONumero(ref, numeracao)
          if (!antigo) {
            setErro(`Não achei o objeto ${ref}.`)
            campo.current?.focus()
            return
          }
          alvo = antigo
        }
      }
      const r = await acrescentarABandeja(alvo)
      aoResultar(r.tipo === 'entrou' ? `${ref} entrou na comparação.` : r.tipo === 'ja-estava' ? `${ref} já está na comparação.` : `A comparação já tem ${MAXIMO_DA_BANDEJA} objetos. Tire um para pôr outro.`)
      if (r.tipo === 'entrou') {
        setTexto('')
        aoFechar()
      }
    } catch {
      setErro(MSG_FALHA)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <form
      className="comparar-adicionar"
      aria-label="Adicionar por número"
      onSubmit={(e) => void enviar(e)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          aoFechar()
        }
      }}
      noValidate
    >
      <div className="form-campo">
        <label htmlFor={idCampo}>Número do objeto</label>
        <input
          ref={campo}
          id={idCampo}
          type="text"
          value={texto}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="CA00023"
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? idErro : undefined}
          onChange={(e) => {
            setTexto(e.target.value)
            setErro(null)
          }}
        />
        {erro && (
          <p id={idErro} className="form-erro" role="alert">
            <Icon name="aviso" size={16} />
            {erro}
          </p>
        )}
      </div>
      <span className="comparar-adicionar-acoes">
        <button type="submit" className="objeto-botao" aria-busy={ocupado || undefined}>
          Adicionar
        </button>
        <button type="button" className="comparar-link" onClick={aoFechar}>
          Cancelar
        </button>
      </span>
    </form>
  )
}
