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

/** O Motor que fala com src/banco/worker.ts. */
export function motorDoWorker(): Motor {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'iconodb-banco' })
  const pendentes = new Map<number, Pendente>()
  let proximo = 1

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
  worker.onerror = (e) => {
    const erro = new Error(e.message || 'O banco parou de responder.')
    for (const p of pendentes.values()) p.falha(erro)
    pendentes.clear()
  }

  function pedir<T>(pedido: SemId<Pedido>): Promise<T> {
    return new Promise<T>((ok, falha) => {
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
  motorAtual ??= motorDoWorker()
  return motorAtual
}

function guardar(promessa: Promise<EstadoBanco>): Promise<EstadoBanco> {
  aberto = promessa
  promessa.catch(() => {
    if (aberto === promessa) aberto = null
  })
  return promessa
}

/** Abre o banco (uma vez). `{estado: 'sem-pacote'}` quando ainda não houve sincronização completa. */
export function abrirBanco(): Promise<EstadoBanco> {
  return aberto ?? guardar(motor().abrir())
}

/** Depois que uma sincronização troca o pacote: fecha e abre o novo. */
export function reabrirBanco(): Promise<EstadoBanco> {
  return guardar(motor().reabrir())
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
