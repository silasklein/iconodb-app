import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { obra as obraDoPacote } from '../banco/consultas'
import { useRedirecionamentos } from '../pacote/redirecionamentos'
import { NaoEncontrado } from '../telas/detalhe'
import { useCarregar } from '../ui/useCarregar'
import { eIdDeLigacao, pedidosDeLigar, pedidosDeTirarExcecoes } from '../revisao/ligacoes'
import { registrarVarios } from '../usuario/estado'
import { Icon } from '../ui/Icon'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint } from '../ui/useBreakpoint'
import type { Json } from '../usuario/eventos'
import { useLido } from '../usuario/useLido'
import { lerDoZotero, NAO_RECONHECIDO, type FormatoDoZotero } from './colar'
import { useObraPublicada, useObraSkc, useObrasParaLigar, type ObraDaLista } from './doUsuario'
import {
  camposDaCurta,
  camposVisiveis,
  curtaProposta,
  formularioDoCsl,
  formularioVazio,
  montarCsl,
  parecidas as acharParecidas,
  ROTULO_DO_DOCUMENTO,
  rotuloDoCampo,
  TIPOS_DO_QUADRO,
  type CampoDoFormulario,
  type ErroDoFormulario,
  type FormularioDaObra,
  type MotivoDaParecida,
  type Parecida,
  type TipoDoFormulario,
} from './formulario'
import { eCslValido, eObraDoLivro, type Csl, type ObraSkc } from './modelo'
import { criarObra, editarObra, reservarIdDaObra, trocarPorEsta, usosDaObra } from './operacoes'
import {
  apagarRascunhoDaObra,
  chaveDoRascunhoDaObra,
  conteudoDoFormulario,
  formularioTemConteudo,
  guardarRascunhoDaObra,
  lerRascunhoDaObra,
  type RascunhoDaObra,
} from './rascunho'
import { textoDaTroca } from './textos'
import { ReferenciaChicago } from './ReferenciaChicago'
import '../objetos-skc/Formulario.css'
import '../telas/NovoObjeto.css'
import '../imagens-usuario/MarcaSkc.css'
import './NovaObra.css'

const MSG_FALHOU = 'Não foi possível salvar a obra neste aparelho; tente de novo. O que você preencheu continua aqui.'
const MSG_FALHOU_LIGAR = 'Não foi possível ligar a citação a esta obra; tente de novo.'

/** Um caminho do app para voltar (`?volta=`): só um caminho interno («/…», nunca «//…»). */
const voltaValida = (v: string | null): string | null => (v && v.startsWith('/') && !v.startsWith('//') ? v : null)

const MOTIVOS: Record<MotivoDaParecida, string> = {
  quase: 'mesma citação curta, mesmo ano e mesmo título',
  chave: 'mesma citação curta',
  'autor-e-ano': 'mesmo sobrenome e ano',
  titulo: 'mesmo título',
}

/** Um aviso do «Colar do Zotero» na tela: a lista dos campos de fora do formulário fica curta (os nomes, até seis). */
function encurtar(aviso: string): string {
  const m = /^fora do formulário: (.*)$/.exec(aviso)
  if (!m) return aviso
  const campos = m[1]!.split(', ')
  return campos.length <= 6 ? aviso : `fora do formulário: ${campos.slice(0, 6).join(', ')} e mais ${campos.length - 6}`
}

const NOME_DO_FORMATO: Record<FormatoDoZotero, string> = { 'csl-json': 'CSL JSON', bibtex: 'BibTeX' }

/** O que a tela abre: o rascunho a usar, se ele foi recuperado, o do endereço que pede escolha e o de «Descartar». */
interface Comeco {
  rascunho: RascunhoDaObra
  recuperado: boolean
  /** O endereço pede outra citação que a do rascunho guardado: a pessoa escolhe qual fica (nada é trocado sozinho). */
  pergunta: RascunhoDaObra | null
  /** O que «Descartar o rascunho» devolve: o formulário do endereço (obra nova) ou o da obra gravada (edição). */
  base: RascunhoDaObra
}

/** O começo da obra nova: o rascunho guardado (com a mesma citação, ou sem citação no endereço), ou o do endereço. */
export function comecoDaNova(citacao: string | null, curta: string | null, volta: string | null): Comeco {
  const f = formularioVazio()
  const lida = curta ? camposDaCurta(curta) : null
  const doEndereco: RascunhoDaObra = {
    editando: null,
    f: lida ? { ...f, ...lida, tipo: lida.organizadores ? 'volume' : '' } : f,
    curtaManual: !!lida && lida.curta !== '',
    originais: {},
    citacao,
    rotuloDaCitacao: citacao ? curta?.split(':', 1)[0]?.trim() || citacao : null,
    volta,
    reserva: null,
    salvoEm: 0,
  }
  const guardado = lerRascunhoDaObra(null)
  if (!guardado || (!formularioTemConteudo(guardado.f) && !guardado.reserva)) return { rascunho: doEndereco, recuperado: false, pergunta: null, base: doEndereco }
  if (citacao === null || citacao === guardado.citacao) return { rascunho: guardado, recuperado: true, pergunta: null, base: doEndereco }
  return { rascunho: guardado, recuperado: true, pergunta: doEndereco, base: doEndereco }
}

