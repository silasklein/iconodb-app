/**
 * O grupo «Sítios que podem ser o mesmo» da Revisão (Parte 2C, bloco 2, Tarefa 15; telas aprovadas §6). Os pares que o
 * processamento sugere (src/revisao/pares.ts), um por linha, que abrem e fecham como os grupos (o que está aberto fica no
 * endereço, em `?abrir=`). Aberto, um par mostra os dois sítios lado a lado (também no celular), o motivo e três saídas:
 * - «Mesclar…» leva à página do sugerido para ficar já em «Qual fica?» (`/sitio/<fica>?mesclar=<outro>`; no computador, o
 *   painel da direita da lista de sítios);
 * - «São lugares diferentes» grava na hora (`diferentesDe` no de menor id);
 * - «Um é parte do outro…» troca os três botões, ali mesmo, pela escolha «Qual é a parte?» (marcada a que faz do sugerido para
 *   ficar o todo; o foco em «Cancelar»; ao fechar, o foco volta ao gatilho).
 * Decidido, o par sai dos abertos e vai para «Resolvidos por você», com «Desfazer»; o aviso da página (com a tecla U) desfaz o
 * último. A conta dos abertos é a mesma do total (useFila: `paresAbertos`).
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useRedirecionamentos } from '../pacote/redirecionamentos'
import {
  APOIO_DOS_PARES,
  chaveDoPar,
  desfazerDiferentesDoPar,
  desfazerPar,
  ID_DOS_PARES,
  ladosEmOrdem,
  ladosDoPar,
  motivoDoPar,
  O_QUE_DO_PAR,
  ROTULO_DOS_PARES,
  TEXTO_DO_RESOLVIDO,
  type ParResolvido,
} from '../revisao/pares'
import type { ParesDaFila } from '../revisao/useFila'
import { contagemDoSitio, dadosDoDestino } from '../sitios/contagem'
import { useSobreOsSitios, type SobreOsSitios } from '../sitios/Mesclar'
import { marcarComoDiferentes, marcarComoParte, soltarParte } from '../sitios/operacoes'
import { campoEscrito, grafiasDoSitio, podeSerParte, type PacoteDeSitios, type ParSugerido, type Resolucao } from '../sitios/resolucao'
import { Icon } from '../ui/Icon'
import { numeroPtBr } from '../ui/numero'
import { estadoAtual } from '../usuario/estado'
import { coordenadaEmGraus } from './coordenada'
import '../objetos-skc/Formulario.css'
import '../sitios/Sitios.css'
import './Revisao.css'

/** O que o aviso da página guarda de uma decisão: o texto e como desfazê-la (a tecla U chama `desfazer`). */
export interface Decisao {
  chave: string
  texto: string
  desfazer: () => Promise<unknown>
}

interface Props {
  pares: ParesDaFila
  /** O grupo aberto? */
  aberto: boolean
  /** Os pares abertos (as chaves em `?abrir=`). */
  abertos: ReadonlySet<string>
  aoAbrir: (id: string, aberto: boolean) => void
  /** Decidido um par: a página mostra o aviso (com «Desfazer») e leva o foco ao vizinho (ou ao grupo). */
  aoDecidir: (d: Decisao, vizinho: string | null) => void
  /** Desfeito pela linha de «Resolvidos por você»: a página tira o aviso, se era dele, e leva o foco ao par. */
  aoDesfazer: (chave: string) => void
  aoFalhar: () => void
}

