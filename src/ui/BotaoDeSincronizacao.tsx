import { useEffect, useRef, useState, type KeyboardEvent as TeclaDoReact } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { useAtalhos } from '../app/useAtalhos'
import { ATALHO_DE_SALVAR, AcaoDoErro, BotaoSalvar, ChaveAutomatica, ChegouDoOutro, EstadoDaSincronizacao, VaiSubir } from '../telas/Sincronizacao'
import { textosDoEstado } from '../usuario/textosDaSync'
import { atalhoDeSalvar, useSincronizacao } from '../usuario/useSincronizacao'
import { IconButton } from './IconButton'
import { MarcasDeSincronizacao } from './IconeDeSincronizacao'
import '../telas/Sincronizacao.css'

const FOCAVEIS = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * O painel do computador (PC-Sincronizacao.dc.html): o estado, o que vai subir, o que chegou, "Salvar e
 * sincronizar" e o automático. Um diálogo modal preso ao ícone: o foco entra e não sai, Esc e o fundo
 * fecham, e o foco volta ao ícone.
 */
function PainelDeSincronizacao({ gatilho, aoFechar }: { gatilho: HTMLElement | null; aoFechar: () => void }) {
  const info = useSincronizacao()
  const raiz = useRef<HTMLDivElement>(null)
  const fechar = useRef(aoFechar)
  fechar.current = aoFechar

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

  return createPortal(
    <div className="sync-painel-camada">
      <div className="sync-painel-fundo" onClick={aoFechar} />
      <div ref={raiz} className="sync-painel" role="dialog" aria-modal="true" aria-labelledby="sync-painel-titulo" onKeyDown={prender}>
        <div className="sync-painel-topo">
          <span id="sync-painel-titulo" className="sync-painel-titulo">
            Sincronização · Dropbox
          </span>
          <IconButton icon="fechar" label="Fechar" shortcut="Escape" shortcutLabel="Esc" onClick={aoFechar} />
        </div>
        <EstadoDaSincronizacao info={info} variante="painel" />
        <AcaoDoErro info={info} />
        <VaiSubir porEnviar={info.porEnviar} variante="painel" />
        <ChegouDoOutro info={info} variante="painel" />
        <BotaoSalvar variante="painel" />
        <ChaveAutomatica automatico={info.automatico} variante="painel" />
        <Link className="sync-painel-detalhes" to="/sincronizacao" onClick={aoFechar}>
          Histórico e detalhes
        </Link>
      </div>
    </div>,
    document.body,
  )
}

/**
 * O ícone de sincronização da barra do computador, antes do Menu (decisão 29). O glifo é sempre o mesmo;
 * a marca do canto diz o estado (ponto, setas girando, traço, selo). O nome acessível é o estado; a dica
 * leva o atalho. Clicar abre o painel; Ctrl/⌘S sincroniza sem abrir nada.
 */
export function BotaoDeSincronizacao() {
  const info = useSincronizacao()
  const t = textosDoEstado(info, atalhoDeSalvar())
  const [painel, setPainel] = useState<{ gatilho: HTMLElement | null } | null>(null)
  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label={t.rotulo}
        data-tip={t.dica}
        aria-keyshortcuts={ATALHO_DE_SALVAR}
        aria-haspopup="dialog"
        aria-expanded={painel !== null}
        onClick={(e) => setPainel({ gatilho: e.currentTarget })}
      >
        <MarcasDeSincronizacao marca={t.marca} />
      </button>
      {painel && <PainelDeSincronizacao gatilho={painel.gatilho} aoFechar={() => setPainel(null)} />}
    </>
  )
}
