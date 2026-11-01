import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { sitios, type SitioResumo } from '../banco/consultas'
import { fold, tabelaDoPacote } from '../busca/fold'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { CampoDeFiltro } from '../ui/CampoDeFiltro'
import { Icon } from '../ui/Icon'
import { ListaEDetalhe } from '../ui/ListaEDetalhe'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { numeroPtBr } from '../ui/usePendencias'
import '../ui/Tooltip.css'
import { coordenadaEmGraus, enderecoDoMapa } from './coordenada'
import { agrupar, filtrar, indexar, inicialDe, type Entrada, type Grupo } from './lista'
import { Sitio } from './Sitio'
import './Lista.css'

const SEM_REGIAO = 'Sem região'

async function carregar() {
  const [lista, tabela] = await Promise.all([sitios(), tabelaDoPacote()])
  const entradas = indexar(
    lista,
    tabela,
    (s) => s.nome,
    (s) => [s.nome, s.literal, s.id].join(' '),
  )
  const comRegiao = lista.some((s) => s.regiao !== null)
  return { entradas, tabela, comRegiao, comCoordenada: lista.filter((s) => s.lat !== null && s.lon !== null).length }
}

type Entradas = Entrada<SitioResumo>[]

/**
 * Os grupos da lista (R18). Não há coluna de região nos sítios: a região é o verbete-pai do verbete que dá nome
 * ao sítio. Quando o pacote tem regiões, um grupo por região (os sem região no fim); senão uma lista só,
 * alfabética, com cabeçalho por letra.
 */
function gruposDa(entradas: Entradas, comRegiao: boolean, tabela: Parameters<typeof fold>[1]): (Grupo<SitioResumo> & { regiao: boolean })[] {
  if (!comRegiao) return agrupar(entradas, (e) => inicialDe(e.ordem)).map((g) => ({ ...g, regiao: false }))
  const porRegiao = new Map<string, Entradas>()
  for (const e of entradas) {
    const nome = e.item.regiao?.nome ?? SEM_REGIAO
    porRegiao.set(nome, [...(porRegiao.get(nome) ?? []), e])
  }
  return [...porRegiao]
    .sort(([a], [b]) => (a === SEM_REGIAO ? 1 : b === SEM_REGIAO ? -1 : fold(a, tabela) < fold(b, tabela) ? -1 : 1))
    .map(([chave, es]) => ({ chave, entradas: es, regiao: true }))
}

const quantos = (n: number) => `${numeroPtBr(n)} ${n === 1 ? 'objeto' : 'objetos'}`

