/**
 * Para onde leva cada link `[[ref|rótulo]]` de uma nota, e se o alvo existe. O pacote responde pelos verbetes, obras,
 * objetos, sítios e grupos dele (`alvosDoPacote`, uma consulta por lote, com cache até o pacote ser reaberto); a camada
 * do usuário responde pelo que ela criou (coleções `CO-`, sítios `SI-`, hipóteses `HY-`, objetos SKC), pelo estado.
 *
 * `existe: false` só quando se SABE que o alvo não existe (o pacote respondeu e não o trouxe). Se o banco não pôde
 * responder (sem pacote, ocupado), `existe` fica `null` e o link aparece como link: o pior que acontece é abrir a tela
 * de "não encontrado".
 */
import { aoReabrir } from '../banco/cliente'
import { alvosDoPacote, type AlvoDoPacote } from '../banco/consultas'
import { rotaDoAcertoDoUsuario } from '../busca/rotasDoUsuario'
import type { Estado } from '../usuario/estado'
import { partesDoAlvoDoItem } from '../colecoes/notas'
import { numeracaoDe } from '../objetos-skc/atual'
import { formasEmUso } from '../glossario/doUsuario'
import { formasDoPacote, nomeVivo } from '../glossario/formasDoPacote'
import { eVerbeteSkc, lerVerbeteSkc } from '../glossario/modelo'
import { lerHipotese, nomeDaHipoteseSkc } from '../hipoteses/modelo'
import { lerDadosDoSitio } from '../sitios/modelo'
import { resolucaoDeSitios } from '../sitios/useResolucao'
import { destinoDe, redirecionamentosOuNenhum } from '../pacote/redirecionamentos'
import { citacoesDoTexto } from './citacoes'
import { chaveDoAlvo, idCanonico, referenciasDe, type TipoDeRef } from './links'

export interface AlvoResolvido {
  tipo: TipoDeRef
  ref: string
  /** `null`: não deu para saber agora. */
  existe: boolean | null
  /** Para onde o link leva; `null` quando o alvo existe mas ainda não tem tela (coleção, hipótese, objeto sem número…). */
  rota: string | null
  /** Como o alvo se chama no pacote ou na camada do usuário (para um `[[ref]]` sem rótulo). */
  rotulo: string | null
}

const enc = encodeURIComponent

/** A rota de um alvo que existe (ou que não se sabe se existe). */
export function rotaDoAlvo(tipo: TipoDeRef, ref: string): string | null {
  switch (tipo) {
    case 'verbete':
      return `/verbete/${enc(ref)}`
    case 'obra':
      return `/obra/${enc(ref)}`
    case 'objeto':
      return `/item/${enc(ref)}`
    case 'grupo':
      return `/grupo/${enc(ref)}`
    case 'sitio':
      return ref.startsWith('SI-') ? rotaDoAcertoDoUsuario('sitio', ref) : `/sitio/${enc(ref)}`
    case 'colecao':
      return rotaDoAcertoDoUsuario('colecao', ref)
    case 'hipotese':
      return rotaDoAcertoDoUsuario('hipotese', ref)
    case 'objeto-skc':
      return rotaDoAcertoDoUsuario('objeto', ref)
    case 'colecao-item': {
      const partes = partesDoAlvoDoItem(ref)
      return partes ? rotaDoAcertoDoUsuario('colecao', partes.colecao) : null
    }
  }
}

/** Do pacote? Os tipos da camada do usuário não estão nele (nem os verbetes do usuário, `GL-<aparelho>-<n>`, decisão 41). */
const doPacote = (tipo: TipoDeRef, ref: string) => (tipo === 'verbete' && !eVerbeteSkc(ref)) || tipo === 'obra' || tipo === 'objeto' || tipo === 'grupo' || (tipo === 'sitio' && !ref.startsWith('SI-'))

// Cache das respostas do pacote: chave do alvo → o que o pacote disse (null: não existe). Esquecido quando o pacote é reaberto.
const cache = new Map<string, AlvoDoPacote | null>()
let ouvindoReabertura = false

function lembrarReaberturas() {
  if (ouvindoReabertura) return
  ouvindoReabertura = true
  aoReabrir(() => cache.clear())
}

/** Esquece o que o pacote respondeu (testes). */
export const esquecerAlvos = () => cache.clear()

/** Pergunta ao pacote pelos alvos que ainda não estão no cache. Quem falha fica sem cache (e sem resposta). */
async function consultarPacote(alvos: readonly { tipo: TipoDeRef; ref: string }[]): Promise<Set<string>> {
  lembrarReaberturas()
  const faltam = alvos.filter((a) => doPacote(a.tipo, a.ref) && !cache.has(chaveDoAlvo(a.tipo, a.ref)))
  const semResposta = new Set<string>()
  if (faltam.length === 0) return semResposta
  try {
    const achados = await alvosDoPacote([...new Set(faltam.map((a) => a.ref))])
    for (const a of faltam) {
      const achado = achados.get(a.ref) ?? null
      cache.set(chaveDoAlvo(a.tipo, a.ref), achado)
    }
  } catch {
    for (const a of faltam) semResposta.add(chaveDoAlvo(a.tipo, a.ref))
  }
  return semResposta
}

