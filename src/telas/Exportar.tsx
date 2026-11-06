import { useEffect, useId, useRef, useState, useSyncExternalStore, type ChangeEvent, type CSSProperties } from 'react'
import { regioesDoLivro, type RegiaoDoLivroParaExportar } from '../banco/consultas'
import { resumoDaCopiaCompleta } from '../copias/copiaCompleta'
import {
  assinarCopiaCompleta,
  iniciarCopiaCompleta,
  progressoDaCopiaCompleta,
  receberFimDaCopiaCompleta,
  type FimDaCopiaCompleta,
  type ProgressoDaCopiaCompleta,
} from '../copias/montagemDaCopiaCompleta'
import { ErroDaCopia, lerCopia, TEXTOS_DOS_ERROS, type CopiaLida } from '../copias/lerCopia'
import {
  aplicarRestauracao,
  conferirFotos,
  escritaParaRestaurar,
  listagemReaproveitavel,
  planoDeRestauracao,
  temAlgoATrazer,
  textoDoRestaurado,
  textoDoResumo,
  type ListagemDasImagens,
  type PlanoDeRestauracao,
} from '../copias/restaurar'
import { assinarFila } from '../imagens-usuario/fila'
import { Icon } from '../ui/Icon'
import { numeroPtBr } from '../ui/numero'
import { IconButton } from '../ui/IconButton'
import { criarArquivo, entregarArquivo, mensagemDoErro, type Entrega } from '../ui/entregarArquivo'
import { useBreakpoint } from '../ui/useBreakpoint'
import { gerarArquivo, resumirExportacao, type ResumoDaExportacao } from '../usuario/arquivosDeExportacao'
import { aparelhoAtual } from '../usuario/aparelho'
import { estadoAtual, useEstado } from '../usuario/estado'
import type { TipoDeArquivo } from '../usuario/exportar'
import { plural } from '../usuario/textosDaSync'
import './Estado.css'
import './Exportar.css'

const NADA = 'nada ainda'
const CONTANDO = 'Contando…'
const GERANDO = 'Gerando…'
const JUNTANDO = 'Juntando…'

/** "312 eventos de 2 aparelhos · 3 por enviar · 2 imagens no Dropbox · 1 imagem ainda só neste aparelho", ou «nada ainda». */
export function textoDaCopia(c: ResumoDaExportacao['copia']): string {
  if (c.vazia) return NADA
  const partes = [c.eventos > 0 ? `${plural(c.eventos, 'evento', 'eventos')} de ${plural(c.aparelhos, 'aparelho', 'aparelhos')}` : `${plural(c.registros, 'registro consolidado', 'registros consolidados')}`]
  if (c.porEnviar > 0) partes.push(`${numeroPtBr(c.porEnviar)} por enviar`)
  const noDropbox = c.imagens - c.soNoAparelho
  if (noDropbox > 0) partes.push(`${plural(noDropbox, 'imagem', 'imagens')} no Dropbox`)
  if (c.soNoAparelho > 0) partes.push(`${plural(c.soNoAparelho, 'imagem', 'imagens')} ainda só neste aparelho`)
  return partes.join(' · ')
}

/** "14 regiões: 3 suas, 11 dos livros", "suas: nada ainda · 11 dos livros", «nada ainda». */
export function textoDasRegioes(r: ResumoDaExportacao['regioes']): string {
  const suas = r.suas === 1 ? '1 sua' : `${numeroPtBr(r.suas)} suas`
  if (r.doLivro === null) return `${r.suas === 0 ? `suas: ${NADA}` : plural(r.suas, 'região sua', 'regiões suas')} · as dos livros não puderam ser lidas`
  if (r.suas === 0 && r.doLivro === 0) return NADA
  if (r.suas === 0) return `suas: ${NADA} · ${numeroPtBr(r.doLivro)} dos livros`
  if (r.doLivro === 0) return plural(r.suas, 'região sua', 'regiões suas')
  return `${plural(r.suas + r.doLivro, 'região', 'regiões')}: ${suas}, ${numeroPtBr(r.doLivro)} dos livros`
}

export const textoDasHipoteses = (n: number) => (n === 0 ? NADA : plural(n, 'hipótese SKC', 'hipóteses SKC'))

