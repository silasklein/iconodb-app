/**
 * O rascunho do formulário "Novo sítio" (NovoSitio.dc.html, PC-NovoSitio.dc.html), antes de "Registrar" (antes disso o
 * registro não existe, e `useCampoSalvo` não serve). Como os de NovoObjeto (Tarefa 9) e da nova hipótese (Tarefa 10): a cada
 * mudança o formulário inteiro vai ao `localStorage`, de forma SÍNCRONA (o Chromium corta escritas no IndexedDB ao fechar a
 * página; o localStorage, na mesma tarefa, não). Um só rascunho por aparelho (é uma tela por vez).
 *
 * - Esc, o × e qualquer navegação (sem querer, ou de propósito) FECHAM a tela e deixam o rascunho: "Novo sítio" o traz de
 *   volta, com o aviso "Rascunho recuperado". Só "Descartar o rascunho" e o fim de "Registrar" o apagam.
 * - Um formulário sem nada preenchido não deixa rascunho. `para` (o objeto a que o sítio novo vai ser ligado, vindo de "Novo
 *   sítio…" na ficha) sozinho não conta como conteúdo.
 * - `reserva`: o id `SI-…` reservado por "Registrar" ANTES de gravar; com ele um segundo "Registrar" (clique duplo, ou uma
 *   gravação interrompida e retomada) nunca cria outro sítio.
 * - DUAS ABAS: a tela ouve o evento `storage`; se outra aba grava outro conteúdo, pergunta qual fica (nada se sobrescreve
 *   sem a pessoa saber).
 *
 * Tudo em try/catch: sem armazenamento (modo privado), o formulário funciona, só não guarda.
 */
import { useMemo, useSyncExternalStore } from 'react'
import { RE_NUMERO_DO_SISTEMA } from '../objetos-skc/numeracao'

export const CHAVE_DO_RASCUNHO_DO_SITIO = 'iconodb:novo-sitio'

/**
 * `para` vem do endereço (`?para=`) e do rascunho guardado: só vale um número de objeto do livro (`CA00003`) ou o id de um objeto
 * SKC (`OB-<aparelho>-<n>`). Qualquer outra coisa é ignorada (o sítio é criado sem ligar nada), em vez de gravar um `item-sitio`
 * para um registro que não existe.
 */
export const paraValido = (v: unknown): string | null => (typeof v === 'string' && (RE_NUMERO_DO_SISTEMA.test(v) || /^OB-[a-z0-9]{8}-[1-9][0-9]*$/.test(v)) ? v : null)

export interface RascunhoDoSitio {
  nome: string
  variantes: string[]
  regiao: string
  /** Os campos como a pessoa os escreveu ("31,77"), ainda sem conferir. */
  lat: string
  lon: string
  nota: string
  /** O número do objeto do livro, ou o id do objeto SKC, a ligar ao sítio novo; null: nenhum. */
  para: string | null
  /** O id reservado ao registrar. */
  reserva?: string | null
}

export const rascunhoVazio = (): RascunhoDoSitio => ({ nome: '', variantes: [], regiao: '', lat: '', lon: '', nota: '', para: null, reserva: null })

/** Há algo preenchido (o `para` sozinho não conta)? */
export const rascunhoTemConteudo = (r: RascunhoDoSitio): boolean => [r.nome, r.regiao, r.lat, r.lon, r.nota].some((t) => t.trim() !== '') || r.variantes.length > 0

/** O que a pessoa preencheu (nem `reserva`, que uma outra aba adota em silêncio). */
export const mesmoConteudoDoSitio = (a: RascunhoDoSitio, b: RascunhoDoSitio): boolean =>
  JSON.stringify([a.nome, a.variantes, a.regiao, a.lat, a.lon, a.nota, a.para]) === JSON.stringify([b.nome, b.variantes, b.regiao, b.lat, b.lon, b.nota, b.para])

const texto = (x: unknown) => (typeof x === 'string' ? x : '')

export function lerRascunhoDoSitio(): RascunhoDoSitio | null {
  let bruto: string | null = null
  try {
    bruto = localStorage.getItem(CHAVE_DO_RASCUNHO_DO_SITIO)
  } catch {
    return null
  }
  if (!bruto) return null
  try {
    const x = JSON.parse(bruto) as Record<string, unknown>
    return {
      nome: texto(x.nome),
      variantes: Array.isArray(x.variantes) ? x.variantes.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [],
      regiao: texto(x.regiao),
      lat: texto(x.lat),
      lon: texto(x.lon),
      nota: texto(x.nota),
      para: paraValido(x.para),
      reserva: typeof x.reserva === 'string' && /^SI-[a-z0-9]{8}-[1-9][0-9]*$/.test(x.reserva) ? x.reserva : null,
    }
  } catch {
    return null
  }
}

/** Guarda o rascunho; sem conteúdo, apaga (um formulário vazio não deixa rascunho). */
export function guardarRascunhoDoSitio(r: RascunhoDoSitio): void {
  try {
    if (rascunhoTemConteudo(r)) localStorage.setItem(CHAVE_DO_RASCUNHO_DO_SITIO, JSON.stringify(r))
    else localStorage.removeItem(CHAVE_DO_RASCUNHO_DO_SITIO)
  } catch {
    // Sem armazenamento: o formulário segue, só não sobrevive a um recarregar.
  }
}

