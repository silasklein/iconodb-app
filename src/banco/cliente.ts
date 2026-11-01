/**
 * O lado do thread principal: um RPC mínimo para o worker do banco.
 *
 * Só `consultas.ts` (e o módulo de busca) usam `executar`; as telas nunca
 * escrevem SQL. Nos testes, `usarMotor` troca o worker por um Banco em memória.
 */
import {
  ErroSemPacote,
  type EstadoBanco,
  type Linha,
  type Motor,
  type Parametros,
  type Pedido,
  type PublicacaoAberta,
  type Resposta,
} from './protocolo'

export { ErroSemPacote }
export type { EstadoBanco, Linha, Motor, Parametro, Parametros, PublicacaoAberta } from './protocolo'

/** Pedido sem o id (o cliente numera). */
type SemId<T> = T extends unknown ? Omit<T, 'id'> : never

type Pendente = { ok: (valor: unknown) => void; falha: (erro: Error) => void }

/**
 * O Motor que fala com src/banco/worker.ts. Se o worker morre (o chunk ou o wasm não
 * carregou, por exemplo abrindo sem internet), ele é encerrado, os pedidos pendentes e
 * os seguintes falham, e `aoMorrer` avisa para que a próxima chamada crie outro worker.
 */
export function motorDoWorker(aoMorrer?: () => void): Motor {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'iconodb-banco' })
  const pendentes = new Map<number, Pendente>()
  let proximo = 1
  let morto: Error | null = null

  function morrer(mensagem: string): void {
    if (morto) return
    morto = new Error(mensagem || 'O banco parou de responder.')
    worker.terminate()
    for (const p of pendentes.values()) p.falha(morto)
    pendentes.clear()
    aoMorrer?.()
  }

  worker.onmessage = (e: MessageEvent<Resposta>) => {
    const r = e.data
    const p = pendentes.get(r.id)
    if (!p) return
    pendentes.delete(r.id)
    if (r.ok) p.ok(r.resultado)
    else if (r.nome === 'ErroSemPacote') p.falha(new ErroSemPacote())
    else {
      const erro = new Error(r.mensagem)
      erro.name = r.nome
      p.falha(erro)
    }
  }
  worker.onerror = (e) => morrer(e.message)
  worker.onmessageerror = () => morrer('O banco mandou uma resposta ilegível.')

  function pedir<T>(pedido: SemId<Pedido>): Promise<T> {
    return new Promise<T>((ok, falha) => {
      if (morto) return falha(morto)
      const id = proximo++
      pendentes.set(id, { ok: ok as (v: unknown) => void, falha })
      worker.postMessage({ ...pedido, id })
    })
  }

  return {
    abrir: () => pedir<EstadoBanco>({ op: 'abrir' }),
    reabrir: () => pedir<EstadoBanco>({ op: 'reabrir' }),
    executar: (sql, parametros) => pedir<Linha[]>({ op: 'executar', sql, parametros }),
  }
}

let motorAtual: Motor | null = null
let aberto: Promise<EstadoBanco> | null = null

/** Troca o motor (testes). `null` volta ao worker na próxima chamada. */
export function usarMotor(motor: Motor | null): void {
  motorAtual = motor
  aberto = null
}

function motor(): Motor {
  if (!motorAtual) {
    const novo: Motor = motorDoWorker(() => {
      // Só esquece se ainda é este o motor em uso (um teste pode ter trocado).
      if (motorAtual !== novo) return
      motorAtual = null
      aberto = null
    })
    motorAtual = novo
  }
  return motorAtual
}

/**
 * Guarda a abertura em curso. Só um banco ABERTO fica guardado: "sem pacote" e falhas são
 * esquecidos, para que a próxima chamada olhe o aparelho de novo (o pacote pode chegar depois,
 * por exemplo se "/" abriu a busca na tela de entrar, antes da primeira sincronização).
 */
function guardar(promessa: Promise<EstadoBanco>): Promise<EstadoBanco> {
  aberto = promessa
  const esquecer = () => {
    if (aberto === promessa) aberto = null
  }
  promessa.then((e) => e.estado !== 'aberto' && esquecer(), esquecer)
  return promessa
}

const ouvintesDeReabertura = new Set<() => void>()

/** Avisa depois de cada reabertura bem-sucedida (o pacote pode ter mudado). Devolve o cancelamento. */
export function aoReabrir(ouvinte: () => void): () => void {
  ouvintesDeReabertura.add(ouvinte)
  return () => ouvintesDeReabertura.delete(ouvinte)
}

/** Abre o banco (uma vez). `{estado: 'sem-pacote'}` quando ainda não houve sincronização completa. */
export function abrirBanco(): Promise<EstadoBanco> {
  return aberto ?? guardar(motor().abrir())
}

/** Depois que uma sincronização troca o pacote: fecha e abre o novo, e avisa os ouvintes. */
export async function reabrirBanco(): Promise<EstadoBanco> {
  const estado = await guardar(motor().reabrir())
  for (const ouvinte of [...ouvintesDeReabertura]) ouvinte()
  return estado
}

/** As publicações abertas, na ordem do manifesto; lança ErroSemPacote sem pacote. */
export async function publicacoesAbertas(): Promise<PublicacaoAberta[]> {
  const estado = await abrirBanco()
  if (estado.estado !== 'aberto') throw new ErroSemPacote()
  return estado.publicacoes
}

/** Executa uma consulta (só leitura) e devolve as linhas como objetos. Interno: telas não chamam. */
export async function executar<T = Linha>(sql: string, parametros?: Parametros): Promise<T[]> {
  await publicacoesAbertas()
  return (await motor().executar(sql, parametros)) as T[]
}
