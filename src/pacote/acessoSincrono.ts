/**
 * O que os workers usam do FileSystemSyncAccessHandle (a lib DOM do TypeScript não o traz):
 * o escritor do pacote (escritor.worker.ts) e o marcador do banco (src/banco/worker.ts).
 */
export interface AcessoSincrono {
  truncate(tamanho: number): void
  write(dados: Uint8Array, opcoes: { at: number }): number
  flush(): void
  close(): void
}

/** Abre o acesso síncrono de um arquivo do OPFS (só existe dentro de um worker). */
export function abrirAcessoSincrono(arquivo: FileSystemFileHandle): Promise<AcessoSincrono> {
  return (arquivo as FileSystemFileHandle & { createSyncAccessHandle(): Promise<AcessoSincrono> }).createSyncAccessHandle()
}