/** O começo da edição: o rascunho guardado desta obra, se difere da gravada; senão, a obra gravada. */
export function comecoDaEdicao(o: ObraSkc): Comeco {
  const doRegistro: RascunhoDaObra = {
    editando: o.id,
    f: formularioDoCsl(o.csl, o.curta),
    curtaManual: true,
    originais: { ...(o.csl.author !== undefined ? { author: o.csl.author } : {}), ...(o.csl.editor !== undefined ? { editor: o.csl.editor } : {}) },
    citacao: null,
    rotuloDaCitacao: null,
    volta: null,
    reserva: null,
    salvoEm: 0,
  }
  const guardado = lerRascunhoDaObra(o.id)
  if (guardado && conteudoDoFormulario(guardado.f, guardado.curtaManual) !== conteudoDoFormulario(doRegistro.f, doRegistro.curtaManual))
    return { rascunho: guardado, recuperado: true, pergunta: null, base: doRegistro }
  if (guardado) apagarRascunhoDaObra(o.id)
  return { rascunho: doRegistro, recuperado: false, pergunta: null, base: doRegistro }
}

/**
 * /obra/nova: a obra nova. `?citacao=<chave>` liga a citação ao salvar (e no «É esta»); `?volta=` é para onde volta;
 * `?curta=` (opcional) é a citação como impressa, que começa o formulário. `?excecao=` (repetível; Tarefa 11): as exceções nulas
 * das citações do caso da Revisão, tiradas na mesma gravação da ligação (senão venceriam a chave). Um rascunho guardado volta (R1 do fix round 1).
 */
export function NovaObra() {
  const [params] = useSearchParams()
  const citacaoBruta = params.get('citacao')
  const citacao = citacaoBruta && eIdDeLigacao(citacaoBruta) ? citacaoBruta : null
  const comeco = useMemo(() => comecoDaNova(citacao, citacao ? params.get('curta') : null, voltaValida(params.get('volta'))), []) // eslint-disable-line react-hooks/exhaustive-deps
  return <TelaDaObra editando={null} comeco={comeco} excecoes={params.getAll('excecao')} />
}

/**
 * /obra/:id/editar: edita uma obra do usuário. Tarefa 14: a obra sua que o pacote publicou vai para o endereço da obra dos
 * livros (`/obra/BIB-<dígitos>/editar`), e a obra dos livros que veio de obras suas se edita lá (`EditarObraPublicada`); as
 * outras obras dos livros, não.
 */
export function EditarObra() {
  const { id = '' } = useParams()
  return eObraDoLivro(id) ? <EditarObraPublicada key={id} id={id} /> : <EditarObraSkc key={id} id={id} />
}

const naoEncontrada = (id: string) => (
  <NaoEncontrado pagina voltar={{ href: `#/obra/${encodeURIComponent(id)}`, rotulo: 'Voltar à obra' }} titulo="Obra não encontrada" destino="/bibliografia" rotuloDoDestino="Ver a bibliografia" />
)

function EditarObraSkc({ id }: { id: string }) {
  const o = useObraSkc(id)
  const redirecionamentos = useRedirecionamentos()
  const { search, state } = useLocation()
  if (redirecionamentos === null) return <div className="detalhe-pagina" aria-busy="true" />
  const para = redirecionamentos.get(id)
  // N2 (fix round 1): o `?…` e o estado, como o redirecionamento da página da obra
  if (para) return <Navigate replace to={`/obra/${encodeURIComponent(para)}/editar${search}`} state={state} />
  if (!o || o.excluido) return naoEncontrada(id)
  return <EdicaoDaObra key={o.id} obra={o} />
}

/**
 * A obra dos livros que veio de obras suas (`useObraPublicada`): o formulário começa com o que a página mostra (o pacote, com
 * a camada por cima) e grava onde o `user-import` lê (a origem; com várias, o registro com o id do livro).
 */
function EditarObraPublicada({ id }: { id: string }) {
  const redirecionamentos = useRedirecionamentos()
  const carga = useCarregar(() => obraDoPacote(id), id)
  const publicada = useObraPublicada(id)
  if (redirecionamentos === null || carga.fase === 'carregando') return <div className="detalhe-pagina" aria-busy="true" />
  const doPacote = carga.fase === 'ok' ? carga.dados : null
  if (!publicada || !doPacote) return naoEncontrada(id)
  const { id: _id, ...cslDoPacote } = doPacote.csl ?? {}
  const csl = publicada.csl ?? (eCslValido(cslDoPacote) ? cslDoPacote : null)
  if (!csl) return naoEncontrada(id)
  const curta = publicada.curta ?? doPacote.curta ?? ''
  const editando: ObraSkc = { id: publicada.alvo, csl, curta, criadoEm: '', excluido: false }
  return <EdicaoDaObra key={publicada.alvo} obra={editando} publicada={{ pagina: id, antes: { csl, curta } }} />
}

/** A edição de uma obra dos livros que veio de você: o endereço da página e o que ela mostrava (`editarObra`). */
interface EdicaoPublicada {
  pagina: string
  antes: { csl: Csl; curta: string }
}

function EdicaoDaObra({ obra, publicada }: { obra: ObraSkc; publicada?: EdicaoPublicada }) {
  const comeco = useMemo(() => comecoDaEdicao(obra), []) // eslint-disable-line react-hooks/exhaustive-deps
  return <TelaDaObra editando={obra} comeco={comeco} publicada={publicada} />
}

