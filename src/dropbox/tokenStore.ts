/**
 * Guarda no IndexedDB (nunca no localStorage) o token do Dropbox e o login em
 * andamento. Banco próprio, `iconodb-login`: sair() e a expiração só mexem aqui,
 * nunca nos dados do app.
 */

const BANCO = 'iconodb-login'
const VERSAO = 1
const LOJA_TOKEN = 'token'
const LOJA_PENDENTE = 'pendente'
const CHAVE = 'atual'

export interface Token {
  refreshToken: string
  accessToken: string
  /** Quando o access token vence (ms desde 1970). */
  expiraEm: number
  /** O Dropbox recusou o refresh token (revogado): é preciso entrar de novo. */
  expirado?: boolean
}

/**
 * Login em andamento. O code_verifier e o state precisam sobreviver ao
 * redirecionamento para o Dropbox e à volta.
 */
export interface LoginPendente {
  modo: 'redirect' | 'codigo'
  codeVerifier: string
  /** Só no modo "redirect". */
  state?: string
  /**
   * Só no modo "redirect": o code que voltou do Dropbox, guardado quando a troca
   * falhou por falta de rede (o code só vale uma vez e a URL já foi limpa).
   */
  codigoRecebido?: string
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const req = indexedDB.open(BANCO, VERSAO)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(LOJA_TOKEN)) db.createObjectStore(LOJA_TOKEN)
      if (!db.objectStoreNames.contains(LOJA_PENDENTE)) db.createObjectStore(LOJA_PENDENTE)
    }
    req.onsuccess = () => ok(req.result)
    req.onerror = () => falha(req.error)
  })
}

async function transacao<T>(
  loja: string,
  modo: IDBTransactionMode,
  operacao: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await abrir()
  try {
    return await new Promise<T>((ok, falha) => {
      const tx = db.transaction(loja, modo)
      const req = operacao(tx.objectStore(loja))
      tx.oncomplete = () => ok(req.result)
      tx.onerror = () => falha(tx.error)
      tx.onabort = () => falha(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function lerToken(): Promise<Token | null> {
  return ((await transacao(LOJA_TOKEN, 'readonly', (s) => s.get(CHAVE))) as Token | undefined) ?? null
}

export async function gravarToken(token: Token): Promise<void> {
  await transacao(LOJA_TOKEN, 'readwrite', (s) => s.put(token, CHAVE))
}

export async function limparToken(): Promise<void> {
  await transacao(LOJA_TOKEN, 'readwrite', (s) => s.delete(CHAVE))
}

export async function lerPendente(): Promise<LoginPendente | null> {
  return ((await transacao(LOJA_PENDENTE, 'readonly', (s) => s.get(CHAVE))) as LoginPendente | undefined) ?? null
}

export async function gravarPendente(pendente: LoginPendente): Promise<void> {
  await transacao(LOJA_PENDENTE, 'readwrite', (s) => s.put(pendente, CHAVE))
}

export async function limparPendente(): Promise<void> {
  await transacao(LOJA_PENDENTE, 'readwrite', (s) => s.delete(CHAVE))
}
