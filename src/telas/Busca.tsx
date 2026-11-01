import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { ErroSemPacote } from '../banco/cliente'
import type { Verbete } from '../banco/tipos'
import {
  CHAVES_DE_FILTRO,
  ESCOPOS,
  ROTULO_DA_CHAVE,
  ROTULO_DO_ESCOPO,
  buscar,
  type ChaveDeFiltro,
  type Escopo,
  type Filtros,
  type ResultadoDaBusca,
} from '../busca/consulta'
import { estadoDoResultado, lerParametros, montarParametros, temFiltros, type ParametrosDaBusca } from '../busca/url'
import { CartaoDeObjeto } from '../ui/CartaoDeObjeto'
import { IconButton } from '../ui/IconButton'
import { useBreakpoint } from '../ui/useBreakpoint'
import { CampoDeBusca } from './CampoDeBusca'
import { Facetas } from './Facetas'
import './Busca.css'

const OBJETOS_POR_PAGINA = 120
const ESPERA_AO_DIGITAR_MS = 250

export const MSG_VAZIA = 'Digite um termo, um sítio ou o número de um objeto (por exemplo CA00023).'
export const MSG_SEM_PACOTE = 'O banco ainda não está no aparelho.'
const MSG_ERRO = 'Não foi possível buscar agora. Tente de novo.'

type Estado =
  | { fase: 'vazia' }
  | { fase: 'buscando' }
  | { fase: 'ok'; resultado: ResultadoDaBusca; ocupado: boolean }
  | { fase: 'erro'; semPacote: boolean }

