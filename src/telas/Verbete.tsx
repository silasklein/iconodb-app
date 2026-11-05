import { useRef } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { verbete, type Verbete as VerbeteCompleto } from '../banco/consultas'
import { AvisoDeDuplicado } from '../glossario/AvisoDeDuplicado'
import { useDuplicadosDoGlossario, useEdicaoDoVerbete, useFormasEmUso, useHipotesesDoVerbete, useNomeVivo } from '../glossario/doUsuario'
import { situacaoDoVerbete } from '../glossario/modelo'
import { EditorDaForma } from '../glossario/EditorDaForma'
import { LinhasDeHipoteseSkc } from '../glossario/LinhasDeHipoteseSkc'
import { eVerbeteSkc } from '../glossario/modelo'
import { VerbeteSkc } from '../glossario/VerbeteSkc'
import { formatarLocalizador } from '../banco/referencias'
import { useRedirecionamentos } from '../pacote/redirecionamentos'
import { caminhoDaBusca } from '../busca/url'
import { NotasDoAlvo } from '../notas/NotasDoAlvo'
import { ROTULO_DA_MODALIDADE, ROTULO_DO_NIVEL, nomeDaHipotese } from '../item/rotulos'
import { IconButton } from '../ui/IconButton'
import { useCarregar } from '../ui/useCarregar'
import { AvisoDeCopia, useCopiar } from '../ui/useCopiar'
import { CabecalhoDoDetalhe, ErroNoDetalhe, Linha, MolduraDoDetalhe, NaoEncontrado, SecaoDeObjetos } from './detalhe'
import { Contagem } from '../ui/Contagem'
import { VeioDeVoce } from './VeioDeVoce'
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
 * O Verbete (Verbete.dc.html no celular, o painel de PC-Glossario.dc.html no computador): a forma em português, que se
 * edita no lugar (a forma em uso, "Voltar à proposta original" e Aprovar; Tarefa 11, src/glossario/EditorDaForma.tsx), o
 * alemão, o inglês, o pai, Iconclass e SSSL (do livro, só leitura), os objetos e as hipóteses com o termo (as do livro e
 * as SKC). O gênero e "No texto corrido" do desenho ficam como texto: o registro da edição não tem esses campos.
 */
export function Verbete(props: Props) {
  // Um verbete do usuário (decisão 41) tem a sua página, lida da camada do usuário; o que o pacote publicou (Tarefa 16) leva
  // ao verbete do livro.
  return eVerbeteSkc(props.id) ? <VerbeteDoUsuario {...props} /> : <VerbeteDoPacote {...props} />
}

/** O endereço de um verbete do usuário que o pacote publicou com um id do livro vai para o do livro (o antigo some do histórico). */
function VerbeteDoUsuario(props: Props) {
  const redirecionamentos = useRedirecionamentos()
  const { search } = useLocation()
  if (redirecionamentos === null) return <div className={props.pagina ? 'detalhe-pagina' : 'detalhe'} aria-busy="true" />
  const para = redirecionamentos.get(props.id)
  if (para) return <Navigate replace to={`/verbete/${encodeURIComponent(para)}${search}`} />
  return <VerbeteSkc {...props} />
}

function VerbeteDoPacote({ id, pagina, voltarPara, computador }: Props) {
  const carga = useCarregar(() => verbete(id), id, { manter: !pagina })
  const nomeRef = useRef<HTMLHeadingElement>(null)
  const { aviso, copiar } = useCopiar(nomeRef)
  const voltar = { href: `#${voltarPara}`, rotulo: 'Voltar ao glossário' }
  // As hipóteses SKC que usam este termo (Tarefa 11): vêm depois das do livro, com a marca SKC.
  const hipotesesSkc = useHipotesesDoVerbete(id)
  // O que a pessoa escreveu neste verbete (forma em uso e estado) vale sobre o do pacote.
  const edicao = useEdicaoDoVerbete(id)
  const formas = useFormasEmUso()
  const nomeDe = useNomeVivo()
  const parecidos = useDuplicadosDoGlossario().get(id) ?? []

  if (carga.fase === 'carregando') return <div className={pagina ? 'detalhe-pagina' : 'detalhe'} aria-busy="true" />
  if (carga.fase === 'erro') return <ErroNoDetalhe pagina={pagina} voltar={voltar} erro={carga.erro} aoTentar={carga.tentarDeNovo} />
  const v = carga.dados
  if (v === null) {
    return <NaoEncontrado pagina={pagina} voltar={voltar} titulo="Verbete não encontrado" destino="/glossario" rotuloDoDestino="Ver o glossário" />
  }

  const original = v.pt ?? v.de ?? v.id
  const nome = edicao?.formaEmUso ?? original
  const { status, aprovacaoDesatualizada } = situacaoDoVerbete(edicao, original, v.status)
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
        etiqueta={`${TIPO_DO_VERBETE[v.tipo]} · ${status === 'approved' ? 'aprovado' : 'a revisar'}`}
        titulo={nome}
        codigo={v.id}
        acoes={acoes}
        tituloRef={nomeRef}
      />
      <AvisoDeCopia aviso={aviso} />

      <section className="detalhe-bloco" aria-label="Forma em português">
        <EditorDaForma key={id} id={id} original={original} emUso={nome} status={status} aprovacaoDesatualizada={aprovacaoDesatualizada} statusDoPacote={v.status} doPacote aprovadoPeloPacote={status === 'approved' && v.status === 'approved' && (edicao?.status ?? null) === null} />
        <AvisoDeDuplicado parecidos={parecidos} doUsuario={false} />
        <dl className="detalhe-dl detalhe-dl-depois-do-editor">
          <Linha rotulo="Proposta do tradutor" vazio={!v.ptProposta || v.ptProposta === v.pt}>
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
          <Linha rotulo="Árabe" lang="ar" dir="auto" vazio={!v.ar}>
            {v.ar}
          </Linha>
          <Linha rotulo="Hebraico" lang="he" dir="auto" vazio={!v.he}>
            {v.he}
          </Linha>
          <Linha rotulo="Pai" vazio={!v.pai}>
            {v.pai && <Link to={`/verbete/${encodeURIComponent(v.pai.id)}`}>{nomeDe(v.pai.id, v.pai.pt ?? v.pai.id)}</Link>}
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
          <Contagem n={v.hipoteses.length + hipotesesSkc.length} um="hipótese" varios="hipóteses" className="codigo" />
        </div>
        {v.hipoteses.length + hipotesesSkc.length === 0 && <p className="detalhe-vazio">Nenhuma hipótese com este termo.</p>}
        {v.hipoteses.map((h) => {
          // O locator já traz a obra ("TESTE I, Nr. 1", mostrado "TESTE I: 1"; decisão 39). Um que não se lê fica como veio
          // (revisão 4: sem colar a publicação com vírgula); sem locator, a publicação.
          const fonte = h.locator ? formatarLocalizador(h.locator) : (h.publicacao ?? '')
          const textos = (
            <>
              <span className="codigo">{h.alvo.numero ?? '—'}</span>
              <span className="hipotese-textos">
                {h.citacao ? (
                  <span className="hipotese-citacao" lang="de">{`»${h.citacao}«`}</span>
                ) : (
                  <span className="hipotese-citacao">{nomeDaHipotese(h, formas)}</span>
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
        <LinhasDeHipoteseSkc hipoteses={hipotesesSkc} />
      </section>

      <VeioDeVoce tipo="verbete" id={v.id} />

      <NotasDoAlvo tipo="verbete" ref_={v.id} variante="secao" />
    </MolduraDoDetalhe>
  )
}
