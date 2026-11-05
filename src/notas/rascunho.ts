/**
 * O rascunho de uma nota: o que se digita chega ao IndexedDB, como evento, no máximo a cada segundo (1 s depois da
 * primeira tecla de cada rodada), antes de qualquer rede. Nenhuma tecla depende de "Salvar" para não se perder.
 *
 * - A primeira gravação CRIA a nota (`criar`, com o texto, o alvo, a marca `rascunho` e as âncoras do texto da fonte);
 *   as seguintes só levam o texto (`alterar`). Texto em branco nunca cria nada.
 * - `descarregar()` grava já o que falta. Está na lista de pendentes (src/usuario/pendentes.ts), então a aba que se
 *   esconde (`visibilitychange`), a página que se fecha (`pagehide`), Ctrl/⌘S e "Salvar e sincronizar" gravam o rascunho
 *   antes de seguir.
 * - Uma gravação por vez (fila). Digitar durante uma gravação não a atropela: o texto de agora é gravado na seguinte.
 * - Se a gravação falha, o texto continua pendente (estado "erro"), a falha é mostrada e uma nova tentativa é agendada;
 *   o id da nota já reservado é mantido, então a nota nunca é criada duas vezes.
 * - `salvar()` grava o que falta e tira a marca de rascunho. Excluir e restaurar são marcas reversíveis.
 */
import { guardarEmergencia, limparEmergencia } from '../usuario/emergencia'
import { proximoId, registrar } from '../usuario/estado'
import { registrarPendente } from '../usuario/pendentes'
import type { Ancora } from './ancora'
import type { TipoDeAlvo } from './indiceDeNotas'

export const ESPERA_DO_RASCUNHO_MS = 1000

export type EstadoDoRascunho = 'limpo' | 'pendente' | 'gravando' | 'erro'

export interface Dependencias {
  registrar: typeof registrar
  novoId: () => Promise<string>
}

const PADRAO: Dependencias = { registrar, novoId: () => proximoId('NT') }

export interface OpcoesDoRascunho {
  /** A nota que já existe. Sem ela, o primeiro texto cria uma nota nova (e então `alvo` é obrigatório). */
  reg?: string | null
  /** O texto da nota que já existe, como está gravado. */
  texto?: string
  /** A nota que já existe ainda está marcada como rascunho? */
  rascunho?: boolean
  alvo?: { tipo: TipoDeAlvo; ref: string }
  /** O hlc do `texto` da nota que já existe, de que o rascunho parte (a rede de segurança só aplica por cima se ele não mudou). */
  baseHlc?: string | null
  /** As âncoras do texto da fonte, calculadas na hora de criar a nota (não bloqueiam a gravação se falharem). */
  ancorar?: () => Promise<Ancora[]>
  espera?: number
  dependencias?: Dependencias
}

export class Rascunho {
  private readonly dep: Dependencias
  private readonly alvo: OpcoesDoRascunho['alvo']
  private readonly ancorar: OpcoesDoRascunho['ancorar']
  private readonly espera: number
  private id: string | null
  private criada: boolean
  private gravado: string | null
  private atual: string
  private ehRascunho: boolean
  private temporizador: ReturnType<typeof setTimeout> | null = null
  private fila: Promise<unknown> = Promise.resolve()
  private gravando = false
  private encerrado = false
  private finalizando = false
  private desregistrar: (() => void) | null = null
  private ancorasEmCurso: Promise<Ancora[]> | null = null
  private ancorasProntas: Ancora[] | null = null
  /** O id da nota nova, pedido já na primeira tecla: no `pagehide` o `criar` não pode esperar mais uma ida ao IndexedDB. */
  private idPedido: Promise<string> | null = null
  /** O id pedido já resolvido (antes de a primeira gravação começar): é o que a entrada de emergência leva. */
  private idReservado: string | null = null
  /** O hlc da escrita do `texto` de que o rascunho parte: a da nota quando abriu ou a última que ele mesmo gravou. */
  private baseHlc: string | null
  private emergenciaGuardada = false
  /** O texto da gravação em andamento (null fora dela): vai para a entrada de emergência (A-5 da Tarefa 17). */
  private emVoo: string | null = null
  /** Onde o texto não gravado fica guardado, de forma síncrona, quando a página se esconde ou fecha (usuario/emergencia.ts). */
  private readonly chaveDeEmergencia = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  private excluida = false
  private situacao: EstadoDoRascunho = 'limpo'
  private mensagemDeErro: string | null = null
  private readonly ouvintes = new Set<() => void>()

