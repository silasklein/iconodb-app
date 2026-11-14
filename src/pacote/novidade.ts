/**
 * «Há uma versão nova dos livros no Dropbox»: o pacote do Dropbox é outro que o do aparelho?
 *
 * - Compara o manifesto do Dropbox com o estado.json do aparelho pela mesma `assinatura` que o download usa
 *   (manifesto.ts): «outro pacote» quer dizer aqui o mesmo que em baixar.ts. O `gerado_em` não conta.
 * - Um pacote que o app não abre (schema fora de SCHEMAS_ACEITOS, manifesto ilegível, validarPacote o recusa) é
 *   «incompativel»: o Início não mostra nada (nem erro); a tela de Sincronização diz, se a pessoa procurou.
 * - Nunca lança para a tela: sem internet, sem login ou com o login expirado, a resposta é «desconhecida» (com o motivo
 *   quando o Dropbox o diz: o pacote não está lá, falta uma permissão), e o Início não mostra nada. Uma resposta
 *   «desconhecida» não apaga uma «nova» anterior: o pacote novo continua no Dropbox.
 * - O manifesto tem ~650 KB: o Início procura UMA vez por abertura do app (procurarNaAbertura), depois de desenhado;
 *   a tela de Sincronização procura de novo quando a pessoa pede (procurarAgora). Na abertura em que o pacote acabou
 *   de ser baixado (/preparando, marcarEmDia), o Início não procura de novo.
 * - Enquanto /preparando baixa o pacote (atualizandoOsLivros), a faixa fica escondida: tocar nela de novo daria na
 *   trava da sincronização.
 * - Só lê: não grava nada no aparelho nem no Dropbox.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { ErroDePacoteAusente, ErroDePermissao, fonteDropbox } from '../dropbox/fonte'
import { armazemPadrao, type Armazem } from './armazem'
import { lerEstado } from './local'
import { assinatura, ErroDeManifesto, ErroDePacote, ErroDeSchema, lerManifesto, validarPacote, type Fonte, type Manifesto } from './manifesto'

export type Novidade =
  /** O Dropbox tem outro pacote; `rotulos` nomeia os livros dele (ex.: «IPIAO I–IV»). */
  | { tipo: 'nova'; rotulos: string[] }
  /** O mesmo pacote do aparelho. */
  | { tipo: 'em-dia' }
  /** O pacote do Dropbox não abre nesta versão do app (outro schema, manifesto ilegível ou pacote com defeito). */
  | { tipo: 'incompativel' }
  /**
   * Não deu para saber (sem internet, sem login, login expirado, aparelho sem armazém). `motivo`, quando o Dropbox o diz:
   * o manifesto não está na pasta do app (`sem-pacote`) ou falta uma permissão (`sem-permissao`).
   */
  | { tipo: 'desconhecida'; motivo?: 'sem-pacote' | 'sem-permissao' }

const EM_DIA: Novidade = { tipo: 'em-dia' }
const INCOMPATIVEL: Novidade = { tipo: 'incompativel' }
const DESCONHECIDA: Novidade = { tipo: 'desconhecida' }

const eTexto = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

/**
 * O nome de cada livro do pacote: com vários volumes, a sigla e o primeiro–último («IPIAO I–IV»); com um, o rótulo
 * dele; sem `volumes` (pacotes antigos) ou com eles fora do formato, o rótulo da publicação ou a sigla.
 */
export function rotulosDosLivros(m: { publicacoes: readonly unknown[] }): string[] {
  return m.publicacoes.map((p) => {
    const pub = (p ?? {}) as { sigla?: unknown; rotulo?: unknown; volumes?: unknown }
    const sigla = eTexto(pub.sigla) ? pub.sigla : ''
    const volumes = Array.isArray(pub.volumes) ? pub.volumes.filter((v): v is { volume: string; rotulo?: unknown } => eTexto((v as { volume?: unknown } | null)?.volume)) : []
    if (volumes.length > 1) return `${sigla} ${volumes[0]!.volume}–${volumes[volumes.length - 1]!.volume}`.trim()
    if (volumes.length === 1 && eTexto(volumes[0]!.rotulo)) return volumes[0]!.rotulo
    return eTexto(pub.rotulo) ? pub.rotulo : sigla
  }).filter(eTexto)
}

/**
 * O pacote da Fonte é outro que o do aparelho? Erros da Fonte (rede, login, pacote ausente, permissão) sobem; um pacote
 * que o app não abriria é «incompativel». Sem pacote no aparelho, «nova» (o download também trata a falta de estado como
 * mudança).
 */
export async function compararComODropbox(fonte: Fonte, armazem: Armazem): Promise<Novidade> {
  const local = await lerEstado(armazem)
  let novo: Manifesto
  try {
    novo = await lerManifesto(fonte)
    validarPacote(novo)
  } catch (e) {
    if (e instanceof ErroDeSchema || e instanceof ErroDeManifesto || e instanceof ErroDePacote) return INCOMPATIVEL
    throw e
  }
  if (local !== null && assinatura(local) === assinatura(novo)) return EM_DIA
  return { tipo: 'nova', rotulos: rotulosDosLivros(novo) }
}

