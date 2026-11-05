/**
 * Um controle de sincronização simulado para os testes de tela: o estado é o que o teste define
 * (`definirSync`), e as ações são espiões. Uso:
 *   vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)
 */
import { useSyncExternalStore } from 'react'
import type * as Real from '../../src/usuario/useSincronizacao'

type InfoDaSync = Real.InfoDaSync

const padrao = (): InfoDaSync => ({
  estado: 'sincronizado',
  porEnviar: 0,
  ultimaEm: null,
  automatico: true,
  historico: [],
  recebidas: null,
  avisos: [],
  estadoIlegivel: null,
  estadoLidoEmParte: false,
  estadoSoIlegiveis: false,
  faltando: [],
  nomeDoAparelho: 'iPhone',
  iniciado: true,
})

let info = padrao()
const assinantes = new Set<() => void>()

/** Troca o que as telas veem (o estado é composto como no controle real, se não for dado). */
export function definirSync(parcial: Partial<InfoDaSync>): void {
  const novo = { ...info, ...parcial }
  if (!('estado' in parcial)) novo.estado = novo.porEnviar > 0 ? { porEnviar: novo.porEnviar } : 'sincronizado'
  info = novo
  for (const f of [...assinantes]) f()
}

export function zerarSync(): void {
  info = padrao()
  modulo.sincronizarAgora.mockClear()
  modulo.definirAutomatico.mockClear()
  for (const f of [...assinantes]) f()
}

const assinar = (f: () => void) => {
  assinantes.add(f)
  return () => {
    assinantes.delete(f)
  }
}

export const modulo = {
  ATRASO_DEPOIS_DA_MUDANCA_MS: 5000,
  useSincronizacao: () => useSyncExternalStore(assinar, () => info),
  infoDaSync: () => info,
  estadoDaSync: () => info.estado,
  assinarSync: assinar,
  sincronizarAgora: vi.fn(async () => null),
  definirAutomatico: vi.fn(async (_v: boolean) => undefined),
  iniciarSincronizacao: () => () => undefined,
  atalhoDeSalvar: () => 'Ctrl+S',
  useAtalhoDeSalvar: () => undefined,
  AtalhoDeSalvar: () => null,
  SincronizacaoAutomatica: () => null,
} satisfies Partial<typeof Real>
