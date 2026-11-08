/**
 * As partes de um sítio, em vários níveis (Parte 2C, bloco 2; telas aprovadas §3):
 * - no todo, a seção «Partes» em árvore (`SecaoDePartes`): cada parte com o nome (abre a página dela), «SKC» se é sua e os
 *   objetos dela, já somados os das partes de baixo; do segundo nível para baixo, recuada e começando por «└»;
 * - na parte, o caminho acima do título (`CaminhoDoSitio`), do todo mais alto ao próprio sítio (sem link);
 * - a caixa «Marcar como parte de…» (`MarcarComoParte`), no lugar, com o campo de sítio em árvore (`opcoesDeTodo`) e a linha
 *   que explica o que ele não oferece (`avisoDoTodo`): as partes do próprio sítio e os sítios mesclados em outro.
 * «Não é parte de outro» (a página) solta na hora; o «Desfazer» grava de volta o `parteDe` de antes (`campoEscrito`).
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { CampoDeEscolha, dobrar, type OpcaoDeEscolha } from '../objetos-skc/CampoDeEscolha'
import { numeroPtBr } from '../ui/numero'
import { useOpcoesDeSitio, type OpcaoDeSitio } from './doUsuario'
import type { SobreOsSitios } from './Mesclar'
import { eSitioSkc } from './modelo'
import { marcarComoParte } from './operacoes'
import { podeSerParte, type Resolucao } from './resolucao'
import './Mesclar.css'

const objetos = (n: number) => `${numeroPtBr(n)} ${n === 1 ? 'objeto' : 'objetos'}`
const ERRO = 'Não foi possível guardar; tente de novo.'
const porNome = (nome: (id: string) => string) => (a: string, b: string) => nome(a).localeCompare(nome(b), 'pt')

/** As partes abaixo de `id`, em árvore: cada parte (irmãos em ordem alfabética do nome) seguida das dela; `nivel` 1 = direta. */
export function arvoreDasPartes(r: Resolucao, id: string, nome: (id: string) => string): { id: string; nivel: number }[] {
  const saida: { id: string; nivel: number }[] = []
  const descer = (x: string, nivel: number) => {
    for (const p of r.partes(x).sort(porNome(nome))) {
      saida.push({ id: p, nivel })
      descer(p, nivel + 1)
    }
  }
  descer(r.destino(id), 1)
  return saida
}

/**
 * As opções do campo «… é parte de qual sítio?» para o texto digitado (2 letras ou mais), em árvore: um sítio aparece se o nome,
 * o nome do livro ou uma grafia casa com o texto, e as partes de um sítio cujo nome casa vêm junto, recuadas sob ele (uma parte
 * também se escolhe). A parte cujo todo não está na lista vem sem recuo. Fora: o próprio sítio, os descendentes dele e o que não
 * pode ser todo (`podeSerParte`); os absorvidos e os excluídos já não estão em `opcoes` (`opcoesDeSitio`, em ordem alfabética).
 * Apoio de um sítio de cima: «Região Teste · SKC · Tell Exemplo · 12 objetos» (a região, «SKC» se é seu, a grafia que casou,
 * os objetos); de uma parte: «parte de Tell Teste · SKC» (com a grafia que casou, se foi por ela).
 * `limite` conta só as linhas de cima (cada uma com as partes que vêm junto): um todo com muitas partes não tira da lista os
 * outros sítios que casam.
 */
export function opcoesDeTodo(r: Resolucao, parte: string, opcoes: readonly OpcaoDeSitio[], texto: string, limite = 6): OpcaoDeEscolha[] {
  const d = dobrar(texto.trim())
  if (d.length < 2) return []
  const fora = new Set([r.canonico(parte), ...r.descendentes(parte)])
  const validas = opcoes.filter((o) => !fora.has(o.id) && podeSerParte(r, parte, o.id) === null)
  const porId = new Map(validas.map((o) => [o.id, o]))
  const nomeDe = (id: string) => porId.get(id)?.nome ?? opcoes.find((o) => o.id === id)?.nome ?? id
  const casaONome = (o: OpcaoDeSitio) => dobrar(o.nome).includes(d)
  const grafiaQueCasou = (o: OpcaoDeSitio) => (casaONome(o) ? null : ([o.nomeDoLivro, ...o.grafias].find((g) => g && dobrar(g).includes(d)) ?? null))
  // vem junto: o nome casa, ou o de um todo acima dele (entre os que se oferecem)
  const vemJunto = (id: string): boolean => {
    for (let t = r.todo(id); t !== null && porId.has(t); t = r.todo(t)) if (casaONome(porId.get(t)!)) return true
    return false
  }
  const mostradas = validas.filter((o) => casaONome(o) || grafiaQueCasou(o) !== null || vemJunto(o.id))
  const mostradasIds = new Set(mostradas.map((o) => o.id))
  const filhos = new Map<string, OpcaoDeSitio[]>()
  const raizes: OpcaoDeSitio[] = []
  for (const o of mostradas) {
    const t = r.todo(o.id)
    if (t !== null && mostradasIds.has(t)) filhos.set(t, [...(filhos.get(t) ?? []), o])
    else raizes.push(o)
  }
  const saida: OpcaoDeEscolha[] = []
  const descer = (o: OpcaoDeSitio, nivel: number) => {
    const t = r.todo(o.id)
    const grafia = grafiaQueCasou(o)
    const apoio =
      t !== null
        ? [`parte de ${nomeDe(t)}`, o.doUsuario ? 'SKC' : null, grafia]
        : [o.regiao, o.doUsuario ? 'SKC' : null, grafia, objetos(o.objetos)]
    saida.push({ id: o.id, rotulo: o.nome, apoio: apoio.filter(Boolean).join(' · '), ...(nivel > 0 ? { nivel } : {}) })
    for (const f of filhos.get(o.id) ?? []) descer(f, nivel + 1)
  }
  for (const o of raizes.slice(0, limite)) descer(o, 0)
  return saida
}