export function apagarRascunhoDoSitio(): void {
  try {
    localStorage.removeItem(CHAVE_DO_RASCUNHO_DO_SITIO)
  } catch {
    // nada a apagar
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// O rascunho da coordenada em "Corrigir" (um por sítio)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A coordenada digitada em "Corrigir" e ainda não gravada (um par válido grava sozinho ao sair do campo; o que sobra é um par
 * pela metade ou inválido). Escrito de forma síncrona a cada mudança; fechar "Corrigir" ou sair da página não o apaga: a
 * página do sítio avisa e "Corrigir" o traz de volta. Só gravar a coordenada, "Descartar o rascunho" e "Tirar/Voltar ao livro"
 * o apagam.
 */
export const chaveDoRascunhoDaCoordenada = (id: string): string => `iconodb:coordenada-sitio:${id}`

export interface RascunhoDaCoordenada {
  lat: string
  lon: string
}

// Quem lê o rascunho durante a renderização (a página do sítio) precisa saber quando ele muda: cada escrita e cada
// apagamento avisa os assinantes, e a outra aba avisa pelo evento `storage`. `versao` conta as escritas e os apagamentos de
// um sítio, nesta aba E nas outras (o `storage` também a conta; T17-B-16): quem quer apagar um rascunho que acabou de gravar
// (ou devolver um que tirou) só o faz se ninguém mexeu nele desde então.
const assinantes = new Set<() => void>()
const versoes = new Map<string, number>()
const avisar = () => assinantes.forEach((f) => f())

/** Quantas vezes o rascunho deste sítio foi escrito ou apagado (nesta aba ou em outra). */
export const versaoDoRascunhoDaCoordenada = (id: string): number => versoes.get(id) ?? 0
const mexeu = (id: string) => {
  versoes.set(id, versaoDoRascunhoDaCoordenada(id) + 1)
  avisar()
}

/**
 * Os sítios cuja coordenada está sendo gravada agora (só na memória): a página do sítio não avisa de uma coordenada «ainda não
 * salva» enquanto a gravação não termina, embora o rascunho siga guardado no aparelho até lá (T17-B-13).
 */
const gravando = new Map<string, number>()

/** Marca que a coordenada deste sítio está sendo gravada; devolve o fim (chamar uma vez, depois de apagar ou devolver o rascunho). */
export function comecarAGravarACoordenada(id: string): () => void {
  gravando.set(id, (gravando.get(id) ?? 0) + 1)
  avisar()
  let acabou = false
  return () => {
    if (acabou) return
    acabou = true
    const n = (gravando.get(id) ?? 1) - 1
    if (n <= 0) gravando.delete(id)
    else gravando.set(id, n)
    avisar()
  }
}

const PREFIXO = chaveDoRascunhoDaCoordenada('')

/** O `storage` de OUTRA aba: o rascunho dela também é uma escrita (conta na versão) e os assinantes releem. */
function aoMudarEmOutraAba(e: StorageEvent) {
  if (e.key === null) {
    for (const id of versoes.keys()) mexeu(id)
    avisar()
  } else if (e.key.startsWith(PREFIXO)) mexeu(e.key.slice(PREFIXO.length))
}

/** Assina as mudanças do rascunho (hoisted: o React não refaz a assinatura a cada renderização). */
function assinar(f: () => void): () => void {
  if (assinantes.size === 0) window.addEventListener('storage', aoMudarEmOutraAba)
  assinantes.add(f)
  return () => {
    assinantes.delete(f)
    if (assinantes.size === 0) window.removeEventListener('storage', aoMudarEmOutraAba)
  }
}

function textoGuardado(id: string): string | null {
  try {
    return localStorage.getItem(chaveDoRascunhoDaCoordenada(id))
  } catch {
    return null
  }
}

function lerDoTexto(bruto: string | null): RascunhoDaCoordenada | null {
  if (!bruto) return null
  try {
    const x = JSON.parse(bruto) as Record<string, unknown>
    return { lat: texto(x.lat), lon: texto(x.lon) }
  } catch {
    return null
  }
}

export const lerRascunhoDaCoordenada = (id: string): RascunhoDaCoordenada | null => lerDoTexto(textoGuardado(id))

export function guardarRascunhoDaCoordenada(id: string, r: RascunhoDaCoordenada): void {
  try {
    localStorage.setItem(chaveDoRascunhoDaCoordenada(id), JSON.stringify(r))
  } catch {
    // Sem armazenamento: a tela segue, só não sobrevive a um recarregar.
  }
  mexeu(id)
}

export function apagarRascunhoDaCoordenada(id: string): void {
  try {
    localStorage.removeItem(chaveDoRascunhoDaCoordenada(id))
  } catch {
    // nada a apagar
  }
  mexeu(id)
}

/** Apaga o rascunho SÓ se ninguém mexeu nele desde `versao` (a gravação que terminou não apaga um rascunho mais novo). */
export function apagarRascunhoDaCoordenadaSeVersao(id: string, versao: number): void {
  if (versaoDoRascunhoDaCoordenada(id) === versao) apagarRascunhoDaCoordenada(id)
}

/**
 * Devolve o rascunho que uma gravação tinha tirado e que falhou, a não ser que alguém tenha escrito ou apagado o rascunho
 * depois (`versao`, lida logo depois de tirá-lo): aí o que está lá é mais novo e vale mais.
 */
export function devolverRascunhoDaCoordenada(id: string, r: RascunhoDaCoordenada, versao: number): void {
  if (versaoDoRascunhoDaCoordenada(id) === versao) guardarRascunhoDaCoordenada(id, r)
}

/** O rascunho da coordenada deste sítio, lido durante a renderização e refeito quando ele muda (nesta aba ou em outra). Sem rascunho enquanto a coordenada está sendo gravada. */
export function useRascunhoDaCoordenada(id: string): RascunhoDaCoordenada | null {
  const bruto = useSyncExternalStore(
    assinar,
    () => (gravando.has(id) ? null : textoGuardado(id)),
    () => null,
  )
  return useMemo(() => lerDoTexto(bruto), [bruto])
}
