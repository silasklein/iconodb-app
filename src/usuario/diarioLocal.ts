/**
 * O que a sincronização guarda neste aparelho (IndexedDB `iconodb-usuario`, lojas `config` e `eventos`),
 * sempre em transações curtas e completas: nada aqui depende da rede.
 *
 * Chaves de `config`:
 * - `segmento`: o último número de segmento deste aparelho já atribuído (separado do seq dos eventos).
 * - `sync:planos`: os segmentos montados e ainda não confirmados pelo Dropbox, [{seg, ids}]. Um plano é
 *   gravado ANTES do envio e só sai depois da resposta: se a rede cai ou o app fecha no meio, o reenvio tem
 *   o mesmo nome e o mesmo conteúdo (o Dropbox aceita, idempotente).
 * - `sync:lidos`: por aparelho (este inclusive), até onde o diário dele já entrou aqui:
 *   {marca, ate, alem}. `marca` = todos os segmentos 1..marca entraram (ou estão numa base recebida);
 *   `ate` = o maior seq de evento desses segmentos; `alem` = segmentos depois de uma lacuna, já lidos
 *   ({segmento: maior seq}). Uma lacuna nunca é pulada: o segmento que falta é lido quando aparecer.
 * - `sync:problemas`: por aparelho, os segmentos que NÃO puderam ser lidos por inteiro (malformado, grande
 *   demais, linhas ilegíveis ou de outro aparelho): {segmento: {rev, motivo, em}}. Eles não contam como lidos:
 *   a `marca` para antes deles, então nenhuma consolidação publica uma cobertura que os inclua (o aparelho
 *   dono do segmento só poda o que a cobertura inclui). Ficam reportados e são tentados de novo.
 * - `sync:estadoRev`, `sync:estadoCobertura` ({ate, segmentos} do estado.json conhecido),
 *   `sync:consolidadoEm`, `sync:nomes` ({aparelho: {nome, rev}}), `sync:nomePublicado`.
 *
 * Linhas de `eventos` enviadas ganham `segmento` (o número em que subiram): a poda só apaga uma linha
 * deste aparelho já enviada cujo segmento a base recebida cobre (nunca uma não enviada).
 */
import { aparelhoAtual, avisarTrocaDeAparelho, CHAVE_DO_APARELHO, gerarId, type Aparelho } from './aparelho'
import { emTransacao, LOJA_CONFIG, LOJA_EVENTOS, seguro } from './bancoUsuario'
import { montarEvento, type Evento } from './eventos'
import { maiorHlc, novoHlc, type Hlc } from './hlc'

export interface Plano {
  seg: number
  ids: string[]
}

export interface Leitura {
  marca: number
  ate: number
  alem: Record<string, number>
}
export type Lidos = Record<string, Leitura>

export interface Cobertura {
  ate: Record<string, number>
  segmentos: Record<string, number>
}

/** Uma linha da loja `eventos` (armazem.ts), com o segmento em que subiu, quando subiu. */
export interface LinhaDeEvento {
  id: string
  aparelho: string
  seq: number
  n: number
  enviado: 0 | 1
  evento: Evento
  segmento?: number
}

export const CHAVE_SEGMENTO = 'segmento'
const CHAVE_PLANOS = 'sync:planos'
const CHAVE_LIDOS = 'sync:lidos'
const CHAVE_PROBLEMAS = 'sync:problemas'
const CHAVE_SEQ = 'seq'
const CHAVE_HLC = 'hlc'

export const leituraVazia = (): Leitura => ({ marca: 0, ate: 0, alem: {} })

/** Avança a marca enquanto o segmento seguinte já foi lido; tira de `alem` o que a marca cobre. */
export function compactar(l: Leitura): Leitura {
  const alem = { ...l.alem }
  let { marca, ate } = l
  for (const k of Object.keys(alem)) {
    if (Number(k) <= marca) {
      ate = Math.max(ate, alem[k]!)
      delete alem[k]
    }
  }
  while (alem[String(marca + 1)] !== undefined) {
    ate = Math.max(ate, alem[String(marca + 1)]!)
    delete alem[String(marca + 1)]
    marca++
  }
  return { marca, ate, alem }
}