export function GrupoDosPares({ pares, aberto, abertos, aoAbrir, aoDecidir, aoDesfazer, aoFalhar }: Props) {
  const sobre = useSobreOsSitios()
  const redirecionados = useRedirecionamentos()
  const idLista = `revisao-casos-${ID_DOS_PARES}`
  const quantos = pares.abertos.length
  const r = pares.resolucao
  const criadoEm = (id: string) => sobre?.criadoEm(id) ?? ''
  const nome = (id: string) => sobre?.nome(id) ?? id

  const desfazerResolvido = (x: ParResolvido) => {
    desfazerPar(x.par, x.como, { estado: estadoAtual(), pacote: pares.pacote, resolucao: r, redirecionados, criadoEm }).then(
      () => aoDesfazer(chaveDoPar(x.par)),
      aoFalhar,
    )
  }

  return (
    <>
      <button type="button" className="revisao-grupo-cabeca" aria-expanded={aberto} aria-controls={idLista} onClick={() => aoAbrir(ID_DOS_PARES, !aberto)}>
        <span className="revisao-grupo-nome">
          <span className="revisao-grupo-rotulo">{ROTULO_DOS_PARES}</span>
          <span className="revisao-grupo-apoio">{APOIO_DOS_PARES}</span>
        </span>
        <span className="revisao-grupo-fim">
          <span className="codigo revisao-grupo-quantidade">{numeroPtBr(quantos)}</span>
          <Icon name={aberto ? 'recolher' : 'adicionar'} size={16} />
        </span>
      </button>
      {aberto && (
        <div id={idLista} className="revisao-casos" aria-busy={sobre ? undefined : true}>
          {sobre && quantos > 0 && (
            <ul aria-label={`Pares de ${ROTULO_DOS_PARES}`}>
              {pares.abertos.map((p, i) => {
                const chave = chaveDoPar(p)
                const vizinho = pares.abertos[i + 1] ?? pares.abertos[i - 1] ?? null
                return (
                  <Par
                    key={chave}
                    par={p}
                    r={r}
                    pacote={pares.pacote}
                    sobre={sobre}
                    aberto={abertos.has(chave)}
                    aoAbrir={(a) => aoAbrir(chave, a)}
                    aoDecidir={(d) => aoDecidir(d, vizinho ? chaveDoPar(vizinho) : null)}
                    aoFalhar={aoFalhar}
                  />
                )
              })}
            </ul>
          )}
          {sobre && pares.resolvidos.length > 0 && (
            <>
              <h3 className="revisao-resolvidos-titulo">Resolvidos por você · {numeroPtBr(pares.resolvidos.length)}</h3>
              <ul aria-label={`Resolvidos de ${ROTULO_DOS_PARES}`}>
                {pares.resolvidos.map((x) => {
                  // Os nomes dos dois sítios do par (não os destinos: dois mesclados dariam o mesmo nome duas vezes).
                  const { fica, outro } = ladosEmOrdem(r.canonico(x.par.a), r.canonico(x.par.b), criadoEm, r.eDoUsuario)
                  const nomes = `${nome(fica)} e ${nome(outro)}`
                  return (
                    <li key={chaveDoPar(x.par)} className="revisao-par-resolvido" data-chave={chaveDoPar(x.par)}>
                      <span className="revisao-par-resolvido-texto">
                        {nomes}
                        <small>{TEXTO_DO_RESOLVIDO[x.como]}</small>
                      </span>
                      <button type="button" className="revisao-desfazer" aria-label={`Desfazer: ${nomes}`} onClick={() => desfazerResolvido(x)}>
                        <Icon name="desfazer" size={16} />
                        Desfazer
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  )
}

interface PropsDoPar {
  par: ParSugerido
  r: Resolucao
  pacote: PacoteDeSitios
  sobre: SobreOsSitios
  aberto: boolean
  aoAbrir: (aberto: boolean) => void
  aoDecidir: (d: Decisao) => void
  aoFalhar: () => void
}

function Par({ par, r, pacote, sobre, aberto, aoAbrir, aoDecidir, aoFalhar }: PropsDoPar) {
  const chave = chaveDoPar(par)
  const { fica, outro } = ladosDoPar(r, par, sobre.criadoEm)
  const nomeFica = sobre.nome(fica)
  const nomeOutro = sobre.nome(outro)
  const [escolhendo, setEscolhendo] = useState(false)
  const [gravando, setGravando] = useState(false)
  const gatilho = useRef<HTMLButtonElement>(null)
  const escolheu = useRef(false)
  useEffect(() => {
    if (escolhendo) escolheu.current = true
    else if (escolheu.current) {
      escolheu.current = false
      gatilho.current?.focus()
    }
  }, [escolhendo])
  const idDoCorpo = `revisao-par-${chave}`

  const decidir = (gravar: () => Promise<unknown>, d: Omit<Decisao, 'chave'>) => {
    setGravando(true)
    gravar().then(
      () => aoDecidir({ chave, ...d }),
      () => {
        setGravando(false)
        aoFalhar()
      },
    )
  }
  const diferentes = () =>
    // Revisão 2 (N1 + N2): uma cópia só, nos ids do par (no de menor id). A resolução lê o par respondido pelos ids do par e
    // pelos destinos, então uma mescla (ou o desfazer de uma) depois não reabre a pergunta. O «Desfazer» tira essa cópia.
    decidir(() => marcarComoDiferentes(r.canonico(par.a), r.canonico(par.b), estadoAtual()), {
      texto: `${nomeFica} e ${nomeOutro}: lugares diferentes.`,
      desfazer: () => desfazerDiferentesDoPar(par, pacote),
    })
  const parte = (aParte: string, oTodo: string) => {
    // F14: o «Desfazer» grava de volta o `parteDe` que vale agora (o dele, o de um `SI-…` publicado como ele, senão o do pacote)
    const antes = campoEscrito(estadoAtual(), pacote, aParte, 'parteDe')
    escolheu.current = false // o par sai da lista: o foco vai ao vizinho, não ao gatilho
    decidir(() => marcarComoParte(aParte, oTodo), {
      texto: `${nomeFica} e ${nomeOutro}: ${TEXTO_DO_RESOLVIDO.parte}.`,
      desfazer: () => (antes === null ? soltarParte(aParte) : marcarComoParte(aParte, antes)),
    })
  }

  return (
    <li className="revisao-par" data-chave={chave}>
      <button type="button" className="revisao-par-cabeca" aria-expanded={aberto} aria-controls={idDoCorpo} onClick={() => aoAbrir(!aberto)}>
        <span className="revisao-par-cabeca-texto">
          <span className="revisao-par-o-que">{O_QUE_DO_PAR}</span>
          {/* M-4: «você deu» só quando um id do próprio par é seu (o par veio de um nome seu); os lados são os destinos, e um par de
              dois do livro com um lado mesclado num sítio seu continua sendo uma grafia do livro (re-revisão). */}
          <span className="revisao-par-motivo">
            {motivoDoPar(par.motivo, nomeFica, nomeOutro, aberto, (r.eDoUsuario(par.a) || r.eDoUsuario(par.b)) && r.eDoUsuario(outro) && !r.eDoUsuario(fica))}
          </span>
          {!aberto && (
            <span className="revisao-par-nomes">
              {nomeFica} e {nomeOutro}
            </span>
          )}
        </span>
        <Icon name={aberto ? 'recolher' : 'adicionar'} size={16} />
      </button>
      {aberto && (
        <div id={idDoCorpo} className="revisao-par-corpo">
          <div className="revisao-par-lados">
            <Lado id={fica} r={r} pacote={pacote} sobre={sobre} />
            <Lado id={outro} r={r} pacote={pacote} sobre={sobre} />
          </div>
          {escolhendo ? (
            <QualEAParte fica={fica} outro={outro} nomeFica={nomeFica} nomeOutro={nomeOutro} r={r} gravando={gravando} aoCancelar={() => setEscolhendo(false)} aoMarcar={parte} />
          ) : (
            <div className="revisao-par-botoes">
              <Link className="form-botao form-botao-forte" to={`/sitio/${encodeURIComponent(fica)}?mesclar=${encodeURIComponent(outro)}`}>
                Mesclar…
              </Link>
              <button type="button" className="form-botao" disabled={gravando} onClick={diferentes}>
                São lugares diferentes
              </button>
              <button ref={gatilho} type="button" className="form-botao" disabled={gravando} onClick={() => setEscolhendo(true)}>
                Um é parte do outro…
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

/** Um lado do par: o nome (abre a página do sítio) e as linhas «De onde», «Grafias», «Coordenada» e «Objetos». */
function Lado({ id, r, pacote, sobre }: { id: string; r: Resolucao; pacote: PacoteDeSitios; sobre: SobreOsSitios }) {
  const nome = sobre.nome(id)
  const grafias = grafiasDoSitio(r, id, pacote, sobre.nome, sobre.nomeDoLivro).map((g) => g.texto)
  const c = dadosDoDestino(r, id, sobre.dadosDe).coordenada
  const [lat, lon] = c ? coordenadaEmGraus(c.lat, c.lon, 5).split(' · ') : []
  const objetos = contagemDoSitio(r, id, sobre.fontes.objetosDe).total
  return (
    <div className="revisao-lado" role="group" aria-label={nome}>
      <Link className="revisao-lado-nome" to={`/sitio/${encodeURIComponent(id)}`}>
        {nome}
      </Link>
      <dl>
        <div>
          <dt>De onde</dt>
          <dd>
            {r.eDoUsuario(id) ? 'seu' : 'dos livros'}
            <br />
            <span className="codigo">{id}</span>
          </dd>
        </div>
        <div>
          <dt>Grafias</dt>
          <dd>{grafias.length > 0 ? grafias.join(', ') : 'nenhuma'}</dd>
        </div>
        <div>
          <dt>Coordenada</dt>
          <dd className={c ? 'codigo' : undefined}>
            {c ? (
              <>
                {lat}
                <br />
                {lon}
              </>
            ) : (
              'sem coordenada'
            )}
          </dd>
        </div>
        <div>
          <dt>Objetos</dt>
          <dd>{numeroPtBr(objetos)}</dd>
        </div>
      </dl>
    </div>
  )
}

/** «Qual é a parte?», no lugar dos três botões: as duas opções (marcada a que faz do sugerido para ficar o todo). */
function QualEAParte(props: {
  fica: string
  outro: string
  nomeFica: string
  nomeOutro: string
  r: Resolucao
  gravando: boolean
  aoCancelar: () => void
  aoMarcar: (parte: string, todo: string) => void
}) {
  const { fica, outro, nomeFica, nomeOutro, r, gravando, aoCancelar, aoMarcar } = props
  const [parte, setParte] = useState(outro)
  const cancelar = useRef<HTMLButtonElement>(null)
  const tituloId = useId()
  const nomeDoGrupo = useId()
  useEffect(() => cancelar.current?.focus(), [])
  const todo = parte === outro ? fica : outro
  const opcoes = [
    { parte: outro, texto: `${nomeOutro} é parte de ${nomeFica}` },
    { parte: fica, texto: `${nomeFica} é parte de ${nomeOutro}` },
  ]
  return (
    <div role="group" aria-labelledby={tituloId} className="sitio-confirmar revisao-par-parte">
      <p id={tituloId} className="revisao-par-parte-titulo">
        Qual é a parte?
      </p>
      <div className="revisao-par-opcoes">
        {opcoes.map((o) => (
          <label key={o.parte} className="revisao-par-opcao">
            <input type="radio" name={nomeDoGrupo} value={o.parte} checked={parte === o.parte} onChange={() => setParte(o.parte)} />
            {o.texto}
          </label>
        ))}
      </div>
      <div className="sitio-confirmar-botoes">
        <button ref={cancelar} type="button" className="form-botao" onClick={aoCancelar}>
          Cancelar
        </button>
        <button type="button" className="form-botao form-botao-forte" disabled={gravando || podeSerParte(r, parte, todo) !== null} onClick={() => aoMarcar(parte, todo)}>
          Marcar como parte
        </button>
      </div>
    </div>
  )
}