interface Props {
  editando: ObraSkc | null
  comeco: Comeco
  /** Tarefa 14: editando uma obra dos livros que veio de você (o endereço dela e o que a página mostrava). */
  publicada?: EdicaoPublicada
  /** As exceções a tirar ao ligar a citação (`?excecao=`); só as da chave da citação valem (`pedidosDeTirarExcecoes`). */
  excecoes?: readonly string[]
}

/** O aviso de duas abas: outra aba mudou o rascunho (`outro`), ou o apagou (salvou ou descartou: `outro` null). */
type OutraAba = { outro: RascunhoDaObra | null } | null

/**
 * A tela «Nova obra» (quadro 2 do canvas «Bloco 3: telas»), também para editar uma obra do usuário: o tipo, os nomes, o
 * ano, o título e o resto; «Colar do Zotero»; a citação curta proposta; a prévia em Chicago (exatamente `chicago()`) e as
 * obras parecidas com «É esta». No computador, a prévia e as parecidas ficam à direita; no celular, depois dos campos.
 *
 * Nada se perde (src/bibliografia/rascunho.ts): cada mudança vai ao rascunho na hora; Esc, o Voltar e um recarregar o
 * guardam; «Salvar», «Cancelar» e um «É esta» que deu certo o apagam.
 */
