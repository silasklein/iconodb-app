import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { regioesDoLivro, type RegiaoDoLivroParaExportar } from '../banco/consultas'
import { assinarFila } from '../imagens-usuario/fila'
import { Icon } from '../ui/Icon'
import { numeroPtBr } from '../ui/numero'
import { IconButton } from '../ui/IconButton'
import { criarArquivo, entregarArquivo, mensagemDoErro, type Entrega } from '../ui/entregarArquivo'
import { useBreakpoint } from '../ui/useBreakpoint'
import { gerarArquivo, resumirExportacao, type ResumoDaExportacao } from '../usuario/arquivosDeExportacao'
import { useEstado } from '../usuario/estado'
import type { TipoDeArquivo } from '../usuario/exportar'
import { plural } from '../usuario/textosDaSync'
import './Estado.css'
import './Exportar.css'

const NADA = 'nada ainda'
const CONTANDO = 'Contando…'
const GERANDO = 'Gerando…'

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

/** Um arquivo já montado que a folha de compartilhar recusou (sem toque recente) ou não abriu (`folhaFalhou`): «Salvar o arquivo» o entrega. */
interface Pronto {
  tipo: TipoDeArquivo
  arquivo: File
  aviso: string | null
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
  aoTocar: () => void
  botaoRef: (el: HTMLButtonElement | null) => void
}

/**
 * Uma seção: título, explicação, números e o botão. Enquanto o arquivo é gerado, o botão diz «Gerando…» (o nome dele
 * continua ocupando o lugar, invisível, para o botão não mudar de largura).
 */
function Secao({ titulo, texto, numeros, botao, principal, ocupado, aoTocar, botaoRef }: PropsDaSecao) {
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
        onClick={aoTocar}
      >
        <span className="exp-botao-rotulo" aria-hidden={ocupado || undefined}>
          {botao}
        </span>
        <span className="exp-botao-gerando" aria-hidden={!ocupado || undefined}>
          {GERANDO}
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

const TEXTO_CANCELADO = 'Nada foi salvo: o compartilhamento foi cancelado.'
const textoDeSucesso = (nome: string, entrega: 'baixado' | 'compartilhado', aviso: string | null) =>
  `Pronto: ${nome} ${entrega === 'baixado' ? 'foi baixado' : 'foi enviado pela folha de compartilhar'}.${aviso ? ` ${aviso}` : ''}`

/**
 * A tela Exportar (Tarefa 15; sem desenho aprovado: segue Sincronizacao.dc.html e o Menu). Três seções, cada uma com uma
 * explicação curta, o que o arquivo leva em números e um botão: a cópia de segurança (JSON), as regiões (W3C Web
 * Annotation) e as hipóteses SKC para o MEDIATION. Os arquivos são gerados no aparelho, sem internet nem login, e entregues
 * por download (ou pela folha de compartilhar, no app instalado no iPhone/iPad; src/ui/entregarArquivo.ts). O resultado vai
 * numa região viva, limpa antes de cada mensagem, presa ao pé da tela; no celular, a folga embaixo da página acompanha a altura
 * dela (ResizeObserver), para nunca cobrir o último botão. Se a folha é recusada por falta de um toque recente, o arquivo montado
 * fica guardado e a mensagem oferece «Salvar o arquivo», que o entrega num toque novo. Se a folha falha por outro motivo
 * ('folha-falhou'), o arquivo também fica guardado, a mensagem diz que a folha não abriu (não é erro: o arquivo existe) e o
 * link de download já aparece junto do botão; recusada de novo ou com a folha falhando outra vez no «Salvar o arquivo», a mensagem é refeita
 * (no segundo toque recusado, vale o texto do segundo toque).
 */
export function Exportar() {
  const celular = useBreakpoint() !== 'computador'
  const resumo = useResumo()
  const [mensagem, setMensagem] = useState<Mensagem | null>(null)
  const [ocupado, setOcupado] = useState<TipoDeArquivo | null>(null)
  const [pronto, setPronto] = useState<Pronto | null>(null)
  const emAndamento = useRef(false)
  const botoes = useRef(new Map<TipoDeArquivo, HTMLButtonElement>())
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
  const refDo = (tipo: TipoDeArquivo) => (el: HTMLButtonElement | null) => {
    if (el) botoes.current.set(tipo, el)
    else botoes.current.delete(tipo)
  }

  /** O que a mensagem diz depois de uma entrega. Nunca «foi baixado» sem o link ter saído. */
  const depoisDaEntrega = (entrega: Entrega, p: Pronto, segundoToque = false) => {
    if (entrega === 'folha-falhou') {
      setPronto({ ...p, recusouDeNovo: false, folhaFalhou: true })
      setMensagem({ texto: `O arquivo ${p.arquivo.name} está pronto, mas a folha de compartilhar não abriu. Toque em «Salvar o arquivo» para tentar de novo ou use o link abaixo para baixar o arquivo.`, erro: false })
      return
    }
    if (entrega === 'precisa-tocar') {
      setPronto({ ...p, recusouDeNovo: segundoToque, folhaFalhou: false })
      const base = `O arquivo ${p.arquivo.name} está pronto. Toque em «Salvar o arquivo» para guardá-lo.`
      setMensagem({ texto: segundoToque ? `${base} ${FRASE_DO_LINK}` : base, erro: false })
      return
    }
    setPronto(null)
    setMensagem({ texto: entrega === 'cancelado' ? TEXTO_CANCELADO : textoDeSucesso(p.arquivo.name, entrega, p.aviso), erro: false })
  }

  const exportar = async (tipo: TipoDeArquivo) => {
    if (emAndamento.current) return
    emAndamento.current = true
    setOcupado(tipo)
    // Limpa antes de escrever: a mesma mensagem de novo (o mesmo nome, no mesmo minuto) volta a ser anunciada.
    setMensagem(null)
    setPronto(null)
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

  /** «Salvar o arquivo»: o mesmo arquivo, num toque novo; nada é montado de novo. */
  const salvarDeNovo = async () => {
    if (!pronto || emAndamento.current) return
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
          <h1>Exportar</h1>
          <p className="exp-intro">Os arquivos são gerados neste aparelho, sem internet, com o que está gravado nele.</p>
        </div>
        <Secao
          titulo="Cópia de segurança"
          texto="Tudo o que é seu, num arquivo JSON: notas, coleções, hipóteses, regiões, objetos SKC, sítios e verbetes. As imagens não vão dentro: ficam no Dropbox, na pasta usuario/imagens/ (as que ainda não subiram, só neste aparelho)."
          numeros={resumo ? textoDaCopia(resumo.copia) : CONTANDO}
          botao="Baixar cópia"
          principal
          ocupado={ocupado === 'copia'}
          aoTocar={() => void exportar('copia')}
          botaoRef={refDo('copia')}
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
      </main>
      <div ref={mensagemRef} className={`exp-mensagem${mensagem?.erro ? ' exp-mensagem-erro' : ''}`} role="status" aria-label="Mensagem da exportação">
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
      </div>
    </div>
  )
}
