/**
 * «Mesclar com outro sítio…» na página do sítio (Parte 2C, bloco 2; telas aprovadas §1). Uma caixa no lugar, sem janela por
 * cima, como a confirmação de «Excluir o sítio»:
 * a) «Com qual sítio?»: o campo de sítio da ficha (as opções de `useEscolhaDeSitio`), sem o próprio sítio, sem os mesclados,
 *    os excluídos, as partes dele (em todos os níveis) e os todos acima dele; digitado um destes, a lista explica por quê;
 * b+c) «Qual fica?» e a confirmação numa caixa só: os dois lado a lado, o sugerido marcado (`sugestaoDeQualFica`), e embaixo o
 *    que acontece, mudando com a escolha (`textoDaMescla`). Só o «Mesclar» daqui grava. O foco começa em «Cancelar».
 * Com `outroInicial` (a Revisão, Tarefa 15), abre já em b+c.
 *
 * `useSobreOsSitios`: o que a caixa e a linha «Mesclado aqui» dizem de cada sítio (o nome, o que vai junto, as grafias, a
 * coordenada), sobre a resolução de agora.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useEsteAparelho } from '../imagens-usuario/exibicao'
import { CampoDeEscolha, dobrar, type OpcaoDeEscolha } from '../objetos-skc/CampoDeEscolha'
import { useIndiceDeNotas } from '../notas/useIndiceDeNotas'
import type { IndiceDeNotas } from '../notas/indiceDeNotas'
import { origensDe, useRedirecionamentos, type Redirecionamentos } from '../pacote/redirecionamentos'
import { numeroPtBr } from '../ui/numero'
import { estadoAtual, useEstado, type Estado } from '../usuario/estado'
import { dadosDoDestino, type CamposSimples } from './contagem'
import { objetosPorSitio } from './doUsuario'
import { useEscolhaDeSitio } from './escolha'
import { chaveDaGrafia, eSitioSkc, grafiasDoRegistro, hlcDoSitio, lerDadosDoSitio } from './modelo'
import { desfazerMescla, mesclarSitios } from './operacoes'
import { useSitiosDoPacote, type SitiosDoPacote } from './pacote'
import { conflitosDesteAparelho, podeMesclar, type Conflito, type PacoteDeSitios, type Resolucao } from './resolucao'
import { conteudoDoSitio, sugestaoDeQualFica, textoDaMescla, textoDoConflito, textoDoDesfazer, type Contagens, type FontesDoConteudo } from './textos'
import { usePacoteDeSitios, useResolucaoDeSitios } from './useResolucao'
import './Mesclar.css'

/** O que se diz de cada sítio numa mescla ou num desfazer. */
export interface SobreOsSitios {
  resolucao: Resolucao
  /** O nome de agora do sítio (o corrigido, senão o dos livros; o de um sítio seu), mesmo de um mesclado. */
  nome(id: string): string
  /** O nome do sítio nos livros (null: um sítio seu, ou fora do pacote): o nome de agora que é igual a ele não foi corrigido. */
  nomeDoLivro(id: string): string | null
  fontes: FontesDoConteudo
  /** O que vai junto com o sítio numa mescla, ou volta com ele num desfazer. */
  conteudo(id: string): Contagens
  /** Os campos simples de um sítio só (o registro dele, senão os dos livros), sem os dos mesclados nele. */
  dadosDe(id: string): CamposSimples
  /** O sítio (com o que está mesclado nele) tem coordenada? */
  temCoordenada(id: string): boolean
  /** O hlc do `criar` de um sítio seu (de um publicado, o do `SI-…` que o criou); '' para os outros. */
  criadoEm(id: string): string
}