/**
 * A linha que explica, no topo da lista, o que o campo não oferece para o texto digitado: uma parte do próprio sítio (em
 * qualquer nível) cujo nome casa — «Túmulo T-1 é parte de Área Teste BB: um sítio não pode ser parte de uma parte dele.» —, ou
 * um sítio mesclado em outro cujo nome casa e o do destino não — «Tell Exemplo foi mesclado em Tell Teste e não é mais um sítio
 * à parte: não pode ser parte de outro nem ter partes. Escolha Tell Teste.» (o destino aparece na lista pela grafia). Um
 * mesclado no próprio sítio ou numa parte dele não manda escolher o que não se oferece. Nada: null.
 */
export function avisoDoTodo(r: Resolucao, parte: string, texto: string, nome: (id: string) => string): string | null {
  const d = dobrar(texto.trim())
  if (d.length < 2) return null
  const casa = (id: string) => dobrar(nome(id)).includes(d)
  const descendentes = arvoreDasPartes(r, parte, nome).map((x) => x.id)
  const presa = descendentes.find(casa)
  if (presa !== undefined) return `${nome(presa)} é parte de ${nome(r.todo(presa) ?? parte)}: um sítio não pode ser parte de uma parte dele.`
  const fora = new Set([r.canonico(parte), ...descendentes])
  const mesclado = r.sitios.find((x) => {
    const destino = r.destino(x)
    return destino !== x && !fora.has(destino) && casa(x) && !casa(destino)
  })
  if (mesclado === undefined) return null
  const destino = nome(r.destino(mesclado))
  return `${nome(mesclado)} foi mesclado em ${destino} e não é mais um sítio à parte: não pode ser parte de outro nem ter partes. Escolha ${destino}.`
}

/**
 * Por que o sítio escolhido não pode mais ser o todo, quando isso mudou entre a escolha e «Marcar como parte» (outro aparelho
 * sincronizou, outra aba): os textos das explicações do campo e, para o que elas não cobrem, um texto proposto.
 */
export function textoDaRecusa(r: Resolucao, parte: string, todo: string, motivo: 'mesmo' | 'excluido' | 'mesclado' | 'descendente', nome: (id: string) => string): string {
  if (motivo === 'descendente') return `${nome(todo)} é parte de ${nome(r.todo(todo) ?? parte)}: um sítio não pode ser parte de uma parte dele.`
  if (motivo === 'mesclado' && r.destino(todo) !== r.canonico(todo)) {
    const destino = nome(r.destino(todo))
    return `${nome(todo)} foi mesclado em ${destino} e não é mais um sítio à parte: não pode ser parte de outro nem ter partes. Escolha ${destino}.`
  }
  if (motivo === 'excluido') return `${nome(todo)} foi excluído; escolha outro sítio.`
  return `${nome(todo)} e ${nome(parte)} agora são um só; escolha outro sítio.`
}

// ------------------------------------------------------------------------------------------------------------ as telas

/** O caminho acima do título de uma parte: «Tell Teste › Área Teste BB › Túmulo T-1» (cada nível abre a página dele). */
export function CaminhoDoSitio({ id, sobre }: { id: string; sobre: SobreOsSitios }) {
  const caminho = sobre.resolucao.caminho(id)
  if (caminho.length === 0) return null
  return (
    <nav className="sitio-caminho" aria-label="Caminho">
      {caminho.map((x) => (
        <Fragment key={x}>
          <Link to={`/sitio/${encodeURIComponent(x)}`}>{sobre.nome(x)}</Link>
          <span className="sitio-caminho-sep" aria-hidden="true">
            ›
          </span>
        </Fragment>
      ))}
      <span aria-current="page">{sobre.nome(id)}</span>
    </nav>
  )
}

