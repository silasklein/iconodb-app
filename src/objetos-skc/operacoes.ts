/**
 * Escrever objetos SKC. Tudo passa por `registrar` (IndexedDB antes de qualquer rede; Tarefa 2).
 *
 * Salvar (decisões 30 e 34):
 *  1. com rede, sincroniza ANTES (até `prazoMs`; o que demorar mais segue em segundo plano): assim o pedido de número
 *     já vê o que os outros aparelhos confirmaram e quase nunca colide;
 *  2. grava o `criar` com o período e o pedido (o próximo número que este aparelho vê); sem período, um rascunho;
 *  3. grava as imagens (Tarefa 8), com o id do objeto como alvo (o id não muda; o número provisório pode mudar);
 *  4. pede uma sincronização (sem esperar): é ela que, consolidando, CONFIRMA o número (veja numeracao.ts).
 */
import { normalizarForma } from '../glossario/modelo'
import { adicionarImagem, type DadosDaImagem } from '../imagens-usuario/operacoes'
import type { ImagemProcessada } from '../imagens-usuario/processar'
import { criarSitio, reservarIdDoSitio } from '../sitios/operacoes'
import { estadoAtual, proximoId, registrar } from '../usuario/estado'
import { sincronizarAgora } from '../usuario/useSincronizacao'
import { gruposDe, numeracaoDe } from './atual'
import { confirmadosAtuais } from './confirmados'
import { lerLigacoes, refDoObjeto, regDaLigacao } from './ligacoes'
import { camposDoCriar, type FichaSkc } from './modelo'
import { formatarNumero, MAIOR_N, numerar, type CodigoDePeriodo } from './numeracao'
import { numerosDoPacote } from './pacote'

export const PRAZO_DA_SINCRONIZACAO_ANTES_MS = 8000

export interface OpcoesDoSalvar {
  /** Há rede? (padrão: `navigator.onLine`). */
  online?: boolean
  /** Quanto esperar pela sincronização de antes. */
  prazoMs?: number
  imagens?: { arquivo: File | Blob | ImagemProcessada; dados: DadosDaImagem }[]
  /** Chamado logo depois do `criar` (antes das imagens): o rascunho guarda o id, e um salvar interrompido não cria outro. */
  aoCriar?: (id: string) => void
  /** Chamado a cada imagem guardada (o índice na lista): o rascunho a tira. */
  aoGuardarImagem?: (indice: number) => void
  /**
   * "Novo sítio «…»" (Tarefa 12): o nome de um sítio novo do usuário a criar NA MESMA gravação do objeto (o `criar` do sítio e o
   * do objeto, ligado a ele, entram numa transação só: nunca fica um sem o outro). Sem isto, vale o `sitio`/`sitioNome` da ficha.
   */
  sitioNovo?: string | null
}

export interface ObjetoSalvo {
  id: string
  /** O número mostrado ao salvar (provisório até a sincronização confirmar); null num rascunho. */
  pedido: string | null
  /** O SKC, Nr. mostrado ao salvar (decisão 38); null num rascunho. */
  pedidoNrSkc: string | null
  imagensComErro: number
}

const temRede = (o?: boolean) => o ?? (typeof navigator === 'undefined' || navigator.onLine !== false)

async function sincronizarAntes(opcoes: { online?: boolean; prazoMs?: number }): Promise<void> {
  if (!temRede(opcoes.online)) return
  let prazo: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    sincronizarAgora('manual').catch(() => null),
    new Promise<void>((r) => {
      prazo = setTimeout(r, opcoes.prazoMs ?? PRAZO_DA_SINCRONIZACAO_ANTES_MS)
    }),
  ])
  clearTimeout(prazo)
}

/** O número e o SKC, Nr. (decisão 38) que a tela mostra para um pedido novo do período: só para o aviso. */
async function pedidoPara(periodo: CodigoDePeriodo | null): Promise<{ pedido: string | null; pedidoNrSkc: string | null }> {
  if (!periodo) return { pedido: null, pedidoNrSkc: null }
  const pacote = await numerosDoPacote()
  // Sem os números do pacote o app não sabe qual é o próximo: o pedido fica sem número (o número aparece quando o
  // pacote responder; o pedido é só para o aviso).
  if (!pacote) return { pedido: null, pedidoNrSkc: null }
  const n = numerar(estadoAtual(), pacote, confirmadosAtuais())
  const proximo = (n.maiores.get(periodo) ?? 0) + 1
  return { pedido: proximo > MAIOR_N ? null : formatarNumero(periodo, proximo), pedidoNrSkc: String(n.maiorNrSkc + 1) }
}