/** Um segmento que não pôde ser lido por inteiro (veja `sync:problemas`). */
export interface Problema {
  rev: string
  motivo: string
  /** Quando foi tentado pela última vez (ms). */
  em: number
  /** Parte das linhas era válida e entrou. */
  parcial?: boolean
}
export type Problemas = Record<string, Record<string, Problema>>

/** Já lido (ou coberto por uma base)? */
export const jaLido = (l: Leitura | undefined, seg: number) => !!l && (seg <= l.marca || l.alem[String(seg)] !== undefined)

// ------------------------------------------------------------------ config simples

export function lerConfig<T>(chave: string): Promise<T | undefined> {
  return emTransacao([LOJA_CONFIG], 'readonly', (tx) => {
    const req = tx.objectStore(LOJA_CONFIG).get(chave)
    return () => req.result as T | undefined
  })
}

export async function gravarConfig(chave: string, valor: unknown): Promise<void> {
  await emTransacao([LOJA_CONFIG], 'readwrite', (tx) => {
    if (valor === undefined) tx.objectStore(LOJA_CONFIG).delete(chave)
    else tx.objectStore(LOJA_CONFIG).put(valor, chave)
    return () => undefined
  })
}

/** Lê e grava uma chave numa só transação (mudar recebe o valor atual). */
export function atualizarConfig<T>(chave: string, mudar: (atual: T | undefined) => T): Promise<T> {
  return emTransacao([LOJA_CONFIG], 'readwrite', (tx, abortar) => {
    const loja = tx.objectStore(LOJA_CONFIG)
    const req = loja.get(chave)
    let novo!: T
    req.onsuccess = seguro(abortar, () => {
      novo = mudar(req.result as T | undefined)
      loja.put(novo, chave)
    })
    return () => novo
  })
}

export async function lerLidos(): Promise<Lidos> {
  return (await lerConfig<Lidos>(CHAVE_LIDOS)) ?? {}
}

export async function lerPlanos(): Promise<Plano[]> {
  return ((await lerConfig<Plano[]>(CHAVE_PLANOS)) ?? []).slice().sort((a, b) => a.seg - b.seg)
}

/** Os segmentos com problema ainda não cobertos por uma base (os que a marca já passou saem). */
export async function lerProblemas(): Promise<Problemas> {
  const [problemas, lidos] = await Promise.all([lerConfig<Problemas>(CHAVE_PROBLEMAS), lerLidos()])
  const limpo: Problemas = {}
  for (const [ap, segs] of Object.entries(problemas ?? {})) {
    for (const [seg, p] of Object.entries(segs)) {
      if (jaLido(lidos[ap], Number(seg))) continue
      ;(limpo[ap] ??= {})[seg] = p
    }
  }
  return limpo
}

/** Anota (ou tira) segmentos com problema, numa só transação. */
export function registrarProblemas(mudancas: { aparelho: string; seg: number; problema: Problema | null }[]): Promise<Problemas> {
  return atualizarConfig<Problemas>(CHAVE_PROBLEMAS, (atual) => {
    const novo: Problemas = {}
    for (const [ap, segs] of Object.entries(atual ?? {})) novo[ap] = { ...segs }
    for (const { aparelho, seg, problema } of mudancas) {
      if (problema) (novo[aparelho] ??= {})[String(seg)] = problema
      else if (novo[aparelho]) delete novo[aparelho][String(seg)]
    }
    for (const ap of Object.keys(novo)) if (Object.keys(novo[ap]!).length === 0) delete novo[ap]
    return novo
  })
}

