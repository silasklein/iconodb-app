import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { reabrirBanco } from '../banco/cliente'
import { eErroDeRede, fonteDropbox } from '../dropbox/fonte'
import { armazemPadrao, type Armazem } from '../pacote/armazem'
import { sincronizarPacote, type Etapa } from '../pacote/baixar'
import type { CacheImagens } from '../pacote/imagens'
import { gravarPreferencias, lerEstado, lerPreferencias } from '../pacote/local'
import {
  ErroDeIntegridade,
  ErroDeLogin,
  ErroDeSchema,
  ErroDeSincronizacaoEmAndamento,
  MSG_SCHEMA,
  type Fonte,
} from '../pacote/manifesto'
import './Preparando.css'

const ETAPAS: Etapa[] = ['Banco de dados', 'Imagens de tela']

export const MSG_SEM_CONEXAO = 'Sem conexão: o app abre com o que já está no aparelho'
const MSG_SEM_CONEXAO_PRIMEIRA = 'Sem conexão: o primeiro download precisa de internet'
const MSG_SEM_CONEXAO_NO_MEIO = 'Sem conexão. O que já foi baixado fica guardado e o download continua de onde parou.'
const MSG_INTEGRIDADE = 'Um arquivo não passou na conferência e foi descartado; o que já estava no aparelho foi mantido.'
export const MSG_EM_ANDAMENTO = 'Já há uma sincronização em andamento em outra janela do app. Espere terminar e tente de novo.'
const MSG_GERAL = 'Não foi possível baixar o pacote; tente de novo'

type Fase = 'baixando' | 'pronto' | 'erro'
type Erro = 'sem-conexao' | 'schema' | 'integridade' | 'em-andamento' | 'geral'
type Andamento = Partial<Record<Etapa, { feito: number; total: number }>>

/** Tamanho em unidades decimais (como o Dropbox e o macOS), na unidade do total. */
export function formatarProgresso(feito: number, total: number): string {
  const unidades: Array<[string, number]> = [['GB', 1e9], ['MB', 1e6], ['KB', 1e3], ['B', 1]]
  const [nome, base] = unidades.find(([, b]) => total >= b) ?? unidades[3]!
  const num = (v: number) => {
    const x = v / base
    return x.toLocaleString('pt-BR', { maximumFractionDigits: x >= 10 || base === 1 ? 0 : 1 })
  }
  return `${num(feito)} de ${num(total)} ${nome}`
}

function textoDaEtapa(a: Andamento[Etapa]): { texto: string; pct: number; pronta: boolean } {
  if (!a) return { texto: 'aguardando', pct: 0, pronta: false }
  if (a.total === 0 || a.feito >= a.total) return { texto: 'pronto', pct: 100, pronta: true }
  return { texto: formatarProgresso(a.feito, a.total), pct: Math.round((a.feito / a.total) * 100), pronta: false }
}

function classificar(e: unknown): Erro {
  if (e instanceof ErroDeSchema) return 'schema'
  if (e instanceof ErroDeIntegridade) return 'integridade'
  if (e instanceof ErroDeSincronizacaoEmAndamento) return 'em-andamento'
  return eErroDeRede(e) ? 'sem-conexao' : 'geral'
}

/** Mostra `app-export` (entre crases na mensagem) como código. */
function comCodigo(mensagem: string): ReactNode {
  return mensagem.split('`').map((trecho, i) => (i % 2 === 1 ? <code key={i}>{trecho}</code> : trecho))
}

export interface PreparandoProps {
  /** Onde o pacote é guardado (padrão: o OPFS). */
  armazem?: Armazem
  cache?: CacheImagens
  /** De onde vem o pacote (padrão: o Dropbox). null = sem login; lança sem internet. */
  obterFonte?: () => Promise<Fonte | null>
}

/**
 * Primeira sincronização (Sincronizando.dc.html no celular, PC-Preparando.dc.html no
 * computador). Um só componente: o tamanho muda no CSS, em 768 px.
 *
 * Baixa o pacote em duas etapas ("Banco de dados"; "Imagens de tela", que aqui são as
 * miniaturas). "Abrir assim que terminar" leva ao Início quando tudo estiver conferido;
 * sem ele, a tela fica e oferece "Abrir o app". Sem login vai para /entrar; sem internet
 * avisa e, se já há pacote no aparelho, deixa abri-lo.
 */
