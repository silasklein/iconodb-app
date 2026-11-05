import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { CartaoDeObjeto } from '../ui/CartaoDeObjeto'
import { Icon } from '../ui/Icon'
import { useBreakpoint } from '../ui/useBreakpoint'
import { numeroPtBr } from '../ui/numero'
import { caminhoDaColecao } from './origem'
import { criarColecao, restaurarColecao, validarNome } from './operacoes'
import { useObjetosSkc } from './objetosSkc'
import { useColecoes } from './useColecoes'
import type { ColecaoVista } from './modelo'
import './PainelSkc.css'

export const CAMINHO_DO_NOVO_OBJETO = '/objeto/novo'
const MSG_FALHA = 'Não foi possível guardar a mudança; tente de novo.'

/**
 * A aba SKC das Coleções (ColecoesObjetos.dc.html): "Meus objetos" (os objetos SKC do usuário e o cartão "+ Novo
 * objeto", que leva à criação de objetos: Tarefa 9) e "Minhas coleções" (as coleções SKC, criar uma, restaurar
 * as excluídas).
 */
export function PainelSkc() {
  return (
    <div className="painel-skc">
      <MeusObjetos />
      <MinhasColecoes />
    </div>
  )
}

function MeusObjetos() {
  const objetos = useObjetosSkc()
  const computador = useBreakpoint() === 'computador'
  return (
    <section className="colecoes-corpo painel-skc-secao" aria-label="Meus objetos">
      <div className="colecoes-secao-titulo">
        <h2>Meus objetos</h2>
        <span className="codigo">{numeroPtBr(objetos.length)} · SKC</span>
      </div>
      {objetos.length === 0 && <p className="colecoes-vazio">Nenhum objeto SKC ainda. Os que você criar, de um artigo, relatório ou achado, aparecem aqui.</p>}
      <div className="painel-skc-grade">
        <Link className="painel-skc-novo" to={CAMINHO_DO_NOVO_OBJETO}>
          <span className="painel-skc-novo-mais" aria-hidden="true">
            <Icon name="adicionar" size={20} />
          </span>
          <span className="painel-skc-novo-texto">
            <span className="painel-skc-novo-titulo">Novo objeto</span>
            <span className="painel-skc-novo-apoio">de artigo, relatório ou achado</span>
          </span>
        </Link>
        {objetos.map((o) => (
          <CartaoDeObjeto key={o.itemId} objeto={o} grande={computador} />
        ))}
      </div>
    </section>
  )
}

function MinhasColecoes() {
  const { vivas, excluidas } = useColecoes()
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const campo = useRef<HTMLInputElement>(null)
  const idCampo = useId()
  const idErro = useId()
  const estavaCriando = useRef(false)

  useEffect(() => {
    if (criando) campo.current?.focus()
    else if (estavaCriando.current) botao.current?.focus()
    estavaCriando.current = criando
  }, [criando])

  const abrirFormulario = () => {
    setNome('')
    setErro(null)
    setAviso(null)
    setCriando(true)
  }
  const fecharFormulario = () => {
    setCriando(false)
    setErro(null)
  }
  const criar = async (e: FormEvent) => {
    e.preventDefault()
    const problema = validarNome(nome)
    if (problema) {
      setErro(problema)
      campo.current?.focus()
      return
    }
    try {
      await criarColecao(nome)
      setAviso(`Coleção «${nome.trim()}» criada.`)
      fecharFormulario()
    } catch {
      setErro(MSG_FALHA)
    }
  }
  const teclar = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      fecharFormulario()
    }
  }
  const restaurar = async (c: ColecaoVista) => {
    try {
      await restaurarColecao(c.id)
      setAviso(`Coleção «${c.nome || 'sem nome'}» restaurada.`)
    } catch {
      setAviso(MSG_FALHA)
    }
  }

  return (
    <section className="colecoes-corpo painel-skc-secao" aria-label="Minhas coleções">
      <div className="colecoes-secao-titulo">
        <h2>Minhas coleções</h2>
        <span className="codigo">SKC</span>
      </div>

      {vivas.length === 0 ? (
        <p className="colecoes-vazio">Nenhuma coleção ainda. Crie a primeira com «Criar coleção», ou pelo ícone de coleção na tela de um objeto.</p>
      ) : (
        <div className="painel-skc-colecoes">
          {vivas.map((c) => (
            <Link key={c.id} className="colecoes-grupo" to={caminhoDaColecao(c.id)}>
              <span className="colecoes-grupo-texto">
                <span className="colecoes-grupo-nome">{c.nome || 'Coleção sem nome'}</span>
                <span className="colecoes-grupo-n codigo">
                  {numeroPtBr(c.membros.length)}
                  <span className="so-leitor"> {c.membros.length === 1 ? 'objeto' : 'objetos'}</span>
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="painel-skc-aviso" role="status" aria-live="polite">
        {aviso}
      </div>

      {criando ? (
        <form className="painel-skc-criar" onSubmit={(e) => void criar(e)} noValidate>
          <label htmlFor={idCampo}>Nome da nova coleção</label>
          <input
            ref={campo}
            id={idCampo}
            type="text"
            value={nome}
            placeholder="ex.: Íbices em selos"
            autoComplete="off"
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? idErro : undefined}
            onChange={(e) => {
              setNome(e.target.value)
              setErro(null)
            }}
            onKeyDown={teclar}
          />
          {erro && (
            <p id={idErro} className="colecao-erro" role="alert">
              {erro}
            </p>
          )}
          <div className="painel-skc-botoes">
            <button type="submit" className="colecao-acao colecao-acao-forte">
              Criar
            </button>
            <button type="button" className="colecao-acao" onClick={fecharFormulario}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button ref={botao} type="button" className="colecao-acao colecao-acao-forte painel-skc-criar-botao" onClick={abrirFormulario}>
          <Icon name="adicionar" size={18} />
          Criar coleção
        </button>
      )}

      {excluidas.length > 0 && (
        <div className="painel-skc-excluidas" role="group" aria-label="Coleções excluídas">
          <h3>Excluídas</h3>
          <ul>
            {excluidas.map((c) => (
              <li key={c.id}>
                <span className="painel-skc-excluida-nome">{c.nome || 'Coleção sem nome'}</span>
                <button type="button" className="colecao-acao" aria-label={`Restaurar ${c.nome || 'coleção sem nome'}`} onClick={() => void restaurar(c)}>
                  <Icon name="desfazer" size={18} />
                  Restaurar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