  constructor(opcoes: OpcoesDoRascunho = {}) {
    this.dep = opcoes.dependencias ?? PADRAO
    this.alvo = opcoes.alvo
    this.ancorar = opcoes.ancorar
    this.espera = opcoes.espera ?? ESPERA_DO_RASCUNHO_MS
    this.id = opcoes.reg ?? null
    this.criada = this.id !== null
    this.gravado = this.criada ? (opcoes.texto ?? '') : null
    this.atual = opcoes.texto ?? ''
    this.ehRascunho = this.criada ? (opcoes.rascunho ?? false) : true
    this.baseHlc = this.criada ? (opcoes.baseHlc ?? null) : null
  }

  /** O id da nota: depois que a primeira gravação reservou o id. */
  get reg(): string | null {
    return this.id
  }
  get estado(): EstadoDoRascunho {
    return this.situacao
  }
  /** A mensagem da última falha de gravação (enquanto o estado for "erro"). */
  get erro(): string | null {
    return this.mensagemDeErro
  }
  /** A nota ainda tem a marca de rascunho? */
  get rascunho(): boolean {
    return this.ehRascunho
  }
  get texto(): string {
    return this.atual
  }
  /** Há texto ainda não gravado? */
  get porGravar(): boolean {
    return this.sujo()
  }

  /**
   * Parte de novo da nota como ela está agora (outra aba ou aparelho pode tê-la mudado): troca o texto e a base. Só com o
   * rascunho limpo; com texto por gravar não mexe em nada e devolve false.
   */
  semear(texto: string, baseHlc: string | null): boolean {
    if (!this.criada || this.sujo() || this.gravando || this.excluida) return false
    this.atual = texto
    this.gravado = texto
    this.baseHlc = baseHlc
    return true
  }

  assinar(ouvinte: () => void): () => void {
    this.ouvintes.add(ouvinte)
    return () => this.ouvintes.delete(ouvinte)
  }

  private definir(situacao: EstadoDoRascunho, erro: string | null = null): void {
    if (this.situacao === situacao && this.mensagemDeErro === erro) return
    this.situacao = situacao
    this.mensagemDeErro = erro
    for (const o of [...this.ouvintes]) o()
  }

  private sujo(): boolean {
    return this.criada ? this.atual !== this.gravado : this.atual.trim() !== ''
  }

  /** O texto mudou: guarda e agenda a gravação (no máximo uma por `espera`). */
  mudar(texto: string): void {
    // Uma nota excluída não recebe mais texto (o campo pode ainda estar na tela por um instante): restaurar reabre a escrita.
    if (this.excluida) return
    this.atual = texto
    if (this.encerrado) return
    if (this.sujo()) {
      if (!this.criada) this.pedirId()
      this.desregistrar ??= registrarPendente(
        () => this.descarregar(),
        () => this.guardarParaEmergencia(),
      )
      if (!this.gravando) this.definir('pendente')
      this.agendar()
    } else if (!this.gravando && this.situacao !== 'erro') {
      this.definir('limpo')
    }
  }

