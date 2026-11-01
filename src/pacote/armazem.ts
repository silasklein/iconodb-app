/**
 * Onde o pacote fica guardado no aparelho. Uma interface mínima, com duas
 * implementações: o OPFS (o app) e a memória (os testes).
 *
 * Os caminhos são relativos à pasta `pacote/` do OPFS e usam "/".
 * Nada aqui depende de FileSystemHandle.move() (não é confiável no Safari):
 * quem precisa de troca atômica grava o arquivo novo ao lado e muda um ponteiro.
 */

export interface Armazem {
  /** Os bytes do arquivo, ou null se não existe. */
  ler(caminho: string): Promise<Uint8Array | null>
  /** Grava (substituindo o que houver). Só devolve depois de gravar por inteiro. */
  gravar(caminho: string, bytes: Uint8Array): Promise<void>
  existe(caminho: string): Promise<boolean>
  /** Remove o arquivo; remover o que não existe não é erro. */
  remover(caminho: string): Promise<void>
  /** Caminhos dos arquivos sob o prefixo (recursivo); prefixo "" lista tudo. */
  listar(prefixo: string): Promise<string[]>
}

export function armazemMemoria(): Armazem {
  const arquivos = new Map<string, Uint8Array>()
  return {
    async ler(caminho) {
      const b = arquivos.get(caminho)
      return b ? b.slice() : null
    },
    async gravar(caminho, bytes) {
      arquivos.set(caminho, bytes.slice())
    },
    async existe(caminho) {
      return arquivos.has(caminho)
    },
    async remover(caminho) {
      arquivos.delete(caminho)
    },
    async listar(prefixo) {
      const base = prefixo === '' ? '' : `${prefixo.replace(/\/+$/, '')}/`
      return [...arquivos.keys()].filter((c) => c.startsWith(base))
    },
  }
}

const PASTA_RAIZ = 'pacote'

function partes(caminho: string): string[] {
  return caminho.split('/').filter((p) => p !== '')
}

function naoEncontrado(erro: unknown): boolean {
  const nome = (erro as { name?: unknown } | null)?.name
  return nome === 'NotFoundError' || nome === 'TypeMismatchError'
}

/** Escreve num worker (createSyncAccessHandle), para navegadores sem createWritable no thread principal. */
function escreverNoWorker(destino: string[], bytes: Uint8Array): Promise<void> {
  return new Promise((ok, falha) => {
    const worker = new Worker(new URL('./escritor.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ erro?: string }>) => {
      worker.terminate()
      if (e.data.erro) falha(new Error(e.data.erro))
      else ok()
    }
    worker.onerror = (e) => {
      worker.terminate()
      falha(new Error(e.message))
    }
    const copia = bytes.slice()
    worker.postMessage({ destino: [PASTA_RAIZ, ...destino], bytes: copia }, [copia.buffer])
  })
}

export interface OpcoesOpfs {
  /** Força o caminho do worker (para testar). */
  semCreateWritable?: boolean
}

export function armazemOpfs(opcoes: OpcoesOpfs = {}): Armazem {
  let raiz: Promise<FileSystemDirectoryHandle> | null = null
  const pasta = () => {
    raiz ??= navigator.storage.getDirectory().then((r) => r.getDirectoryHandle(PASTA_RAIZ, { create: true }))
    return raiz
  }

  async function diretorio(dirs: string[], criar: boolean): Promise<FileSystemDirectoryHandle | null> {
    let atual = await pasta()
    for (const nome of dirs) {
      try {
        atual = await atual.getDirectoryHandle(nome, { create: criar })
      } catch (erro) {
        if (naoEncontrado(erro)) return null
        throw erro
      }
    }
    return atual
  }

  async function arquivo(caminho: string): Promise<FileSystemFileHandle | null> {
    const p = partes(caminho)
    const nome = p.pop()
    if (nome === undefined) return null
    const dir = await diretorio(p, false)
    if (!dir) return null
    try {
      return await dir.getFileHandle(nome)
    } catch (erro) {
      if (naoEncontrado(erro)) return null
      throw erro
    }
  }

  async function listarDir(dir: FileSystemDirectoryHandle, prefixo: string, saida: string[]): Promise<void> {
    for await (const [nome, handle] of dir.entries()) {
      const caminho = prefixo === '' ? nome : `${prefixo}/${nome}`
      if (handle.kind === 'directory') await listarDir(handle as FileSystemDirectoryHandle, caminho, saida)
      else saida.push(caminho)
    }
  }

  return {
    async ler(caminho) {
      const h = await arquivo(caminho)
      if (!h) return null
      return new Uint8Array(await (await h.getFile()).arrayBuffer())
    },
    async gravar(caminho, bytes) {
      const p = partes(caminho)
      const nome = p.pop()
      if (nome === undefined) throw new Error('Caminho vazio')
      const dir = (await diretorio(p, true))!
      const h = await dir.getFileHandle(nome, { create: true })
      if (!opcoes.semCreateWritable && typeof h.createWritable === 'function') {
        const w = await h.createWritable()
        await w.write(bytes as BufferSource)
        await w.close()
      } else {
        await escreverNoWorker(partes(caminho), bytes)
      }
    },
    async existe(caminho) {
      return (await arquivo(caminho)) !== null
    },
    async remover(caminho) {
      const p = partes(caminho)
      const nome = p.pop()
      if (nome === undefined) return
      const dir = await diretorio(p, false)
      if (!dir) return
      try {
        await dir.removeEntry(nome)
      } catch (erro) {
        if (!naoEncontrado(erro)) throw erro
      }
    },
    async listar(prefixo) {
      const dir = await diretorio(partes(prefixo), false)
      if (!dir) return []
      const saida: string[] = []
      await listarDir(dir, partes(prefixo).join('/'), saida)
      return saida
    },
  }
}

let padrao: Armazem | null = null

/** O armazém do app: o OPFS. Lança se o navegador não tem OPFS. */
export function armazemPadrao(): Armazem {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.getDirectory !== 'function') {
    throw new Error('Este navegador não permite guardar o banco no aparelho.')
  }
  padrao ??= armazemOpfs()
  return padrao
}
