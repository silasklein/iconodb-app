/**
 * Lista ou miniaturas numa coleção (spec 4.2): a escolha fica lembrada NESTE aparelho, no localStorage. Não é
 * da camada do usuário e nunca vira evento nem vai ao Dropbox. Toda leitura e escrita é protegida: o localStorage
 * pode faltar ou lançar erro (modo privado, dados do site bloqueados), e então a escolha vale até recarregar.
 */
export const MODOS_DA_COLECAO = ['lista', 'miniaturas'] as const
export type ModoDaColecao = (typeof MODOS_DA_COLECAO)[number]

const CHAVE = 'iconodb:colecao-modo'
const PADRAO: ModoDaColecao = 'lista'

/** Só quando o localStorage não pode ser usado. */
let naMemoria: ModoDaColecao | null = null

const ehModo = (x: unknown): x is ModoDaColecao => (MODOS_DA_COLECAO as readonly unknown[]).includes(x)

export function lerModoDaColecao(): ModoDaColecao {
  if (naMemoria) return naMemoria
  try {
    const guardado = localStorage.getItem(CHAVE)
    return ehModo(guardado) ? guardado : PADRAO
  } catch {
    return PADRAO
  }
}

export function gravarModoDaColecao(modo: ModoDaColecao): void {
  try {
    localStorage.setItem(CHAVE, modo)
    naMemoria = null
  } catch {
    naMemoria = modo
  }
}

/** Esquece a escolha da memória (testes). */
export const esquecerModoDaMemoria = (): void => {
  naMemoria = null
}
