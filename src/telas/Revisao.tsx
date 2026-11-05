import { memo, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAtalhos } from '../app/useAtalhos'
import { desfazerResolvido, marcarComoResolvido } from '../revisao/operacoes'
import { casosIguais, type Caso, type GrupoDaFila } from '../revisao/fila'
import { useFilaComCarga } from '../revisao/useFila'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { numeroPtBr } from '../ui/numero'
import './Estado.css'
import './Revisao.css'

/** Quantos casos de um grupo aparecem de início, e quantos mais cada «Mostrar mais» traz (a página nunca desenha milhares de uma vez). */
const VISIVEIS = 25
const PASSO = 100
/** Quanto tempo o aviso de «marcado como resolvido» fica na tela (a tecla U ainda desfaz depois). */
export const TEMPO_DO_AVISO_MS = 8000
const PARAMETRO_ABERTOS = 'abrir'
/** Quantos casos estão mostrados em cada lista, no endereço: `ate=<grupo>:<n>`; `<grupo>~r` é a lista dos resolvidos. */
const PARAMETRO_ATE = 'ate'

const lista = (p: URLSearchParams, nome: string) => new Set((p.get(nome) ?? '').split(',').filter(Boolean))
const mostrados = (p: URLSearchParams): Map<string, number> => {
  const m = new Map<string, number>()
  for (const par of (p.get(PARAMETRO_ATE) ?? '').split(',')) {
    const i = par.lastIndexOf(':')
    const n = Number(par.slice(i + 1))
    if (i > 0 && Number.isInteger(n) && n > 0) m.set(par.slice(0, i), n)
  }
  return m
}
const plural = (n: number, um: string, varios: string) => `${numeroPtBr(n)} ${n === 1 ? um : varios}`
const resumoDoCaso = (c: Caso) => (c.numero !== '—' ? c.numero : c.o_que.length > 40 ? `${c.o_que.slice(0, 39)}…` : c.o_que)

/**
 * Revisão (Revisao.dc.html, PC-Revisao.dc.html): a fila do que o processamento não decidiu sozinho, em grupos que abrem. Cada caso
 * leva ao lugar certo para resolver (o objeto, o sítio, o verbete, a bibliografia, o rascunho) e pode ser deixado como está
 * («Deixar como está», ou a tecla D no caso em foco, o marca como resolvido; «Desfazer», ou a tecla U, o devolve à fila; a marca
 * é um registro `revisao` que se sincroniza como o resto). Os grupos abertos e quantos casos cada lista mostra ficam no endereço
 * (`?abrir=`, `?ate=`), então voltar de um caso encontra a tela como estava; a rolagem volta pelo `useRestaurarRolagem`. As
 * listas mostram 25 casos e crescem de 100 em 100 («Mostrar mais»), e cada linha só se refaz quando o seu caso muda. A conta é
 * a de `montarFila`, a mesma do Menu e do ponto da barra.
 */
