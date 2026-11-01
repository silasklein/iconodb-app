// @vitest-environment node
/**
 * Consultas sobre o pacote sintético (tests/fixtures/pacote), com o sqlite-wasm em
 * memória no Node. O pacote tem 6 objetos (CA00001–CA00004, BA00001–BA00002, um item
 * TESTE-000N cada), 9 hipóteses, 9 verbetes e dois grupos de 3 itens.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { armazemComPacote, bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { armazemMemoria } from '../pacote/armazem'
import { abrirBanco, ErroSemPacote, executar, reabrirBanco, usarMotor } from './cliente'
import {
  contagens,
  grupo,
  grupos,
  hipotese,
  item,
  obra,
  obras,
  pendencias,
  regioes,
  sitio,
  sitios,
  verbete,
  verbetes,
  vizinhos,
} from './consultas'
import { arquivosDoBanco, esquemaDaPublicacao, planoDeImportacao } from './nucleo'

const pontosDeCodigo = (texto: string, inicio: number, fim: number) => [...texto].slice(inicio, fim).join('')

describe('consultas sobre o pacote sintético', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
  })
  afterAll(() => usarMotor(null))

  it('abre o pacote com uma publicação por esquema anexado', async () => {
    expect(await abrirBanco()).toMatchObject({ estado: 'aberto', publicacoes: [{ sigla: 'TESTE', esquema: 'pub_TESTE' }] })
  })

  it('contagens() bate com o pacote', async () => {
    expect(await contagens()).toEqual({ objetos: 6, hipoteses: 9, verbetes: 9 })
    // e com o que está nos bancos, contado à parte
    const [o] = await executar<{ n: number }>('SELECT count(*) AS n FROM main.object')
    const [h] = await executar<{ n: number }>('SELECT count(*) AS n FROM pub_TESTE.hypothesis')
    const [v] = await executar<{ n: number }>('SELECT count(*) AS n FROM main.glossary_entry')
    expect(await contagens()).toEqual({ objetos: o!.n, hipoteses: h!.n, verbetes: v!.n })
  })

  it('o banco é só de leitura', async () => {
    await expect(executar("UPDATE main.object SET period_code = 'X'")).rejects.toThrow(/readonly/i)
  })

  it('pendencias() soma a fila de revisão de todas as bases, por tipo', async () => {
    const p = await pendencias()
    const [c] = await executar<{ n: number }>('SELECT count(*) AS n FROM main.review_queue')
    const [q] = await executar<{ n: number }>('SELECT count(*) AS n FROM pub_TESTE.review_queue')
    expect(p.total).toBe(c!.n + q!.n)
    expect(p.total).toBe(2)
    expect(p.porTipo.map((t) => [t.tipo, t.quantidade])).toEqual([
      ['citacao_nao_resolvida', 1],
      ['traducao_termo_alterado', 1],
    ])
    expect(p.porTipo[0]!.rotulo).toBe('Citações não resolvidas')
    expect(p.porTipo.reduce((s, t) => s + t.quantidade, 0)).toBe(p.total)
  })

  it('item() do item com 𓀀 traz termos e âncoras em code points', async () => {
    const it2 = await item('CA00002')
    expect(it2).not.toBeNull()
    const leitura = it2!.leituras[0]!
    expect(it2!.leituras).toHaveLength(1)
    expect(leitura.fonte).toBe('TESTE I, 2')
    expect(leitura.texto).toContain('𓀀')
    expect(leitura.termos).toEqual([{ glId: 'GL-900001', inicio: 38, fim: 51 }])
    // em code points o recorte é o termo; em UTF-16 (o índice nativo do JS) não seria
    expect(pontosDeCodigo(leitura.texto!, 38, 51)).toBe('leão-de-teste')
    expect(leitura.texto!.slice(38, 51)).not.toBe('leão-de-teste')
    expect(leitura.ancoras).toEqual([
      { hipoteseId: 'HY-900003', glId: 'GL-900001', inicio: 38, fim: 51, nivel: 'iconographic', modalidade: 'probable' },
    ])
    // a hipótese sem âncora (termo_ausente) fica só nas hipóteses por nível
    expect(it2!.hipotesesPorNivel.iconological.map((h) => h.id)).toEqual(['HY-900004'])
    expect(it2!.hipotesesPorNivel.iconological[0]!.ancora).toMatchObject({ metodo: 'termo_ausente', inicio: null })
  })

  it('item() aceita o número do objeto ou o id do item, e traz a ficha', async () => {
    const porItem = await item('TESTE-0001')
    const porNumero = await item('CA00001')
    expect(porItem).toEqual(porNumero)
    const i = porNumero!
    expect(i.numero).toBe('CA00001')
    expect(i.origem).toBe('TESTE I, 1')
    expect(i.itens).toEqual([{ id: 'TESTE-0001', publicacao: 'TESTE', tipo: 'catalog', origem: 'TESTE I, 1' }])
    expect(i.tipo).toBe('Pingente com leão-de-teste')
    expect(i.descricao).toBe('Pingente com leão-de-teste. Pedra de teste.')
    expect(i.sitio).toMatchObject({ id: 'TESTE-1', nome: 'Maḥraṣ Teste', glId: 'GL-900004', certeza: 'certain' })
    expect(i.acervo).toBe('Musterstadt, Testmuseum, Inv. T-0001')
    expect(i.medidas).toEqual({
      texto: 'H 4,2; B 3,1.',
      valores: [
        { dim: 'H', cm: 4.2, qualificador: null },
        { dim: 'B', cm: 3.1, qualificador: null },
      ],
    })
    expect(i.datacoes).toEqual([
      expect.objectContaining({ esquema: 'TESTE', periodoDe: 'Frühes Test-Chalkolithikum', anoDe: -4500, anoAte: -4000, cssl: [{ codigo: 'CHAL', relacao: 'within', aproximada: false }] }),
    ])
    expect(i.catalogo.map((c) => c.categoria)).toEqual([3, 4, 5, 6, 7, 8])
    expect(i.catalogo[0]).toMatchObject({ itemId: 'TESTE-0001', texto: expect.stringContaining('Maḥraṣ Teste'), termos: [{ glId: 'GL-900004', inicio: 0, fim: 12 }] })
    expect(i.catalogo[3]).toMatchObject({ categoria: 6, literal: 'H 4,2; B 3,1.', texto: null, termos: [] })
    expect(i.hipotesesPorNivel.pre_iconographic.map((h) => h.id)).toEqual(['HY-900002'])
    expect(i.hipotesesPorNivel.iconographic.map((h) => h.id)).toEqual(['HY-900001'])
    expect(i.hipotesesPorNivel.iconographic[0]).toMatchObject({
      alvo: { tipo: 'item', id: 'TESTE-0001', numero: 'CA00001', rotulo: null },
      termos: [{ glId: 'GL-900001', pt: 'leão-de-teste', de: 'Testlöwe' }],
      autores: [
        { nome: 'Autora, Primeira Teste', papel: 'author' },
        { nome: 'Autor, Segundo Teste', papel: 'author' },
      ],
      citacao: 'Testlöwen',
    })
    expect(i.relacoes.paralelos).toEqual([
      { grau: 'comparable', numero: 'CA00002', itemId: 'TESTE-0002', externo: null, semelhanca: null, locator: 'TESTE I, Nr. 1' },
      { grau: 'strict', numero: null, itemId: null, externo: 'Autor 1999: 14 Nr. 5', semelhanca: null, locator: 'TESTE I, Nr. 1' },
    ])
    expect(i.bibliografia.map((b) => b.bruto)).toEqual(['Autor 1999: 12 Nr. 3', 'Autor 1999: 14 Nr. 5'])
    expect(i.bibliografia[0]).toMatchObject({ obraId: 'BIB-900001', curta: 'Autor 1999', chicago: expect.stringContaining('Achados de teste') })
    expect(i.grupos).toEqual([{ id: 'GR-TESTE-I-01', titulo: 'Animais de teste e figuras de prova' }])
  })

  it('item() traz as imagens com display_mode e os caminhos do pacote', async () => {
    const i = await item('CA00001')
    expect(i!.imagens).toEqual([
      expect.objectContaining({ id: 'IMG-TESTE-0001-1', ordinal: 1, display_mode: 'traco', tela: 'imagens/TESTE/TESTE-0001/screen-1.webp', miniatura: 'imagens/TESTE/TESTE-0001/thumb-1.webp' }),
      expect.objectContaining({ id: 'IMG-TESTE-0001-2', ordinal: 2, display_mode: 'tons', tela: 'imagens/TESTE/TESTE-0001/screen-2.webp' }),
    ])
  })

  it('item() de um número que não existe dá null', async () => {
    expect(await item('XX99999')).toBeNull()
  })

  it('hipótese sobre um elemento conta para o item do elemento, com o rótulo do elemento', async () => {
    const i = await item('CA00003')
    const h = i!.hipotesesPorNivel.pre_iconographic.find((x) => x.id === 'HY-900005')
    expect(h).toMatchObject({ alvo: { tipo: 'element', id: 'EL-900001', numero: 'CA00003', rotulo: 'figura denteada' } })
    expect(await hipotese('HY-900005')).toEqual(h)
    expect(await hipotese('HY-000000')).toBeNull()
  })

  it('vizinhos dentro do grupo dá a posição 2 / 3', async () => {
    expect(await vizinhos('CA00002', { tipo: 'grupo', id: 'GR-TESTE-I-01' })).toEqual({
      anterior: 'CA00001',
      proximo: 'CA00003',
      posicao: 2,
      total: 3,
    })
    expect(await vizinhos('TESTE-0001', { tipo: 'grupo', id: 'GR-TESTE-I-01' })).toEqual({
      anterior: null,
      proximo: 'CA00002',
      posicao: 1,
      total: 3,
    })
    expect(await vizinhos('CA00004', { tipo: 'grupo', id: 'GR-TESTE-I-01' })).toBeNull()
  })

  it('vizinhos numa lista (a busca passa os ids na ordem dela)', async () => {
    expect(await vizinhos('BA00001', { tipo: 'lista', ids: ['CA00003', 'TESTE-0005', 'CA00001'] })).toEqual({
      anterior: 'CA00003',
      proximo: 'CA00001',
      posicao: 2,
      total: 3,
    })
  })

  it('grupos() lista os grupos na ordem, com contagens e capa', async () => {
    const gs = await grupos()
    expect(gs.map((g) => g.id)).toEqual(['GR-TESTE-I-01', 'GR-TESTE-I-02'])
    expect(gs[0]).toMatchObject({
      publicacao: 'TESTE',
      volume: 'I',
      titulo: 'Animais de teste e figuras de prova',
      tituloDe: '1. Testtiere und Probefiguren',
      periodo: 'Calcolítico (fase de teste)',
      caminho: ['Chalkolithikum (Teststufe)', '1. Testtiere und Probefiguren'],
      objetos: 3,
      imagens: 4,
      hipoteses: 7,
      capa: { miniatura: 'imagens/TESTE/TESTE-0001/thumb-1.webp', display_mode: 'traco' },
    })
    expect(await grupos('OUTRA')).toEqual([])
  })

  it('grupo() traz a introdução e os objetos na ordem de author_group_item', async () => {
    const g = await grupo('GR-TESTE-I-02')
    expect(g!.itens.map((o) => o.numero)).toEqual(['CA00004', 'BA00001', 'BA00002'])
    expect(g!.itens[1]).toMatchObject({ itemId: 'TESTE-0005', origem: 'TESTE I, 5', tipo: 'Selo de teste', sitio: 'Maḥraṣ Teste', miniatura: 'imagens/TESTE/TESTE-0005/thumb-1.webp', display_mode: 'tons' })
    expect(g!.introducao).toMatchObject({ id: 'PA-TESTE-I.S.19-ovw-1', texto: expect.stringContaining('selos de teste'), termos: [{ glId: 'GL-900009', inicio: 3, fim: 17 }] })
    expect(await grupo('GR-NAO-EXISTE')).toBeNull()
  })

  it('verbete(), obra(), obras(), verbetes(), sitios() e sitio()', async () => {
    const v = await verbete('GL-900001')
    expect(v).toMatchObject({ id: 'GL-900001', tipo: 'concept', pt: 'leão-de-teste', de: 'Testlöwe', en: 'test lion', status: 'approved', variantes: ['Testlöwe', 'Testlöwen'] })
    expect(v!.iconclass).toEqual([{ notacao: '99A1', pt: 'leão-de-teste (inventado)', de: 'Testlöwe (erfunden)', en: 'test lion (invented)' }])
    expect(v!.sssl).toEqual([{ codigo: '9.1', rotulo: 'Invented test animal' }])
    expect(v!.hipoteses.map((h) => h.id)).toEqual(['HY-900001', 'HY-900003'])
    expect(v!.objetos.map((o) => o.numero)).toEqual(['CA00001', 'CA00002'])
    const filho = await verbete('GL-900007')
    expect(filho!.pai).toEqual({ id: 'GL-900001', pt: 'leão-de-teste' })
    const lugar = await verbete('GL-900004')
    expect(lugar!.objetos.map((o) => o.numero)).toEqual(['CA00001', 'CA00002', 'BA00001'])
    expect(await verbete('GL-000000')).toBeNull()
    expect((await verbetes()).map((x) => x.id)).toHaveLength(9)

    const o = await obra('BIB-900002')
    expect(o).toMatchObject({ id: 'BIB-900002', curta: 'Autora 2004', citadaComo: { TESTE: ['Autora 2004'] } })
    expect(o!.titulo).toContain('Marduk')
    expect(o!.objetos.map((x) => x.numero)).toEqual(['BA00001', 'BA00002'])
    expect(await obras()).toEqual([
      expect.objectContaining({ id: 'BIB-900001', curta: 'Autor 1999', objetos: 4 }),
      expect.objectContaining({ id: 'BIB-900002', curta: 'Autora 2004', objetos: 2 }),
    ])

    const ss = await sitios()
    expect(ss.map((s) => [s.id, s.nome, s.objetos])).toEqual([
      ['TESTE-1', 'Maḥraṣ Teste', 3],
      ['TESTE-2', 'Tell Probe Teste', 3],
    ])
    const s = await sitio('TESTE-2')
    expect(s).toMatchObject({ id: 'TESTE-2', literal: 'Tell Probe Teste', metodo: 'gazetteer', lat: 31.9132, lon: 35.2071 })
    expect(s!.objetos.map((x) => x.numero)).toEqual(['CA00003', 'CA00004', 'BA00002'])
    expect(await sitio('TESTE-99')).toBeNull()
    expect(await sitio('lixo')).toBeNull()
  })

  it('regioes(imagemId) traz o selector cru, os pontos e o nome do elemento', async () => {
    expect(await regioes('IMG-TESTE-0003-1')).toEqual([
      {
        id: 1,
        elementoId: 'EL-900001',
        elemento: 'figura denteada',
        elementoDe: 'Zackenfigur',
        selector: '<polygon points="0.30,0.25 0.70,0.25 0.62,0.75 0.38,0.75"/>',
        pontos: [
          [0.3, 0.25],
          [0.7, 0.25],
          [0.62, 0.75],
          [0.38, 0.75],
        ],
      },
    ])
    expect(await regioes('IMG-TESTE-0001-1')).toEqual([])
  })
})

describe('grupo() segue author_group_item.ordinal', () => {
  afterAll(() => usarMotor(null))

  it('a ordem muda quando o ordinal muda (não é a ordem dos ids)', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    await executar("UPDATE pub_TESTE.author_group_item SET ordinal = 4 - ordinal WHERE group_id = 'GR-TESTE-I-01'")
    expect((await grupo('GR-TESTE-I-01'))!.itens.map((o) => o.numero)).toEqual(['CA00003', 'CA00002', 'CA00001'])
    expect(await vizinhos('CA00003', { tipo: 'grupo', id: 'GR-TESTE-I-01' })).toMatchObject({ posicao: 1, total: 3 })
  })

  it("hipóteses e elementos com target_type 'artifact' ainda não se ligam a item nenhum", async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    // Elemento de artefato com o mesmo id de alvo de um item: não pode cair no item.
    await executar(`INSERT INTO pub_TESTE.element (id, label, target_type, target_id) VALUES ('EL-ART-1', 'Probeteil', 'artifact', 'TESTE-0001')`)
    await executar(`INSERT INTO pub_TESTE.hypothesis (id, target_type, target_id, level, modality) VALUES
                      ('HY-ART-1', 'artifact', 'VA-000001', 'iconographic', 'possible'),
                      ('HY-ART-2', 'element', 'EL-ART-1', 'iconographic', 'possible')`)
    const todas = Object.values((await item('CA00001'))!.hipotesesPorNivel).flat().map((h) => h.id)
    expect(todas).not.toContain('HY-ART-1')
    expect(todas).not.toContain('HY-ART-2')
    expect((await grupos())[0]!.hipoteses).toBe(7)
    expect(await hipotese('HY-ART-1')).toMatchObject({ alvo: { tipo: 'artifact', id: 'VA-000001', itemId: null, numero: null } })
    expect(await hipotese('HY-ART-2')).toMatchObject({ alvo: { tipo: 'element', itemId: null, numero: null, rotulo: 'Probeteil' } })
  })

  it('remissões do texto (inclusive órfã) e hipóteses sobre outros objetos sustentadas pelo texto', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    await executar(`INSERT INTO pub_TESTE.passage_item VALUES ('PA-TESTE-0001-cat-1', 'TESTE-0099', 'mentions'),
                      ('PA-TESTE-0001-cat-1', 'TESTE-0002', 'mentions')`)
    await executar("UPDATE pub_TESTE.hypothesis SET passage_id = 'PA-TESTE-0001-cat-1', cited_from_item = 'TESTE-0001' WHERE id = 'HY-900003'")
    const i = await item('CA00001')
    expect(i!.relacoes.remissoes).toEqual([
      { itemId: 'TESTE-0002', numero: 'CA00002', origem: 'TESTE I, 2' },
      { itemId: 'TESTE-0099', numero: null, origem: null },
    ])
    expect(i!.outrasHipoteses.map((h) => [h.id, h.alvo.numero, h.citadaDe])).toEqual([['HY-900003', 'CA00002', 'TESTE-0001']])
    expect(Object.values(i!.hipotesesPorNivel).flat().map((h) => h.id)).not.toContain('HY-900003')
  })
})

describe('sem pacote e reabertura', () => {
  afterAll(() => usarMotor(null))

  it('sem estado.json o banco fica "sem pacote" e as consultas recusam', async () => {
    usarMotor(await bancoDeTeste({ armazem: armazemMemoria() }))
    expect(await abrirBanco()).toEqual({ estado: 'sem-pacote' })
    await expect(contagens()).rejects.toBeInstanceOf(ErroSemPacote)
  })

  it('reabrirBanco() passa a ver o pacote que chegou depois', async () => {
    const armazem = armazemMemoria()
    usarMotor(await bancoDeTeste({ armazem }))
    expect(await abrirBanco()).toEqual({ estado: 'sem-pacote' })
    const cheio = await armazemComPacote()
    for (const c of await cheio.listar('')) await armazem.gravar(c, (await cheio.ler(c))!)
    expect((await reabrirBanco()).estado).toBe('aberto')
    expect((await contagens()).objetos).toBe(6)
  })
})

describe('falha ao abrir', () => {
  afterAll(() => usarMotor(null))

  it('uma abertura que falha não deixa estado guardado: a seguinte tenta de novo', async () => {
    const armazem = await armazemComPacote()
    const blobs = await armazem.listar('blobs')
    const guardados = new Map(await Promise.all(blobs.map(async (c) => [c, (await armazem.ler(c))!] as const)))
    for (const c of blobs) await armazem.remover(c)
    const banco = await bancoDeTeste({ armazem })
    usarMotor(banco)
    await expect(abrirBanco()).rejects.toThrow()
    await expect(banco.executar('SELECT 1')).rejects.toBeInstanceOf(ErroSemPacote)
    for (const [c, bytes] of guardados) await armazem.gravar(c, bytes)
    expect((await abrirBanco()).estado).toBe('aberto')
    expect((await contagens()).objetos).toBe(6)
  })

  it('o esquema repetido é detectado sem diferenciar maiúsculas', () => {
    const manifesto = {
      schema: 5,
      gerado_em: 'x',
      publicacoes: [{ sigla: 'TESTE' }, { sigla: 'teste' }],
      arquivos: Object.fromEntries(
        ['nucleo/comum.sqlite', 'nucleo/pub-TESTE.sqlite', 'nucleo/pub-teste.sqlite'].map((c) => [c, { sha256: 'a'.repeat(64), bytes: 1 }]),
      ),
    }
    expect(arquivosDoBanco(manifesto).publicacoes).toEqual([{ sigla: 'TESTE', esquema: 'pub_TESTE' }])
  })
})

describe('nomes dos esquemas e plano de importação no pool', () => {
  it('o esquema vem da sigla do manifesto e recusa sigla estranha', () => {
    expect(esquemaDaPublicacao('TESTE')).toBe('pub_TESTE')
    expect(esquemaDaPublicacao('GGIG')).toBe('pub_GGIG')
    expect(() => esquemaDaPublicacao('A; DROP')).toThrow()
  })

  it('só reimporta o arquivo cujo sha mudou e remove o que saiu do pacote', () => {
    const arquivos = [
      { nome: '/comum.sqlite', sha256: 'a1' },
      { nome: '/pub-TESTE.sqlite', sha256: 'b2' },
      { nome: '/busca.sqlite', sha256: 'c3' },
    ]
    expect(
      planoDeImportacao(arquivos, { '/comum.sqlite': 'a1', '/pub-TESTE.sqlite': 'b1', '/pub-VELHA.sqlite': 'd1' }, [
        '/comum.sqlite',
        '/pub-TESTE.sqlite',
        '/pub-VELHA.sqlite',
      ]),
    ).toEqual({ importar: ['/pub-TESTE.sqlite', '/busca.sqlite'], remover: ['/pub-VELHA.sqlite'] })
    // marcado como importado mas ausente do pool (pool apagado): importa de novo
    expect(planoDeImportacao(arquivos, { '/comum.sqlite': 'a1', '/pub-TESTE.sqlite': 'b2', '/busca.sqlite': 'c3' }, ['/comum.sqlite'])).toEqual({
      importar: ['/pub-TESTE.sqlite', '/busca.sqlite'],
      remover: [],
    })
  })
})
