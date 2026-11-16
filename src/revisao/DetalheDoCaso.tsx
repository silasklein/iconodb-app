/**
 * O detalhe de um caso da Revisão (Parte 2C, bloco 3, Tarefa 11): à direita da lista no computador, numa página própria no
 * celular. O caso genérico mostra o que a linha mostra (o número, o que falta, onde), a ação dele («Abrir…», «Escolher…») e
 * «Marcar como resolvido» (a tecla D); o resolvido por você, «Desfazer». A citação não resolvida tem o seu detalhe
 * (`DetalheDaCitacao`), com as ações de ligar.
 */
import type { MouseEvent, Ref } from 'react'
import { useNavigate } from 'react-router'
import { LinkComOrigem, useOrigemDosLinks } from '../app/OrigemDosLinks'
import { comVoltar } from '../app/voltar'
import type { CitacaoDoPacote } from '../banco/consultas'
import { Icon } from '../ui/Icon'
import { TIPO_DA_CITACAO } from './citacoes'
import { DetalheDaCitacao } from './DetalheDaCitacao'
import type { Caso, GrupoDaFila } from './fila'

/** O caso que a Revisão mostra no detalhe, e em que situação ele está. */
export interface CasoEscolhido {
  caso: Caso
  /** O grupo dele; null num caso ligado cujo grupo esvaziou. */
  grupo: GrupoDaFila | null
  /** 'aberto' (na fila), 'resolvido' (marcado por você) ou 'ligado' (a citação que você ligou a uma obra: saiu da fila). */
  situacao: 'aberto' | 'resolvido' | 'ligado'
  /** A posição entre os abertos do grupo (1…), ou null fora deles. */
  posicao: number | null
  /** A obra do caso ligado. */
  obra?: string
}

interface Props {
  escolhido: CasoEscolhido
  citacoes?: CitacaoDoPacote[]
  porChave: ReadonlyMap<string, readonly CitacaoDoPacote[]>
  volta: string
  computador: boolean
  ocupado: boolean
  tituloRef?: Ref<HTMLHeadingElement>
  aoMarcar: () => void
  aoDesfazer: () => void
  aoLigar: (obra: { id: string; rotulo: string }) => void
  aoDesfazerLigacao: () => void
}

export function DetalheDoCaso(props: Props) {
  const { escolhido, citacoes } = props
  if (escolhido.caso.tipo === TIPO_DA_CITACAO && citacoes && citacoes.length > 0) return <DetalheDaCitacao {...props} citacoes={citacoes} />
  return <DetalheGenerico {...props} />
}

function DetalheGenerico({ escolhido, ocupado, tituloRef, aoMarcar, aoDesfazer }: Props) {
  const { caso, grupo, situacao, posicao } = escolhido
  const navegar = useNavigate()
  const origem = useOrigemDosLinks()
  // a ação navega pelo roteador; ao objeto vai junto a origem (decisão 85): «‹ Revisão», que volta a este caso (`?caso=`)
  const irPara = (para: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    void navegar(para, para.startsWith('/item/') ? { state: comVoltar(undefined, origem) } : undefined)
  }
  const comNumero = caso.abrir && caso.numero !== '—'
  const outroAbrir = comNumero && caso.abrir !== caso.acao?.para
  return (
    <article className="revisao-detalhe-caso" data-chave={caso.chave}>
      <header className="revisao-detalhe-cabeca">
        <span className="revisao-detalhe-sobre">
          {grupo?.rotulo ?? 'Caso'}
          {situacao === 'resolvido' && ' · resolvido por você'}
          {posicao !== null && grupo && ` · ${posicao} de ${grupo.abertos.length}`}
        </span>
        <h2 ref={tituloRef} tabIndex={-1}>
          {caso.o_que}
        </h2>
        <p className="revisao-detalhe-apoio">
          {caso.numero !== '—' && <span className="codigo">{caso.numero} · </span>}
          {caso.onde}
        </p>
        {grupo?.apoio && <p className="revisao-detalhe-apoio">{grupo.apoio}</p>}
      </header>
      <div className="revisao-detalhe-botoes">
        {caso.acao && (
          <a className="form-botao form-botao-forte" href={`#${caso.acao.para}`} onClick={irPara(caso.acao.para)}>
            {caso.acao.rotulo}
          </a>
        )}
        {outroAbrir && (
          <LinkComOrigem className="form-botao" to={caso.abrir!}>
            Abrir {caso.numero}
          </LinkComOrigem>
        )}
        {situacao === 'aberto' && caso.deixavel && (
          <button type="button" className="form-botao" aria-keyshortcuts="D" onClick={aoMarcar} disabled={ocupado}>
            Marcar como resolvido
          </button>
        )}
        {situacao === 'resolvido' && (
          <button type="button" className="form-botao" onClick={aoDesfazer} disabled={ocupado}>
            <Icon name="desfazer" size={16} />
            Desfazer
          </button>
        )}
      </div>
      {grupo?.soConsulta && <p className="revisao-detalhe-nota">Só para consulta: não entra no total.</p>}
      {situacao === 'aberto' && !caso.deixavel && !grupo?.soConsulta && <p className="revisao-detalhe-nota">Este caso só se resolve no lugar dele.</p>}
    </article>
  )
}
