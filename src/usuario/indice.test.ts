// @vitest-environment node
/**
 * Tarefa 4 (Parte 2B): a camada do usuário na busca. O que o usuário escreve (notas, objetos, coleções, sítios e
 * hipóteses SKC) é indexado num banco em memória, ao lado do pacote, com a mesma dobra; `buscar()` junta os dois.
 * Cada teste carrega módulos novos (estado vazio) sobre um IndexedDB limpo e um banco novo do pacote sintético.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { ev, A, B, T0 } from '../../tests/suporte/eventosDeTeste'
import { RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import { lerTabelaDeFold } from '../busca/fold'
import { novoAparelho } from '../../tests/suporte/aparelhoSimulado'
import { DropboxEmMemoria } from '../../tests/suporte/dropboxEmMemoria'
import type { Registro } from './fusao'
import { TIPOS, type Evento, type Json, type Tipo } from './eventos'

const tabela = lerTabelaDeFold(JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo/fold.json'), 'utf8')))
const opcoes = { escopo: 'tudo', filtros: {}, tabela } as const

type Modulos = {
  estado: typeof import('./estado')
  indice: typeof import('./indice')
  consulta: typeof import('../busca/consulta')
  cliente: typeof import('../banco/cliente')
  pacote: typeof import('../objetos-skc/pacote')
  consultas: typeof import('../banco/consultas')
}

function apagarBanco() {
  return new Promise<void>((ok, falha) => {
    const r = indexedDB.deleteDatabase('iconodb-usuario')
    r.onsuccess = () => ok()
    r.onerror = () => falha(r.error)
    r.onblocked = () => falha(new Error('banco bloqueado'))
  })
}

/** Módulos novos sobre um IndexedDB limpo e um banco do pacote novo. */
async function ambiente(): Promise<Modulos> {
  await apagarBanco()
  vi.resetModules()
  const m: Modulos = {
    estado: await import('./estado'),
    indice: await import('./indice'),
    consulta: await import('../busca/consulta'),
    cliente: await import('../banco/cliente'),
    pacote: await import('../objetos-skc/pacote'),
    consultas: await import('../banco/consultas'),
  }
  m.cliente.usarMotor(await bancoDeTeste())
  return m
}

let seq = 0
/** Um evento do aparelho A, com hlc crescente. */
function e(tipo: Tipo, reg: string, campos: Record<string, Json>, op: Evento['op'] = 'alterar'): Evento {
  seq++
  return ev({ ap: A, seq, tipo, reg, op, campos })
}
const numeros = (r: { objetos: { numero: string }[] }) => r.objetos.map((o) => o.numero)

let m: Modulos
beforeEach(async () => {
  seq = 0
  m = await ambiente()
})
afterEach(() => {
  m.cliente.usarMotor(null)
  vi.useRealTimers()
})

const registro = (tipo: Tipo, id: string, campos: Record<string, Json>): Registro => ({
  id,
  tipo,
  campos,
  criadoEm: 'x',
  alteradoEm: 'x',
  excluido: false,
})

