/**
 * O armazém local da camada do usuário (IndexedDB `iconodb-usuario`): o diário de eventos, o relógio
 * (último hlc), o seq dos eventos, os contadores de ids de registro e a base consolidada.
 *
 * Regra de ouro ("nenhum dado se perde"): toda escrita do usuário passa por `gravarNovosEventos`, que só
 * resolve depois que a transação do IndexedDB terminou (durabilidade "strict"). A rede vem depois.
 *
 * Loja `eventos`, uma linha por evento: {id, aparelho, seq, n, enviado: 0 | 1, evento}.
 * - Locais nascem com enviado = 0; a sincronização (Tarefa 3) chama `marcarEnviados` depois da resposta
 *   do Dropbox.
 * - Remotos (outros aparelhos) entram com enviado = 1: nunca são reenviados por este aparelho.
 */
import { aparelhoAtual } from './aparelho'
import { emTransacao, LOJA_CONFIG, LOJA_EVENTOS, seguro, type Abortar } from './bancoUsuario'
import { compararCopias, montarEvento, PREFIXOS, validarEvento, type Campos, type Evento, type Op, type Prefixo, type Tipo } from './eventos'
import { consolidar, fundir, validarBase, type EstadoConsolidado } from './fusao'
import { HLC_ZERO, novoHlc, receberHlc, validoHlc, type Hlc } from './hlc'

const CHAVE_HLC = 'hlc'
const CHAVE_SEQ = 'seq'
const CHAVE_BASE = 'base'
const chaveDoContador = (prefixo: Prefixo) => `id:${prefixo}`

interface Linha {
  id: string
  aparelho: string
  seq: number
  n: number
  enviado: 0 | 1
  evento: Evento
}

export interface PedidoDeEvento {
  tipo: Tipo
  reg: string
  op: Op
  campos: Campos
}

/**
 * Os maiores números de registro deste aparelho que aparecem em `regs` ("<PREFIXO>-<aparelho>-<n>"). Um
 * registro com o id deste aparelho que veio de fora (um banco restaurado de uma cópia antiga, um perfil
 * clonado) já usou aquele número: o contador `id:<PREFIXO>` tem de passar dele (um id nunca se reutiliza).
 */
function maioresNumerosDeRegistro(aparelho: string, regs: Iterable<string>): Map<Prefixo, number> {
  const re = new RegExp(`^(${PREFIXOS.join('|')})-${aparelho}-(\\d+)$`)
  const maiores = new Map<Prefixo, number>()
  for (const reg of regs) {
    const m = re.exec(reg)
    if (!m) continue
    const n = Number(m[2])
    if (Number.isSafeInteger(n) && n > (maiores.get(m[1] as Prefixo) ?? 0)) maiores.set(m[1] as Prefixo, n)
  }
  return maiores
}

/** Sobe os contadores `id:<PREFIXO>` até os números dados (nunca baixa), na transação `config`. */
function subirContadores(config: IDBObjectStore, abortar: Abortar, maiores: ReadonlyMap<Prefixo, number>): void {
  for (const [prefixo, n] of maiores) {
    const req = config.get(chaveDoContador(prefixo))
    req.onsuccess = seguro(abortar, () => {
      if (((req.result as number | undefined) ?? 0) < n) config.put(n, chaveDoContador(prefixo))
    })
  }
}

function linha(evento: Evento, enviado: 0 | 1): Linha {
  const [, seq, n] = /-(\d+)-(\d+)$/.exec(evento.id)!
  return { id: evento.id, aparelho: evento.aparelho, seq: Number(seq), n: Number(n), enviado, evento }
}

/**
 * Grava eventos novos deste aparelho, numa só transação (tudo ou nada): cada um recebe o próximo hlc
 * (que nunca volta para trás e fica guardado) e, juntos, o próximo seq, com n = 0, 1, 2…
 * Só resolve depois de gravado. Um pedido inválido rejeita sem gravar nada.
 */
export async function gravarNovosEventos(pedidos: readonly PedidoDeEvento[]): Promise<Evento[]> {
  if (pedidos.length === 0) return []
  const { id: aparelho } = await aparelhoAtual()
  return emTransacao([LOJA_CONFIG, LOJA_EVENTOS], 'readwrite', (tx, abortar) => {
    const config = tx.objectStore(LOJA_CONFIG)
    const eventos = tx.objectStore(LOJA_EVENTOS)
    const criados: Evento[] = []
    const lerHlc = config.get(CHAVE_HLC)
    const lerSeq = config.get(CHAVE_SEQ)
    // As requisições terminam na ordem em que foram feitas: quando a do seq termina, a do hlc já terminou.
    lerSeq.onsuccess = seguro(abortar, () => {
      let hlc = (lerHlc.result as Hlc | undefined) ?? null
      const seq = ((lerSeq.result as number | undefined) ?? 0) + 1
      const agora = Date.now()
      pedidos.forEach((p, n) => {
        hlc = novoHlc(hlc, agora, aparelho)
        const evento = montarEvento({ aparelho, seq, n, hlc, tipo: p.tipo, reg: p.reg, op: p.op, campos: p.campos })
        eventos.add(linha(evento, 0))
        criados.push(evento)
      })
      config.put(hlc, CHAVE_HLC)
      config.put(seq, CHAVE_SEQ)
    })
    return () => criados
  })
}