export interface OpcoesDaProcura {
  /** De onde vem o pacote (padrão: o Dropbox). null = sem login. */
  obterFonte?: () => Promise<Fonte | null>
  /** O armazém do aparelho (padrão: o do app, o OPFS). */
  armazem?: Armazem
}

/** A procura em si; nunca lança. */
export async function procurarNovidade(opcoes: OpcoesDaProcura = {}): Promise<Novidade> {
  try {
    const armazem = opcoes.armazem ?? armazemPadrao()
    const fonte = await (opcoes.obterFonte ?? fonteDropbox)()
    if (!fonte) return DESCONHECIDA
    return await compararComODropbox(fonte, armazem)
  } catch (e) {
    if (e instanceof ErroDePacoteAusente) return { tipo: 'desconhecida', motivo: 'sem-pacote' }
    if (e instanceof ErroDePermissao) return { tipo: 'desconhecida', motivo: 'sem-permissao' }
    return DESCONHECIDA
  }
}

// O que o Início e a tela de Sincronização veem: a última resposta, para a abertura inteira do app.
let atual: Novidade | null = null
let daAbertura: Promise<Novidade> | null = null
/** Cada resposta nova (ou marcarEmDia) avança a geração: uma procura que começou antes não sobrescreve a mais nova. */
let geracao = 0
let opcoesDoApp: OpcoesDaProcura | null = null
/** Quantos downloads do pacote (/preparando) estão em andamento neste app. */
let atualizando = 0
const ouvintes = new Set<() => void>()

function avisar() {
  for (const f of [...ouvintes]) f()
}

function publicar(n: Novidade) {
  atual = n
  avisar()
}

/** Devolve sempre a resposta desta procura; publica-a se nada mais novo chegou e se ela não apaga um «nova» sem o desmentir. */
async function procurarEPublicar(): Promise<Novidade> {
  const minha = ++geracao
  const n = await procurarNovidade(opcoesDoApp ?? {})
  if (minha === geracao && !(n.tipo === 'desconhecida' && atual?.tipo === 'nova')) publicar(n)
  return n
}

/** A procura da abertura do app: só a primeira chamada procura; as seguintes devolvem a mesma resposta. */
export function procurarNaAbertura(): Promise<Novidade> {
  daAbertura ??= procurarEPublicar()
  return daAbertura
}

/** Procurar de novo, a pedido (tela de Sincronização). A resposta passa a valer também para o Início. */
export function procurarAgora(): Promise<Novidade> {
  daAbertura ??= Promise.resolve(DESCONHECIDA) // a da abertura não precisa rodar depois desta
  return procurarEPublicar()
}

/**
 * O pacote do Dropbox acabou de ser baixado (/preparando): não há mais novidade, procuras antigas não a trazem de volta, e
 * esta abertura do app já conta como procurada (o Início não baixa o manifesto de novo logo depois).
 */
export function marcarEmDia(): void {
  geracao++
  daAbertura ??= Promise.resolve(EM_DIA)
  publicar(EM_DIA)
}

/** /preparando começa (true) ou termina (false) um download do pacote. Enquanto houver um, a faixa fica escondida. */
export function marcarAtualizando(comecou: boolean): void {
  atualizando = Math.max(0, atualizando + (comecou ? 1 : -1))
  avisar()
}

export function atualizandoOsLivros(): boolean {
  return atualizando > 0
}

export function useAtualizandoOsLivros(): boolean {
  return useSyncExternalStore(assinarNovidade, atualizandoOsLivros, atualizandoOsLivros)
}

export function novidadeAtual(): Novidade | null {
  return atual
}

export function assinarNovidade(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => void ouvintes.delete(ouvinte)
}

/** Testes: troca a Fonte e o armazém da procura (null volta ao Dropbox e ao OPFS). */
export function usarProcura(opcoes: OpcoesDaProcura | null): void {
  opcoesDoApp = opcoes
}

/** Testes: esquece a procura da abertura e a resposta (como se o app tivesse acabado de abrir). */
export function esquecerNovidade(): void {
  atual = null
  daAbertura = null
  atualizando = 0
  geracao++
}

/** Depois que a tela foi desenhada (dois quadros e uma volta do laço): a procura nunca atrasa a primeira pintura. */
function depoisDeDesenhar(fazer: () => void): () => void {
  let quadro = 0
  let espera: ReturnType<typeof setTimeout> | undefined
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null
  if (!raf) {
    espera = setTimeout(fazer, 0)
  } else {
    quadro = raf(() => {
      quadro = raf(() => {
        quadro = 0
        espera = setTimeout(fazer, 0)
      })
    })
  }
  return () => {
    if (quadro && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(quadro)
    if (espera !== undefined) clearTimeout(espera)
  }
}

/**
 * A última resposta (null antes de qualquer procura). Com `procurarAoAbrir`, começa a procura da abertura depois que a
 * tela foi desenhada (uma vez por abertura do app, por mais que a tela monte de novo).
 */
export function useNovidadeDosLivros({ procurarAoAbrir = false }: { procurarAoAbrir?: boolean } = {}): Novidade | null {
  const n = useSyncExternalStore(assinarNovidade, novidadeAtual, novidadeAtual)
  useEffect(() => {
    if (!procurarAoAbrir || daAbertura) return
    return depoisDeDesenhar(() => void procurarNaAbertura())
  }, [procurarAoAbrir])
  return n
}
