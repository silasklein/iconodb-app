import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { resumosDosObjetos, sitio } from '../banco/consultas'
import type { ObjetoResumo, Sitio as SitioDoLivro } from '../banco/tipos'
import { caminhoDaBusca } from '../busca/url'
import { useObjetosSkc } from '../colecoes/objetosSkc'
import { AvisoDeSitioParecido } from '../sitios/AvisoDeSitioParecido'
import { CampoDeTextoDoSitio, CampoNomeDoSitio, CoordenadaDoSitio, GrafiasDoSitio, mesmaCoordenada } from '../sitios/CorrigirSitio'
import { sitiosComEsteNome, useDadosDoSitio, useSitiosParaComparar, useTrocasDeSitio } from '../sitios/doUsuario'
import { eSitioSkc } from '../sitios/modelo'
import { excluirSitio, restaurarSitio } from '../sitios/operacoes'
import { useRascunhoDaCoordenada } from '../sitios/rascunho'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { useCarregar } from '../ui/useCarregar'
import { AvisoDeCopia, useCopiar } from '../ui/useCopiar'
import { numeroPtBr } from '../ui/numero'
import { NotasDoAlvo } from '../notas/NotasDoAlvo'
import { origensDe, useRedirecionamentos } from '../pacote/redirecionamentos'
import { coordenadaAte5, coordenadaEmGraus, enderecoDoMapa } from './coordenada'
import { CabecalhoDoDetalhe, ErroNoDetalhe, Linha, MolduraDoDetalhe, NaoEncontrado, SecaoDeObjetos } from './detalhe'
import { VeioDeVoce } from './VeioDeVoce'
import '../imagens-usuario/MarcaSkc.css'
import '../sitios/Sitios.css'
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
 * Os objetos do sítio: os do livro que o achado dele cita (só um sítio do livro), os objetos SKC cuja ficha o escolheu e os do
 * livro que a pessoa ligou a ele (`item-sitio`). Um número aparece uma vez. A busca e as listas são aditivas: o livro ainda
 * diz que o objeto foi achado lá, mesmo que a pessoa o tenha ligado a outro sítio. Num sítio do livro que é o destino de um
 * sítio do usuário publicado (Tarefa 16, revisão 1), também os ligados ao `SI-…` de antes.
 */
export function useObjetosDoSitio(id: string, doLivro: readonly ObjetoResumo[]): ObjetoResumo[] {
  const skc = useObjetosSkc()
  const trocas = useTrocasDeSitio()
  const redirecionamentos = useRedirecionamentos()
  const ids = useMemo(() => new Set([id, ...(eSitioSkc(id) ? [] : origensDe(redirecionamentos, id))]), [id, redirecionamentos])
  const ligados = useMemo(
    () => [...trocas].filter(([numero, t]) => t.sitio !== null && ids.has(t.sitio) && !doLivro.some((o) => o.numero === numero)).map(([numero]) => numero),
    [trocas, ids, doLivro],
  )
  const carga = useCarregar(() => resumosDosObjetos(ligados), `${id}|${ligados.join(',')}`, { manter: true })
  return useMemo(() => {
    const vistos = new Set<string>()
    const saida: ObjetoResumo[] = []
    for (const o of [...doLivro, ...(carga.fase === 'ok' && ligados.length > 0 ? carga.dados : []), ...skc.filter((o) => o.sitioId !== null && o.sitioId !== undefined && ids.has(o.sitioId))]) {
      if (vistos.has(o.numero)) continue
      vistos.add(o.numero)
      saida.push(o)
    }
    return saida
  }, [doLivro, carga, ligados, skc, ids])
}