/**
 * "40 fotos, cerca de 180 MB" (1 MB = 1.000.000 bytes, como o Finder e o app Arquivos contam; arredondado, nunca «0 MB»),
 * "3 fotos" quando nenhum tamanho é conhecido, «nenhuma foto ainda». A soma é a dos originais (resumoDaCopiaCompleta).
 */
export function textoDaCopiaCompleta({ fotos, bytes }: { fotos: number; bytes: number }): string {
  if (fotos === 0) return 'nenhuma foto ainda'
  if (bytes <= 0) return plural(fotos, 'foto', 'fotos')
  return `${plural(fotos, 'foto', 'fotos')}, cerca de ${numeroPtBr(Math.max(1, Math.round(bytes / 1_000_000)))} MB`
}

const NOMES_NAS_FALTAS = 5

/** "2 fotos ficaram de fora (IMG_2041.HEIC, IMG_2050.HEIC): tente de novo mais tarde." (até 5 nomes, depois «e mais N»); null sem faltas. */
export function avisoDasFaltas(faltaram: readonly string[]): string | null {
  const n = faltaram.length
  if (n === 0) return null
  const nomes = n <= NOMES_NAS_FALTAS ? faltaram.join(', ') : `${faltaram.slice(0, NOMES_NAS_FALTAS).join(', ')} e mais ${numeroPtBr(n - NOMES_NAS_FALTAS)}`
  return `${plural(n, 'foto', 'fotos')} ${n === 1 ? 'ficou' : 'ficaram'} de fora (${nomes}): tente de novo mais tarde.`
}

const SEM_DROPBOX = 'Sem acesso ao Dropbox agora: só entram as fotos que estão neste aparelho.'
const textoDoProgresso = (p: ProgressoDaCopiaCompleta) =>
  [p.semDropbox ? SEM_DROPBOX : null, p.total === null ? null : `Juntando as fotos: ${numeroPtBr(p.feitas)} de ${numeroPtBr(p.total)}…`].filter(Boolean).join(' ')


/**
 * Os números da tela, refeitos a cada mudança da camada do usuário (o instantâneo é relido) ou da fila das imagens (uma
 * subiu), com as regiões do pacote lidas uma vez (só elas: para contar).
 */
function useResumo(): ResumoDaExportacao | null {
  const estado = useEstado((e) => e)
  const [fila, setFila] = useState(0)
  const [livro, setLivro] = useState<RegiaoDoLivroParaExportar[] | null | undefined>(undefined)
  const [resumo, setResumo] = useState<ResumoDaExportacao | null>(null)
  useEffect(() => assinarFila(() => setFila((n) => n + 1)), [])
  useEffect(() => {
    let vivo = true
    regioesDoLivro().then(
      (d) => vivo && setLivro(d),
      () => vivo && setLivro(null),
    )
    return () => {
      vivo = false
    }
  }, [])
  useEffect(() => {
    if (livro === undefined) return
    let vivo = true
    resumirExportacao(livro).then(
      (r) => vivo && setResumo(r),
      () => undefined,
    )
    return () => {
      vivo = false
    }
  }, [estado, livro, fila])
  return resumo
}

interface Mensagem {
  texto: string
  erro: boolean
}

/** Qual botão gerou o arquivo: os três de antes e o da cópia completa. */
type Botao = TipoDeArquivo | 'completa'

/** Um arquivo já montado que a folha de compartilhar recusou (sem toque recente) ou não abriu (`folhaFalhou`): «Salvar o arquivo» o entrega. */
interface Pronto {
  tipo: Botao
  arquivo: File
  aviso: string | null
  /** As fotos que ficaram de fora da cópia completa (avisoDasFaltas): vai antes de «Toque em «Salvar o arquivo»…». */
  faltas?: string | null
  /** O Safari recusou também o segundo toque: o último recurso é um link de download simples (E-9). */
  recusouDeNovo?: boolean
  /** A folha falhou por outro motivo (não recusa, não cancelamento): o arquivo existe; a mensagem diz isso e o link já aparece (E-9, adendo). */
  folhaFalhou?: boolean
}

