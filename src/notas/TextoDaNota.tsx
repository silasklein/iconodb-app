import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import type { AlvoResolvido } from './alvos'
import { analisarComCitacoes, chaveDaFonte, textoDoPedaco, type PedacoDeCitacao } from './citacoes'
import type { ObjetoCitado, ReferenciaCitada } from './fontesCitadas'
import { FolhaDoIntervalo } from './FolhaDoIntervalo'
import { chaveDoAlvo, idCanonico, tipoDoRef } from './links'
import { useAlvos } from './useAlvos'
import { useFontesCitadas, useObrasCitaveis, type ObrasCitaveis } from './useCitacoes'
import './Notas.css'
import './Citacoes.css'

/** Um trecho marcado por hipóteses SKC (Tarefa 10), em posições UTF-16 do texto GUARDADO. */
export interface RealceNoTexto {
  inicio: number
  fim: number
  hipoteses: readonly string[]
  /** Para o leitor de tela: "iconográfico, provável". */
  nota: string
}

interface Props {
  texto: string
  className?: string
  /** Os alvos já resolvidos por quem desenha várias notas de uma vez (evita uma resolução por nota). */
  alvos?: ReadonlyMap<string, AlvoResolvido>
  /**
   * A leitura SKC (Tarefa 10): cada pedaço num `<span data-b="<início no texto guardado>">` (links e citações também com
   * `data-b-fim`), para uma seleção virar âncora no texto guardado (src/hipoteses/selecao.ts).
   */
  posicoes?: boolean
  /** Trechos de hipóteses SKC: só no texto corrido (nunca dentro de um link, que não se aninha). */
  realces?: readonly RealceNoTexto[]
  hipoteseAtiva?: string | null
  aoAbrirHipotese?: (id: string, gatilho: HTMLElement) => void
}

const SEM_REALCES: readonly RealceNoTexto[] = []

/**
 * O texto de uma nota, com cada `[[ref|rótulo]]` desenhado como link do roteador. NUNCA como HTML: o texto e o
 * rótulo vão como nós de texto (o React os escapa), então marcação digitada pelo usuário fica como texto.
 * Um link cujo alvo não existe vira texto com o rótulo e um "?" discreto (e "(não encontrado)" para o leitor de tela);
 * um alvo que existe mas ainda não tem tela fica como texto simples.
 *
 * Citações reconhecidas (decisão 40, citacoes.ts) no texto fora dos `[[…]]`: "TESTE I: 1-3, 5" mostra o prefixo como
 * texto, cada número como link para o objeto (pela referência: item do livro → objeto; "SKC: n" → SKC, Nr.) e cada
 * intervalo, com travessão curto, como um botão que abre a lista dos objetos (FolhaDoIntervalo). O texto guardado não
 * muda. Um número que não existe, ou de um volume planejado que ainda não chegou, tem o "?"; um número do sistema solto
 * ("CA00046") é um link como `[[CA00046]]`.
 */