export function Revisao() {
  const { carga, fila } = useFilaComCarga({ lugares: true, exigirBanco: true })
  const [params, setParams] = useSearchParams()
  const abertos = lista(params, PARAMETRO_ABERTOS)
  const ate = mostrados(params)
  /** O último caso deixado como está: o que a tecla U desfaz (o aviso some sozinho, o U não). */
  const [ultimo, setUltimo] = useState<{ chave: string; texto: string } | null>(null)
  const [avisoVisivel, setAvisoVisivel] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [foco, setFoco] = useState<{ chave?: string; grupo?: string } | null>(null)
  const raiz = useRef<HTMLElement>(null)
  const filaAtual = useRef(fila)
  filaAtual.current = fila

  const mudar = useCallback(
    (nome: string, id: string, ligar: boolean) =>
      setParams(
        (atual) => {
          const p = new URLSearchParams(atual)
          const l = lista(p, nome)
          if (ligar) l.add(id)
          else l.delete(id)
          if (l.size === 0) p.delete(nome)
          else p.set(nome, [...l].join(','))
          return p
        },
        { replace: true },
      ),
    [setParams],
  )
  const verAte = useCallback(
    (lista: string, n: number) =>
      setParams(
        (atual) => {
          const p = new URLSearchParams(atual)
          const m = mostrados(p)
          m.set(lista, n)
          p.set(PARAMETRO_ATE, [...m].map(([k, v]) => `${k}:${v}`).join(','))
          return p
        },
        { replace: true },
      ),
    [setParams],
  )

  // O aviso fica uns segundos; um novo caso marcado recomeça a contagem.
  useEffect(() => {
    if (!avisoVisivel) return
    const t = setTimeout(() => setAvisoVisivel(false), TEMPO_DO_AVISO_MS)
    return () => clearTimeout(t)
  }, [avisoVisivel, ultimo])

  // Depois de uma ação o caso muda de lugar: o foco vai ao botão do caso (ou ao do vizinho / do grupo), nunca se perde.
  useEffect(() => {
    if (!foco) return
    const el =
      (foco.chave ? [...(raiz.current?.querySelectorAll<HTMLElement>('[data-chave]') ?? [])].find((e) => e.dataset.chave === foco.chave)?.querySelector<HTMLElement>('button') : null) ??
      (foco.grupo ? raiz.current?.querySelector<HTMLElement>(`[data-grupo="${foco.grupo}"] > button, [data-grupo="${foco.grupo}"] > a`) : null)
    el?.focus()
    setFoco(null)
  }, [foco, fila])

  const resolver = useCallback(async (grupo: string, c: Caso) => {
    if (!c.deixavel) return
    const g = filaAtual.current?.grupos.find((x) => x.id === grupo)
    const doGrupo = g?.abertos.filter((x) => x.deixavel) ?? []
    const i = doGrupo.findIndex((x) => x.chave === c.chave)
    const vizinho = doGrupo[i + 1] ?? doGrupo[i - 1] ?? null
    setErro(null)
    try {
      await marcarComoResolvido(c.chave, c.tipo)
      setUltimo({ chave: c.chave, texto: c.numero !== '—' ? c.numero : resumoDoCaso(c) })
      setAvisoVisivel(true)
      setFoco({ chave: vizinho?.chave, grupo })
    } catch {
      setErro('Não foi possível guardar; tente de novo. Nada foi perdido.')
    }
  }, [])
  const desfazer = useCallback(async (chave: string) => {
    setErro(null)
    try {
      await desfazerResolvido(chave)
      setUltimo((u) => (u?.chave === chave ? null : u))
      setFoco({ chave })
    } catch {
      setErro('Não foi possível guardar; tente de novo. Nada foi perdido.')
    }
  }, [])
  const aoDesfazerUm = useCallback((c: Caso) => void desfazer(c.chave), [desfazer])
  const aoResolverUm = useCallback((grupo: string, c: Caso) => void resolver(grupo, c), [resolver])

  // D: deixar como está o caso da linha em foco. U: desfazer o último. (Ignoradas dentro de campos de texto.)
  useAtalhos(
    {
      d: () => {
        const chave = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-chave]')?.dataset.chave
        if (!chave) return false
        for (const g of filaAtual.current?.grupos ?? []) {
          const c = g.abertos.find((x) => x.chave === chave)
          if (c?.deixavel) {
            void resolver(g.id, c)
            return
          }
        }
        return false
      },
      u: () => {
        if (!ultimo) return false
        void desfazer(ultimo.chave)
      },
    },
    'revisao',
  )

  return (
    <div className="pagina-consulta">
      <TopoDoCelular voltar={{ href: '#/' }} />
      <main ref={raiz} className="pagina-consulta-corpo revisao">
        <h1>Revisão</h1>
        {carga.fase === 'erro' && <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />}
        {fila && (
          <>
            <p className="pagina-consulta-apoio">
              {numeroPtBr(fila.total)} {fila.total === 1 ? 'caso' : 'casos'} · o que o processamento não decidiu sozinho
            </p>
            {fila.resolvidosPelaPessoa > 0 && (
              <p className="pagina-consulta-apoio">
                {plural(fila.resolvidosPelaPessoa, 'resolvido', 'resolvidos')} por você, fora da contagem.
              </p>
            )}
            {fila.sitiosLigados > 0 && (
              <p className="pagina-consulta-apoio">
                {plural(fila.sitiosLigados, 'resolvido', 'resolvidos')} por você, trocando o sítio do objeto na ficha.
              </p>
            )}
            {erro && (
              <p className="form-erro revisao-erro" role="alert">
                <Icon name="aviso" size={16} />
                {erro}
              </p>
            )}
            {fila.grupos.length === 0 ? (
              <p className="pagina-consulta-vazio">Nada a revisar.</p>
            ) : (
              <ul className="revisao-tipos" aria-label="Casos por tipo">
                {fila.grupos.map((g) => (
                  <li key={g.id} data-grupo={g.id}>
                    <Grupo
                      g={g}
                      aberto={abertos.has(g.id)}
                      ateAbertos={ate.get(g.id) ?? VISIVEIS}
                      ateResolvidos={ate.get(`${g.id}~r`) ?? VISIVEIS}
                      aoAbrir={(a) => mudar(PARAMETRO_ABERTOS, g.id, a)}
                      aoVerAte={verAte}
                      aoResolver={aoResolverUm}
                      aoDesfazer={aoDesfazerUm}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
      <p className="revisao-aviso" role="status" aria-live="polite" hidden={!ultimo || !avisoVisivel}>
        {ultimo && avisoVisivel && (
          <>
            <span>{ultimo.texto}: marcado como resolvido.</span>
            <button type="button" className="revisao-desfazer" aria-keyshortcuts="U" onClick={() => void desfazer(ultimo.chave)}>
              <Icon name="desfazer" size={16} />
              Desfazer
            </button>
          </>
        )}
      </p>
    </div>
  )
}

interface PropsDoGrupo {
  g: GrupoDaFila
  aberto: boolean
  ateAbertos: number
  ateResolvidos: number
  aoAbrir: (aberto: boolean) => void
  aoVerAte: (lista: string, n: number) => void
  aoResolver: (grupo: string, c: Caso) => void
  aoDesfazer: (c: Caso) => void
}

function Grupo({ g, aberto, ateAbertos, ateResolvidos, aoAbrir, aoVerAte, aoResolver, aoDesfazer }: PropsDoGrupo) {
  const cabeca = (
    <>
      <span className="revisao-grupo-nome">
        <span className="revisao-grupo-rotulo">{g.rotulo}</span>
        <span className="revisao-grupo-apoio">{g.apoio}</span>
      </span>
      <span className="revisao-grupo-fim">
        <span className={`codigo revisao-grupo-quantidade${g.soConsulta ? ' revisao-grupo-quantidade-so-consulta' : ''}`}>{numeroPtBr(g.quantidade)}</span>
        <Icon name={g.link ? 'detalhe' : aberto ? 'recolher' : 'adicionar'} size={16} />
      </span>
    </>
  )
  if (g.link) {
    return (
      <Link className="revisao-grupo-cabeca" to={g.link.para} aria-label={`${g.rotulo}, ${numeroPtBr(g.quantidade)}: ${g.link.rotulo}`}>
        {cabeca}
      </Link>
    )
  }
  const idLista = `revisao-casos-${g.id}`
  // Ao «Mostrar mais», o botão some (ou muda de nome) e o foco iria junto: vai à primeira linha que apareceu (T17-B-19).
  const listaDosAbertos = useRef<HTMLUListElement>(null)
  const listaDosResolvidos = useRef<HTMLUListElement>(null)
  const focarDepois = useRef<{ lista: 'abertos' | 'resolvidos'; indice: number } | null>(null)
  useEffect(() => {
    const pedido = focarDepois.current
    if (!pedido) return
    const ul = (pedido.lista === 'abertos' ? listaDosAbertos : listaDosResolvidos).current
    const linha = ul?.querySelectorAll<HTMLElement>(':scope > li')[pedido.indice]
    if (!linha) return
    focarDepois.current = null
    linha.querySelector<HTMLElement>('a, button')?.focus()
  }, [ateAbertos, ateResolvidos])
  const dosAbertos = g.abertos.slice(0, ateAbertos)
  const dosResolvidos = g.resolvidos.slice(0, ateResolvidos)
  return (
    <>
      <button type="button" className="revisao-grupo-cabeca" aria-expanded={aberto} aria-controls={idLista} onClick={() => aoAbrir(!aberto)}>
        {cabeca}
      </button>
      {aberto && (
        <div id={idLista} className="revisao-casos">
          {g.soConsulta && <p className="revisao-so-consulta">Só para consulta: não entra no total.</p>}
          {g.abertos.length > 0 && (
            <ul ref={listaDosAbertos} aria-label={`Casos de ${g.rotulo}`}>
              {dosAbertos.map((c) => (
                <LinhaDoCaso key={c.chave} grupo={g.id} c={c} aoResolver={aoResolver} />
              ))}
            </ul>
          )}
          {g.abertos.length > dosAbertos.length && (
            <button type="button" className="revisao-ver-todas hit" onClick={() => {
                focarDepois.current = { lista: 'abertos', indice: dosAbertos.length }
                aoVerAte(g.id, dosAbertos.length + Math.min(PASSO, g.abertos.length - dosAbertos.length))
              }}>
              Mostrar mais {numeroPtBr(Math.min(PASSO, g.abertos.length - dosAbertos.length))} ({numeroPtBr(dosAbertos.length)} de {numeroPtBr(g.abertos.length)})
            </button>
          )}
          {g.resolvidos.length > 0 && (
            <>
              <h3 className="revisao-resolvidos-titulo">Resolvidos por você · {numeroPtBr(g.resolvidos.length)}</h3>
              <ul ref={listaDosResolvidos} aria-label={`Resolvidos de ${g.rotulo}`}>
                {dosResolvidos.map((c) => (
                  <LinhaDoCaso key={c.chave} grupo={g.id} c={c} resolvido aoDesfazer={aoDesfazer} />
                ))}
              </ul>
              {g.resolvidos.length > dosResolvidos.length && (
                <button
                  type="button"
                  className="revisao-ver-todas hit"
                  onClick={() => {
                    focarDepois.current = { lista: 'resolvidos', indice: dosResolvidos.length }
                    aoVerAte(`${g.id}~r`, dosResolvidos.length + Math.min(PASSO, g.resolvidos.length - dosResolvidos.length))
                  }}
                >
                  Mostrar mais {numeroPtBr(Math.min(PASSO, g.resolvidos.length - dosResolvidos.length))} resolvidos ({numeroPtBr(dosResolvidos.length)} de {numeroPtBr(g.resolvidos.length)})
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}

interface PropsDaLinha {
  grupo: string
  c: Caso
  resolvido?: boolean
  aoResolver?: (grupo: string, c: Caso) => void
  aoDesfazer?: (c: Caso) => void
}

/** Uma linha só se refaz quando o seu caso muda (as listas têm centenas de linhas e cada ação refaz a fila inteira). */
const LinhaDoCaso = memo(function LinhaDoCaso({ grupo, c, resolvido = false, aoResolver, aoDesfazer }: PropsDaLinha) {
  const resumo = resumoDoCaso(c)
  const navegar = useNavigate()
  // A ação navega pelo roteador (uma entrada de histórico do app): a tela aberta sabe que há para onde voltar (T17-B-22).
  const irPara = (para: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    void navegar(para)
  }
  // O número leva ao objeto; sem número (um «—») não há o que abrir por ele, e a ação da linha já leva ao mesmo lugar.
  const comNumero = c.abrir && c.numero !== '—'
  return (
    <li className={`revisao-caso${resolvido ? ' revisao-caso-resolvido' : ''}`} data-chave={c.chave}>
      {comNumero ? (
        <Link className="hit revisao-caso-numero" to={c.abrir!} aria-label={`Abrir ${c.numero}`}>
          {c.numero}
        </Link>
      ) : (
        <span className="revisao-caso-numero">{c.numero}</span>
      )}
      <span className="revisao-caso-texto">
        <span className="revisao-caso-o-que">{c.o_que}</span>
        <span className="revisao-caso-onde">{c.onde}</span>
      </span>
      <span className="revisao-caso-acoes">
        {resolvido ? (
          <button type="button" className="revisao-desfazer" aria-label={`Desfazer: ${resumo}`} onClick={() => aoDesfazer?.(c)}>
            <Icon name="desfazer" size={16} />
            Desfazer
          </button>
        ) : (
          <>
            {/* Só «Resolver» e «Escolher» mexem em algo (lápis); «Abrir …» só leva ao lugar (seta). */}
            {c.acao && <IconButton icon={c.acao.rotulo.startsWith('Abrir') ? 'detalhe' : 'editarFicha'} size={18} label={c.acao.rotulo} href={`#${c.acao.para}`} onClick={irPara(c.acao.para)} />}
            {c.deixavel && <IconButton icon="arquivar" size={18} label={`Deixar como está: ${resumo}`} shortcut="D" onClick={() => aoResolver?.(grupo, c)} />}
          </>
        )}
      </span>
    </li>
  )
}, (a, b) => a.grupo === b.grupo && a.resolvido === b.resolvido && a.aoResolver === b.aoResolver && a.aoDesfazer === b.aoDesfazer && casosIguais(a.c, b.c))