describe('camposIndexaveis: o que cada tipo de registro põe no índice', () => {
  it('há uma regra (ou null) para cada um dos 13 tipos', () => {
    expect(Object.keys(m.indice.camposIndexaveis).sort()).toEqual([...TIPOS].sort())
  })

  it('nota: título e texto indexados; o rótulo é o título, ou o começo do texto', () => {
    const f = m.indice.camposIndexaveis.nota
    expect(f(registro('nota', 'NT-a-1', { titulo: 'Íbex no selo', texto: 'Maḥteṣ, nível 3' }))).toMatchObject({
      rotulo: 'Íbex no selo',
      texto: expect.stringContaining('Maḥteṣ'),
    })
    expect(f(registro('nota', 'NT-a-2', { texto: 'sem título, só texto' }))?.rotulo).toBe('sem título, só texto')
    expect(f(registro('nota', 'NT-a-3', { titulo: '', texto: '   ' }))).toBeNull()
    expect(f(registro('nota', 'NT-a-4', {}))).toBeNull()
  })

  it('nota: os links [[GL-…|íbex]] entram só com o rótulo', () => {
    const r = m.indice.camposIndexaveis.nota(registro('nota', 'NT-a-1', { texto: 'ver [[GL-900001|leão-de-teste]] e [[CA00001]]' }))!
    expect(r.texto).toContain('leão-de-teste')
    expect(r.texto).toContain('CA00001')
    expect(r.texto).not.toContain('[[')
    expect(r.texto).not.toContain('GL-900001')
  })

  it('nota: o alvo decide o objeto e o escopo', () => {
    const f = m.indice.camposIndexaveis.nota
    expect(f(registro('nota', 'NT-a-1', { texto: 'x', alvoTipo: 'objeto', alvo: 'ca00001' }))).toMatchObject({ objeto: 'CA00001' })
    expect(f(registro('nota', 'NT-a-2', { texto: 'x', alvo: 'BA00002' }))).toMatchObject({ objeto: 'BA00002' })
    expect(f(registro('nota', 'NT-a-3', { texto: 'x', alvoTipo: 'verbete', alvo: 'GL-900001' }))).toMatchObject({ objeto: null, escopo: 'termo' })
    expect(f(registro('nota', 'NT-a-4', { texto: 'x', alvoTipo: 'sitio', alvo: 'TESTE-1' }))).toMatchObject({ objeto: null, escopo: 'local' })
    expect(f(registro('nota', 'NT-a-5', { texto: 'x', alvoTipo: 'obra', alvo: 'BIB-900001' }))).toMatchObject({ objeto: null, escopo: 'bibliografia' })
    expect(f(registro('nota', 'NT-a-6', { texto: 'x', alvoTipo: 'grupo', alvo: 'TESTE-G1' }))).toMatchObject({ objeto: null, escopo: 'colecao' })
    expect(f(registro('nota', 'NT-a-7', { texto: 'solta' }))).toMatchObject({ objeto: null })
  })

  it('objeto (Tarefa 9): número, título, ficha, origem e leitura; o objeto é o próprio número', () => {
    const r = m.indice.camposIndexaveis.objeto(
      registro('objeto', 'OB-a-1', {
        numero: 'CA00005',
        titulo: 'Escaraveu. Esteatita.',
        obraRotulo: 'Autor 1999',
        figura: '3',
        material: 'esteatita',
        datacao: 'Calcolítico tardio',
        acervo: 'Museu de Haifa',
        leitura: 'Um [[GL-900001|íbex]] sob a árvore.',
      }),
    )!
    expect(r.objeto).toBe('CA00005')
    expect(r.rotulo).toBe('CA00005')
    for (const parte of ['CA00005', 'Escaraveu', 'Autor 1999, fig. 3', 'esteatita', 'Calcolítico', 'Haifa', 'íbex']) expect(r.texto).toContain(parte)
    expect(r.texto).not.toContain('GL-900001')
  })

  it('objeto: o número vem da numeração (contexto), não do registro; rascunho entra sem objeto; reserva de livro não entra', () => {
    const f = m.indice.camposIndexaveis.objeto
    const ctx = { numeroDe: (id: string) => (id === 'OB-a-1' ? 'CA00046' : null) }
    expect(f(registro('objeto', 'OB-a-1', { periodo: 'CA', titulo: 'Selo.' }), ctx)).toMatchObject({ objeto: 'CA00046', rotulo: 'CA00046' })
    const r = f(registro('objeto', 'OB-a-2', { periodo: null, titulo: 'Selo.' }), ctx)!
    expect(r.objeto).toBeNull()
    expect(r.rotulo).toBe('Selo.')
    expect(f(registro('objeto', 'OB-a-3', {}), ctx)).toBeNull()
    expect(f(registro('objeto', 'OB-a-4', { periodo: 'CA', reserva: 'TESTE II', titulo: 'x' }), ctx)).toBeNull()
  })

  it('o id de um objeto SKC numa nota, numa coleção ou numa hipótese vale pelo número dele', () => {
    const ctx = { numeroDe: (id: string) => (id === 'OB-aaaaaaaa-1' ? 'CA00046' : null) }
    const ix = m.indice.camposIndexaveis
    expect(ix.nota(registro('nota', 'NT-a-1', { texto: 'x', alvoTipo: 'objeto', alvo: 'OB-aaaaaaaa-1' }), ctx)).toMatchObject({ objeto: 'CA00046' })
    expect(ix.hipotese(registro('hipotese', 'HY-a-1', { termos: ['íbex'], objeto: 'OB-aaaaaaaa-1' }), ctx)).toMatchObject({ objeto: 'CA00046' })
    const c = ix.colecao(registro('colecao', 'CO-a-1', { nome: 'n', 'm:OB-aaaaaaaa-1': true, 'i:OB-aaaaaaaa-1': 1024, 'm:CA00001': true, 'i:CA00001': 2048 }), ctx)!
    expect(c.objetos).toEqual(['CA00046', 'CA00001'])
  })

  it('coleção: o nome, e os objetos dela', () => {
    const r = m.indice.camposIndexaveis.colecao(registro('colecao', 'CO-a-1', { nome: 'Minhas notas de leão', 'm:CA00001': true, 'i:CA00001': 2048, 'm:CA00002': true, 'i:CA00002': 1024, 'm:CA00003': null, 'i:CA00003': 512, 'm:OB-aaaaaaaa-1': true, 'i:OB-aaaaaaaa-1': 3072 }))!
    // os membros (pela ordem), sem o que foi tirado; o id de objeto SKC ainda não é um número, a Tarefa 9 o resolve
    expect(r).toMatchObject({ rotulo: 'Minhas notas de leão', escopo: 'colecao', objetos: ['CA00002', 'CA00001'] })
    expect(m.indice.camposIndexaveis.colecao(registro('colecao', 'CO-a-2', {}))).toBeNull()
  })

  it('sítio: nome, variantes e região; escopo local', () => {
    const r = m.indice.camposIndexaveis.sitio(registro('sitio', 'SI-a-1', { nome: 'Tell Novo', variantes: ['Tall Naw', 'Tell Nuovo'], regiao: 'Negev' }))!
    expect(r).toMatchObject({ rotulo: 'Tell Novo', escopo: 'local' })
    for (const parte of ['Tall Naw', 'Tell Nuovo', 'Negev']) expect(r.texto).toContain(parte)
  })

  it('sítio com grafias (Parte 2C, bloco 2; F10): os textos delas entram, a tradição e o livro não', () => {
    const r = m.indice.camposIndexaveis.sitio(registro('sitio', 'SI-a-1', { nome: 'Tell Novo', grafias: [{ texto: 'Tal Grafado', tradicao: 'arabe', livro: 'TESTE' }] }))!
    expect(r.texto).toContain('Tal Grafado')
    expect(r.texto).not.toContain('arabe')
    // uma correção de um sítio do livro só com grafias também entra
    const c = m.indice.camposIndexaveis.sitio(registro('sitio', 'TESTE-2', { grafias: [{ texto: 'Tel Corrigido' }] }))!
    expect(c.texto).toContain('Tel Corrigido')
  })

  it('hipótese: termos e justificativa; o objeto é o alvo; escopo termo', () => {
    const r = m.indice.camposIndexaveis.hipotese(
      registro('hipotese', 'HY-a-1', { termos: ['íbex', 'GL-900001'], justificativa: 'a pose lembra o selo de Maḥteṣ', objeto: 'CA00001', nivel: 'iconographic' }),
    )!
    expect(r).toMatchObject({ objeto: 'CA00001', escopo: 'termo' })
    for (const parte of ['íbex', 'Maḥteṣ']) expect(r.texto).toContain(parte)
  })

  it('o que a Tarefa 4 não indexa (região, posição, ligação, comparar…) devolve null', () => {
    for (const t of ['regiao', 'posicao', 'item-sitio', 'revisao', 'ligacao', 'comparar'] as const) {
      expect(m.indice.camposIndexaveis[t](registro(t, 'X-1', { texto: 'qualquer coisa', nome: 'n' }))).toBeNull()
    }
  })
})