function TelaDaObra({ editando, comeco, excecoes = [], publicada }: Props) {
  const navegar = useNavigate()
  const computador = useBreakpoint() === 'computador'
  const uid = useId()
  const [r, setR] = useState<RascunhoDaObra>(comeco.rascunho)
  const atual = useRef(r)
  const [recuperado, setRecuperado] = useState(comeco.recuperado && comeco.pergunta === null)
  const [pergunta, setPergunta] = useState<RascunhoDaObra | null>(comeco.pergunta)
  const [outraAba, setOutraAba] = useState<OutraAba>(null)
  const pausado = useRef(false)
  const apagado = useRef(false)
  const [colando, setColando] = useState(false)
  const [textoColado, setTextoColado] = useState('')
  const [lidoDoZotero, setLidoDoZotero] = useState<{ formato: FormatoDoZotero | null; faltou: string[] } | null>(null)
  const [erro, setErro] = useState<ErroDoFormulario | { campo: 'geral'; texto: string } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [ligando, setLigando] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const salvandoAgora = useRef(false)
  const botaoDoColar = useRef<HTMLButtonElement>(null)
  const caixaDoColar = useRef<HTMLTextAreaElement>(null)
  const raiz = useRef<HTMLFormElement>(null)
  const chave = chaveDoRascunhoDaObra(editando?.id ?? null)
  const { f, curtaManual, citacao, rotuloDaCitacao, volta } = r

  useEffect(() => {
    document.title = `${editando ? 'Editar a obra' : 'Nova obra'} · IconoDB`
  }, [editando])
  useEffect(() => {
    if (colando) caixaDoColar.current?.focus()
  }, [colando])

  /** Muda o rascunho e o guarda na mesma tarefa (síncrono): um recarregar logo depois não perde nada. */
  const mudarRascunho = (fn: (x: RascunhoDaObra) => RascunhoDaObra) => {
    const novo = fn(atual.current)
    atual.current = novo
    if (!pausado.current && !apagado.current) guardarRascunhoDaObra(novo)
    setR(novo)
  }
  const mudarForm = (fn: (x: FormularioDaObra) => FormularioDaObra, curtaManualNovo?: boolean) =>
    mudarRascunho((x) => ({ ...x, f: fn(x.f), curtaManual: curtaManualNovo ?? x.curtaManual }))
  /** Troca o formulário inteiro (o rascunho escolhido, ou o «Descartar»). */
  const trocarPor = (novo: RascunhoDaObra, guardar: boolean) => {
    atual.current = novo
    setR(novo)
    if (guardar) guardarRascunhoDaObra(novo)
  }
  const apagarRascunho = () => {
    apagado.current = true
    apagarRascunhoDaObra(editando?.id ?? null)
  }

  // Outra aba mudou o rascunho com este formulário aberto: até a pessoa escolher, nada daqui é gravado por cima. Uma
  // diferença só na reserva (a outra aba está salvando ESTE rascunho) é adotada em silêncio.
  useEffect(() => {
    const ouvir = (e: StorageEvent) => {
      if (e.key !== null && e.key !== chave) return
      if (apagado.current) return
      const outro = lerRascunhoDaObra(editando?.id ?? null)
      const aqui = atual.current
      if (outro && conteudoDoFormulario(outro.f, outro.curtaManual) === conteudoDoFormulario(aqui.f, aqui.curtaManual)) {
        if (outro.reserva !== aqui.reserva) atual.current = { ...aqui, reserva: outro.reserva }
        return
      }
      if (!outro && !formularioTemConteudo(aqui.f)) return
      pausado.current = true
      setOutraAba({ outro })
    }
    window.addEventListener('storage', ouvir)
    return () => window.removeEventListener('storage', ouvir)
  }, [chave, editando])
  const resolverOutraAba = (usar: RascunhoDaObra | null) => {
    pausado.current = false
    setOutraAba(null)
    if (usar) trocarPor(usar, false)
    else guardarRascunhoDaObra(atual.current)
  }

  const curta = curtaManual ? f.curta : curtaProposta(f)
  const { csl, erros } = useMemo(() => montarCsl(f, r.originais), [f, r.originais])
  // M1 (revisão final): com `?citacao=`, «É esta» liga; a obra dos livros que sai no build seguinte não se oferece
  const carga = useObrasParaLigar(!!citacao)
  // a obra dos livros que veio de você não é parecida dela mesma
  const outras = useMemo(
    () => (carga.fase === 'ok' ? carga.dados.filter((o) => o.id !== editando?.id && o.id !== publicada?.pagina) : []),
    [carga, editando, publicada?.pagina],
  )
  const parecidas = useMemo(() => acharParecidas({ csl, curta: curta || citacao || '' }, outras), [csl, curta, citacao, outras])

  const mudar = (campo: CampoDoFormulario, valor: string) => {
    mudarForm((x) => ({ ...x, [campo]: valor }))
    setErro((e) => (e && e.campo === campo ? null : e))
  }
  const escolherTipo = (tipo: TipoDoFormulario) => {
    mudarForm((x) => ({ ...x, tipo }))
    setErro((e) => (e?.campo === 'tipo' ? null : e))
  }

  const preencher = (texto: string) => {
    const lido = lerDoZotero(texto)
    if (lido.formato === null) {
      setLidoDoZotero({ formato: null, faltou: [NAO_RECONHECIDO] })
      return
    }
    const novo = formularioDoCsl(lido.csl)
    // O tipo é o do colado: sem tipo, ou sem equivalente, fica vazio, e «Salvar» pede o tipo (M2 do fix round 1).
    mudarRascunho((x) => ({
      ...x,
      f: { ...novo, curta: x.f.curta },
      originais: { ...(lido.csl.author !== undefined ? { author: lido.csl.author as Json } : {}), ...(lido.csl.editor !== undefined ? { editor: lido.csl.editor as Json } : {}) },
    }))
    setLidoDoZotero({ formato: lido.formato, faltou: lido.faltou })
    setErro(null)
    setColando(false)
    setTextoColado('')
    botaoDoColar.current?.focus()
  }

  const paginaDaObra = editando ? `/obra/${encodeURIComponent(publicada?.pagina ?? editando.id)}` : null
  const destinoDeVolta = volta ?? paginaDaObra ?? '/bibliografia'
  const rotuloDeVolta = volta ? (citacao ? 'Voltar à citação' : 'Voltar') : editando ? 'Voltar à obra' : 'Voltar à bibliografia'

  const focarErro = (campo: string) => {
    const alvo = campo === 'tipo' ? raiz.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]') : document.getElementById(`${uid}-${campo}`)
    alvo?.focus()
  }

  const salvar = async (e?: FormEvent) => {
    e?.preventDefault()
    if (salvandoAgora.current) return
    const primeiro = erros[0]
    if (primeiro) {
      setErro(primeiro)
      focarErro(primeiro.campo)
      return
    }
    setErro(null)
    salvandoAgora.current = true
    setSalvando(true)
    try {
      if (editando) {
        await editarObra(editando.id, csl as Csl, curta, publicada?.antes)
        apagarRascunho()
        void navegar(paginaDaObra!, { replace: true })
      } else {
        // A reserva vai ao rascunho ANTES de gravar: um segundo «Salvar» (depois de recarregar) repete o mesmo id.
        let id = atual.current.reserva
        if (!id) {
          id = await reservarIdDaObra()
          mudarRascunho((x) => ({ ...x, reserva: id }))
        }
        await criarObra(csl as Csl, curta, { id, ligarA: citacao, tirarExcecoes: excecoes })
        apagarRascunho()
        void navegar(volta ?? `/obra/${encodeURIComponent(id)}`, { replace: true })
      }
    } catch {
      salvandoAgora.current = false
      setSalvando(false)
      setErro({ campo: 'geral', texto: MSG_FALHOU })
    }
  }

  const fechar = () => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    void navegar(destinoDeVolta)
  }

  const teclar = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void salvar()
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
      e.preventDefault() // Enter num campo não envia: só «Salvar» (ou Ctrl/⌘+Enter)
    } else if (e.key === 'Escape' && !e.defaultPrevented) {
      // Esc fecha e GUARDA o rascunho (como o Novo sítio); «Cancelar» é que descarta
      e.preventDefault()
      fechar()
    }
  }

  /** «É esta» numa obra nova: liga a citação a ela (com `?citacao=`) e volta, ou abre a obra. Nada é criado. */
  const eEsta = async (p: Parecida<ObraDaLista>) => {
    if (salvandoAgora.current) return
    if (!citacao) {
      apagarRascunho()
      void navegar(`/obra/${encodeURIComponent(p.obra.id)}`)
      return
    }
    salvandoAgora.current = true
    setLigando(p.obra.id)
    try {
      await registrarVarios([...pedidosDeLigar(citacao, p.obra.id), ...pedidosDeTirarExcecoes(citacao, excecoes)])
      apagarRascunho()
      void navegar(volta ?? `/obra/${encodeURIComponent(p.obra.id)}`, { replace: true })
    } catch {
      salvandoAgora.current = false
      setLigando(null)
      setErro({ campo: 'geral', texto: MSG_FALHOU_LIGAR })
    }
  }

  /** «É esta» ao editar, confirmado: a troca reversível (`trocarPorEsta`). */
  const trocar = async (p: Parecida<ObraDaLista>, rotulo: string): Promise<boolean> => {
    if (!editando || salvandoAgora.current) return false
    salvandoAgora.current = true
    try {
      await trocarPorEsta(editando.id, p.obra.id, rotulo)
      apagarRascunho()
      void navegar(`/obra/${encodeURIComponent(p.obra.id)}`, { replace: true })
      return true
    } catch {
      salvandoAgora.current = false
      return false
    }
  }

  const visiveis = camposVisiveis(f)
  const erroDe = (campo: string) => (erro && erro.campo === campo ? erro.texto : null)
  const idErro = (campo: string) => `${uid}-${campo}-erro`
  const tipos: { tipo: TipoDoFormulario; rotulo: string }[] = f.tipo === 'document' ? [...TIPOS_DO_QUADRO, { tipo: 'document', rotulo: ROTULO_DO_DOCUMENTO }] : [...TIPOS_DO_QUADRO]
  const titulo = editando ? 'Editar a obra' : 'Nova obra'
  const rotuloDoBotao = salvando ? 'Salvando…' : editando ? 'Salvar as mudanças' : citacao ? 'Salvar e ligar a citação' : 'Salvar a obra'

  const campo = (c: CampoDoFormulario) => {
    const id = `${uid}-${c}`
    const texto = erroDe(c)
    const nomes = c === 'autores' || c === 'organizadores'
    const ajuda = nomes ? `${id}-ajuda` : undefined
    const props = {
      id,
      value: f[c],
      autoComplete: 'off',
      'aria-invalid': texto ? true : undefined,
      'aria-required': c === 'titulo' ? true : undefined,
      'aria-describedby': [texto ? idErro(c) : '', ajuda ?? ''].filter(Boolean).join(' ') || undefined,
    }
    return (
      <div key={c} className={`form-campo nova-obra-campo-${c}`}>
        <label htmlFor={id}>
          {rotuloDoCampo(c, f.tipo)}
          {nomes && <span className="form-apoio"> (Sobrenome, Nome; um por linha)</span>}
        </label>
        {nomes ? (
          <textarea {...props} rows={2} className="nova-obra-nomes" onChange={(e) => mudar(c, e.target.value)} />
        ) : (
          <input {...props} type="text" inputMode={c === 'ano' ? 'numeric' : undefined} onChange={(e) => mudar(c, e.target.value)} />
        )}
        {ajuda && (
          <span id={ajuda} className="form-ajuda">
            Uma instituição vai sem vírgula, numa linha.
          </span>
        )}
        {texto && <Erro id={idErro(c)}>{texto}</Erro>}
      </div>
    )
  }

  const quase = parecidas.filter((p) => p.motivo === 'quase')
  const outrasParecidas = parecidas.filter((p) => p.motivo !== 'quase')
  const vazio = csl.title === undefined && csl.author === undefined && csl.editor === undefined && csl.issued === undefined && !curta && !citacao
  const nomeDe = (p: Parecida<ObraDaLista>) => p.obra.curta ?? p.obra.titulo ?? p.obra.id
  // Anunciado ao leitor de tela só quando o conjunto das «quase iguais» muda (M3 do fix round 1).
  const anuncioDaQuase = quase.length > 0 ? `Há uma obra quase igual: ${quase.map((p) => `«${nomeDe(p)}»`).join(', ')}.` : ''
  // «É esta» numa obra dos livros que veio de você não troca nada (a troca exclui a origem e a tiraria dos livros): as
  // parecidas ficam só para ver
  const lista = { editando, confirmando, setConfirmando, ligando, aoEscolher: eEsta, aoTrocar: trocar, uid, semEEsta: !!publicada }

  return (
    <div className="novo-objeto nova-obra">
      <TopoDoCelular voltar={{ href: `#${destinoDeVolta}`, rotulo: `${rotuloDeVolta} (o rascunho fica guardado)` }} busca={false} />
      <form ref={raiz} onSubmit={(e) => void salvar(e)} onKeyDown={teclar} noValidate aria-labelledby={`${uid}-cabeca`}>
        <header className="novo-cabecalho nova-obra-cabecalho">
          {computador && (
            <nav aria-label="Caminho" className="novo-caminho">
              <Link to={destinoDeVolta}>‹ {rotuloDeVolta}</Link>
            </nav>
          )}
          <div className="nova-obra-titulo">
            <h1 id={`${uid}-cabeca`}>
              {titulo} <span className="novo-skc">SKC</span>
            </h1>
            <span className="nova-obra-colar">
              <button
                ref={botaoDoColar}
                type="button"
                className="form-botao"
                aria-expanded={colando}
                aria-controls={`${uid}-colar`}
                onClick={() => {
                  setColando((x) => !x)
                  setLidoDoZotero(null)
                }}
              >
                Colar do Zotero
              </button>
              <span className="form-ajuda">CSL JSON ou BibTeX, copiado no Zotero</span>
            </span>
          </div>
          {citacao && (
            <p className="novo-apoio">
              Ao salvar, a citação «{rotuloDaCitacao}» passa a abrir esta obra{citacao.includes('@') ? '' : ', e as iguais também'}.
            </p>
          )}
          {editando && <p className="novo-apoio">As mudanças valem na Bibliografia, nos objetos e nas citações ligadas a ela.</p>}
        </header>

        <div className="nova-obra-colunas">
          <div className="nova-obra-campos">
            {pergunta && (
              <div className="novo-recuperado nova-obra-aviso" role="alert" aria-label="Há um rascunho guardado">
                <span>Há um rascunho de obra guardado{r.f.titulo.trim() ? ` («${r.f.titulo.trim()}»)` : ''}{citacao ? `, com a citação «${rotuloDaCitacao}»` : ''}. Ele continua aqui.</span>
                <button type="button" className="novo-link" onClick={() => setPergunta(null)}>
                  Continuar o rascunho
                </button>
                <button
                  type="button"
                  className="novo-link"
                  onClick={() => {
                    trocarPor(pergunta, false)
                    apagarRascunhoDaObra(null)
                    setPergunta(null)
                    setRecuperado(false)
                  }}
                >
                  Começar uma nova com a citação «{pergunta.rotuloDaCitacao}»
                </button>
              </div>
            )}
            {outraAba && (
              <div className="novo-recuperado nova-obra-aviso" role="alert" aria-label="Rascunho de outra aba">
                {outraAba.outro ? (
                  <>
                    <span>Outra aba mudou este rascunho. Qual fica?</span>
                    <button type="button" className="novo-link" onClick={() => resolverOutraAba(outraAba.outro)}>
                      Usar o da outra aba
                    </button>
                    <button type="button" className="novo-link" onClick={() => resolverOutraAba(null)}>
                      Manter o desta aba
                    </button>
                  </>
                ) : (
                  <>
                    <span>Outra aba salvou ou descartou este rascunho.</span>
                    <button type="button" className="novo-link" onClick={() => resolverOutraAba(null)}>
                      Continuar aqui
                    </button>
                    <button
                      type="button"
                      className="novo-link"
                      onClick={() => {
                        apagado.current = true
                        fechar()
                      }}
                    >
                      Sair sem salvar
                    </button>
                  </>
                )}
              </div>
            )}
            {recuperado && !pergunta && (
              <div className="novo-recuperado nova-obra-aviso" role="status" aria-label="Rascunho recuperado">
                <span>Rascunho recuperado: o que você tinha {editando ? 'mudado nesta obra' : 'preenchido'} neste aparelho voltou.</span>
                <button
                  type="button"
                  className="novo-link"
                  onClick={() => {
                    apagarRascunhoDaObra(editando?.id ?? null)
                    trocarPor(comeco.base, false)
                    setRecuperado(false)
                    setErro(null)
                    setLidoDoZotero(null)
                  }}
                >
                  Descartar o rascunho
                </button>
              </div>
            )}
            {colando && (
              <div className="nova-obra-colar-caixa" id={`${uid}-colar`}>
                <label htmlFor={`${uid}-colado`} className="form-rotulo">
                  Cole aqui o que o Zotero copiou
                </label>
                <textarea
                  ref={caixaDoColar}
                  id={`${uid}-colado`}
                  value={textoColado}
                  spellCheck={false}
                  aria-describedby={`${uid}-colado-ajuda`}
                  onChange={(e) => setTextoColado(e.target.value)}
                  onPaste={(e) => {
                    const t = e.clipboardData.getData('text')
                    if (!t) return
                    e.preventDefault()
                    setTextoColado(t)
                    preencher(t)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      e.stopPropagation()
                      setColando(false)
                      botaoDoColar.current?.focus()
                    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
                      // aqui, Ctrl/⌘+Enter preenche (não salva a obra)
                      e.preventDefault()
                      e.stopPropagation()
                      if (textoColado.trim() !== '') preencher(textoColado)
                    }
                  }}
                />
                <span id={`${uid}-colado-ajuda`} className="form-ajuda">
                  Uma obra só (a primeira, se houver várias). O formulário se preenche para você conferir; nada é gravado até salvar.
                </span>
                {lidoDoZotero?.formato === null && <Erro id={`${uid}-colado-erro`}>Não deu para ler: {NAO_RECONHECIDO}. O formulário não mudou.</Erro>}
                <div className="nova-obra-colar-botoes">
                  <button type="button" className="form-botao" onClick={() => preencher(textoColado)} disabled={textoColado.trim() === ''}>
                    Preencher o formulário
                  </button>
                  <button
                    type="button"
                    className="novo-link"
                    onClick={() => {
                      setColando(false)
                      botaoDoColar.current?.focus()
                    }}
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}
            {lidoDoZotero && lidoDoZotero.formato !== null && (
              <div className="novo-recuperado nova-obra-lido" role="status" aria-label="Lido do Zotero">
                <p>Preenchido do {NOME_DO_FORMATO[lidoDoZotero.formato]}. Confira os campos antes de salvar.</p>
                {lidoDoZotero.faltou.length > 0 && (
                  <>
                    <p>O que ficou de fora:</p>
                    <ul>
                      {lidoDoZotero.faltou.map((x) => (
                        <li key={x}>{encurtar(x)}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            <div className="form-campo">
              <span className="form-legenda" id={`${uid}-tipo-rotulo`}>
                Tipo
              </span>
              <EscolhaDoTipo
                tipos={tipos}
                valor={f.tipo}
                aoEscolher={escolherTipo}
                rotuladoPor={`${uid}-tipo-rotulo`}
                invalido={erro?.campo === 'tipo'}
                descritoPor={erro?.campo === 'tipo' ? idErro('tipo') : undefined}
              />
              {erroDe('tipo') && <Erro id={idErro('tipo')}>{erroDe('tipo')}</Erro>}
            </div>

            <div className="nova-obra-grade">{visiveis.map(campo)}</div>

            <div className="form-campo nova-obra-campo-curta">
              <label htmlFor={`${uid}-curta`}>Citação curta</label>
              <input
                id={`${uid}-curta`}
                type="text"
                autoComplete="off"
                value={curta}
                aria-describedby={`${uid}-curta-ajuda`}
                onChange={(e) => {
                  const v = e.target.value
                  mudarForm((x) => ({ ...x, curta: v }), true)
                }}
                // vazia ao sair do campo: volta a proposta do sobrenome e do ano
                onBlur={() => f.curta.trim() === '' && curtaManual && mudarForm((x) => x, false)}
              />
              <span id={`${uid}-curta-ajuda`} className="form-ajuda">
                {curtaManual ? 'Apague e saia do campo para voltar à proposta do sobrenome e do ano.' : 'Proposta a partir do sobrenome e do ano; pode mudar (por exemplo, «1993b»).'}
              </span>
            </div>
            <p className="form-ajuda nova-obra-dica">Num artigo, aparecem a revista e o volume; num capítulo, o livro e os seus organizadores.</p>
          </div>

          <aside className="nova-obra-lado" aria-label="Prévia e obras parecidas">
            <h2 className="nova-obra-rotulo">Como vai aparecer na Bibliografia</h2>
            <p className="nova-obra-previa" data-testid="previa">
              <ReferenciaChicago csl={csl} semChicago={<span className="nova-obra-sem-previa">A prévia aparece quando houver o tipo e o título.</span>} />
            </p>
            <p className="form-ajuda">
              Chicago, como as obras dos livros · marcada <span className="marca-skc">SKC</span>
            </p>

            <h2 className="nova-obra-rotulo nova-obra-rotulo-parecidas">Parecidas na Bibliografia</h2>
            <p className="so-leitor" role="status" data-testid="anuncio-da-quase">
              {anuncioDaQuase}
            </p>
            {carga.fase === 'carregando' && <p className="form-ajuda">Procurando na Bibliografia…</p>}
            {carga.fase === 'erro' && <p className="form-ajuda">Não foi possível ler a Bibliografia para comparar.</p>}
            {carga.fase === 'ok' && parecidas.length === 0 && (
              <p className="nova-obra-nenhuma">
                {vazio
                  ? 'As obras com o mesmo sobrenome e ano, ou com o mesmo título, aparecem aqui, com «É esta», para não duplicar.'
                  : 'Nenhuma com o mesmo sobrenome e ano, nem com o mesmo título.'}
              </p>
            )}
            {quase.length > 0 && (
              <section className="nova-obra-quase" aria-labelledby={`${uid}-quase`}>
                <h3 id={`${uid}-quase`}>
                  <Icon name="aviso" size={16} />
                  Quase igual a uma obra que já existe
                </h3>
                <p>
                  A mesma citação curta, o mesmo ano e o mesmo título. Se é ela, use «É esta». Se é outra obra, distinga a citação curta (por exemplo, «1993b»): sem isso
                  ela não entra nos livros.
                </p>
                <ListaDeParecidas parecidas={quase} {...lista} />
              </section>
            )}
            {outrasParecidas.length > 0 && <ListaDeParecidas parecidas={outrasParecidas} {...lista} />}
          </aside>

          <div className="novo-pe nova-obra-pe">
            {erro?.campo === 'geral' && <Erro>{erro.texto}</Erro>}
            {quase.length > 0 && <p className="form-ajuda nova-obra-pe-quase">Há uma obra quase igual (veja «Parecidas na Bibliografia»).</p>}
            <div className="novo-acoes-pe">
              <button type="submit" className="form-botao form-botao-forte" aria-busy={salvando || undefined}>
                <Icon name="confirmar" size={18} />
                {rotuloDoBotao}
              </button>
              <Link className="form-botao" to={destinoDeVolta} onClick={apagarRascunho}>
                Cancelar
              </Link>
            </div>
            <span className="form-nota">
              Fica na sua camada (SKC), na Bibliografia e na escolha de obra dos objetos SKC. Sair sem salvar guarda um rascunho; «Cancelar» o descarta.
            </span>
          </div>
        </div>
      </form>
    </div>
  )
}

function Erro({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="form-erro" role="alert">
      <Icon name="aviso" size={16} />
      {children}
    </p>
  )
}

/** O tipo: um grupo de rádio em pílulas, como o período do objeto (setas andam e escolhem). */
function EscolhaDoTipo({
  tipos,
  valor,
  aoEscolher,
  rotuladoPor,
  invalido,
  descritoPor,
}: {
  tipos: { tipo: TipoDoFormulario; rotulo: string }[]
  valor: TipoDoFormulario | ''
  aoEscolher: (t: TipoDoFormulario) => void
  rotuladoPor: string
  invalido: boolean
  descritoPor?: string
}) {
  const grupo = useRef<HTMLDivElement>(null)
  const marcado = tipos.findIndex((t) => t.tipo === valor)
  const focoEm = marcado >= 0 ? marcado : 0
  const teclar = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!passo) return
    e.preventDefault()
    const j = (i + passo + tipos.length) % tipos.length
    aoEscolher(tipos[j]!.tipo)
    grupo.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[j]?.focus()
  }
  return (
    <div ref={grupo} role="radiogroup" aria-labelledby={rotuladoPor} aria-required="true" aria-invalid={invalido || undefined} aria-describedby={descritoPor} className="form-periodos">
      {tipos.map((t, i) => (
        <button
          key={t.tipo}
          type="button"
          role="radio"
          aria-checked={t.tipo === valor}
          tabIndex={i === focoEm ? 0 : -1}
          className="form-periodo"
          onClick={() => aoEscolher(t.tipo)}
          onKeyDown={(e) => teclar(e, i)}
        >
          {t.rotulo}
        </button>
      ))}
    </div>
  )
}

interface PropsDaLista {
  parecidas: Parecida<ObraDaLista>[]
  editando: ObraSkc | null
  /** A confirmação aberta (o id da parecida), uma só na tela. */
  confirmando: string | null
  setConfirmando: (id: string | null) => void
  /** A parecida que está sendo ligada (`É esta` com citação). */
  ligando: string | null
  aoEscolher: (p: Parecida<ObraDaLista>) => void
  aoTrocar: (p: Parecida<ObraDaLista>, rotulo: string) => Promise<boolean>
  uid: string
  /** Sem «É esta» (editando uma obra dos livros que veio de você). */
  semEEsta?: boolean
}

/**
 * As parecidas, cada uma com a referência e «É esta». Editando uma obra sua, «É esta» pede confirmação (`trocarPorEsta`,
 * reversível com «Restaurar»): o foco vai ao «Cancelar», Esc e «Cancelar» fecham e o devolvem a «É esta», e um clique
 * duplo não grava duas vezes.
 */
function ListaDeParecidas({ parecidas, editando, confirmando, setConfirmando, ligando, aoEscolher, aoTrocar, uid, semEEsta = false }: PropsDaLista) {
  const [falhou, setFalhou] = useState(false)
  const [trocando, setTrocando] = useState(false)
  const cancelarRef = useRef<HTMLButtonElement>(null)
  const aberto = useRef<string | null>(null)
  const idDoBotao = (id: string) => `${uid}-e-esta-${id}`
  const usos = useLido(['citacao', 'objeto'], `usos-da-obra:${editando?.id ?? ''}`, (e) => (editando ? usosDaObra(e, editando.id) : null))
  const minhas = parecidas.some((p) => p.obra.id === confirmando)
  useEffect(() => {
    if (!minhas) return
    aberto.current = confirmando
    cancelarRef.current?.focus()
  }, [confirmando, minhas])
  const fecharConfirmacao = () => {
    const volta = aberto.current
    aberto.current = null
    setConfirmando(null)
    setFalhou(false)
    if (volta) requestAnimationFrame(() => document.getElementById(idDoBotao(volta))?.focus())
  }
  return (
    <ul className="nova-obra-parecidas">
      {parecidas.map((p) => {
        const rotulo = p.obra.curta ?? p.obra.titulo ?? p.obra.id
        const aqui = editando !== null && confirmando === p.obra.id
        return (
          <li key={p.obra.id} className={`nova-obra-parecida${p.motivo === 'quase' ? ' nova-obra-parecida-quase' : ''}`}>
            <div className="nova-obra-parecida-texto">
              <span className="nova-obra-parecida-nome">
                {rotulo}
                {p.obra.skc && <span className="marca-skc">SKC</span>}
              </span>
              <span className="nova-obra-parecida-ref">
                <ReferenciaChicago csl={p.obra.csl} semChicago={p.obra.titulo} />
              </span>
              <span className="form-ajuda">{MOTIVOS[p.motivo]}</span>
            </div>
            {!semEEsta && (
              <button
                id={idDoBotao(p.obra.id)}
                type="button"
                className="form-botao nova-obra-e-esta"
                aria-label={`É esta: ${rotulo}`}
                aria-expanded={editando ? aqui : undefined}
                aria-busy={ligando === p.obra.id || undefined}
                disabled={ligando !== null}
                onClick={() => (editando ? (aqui ? fecharConfirmacao() : setConfirmando(p.obra.id)) : aoEscolher(p))}
              >
                É esta
              </button>
            )}
            {aqui && usos && !semEEsta && (
              <div
                role="group"
                aria-label={`Usar «${rotulo}» no lugar da sua obra?`}
                className="nova-obra-confirmar"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    e.stopPropagation()
                    fecharConfirmacao()
                  }
                }}
              >
                <p>{textoDaTroca(usos.ligacoes.length, usos.objetos.length, rotulo)}</p>
                <div className="nova-obra-confirmar-botoes">
                  <button ref={cancelarRef} type="button" className="form-botao" onClick={fecharConfirmacao}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="form-botao form-botao-forte"
                    aria-busy={trocando || undefined}
                    onClick={() => {
                      if (trocando) return
                      setFalhou(false)
                      setTrocando(true)
                      void aoTrocar(p, rotulo).then((ok) => {
                        if (!ok) {
                          setTrocando(false)
                          setFalhou(true)
                        }
                      })
                    }}
                  >
                    Usar «{rotulo}»
                  </button>
                </div>
                {falhou && <p role="alert">Não foi possível trocar; tente de novo.</p>}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