/**
 * A seção «Partes» do todo: quantas são (todos os níveis) e a árvore, uma lista dentro da outra. `objetosEm(p)` = os objetos da
 * grade da página que vêm da parte `p` ou das partes abaixo dela.
 */
export function SecaoDePartes({ id, sobre, objetosEm }: { id: string; sobre: SobreOsSitios; objetosEm: (parte: string) => number }) {
  const r = sobre.resolucao
  const total = r.descendentes(id).length
  if (total === 0) return null
  const ordem = porNome(sobre.nome)
  const ramo = (x: string, nivel: number) => {
    const partes = r.partes(x).sort(ordem)
    if (partes.length === 0) return null
    return (
      <ul className="sitio-partes">
        {partes.map((p) => (
          <li key={p}>
            <div className="sitio-parte" data-nivel={Math.min(nivel, 6)}>
              <span className="sitio-parte-nome">
                {nivel > 1 && (
                  <span className="sitio-parte-ramo" aria-hidden="true">
                    └
                  </span>
                )}
                <Link to={`/sitio/${encodeURIComponent(p)}`}>{sobre.nome(p)}</Link>
                {eSitioSkc(p) && <span className="marca-skc">SKC</span>}
              </span>
              <span className="codigo sitio-parte-n">{objetos(objetosEm(p))}</span>
            </div>
            {ramo(p, nivel + 1)}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <section className="detalhe-secao" aria-label="Partes">
      <div className="detalhe-secao-topo">
        <h2>Partes</h2>
        <span className="codigo">{numeroPtBr(total)}</span>
      </div>
      {ramo(id, 1)}
    </section>
  )
}

/**
 * A caixa «Marcar como parte de…», no lugar (sem janela por cima): o campo «Khirbet Modelo é parte de qual sítio?» (o foco
 * começa nele), «Cancelar» e «Marcar como parte», que só se habilita com uma opção escolhida e grava `parteDe`. Num sítio que
 * já é parte, a mesma caixa muda de qual sítio ele é parte.
 */
export function MarcarComoParte({ id, sobre, aoFechar }: { id: string; sobre: SobreOsSitios; aoFechar: () => void }) {
  const sitios = useOpcoesDeSitio()
  const [texto, setTexto] = useState('')
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [gravando, setGravando] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const [recusa, setRecusa] = useState<string | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const r = sobre.resolucao
  const pergunta = `${sobre.nome(id)} é parte de qual sítio?`
  const opcoes = useMemo(() => opcoesDeTodo(r, id, sitios, texto), [r, id, sitios, texto])
  const aviso = useCallback((t: string) => avisoDoTodo(r, id, t, sobre.nome), [r, id, sobre])
  // O campo de escolha abre com o foco nele.
  useEffect(() => caixa.current?.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus(), [])
  const marcar = () => {
    if (escolhido === null) return
    // A árvore pode ter mudado depois da escolha (outro aparelho, outra aba): não grava, e diz por quê.
    const motivo = podeSerParte(r, id, escolhido)
    if (motivo !== null) {
      setRecusa(textoDaRecusa(r, id, escolhido, motivo, sobre.nome))
      setEscolhido(null)
      return
    }
    setRecusa(null)
    setFalhou(false)
    setGravando(true)
    marcarComoParte(id, escolhido).then(aoFechar, () => {
      setGravando(false)
      setFalhou(true)
    })
  }
  return (
    <div ref={caixa} role="group" aria-label={pergunta} className="sitio-confirmar sitio-mesclar">
      <CampoDeEscolha
        rotulo={pergunta}
        valor={texto}
        aoMudarTexto={(t) => {
          setTexto(t)
          setEscolhido(null)
          setRecusa(null)
        }}
        opcoes={opcoes}
        filtradas
        limite={opcoes.length}
        aoEscolher={(o) => {
          setTexto(o.rotulo)
          setEscolhido(o.id)
        }}
        aviso={aviso}
      />
      {(falhou || recusa) && (
        <p className="form-erro" role="alert">
          {recusa ?? ERRO}
        </p>
      )}
      <div className="sitio-confirmar-botoes">
        <button type="button" className="form-botao" onClick={aoFechar}>
          Cancelar
        </button>
        <button type="button" className="form-botao form-botao-forte" disabled={escolhido === null || gravando} onClick={marcar}>
          Marcar como parte
        </button>
      </div>
    </div>
  )
}
