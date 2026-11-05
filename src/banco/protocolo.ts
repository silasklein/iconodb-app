/**
 * O que o cliente (thread principal) e o banco (worker, ou memória nos testes)
 * combinam entre si. Sem dependência do sqlite-wasm: o thread principal importa
 * este arquivo sem carregar o motor.
 */

export type Parametro = string | number | null
/** Posicionais (`?`) ou nomeados (`$nome`, com a chave incluindo o `$`). */
export type Parametros = readonly Parametro[] | Readonly<Record<string, Parametro>>
export type Linha = Record<string, unknown>

/** Uma publicação do pacote e o esquema em que o pub-<SIGLA>.sqlite dela está anexado. */
export interface PublicacaoAberta {
  sigla: string
  esquema: string
}

export type EstadoBanco =
  | { estado: 'sem-pacote' }
  | {
      estado: 'aberto'
      /** Na ordem do manifesto. */
      publicacoes: PublicacaoAberta[]
      geradoEm: string
      /** 'memoria' no Node e quando o pool do OPFS está ocupado (outra janela do app). */
      modo: 'opfs-sahpool' | 'memoria'
    }

/** Uma instrução do lote que escreve no índice da camada do usuário. */
export interface Instrucao {
  sql: string
  parametros?: Parametros
}

/** Quem executa o SQL: o worker no navegador, o Banco em memória nos testes. */
export interface Motor {
  /** Abre (uma vez) o último pacote completo. */
  abrir(): Promise<EstadoBanco>
  /** Fecha e abre de novo, para ver o pacote que uma sincronização acabou de trocar. */
  reabrir(): Promise<EstadoBanco>
  executar(sql: string, parametros?: Parametros): Promise<Linha[]>
  /**
   * O índice da camada do usuário (Parte 2B, Tarefa 4): um banco SQLite em memória, SEPARADO do pacote, no mesmo
   * worker. Não é tocado por abrir/reabrir (sobrevive à troca do pacote). Opcionais para que um motor de teste
   * só com abrir/reabrir/executar continue valendo; sem eles o cliente trata o índice como vazio.
   */
  escreverUsuario?(lote: readonly Instrucao[]): Promise<void>
  consultarUsuario?(sql: string, parametros?: Parametros): Promise<Linha[]>
}

/** Ainda não há pacote completo no aparelho: é preciso sincronizar antes de consultar. */
export class ErroSemPacote extends Error {
  constructor() {
    super('Ainda não há banco no aparelho. Sincronize para baixá-lo.')
    this.name = 'ErroSemPacote'
  }
}

/** Mensagens entre o cliente e o worker. */
export type Pedido =
  | { id: number; op: 'abrir' | 'reabrir' }
  | { id: number; op: 'executar'; sql: string; parametros?: Parametros }
  | { id: number; op: 'usuario-escrever'; lote: readonly Instrucao[] }
  | { id: number; op: 'usuario-consultar'; sql: string; parametros?: Parametros }

export type Resposta = { id: number; ok: true; resultado: unknown } | { id: number; ok: false; nome: string; mensagem: string }
