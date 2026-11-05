/// <reference types="node" />
/**
 * Um Dropbox em memória que cumpre o contrato da Escrita (src/dropbox/escrita.ts), para os testes da
 * sincronização. Nada de rede. Vários "aparelhos" podem usar a mesma nuvem, cada um com a sua Escrita
 * (feita com as classes de erro do próprio grafo de módulos do aparelho, ver aparelhoSimulado.ts).
 *
 * Semântica, a mesma do Dropbox com o modo usado pela Escrita:
 * - enviar sem `sobrescrever` (ou com rev null) = "add" sem renomear: se o arquivo já existe com o MESMO
 *   conteúdo (content hash), devolve o rev que está lá; com outro conteúdo, ErroDeConflito;
 * - `sobrescrever: {rev}` = "update": troca só se o rev atual for esse; se não, conteúdo igual = ok,
 *   diferente = ErroDeConflito; se o arquivo não existe, ErroDeConflito;
 * - cada gravação ganha um rev novo; listar é recursivo e ordenado; baixar devolve uma cópia.
 * Falhas são injetadas por ganchos: `antes` (pode esperar ou lançar antes da operação), `depois` (pode
 * lançar DEPOIS de gravar: a resposta "se perdeu", como um app fechado entre o envio e a marcação) e
 * `offline` (toda operação lança ErroDeRede).
 */
import { createHash } from 'node:crypto'
import type { ArquivoDoUsuario, Escrita, OpcoesDeEnvio } from '../../src/dropbox/escrita'

interface Arquivo {
  bytes: Uint8Array
  rev: string
  hash: string
}

export type Operacao = 'enviar' | 'listar' | 'baixar'

export interface ClassesDeErro {
  ErroDeConflito: new (caminho: string) => Error
  ErroDeArquivoAusente: new (caminho: string) => Error
  ErroDeRede: new (causa?: unknown) => Error
  normalizarCaminho: (c: string) => string
}

export interface Chamada {
  op: Operacao
  caminho: string
  aparelho: string
  /** O envio gravou (ou confirmou o mesmo conteúdo). */
  ok?: boolean
  /** Nas listagens: desceu às subpastas? */
  recursivo?: boolean
}

const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const bytesDe = (x: ArrayBuffer | Uint8Array | string) =>
  typeof x === 'string' ? new TextEncoder().encode(x) : x instanceof Uint8Array ? new Uint8Array(x) : new Uint8Array(x.slice(0))

export class DropboxEmMemoria {
  readonly arquivos = new Map<string, Arquivo>()
  readonly chamadas: Chamada[] = []
  offline = false
  antes: ((op: Operacao, caminho: string, aparelho: string) => void | Promise<void>) | null = null
  depois: ((op: Operacao, caminho: string, aparelho: string) => void | Promise<void>) | null = null
  private contador = 0

  /** Grava direto na nuvem (outro aparelho, um arquivo corrompido). Devolve o rev. */
  colocar(caminho: string, conteudo: string | Uint8Array): string {
    const bytes = bytesDe(conteudo)
    const rev = `r${(++this.contador).toString(16).padStart(9, '0')}`
    this.arquivos.set(caminho, { bytes, rev, hash: hash(bytes) })
    return rev
  }

  texto(caminho: string): string {
    const a = this.arquivos.get(caminho)
    if (!a) throw new Error(`não há ${caminho}`)
    return new TextDecoder().decode(a.bytes)
  }

  json<T = unknown>(caminho: string): T {
    return JSON.parse(this.texto(caminho)) as T
  }

  caminhos(prefixo = ''): string[] {
    return [...this.arquivos.keys()].filter((c) => c.startsWith(prefixo)).sort()
  }

  rev(caminho: string): string | undefined {
    return this.arquivos.get(caminho)?.rev
  }

  /** Envios que gravaram de fato (ou confirmaram) neste caminho. */
  enviosOk(caminho: string): number {
    return this.chamadas.filter((c) => c.op === 'enviar' && c.caminho === caminho && c.ok).length
  }

  baixados(aparelho?: string): string[] {
    return this.chamadas.filter((c) => c.op === 'baixar' && (aparelho === undefined || c.aparelho === aparelho)).map((c) => c.caminho)
  }

  /** A Escrita de um aparelho (`aparelho` só identifica as chamadas). */
  escrita(classes: ClassesDeErro, aparelho = '?'): Escrita {
    const nuvem = this
    const passo = async (op: Operacao, caminho: string) => {
      const chamada: Chamada = { op, caminho, aparelho }
      nuvem.chamadas.push(chamada)
      if (nuvem.antes) await nuvem.antes(op, caminho, aparelho)
      if (nuvem.offline) throw new classes.ErroDeRede()
      return chamada
    }
    return {
      async enviar(caminhoBruto: string, conteudo: ArrayBuffer | Uint8Array, opcoes: OpcoesDeEnvio = {}) {
        const caminho = classes.normalizarCaminho(caminhoBruto)
        const chamada = await passo('enviar', caminho)
        const bytes = bytesDe(conteudo)
        const h = hash(bytes)
        const atual = nuvem.arquivos.get(caminho)
        const revEsperado = opcoes.sobrescrever?.rev ?? null
        let rev: string
        if (revEsperado === null) {
          if (atual) {
            if (atual.hash !== h) throw new classes.ErroDeConflito(caminho)
            rev = atual.rev
          } else rev = nuvem.colocar(caminho, bytes)
        } else {
          if (!atual) throw new classes.ErroDeConflito(caminho)
          if (atual.rev === revEsperado) rev = nuvem.colocar(caminho, bytes)
          else if (atual.hash === h) rev = atual.rev
          else throw new classes.ErroDeConflito(caminho)
        }
        chamada.ok = true
        if (nuvem.depois) await nuvem.depois('enviar', caminho, aparelho)
        return { rev }
      },
      async listar(prefixo: string, opcoes: { recursivo?: boolean } = {}): Promise<ArquivoDoUsuario[]> {
        const p = prefixo === 'usuario' || prefixo === 'usuario/' ? 'usuario' : classes.normalizarCaminho(prefixo)
        const chamada = await passo('listar', p)
        chamada.recursivo = opcoes.recursivo !== false
        const lista = [...nuvem.arquivos.entries()]
          .filter(([c]) => c.startsWith(`${p}/`) && (opcoes.recursivo !== false || !c.slice(p.length + 1).includes('/')))
          .map(([caminho, a]) => ({ caminho, rev: a.rev, tamanho: a.bytes.byteLength }))
          .sort((a, b) => (a.caminho < b.caminho ? -1 : a.caminho > b.caminho ? 1 : 0))
        if (nuvem.depois) await nuvem.depois('listar', p, aparelho)
        return lista
      },
      async baixar(caminhoBruto: string) {
        const caminho = classes.normalizarCaminho(caminhoBruto)
        await passo('baixar', caminho)
        const a = nuvem.arquivos.get(caminho)
        if (!a) throw new classes.ErroDeArquivoAusente(caminho)
        if (nuvem.depois) await nuvem.depois('baixar', caminho, aparelho)
        return a.bytes.slice().buffer
      },
    }
  }
}