/** Registra segmentos lidos (cada um com o maior seq dos eventos que trouxe). */
export function registrarLidos(lidos: { aparelho: string; seg: number; maiorSeq: number }[]): Promise<Lidos> {
  return atualizarConfig<Lidos>(CHAVE_LIDOS, (atual) => {
    const novo: Lidos = { ...(atual ?? {}) }
    for (const { aparelho, seg, maiorSeq } of lidos) {
      const l = novo[aparelho] ?? leituraVazia()
      if (jaLido(l, seg)) continue
      novo[aparelho] = compactar({ ...l, alem: { ...l.alem, [String(seg)]: maiorSeq } })
    }
    return novo
  })
}

/** Uma base recebida cobre os segmentos 1..segmentos[ap] de cada aparelho: a marca sobe até lá. */
export function elevarLidos(cobertura: Cobertura): Promise<Lidos> {
  return atualizarConfig<Lidos>(CHAVE_LIDOS, (atual) => {
    const novo: Lidos = { ...(atual ?? {}) }
    for (const [ap, seg] of Object.entries(cobertura.segmentos)) {
      const l = novo[ap] ?? leituraVazia()
      novo[ap] = compactar({ marca: Math.max(l.marca, seg), ate: Math.max(l.ate, cobertura.ate[ap] ?? 0), alem: l.alem })
    }
    return novo
  })
}

// ------------------------------------------------------------------ segmentos deste aparelho

/** Quantos eventos deste aparelho ainda não subiram. */
export function contarNaoEnviados(): Promise<number> {
  return emTransacao([LOJA_EVENTOS], 'readonly', (tx) => {
    const req = tx.objectStore(LOJA_EVENTOS).index('enviado').count(0)
    return () => req.result
  })
}

/**
 * Monta os segmentos dos eventos não enviados que ainda não estão em nenhum plano, numa só transação:
 * em ordem (seq, n), até `maximo` eventos por segmento, sem nunca partir uma gravação (os eventos do mesmo
 * seq ficam juntos). Decisão R5: uma única gravação com mais de `maximo` eventos fica inteira num só
 * segmento (que então passa de `maximo`): uma gravação nunca é partida, para o segmento ser
 * sempre atômico (ou todos os eventos da gravação chegam a outro aparelho, ou nenhum). Os números continuam o
 * contador `segmento`, e nunca ficam abaixo de `minimo` + 1 (o maior segmento deste aparelho já visto no
 * Dropbox). Devolve todos os planos pendentes, em ordem.
 */
export function planejar(maximo: number, minimo: number): Promise<Plano[]> {
  return emTransacao([LOJA_CONFIG, LOJA_EVENTOS], 'readwrite', (tx, abortar) => {
    const config = tx.objectStore(LOJA_CONFIG)
    const lerPlanosReq = config.get(CHAVE_PLANOS)
    const lerContador = config.get(CHAVE_SEGMENTO)
    const lerLinhas = tx.objectStore(LOJA_EVENTOS).index('enviado').getAll(0)
    let planos: Plano[] = []
    lerLinhas.onsuccess = seguro(abortar, () => {
      planos = ((lerPlanosReq.result as Plano[] | undefined) ?? []).slice()
      const planejados = new Set(planos.flatMap((p) => p.ids))
      const livres = (lerLinhas.result as LinhaDeEvento[]).filter((l) => !planejados.has(l.id)).sort((a, b) => a.seq - b.seq || a.n - b.n)
      if (livres.length === 0) return
      const grupos: LinhaDeEvento[][] = []
      for (const l of livres) {
        const ultimo = grupos[grupos.length - 1]
        if (ultimo && ultimo[0]!.seq === l.seq) ultimo.push(l)
        else grupos.push([l])
      }
      let contador = Math.max((lerContador.result as number | undefined) ?? 0, minimo, ...planos.map((p) => p.seg))
      let atual: string[] = []
      const fechar = () => {
        if (atual.length) planos.push({ seg: ++contador, ids: atual })
        atual = []
      }
      for (const g of grupos) {
        if (atual.length + g.length > maximo) fechar()
        atual.push(...g.map((l) => l.id))
      }
      fechar()
      config.put(planos, CHAVE_PLANOS)
      config.put(contador, CHAVE_SEGMENTO)
    })
    return () => planos.sort((a, b) => a.seg - b.seg)
  })
}

