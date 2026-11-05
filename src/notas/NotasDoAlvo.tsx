import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { registrar } from '../usuario/estado'
import { Contagem } from '../ui/Contagem'
import { Icon } from '../ui/Icon'
import { useBreakpoint } from '../ui/useBreakpoint'
import { alvosDosTextos, descreverAlvo, rotaDoAlvo } from './alvos'
import type { Ancora } from './ancora'
import { AvisoDaFonte } from './AvisoDaFonte'
import { EditorDeNota } from './EditorDeNota'
import { cabecaDaNota, caminhoDaNota, caminhoDaNotaNova, dataDaNota, rotuloDaNotaNova, rotuloDoCampo } from './formato'
import type { Ligada, NotaVista, TipoDeAlvo } from './indiceDeNotas'
import { chaveDoAlvo } from './links'
import { TextoDaNota } from './TextoDaNota'
import { useAlvosDe } from './useAlvos'
import { useFontesDoObjeto } from './useFontesDoObjeto'
import { useIndiceDeNotas } from './useIndiceDeNotas'
import { origensDe, useRedirecionamentos } from '../pacote/redirecionamentos'
import './Notas.css'

interface Props {
  tipo: TipoDeAlvo
  ref_: string
  /**
   * 'leitura': a voz "SKC / notas" dentro das leituras do objeto (Item.dc.html, PC-ItemNota.dc.html).
   * 'secao': a seção "Notas" do verbete, da obra, do sítio e do grupo, com os links reversos.
   * 'item': as notas de UM objeto dentro de uma coleção SKC (uma linha da coleção): sem título de seção, e o botão de
   * escrever diz sobre qual objeto é (`rotuloDoAlvo`), porque há um por linha.
   */
  variante: 'leitura' | 'secao' | 'item'
  /** Só com `variante="item"`: o nome do objeto, para o "Escrever nota sobre …". */
  rotuloDoAlvo?: string
  /** As âncoras do texto da fonte, calculadas quando a nota é criada (só o objeto tem). */
  ancorar?: () => Promise<Ancora[]>
  /** Cada vez que sobe, abre o editor de uma nota nova (a tecla N e o ícone do item, no computador). */
  pedido?: number
  /**
   * Só com `variante="leitura"`: as notas de um membro NÃO principal de um grupo ligado (revisão 3), na tela do principal.
   * É o número do membro, mostrado sob "SKC notas" e no nome do grupo ("SKC notas de CA00004"). Sem "Escrever nota" (a
   * nota nova vai ao principal) e sem voz nenhuma quando o membro não tem nota.
   */
  membro?: string
}

interface Edicao {
  /** A nota que se edita; `null` enquanto a nota nova ainda não foi gravada. */
  id: string | null
  rotulo: string
  /** Cada vez que o editor abre (nota nova ou outra nota) é uma sessão: o editor é remontado, com o rascunho e o texto da nota certa. */
  sessao: number
}

/**
 * As notas de um alvo: as feitas nele e as que o citam com `[[…]]` ou, num objeto, com uma citação reconhecida
 * ("TESTE I: 1-3", "CA00046"; decisão 40) — links reversos, do índice de notas: uma busca num mapa, sem varrer as notas. No computador, escrever e editar abrem o editor no lugar; no celular levam à tela
 * da nota (Nota.dc.html), onde o texto tem a tela inteira.
 */
export function NotasDoAlvo(props: Props) {
  // Ao trocar de alvo (a tela fica montada no computador) tudo recomeça: o editor aberto sai de cena e grava o rascunho no alvo de antes.
  return <NotasDeUmAlvo key={`${props.tipo}:${props.ref_}`} {...props} />
}

