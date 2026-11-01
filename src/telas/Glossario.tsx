import { memo, useDeferredValue, useEffect, useMemo, useRef } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { verbetes, type VerbeteDaLista } from '../banco/consultas'
import { tabelaDoPacote } from '../busca/fold'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { Contagem } from '../ui/Contagem'
import { CampoDeFiltro } from '../ui/CampoDeFiltro'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { ListaEDetalhe } from '../ui/ListaEDetalhe'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { numeroPtBr } from '../ui/usePendencias'
import { agrupar, filtrar, indexar, inicialDe, type Entrada } from './lista'
import { useFiltroNaUrl } from './useFiltroNaUrl'
import { Verbete } from './Verbete'
import './Lista.css'

/** As abas são só por tipo; o tipo do banco (concept, name, technical) vira o nome da aba e o valor de ?tipo=. */
const TIPOS = [
  { valor: 'conceitos', rotulo: 'Conceitos', tipo: 'concept' },
  { valor: 'nomes', rotulo: 'Nomes', tipo: 'name' },
  { valor: 'tecnicos', rotulo: 'Técnicos', tipo: 'technical' },
] as const

const plural = (n: number, um: string, varios: string) => `${numeroPtBr(n)} ${n === 1 ? um : varios}`

async function carregar() {
  const [lista, tabela] = await Promise.all([verbetes(), tabelaDoPacote()])
  const entradas = indexar(
    lista,
    tabela,
    (v) => v.pt ?? v.de ?? v.id,
    (v) => [v.pt, v.de, v.en, v.id].filter(Boolean).join(' '),
  )
  return { entradas, tabela, aprovados: lista.filter((v) => v.status === 'approved').length }
}

interface Linha {
  v: VerbeteDaLista
  atual: boolean
  /** "?tipo=…&revisar=1": o que a lista guarda ao abrir um verbete. */
  busca: string
}

/** Uma linha da lista. Memoizada: digitar no filtro só refaz as linhas que entram ou saem. */
const LinhaDoVerbete = memo(function LinhaDoVerbete({ v, atual, busca }: Linha) {
  return (
    <Link
      className="lista-linha glossario-linha"
      to={{ pathname: `/verbete/${v.id}`, search: busca }}
      aria-current={atual ? 'page' : undefined}
      data-atual={atual ? '' : undefined}
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
        {v.pt && v.de && (
          <span className="lista-sub" lang="de">
            {v.de}
          </span>
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
 * texto filtra a lista pela dobra do pacote ("mahras" acha "Maḥraṣ").
 */
export function Glossario() {
  const { id } = useParams()
  const computador = useBreakpoint() === 'computador'
  const { pathname } = useLocation()
  const [params, setParams] = useSearchParams()
  const tipo = TIPOS.find((t) => t.valor === params.get('tipo')) ?? null
  const revisar = params.get('revisar') === '1'
  const [texto, setTexto] = useFiltroNaUrl()
  const consulta = useDeferredValue(texto)
  const carga = useCarregar(carregar)
  const rolagem = useRef<HTMLDivElement>(null)

  /** O que acompanha o endereço de um verbete: o tipo e o filtro de estado (o texto fica só na lista). */
  const busca = useMemo(() => {
    const p = new URLSearchParams()
    if (tipo) p.set('tipo', tipo.valor)
    if (revisar) p.set('revisar', '1')
    const s = p.toString()
    return s ? `?${s}` : ''
  }, [tipo, revisar])

  const dados = carga.fase === 'ok' ? carga.dados : null
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
        <h1>Glossário</h1>
        <span className="lista-apoio">{resumo}</span>
      </div>

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
            to={{ pathname, search: `?tipo=${t.valor}${revisar ? '&revisar=1' : ''}` }}
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

      {carga.fase === 'erro' && <AvisoDeErro erro={carga.erro} />}
      {dados && visiveis.length === 0 && <p className="lista-vazia">Nenhum verbete encontrado.</p>}
      {dados && visiveis.length > 0 && (
        <div className="lista-letras">
          {letras.map((g, i) => (
            <section key={g.chave} aria-label={`Verbetes com ${g.chave}`}>
              <div className="lista-letra">
                <h2>{g.chave}</h2>
                {i === 0 && <span>objetos</span>}
              </div>
              {g.entradas.map((e: Entrada<VerbeteDaLista>) => (
                <LinhaDoVerbete key={e.item.id} v={e.item} atual={e.item.id === id} busca={busca} />
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
