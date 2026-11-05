import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { verbetes, type VerbeteDaLista } from '../banco/consultas'
import { tabelaDoPacote, type FoldTabela } from '../busca/fold'
import { useDuplicadosDoGlossario, useFormasEmUso, useObjetosPorVerbeteSkc, useEdicoesDosVerbetes, useVerbeteSkc, useVerbetesSkc } from '../glossario/doUsuario'
import { ROTULO_DO_STATUS, situacaoDoVerbete } from '../glossario/modelo'
import { restaurarVerbete } from '../glossario/operacoes'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { Contagem } from '../ui/Contagem'
import { CampoDeFiltro } from '../ui/CampoDeFiltro'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { ListaEDetalhe } from '../ui/ListaEDetalhe'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { numeroPtBr } from '../ui/numero'
import { agrupar, filtrar, indexar, inicialDe, type Entrada } from './lista'
import { useFiltroNaUrl } from './useFiltroNaUrl'
import { Verbete } from './Verbete'
import './Lista.css'
import '../imagens-usuario/MarcaSkc.css'
import '../glossario/Glossario.css'

/** As abas são só por tipo; o tipo do banco (concept, name, technical) vira o nome da aba e o valor de ?tipo=. */
const TIPOS = [
  { valor: 'conceitos', rotulo: 'Conceitos', tipo: 'concept' },
  { valor: 'nomes', rotulo: 'Nomes', tipo: 'name' },
  { valor: 'tecnicos', rotulo: 'Técnicos', tipo: 'technical' },
] as const

const plural = (n: number, um: string, varios: string) => `${numeroPtBr(n)} ${n === 1 ? um : varios}`

/**
 * Um verbete da lista: do pacote, ou do usuário (decisão 41: `skc`, sem tipo ainda; a forma em uso no lugar do `pt`, e a
 * contagem dos objetos com hipótese SKC nele).
 */
type VerbeteNaLista = Omit<VerbeteDaLista, 'tipo'> & {
  tipo: VerbeteDaLista['tipo'] | null
  skc: boolean
  /** A forma de antes, quando a pessoa mudou a forma em uso (Tarefa 11): não aparece, mas o filtro da lista a acha. */
  antes?: string | null
}

const indexarVerbetes = (lista: readonly VerbeteNaLista[], tabela: FoldTabela) =>
  indexar(
    lista,
    tabela,
    (v) => v.pt ?? v.de ?? v.id,
    (v) => [v.pt, v.antes, v.de, v.en, v.id].filter(Boolean).join(' '),
  )

async function carregar() {
  const [lista, tabela] = await Promise.all([verbetes(), tabelaDoPacote()])
  const entradas = indexarVerbetes(
    lista.map((v) => ({ ...v, skc: false })),
    tabela,
  )
  return { entradas, tabela }
}

const porOrdem = (x: Entrada<VerbeteNaLista>, y: Entrada<VerbeteNaLista>) => (x.ordem < y.ordem ? -1 : x.ordem > y.ordem ? 1 : 0)

interface Linha {
  v: VerbeteNaLista
  /** Um verbete do usuário que pode ser o mesmo termo que outro (dois aparelhos o criaram sem internet). */
  duplicado: boolean
  atual: boolean
  /** "?tipo=…&revisar=1": o que a lista guarda ao abrir um verbete. */
  busca: string
}

