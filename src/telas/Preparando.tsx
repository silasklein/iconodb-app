import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { reabrirBanco } from '../banco/cliente'
import { sair } from '../dropbox/auth'
import { eErroDeRede, ErroDePacoteAusente, ErroDePermissao, fonteDropbox, resumoDoErro } from '../dropbox/fonte'
import { MSG_SEM_PERMISSAO } from '../dropbox/mensagens'
import { Logo } from '../ui/Logo'
import { armazemPadrao, type Armazem } from '../pacote/armazem'
import { sincronizarPacote, type Etapa } from '../pacote/baixar'
import type { CacheImagens } from '../pacote/imagens'
import { gravarPreferencias, lerEstado, lerPreferencias } from '../pacote/local'
import {
  ErroDeIntegridade,
  ErroDeLogin,
  ErroDeManifesto,
  ErroDePacote,
  ErroDeSchema,
  ErroDeSincronizacaoEmAndamento,
  MSG_SCHEMA,
  type Fonte,
} from '../pacote/manifesto'
import { camadaDoUsuarioVazia } from '../usuario/sincronizar'
import { sincronizarAgora } from '../usuario/useSincronizacao'
import './Preparando.css'

const ETAPAS: Etapa[] = ['Banco de dados', 'Imagens de tela']

export const MSG_SEM_CONEXAO = 'Sem conexão: o app abre com o que já está no aparelho'
const MSG_SEM_CONEXAO_PRIMEIRA = 'Sem conexão: o primeiro download precisa de internet'
const MSG_SEM_CONEXAO_NO_MEIO = 'Sem conexão. O que já foi baixado fica guardado e o download continua de onde parou.'
const MSG_PACOTE =
  'O pacote no Dropbox está com defeito e foi recusado; o que já estava no aparelho foi mantido. Gere-o de novo com `app-export`.'
const MSG_INTEGRIDADE = 'Um arquivo não passou na conferência e foi descartado; o que já estava no aparelho foi mantido.'
export const MSG_EM_ANDAMENTO = 'Já há uma sincronização em andamento em outra janela do app. Espere terminar e tente de novo.'
const MSG_GERAL = 'Não foi possível baixar o pacote; tente de novo'
export const MSG_SEM_PACOTE_NO_DROPBOX =
  'O pacote não está na pasta do app no Dropbox. Ponha as pastas nucleo e imagens na pasta deste app, dentro de Dropbox → Aplicativos (o nome pode ter um número, como "(1)"), espere o Dropbox terminar de enviar e tente de novo.'
export { MSG_SEM_PERMISSAO }

type Fase = 'baixando' | 'pronto' | 'erro'
type Erro = 'sem-conexao' | 'schema' | 'pacote' | 'integridade' | 'em-andamento' | 'sem-pacote-no-dropbox' | 'sem-permissao' | 'geral'
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
  if (e instanceof ErroDePacote || e instanceof ErroDeManifesto) return 'pacote'
  if (e instanceof ErroDeIntegridade) return 'integridade'
  if (e instanceof ErroDeSincronizacaoEmAndamento) return 'em-andamento'
  if (e instanceof ErroDePacoteAusente) return 'sem-pacote-no-dropbox'
  if (e instanceof ErroDePermissao) return 'sem-permissao'
  return eErroDeRede(e) ? 'sem-conexao' : 'geral'
}

/** Mostra `app-export` (entre crases na mensagem) como código. */
function comCodigo(mensagem: string): ReactNode {
  return mensagem.split('`').map((trecho, i) => (i % 2 === 1 ? <code key={i}>{trecho}</code> : trecho))
}

/** A camada do usuário (notas, coleções, objetos SKC): é a primeira vez neste aparelho? E puxá-la. */
export interface CamadaDoUsuario {
  primeiraVez: () => Promise<boolean>
  /** Sincroniza; true se deu certo. Nunca deve impedir de abrir o app. */
  puxar: () => Promise<boolean>
}

const CAMADA_PADRAO: CamadaDoUsuario = {
  primeiraVez: () => camadaDoUsuarioVazia(),
  puxar: async () => (await sincronizarAgora('preparando')) !== null,
}

export const ETAPA_DO_USUARIO = 'Suas notas e coleções (SKC)'
type EtapaDoUsuario = 'aguardando' | 'baixando' | 'pronto' | 'depois'

export interface PreparandoProps {
  /** Onde o pacote é guardado (padrão: o OPFS). */
  armazem?: Armazem
  cache?: CacheImagens
  /** De onde vem o pacote (padrão: o Dropbox). null = sem login; lança sem internet. */
  obterFonte?: () => Promise<Fonte | null>
  /** A camada do usuário (padrão: o IndexedDB e a sincronização do app). */
  camadaDoUsuario?: CamadaDoUsuario
}

/**
 * Primeira sincronização (Sincronizando.dc.html no celular, PC-Preparando.dc.html no
 * computador). Um só componente: o tamanho muda no CSS, em 768 px.
 *
 * Baixa o pacote em duas etapas ("Banco de dados"; "Imagens de tela", que aqui são as
 * miniaturas) e, na primeira vez da camada do usuário, depois do pacote, "Suas notas e coleções (SKC)"
 * (ela não segura a abertura: com o pacote pronto, "Abrir o app" já vale e ela segue em segundo plano; uma
 * falha nela não impede nada, a sincronização automática tenta de novo).
 * "Abrir assim que terminar" leva ao Início quando tudo estiver conferido; sem ele, a tela fica e
 * oferece "Abrir o app". Sem login vai para /entrar; sem internet
 * avisa e, se já há pacote no aparelho, deixa abri-lo.
 */