export function Preparando({ armazem, cache, obterFonte = fonteDropbox }: PreparandoProps) {
  const navegar = useNavigate()
  const [fase, setFase] = useState<Fase>('baixando')
  const [erro, setErro] = useState<Erro | null>(null)
  const [andamento, setAndamento] = useState<Andamento>({})
  const [temPacote, setTemPacote] = useState(false)
  const [primeiraVez, setPrimeiraVez] = useState(true)
  const [abrirAoTerminar, setAbrirAoTerminar] = useState(false)
  const [altaResolucao, setAltaResolucao] = useState(false)
  const montada = useRef(false)
  const iniciou = useRef(false)

  // Fundo escuro (#111111) no documento inteiro, como no design.
  useEffect(() => {
    const raiz = document.documentElement
    raiz.classList.add('tema-preparando')
    return () => raiz.classList.remove('tema-preparando')
  }, [])

  const guardado = useCallback(() => armazem ?? armazemPadrao(), [armazem])

  const sincronizar = useCallback(async () => {
    const ativa = () => montada.current
    setErro(null)
    setFase('baixando')

    const falhou = async (e: unknown) => {
      if (e instanceof ErroDeLogin) {
        if (ativa()) navegar('/entrar', { replace: true })
        return
      }
      const tem = await lerEstado(guardado()).then((m) => m !== null, () => false)
      if (!ativa()) return
      setTemPacote(tem)
      setErro(classificar(e))
      setFase('erro')
    }

    let fonte: Fonte | null
    try {
      fonte = await obterFonte()
    } catch (e) {
      await falhou(e)
      return
    }
    if (!fonte) {
      if (ativa()) navegar('/entrar', { replace: true })
      return
    }
    let resultado: 'atualizado' | 'igual'
    try {
      resultado = await sincronizarPacote(
        fonte,
        (etapa, feito, total) => {
          if (ativa()) setAndamento((a) => ({ ...a, [etapa]: { feito, total } }))
        },
        { armazem: guardado(), cache },
      )
    } catch (e) {
      await falhou(e)
      return
    }
    if (resultado === 'atualizado') {
      // O pacote mudou (ou chegou pela primeira vez): o banco fecha o antigo e abre o novo antes
      // de "pronto", para nenhuma tela ver o pacote velho (ou "sem pacote") até recarregar.
      // Falhar aqui não desfaz a sincronização: a próxima consulta abre o banco de novo.
      try {
        await reabrirBanco()
      } catch {
        /* segue */
      }
    }
    if (!ativa()) return
    setTemPacote(true)
    setFase('pronto')
  }, [cache, guardado, navegar, obterFonte])

  useEffect(() => {
    montada.current = true
    if (!iniciou.current) {
      // O StrictMode roda o efeito duas vezes: a sincronização começa uma só.
      iniciou.current = true
      void (async () => {
        const arm = (() => {
          try {
            return guardado()
          } catch {
            return null
          }
        })()
        if (arm) {
          const [estado, preferencias] = await Promise.all([lerEstado(arm).catch(() => null), lerPreferencias(arm).catch(() => null)])
          if (montada.current) {
            setTemPacote(estado !== null)
            setPrimeiraVez(estado === null)
            if (preferencias) setAltaResolucao(preferencias.altaResolucaoOffline)
          }
        }
        await sincronizar()
      })()
    }
    return () => {
      montada.current = false
    }
  }, [guardado, sincronizar])

  // Pediu para abrir ao terminar e terminou.
  useEffect(() => {
    if (fase === 'pronto' && abrirAoTerminar) navegar('/', { replace: true })
  }, [fase, abrirAoTerminar, navegar])

  function mudarAltaResolucao(valor: boolean) {
    setAltaResolucao(valor)
    void gravarPreferencias({ altaResolucaoOffline: valor }, guardado()).catch(() => undefined)
  }

  const mensagemDeErro =
    erro === 'schema' ? (
      comCodigo(MSG_SCHEMA)
    ) : erro === 'integridade' ? (
      MSG_INTEGRIDADE
    ) : erro === 'em-andamento' ? (
      MSG_EM_ANDAMENTO
    ) : erro === 'sem-conexao' ? (
      temPacote ? MSG_SEM_CONEXAO : primeiraVez && Object.keys(andamento).length === 0 ? MSG_SEM_CONEXAO_PRIMEIRA : MSG_SEM_CONEXAO_NO_MEIO
    ) : (
      MSG_GERAL
    )

  return (
    <div className="preparando">
      <header className="preparando-marca">
        <span className="preparando-sigla">SKC</span>
        <span className="preparando-nome">IconoDB</span>
      </header>

      <main className="preparando-principal">
        <h1 className="preparando-titulo">Preparando este aparelho</h1>
        <p className="preparando-intro">
          Conectado ao Dropbox. Só na primeira vez: depois, o app abre direto e funciona sem internet.
        </p>

        <ul className="preparando-etapas" role="list">
          {ETAPAS.map((etapa) => {
            const { texto, pct } = textoDaEtapa(andamento[etapa])
            return (
              <li key={etapa} className="preparando-etapa">
                <div className="preparando-etapa-linha">
                  <span>{etapa}</span>
                  <span className="preparando-estado">{texto}</span>
                </div>
                <div
                  className="preparando-barra"
                  role="progressbar"
                  aria-label={etapa}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                >
                  <div className="preparando-barra-cheia" style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>

        <label className="preparando-preferencia">
          <span>Imagens em alta resolução offline</span>
          <input type="checkbox" checked={altaResolucao} onChange={(e) => mudarAltaResolucao(e.target.checked)} />
        </label>

        {fase === 'baixando' && <p className="preparando-aviso">Mantenha o app aberto até terminar</p>}

        {fase === 'erro' && (
          <p role="alert" className="preparando-erro">
            {mensagemDeErro}
          </p>
        )}

        <div className="preparando-acoes">
          {fase === 'baixando' && (
            <button
              type="button"
              className="preparando-botao"
              aria-pressed={abrirAoTerminar}
              onClick={() => setAbrirAoTerminar((v) => !v)}
            >
              Abrir assim que terminar
            </button>
          )}
          {fase === 'erro' && (
            <button type="button" className="preparando-botao" onClick={() => void sincronizar()}>
              Tentar de novo
            </button>
          )}
          {(fase === 'pronto' || (fase === 'erro' && temPacote)) && (
            <button type="button" className="preparando-botao" onClick={() => navegar('/', { replace: true })}>
              Abrir o app
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
