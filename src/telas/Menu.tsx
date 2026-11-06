import { useEffect, useRef, useState, type KeyboardEvent as TeclaDoReact, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { useAtalhos } from '../app/useAtalhos'
import { useBandeja } from '../comparar/useBandeja'
import { sitios } from '../banco/consultas'
import { useSitiosSkc } from '../sitios/doUsuario'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { IconeDeSincronizacao } from '../ui/IconeDeSincronizacao'
import { numeroPtBr } from '../ui/numero'
import { usePendencias } from '../ui/usePendencias'
import { textoCurtoDaUltima, textosDoEstado } from '../usuario/textosDaSync'
import { atalhoDeSalvar, useSincronizacao } from '../usuario/useSincronizacao'
import { BotaoSalvar } from './Sincronizacao'
import './Menu.css'

export const MSG_PROXIMA_VERSAO = 'na próxima versão'

interface Props {
  /** "folha": a folha de baixo do celular (Menu.dc.html). "popover": o mesmo conteúdo, preso à barra superior. */
  variante: 'folha' | 'popover'
  aoFechar: () => void
  /** Quem abriu o menu; recebe o foco de volta ao fechar. */
  gatilho?: HTMLElement | null
}

const FOCAVEIS = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * O menu do app (Menu.dc.html no celular, o popover do ícone Menu no computador).
 * Um diálogo modal: o foco começa nele e não sai (Tab dá a volta), Esc fecha, tocar no fundo fecha,
 * o resto da tela fica inerte e o foco volta ao gatilho ao fechar.
 *
 * Revisão (com a contagem), Comparar (com o contador "n/4"), Minhas notas, Sítios, Cópias e exportação, Excluídos e "Atalhos e convenções" funcionam; Ajustes
 * aparece desabilitado, "na próxima versão". Embaixo, a seção Sincronização (2B).
 */
/** A seção Sincronização do Menu (Menu.dc.html): o link para a tela, o estado e "Salvar e sincronizar". */
function SecaoDeSincronizacao({ aoFechar }: { aoFechar: () => void }) {
  const info = useSincronizacao()
  const t = textosDoEstado(info, atalhoDeSalvar())
  const ultima = textoCurtoDaUltima(info.ultimaEm)
  return (
    <section className="menu-sync" aria-labelledby="menu-sync-titulo">
      <Link to="/sincronizacao" className="menu-sync-link" onClick={aoFechar}>
        <span className="menu-sync-nome">
          <IconeDeSincronizacao marca={t.marca} />
          <span id="menu-sync-titulo">Sincronização</span>
        </span>
        <span className="menu-sync-detalhes">
          Detalhes
          <Icon name="detalhe" size={16} />
        </span>
      </Link>
      <p className="menu-sync-estado">
        <span role="status">{t.titulo}</span>
        {ultima && ` · ${ultima}`}
      </p>
      <BotaoSalvar variante="menu" />
    </section>
  )
}

export function Menu({ variante, aoFechar, gatilho }: Props) {
  const raiz = useRef<HTMLDivElement>(null)
  const fechar = useRef(aoFechar)
  fechar.current = aoFechar
  const pend = usePendencias()
  const [totalDeSitios, setTotalDeSitios] = useState<number | null>(null)
  const sitiosDoUsuario = useSitiosSkc()
  const bandeja = useBandeja()

  useEffect(() => {
    let vivo = true
    sitios().then(
      (s) => vivo && setTotalDeSitios(s.length),
      () => undefined,
    )
    return () => {
      vivo = false
    }
  }, [])

  // O foco entra no menu; o resto da tela fica inerte; ao sair, o foco volta a quem abriu.
  useEffect(() => {
    const anterior = (gatilho ?? document.activeElement) as HTMLElement | null
    const portal = raiz.current?.parentElement
    const inertes = [...document.body.children].filter((el) => el !== portal && !el.hasAttribute('inert'))
    for (const el of inertes) el.setAttribute('inert', '')
    raiz.current?.querySelector<HTMLElement>('button, a[href]')?.focus()
    return () => {
      for (const el of inertes) el.removeAttribute('inert')
      anterior?.focus?.()
    }
  }, [gatilho])

  // Esc fecha: o menu é um diálogo modal, e o registro de atalhos deixa só as teclas dele valerem.
  useAtalhos({ Escape: () => fechar.current() }, 'global', { raiz: () => raiz.current })

  const prender = (e: TeclaDoReact) => {
    if (e.key !== 'Tab' || !raiz.current) return
    const itens = [...raiz.current.querySelectorAll<HTMLElement>(FOCAVEIS)]
    if (itens.length === 0) return
    const primeiro = itens[0]!
    const ultimo = itens[itens.length - 1]!
    if (e.shiftKey && (document.activeElement === primeiro || !raiz.current.contains(document.activeElement))) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && (document.activeElement === ultimo || !raiz.current.contains(document.activeElement))) {
      e.preventDefault()
      primeiro.focus()
    }
  }

  const total = totalDeSitios === null ? null : totalDeSitios + sitiosDoUsuario.length
  const sitiosMeta = total === null ? null : `${numeroPtBr(total)} ${total === 1 ? 'sítio' : 'sítios'}`
  const revisaoMeta = pend === null ? null : `${numeroPtBr(pend.total)} ${pend.total === 1 ? 'caso' : 'casos'}`

  const link = (to: string, rotulo: string, meta: ReactNode, opcoes: { forte?: boolean; atalho?: string } = {}) => (
    <Link
      to={to}
      className={`menu-item${opcoes.forte ? ' menu-item-forte' : ''}`}
      aria-keyshortcuts={opcoes.atalho}
      onClick={aoFechar}
    >
      <span className="menu-item-nome">{rotulo}</span>
      {meta !== null && <span className={`menu-item-meta${opcoes.atalho ? ' codigo' : ''}`}>{meta}</span>}
    </Link>
  )
  const desabilitado = (rotulo: string) => (
    <button type="button" className="menu-item" disabled>
      <span className="menu-item-nome">{rotulo}</span>
      <span className="menu-item-meta">{MSG_PROXIMA_VERSAO}</span>
    </button>
  )

  return createPortal(
    <div className={`menu-camada menu-${variante}-camada`}>
      <div className="menu-fundo" data-testid="menu-fundo" onClick={aoFechar} />
      <div
        ref={raiz}
        className={`menu menu-${variante}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        onKeyDown={prender}
      >
        {variante === 'folha' && <div className="menu-alca" aria-hidden="true" />}
        <div className="menu-topo">
          <span className="menu-titulo">Menu</span>
          <IconButton icon="fechar" label="Fechar o menu" shortcut="Escape" shortcutLabel="Esc" onClick={aoFechar} />
        </div>
        <nav aria-label="Menu" className="menu-lista">
          {link('/revisao', 'Revisão', revisaoMeta, { forte: true })}
          {link('/objeto/novo', 'Novo objeto', 'SKC')}
          {link('/comparar', 'Comparar', bandeja.contador)}
          {link('/notas', 'Minhas notas', null)}
          {link('/sitios', 'Sítios', sitiosMeta)}
          {desabilitado('Ajustes')}
          {link('/copias', 'Cópias e exportação', 'cópias e arquivos')}
          {link('/excluidos', 'Excluídos', 'restaurar o que foi excluído')}
          {link('/atalhos', 'Atalhos e convenções', '?', { atalho: '?' })}
        </nav>
        <SecaoDeSincronizacao aoFechar={aoFechar} />
      </div>
    </div>,
    document.body,
  )
}
