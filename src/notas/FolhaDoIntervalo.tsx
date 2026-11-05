import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { resumosDosObjetos } from '../banco/consultas'
import type { ObjetoResumo } from '../banco/tipos'
import { resumoDeObjetoSkc } from '../colecoes/objetosSkc'
import { substituirBandeja } from '../comparar/operacoes'
import { useBandeja } from '../comparar/useBandeja'
import { textoDaSubstituicao } from '../comparar/textos'
import { MiniaturaDoObjeto } from '../imagens-usuario/MiniaturaDoObjeto'
import { Camada } from '../ui/Camada'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { estadoAtual } from '../usuario/estado'
import { chaveDaFonte } from './citacoes'
import type { ObjetoCitado } from './fontesCitadas'
import { useFontesCitadas } from './useCitacoes'
import './Citacoes.css'

interface Props {
  obra: string
  de: number
  ate: number
  aoFechar: () => void
  /** O intervalo que abriu a folha: o foco volta para ele. */
  devolverFoco: () => HTMLElement | null
}

/**
 * A folha de um intervalo citado (decisão 40): "TESTE I: 1–3" lista os objetos dele, cada um com a miniatura, o número
 * do sistema e o tipo curto, como link; um número que não existe aparece com "?" e sem link. Celular: folha de baixo;
 * computador: diálogo. As duas são a camada modal das folhas (src/ui/Camada.tsx: foco preso, Esc e o fundo fecham, a
 * página não rola, o foco volta ao intervalo). ↑ ↓ andam pelos objetos; Enter abre (é um link).
 * "Comparar todos" (Tarefa 14, decisão 44) TROCA a bandeja de comparação pelos objetos citados (os 4 primeiros; os que ficarem de
 * fora são ditos pelo número em Comparar, que abre em seguida, com o «Desfazer» que devolve a bandeja de antes).
 */
