/// <reference types="node" />
/**
 * O banco sobre o pacote sintético, no Node: os arquivos de tests/fixtures/pacote
 * entram num Armazem em memória (como a Tarefa 4 os deixaria no aparelho) e o
 * Banco os abre em memória (sqlite-wasm, sem OPFS). Só os testes importam este arquivo.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { armazemMemoria, type Armazem } from '../../src/pacote/armazem'
import { caminhoDoBlob, gravarEstado } from '../../src/pacote/local'
import { validarManifesto } from '../../src/pacote/manifesto'
import { Banco } from '../../src/banco/nucleo'
import { RAIZ_DO_PACOTE_SINTETICO } from './fonteDeTeste'

/** Um armazém com o núcleo do pacote sintético completo (blobs + estado.json). */
export async function armazemComPacote(): Promise<Armazem> {
  const armazem = armazemMemoria()
  const manifesto = validarManifesto(JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo/manifest.json'), 'utf8')))
  for (const [caminho, { sha256 }] of Object.entries(manifesto.arquivos)) {
    if (!caminho.startsWith('nucleo/')) continue
    await armazem.gravar(caminhoDoBlob(sha256), new Uint8Array(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, caminho))))
  }
  await gravarEstado(armazem, manifesto)
  return armazem
}

/** O Banco (que também é um Motor do cliente) sobre o pacote sintético, em memória. */
export async function bancoDeTeste(opcoes: { escrita?: boolean; armazem?: Armazem } = {}): Promise<Banco> {
  return new Banco({ armazem: opcoes.armazem ?? (await armazemComPacote()), escrita: opcoes.escrita })
}