  /** Pede (uma vez) o id da nota nova. Um pedido que falha é esquecido: a próxima gravação pede de novo. */
  private pedirId(): Promise<string> {
    if (this.idPedido) return this.idPedido
    const pedido = this.dep.novoId()
    this.idPedido = pedido
    pedido.then(
      (id) => {
        this.idReservado = id
        // A entrada de emergência já estava guardada sem id: leva o id agora, antes de qualquer `criar`.
        if (this.emergenciaGuardada) this.guardarParaEmergencia()
      },
      () => {
        if (this.idPedido === pedido) this.idPedido = null
      },
    )
    return pedido
  }

  /**
   * Na mesma tarefa do `pagehide`: o texto ainda não gravado vai para o localStorage, que é síncrono. As transações do
   * IndexedDB que a gravação normal ainda precisa fazer podem ser cortadas pela página que vai embora.
   */
  private guardarParaEmergencia(): void {
    if (this.excluida || !this.sujo()) return
    const campos: Record<string, unknown> = { texto: this.atual, rascunho: this.ehRascunho }
    if (this.alvo) Object.assign(campos, { alvoTipo: this.alvo.tipo, alvo: this.alvo.ref })
    if (!this.criada && this.ancorasProntas && this.ancorasProntas.length > 0) campos.ancoras = this.ancorasProntas
    this.emergenciaGuardada = true
    // Uma gravação em voo pode chegar ao IndexedDB e a página morrer antes de ela "voltar" (a base aqui ainda é a de antes):
    // `emVoo` diz à recuperação que um texto igual a ele, por cima da base, é este mesmo rascunho, não outra edição.
    guardarEmergencia(this.chaveDeEmergencia, { reg: this.id ?? this.idReservado, base: this.baseHlc, campos: campos as never, ...(this.emVoo !== null ? { emVoo: this.emVoo } : {}) })
  }

  private agendar(): void {
    if (this.temporizador !== null || this.encerrado) return
    this.temporizador = setTimeout(() => {
      this.temporizador = null
      void this.descarregar().catch(() => undefined)
    }, this.espera)
  }

  private enfileirar<T>(tarefa: () => Promise<T>): Promise<T> {
    const feita = this.fila.then(tarefa, tarefa)
    this.fila = feita.catch(() => undefined)
    return feita
  }

  /** Grava já o que falta. Rejeita se a gravação falhar (o texto continua pendente e uma nova tentativa é agendada). */
  descarregar(): Promise<void> {
    if (this.temporizador !== null) {
      clearTimeout(this.temporizador)
      this.temporizador = null
    }
    return this.enfileirar(() => this.gravarPendente())
  }

  private async gravarPendente(): Promise<void> {
    if (!this.sujo()) {
      // O texto voltou a ser o gravado (ou a ficar em branco): o que estava guardado às pressas já não vale.
      limparEmergencia(this.chaveDeEmergencia)
      this.emergenciaGuardada = false
      if (this.situacao === 'pendente' || this.situacao === 'erro') this.definir('limpo')
      return
    }
    const texto = this.atual
    this.gravando = true
    this.emVoo = texto
    this.definir('gravando')
    try {
      if (!this.criada) {
        if (!this.alvo) throw new Error('A nota precisa de um alvo.')
        if (this.id === null) {
          this.id = await this.pedirId()
          // Quem assina (a tela) fica sabendo do id antes de o `criar` terminar, para não listar o rascunho duas vezes.
          for (const o of [...this.ouvintes]) o()
        }
        const campos: Record<string, unknown> = { texto, alvoTipo: this.alvo.tipo, alvo: this.alvo.ref, rascunho: true }
        const ancoras = await this.preparar()
        if (ancoras.length > 0) campos.ancoras = ancoras
        const criado = await this.dep.registrar('nota', this.id, 'criar', campos as never)
        this.baseHlc = criado?.hlc ?? this.baseHlc
        this.criada = true
        this.ehRascunho = true
      } else {
        const alterado = await this.dep.registrar('nota', this.id!, 'alterar', { texto })
        this.baseHlc = alterado?.hlc ?? this.baseHlc
      }
      this.gravado = texto
      this.gravando = false
      this.emVoo = null
      if (!this.sujo()) {
        limparEmergencia(this.chaveDeEmergencia)
        this.emergenciaGuardada = false
      } else if (this.emergenciaGuardada) {
        // Voltou com mais texto por gravar e a entrada já guardada tem a base de antes: ela passa a ter a base nova.
        this.guardarParaEmergencia()
      }
      if (this.sujo()) {
        this.definir('pendente')
        this.agendar()
      } else {
        this.definir('limpo')
        if (this.finalizando) this.liberar()
      }
    } catch (erro) {
      this.gravando = false
      this.emVoo = null
      this.definir('erro', erro instanceof Error ? erro.message : String(erro))
      this.agendar()
      throw erro
    }
  }

