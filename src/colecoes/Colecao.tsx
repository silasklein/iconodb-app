import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import { Link } from 'react-router'
import { MAXIMO_DA_LISTA } from '../busca/url'
import { NotasDoAlvo } from '../notas/NotasDoAlvo'
import { useIndiceDeNotas } from '../notas/useIndiceDeNotas'
import { useCampoSalvo } from '../usuario/campoSalvo'
import { estadoAtual } from '../usuario/estado'
import { useSitiosVivos } from '../sitios/doUsuario'
import type { ObjetoResumo } from '../banco/tipos'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { MiniaturaDoObjeto } from '../imagens-usuario/MiniaturaDoObjeto'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint } from '../ui/useBreakpoint'
import { numeroPtBr } from '../ui/numero'
import { extrairCodigos, type ColecaoVista, type Lugar } from './modelo'
import { resolverMembros, useMembrosResolvidos, type MembrosResolvidos } from './membros'
import { refDoAlvoDoItem } from './notas'
import { acrescentarMembros, devolverMembro, excluirColecao, renomearColecao, restaurarColecao, tirarMembro, validarNome } from './operacoes'
import { estadoDaColecao } from './origem'
import { useOrdenacao, type Ordenacao } from './ordenacao'
import { gravarModoDaColecao, lerModoDaColecao, MODOS_DA_COLECAO, type ModoDaColecao } from './preferencia'
import { useColecao } from './useColecoes'
import './Colecao.css'

const ROTULO_DO_MODO: Record<ModoDaColecao, string> = { lista: 'Lista', miniaturas: 'Miniaturas' }
const MSG_FALHA = 'Não foi possível guardar a mudança; tente de novo.'
const objetos = (n: number) => `${numeroPtBr(n)} ${n === 1 ? 'objeto' : 'objetos'}`

interface Aviso {
  texto: string
  desfazer?: () => Promise<void>
}

/**
 * Uma coleção SKC aberta como grupo (`/grupo/CO-…`): o nome, as contagens e os objetos na ordem que o usuário
 * escolheu, em lista ou em miniaturas (lembrado neste aparelho). Dá para renomear no lugar, excluir (reversível),
 * tirar objetos (com Desfazer), acrescentar por código, reordenar (arrastar, Alt+↑/↓ ou "pegar") e escrever uma nota
 * por objeto, com o mesmo editor das notas da Tarefa 6.
 */
export function Colecao({ id }: { id: string }) {
  const c = useColecao(id)
  if (!c) {
    return (
      <div className="colecao">
        <TopoDoCelular voltar={{ href: '#/colecoes', rotulo: 'Voltar às coleções' }} />
        <div className="colecao-aviso" role="status">
          <p>Coleção não encontrada.</p>
          <p>
            <Link to="/colecoes">Ver as coleções</Link>
          </p>
        </div>
      </div>
    )
  }
  return <ColecaoAberta key={c.id} c={c} />
}