/** Os eventos deste aparelho ainda não enviados, em ordem de (seq, n). */
export function eventosLocaisNaoEnviados(): Promise<Evento[]> {
  return emTransacao([LOJA_EVENTOS], 'readonly', (tx) => {
    const req = tx.objectStore(LOJA_EVENTOS).index('enviado').getAll(0)
    return () => (req.result as Linha[]).sort((a, b) => a.seq - b.seq || a.n - b.n).map((l) => l.evento)
  })
}

/** Marca eventos como enviados (depois da resposta do Dropbox). Ids desconhecidos são ignorados. */
export async function marcarEnviados(ids: Iterable<string>): Promise<void> {
  const lista = [...new Set(ids)]
  if (lista.length === 0) return
  await emTransacao([LOJA_EVENTOS], 'readwrite', (tx, abortar) => {
    const loja = tx.objectStore(LOJA_EVENTOS)
    for (const id of lista) {
      const req = loja.get(id)
      req.onsuccess = seguro(abortar, () => {
        const l = req.result as Linha | undefined
        if (l && l.enviado === 0) loja.put({ ...l, enviado: 1 })
      })
    }
    return () => undefined
  })
}

export interface RecebidosDoRemoto {
  /** Ids que este aparelho ainda não tinha, na ordem recebida. */
  novos: Evento[]
  /** Malformados (validarEvento), ignorados. */
  ignorados: number
  /** Cópias com um id já conhecido mas conteúdo diferente (nunca silencioso). */
  conflitos: number
  /** Dessas, as que venceram (compararCopias) e substituíram a guardada: o estado precisa de nova fusão. */
  substituidos: Evento[]
}

/**
 * Guarda eventos baixados (de outros aparelhos): valida (os malformados são contados e ignorados), não
 * duplica (por id) e avança o relógio além do maior hlc recebido (Foco 3). Um id já conhecido com conteúdo
 * diferente é um conflito: fica a cópia vencedora pela mesma regra da fusão (compararCopias), e ele é
 * contado. Uma cópia de um evento DESTE aparelho que faltasse aqui entra como já enviada, e o seq local
 * pula além dela (um id nunca se repete).
 */
export async function guardarEventosRemotos(eventos: Iterable<unknown>): Promise<RecebidosDoRemoto> {
  const porId = new Map<string, Evento>()
  let ignorados = 0
  let conflitos = 0
  for (const x of eventos) {
    const v = validarEvento(x)
    if (!v.ok) {
      ignorados++
      continue
    }
    const outro = porId.get(v.evento.id)
    if (outro === undefined) porId.set(v.evento.id, v.evento)
    else {
      const c = compararCopias(v.evento, outro)
      if (c !== 0) conflitos++
      if (c > 0) porId.set(v.evento.id, v.evento)
    }
  }
  if (porId.size === 0) return { novos: [], ignorados, conflitos, substituidos: [] }
  const validos = [...porId.values()]
  const { id: aparelho } = await aparelhoAtual()
  let maior = validos[0]!.hlc
  let maiorSeqMeu = 0
  for (const e of validos) {
    if (e.hlc > maior) maior = e.hlc
    if (e.aparelho === aparelho) maiorSeqMeu = Math.max(maiorSeqMeu, linha(e, 1).seq)
  }
  const numeros = maioresNumerosDeRegistro(aparelho, validos.map((e) => e.reg))
  const resultado = await emTransacao([LOJA_CONFIG, LOJA_EVENTOS], 'readwrite', (tx, abortar) => {
    const config = tx.objectStore(LOJA_CONFIG)
    const loja = tx.objectStore(LOJA_EVENTOS)
    subirContadores(config, abortar, numeros)
    const r = { novos: [] as Evento[], conflitos: 0, substituidos: [] as Evento[] }
    for (const e of validos) {
      const req = loja.get(e.id)
      req.onsuccess = seguro(abortar, () => {
        const guardada = req.result as Linha | undefined
        if (guardada === undefined) {
          loja.add(linha(e, 1))
          r.novos.push(e)
          return
        }
        const c = compararCopias(e, guardada.evento)
        if (c === 0) return
        r.conflitos++
        // Uma cópia de fora NUNCA toma o lugar de um evento local ainda não enviado (o dado do usuário que
        // ainda não subiu): a sincronização renumera o local antes (diarioLocal.renumerarLocais).
        if (c > 0 && !(guardada.enviado === 0 && guardada.aparelho === aparelho)) {
          // A guardada perde; o estado "enviado" dela não muda.
          loja.put(linha(e, guardada.enviado))
          r.substituidos.push(e)
        }
      })
    }
    const lerHlc = config.get(CHAVE_HLC)
    lerHlc.onsuccess = seguro(abortar, () => {
      config.put(receberHlc((lerHlc.result as Hlc | undefined) ?? HLC_ZERO(aparelho), maior, Date.now()), CHAVE_HLC)
    })
    if (maiorSeqMeu > 0) {
      const lerSeq = config.get(CHAVE_SEQ)
      lerSeq.onsuccess = seguro(abortar, () => {
        if (((lerSeq.result as number | undefined) ?? 0) < maiorSeqMeu) config.put(maiorSeqMeu, CHAVE_SEQ)
      })
    }
    return () => r
  })
  return { novos: resultado.novos, ignorados, conflitos: conflitos + resultado.conflitos, substituidos: resultado.substituidos }
}