function NotasDeUmAlvo({ tipo, ref_, variante, ancorar, pedido = 0, rotuloDoAlvo, membro }: Props) {
  const computador = useBreakpoint() === 'computador'
  const indice = useIndiceDeNotas()
  // Um objeto também é citado pelas referências dele nas fontes ("TESTE I: 1-3", decisão 40).
  const fontes = useFontesDoObjeto(tipo, ref_)
  // Um verbete ou sítio do livro que é o destino de um do usuário publicado (Tarefa 16, revisão 1): as notas feitas no id do
  // usuário, ou que o citam, também são dele.
  const redirecionamentos = useRedirecionamentos()
  const origens = useMemo(() => (tipo === 'verbete' || tipo === 'sitio' ? origensDe(redirecionamentos, ref_) : []), [tipo, ref_, redirecionamentos])
  const ligadas = useMemo(() => {
    const outros = [...origens.map((ref) => ({ tipo, ref })), ...fontes]
    return outros.length === 0 ? indice.ligadasA(tipo, ref_) : indice.ligadasAQualquer([{ tipo, ref: ref_ }, ...outros])
  }, [indice, tipo, ref_, fontes, origens])
  const quantas = origens.reduce((n, ref) => n + indice.quantasDoAlvo(tipo, ref), indice.quantasDoAlvo(tipo, ref_))
  const [edicao, setEdicao] = useState<Edicao | null>(null)
  // A nota que acabou de ser excluída no lugar: fica o aviso com Desfazer até a próxima ação.
  const [excluida, setExcluida] = useState<string | null>(null)
  const [falhouAoDesfazer, setFalhouAoDesfazer] = useState(false)
  const sessoes = useRef(0)
  const gatilho = useRef<HTMLElement | null>(null)
  const botaoEscrever = useRef<HTMLButtonElement>(null)

  // Os alvos de que as notas falam: os links do texto e, nas notas que só citam este alvo, o alvo da própria nota.
  const alvos = useMemo(() => {
    const dosTextos = alvosDosTextos(ligadas.map((l) => l.nota.texto))
    const deOrigem = ligadas.flatMap((l) => (l.direta || !l.nota.alvoTipo || !l.nota.alvo ? [] : [{ tipo: l.nota.alvoTipo, ref: l.nota.alvo }]))
    return [...new Map([...dosTextos, ...deOrigem].map((a) => [chaveDoAlvo(a.tipo, a.ref), a])).values()]
  }, [ligadas])
  const resolvidos = useAlvosDe(alvos)

  const abrirNova = () => {
    setExcluida(null)
    setFalhouAoDesfazer(false)
    if (edicao) return
    setEdicao({ id: null, rotulo: rotuloDaNotaNova(quantas + 1), sessao: ++sessoes.current })
  }
  const abrirExistente = (n: NotaVista) => {
    setExcluida(null)
    setFalhouAoDesfazer(false)
    setEdicao({ id: n.id, rotulo: rotuloDoCampo(n), sessao: ++sessoes.current })
  }
  const fechar = () => setEdicao(null)

  // Pedido de fora (tecla N, ícone do topo): só vale no computador, onde o editor abre no lugar.
  const ultimoPedido = useRef(pedido)
  useEffect(() => {
    if (pedido === ultimoPedido.current) return
    ultimoPedido.current = pedido
    if (computador && !membro) abrirNova()
  }, [pedido]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ao fechar o editor, o foco volta a quem o abriu (ou ao "Escrever nota").
  const estavaAberto = useRef(false)
  useEffect(() => {
    if (estavaAberto.current && !edicao) {
      const alvoDoFoco = gatilho.current?.isConnected ? gatilho.current : botaoEscrever.current
      alvoDoFoco?.focus()
    }
    estavaAberto.current = !!edicao
  }, [edicao])

  const editor = edicao && (
    <div key="editor" className="nota-no-lugar">
      <EditorDeNota
        key={`${tipo}:${ref_}:${edicao.sessao}`}
        nota={edicao.id ? (indice.porId.get(edicao.id) ?? null) : null}
        alvo={{ tipo, ref: ref_ }}
        rotulo={edicao.rotulo}
        ancorar={ancorar}
        autoFoco
        aoCriar={(reg) => setEdicao((e) => (e && e.id === null ? { ...e, id: reg } : e))}
        aoSalvar={fechar}
        aoFechar={fechar}
        aoExcluir={(reg) => {
          fechar()
          setExcluida(reg)
        }}
      />
    </div>
  )
  const itens: ReactNode[] = ligadas.map((l) =>
    edicao?.id === l.nota.id ? (
      editor
    ) : (
      <NotaDaLista key={l.nota.id} ligada={l} computador={computador} resolvidos={resolvidos} aoEditar={(el) => { gatilho.current = el; abrirExistente(l.nota) }} />
    ),
  )
  if (edicao && !itens.includes(editor)) itens.push(editor)

  const desfazer = excluida && (
    <>
      <p className="nota-excluida" role="status">
        Nota excluída.{' '}
        <button
          type="button"
          className="nota-escrever nota-desfazer"
          onClick={() => {
            const reg = excluida
            setFalhouAoDesfazer(false)
            registrar('nota', reg, 'restaurar').then(
              () => setExcluida(null),
              () => setFalhouAoDesfazer(true),
            )
          }}
        >
          Desfazer
        </button>
      </p>
      {falhouAoDesfazer && (
        <p className="editor-nota-erro" role="alert">
          Não foi possível restaurar a nota; tente de novo.
        </p>
      )}
    </>
  )
  const sobre = variante === 'item' && rotuloDoAlvo ? `Escrever nota sobre ${rotuloDoAlvo}` : undefined
  const escrever = edicao || membro ? null : computador ? (
    <button ref={botaoEscrever} type="button" className="nota-escrever" aria-label={sobre} onClick={abrirNova}>
      <Icon name="escrever" size={20} />
      Escrever nota
    </button>
  ) : (
    <Link className="nota-escrever" to={caminhoDaNotaNova(tipo, ref_)} aria-label={sobre}>
      <Icon name="escrever" size={20} />
      Escrever nota
    </Link>
  )

  if (variante === 'item') {
    return (
      <div className="nota-do-item nota-corpo" role="group" aria-label={`Notas sobre ${rotuloDoAlvo ?? ref_}`}>
        {itens}
        {desfazer}
        {escrever}
      </div>
    )
  }
  if (variante === 'leitura') {
    if (membro && ligadas.length === 0 && !edicao && !excluida) return null
    return (
      <div className="leitura nota-leitura" role="group" aria-label={membro ? `SKC notas de ${membro}` : 'SKC notas'}>
        <div className="leitura-fonte">
          <span className="leitura-sigla">SKC</span>
          <span className="leitura-numero">notas</span>
          {membro && <span className="leitura-numero">{membro}</span>}
        </div>
        <div className="leitura-corpo nota-corpo">
          {itens}
          {desfazer}
          {escrever}
        </div>
      </div>
    )
  }
  return (
    <section className="detalhe-secao notas-do-alvo" aria-label="Notas SKC">
      <div className="detalhe-secao-topo">
        <h2>Notas</h2>
        <Contagem n={ligadas.length} um="nota" varios="notas" className="codigo" />
      </div>
      {ligadas.length === 0 && !edicao && <p className="detalhe-vazio">Nenhuma nota ainda.</p>}
      <div className="nota-corpo">
        {itens}
        {desfazer}
        {escrever}
      </div>
    </section>
  )
}

function NotaDaLista({
  ligada,
  computador,
  resolvidos,
  aoEditar,
}: {
  ligada: Ligada
  computador: boolean
  resolvidos: ReturnType<typeof useAlvosDe>
  aoEditar: (el: HTMLElement) => void
}) {
  const { nota, direta } = ligada
  const aria = `Editar a nota ${nota.ordinal} de ${dataDaNota(nota)}${nota.rascunho ? ' (rascunho)' : ''}`
  const de = !direta && nota.alvoTipo && nota.alvo ? { tipo: nota.alvoTipo, ref: nota.alvo } : null
  const rotaDe = de ? (resolvidos.get(chaveDoAlvo(de.tipo, de.ref))?.rota ?? rotaDoAlvo(de.tipo, de.ref)) : null
  const nomeDe = de ? descreverAlvo(de.tipo, de.ref, resolvidos.get(chaveDoAlvo(de.tipo, de.ref))) : ''
  return (
    <article className="nota-item" data-nota={nota.id}>
      <p className="nota-cabeca codigo">
        {computador ? (
          <button type="button" className="nota-rotulo" aria-label={aria} onClick={(e) => aoEditar(e.currentTarget)}>
            {cabecaDaNota(nota)}
          </button>
        ) : (
          <Link className="nota-rotulo" to={caminhoDaNota(nota.id)} aria-label={aria}>
            {cabecaDaNota(nota)}
          </Link>
        )}
        {de &&
          (rotaDe ? (
            <Link className="nota-origem" to={rotaDe}>
              em {nomeDe}
            </Link>
          ) : (
            <span className="nota-origem">em {nomeDe}</span>
          ))}
      </p>
      <p className="nota-conteudo">
        <TextoDaNota texto={nota.texto} alvos={resolvidos} />
      </p>
      <AvisoDaFonte nota={nota} />
    </article>
  )
}