  /**
   * Começa a calcular as âncoras do texto da fonte (uma vez): a tela chama ao abrir o editor, então no primeiro `criar`
   * (inclusive o de `pagehide`, que não pode esperar) o resultado já está pronto. Uma nota que já existe não precisa.
   */
  preparar(): Promise<Ancora[]> {
    if (this.criada) return Promise.resolve([])
    this.ancorasEmCurso ??= (async () => {
      try {
        this.ancorasProntas = (await this.ancorar?.()) ?? []
      } catch {
        // Sem âncoras a nota vale do mesmo jeito; o aviso "o texto da fonte mudou" é que não vai existir para ela.
        this.ancorasProntas = []
      }
      return this.ancorasProntas
    })()
    return this.ancorasEmCurso
  }

  /** Grava o que falta e tira a marca de rascunho. Devolve o id da nota, ou null se não há texto para guardar. */
  async salvar(): Promise<string | null> {
    await this.descarregar()
    return this.enfileirar(async () => {
      if (!this.criada || this.id === null) return null
      if (this.ehRascunho) {
        await this.dep.registrar('nota', this.id, 'alterar', { rascunho: false })
        this.ehRascunho = false
      }
      return this.id
    })
  }

  /** Marca a nota como excluída (reversível). Uma nota que nunca chegou a ser gravada não precisa de nada. */
  async excluir(): Promise<void> {
    await this.descarregar().catch(() => undefined)
    this.excluida = true
    limparEmergencia(this.chaveDeEmergencia)
    this.emergenciaGuardada = false
    if (this.temporizador !== null) {
      clearTimeout(this.temporizador)
      this.temporizador = null
    }
    await this.enfileirar(async () => {
      if (this.criada && this.id !== null) await this.dep.registrar('nota', this.id, 'excluir')
    })
  }

  async restaurar(): Promise<void> {
    await this.enfileirar(async () => {
      if (this.criada && this.id !== null) await this.dep.registrar('nota', this.id, 'restaurar')
    })
    this.excluida = false
  }

  /**
   * A tela vai embora: grava o que falta e, só quando tudo estiver gravado, sai da lista de pendentes. Se a gravação
   * falhar, o rascunho continua vivo (nova tentativa agendada, ainda na lista de pendentes) até conseguir: o texto não
   * existe em outro lugar. Pode ser chamado de novo por `reativar()` (a tela montou outra vez).
   */
  finalizar(): Promise<void> {
    this.finalizando = true
    return this.descarregar().then(
      () => {
        if (!this.sujo()) this.liberar()
      },
      () => undefined,
    )
  }

  /** A tela voltou a usar o rascunho (efeitos montados de novo). */
  reativar(): void {
    this.finalizando = false
    this.encerrado = false
    void this.preparar()
  }

  private liberar(): void {
    this.desregistrar?.()
    this.desregistrar = null
  }

  /** Para de agendar e sai da lista de pendentes. Não cancela o que já está na fila: chame `descarregar()` antes, se precisar. */
  encerrar(): void {
    this.encerrado = true
    if (this.temporizador !== null) clearTimeout(this.temporizador)
    this.temporizador = null
    this.liberar()
  }
}
