import { useEffect, useId, useRef, useState, type KeyboardEvent as TeclaDoReact, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { useAtalhos } from '../app/useAtalhos'
import { rotaDoAcertoDoUsuario } from '../busca/rotasDoUsuario'
import { IconButton } from '../ui/IconButton'
import { Icon } from '../ui/Icon'
import type { ColecaoVista } from './modelo'
import { acrescentarMembros, criarColecao, devolverMembro, excluirColecao, tirarMembro, validarNome } from './operacoes'
import { useColecoes } from './useColecoes'
import './FolhaDeColecao.css'

interface Props {
  /** A ref do objeto (número ou id de objeto SKC). */
  objeto: string
  /** 'folha': a folha de baixo do celular (modal). 'painel': junto à barra, no computador (não modal). */
  variante: 'folha' | 'painel'
  aoFechar: () => void
  /** Onde o foco volta ao fechar. */
  devolverFoco?: () => HTMLElement | null
}

interface Aviso {
  texto: string
  desfazer: () => Promise<void>
}

const FOCAVEIS = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
const MSG_FALHA = 'Não foi possível guardar a mudança; tente de novo.'

/**
 * "Adicionar à coleção" no item (ItemColecao.dc.html no celular, PC-ItemColecao.dc.html no computador): as coleções
 * SKC com uma caixa cada (marcada se o objeto já está nela), o nome de cada uma como link, e "Nova coleção" para
 * criar uma já com o objeto. Marcar e desmarcar gravam na hora (IndexedDB primeiro) e dizem o que fizeram, com Desfazer.
 * No celular é uma folha modal (foco preso, Esc, fundo que fecha, o resto inerte); no computador, um painel não
 * modal. Em ambos o foco entra na folha e volta ao gatilho ao fechar.
 */
export function FolhaDeColecao({ objeto, variante, aoFechar, devolverFoco }: Props) {
  const { vivas } = useColecoes()
  const raiz = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [erroDoNome, setErroDoNome] = useState<string | null>(null)
  const idErro = useId()
  const idCampo = useId()
  const folha = variante === 'folha'
  const atual = useRef({ aoFechar, devolverFoco })
  atual.current = { aoFechar, devolverFoco }

  // O foco entra na folha; na modal, o resto da tela fica inerte. Ao fechar, o foco volta.
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    const portal = folha ? raiz.current?.closest('.folha-colecao-camada') : null
    const inertes = portal ? [...document.body.children].filter((el) => el !== portal && !el.hasAttribute('inert')) : []
    for (const el of inertes) el.setAttribute('inert', '')
    raiz.current?.focus()
    return () => {
      for (const el of inertes) el.removeAttribute('inert')
      const destino = atual.current.devolverFoco?.() ?? anterior
      if (destino?.isConnected) destino.focus()
    }
  }, [folha])

  // Esc fecha (também de dentro do campo "Nova coleção", que é dono do Esc dentro da folha).
  useAtalhos({ Escape: () => atual.current.aoFechar() }, 'item', { raiz: () => raiz.current })

  // Painel (computador, não modal): um clique fora dele o fecha. O clique no gatilho é do próprio gatilho (ele alterna).
  useEffect(() => {
    if (folha) return
    const aoPressionar = (e: PointerEvent) => {
      const alvo = e.target as Node | null
      if (!alvo || raiz.current?.contains(alvo)) return
      const gatilho = atual.current.devolverFoco?.()
      if (gatilho?.contains(alvo)) return
      atual.current.aoFechar()
    }
    document.addEventListener('pointerdown', aoPressionar)
    return () => document.removeEventListener('pointerdown', aoPressionar)
  }, [folha])

  const prender = (e: TeclaDoReact) => {
    if (!folha || e.key !== 'Tab' || !raiz.current) return
    const itens = [...raiz.current.querySelectorAll<HTMLElement>(FOCAVEIS)]
    if (itens.length === 0) return
    const primeiro = itens[0]!
    const ultimo = itens[itens.length - 1]!
    const dentro = raiz.current.contains(document.activeElement) && document.activeElement !== raiz.current
    if (e.shiftKey && (document.activeElement === primeiro || !dentro)) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && (document.activeElement === ultimo || !dentro)) {
      e.preventDefault()
      primeiro.focus()
    }
  }

  const tentar = async (acao: () => Promise<void>, depois?: () => void) => {
    setFalha(null)
    try {
      await acao()
      depois?.()
    } catch {
      setFalha(MSG_FALHA)
    }
  }

  const alternar = (c: ColecaoVista, marcar: boolean) =>
    tentar(async () => {
      if (marcar) {
        await acrescentarMembros(c.id, [objeto])
        setAviso({ texto: `Adicionado a «${c.nome}»`, desfazer: async () => void (await tirarMembro(c.id, objeto)) })
      } else {
        const ordem = await tirarMembro(c.id, objeto)
        setAviso({ texto: `Tirado de «${c.nome}»`, desfazer: async () => (ordem === null ? undefined : devolverMembro(c.id, objeto, ordem)) })
      }
    })

  const criar = (e: FormEvent) => {
    e.preventDefault()
    const erro = validarNome(nome)
    if (erro) {
      setErroDoNome(erro)
      campo.current?.focus()
      return
    }
    const limpo = nome.trim()
    void tentar(
      async () => {
        const id = await criarColecao(limpo, { membros: [objeto] })
        setAviso({ texto: `Coleção «${limpo}» criada com este objeto`, desfazer: () => excluirColecao(id) })
      },
      () => {
        setNome('')
        setErroDoNome(null)
      },
    )
  }

  const desfazer = async () => {
    const a = aviso
    if (!a) return
    await tentar(a.desfazer, () => setAviso(null))
  }

  const corpo = (
    <div
      ref={raiz}
      className={`folha-colecao folha-colecao-${variante}`}
      role="dialog"
      aria-modal={folha ? true : undefined}
      aria-label="Adicionar à coleção"
      tabIndex={-1}
      onKeyDown={prender}
    >
      {folha && <div className="folha-colecao-alca" aria-hidden="true" />}
      <div className="folha-colecao-topo">
        <span className="folha-colecao-etiqueta">Adicionar a · SKC</span>
        <IconButton icon="fechar" label="Fechar" shortcut="Escape" shortcutLabel="Esc" onClick={aoFechar} />
      </div>

      {vivas.length === 0 ? (
        <p className="folha-colecao-vazio">Nenhuma coleção ainda. Crie a primeira abaixo.</p>
      ) : (
        <ul className="folha-colecao-lista">
          {vivas.map((c) => {
            const marcada = c.membros.some((m) => m.ref === objeto)
            const nomeDaColecao = c.nome || 'Coleção sem nome'
            const marca = (
              <label className="folha-colecao-marca">
                <input type="checkbox" checked={marcada} aria-label={`Incluir em ${nomeDaColecao}`} onChange={(e) => void alternar(c, e.target.checked)} />
              </label>
            )
            const nomeComLink = (
              <Link className="folha-colecao-nome" to={rotaDoAcertoDoUsuario('colecao', c.id)!} data-tip="Abrir a coleção">
                {nomeDaColecao}
              </Link>
            )
            return (
              <li key={c.id} className="folha-colecao-linha">
                {folha ? (
                  <>
                    {nomeComLink}
                    {marca}
                  </>
                ) : (
                  <>
                    {marca}
                    {nomeComLink}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="folha-colecao-aviso" aria-live="polite" role="status">
        {aviso && (
          <>
            {aviso.texto} ·{' '}
            <button type="button" className="folha-colecao-desfazer" onClick={() => void desfazer()}>
              Desfazer
            </button>
          </>
        )}
      </div>
      {falha && (
        <p className="folha-colecao-erro" role="alert">
          {falha}
        </p>
      )}

      <form className="folha-colecao-nova" onSubmit={criar} noValidate>
        <label htmlFor={idCampo}>Nova coleção</label>
        <div className="folha-colecao-nova-campo">
          <input
            ref={campo}
            id={idCampo}
            type="text"
            value={nome}
            placeholder="ex.: Íbices em selos"
            autoComplete="off"
            aria-invalid={erroDoNome ? true : undefined}
            aria-describedby={erroDoNome ? idErro : undefined}
            onChange={(e) => {
              setNome(e.target.value)
              setErroDoNome(null)
            }}
          />
          <button type="submit" className="folha-colecao-criar" data-tip="Criar a coleção e adicionar o item">
            <Icon name="adicionar" size={18} />
            Criar
          </button>
        </div>
        {erroDoNome && (
          <p id={idErro} className="folha-colecao-erro" role="alert">
            {erroDoNome}
          </p>
        )}
      </form>
      {!folha && <p className="folha-colecao-dica">Clique fora ou Esc para fechar.</p>}
    </div>
  )

  if (!folha) return corpo
  return createPortal(
    <div className="folha-colecao-camada">
      <div className="folha-colecao-fundo" onClick={aoFechar} aria-hidden="true" />
      {corpo}
    </div>,
    document.body,
  )
}
