import { lerHlc } from '../usuario/hlc'
import type { NotaVista } from './indiceDeNotas'

/** A data de criação da nota, "31/10/2026", no relógio do aparelho. */
export function dataDaNota(nota: Pick<NotaVista, 'criadaEm'>): string {
  const h = lerHlc(nota.criadaEm)
  const d = new Date(h ? h.ms : 0)
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** "[1] · 31/10/2026", com "· rascunho" enquanto a nota não foi salva. */
export function cabecaDaNota(nota: Pick<NotaVista, 'ordinal' | 'criadaEm' | 'rascunho'>): string {
  return `[${nota.ordinal}] · ${dataDaNota(nota)}${nota.rascunho ? ' · rascunho' : ''}`
}

/** O rótulo do campo de edição: "Nota [1] · 31/10/2026 · rascunho". */
export const rotuloDoCampo = (nota: Pick<NotaVista, 'ordinal' | 'criadaEm' | 'rascunho'>): string => `Nota ${cabecaDaNota(nota)}`

/** O rótulo de uma nota ainda não criada: o próximo número do alvo e a data de hoje. */
export function rotuloDaNotaNova(ordinal: number, agora = Date.now()): string {
  const d = new Date(agora)
  const dois = (n: number) => String(n).padStart(2, '0')
  return `Nota [${ordinal}] · ${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** O texto da nota em uma linha, sem links, para listas. */
export function resumoDaNota(texto: string, maximo = 200): string {
  const linha = texto.replace(/\s+/g, ' ').trim()
  return linha.length > maximo ? `${linha.slice(0, maximo - 1).trimEnd()}…` : linha
}

/** O caminho para criar uma nota num alvo (o celular abre a tela da nota). */
export const caminhoDaNotaNova = (tipo: string, ref: string): string => `/nota/nova?alvoTipo=${encodeURIComponent(tipo)}&alvo=${encodeURIComponent(ref)}`
export const caminhoDaNota = (id: string): string => `/nota/${encodeURIComponent(id)}`