const objetos = (n: number) => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'objeto' : 'objetos'}`

const TIPO_DO_VERBETE: Record<Verbete['tipo'], string> = { concept: 'conceito', name: 'nome', technical: 'técnico' }

/** O resultado da busca de `q`; refaz quando a consulta, o escopo, os filtros ou o limite mudam. */
function useBusca(q: string, escopo: Escopo, filtros: Filtros, limite: number): Estado {
  const [estado, setEstado] = useState<Estado>({ fase: q.trim() === '' ? 'vazia' : 'buscando' })
  const chave = JSON.stringify([q, escopo, filtros, limite])
  useEffect(() => {
    if (q.trim() === '') {
      setEstado({ fase: 'vazia' })
      return
    }
    let vivo = true
    setEstado((e) => (e.fase === 'ok' ? { ...e, ocupado: true } : { fase: 'buscando' }))
    buscar(q, { escopo, filtros, limite }).then(
      (resultado) => vivo && setEstado(resultado.vazia ? { fase: 'vazia' } : { fase: 'ok', resultado, ocupado: false }),
      (erro: unknown) => vivo && setEstado({ fase: 'erro', semPacote: erro instanceof ErroSemPacote }),
    )
    return () => {
      vivo = false
    }
    // `chave` resume q, escopo, filtros e limite
  }, [chave])
  return estado
}

export function Busca() {
  const [params, setParams] = useSearchParams()
  const { pathname, search } = useLocation()
  const computador = useBreakpoint() === 'computador'
  const atual = useMemo(() => lerParametros(params), [params])
  const { q, escopo, filtros } = atual

  const [texto, setTexto] = useState(q)
  const ultimoEnviado = useRef(q)
  const [limite, setLimite] = useState(OBJETOS_POR_PAGINA)
  const [folha, setFolha] = useState(false)

  const estado = useBusca(q, escopo, filtros, limite)

  // O endereço mudou por fora (Início, voltar, limpar filtros): o campo acompanha.
  useEffect(() => {
    if (q !== ultimoEnviado.current) {
      ultimoEnviado.current = q
      setTexto(q)
    }
  }, [q])
  // Outra consulta, escopo ou filtro: volta à primeira página.
  useEffect(() => setLimite(OBJETOS_POR_PAGINA), [q, escopo, JSON.stringify(filtros)])

  const ir = useCallback(
    (novo: Partial<ParametrosDaBusca>, substituir = true) => {
      ultimoEnviado.current = novo.q ?? q
      setParams(montarParametros({ q, escopo, filtros, ...novo }), { replace: substituir })
    },
    [q, escopo, filtros, setParams],
  )

  // Digitar atualiza o resultado depois de uma pequena espera; Enter, na hora.
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(espera.current), [])
  const aoDigitar = (novo: string) => {
    setTexto(novo)
    clearTimeout(espera.current)
    espera.current = setTimeout(() => ir({ q: novo }), novo === '' ? 0 : ESPERA_AO_DIGITAR_MS)
  }
  const aoEnviar = (novo: string) => {
    clearTimeout(espera.current)
    ir({ q: novo })
  }

  const alternar = (chave: ChaveDeFiltro, valor: string) => {
    const lista = filtros[chave] ?? []
    ir({ filtros: { ...filtros, [chave]: lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor] } })
  }
  const limparFiltros = () => ir({ filtros: {} })

  const resultado = estado.fase === 'ok' ? estado.resultado : null
  const caminhoAtual = `${pathname}${search}`

  // Etiquetas dos filtros: o rótulo vem das facetas (que sempre trazem os valores ativos).
  const etiquetas = CHAVES_DE_FILTRO.flatMap((chave) =>
    (filtros[chave] ?? []).map((valor) => ({
      chave,
      valor,
      rotulo: resultado?.facetas.find((f) => f.chave === chave)?.opcoes.find((o) => o.valor === valor)?.rotulo ?? valor,
    })),
  )

  useEffect(() => {
    if (!folha) return
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setFolha(false)
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [folha])
  useEffect(() => {
    if (computador) setFolha(false)
  }, [computador])

  const campo = <CampoDeBusca id="busca-q" valor={texto} aoMudar={aoDigitar} aoEnviar={aoEnviar} atalho />

  const abas = (
    <div className="busca-escopos" role="group" aria-label="Escopo da busca">
      {ESCOPOS.map((e) => (
        <button
          key={e}
          type="button"
          className="hit"
          aria-pressed={e === escopo}
          aria-label={resultado ? `${ROTULO_DO_ESCOPO[e]}, ${objetos(resultado.contagens[e])}` : undefined}
          onClick={() => ir({ escopo: e })}
        >
          {ROTULO_DO_ESCOPO[e]}
          {resultado && (
            <span className="busca-escopo-n codigo" aria-hidden="true">
              {resultado.contagens[e].toLocaleString('pt-BR')}
            </span>
          )}
        </button>
      ))}
    </div>
  )

  const filtrosAtivos = etiquetas.length > 0 && (
    <div className="busca-etiquetas">
      {computador && <span className="busca-etiquetas-titulo">Filtros ativos</span>}
      {etiquetas.map((e) => (
        <button
          key={`${e.chave}:${e.valor}`}
          type="button"
          className="busca-etiqueta hit"
          aria-label={`Tirar o filtro ${ROTULO_DA_CHAVE[e.chave]}: ${e.rotulo}`}
          onClick={() => alternar(e.chave, e.valor)}
        >
          <span>
            <span className="busca-etiqueta-chave">{ROTULO_DA_CHAVE[e.chave]}:</span> {e.rotulo}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      ))}
      <button type="button" className="busca-limpar hit" onClick={limparFiltros}>
        Limpar filtros
      </button>
    </div>
  )

  return (
    <>
      <div className="busca-pagina" inert={folha}>
        <h1 className="so-leitor">Busca</h1>

        {!computador && (
          <div className="busca-cabecalho">
            <IconButton icon="voltar" label="Voltar" href="#/" tipPosition="start" />
            {estado.fase === 'ok' && resultado!.facetas.length > 0 && (
              <IconButton
                icon="filtro"
                label="Filtrar resultados: publicação, período, sítio, tipo, nível, certeza"
                expandido={folha}
                abre="dialog"
                onClick={() => setFolha(true)}
              />
            )}
          </div>
        )}

        <div className={computador ? 'busca-computador' : 'busca-celular'}>
          {computador && (
            <aside className="busca-facetas" aria-label="Filtros">
              <div className="busca-facetas-topo">
                <h2>Filtros</h2>
                {resultado && <span>contagem em {objetos(resultado.totalSemFiltros)}</span>}
              </div>
              {resultado && <Facetas facetas={resultado.facetas} aoAlternar={alternar} />}
            </aside>
          )}

          <main className="busca-principal" aria-busy={estado.fase === 'buscando' || (estado.fase === 'ok' && estado.ocupado)}>
            {campo}
            {abas}

            {estado.fase === 'vazia' && (
              <div className="busca-aviso" role="status">
                <p>{MSG_VAZIA}</p>
                <p className="busca-aviso-menor">A busca ignora maiúsculas e acentos.</p>
              </div>
            )}

            {estado.fase === 'buscando' && (
              <p className="busca-aviso" role="status">
                Buscando…
              </p>
            )}

            {estado.fase === 'erro' && (
              <div className="busca-aviso" role="alert">
                <p>{estado.semPacote ? MSG_SEM_PACOTE : MSG_ERRO}</p>
                {estado.semPacote && (
                  <p>
                    <Link to="/preparando">Preparar o banco</Link>
                  </p>
                )}
              </div>
            )}

            {resultado && (
              <>
                {resultado.verbeteDestaque && <VerbeteEmDestaque verbete={resultado.verbeteDestaque} computador={computador} />}
                {resultado.verbetesRelacionados.length > 0 && (
                  <p className="busca-ver-tambem">
                    <span>Ver também: </span>
                    {resultado.verbetesRelacionados.map((v, i) => (
                      <span key={v.id}>
                        {i > 0 && ', '}
                        <Link to={`/verbete/${v.id}`}>{v.rotulo}</Link>
                      </span>
                    ))}
                  </p>
                )}

                {filtrosAtivos}

                <section className="busca-resultados" aria-label="Resultados">
                  {resultado.total > 0 && (
                    <div className="busca-contagem">
                      <h2>{objetos(resultado.total)}</h2>
                      <span>
                        {temFiltros(filtros)
                          ? `${resultado.totalSemFiltros.toLocaleString('pt-BR')} sem filtros`
                          : computador
                            ? 'por número do banco'
                            : ''}
                      </span>
                    </div>
                  )}

                  {resultado.total === 0 ? (
                    <SemResultado q={q} escopo={escopo} resultado={resultado} aoTudo={() => ir({ escopo: 'tudo' })} aoLimpar={limparFiltros} />
                  ) : (
                    <>
                      <div className="busca-grade">
                        {resultado.objetos.map((o) => (
                          <CartaoDeObjeto key={o.numero} objeto={o} grande={computador} state={estadoDoResultado(resultado.numeros, caminhoAtual)} />
                        ))}
                      </div>
                      {resultado.objetos.length < resultado.total && (
                        <button type="button" className="busca-mais" onClick={() => setLimite((l) => l + OBJETOS_POR_PAGINA)}>
                          Mostrar mais ({(resultado.total - resultado.objetos.length).toLocaleString('pt-BR')})
                        </button>
                      )}
                    </>
                  )}
                </section>
              </>
            )}
          </main>
        </div>
      </div>

      {folha && resultado && (
        <FolhaDeFiltros resultado={resultado} aoAlternar={alternar} aoLimpar={limparFiltros} aoFechar={() => setFolha(false)} />
      )}
    </>
  )
}

function SemResultado({
  q,
  escopo,
  resultado,
  aoTudo,
  aoLimpar,
}: {
  q: string
  escopo: Escopo
  resultado: ResultadoDaBusca
  aoTudo: () => void
  aoLimpar: () => void
}) {
  const filtrado = resultado.totalSemFiltros > 0
  const noutroEscopo = escopo !== 'tudo' && resultado.contagens.tudo > 0
  return (
    <div className="busca-aviso" role="status">
      <p className="busca-nada">Nada encontrado para «{q.trim()}»</p>
      {filtrado && (
        <p>
          Sem os filtros há {objetos(resultado.totalSemFiltros)}.{' '}
          <button type="button" className="busca-link" onClick={aoLimpar}>
            Limpar filtros
          </button>
        </p>
      )}
      {noutroEscopo && (
        <p>
          Em «{ROTULO_DO_ESCOPO.tudo}» há {objetos(resultado.contagens.tudo)}.{' '}
          <button type="button" className="busca-link" onClick={aoTudo}>
            Buscar em Tudo
          </button>
        </p>
      )}
      {!filtrado && !noutroEscopo && <p className="busca-aviso-menor">Confira a grafia: a busca ignora maiúsculas e acentos.</p>}
    </div>
  )
}

function VerbeteEmDestaque({ verbete, computador }: { verbete: Verbete; computador: boolean }) {
  const nome = verbete.pt ?? verbete.de ?? verbete.id
  const rotulo = ['Verbete', TIPO_DO_VERBETE[verbete.tipo], verbete.status === 'proposed' ? 'a revisar' : null].filter(Boolean).join(' · ')
  return (
    <section className="busca-verbete" aria-label="Verbete correspondente">
      <div className="busca-verbete-topo">
        <span className="busca-verbete-tipo">{rotulo}</span>
        <span className="busca-verbete-id codigo">{verbete.id}</span>
      </div>
      <div className="busca-verbete-nome">
        <h2>{nome}</h2>
        <Link className="hit" to={`/verbete/${verbete.id}`}>
          Abrir verbete
        </Link>
      </div>
      <p className="busca-verbete-resumo">
        {verbete.objetos.length.toLocaleString('pt-BR')} {verbete.objetos.length === 1 ? 'objeto' : 'objetos'} com{' '}
        {verbete.hipoteses.length.toLocaleString('pt-BR')} {verbete.hipoteses.length === 1 ? 'hipótese' : 'hipóteses'}
      </p>
      <dl>
        {verbete.de && (
          <>
            <dt>Alemão</dt>
            <dd className="busca-italico">{verbete.de}</dd>
          </>
        )}
        {verbete.en && (
          <>
            <dt>Inglês</dt>
            <dd className="busca-italico">{verbete.en}</dd>
          </>
        )}
        {verbete.pai && (
          <>
            <dt>Pai</dt>
            <dd>
              <Link to={`/verbete/${verbete.pai.id}`}>{verbete.pai.pt ?? verbete.pai.id}</Link>
            </dd>
          </>
        )}
        {computador && verbete.iconclass.length > 0 && (
          <>
            <dt>Iconclass</dt>
            <dd className="codigo">{verbete.iconclass.map((i) => i.notacao).join(', ')}</dd>
          </>
        )}
        {computador && verbete.sssl.length > 0 && (
          <>
            <dt>SSSL</dt>
            <dd className="codigo">{verbete.sssl.map((i) => i.codigo).join(', ')}</dd>
          </>
        )}
      </dl>
    </section>
  )
}

/** Os filtros no celular: uma folha sobre a tela (o resto fica inerte). */
function FolhaDeFiltros({
  resultado,
  aoAlternar,
  aoLimpar,
  aoFechar,
}: {
  resultado: ResultadoDaBusca
  aoAlternar: (chave: ChaveDeFiltro, valor: string) => void
  aoLimpar: () => void
  aoFechar: () => void
}) {
  const fechar = useRef<HTMLDivElement>(null)
  // Abre com o foco no botão de fechar; ao fechar, o foco volta a quem abriu.
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    fechar.current?.querySelector<HTMLElement>('button, a')?.focus()
    return () => anterior?.focus?.()
  }, [])
  return (
    <div className="busca-folha" role="dialog" aria-modal="true" aria-label="Filtros">
      <div className="busca-folha-topo" ref={fechar}>
        <IconButton icon="fechar" label="Fechar os filtros" shortcut="Escape" shortcutLabel="Esc" tipPosition="start" onClick={aoFechar} />
        <h2>Filtros</h2>
      </div>
      <div className="busca-folha-corpo">
        <Facetas facetas={resultado.facetas} aoAlternar={aoAlternar} />
      </div>
      <div className="busca-folha-pe">
        <button type="button" className="busca-link" onClick={aoLimpar}>
          Limpar filtros
        </button>
        <button type="button" className="busca-botao" onClick={aoFechar}>
          Ver {objetos(resultado.total)}
        </button>
      </div>
    </div>
  )
}
