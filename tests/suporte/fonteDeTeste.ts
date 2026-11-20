/// <reference types="node" />
/**
 * Fonte de teste: lê o pacote sintético de tests/fixtures/pacote no disco (Node).
 * Só os testes importam este arquivo; o app não.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Fonte } from '../../src/pacote/manifesto'

export const RAIZ_DO_PACOTE_SINTETICO = join(import.meta.dirname, '..', 'fixtures', 'pacote')
/**
 * F11 (Parte 2C, bloco 2): o pacote sintético do schema 6 de antes (c86e1da), só o núcleo. É o formato do pacote que está hoje
 * no Dropbox da pessoa: o app novo tem de continuar a abri-lo (sem as tabelas do schema 7 e 8, só a camada).
 */
export const RAIZ_DO_PACOTE_6 = join(import.meta.dirname, '..', 'fixtures', 'pacote-6')
/**
 * Parte 2C, bloco 3 (Tarefa 7): os pacotes sintéticos de antes do 10, só o núcleo: o 8 (sítios, 536b6de) e o 9 (subcoleções,
 * 4aa2297). O app novo continua a abri-los (sem `other_forms`, `level_auto`, `resolved_by` e as obras SKC).
 */
export const RAIZ_DO_PACOTE_8 = join(import.meta.dirname, '..', 'fixtures', 'pacote-8')
export const RAIZ_DO_PACOTE_9 = join(import.meta.dirname, '..', 'fixtures', 'pacote-9')
/**
 * Etapa 4 (Tarefa 23): o pacote sintético do schema 10 de antes do livro em parágrafos (2402810), só o núcleo. O app novo
 * continua a abri-lo (sem `correcao_de_leitura`, sem o TESTEG e o TESTEGEN).
 */
export const RAIZ_DO_PACOTE_10 = join(import.meta.dirname, '..', 'fixtures', 'pacote-10')

function arquivosEm(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    return statSync(caminho).isDirectory() ? arquivosEm(caminho) : [caminho]
  })
}

export function fonteDeTeste(raiz: string = RAIZ_DO_PACOTE_SINTETICO): Fonte {
  return {
    async listar(prefixo = '') {
      return arquivosEm(raiz)
        .map((c) => relative(raiz, c).split(sep).join('/'))
        .filter((c) => c.startsWith(prefixo))
        .sort()
    },
    async baixar(caminho) {
      const b = readFileSync(join(raiz, caminho))
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
    },
  }
}