export function TextoDaNota({ texto, className, alvos, posicoes = false, realces = SEM_REALCES, hipoteseAtiva = null, aoAbrirHipotese }: Props) {
  const obras = useObrasCitaveis()
  const pedacos = useMemo(() => analisarComCitacoes(texto, obras.reconhece), [texto, obras])
  const refs = useMemo(
    () => pedacos.flatMap((p): ReferenciaCitada[] => (p.tipo === 'numero' && obras.disponivel(p.obra) !== false ? [{ obra: p.obra, numero: p.numero, sufixo: p.sufixo, abb: p.abb }] : [])),
    [pedacos, obras],
  )
  const citadas = useFontesCitadas(refs)
  const proprios = useAlvos(alvos ? [] : [texto])
  const resolvidos = alvos ?? proprios
  // A chave de cada pedaço é onde ele começa no texto (e o tipo), não a posição na lista: quando as obras do pacote
  // chegam e o texto é lido de novo, os pedaços antes de um intervalo mudam, mas ele (e a folha dele, aberta) fica.
  let desde = 0
  return (
    <span className={`nota-texto${className ? ` ${className}` : ''}`} lang="pt-BR">
      {pedacos.map((p) => {
        const inicio = desde
        const tamanho = 'bruto' in p ? p.bruto.length : p.texto.length
        desde += tamanho
        const i = `${inicio}:${p.tipo}`
        let peca: ReactNode
        switch (p.tipo) {
          case 'texto':
          case 'prefixo': {
            const marcados = realces.length > 0 ? realcar(p.texto, inicio, realces, hipoteseAtiva, aoAbrirHipotese) : p.texto
            return posicoes ? (
              <span key={i} data-b={inicio}>
                {marcados}
              </span>
            ) : typeof marcados === 'string' ? (
              marcados
            ) : (
              <span key={i}>{marcados}</span>
            )
          }
          case 'link':
            peca = <LinkDaNota key={i} ref_={p.ref} rotulo={p.rotulo} resolvido={resolvidos} />
            break
          case 'sistema':
            peca = <LinkDaNota key={i} ref_={p.numero} rotulo={null} resolvido={resolvidos} />
            break
          default:
            peca = <Citacao key={i} pedaco={p} obras={obras} citadas={citadas} />
        }
        return posicoes ? (
          <span key={i} data-b={inicio} data-b-fim={inicio + tamanho}>
            {peca}
          </span>
        ) : (
          peca
        )
      })}
    </span>
  )
}

/** O texto corrido de um pedaço (que começa em `inicio` no texto guardado), com os trechos das hipóteses SKC marcados. */
function realcar(texto: string, inicio: number, realces: readonly RealceNoTexto[], ativa: string | null, aoAbrir?: Props['aoAbrirHipotese']): ReactNode {
  const fim = inicio + texto.length
  const aqui = realces.filter((r) => r.inicio < fim && r.fim > inicio && r.inicio < r.fim)
  if (aqui.length === 0) return texto
  const cortes = [...new Set([inicio, fim, ...aqui.flatMap((r) => [r.inicio, r.fim]).filter((x) => x > inicio && x < fim)])].sort((a, b) => a - b)
  const partes: ReactNode[] = []
  for (let k = 0; k + 1 < cortes.length; k++) {
    const a = cortes[k]!
    const b = cortes[k + 1]!
    const pedaco = texto.slice(a - inicio, b - inicio)
    const cobrem = aqui.filter((r) => r.inicio <= a && r.fim >= b)
    partes.push(cobrem.length === 0 ? pedaco : <AncoraSkc key={a} texto={pedaco} realces={cobrem} ativa={ativa} aoAbrir={aoAbrir} />)
  }
  return partes
}

function AncoraSkc({ texto, realces, ativa, aoAbrir }: { texto: string; realces: readonly RealceNoTexto[]; ativa: string | null; aoAbrir?: Props['aoAbrirHipotese'] }) {
  const { pathname, state } = useLocation()
  const ids = realces.flatMap((r) => r.hipoteses)
  const id = ids[0]!
  const aberta = ativa !== null && ids.includes(ativa)
  const mais = ids.length > 1 ? `; mais ${ids.length - 1} no mesmo trecho` : ''
  return (
    <Link
      className={`ancora ancora-skc${aberta ? ' ancora-ativa' : ''}`}
      to={{ pathname, search: `?hipotese=${encodeURIComponent(id)}` }}
      state={state}
      replace
      aria-haspopup="dialog"
      aria-expanded={aberta}
      data-hipotese={id}
      data-hipoteses={ids.join(' ')}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => aoAbrir?.(id, e.currentTarget)}
    >
      <span>{texto}</span>
      <span className="so-leitor">{`, hipótese SKC: ${realces[0]!.nota}${mais}`}</span>
    </Link>
  )
}