/** As linhas destes ids que existem, em ordem (seq, n). */
export function linhasDosIds(ids: readonly string[]): Promise<LinhaDeEvento[]> {
  return emTransacao([LOJA_EVENTOS], 'readonly', (tx) => {
    const loja = tx.objectStore(LOJA_EVENTOS)
    const reqs = ids.map((id) => loja.get(id))
    return () =>
      reqs
        .map((r) => r.result as LinhaDeEvento | undefined)
        .filter((l): l is LinhaDeEvento => l !== undefined)
        .sort((a, b) => a.seq - b.seq || a.n - b.n)
  })
}

/**
 * Depois da resposta do Dropbox, numa só transação: as linhas do plano ficam enviadas (com o número do
 * segmento), o plano sai da lista e o segmento conta como lido deste aparelho.
 */
export async function marcarSegmentoEnviado(plano: Plano, aparelho: string, maiorSeq: number): Promise<void> {
  await emTransacao([LOJA_CONFIG, LOJA_EVENTOS], 'readwrite', (tx, abortar) => {
    const config = tx.objectStore(LOJA_CONFIG)
    const eventos = tx.objectStore(LOJA_EVENTOS)
    for (const id of plano.ids) {
      const req = eventos.get(id)
      req.onsuccess = seguro(abortar, () => {
        const l = req.result as LinhaDeEvento | undefined
        if (l && l.enviado === 0) eventos.put({ ...l, enviado: 1, segmento: plano.seg })
      })
    }
    const lerPlanosReq = config.get(CHAVE_PLANOS)
    lerPlanosReq.onsuccess = seguro(abortar, () => {
      const planos = ((lerPlanosReq.result as Plano[] | undefined) ?? []).filter((p) => p.seg !== plano.seg)
      config.put(planos, CHAVE_PLANOS)
    })
    const lerLidosReq = config.get(CHAVE_LIDOS)
    lerLidosReq.onsuccess = seguro(abortar, () => {
      const lidos: Lidos = { ...((lerLidosReq.result as Lidos | undefined) ?? {}) }
      const l = lidos[aparelho] ?? leituraVazia()
      lidos[aparelho] = compactar({ ...l, alem: { ...l.alem, [String(plano.seg)]: maiorSeq } })
      config.put(lidos, CHAVE_LIDOS)
    })
    return () => undefined
  })
}

/** Tira um plano (o número ficou ocupado no Dropbox por outro conteúdo): os eventos dele voltam a ficar livres. */
export async function descartarPlano(seg: number): Promise<void> {
  await atualizarConfig<Plano[]>(CHAVE_PLANOS, (atual) => (atual ?? []).filter((p) => p.seg !== seg))
}

/**
 * Linhas locais não enviadas cujo conteúdo é idêntico a uma cópia que o Dropbox já tem (num segmento
 * deste aparelho que ele não conhecia): ficam enviadas (no segmento onde a cópia está) e saem dos planos.
 * Sem isto elas ficariam para sempre em "N por enviar". Devolve quantas.
 */
export async function marcarComoEnviadosPorCopia(copias: readonly { id: string; seg: number }[]): Promise<number> {
  if (copias.length === 0) return 0
  return emTransacao([LOJA_CONFIG, LOJA_EVENTOS], 'readwrite', (tx, abortar) => {
    const config = tx.objectStore(LOJA_CONFIG)
    const eventos = tx.objectStore(LOJA_EVENTOS)
    let quantos = 0
    const marcados = new Set<string>()
    const reqs = copias.map((c) => eventos.get(c.id))
    reqs.forEach((req, i) => {
      req.onsuccess = seguro(abortar, () => {
        const l = req.result as LinhaDeEvento | undefined
        if (!l || l.enviado !== 0) return
        eventos.put({ ...l, enviado: 1, segmento: copias[i]!.seg })
        marcados.add(l.id)
        quantos++
      })
    })
    const lerPlanosReq = config.get(CHAVE_PLANOS)
    // Pedida depois das leituras acima: quando termina, `marcados` já está completo.
    lerPlanosReq.onsuccess = seguro(abortar, () => {
      const planos = ((lerPlanosReq.result as Plano[] | undefined) ?? [])
        .map((p) => ({ seg: p.seg, ids: p.ids.filter((id) => !marcados.has(id)) }))
        .filter((p) => p.ids.length > 0)
      config.put(planos, CHAVE_PLANOS)
    })
    return () => quantos
  })
}

