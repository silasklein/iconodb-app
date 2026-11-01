/**
 * O banco: abre os arquivos do último pacote completo num só sqlite-wasm.
 *
 * comum.sqlite é o esquema `main`; cada pub-<SIGLA>.sqlite é anexado como
 * `pub_<SIGLA>` (siglas vindas do manifesto) e busca.sqlite como `busca`.
 *
 * Dois modos:
 * - **opfs-sahpool** (navegador, no worker): os arquivos são importados no pool do
 *   OPFS (`importDb`) e só são importados de novo quando o sha256 do estado muda.
 *   O sha importado fica num marcador ao lado do pool. Não precisa de COOP/COEP.
 * - **memória** (Node nos testes, e o navegador quando o pool está ocupado por outra
 *   janela): os bytes são desserializados direto (`sqlite3_deserialize`).
 *
 * Por padrão tudo é só leitura: as telas nunca escrevem SQL, e o banco recusa escrita.
 */
import sqlite3InitModule, { type BindingSpec, type Database, type SAHPoolUtil, type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import type { Armazem } from '../pacote/armazem'
import { caminhoDoBlob, lerEstado } from '../pacote/local'
import type { Manifesto } from '../pacote/manifesto'
import { arquivosDoBanco, type ArquivoDoBanco } from './arquivos'
import { ErroSemPacote, type EstadoBanco, type Linha, type Motor, type Parametros } from './protocolo'

export { arquivosDoBanco, ESQUEMA_DA_BUSCA, esquemaDaPublicacao, type ArquivoDoBanco } from './arquivos'

/**
 * O que importar no pool e o que tirar dele. Importa o arquivo cujo sha marcado
 * difere do estado ou que sumiu do pool; remove o que está no pool e não é do pacote.
 */
export function planoDeImportacao(
  arquivos: readonly { nome: string; sha256: string }[],
  importados: Readonly<Record<string, string>>,
  noPool: readonly string[],
): { importar: string[]; remover: string[] } {
  const nomes = new Set(arquivos.map((a) => a.nome))
  return {
    importar: arquivos.filter((a) => importados[a.nome] !== a.sha256 || !noPool.includes(a.nome)).map((a) => a.nome),
    remover: noPool.filter((n) => !nomes.has(n)),
  }
}

/** Onde fica o sha de cada arquivo já importado no pool (nome no pool → sha256). */
export interface Marcador {
  ler(): Promise<Record<string, string>>
  gravar(dados: Record<string, string>): Promise<void>
}

export interface PoolDoBanco {
  util: SAHPoolUtil
  marcador: Marcador
}

export interface OpcoesDoBanco {
  armazem: Armazem
  /** Instala o pool do OPFS (só no worker). Sem ele, ou se ele falhar, o banco abre em memória. */
  pool?: (sqlite3: Sqlite3Static) => Promise<PoolDoBanco>
  /** Só nos testes: permite escrever (o padrão é só leitura). */
  escrita?: boolean
}

let modulo: Promise<Sqlite3Static> | null = null
function carregarSqlite(): Promise<Sqlite3Static> {
  if (!modulo) {
    const carregando = sqlite3InitModule()
    modulo = carregando
    // Se o wasm não carregou (sem rede, por exemplo), a próxima abertura tenta de novo.
    carregando.catch(() => {
      if (modulo === carregando) modulo = null
    })
  }
  return modulo
}

/** Os bytes do arquivo na versão do manifesto dado (blob por sha256), ou null se ele já não está lá. */
async function lerArquivo(armazem: Armazem, arquivo: ArquivoDoBanco): Promise<Uint8Array | null> {
  const bytes = await armazem.ler(caminhoDoBlob(arquivo.sha256))
  if (!bytes || bytes.byteLength !== arquivo.bytes) return null
  // O wasm só aceita Uint8Array "puro" (não Buffer do Node nem de outro realm).
  return bytes.constructor === Uint8Array ? bytes : new Uint8Array(bytes)
}

/** O estado mudou enquanto o banco abria (outra janela trocou o pacote): vale tentar de novo. */
class PacoteMudou extends Error {}

export class Banco implements Motor {
  private readonly opcoes: OpcoesDoBanco
  private db: Database | null = null
  private estado: EstadoBanco | null = null
  private pool: Promise<PoolDoBanco | null> | null = null
  /** Abrir, reabrir e executar acontecem um de cada vez. */
  private fila: Promise<unknown> = Promise.resolve()

  constructor(opcoes: OpcoesDoBanco) {
    this.opcoes = opcoes
  }

  private emFila<T>(tarefa: () => Promise<T>): Promise<T> {
    const r = this.fila.then(tarefa, tarefa)
    this.fila = r.catch(() => undefined)
    return r
  }

  abrir(): Promise<EstadoBanco> {
    return this.emFila(async () => this.estado ?? (await this.abrirAgora()))
  }

  reabrir(): Promise<EstadoBanco> {
    return this.emFila(() => this.abrirAgora())
  }

  executar(sql: string, parametros?: Parametros): Promise<Linha[]> {
    return this.emFila(async () => {
      if (!this.db) throw new ErroSemPacote()
      return this.db.selectObjects(sql, parametros as BindingSpec | undefined) as Linha[]
    })
  }

  private fechar(): void {
    this.db?.close()
    this.db = null
    this.estado = null
  }

  private async abrirAgora(): Promise<EstadoBanco> {
    this.fechar()
    for (let tentativa = 0; ; tentativa++) {
      const manifesto = await lerEstado(this.opcoes.armazem)
      // "Sem pacote" não fica guardado: o próximo abrir() olha o estado.json de novo
      // (o pacote pode chegar depois, pela sincronização desta ou de outra janela).
      if (!manifesto) return { estado: 'sem-pacote' }
      try {
        return (this.estado = await this.abrirPacote(manifesto))
      } catch (erro) {
        // Nada fica meio aberto: sem estado guardado, o próximo abrir() tenta do zero.
        this.fechar()
        if (!(erro instanceof PacoteMudou) || tentativa >= 2) throw erro
      }
    }
  }

  private async abrirPacote(manifesto: Manifesto): Promise<EstadoBanco> {
    const sqlite3 = await carregarSqlite()
    const { arquivos, publicacoes } = arquivosDoBanco(manifesto)
    const pool = await this.obterPool(sqlite3)
    let modo: 'opfs-sahpool' | 'memoria' = 'memoria'
    if (pool) {
      try {
        this.db = await this.abrirNoPool(sqlite3, pool, arquivos)
        modo = 'opfs-sahpool'
      } catch (erro) {
        if (erro instanceof PacoteMudou) throw erro
        console.warn('IconoDB: o banco abre em memória (falha no pool do OPFS).', erro)
      }
    }
    this.db ??= await this.abrirEmMemoria(sqlite3, arquivos)
    if (!this.opcoes.escrita) this.db.exec('PRAGMA query_only = 1')
    return { estado: 'aberto', publicacoes, geradoEm: manifesto.gerado_em, modo }
  }

  private obterPool(sqlite3: Sqlite3Static): Promise<PoolDoBanco | null> {
    const instalar = this.opcoes.pool
    if (!instalar) return Promise.resolve(null)
    this.pool ??= instalar(sqlite3).catch((erro: unknown) => {
      // Típico: outra janela do app está com o pool (o opfs-sahpool é exclusivo).
      console.warn('IconoDB: pool do OPFS indisponível; o banco abre em memória.', erro)
      this.pool = null
      return null
    })
    return this.pool
  }

  private async abrirNoPool(sqlite3: Sqlite3Static, { util, marcador }: PoolDoBanco, arquivos: ArquivoDoBanco[]): Promise<Database> {
    const importados = await marcador.ler()
    const plano = planoDeImportacao(arquivos, importados, util.getFileNames())
    // Um lugar por arquivo, outro para o diário de cada um, e folga.
    await util.reserveMinimumCapacity(arquivos.length * 2 + 2)
    for (const nome of plano.remover) {
      util.unlink(nome)
      delete importados[nome]
    }
    for (const arquivo of arquivos.filter((a) => plano.importar.includes(a.nome))) {
      const bytes = await lerArquivo(this.opcoes.armazem, arquivo)
      if (!bytes) throw new PacoteMudou()
      // Desmarca antes: se a importação for cortada, o arquivo é importado de novo na próxima abertura.
      delete importados[arquivo.nome]
      await marcador.gravar(importados)
      console.info(`IconoDB: importando ${arquivo.caminho} no pool do OPFS.`)
      await util.importDb(arquivo.nome, bytes)
      importados[arquivo.nome] = arquivo.sha256
      await marcador.gravar(importados)
    }
    const [principal, ...anexos] = arquivos
    const db = new sqlite3.oo1.DB({ filename: principal!.nome, flags: this.opcoes.escrita ? 'w' : 'r', vfs: util.vfsName })
    try {
      const modo = this.opcoes.escrita ? '' : '&mode=ro'
      for (const a of anexos) db.exec(`ATTACH 'file:${a.nome}?vfs=${util.vfsName}${modo}' AS ${a.esquema}`)
    } catch (erro) {
      db.close()
      throw erro
    }
    return db
  }

  private async abrirEmMemoria(sqlite3: Sqlite3Static, arquivos: ArquivoDoBanco[]): Promise<Database> {
    const { capi, wasm } = sqlite3
    const flags = this.opcoes.escrita
      ? capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE
      : capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_READONLY
    const db = new sqlite3.oo1.DB(':memory:')
    try {
      for (const arquivo of arquivos) {
        const bytes = await lerArquivo(this.opcoes.armazem, arquivo)
        if (!bytes) throw new PacoteMudou()
        if (arquivo.esquema !== 'main') db.exec(`ATTACH ':memory:' AS ${arquivo.esquema}`)
        const p = wasm.allocFromTypedArray(bytes)
        const rc = capi.sqlite3_deserialize(db.pointer!, arquivo.esquema, p, bytes.byteLength, bytes.byteLength, flags)
        if (rc !== 0) throw new Error(`Não foi possível abrir ${arquivo.caminho} (sqlite ${rc}).`)
      }
    } catch (erro) {
      db.close()
      throw erro
    }
    return db
  }
}
