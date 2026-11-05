/**
 * A identidade deste aparelho: um id aleatório de 8 caracteres [a-z0-9], criado uma vez e guardado
 * no IndexedDB (banco `iconodb-usuario`, loja `config`), e um nome legível editável.
 * O id entra nos nomes dos segmentos do diário no Dropbox e nos ids dos registros; por isso nunca muda.
 */
import { emTransacao, LOJA_CONFIG, seguro } from './bancoUsuario'

export interface Aparelho {
  id: string
  nome: string
}

export const CHAVE_DO_APARELHO = 'aparelho'
const CHAVE = CHAVE_DO_APARELHO
const ALFABETO = 'abcdefghijklmnopqrstuvwxyz0123456789'
const TAMANHO_DO_ID = 8
const TAMANHO_MAXIMO_DO_NOME = 40
/** Maior múltiplo de 36 que cabe num byte: bytes a partir daqui são descartados, para não haver viés. */
const CORTE = 252

/** Ids que o protocolo reserva: `pipeline` é o "aparelho" das reservas da Tarefa 16 (veja objetos-skc/numeracao.ts). */
const RESERVADOS: ReadonlySet<string> = new Set(['pipeline'])

export function gerarId(): string {
  let id = ''
  while (id.length < TAMANHO_DO_ID || RESERVADOS.has(id)) {
    if (RESERVADOS.has(id)) id = ''
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    for (const b of bytes) {
      if (b < CORTE && id.length < TAMANHO_DO_ID) id += ALFABETO[b % ALFABETO.length]
    }
  }
  return id
}

/** "iPhone", "iPad", "Mac" ou "Este aparelho", pelo user agent. */
export function nomePadraoDoAparelho(): string {
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  const ua = nav?.userAgent ?? ''
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  // O iPadOS pede o site de desktop e se apresenta como Macintosh; um Mac de verdade não tem tela de toque. O iPhone com "site
  // de desktop" também (A-19 da Tarefa 17): a tela dele, o lado menor, tem menos de 600 px (o menor iPad tem 744).
  if (/Macintosh/.test(ua)) {
    if ((nav?.maxTouchPoints ?? 0) <= 1) return 'Mac'
    const tela = typeof screen === 'undefined' ? undefined : screen
    const menor = Math.min(tela?.width ?? 0, tela?.height ?? 0)
    return menor > 0 && menor < 600 ? 'iPhone' : 'iPad'
  }
  return 'Este aparelho'
}

const limparNome = (nome: string) => nome.trim().slice(0, TAMANHO_MAXIMO_DO_NOME).trim()

/**
 * Lê (e, se faltar, grava) o aparelho numa só transação de escrita: duas chamadas simultâneas, mesmo de
 * abas diferentes, nunca criam dois ids. `mudar` recebe o aparelho existente (ou null) e devolve o novo.
 */
async function atualizar(mudar: (atual: Aparelho | null) => Aparelho): Promise<Aparelho> {
  return emTransacao([LOJA_CONFIG], 'readwrite', (tx, abortar) => {
    const loja = tx.objectStore(LOJA_CONFIG)
    let resultado!: Aparelho
    const leitura = loja.get(CHAVE)
    leitura.onsuccess = seguro(abortar, () => {
      const atual = (leitura.result as Aparelho | undefined) ?? null
      resultado = mudar(atual)
      if (!atual || atual.id !== resultado.id || atual.nome !== resultado.nome) loja.put(resultado, CHAVE)
    })
    return () => resultado
  })
}

/** Este aparelho: o id é estável entre recargas; o nome padrão vem do user agent até o usuário mudá-lo. */
export function aparelhoAtual(): Promise<Aparelho> {
  return atualizar((atual) => atual ?? { id: gerarId(), nome: nomePadraoDoAparelho() })
}

/** Troca o nome (aparado, até 40 caracteres); vazio volta ao nome padrão. O id não muda. */
export function renomearAparelho(nome: string): Promise<Aparelho> {
  const novo = limparNome(nome) || nomePadraoDoAparelho()
  return atualizar((atual) => ({ id: atual?.id ?? gerarId(), nome: novo }))
}

const ouvintesDaTroca = new Set<() => void>()
/**
 * Avisa quem guarda o id deste aparelho (a tela das imagens, "do outro aparelho") que ele mudou: `trocarDeAparelho` (nesta aba)
 * e a sincronização de outra aba que o trocou chamam isto (A-23 da Tarefa 17).
 */
export function avisarTrocaDeAparelho(): void {
  for (const o of [...ouvintesDaTroca]) o()
}
export function assinarTrocaDeAparelho(ouvinte: () => void): () => void {
  ouvintesDaTroca.add(ouvinte)
  return () => void ouvintesDaTroca.delete(ouvinte)
}