export async function salvarObjeto(ficha: FichaSkc, opcoes: OpcoesDoSalvar = {}): Promise<ObjetoSalvo> {
  if (ficha.periodo) await sincronizarAntes(opcoes)
  const id = await proximoId('OB')
  const { pedido, pedidoNrSkc } = await pedidoPara(ficha.periodo)
  const campos = camposDoCriar(ficha, pedido, pedidoNrSkc)
  const nomeDoSitio = opcoes.sitioNovo ? normalizarForma(opcoes.sitioNovo) : ''
  if (nomeDoSitio !== '') {
    const sitioId = await reservarIdDoSitio()
    await criarSitio({ nome: nomeDoSitio }, { id: sitioId, junto: (sid, nome) => [{ tipo: 'objeto', reg: id, op: 'criar', campos: { ...campos, sitio: sid, sitioNome: nome } }] })
  } else await registrar('objeto', id, 'criar', campos)
  opcoes.aoCriar?.(id)
  const { imagensComErro } = await completarObjeto(id, opcoes)
  return { id, pedido, pedidoNrSkc, imagensComErro }
}

/**
 * Guarda as imagens num objeto que já existe (o resto de um salvar interrompido; nunca cria objeto) e pede a
 * sincronização.
 */
export async function completarObjeto(id: string, opcoes: Pick<OpcoesDoSalvar, 'imagens' | 'online' | 'aoGuardarImagem'> = {}): Promise<{ imagensComErro: number }> {
  let imagensComErro = 0
  for (const [i, img] of (opcoes.imagens ?? []).entries()) {
    try {
      await adicionarImagem({ objeto: id }, img.arquivo, img.dados)
      opcoes.aoGuardarImagem?.(i)
    } catch {
      imagensComErro++
    }
  }
  if (temRede(opcoes.online)) void sincronizarAgora('manual').catch(() => null)
  return { imagensComErro }
}

/**
 * Dá o período a um rascunho ("Ainda não sei" → um período): o pedido de número segue as mesmas regras do salvar, e o
 * SKC, Nr. vem no mesmo passo (decisão 38).
 */
export async function escolherPeriodo(id: string, periodo: CodigoDePeriodo, opcoes: { online?: boolean; prazoMs?: number } = {}): Promise<string | null> {
  await sincronizarAntes(opcoes)
  const { pedido, pedidoNrSkc } = await pedidoPara(periodo)
  await registrar('objeto', id, 'alterar', { periodo, pedido, pedidoNrSkc })
  if (temRede(opcoes.online)) void sincronizarAgora('manual').catch(() => null)
  return pedido
}

export const excluirObjeto = (id: string) => registrar('objeto', id, 'excluir')
export const restaurarObjeto = (id: string) => registrar('objeto', id, 'restaurar')

/** Erro de ligação com o texto para a tela. */
export class ErroDeLigacao extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeLigacao'
  }
}

async function refExistente(x: string): Promise<string> {
  const estado = estadoAtual()
  const numeracao = numeracaoDe(estado)
  const ref = refDoObjeto(x, numeracao)
  if (!ref) throw new ErroDeLigacao(`«${x.trim()}» não é um número de objeto (ex.: CA00023).`)
  if (ref.startsWith('OB-')) {
    if (!estado.registro('objeto', ref)) throw new ErroDeLigacao(`Nenhum objeto ${x.trim()} no banco.`)
    return ref
  }
  const pacote = await numerosDoPacote()
  if (!pacote?.has(ref)) throw new ErroDeLigacao(`Nenhum objeto ${ref} no banco.`)
  return ref
}

/**
 * Liga dois objetos (o mesmo objeto físico em duas fontes): evento `ligacao` (ver ligacoes.ts). Aceita números e ids de
 * objeto SKC. Devolve o principal do grupo (o número dado primeiro; decisão 38). Ligar de novo uma ligação desfeita a refaz.
 */
export async function ligarObjetos(numeroA: string, numeroB: string): Promise<string> {
  const a = await refExistente(numeroA)
  const b = await refExistente(numeroB)
  if (a === b) throw new ErroDeLigacao('É o mesmo objeto.')
  const reg = regDaLigacao(a, b)
  const [x, y] = reg.split('|') as [string, string]
  if (estadoAtual().registro('ligacao', reg)) await registrar('ligacao', reg, 'alterar', { ativa: true })
  else await registrar('ligacao', reg, 'criar', { a: x, b: y, ativa: true })
  return gruposDe(estadoAtual()).principal(a)
}

/** Desfaz a ligação entre os dois (reversível: ligar de novo a refaz). */
export async function desfazerLigacao(refA: string, refB: string): Promise<void> {
  const reg = regDaLigacao(refA, refB)
  if (!lerLigacoes(estadoAtual()).some((l) => l.reg === reg)) return
  await registrar('ligacao', reg, 'alterar', { ativa: false })
}