/**
 * Dá um id novo (seq e hlc novos, acima de `acima`) aos eventos locais destes ids que ainda não subiram: o
 * Dropbox já tem outros eventos com esses ids (o banco deste aparelho voltou de uma cópia antiga). O
 * conteúdo (tipo, reg, op, campos) não muda; os eventos da mesma gravação continuam juntos. Um plano que
 * tinha algum deles é desfeito (os eventos dele voltam a ficar livres e entram em planos novos, com outros
 * números): o conteúdo local nunca é trocado pela cópia de fora. Devolve quantos foram renumerados.
 */
export async function renumerarLocais(ids: readonly string[], acima: { seq: number; hlc: Hlc | null }): Promise<number> {
  if (ids.length === 0) return 0
  const { id: aparelho } = await aparelhoAtual()
  return emTransacao([LOJA_CONFIG, LOJA_EVENTOS], 'readwrite', (tx, abortar) => {
    const config = tx.objectStore(LOJA_CONFIG)
    const eventos = tx.objectStore(LOJA_EVENTOS)
    const lerSeq = config.get(CHAVE_SEQ)
    const lerHlc = config.get(CHAVE_HLC)
    const lerPlanosReq = config.get(CHAVE_PLANOS)
    const reqs = ids.map((id) => eventos.get(id))
    let quantos = 0
    reqs[reqs.length - 1]!.onsuccess = seguro(abortar, () => {
      const linhas = reqs
        .map((r) => r.result as LinhaDeEvento | undefined)
        .filter((l): l is LinhaDeEvento => !!l && l.enviado === 0 && l.aparelho === aparelho)
        .sort((a, b) => a.seq - b.seq || a.n - b.n)
      const renumerar = new Set(linhas.map((l) => l.id))
      const planos = ((lerPlanosReq.result as Plano[] | undefined) ?? []).filter((p) => !p.ids.some((id) => renumerar.has(id)))
      if (planos.length !== ((lerPlanosReq.result as Plano[] | undefined) ?? []).length) config.put(planos, CHAVE_PLANOS)
      let seq = Math.max((lerSeq.result as number | undefined) ?? 0, acima.seq)
      let hlc = maiorHlc((lerHlc.result as Hlc | undefined) ?? null, acima.hlc)
      let seqAnterior: number | null = null
      for (const l of linhas) {
        if (l.seq !== seqAnterior) {
          seq++
          seqAnterior = l.seq
        }
        hlc = novoHlc(hlc, Date.now(), aparelho)
        const e = l.evento
        const novo = montarEvento({ aparelho, seq, n: l.n, hlc, tipo: e.tipo, reg: e.reg, op: e.op, campos: e.campos })
        eventos.delete(l.id)
        eventos.add({ id: novo.id, aparelho, seq, n: l.n, enviado: 0, evento: novo })
        quantos++
      }
      if (quantos) {
        config.put(seq, CHAVE_SEQ)
        config.put(hlc, CHAVE_HLC)
      }
    })
    return () => quantos
  })
}

/**
 * O Dropbox tem, com o id DESTE aparelho, conteúdo que ele nunca produziu (um perfil clonado, um banco
 * restaurado): o aparelho passa a ter um id novo. Numa só transação:
 * - o id novo (e o mesmo nome) é gravado;
 * - todos os eventos locais ainda não enviados são REcarimbados com o id novo (mesmo seq, n, reg, op e
 *   campos; o hlc troca só o sufixo do aparelho): nenhum evento por enviar se perde;
 * - os planos de segmento e o contador de segmentos recomeçam (a pasta do id novo é vazia);
 * - os eventos já enviados com o id antigo ficam como estão (agora são "de outro aparelho"; nunca sobem de novo).
 * Se outra aba já trocou, não faz nada. Devolve o id de antes e o de agora.
 */
