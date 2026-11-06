import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { restaurarColecao } from '../colecoes/operacoes'
import { nomeDoPacote, useFormasDoPacote } from '../glossario/formasDoPacote'
import { restaurarVerbete } from '../glossario/operacoes'
import { restaurarHipotese, restaurarRegiao } from '../hipoteses/operacoes'
import { restaurarImagem } from '../imagens-usuario/operacoes'
import { useNumeracao } from '../objetos-skc/atual'
import { restaurarObjeto } from '../objetos-skc/operacoes'
import { destinoDe, useRedirecionamentos } from '../pacote/redirecionamentos'
import { useSitiosDoPacote } from '../sitios/pacote'
import { restaurarSitio } from '../sitios/operacoes'
import { Icon } from '../ui/Icon'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { registrar, registrarVarios, useEstado } from '../usuario/estado'
import type { Tipo } from '../usuario/eventos'
import { gruposDeExcluidos, textoDoRestaurado, type GrupoDeExcluidos, type LinhaExcluida } from './modelo'
import { guardarNomes, useNomesGuardados } from './nomesGuardados'
import '../telas/Estado.css'
import '../objetos-skc/Formulario.css'
import './Excluidos.css'

const TEMPO_DA_MENSAGEM_MS = 8000

/** Grava o `restaurar` do registro, pela função de cada tipo (a nota não tem uma: o evento direto). */
function restaurar(tipo: Tipo, id: string): Promise<unknown> {
  switch (tipo) {
    case 'objeto':
      return restaurarObjeto(id)
    case 'nota':
      return registrar('nota', id, 'restaurar')
    case 'colecao':
      return restaurarColecao(id)
    case 'hipotese':
      return restaurarHipotese(id)
    case 'regiao':
      return restaurarRegiao(id)
    case 'imagem':
      return restaurarImagem(id)
    case 'sitio':
      return restaurarSitio(id)
    case 'verbete':
      return restaurarVerbete(id)
    default:
      return registrar(tipo, id, 'restaurar')
  }
}

const chaveDe = (x: { tipo: Tipo; id: string }) => `${x.tipo}:${x.id}`
/** A pergunta da aprovação (o nome acessível da caixa): até o primeiro «?» que termina a frase. */
const perguntaDe = (confirmacao: string) => /^.*?\?(?=\s|$)/.exec(confirmacao)?.[0] ?? confirmacao
const eNumero = (s: string) => /^[A-Z]{2}\d{5}$/.test(s)

/** O texto com o número dos livros inteiro (T3-e): «TESTE-3» e «GL-000023» não quebram no hífen. */
function SemQuebrarONumero({ texto, numero }: { texto: string; numero: string | null }) {
  if (!numero || !texto.includes(numero)) return <>{texto}</>
  const partes = texto.split(numero)
  return (
    <>
      {partes.map((parte, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="exc-sem-quebra">{numero}</span>}
          {parte}
        </Fragment>
      ))}
    </>
  )
}

/** A caixa aberta: na linha `linha`, para restaurar `alvo` (a própria linha, ou o objeto dela com «Restaurar o objeto»). */
interface Aberta {
  linha: string
  alvo: string
  /** O botão que a abriu (o foco volta a ele ao cancelar). */
  gatilho: 'restaurar' | 'objeto'
}

interface Mensagem {
  texto: string
  caminho: string | null
  n: number
}

/**
 * A tela «Excluídos» (`#/excluidos`; 2C, bloco 1, spec §4; desenhos aprovados, seção 2). Tudo o que a pessoa excluiu, um grupo por
 * tipo, do mais recente para o mais antigo. «Restaurar» numa linha abre ali mesmo a aprovação, que diz o que volta junto e para
 * onde, com «Cancelar» (o foco começa nele e volta ao botão de origem ao fechar) e «Restaurar»; só o «Restaurar» da caixa grava
 * (o evento `restaurar` de cada tipo). Depois, a linha sai e a mensagem viva, presa ao pé da tela, diz «Restaurado: …» com «Ver».
 * Sem «apagar para sempre».
 */