/** Um número ou um intervalo citado (veja o cabeçalho). */
function Citacao({ pedaco: p, obras, citadas }: { pedaco: Extract<PedacoDeCitacao, { tipo: 'numero' | 'intervalo' }>; obras: ObrasCitaveis; citadas: ReadonlyMap<string, ObjetoCitado | null> }) {
  const visivel = textoDoPedaco(p)
  const fonte = `${p.obra}: ${visivel}`
  if (obras.disponivel(p.obra) === false) return <Ausente texto={visivel} titulo={`Ainda não está no pacote: ${fonte}`} />
  if (p.tipo === 'intervalo') return <Intervalo obra={p.obra} de={p.de} ate={p.ate} />
  const o = citadas.get(chaveDaFonte(p.obra, p.numero, p.sufixo, p.abb))
  if (o === null) return <Ausente texto={visivel} titulo={`Não encontrado: ${fonte}`} />
  // Ainda sem resposta (o pacote está abrindo): texto, sem link e sem "?".
  if (o === undefined) return <span className="citacao-esperando">{visivel}</span>
  return (
    <Link className="nota-link citacao-link" to={o.rota} aria-label={`${fonte} (${o.numero})`}>
      {visivel}
    </Link>
  )
}

/** O intervalo: um botão com cara de link, que abre a folha com os objetos; ao fechar, o foco volta a ele. */
function Intervalo({ obra, de, ate }: { obra: string; de: number; ate: number }) {
  const [aberta, setAberta] = useState(false)
  const botao = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={botao}
        type="button"
        className="nota-link citacao-link citacao-intervalo"
        aria-haspopup="dialog"
        aria-expanded={aberta}
        aria-label={`${obra}: ${de}–${ate}, lista dos objetos`}
        onClick={() => setAberta(true)}
      >
        {`${de}–${ate}`}
      </button>
      {aberta && <FolhaDoIntervalo obra={obra} de={de} ate={ate} aoFechar={() => setAberta(false)} devolverFoco={() => botao.current} />}
    </>
  )
}

/** Um alvo que não existe (ou ainda não chegou): o texto com o sublinhado pontilhado e o "?" (decisão 37). */
function Ausente({ texto, titulo, codigo = false }: { texto: string; titulo: string; codigo?: boolean }) {
  return (
    <span className="nota-ausente" title={titulo}>
      <span className={codigo ? 'codigo' : undefined}>{texto}</span>
      <span className="so-leitor"> (não encontrado)</span>
      <sup aria-hidden="true" className="nota-ausente-marca">
        ?
      </sup>
    </span>
  )
}

function LinkDaNota({ ref_, rotulo, resolvido }: { ref_: string; rotulo: string | null; resolvido: ReadonlyMap<string, AlvoResolvido> }) {
  const tipo = tipoDoRef(ref_)
  // Uma referência que não se reconhece não é link: o texto escrito volta como estava.
  if (!tipo) return <>{rotulo ? `[[${ref_}|${rotulo}]]` : `[[${ref_}]]`}</>
  const ref = idCanonico(tipo, ref_)
  const alvo = resolvido.get(chaveDoAlvo(tipo, ref))
  // Um objeto sem rótulo aparece pelo número; os outros, pelo nome que têm no pacote.
  const texto = rotulo ?? (tipo === 'objeto' ? ref : (alvo?.rotulo ?? ref))
  const codigo = tipo === 'objeto' && rotulo === null
  if (alvo?.existe === false) return <Ausente texto={texto} titulo={`Não encontrado: ${ref}`} codigo={codigo} />
  // Sem alvo resolvido ainda, o link vale pela rota do tipo (só os tipos do pacote têm rota certa de antemão).
  const rota = alvo ? alvo.rota : rotaPadrao(tipo, ref)
  if (!rota) return <span className={codigo ? 'codigo' : undefined}>{texto}</span>
  return (
    <Link className="nota-link" to={rota} aria-label={tipo === 'objeto' && rotulo ? `${rotulo} (${ref})` : undefined}>
      <span className={codigo ? 'codigo' : undefined}>{texto}</span>
    </Link>
  )
}

const rotaPadrao = (tipo: ReturnType<typeof tipoDoRef>, ref: string): string | null =>
  tipo === 'verbete' ? `/verbete/${encodeURIComponent(ref)}` : tipo === 'obra' ? `/obra/${encodeURIComponent(ref)}` : tipo === 'objeto' ? `/item/${encodeURIComponent(ref)}` : tipo === 'sitio' && !ref.startsWith('SI-') ? `/sitio/${encodeURIComponent(ref)}` : tipo === 'grupo' ? `/grupo/${encodeURIComponent(ref)}` : null