/** Uma linha da lista: o nome, a coordenada em graus e quantos objetos há lá; no celular, o link do mapa. */
const LinhaDoSitio = memo(function LinhaDoSitio({ s, atual, computador }: { s: SitioResumo; atual: boolean; computador: boolean }) {
  const comCoordenada = s.lat !== null && s.lon !== null
  return (
    <div className="sitio-linha">
      <Link className="lista-linha" to={`/sitio/${s.id}`} aria-current={atual ? 'page' : undefined} data-atual={atual ? '' : undefined}>
        <span className="lista-textos">
          <span className="lista-nome">{s.nome}</span>
          <span className="sitio-coord">{comCoordenada ? coordenadaEmGraus(s.lat!, s.lon!, 3) : 'sem coordenada'}</span>
        </span>
      </Link>
      <span className="lista-n" aria-label={quantos(s.objetos)}>
        {s.objetos}
      </span>
      {!computador && comCoordenada && (
        <a
          className="icon-button sitio-mapa"
          href={enderecoDoMapa(s.lat!, s.lon!)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Abrir ${s.nome} no mapa`}
          data-tip="Abrir no mapa (OpenStreetMap)"
        >
          <Icon name="mapa" />
        </a>
      )}
    </div>
  )
})

/**
 * Os Sítios (Sitios.dc.html no celular, PC-Sitio.dc.html no computador), só leitura. Também é a tela de
 * /sitio/:id: no computador a lista à esquerda e o sítio à direita, sem remontar a lista; no celular o sítio
 * ocupa a tela. "Novo sítio" e a correção da coordenada são da 2B.
 */
export function Sitios() {
  const { id } = useParams()
  const computador = useBreakpoint() === 'computador'
  const [texto, setTexto] = useState('')
  const consulta = useDeferredValue(texto)
  const carga = useCarregar(carregar)
  const rolagem = useRef<HTMLDivElement>(null)
  // No celular as regiões abrem e fecham; a primeira vem aberta, e quem busca vê tudo aberto.
  const [abertas, setAbertas] = useState<Record<string, boolean>>({})

  const dados = carga.fase === 'ok' ? carga.dados : null
  const visiveis = useMemo(() => (dados ? filtrar(dados.entradas, consulta, dados.tabela) : []), [dados, consulta])
  const grupos = useMemo(() => (dados ? gruposDa(visiveis, dados.comRegiao, dados.tabela) : []), [dados, visiveis])

  useEffect(() => {
    if (computador && id) rolagem.current?.querySelector('[data-atual]')?.scrollIntoView?.({ block: 'nearest' })
  }, [computador, id, dados])

  if (!computador && id) return <Sitio id={id} pagina voltarPara="/sitios" computador={false} />

  const total = dados?.entradas.length ?? 0
  const apoio = !dados
    ? ' '
    : consulta.trim()
      ? `${numeroPtBr(visiveis.length)} de ${numeroPtBr(total)} ${total === 1 ? 'sítio' : 'sítios'}`
      : `${numeroPtBr(total)} ${total === 1 ? 'sítio' : 'sítios'} · ${numeroPtBr(dados.comCoordenada)} com coordenada${dados.comRegiao ? ' · por região' : ''}`
  const buscando = consulta.trim() !== ''

  const lista = (
    <>
      <div className="lista-cabeca">
        <h1>Sítios</h1>
        <span className="lista-apoio">{apoio}</span>
      </div>
      <div className="lista-ferramentas">
        <CampoDeFiltro rotulo="Buscar sítio" placeholder="nome antigo ou moderno…" valor={texto} aoMudar={setTexto} />
      </div>
      {carga.fase === 'erro' && <AvisoDeErro erro={carga.erro} />}
      {dados && visiveis.length === 0 && <p className="lista-vazia">Nenhum sítio encontrado.</p>}
      {dados && visiveis.length > 0 && (
        <div className="lista-letras">
          {grupos.map((g, i) => {
            const linhas = g.entradas.map((e) => <LinhaDoSitio key={e.item.id} s={e.item} atual={e.item.id === id} computador={computador} />)
            if (g.regiao && !computador) {
              const aberta = buscando || (abertas[g.chave] ?? i === 0)
              return (
                <section key={g.chave}>
                  <h2 className="sitio-regiao-titulo">
                    <button type="button" className="sitio-regiao" aria-expanded={aberta} onClick={() => setAbertas((a) => ({ ...a, [g.chave]: !aberta }))}>
                      <span>
                        <strong>{g.chave}</strong>
                        <small>
                          {numeroPtBr(g.entradas.length)} {g.entradas.length === 1 ? 'sítio' : 'sítios'}
                        </small>
                      </span>
                      <Icon name={aberta ? 'recolher' : 'adicionar'} />
                    </button>
                  </h2>
                  {aberta && linhas}
                </section>
              )
            }
            return (
              <section key={g.chave} aria-label={g.regiao ? `Sítios de ${g.chave}` : `Sítios com ${g.chave}`}>
                <div className="lista-letra">
                  <h2>{g.chave}</h2>
                  <span>{g.regiao ? `${numeroPtBr(g.entradas.length)} ${g.entradas.length === 1 ? 'sítio' : 'sítios'}` : i === 0 ? 'objetos' : ''}</span>
                </div>
                {linhas}
              </section>
            )
          })}
        </div>
      )}
    </>
  )

  if (computador) {
    return (
      <ListaEDetalhe
        rotulo="Lista de sítios"
        lista={<div ref={rolagem}>{lista}</div>}
        detalhe={id ? <Sitio id={id} pagina={false} voltarPara="/sitios" computador /> : <p className="detalhe-vazio">Escolha um sítio na lista.</p>}
      />
    )
  }
  return (
    <div className="lista-pagina">
      <TopoDoCelular voltar={{ href: '#/' }} />
      <main className="lista-corpo">{lista}</main>
    </div>
  )
}
