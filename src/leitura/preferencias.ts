/**
 * O que a leitura de uma obra de catálogo guarda NESTE aparelho (plano «O IPIAO lido no formato do §», Tarefa 4), como as
 * línguas abertas do § (`lerLinguasAbertas`, src/telas/textoDoParagrafo.ts): no localStorage, com toda leitura e escrita
 * protegida e a memória de reserva (modo privado, dados do site bloqueados: vale até recarregar). Não é da camada do
 * usuário, nunca vira evento nem vai ao Dropbox.
 * - As colunas abertas no computador: o alemão ao lado do português, aberto por padrão (q2 A), à parte da escolha do §.
 * - A última posição de cada obra (`{ [sigla]: rota }`), para o «Continuar» das Coleções.
 */

/** O alemão aberto ao lado do português, no computador. */
export interface ColunasDaLeitura {
  de: boolean
}

const CHAVE_DAS_COLUNAS = 'iconodb:leitura-linguas'
const CHAVE_DA_POSICAO = 'iconodb:leitura-posicao'
const PADRAO: ColunasDaLeitura = { de: true }

let colunasNaMemoria: ColunasDaLeitura | null = null
let posicoesNaMemoria: Record<string, string> | null = null

const ler = (chave: string): unknown => JSON.parse(localStorage.getItem(chave) ?? 'null')

export function lerColunasDaLeitura(): ColunasDaLeitura {
  if (colunasNaMemoria) return colunasNaMemoria
  try {
    const v = ler(CHAVE_DAS_COLUNAS)
    if (typeof v === 'object' && v !== null && typeof (v as Record<string, unknown>).de === 'boolean') return { de: (v as { de: boolean }).de }
  } catch {
    // sem localStorage ou valor estragado: o padrão
  }
  return PADRAO
}

export function gravarColunasDaLeitura(v: ColunasDaLeitura): void {
  try {
    localStorage.setItem(CHAVE_DAS_COLUNAS, JSON.stringify({ de: v.de }))
    colunasNaMemoria = null
  } catch {
    colunasNaMemoria = { de: v.de }
  }
}

/** Uma rota da leitura (`/ler/…`): o que se guarda e o que se aceita de volta. */
const eRotaDaLeitura = (v: unknown): v is string => typeof v === 'string' && v.startsWith('/ler/')

/** As posições guardadas, só as que valem; o valor estragado vale nenhuma. */
function lerPosicoes(): Record<string, string> {
  if (posicoesNaMemoria) return posicoesNaMemoria
  try {
    const v = ler(CHAVE_DA_POSICAO)
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return {}
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => eRotaDaLeitura(e[1])))
  } catch {
    return {}
  }
}

/** A rota do último passo aberto na obra `sigla`; null sem nenhum. */
export function lerPosicao(sigla: string): string | null {
  const v = lerPosicoes()[sigla]
  return eRotaDaLeitura(v) ? v : null
}

/** Guarda a rota do passo aberto como a posição da obra `sigla`. */
export function gravarPosicao(sigla: string, rota: string): void {
  const todas = { ...lerPosicoes(), [sigla]: rota }
  try {
    localStorage.setItem(CHAVE_DA_POSICAO, JSON.stringify(todas))
    posicoesNaMemoria = null
  } catch {
    posicoesNaMemoria = todas
  }
}

/** Esquece o que ficou só na memória (testes). */
export const esquecerPreferenciasDaMemoria = (): void => {
  colunasNaMemoria = null
  posicoesNaMemoria = null
}