export function sobreOsSitios(
  estado: Estado,
  resolucao: Resolucao,
  pacote: PacoteDeSitios,
  livro: SitiosDoPacote | null,
  redirecionados: Redirecionamentos | null,
  indice: IndiceDeNotas,
): SobreOsSitios {
  const registro = (id: string) => estado.registro('sitio', id)
  const dados = (id: string) => {
    const r = registro(id)
    return r ? lerDadosDoSitio(r, hlcDoSitio(estado, id)) : null
  }
  const nome = (id: string) => dados(id)?.nome ?? livro?.get(id)?.nome ?? id
  // Os objetos que a pessoa ligou a cada sítio, sem levar o absorvido ao destino (só o `SI-…` publicado ao sítio dos livros).
  // Os mapas só se montam quando alguém pergunta (a página do sítio pede só nomes e dados enquanto a caixa está fechada).
  let daPessoaGuardado: ReadonlyMap<string, number> | null = null
  const daPessoa = () => (daPessoaGuardado ??= objetosPorSitio(estado, redirecionados))
  let grafiasGuardadas: Map<string, string[]> | null = null
  const grafiasDoLivro = () => {
    if (!grafiasGuardadas) {
      grafiasGuardadas = new Map()
      for (const g of pacote.grafias) if (g.origem === 'livro') grafiasGuardadas.set(g.sitio, [...(grafiasGuardadas.get(g.sitio) ?? []), g.texto])
    }
    return grafiasGuardadas
  }
  const escrito = (id: string, campo: 'mescladoEm' | 'parteDe', doPacote: ReadonlyMap<string, string>): string | null => {
    const r = registro(id)
    if (r && campo in r.campos) {
      const v = r.campos[campo]
      return typeof v === 'string' && v !== '' ? v : null
    }
    return doPacote.get(id) ?? null
  }
  const fontes: FontesDoConteudo = {
    objetosDe: (id) => (livro?.get(id)?.objetos ?? 0) + (daPessoa().get(id) ?? 0),
    // As notas vivas feitas no sítio (não as excluídas, nem as que só o citam no texto).
    notasDe: (id) =>
      [id, ...(eSitioSkc(id) ? [] : origensDe(redirecionados, id))].reduce((n, x) => n + indice.ligadasA('sitio', x).filter((l) => l.direta).length, 0),
    correcoesDe: (id) => {
      const d = eSitioSkc(id) ? null : dados(id)
      return d ? [d.nome, d.regiao, d.coordenada, d.nota].filter((v) => v !== null).length : 0
    },
    grafiasDe: (id) => {
      const k = resolucao.canonico(id)
      const destino = resolucao.destino(k) === k
      const r = registro(k)
      const daPessoaNele = destino ? resolucao.grafiasDoUsuario(k).map((g) => g.texto) : r ? grafiasDoRegistro(r, hlcDoSitio(estado, k)).map((g) => g.texto) : []
      const textos = [...daPessoaNele, ...(grafiasDoLivro().get(k) ?? []), ...(destino ? resolucao.absorvidos(k).map(nome) : [])]
      const vistos = new Set([chaveDaGrafia(nome(k))])
      return textos.filter((t) => !vistos.has(chaveDaGrafia(t)) && !!vistos.add(chaveDaGrafia(t)))
    },
    mescladoEmEscrito: (id) => escrito(id, 'mescladoEm', pacote.mesclas),
    parteDeEscrito: (id) => escrito(id, 'parteDe', pacote.partes),
  }
  const dadosDe = (id: string): CamposSimples => {
    const d = dados(id)
    const s = livro?.get(id)
    const doLivro = s && s.lat !== null && s.lon !== null ? { lat: s.lat, lon: s.lon } : null
    return { coordenada: d?.coordenada ?? doLivro, regiao: d?.regiao ?? s?.regiao?.nome ?? null, pais: d?.pais ?? null, nota: d?.nota ?? null }
  }
  return {
    resolucao,
    nome,
    nomeDoLivro: (id) => livro?.get(id)?.nome ?? null,
    fontes,
    conteudo: (id) => conteudoDoSitio(resolucao, id, fontes),
    dadosDe,
    temCoordenada: (id) => dadosDoDestino(resolucao, id, dadosDe).coordenada !== null,
    criadoEm: (id) => {
      // M-1: um sítio seu publicado com id de livro foi criado quando o `SI-…` que o criou foi (o mais antigo, se mais de um)
      if (!eSitioSkc(id) && pacote.criados.has(id)) {
        const deles = origensDe(pacote.publicados, id).map((de) => registro(de)?.criadoEm ?? '').filter((h) => h !== '')
        if (deles.length > 0) return deles.reduce((a, b) => (b < a ? b : a))
      }
      return registro(id)?.criadoEm ?? ''
    },
  }
}

