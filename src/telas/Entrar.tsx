import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  estadoLogin,
  iniciarLogin,
  iniciarLoginComCodigo,
  MSG_ACESSO_NEGADO,
  MSG_CODIGO_INVALIDO,
  MSG_SEM_CONEXAO,
  repetirTrocaPendente,
  tentarLoginComCodigo,
} from '../dropbox/auth'
import { Icon } from '../ui/Icon'
import { Logo } from '../ui/Logo'
import './Entrar.css'

const MSG_NAO_ABRIU = 'Não foi possível abrir o Dropbox; tente de novo'
const MSG_NAO_ENTROU = 'Não foi possível entrar; tente de novo'
const MSG_NAO_CHEGOU = 'A volta do Dropbox não chegou a este app. Entre com o código do Dropbox.'
const MSG_EXPIROU = 'O acesso ao Dropbox expirou. Entre de novo; os dados do aparelho continuam aqui.'

/** O que a tela sabe sobre a volta do Dropbox. */
type Situacao = 'normal' | 'sem-conexao' | 'acesso-negado' | 'sem-chegada'

interface EstadoDaRota {
  voltou?: boolean
  motivo?: 'sem-conexao' | 'acesso-negado'
}

function situacaoInicial(estado: EstadoDaRota | null): Situacao {
  if (estado?.voltou !== true) return 'normal'
  return estado.motivo ?? 'sem-chegada'
}

/**
 * Entrada do app (Login.dc.html no celular, PC-Entrar.dc.html no computador).
 * Um só componente: o tamanho do texto muda no CSS, em 768 px.
 *
 * Não há ilustração no topo: o desenho do design é conteúdo do livro e, antes do
 * primeiro login, o app não tem pacote. O bloco fica centrado no fundo #111111.
 *
 * O link discreto "Entrar com código" abre o login alternativo. Ao voltar do
 * Dropbox sem ter conseguido concluir (location.state.voltou), a tela diz o que
 * houve: o retorno não chegou aqui (abre o login por código), faltou rede (repete a
 * troca guardada) ou o acesso foi negado.
 */