export function Excluidos() {
  const estado = useEstado((e) => e)
  const numeracao = useNumeracao()
  const redirecionamentos = useRedirecionamentos()
  const formas = useFormasDoPacote()
  const sitios = useSitiosDoPacote()
  const nomeNoLivro = useCallback(
    (tipo: 'verbete' | 'sitio', id: string) => (tipo === 'verbete' ? nomeDoPacote(formas?.get(id)) : (sitios?.get(id)?.nome ?? null)),
    [formas, sitios],
  )
  // P5: o nome dos livros de uma origem só com a marca, guardado neste aparelho enquanto o pacote o traz, vale depois da importação.
  const guardados = useNomesGuardados()
  const nomeGuardado = useCallback((id: string) => guardados[id] ?? null, [guardados])
  useEffect(() => {
    if (!redirecionamentos) return
    const novos: Record<string, string> = {}
    for (const r of estado.excluidos) {
      if ((r.tipo !== 'verbete' && r.tipo !== 'sitio') || Object.keys(r.campos).length > 0) continue
      const destino = destinoDe(redirecionamentos, r.id)
      const nome = destino !== r.id ? nomeNoLivro(r.tipo, destino) : null
      if (nome) novos[r.id] = nome
    }
    void guardarNomes(novos).catch(() => undefined)
  }, [estado, redirecionamentos, nomeNoLivro])
  const grupos = useMemo(
    () => gruposDeExcluidos(estado, { redirecionamentos, nomeNoLivro, nomeGuardado, agora: Date.now() }),
    // A numeração muda com os números confirmados (que não estão no estado).
    [estado, numeracao, redirecionamentos, nomeNoLivro, nomeGuardado], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const linhas = useMemo(() => grupos.flatMap((g) => g.linhas), [grupos])
  const porChave = useMemo(() => new Map(linhas.map((l) => [chaveDe(l), l] as const)), [linhas])

  const [aberta, setAberta] = useState<Aberta | null>(null)
  const [falhou, setFalhou] = useState(false)
  const [mensagem, setMensagem] = useState<Mensagem | null>(null)
  const emAndamento = useRef(false)
  const tituloRef = useRef<HTMLHeadingElement>(null)
  const cancelarRef = useRef<HTMLButtonElement>(null)
  const mensagemRef = useRef<HTMLDivElement>(null)
  const botoes = useRef(new Map<string, HTMLButtonElement>())
  /** Para onde o foco vai depois de fechar a caixa (o botão de origem; depois de restaurar, o da linha que ficou no lugar). */
  const focoDepois = useRef<{ chave: string; gatilho: Aberta['gatilho']; indice: number; esperar: string | null } | null>(null)

  // A caixa de uma linha que sumiu (restaurada em outro lugar) fecha.
  const abertaValida = aberta && porChave.has(aberta.linha) && porChave.has(aberta.alvo) ? aberta : null

  useEffect(() => {
    if (abertaValida) cancelarRef.current?.focus()
  }, [abertaValida?.linha, abertaValida?.alvo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const f = focoDepois.current
    // Depois de restaurar, espera a linha restaurada sair da lista (o estado chega depois da gravação).
    if (!f || abertaValida || (f.esperar && porChave.has(f.esperar))) return
    focoDepois.current = null
    const destino =
      botoes.current.get(`${f.chave}|${f.gatilho}`) ??
      botoes.current.get(`${f.chave}|restaurar`) ??
      (linhas.length > 0 ? botoes.current.get(`${chaveDe(linhas[Math.min(f.indice, linhas.length - 1)]!)}|restaurar`) : undefined)
    ;(destino ?? tituloRef.current)?.focus()
  })

  // A mensagem some sozinha; com o foco nela («Ver»), espera mais um tempo e confere de novo (nunca fica para sempre).
  useEffect(() => {
    if (!mensagem) return
    let t: ReturnType<typeof setTimeout>
    const armar = () => {
      t = setTimeout(() => {
        if (mensagemRef.current?.contains(document.activeElement)) armar()
        else setMensagem(null)
      }, TEMPO_DA_MENSAGEM_MS)
    }
    armar()
    return () => clearTimeout(t)
  }, [mensagem])

  const abrir = (linha: LinhaExcluida, gatilho: Aberta['gatilho']) => {
    setFalhou(false)
    const alvo = gatilho === 'objeto' && linha.alvoExcluido ? chaveDe(linha.alvoExcluido) : chaveDe(linha)
    setAberta({ linha: chaveDe(linha), alvo, gatilho })
  }
  const fechar = () => {
    if (abertaValida) focoDepois.current = { chave: abertaValida.linha, gatilho: abertaValida.gatilho, indice: linhas.findIndex((l) => chaveDe(l) === abertaValida.linha), esperar: null }
    setAberta(null)
    setFalhou(false)
  }
  const confirmar = async () => {
    if (!abertaValida || emAndamento.current) return
    const alvo = porChave.get(abertaValida.alvo)
    if (!alvo) return
    emAndamento.current = true
    setFalhou(false)
    try {
      // Uma origem publicada volta com as outras origens excluídas da mesma entrada dos livros, numa só gravação (spec §5).
      if (alvo.juntas.length > 1) await registrarVarios(alvo.juntas.map((id) => ({ tipo: alvo.tipo, reg: id, op: 'restaurar' as const, campos: {} })))
      else await restaurar(alvo.tipo, alvo.id)
      focoDepois.current = { chave: abertaValida.linha, gatilho: 'restaurar', indice: linhas.findIndex((l) => chaveDe(l) === abertaValida.linha), esperar: abertaValida.alvo }
      setAberta(null)
      const nomes = alvo.juntas.map((id) => porChave.get(chaveDe({ tipo: alvo.tipo, id }))?.nome ?? id)
      setMensagem((m) => ({ texto: textoDoRestaurado(nomes), caminho: alvo.caminho, n: (m?.n ?? 0) + 1 }))
    } catch {
      setFalhou(true)
    } finally {
      emAndamento.current = false
    }
  }

  const refDo = (chave: string) => (el: HTMLButtonElement | null) => {
    if (el) botoes.current.set(chave, el)
    else botoes.current.delete(chave)
  }

  return (
    <div className="pagina-consulta exc-pagina">
      <TopoDoCelular voltar={{ href: '#/' }} busca={false} />
      <main className="exc-corpo">
        <div className="exc-cabeca">
          <h1 ref={tituloRef} tabIndex={-1}>
            Excluídos
          </h1>
          <p className="exc-intro">O que você excluiu fica guardado e pode voltar.</p>
        </div>
        {grupos.length === 0 ? (
          <p className="exc-vazio">Nada excluído. O que você excluir aparece aqui e pode ser restaurado.</p>
        ) : (
          grupos.map((g) => (
            <Grupo
              key={g.tipo}
              grupo={g}
              aberta={abertaValida}
              confirmacaoDe={(chave) => porChave.get(chave)?.confirmacao ?? ''}
              numeroDe={(chave) => porChave.get(chave)?.numeroNosLivros ?? null}
              falhou={falhou}
              cancelarRef={cancelarRef}
              refDo={refDo}
              aoAbrir={abrir}
              aoCancelar={fechar}
              aoRestaurar={() => void confirmar()}
            />
          ))
        )}
      </main>
      <div ref={mensagemRef} className="exc-mensagem" role="status" aria-label="Mensagem dos excluídos">
        {mensagem && (
          <>
            <span key={mensagem.n}>{mensagem.texto}</span>
            {mensagem.caminho && (
              <Link className="exc-mensagem-ver" to={mensagem.caminho} onClick={() => setMensagem(null)}>
                Ver
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  )
}

interface PropsDoGrupo {
  grupo: GrupoDeExcluidos
  aberta: Aberta | null
  confirmacaoDe: (chave: string) => string
  numeroDe: (chave: string) => string | null
  falhou: boolean
  cancelarRef: React.RefObject<HTMLButtonElement | null>
  refDo: (chave: string) => (el: HTMLButtonElement | null) => void
  aoAbrir: (linha: LinhaExcluida, gatilho: Aberta['gatilho']) => void
  aoCancelar: () => void
  aoRestaurar: () => void
}

function Grupo({ grupo, aberta, confirmacaoDe, numeroDe, falhou, cancelarRef, refDo, aoAbrir, aoCancelar, aoRestaurar }: PropsDoGrupo) {
  const id = useId()
  return (
    <section className="exc-secao" aria-labelledby={`${id}-t`}>
      <div className="exc-secao-cab">
        <h2 id={`${id}-t`}>{grupo.titulo}</h2>
        <span className="exc-secao-n">{grupo.linhas.length}</span>
      </div>
      <ul className="exc-lista">
        {grupo.linhas.map((l) => {
          const chave = chaveDe(l)
          const nomeId = `${id}-${chave}`
          const caixa = aberta?.linha === chave ? confirmacaoDe(aberta.alvo) : null
          const meta = [l.onde, l.quando].filter(Boolean).join(' · ')
          return (
            <li key={chave} className={`exc-linha${caixa ? ' exc-linha-aberta' : ''}`}>
              <div className="exc-linha-texto">
                {l.caminho ? (
                  <Link id={nomeId} to={l.caminho} className={`exc-nome${eNumero(l.nome) ? ' exc-nome-codigo' : ''}`}>
                    {l.nome}
                  </Link>
                ) : (
                  <span id={nomeId} className={`exc-nome${eNumero(l.nome) ? ' exc-nome-codigo' : ''}`}>
                    {l.nome}
                  </span>
                )}
                <span className="exc-meta">{meta}</span>
              </div>
              {caixa === null ? (
                <div className="exc-acoes">
                  <button ref={refDo(`${chave}|restaurar`)} type="button" className="exc-restaurar" aria-describedby={nomeId} onClick={() => aoAbrir(l, 'restaurar')}>
                    Restaurar
                  </button>
                  {l.alvoExcluido && (
                    <button ref={refDo(`${chave}|objeto`)} type="button" className="exc-restaurar-objeto" aria-describedby={nomeId} onClick={() => aoAbrir(l, 'objeto')}>
                      Restaurar o objeto
                    </button>
                  )}
                </div>
              ) : (
                <div className="exc-confirmar" role="group" aria-label={perguntaDe(caixa)}>
                  <p>
                    <SemQuebrarONumero texto={caixa} numero={numeroDe(aberta!.alvo)} />
                  </p>
                  {falhou && (
                    <p className="exc-erro" role="alert">
                      <Icon name="aviso" size={16} />
                      Não foi possível restaurar; tente de novo.
                    </p>
                  )}
                  <div className="exc-confirmar-botoes">
                    <button ref={cancelarRef} type="button" className="form-botao" onClick={aoCancelar}>
                      Cancelar
                    </button>
                    <button type="button" className="form-botao form-botao-forte" onClick={aoRestaurar}>
                      Restaurar
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