/** O que a camada do usuário tem: coleções, sítios, hipóteses, objetos SKC (por id ou por número) e verbetes. */
function noEstado(estado: Estado, tipo: TipoDeRef, ref: string, nomeDe: (id: string, guardado: string) => string): { existe: boolean; rotulo: string | null } | null {
  const vivo = (t: 'colecao' | 'sitio' | 'hipotese' | 'objeto', id: string = ref) => {
    const r = estado.registro(t, id)
    return r && !r.excluido ? r : null
  }
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
  if (tipo === 'colecao') {
    const r = vivo('colecao')
    return { existe: !!r, rotulo: texto(r?.campos.nome) }
  }
  if (tipo === 'colecao-item') {
    const partes = partesDoAlvoDoItem(ref)
    const r = partes ? vivo('colecao', partes.colecao) : null
    return { existe: !!r, rotulo: texto(r?.campos.nome) }
  }
  if (tipo === 'sitio' && ref.startsWith('SI-')) {
    // Um sítio seu excluído continua sendo um link que abre (a página oferece «Restaurar o sítio»), dito como excluído.
    const r = estado.registro('sitio', ref)
    const nome = texto(r?.campos.nome)
    return { existe: !!r, rotulo: nome !== null && r?.excluido ? `${nome} (excluído)` : nome }
  }
  if (tipo === 'hipotese') {
    // O primeiro termo pelo nome de AGORA (forma em uso, senão o do livro, senão o rótulo guardado; T17-B-12).
    const r = vivo('hipotese')
    return { existe: !!r, rotulo: r && lerHipotese(r).termos.length > 0 ? nomeDaHipoteseSkc(lerHipotese(r), nomeDe) : null }
  }
  if (tipo === 'verbete' && eVerbeteSkc(ref)) {
    const r = estado.registro('verbete', ref)
    return { existe: !!r && !r.excluido, rotulo: r ? lerVerbeteSkc(r).emUso : null }
  }
  if (tipo === 'objeto-skc') {
    const r = vivo('objeto')
    return { existe: !!r, rotulo: texto(r?.campos.numero) }
  }
  return null
}

/** Um objeto SKC com este número (`CA00005`) existe na camada do usuário? */
function objetoSkcComNumero(estado: Estado, numero: string): boolean {
  for (const r of estado.registros.get('objeto')?.values() ?? []) {
    if (!r.excluido && typeof r.campos.numero === 'string' && r.campos.numero.trim().toUpperCase() === numero) return true
  }
  return false
}

const nomeCorrigidoDoSitio = (estado: Estado, id: string): string | null => {
  const r = estado.registro('sitio', id)
  return r ? lerDadosDoSitio(r).nome : null
}

/** «CA00005 (excluído)» (ou o título, se não tem número) para o id de um objeto SKC excluído; null para os demais. */
function rotuloDoObjetoSkcExcluido(estado: Estado, ref: string): string | null {
  if (!/^OB-/i.test(ref)) return null
  const quem = ref.toUpperCase()
  const r = [...(estado.registros.get('objeto')?.values() ?? [])].find((x) => x.id.toUpperCase() === quem)
  if (!r?.excluido) return null
  const nome = numeracaoDe(estado).porId.get(r.id)?.numero ?? (typeof r.campos.titulo === 'string' && r.campos.titulo.trim() !== '' ? r.campos.titulo.trim() : null)
  return `${nome ?? 'Objeto'} (excluído)`
}