/** Todos os eventos guardados (deste e dos outros aparelhos), em ordem de id. */
export function todosEventos(): Promise<Evento[]> {
  return emTransacao([LOJA_EVENTOS], 'readonly', (tx) => {
    const req = tx.objectStore(LOJA_EVENTOS).getAll()
    return () => (req.result as Linha[]).map((l) => l.evento)
  })
}

/** O último hlc deste aparelho (null antes do primeiro evento). */
export function ultimoHlc(): Promise<Hlc | null> {
  return emTransacao([LOJA_CONFIG], 'readonly', (tx) => {
    const req = tx.objectStore(LOJA_CONFIG).get(CHAVE_HLC)
    return () => (req.result as Hlc | undefined) ?? null
  })
}

/** Leva o relógio local além de `hlc` (por exemplo, o maior hlc de uma base consolidada baixada). */
export async function avancarRelogio(hlc: Hlc): Promise<void> {
  if (!validoHlc(hlc)) throw new Error(`hlc malformado: ${JSON.stringify(hlc)}`)
  const { id: aparelho } = await aparelhoAtual()
  await emTransacao([LOJA_CONFIG], 'readwrite', (tx, abortar) => {
    const config = tx.objectStore(LOJA_CONFIG)
    const req = config.get(CHAVE_HLC)
    req.onsuccess = seguro(abortar, () => {
      config.put(receberHlc((req.result as Hlc | undefined) ?? HLC_ZERO(aparelho), hlc, Date.now()), CHAVE_HLC)
    })
    return () => undefined
  })
}

/** O próximo id de registro "<PREFIXO>-<aparelho>-<n>" (n = 1, 2, 3… por prefixo; nunca reutilizado). */
export async function proximoId(prefixo: Prefixo): Promise<string> {
  if (!(PREFIXOS as readonly string[]).includes(prefixo)) throw new Error(`prefixo de id desconhecido: ${JSON.stringify(prefixo)}`)
  const { id: aparelho } = await aparelhoAtual()
  return emTransacao([LOJA_CONFIG], 'readwrite', (tx, abortar) => {
    const config = tx.objectStore(LOJA_CONFIG)
    const req = config.get(chaveDoContador(prefixo))
    let n = 0
    req.onsuccess = seguro(abortar, () => {
      n = ((req.result as number | undefined) ?? 0) + 1
      config.put(n, chaveDoContador(prefixo))
    })
    return () => `${prefixo}-${aparelho}-${n}`
  })
}

/** Guarda a base consolidada (de estado.json) neste aparelho. */
export async function guardarBase(base: EstadoConsolidado): Promise<void> {
  await emTransacao([LOJA_CONFIG], 'readwrite', (tx) => {
    tx.objectStore(LOJA_CONFIG).put(base, CHAVE_BASE)
    return () => undefined
  })
}

/** A base consolidada guardada (null se não há; registros inválidos ficam de fora, veja validarBase). */
export function lerBase(): Promise<EstadoConsolidado | null> {
  return emTransacao([LOJA_CONFIG], 'readonly', (tx) => {
    const req = tx.objectStore(LOJA_CONFIG).get(CHAVE_BASE)
    return () => (req.result === undefined ? null : (validarBase(req.result)?.base ?? null))
  })
}

/**
 * Une uma base nova (de estado.json, já validada) à guardada, numa só transação de leitura e escrita:
 * guarda consolidar(fundir([], [antiga, nova])). Chamadas simultâneas (nesta ou em outra aba) se
 * enfileiram no IndexedDB e nenhuma perde o que a outra uniu. Devolve a base guardada.
 */
export async function unirBase(nova: EstadoConsolidado): Promise<EstadoConsolidado> {
  const { id: aparelho } = await aparelhoAtual()
  const numeros = maioresNumerosDeRegistro(
    aparelho,
    nova.registros.map((r) => r.id),
  )
  return emTransacao([LOJA_CONFIG], 'readwrite', (tx, abortar) => {
    const config = tx.objectStore(LOJA_CONFIG)
    subirContadores(config, abortar, numeros)
    const req = config.get(CHAVE_BASE)
    let unida = nova
    req.onsuccess = seguro(abortar, () => {
      const antiga = req.result === undefined ? null : (validarBase(req.result)?.base ?? null)
      unida = antiga ? consolidar(fundir([], [antiga, nova])) : nova
      config.put(unida, CHAVE_BASE)
    })
    return () => unida
  })
}