export function Preparando({ armazem, cache, obterFonte = fonteDropbox, camadaDoUsuario = CAMADA_PADRAO }: PreparandoProps) {
  const navegar = useNavigate()
  const [fase, setFase] = useState<Fase>('baixando')
  const [erro, setErro] = useState<Erro | null>(null)
  const [detalhe, setDetalhe] = useState<string | null>(null)
  const [andamento, setAndamento] = useState<Andamento>({})
  const [temPacote, setTemPacote] = useState(false)
  const [primeiraVez, setPrimeiraVez] = useState(true)
  const [abrirAoTerminar, setAbrirAoTerminar] = useState(false)
  const [altaResolucao, setAltaResolucao] = useState(false)
  const montada = useRef(false)
  const iniciou = useRef(false)
  // Na primeira vez (sem nada do usuário neste aparelho), a camada do usuário é baixada depois do pacote.
  const [usuario, setUsuario] = useState<EtapaDoUsuario | null>(null)
  const primeiraVezDoUsuario = useRef<Promise<boolean> | null>(null)
  primeiraVezDoUsuario.current ??= camadaDoUsuario.primeiraVez().catch(() => false)
  useEffect(() => {
    let vivo = true
    void primeiraVezDoUsuario.current!.then((sim) => vivo && sim && setUsuario((u) => u ?? 'aguardando'))
    return () => {
      vivo = false
    }
  }, [])

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
      setDetalhe(resumoDoErro(e) ?? (e instanceof Error && e.name !== 'Error' ? e.name : null))
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
    // O pacote está pronto: o app já pode ser aberto. A camada do usuário (na primeira vez) continua em
    // segundo plano, sem segurar a abertura (o indicador de sincronização mostra o andamento); uma falha
    // aqui não impede nada (a sincronização automática tenta depois).
    setFase('pronto')
    if (await primeiraVezDoUsuario.current!) {
      if (ativa()) setUsuario('baixando')
      void camadaDoUsuario
        .puxar()
        .catch(() => false)
        .then((ok) => {
          if (ok) primeiraVezDoUsuario.current = Promise.resolve(false)
          if (montada.current) setUsuario(ok ? 'pronto' : 'depois')
        })
    }
  }, [cache, camadaDoUsuario, guardado, navegar, obterFonte])

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
    ) : erro === 'pacote' ? (
      comCodigo(MSG_PACOTE)
    ) : erro === 'integridade' ? (
      MSG_INTEGRIDADE
    ) : erro === 'em-andamento' ? (
      MSG_EM_ANDAMENTO
    ) : erro === 'sem-pacote-no-dropbox' ? (
      MSG_SEM_PACOTE_NO_DROPBOX
    ) : erro === 'sem-permissao' ? (
      MSG_SEM_PERMISSAO
    ) : erro === 'sem-conexao' ? (
      temPacote ? MSG_SEM_CONEXAO : primeiraVez && Object.keys(andamento).length === 0 ? MSG_SEM_CONEXAO_PRIMEIRA : MSG_SEM_CONEXAO_NO_MEIO
    ) : (
      MSG_GERAL
    )

  return (
    <div className="preparando">
      <header className="preparando-marca">
        <Logo scale={2} tone="dark" />
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
          {usuario && (
            <li className="preparando-etapa">
              <div className="preparando-etapa-linha">
                <span>{ETAPA_DO_USUARIO}</span>
                <span className="preparando-estado">{usuario === 'depois' ? 'sincroniza depois' : usuario}</span>
              </div>
              <div
                className="preparando-barra"
                role="progressbar"
                aria-label={ETAPA_DO_USUARIO}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={usuario === 'pronto' ? 100 : 0}
              >
                <div className="preparando-barra-cheia" style={{ width: usuario === 'pronto' ? '100%' : '0%' }} />
              </div>
            </li>
          )}
        </ul>

        <label className="preparando-preferencia">
          <span>Imagens em alta resolução offline</span>
          <input type="checkbox" checked={altaResolucao} onChange={(e) => mudarAltaResolucao(e.target.checked)} />
        </label>

        {fase === 'baixando' && <p className="preparando-aviso">Mantenha o app aberto até terminar</p>}
        {fase === 'pronto' && usuario === 'baixando' && (
          <p className="preparando-aviso">Suas notas e coleções continuam sendo baixadas em segundo plano; o indicador de sincronização mostra o andamento.</p>
        )}

        {fase === 'erro' && (
          <div role="alert" className="preparando-erro">
            <p>{mensagemDeErro}</p>
            {erro === 'geral' && detalhe && <p className="preparando-detalhe">Detalhe: {detalhe}</p>}
          </div>
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
          {fase === 'erro' && erro === 'sem-permissao' && (
            <button
              type="button"
              className="preparando-botao"
              onClick={() => void sair().finally(() => navegar('/entrar', { replace: true }))}
            >
              Entrar de novo
            </button>
          )}
          {fase === 'erro' && erro !== 'sem-permissao' && (
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
