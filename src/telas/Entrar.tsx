import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  concluirLoginComCodigo,
  estadoLogin,
  iniciarLogin,
  iniciarLoginComCodigo,
  MSG_CODIGO_INVALIDO,
} from '../dropbox/auth'
import { Icon } from '../ui/Icon'
import { Logo } from '../ui/Logo'
import './Entrar.css'

const MSG_NAO_ABRIU = 'Não foi possível abrir o Dropbox; tente de novo'

/**
 * Entrada do app (Login.dc.html no celular, PC-Entrar.dc.html no computador).
 * Um só componente: o layout muda no CSS, em 768 px.
 *
 * O link discreto "Entrar com código" abre o login alternativo. Quando o app é
 * aberto de volta do Dropbox sem ter conseguido concluir o login (location.state.voltou),
 * esse caminho já aparece aberto.
 */
export function Entrar() {
  const navegar = useNavigate()
  const { state } = useLocation() as { state: { voltou?: boolean } | null }
  const voltou = state?.voltou === true

  const [aberto, setAberto] = useState(voltou)
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

  // Voltou do Dropbox sem concluir: prepara o login por código (sem abrir janela: não há toque do usuário).
  useEffect(() => {
    if (!voltou || preparouRetorno.current) return
    preparouRetorno.current = true
    iniciarLoginComCodigo()
      .then(setUrlDoDropbox)
      .catch(() => setErroCodigo(MSG_NAO_ABRIU))
  }, [voltou])

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
    setAberto(true)
    setErroCodigo(null)
    try {
      const url = await iniciarLoginComCodigo()
      setUrlDoDropbox(url)
      window.open(url, '_blank', 'noopener')
    } catch {
      setErroCodigo(MSG_NAO_ABRIU)
    }
  }

  async function enviarCodigo(e: FormEvent) {
    e.preventDefault()
    if (!codigo.trim() || ocupado) return
    setErroCodigo(null)
    setOcupado(true)
    try {
      if (await concluirLoginComCodigo(codigo)) {
        navegar('/preparando', { replace: true })
        return
      }
      setErroCodigo(MSG_CODIGO_INVALIDO)
    } catch {
      setErroCodigo(MSG_CODIGO_INVALIDO)
    }
    setOcupado(false)
  }

  const aviso = voltou
    ? 'A volta do Dropbox não chegou a este app. Entre com o código do Dropbox.'
    : expirado
      ? 'O acesso ao Dropbox expirou. Entre de novo; os dados do aparelho continuam aqui.'
      : null

  return (
    <div className="entrar">
      {/* Faixa do topo: no design leva o desenho de um selo, que é conteúdo do livro e fica fora deste repositório público. */}
      <div className="entrar-faixa" aria-hidden="true" />
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

          <button type="button" className="entrar-botao" onClick={entrarComDropbox} disabled={ocupado}>
            Entrar com o Dropbox
            <Icon name="proximo" size={18} />
          </button>
          {erroPrincipal && (
            <p role="alert" className="entrar-erro">
              {erroPrincipal}
            </p>
          )}

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