export function FolhaDoIntervalo({ obra, de, ate, aoFechar, devolverFoco }: Props) {
  const computador = useBreakpoint() === 'computador'
  const refs = useMemo(() => Array.from({ length: ate - de + 1 }, (_, i) => ({ obra, numero: de + i })), [obra, de, ate])
  const resolvidos = useFontesCitadas(refs)
  const titulo = `${obra}: ${de}–${ate}`

  const doLivro = [...new Set([...resolvidos.values()].flatMap((o) => (o && !o.skc ? [o.numero] : [])))]
  const resumos = useCarregar(() => resumosDosObjetos(doLivro), doLivro.join('|'))
  const resumoDe = (o: ObjetoCitado): ObjetoResumo | null => {
    if (o.skc) {
      const r = estadoAtual().registro('objeto', o.skc)
      return r ? resumoDeObjetoSkc(r) : null
    }
    return resumos.fase === 'ok' ? (resumos.dados.find((r) => r.numero === o.numero) ?? null) : null
  }
  const esperando = refs.some((r) => !resolvidos.has(chaveDaFonte(r.obra, r.numero)))
  const existentes = [...resolvidos.values()].filter(Boolean).length

  // "Comparar todos": os objetos que existem, na ordem citada, pela ref da bandeja (o id de um objeto SKC, o número de um do livro).
  const navegar = useNavigate()
  const naBandeja = useBandeja().todos.length
  const [comparando, setComparando] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const compararTodos = async () => {
    const citados = refs.map((r) => resolvidos.get(chaveDaFonte(r.obra, r.numero))).filter((o): o is ObjetoCitado => !!o)
    const nomes = new Map(citados.map((o) => [o.skc ?? o.numero, o.numero]))
    setComparando(true)
    setFalhou(false)
    try {
      const r = await substituirBandeja([...nomes.keys()])
      const aviso = textoDaSubstituicao(titulo, { entraram: r.entraram, deFora: r.deFora, tiradas: r.previa.filter((m) => !r.entraram.includes(m.ref)).length, igual: r.igual }, (ref) => nomes.get(ref) ?? ref)
      aoFechar()
      // O Desfazer vai no estado do histórico: sobrevive a recarregar a página (a tela lê de lá ao montar).
      const gravou = !r.igual && r.entraram.length > 0 && r.hlc !== null
      void navegar('/comparar', { state: gravou ? { aviso, desfazer: { previa: r.previa, entraram: r.entraram, hlc: r.hlc } } : { aviso } })
    } catch {
      setFalhou(true)
    } finally {
      setComparando(false)
    }
  }

  // ↑ ↓ andam pelos links da lista, também a partir da própria folha (que tem o foco ao abrir); Enter abre (é um link).
  const lista = useRef<HTMLUListElement>(null)
  const andar = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const links = [...(lista.current?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? [])]
    if (links.length === 0) return
    e.preventDefault()
    const i = links.indexOf(document.activeElement as HTMLAnchorElement)
    const j = i < 0 ? 0 : Math.max(0, Math.min(links.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))
    links[j]!.focus()
  }, [])

  return (
    // A folha vive num portal, mas o clique (também no fundo) sobe pela árvore do React até o bloco da nota, que abriria
    // a edição: ele para aqui.
    <span className="folha-citacao-ancora" onClick={(e: MouseEvent) => e.stopPropagation()} onKeyDown={andar}>
    <Camada variante={computador ? 'dialogo' : 'folha'} rotulo={titulo} aoFechar={aoFechar} devolverFoco={devolverFoco} prefixo="folha-citacao">
      <div className="folha-citacao-conteudo">
        <div className="folha-citacao-topo">
          <h2 className="folha-citacao-titulo">{titulo}</h2>
          <IconButton icon="fechar" label="Fechar a lista" shortcut="Escape" shortcutLabel="Esc" onClick={aoFechar} />
        </div>
        <p className="folha-citacao-apoio" aria-live="polite">
          {esperando ? 'Procurando os objetos…' : existentes === refs.length ? `${refs.length} objetos` : `${existentes} de ${refs.length} encontrados`}
        </p>
        <ul ref={lista} className="folha-citacao-lista">
          {refs.map((r) => {
            const chave = chaveDaFonte(r.obra, r.numero)
            const o = resolvidos.get(chave)
            const fonte = `${r.obra}: ${r.numero}`
            if (o === undefined)
              return (
                <li key={chave} className="folha-citacao-linha folha-citacao-ausente" aria-busy="true">
                  <span className="folha-citacao-texto">
                    <span className="folha-citacao-fonte">{fonte}</span>
                  </span>
                </li>
              )
            if (o === null)
              return (
                <li key={chave} className="folha-citacao-linha folha-citacao-ausente" title={`Não encontrado: ${fonte}`}>
                  <span className="folha-citacao-imagem" aria-hidden="true" />
                  <span className="folha-citacao-texto">
                    <span className="folha-citacao-fonte">{fonte}</span>
                    <span className="folha-citacao-tipo">
                      não encontrado<sup aria-hidden="true" className="nota-ausente-marca">?</sup>
                    </span>
                  </span>
                </li>
              )
            const resumo = resumoDe(o)
            return (
              <li key={chave} className="folha-citacao-linha">
                <Link className="folha-citacao-link" to={o.rota} onClick={aoFechar}>
                  <span className="folha-citacao-imagem">
                    <MiniaturaDoObjeto numero={o.skc ?? o.numero} caminho={resumo?.miniatura ?? null} alt="" />
                  </span>
                  <span className="folha-citacao-texto">
                    <span className="folha-citacao-numero codigo">{o.numero}</span>
                    <span className="folha-citacao-tipo">
                      {fonte}
                      {resumo?.tipo ? ` · ${resumo.tipo}` : ''}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
        {!esperando && existentes > 0 && (
          <div className="folha-citacao-comparar">
            <button type="button" className="folha-citacao-comparar-botao" aria-busy={comparando || undefined} onClick={() => void compararTodos()}>
              <Icon name="comparar" size={18} />
              Comparar todos
            </button>
            <span className="folha-citacao-comparar-apoio">
              {existentes > 4
                ? 'Troca a comparação por estes objetos. Ela leva até 4: entram os 4 primeiros e o aviso diz quais ficaram de fora.'
                : naBandeja > 0
                  ? 'Troca o que está na comparação por estes objetos. Dá para desfazer.'
                  : 'Põe estes objetos na comparação.'}
            </span>
            {falhou && (
              <span className="folha-citacao-comparar-erro" role="alert">
                Não foi possível guardar; tente de novo.
              </span>
            )}
          </div>
        )}
      </div>
    </Camada>
    </span>
  )
}
