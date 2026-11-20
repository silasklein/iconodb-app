/**
 * O mapa do app sob a linha «Mapa» da leitura (desenho «O IPIAO lido no formato do §», § 9; decisão 94): o pacote guarda só o
 * título do mapa impresso; aqui vão os sítios de achado das entradas da parte do livro que a legenda abre (`LinhaDaLeitura.mapa`).
 *
 * O sítio de cada entrada é o mesmo que o objeto mostra: o do livro ou o trocado pela pessoa (`useSitiosVivos().doResumo`, como a
 * faixa das figuras citadas), levado ao destino quando foi mesclado; o nome, a coordenada e a contagem são os da lista dos Sítios
 * (`useSitiosDaLista`, com as correções e os sítios novos; a lista do pacote é lida uma vez por pacote: `listaDosSitiosDoPacote`).
 * Só os sítios com coordenada viram ponto; os outros contam à parte (`sitiosDasEntradas` e `contarSitios`, a mesma conta do
 * scripts/conferir-leitura.ts). O toque num ponto abre o cartão do sítio, como nos Sítios. O componente do mapa (e o JSON dele)
 * só é baixado quando este mapa aparece (decisão 36).
 *
 * Os atalhos do mapa (+ − 0 r…, e o Esc do cartão) valem só enquanto o mapa está à vista ou tem o foco (revisão da Tarefa 1,
 * m2): na página de leitura, o texto em volta é o que se lê, e o mapa rolado para fora não toma as teclas. O cartão aberto não
 * conta: ele fica dentro do mapa e sai da vista com ele (fix 1 da Tarefa 2).
 */
import { lazy, Suspense, useEffect, useId, useMemo, useState, type CSSProperties, type FocusEvent } from 'react'
import { resumosDosItens } from '../banco/consultas'
import { useSitiosVivos } from '../sitios/doUsuario'
import { agruparPontos, type SitioNoMapa } from '../sitios/mapa'
import { listaDosSitiosDoPacote } from '../sitios/pacote'
import { useSitiosDaLista } from '../sitios/sitiosDaLista'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { numeroPtBr } from '../ui/numero'
import { useCarregar } from '../ui/useCarregar'
import { contarSitios, sitiosDasEntradas } from './mapasDoLivro'

const Mapa = lazy(() => import('../sitios/Mapa'))

const SEM_DESTAQUE: ReadonlySet<string> = new Set()

interface Props {
  /** As entradas do mapa (itemIds), as da parte do livro que a legenda abre. */
  entradas: readonly string[]
  computador: boolean
  /** No computador, o lugar na grade das línguas (a linha logo abaixo da legenda, na largura das colunas). */
  estilo?: CSSProperties
}

/** «Mapa do app: 2 sítios das entradas desta parte · 1 sem coordenada». */
export function textoDoMapa(comCoordenada: number, semCoordenada: number): string {
  const sitiosNoMapa = `${numeroPtBr(comCoordenada)} ${comCoordenada === 1 ? 'sítio' : 'sítios'}`
  return `Mapa do app: ${sitiosNoMapa} das entradas desta parte${semCoordenada > 0 ? ` · ${numeroPtBr(semCoordenada)} sem coordenada` : ''}`
}

/** O elemento está à vista (IntersectionObserver)? Sem o observador (navegador antigo), sempre, como nos Sítios. */
function useAVista(el: Element | null): boolean {
  const [aVista, setAVista] = useState(false)
  useEffect(() => {
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setAVista(true)
      return
    }
    const observador = new IntersectionObserver((entradas) => {
      const ultima = entradas.at(-1)
      if (ultima) setAVista(ultima.isIntersecting)
    })
    observador.observe(el)
    return () => observador.disconnect()
  }, [el])
  return aVista
}

export function MapaDaLegenda({ entradas, computador, estilo }: Props) {
  const idDoTexto = useId()
  const chave = entradas.join('\n')
  const carga = useCarregar(() => Promise.all([resumosDosItens(entradas, 'dada'), listaDosSitiosDoPacote()]), chave)
  const lista = carga.fase === 'ok' ? carga.dados[1] : null
  const { juntos, daLista } = useSitiosDaLista(lista)
  const vivos = useSitiosVivos(false)
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [destaque, setDestaque] = useState<ReadonlySet<string>>(SEM_DESTAQUE)
  const [regioesAtivas, setRegioesAtivas] = useState<ReadonlySet<string>>(SEM_DESTAQUE)
  const [secao, setSecao] = useState<HTMLElement | null>(null)
  const aVista = useAVista(secao)
  const [comFoco, setComFoco] = useState(false)

  // os sítios das entradas, um por destino, na ordem das entradas (a mesma conta da conferência: scripts/conferir-leitura.ts)
  const sitiosDoMapa = useMemo(() => {
    if (carga.fase !== 'ok' || !juntos) return null
    return sitiosDasEntradas(
      carga.dados[0].map((r) => vivos.doResumo(r).id),
      juntos.itens,
      daLista?.destinos,
    )
  }, [carga, juntos, daLista, vivos])

  const pontos = useMemo(
    () =>
      agruparPontos(
        (sitiosDoMapa ?? [])
          .filter((s) => s.lat !== null && s.lon !== null)
          .map((s): SitioNoMapa => ({ id: s.id, nome: s.nome, lat: s.lat!, lon: s.lon!, objetos: s.objetos, regiao: s.regiaoGeo, doUsuario: s.doUsuario })),
      ),
    [sitiosDoMapa],
  )

  if (carga.fase === 'erro')
    return (
      <div className="ler-mapa" style={estilo}>
        <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />
      </div>
    )
  if (!sitiosDoMapa)
    return (
      <div className="ler-mapa" style={estilo}>
        <p className="ler-mapa-texto" role="status">
          Carregando o mapa…
        </p>
      </div>
    )

  const { comCoordenada, semCoordenada } = contarSitios(sitiosDoMapa)
  const alternarRegiao = (id: string) =>
    setRegioesAtivas((atual) => {
      const novo = new Set(atual)
      if (!novo.delete(id)) novo.add(id)
      return novo
    })
  const aoSairOFoco = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setComFoco(false)
  }
  return (
    <section ref={setSecao} className="ler-mapa" aria-labelledby={idDoTexto} style={estilo} onFocus={() => setComFoco(true)} onBlur={aoSairOFoco}>
      <p className="ler-mapa-texto" id={idDoTexto} lang="pt-BR">
        {textoDoMapa(comCoordenada, semCoordenada)}
      </p>
      {pontos.length > 0 && (
        <div className="ler-mapa-palco">
          <Suspense
            fallback={
              <p className="ler-mapa-texto" role="status">
                Carregando o mapa…
              </p>
            }
          >
            <Mapa
              pontos={pontos}
              selecionada={selecionada}
              aoSelecionar={setSelecionada}
              destaque={destaque}
              aoDestacar={(ids) => setDestaque(ids ?? SEM_DESTAQUE)}
              foco={null}
              regioesAtivas={regioesAtivas}
              aoAlternarRegiao={alternarRegiao}
              computador={computador}
              assinatura={chave}
              atalhosAtivos={aVista || comFoco}
            />
          </Suspense>
        </div>
      )}
    </section>
  )
}