/** Resolve os alvos (o mapa é pela `chaveDoAlvo`). */
export async function resolverAlvos(alvos: readonly { tipo: TipoDeRef; ref: string }[], estado: Estado): Promise<Map<string, AlvoResolvido>> {
  // Um verbete ou sítio do usuário que o pacote publicou (Tarefa 16) é o do livro: resolve-se o destino; a chave fica a do texto.
  const redirecionamentos = alvos.some((a) => a.tipo === 'verbete' || a.tipo === 'sitio') ? await redirecionamentosOuNenhum() : null
  const unicos = [...new Map(alvos.map((a) => [chaveDoAlvo(a.tipo, a.ref), { tipo: a.tipo, ref: idCanonico(a.tipo, a.ref), doTexto: a.ref }])).values()].map((a) => ({
    ...a,
    ref: a.tipo === 'verbete' || a.tipo === 'sitio' ? destinoDe(redirecionamentos, a.ref) : a.ref,
  }))
  // Parte 2C, bloco 2: um sítio mesclado em outro é dito pelo nome do destino (o link continua no endereço antigo, que leva ao
  // destino com o aviso «Você abriu …»).
  const resolucao = unicos.some((a) => a.tipo === 'sitio') ? await resolucaoDeSitios(estado) : null
  const destinoDoSitio = new Map<string, string>()
  for (const a of unicos) {
    if (a.tipo !== 'sitio' || !resolucao?.existe(a.ref)) continue
    const d = resolucao.destino(a.ref)
    if (d !== resolucao.canonico(a.ref)) destinoDoSitio.set(a.ref, d)
  }
  const semResposta = await consultarPacote([...unicos, ...[...destinoDoSitio.values()].map((ref) => ({ tipo: 'sitio' as const, ref }))])
  // Os nomes de agora dos verbetes (T17-B-12): a forma em uso do usuário e o nome do livro.
  const formas = formasEmUso(estado)
  const pacoteDasFormas = await formasDoPacote().catch(() => null)
  const nomeDe = (id: string, guardado: string) => nomeVivo(id, guardado, formas, pacoteDasFormas)
  const mapa = new Map<string, AlvoResolvido>()
  for (const a of unicos) {
    const chave = chaveDoAlvo(a.tipo, a.ref)
    let existe: boolean | null
    let rotulo: string | null = null
    if (doPacote(a.tipo, a.ref)) {
      if (semResposta.has(chave)) existe = null
      else {
        const achado = cache.get(chave) ?? null
        existe = !!achado || (a.tipo === 'objeto' && objetoSkcComNumero(estado, a.ref))
        rotulo = achado?.rotulo ?? null
        if (a.tipo === 'verbete' && achado) rotulo = formas.get(a.ref) ?? rotulo
        // Um sítio do livro corrigido: o nome de agora (Tarefa 12).
        if (a.tipo === 'sitio' && achado) rotulo = nomeCorrigidoDoSitio(estado, a.ref) ?? rotulo
        // Um objeto SKC seu excluído (a nota guarda o id `OB-…`, canonizado em maiúsculas): o alvo diz que está excluído.
        if (a.tipo === 'objeto') rotulo = rotuloDoObjetoSkcExcluido(estado, a.ref) ?? rotulo
      }
    } else {
      const r = noEstado(estado, a.tipo, a.ref, nomeDe)
      existe = r ? r.existe : null
      rotulo = r?.rotulo ?? null
    }
    const destino = a.tipo === 'sitio' ? destinoDoSitio.get(a.ref) : undefined
    if (destino !== undefined) {
      const nomeDoDestino = doPacote('sitio', destino)
        ? (nomeCorrigidoDoSitio(estado, destino) ?? cache.get(chaveDoAlvo('sitio', destino))?.rotulo ?? null)
        : (noEstado(estado, 'sitio', destino, nomeDe)?.rotulo ?? null)
      rotulo = nomeDoDestino ?? rotulo
    }
    const resolvido = { tipo: a.tipo, ref: a.ref, existe, rota: existe === false ? null : rotaDoAlvo(a.tipo, a.ref), rotulo }
    mapa.set(chave, resolvido)
    // o alvo como o texto o escreve (o id do usuário redirecionado) leva ao mesmo
    if (a.doTexto !== a.ref) mapa.set(chaveDoAlvo(a.tipo, a.doTexto), resolvido)
  }
  return mapa
}

/** Os alvos que os textos ligam (sem repetir): os `[[…]]` e os números do sistema escritos soltos (decisão 40). */
export function alvosDosTextos(textos: readonly string[]): { tipo: TipoDeRef; ref: string }[] {
  const todos = textos.flatMap((t) => [...referenciasDe(t), ...citacoesDoTexto(t).objetos.map((ref) => ({ tipo: 'objeto' as const, ref }))])
  return [...new Map(todos.map((a) => [chaveDoAlvo(a.tipo, a.ref), a])).values()]
}


/** Como uma lista chama o alvo de uma nota ("em CA00023 · Peça de teste", "em leão-de-teste"). */
export function descreverAlvo(tipo: TipoDeRef, ref: string, alvo: AlvoResolvido | undefined): string {
  const nome = alvo?.rotulo
  // O objeto SKC excluído já vem com o número (ou o título) e a marca: o id `OB-…` não diz nada a quem lê.
  if (tipo === 'objeto' && /^OB-/i.test(ref) && nome?.endsWith('(excluído)')) return nome
  if (tipo === 'objeto') return nome && nome !== ref ? `${ref} · ${nome}` : ref
  if (tipo === 'colecao-item') {
    const partes = partesDoAlvoDoItem(ref)
    return partes ? (nome ? `${partes.objeto} em ${nome}` : `${partes.objeto} em ${partes.colecao}`) : ref
  }
  return nome ?? ref
}
