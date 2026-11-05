/**
 * O worker do banco: recebe pedidos do cliente (cliente.ts) e responde com as linhas.
 *
 * Abre o último pacote completo (pacote/estado.json, Tarefa 4) com a VFS
 * `opfs-sahpool`: os .sqlite são importados no pool só quando o sha256 muda; o sha
 * importado fica em OPFS `banco/importados.json`. Se o pool estiver ocupado (outra
 * janela do app aberta), abre em memória.
 */
import type { Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { abrirAcessoSincrono } from '../pacote/acessoSincrono'
import { armazemPadrao } from '../pacote/armazem'
import { Banco, type Marcador, type PoolDoBanco } from './nucleo'
import type { Pedido, Resposta } from './protocolo'

const PASTA_DO_MARCADOR = 'banco'
const ARQUIVO_DO_MARCADOR = 'importados.json'

async function arquivoDoMarcador(): Promise<FileSystemFileHandle> {
  const raiz = await navigator.storage.getDirectory()
  const pasta = await raiz.getDirectoryHandle(PASTA_DO_MARCADOR, { create: true })
  return pasta.getFileHandle(ARQUIVO_DO_MARCADOR, { create: true })
}

/** O marcador num arquivo do OPFS, gravado com createSyncAccessHandle (existe no worker do Safari). */
function marcadorOpfs(): Marcador {
  return {
    async ler() {
      try {
        const texto = await (await (await arquivoDoMarcador()).getFile()).text()
        const dados: unknown = texto ? JSON.parse(texto) : {}
        return dados && typeof dados === 'object' && !Array.isArray(dados) ? (dados as Record<string, string>) : {}
      } catch {
        return {}
      }
    },
    async gravar(dados) {
      const h = await arquivoDoMarcador()
      const acesso = await abrirAcessoSincrono(h)
      try {
        const bytes = new TextEncoder().encode(JSON.stringify(dados))
        acesso.truncate(0)
        acesso.write(bytes, { at: 0 })
        acesso.flush()
      } finally {
        acesso.close()
      }
    },
  }
}

const TRAVA_DO_POOL = 'iconodb-banco-pool'

/**
 * O opfs-sahpool é exclusivo: só uma janela por vez. Esta trava (mantida enquanto o
 * worker vive) evita que a segunda janela tente instalar o pool, o que falharia com
 * erros e uma tentativa de apagar a pasta do pool; ela abre em memória.
 */
function segurarTravaDoPool(): Promise<boolean> {
  if (!navigator.locks) return Promise.resolve(true)
  return new Promise((ok) => {
    void navigator.locks.request(TRAVA_DO_POOL, { ifAvailable: true }, (trava) => {
      ok(trava !== null)
      return trava ? new Promise<never>(() => {}) : undefined
    })
  })
}

async function instalarPool(sqlite3: Sqlite3Static): Promise<PoolDoBanco> {
  if (!(await segurarTravaDoPool())) throw new Error('Outra janela do app está com o banco no OPFS.')
  const util = await sqlite3.installOpfsSAHPoolVfs({ name: 'opfs-sahpool' })
  return { util, marcador: marcadorOpfs() }
}

let bancoAtual: Banco | null = null

/** Criado no primeiro pedido: sem OPFS, o erro volta como resposta, não como falha do worker. */
function obterBanco(): Banco {
  bancoAtual ??= new Banco({ armazem: armazemPadrao(), pool: instalarPool })
  return bancoAtual
}

async function atender(pedido: Pedido): Promise<unknown> {
  const banco = obterBanco()
  switch (pedido.op) {
    case 'abrir':
      return banco.abrir()
    case 'reabrir':
      return banco.reabrir()
    case 'executar':
      return banco.executar(pedido.sql, pedido.parametros)
    case 'usuario-escrever':
      return banco.escreverUsuario(pedido.lote)
    case 'usuario-consultar':
      return banco.consultarUsuario(pedido.sql, pedido.parametros)
  }
}

self.onmessage = async (e: MessageEvent<Pedido>) => {
  const { id } = e.data
  let resposta: Resposta
  try {
    resposta = { id, ok: true, resultado: await atender(e.data) }
  } catch (erro) {
    resposta = {
      id,
      ok: false,
      nome: erro instanceof Error ? erro.name : 'Error',
      mensagem: erro instanceof Error ? erro.message : String(erro),
    }
  }
  self.postMessage(resposta)
}
