import { useEffect, useRef, type KeyboardEvent as TeclaDoReact, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { useAtalhos } from '../app/useAtalhos'
import { hipotese } from '../banco/consultas'
import type { Hipotese } from '../banco/tipos'
import { caminhoDaBusca } from '../busca/url'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { IconButton } from '../ui/IconButton'
import { useCarregar } from '../ui/useCarregar'
import {
  autores,
  nomeDaHipotese,
  ROTULO_DA_MODALIDADE,
  ROTULO_DA_RELIGIOSIDADE,
  ROTULO_DA_VERIFICACAO,
  ROTULO_DO_NIVEL,
  temAncora,
} from './rotulos'
import type { VerbeteDoTrecho } from './trechos'
import './PainelHipotese.css'

export interface OrdemNoTexto {
  /** 1 a total. */
  posicao: number
  total: number
  anterior: string | null
  seguinte: string | null
}

interface Props {
  id: string
  /** "folha": a folha de baixo do celular (Hipotese.dc.html), modal. "lateral": o painel de 380 px do computador (PC-ItemHipotese.dc.html). */
  variante: 'folha' | 'lateral'
  aoFechar: () => void
  /** Onde o foco volta ao fechar (a âncora da hipótese, ou quem abriu). */
  devolverFoco?: () => HTMLElement | null
  /** A hipótese entre as âncoras do texto, para "[" e "]". Sem ela (hipótese sem trecho), não há anterior/seguinte. */
  ordem?: OrdemNoTexto | null
  aoIr?: (id: string) => void
  /** A região do alvo está acesa na imagem. */
  regiaoAcesa?: boolean
  /** Os verbetes marcados no trecho da hipótese (`verbetesDaAncora`): um link para cada. */
  verbetes?: readonly VerbeteDoTrecho[]
}

const SEM_VERBETES: readonly VerbeteDoTrecho[] = []

const FOCAVEIS = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Uma hipótese aberta: nível e modalidade, o termo, o recorte da fonte, autores, origem, alvo e
 * verificação, e os caminhos ao verbete e à busca pelo termo. No celular é uma folha modal (foco
 * preso, Esc, fundo que fecha, o resto inerte); no computador, um painel lateral não modal, que
 * fica sobre a coluna de leitura e nunca sobre a imagem. Em ambos o foco entra no painel e volta
 * à âncora ao fechar.
 */
export function PainelHipotese({ id, variante, aoFechar, devolverFoco, ordem = null, aoIr, regiaoAcesa = false, verbetes = SEM_VERBETES }: Props) {
  const carga = useCarregar(() => hipotese(id), id)
  const raiz = useRef<HTMLDivElement>(null)
  const atual = useRef({ aoFechar, aoIr, ordem, devolverFoco })
  atual.current = { aoFechar, aoIr, ordem, devolverFoco }
  const folha = variante === 'folha'

  // O foco entra no painel; na folha, o resto da tela fica inerte. Ao fechar, o foco volta.
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    const portal = folha ? raiz.current?.closest('.painel-hipotese-camada') : null
    const inertes = portal ? [...document.body.children].filter((el) => el !== portal && !el.hasAttribute('inert')) : []
    for (const el of inertes) el.setAttribute('inert', '')
    raiz.current?.focus()
    return () => {
      for (const el of inertes) el.removeAttribute('inert')
      const destino = atual.current.devolverFoco?.() ?? anterior
      if (destino?.isConnected) destino.focus()
    }
  }, [folha])

  // Ao trocar de hipótese por "[" / "]", o botão usado pode sumir (chegou ao fim): o foco fica no painel.
  useEffect(() => {
    const ativo = document.activeElement
    if (raiz.current && (!ativo || ativo === document.body || !raiz.current.contains(ativo))) raiz.current.focus()
  }, [id])

  // Esc fecha; "[" e "]" andam pelas hipóteses do texto. Na folha (modal) as teclas são dela; no painel lateral,
  // Esc vindo da busca da barra é do campo (o registro de atalhos só entrega Esc de campos a quem é dono dele).
  useAtalhos(
    {
      Escape: () => atual.current.aoFechar(),
      '[': () => {
        const { ordem: o, aoIr: ir } = atual.current
        if (!o?.anterior) return false
        ir?.(o.anterior)
      },
      ']': () => {
        const { ordem: o, aoIr: ir } = atual.current
        if (!o?.seguinte) return false
        ir?.(o.seguinte)
      },
    },
    'hipotese',
    { raiz: () => raiz.current },
  )

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

  const h = carga.fase === 'ok' ? carga.dados : null
  const nome = h ? nomeDaHipotese(h) : null

  const painel = (
    <div
      ref={raiz}
      className={`painel-hipotese painel-hipotese-${variante}`}
      role="dialog"
      aria-modal={folha ? true : undefined}
      aria-label={nome ? `Hipótese ${nome}` : 'Hipótese'}
      aria-busy={carga.fase === 'carregando' || undefined}
      tabIndex={-1}
      onKeyDown={prender}
    >
      {folha && <div className="painel-hipotese-alca" aria-hidden="true" />}
      <div className="painel-hipotese-topo">
        <span className="painel-hipotese-etiqueta">{h ? `${ROTULO_DO_NIVEL[h.nivel]} · ${ROTULO_DA_MODALIDADE[h.modalidade]}` : ''}</span>
        <IconButton icon="fechar" label="Fechar o painel" shortcut="Escape" shortcutLabel="Esc" onClick={aoFechar} />
      </div>
      {ordem && (
        <div className="painel-hipotese-ordem">
          <BotaoDeOrdem icone="anterior" rotulo="Hipótese anterior no texto" atalho="[" destino={ordem.anterior} aoIr={aoIr} />
          <span className="codigo">{`${ordem.posicao} / ${ordem.total} no texto`}</span>
          <BotaoDeOrdem icone="proximo" rotulo="Hipótese seguinte no texto" atalho="]" destino={ordem.seguinte} aoIr={aoIr} />
        </div>
      )}
      <div className="painel-hipotese-corpo">
        {carga.fase === 'erro' && <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />}
        {carga.fase === 'ok' && h === null && <p>Hipótese não encontrada.</p>}
        {h && <Conteudo h={h} regiaoAcesa={regiaoAcesa} verbetes={verbetes} />}
      </div>
      {!folha && (
        <p className="painel-hipotese-teclas">
          {ordem && (
            <>
              <kbd>[ ]</kbd> anterior e seguinte ·{' '}
            </>
          )}
          <kbd>H</kbd> todas por nível · <kbd>Esc</kbd> fecha
        </p>
      )}
    </div>
  )

  if (!folha) return painel
  return createPortal(
    <div className="painel-hipotese-camada">
      <div className="painel-hipotese-fundo" onClick={aoFechar} aria-hidden="true" />
      {painel}
    </div>,
    document.body,
  )
}

