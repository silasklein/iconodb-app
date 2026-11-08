/**
 * Aparelhos simulados para os testes da sincronização: cada um tem o próprio IndexedDB (uma IDBFactory do
 * fake-indexeddb) e o próprio grafo de módulos (vi.resetModules + import dinâmico), como dois aparelhos
 * de verdade. A conexão com o banco é aberta (e guardada pelo módulo bancoUsuario daquele grafo) enquanto
 * o `indexedDB` global aponta para a fábrica do aparelho; depois o global volta ao que era.
 *
 * Os testes devem desligar o BroadcastChannel (vi.stubGlobal('BroadcastChannel', undefined)): no Node ele
 * é compartilhado entre os grafos e levaria os eventos de um aparelho ao outro sem passar pelo Dropbox.
 */
import { IDBFactory } from 'fake-indexeddb'
import type { Escrita } from '../../src/dropbox/escrita'
import type { DropboxEmMemoria } from './dropboxEmMemoria'

export interface AparelhoSimulado {
  id: string
  fabrica: IDBFactory
  sync: typeof import('../../src/usuario/sincronizar')
  estado: typeof import('../../src/usuario/estado')
  armazem: typeof import('../../src/usuario/armazem')
  local: typeof import('../../src/usuario/diarioLocal')
  aparelho: typeof import('../../src/usuario/aparelho')
  /** A fusão do mesmo grafo (um Estado só é lido pelas funções do grafo que o criou). */
  fusao: typeof import('../../src/usuario/fusao')
  /** Os números confirmados deste aparelho (objetos SKC, Tarefa 9). */
  numeros: typeof import('../../src/objetos-skc/confirmados')
  /** A fonte dos números do pacote (cada aparelho liga a sua). */
  pacote: typeof import('../../src/objetos-skc/pacote')
  /** As operações dos sítios (mesclar, partes, grafias…), gravando no IndexedDB deste aparelho. */
  sitios: typeof import('../../src/sitios/operacoes')
  escrita: Escrita
  /** O app fechado e aberto de novo: módulos novos, o mesmo IndexedDB (já carregado em memória). */
  reabrir(): Promise<AparelhoSimulado>
}

async function carregar(fabrica: IDBFactory, nuvem: DropboxEmMemoria, nome?: string): Promise<AparelhoSimulado> {
  const anterior = globalThis.indexedDB
  globalThis.indexedDB = fabrica
  try {
    vi.resetModules()
    const aparelho = await import('../../src/usuario/aparelho')
    const sync = await import('../../src/usuario/sincronizar')
    const estado = await import('../../src/usuario/estado')
    const armazem = await import('../../src/usuario/armazem')
    const local = await import('../../src/usuario/diarioLocal')
    const fusao = await import('../../src/usuario/fusao')
    const numeros = await import('../../src/objetos-skc/confirmados')
    const pacote = await import('../../src/objetos-skc/pacote')
    const sitios = await import('../../src/sitios/operacoes')
    const escritaMod = await import('../../src/dropbox/escrita')
    const manifesto = await import('../../src/pacote/manifesto')
    if (nome) await aparelho.renomearAparelho(nome)
    const { id } = await aparelho.aparelhoAtual()
    await estado.carregarEstado()
    await numeros.lerConfirmados()
    const classes = {
      ErroDeConflito: escritaMod.ErroDeConflito,
      ErroDeArquivoAusente: escritaMod.ErroDeArquivoAusente,
      ErroDeRede: manifesto.ErroDeRede,
      normalizarCaminho: escritaMod.normalizarCaminho,
    }
    const simulado: AparelhoSimulado = {
      id,
      fabrica,
      sync,
      estado,
      armazem,
      local,
      aparelho,
      fusao,
      numeros,
      pacote,
      sitios,
      escrita: nuvem.escrita(classes, id),
      reabrir: () => carregar(fabrica, nuvem),
    }
    return simulado
  } finally {
    globalThis.indexedDB = anterior
  }
}

/** Um aparelho novo (IndexedDB vazio), ligado à nuvem dada. */
export function novoAparelho(nuvem: DropboxEmMemoria, nome?: string): Promise<AparelhoSimulado> {
  return carregar(new IDBFactory(), nuvem, nome)
}