/** `sobreOsSitios` para as telas: null enquanto a resolução ou o pacote não chegaram. */
export function useSobreOsSitios(): SobreOsSitios | null {
  // Só o que estas contas leem: os sítios, os objetos SKC e as trocas de sítio (uma mudança em outra coisa não refaz nada).
  const sitios = useEstado((e) => e.registros.get('sitio'))
  const objetosSkc = useEstado((e) => e.registros.get('objeto'))
  const trocas = useEstado((e) => e.registros.get('item-sitio'))
  const resolucao = useResolucaoDeSitios()
  const pacote = usePacoteDeSitios()
  const livro = useSitiosDoPacote()
  const redirecionados = useRedirecionamentos()
  const indice = useIndiceDeNotas()
  return useMemo(
    () => (resolucao && pacote ? sobreOsSitios(estadoAtual(), resolucao, pacote, livro, redirecionados, indice) : null),
    [sitios, objetosSkc, trocas, resolucao, pacote, livro, redirecionados, indice], // eslint-disable-line react-hooks/exhaustive-deps
  )
}

/**
 * A mescla que este aparelho acabou de gravar (M1 da revisão): quem mesclou ficando com o OUTRO sítio sai da página do que entrou
 * (`Sitio` o leva ao destino); por ela, o destino diz «A e B agora são um só.» em vez de «Você abriu…». Anunciada antes de gravar
 * (a página pode trocar antes de a gravação responder), esquecida se a gravação falha e quando a página do destino a lê.
 */
export interface MesclaAnunciada {
  entra: string
  fica: string
  nomeFica: string
  nomeEntra: string
}
let anunciada: MesclaAnunciada | null = null
/** A mescla anunciada em que `id` é o que entra (o id da página ou o canônico dele), ou null. */
export const mesclaAnunciada = (...ids: string[]): MesclaAnunciada | null => (anunciada && ids.includes(anunciada.entra) ? anunciada : null)
export const esquecerMesclaAnunciada = (): void => {
  anunciada = null
}

const objetos = (n: number) => `${numeroPtBr(n)} ${n === 1 ? 'objeto' : 'objetos'}`
const ERRO = 'Não foi possível guardar; tente de novo.'

interface Props {
  /** O sítio da página. */
  id: string
  /** O outro sítio, já escolhido (a Revisão): a caixa abre em «Qual fica?». */
  outroInicial?: string
  aoFechar: () => void
}

export function Mesclar({ id, outroInicial, aoFechar }: Props) {
  const sobre = useSobreOsSitios()
  const [outro, setOutro] = useState<string | null>(outroInicial ?? null)
  if (!sobre) return <div className="sitio-confirmar sitio-mesclar" aria-busy="true" />
  const valido = outro !== null && podeMesclar(sobre.resolucao, id, outro) === null
  return valido ? (
    <QualFica key={outro} id={id} outro={outro} sobre={sobre} aoFechar={aoFechar} />
  ) : (
    <ComQualSitio id={id} sobre={sobre} aoEscolher={setOutro} aoFechar={aoFechar} />
  )
}