/** Uma linha da lista. Memoizada: digitar no filtro só refaz as linhas que entram ou saem. */
const LinhaDoVerbete = memo(function LinhaDoVerbete({ v, duplicado, atual, busca }: Linha) {
  return (
    <Link
      className="lista-linha glossario-linha"
      to={{ pathname: `/verbete/${encodeURIComponent(v.id)}`, search: busca }}
      aria-current={atual ? 'page' : undefined}
      data-atual={atual ? '' : undefined}
      data-verbete={v.id}
    >
      <span className="glossario-marca">
        {v.status === 'approved' && (
          <span role="img" aria-label="aprovado">
            <Icon name="confirmar" size={16} />
          </span>
        )}
      </span>
      <span className="lista-textos">
        <span className="lista-nome glossario-pt">{v.pt ?? v.de ?? v.id}</span>
        {v.skc ? (
          <span className="lista-sub glossario-skc">
            <span className="marca-skc">SKC</span> <span>{ROTULO_DO_STATUS[v.status]}</span>
            {duplicado && <span className="glossario-duplicado">possível duplicado</span>}
          </span>
        ) : (
          v.pt &&
          v.de && (
            <span className="lista-sub" lang="de">
              {v.de}
              {duplicado && (
                <span className="glossario-duplicado" lang="pt-BR">
                  possível duplicado
                </span>
              )}
            </span>
          )
        )}
      </span>
      <Contagem n={v.objetos} um="objeto" varios="objetos" />
    </Link>
  )
})

/**
 * O Glossário (Glossario.dc.html e GlossarioRevisar.dc.html no celular, PC-Glossario.dc.html no computador).
 * É também a tela de /verbete/:id: no computador a lista fica à esquerda e o verbete à direita, sem remontar
 * a lista; no celular o verbete ocupa a tela. As abas são por tipo; "a revisar" fica no ícone de filtro; o
 * texto filtra a lista pela dobra do pacote ("mahtes" acha "Maḥteṣ"). Os verbetes do usuário (decisão 41) entram na
 * ordem, com a marca SKC e o estado; ainda sem tipo, só aparecem em "Todos" (e em "a revisar").
 */
