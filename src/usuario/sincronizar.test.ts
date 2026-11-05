/**
 * A sincronização da camada do usuário pelo Dropbox, com dois (ou três) aparelhos simulados no mesmo
 * processo: cada um com o próprio IndexedDB e os próprios módulos, todos ligados ao mesmo Dropbox em
 * memória. Sem rede.
 */
import { novoAparelho, type AparelhoSimulado } from '../../tests/suporte/aparelhoSimulado'
import { DropboxEmMemoria } from '../../tests/suporte/dropboxEmMemoria'
import { validarEvento } from './eventos'

const DIA = 24 * 60 * 60 * 1000
const ESTADO = 'usuario/estado.json'

let nuvem: DropboxEmMemoria

beforeEach(() => {
  // No Node o BroadcastChannel é um só para todos os grafos de módulos: levaria os eventos de um aparelho
  // ao outro sem passar pelo Dropbox.
  vi.stubGlobal('BroadcastChannel', undefined)
  nuvem = new DropboxEmMemoria()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const segmento = (ap: string, n: number) => `usuario/diario/${ap}/${String(n).padStart(6, '0')}.jsonl`
const linhas = (caminho: string) => nuvem.texto(caminho).split('\n').filter(Boolean)
const idsNoSegmento = (caminho: string) => linhas(caminho).map((l) => (JSON.parse(l) as { id: string }).id)
const sincronizar = (ap: AparelhoSimulado, opcoes: { agora?: () => number } = {}) => ap.sync.sincronizar(ap.escrita, { motivo: 'manual', ...opcoes })
const canonico = (ap: AparelhoSimulado) => ap.fusao.estadoCanonico(ap.estado.estadoAtual())
const nota = (ap: AparelhoSimulado, reg: string, texto: string) => ap.estado.registrar('nota', reg, 'alterar', { texto })
const texto = (ap: AparelhoSimulado, reg: string) => ap.estado.estadoAtual().registro('nota', reg)?.campos.texto

/** Uma linha de evento válida de `ap`, como outro aparelho a gravaria. */
function linhaDe(ap: string, seq: number, campos: Record<string, unknown> = { texto: `de ${ap} ${seq}` }, reg = `NT-${ap}-1`) {
  return JSON.stringify({
    v: 1,
    id: `${ap}-${seq}-0`,
    hlc: `${String(1_790_000_000_000 + seq * 1000).padStart(13, '0')}-0000-${ap}`,
    aparelho: ap,
    tipo: 'nota',
    reg,
    op: 'alterar',
    campos,
  })
}

describe('sincronizar: o ciclo entre dois aparelhos', () => {
  it('A cria e sincroniza; B sincroniza e vê; B edita e A vê', async () => {
    const A = await novoAparelho(nuvem, 'Mac')
    const B = await novoAparelho(nuvem, 'iPhone')
    expect(A.id).not.toBe(B.id)

    await nota(A, 'NT-a-1', 'primeira leitura')
    expect(await A.sync.contarPorEnviar()).toBe(1)
    const ra = await sincronizar(A)
    expect(ra.enviados).toBe(1)
    expect(ra.segmentosEnviados).toEqual([segmento(A.id, 1)])
    expect(await A.sync.contarPorEnviar()).toBe(0)
    expect(await A.armazem.eventosLocaisNaoEnviados()).toEqual([])

    const rb = await sincronizar(B)
    expect(rb.recebidos).toBe(1)
    expect(rb.porAparelho).toEqual([{ aparelho: A.id, nome: 'Mac', eventos: 1 }])
    expect(texto(B, 'NT-a-1')).toBe('primeira leitura')

    await nota(B, 'NT-a-1', 'corrigida no celular')
    await sincronizar(B)
    const ra2 = await sincronizar(A)
    expect(ra2.porAparelho).toEqual([{ aparelho: B.id, nome: 'iPhone', eventos: 1 }])
    expect(texto(A, 'NT-a-1')).toBe('corrigida no celular')
    expect(canonico(A)).toBe(canonico(B))
  })

  it('o segmento é JSONL (UTF-8) dos eventos validados em ordem (seq, n), com o nome de 6 dígitos', async () => {
    const A = await novoAparelho(nuvem)
    await nota(A, 'NT-x-1', 'um')
    await A.estado.registrarVarios([
      { tipo: 'nota', reg: 'NT-x-2', op: 'criar', campos: { texto: 'Maḥteṣ' } },
      { tipo: 'colecao', reg: 'CO-x-1', op: 'criar', campos: { nome: 'Remates' } },
    ])
    await sincronizar(A)
    const caminho = segmento(A.id, 1)
    expect(nuvem.texto(caminho).endsWith('\n')).toBe(true)
    expect(idsNoSegmento(caminho)).toEqual([`${A.id}-1-0`, `${A.id}-2-0`, `${A.id}-2-1`])
    for (const l of linhas(caminho)) expect(validarEvento(JSON.parse(l)).ok).toBe(true)
    expect(nuvem.texto(caminho)).toContain('Maḥteṣ')
  })

  it('o nome do aparelho vai para usuario/aparelhos/<id>.json (cada um grava só o seu) quando há o que enviar', async () => {
    const A = await novoAparelho(nuvem, 'MacBook')
    await sincronizar(A)
    // Nada enviado ainda: o nome não sobe à toa.
    expect(nuvem.caminhos('usuario/aparelhos/')).toEqual([])
    await nota(A, 'NT-a-1', 'x')
    await sincronizar(A)
    const arquivo = nuvem.json<{ id: string; nome: string; atualizadoEm: string }>(`usuario/aparelhos/${A.id}.json`)
    expect(arquivo).toEqual({ id: A.id, nome: 'MacBook', atualizadoEm: expect.any(String) })
    // Trocar o nome sobe de novo (sobrescrita condicional ao rev lido).
    await A.aparelho.renomearAparelho('Mac do escritório')
    await sincronizar(A)
    expect(nuvem.json<{ nome: string }>(`usuario/aparelhos/${A.id}.json`).nome).toBe('Mac do escritório')
    expect(nuvem.caminhos('usuario/aparelhos/')).toEqual([`usuario/aparelhos/${A.id}.json`])
  })

  it('só escreve em usuario/, nunca reescreve um segmento e não toca nos dos outros aparelhos', async () => {
    const A = await novoAparelho(nuvem)
    const B = await novoAparelho(nuvem)
    await nota(B, 'NT-b-1', 'b')
    await sincronizar(B)
    const doB = nuvem.texto(segmento(B.id, 1))
    const revDoB = nuvem.rev(segmento(B.id, 1))
    for (let i = 0; i < 3; i++) {
      await nota(A, 'NT-a-1', `a${i}`)
      await sincronizar(A)
    }
    expect(nuvem.caminhos().every((c) => c.startsWith('usuario/'))).toBe(true)
    expect(nuvem.texto(segmento(B.id, 1))).toBe(doB)
    expect(nuvem.rev(segmento(B.id, 1))).toBe(revDoB)
    for (let n = 1; n <= 3; n++) expect(nuvem.enviosOk(segmento(A.id, n))).toBe(1)
    const envios = nuvem.chamadas.filter((c) => c.op === 'enviar').map((c) => c.caminho)
    expect(envios.every((c) => c.startsWith('usuario/'))).toBe(true)
  })
})

describe('Foco 2: envio interrompido', () => {
  it('falha no 2º segmento: o 1º fica marcado; o 2º sobe depois com o mesmo nome e conteúdo, sem duplicar', async () => {
    const A = await novoAparelho(nuvem)
    // 6 gravações de 100 eventos: 500 no 1º segmento, 100 no 2º (uma gravação nunca é partida).
    for (let g = 0; g < 6; g++) {
      await A.estado.registrarVarios(Array.from({ length: 100 }, (_, i) => ({ tipo: 'nota' as const, reg: `NT-a-${g}`, op: 'alterar' as const, campos: { [`c${i}`]: i } })))
    }
    let falhas = 0
    nuvem.antes = (op, caminho) => {
      if (op === 'enviar' && caminho === segmento(A.id, 2) && falhas++ === 0) throw new (class extends Error {
        name = 'ErroDeRede'
      })()
    }
    await expect(sincronizar(A)).rejects.toThrow()
    expect(nuvem.caminhos(`usuario/diario/${A.id}/`)).toEqual([segmento(A.id, 1)])
    expect(linhas(segmento(A.id, 1))).toHaveLength(500)
    expect(await A.sync.contarPorEnviar()).toBe(100)

    // Uma gravação nova entre as tentativas vai para o 3º segmento: o 2º continua igual.
    await nota(A, 'NT-a-9', 'depois da queda')
    nuvem.antes = null
    const r = await sincronizar(A)
    expect(r.segmentosEnviados).toEqual([segmento(A.id, 2), segmento(A.id, 3)])
    expect(linhas(segmento(A.id, 2))).toHaveLength(100)
    expect(idsNoSegmento(segmento(A.id, 3))).toEqual([`${A.id}-7-0`])
    expect(await A.sync.contarPorEnviar()).toBe(0)
    const todos = [1, 2, 3].flatMap((n) => idsNoSegmento(segmento(A.id, n)))
    expect(new Set(todos).size).toBe(todos.length)
    expect(todos).toHaveLength(601)
  })

  it('app fechado entre o envio e a marcação: o reenvio do mesmo conteúdo é aceito e marca', async () => {
    let A = await novoAparelho(nuvem)
    await nota(A, 'NT-a-1', 'um')
    await nota(A, 'NT-a-2', 'dois')
    nuvem.depois = (op, caminho) => {
      if (op === 'enviar' && caminho.includes('/diario/')) throw new Error('o app fechou')
    }
    await expect(sincronizar(A)).rejects.toThrow('o app fechou')
    expect(nuvem.caminhos(`usuario/diario/${A.id}/`)).toEqual([segmento(A.id, 1)])
    expect(await A.sync.contarPorEnviar()).toBe(2)
    const conteudo = nuvem.texto(segmento(A.id, 1))

    nuvem.depois = null
    A = await A.reabrir()
    await nota(A, 'NT-a-3', 'três, depois de reabrir')
    const r = await sincronizar(A)
    expect(r.segmentosEnviados).toEqual([segmento(A.id, 1), segmento(A.id, 2)])
    expect(nuvem.texto(segmento(A.id, 1))).toBe(conteudo)
    expect(nuvem.enviosOk(segmento(A.id, 1))).toBe(2)
    expect(await A.sync.contarPorEnviar()).toBe(0)

    const B = await novoAparelho(nuvem)
    await sincronizar(B)
    expect(texto(B, 'NT-a-1')).toBe('um')
    expect(texto(B, 'NT-a-3')).toBe('três, depois de reabrir')
  })

  it('um segmento malformado ou parcial de outro aparelho é ignorado e reportado, sem impedir os demais', async () => {
    const A = await novoAparelho(nuvem)
    const X = 'xxxxxxxx'
    nuvem.colocar(segmento(X, 1), `${linhaDe(X, 1)}\n`)
    nuvem.colocar(segmento(X, 2), '{isto não é json\n\u0000\u0001')
    nuvem.colocar(segmento(X, 3), `${linhaDe(X, 3, { texto: 'antes do corte' }, `NT-${X}-3`)}\n{"v":1,"id":"${X}-4-0","hl`)
    nuvem.colocar(segmento(X, 4), new Uint8Array([0xff, 0xfe, 0x00, 0x80]))
    nuvem.colocar(segmento(X, 5), `${linhaDe('yyyyyyyy', 5)}\n${linhaDe(X, 5, { texto: 'o último' }, `NT-${X}-5`)}\n`)
    const r = await sincronizar(A)
    expect(texto(A, `NT-${X}-1`)).toBe(`de ${X} 1`)
    expect(texto(A, `NT-${X}-3`)).toBe('antes do corte')
    expect(texto(A, `NT-${X}-5`)).toBe('o último')
    expect(r.malformados.map((m) => m.caminho)).toEqual([segmento(X, 2), segmento(X, 3), segmento(X, 4), segmento(X, 5)])
    for (const m of r.malformados) expect(m.motivo).toMatch(/\S/)
    // O evento de outro aparelho dentro do diário de X não entra.
    expect(A.estado.estadoAtual().registro('nota', 'NT-yyyyyyyy-1')).toBeUndefined()
    // Sem mudança no arquivo, a próxima rodada não baixa de novo, mas continua reportando o que não leu por inteiro.
    const antes = nuvem.baixados(A.id).length
    const r2 = await sincronizar(A)
    expect(nuvem.baixados(A.id).length).toBe(antes)
    expect(r2.malformados.map((m) => m.caminho)).toEqual(r.malformados.map((m) => m.caminho))
  })

  it('um segmento que ainda não apareceu (lacuna) não é pulado: os seguintes entram e ele é lido quando aparecer', async () => {
    const A = await novoAparelho(nuvem)
    const X = 'xxxxxxxx'
    nuvem.colocar(segmento(X, 1), `${linhaDe(X, 1, { texto: 's1' }, 'NT-1')}\n`)
    nuvem.colocar(segmento(X, 3), `${linhaDe(X, 3, { texto: 's3' }, 'NT-3')}\n`)
    const r = await sincronizar(A)
    expect(r.faltando).toEqual([{ aparelho: X, segmento: 2 }])
    expect(texto(A, 'NT-1')).toBe('s1')
    expect(texto(A, 'NT-3')).toBe('s3')
    nuvem.colocar(segmento(X, 2), `${linhaDe(X, 2, { texto: 's2' }, 'NT-2')}\n`)
    const r2 = await sincronizar(A)
    expect(r2.faltando).toEqual([])
    expect(texto(A, 'NT-2')).toBe('s2')
    expect(nuvem.baixados(A.id).filter((c) => c === segmento(X, 3))).toHaveLength(1)
  })

  it('sem internet: rejeita com ErroDeRede, nada é marcado nem perdido; com a rede de volta tudo sobe', async () => {
    const A = await novoAparelho(nuvem)
    await nota(A, 'NT-a-1', 'offline 1')
    await nota(A, 'NT-a-2', 'offline 2')
    nuvem.offline = true
    await expect(sincronizar(A)).rejects.toMatchObject({ name: 'ErroDeRede' })
    expect(await A.sync.contarPorEnviar()).toBe(2)
    expect(texto(A, 'NT-a-2')).toBe('offline 2')
    nuvem.offline = false
    const r = await sincronizar(A)
    expect(r.enviados).toBe(2)
    expect(await A.sync.contarPorEnviar()).toBe(0)
  })

  it('um segmento deste aparelho que já está no Dropbox (banco restaurado de uma cópia antiga) não é sobrescrito; o seu conteúdo entra', async () => {
    const A = await novoAparelho(nuvem)
    // O Dropbox já tem um 1º segmento de A que este IndexedDB não conhece; o evento dele tem o mesmo id
    // (A-1-0) que a próxima gravação local vai receber.
    nuvem.colocar(segmento(A.id, 1), `${linhaDe(A.id, 1, { texto: 'de antes' }, 'NT-antigo')}\n`)
    const original = nuvem.texto(segmento(A.id, 1))
    const local = await nota(A, 'NT-a-1', 'novo')
    expect(local.id).toBe(`${A.id}-1-0`)
    const r = await sincronizar(A)
    expect(nuvem.texto(segmento(A.id, 1))).toBe(original)
    expect(r.segmentosEnviados).toEqual([segmento(A.id, 2)])
    expect(r.renumerados).toBe(1)
    // Nada se perde: a cópia antiga entra e o evento local, ainda não enviado, ganhou um id novo.
    expect(texto(A, 'NT-antigo')).toBe('de antes')
    expect(texto(A, 'NT-a-1')).toBe('novo')
    expect(idsNoSegmento(segmento(A.id, 2))).toEqual([`${A.id}-2-0`])
    await nota(A, 'NT-a-1', 'mais um')
    await sincronizar(A)
    expect(idsNoSegmento(segmento(A.id, 3))).toEqual([`${A.id}-3-0`])
    const B = await novoAparelho(nuvem)
    await sincronizar(B)
    expect(texto(B, 'NT-antigo')).toBe('de antes')
    expect(texto(B, 'NT-a-1')).toBe('mais um')
    expect(B.estado.estadoAtual().historico('NT-a-1', 'texto', 'nota').map((h) => h.valor)).toEqual(['novo'])
  })
})

describe('consolidação (estado.json)', () => {
  type Arquivo = { v: number; base: { v: number; registros: unknown[] }; ate: Record<string, number>; segmentos: Record<string, number> }

  it('a primeira sincronização com segmentos grava estado.json {v, base, ate, segmentos} (sem rev: só se ainda não existe)', async () => {
    const A = await novoAparelho(nuvem)
    await nota(A, 'NT-a-1', 'um')
    await nota(A, 'NT-a-2', 'dois')
    const r = await sincronizar(A)
    expect(r.consolidacao).toBe('gravada')
    const e = nuvem.json<Arquivo>(ESTADO)
    expect(Object.keys(e).sort()).toEqual(['ate', 'base', 'segmentos', 'v'])
    expect(e.v).toBe(1)
    expect(e.base.registros).toHaveLength(2)
    expect(e.ate).toEqual({ [A.id]: 2 })
    expect(e.segmentos).toEqual({ [A.id]: 1 })
  })

  it('consolida de novo com mais de 20 segmentos novos ou uma vez por dia; senão, não', async () => {
    const A = await novoAparelho(nuvem)
    let agora = Date.now()
    const relogio = () => agora
    await nota(A, 'NT-a-1', '0')
    await sincronizar(A, { agora: relogio })
    const rev1 = nuvem.rev(ESTADO)
    for (let i = 1; i <= 20; i++) {
      await nota(A, 'NT-a-1', String(i))
      const r = await sincronizar(A, { agora: relogio })
      expect(r.consolidacao).toBeNull()
    }
    expect(nuvem.rev(ESTADO)).toBe(rev1)
    await nota(A, 'NT-a-1', '21')
    expect((await sincronizar(A, { agora: relogio })).consolidacao).toBe('gravada')
    expect(nuvem.json<Arquivo>(ESTADO).segmentos).toEqual({ [A.id]: 22 })

    // Um segmento novo só: no mesmo dia, nada; um dia depois, consolida.
    await nota(A, 'NT-a-1', '22')
    expect((await sincronizar(A, { agora: relogio })).consolidacao).toBeNull()
    agora += DIA + 1
    expect((await sincronizar(A, { agora: relogio })).consolidacao).toBe('gravada')
    // Sem nada novo, nem um dia depois.
    agora += 2 * DIA
    expect((await sincronizar(A, { agora: relogio })).consolidacao).toBeNull()
  })

  it('consolidação concorrente: os dois tentam, só um grava, o outro relê e não grava; os estados ficam iguais', async () => {
    const A = await novoAparelho(nuvem)
    const B = await novoAparelho(nuvem)
    await nota(A, 'NT-a-1', 'de A')
    await nota(B, 'NT-b-1', 'de B')
    let soltarA!: () => void
    let aEsperando!: () => void
    const aChegou = new Promise<void>((ok) => (aEsperando = ok))
    nuvem.antes = (op, caminho, quem) => {
      if (op === 'enviar' && caminho === ESTADO && quem === A.id) {
        aEsperando()
        return new Promise<void>((ok) => (soltarA = ok))
      }
    }
    const pa = sincronizar(A)
    await aChegou
    const rb = await sincronizar(B)
    expect(rb.consolidacao).toBe('gravada')
    const revDeB = nuvem.rev(ESTADO)
    soltarA()
    const ra = await pa
    expect(ra.consolidacao).toBe('outro-aparelho')
    expect(nuvem.rev(ESTADO)).toBe(revDeB)
    expect(nuvem.enviosOk(ESTADO)).toBe(1)
    // A ainda não tinha lido o segmento de B, mas recebeu a base que B gravou.
    expect(texto(A, 'NT-b-1')).toBe('de B')
    expect(canonico(A)).toBe(canonico(B))
    await sincronizar(A)
    await sincronizar(B)
    expect(canonico(A)).toBe(canonico(B))
  })

  it('um aparelho novo baixa estado.json primeiro e só os segmentos depois de segmentos[aparelho]', async () => {
    const A = await novoAparelho(nuvem, 'Mac')
    let agora = Date.now()
    const relogio = () => agora
    for (let i = 1; i <= 3; i++) {
      await nota(A, `NT-a-${i}`, `n${i}`)
      await sincronizar(A, { agora: relogio })
    }
    agora += DIA + 1
    await nota(A, 'NT-a-4', 'n4')
    expect((await sincronizar(A, { agora: relogio })).consolidacao).toBe('gravada')
    expect(nuvem.json<Arquivo>(ESTADO).segmentos).toEqual({ [A.id]: 4 })
    await nota(A, 'NT-a-5', 'n5')
    expect((await sincronizar(A, { agora: relogio })).consolidacao).toBeNull()

    const C = await novoAparelho(nuvem)
    const r = await sincronizar(C, { agora: relogio })
    expect(r.estadoBaixado).toBe(true)
    expect(nuvem.baixados(C.id).filter((c) => c.includes('/diario/') || c === ESTADO)).toEqual([ESTADO, segmento(A.id, 5)])
    for (let i = 1; i <= 5; i++) expect(texto(C, `NT-a-${i}`)).toBe(`n${i}`)
    expect(canonico(C)).toBe(canonico(A))
  })

  it('poda os próprios eventos enviados que a base cobre, nunca os não enviados; o estado não muda, nem ao reabrir', async () => {
    let A = await novoAparelho(nuvem)
    await nota(A, 'NT-a-1', 'um')
    await nota(A, 'NT-a-2', 'dois')
    // Um evento gravado no meio da sincronização (depois do envio, antes da consolidação) fica sem enviar.
    nuvem.antes = async (op, caminho) => {
      if (op === 'enviar' && caminho === ESTADO) {
        nuvem.antes = null
        await nota(A, 'NT-a-3', 'durante')
      }
    }
    const antes = new Set((await A.armazem.todosEventos()).map((e) => e.id))
    const r = await sincronizar(A)
    expect(r.consolidacao).toBe('gravada')
    expect(r.podados).toBe(2)
    const restantes = await A.armazem.todosEventos()
    expect(restantes.map((e) => e.reg)).toEqual(['NT-a-3'])
    expect(await A.sync.contarPorEnviar()).toBe(1)
    expect([...antes].every((id) => !restantes.some((e) => e.id === id))).toBe(true)
    const canonicoAntes = canonico(A)
    expect(texto(A, 'NT-a-1')).toBe('um')
    A = await A.reabrir()
    expect(canonico(A)).toBe(canonicoAntes)
    expect(texto(A, 'NT-a-3')).toBe('durante')
    // O podado sobe? Não: já está no Dropbox. O que ficou sobe na próxima.
    const r2 = await sincronizar(A)
    expect(r2.enviados).toBe(1)
  })

  it('um estado.json malformado é reportado e NUNCA regravado; os segmentos entram', async () => {
    const B = await novoAparelho(nuvem)
    await nota(B, 'NT-b-1', 'b')
    await sincronizar(B)
    const ruim = '{"v":1,"base":"nada disso"}'
    nuvem.colocar(ESTADO, ruim)
    const rev = nuvem.rev(ESTADO)
    const A = await novoAparelho(nuvem)
    const r = await sincronizar(A, { agora: () => Date.now() + 3 * DIA })
    expect(r.malformados.map((m) => m.caminho)).toContain(ESTADO)
    expect(texto(A, 'NT-b-1')).toBe('b')
    expect(r.consolidacao).toBeNull()
    expect(nuvem.texto(ESTADO)).toBe(ruim)
    expect(nuvem.rev(ESTADO)).toBe(rev)
    // Nas rodadas seguintes continua reportado, sem baixar de novo, e continua sem ser regravado.
    const baixados = nuvem.baixados(A.id).filter((c) => c === ESTADO).length
    const r2 = await sincronizar(A, { agora: () => Date.now() + 6 * DIA })
    expect(r2.malformados.map((m) => m.caminho)).toEqual([ESTADO])
    expect(r2.consolidacao).toBeNull()
    expect(nuvem.baixados(A.id).filter((c) => c === ESTADO)).toHaveLength(baixados)
    expect(nuvem.rev(ESTADO)).toBe(rev)
  })

  it('um estado.json de versão mais nova (v 2, de outro aparelho) não é tocado: reporta "versão mais nova do app" e não consolida', async () => {
    const A = await novoAparelho(nuvem)
    const dele = JSON.stringify({ v: 2, base: { v: 2, registros: [] }, ate: {}, segmentos: {}, novidade: 'de um app mais novo' })
    nuvem.colocar(ESTADO, dele)
    const rev = nuvem.rev(ESTADO)
    await nota(A, 'NT-a-1', 'um')
    const r = await sincronizar(A)
    expect(r.enviados).toBe(1)
    expect(r.consolidacao).toBeNull()
    expect(r.malformados).toEqual([{ caminho: ESTADO, motivo: expect.stringContaining('versão mais nova do app em outro aparelho') }])
    // Ilegível por inteiro não é "lido em parte" (o aviso da tela é outro).
    expect(r.estadoLidoEmParte).toBe(false)
    expect(nuvem.texto(ESTADO)).toBe(dele)
    expect(nuvem.rev(ESTADO)).toBe(rev)
    expect(nuvem.enviosOk(ESTADO)).toBe(0)
    // A base do próprio app (v 1) com a base em v 2 também conta como versão mais nova.
    nuvem.colocar(ESTADO, JSON.stringify({ v: 1, base: { v: 2, registros: [] }, ate: {}, segmentos: {} }))
    await nota(A, 'NT-a-1', 'dois')
    const r2 = await sincronizar(A, { agora: () => Date.now() + 3 * DIA })
    expect(r2.malformados[0]!.motivo).toContain('versão mais nova')
    expect(r2.consolidacao).toBeNull()
    expect(nuvem.enviosOk(ESTADO)).toBe(0)
  })

  it('A-7: um estado.json com registros de um tipo que esta versão não conhece: o que ela lê entra, mas ela NUNCA o regrava (não apaga o que não entende)', async () => {
    const A = await novoAparelho(nuvem)
    const h = (n: number) => `${String(1_790_000_000_000 + n * 1000).padStart(13, '0')}-0000-zzzzzzzz`
    const conhecido = { tipo: 'nota', id: 'NT-zzzzzzzz-1', criadoEm: h(1), alteradoEm: h(1), exclusao: null, campos: { texto: [{ hlc: h(1), evento: 'zzzzzzzz-1-0', valor: 'nota de um app mais novo' }] } }
    const futuro = { tipo: 'mapa-mental', id: 'MM-zzzzzzzz-1', criadoEm: h(2), alteradoEm: h(2), exclusao: null, campos: { titulo: [{ hlc: h(2), evento: 'zzzzzzzz-1-1', valor: 'de um tipo novo' }] } }
    const dele = JSON.stringify({ v: 1, base: { v: 1, registros: [conhecido, futuro] }, ate: { zzzzzzzz: 1 }, segmentos: { zzzzzzzz: 1 } })
    nuvem.colocar(ESTADO, dele)
    const rev = nuvem.rev(ESTADO)
    await nota(A, 'NT-a-1', 'um')
    const r = await sincronizar(A)
    expect(texto(A, 'NT-zzzzzzzz-1')).toBe('nota de um app mais novo')
    expect(r.consolidacao).toBeNull()
    expect(r.estadoIlegivel).toContain('versão mais nova do app em outro aparelho')
    expect(r.malformados).toEqual([{ caminho: ESTADO, motivo: expect.stringContaining('1 registro que esta versão não conhece') }])
    // Mais tarde, com a consolidação diária devida e mais segmentos: continua sem regravar.
    for (let i = 0; i < 22; i++) {
      await nota(A, 'NT-a-1', `mais ${i}`)
      await sincronizar(A, { agora: () => Date.now() + 3 * DIA })
    }
    expect(nuvem.texto(ESTADO)).toBe(dele)
    expect(nuvem.rev(ESTADO)).toBe(rev)
    expect(nuvem.enviosOk(ESTADO)).toBe(0)
    // Quando o arquivo muda para um que esta versão lê inteiro, ela volta a consolidar.
    nuvem.colocar(ESTADO, JSON.stringify({ v: 1, base: { v: 1, registros: [conhecido] }, ate: { zzzzzzzz: 1 }, segmentos: { zzzzzzzz: 1 } }))
    await nota(A, 'NT-a-1', 'depois')
    const r2 = await sincronizar(A, { agora: () => Date.now() + 6 * DIA })
    expect(r2.estadoIlegivel).toBeNull()
    expect(r2.consolidacao).toBe('gravada')
  })

  // Revisão 1 da Tarefa 17a (I2). Antes, a versão velha adotava a cobertura do arquivo lido em parte e marcava os segmentos
  // dele como lidos: nunca os baixava, e um estado.json gravado depois (o arquivo apagado à mão) dizia cobri-los sem os
  // registros do tipo novo. Um aparelho novo, confiando na cobertura, nunca mais os leria.
  it('A-7: lido em parte, a cobertura NÃO é adotada: a versão velha lê os segmentos ela mesma, e um estado.json gravado depois não cobre o segmento com o registro que ela não conhece', async () => {
    const A = await novoAparelho(nuvem)
    const h = (n: number) => `${String(1_790_000_000_000 + n * 1000).padStart(13, '0')}-0000-zzzzzzzz`
    const conhecido = { tipo: 'nota', id: 'NT-zzzzzzzz-1', criadoEm: h(1), alteradoEm: h(1), exclusao: null, campos: { texto: [{ hlc: h(1), evento: 'zzzzzzzz-1-0', valor: 'nota de um app mais novo' }] } }
    const futuro = { tipo: 'mapa-mental', id: 'MM-zzzzzzzz-1', criadoEm: h(2), alteradoEm: h(2), exclusao: null, campos: { titulo: [{ hlc: h(2), evento: 'zzzzzzzz-1-1', valor: 'de um tipo novo' }] } }
    const linha = (id: string, hlc: string, tipo: string, reg: string, campos: Record<string, unknown>) => JSON.stringify({ v: 1, id, hlc, aparelho: 'zzzzzzzz', tipo, reg, op: 'criar', campos })
    const seg1 = segmento('zzzzzzzz', 1)
    nuvem.colocar(
      seg1,
      `${linha('zzzzzzzz-1-0', h(1), 'nota', 'NT-zzzzzzzz-1', { texto: 'nota de um app mais novo', alvoTipo: 'objeto', alvo: 'CA00001', rascunho: false })}\n${linha('zzzzzzzz-1-1', h(2), 'mapa-mental', 'MM-zzzzzzzz-1', { titulo: 'de um tipo novo' })}\n`,
    )
    nuvem.colocar(ESTADO, JSON.stringify({ v: 1, base: { v: 1, registros: [conhecido, futuro] }, ate: { zzzzzzzz: 1 }, segmentos: { zzzzzzzz: 1 } }))
    await nota(A, 'NT-a-1', 'um')
    const r1 = await sincronizar(A)
    expect(r1.consolidacao).toBeNull()
    expect(r1.estadoLidoEmParte).toBe(true)
    expect(r1.estadoSoIlegiveis).toBe(false) // há registro de um tipo que só a versão nova conhece
    // A versão velha baixou o segmento do outro aparelho (a cobertura do arquivo não vale para ela).
    expect(nuvem.baixados(A.id)).toContain(seg1)
    expect(texto(A, 'NT-zzzzzzzz-1')).toBe('nota de um app mais novo')
    // A pessoa apaga o estado.json (o que o aviso antigo sugeria) e a consolidação diária grava um novo.
    nuvem.arquivos.delete(ESTADO)
    await nota(A, 'NT-a-1', 'dois')
    const r2 = await sincronizar(A, { agora: () => Date.now() + 3 * DIA })
    expect(r2.consolidacao).toBe('gravada')
    expect(r2.estadoLidoEmParte).toBe(false)
    const novo = nuvem.json<{ base: { registros: { id: string }[] }; segmentos: Record<string, number> }>(ESTADO)
    expect(novo.base.registros.map((r) => r.id)).toContain('NT-zzzzzzzz-1')
    // O segmento com o registro que esta versão não conhece NÃO entra na cobertura.
    expect(novo.segmentos.zzzzzzzz ?? 0).toBe(0)
    // Um aparelho novo (instalado depois) lê esse segmento: nada fica de fora para ele.
    const C = await novoAparelho(nuvem)
    await sincronizar(C)
    expect(nuvem.baixados(C.id)).toContain(seg1)
    expect(texto(C, 'NT-zzzzzzzz-1')).toBe('nota de um app mais novo')
  })

  it('A-28: um estado.json com SÓ registros ilegíveis (nenhum de tipo novo) é lido em parte, mas diz que são só ilegíveis (apagar é seguro)', async () => {
    const A = await novoAparelho(nuvem)
    const h = `${String(1_790_000_000_000).padStart(13, '0')}-0000-zzzzzzzz`
    const conhecido = { tipo: 'nota', id: 'NT-zzzzzzzz-1', criadoEm: h, alteradoEm: h, exclusao: null, campos: { texto: [{ hlc: h, evento: 'zzzzzzzz-1-0', valor: 'uma nota' }] } }
    const estragado = { tipo: 'nota', id: 'NT-zzzzzzzz-2', campos: 'isto não é um objeto' }
    nuvem.colocar(ESTADO, JSON.stringify({ v: 1, base: { v: 1, registros: [conhecido, estragado] }, ate: {}, segmentos: {} }))
    await nota(A, 'NT-a-1', 'um')
    const r = await sincronizar(A)
    expect(r.estadoLidoEmParte).toBe(true)
    expect(r.estadoSoIlegiveis).toBe(true)
    expect(r.estadoIlegivel).toContain('1 registro ilegível')
    // um tipo que esta versão não conhece NÃO é «só ilegível»: apagar perderia o que a versão nova gravou
    expect(r.estadoIlegivel).not.toContain('versão mais nova')
  })

  it('A-7: lido em parte no conflito de consolidação (409): a cobertura do arquivo também não é adotada', async () => {
    const A = await novoAparelho(nuvem)
    const h = (n: number) => `${String(1_790_000_000_000 + n * 1000).padStart(13, '0')}-0000-zzzzzzzz`
    const futuro = { tipo: 'mapa-mental', id: 'MM-zzzzzzzz-1', criadoEm: h(2), alteradoEm: h(2), exclusao: null, campos: { titulo: [{ hlc: h(2), evento: 'zzzzzzzz-1-1', valor: 'de um tipo novo' }] } }
    const seg1 = segmento('zzzzzzzz', 1)
    await nota(A, 'NT-a-1', 'um')
    nuvem.antes = (op, caminho, quem) => {
      if (op === 'enviar' && caminho === ESTADO && quem === A.id) {
        nuvem.antes = null
        // Outro aparelho (versão nova) gravou antes: o segmento dele e um estado.json que o cobre, com um tipo novo.
        nuvem.colocar(seg1, `${linhaDe('zzzzzzzz', 1)}\n`)
        nuvem.colocar(ESTADO, JSON.stringify({ v: 1, base: { v: 1, registros: [futuro] }, ate: { zzzzzzzz: 1 }, segmentos: { zzzzzzzz: 1 } }))
      }
    }
    const r = await sincronizar(A)
    expect(r.consolidacao).toBe('outro-aparelho')
    expect(r.estadoLidoEmParte).toBe(true)
    // Na rodada seguinte, o segmento é baixado por esta versão (não foi marcado como lido pela cobertura do arquivo).
    const r2 = await sincronizar(A)
    expect(r2.estadoLidoEmParte).toBe(true)
    expect(nuvem.baixados(A.id)).toContain(seg1)
    expect(texto(A, 'NT-zzzzzzzz-1')).toBe('de zzzzzzzz 1')
  })

  it('A-7: um registro ilegível na base (hlc malformado) também segura a regravação, com o motivo próprio', async () => {
    const A = await novoAparelho(nuvem)
    const ruim = { tipo: 'nota', id: 'NT-zzzzzzzz-9', criadoEm: 'ontem', alteradoEm: 'ontem', exclusao: null, campos: {} }
    nuvem.colocar(ESTADO, JSON.stringify({ v: 1, base: { v: 1, registros: [ruim] }, ate: {}, segmentos: {} }))
    await nota(A, 'NT-a-1', 'um')
    const r = await sincronizar(A, { agora: () => Date.now() + 3 * DIA })
    expect(r.consolidacao).toBeNull()
    expect(r.malformados).toEqual([{ caminho: ESTADO, motivo: expect.stringContaining('1 registro ilegível') }])
    expect(nuvem.enviosOk(ESTADO)).toBe(0)
  })

  it('um estado.json acima de 64 MB não é baixado nem regravado: é reportado como grande demais', async () => {
    const A = await novoAparelho(nuvem)
    nuvem.colocar(ESTADO, new Uint8Array(64 * 1024 * 1024 + 1))
    await nota(A, 'NT-a-1', 'um')
    const r = await sincronizar(A)
    expect(r.malformados).toEqual([{ caminho: ESTADO, motivo: expect.stringContaining('grande demais') }])
    expect(nuvem.baixados(A.id)).not.toContain(ESTADO)
    expect(r.consolidacao).toBeNull()
    expect(nuvem.enviosOk(ESTADO)).toBe(0)
    expect(r.enviados).toBe(1)
  })
})

describe('mesmo campo nos dois aparelhos', () => {
  it('é reportado; vale o maior hlc e a outra versão fica no histórico', async () => {
    const A = await novoAparelho(nuvem, 'Mac')
    const B = await novoAparelho(nuvem, 'iPhone')
    const ea = await nota(A, 'NT-x-1', 'versão do Mac')
    const eb = await nota(B, 'NT-x-1', 'versão do iPhone')
    await sincronizar(A)
    const r = await sincronizar(B)
    const venceuB = eb.hlc > ea.hlc
    expect(r.mesmoCampo).toEqual([
      { tipo: 'nota', reg: 'NT-x-1', campo: 'texto', aparelho: A.id, nome: 'Mac', venceu: venceuB ? 'este' : 'outro', hlcDeste: eb.hlc, hlcDoOutro: ea.hlc },
    ])
    const vencedor = venceuB ? 'versão do iPhone' : 'versão do Mac'
    const perdedor = venceuB ? 'versão do Mac' : 'versão do iPhone'
    expect(texto(B, 'NT-x-1')).toBe(vencedor)
    expect(B.estado.estadoAtual().historico('NT-x-1', 'texto', 'nota').map((h) => h.valor)).toEqual([perdedor])
    await sincronizar(A)
    expect(texto(A, 'NT-x-1')).toBe(vencedor)
  })
})

describe('um segmento ilegível não conta como coberto (o dono não poda o que só ele tem)', () => {
  type Arquivo = { v: number; segmentos: Record<string, number>; ate: Record<string, number> }

  it('Y não valida o segmento 2 de X e consolida primeiro: X mantém o seq 2 e o estado fundido o recebe depois', async () => {
    const X = await novoAparelho(nuvem, 'Mac')
    const Y = await novoAparelho(nuvem, 'iPhone')
    const t0 = Date.now()
    for (let i = 1; i <= 3; i++) {
      await nota(X, `NT-x-${i}`, `x${i}`)
      await sincronizar(X, { agora: () => t0 })
    }
    expect(await X.sync.contarPorEnviar()).toBe(0)
    // O segmento 2 do Dropbox fica ilegível para quem o lê (o texto inteiro está truncado).
    const bom = nuvem.texto(segmento(X.id, 2))
    nuvem.colocar(segmento(X.id, 2), bom.slice(0, 30))

    const ry0 = await sincronizar(Y, { agora: () => t0 })
    expect(ry0.malformados.map((m) => m.caminho)).toEqual([segmento(X.id, 2)])
    expect(ry0.consolidacao).toBeNull()
    const ry = await sincronizar(Y, { agora: () => t0 + DIA + 1 })
    expect(ry.malformados.map((m) => m.caminho)).toEqual([segmento(X.id, 2)])
    expect(ry.consolidacao).toBe('gravada')
    // A cobertura publicada para antes do segmento ilegível: o 3 foi lido, mas o 2 não.
    expect(nuvem.json<Arquivo>(ESTADO).segmentos[X.id]).toBe(1)
    expect(texto(Y, 'NT-x-3')).toBe('x3')
    expect(Y.estado.estadoAtual().registro('nota', 'NT-x-2')).toBeUndefined()

    // X recebe o estado.json de Y e poda: o seq 2 (que a base de Y não tem) continua guardado aqui.
    await sincronizar(X, { agora: () => t0 + DIA + 2 })
    const ids = (await X.armazem.todosEventos()).filter((e) => e.aparelho === X.id).map((e) => e.id)
    expect(ids).toContain(`${X.id}-2-0`)
    expect(texto(X, 'NT-x-2')).toBe('x2')

    // Passado um dia, X consolida (a base dele tem o seq 2) e Y passa a ter tudo.
    const rx = await sincronizar(X, { agora: () => t0 + 3 * DIA })
    expect(rx.consolidacao).toBe('gravada')
    expect(nuvem.json<Arquivo>(ESTADO).segmentos[X.id]).toBe(3)
    await sincronizar(Y, { agora: () => t0 + 3 * DIA })
    expect(texto(Y, 'NT-x-2')).toBe('x2')
    expect(canonico(X)).toBe(canonico(Y))
  })

  it('um segmento com linhas boas e ruins: as boas entram em todo lugar onde foram lidas, e ele não entra na cobertura', async () => {
    const A = await novoAparelho(nuvem)
    const X = 'xxxxxxxx'
    nuvem.colocar(segmento(X, 1), `${linhaDe(X, 1, { texto: 's1' }, 'NT-1')}\n`)
    nuvem.colocar(segmento(X, 2), `${linhaDe(X, 2, { texto: 's2' }, 'NT-2')}\n{isto não é json\n`)
    nuvem.colocar(segmento(X, 3), `${linhaDe(X, 3, { texto: 's3' }, 'NT-3')}\n`)
    const r = await sincronizar(A)
    expect(r.malformados.map((m) => m.caminho)).toEqual([segmento(X, 2)])
    expect(texto(A, 'NT-2')).toBe('s2')
    expect(r.faltando).toEqual([])
    expect(r.consolidacao).toBe('gravada')
    expect(nuvem.json<Arquivo>(ESTADO).segmentos[X]).toBe(1)
  })

  it('o segmento com problema é tentado de novo quando o arquivo muda (rev) e, lido por inteiro, a cobertura passa por ele', async () => {
    const A = await novoAparelho(nuvem)
    const X = 'xxxxxxxx'
    const t0 = Date.now()
    nuvem.colocar(segmento(X, 1), `${linhaDe(X, 1, { texto: 's1' }, 'NT-1')}\n`)
    nuvem.colocar(segmento(X, 2), '{truncado')
    const r1 = await sincronizar(A, { agora: () => t0 })
    expect(r1.malformados.map((m) => m.caminho)).toEqual([segmento(X, 2)])
    const antes = nuvem.baixados(A.id).filter((c) => c === segmento(X, 2)).length
    const r1b = await sincronizar(A, { agora: () => t0 + 1000 })
    expect(r1b.malformados.map((m) => m.caminho)).toEqual([segmento(X, 2)])
    expect(nuvem.baixados(A.id).filter((c) => c === segmento(X, 2))).toHaveLength(antes)

    nuvem.colocar(segmento(X, 2), `${linhaDe(X, 2, { texto: 's2' }, 'NT-2')}\n`)
    const r2 = await sincronizar(A, { agora: () => t0 + 2000 })
    expect(r2.malformados).toEqual([])
    expect(texto(A, 'NT-2')).toBe('s2')
    const r3 = await sincronizar(A, { agora: () => t0 + 3 * DIA })
    expect(r3.consolidacao).toBe('gravada')
    expect(nuvem.json<Arquivo>(ESTADO).segmentos[X]).toBe(2)
  })

  it('mesmo sem a regra da cobertura, a poda só apaga a linha que a base guardada cita', async () => {
    const A = await novoAparelho(nuvem)
    nuvem.colocar(ESTADO, 'lixo') // sem consolidação nesta rodada: as linhas enviadas ficam
    for (let i = 1; i <= 3; i++) {
      await nota(A, `NT-a-${i}`, `n${i}`)
      await sincronizar(A)
    }
    const cobertura = { ate: { [A.id]: 3 }, segmentos: { [A.id]: 3 } }
    expect(await A.local.podarProprios(A.id, cobertura, new Set())).toBe(0)
    expect(await A.local.podarProprios(A.id, cobertura, new Set([`${A.id}-1-0`, `${A.id}-3-0`]))).toBe(2)
    expect((await A.armazem.todosEventos()).map((e) => e.id)).toEqual([`${A.id}-2-0`])
  })
})

describe('id de aparelho reaproveitado (banco restaurado, perfil clonado)', () => {
  const regDe = (e: { reg: string }) => e.reg

  it('(a) os contadores de id passam de todo registro com o id deste aparelho visto em eventos e bases de fora', async () => {
    const A = await novoAparelho(nuvem)
    const B = await novoAparelho(nuvem)
    // B edita registros que levam o id de A (A os criou numa vida anterior): um chega pela base, outro por segmento.
    await B.estado.registrar('colecao', `CO-${A.id}-4`, 'alterar', { nome: 'antiga' })
    await sincronizar(B) // 1º segmento: coberto pelo estado.json que B grava
    await B.estado.registrar('nota', `NT-${A.id}-9`, 'alterar', { texto: 'antiga' })
    await sincronizar(B) // 2º segmento: A o lê
    const r = await sincronizar(A)
    expect(r.estadoBaixado).toBe(true)
    expect(nuvem.baixados(A.id)).toContain(segmento(B.id, 2))
    expect(await A.armazem.proximoId('CO')).toBe(`CO-${A.id}-5`)
    expect(await A.armazem.proximoId('NT')).toBe(`NT-${A.id}-10`)
    expect(await A.armazem.proximoId('HY')).toBe(`HY-${A.id}-1`)
  })

  it('(b) um evento local planejado que colide com uma cópia diferente de fora perde o plano e ganha id novo; o conteúdo local sobe', async () => {
    const A = await novoAparelho(nuvem)
    await nota(A, 'NT-a-1', 'conteúdo local')
    nuvem.antes = (op, caminho) => {
      if (op === 'enviar' && caminho.includes('/diario/')) throw new (class extends Error { name = 'ErroDeRede' })()
    }
    await expect(sincronizar(A)).rejects.toThrow()
    nuvem.antes = null
    expect((await A.local.lerPlanos()).map((p) => p.seg)).toEqual([1])
    // Uma cópia com o mesmo id (A-1-0), outro conteúdo e hlc MAIOR, num segmento que este IndexedDB não conhece.
    const copia = JSON.stringify({
      v: 1,
      id: `${A.id}-1-0`,
      hlc: `1900000000000-0000-${A.id}`,
      aparelho: A.id,
      tipo: 'nota',
      reg: 'NT-a-1',
      op: 'alterar',
      campos: { texto: 'da cópia de fora' },
    })
    nuvem.colocar(segmento(A.id, 3), `${copia}\n`)
    // Mais um evento local, sem colisão: também sobe.
    await nota(A, 'NT-a-2', 'outro')

    const r = await sincronizar(A)
    expect(r.renumerados).toBe(1)
    expect(r.aparelhoTrocado).toBeNull()
    expect(await A.sync.contarPorEnviar()).toBe(0)
    // O plano velho (segmento 1) foi desfeito: o conteúdo local subiu com id novo, em número livre.
    expect(nuvem.caminhos(`usuario/diario/${A.id}/`)).not.toContain(segmento(A.id, 1))
    const subiu = nuvem
      .caminhos(`usuario/diario/${A.id}/`)
      .filter((c) => c !== segmento(A.id, 3))
      .flatMap((c) => linhas(c).map((l) => JSON.parse(l) as { id: string; campos: Record<string, string> }))
    expect(subiu.map((e) => e.campos.texto).sort()).toEqual(['conteúdo local', 'outro'])
    expect(subiu.every((e) => e.id !== `${A.id}-1-0`)).toBe(true)
    // Nada se perdeu no estado: o evento renumerado ganhou hlc acima do da cópia de fora (a edição local é a
    // mais nova, a de fora fica no histórico) e a cópia de fora entrou.
    expect(texto(A, 'NT-a-1')).toBe('conteúdo local')
    expect(A.estado.estadoAtual().historico('NT-a-1', 'texto', 'nota').map((h) => h.valor)).toEqual(['da cópia de fora'])
    expect((await A.armazem.eventosLocaisNaoEnviados()).map(regDe)).toEqual([])
  })

  it('(7) um evento local por enviar idêntico à cópia que o Dropbox já tem fica enviado (sem "N por enviar" fantasma)', async () => {
    const A = await novoAparelho(nuvem)
    await nota(A, 'NT-a-1', 'igual')
    nuvem.antes = (op, caminho) => {
      if (op === 'enviar' && caminho.includes('/diario/')) throw new (class extends Error { name = 'ErroDeRede' })()
    }
    await expect(sincronizar(A)).rejects.toThrow()
    nuvem.antes = null
    expect(await A.sync.contarPorEnviar()).toBe(1)
    const [e] = await A.armazem.eventosLocaisNaoEnviados()
    const linha = JSON.stringify({ v: e!.v, id: e!.id, hlc: e!.hlc, aparelho: e!.aparelho, tipo: e!.tipo, reg: e!.reg, op: e!.op, campos: e!.campos })
    nuvem.colocar(segmento(A.id, 3), `${linha}\n`)

    const r = await sincronizar(A)
    expect(r.enviados).toBe(0)
    expect(r.segmentosEnviados).toEqual([])
    expect(r.renumerados).toBe(0)
    expect(r.aparelhoTrocado).toBeNull()
    expect(await A.sync.contarPorEnviar()).toBe(0)
    expect(await A.local.lerPlanos()).toEqual([])
    const [l] = await A.local.linhasDosIds([e!.id])
    expect(l).toMatchObject({ enviado: 1, segmento: 3 })
    expect(nuvem.caminhos(`usuario/diario/${A.id}/`)).toEqual([segmento(A.id, 3)])
  })

  describe.each([
    ['pelo estado.json', false],
    ['pelos segmentos', true],
  ])('(c) o id deste aparelho aparece no Dropbox com conteúdo que ele nunca produziu (%s)', (_nome, semEstado) => {
    it('troca de id, mantém todos os eventos por enviar recarimbados e sobe tudo', async () => {
      const C1 = await novoAparelho(nuvem, 'Mac')
      if (semEstado) nuvem.colocar(ESTADO, 'lixo') // sem estado.json legível, só os segmentos mostram o conteúdo
      await nota(C1, 'NT-c-1', 'do Mac')
      await sincronizar(C1)
      // O clone: um IndexedDB novo com o MESMO id de aparelho (um perfil copiado), com alterações por enviar.
      const C2 = await novoAparelho(nuvem, 'iPhone clonado')
      await C2.local.gravarConfig('aparelho', { id: C1.id, nome: 'iPhone clonado' })
      await C2.local.gravarConfig('seq', 10)
      await C2.estado.registrar('nota', 'NT-c-2', 'criar', { texto: 'do clone' })
      await C2.estado.registrarVarios([
        { tipo: 'nota', reg: 'NT-c-3', op: 'criar', campos: { texto: 'três' } },
        { tipo: 'colecao', reg: 'CO-c-1', op: 'criar', campos: { nome: 'C' } },
      ])
      expect((await C2.aparelho.aparelhoAtual()).id).toBe(C1.id)

      const r = await sincronizar(C2)
      const novo = (await C2.aparelho.aparelhoAtual()).id
      expect(novo).not.toBe(C1.id)
      expect((await C2.aparelho.aparelhoAtual()).nome).toBe('iPhone clonado')
      expect(r.aparelhoTrocado).toEqual({ de: C1.id, para: novo })
      expect(r.enviados).toBe(3)
      expect(await C2.sync.contarPorEnviar()).toBe(0)
      // Os eventos por enviar subiram recarimbados, juntos (mesmo seq, n 0 e 1), sob o id novo.
      const subiu = nuvem.caminhos(`usuario/diario/${novo}/`).flatMap((c) => linhas(c).map((l) => JSON.parse(l) as { id: string; aparelho: string; hlc: string }))
      expect(subiu.map((e) => e.id)).toEqual([`${novo}-11-0`, `${novo}-12-0`, `${novo}-12-1`])
      expect(subiu.every((e) => e.aparelho === novo && e.hlc.endsWith(`-${novo}`))).toBe(true)
      // O conteúdo do Mac continua só nos segmentos dele, e o do clone nunca foi para a pasta do id antigo.
      expect(nuvem.caminhos(`usuario/diario/${C1.id}/`)).toEqual([segmento(C1.id, 1)])
      expect(idsNoSegmento(segmento(C1.id, 1))).toEqual([`${C1.id}-1-0`])
      expect(texto(C2, 'NT-c-1')).toBe('do Mac')
      expect(texto(C2, 'NT-c-2')).toBe('do clone')
      // Os dois lados convergem.
      await sincronizar(C1)
      expect(texto(C1, 'NT-c-3')).toBe('três')
      await sincronizar(C2)
      expect(canonico(C1)).toBe(canonico(C2))
      // O id novo é o de agora em diante.
      const e = await C2.estado.registrar('nota', 'NT-c-2', 'alterar', { texto: 'depois' })
      expect(e.aparelho).toBe(novo)
      expect(await C2.armazem.proximoId('NT')).toMatch(new RegExp(`^NT-${novo}-`))
    })
  })
})

describe('listagens e tamanho das gravações', () => {
  it('lista só usuario/ (sem descer), usuario/diario/ e usuario/aparelhos/: nunca usuario/imagens/', async () => {
    const A = await novoAparelho(nuvem)
    nuvem.colocar('usuario/imagens/IM-xxxxxxxx-1/tela.webp', 'imagem')
    nuvem.colocar('usuario/aparelhos.json', '{}')
    await nota(A, 'NT-a-1', 'um')
    await sincronizar(A)
    const listagens = nuvem.chamadas.filter((c) => c.op === 'listar')
    expect(listagens.map((c) => `${c.caminho}${c.recursivo ? '/**' : ''}`).sort()).toEqual(['usuario', 'usuario/aparelhos/**', 'usuario/diario/**'])
    expect(nuvem.baixados(A.id).some((c) => c.includes('imagens'))).toBe(false)
  })

  it('R5: uma só gravação com mais de 500 eventos fica inteira num segmento (nunca é partida)', async () => {
    const A = await novoAparelho(nuvem)
    await A.estado.registrarVarios(Array.from({ length: 10 }, (_, i) => ({ tipo: 'nota' as const, reg: `NT-a-${i}`, op: 'alterar' as const, campos: { t: i } })))
    await A.estado.registrarVarios(Array.from({ length: 600 }, (_, i) => ({ tipo: 'nota' as const, reg: `NT-b-${i}`, op: 'alterar' as const, campos: { t: i } })))
    await nota(A, 'NT-a-1', 'depois')
    const r = await sincronizar(A)
    expect(r.segmentosEnviados).toEqual([segmento(A.id, 1), segmento(A.id, 2), segmento(A.id, 3)])
    expect([1, 2, 3].map((n) => linhas(segmento(A.id, n)).length)).toEqual([10, 600, 1])
    // Todos os eventos da gravação grande têm o mesmo seq, no mesmo segmento.
    expect(new Set(idsNoSegmento(segmento(A.id, 2)).map((id) => id.split('-')[1])).size).toBe(1)
    const B = await novoAparelho(nuvem)
    await sincronizar(B)
    expect(canonico(B)).toBe(canonico(A))
  })
})

describe('consolidação com a cobertura parada (sem churn)', () => {
  const escritasDe = (ap: string) => nuvem.chamadas.filter((c) => c.op === 'enviar' && c.caminho === ESTADO && c.aparelho === ap && c.ok).length

  it('aparelho morto com 26 segmentos e o 2º truncado: o estado.json é gravado uma vez, não a cada rodada', async () => {
    const Y = await novoAparelho(nuvem, 'iPhone')
    const X = 'xxxxxxxx'
    const t0 = Date.now()
    for (let n = 1; n <= 26; n++) nuvem.colocar(segmento(X, n), n === 2 ? '{"v":1,"id":"xxxxxxxx-2' : `${linhaDe(X, n, { texto: `x${n}` }, `NT-${n}`)}\n`)

    // A cobertura não passa do segmento 1 (o 2 é ilegível); os 24 além dele não a fazem avançar.
    const primeira = await sincronizar(Y, { agora: () => t0 })
    expect(primeira.consolidacao).toBe('gravada')
    expect(nuvem.json<{ segmentos: Record<string, number> }>(ESTADO).segmentos[X]).toBe(1)
    for (let k = 1; k <= 6; k++) {
      const r = await sincronizar(Y, { agora: () => t0 + k * 60_000 })
      expect(r.consolidacao).toBeNull()
      expect(r.malformados.map((m) => m.caminho)).toEqual([segmento(X, 2)])
    }
    // Nem na consolidação diária: a base e a cobertura são idênticas às gravadas.
    for (const dt of [DIA + 1, 2 * DIA + 5, 9 * DIA]) expect((await sincronizar(Y, { agora: () => t0 + dt })).consolidacao).toBeNull()
    expect(escritasDe(Y.id)).toBe(1)
    expect(texto(Y, 'NT-26')).toBe('x26')

    // Um segundo aparelho na mesma situação lê o estado.json uma vez e também não regrava nada.
    const Z = await novoAparelho(nuvem, 'iPad')
    for (let k = 0; k < 4; k++) await sincronizar(Z, { agora: () => t0 + 10 * DIA + k * 60_000 })
    expect(escritasDe(Z.id)).toBeLessThanOrEqual(1)
    expect(nuvem.baixados(Z.id).filter((c) => c === ESTADO)).toHaveLength(1 + (escritasDe(Z.id) ? 1 : 0))
  })

  it('não regrava um estado.json idêntico ao que já está no Dropbox, mesmo na consolidação diária', async () => {
    const A = await novoAparelho(nuvem)
    const t0 = Date.now()
    await nota(A, 'NT-a-1', 'um')
    expect((await sincronizar(A, { agora: () => t0 })).consolidacao).toBe('gravada')
    // Um segmento com problema aparece depois; nada muda na base nem na cobertura.
    nuvem.colocar(segmento('xxxxxxxx', 1), '{truncado')
    const rev = nuvem.rev(ESTADO)
    for (const dt of [DIA + 1, 3 * DIA]) {
      const r = await sincronizar(A, { agora: () => t0 + dt })
      expect(r.consolidacao).toBeNull()
    }
    expect(nuvem.rev(ESTADO)).toBe(rev)
    expect(nuvem.enviosOk(ESTADO)).toBe(1)
  })

  it('uma lacuna (segmento que falta) também segura a cobertura sem reescrever a cada rodada', async () => {
    const A = await novoAparelho(nuvem)
    const X = 'xxxxxxxx'
    const t0 = Date.now()
    nuvem.colocar(segmento(X, 1), `${linhaDe(X, 1, { texto: 's1' }, 'NT-1')}\n`)
    for (let n = 3; n <= 26; n++) nuvem.colocar(segmento(X, n), `${linhaDe(X, n, { texto: `s${n}` }, `NT-${n}`)}\n`)
    const r0 = await sincronizar(A, { agora: () => t0 })
    expect(r0.consolidacao).toBe('gravada') // a primeira vez: o segmento 1 avança a cobertura
    for (let k = 1; k <= 4; k++) expect((await sincronizar(A, { agora: () => t0 + k * 60_000 })).consolidacao).toBeNull()
    expect(escritasDe(A.id)).toBe(1)
  })
})

describe('tamanho do estado.json', () => {
  it('não grava uma base acima de 48 MB: reporta e deixa tudo nos diários', async () => {
    const A = await novoAparelho(nuvem)
    await A.estado.registrarVarios(Array.from({ length: 5 }, (_, i) => ({ tipo: 'nota' as const, reg: `NT-a-${i}`, op: 'alterar' as const, campos: { texto: 'x'.repeat(10 * 1024 * 1024) } })))
    const r = await sincronizar(A)
    expect(r.enviados).toBe(5)
    expect(r.consolidacao).toBeNull()
    expect(r.malformados).toEqual([{ caminho: ESTADO, motivo: expect.stringContaining('não foi gravada') }])
    expect(r.estadoIlegivel).toBeNull()
    expect(nuvem.caminhos('usuario/')).not.toContain(ESTADO)
    expect(await A.sync.contarPorEnviar()).toBe(0)
  }, 60_000)

  it('no conflito de consolidação, um estado.json de outro aparelho acima de 64 MB não é baixado', async () => {
    const A = await novoAparelho(nuvem)
    await nota(A, 'NT-a-1', 'um')
    nuvem.antes = (op, caminho, quem) => {
      if (op === 'enviar' && caminho === ESTADO && quem === A.id) {
        nuvem.antes = null
        nuvem.colocar(ESTADO, new Uint8Array(64 * 1024 * 1024 + 1)) // outro aparelho gravou antes
      }
    }
    const r = await sincronizar(A)
    expect(r.consolidacao).toBe('outro-aparelho')
    expect(r.estadoIlegivel).toEqual(expect.stringContaining('grande demais'))
    expect(nuvem.baixados(A.id)).not.toContain(ESTADO)
    expect(r.enviados).toBe(1)
  }, 60_000)

  it('um estado.json ilegível aparece em estadoIlegivel (e some quando é corrigido)', async () => {
    const A = await novoAparelho(nuvem)
    nuvem.colocar(ESTADO, JSON.stringify({ v: 2, base: { v: 2, registros: [] }, ate: {}, segmentos: {} }))
    expect((await sincronizar(A)).estadoIlegivel).toContain('versão mais nova do app em outro aparelho')
    expect((await sincronizar(A)).estadoIlegivel).toContain('versão mais nova')
    nuvem.colocar(ESTADO, JSON.stringify({ v: 1, base: { v: 1, registros: [] }, ate: {}, segmentos: {} }))
    expect((await sincronizar(A)).estadoIlegivel).toBeNull()
  })

  it('segmento com linhas boas e ruins é reportado como parcial; o todo ilegível, não', async () => {
    const A = await novoAparelho(nuvem)
    const X = 'xxxxxxxx'
    nuvem.colocar(segmento(X, 1), `${linhaDe(X, 1, { texto: 's1' }, 'NT-1')}\n{ruim\n`)
    nuvem.colocar(segmento(X, 2), '{ruim\n')
    const r = await sincronizar(A)
    expect(r.malformados).toEqual([
      { caminho: segmento(X, 1), motivo: '1 linha ilegível', parcial: true },
      { caminho: segmento(X, 2), motivo: '1 linha ilegível', parcial: false },
    ])
    expect((await sincronizar(A)).malformados.map((m) => m.parcial)).toEqual([true, false])
  })
})

describe('limparNome: o nome vindo de outro aparelho', () => {
  it('tira controles e caracteres de direção do texto (bidi), sem mexer no resto', async () => {
    const { limparNome } = await import('./sincronizar')
    const bidi = '\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\u200e\u200f\u061c'
    expect(limparNome(`iPad${bidi}da Ana`)).toBe(`iPad${' '.repeat(12)}da Ana`)
    expect(limparNome(`\u202eoãnA\u202c`)).toBe('oãnA')
    expect(limparNome('Mac da Ana (escritório)')).toBe('Mac da Ana (escritório)')
    expect(limparNome('a\u0007b')).toBe('a b')
  })
})