function BotaoDeOrdem({ icone, rotulo, atalho, destino, aoIr }: { icone: 'anterior' | 'proximo'; rotulo: string; atalho: string; destino: string | null; aoIr?: (id: string) => void }) {
  if (!destino) return <span className="painel-hipotese-ordem-vazio" aria-hidden="true" />
  return <IconButton icon={icone} label={rotulo} shortcut={atalho} tipPosition={icone === 'anterior' ? 'start' : 'end'} onClick={() => aoIr?.(destino)} />
}

function Conteudo({ h, regiaoAcesa, verbetes }: { h: Hipotese; regiaoAcesa: boolean; verbetes: readonly VerbeteDoTrecho[] }) {
  const termo = h.termos[0] ?? null
  // Os verbetes do trecho e, depois, os termos da hipótese que não estão nele.
  const lista: VerbeteDoTrecho[] = [...verbetes]
  for (const t of h.termos) if (!lista.some((v) => v.glId === t.glId)) lista.push({ glId: t.glId, texto: t.pt ?? t.de ?? t.glId })
  const linhas: [string, ReactNode][] = []
  if (h.citacao) linhas.push(['Fonte', <span lang="de">{`»${h.citacao}«`}</span>])
  if (h.autores.length > 0) linhas.push(['Autores', autores(h.autores)])
  if (h.locator) linhas.push(['Origem', h.locator])
  linhas.push(['Sobre', <Sobre h={h} regiaoAcesa={regiaoAcesa} />])
  if (!temAncora(h)) linhas.push(['Trecho', 'sem trecho no texto PT'])
  if (h.religiosidade) linhas.push(['Religiosidade', ROTULO_DA_RELIGIOSIDADE[h.religiosidade]])
  linhas.push(['Verificação', ROTULO_DA_VERIFICACAO[h.verificacao]])
  const ids = [h.id, termo?.glId].filter(Boolean).join(' · ')

  return (
    <>
      <div className="painel-hipotese-cabeca">
        <h2>{nomeDaHipotese(h)}</h2>
        <span className="painel-hipotese-ids codigo">
          {ids}
          {termo?.de && (
            <>
              {' · '}
              <span lang="de">{termo.de}</span>
            </>
          )}
        </span>
      </div>
      <dl className="painel-hipotese-dados">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt>{rotulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
      {lista.length > 1 && (
        <ul className="painel-hipotese-verbetes" aria-label="Verbetes no trecho">
          {lista.map((v) => (
            <li key={v.glId}>
              <Link to={`/verbete/${encodeURIComponent(v.glId)}`} aria-label={`Abrir verbete: ${v.texto}`}>
                <span className="painel-hipotese-verbetes-rotulo">Abrir verbete</span> {v.texto}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {lista.length > 0 && (
        <div className="painel-hipotese-acoes">
          {lista.length === 1 && (
            <Link className="painel-hipotese-principal" to={`/verbete/${encodeURIComponent(lista[0]!.glId)}`}>
              Abrir verbete
            </Link>
          )}
          <Link
            className="painel-hipotese-secundaria"
            to={caminhoDaBusca(termo?.pt ?? termo?.de ?? lista[0]!.texto, { escopo: 'termo' })}
            aria-label="Filtrar a busca por este termo"
          >
            Filtrar a busca
          </Link>
        </div>
      )}
    </>
  )
}

function Sobre({ h, regiaoAcesa }: { h: Hipotese; regiaoAcesa: boolean }) {
  const { alvo } = h
  const outroObjeto = alvo.numero && h.citadaDe
  return (
    <>
      {alvo.rotulo ? (
        <>
          <strong>{alvo.rotulo}</strong> (elemento)
        </>
      ) : (
        'objeto inteiro'
      )}
      {outroObjeto && (
        <>
          {' de '}
          <Link to={`/item/${encodeURIComponent(alvo.numero!)}`} className="codigo">
            {alvo.numero}
          </Link>
        </>
      )}
      {regiaoAcesa && ' · acesa na imagem'}
    </>
  )
}