export function Glossario() {
  const { id } = useParams()
  const computador = useBreakpoint() === 'computador'
  const { pathname, state } = useLocation()
  const [params, setParams] = useSearchParams()
  const tipo = TIPOS.find((t) => t.valor === params.get('tipo')) ?? null
  const revisar = params.get('revisar') === '1'
  const [texto, setTexto] = useFiltroNaUrl()
  const consulta = useDeferredValue(texto)
  const carga = useCarregar(carregar)
  const rolagem = useRef<HTMLDivElement>(null)
  const doUsuario = useVerbetesSkc()
  const objetosDoUsuario = useObjetosPorVerbeteSkc()
  const formas = useFormasEmUso()
  const edicoes = useEdicoesDosVerbetes()
  const duplicados = useDuplicadosDoGlossario()
  // Quem acabou de excluir um verbete do usuário chega aqui com o aviso e o "Restaurar" (revisão 1, M4); some ao restaurar.
  const excluidoAgora = (state as { verbeteExcluido?: { id: string; nome: string } } | null)?.verbeteExcluido ?? null
  const aindaExcluido = useVerbeteSkc(excluidoAgora?.id ?? '')?.excluido === true
  const [falhouRestaurar, setFalhouRestaurar] = useState(false)
  const restaurarRef = useRef<HTMLButtonElement>(null)
  const tituloRef = useRef<HTMLHeadingElement>(null)
  // Depois de "Restaurar o verbete" o aviso some: o foco vai para a linha do verbete restaurado (ou, se a lista a esconde, para o título).
  const [restauradoEm, setRestauradoEm] = useState<string | null>(null)
  useEffect(() => {
    if (excluidoAgora && aindaExcluido) restaurarRef.current?.focus()
  }, [excluidoAgora, aindaExcluido])
  useEffect(() => {
    if (restauradoEm === null) return
    const linha = Array.from(document.querySelectorAll<HTMLElement>('[data-verbete]')).find((el) => el.getAttribute('data-verbete') === restauradoEm)
    ;(linha ?? tituloRef.current)?.focus()
    setRestauradoEm(null)
  }, [restauradoEm, aindaExcluido])

  /** O que acompanha o endereço de um verbete: o tipo e o filtro de estado (o texto fica só na lista). */
  const busca = useMemo(() => {
    const p = new URLSearchParams()
    if (tipo) p.set('tipo', tipo.valor)
    if (revisar) p.set('revisar', '1')
    const s = p.toString()
    return s ? `?${s}` : ''
  }, [tipo, revisar])

  const doPacote = carga.fase === 'ok' ? carga.dados : null
  const dados = useMemo(() => {
    if (!doPacote) return null
    // O que a pessoa fez nos verbetes do livro (Tarefa 11): a forma em uso no lugar do nome e o estado que ela deu. As linhas
    // mexidas são refeitas (o filtro acha a forma de agora e a do pacote); as outras seguem como vieram.
    // Revisão 2 (N2): um verbete do livro criado de um verbete do usuário soma os objetos das hipóteses SKC das origens (o
    // pacote não tem nenhum: as hipóteses ficam na camada); um que já era do livro conta só os do livro, como os outros.
    const mexidos = doPacote.entradas.filter((e) => formas.has(e.item.id) || edicoes.has(e.item.id) || objetosDoUsuario.has(e.item.id))
    const refeitos = indexarVerbetes(
      mexidos.map((e) => {
        const nova = formas.get(e.item.id)
        return {
          ...e.item,
          pt: nova ?? e.item.pt,
          antes: nova !== undefined ? e.item.pt : null,
          status: situacaoDoVerbete(edicoes.get(e.item.id) ?? null, e.item.pt ?? e.item.de ?? e.item.id, e.item.status).status,
          objetos: e.item.objetos + (objetosDoUsuario.get(e.item.id) ?? 0),
        }
      }),
      doPacote.tabela,
    )
    // Verbetes do usuário (decisão 41): a forma em uso no lugar do nome; a criada só para o filtro.
    const skc = indexarVerbetes(
      doUsuario.map((v) => ({ id: v.id, tipo: null, pt: v.emUso, antes: v.emUso === v.forma ? null : v.forma, de: null, en: null, status: v.status, objetos: objetosDoUsuario.get(v.id) ?? 0, skc: true })),
      doPacote.tabela,
    )
    const entradas = mexidos.length === 0 && skc.length === 0 ? doPacote.entradas : [...doPacote.entradas.filter((e) => !mexidos.includes(e)), ...refeitos, ...skc].sort(porOrdem)
    return { ...doPacote, entradas, aprovados: entradas.filter((e) => e.item.status === 'approved').length }
  }, [doPacote, doUsuario, objetosDoUsuario, formas, edicoes])
  const visiveis = useMemo(() => {
    if (!dados) return []
    const dosFiltros =
      tipo || revisar ? dados.entradas.filter((e) => (!tipo || e.item.tipo === tipo.tipo) && (!revisar || e.item.status === 'proposed')) : dados.entradas
    return filtrar(dosFiltros, consulta, dados.tabela)
  }, [dados, tipo, revisar, consulta])
  const escolhido = useMemo(() => {
    const v = id ? dados?.entradas.find((e) => e.item.id === id)?.item : undefined
    return v ? (v.pt ?? v.de ?? v.id) : undefined
  }, [dados, id])
  const letras = useMemo(() => agrupar(visiveis, (e) => inicialDe(e.ordem)), [visiveis])

  // No computador, abrir um verbete por link direto (ou pela Busca) leva a lista até ele.
  useEffect(() => {
    if (computador && id) rolagem.current?.querySelector('[data-atual]')?.scrollIntoView?.({ block: 'nearest' })
  }, [computador, id, dados])

  const mudar = (mudanca: Record<string, string | null>) =>
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual)
        for (const [chave, valor] of Object.entries(mudanca)) valor === null ? novo.delete(chave) : novo.set(chave, valor)
        return novo
      },
      { replace: true },
    )
  const limpar = () => setTexto('', { tipo: null, revisar: null })

  if (!computador && id) return <Verbete id={id} pagina voltarPara={`/glossario${busca}`} computador={false} />

  const total = dados?.entradas.length ?? 0
  const resumo = !dados
    ? ' '
    : revisar
      ? `${numeroPtBr(visiveis.length)} a revisar · de ${plural(total, 'verbete', 'verbetes')}`
      : tipo || consulta.trim()
        ? `${numeroPtBr(visiveis.length)} de ${plural(total, 'verbete', 'verbetes')}`
        : `${plural(total, 'verbete', 'verbetes')} · ${plural(dados.aprovados, 'aprovado', 'aprovados')}`

  const lista = (
    <>
      <div className="lista-cabeca">
        <h1 ref={tituloRef} tabIndex={-1}>
          Glossário
        </h1>
        <span className="lista-apoio">{resumo}</span>
      </div>

      {excluidoAgora && aindaExcluido && (
        <p role="status" aria-label="Verbete excluído" className="glossario-excluido">
          Verbete «{excluidoAgora.nome}» excluído.{' '}
          <button
            ref={restaurarRef}
            type="button"
            className="hit forma-desfazer"
            onClick={() => {
              setFalhouRestaurar(false)
              restaurarVerbete(excluidoAgora.id).then(() => setRestauradoEm(excluidoAgora.id), () => setFalhouRestaurar(true))
            }}
          >
            Restaurar o verbete
          </button>
          {falhouRestaurar && <span role="alert"> Não foi possível restaurar; tente de novo.</span>}
        </p>
      )}

      <div className="lista-ferramentas">
        <CampoDeFiltro rotulo="Buscar no glossário" placeholder={computador ? 'português, alemão ou inglês…' : 'pt, alemão ou inglês…'} valor={texto} aoMudar={setTexto} />
        {computador && <BotaoDeFiltro revisar={revisar} aoAlternar={() => mudar({ revisar: revisar ? null : '1' })} />}
      </div>

      <nav aria-label="Tipos" className="lista-abas">
        <Link className="hit" replace to={{ pathname, search: revisar ? '?revisar=1' : '' }} aria-current={tipo === null ? 'page' : undefined}>
          Todos
        </Link>
        {TIPOS.map((t) => (
          <Link
            key={t.valor}
            className="hit"
            replace
            to={{ pathname, search: `?tipo=${encodeURIComponent(t.valor)}${revisar ? '&revisar=1' : ''}` }}
            aria-current={tipo === t ? 'page' : undefined}
          >
            {t.rotulo}
          </Link>
        ))}
      </nav>

      {revisar && (
        <div className="lista-filtros">
          <button type="button" className="hit lista-filtro-etiqueta" aria-label="Tirar o filtro Estado: a revisar" onClick={() => mudar({ revisar: null })}>
            <span>
              <span>Estado:</span> a revisar
            </span>
            <Icon name="fechar" size={16} />
          </button>
          <button type="button" className="hit lista-limpar" onClick={limpar}>
            Limpar filtros
          </button>
        </div>
      )}

      {carga.fase === 'erro' && <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />}
      {dados && visiveis.length === 0 && <p className="lista-vazia">Nenhum verbete encontrado.</p>}
      {dados && visiveis.length > 0 && (
        <div className="lista-letras">
          {letras.map((g, i) => (
            <section key={g.chave} aria-label={`Verbetes com ${g.chave}`}>
              <div className="lista-letra">
                <h2>{g.chave}</h2>
                {i === 0 && <span>objetos</span>}
              </div>
              {g.entradas.map((e: Entrada<VerbeteNaLista>) => (
                <LinhaDoVerbete key={e.item.id} v={e.item} duplicado={duplicados.has(e.item.id)} atual={e.item.id === id} busca={busca} />
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  )

  if (computador) {
    return (
      <ListaEDetalhe
        rotulo="Lista de verbetes"
        chave={id}
        anuncio={escolhido}
        lista={<div ref={rolagem}>{lista}</div>}
        detalhe={id ? <Verbete id={id} pagina={false} voltarPara="/glossario" computador /> : <p className="detalhe-vazio">Escolha um verbete na lista.</p>}
      />
    )
  }
  return (
    <div className="lista-pagina">
      <TopoDoCelular voltar={{ href: '#/' }} busca={false} acoes={<BotaoDeFiltro revisar={revisar} aoAlternar={() => mudar({ revisar: revisar ? null : '1' })} />} />
      <main className="lista-corpo">{lista}</main>
    </div>
  )
}

function BotaoDeFiltro({ revisar, aoAlternar }: { revisar: boolean; aoAlternar: () => void }) {
  return <IconButton icon="filtro" label="Filtrar verbetes por estado: a revisar" pressionado={revisar} onClick={aoAlternar} />
}
