/**
 * A montagem da cópia completa vive aqui, fora da tela (2C, bloco 1, Tarefa 6, revisão 1). No app inteiro há no máximo
 * uma montagem por vez: sair de «Cópias e exportação» durante «Juntando…» não a perde nem permite outra (no iPhone,
 * duas cópias de 150 MB juntas na memória). A tela montada assina o progresso e recebe o fim:
 *
 * - se ela está na tela quando a montagem termina, recebe o resultado (`receptor`) e entrega como sempre;
 * - se não está, o resultado fica guardado (`pendente`) e a próxima tela o recebe UMA vez ao abrir, sem entregar nada
 *   sozinha: sem um toque recente, a folha de compartilhar do iPhone seria recusada. Ela mostra a mensagem de pronto com
 *   «Salvar o arquivo», e a entrega acontece nesse toque.
 */
import { escritaDropbox, type Escrita } from '../dropbox/escrita'
import { montarCopiaCompleta } from './copiaCompleta'

/** «Juntando…»: `total` null até a montagem dizer quantas fotos são; `semDropbox`: só as fotos deste aparelho. */
export interface ProgressoDaCopiaCompleta {
  feitas: number
  total: number | null
  semDropbox: boolean
}

export type FimDaCopiaCompleta = { arquivo: File; faltaram: string[] } | { erro: unknown }

let progresso: ProgressoDaCopiaCompleta | null = null
let pendente: FimDaCopiaCompleta | null = null
let receptor: ((fim: FimDaCopiaCompleta) => void) | null = null
/** Muda a cada `esquecerCopiaCompleta` (testes): o fim de uma montagem esquecida não vale mais. */
let geracao = 0
const ouvintes = new Set<() => void>()
const avisar = () => {
  for (const f of ouvintes) f()
}

/** O Dropbox para a cópia: nenhum sem internet (nem tenta) ou sem login. */
async function escritaParaACopia(): Promise<Escrita | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
  try {
    return await escritaDropbox()
  } catch {
    return null
  }
}

/** O progresso da montagem em curso, ou null se nenhuma está juntando. O mesmo objeto enquanto nada muda. */
export const progressoDaCopiaCompleta = (): ProgressoDaCopiaCompleta | null => progresso

export function assinarCopiaCompleta(f: () => void): () => void {
  ouvintes.add(f)
  return () => void ouvintes.delete(f)
}

/** Começa a montagem; false (e nada acontece) se uma já está juntando. */
export function iniciarCopiaCompleta(): boolean {
  if (progresso) return false
  const minha = ++geracao
  progresso = { feitas: 0, total: null, semDropbox: false }
  pendente = null
  avisar()
  void (async () => {
    let fim: FimDaCopiaCompleta
    try {
      const escrita = await escritaParaACopia()
      const semDropbox = escrita === null
      if (minha === geracao) {
        progresso = { feitas: 0, total: null, semDropbox }
        avisar()
      }
      fim = await montarCopiaCompleta({
        escrita,
        agora: new Date(),
        aoAvancar: (feitas, total) => {
          if (minha !== geracao) return
          progresso = { feitas, total, semDropbox }
          avisar()
        },
      })
    } catch (erro) {
      fim = { erro }
    }
    if (minha !== geracao) return
    progresso = null
    if (receptor) receptor(fim)
    else pendente = fim
    avisar()
  })()
  return true
}

/**
 * A tela abre: passa a receber o fim (enquanto estiver montada) e leva o que terminou enquanto ela não estava (uma vez só).
 * Devolve como soltar o receptor.
 */
export function receberFimDaCopiaCompleta(aoTerminar: (fim: FimDaCopiaCompleta) => void, aoAbrirComPendente: (fim: FimDaCopiaCompleta) => void): () => void {
  receptor = aoTerminar
  const ja = pendente
  pendente = null
  if (ja) aoAbrirComPendente(ja)
  return () => {
    if (receptor === aoTerminar) receptor = null
  }
}

/** Testes: esquece a montagem em curso (o fim dela é ignorado) e o resultado guardado. */
export function esquecerCopiaCompleta(): void {
  geracao++
  progresso = null
  pendente = null
  receptor = null
  avisar()
}
