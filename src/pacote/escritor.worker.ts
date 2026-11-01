/**
 * Grava um arquivo no OPFS com createSyncAccessHandle. Só é usado quando o
 * navegador não oferece createWritable no thread principal (ver armazem.ts).
 */
/** O que usamos do FileSystemSyncAccessHandle (a lib DOM do TypeScript não o traz). */
interface AcessoSincrono {
  truncate(tamanho: number): void
  write(dados: Uint8Array, opcoes: { at: number }): number
  flush(): void
  close(): void
}

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
    const acesso = await (h as FileSystemFileHandle & { createSyncAccessHandle(): Promise<AcessoSincrono> }).createSyncAccessHandle()
    try {
      acesso.truncate(0)
      acesso.write(bytes, { at: 0 })
      acesso.flush()
    } finally {
      acesso.close()
    }
    self.postMessage({})
  } catch (erro) {
    self.postMessage({ erro: erro instanceof Error ? erro.message : String(erro) })
  }
}