interface PropsDaSecao {
  titulo: string
  texto: string
  numeros: string
  botao: string
  principal?: boolean
  ocupado: boolean
  /** O que o botão diz enquanto trabalha (padrão «Gerando…»). */
  textoOcupado?: string
  /** Enquanto trabalha, o botão fica desabilitado (aria-disabled: o foco continua nele). */
  desabilitarOcupado?: boolean
  aoTocar: () => void
  botaoRef: (el: HTMLButtonElement | null) => void
}

/**
 * Uma seção: título, explicação, números e o botão. Enquanto o arquivo é gerado, o botão diz «Gerando…» (o nome dele
 * continua ocupando o lugar, invisível, para o botão não mudar de largura).
 */
function Secao({ titulo, texto, numeros, botao, principal, ocupado, textoOcupado = GERANDO, desabilitarOcupado, aoTocar, botaoRef }: PropsDaSecao) {
  const id = useId()
  return (
    <section className="exp-secao" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>{titulo}</h2>
      <p className="exp-texto">{texto}</p>
      <p className="exp-numeros" id={`${id}-n`}>
        {numeros}
      </p>
      <button
        ref={botaoRef}
        type="button"
        className={`exp-botao${principal ? ' exp-botao-principal' : ''}`}
        aria-describedby={`${id}-n`}
        aria-busy={ocupado || undefined}
        aria-disabled={(desabilitarOcupado && ocupado) || undefined}
        onClick={aoTocar}
      >
        <span className="exp-botao-rotulo" aria-hidden={ocupado || undefined}>
          {botao}
        </span>
        <span className="exp-botao-gerando" aria-hidden={!ocupado || undefined}>
          {textoOcupado}
        </span>
      </button>
    </section>
  )
}

const FRASE_DO_LINK = 'Se a folha de compartilhar não abrir, use o link abaixo para baixar o arquivo.'

/**
 * O último recurso (E-9): um link `<a download>` para o mesmo arquivo, numa URL `blob:` que vale enquanto o link está na tela.
 * Baixar por link não pede nada à CSP (o download é uma navegação, e `default-src 'none'` não a regula).
 */
function LinkDeBaixar({ arquivo }: { arquivo: File }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let nova: string | null = null
    try {
      nova = URL.createObjectURL(arquivo)
    } catch {
      nova = null
    }
    setUrl(nova)
    return () => {
      if (nova) URL.revokeObjectURL(nova)
    }
  }, [arquivo])
  if (!url) return null
  return (
    <a className="exp-baixar" href={url} download={arquivo.name}>
      Baixar o arquivo
    </a>
  )
}

const ACEITA_A_COPIA = '.json,.zip,application/json,application/zip'
const TEXTO_DA_RESTAURACAO = 'Traz de volta o que está numa cópia e falta aqui. Nada é apagado: o que você mudou depois da data da cópia continua valendo.'
const LENDO = 'Lendo…'
const RESTAURANDO = 'Restaurando…'
const NAO_RESTAUROU = 'Não foi possível restaurar; nada foi alterado.'

interface CopiaEscolhida {
  lida: CopiaLida
  /** O resumo (especificação §6.2), calculado contra o estado de quando foi escolhida. */
  texto: string
  /** Há algo a trazer? Sem nada, só «Cancelar». */
  algo: boolean
  /** O plano do resumo e a listagem de usuario/imagens feita para ele (reaproveitada em «Restaurar» se nada mudou). */
  plano: PlanoDeRestauracao
  listagem: ListagemDasImagens | null
}

/**
 * «Restaurar a partir de uma cópia» (2C, bloco 1, Tarefa 7; especificação §6.2; desenho §4, terceiro quadro): a última seção.
 * «Escolher a cópia» abre o seletor de arquivo (.json ou .zip); a cópia é lida e validada (src/copias/lerCopia.ts) e o resumo
 * aparece no lugar, sem mudar nada, com o foco em «Cancelar» (como «Excluir o sítio»). «Restaurar» refaz o plano contra o
 * estado de agora e aplica (src/copias/restaurar.ts); a mensagem final e os erros vão na mensagem do pé da tela. Ao fechar o
 * resumo, o foco volta a «Escolher a cópia».
 */