describe('indexarUsuario(): diferença incremental', () => {
  it('a primeira passada insere tudo; a segunda, com o mesmo estado, não escreve nada', async () => {
    await m.estado.receberEventos([e('nota', 'NT-a-1', { texto: 'primeira' }), e('nota', 'NT-a-2', { texto: 'segunda' })])
    expect(await m.indice.indexarUsuario(m.estado.estadoAtual(), { tabela })).toMatchObject({ inseridos: 2, removidos: 0 })
    expect(await m.indice.indexarUsuario(m.estado.estadoAtual(), { tabela })).toMatchObject({ inseridos: 0, removidos: 0 })
  })

  it('só o que mudou é reescrito; excluir remove, restaurar devolve', async () => {
    await m.estado.receberEventos([e('nota', 'NT-a-1', { texto: 'primeira' }), e('nota', 'NT-a-2', { texto: 'segunda' })])
    await m.indice.indexarUsuario(m.estado.estadoAtual(), { tabela })

    await m.estado.receberEventos([e('nota', 'NT-a-2', { texto: 'segunda editada' })])
    expect(await m.indice.indexarUsuario(m.estado.estadoAtual(), { tabela })).toMatchObject({ inseridos: 1, removidos: 1 })

    await m.estado.receberEventos([e('nota', 'NT-a-1', {}, 'excluir')])
    expect(await m.indice.indexarUsuario(m.estado.estadoAtual(), { tabela })).toMatchObject({ inseridos: 0, removidos: 1 })
    expect(await m.cliente.consultarUsuario('SELECT count(*) AS n FROM doc')).toEqual([{ n: 1 }])

    await m.estado.receberEventos([e('nota', 'NT-a-1', {}, 'restaurar')])
    expect(await m.indice.indexarUsuario(m.estado.estadoAtual(), { tabela })).toMatchObject({ inseridos: 1, removidos: 0 })
  })

  it('um evento de hlc antigo que chega tarde, de outro campo, também entra no índice', async () => {
    await m.estado.receberEventos([ev({ ap: A, seq: 1, ms: T0 + 9000, tipo: 'nota', reg: 'NT-a-1', campos: { texto: 'texto recente' } })])
    await m.indice.indexarUsuario(m.estado.estadoAtual(), { tabela })
    const antes = m.estado.estadoAtual().registro('nota', 'NT-a-1')!.alteradoEm
    // outro aparelho editou o título ANTES (hlc menor) e só agora a sincronização o entrega
    await m.estado.receberEventos([ev({ ap: B, seq: 1, ms: T0 + 1000, tipo: 'nota', reg: 'NT-a-1', campos: { titulo: 'zebrinha tardia' } })])
    expect(m.estado.estadoAtual().registro('nota', 'NT-a-1')!.alteradoEm).toBe(antes) // o alteradoEm não mudou
    expect(await m.indice.indexarUsuario(m.estado.estadoAtual(), { tabela })).toMatchObject({ inseridos: 1, removidos: 1 })
    const r = await m.consulta.buscar('zebrinha', opcoes)
    expect(r.usuario).toEqual([expect.objectContaining({ ref: 'NT-a-1', rotulo: 'zebrinha tardia' })])
  })

  it('o índice usa o mesmo FTS5 (unicode61 remove_diacritics 2) e a marca SKC', async () => {
    await m.estado.receberEventos([e('nota', 'NT-a-1', { texto: "Maḥteṣ e Marduk's" })])
    await m.indice.indexarUsuario(m.estado.estadoAtual(), { tabela })
    const linhas = await m.cliente.consultarUsuario<{ tipo: string; ref: string; publicacao: string; skc: number }>(
      `SELECT d.tipo, d.ref, d.publicacao, d.skc FROM fts AS f JOIN doc AS d ON d.rowid = f.rowid WHERE f.fts MATCH '"mahtes" "marduks"*'`,
    )
    expect(linhas).toEqual([{ tipo: 'nota', ref: 'NT-a-1', publicacao: 'SKC', skc: 1 }])
  })

  it('um motor novo (worker que morreu, ou outro banco) é reindexado por inteiro', async () => {
    await m.estado.receberEventos([e('nota', 'NT-a-1', { texto: 'lembra de mim' })])
    await m.indice.indexarUsuario(m.estado.estadoAtual(), { tabela })
    m.cliente.usarMotor(await bancoDeTeste())
    expect(await m.cliente.consultarUsuario('SELECT count(*) AS n FROM doc')).toEqual([{ n: 0 }])
    expect(await m.indice.indexarUsuario(m.estado.estadoAtual(), { tabela })).toMatchObject({ inseridos: 1 })
    expect(await m.cliente.consultarUsuario('SELECT count(*) AS n FROM doc')).toEqual([{ n: 1 }])
  })

  it('sobrevive a reabrirBanco() (troca do pacote)', async () => {
    await m.estado.receberEventos([e('nota', 'NT-a-1', { texto: 'Maḥteṣ de novo' })])
    await m.indice.indexarUsuario(m.estado.estadoAtual(), { tabela })
    await m.cliente.reabrirBanco()
    expect(await m.cliente.consultarUsuario('SELECT count(*) AS n FROM doc')).toEqual([{ n: 1 }])
    const r = await m.consulta.buscar('mahtes', { ...opcoes, escopo: 'tudo' })
    expect(r.usuario.map((a) => a.ref)).toEqual(['NT-a-1'])
  })

  it('uma tabela de dobra diferente (pacote novo) reindexa por inteiro', async () => {
    await m.estado.receberEventos([e('nota', 'NT-a-1', { texto: 'texto' })])
    await m.indice.indexarUsuario(m.estado.estadoAtual(), { tabela })
    const outra = lerTabelaDeFold(JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo/fold.json'), 'utf8')))
    expect(await m.indice.indexarUsuario(m.estado.estadoAtual(), { tabela: outra })).toMatchObject({ inseridos: 1, removidos: 0 })
  })

  it('milhares de notas entram em lotes e a busca continua rápida', async () => {
    const eventos = Array.from({ length: 3000 }, (_, i) => e('nota', `NT-a-${i + 1}`, { texto: `nota ${i} sobre o selo ${i % 7 === 0 ? 'Maḥteṣ' : 'outro'}` }))
    await m.estado.receberEventos(eventos)
    const t0 = performance.now()
    expect(await m.indice.indexarUsuario(m.estado.estadoAtual(), { tabela })).toMatchObject({ inseridos: 3000 })
    const r = await m.consulta.buscar('mahtes', opcoes)
    expect(r.usuario).toHaveLength(Math.ceil(3000 / 7))
    expect(performance.now() - t0).toBeLessThan(5000)
  })
})

describe('iniciarIndiceDoUsuario(): uma passada por vez, no máximo a cada 300 ms', () => {
  it('muitas mudanças seguidas viram uma passada só', async () => {
    const banco = await bancoDeTeste()
    const escrever = vi.fn((lote: Parameters<typeof banco.escreverUsuario>[0]) => banco.escreverUsuario(lote))
    m.cliente.usarMotor({
      abrir: () => banco.abrir(),
      reabrir: () => banco.reabrir(),
      executar: (s, p) => banco.executar(s, p),
      escreverUsuario: escrever,
      consultarUsuario: (s, p) => banco.consultarUsuario(s, p),
    })
    await m.cliente.abrirBanco()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const parar = m.indice.iniciarIndiceDoUsuario({ tabela })
    await vi.advanceTimersByTimeAsync(m.indice.ESPERA_DO_INDICE_MS) // a passada inicial (estado vazio)
    escrever.mockClear()

    for (let i = 1; i <= 8; i++) {
      await m.estado.receberEventos([e('nota', `NT-a-${i}`, { texto: `nota ${i}` })])
      await vi.advanceTimersByTimeAsync(20)
    }
    expect(escrever).not.toHaveBeenCalled() // ainda dentro da janela de 300 ms
    await vi.advanceTimersByTimeAsync(m.indice.ESPERA_DO_INDICE_MS)
    expect(escrever).toHaveBeenCalledTimes(1)
    expect(await m.cliente.consultarUsuario('SELECT count(*) AS n FROM doc')).toEqual([{ n: 8 }])

    parar()
    await m.estado.receberEventos([e('nota', 'NT-a-99', { texto: 'depois de parar' })])
    await vi.advanceTimersByTimeAsync(1000)
    expect(escrever).toHaveBeenCalledTimes(1)
  })
})

describe('buscar() junta o pacote e a camada do usuário', () => {
  it('decisão 41: um verbete do usuário é achado (sem acento, sem caixa) no escopo Termo, com a rota da página dele', async () => {
    expect(m.indice.camposIndexaveis.verbete(registro('verbete', 'GL-aaaaaaaa-1', { forma: 'Termo-Novo-de-Teste', status: 'proposed' }))).toEqual({
      rotulo: 'Termo-Novo-de-Teste',
      texto: 'Termo-Novo-de-Teste',
      escopo: 'termo',
    })
    // a forma em uso (Tarefa 11) também é achada, e é o rótulo
    expect(m.indice.camposIndexaveis.verbete(registro('verbete', 'GL-aaaaaaaa-1', { forma: 'velha', formaEmUso: 'nova', status: 'proposed' }))).toMatchObject({ rotulo: 'nova', texto: 'velha\nnova' })
    // um verbete do pacote entra quando tem forma em uso (Tarefa 11); sem ela (nunca editado, ou de volta à proposta), não
    expect(m.indice.camposIndexaveis.verbete(registro('verbete', 'GL-900001', { formaEmUso: 'x' }))).toEqual({ rotulo: 'x', texto: 'x', escopo: 'termo' })
    expect(m.indice.camposIndexaveis.verbete(registro('verbete', 'GL-900001', { status: 'approved' }))).toBeNull()
    expect(m.indice.camposIndexaveis.verbete(registro('verbete', 'GL-900001', { formaEmUso: null }))).toBeNull()
    await m.estado.receberEventos([e('verbete', 'GL-aaaaaaaa-1', { forma: 'termo-novo-de-teste', status: 'proposed' }, 'criar')])
    for (const escopo of ['tudo', 'termo'] as const) {
      const r = await m.consulta.buscar('termo novo de teste', { ...opcoes, escopo })
      expect(r.usuario).toEqual([expect.objectContaining({ tipo: 'verbete', ref: 'GL-aaaaaaaa-1', rotulo: 'termo-novo-de-teste', skc: true })])
    }
    expect((await m.consulta.buscar('termo novo de teste', { ...opcoes, escopo: 'local' })).usuario).toEqual([])
    const { rotaDoAcertoDoUsuario, ROTULO_DO_TIPO_DO_USUARIO } = await import('../busca/rotasDoUsuario')
    expect(rotaDoAcertoDoUsuario('verbete', 'GL-aaaaaaaa-1')).toBe('/verbete/GL-aaaaaaaa-1')
    expect(ROTULO_DO_TIPO_DO_USUARIO.verbete).toBe('Verbete')
    // excluído, sai
    await m.estado.receberEventos([e('verbete', 'GL-aaaaaaaa-1', {}, 'excluir')])
    expect((await m.consulta.buscar('termo novo de teste', opcoes)).usuario).toEqual([])
  })

  it('Tarefa 11: um verbete do LIVRO com forma em uso é achado pela forma nova e pela antiga, com os objetos dele e a forma nova na tela', async () => {
    await m.estado.receberEventos([
      e('verbete', 'GL-900001', { formaEmUso: 'leão da prova' }),
      // uma hipótese SKC com o termo, num objeto que o pacote não liga a ele: achada pela forma nova também
      e('hipotese', 'HY-aaaaaaaa-11', { objeto: 'CA00003', termos: ['GL-900001'], termosRotulos: ['leão-de-teste'], nivel: 'iconographic', modalidade: 'probable', justificativa: '' }, 'criar'),
    ])
    const nova = await m.consulta.buscar('leão da prova', { ...opcoes, escopo: 'termo' })
    expect(nova.verbeteDestaque).toMatchObject({ id: 'GL-900001', pt: 'leão da prova' })
    expect(numeros(nova)).toEqual(['CA00001', 'CA00002', 'CA00003'])
    // o verbete do livro não aparece "na sua camada": é o verbete do livro, achado por outra forma
    expect(nova.usuario).toEqual([])
    const antiga = await m.consulta.buscar('leão-de-teste', { ...opcoes, escopo: 'termo' })
    expect(antiga.verbeteDestaque).toMatchObject({ id: 'GL-900001', pt: 'leão da prova' })
    expect(numeros(antiga)).toEqual(expect.arrayContaining(['CA00001', 'CA00002', 'CA00003']))
    expect(antiga.verbetesRelacionados.map((v) => v.rotulo)).toEqual(['filhote de leão-de-teste'])
    // "tudo" também
    expect((await m.consulta.buscar('leão da prova', opcoes)).verbeteDestaque?.id).toBe('GL-900001')
    // de volta à proposta: a forma nova deixa de achar
    await m.estado.receberEventos([e('verbete', 'GL-900001', { formaEmUso: null })])
    expect((await m.consulta.buscar('leão da prova', { ...opcoes, escopo: 'termo' })).verbeteDestaque).toBeUndefined()
  })

  it('revisão 1, I2: depois de voltar à proposta, a hipótese é achada e rotulada pelo nome do pacote, não pelo rótulo guardado', async () => {
    await m.estado.receberEventos([
      e('verbete', 'GL-900001', { formaEmUso: 'leão da prova' }),
      e('hipotese', 'HY-aaaaaaaa-13', { termos: ['GL-900001'], termosRotulos: ['leão da prova'], nivel: 'iconographic', modalidade: 'probable', justificativa: '' }, 'criar'),
    ])
    const antes = await m.consulta.buscar('leão da prova', { ...opcoes, escopo: 'termo' })
    expect(antes.usuario).toEqual([expect.objectContaining({ tipo: 'hipotese', rotulo: 'leão da prova' })])
    await m.estado.receberEventos([e('verbete', 'GL-900001', { formaEmUso: null })])
    const depois = await m.consulta.buscar('leão-de-teste', { ...opcoes, escopo: 'termo' })
    expect(depois.usuario).toEqual([expect.objectContaining({ tipo: 'hipotese', rotulo: 'leão-de-teste' })])
    // o rótulo guardado de antes continua achando a hipótese (é texto dela)
    expect((await m.consulta.buscar('leão da prova', { ...opcoes, escopo: 'termo' })).usuario).toEqual([expect.objectContaining({ tipo: 'hipotese', rotulo: 'leão-de-teste' })])
  })

  it('Tarefa 11: aprovar um verbete do livro aparece no verbete em destaque da busca', async () => {
    await m.estado.receberEventos([e('verbete', 'GL-900007', { status: 'approved' })])
    const r = await m.consulta.buscar('filhote de leão', { ...opcoes, escopo: 'termo' })
    expect(r.verbeteDestaque).toMatchObject({ id: 'GL-900007', status: 'approved' })
  })

  it('"mahtes" acha uma nota com "Maḥteṣ" (e as coisas do pacote continuam lá)', async () => {
    await m.estado.receberEventos([e('nota', 'NT-a-1', { titulo: 'Sobre o sítio', texto: 'Notas de campo em Maḥteṣ.' })])
    const r = await m.consulta.buscar('mahtes', opcoes)
    expect(numeros(r)).toEqual(['BA00001', 'CA00001', 'CA00002'])
    expect(r.usuario).toEqual([expect.objectContaining({ tipo: 'nota', ref: 'NT-a-1', rotulo: 'Sobre o sítio', skc: true, objeto: null })])
  })

  it('uma nota num objeto do livro conta como acerto desse objeto', async () => {
    await m.estado.receberEventos([e('nota', 'NT-a-1', { texto: 'o íbex xyzzy está voltado para trás', alvoTipo: 'objeto', alvo: 'CA00003' })])
    const r = await m.consulta.buscar('xyzzy', opcoes)
    expect(numeros(r)).toEqual(['CA00003'])
    expect(r.usuario).toEqual([]) // já está no objeto: não repete num grupo à parte
    expect(r.total).toBe(1)
    expect(r.objetos[0]).toMatchObject({ numero: 'CA00003', origem: expect.any(String) })
    expect(r.objetos[0]!.skc).toBeUndefined() // o objeto é do livro
  })

  it('Ferro I–III: F100001 é número de objeto no índice e na busca (também colado a outras palavras)', async () => {
    expect(m.indice.camposIndexaveis.nota(registro('nota', 'NT-f-1', { texto: 'x', alvoTipo: 'objeto', alvo: 'f100001' }))).toMatchObject({ objeto: 'F100001' })
    expect(m.indice.numeroDeObjeto(' f300002 ')).toBe('F300002')
    expect(m.indice.numeroDeObjeto('ZZ00001')).toBeNull()
    await m.estado.receberEventos([e('objeto', 'OB-f-1', { numero: 'F100001', titulo: 'Selo de ferro.' }, 'criar')])
    expect(numeros(await m.consulta.buscar('f100001', opcoes))).toEqual(['F100001'])
    // o número no meio de outras palavras ainda acha o objeto SKC (como "CA00005 zzz")
    expect(numeros(await m.consulta.buscar('F100001 qqqzzz', opcoes))).toEqual(['F100001'])
  })

  it('um objeto SKC é achado pelo número e pelo tipo, com a marca SKC', async () => {
    await m.estado.receberEventos([
      e('objeto', 'OB-a-1', { numero: 'CA00005', titulo: 'Escaraveu. Esteatita.', obraRotulo: 'Autor 1999', figura: '3', sitio: 'SI-a-1' }, 'criar'),
      e('sitio', 'SI-a-1', { nome: 'Tell Novo' }, 'criar'),
    ])
    const pelo = await m.consulta.buscar('ca00005', opcoes)
    expect(numeros(pelo)).toEqual(['CA00005'])
    expect(pelo.objetos[0]).toMatchObject({ numero: 'CA00005', skc: true, tipo: 'Escaraveu', origem: 'Autor 1999, fig. 3', sitio: 'Tell Novo', miniatura: null, display_mode: null })

    const pelaTipo = await m.consulta.buscar('escaraveu', opcoes)
    expect(numeros(pelaTipo)).toEqual(['CA00005'])
    expect(numeros(await m.consulta.buscar('autor 1999', opcoes))).toEqual(expect.arrayContaining(['CA00005']))
  })

  it('Tarefa 9: um objeto SKC só com o período (número provisório, calculado) é achado pelo número e pelo texto', async () => {
    m.pacote.definirFonteDosNumerosDoPacote(m.consultas.numerosDosObjetos)
    await m.estado.receberEventos([
      e('objeto', 'OB-aaaaaaaa-1', { periodo: 'CA', pedido: 'CA00005', titulo: 'Selo quimérico.' }, 'criar'),
      e('objeto', 'OB-aaaaaaaa-2', { periodo: null, titulo: 'Rascunho quimérico.' }, 'criar'),
      e('objeto', 'OB-pipeline-1', { periodo: 'CA', reserva: 'TESTE II', titulo: 'quimérico' }, 'criar'),
    ])
    const r = await m.consulta.buscar('quimérico', opcoes)
    // o pacote sintético vai até CA00004: o objeto SKC é CA00005; a reserva (CA00006) não aparece
    expect(numeros(r)).toEqual(['CA00005'])
    expect(r.objetos[0]).toMatchObject({ itemId: 'OB-aaaaaaaa-1', skc: true, tipo: 'Selo quimérico' })
    expect(r.usuario).toEqual([expect.objectContaining({ tipo: 'objeto', ref: 'OB-aaaaaaaa-2', rotulo: 'Rascunho quimérico.' })])
    expect(numeros(await m.consulta.buscar('ca00005', opcoes))).toEqual(['CA00005'])
    m.pacote.definirFonteDosNumerosDoPacote(null)
  })

  it('decisão 38: "SKC 2" e "SKC: 2" acham o objeto pelo SKC, Nr. (como "TESTE 1" acha o do livro)', async () => {
    await m.estado.receberEventos([
      e('objeto', 'OB-a-1', { numero: 'CA00005', nrSkc: '1', titulo: 'Primeiro.' }, 'criar'),
      e('objeto', 'OB-a-2', { numero: 'BA00007', nrSkc: '2', titulo: 'Segundo.' }, 'criar'),
    ])
    expect(numeros(await m.consulta.buscar('SKC 2', opcoes))).toEqual(['BA00007'])
    expect(numeros(await m.consulta.buscar('SKC: 2', opcoes))).toEqual(['BA00007'])
    expect(numeros(await m.consulta.buscar('skc nr 1', opcoes))).toEqual(['CA00005'])
  })

  describe('revisão 3: referência digitada responde exatamente (decisões 38 e 39)', () => {
    const tres = () =>
      m.estado.receberEventos([
        e('objeto', 'OB-aaaaaaaa-1', { numero: 'CA00005', nrSkc: '1', titulo: 'Primeiro.' }, 'criar'),
        e('objeto', 'OB-aaaaaaaa-12', { numero: 'CA00006', nrSkc: '12', titulo: 'Décimo segundo.' }, 'criar'),
        // Nr. 3 com altura 12 e na página 12: "SKC 12" não pode achá-lo.
        e('objeto', 'OB-aaaaaaaa-3', { numero: 'CA00007', nrSkc: '3', titulo: 'Terceiro.', altura: '12', pagina: '12', obraRotulo: 'Autor 2001' }, 'criar'),
      ])

    it('"SKC 1" acha só o Nr. 1 (nem o 12 por prefixo); "SKC 12" acha só o 12 (nem página nem altura 12)', async () => {
      await tres()
      for (const q of ['SKC 1', 'SKC: 1', 'skc nr 1', 'SKC, Nr. 1']) expect(numeros(await m.consulta.buscar(q, opcoes)), q).toEqual(['CA00005'])
      for (const q of ['SKC 12', 'SKC: 12', 'skc nr 12', 'SKC, Nr. 12', ' skc nr.12 ']) {
        const r = await m.consulta.buscar(q, opcoes)
        expect(numeros(r), q).toEqual(['CA00006'])
        expect(r.usuario, q).toEqual([])
      }
      const nenhum = await m.consulta.buscar('SKC 99', opcoes)
      expect([nenhum.vazia, nenhum.total, nenhum.usuario]).toEqual([false, 0, []])
    })

    it('"skc" sozinho lista os objetos SKC com Nr. (como "TESTE" lista os do livro)', async () => {
      await tres()
      expect(numeros(await m.consulta.buscar('skc', opcoes))).toEqual(['CA00005', 'CA00006', 'CA00007'])
    })

    it('revisão 4: "skc" vale em qualquer posição ("skc escaravelho" e "escaravelho skc"), sem trazer de volta os falsos positivos', async () => {
      await tres()
      await m.estado.receberEventos([e('objeto', 'OB-aaaaaaaa-4', { numero: 'CA00008', nrSkc: '4', titulo: 'Escaravelho. Esteatita.' }, 'criar')])
      for (const q of ['skc escaravelho', 'escaravelho skc', 'SKC Escaravelho', 'skc esca']) expect(numeros(await m.consulta.buscar(q, opcoes)), q).toEqual(['CA00008'])
      expect(numeros(await m.consulta.buscar('SKC 1', opcoes))).toEqual(['CA00005'])
      expect(numeros(await m.consulta.buscar('SKC 12', opcoes))).toEqual(['CA00006'])
    })

    it('"TESTE I: 1", "TESTE 1", "TESTE I, Nr. 1" acham só o objeto do livro, nem uma nota que cita "TESTE I, 1"', async () => {
      await m.estado.receberEventos([e('nota', 'NT-aaaaaaaa-1', { texto: 'parecido com TESTE I, 1', alvoTipo: 'objeto', alvo: 'CA00003' })])
      for (const q of ['TESTE I: 1', 'TESTE 1', 'TESTE I, Nr. 1', 'teste i 1', 'TESTE: 1']) {
        const r = await m.consulta.buscar(q, opcoes)
        expect(numeros(r), q).toEqual(['CA00001'])
        expect(r.objetos[0]!.origem, q).toBe('TESTE I: 1')
      }
      expect(numeros(await m.consulta.buscar('TESTE I: 99', opcoes))).toEqual([])
      expect(numeros(await m.consulta.buscar('TESTE II: 1', opcoes))).toEqual([])
      // Uma sigla que não é de obra aberta é uma busca comum.
      expect(numeros(await m.consulta.buscar('parecido 1', opcoes))).toEqual(['CA00003'])
    })

    it('decisão 40: a nota que CITA a referência (no meio de um intervalo também) aparece no grupo da camada; os objetos continuam exatos', async () => {
      await m.estado.receberEventos([
        e('nota', 'NT-aaaaaaaa-2', { texto: 'Série TESTE I: 1-3, 5', alvoTipo: 'objeto', alvo: 'CA00004' }, 'criar'),
        e('nota', 'NT-aaaaaaaa-3', { texto: 'Outra: TESTE I: 4', alvoTipo: 'verbete', alvo: 'GL-900001' }, 'criar'),
        e('nota', 'NT-aaaaaaaa-4', { texto: 'Do SKC: SKC: 2-4' }, 'criar'),
        e('nota', 'NT-aaaaaaaa-5', { texto: 'Excluída: TESTE I: 2' }, 'criar'),
        e('nota', 'NT-aaaaaaaa-5', {}, 'excluir'),
      ])
      for (const q of ['TESTE I: 2', 'TESTE 2', 'teste i 2']) {
        const r = await m.consulta.buscar(q, opcoes)
        expect(numeros(r), q).toEqual(['CA00002'])
        expect(r.usuario, q).toEqual([expect.objectContaining({ tipo: 'nota', ref: 'NT-aaaaaaaa-2', rotulo: 'Série TESTE I: 1-3, 5', objeto: null })])
      }
      expect((await m.consulta.buscar('TESTE I: 6', opcoes)).usuario).toEqual([])
      expect((await m.consulta.buscar('SKC: 3', opcoes)).usuario.map((a) => a.ref)).toEqual(['NT-aaaaaaaa-4'])
      // só na aba "Tudo" (a nota não é do escopo de termo, local…)
      expect((await m.consulta.buscar('TESTE I: 2', { ...opcoes, escopo: 'termo' })).usuario).toEqual([])
    })
  })

  it('a leitura SKC e a ficha do objeto SKC também são buscadas', async () => {
    await m.estado.receberEventos([e('objeto', 'OB-a-1', { numero: 'BA00007', material: 'esteatita', leitura: 'Um bode-montês sob a palmeira.' }, 'criar')])
    expect(numeros(await m.consulta.buscar('palmeira', opcoes))).toEqual(['BA00007'])
    expect(numeros(await m.consulta.buscar('esteatita', opcoes))).toEqual(['BA00007'])
  })

  it('uma nota excluída some da busca; restaurar traz de volta', async () => {
    await m.estado.receberEventos([e('nota', 'NT-a-1', { texto: 'rastro único zzyzx' })])
    expect((await m.consulta.buscar('zzyzx', opcoes)).usuario).toHaveLength(1)
    await m.estado.receberEventos([e('nota', 'NT-a-1', {}, 'excluir')])
    const sumiu = await m.consulta.buscar('zzyzx', opcoes)
    expect(sumiu.usuario).toEqual([])
    expect(sumiu.total).toBe(0)
    await m.estado.receberEventos([e('nota', 'NT-a-1', {}, 'restaurar')])
    expect((await m.consulta.buscar('zzyzx', opcoes)).usuario).toHaveLength(1)
  })

  it('um objeto SKC excluído some, e a nota dele passa ao grupo à parte', async () => {
    await m.estado.receberEventos([
      e('objeto', 'OB-a-1', { numero: 'CA00005', titulo: 'Escaraveu.' }, 'criar'),
      e('nota', 'NT-a-1', { texto: 'sobre o quimbó', alvoTipo: 'objeto', alvo: 'CA00005' }),
    ])
    expect(numeros(await m.consulta.buscar('quimbó', opcoes))).toEqual(['CA00005'])
    await m.estado.receberEventos([e('objeto', 'OB-a-1', {}, 'excluir')])
    const r = await m.consulta.buscar('quimbó', opcoes)
    expect(r.objetos).toEqual([])
    expect(r.usuario.map((a) => a.ref)).toEqual(['NT-a-1'])
    expect((await m.consulta.buscar('ca00005', opcoes)).total).toBe(0)
  })

  it('escopo "colecao" inclui as coleções SKC (R3 encerrada): a coleção e os objetos dela', async () => {
    await m.estado.receberEventos([
      e('colecao', 'CO-a-1', { nome: 'Minhas notas de leão', 'm:CA00001': true, 'i:CA00001': 1024, 'm:CA00003': true, 'i:CA00003': 2048 }, 'criar'),
      e('nota', 'NT-a-1', { texto: 'leão de teste na coleção?', alvo: 'CA00002' }),
    ])
    const r = await m.consulta.buscar('minhas notas', { ...opcoes, escopo: 'colecao' })
    expect(numeros(r)).toEqual(['CA00001', 'CA00003'])
    expect(r.usuario).toEqual([expect.objectContaining({ tipo: 'colecao', ref: 'CO-a-1', rotulo: 'Minhas notas de leão', skc: true })])
    // o grupo da obra (author_group) continua valendo
    expect(numeros(await m.consulta.buscar('figuras de prova', { ...opcoes, escopo: 'colecao' }))).toEqual(['CA00001', 'CA00002', 'CA00003'])
    // e no "tudo" também aparece, sem sair das outras abas
    expect((await m.consulta.buscar('minhas notas', opcoes)).usuario.map((a) => a.ref)).toEqual(['CO-a-1'])
    expect((await m.consulta.buscar('minhas notas', { ...opcoes, escopo: 'local' })).usuario).toEqual([])
    expect((await m.consulta.buscar('minhas notas', opcoes)).contagensDoUsuario).toMatchObject({ tudo: 1, colecao: 1, local: 0, termo: 0 })
  })

  it('escopo "local": sítios SKC (nome e variantes) e os objetos achados neles', async () => {
    await m.estado.receberEventos([
      e('sitio', 'SI-a-1', { nome: 'Tell Novo', variantes: ['Tall Naw'] }, 'criar'),
      e('objeto', 'OB-a-1', { numero: 'CA00005', sitio: 'SI-a-1' }, 'criar'),
      e('objeto', 'OB-a-2', { numero: 'CA00006', sitio: 'SI-a-2' }, 'criar'),
    ])
    const r = await m.consulta.buscar('tall naw', { ...opcoes, escopo: 'local' })
    expect(numeros(r)).toEqual(['CA00005'])
    expect(r.usuario).toEqual([expect.objectContaining({ tipo: 'sitio', ref: 'SI-a-1', rotulo: 'Tell Novo' })])
    expect(numeros(await m.consulta.buscar('tall naw', opcoes))).toEqual(['CA00005'])
    expect((await m.consulta.buscar('tall naw', { ...opcoes, escopo: 'termo' })).total).toBe(0)
  })

  it('escopo "local": um sítio é achado pelas grafias novas, e as variantes antigas que as grafias substituíram não o acham mais', async () => {
    await m.estado.receberEventos([
      e('sitio', 'SI-a-1', { nome: 'Tell Novo', variantes: ['Tall Antiga'] }, 'criar'),
      e('objeto', 'OB-a-1', { numero: 'CA00005', sitio: 'SI-a-1' }, 'criar'),
      e('sitio', 'SI-a-1', { grafias: [{ texto: 'Tal Grafado', tradicao: 'arabe' }] }),
    ])
    const r = await m.consulta.buscar('tal grafado', { ...opcoes, escopo: 'local' })
    expect(numeros(r)).toEqual(['CA00005'])
    expect(r.usuario).toEqual([expect.objectContaining({ tipo: 'sitio', ref: 'SI-a-1', rotulo: 'Tell Novo' })])
    expect((await m.consulta.buscar('tall antiga', { ...opcoes, escopo: 'local' })).usuario).toEqual([])
    // o app antigo grava variantes DEPOIS: somam-se às grafias
    await m.estado.receberEventos([e('sitio', 'SI-a-1', { variantes: ['Tall Depois'] })])
    expect((await m.consulta.buscar('tall depois', { ...opcoes, escopo: 'local' })).usuario).toEqual([expect.objectContaining({ ref: 'SI-a-1' })])
    expect((await m.consulta.buscar('tal grafado', { ...opcoes, escopo: 'local' })).usuario).toEqual([expect.objectContaining({ ref: 'SI-a-1' })])
  })

  it('escopo "termo": hipóteses SKC (termos e justificativa) e o objeto delas', async () => {
    await m.estado.receberEventos([
      e('hipotese', 'HY-a-1', { termos: ['íbex'], justificativa: 'postura sinuosa incomum', objeto: 'CA00004', nivel: 'iconographic', modalidade: 'probable' }, 'criar'),
      e('hipotese', 'HY-a-2', { termos: ['serpente'], justificativa: 'sem objeto ainda' }, 'criar'),
    ])
    const r = await m.consulta.buscar('sinuosa', { ...opcoes, escopo: 'termo' })
    expect(numeros(r)).toEqual(['CA00004'])
    expect(r.usuario).toEqual([])
    const solta = await m.consulta.buscar('serpente', { ...opcoes, escopo: 'termo' })
    expect(solta.usuario).toEqual([expect.objectContaining({ tipo: 'hipotese', ref: 'HY-a-2' })])
    expect(numeros(await m.consulta.buscar('sinuosa', { ...opcoes, escopo: 'bibliografia' }))).toEqual([])
  })

  it('notas sobre verbete, obra, sítio ou grupo ficam no escopo delas e nunca sob um objeto', async () => {
    await m.estado.receberEventos([
      e('nota', 'NT-a-1', { texto: 'plugh sobre o verbete', alvoTipo: 'verbete', alvo: 'GL-900001' }),
      e('nota', 'NT-a-2', { texto: 'plugh sobre a obra', alvoTipo: 'obra', alvo: 'BIB-900001' }),
    ])
    expect((await m.consulta.buscar('plugh', opcoes)).usuario.map((a) => a.ref).sort()).toEqual(['NT-a-1', 'NT-a-2'])
    expect((await m.consulta.buscar('plugh', { ...opcoes, escopo: 'termo' })).usuario.map((a) => a.ref)).toEqual(['NT-a-1'])
    expect((await m.consulta.buscar('plugh', { ...opcoes, escopo: 'bibliografia' })).usuario.map((a) => a.ref)).toEqual(['NT-a-2'])
    expect((await m.consulta.buscar('plugh', { ...opcoes, escopo: 'colecao' })).usuario).toEqual([])
  })

  it('filtros: objetos SKC têm publicação "SKC", período pelo número, tipo e sítio; hipóteses dão nível e modalidade', async () => {
    await m.estado.receberEventos([
      e('objeto', 'OB-a-1', { numero: 'CA00005', titulo: 'Escaraveu.', leitura: 'bode zebu' }, 'criar'),
      e('objeto', 'OB-a-2', { numero: 'BA00007', titulo: 'Selo.', leitura: 'bode zebu' }, 'criar'),
      e('hipotese', 'HY-a-1', { termos: ['bode'], objeto: 'BA00007', nivel: 'iconological', modalidade: 'possible' }, 'criar'),
      e('nota', 'NT-a-1', { texto: 'bode zebu solto' }),
    ])
    const todos = await m.consulta.buscar('zebu', opcoes)
    expect(numeros(todos)).toEqual(['BA00007', 'CA00005'])
    expect(todos.usuario.map((a) => a.ref)).toEqual(['NT-a-1'])
    const faceta = (r: typeof todos, chave: string) => r.facetas.find((f) => f.chave === chave)?.opcoes.map((o) => [o.valor, o.n])
    expect(faceta(todos, 'publicacao')).toEqual([['SKC', 2]])
    expect(faceta(todos, 'periodo')).toEqual(
      expect.arrayContaining([
        ['CA', 1],
        ['BA', 1],
      ]),
    )
    expect(faceta(todos, 'nivel')).toEqual([['iconological', 1]])

    const so = await m.consulta.buscar('zebu', { ...opcoes, filtros: { tipo: ['Selo'] } })
    expect(numeros(so)).toEqual(['BA00007'])
    expect(so.usuario).toEqual([]) // um acerto sem objeto não tem tipo: não passa por um filtro de objeto
    expect(numeros(await m.consulta.buscar('zebu', { ...opcoes, filtros: { periodo: ['CA'] } }))).toEqual(['CA00005'])
    expect(numeros(await m.consulta.buscar('zebu', { ...opcoes, filtros: { nivel: ['iconological'] } }))).toEqual(['BA00007'])
    // só o filtro "publicação: SKC" mantém os acertos soltos do usuário
    const skc = await m.consulta.buscar('zebu', { ...opcoes, filtros: { publicacao: ['SKC'] } })
    expect(numeros(skc)).toEqual(['BA00007', 'CA00005'])
    expect(skc.usuario.map((a) => a.ref)).toEqual(['NT-a-1'])
    expect(numeros(await m.consulta.buscar('zebu', { ...opcoes, filtros: { publicacao: ['TESTE'] } }))).toEqual([])
  })

  it('Tarefa 10, revisão 4, m6: a hipótese ancorada na leitura SKC de um objeto conta para ELE nos filtros e na busca (como na tela; M13)', async () => {
    // Registrada na tela de OB-…-2 (então o principal) com o trecho na leitura de OB-…-1; a ligação foi desfeita.
    const ancora = { fonte: 'OB-aaaaaaaa-1', lingua: 'skc', inicio: 0, fim: 4, trecho: 'bode', sha: 'a'.repeat(64) }
    await m.estado.receberEventos([
      e('objeto', 'OB-aaaaaaaa-1', { numero: 'CA00005', titulo: 'Escaraveu.', leitura: 'bode zebu' }, 'criar'),
      e('objeto', 'OB-aaaaaaaa-2', { numero: 'BA00007', titulo: 'Selo.', leitura: 'bode zebu' }, 'criar'),
      e('hipotese', 'HY-aaaaaaaa-1', { termos: ['cervideoxyz'], objeto: 'OB-aaaaaaaa-2', nivel: 'iconological', modalidade: 'possible', ancora }, 'criar'),
    ])
    expect(numeros(await m.consulta.buscar('zebu', { ...opcoes, filtros: { nivel: ['iconological'] } }))).toEqual(['CA00005'])
    expect(numeros(await m.consulta.buscar('cervideoxyz', { ...opcoes, escopo: 'termo' }))).toEqual(['CA00005'])
  })

  it('a consulta digitada passa pela mesma montagem: sintaxe do FTS5 não chega ao índice do usuário', async () => {
    await m.estado.receberEventos([e('nota', 'NT-a-1', { texto: "Marduk's e leao" })])
    for (const digitado of ['"mahtes', 'NEAR(', 'leao OR', 'texto:leao', '*marduk']) await expect(m.consulta.buscar(digitado, opcoes)).resolves.toBeTruthy()
    expect((await m.consulta.buscar('marduks', opcoes)).usuario.map((a) => a.ref)).toEqual(['NT-a-1']) // forma colada
    expect((await m.consulta.buscar("marduk's", opcoes)).usuario.map((a) => a.ref)).toEqual(['NT-a-1'])
  })

  it('sem nada do usuário, o resultado do pacote é o mesmo de antes', async () => {
    const r = await m.consulta.buscar('mahtes', opcoes)
    expect(numeros(r)).toEqual(['BA00001', 'CA00001', 'CA00002'])
    expect(r.usuario).toEqual([])
    expect(r.contagensDoUsuario).toEqual({ tudo: 0, termo: 0, local: 0, bibliografia: 0, colecao: 0 })
  })

  it('o limite corta os objetos, mas total e números incluem os SKC', async () => {
    await m.estado.receberEventos([
      e('objeto', 'OB-a-1', { numero: 'CA00005', leitura: 'wxyz' }, 'criar'),
      e('objeto', 'OB-a-2', { numero: 'CA00006', leitura: 'wxyz' }, 'criar'),
      e('objeto', 'OB-a-3', { numero: 'CA00007', leitura: 'wxyz' }, 'criar'),
    ])
    const r = await m.consulta.buscar('wxyz', { ...opcoes, limite: 2 })
    expect(r.total).toBe(3)
    expect(r.objetos).toHaveLength(2)
    expect(r.numeros).toEqual(['CA00005', 'CA00006', 'CA00007'])
  })
})

describe('o índice acompanha a sincronização', () => {
  it('eventos que chegam de outro aparelho entram na busca (sem nenhuma outra chamada)', async () => {
    const nuvem = new DropboxEmMemoria()
    vi.stubGlobal('BroadcastChannel', undefined)
    try {
      const a = await novoAparelho(nuvem, 'Mac')
      const b = await novoAparelho(nuvem, 'iPhone') // o último a carregar: os módulos importados agora são os dele
      // módulos novos do mesmo grafo do aparelho B (estado, sincronização)
      const indice = await import('./indice')
      const consulta = await import('../busca/consulta')
      const cliente = await import('../banco/cliente')
      cliente.usarMotor(await bancoDeTeste())
      try {
        await indice.indexarUsuario(b.estado.estadoAtual(), { tabela })
        expect((await consulta.buscar('mahtes', opcoes)).usuario).toEqual([])

        await a.estado.registrar('nota', 'NT-sinc-1', 'criar', { titulo: 'Do outro aparelho', texto: 'Anotação sobre Maḥteṣ' })
        await a.sync.sincronizar(a.escrita, { motivo: 'manual' })
        const resumo = await b.sync.sincronizar(b.escrita, { motivo: 'manual' })
        expect(resumo.recebidos).toBe(1)

        const r = await consulta.buscar('mahtes', opcoes)
        expect(r.usuario.map((x) => x.ref)).toEqual(['NT-sinc-1'])

        // e uma exclusão que chega depois também
        await a.estado.registrar('nota', 'NT-sinc-1', 'excluir')
        await a.sync.sincronizar(a.escrita, { motivo: 'manual' })
        await b.sync.sincronizar(b.escrita, { motivo: 'manual' })
        expect((await consulta.buscar('mahtes', opcoes)).usuario).toEqual([])
      } finally {
        cliente.usarMotor(null)
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