function ColecaoAberta({ c }: { c: ColecaoVista }) {
  const computador = useBreakpoint() === 'computador'
  const refs = useMemo(() => c.membros.map((m) => m.ref), [c.membros])
  const resolvidos = useMembrosResolvidos(refs)
  const ord = useOrdenacao(c.id, refs)
  const [modo, setModo] = useState<ModoDaColecao>(() => lerModoDaColecao())
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const [renomeando, setRenomeando] = useState(false)
  const botaoRenomear = useRef<HTMLButtonElement>(null)
  const campoDoCodigo = useRef<HTMLTextAreaElement>(null)
  const [focarDepoisDeTirar, setFocarDepoisDeTirar] = useState<number | null>(null)
  const nome = c.nome || 'Coleção sem nome'
  const grade = modo === 'miniaturas'

  const escolherModo = (m: ModoDaColecao) => {
    setModo(m)
    gravarModoDaColecao(m)
  }

  const tentar = async (acao: () => Promise<void>): Promise<boolean> => {
    setFalha(null)
    try {
      await acao()
      return true
    } catch {
      setFalha(MSG_FALHA)
      return false
    }
  }

  // Depois de tirar um objeto o foco vai para a linha que ocupou o lugar dele (ou para o campo de códigos).
  useEffect(() => {
    if (focarDepoisDeTirar === null) return
    const linhas = [...(ord.lista.current?.children ?? [])]
    const alvo = linhas[Math.min(focarDepoisDeTirar, linhas.length - 1)]
    if (alvo) alvo.querySelector<HTMLElement>('[data-puxador]')?.focus()
    else campoDoCodigo.current?.focus()
    setFocarDepoisDeTirar(null)
  }, [refs]) // eslint-disable-line react-hooks/exhaustive-deps

  const tirar = async (ref: string) => {
    const indice = ord.ordem.indexOf(ref)
    let anterior: Lugar | null = null
    const ok = await tentar(async () => {
      anterior = await tirarMembro(c.id, ref)
    })
    if (!ok) return
    setAviso({ texto: `${ref} tirado da coleção`, desfazer: async () => (anterior === null ? undefined : devolverMembro(c.id, ref, anterior)) })
    setFocarDepoisDeTirar(Math.max(indice, 0))
  }

  const desfazer = async () => {
    const a = aviso
    if (!a?.desfazer) return
    if (await tentar(a.desfazer)) setAviso(null)
  }

  const contexto = useMemo(() => {
    const numeros = refs.filter((r) => resolvidos.get(r) !== null).map((r) => resolvidos.get(r)?.numero ?? r)
    return { numeros, base: estadoDaColecao(c.id, nome, numeros) }
  }, [refs, resolvidos, c.id, nome])
  const estadoPara = (numero: string) => (contexto.numeros.length <= MAXIMO_DA_LISTA ? contexto.base : estadoDaColecao(c.id, nome, contexto.numeros, numero))

  const alternarExclusao = async () => {
    await tentar(async () => {
      if (c.excluida) await restaurarColecao(c.id)
      else await excluirColecao(c.id)
    })
  }

  return (
    <div className="colecao">
      <TopoDoCelular voltar={{ href: '#/colecoes', rotulo: 'Voltar às coleções' }} />
      {computador && (
        <nav aria-label="Trilha" className="colecao-trilha">
          <Link className="hit" to="/colecoes">
            Coleções
          </Link>{' '}
          · SKC
        </nav>
      )}

      <main className="colecao-corpo">
        <span className="colecao-etiqueta">SKC · Coleção</span>
        <Titulo c={c} nome={nome} renomeando={renomeando} setRenomeando={setRenomeando} botao={botaoRenomear} aoFalhar={setFalha} />

        {!c.excluida && <Descricao key={c.id} c={c} aoFalhar={setFalha} />}

        <dl className="colecao-contagens" role="group" aria-label="O que há na coleção">
          <div>
            <dt>Objetos</dt>
            <dd>{numeroPtBr(refs.length)}</dd>
          </div>
        </dl>

        {c.excluida ? (
          <p className="colecao-excluida" role="status">
            Coleção «{nome}» excluída. Os objetos e as notas continuam guardados.{' '}
            <button type="button" className="colecao-acao" onClick={() => void alternarExclusao()}>
              <Icon name="desfazer" size={18} />
              Restaurar coleção
            </button>
          </p>
        ) : (
          <div className="colecao-acoes">
            <button type="button" className="colecao-acao" onClick={() => void alternarExclusao()}>
              <Icon name="excluir" size={18} />
              Excluir coleção
            </button>
          </div>
        )}

        {falha && (
          <p className="colecao-erro" role="alert">
            {falha}
          </p>
        )}

        {!c.excluida && (
          <>
            <div className="colecao-ferramentas">
              <div className="colecao-modo" role="group" aria-label="Modo de exibição">
                {MODOS_DA_COLECAO.map((m) => (
                  <button key={m} type="button" aria-pressed={modo === m} onClick={() => escolherModo(m)}>
                    {ROTULO_DO_MODO[m]}
                  </button>
                ))}
              </div>
            </div>

            <div className="colecao-aviso-vivo" role="status" aria-live="polite">
              {aviso && (
                <>
                  {aviso.texto}
                  {aviso.desfazer && (
                    <>
                      {' · '}
                      <button type="button" className="colecao-desfazer" onClick={() => void desfazer()}>
                        Desfazer
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="so-leitor" data-testid="anuncio">
              <div role="status" aria-live="polite">
                {ord.anuncio.no === 0 ? ord.anuncio.texto : ''}
              </div>
              <div role="status" aria-live="polite">
                {ord.anuncio.no === 1 ? ord.anuncio.texto : ''}
              </div>
            </div>

            {ord.ordem.length === 0 ? (
              <p className="colecao-vazio">Nenhum objeto ainda. Abra um objeto e toque em «Adicionar à coleção», ou cole códigos abaixo.</p>
            ) : (
              <ul ref={ord.lista} role="list" aria-label="Itens da coleção" className={grade ? 'colecao-grade' : 'colecao-lista'} data-arrastando={ord.arrastando ? '' : undefined}>
                {ord.ordem.map((ref, i) => (
                  <Linha
                    key={ref}
                    colecao={c}
                    ref_={ref}
                    posicao={i + 1}
                    total={ord.ordem.length}
                    resumo={resolvidos.get(ref)}
                    grade={grade}
                    ord={ord}
                    estadoPara={estadoPara}
                    aoTirar={() => void tirar(ref)}
                  />
                ))}
              </ul>
            )}

            <AdicionarPorCodigo
              colecao={c}
              campo={campoDoCodigo}
              aoAdicionar={(a) => setAviso(a)}
            />
          </>
        )}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------

/** Nome de uma linha só: qualquer sequência de espaços, tabs e quebras vira um único espaço (como o título mostra). */
const umaLinha = (s: string) => s.replace(/\s+/g, ' ')

function Titulo({
  c,
  nome,
  renomeando,
  setRenomeando,
  botao,
  aoFalhar,
}: {
  c: ColecaoVista
  nome: string
  renomeando: boolean
  setRenomeando: (v: boolean) => void
  botao: RefObject<HTMLButtonElement | null>
  aoFalhar: (m: string | null) => void
}) {
  const nomeAtual = umaLinha(c.nome)
  const [texto, setTexto] = useState(nomeAtual)
  const [erro, setErro] = useState<string | null>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const idCampo = useId()
  const idErro = useId()
  const estavaRenomeando = useRef(false)

  useEffect(() => {
    if (renomeando) {
      setTexto(nomeAtual)
      setErro(null)
      campo.current?.focus()
      campo.current?.select()
    } else {
      setTexto(nomeAtual)
      if (estavaRenomeando.current) botao.current?.focus()
    }
    estavaRenomeando.current = renomeando
  }, [renomeando]) // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = async (e?: FormEvent) => {
    e?.preventDefault()
    const problema = validarNome(texto)
    if (problema) {
      setErro(problema)
      campo.current?.focus()
      return
    }
    aoFalhar(null)
    try {
      if (texto.trim() !== nomeAtual.trim()) await renomearColecao(c.id, texto)
      setRenomeando(false)
    } catch {
      aoFalhar(MSG_FALHA)
    }
  }
  const teclar = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setRenomeando(false)
    } else if (e.key === 'Enter') {
      // O nome é de uma linha só: nenhuma quebra de linha entra (Enter grava; Shift+Enter não faz nada).
      e.preventDefault()
      // Composição (IME): o Enter confirma a palavra; o Safari a sinaliza com keyCode 229 em vez de isComposing.
      if (!e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) void salvar()
    }
  }

  if (!renomeando) {
    return (
      <div className="colecao-titulo">
        <h1>{nome}</h1>
        <div className="colecao-titulo-botoes">
          <button ref={botao} type="button" className="colecao-acao" onClick={() => setRenomeando(true)}>
            <Icon name="escrever" size={18} />
            Renomear
          </button>
          {/* Reserva a largura de «Salvar nome · Cancelar»: o título quebra do mesmo jeito com o campo aberto ou fechado. */}
          <span className="colecao-titulo-reserva" aria-hidden="true">
            <span className="colecao-acao">Salvar nome</span>
            <span className="colecao-acao">Cancelar</span>
          </span>
        </div>
      </div>
    )
  }
  // Renomear no lugar: o campo ocupa a caixa do próprio título (mesma fonte, mesmo corpo, mesma altura) e «Salvar nome · Cancelar»
  // ocupam a linha do «Renomear». O texto escondido dá ao campo a largura do título, então nada ao lado se move.
  return (
    <form className="colecao-titulo colecao-renomear" onSubmit={(e) => void salvar(e)} noValidate>
      <div className="colecao-titulo-campo">
        <span className="colecao-titulo-fantasma" aria-hidden="true">
          {/* Dois textos no mesmo lugar: o campo tem a largura do maior, então nunca fica menor que o título nem pula na primeira letra. */}
          <span>{nomeAtual || ' '}</span>
          <span>{texto || ' '}</span>
        </span>
        <textarea
          ref={campo}
          id={idCampo}
          rows={1}
          spellCheck={false}
          aria-label="Nome da coleção"
          value={texto}
          autoComplete="off"
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? idErro : undefined}
          onChange={(e) => {
            const bruto = e.target.value
            const ini = e.target.selectionStart ?? bruto.length
            const fim = e.target.selectionEnd ?? ini
            const limpo = umaLinha(bruto)
            // O cursor acompanha o texto: fica depois do mesmo trecho, já com os espaços colapsados.
            if (limpo !== bruto) {
              const alvo = e.target
              const posicao = [umaLinha(bruto.slice(0, ini)).length, umaLinha(bruto.slice(0, fim)).length] as const
              // O React regrava o valor ao fim do evento e o navegador manda o cursor para o fim: repõe-no logo depois disso.
              queueMicrotask(() => {
                if (alvo.isConnected && alvo.value === limpo) alvo.setSelectionRange(posicao[0], posicao[1])
              })
            }
            setTexto(limpo)
            setErro(null)
          }}
          onKeyDown={teclar}
        />
      </div>
      <div className="colecao-titulo-botoes">
        <div className="colecao-renomear-botoes">
          <button type="submit" className="colecao-acao">
            Salvar nome
          </button>
          <button type="button" className="colecao-acao" onClick={() => setRenomeando(false)}>
            Cancelar
          </button>
        </div>
        <span className="colecao-titulo-reserva" aria-hidden="true">
          <span className="colecao-acao">
            <Icon name="escrever" size={18} />
            Renomear
          </span>
        </span>
      </div>
      {erro && (
        <p id={idErro} className="colecao-erro" role="alert">
          {erro}
        </p>
      )}
    </form>
  )
}

// ---------------------------------------------------------------------------------------------------------------

/**
 * A descrição da coleção (spec 3: "o nome, a descrição e os itens"), editada no lugar, sob o título. Vazia, é só um botão
 * discreto "Adicionar descrição". Grava sozinha 1 s depois de parar de digitar, ao sair do campo (blur), em Ctrl/⌘S, ao
 * sair da tela e, se a página for embora no meio, pela rede de segurança do pagehide: tudo isso é o `useCampoSalvo`.
 */
function Descricao({ c, aoFalhar }: { c: ColecaoVista; aoFalhar: (m: string | null) => void }) {
  const [aberto, setAberto] = useState(false)
  const campo = useRef<HTMLTextAreaElement>(null)
  const idCampo = useId()
  const { texto, setTexto, focado, aoFocar, aoDesfocar } = useCampoSalvo({
    tipo: 'colecao',
    reg: c.id,
    campo: 'descricao',
    valor: c.descricao,
    aoFalhar: (falhou) => aoFalhar(falhou ? MSG_FALHA : null),
  })

  useEffect(() => {
    if (aberto) campo.current?.focus()
  }, [aberto])

  if (!aberto && !focado && texto === '') {
    return (
      <button type="button" className="colecao-acao colecao-descricao-adicionar" onClick={() => setAberto(true)}>
        <Icon name="adicionar" size={18} />
        Adicionar descrição
      </button>
    )
  }
  return (
    <div className="colecao-descricao">
      <label htmlFor={idCampo}>Descrição</label>
      <textarea
        ref={campo}
        id={idCampo}
        rows={Math.min(8, Math.max(2, texto.split('\n').length))}
        value={texto}
        onFocus={aoFocar}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          setAberto(false)
          void aoDesfocar()
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------

function Linha({
  colecao,
  ref_,
  posicao,
  total,
  resumo,
  grade,
  ord,
  estadoPara,
  aoTirar,
}: {
  colecao: ColecaoVista
  ref_: string
  posicao: number
  total: number
  /** O resumo; `null` quando se sabe que o objeto não existe; `undefined` enquanto não se sabe. */
  resumo: ObjetoResumo | null | undefined
  grade: boolean
  ord: Ordenacao
  estadoPara: (numero: string) => unknown
  aoTirar: () => void
}) {
  const alvoDaNota = refDoAlvoDoItem(colecao.id, ref_)
  // O sítio de agora (Tarefa 12): o nome corrigido ou o sítio que a pessoa escolheu para o objeto; excluído, com a marca.
  const sitioVivo = useSitiosVivos(false).doResumo(resumo ?? { numero: ref_, sitio: null })
  const sitioDoResumo = resumo ? [sitioVivo.nome, sitioVivo.marca].filter(Boolean).join(' · ') : ''
  const pegado = ord.pegado === ref_
  const arrastando = ord.arrastando === ref_
  const props = ord.propsDoPuxador(ref_)

  const puxador = (
    <button
      type="button"
      className={`icon-button colecao-puxador${pegado ? ' icon-button-pressionado' : ''}`}
      data-puxador=""
      aria-label={`Mover ${ref_}`}
      aria-pressed={pegado}
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
      data-tip="Arrastar, ou Alt+↑ e Alt+↓ para mover"
      style={{ touchAction: 'none' }}
      {...props}
    >
      <Icon name="arrastar" size={20} />
    </button>
  )
  const tirar = <IconButton icon="fechar" label={`Tirar ${ref_} da coleção`} onClick={aoTirar} tipPosition="start" />
  const passos = pegado && (
    <span className="colecao-passos">
      <IconButton icon="subir" label={`Subir ${ref_}`} onClick={() => void ord.deslocar(ref_, -1)} tipPosition="start" />
      <IconButton icon="descer" label={`Descer ${ref_}`} onClick={() => void ord.deslocar(ref_, 1)} tipPosition="start" />
    </span>
  )

  const classe = ['colecao-item', pegado ? 'colecao-item-pegado' : '', arrastando ? 'colecao-item-arrastando' : ''].filter(Boolean).join(' ')

  const identidade =
    resumo === null ? (
      <span className="colecao-objeto colecao-objeto-ausente">
        <span className="colecao-numero codigo">{ref_}</span>
        <span className="colecao-tipo">Não encontrado</span>
      </span>
    ) : (
      <Link className="colecao-objeto" to={`/item/${encodeURIComponent(resumo?.numero ?? ref_)}`} state={estadoPara(resumo?.numero ?? ref_)}>
        {grade && (
          <span className="colecao-miniatura">
            {/* decorativa: o número e o tipo, ao lado, já dizem o que é */}
            <MiniaturaDoObjeto numero={resumo?.numero ?? ref_} caminho={resumo?.miniatura ?? null} alt="" />
          </span>
        )}
        <span className="colecao-texto">
          <span className="colecao-numero codigo">
            {resumo?.numero ?? ref_}
            {resumo?.skc && <span className="colecao-skc"> · SKC</span>}
          </span>
          {resumo && <span className="colecao-tipo">{resumo.tipo ?? '—'}</span>}
          {sitioDoResumo && <span className="colecao-sitio">{sitioDoResumo}</span>}
        </span>
      </Link>
    )

  return (
    <li className={classe} data-ref={ref_} data-posicao={`${posicao}/${total}`} onKeyDown={ord.aoTeclarNaLinha(ref_)}>
      <div className="colecao-item-topo">
        {puxador}
        {identidade}
        {passos}
        {tirar}
      </div>
      {grade ? <MarcaDeNota alvo={alvoDaNota} /> : <NotasDoAlvo tipo="colecao-item" ref_={alvoDaNota} variante="item" rotuloDoAlvo={ref_} />}
    </li>
  )
}

function MarcaDeNota({ alvo }: { alvo: string }) {
  const indice = useIndiceDeNotas()
  const n = indice.ligadasA('colecao-item', alvo).filter((l) => l.direta).length
  if (n === 0) return null
  return <span className="colecao-marca-nota codigo">{n === 1 ? '1 nota' : `${n} notas`}</span>
}

// ---------------------------------------------------------------------------------------------------------------

function AdicionarPorCodigo({
  colecao,
  campo,
  aoAdicionar,
}: {
  colecao: ColecaoVista
  campo: RefObject<HTMLTextAreaElement | null>
  aoAdicionar: (a: Aviso) => void
}) {
  const [texto, setTexto] = useState('')
  const [problemas, setProblemas] = useState<string | null>(null)
  const idCampo = useId()
  const idErro = useId()

  const adicionar = async (e: FormEvent) => {
    e.preventDefault()
    const { codigos, ignorados } = extrairCodigos(texto)
    if (codigos.length === 0 && ignorados.length === 0) {
      setProblemas('Cole ao menos um código, como CA00001.')
      campo.current?.focus()
      return
    }
    const naoParece = ignorados.length > 0 ? `Não parece um código: ${ignorados.join(', ')}.` : null
    if (codigos.length === 0) {
      setProblemas(naoParece)
      campo.current?.focus()
      return
    }
    try {
      const conhecidos: MembrosResolvidos = await resolverMembros(codigos, estadoAtual())
      const naoAchei = codigos.filter((r) => conhecidos.get(r) === null)
      const jaEstavam = codigos.filter((r) => conhecidos.get(r) !== null && colecao.membros.some((m) => m.ref === r))
      const entraram = await acrescentarMembros(
        colecao.id,
        codigos.filter((r) => conhecidos.get(r) !== null),
      )
      const partes = [entraram.length === 0 ? 'Nenhum objeto novo.' : `${objetos(entraram.length)} ${entraram.length === 1 ? 'adicionado' : 'adicionados'}.`]
      if (jaEstavam.length > 0) partes.push(`${jaEstavam.length === 1 ? 'Já estava' : 'Já estavam'} na coleção: ${jaEstavam.join(', ')}.`)
      aoAdicionar({
        texto: partes.join(' '),
        desfazer:
          entraram.length === 0
            ? undefined
            : async () => {
                for (const r of entraram) await tirarMembro(colecao.id, r)
              },
      })
      setProblemas([naoAchei.length > 0 ? `Não achei: ${naoAchei.join(', ')}.` : null, naoParece].filter(Boolean).join(' ') || null)
      setTexto('')
    } catch {
      setProblemas(MSG_FALHA)
    }
  }

  return (
    <form className="colecao-adicionar" onSubmit={(e) => void adicionar(e)} noValidate>
      <label htmlFor={idCampo}>Adicionar por código</label>
      <p className="colecao-ajuda" id={`${idCampo}-ajuda`}>
        Cole um ou mais códigos de objeto (como CA00001 ou BA00125), separados por espaço, vírgula ou linha.
      </p>
      <textarea
        ref={campo}
        id={idCampo}
        rows={2}
        value={texto}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={problemas ? true : undefined}
        aria-describedby={problemas ? `${idErro} ${idCampo}-ajuda` : `${idCampo}-ajuda`}
        onChange={(e) => {
          setTexto(e.target.value)
          setProblemas(null)
        }}
      />
      {problemas && (
        <p id={idErro} className="colecao-erro" role="alert">
          {problemas}
        </p>
      )}
      <button type="submit" className="colecao-acao colecao-acao-forte">
        <Icon name="adicionar" size={18} />
        Adicionar
      </button>
    </form>
  )
}