function SecaoRestaurar({ avisar }: { avisar: (m: Mensagem | null) => void }) {
  const id = useId()
  const [escolhida, setEscolhida] = useState<CopiaEscolhida | null>(null)
  const [fase, setFase] = useState<'lendo' | 'restaurando' | null>(null)
  const ocupado = useRef(false)
  const entradaRef = useRef<HTMLInputElement>(null)
  const escolherRef = useRef<HTMLButtonElement>(null)
  const cancelarRef = useRef<HTMLButtonElement>(null)
  const focar = useRef<'cancelar' | 'escolher' | null>(null)
  useEffect(() => {
    const alvo = focar.current === 'cancelar' ? cancelarRef.current : focar.current === 'escolher' ? escolherRef.current : null
    if (!alvo) return
    focar.current = null
    alvo.focus()
  })

  const aoEscolher = async (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]
    // Limpo já: escolher o mesmo arquivo de novo também avisa.
    e.target.value = ''
    if (!arquivo || ocupado.current) return
    ocupado.current = true
    setFase('lendo')
    avisar(null)
    try {
      const lida = await lerCopia(arquivo)
      const plano = planoDeRestauracao(lida.copia, estadoAtual())
      const conferencia = await conferirFotos(plano, lida.fotos, plano.imagens.length > 0 ? await escritaParaRestaurar() : null)
      const esteAparelho = (await aparelhoAtual()).id
      setEscolhida({
        lida,
        texto: textoDoResumo({ copia: lida.copia, plano, conferencia, comFotos: lida.fotos !== null, esteAparelho }),
        algo: temAlgoATrazer(plano, conferencia),
        plano,
        listagem: conferencia.listagem,
      })
      focar.current = 'cancelar'
    } catch (erro) {
      avisar({ texto: TEXTOS_DOS_ERROS[erro instanceof ErroDaCopia ? erro.motivo : 'ilegivel'], erro: true })
    } finally {
      ocupado.current = false
      setFase(null)
    }
  }

  const fechar = () => {
    if (ocupado.current) return
    setEscolhida(null)
    focar.current = 'escolher'
  }

  const restaurar = async () => {
    if (!escolhida || ocupado.current) return
    ocupado.current = true
    setFase('restaurando')
    avisar(null)
    try {
      // Contra o estado de agora (pode ter chegado algo desde o resumo).
      const plano = planoDeRestauracao(escolhida.lida.copia, estadoAtual())
      // A listagem do resumo vale se o plano é o mesmo e ela ainda é fresca; senão, aplicar lista uma vez mais.
      const listagem = listagemReaproveitavel(escolhida, plano)
      const escrita = !listagem && plano.imagens.length > 0 ? await escritaParaRestaurar() : null
      const resultado = await aplicarRestauracao(plano, escolhida.lida.fotos, { escrita, listagem })
      avisar({ texto: textoDoRestaurado(plano, resultado), erro: false })
    } catch {
      // «nada foi alterado» é verdade porque só `registrarVarios` (uma transação: tudo ou nada) e o que vem antes dele
      // podem lançar; depois dele, aplicarRestauracao pega os erros das fotos e os conta em `fotosQueFalharam`.
      avisar({ texto: NAO_RESTAUROU, erro: true })
    } finally {
      ocupado.current = false
      setFase(null)
      setEscolhida(null)
      focar.current = 'escolher'
    }
  }

  return (
    <section className="exp-secao" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>Restaurar a partir de uma cópia</h2>
      {escolhida ? (
        <div role="group" aria-label="Resumo da restauração" className="exp-confirmar">
          <p>{escolhida.texto}</p>
          <div className="exp-confirmar-botoes">
            <button ref={cancelarRef} type="button" className="exp-botao" onClick={fechar}>
              Cancelar
            </button>
            {escolhida.algo && (
              <button type="button" className="exp-botao exp-botao-principal" aria-busy={fase === 'restaurando' || undefined} onClick={() => void restaurar()}>
                <span className="exp-botao-rotulo" aria-hidden={fase === 'restaurando' || undefined}>
                  Restaurar
                </span>
                <span className="exp-botao-gerando" aria-hidden={fase !== 'restaurando' || undefined}>
                  {RESTAURANDO}
                </span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <p className="exp-texto">{TEXTO_DA_RESTAURACAO}</p>
          <button
            ref={escolherRef}
            type="button"
            className="exp-botao"
            aria-busy={fase === 'lendo' || undefined}
            onClick={() => {
              if (!ocupado.current) entradaRef.current?.click()
            }}
          >
            <span className="exp-botao-rotulo" aria-hidden={fase === 'lendo' || undefined}>
              Escolher a cópia
            </span>
            <span className="exp-botao-gerando" aria-hidden={fase !== 'lendo' || undefined}>
              {LENDO}
            </span>
          </button>
        </>
      )}
      <div hidden>
        <input ref={entradaRef} type="file" accept={ACEITA_A_COPIA} tabIndex={-1} aria-hidden="true" onChange={(e) => void aoEscolher(e)} />
      </div>
    </section>
  )
}

const TEXTO_CANCELADO = 'Nada foi salvo: o compartilhamento foi cancelado.'
const textoDeSucesso = (nome: string, entrega: 'baixado' | 'compartilhado', aviso: string | null) =>
  `Pronto: ${nome} ${entrega === 'baixado' ? 'foi baixado' : 'foi enviado pela folha de compartilhar'}.${aviso ? ` ${aviso}` : ''}`

/**
 * A tela «Cópias e exportação» (Tarefa 15, «Exportar»; 2C, bloco 1: o nome novo, a rota /copias e a cópia completa, desenho
 * 2C-bloco1-desenhos.html §4). Cinco seções. Quatro geram um arquivo, cada uma com uma explicação curta, o que o arquivo
 * leva em números e um botão: a cópia de segurança (JSON), a cópia completa com fotos (.zip, src/copias/copiaCompleta.ts), as
 * regiões (W3C Web Annotation) e as hipóteses SKC para o MEDIATION. A quinta, no fim, restaura a partir de uma cópia
 * (`SecaoRestaurar`). Os arquivos são gerados no aparelho e entregues
 * por download (ou pela folha de compartilhar, no app instalado no iPhone/iPad; src/ui/entregarArquivo.ts). O resultado vai
 * numa região viva, limpa antes de cada mensagem, presa ao pé da tela; no celular, a folga embaixo da página acompanha a altura
 * dela (ResizeObserver), para nunca cobrir o último botão. Se a folha é recusada por falta de um toque recente, o arquivo montado
 * fica guardado e a mensagem oferece «Salvar o arquivo», que o entrega num toque novo. Se a folha falha por outro motivo
 * ('folha-falhou'), o arquivo também fica guardado, a mensagem diz que a folha não abriu (não é erro: o arquivo existe) e o
 * link de download já aparece junto do botão; recusada de novo ou com a folha falhando outra vez no «Salvar o arquivo», a mensagem é refeita
 * (no segundo toque recusado, vale o texto do segundo toque).
 * A cópia completa precisa do Dropbox para as fotos que não estão na fila deste aparelho: enquanto junta, o botão diz «Juntando…»
 * (desabilitado) e a mensagem mostra «Juntando as fotos: 12 de 40…» com uma barra; sem acesso ao Dropbox, a mensagem diz antes
 * que só entram as fotos deste aparelho. No fim, as mesmas mensagens de entrega, com as fotos que ficaram de fora antes de
 * «Toque em «Salvar o arquivo»…» (ou depois do «Pronto: …»). A montagem vive fora da tela (revisão 1): voltar à tela mostra a
 * que está juntando; a que terminou com a tela fechada não é entregue sozinha, mas fica pronta, com «Salvar o arquivo».
 * No fim, «Restaurar a partir de uma cópia» (Tarefa 7, `SecaoRestaurar`): o resumo no lugar e o resultado na mesma mensagem.
 */
export function Exportar() {
  const celular = useBreakpoint() !== 'computador'
  const resumo = useResumo()
  const completa = useEstado(resumoDaCopiaCompleta)
  const [mensagem, setMensagem] = useState<Mensagem | null>(null)
  // m-2 (revisão final): a mensagem de «Restaurar a partir de uma cópia» vem à parte, para não descartar uma cópia completa
  // pronta à espera de «Salvar o arquivo» nem esconder o progresso de «Juntando…»; as duas aparecem juntas na mesma caixa.
  const [daRestauracao, setDaRestauracao] = useState<Mensagem | null>(null)
  const [ocupado, setOcupado] = useState<Botao | null>(null)
  const [pronto, setPronto] = useState<Pronto | null>(null)
  // NB-2: a restauração avisa depois de `await`s, com o fecho do render que a começou; o `pronto` de agora vem daqui.
  const prontoAgora = useRef<Pronto | null>(null)
  prontoAgora.current = pronto
  // A montagem da cópia completa vive fora da tela (src/copias/montagemDaCopiaCompleta.ts): voltar à tela mostra a que está juntando.
  const progresso = useSyncExternalStore(assinarCopiaCompleta, progressoDaCopiaCompleta, progressoDaCopiaCompleta)
  const emAndamento = useRef(false)
  const botoes = useRef(new Map<Botao, HTMLButtonElement>())
  const salvarRef = useRef<HTMLButtonElement>(null)
  const focarNoSalvar = useRef(false)
  const mensagemRef = useRef<HTMLDivElement>(null)
  const [alturaDaMensagem, setAlturaDaMensagem] = useState(0)
  // A mensagem é fixa no pé da tela e muda de altura (a da folha que falhou tem o botão e o link): a folga embaixo da página a
  // acompanha, medida de verdade, para ela não cobrir o último botão (I-1). Vai pelo CSSOM (a prop `style`), que a CSP aceita.
  useEffect(() => {
    const el = mensagemRef.current
    if (!el) return
    // A caixa da borda inteira (getBoundingClientRect), a mesma que o observador acompanha (box: 'border-box').
    const medir = () => setAlturaDaMensagem(Math.ceil(el.getBoundingClientRect().height))
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(medir)
    observador.observe(el, { box: 'border-box' })
    return () => observador.disconnect()
  }, [])
  useEffect(() => {
    if (!focarNoSalvar.current || !pronto || !salvarRef.current) return
    focarNoSalvar.current = false
    salvarRef.current.focus()
  })
  const refDo = (tipo: Botao) => (el: HTMLButtonElement | null) => {
    if (el) botoes.current.set(tipo, el)
    else botoes.current.delete(tipo)
  }

  /** O que a mensagem diz depois de uma entrega. Nunca «foi baixado» sem o link ter saído. */
  const depoisDaEntrega = (entrega: Entrega, p: Pronto, segundoToque = false) => {
    if (entrega === 'folha-falhou') {
      setPronto({ ...p, recusouDeNovo: false, folhaFalhou: true })
      const faltas = p.faltas ? ` ${p.faltas}` : ''
      setMensagem({ texto: `O arquivo ${p.arquivo.name} está pronto, mas a folha de compartilhar não abriu.${faltas} Toque em «Salvar o arquivo» para tentar de novo ou use o link abaixo para baixar o arquivo.`, erro: false })
      return
    }
    if (entrega === 'precisa-tocar') {
      setPronto({ ...p, recusouDeNovo: segundoToque, folhaFalhou: false })
      const base = `O arquivo ${p.arquivo.name} está pronto${p.faltas ? `, mas ${p.faltas}` : '.'} Toque em «Salvar o arquivo» para guardá-lo.`
      setMensagem({ texto: segundoToque ? `${base} ${FRASE_DO_LINK}` : base, erro: false })
      return
    }
    setPronto(null)
    setMensagem({ texto: entrega === 'cancelado' ? TEXTO_CANCELADO : textoDeSucesso(p.arquivo.name, entrega, p.aviso ?? p.faltas ?? null), erro: false })
  }

  const exportar = async (tipo: TipoDeArquivo) => {
    if (emAndamento.current || progressoDaCopiaCompleta()) return
    emAndamento.current = true
    setOcupado(tipo)
    // Limpa antes de escrever: a mesma mensagem de novo (o mesmo nome, no mesmo minuto) volta a ser anunciada.
    setMensagem(null)
    setPronto(null)
    setDaRestauracao(null)
    try {
      const gerado = await gerarArquivo(tipo)
      // O arquivo fica montado antes de pedir a folha de compartilhar (que exige um toque recente).
      const p: Pronto = { tipo, arquivo: criarArquivo(gerado.nome, gerado.conteudo, gerado.tipo), aviso: gerado.aviso }
      depoisDaEntrega(await entregarArquivo(p.arquivo), p)
    } catch (erro) {
      setMensagem({ texto: mensagemDoErro(erro), erro: true })
    } finally {
      emAndamento.current = false
      setOcupado(null)
    }
  }

  /**
   * «Baixar cópia completa»: começa a montagem (fora da tela; uma por vez no app inteiro). O progresso vem da assinatura; o fim,
   * de `receberFimDaCopiaCompleta` (abaixo).
   */
  const exportarCompleta = () => {
    if (emAndamento.current || progressoDaCopiaCompleta()) return
    setMensagem(null)
    setPronto(null)
    setDaRestauracao(null)
    iniciarCopiaCompleta()
  }

  /** A montagem terminou com a tela aberta: a entrega de sempre (o toque que a começou pode já não ser recente). */
  const aoTerminarACompleta = async (fim: FimDaCopiaCompleta) => {
    if ('erro' in fim) {
      setMensagem({ texto: mensagemDoErro(fim.erro), erro: true })
      return
    }
    emAndamento.current = true
    try {
      const p: Pronto = { tipo: 'completa', arquivo: fim.arquivo, aviso: null, faltas: avisoDasFaltas(fim.faltaram) }
      depoisDaEntrega(await entregarArquivo(p.arquivo), p)
    } catch (erro) {
      setMensagem({ texto: mensagemDoErro(erro), erro: true })
    } finally {
      emAndamento.current = false
    }
  }
  /**
   * A montagem terminou com a tela fechada: nada é entregue sem um toque. O arquivo fica pronto, com a mensagem de pronto e
   * «Salvar o arquivo» (a mesma de quando a folha pede um toque novo).
   */
  const aoAbrirComACompletaPronta = (fim: FimDaCopiaCompleta) => {
    if ('erro' in fim) {
      setMensagem({ texto: mensagemDoErro(fim.erro), erro: true })
      return
    }
    depoisDaEntrega('precisa-tocar', { tipo: 'completa', arquivo: fim.arquivo, aviso: null, faltas: avisoDasFaltas(fim.faltaram) })
  }
  const fimDaCompleta = useRef({ aoTerminar: aoTerminarACompleta, aoAbrir: aoAbrirComACompletaPronta })
  fimDaCompleta.current = { aoTerminar: aoTerminarACompleta, aoAbrir: aoAbrirComACompletaPronta }
  useEffect(
    () =>
      receberFimDaCopiaCompleta(
        (fim) => void fimDaCompleta.current.aoTerminar(fim),
        (fim) => fimDaCompleta.current.aoAbrir(fim),
      ),
    [],
  )

  /** «Salvar o arquivo»: o mesmo arquivo, num toque novo; nada é montado de novo. */
  const salvarDeNovo = async () => {
    if (!pronto || emAndamento.current || progressoDaCopiaCompleta()) return
    emAndamento.current = true
    const p = pronto
    // A folha é pedida já, neste toque (entregarArquivo não espera nada antes); a mensagem é limpa para ser anunciada de novo.
    const entregando = entregarArquivo(p.arquivo)
    setMensagem(null)
    try {
      const entrega = await entregando
      depoisDaEntrega(entrega, p, true)
      // O botão sai da tela: o foco volta ao botão da seção. Recusada de novo ou com a folha falhando, a mensagem (e o botão com ela) é refeita: o foco vai
      // ao botão novo, assim que ele existe (T17-C-12).
      if (entrega === 'precisa-tocar' || entrega === 'folha-falhou') focarNoSalvar.current = true
      else botoes.current.get(p.tipo)?.focus()
    } catch (erro) {
      setPronto(null)
      setMensagem({ texto: mensagemDoErro(erro), erro: true })
      botoes.current.get(p.tipo)?.focus()
    } finally {
      emAndamento.current = false
    }
  }

  return (
    <div className="pagina-consulta exp-pagina" style={{ '--exp-mensagem-alto': `${alturaDaMensagem}px` } as CSSProperties}>
      {celular && (
        <div className="exp-topo">
          <IconButton icon="voltar" label="Voltar" href="#/" tipPosition="start" />
        </div>
      )}
      <main className="exp-corpo">
        <div className="exp-cabeca">
          <h1>Cópias e exportação</h1>
          <p className="exp-intro">Os arquivos são gerados neste aparelho, com o que está gravado nele.</p>
        </div>
        <Secao
          titulo="Cópia de segurança"
          texto="Tudo o que é seu, num arquivo JSON: notas, coleções, hipóteses, regiões, objetos SKC, sítios e verbetes. As fotos não vão dentro: para levá-las junto, use a cópia completa."
          numeros={resumo ? textoDaCopia(resumo.copia) : CONTANDO}
          botao="Baixar cópia"
          principal
          ocupado={ocupado === 'copia'}
          aoTocar={() => void exportar('copia')}
          botaoRef={refDo('copia')}
        />
        <Secao
          titulo="Cópia completa, com fotos"
          texto="Tudo o que está na cópia de segurança, mais as suas fotos, num arquivo .zip. Use-a para guardar fora do Dropbox."
          numeros={textoDaCopiaCompleta(completa)}
          botao="Baixar cópia completa"
          ocupado={progresso !== null}
          textoOcupado={JUNTANDO}
          desabilitarOcupado
          aoTocar={exportarCompleta}
          botaoRef={refDo('completa')}
        />
        <Secao
          titulo="Regiões (W3C Web Annotation)"
          texto="As regiões que você desenhou e as dos livros, com o nome do elemento e os termos, num arquivo JSON-LD que outros programas leem."
          numeros={resumo ? textoDasRegioes(resumo.regioes) : CONTANDO}
          botao="Exportar regiões"
          ocupado={ocupado === 'regioes'}
          aoTocar={() => void exportar('regioes')}
          botaoRef={refDo('regioes')}
        />
        <Secao
          titulo="Hipóteses para o MEDIATION"
          texto="Só as suas hipóteses (SKC), marcadas como não publicadas. As suas posições sobre as hipóteses dos livros não vão."
          numeros={resumo ? textoDasHipoteses(resumo.hipoteses) : CONTANDO}
          botao="Exportar hipóteses para o MEDIATION"
          ocupado={ocupado === 'hipoteses'}
          aoTocar={() => void exportar('hipoteses')}
          botaoRef={refDo('hipoteses')}
        />
        <SecaoRestaurar
          avisar={(m) => {
            // A cópia completa pronta (e a mensagem dela) fica; o resto da mensagem dá lugar à da restauração, como antes. Lido
            // na hora (ref e atualização funcional), não do fecho: a cópia pode ter ficado pronta durante a restauração (NB-2).
            if (prontoAgora.current?.tipo !== 'completa') {
              setPronto((p) => (p?.tipo === 'completa' ? p : null))
              setMensagem(null)
            }
            setDaRestauracao(m)
          }}
        />
      </main>
      <div
        ref={mensagemRef}
        className={`exp-mensagem${(mensagem ?? (progresso ? null : daRestauracao))?.erro ? ' exp-mensagem-erro' : ''}`}
        role="status"
        aria-label="Mensagem da exportação"
      >
        {progresso && !mensagem && (
          <>
            <span>{textoDoProgresso(progresso)}</span>
            {progresso.total !== null && (
              <div className="exp-barra" aria-hidden="true">
                <span style={{ width: `${progresso.total === 0 ? 100 : Math.round((progresso.feitas / progresso.total) * 100)}%` }} />
              </div>
            )}
          </>
        )}
        {mensagem && (
          <>
            {mensagem.erro && <Icon name="aviso" size={18} />}
            <span>{mensagem.texto}</span>
            {pronto && (
              <button ref={salvarRef} type="button" className="exp-salvar" onClick={() => void salvarDeNovo()}>
                Salvar o arquivo
              </button>
            )}
            {(pronto?.recusouDeNovo || pronto?.folhaFalhou) && <LinkDeBaixar arquivo={pronto.arquivo} />}
          </>
        )}
        {daRestauracao &&
          (mensagem || progresso ? (
            // junto do progresso ou da cópia pronta: numa linha própria, embaixo
            <div className="exp-mensagem-mais">
              {daRestauracao.erro && <Icon name="aviso" size={18} />}
              <span>{daRestauracao.texto}</span>
            </div>
          ) : (
            <>
              {daRestauracao.erro && <Icon name="aviso" size={18} />}
              <span>{daRestauracao.texto}</span>
            </>
          ))}
      </div>
    </div>
  )
}
