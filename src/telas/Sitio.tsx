import { useRef } from 'react'
import { sitio } from '../banco/consultas'
import { caminhoDaBusca } from '../busca/url'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { useCarregar } from '../ui/useCarregar'
import { AvisoDeCopia, useCopiar } from '../ui/useCopiar'
import { numeroPtBr } from '../ui/usePendencias'
import { coordenadaEmGraus, enderecoDoMapa } from './coordenada'
import { CabecalhoDoDetalhe, ErroNoDetalhe, Linha, MolduraDoDetalhe, NaoEncontrado, SecaoDeObjetos } from './detalhe'
import './Lista.css'

const METODO = { grid: 'Calculada da grade impressa', gazetteer: 'Gazetteer' } as const
const ehLink = (texto: string) => /^https?:\/\/\S+$/.test(texto)

interface Props {
  id: string
  /** Celular: a página inteira do sítio. Computador: o painel à direita da lista. */
  pagina: boolean
  voltarPara: string
  computador: boolean
}

/**
 * O Sítio (Sitio.dc.html no celular, o painel de PC-Sitio.dc.html no computador), só leitura: o nome, a
 * região, a coordenada com a fonte, "abrir no mapa" (link externo ao OpenStreetMap, sem mapa dentro do app)
 * e os objetos achados lá. Corrigir e escolher no mapa são da 2B.
 */
export function Sitio({ id, pagina, voltarPara, computador }: Props) {
  const carga = useCarregar(() => sitio(id), id)
  const blocoRef = useRef<HTMLElement>(null)
  const { aviso, copiar } = useCopiar(blocoRef)
  const voltar = { href: `#${voltarPara}`, rotulo: 'Voltar aos sítios' }

  if (carga.fase === 'carregando') return <div className={pagina ? 'detalhe-pagina' : 'detalhe'} aria-busy="true" />
  if (carga.fase === 'erro') return <ErroNoDetalhe pagina={pagina} voltar={voltar} erro={carga.erro} />
  const s = carga.dados
  if (s === null) return <NaoEncontrado pagina={pagina} voltar={voltar} titulo="Sítio não encontrado" destino="/sitios" rotuloDoDestino="Ver os sítios" />

  const temCoordenada = s.lat !== null && s.lon !== null
  const mapa = temCoordenada ? enderecoDoMapa(s.lat!, s.lon!) : null
  const copia = [s.nome, temCoordenada ? coordenadaEmGraus(s.lat!, s.lon!, 5) : null].filter(Boolean).join(' · ')

  const acoes = (
    <>
      <IconButton icon="buscar" label="Buscar objetos deste sítio" href={`#${caminhoDaBusca(s.nome, { escopo: 'local' })}`} />
      <IconButton icon="copiar" label="Copiar referência" onClick={() => void copiar(copia)} />
    </>
  )

  return (
    <MolduraDoDetalhe pagina={pagina} voltar={voltar} acoes={acoes}>
      <CabecalhoDoDetalhe
        pagina={pagina}
        etiqueta={s.regiao ? `Sítio · ${s.regiao.nome}` : 'Sítio'}
        titulo={s.nome}
        codigo={`${s.glId ?? s.id} · ${numeroPtBr(s.objetos.length)} ${s.objetos.length === 1 ? 'objeto' : 'objetos'}`}
        acoes={acoes}
      />
      <AvisoDeCopia aviso={aviso} />

      {mapa && (
        <div className="detalhe-fila">
          <a className="detalhe-botao" href={mapa} target="_blank" rel="noopener noreferrer">
            Abrir no mapa
            <Icon name="mapa" size={18} />
          </a>
        </div>
      )}

      <section className="detalhe-bloco" aria-label="Dados do sítio" ref={blocoRef}>
        <dl className="detalhe-dl">
          <Linha rotulo="Nome">
            {s.nome}
            {s.literal !== s.nome && <small className="lista-sub">{` · como impresso: ${s.literal}`}</small>}
          </Linha>
          <Linha rotulo="Região" vazio={!s.regiao}>
            {s.regiao?.nome}
          </Linha>
          <Linha rotulo="No livro" lang="de" vazio={!s.nota}>
            {s.nota}
          </Linha>
        </dl>
      </section>

      <section className="detalhe-bloco" aria-label="Coordenada">
        {temCoordenada ? (
          <dl className="detalhe-dl">
            <Linha rotulo="Coordenada">
              <span className="codigo detalhe-coordenada">{coordenadaEmGraus(s.lat!, s.lon!, 5)}</span>
            </Linha>
            <Linha rotulo="Método" vazio={!s.metodo}>
              {s.metodo ? METODO[s.metodo] : null}
            </Linha>
            <Linha rotulo="Grade" vazio={!s.gradeRef}>
              <span className="codigo">{s.gradeRef}</span>
            </Linha>
            <Linha rotulo="Fonte" vazio={!s.fonteDaCoordenada}>
              {s.fonteDaCoordenada && ehLink(s.fonteDaCoordenada) ? (
                <a href={s.fonteDaCoordenada} target="_blank" rel="noopener noreferrer">
                  {s.fonteDaCoordenada}
                </a>
              ) : (
                s.fonteDaCoordenada
              )}
            </Linha>
            <Linha rotulo="Nota" vazio={!s.notaDaCoordenada}>
              {s.notaDaCoordenada}
            </Linha>
          </dl>
        ) : (
          <p className="detalhe-vazio">sem coordenada</p>
        )}
      </section>

      <SecaoDeObjetos rotulo="Objetos deste sítio" titulo="Objetos" objetos={s.objetos} computador={computador} />
    </MolduraDoDetalhe>
  )
}
