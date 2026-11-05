/**
 * Grava um arquivo no OPFS com createSyncAccessHandle. Só é usado quando o
 * navegador não oferece createWritable no thread principal (ver armazem.ts).
 */
import { abrirAcessoSincrono } from './acessoSincrono'

interface Pedido {
  destino: string[]
  bytes: Uint8Array
}

self.onmessage = async (e: MessageEvent<Pedido>) => {
  try {
    const { destino, bytes } = e.data
    const nome = destino[destino.length - 1]!
    let dir = await navigator.storage.getDirectory()
    for (const d of destino.slice(0, -1)) dir = await dir.getDirectoryHandle(d, { create: true })
    const h = await dir.getFileHandle(nome, { create: true })
    const acesso = await abrirAcessoSincrono(h)
    try {
      acesso.truncate(0)
      acesso.write(bytes, { at: 0 })
      acesso.flush()
    } finally {
      acesso.close()
    }
    self.postMessage({})
  } catch (erro) {
    self.postMessage({ erro: erro instanceof Error ? erro.message : String(erro), nome: erro instanceof Error ? erro.name : undefined })
  }
}
