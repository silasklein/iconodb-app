// @vitest-environment node
/**
 * Tarefa 3 do plano «O IPIAO lido no formato do §»: as consultas da leitura, sobre o pacote sintético (tests/fixtures/pacote).
 *
 * O `TESTE` é o modelo do catálogo: o volume I, os trechos I.S.3 (txt), I.S.9 (ovw e cap), I.S.10 (dois ovw), I.S.11 e I.S.19
 * (ovw); as entradas 1–6; os grupos GR-TESTE-I-01 (com as subcoleções -01-01 «1.1» e -01-02 «1.2–1.3») e GR-TESTE-I-02. Os
 * rowids dos trechos NÃO estão na ordem do livro. O `TESTEG` (livro em parágrafos) e o `TESTEGEN` (tradução) não são obras de
 * leitura. Tudo inventado (repositório público).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { RAIZ_DO_PACOTE_10, RAIZ_DO_PACOTE_6, RAIZ_DO_PACOTE_8, RAIZ_DO_PACOTE_9 } from '../../tests/suporte/fonteDeTeste'
import { abrirBanco, executar, usarMotor } from './cliente'
import { item } from './consultas'
import { obrasDeLeitura, ordemDaLeitura, passoDaLeitura, passoDoGrupo, passoDoItem, rotaDaEntrada, rotaDoTrecho } from './leitura'

const ORDEM_DO_TESTE = [
  'PA-TESTE-I.S.3-txt-1',
  'PA-TESTE-I.S.9-ovw-1',
  'PA-TESTE-I.S.10-ovw-1',
  '1',
  'PA-TESTE-I.S.10-ovw-2',
  'PA-TESTE-I.S.11-ovw-1',
  '2',
  '3',
  'PA-TESTE-I.S.19-ovw-1',
  '4',
  '5',
  '6',
]

describe('as rotas da leitura', () => {
  it('codificam a sigla e o id', () => {
    expect(rotaDoTrecho('TESTE', 'PA-TESTE-I.S.3-txt-1')).toBe('/ler/TESTE/trecho/PA-TESTE-I.S.3-txt-1')
    expect(rotaDaEntrada('TESTE', '95a')).toBe('/ler/TESTE/entrada/95a')
    expect(rotaDoTrecho('TESTE', 'PA-TESTE-§2/x')).toBe('/ler/TESTE/trecho/PA-TESTE-%C2%A72%2Fx')
  })
})

describe('a leitura no pacote sintético', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
    await abrirBanco()
  })
  afterAll(() => usarMotor(null))

  it('obrasDeLeitura: só o TESTE (o TESTEG é livro em parágrafos e o TESTEGEN, tradução), com o 1º passo de cada volume', async () => {
    expect(await obrasDeLeitura()).toEqual([
      { sigla: 'TESTE', volumes: [{ volume: 'I', rotulo: 'TESTE I', primeiro: rotaDoTrecho('TESTE', 'PA-TESTE-I.S.3-txt-1') }] },
    ])
  })

  it('ordemDaLeitura: as 12 chaves da Tarefa 2, calculadas uma vez; null fora de uma obra de leitura', async () => {
    const ordem = await ordemDaLeitura('TESTE')
    expect(ordem!.map((p) => p.chave)).toEqual(ORDEM_DO_TESTE)
    expect(await ordemDaLeitura('TESTE')).toBe(ordem)
    expect(await ordemDaLeitura('TESTEG')).toBeNull()
    expect(await ordemDaLeitura('TESTEGEN')).toBeNull()
    expect(await ordemDaLeitura('NAOHA')).toBeNull()
  })

  it('o passo de texto da p. 11: título, tipo, posição no bloco, início, alvo, vizinhos, caminho e linhas', async () => {
    const p = (await passoDaLeitura('TESTE', { trecho: 'PA-TESTE-I.S.11-ovw-1' }))!
    expect(p).toMatchObject({
      sigla: 'TESTE',
      volume: 'I',
      obra: 'TESTE I',
      // Tarefa 6: o ano do volume (`volume.year`), para «TESTE I 2020, p. 11» no cabeçalho do alemão e no trilho
      ano: 2020,
      tipo: 'texto',
      rotuloDoTipo: 'subcolecao',
      titulo: 'TESTE I, p. 11',
      pagina: 11,
      posicao: { n: 2, total: 2, de: 'bloco' },
      inicio: rotaDoTrecho('TESTE', 'PA-TESTE-I.S.10-ovw-2'),
      alvo: 'PA-TESTE-I.S.11-ovw-1',
      entrada: null,
    })
    expect(p.anterior).toMatchObject({ rota: rotaDoTrecho('TESTE', 'PA-TESTE-I.S.10-ovw-2'), rotulo: 'p. 10', tipo: 'subcolecao' })
    expect(p.anterior!.frase).toMatch(/^Figuras de prova e sinais de teste/)
    expect(p.seguinte).toMatchObject({ rota: rotaDaEntrada('TESTE', '2'), rotulo: 'TESTE I: 2', tipo: 'entrada' })
    // a frase da entrada é a primeira da descrição, em português
    expect(p.seguinte!.frase).toMatch(/^No verso está o sinal/)
    expect(p.caminho[0]).toBe('TESTE I')
    expect(p.grupos.map((g) => g.id)).toEqual(['GR-TESTE-I-01', 'GR-TESTE-I-01-02'])
    expect(p.caminho).toHaveLength(3)
    expect(p.linhas).toHaveLength(1)
    expect(p.linhas[0]).toMatchObject({ id: 'PA-TESTE-I.S.11-ovw-1', rotulo: null, estado: 'machine', desatualizada: false })
    expect(p.linhas[0]!.texto).toMatch(/^Ein Testzeichen allein/)
    expect(p.linhas[0]!.portugues).toMatch(/^Um sinal de teste sozinho/)
    expect(p.figuras).toEqual([])
    expect(p.referencias).toEqual([])
  })

  it('o primeiro passo de um bloco não tem «início»; o 1º passo do livro não tem anterior', async () => {
    const p10 = (await passoDaLeitura('TESTE', { trecho: 'PA-TESTE-I.S.10-ovw-2' }))!
    expect(p10).toMatchObject({ posicao: { n: 1, total: 2, de: 'bloco' }, inicio: null, alvo: 'PA-TESTE-I.S.10-ovw-2' })
    expect(p10.anterior).toMatchObject({ rotulo: 'TESTE I: 1', tipo: 'entrada' })
    const p3 = (await passoDaLeitura('TESTE', { trecho: 'PA-TESTE-I.S.3-txt-1' }))!
    expect(p3).toMatchObject({ rotuloDoTipo: 'introducao-geral', anterior: null, caminho: [], grupos: [], titulo: 'TESTE I, p. 3' })
    expect(p3.seguinte).toMatchObject({ rotulo: 'p. 9', tipo: 'grupo' })
  })

  it('o trecho da legenda abre o passo da p. 9, que tem o panorama e o «Mapa», e as figuras que ele cita', async () => {
    const p = (await passoDaLeitura('TESTE', { trecho: 'PA-TESTE-I.S.9-cap-1' }))!
    expect(p).toMatchObject({ titulo: 'TESTE I, p. 9', rotuloDoTipo: 'grupo', alvo: 'PA-TESTE-I.S.9-cap-1', posicao: { n: 1, total: 1, de: 'bloco' } })
    expect(p.linhas.map((l) => [l.id, l.rotulo])).toEqual([
      ['PA-TESTE-I.S.9-ovw-1', null],
      ['PA-TESTE-I.S.9-cap-1', 'Mapa'],
    ])
    // a legenda não tem tradução
    expect(p.linhas[1]).toMatchObject({ portugues: null, estado: null, termos: [] })
    expect(p.linhas[0]!.termos).toEqual([
      { glId: 'GL-900001', inicio: 41, fim: 55 },
      { glId: 'GL-900002', inicio: 58, fim: 75 },
    ])
    expect(p.figuras.map((f) => f.itemId)).toEqual(['TESTE-0001', 'TESTE-0002', 'TESTE-0003'])
    // as menções, item por item, com o objeto: os links dos números do catálogo no texto («(1–3)»)
    expect(p.referencias).toEqual([
      { itemId: 'TESTE-0001', objeto: 'CA00001', numero: 1, sufixo: '', volume: 'I' },
      { itemId: 'TESTE-0002', objeto: 'CA00002', numero: 2, sufixo: '', volume: 'I' },
      { itemId: 'TESTE-0003', objeto: 'CA00003', numero: 3, sufixo: '', volume: 'I' },
    ])
    expect(p.grupos.map((g) => g.id)).toEqual(['GR-TESTE-I-01'])
  })

  it('o passo da entrada 1: título, linhas (a descrição e os campos 3–5), a peça, a posição na subcoleção e os vizinhos', async () => {
    const p = (await passoDaLeitura('TESTE', { entrada: '1' }))!
    expect(p).toMatchObject({
      sigla: 'TESTE',
      volume: 'I',
      obra: 'TESTE I',
      tipo: 'entrada',
      rotuloDoTipo: 'entrada',
      titulo: 'TESTE I: 1',
      pagina: 10,
      posicao: { n: 1, total: 1, de: 'subcolecao' },
      inicio: null,
      alvo: null,
    })
    expect(p.linhas.map((l) => [l.id, l.rotulo])).toEqual([
      ['PA-TESTE-0001-cat-1', 'Descrição'],
      ['TESTE-0001#3', '3 · Local e contexto do achado'],
      ['TESTE-0001#4', '4 · Época e datação'],
      ['TESTE-0001#5', '5 · Suporte, material e estado'],
    ])
    expect(p.linhas.every((l) => l.portugues !== null)).toBe(true)
    expect(p.linhas[0]!.texto).toMatch(/^Der Probeanhänger zeigt/)
    expect(p.linhas[1]).toMatchObject({ estado: 'machine', desatualizada: false, termos: [{ glId: 'GL-900004', inicio: 0, fim: 12 }] })
    expect(p.entrada!.numero).toBe((await item('TESTE-0001'))!.numero)
    expect(p.entrada!.itemId).toBe('TESTE-0001')
    expect(p.figuras).toEqual([])
    expect(p.grupos.map((g) => g.id)).toEqual(['GR-TESTE-I-01', 'GR-TESTE-I-01-01'])
    expect(p.anterior).toMatchObject({ rota: rotaDoTrecho('TESTE', 'PA-TESTE-I.S.10-ovw-1'), rotulo: 'p. 10', tipo: 'subcolecao' })
    expect(p.seguinte).toMatchObject({ rota: rotaDoTrecho('TESTE', 'PA-TESTE-I.S.10-ovw-2'), rotulo: 'p. 10', tipo: 'subcolecao' })
  })

  it('a entrada direto no grupo (3) conta «do grupo»; a 5 é a 2.ª de 3, com o início na 4; a 6 fecha o livro', async () => {
    expect(await passoDaLeitura('TESTE', { entrada: '3' })).toMatchObject({ posicao: { n: 1, total: 1, de: 'grupo' }, inicio: null })
    const cinco = (await passoDaLeitura('TESTE', { entrada: '5' }))!
    expect(cinco).toMatchObject({ posicao: { n: 2, total: 3, de: 'grupo' }, inicio: rotaDaEntrada('TESTE', '4') })
    expect(cinco.grupos.map((g) => g.id)).toEqual(['GR-TESTE-I-02'])
    expect(await passoDaLeitura('TESTE', { entrada: '6' })).toMatchObject({ seguinte: null, anterior: { rotulo: 'TESTE I: 5' } })
  })

  it('o passo que não existe: null (trecho que sumiu, número que não há, número com letra, obra que não é de leitura)', async () => {
    expect(await passoDaLeitura('TESTE', { trecho: 'PA-TESTE-NAO-EXISTE' })).toBeNull()
    expect(await passoDaLeitura('TESTE', { entrada: '99' })).toBeNull()
    expect(await passoDaLeitura('TESTE', { entrada: '1x' })).toBeNull()
    // a descrição de uma entrada não é passo de texto
    expect(await passoDaLeitura('TESTE', { trecho: 'PA-TESTE-0001-cat-1' })).toBeNull()
    expect(await passoDaLeitura('TESTEG', { trecho: 'PA-TESTEG-§2-txt-1' })).toBeNull()
    expect(await passoDaLeitura('NAOHA', { entrada: '1' })).toBeNull()
  })

  it('passoDoGrupo e passoDoItem: a rota do 1º passo do bloco do grupo e a do passo da entrada', async () => {
    expect(await passoDoGrupo('GR-TESTE-I-02')).toBe(rotaDoTrecho('TESTE', 'PA-TESTE-I.S.19-ovw-1'))
    expect(await passoDoGrupo('GR-TESTE-I-01')).toBe(rotaDoTrecho('TESTE', 'PA-TESTE-I.S.9-ovw-1'))
    expect(await passoDoGrupo('GR-TESTE-I-01-02')).toBe(rotaDoTrecho('TESTE', 'PA-TESTE-I.S.10-ovw-2'))
    expect(await passoDoGrupo('GR-TESTEG-01')).toBeNull()
    expect(await passoDoGrupo('GR-NAO-HA')).toBeNull()
    expect(await passoDoItem('TESTE-0003')).toBe(rotaDaEntrada('TESTE', '3'))
    expect(await passoDoItem('TESTEG-0001a')).toBeNull()
    expect(await passoDoItem('NAO-HA')).toBeNull()
  })
})

describe('linhas que o pacote sintético não tem, gravadas num banco de escrita', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    // uma segunda faixa de páginas: do text_page 15 em diante, a página impressa é 4 a mais
    await executar("UPDATE pub_TESTE.volume SET page_offsets = '[[0, 0], [15, 4]]' WHERE volume = 'I'")
    // o campo 5 da entrada 2 vazio; o campo 3 da entrada 1 com a tradução desatualizada
    await executar("UPDATE pub_TESTE.catalog_field SET literal = '  ' WHERE unit_id = 'TESTE-0002#5'")
    await executar("UPDATE pub_TESTE.catalog_field SET translation_stale = 1 WHERE unit_id = 'TESTE-0001#3'")
    // a descrição da entrada 1 cita a entrada 3 e a si mesma; o trecho da p. 10 perde o português
    await executar(
      "INSERT INTO pub_TESTE.passage_item (passage_id, item_id, role) VALUES ('PA-TESTE-0001-cat-1', 'TESTE-0003', 'mentions'), ('PA-TESTE-0001-cat-1', 'TESTE-0001', 'mentions')",
    )
    await executar("DELETE FROM pub_TESTE.unit_pt_render WHERE unit_id = 'PA-TESTE-I.S.10-ovw-2'")
  })
  afterAll(() => usarMotor(null))

  it('a página impressa da entrada soma o deslocamento da última faixa cujo início é ≤ text_page', async () => {
    expect((await passoDaLeitura('TESTE', { entrada: '1' }))!.pagina).toBe(10)
    expect((await passoDaLeitura('TESTE', { entrada: '4' }))!.pagina).toBe(24)
  })

  it('o campo vazio não aparece; a tradução desatualizada vem marcada', async () => {
    const dois = (await passoDaLeitura('TESTE', { entrada: '2' }))!
    expect(dois.linhas.map((l) => l.rotulo)).toEqual(['Descrição', '3 · Local e contexto do achado', '4 · Época e datação'])
    const um = (await passoDaLeitura('TESTE', { entrada: '1' }))!
    expect(um.linhas.find((l) => l.id === 'TESTE-0001#3')).toMatchObject({ desatualizada: true })
  })

  it('as figuras da entrada são as que a descrição cita, sem a própria peça', async () => {
    const um = (await passoDaLeitura('TESTE', { entrada: '1' }))!
    expect(um.figuras.map((f) => f.itemId)).toEqual(['TESTE-0003'])
    expect(um.referencias).toEqual([{ itemId: 'TESTE-0003', objeto: 'CA00003', numero: 3, sufixo: '', volume: 'I' }])
    expect(um.entrada!.itemId).toBe('TESTE-0001')
  })

  it('sem português, a linha tem o original, e a frase do vizinho vem do original', async () => {
    const p = (await passoDaLeitura('TESTE', { trecho: 'PA-TESTE-I.S.10-ovw-2' }))!
    expect(p.linhas[0]).toMatchObject({ portugues: null, termos: [] })
    const seguinte = (await passoDaLeitura('TESTE', { trecho: 'PA-TESTE-I.S.11-ovw-1' }))!
    expect(seguinte.anterior!.frase).toMatch(/^Prüfgestalten und Testzeichen/)
  })
})

describe('fix final (m3): a própria peça não aparece nas citadas da descrição', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    // uma segunda peça do objeto da entrada 1 (CA00001), inventada, e a descrição da entrada 1 a cita, com a entrada 3
    await executar("INSERT INTO pub_TESTE.item (id, publication, kind, number, suffix, volume) VALUES ('TESTE-F099', 'TESTE', 'figura', 199, '', 'I')")
    await executar("INSERT INTO main.object_member (object_id, item_id, publication) VALUES ('CA00001', 'TESTE-F099', 'TESTE')")
    await executar(
      "INSERT INTO pub_TESTE.passage_item (passage_id, item_id, role) VALUES ('PA-TESTE-0001-cat-1', 'TESTE-F099', 'mentions'), ('PA-TESTE-0001-cat-1', 'TESTE-0003', 'mentions')",
    )
  })
  afterAll(() => usarMotor(null))

  it('outra peça do mesmo objeto, citada na descrição, não traz o objeto da entrada às «Citadas na descrição»', async () => {
    const um = (await passoDaLeitura('TESTE', { entrada: '1' }))!
    expect(um.entrada!.numero).toBe('CA00001')
    expect(um.figuras.map((f) => f.numero)).toEqual(['CA00003'])
  })
})

describe('a leitura num pacote 8 (sem subcoleções e sem author_group_passage)', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ raiz: RAIZ_DO_PACOTE_8 }))
    await abrirBanco()
  })
  afterAll(() => usarMotor(null))

  it('a ordem sai sem subcoleções e não quebra; toda entrada aparece uma vez', async () => {
    const ordem = (await ordemDaLeitura('TESTE'))!
    expect(ordem.map((p) => p.chave)).toEqual([
      'PA-TESTE-I.S.3-txt-1',
      'PA-TESTE-I.S.9-ovw-1',
      '1',
      '2',
      '3',
      'PA-TESTE-I.S.19-ovw-1',
      '4',
      '5',
      '6',
    ])
    const entradas = ordem.filter((p) => p.tipo === 'entrada').map((p) => p.chave)
    expect(new Set(entradas).size).toBe(entradas.length)
    expect([...entradas].sort()).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(ordem.filter((p) => p.tipo === 'texto').every((p) => p.rotulo !== 'subcolecao')).toBe(true)
  })

  it('o passo da entrada e o do grupo, sem subcoleção', async () => {
    const p = (await passoDaLeitura('TESTE', { entrada: '2' }))!
    expect(p).toMatchObject({ titulo: 'TESTE I: 2', posicao: { n: 2, total: 3, de: 'grupo' }, inicio: rotaDaEntrada('TESTE', '1') })
    expect(p.grupos.map((g) => g.id)).toEqual(['GR-TESTE-I-01'])
    expect(await passoDoGrupo('GR-TESTE-I-01')).toBe(rotaDoTrecho('TESTE', 'PA-TESTE-I.S.9-ovw-1'))
  })
})

describe.each([
  ['6', RAIZ_DO_PACOTE_6],
  ['8', RAIZ_DO_PACOTE_8],
  ['9', RAIZ_DO_PACOTE_9],
  ['10', RAIZ_DO_PACOTE_10],
])('fix final (m6): a leitura inteira num pacote %s de antes', (_schema, raiz) => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ raiz }))
    await abrirBanco()
  })
  afterAll(() => usarMotor(null))

  it('todo passo abre, sem quebrar; toda entrada do catálogo aparece uma vez', async () => {
    const ordem = (await ordemDaLeitura('TESTE'))!
    expect(ordem.length).toBeGreaterThan(0)
    for (const p of ordem) {
      const alvo = p.tipo === 'texto' ? { trecho: p.trechos[0]! } : { entrada: p.chave }
      const passo = await passoDaLeitura('TESTE', alvo)
      expect(passo, `${p.tipo} ${p.chave}`).not.toBeNull()
      expect(passo!.volume).toBe(p.volume)
      // os outros trechos do passo de texto abrem o mesmo passo
      if (p.tipo === 'texto') for (const t of p.trechos) expect((await passoDaLeitura('TESTE', { trecho: t }))!.titulo).toBe(passo!.titulo)
    }
    const catalogo = await executar<{ number: number; suffix: string }>("SELECT number, suffix FROM pub_TESTE.item WHERE kind = 'catalog' AND publication = 'TESTE'")
    const entradas = ordem.filter((p) => p.tipo === 'entrada').map((p) => p.chave)
    expect(new Set(entradas).size).toBe(entradas.length)
    expect([...entradas].sort()).toEqual(catalogo.map((l) => `${l.number}${l.suffix}`).sort())
  })

  it('passoDoItem e passoDoGrupo: toda entrada e todo grupo chegam a um passo da ordem, sem quebrar', async () => {
    const ordem = (await ordemDaLeitura('TESTE'))!
    const rotas = new Set(ordem.map((p) => (p.tipo === 'texto' ? rotaDoTrecho('TESTE', p.chave) : rotaDaEntrada('TESTE', p.chave))))
    for (const p of ordem) if (p.tipo === 'entrada') expect(await passoDoItem(p.itemId)).toBe(rotaDaEntrada('TESTE', p.chave))
    const grupos = await executar<{ id: string }>("SELECT id FROM pub_TESTE.author_group WHERE publication = 'TESTE'")
    expect(grupos.length).toBeGreaterThan(0)
    for (const { id } of grupos) {
      const rota = await passoDoGrupo(id)
      expect(rota, id).not.toBeNull()
      expect(rotas.has(rota!), `${id} → ${rota}`).toBe(true)
    }
  })
})
