import { useRef } from 'react'
import { Link } from 'react-router'
import { verbete, type Verbete as VerbeteCompleto } from '../banco/consultas'
import { caminhoDaBusca } from '../busca/url'
import { ROTULO_DA_MODALIDADE, ROTULO_DO_NIVEL, nomeDaHipotese } from '../item/rotulos'
import { IconButton } from '../ui/IconButton'
import { useCarregar } from '../ui/useCarregar'
import { AvisoDeCopia, useCopiar } from '../ui/useCopiar'
import { CabecalhoDoDetalhe, ErroNoDetalhe, Linha, MolduraDoDetalhe, NaoEncontrado, SecaoDeObjetos } from './detalhe'
import { numeroPtBr } from '../ui/usePendencias'
import './Lista.css'

export const TIPO_DO_VERBETE: Record<VerbeteCompleto['tipo'], string> = { concept: 'Conceito', name: 'Nome', technical: 'Técnico' }
const GENERO = { m: 'masculino', f: 'feminino' } as const
const NUMERO = { sg: 'singular', pl: 'plural' } as const

interface Props {
  id: string
  /** Celular: a página inteira do verbete. Computador: o painel à direita da lista. */
  pagina: boolean
  /** Para onde o Voltar leva (o glossário, com o tipo que estava escolhido). */
  voltarPara: string
  computador: boolean
}

/**
 * O Verbete (Verbete.dc.html no celular, o painel de PC-Glossario.dc.html no computador), só leitura:
 * a forma em uso e a proposta original, o alemão, o inglês, o pai, Iconclass e SSSL, os objetos e as
 * hipóteses com o termo. A edição (forma, gênero, Aprovar) é da 2B: aqui os valores são texto.
 */