/**
 * O Sítio (Sitio.dc.html no celular, o painel de PC-Sitio.dc.html no computador): o nome, a região, a coordenada com a fonte,
 * "abrir no mapa" (link externo ao OpenStreetMap, sem mapa dentro do app) e os objetos achados lá.
 *
 * Tarefa 12: "Corrigir" abre os campos no lugar. A correção de um sítio do livro fica na camada do usuário (SKC) e o valor do
 * livro continua à vista ("no livro: …"); um sítio novo (`SI-…`) tem a mesma página, sem dados do livro, e se exclui (reversível).
 */
export function Sitio(props: Props) {
  // Um sítio do usuário que o pacote publicou com um id do livro (Tarefa 16) leva ao sítio do livro.
  return eSitioSkc(props.id) ? <SitioDoUsuario {...props} /> : <SitioDaPagina {...props} />
}

function SitioDoUsuario(props: Props) {
  const redirecionamentos = useRedirecionamentos()
  const { search } = useLocation()
  if (redirecionamentos === null) return <div className={props.pagina ? 'detalhe-pagina' : 'detalhe'} aria-busy="true" />
  const para = redirecionamentos.get(props.id)
  if (para) return <Navigate replace to={`/sitio/${encodeURIComponent(para)}${search}`} />
  return <SitioDaPagina {...props} />
}

function SitioDaPagina({ id, pagina, voltarPara, computador }: Props) {
  const ehNovo = eSitioSkc(id)
  const carga = useCarregar(() => (ehNovo ? Promise.resolve(null) : sitio(id)), id, { manter: !pagina })
  const voltar = { href: `#${voltarPara}`, rotulo: 'Voltar aos sítios' }

  if (!ehNovo && carga.fase === 'carregando') return <div className={pagina ? 'detalhe-pagina' : 'detalhe'} aria-busy="true" />
  if (!ehNovo && carga.fase === 'erro') return <ErroNoDetalhe pagina={pagina} voltar={voltar} erro={carga.erro} aoTentar={carga.tentarDeNovo} />
  const livro = carga.fase === 'ok' ? carga.dados : null
  return <Pagina key={id} id={id} livro={livro} ehNovo={ehNovo} pagina={pagina} voltar={voltar} voltarPara={voltarPara} computador={computador} />
}

interface PaginaProps {
  id: string
  livro: SitioDoLivro | null
  ehNovo: boolean
  pagina: boolean
  voltar: { href: string; rotulo: string }
  voltarPara: string
  computador: boolean
}

