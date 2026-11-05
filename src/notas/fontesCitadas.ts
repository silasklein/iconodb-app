/**
 * Que objeto cada número citado no texto é (decisão 40). Um número de livro ("TESTE I: 5") é resolvido pelo pacote
 * (`objetosDasFontes`, a mesma correspondência da busca exata), com cache até o pacote ser reaberto; um "SKC: n", pelo
 * SKC, Nr. da numeração (`porNrSkc`), na hora, pelo estado. Uma obra planejada que ainda não está no pacote
 * ("IPIAO III") não tem objetos: a citação aparece com o "?".
 *
 * O resultado é por `chaveDaFonte`: um `ObjetoCitado`, `null` (sabe-se que não existe) ou nada (não se sabe agora: sem
 * pacote, banco ocupado). Como em alvos.ts, só se marca "?" quando se SABE.
 */
import { aoReabrir } from '../banco/cliente'
import { objetosDasFontes, obrasDoPacote } from '../banco/consultas'
import { chaveDaFonte } from '../banco/referencias'
import { numeracaoDe, objetosComNumero } from '../objetos-skc/atual'
import type { Estado } from '../usuario/estado'
import { OBRA_SKC } from './citacoes'

export interface ReferenciaCitada {
  obra: string
  numero: number
  sufixo?: string
  abb?: boolean
}

export interface ObjetoCitado {
  /** O número do sistema (ou o id do objeto SKC ainda sem número). */
  numero: string
  rota: string
  /** O id do objeto SKC (OB-…), para a miniatura e o resumo. */
  skc?: string
}

const chaveDe = (r: ReferenciaCitada) => chaveDaFonte(r.obra, r.numero, r.sufixo ?? '', !!r.abb)

// O pacote: as obras abertas e as respostas por chave. Esquecidos quando o pacote é reaberto.
let obras: Promise<ReadonlySet<string> | null> | null = null
let obrasJa: ReadonlySet<string> | null = null
const cache = new Map<string, string | null>()
let ouvindo = false

function lembrarReaberturas() {
  if (ouvindo) return
  ouvindo = true
  aoReabrir(esquecerCitacoes)
}

/** Esquece o que o pacote respondeu (ao reabrir; testes). */
export function esquecerCitacoes(): void {
  obras = null
  obrasJa = null
  cache.clear()
}

/** As obras abertas no pacote ("TESTE I"); null se o banco não respondeu (tenta de novo na próxima vez). */
export function obrasAbertas(): Promise<ReadonlySet<string> | null> {
  lembrarReaberturas()
  if (!obras) {
    const pedido = obrasDoPacote().then(
      (lista) => (obrasJa = new Set(lista)),
      () => {
        if (obras === pedido) obras = null
        return null
      },
    )
    obras = pedido
  }
  return obras
}

/** As obras abertas, se já se sabe (sem esperar). */
export const obrasAbertasJa = (): ReadonlySet<string> | null => obrasJa

/** O objeto SKC com este SKC, Nr. (o mesmo critério da busca exata: existe, não excluído, com número). */
export function objetoSkcCitado(estado: Estado, nr: number): ObjetoCitado | null {
  const numeracao = numeracaoDe(estado)
  const id = numeracao.porNrSkc.get(nr)
  const numero = id ? (numeracao.porId.get(id)?.numero ?? null) : null
  if (!id || !numero || !objetosComNumero(estado).has(numero)) return null
  return { numero, rota: `/item/${encodeURIComponent(numero)}`, skc: id }
}

/** Resolve as referências citadas (o mapa é pela `chaveDaFonte`; veja o cabeçalho). */
export async function resolverFontes(refs: readonly ReferenciaCitada[], estado: Estado): Promise<Map<string, ObjetoCitado | null>> {
  const mapa = new Map<string, ObjetoCitado | null>()
  const doLivro: ReferenciaCitada[] = []
  for (const r of refs) {
    if (r.obra === OBRA_SKC) mapa.set(chaveDe(r), r.sufixo || r.abb ? null : objetoSkcCitado(estado, r.numero))
    else doLivro.push(r)
  }
  if (doLivro.length === 0) return mapa
  const abertas = await obrasAbertas()
  if (!abertas) return mapa
  const faltam = doLivro.filter((r) => abertas.has(r.obra) && !cache.has(chaveDe(r)))
  if (faltam.length > 0) {
    try {
      const achados = await objetosDasFontes(faltam)
      for (const r of faltam) cache.set(chaveDe(r), achados.get(chaveDe(r)) ?? null)
    } catch {
      /* banco ocupado ou sem pacote: fica sem resposta (o link espera) */
    }
  }
  for (const r of doLivro) {
    const chave = chaveDe(r)
    if (!abertas.has(r.obra)) {
      mapa.set(chave, null)
      continue
    }
    if (!cache.has(chave)) continue
    const numero = cache.get(chave)!
    mapa.set(chave, numero ? { numero, rota: `/item/${encodeURIComponent(numero)}` } : null)
  }
  return mapa
}
