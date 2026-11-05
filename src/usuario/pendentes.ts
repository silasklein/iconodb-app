/**
 * O que está por gravar. Um campo que grava ao sair (blur) ou um rascunho que grava de tempos em tempos registra aqui
 * uma função que grava AGORA; quem precisa de tudo gravado (Ctrl/⌘S, "Salvar e sincronizar", a aba que se esconde)
 * chama `descarregarPendentes()` antes de seguir. Nada se perde porque o app foi fechado, escondido ou sincronizado
 * no meio de uma digitação.
 *
 * - `visibilitychange` (para "hidden") e `pagehide` descarregam sozinhos: é o último momento em que o navegador
 *   deixa o app gravar no IndexedDB (no iPhone, a aba suspensa não volta a rodar).
 * - Cada função de gravação deve ser segura de chamar à toa (sem nada pendente, não faz nada) e de chamar duas vezes.
 */

type Descarga = () => void | Promise<void>
interface Registro {
  descarga: Descarga
  /** Só no `pagehide`/`visibilitychange`: guarda o pendente de forma SÍNCRONA (localStorage), antes de qualquer gravação assíncrona. */
  sincrona?: () => void
}

const registradas = new Map<Descarga, Registro>()
let ouvindo = false

/**
 * Registra uma função que grava o que está pendente. Devolve a que desfaz o registro. A `sincrona` opcional roda primeiro,
 * na mesma tarefa do evento que esconde ou fecha a página (a única parte que o navegador garante).
 */
export function registrarPendente(descarga: Descarga, sincrona?: () => void): () => void {
  registradas.set(descarga, { descarga, sincrona })
  ouvir()
  return () => {
    registradas.delete(descarga)
  }
}

/** Chama todas as funções registradas e espera todas. Se alguma falhar, as outras ainda rodam e o primeiro erro é relançado. */
export async function descarregarPendentes(): Promise<void> {
  const resultados = await Promise.allSettled([...registradas.keys()].map(async (d) => d()))
  const falha = resultados.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (falha) throw falha.reason
}

/** Quantos registros há (para os testes). */
export const totalDePendentes = (): number => registradas.size

/** Esquece todos os registros (para os testes). */
export function esquecerPendentes(): void {
  registradas.clear()
}

function descarregarSemErro(): void {
  for (const { sincrona } of [...registradas.values()]) {
    try {
      sincrona?.()
    } catch {
      // a gravação assíncrona, logo abaixo, ainda tenta
    }
  }
  // Ao esconder ou fechar a aba não há a quem mostrar o erro; o rascunho continua na memória e a próxima gravação tenta de novo.
  void descarregarPendentes().catch(() => undefined)
}

function ouvir(): void {
  if (ouvindo || typeof document === 'undefined') return
  ouvindo = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') descarregarSemErro()
  })
  window.addEventListener('pagehide', descarregarSemErro)
}
