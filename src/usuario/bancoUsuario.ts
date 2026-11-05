/**
 * O IndexedDB da camada do usuário: banco próprio, `iconodb-usuario`, separado do banco de login
 * (`iconodb-login`, que sair() limpa) e do pacote. Aqui moram os dados que NUNCA podem ser perdidos:
 * a identidade do aparelho, o relógio (hlc), os contadores de ids e o diário de eventos (src/usuario/armazem.ts).
 *
 * Para acrescentar uma loja: suba VERSAO e crie a loja em `onupgradeneeded` só se ela não existir
 * (as anteriores têm de continuar intactas).
 */
export const BANCO_USUARIO = 'iconodb-usuario'
const VERSAO = 2
/** Chave → valor (fora de linha): aparelho, hlc, seq, contadores de id, base consolidada. Versão 1. */
export const LOJA_CONFIG = 'config'
/**
 * Os eventos (deste e dos outros aparelhos), por `id`. Versão 2. Cada linha:
 * {id, aparelho, seq, n, enviado: 0 | 1, evento}. Índices: `aparelho_seq` ([aparelho, seq]) e `enviado`.
 */
export const LOJA_EVENTOS = 'eventos'

let conexao: Promise<IDBDatabase> | null = null

/**
 * A conexão com o banco, aberta uma vez e reaproveitada (não a feche). Ela é descartada, e a próxima
 * chamada abre outra, quando outra aba (ou um deleteDatabase) pede uma versão nova (versionchange) ou
 * quando o navegador a fecha (close).
 */
export function abrirBancoUsuario(): Promise<IDBDatabase> {
  if (conexao) return conexao
  const aberta = new Promise<IDBDatabase>((ok, falha) => {
    const req = indexedDB.open(BANCO_USUARIO, VERSAO)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(LOJA_CONFIG)) db.createObjectStore(LOJA_CONFIG)
      if (!db.objectStoreNames.contains(LOJA_EVENTOS)) {
        const eventos = db.createObjectStore(LOJA_EVENTOS, { keyPath: 'id' })
        eventos.createIndex('aparelho_seq', ['aparelho', 'seq'])
        eventos.createIndex('enviado', 'enviado')
      }
    }
    req.onsuccess = () => {
      const db = req.result
      const descartar = () => {
        if (conexao === aberta) conexao = null
      }
      // Outra aba subiu a versão (app novo) ou o banco vai ser apagado: fecha para não bloquear.
      db.onversionchange = () => {
        descartar()
        db.close()
      }
      db.onclose = descartar
      ok(db)
    }
    req.onerror = () => {
      if (conexao === aberta) conexao = null
      falha(req.error)
    }
  })
  conexao = aberta
  return aberta
}

export type Abortar = (erro: unknown) => void

/** Um callback de requisição que, se lançar, aborta a transação com esse erro. */
export const seguro =
  (abortar: Abortar, fn: () => void) =>
  (): void => {
    try {
      fn()
    } catch (erro) {
      abortar(erro)
    }
  }

/**
 * Roda `corpo` numa transação da conexão compartilhada (as requisições são feitas ali mesmo, de forma
 * síncrona) e resolve com o resultado só quando a transação TERMINA (oncomplete). Escritas usam
 * durabilidade "strict" (em disco antes do oncomplete). Se a conexão acabou de ser fechada (versionchange
 * entre a abertura e o uso), abre outra e tenta uma vez mais.
 */
export async function emTransacao<T>(lojas: string[], modo: IDBTransactionMode, corpo: (tx: IDBTransaction, abortar: Abortar) => () => T): Promise<T> {
  let tx: IDBTransaction
  for (let tentativa = 0; ; tentativa++) {
    const db = await abrirBancoUsuario()
    try {
      tx = db.transaction(lojas, modo, modo === 'readwrite' ? { durability: 'strict' } : undefined)
      break
    } catch (erro) {
      if (tentativa > 0 || !(erro instanceof DOMException && erro.name === 'InvalidStateError')) throw erro
      if (conexao && (await conexao) === db) conexao = null
    }
  }
  return new Promise<T>((ok, falha) => {
    let erro: unknown
    let resultado: (() => T) | undefined
    const abortar: Abortar = (e) => {
      erro ??= e
      try {
        tx.abort()
      } catch {
        // já terminou ou já foi abortada
      }
    }
    tx.oncomplete = () => ok(resultado!())
    tx.onerror = () => falha(erro ?? tx.error)
    tx.onabort = () => falha(erro ?? tx.error ?? new Error('transação abortada'))
    try {
      resultado = corpo(tx, abortar)
    } catch (e) {
      abortar(e)
    }
  })
}