export async function trocarDeAparelho(): Promise<{ de: string; para: string; reestampados: number }> {
  const anterior = await aparelhoAtual()
  const novoId = gerarId()
  const r = await trocar(anterior, novoId)
  if (r.para !== r.de) avisarTrocaDeAparelho()
  return r
}

function trocar(anterior: Aparelho, novoId: string): Promise<{ de: string; para: string; reestampados: number }> {
  return emTransacao([LOJA_CONFIG, LOJA_EVENTOS], 'readwrite', (tx, abortar) => {
    const config = tx.objectStore(LOJA_CONFIG)
    const eventos = tx.objectStore(LOJA_EVENTOS)
    const lerAparelho = config.get(CHAVE_DO_APARELHO)
    const lerLinhas = eventos.index('enviado').getAll(0)
    let resultado = { de: anterior.id, para: anterior.id, reestampados: 0 }
    lerLinhas.onsuccess = seguro(abortar, () => {
      const atual = lerAparelho.result as Aparelho
      if (atual.id !== anterior.id) {
        resultado = { de: anterior.id, para: atual.id, reestampados: 0 }
        return
      }
      const linhas = (lerLinhas.result as LinhaDeEvento[]).filter((l) => l.aparelho === anterior.id)
      for (const l of linhas) {
        const e = l.evento
        const hlc = e.hlc.replace(/-[a-z0-9]{8}$/, `-${novoId}`)
        const novo = montarEvento({ aparelho: novoId, seq: l.seq, n: l.n, hlc, tipo: e.tipo, reg: e.reg, op: e.op, campos: e.campos })
        eventos.delete(l.id)
        eventos.add({ id: novo.id, aparelho: novoId, seq: l.seq, n: l.n, enviado: 0, evento: novo })
      }
      config.put({ id: novoId, nome: atual.nome } satisfies Aparelho, CHAVE_DO_APARELHO)
      config.put([], CHAVE_PLANOS)
      config.put(0, CHAVE_SEGMENTO)
      resultado = { de: anterior.id, para: novoId, reestampados: linhas.length }
    })
    return () => resultado
  })
}

/**
 * Apaga as linhas DESTE aparelho já enviadas que a base guardada cobre: seq ≤ ate[aparelho], segmento ≤
 * segmentos[aparelho] E o id do evento citado pela base guardada (`citados`: idsDaBase(lerBase())). Uma
 * linha que a base não cita nunca é apagada, mesmo dentro da cobertura: a cobertura pode ter sido publicada
 * por outro aparelho que não conseguiu ler um segmento (a base dele não tem aqueles eventos), e a única cópia
 * pode ser esta. Nunca uma não enviada. Devolve quantas.
 */
export function podarProprios(aparelho: string, cobertura: Cobertura, citados: ReadonlySet<string>): Promise<number> {
  const ate = cobertura.ate[aparelho] ?? 0
  const seg = cobertura.segmentos[aparelho] ?? 0
  if (ate <= 0 || seg <= 0 || citados.size === 0) return Promise.resolve(0)
  return emTransacao([LOJA_EVENTOS], 'readwrite', (tx, abortar) => {
    const loja = tx.objectStore(LOJA_EVENTOS)
    const req = loja.index('aparelho_seq').openCursor(IDBKeyRange.bound([aparelho, 0], [aparelho, ate]))
    let quantos = 0
    req.onsuccess = seguro(abortar, () => {
      const cursor = req.result
      if (!cursor) return
      const l = cursor.value as LinhaDeEvento
      if (l.enviado === 1 && typeof l.segmento === 'number' && l.segmento <= seg && citados.has(l.id)) {
        cursor.delete()
        quantos++
      }
      cursor.continue()
    })
    return () => quantos
  })
}
