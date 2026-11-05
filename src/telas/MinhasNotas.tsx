import { memo, useDeferredValue, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { tabelaDoPacote } from '../busca/fold'
import { alvosDosTextos, descreverAlvo, type AlvoResolvido } from '../notas/alvos'
import { filtrarNotas, agruparPorData, ehLigadaA, OPCOES_LIGADA, type LigadaA } from '../notas/filtroDeNotas'
import { cabecaDaNota, caminhoDaNota, resumoDaNota } from '../notas/formato'
import type { NotaVista } from '../notas/indiceDeNotas'
import { chaveDoAlvo, citacoesDe, textoSemLinks } from '../notas/links'
import { NotaPainel } from '../notas/NotaPainel'
import { useAlvosDe } from '../notas/useAlvos'
import { useIndiceDeNotas } from '../notas/useIndiceDeNotas'
import { CampoDeFiltro } from '../ui/CampoDeFiltro'
import { Contagem } from '../ui/Contagem'
import { ListaEDetalhe } from '../ui/ListaEDetalhe'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { useTema } from '../ui/useTema'
import { numeroPtBr } from '../ui/numero'
import { useFiltroNaUrl } from './useFiltroNaUrl'
import './Lista.css'
import '../notas/Notas.css'

/** Uma nota na lista: um só link para a nota (o texto sem a marcação dos links), com a que ela se liga. */
const LinhaDaNota = memo(function LinhaDaNota({ nota, atual, resolvidos, busca }: { nota: NotaVista; atual: boolean; resolvidos: ReadonlyMap<string, AlvoResolvido>; busca: string }) {
  const dono = nota.alvoTipo && nota.alvo ? descreverAlvo(nota.alvoTipo, nota.alvo, resolvidos.get(chaveDoAlvo(nota.alvoTipo, nota.alvo))) : null
  // Cada alvo pelo nome que a pessoa escreveu no link; sem ele, pelo nome que o alvo tem.
  const citados = citacoesDe(nota.texto).map((c) => c.rotulo ?? descreverAlvo(c.tipo, c.ref, resolvidos.get(chaveDoAlvo(c.tipo, c.ref))))
  return (
    <Link className="nota-da-lista" to={{ pathname: caminhoDaNota(nota.id), search: busca }} aria-current={atual ? 'page' : undefined} data-atual={atual ? '' : undefined}>
      <span className="nota-da-lista-cabeca codigo">{[cabecaDaNota(nota), dono && `em ${dono}`].filter(Boolean).join(' · ')}</span>
      <span className="nota-da-lista-texto">{resumoDaNota(textoSemLinks(nota.texto))}</span>
      {citados.length > 0 && <span className="nota-da-lista-liga">Ligada a {[...new Set(citados)].join(', ')}</span>}
    </Link>
  )
})

/**
 * Minhas notas (MinhasNotas.dc.html no celular, PC-Notas.dc.html no computador) e a tela de /nota/:id: as notas SKC por
 * data, a mais recente primeiro, com a busca (texto dobrado) e o filtro "Ligada a". No computador a lista e a nota
 * lado a lado; no celular a nota abre numa tela só dela.
 */
export function MinhasNotas() {
  const { id } = useParams()
  const computador = useBreakpoint() === 'computador'
  useTema(!computador && id ? 'item' : 'consulta')
  const [params] = useSearchParams()
  const [texto, setTexto] = useFiltroNaUrl()
  const consulta = useDeferredValue(texto)
  const ligada: LigadaA = ehLigadaA(params.get('ligada')) ? (params.get('ligada') as LigadaA) : ''
  const indice = useIndiceDeNotas()
  const tabela = useCarregar(() => tabelaDoPacote())
  const busca = useMemo(() => {
    const p = new URLSearchParams()
    if (texto) p.set('filtro', texto)
    if (ligada) p.set('ligada', ligada)
    const q = p.toString()
    return q ? `?${q}` : ''
  }, [texto, ligada])

  const visiveis = useMemo(
    () => (tabela.fase === 'ok' ? filtrarNotas(indice.todas, { consulta, ligada }, tabela.dados) : consulta.trim() || ligada ? [] : indice.todas),
    [indice, consulta, ligada, tabela],
  )
  const grupos = useMemo(() => agruparPorData(visiveis), [visiveis])
  const resolvidos = useAlvosDe(
    useMemo(() => {
      const todos = visiveis.flatMap((n) => [...alvosDosTextos([n.texto]), ...(n.alvoTipo && n.alvo ? [{ tipo: n.alvoTipo, ref: n.alvo }] : [])])
      return [...new Map(todos.map((a) => [chaveDoAlvo(a.tipo, a.ref), a])).values()]
    }, [visiveis]),
  )

  if (!computador && id) return <NotaPainel id={id} pagina />

  const aberta = id && id !== 'nova' ? indice.porId.get(id) : undefined
  const total = indice.todas.length
  const filtrando = !!(consulta.trim() || ligada)
  const apoio = filtrando ? `${numeroPtBr(visiveis.length)} de ${numeroPtBr(total)} ${total === 1 ? 'nota' : 'notas'}` : 'SKC · por data, a mais recente primeiro'
  const limpar = () => setTexto('', { ligada: null })

  const lista = (
    <>
      <div className="lista-cabeca">
        <h1>Minhas notas</h1>
        <span className="lista-apoio">{apoio}</span>
      </div>
      {total > 0 && (
        <div className="lista-ferramentas notas-ferramentas">
          <CampoDeFiltro rotulo="Buscar nas notas" placeholder="buscar nas notas…" valor={texto} aoMudar={(t) => setTexto(t)} />
          <label className="notas-ligada">
            <span>Ligada a</span>
            <select value={ligada} onChange={(e) => setTexto(texto, { ligada: e.target.value || null })}>
              {OPCOES_LIGADA.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {total === 0 && (
        <div className="lista-vazia">
          <p>Nenhuma nota ainda.</p>
          <p>Abra um objeto, um verbete, uma obra, um sítio ou um grupo e toque em «Escrever nota».</p>
        </div>
      )}
      {total > 0 && visiveis.length === 0 && (
        <div className="lista-vazia">
          <p>Nenhuma nota encontrada.</p>
          <button type="button" className="aviso-de-erro-tentar" onClick={limpar}>
            Limpar a busca e o filtro
          </button>
        </div>
      )}
      {grupos.map((g) => (
        <section key={g.data} className="notas-dia" aria-label={`Notas de ${g.data}`}>
          <div className="lista-letra">
            <h2>{g.data}</h2>
            <Contagem n={g.notas.length} um="nota" varios="notas" className="codigo" />
          </div>
          {g.notas.map((n) => (
            <LinhaDaNota key={n.id} nota={n} atual={n.id === id} resolvidos={resolvidos} busca={busca} />
          ))}
        </section>
      ))}
    </>
  )

  if (computador) {
    return (
      <ListaEDetalhe
        rotulo="Lista de notas"
        chave={id}
        anuncio={aberta ? cabecaDaNota(aberta) : undefined}
        lista={lista}
        detalhe={id ? <NotaPainel id={id} pagina={false} /> : total === 0 ? null : <p className="detalhe-vazio">Escolha uma nota na lista.</p>}
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