export function Verbete({ id, pagina, voltarPara, computador }: Props) {
  const carga = useCarregar(() => verbete(id), id)
  const nomeRef = useRef<HTMLHeadingElement>(null)
  const { aviso, copiar } = useCopiar(nomeRef)
  const voltar = { href: `#${voltarPara}`, rotulo: 'Voltar ao glossário' }

  if (carga.fase === 'carregando') return <div className={pagina ? 'detalhe-pagina' : 'detalhe'} aria-busy="true" />
  if (carga.fase === 'erro') return <ErroNoDetalhe pagina={pagina} voltar={voltar} erro={carga.erro} />
  const v = carga.dados
  if (v === null) {
    return <NaoEncontrado pagina={pagina} voltar={voltar} titulo="Verbete não encontrado" destino="/glossario" rotuloDoDestino="Ver o glossário" />
  }

  const nome = v.pt ?? v.de ?? v.id
  const acoes = (
    <>
      <IconButton icon="buscar" label="Buscar objetos com este termo" href={`#${caminhoDaBusca(nome, { escopo: 'termo' })}`} />
      <IconButton icon="copiar" label="Copiar referência" onClick={() => void copiar(`${nome} (${v.id})`)} />
    </>
  )

  return (
    <MolduraDoDetalhe pagina={pagina} voltar={voltar} acoes={acoes}>
      <CabecalhoDoDetalhe
        pagina={pagina}
        etiqueta={`${TIPO_DO_VERBETE[v.tipo]} · ${v.status === 'approved' ? 'aprovado' : 'a revisar'}`}
        titulo={nome}
        codigo={v.id}
        acoes={acoes}
        tituloRef={nomeRef}
      />
      <AvisoDeCopia aviso={aviso} />

      <section className="detalhe-bloco" aria-label="Forma em português">
        <dl className="detalhe-dl">
          <Linha rotulo="Forma em português">{v.pt ?? '—'}</Linha>
          <Linha rotulo="Proposta original" vazio={!v.ptProposta}>
            {v.ptProposta}
          </Linha>
          <Linha rotulo="No texto corrido" vazio={!v.ptTexto}>
            {v.ptTexto}
          </Linha>
          <Linha rotulo="Gênero" vazio={!v.genero}>
            {v.genero ? GENERO[v.genero] : null}
          </Linha>
          <Linha rotulo="Número" vazio={!v.numeroGramatical}>
            {v.numeroGramatical ? NUMERO[v.numeroGramatical] : null}
          </Linha>
        </dl>
      </section>

      <section className="detalhe-bloco" aria-label="Dados do verbete">
        <dl className="detalhe-dl">
          <Linha rotulo="Alemão" lang="de" vazio={!v.de}>
            {v.de}
          </Linha>
          <Linha rotulo="Inglês" lang="en" vazio={!v.en}>
            {v.en}
          </Linha>
          <Linha rotulo="Árabe" lang="ar" vazio={!v.ar}>
            {v.ar}
          </Linha>
          <Linha rotulo="Hebraico" lang="he" vazio={!v.he}>
            {v.he}
          </Linha>
          <Linha rotulo="Pai" vazio={!v.pai}>
            {v.pai && <Link to={`/verbete/${encodeURIComponent(v.pai.id)}`}>{v.pai.pt ?? v.pai.id}</Link>}
          </Linha>
          <Linha rotulo="Iconclass" vazio={v.iconclass.length === 0}>
            <ul>
              {v.iconclass.map((i) => (
                <li key={i.notacao}>
                  <span className="codigo">{i.notacao}</span>
                  {(i.pt ?? i.en ?? i.de) && ` · ${i.pt ?? i.en ?? i.de}`}
                </li>
              ))}
            </ul>
          </Linha>
          <Linha rotulo="SSSL" vazio={v.sssl.length === 0}>
            <ul>
              {v.sssl.map((s) => (
                <li key={s.codigo}>
                  <span className="codigo">{s.codigo}</span>
                  {s.rotulo && ` · ${s.rotulo}`}
                </li>
              ))}
            </ul>
          </Linha>
          <Linha rotulo="Definição" vazio={!v.definicao}>
            {v.definicao}
          </Linha>
          <Linha rotulo="Grafias" lang="de" vazio={!v.variantes.some((g) => g !== v.de)}>
            {v.variantes.join(', ')}
          </Linha>
        </dl>
      </section>

      <SecaoDeObjetos rotulo="Objetos com este termo" titulo="Objetos" objetos={v.objetos} computador={computador} />

      <section className="detalhe-secao" aria-label="Hipóteses com este termo">
        <div className="detalhe-secao-topo">
          <h2>Hipóteses</h2>
          <span className="codigo">{numeroPtBr(v.hipoteses.length)}</span>
        </div>
        {v.hipoteses.length === 0 && <p className="detalhe-vazio">Nenhuma hipótese com este termo.</p>}
        {v.hipoteses.map((h) => {
          // O locator costuma já trazer a obra ("TESTE I, Nr. 1"): não repetir a sigla.
          const fonte = h.locator && h.publicacao && !h.locator.startsWith(h.publicacao) ? `${h.publicacao}, ${h.locator}` : (h.locator ?? h.publicacao ?? '')
          const textos = (
            <>
              <span className="codigo">{h.alvo.numero ?? '—'}</span>
              <span className="hipotese-textos">
                {h.citacao ? (
                  <span className="hipotese-citacao" lang="de">{`»${h.citacao}«`}</span>
                ) : (
                  <span className="hipotese-citacao">{nomeDaHipotese(h)}</span>
                )}
                <span className="hipotese-meta">
                  {[ROTULO_DO_NIVEL[h.nivel].toLowerCase(), ROTULO_DA_MODALIDADE[h.modalidade], fonte].filter(Boolean).join(' · ')}
                </span>
              </span>
            </>
          )
          return h.alvo.numero ? (
            <Link key={h.id} className="hipotese-linha" to={`/item/${encodeURIComponent(h.alvo.numero)}?hipotese=${encodeURIComponent(h.id)}`}>
              {textos}
            </Link>
          ) : (
            <div key={h.id} className="hipotese-linha">
              {textos}
            </div>
          )
        })}
      </section>
    </MolduraDoDetalhe>
  )
}