export function Entrar() {
  const navegar = useNavigate()
  const { state } = useLocation() as { state: EstadoDaRota | null }

  const [situacao, setSituacao] = useState<Situacao>(() => situacaoInicial(state))
  const [aberto, setAberto] = useState(situacao === 'sem-chegada')
  const [urlDoDropbox, setUrlDoDropbox] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erroPrincipal, setErroPrincipal] = useState<string | null>(null)
  const [erroCodigo, setErroCodigo] = useState<string | null>(null)
  const [expirado, setExpirado] = useState(false)
  const preparouRetorno = useRef(false)

  // Fundo escuro (#111111) no documento inteiro, como no design.
  useEffect(() => {
    const raiz = document.documentElement
    raiz.classList.add('tema-entrar')
    return () => raiz.classList.remove('tema-entrar')
  }, [])

  useEffect(() => {
    let vivo = true
    estadoLogin()
      .then((e) => vivo && setExpirado(e === 'expirado'))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [])

  async function prepararCodigo(abrirJanela: boolean) {
    setErroCodigo(null)
    try {
      const url = await iniciarLoginComCodigo()
      setUrlDoDropbox(url)
      if (abrirJanela) window.open(url, '_blank', 'noopener')
    } catch {
      setErroCodigo(MSG_NAO_ABRIU)
    }
  }

  // O retorno não chegou aqui: prepara o login por código (sem abrir janela: não há toque do usuário).
  useEffect(() => {
    if (situacao !== 'sem-chegada' || preparouRetorno.current) return
    preparouRetorno.current = true
    setAberto(true)
    void prepararCodigo(false)
  }, [situacao])

  async function entrarComDropbox() {
    setErroPrincipal(null)
    setOcupado(true)
    try {
      await iniciarLogin()
    } catch {
      setErroPrincipal(MSG_NAO_ABRIU)
      setOcupado(false)
    }
  }

  async function abrirLoginPorCodigo() {
    // Quem escolhe o código abandona a troca guardada do retorno.
    setSituacao('normal')
    setErroPrincipal(null)
    setAberto(true)
    await prepararCodigo(true)
  }

  async function repetirTroca() {
    setErroPrincipal(null)
    setOcupado(true)
    try {
      const r = await repetirTrocaPendente()
      if (r === 'ok') {
        navegar('/preparando', { replace: true })
        return
      }
      if (r === 'sem-conexao') setErroPrincipal(MSG_SEM_CONEXAO)
      else setSituacao('sem-chegada')
    } catch {
      setErroPrincipal(MSG_NAO_ENTROU)
    }
    setOcupado(false)
  }

  async function enviarCodigo(e: FormEvent) {
    e.preventDefault()
    if (!codigo.trim() || ocupado) return
    setErroCodigo(null)
    setOcupado(true)
    try {
      const r = await tentarLoginComCodigo(codigo)
      if (r === 'ok') {
        navegar('/preparando', { replace: true })
        return
      }
      setErroCodigo(r === 'sem-conexao' ? MSG_SEM_CONEXAO : MSG_CODIGO_INVALIDO)
    } catch {
      setErroCodigo(MSG_NAO_ENTROU)
    }
    setOcupado(false)
  }

  const aviso =
    situacao === 'sem-conexao'
      ? erroPrincipal
        ? null
        : MSG_SEM_CONEXAO
      : situacao === 'acesso-negado'
        ? MSG_ACESSO_NEGADO
        : situacao === 'sem-chegada'
          ? MSG_NAO_CHEGOU
          : expirado
            ? MSG_EXPIROU
            : null

  return (
    <div className="entrar">
      <main className="entrar-principal">
        <div className="entrar-identidade">
          <Logo scale={2} tone="dark" />
          <span className="entrar-sigla">SKC</span>
          <h1 className="entrar-titulo">IconoDB</h1>
          <p className="entrar-lema">
            Banco de dados iconográfico <br className="entrar-quebra" />
            pessoal e fechado
          </p>
        </div>

        <div className="entrar-acoes">
          {aviso && (
            <p role="status" className="entrar-aviso">
              {aviso}
            </p>
          )}
          {erroPrincipal && (
            <p role="alert" className="entrar-erro">
              {erroPrincipal}
            </p>
          )}

          {situacao === 'sem-conexao' && (
            <button type="button" className="entrar-botao entrar-botao-secundario" onClick={repetirTroca} disabled={ocupado}>
              Tentar de novo
            </button>
          )}

          <button type="button" className="entrar-botao" onClick={entrarComDropbox} disabled={ocupado}>
            Entrar com o Dropbox
            <Icon name="proximo" size={18} />
          </button>

          {!aberto && (
            <button type="button" className="entrar-link" onClick={abrirLoginPorCodigo}>
              Entrar com código
            </button>
          )}

          {aberto && (
            <form className="entrar-codigo" onSubmit={enviarCodigo}>
              <p className="entrar-passos">
                Abra a página do Dropbox, autorize o acesso e copie o código que aparecer. Depois cole-o aqui.
              </p>
              {urlDoDropbox && (
                <a className="entrar-link" href={urlDoDropbox} target="_blank" rel="noopener noreferrer">
                  Abrir a página do Dropbox
                </a>
              )}
              <label className="entrar-rotulo" htmlFor="codigo-dropbox">
                Código do Dropbox
              </label>
              <input
                id="codigo-dropbox"
                className="entrar-campo"
                type="text"
                value={codigo}
                onChange={(ev) => setCodigo(ev.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {erroCodigo && (
                <p role="alert" className="entrar-erro">
                  {erroCodigo}
                </p>
              )}
              {erroCodigo && !urlDoDropbox && (
                <button type="button" className="entrar-botao entrar-botao-secundario" onClick={() => void prepararCodigo(false)}>
                  Tentar de novo
                </button>
              )}
              <button type="submit" className="entrar-botao entrar-botao-secundario" disabled={ocupado || !codigo.trim()}>
                Entrar
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