/** a) Escolher o outro. */
function ComQualSitio({ id, sobre, aoEscolher, aoFechar }: { id: string; sobre: SobreOsSitios; aoEscolher: (id: string) => void; aoFechar: () => void }) {
  const { opcoes } = useEscolhaDeSitio()
  const [texto, setTexto] = useState('')
  const caixa = useRef<HTMLDivElement>(null)
  const tituloId = useId()
  const r = sobre.resolucao
  const aqui = sobre.nome(id)
  // Juntar um sítio com uma parte dele (ou com um todo acima dele) inverteria a árvore sem ninguém avisar: não se oferece.
  const partes = useMemo(() => new Set(r.descendentes(id)), [r, id])
  const todos = useMemo(() => new Set(r.caminho(id)), [r, id])
  const validas = useMemo(() => opcoes.filter((o) => o.id !== id && !partes.has(o.id) && !todos.has(o.id) && podeMesclar(r, id, o.id) === null), [opcoes, id, partes, todos, r])
  const aviso = useMemo(() => {
    const presas = opcoes.filter((o) => partes.has(o.id) || todos.has(o.id))
    if (presas.length === 0) return undefined
    return (t: string): string | null => {
      const d = dobrar(t)
      const achada = presas.find((o) => dobrar(o.rotulo).includes(d) || (o.apoio ? dobrar(o.apoio).includes(d) : false))
      if (!achada) return null
      return partes.has(achada.id)
        ? `${achada.rotulo} é parte de ${aqui}: para juntá-los, primeiro solte a parte.`
        : `${aqui} é parte de ${achada.rotulo}: para juntá-los, primeiro solte a parte.`
    }
  }, [opcoes, partes, todos, aqui])
  // O campo de escolha abre com o foco nele.
  useEffect(() => caixa.current?.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus(), [])
  return (
    <div ref={caixa} role="group" aria-labelledby={tituloId} className="sitio-confirmar sitio-mesclar">
      <p id={tituloId} className="sitio-mesclar-titulo">
        Mesclar {aqui} com outro sítio
      </p>
      <CampoDeEscolha
        rotulo="Com qual sítio?"
        valor={texto}
        aoMudarTexto={setTexto}
        opcoes={validas}
        aoEscolher={(o: OpcaoDeEscolha) => aoEscolher(o.id)}
        ajuda="Procura no nome, no nome do livro e nas outras grafias, com ou sem diacríticos."
        aviso={aviso}
      />
      <div className="sitio-confirmar-botoes">
        <button type="button" className="form-botao" onClick={aoFechar}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

/** b) Qual fica, e c) a confirmação, na mesma caixa. */
function QualFica({ id, outro, sobre, aoFechar }: { id: string; outro: string; sobre: SobreOsSitios; aoFechar: () => void }) {
  // M-1: um sítio seu publicado (`SI-…` → `<SIGLA>-<n>`) continua seu: o do livro é sugerido antes dele (decisão 2).
  const lado = (x: string) => ({ id: x, doLivro: !sobre.resolucao.eDoUsuario(x), criadoEm: sobre.criadoEm(x) })
  const sugestao = sugestaoDeQualFica(lado(id), lado(outro))
  const [fica, setFica] = useState(sugestao.fica)
  const [gravando, setGravando] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const cancelar = useRef<HTMLButtonElement>(null)
  const tituloId = useId()
  const nomeDoGrupo = useId()
  useEffect(() => cancelar.current?.focus(), [])

  const entra = fica === id ? outro : id
  const nomeFica = sobre.nome(fica)
  const nomeEntra = sobre.nome(entra)
  const coordenada = sobre.temCoordenada(fica) ? 'fica' : sobre.temCoordenada(entra) ? 'entra' : null
  const linhas = textoDaMescla(nomeFica, nomeEntra, [nomeEntra, ...sobre.fontes.grafiasDe(entra)], sobre.conteudo(entra), coordenada)
  const mesclar = () => {
    setFalhou(false)
    setGravando(true)
    // Só quando o sítio da página é o que entra: é ele que sai da tela.
    anunciada = entra === id ? { entra, fica, nomeFica, nomeEntra } : null
    mesclarSitios(fica, entra).then(aoFechar, () => {
      anunciada = null
      setGravando(false)
      setFalhou(true)
    })
  }
  return (
    <div role="group" aria-labelledby={tituloId} className="sitio-confirmar sitio-mesclar">
      <p id={tituloId} className="sitio-mesclar-titulo">
        Mesclar {sobre.nome(id)} e {sobre.nome(outro)}
      </p>
      <fieldset className="sitio-mesclar-qual">
        <legend>Qual fica?</legend>
        <p className="sitio-mesclar-sugestao">{sugestao.motivo === 'livro' ? 'Sugestão: o do livro fica.' : 'Sugestão: o de número menor, que entrou primeiro.'}</p>
        <div className="sitio-mesclar-dois">
          {[id, outro].map((x) => (
            <label key={x} className="sitio-mesclar-opcao">
              <span className="sitio-mesclar-opcao-topo">
                <input type="radio" name={nomeDoGrupo} value={x} checked={fica === x} onChange={() => setFica(x)} />
                <span className="sitio-mesclar-nome">{sobre.nome(x)}</span>
              </span>
              <span className="sitio-mesclar-apoio">{sobre.resolucao.eDoUsuario(x) ? 'seu' : 'dos livros'}</span>
              <span className="sitio-mesclar-apoio codigo">{x}</span>
              <span className="sitio-mesclar-apoio">{objetos(sobre.conteudo(x).objetos)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div aria-live="polite">
        <p>
          {nomeFica} fica. {nomeEntra} entra nele:
        </p>
        <ul className="sitio-mesclar-lista">
          {linhas.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
      <p>Nada é copiado. Dá para desfazer depois, na página de {nomeFica}.</p>
      {falhou && (
        <p className="form-erro" role="alert">
          {ERRO}
        </p>
      )}
      <div className="sitio-confirmar-botoes">
        <button ref={cancelar} type="button" className="form-botao" onClick={aoFechar}>
          Cancelar
        </button>
        <button type="button" className="form-botao form-botao-forte" disabled={gravando} onClick={mesclar}>
          Mesclar
        </button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------------------------- a página do sítio que ficou (§2, §7)

/**
 * A linha «Mesclado aqui» nos dados do sítio: um por absorvido (diretos e indiretos), o nome (abre a página dele, que volta aqui
 * com o aviso), «(seu)» ou «(dos livros)» e «desfazer». A confirmação abre logo abaixo da linha, com o foco em «Cancelar»; ao
 * fechar, o foco volta ao «desfazer». Desfeita, `aoDesfazer` (a página mostra a mensagem com «Ver»).
 */
export function MescladoAqui({ id, sobre, aoAbrir, aoDesfazer }: { id: string; sobre: SobreOsSitios; aoAbrir: () => void; aoDesfazer: (entra: string, nome: string) => void }) {
  const redirecionados = useRedirecionamentos()
  const absorvidos = sobre.resolucao.absorvidos(id)
  const [aberto, setAberto] = useState<string | null>(null)
  const [gravando, setGravando] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const gatilhos = useRef(new Map<string, HTMLButtonElement>())
  const cancelar = useRef<HTMLButtonElement>(null)
  const ultimo = useRef<string | null>(null)
  useEffect(() => {
    if (aberto) {
      ultimo.current = aberto
      cancelar.current?.focus()
    } else if (ultimo.current) {
      gatilhos.current.get(ultimo.current)?.focus()
      ultimo.current = null
    }
  }, [aberto])
  const fica = sobre.nome(id)
  return (
    <ul className="sitio-mesclados">
      {absorvidos.map((x) => {
        const nome = sobre.nome(x)
        return (
          <li key={x}>
            <span className="sitio-mesclado">
              <Link to={`/sitio/${encodeURIComponent(x)}`}>{nome}</Link>
              <span>({sobre.resolucao.eDoUsuario(x) ? 'seu' : 'dos livros'})</span>
              <button
                ref={(b) => {
                  if (b) gatilhos.current.set(x, b)
                  else gatilhos.current.delete(x)
                }}
                type="button"
                className="sitio-link-botao"
                aria-expanded={aberto === x}
                aria-label={`desfazer a mesclagem de ${nome}`}
                onClick={() => {
                  setFalhou(false)
                  aoAbrir()
                  setAberto((a) => (a === x ? null : x))
                }}
              >
                desfazer
              </button>
            </span>
            {aberto === x && (
              <div role="group" aria-label={`Desfazer a mesclagem de ${nome}?`} className="sitio-confirmar sitio-desfazer">
                <p>{textoDoDesfazer(nome, fica, sobre.conteudo(x))}</p>
                {falhou && (
                  <p className="form-erro" role="alert">
                    {ERRO}
                  </p>
                )}
                <div className="sitio-confirmar-botoes">
                  <button ref={cancelar} type="button" className="form-botao" onClick={() => setAberto(null)}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="form-botao form-botao-forte"
                    disabled={gravando}
                    onClick={() => {
                      setFalhou(false)
                      setGravando(true)
                      // Os `SI-…` publicados como ele que também escreveram a mescla voltam junto.
                      desfazerMescla(x, eSitioSkc(x) ? [] : origensDe(redirecionados, x)).then(
                        () => {
                          setGravando(false)
                          ultimo.current = null
                          setAberto(null)
                          aoDesfazer(x, nome)
                        },
                        () => {
                          setGravando(false)
                          setFalhou(true)
                        },
                      )
                    }}
                  >
                    Desfazer
                  </button>
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** A chave do «Entendi» de um conflito, neste aparelho. */
export const chaveDoConflito = (cf: Conflito): string => `iconodb:conflito-sitio:${cf.registro}:${cf.hlc}`

function entendido(cf: Conflito): boolean {
  try {
    return localStorage.getItem(chaveDoConflito(cf)) === '1'
  } catch {
    return false
  }
}

/**
 * O aviso de conflito (§7) na página de um sítio da decisão que este aparelho perdeu (os dois de uma mescla dão no mesmo
 * destino; numa parte, os dois sítios). «Entendi» o esconde para sempre neste aparelho (`localStorage`; sem armazenamento, o
 * aviso volta na próxima abertura).
 */
export function AvisosDeConflito({ id, sobre, aoEntender }: { id: string; sobre: SobreOsSitios; aoEntender?: () => void }) {
  const aparelho = useEsteAparelho()
  const [escondidos, setEscondidos] = useState<ReadonlySet<string>>(new Set())
  if (!aparelho) return null
  const r = sobre.resolucao
  const conflitos = conflitosDesteAparelho(r, aparelho).filter(
    (cf) => (r.destino(cf.registro) === id || r.destino(cf.valor) === id) && !escondidos.has(chaveDoConflito(cf)) && !entendido(cf),
  )
  return conflitos.map((cf) => (
    <div key={chaveDoConflito(cf)} className="sitio-caixa-aviso sitio-conflito" role="status">
      <span>{textoDoConflito(cf, sobre.nome)}</span>
      <span className="sitio-links">
        <Link to="/sincronizacao#sync-hist">Ver no histórico</Link>
        <button
          type="button"
          className="sitio-link-botao"
          onClick={() => {
            try {
              localStorage.setItem(chaveDoConflito(cf), '1')
            } catch {
              // sem armazenamento: some agora e volta na próxima abertura
            }
            setEscondidos((s) => new Set([...s, chaveDoConflito(cf)]))
            // o aviso (com o botão que tinha o foco) sai: o foco vai a um lugar que fica (o título da página)
            aoEntender?.()
          }}
        >
          Entendi
        </button>
      </span>
    </div>
  ))
}