function Pagina({ id, livro, ehNovo, pagina, voltar, voltarPara, computador }: PaginaProps) {
  const registro = useDadosDoSitio(id)
  const rascunhoGuardado = useRascunhoDaCoordenada(id) // refeito quando o rascunho muda (gravar, descartar, outra aba)
  const objetos = useObjetosDoSitio(id, livro?.objetos ?? [])
  const todos = useSitiosParaComparar()
  const navegar = useNavigate()
  const blocoRef = useRef<HTMLElement>(null)
  const { aviso, copiar } = useCopiar(blocoRef)
  const [corrigindo, setCorrigindo] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const gatilhoRef = useRef<HTMLButtonElement>(null)
  const cancelarRef = useRef<HTMLButtonElement>(null)
  const jaAbriu = useRef(false)
  useEffect(() => {
    if (excluindo) {
      jaAbriu.current = true
      cancelarRef.current?.focus()
    } else if (jaAbriu.current) {
      jaAbriu.current = false
      gatilhoRef.current?.focus()
    }
  }, [excluindo])

  // Um sítio novo que não existe (id inventado, ou um registro que ainda não chegou deste aparelho): não encontrado.
  if (ehNovo && !registro) return <NaoEncontrado pagina={pagina} voltar={voltar} titulo="Sítio não encontrado" destino="/sitios" rotuloDoDestino="Ver os sítios" />
  if (!ehNovo && !livro) return <NaoEncontrado pagina={pagina} voltar={voltar} titulo="Sítio não encontrado" destino="/sitios" rotuloDoDestino="Ver os sítios" />

  const d = registro?.dados ?? null
  const nomeDoLivro = livro?.nome ?? null
  const nomeAgora = d?.nome ?? nomeDoLivro ?? id
  const regiaoDoLivro = livro?.regiao?.nome ?? null
  const regiaoAgora = d?.regiao ?? regiaoDoLivro
  const coordDoLivro = livro && livro.lat !== null && livro.lon !== null ? { lat: livro.lat, lon: livro.lon } : null
  const coordAgora = d?.coordenada ?? coordDoLivro
  const corrigidaACoordenada = d?.coordenada != null
  const excluido = registro?.excluido ?? false
  const mapa = coordAgora ? enderecoDoMapa(coordAgora.lat, coordAgora.lon) : null
  const verCoordenada = (c: { lat: number; lon: number }, doUsuario: boolean) => (doUsuario ? coordenadaAte5(c.lat, c.lon) : coordenadaEmGraus(c.lat, c.lon, 5))
  const copia = [nomeAgora, coordAgora ? verCoordenada(coordAgora, corrigidaACoordenada) : null].filter(Boolean).join(' · ')
  const parecidos = !ehNovo ? [] : sitiosComEsteNome(todos, nomeAgora, id)
  // Uma coordenada escrita em «Corrigir» e não gravada (par pela metade ou inválido) não se perde: a página avisa.
  // (Um rascunho igual à coordenada de agora não é «ainda não salva»: T17-B-13.)
  const rascunhoDaCoordenada = !corrigindo && !excluido && rascunhoGuardado && !mesmaCoordenada(rascunhoGuardado, coordAgora) ? rascunhoGuardado : null

  const acoes = (
    <>
      <IconButton icon="buscar" label="Buscar objetos deste sítio" href={`#${caminhoDaBusca(nomeAgora, { escopo: 'local' })}`} />
      <IconButton icon="copiar" label="Copiar referência" onClick={() => void copiar(copia)} />
    </>
  )
  const tentar = (p: Promise<unknown>) => {
    setFalhou(false)
    p.catch(() => setFalhou(true))
  }
  const nObjetos = `${numeroPtBr(objetos.length)} ${objetos.length === 1 ? 'objeto' : 'objetos'}`

  return (
    <MolduraDoDetalhe pagina={pagina} voltar={voltar} acoes={acoes}>
      <CabecalhoDoDetalhe
        pagina={pagina}
        etiqueta={`${ehNovo ? 'Sítio SKC' : 'Sítio'}${regiaoAgora ? ` · ${regiaoAgora}` : ''}`}
        titulo={nomeAgora}
        codigo={`${ehNovo ? id : (livro?.glId ?? id)} · ${nObjetos}`}
        acoes={acoes}
      />
      <AvisoDeCopia aviso={aviso} />

      {excluido && (
        <p className="sitio-aviso-excluido" role="status">
          Este sítio foi excluído; os objetos ligados a ele continuam com o nome e contam como «sítios não resolvidos» na Revisão.{' '}
          <button type="button" className="sitio-link-botao" onClick={() => tentar(restaurarSitio(id))}>
            Restaurar o sítio
          </button>
        </p>
      )}
      {falhou && (
        <p className="form-erro sitio-aviso-excluido" role="alert">
          Não foi possível guardar; tente de novo.
        </p>
      )}

      {rascunhoDaCoordenada && (
        <p className="sitio-aviso-excluido" role="status" aria-label="Coordenada ainda não salva">
          Há uma coordenada ainda não salva neste sítio (a que você escreveu em «Corrigir» e não terminou). Ela fica guardada neste aparelho.{' '}
          <button type="button" className="sitio-link-botao" onClick={() => setCorrigindo(true)}>
            Continuar a coordenada
          </button>
        </p>
      )}

      <div className="sitio-fila">
        {mapa && !excluido && (
          // O mapa do app (Tarefa 19), centrado neste sítio; o OpenStreetMap continua à parte, como link externo.
          <Link className="detalhe-botao" to={`/sitios?foco=${encodeURIComponent(id)}`}>
            Abrir no mapa
            <Icon name="mapa" size={18} />
          </Link>
        )}
        {mapa && (
          <a className="detalhe-botao" href={mapa} target="_blank" rel="noopener noreferrer">
            Abrir no OpenStreetMap
            <Icon name="abrirExterno" size={18} />
          </a>
        )}
        {!excluido && (
          <button type="button" className="detalhe-botao-botao" aria-pressed={corrigindo} onClick={() => setCorrigindo((c) => !c)}>
            <Icon name="editarFicha" size={18} />
            Corrigir
          </button>
        )}
      </div>
      {corrigindo && (
        <p className="detalhe-vazio sitio-aviso-excluido">
          {ehNovo ? 'Cada campo se grava sozinho.' : 'Toque num campo para corrigir. A correção fica na sua camada (SKC); o valor do livro continua guardado ao lado.'}
        </p>
      )}

      <section className="detalhe-bloco" aria-label="Dados do sítio" ref={blocoRef}>
        {corrigindo ? (
          <div className="sitio-corrigir">
            <CampoNomeDoSitio id={id} nomeAgora={nomeAgora} nomeDoLivro={nomeDoLivro} corrigido={d?.nome != null} />
            <GrafiasDoSitio id={id} variantes={d?.variantes ?? []} nomeAgora={nomeAgora} />
            <CampoDeTextoDoSitio id={id} campo="regiao" rotulo="Região ou país" valor={regiaoAgora ?? ''} original={regiaoDoLivro} doLivro={!ehNovo} />
            {livro?.nota && (
              <span className="form-ajuda" lang="de">
                No livro: {livro.nota}
              </span>
            )}
            <CampoDeTextoDoSitio id={id} campo="nota" rotulo="Nota" valor={d?.nota ?? ''} original={null} doLivro={!ehNovo} longo ajuda="De onde vem a coordenada, dúvidas, bibliografia…" />
          </div>
        ) : (
          <dl className="detalhe-dl">
            <Linha rotulo="Nome">
              {ehNovo ? (
                <span className="sitio-nome-skc">
                  {nomeAgora}
                  <span className="marca-skc">SKC</span>
                </span>
              ) : (
                nomeAgora
              )}
              {d?.nome != null && nomeDoLivro !== null && <small className="sitio-no-livro">no livro: {nomeDoLivro}</small>}
              {livro && livro.literal !== (nomeDoLivro ?? '') && <small className="lista-sub">{` · como impresso: ${livro.literal}`}</small>}
            </Linha>
            <Linha rotulo="Outras grafias" vazio={!d || d.variantes.length === 0}>
              <ul className="sitio-grafias">
                {d?.variantes.map((v) => (
                  <li key={v} className="sitio-grafia sitio-grafia-lida">
                    {v}
                    <span className="marca-skc">SKC</span>
                  </li>
                ))}
              </ul>
            </Linha>
            <Linha rotulo="Região" vazio={!regiaoAgora}>
              {regiaoAgora}
              {d?.regiao != null && regiaoDoLivro !== null && <small className="sitio-no-livro">no livro: {regiaoDoLivro}</small>}
            </Linha>
            <Linha rotulo="No livro" lang="de" vazio={!livro?.nota}>
              {livro?.nota}
            </Linha>
            <Linha rotulo="Nota" vazio={!d?.nota}>
              {d?.nota}
              <span className="marca-skc sitio-marca-nota">SKC</span>
            </Linha>
          </dl>
        )}
        {!corrigindo && <AvisoDeSitioParecido parecidos={parecidos} quando="existente" />}
      </section>

      {corrigindo ? (
        <section className="detalhe-bloco">
          <CoordenadaDoSitio key={id} id={id} atual={coordAgora} doLivro={coordDoLivro} corrigida={corrigidaACoordenada} ehDoLivro={!ehNovo} />
        </section>
      ) : (
        <section className="detalhe-bloco" aria-label="Coordenada">
          {coordAgora ? (
            <dl className="detalhe-dl">
              <Linha rotulo="Coordenada">
                <span className="codigo detalhe-coordenada">{verCoordenada(coordAgora, corrigidaACoordenada)}</span>
                {corrigidaACoordenada && coordDoLivro && <small className="sitio-no-livro">no livro: {coordenadaEmGraus(coordDoLivro.lat, coordDoLivro.lon, 5)}</small>}
              </Linha>
              {!corrigidaACoordenada && (
                <>
                  <Linha rotulo="Método" vazio={!livro?.metodo}>
                    {livro?.metodo ? METODO[livro.metodo] : null}
                  </Linha>
                  <Linha rotulo="Grade" vazio={!livro?.gradeRef}>
                    <span className="codigo">{livro?.gradeRef}</span>
                  </Linha>
                  <Linha rotulo="Fonte" vazio={!livro?.fonteDaCoordenada}>
                    {livro?.fonteDaCoordenada && ehLink(livro.fonteDaCoordenada) ? (
                      <a href={livro.fonteDaCoordenada} target="_blank" rel="noopener noreferrer">
                        {livro.fonteDaCoordenada}
                      </a>
                    ) : (
                      livro?.fonteDaCoordenada
                    )}
                  </Linha>
                  <Linha rotulo="Nota" vazio={!livro?.notaDaCoordenada}>
                    {livro?.notaDaCoordenada}
                  </Linha>
                </>
              )}
              {corrigidaACoordenada && <Linha rotulo="Fonte">{ehNovo ? 'informada por você (SKC)' : 'corrigida por você (SKC)'}</Linha>}
            </dl>
          ) : (
            <p className="detalhe-vazio">sem coordenada</p>
          )}
        </section>
      )}

      <SecaoDeObjetos rotulo="Objetos deste sítio" titulo="Objetos" objetos={objetos} computador={computador} />

      {ehNovo && !excluido && (
        <div className="sitio-excluir">
          {excluindo ? (
            <div role="group" aria-label={`Excluir o sítio «${nomeAgora}»?`} className="sitio-confirmar">
              <p>
                {objetos.length === 0
                  ? 'Nenhum objeto usa este sítio.'
                  : `${objetos.length === 1 ? '1 objeto usa' : `${objetos.length} objetos usam`} este sítio e continua${objetos.length === 1 ? '' : 'm'} com o nome «${nomeAgora}», contando como «sítios não resolvidos» na Revisão.`}{' '}
                Dá para restaurar depois.
              </p>
              <div className="sitio-confirmar-botoes">
                <button ref={cancelarRef} type="button" className="form-botao" onClick={() => setExcluindo(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="form-botao form-botao-forte"
                  onClick={() => {
                    setFalhou(false)
                    jaAbriu.current = false
                    setExcluindo(false)
                    // Excluído, o sítio sai da lista: vai para ela, onde o aviso oferece "Restaurar".
                    excluirSitio(id).then(
                      () => navegar(voltarPara, { state: { sitioExcluido: { id, nome: nomeAgora } } }),
                      () => setFalhou(true),
                    )
                  }}
                >
                  Excluir
                </button>
              </div>
            </div>
          ) : (
            <button ref={gatilhoRef} type="button" className="form-botao" onClick={() => setExcluindo(true)}>
              <Icon name="excluir" size={18} />
              Excluir o sítio
            </button>
          )}
        </div>
      )}

      {!ehNovo && <VeioDeVoce key={id} tipo="sitio" id={id} nomeDoLivro={nomeDoLivro ?? undefined} />}

      <NotasDoAlvo tipo="sitio" ref_={id} variante="secao" />
    </MolduraDoDetalhe>
  )
}
