import { useRef, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { LinkComOrigem } from '../app/OrigemDosLinks'
import { verbete, type Verbete as VerbeteCompleto } from '../banco/consultas'
import { AvisoDeDuplicado } from '../glossario/AvisoDeDuplicado'
import { useDuplicadosDoGlossario, useEdicaoDoVerbete, useEdicaoPublicada, useFormasEmUso, useHipotesesDoVerbete, useNomeVivo } from '../glossario/doUsuario'
import { situacaoDoVerbete } from '../glossario/modelo'
import { EditorDaForma } from '../glossario/EditorDaForma'
import { LinhasDeHipoteseSkc } from '../glossario/LinhasDeHipoteseSkc'
import { eVerbeteSkc, outrasInteiras, type CamposCompletos, ROTULO_DO_GENERO, ROTULO_DO_NUMERO, ROTULO_DO_TIPO } from '../glossario/modelo'
import { VerbeteSkc } from '../glossario/VerbeteSkc'
import { nivelDaHipoteseDoLivro, useNiveisDaCamada } from '../hipoteses/niveis'
import { EditarCamposDoVerbete, FormaNaLingua, ListaDeOutras } from '../glossario/CamposDoVerbete'
import { Icon } from '../ui/Icon'
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

export const TIPO_DO_VERBETE: Record<VerbeteCompleto['tipo'], string> = ROTULO_DO_TIPO
const GENERO = ROTULO_DO_GENERO
const NUMERO = ROTULO_DO_NUMERO

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
 * alemão, o inglês, o árabe, o hebraico, as outras línguas (`other_forms`, pacote 10), o pai, Iconclass e SSSL (do livro, só
 * leitura; fix round 1 da Tarefa 12: o verbete que o pacote criou de um verbete seu tem «Editar os dados», e o que a camada
 * escreveu depois vale sobre o pacote, campo a campo, `useEdicaoPublicada`), os objetos e as hipóteses com o termo (as do livro e
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

/** Os campos completos como o pacote os traz, com os nomes do registro do app (para a camada valer por cima, campo a campo). */
function camposDoPacote(v: VerbeteCompleto): CamposCompletos {
  return {
    tipo: v.tipo,
    genero: v.genero,
    numero: v.numeroGramatical,
    de: v.de,
    en: v.en,
    he: v.he,
    ar: v.ar,
    outras: v.outras,
    variantes: v.variantes,
    pai: v.pai?.id ?? null,
    iconclass: v.iconclass.map((i) => i.notacao),
    sssl: v.sssl.map((x) => x.codigo),
  }
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
  // O nível que vale de cada hipótese do livro (Tarefa 13): o revisto pela pessoa, ou o do pacote.
  const niveis = useNiveisDaCamada()
  const nomeDe = useNomeVivo()
  const parecidos = useDuplicadosDoGlossario().get(id) ?? []
  // Fix round 1 da Tarefa 12: o verbete que o pacote criou de um verbete seu continua editável («Editar os dados»), e o que a
  // camada escreveu depois vale sobre o pacote, campo a campo.
  const publicada = useEdicaoPublicada(id)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const editando = publicada !== null && editandoId === id

  if (carga.fase === 'carregando') return <div className={pagina ? 'detalhe-pagina' : 'detalhe'} aria-busy="true" />
  if (carga.fase === 'erro') return <ErroNoDetalhe pagina={pagina} voltar={voltar} erro={carga.erro} aoTentar={carga.tentarDeNovo} />
  const v = carga.dados
  if (v === null) {
    return <NaoEncontrado pagina={pagina} voltar={voltar} titulo="Verbete não encontrado" destino="/glossario" rotuloDoDestino="Ver o glossário" />
  }

  const original = v.pt ?? v.de ?? v.id
  const nome = edicao?.formaEmUso ?? original
  const doPacote = camposDoPacote(v)
  const campos: CamposCompletos = publicada ? { ...doPacote, ...publicada.campos } : doPacote
  const outras = outrasInteiras(campos.outras)
  const rotuloDaIconclass = new Map(v.iconclass.map((i) => [i.notacao, i.pt ?? i.en ?? i.de] as const))
  const rotuloDoSssl = new Map(v.sssl.map((x) => [x.codigo, x.rotulo] as const))
  const { status, aprovacaoDesatualizada } = situacaoDoVerbete(edicao, original, v.status)
  const acoes = (
    <>
      <IconButton icon="buscar" label="Buscar objetos com este termo" href={`#${caminhoDaBusca(nome, { escopo: 'termo' })}`} />
      <IconButton icon="copiar" label="Copiar referência" onClick={() => void copiar(`${nome} (${v.id})`)} />
    </>
  )

  return (
    <MolduraDoDetalhe pagina={pagina} voltar={voltar} acoes={acoes} origem={`Verbete: ${nome}`}>
      <CabecalhoDoDetalhe
        pagina={pagina}
        etiqueta={`${TIPO_DO_VERBETE[campos.tipo ?? v.tipo]} · ${status === 'approved' ? 'aprovado' : 'a revisar'}`}
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
          {!editando && (
            <>
              <Linha rotulo="Gênero" vazio={!campos.genero}>
                {campos.genero ? GENERO[campos.genero] : null}
              </Linha>
              <Linha rotulo="Número" vazio={!campos.numero}>
                {campos.numero ? NUMERO[campos.numero] : null}
              </Linha>
            </>
          )}
        </dl>
      </section>

      {publicada && (
        <div className="detalhe-fila">
          <button type="button" className="detalhe-botao-botao" aria-pressed={editando} onClick={() => setEditandoId(editando ? null : id)}>
            <Icon name="editarFicha" size={18} />
            Editar os dados
          </button>
        </div>
      )}
      <section className="detalhe-bloco" aria-label="Dados do verbete">
        {editando && publicada ? (
          <EditarCamposDoVerbete key={publicada.alvo} id={publicada.alvo} campos={campos} criaRegistro={publicada.criaRegistro} excluirDoPai={[id, ...publicada.origens]} />
        ) : (
          <dl className="detalhe-dl">
            <Linha rotulo="Alemão" lang="de" vazio={!campos.de}>
              {campos.de}
            </Linha>
            <Linha rotulo="Inglês" lang="en" vazio={!campos.en}>
              {campos.en}
            </Linha>
            <Linha rotulo="Árabe" lang="ar" vazio={!campos.ar}>
              <FormaNaLingua texto={campos.ar ?? ''} rtl="auto" />
            </Linha>
            <Linha rotulo="Hebraico" lang="he" vazio={!campos.he}>
              <FormaNaLingua texto={campos.he ?? ''} rtl="auto" />
            </Linha>
            <Linha rotulo="Outras línguas" vazio={outras.length === 0}>
              <ListaDeOutras outras={outras} />
            </Linha>
            <Linha rotulo="Pai" vazio={!campos.pai}>
              {campos.pai && <Link to={`/verbete/${encodeURIComponent(campos.pai)}`}>{nomeDe(campos.pai, campos.pai === v.pai?.id ? (v.pai.pt ?? campos.pai) : campos.pai)}</Link>}
            </Linha>
            <Linha rotulo="Iconclass" vazio={campos.iconclass.length === 0}>
              <ul>
                {campos.iconclass.map((n) => (
                  <li key={n}>
                    <span className="codigo">{n}</span>
                    {rotuloDaIconclass.get(n) && ` · ${rotuloDaIconclass.get(n)}`}
                  </li>
                ))}
              </ul>
            </Linha>
            <Linha rotulo="SSSL" vazio={campos.sssl.length === 0}>
              <ul>
                {campos.sssl.map((c) => (
                  <li key={c}>
                    <span className="codigo">{c}</span>
                    {rotuloDoSssl.get(c) && ` · ${rotuloDoSssl.get(c)}`}
                  </li>
                ))}
              </ul>
            </Linha>
            <Linha rotulo="Definição" vazio={!v.definicao}>
              {v.definicao}
            </Linha>
            <Linha rotulo="Grafias" lang="de" vazio={!campos.variantes.some((g) => g !== campos.de)}>
              {campos.variantes.join(', ')}
            </Linha>
          </dl>
        )}
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
                  {[ROTULO_DO_NIVEL[nivelDaHipoteseDoLivro(niveis, h).efetivo].toLowerCase(), ROTULO_DA_MODALIDADE[h.modalidade], fonte].filter(Boolean).join(' · ')}
                </span>
              </span>
            </>
          )
          return h.alvo.numero ? (
            <LinkComOrigem key={h.id} className="hipotese-linha" to={`/item/${encodeURIComponent(h.alvo.numero)}?hipotese=${encodeURIComponent(h.id)}`}>
              {textos}
            </LinkComOrigem>
          ) : (
            <div key={h.id} className="hipotese-linha">
              {textos}
            </div>
          )
        })}
        <LinhasDeHipoteseSkc hipoteses={hipotesesSkc} />
      </section>

      {/* key: no computador a tela fica montada entre um verbete e outro; o estado do bloco é de cada entrada (NB-1). O nome é o
          dos livros (o do pacote), nunca a forma corrigida nem o id: é o que fica guardado para «Excluídos» (m-1) */}
      <VeioDeVoce key={v.id} tipo="verbete" id={v.id} nomeDoLivro={v.pt ?? undefined} />

      <NotasDoAlvo tipo="verbete" ref_={v.id} variante="secao" />
    </MolduraDoDetalhe>
  )
}
