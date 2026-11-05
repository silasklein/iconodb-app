/**
 * O texto da fonte mudou? (spec §7.6)
 *
 * O pacote não traz um hash do texto de cada trecho (só o sha256 dos ARQUIVOS, que muda a cada reprocessamento, mesmo
 * sem o trecho mudar). Então o app calcula o seu: o SHA-256 (WebCrypto) do texto do trecho, NORMALIZADO: Unicode NFC e
 * qualquer sequência de espaços (inclusive quebras de linha e o espaço sem quebra) trocada por um espaço só, sem
 * espaço nas pontas. O texto é o da fonte como impresso (`passage.text`, o alemão do livro), não a tradução: o que
 * importa é o que a nota comenta, e a tradução pode ser revista sem que o livro mude (esse caso o pacote já marca em
 * `desatualizada`).
 *
 * Uma nota sobre um objeto guarda, ao ser criada, uma âncora por trecho que descreve o objeto: `{p: id do trecho,
 * sha}`, no campo `ancoras` do evento. Ao mostrar a nota, o app compara o sha guardado com o do texto de agora:
 * diferente, ou trecho que sumiu do pacote, vale o aviso "O texto da fonte mudou". A nota continua ligada ao objeto
 * (e ao trecho pelo id estável). O usuário pode dizer "Já conferi", que grava o sha novo.
 *
 * Sem WebCrypto (contexto não seguro) o sha não existe: a nota não leva âncora e nunca mostra o aviso.
 */
import type { TrechoDaFonte } from '../banco/consultas'

export interface Ancora {
  /** O id do trecho no pacote (`passage.id`, estável entre versões). */
  p: string
  /** SHA-256 em hexadecimal (64 caracteres) do texto normalizado. */
  sha: string
}

export function normalizarTrecho(texto: string): string {
  return texto.normalize('NFC').replace(/\s+/g, ' ').trim()
}

export async function shaDoTrecho(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizarTrecho(texto))
  const resumo = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** As âncoras de uma lista de trechos, ordenadas pelo id. Sem WebCrypto, lista vazia. */
export async function ancorasDe(trechos: readonly TrechoDaFonte[]): Promise<Ancora[]> {
  if (!globalThis.crypto?.subtle) return []
  const ordenados = [...trechos].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return Promise.all(ordenados.map(async (t) => ({ p: t.id, sha: await shaDoTrecho(t.texto) })))
}

/** O campo `ancoras` de um evento, só com o que tem a forma certa (o evento pode vir de outro aparelho). */
export function validarAncoras(valor: unknown): Ancora[] {
  if (!Array.isArray(valor)) return []
  return valor.filter(
    (a): a is Ancora => !!a && typeof a === 'object' && typeof (a as Ancora).p === 'string' && typeof (a as Ancora).sha === 'string' && /^[0-9a-f]{64}$/.test((a as Ancora).sha),
  )
}

export interface Conferencia {
  estado: 'ok' | 'mudou'
  /** Trechos que ainda existem e têm outro texto. */
  mudaram: string[]
  /** Trechos que já não estão no pacote. */
  sumiram: string[]
}

/** Compara as âncoras guardadas com os trechos de agora. Trechos novos no objeto não contam. */
export async function avaliarAncoras(guardadas: readonly Ancora[], atuais: readonly TrechoDaFonte[]): Promise<Conferencia> {
  const porId = new Map(atuais.map((t) => [t.id, t.texto]))
  const mudaram: string[] = []
  const sumiram: string[] = []
  for (const a of guardadas) {
    const texto = porId.get(a.p)
    if (texto === undefined) sumiram.push(a.p)
    else if ((await shaDoTrecho(texto)) !== a.sha) mudaram.push(a.p)
  }
  return { estado: mudaram.length + sumiram.length > 0 ? 'mudou' : 'ok', mudaram, sumiram }
}

/**
 * "Já conferi": as âncoras de agora para uma nota que o usuário conferiu com a fonte. O trecho que mudou ganha o sha do
 * texto atual, o que já não está no pacote sai, o que não mudou fica como estava.
 */
export async function reconferir(guardadas: readonly Ancora[], atuais: readonly TrechoDaFonte[]): Promise<Ancora[]> {
  const porId = new Map(atuais.map((t) => [t.id, t.texto]))
  const novas: Ancora[] = []
  for (const a of guardadas) {
    const texto = porId.get(a.p)
    if (texto !== undefined) novas.push({ p: a.p, sha: await shaDoTrecho(texto) })
  }
  return novas
}
