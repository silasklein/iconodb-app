// @vitest-environment node
/**
 * Consultas sobre o pacote sintético (tests/fixtures/pacote), com o sqlite-wasm em
 * memória no Node. O pacote tem 6 objetos (CA00001–CA00004, BA00001–BA00002, um item
 * TESTE-000N cada), 9 hipóteses, 9 verbetes e dois grupos de 3 itens. No schema 9, GR-TESTE-I-01 tem as
 * subcoleções «1.1» (TESTE-0001) e «1.2–1.3» (TESTE-0002); TESTE-0003 fica só no grupo.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { armazemComPacote, bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { RAIZ_DO_PACOTE_6, RAIZ_DO_PACOTE_8, RAIZ_DO_PACOTE_9 } from '../../tests/suporte/fonteDeTeste'
import { tituloDoGrupo } from '../ui/tituloDoGrupo'
import { mesclasDoPacote } from '../pacote/redirecionamentos'
import { pacoteDeSitios } from '../sitios/pacote'
import { armazemMemoria } from '../pacote/armazem'
import { abrirBanco, aoReabrir, ErroSemPacote, executar, reabrirBanco, usarMotor } from './cliente'
import {
  alvosDoPacote,
  citacoesNaoResolvidasNoPacote,
  compararNoLivro,
  contagens,
  elementosSemRegiaoNoPacote,
  grafiasDoPacote,
  grupo,
  grupos,
  hipotese,
  type Grupo,
  type GrupoDetalhe,
  type ItemDetalhe,
  type LinhaDaFila,
  imagem,
  item,
  linhasDaFila,
  localizadoresDosObjetos,
  lugaresDosCasos,
  numerosDosTrechos,
  objetosDosSitios,
  obra,
  obras,
  paresSugeridos,
  partesDoPacote,
  redirecionamentos,
  regioes,
  regioesDoLivro,
  regioesDoLivroParaExportar,
  sitio,
  sitios,
  traducoesNaoRevisadasNoPacote,
  verbete,
  verbetes,
  verbetesAReverNoPacote,
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

  it('R22: o esquema do pacote sintético não tem comentários SQL (nem siglas e nomes reais neles)', async () => {
    for (const esquema of ['main', 'pub_TESTE', 'busca']) {
      const sqls = (await executar<{ sql: string }>(`SELECT sql FROM ${esquema}.sqlite_master WHERE sql IS NOT NULL`)).map((l) => l.sql)
      expect(sqls.length, esquema).toBeGreaterThan(0)
      expect(sqls.filter((x) => x.includes('--') || x.includes('/*')), esquema).toEqual([])
      expect(sqls.filter((x) => /IPIAO|GGG|Schroer|Keel/.test(x)), esquema).toEqual([])
    }
  })

  it('contagens() bate com o pacote', async () => {
    // o pacote sintético traz o verbete GL-900010 e o sítio TESTE-3 publicados da camada do usuário (Tarefa 16)
    expect(await contagens()).toEqual({ objetos: 6, hipoteses: 9, verbetes: 10 })
    // e com o que está nos bancos, contado à parte
    const [o] = await executar<{ n: number }>('SELECT count(*) AS n FROM main.object')
    const [h] = await executar<{ n: number }>('SELECT count(*) AS n FROM pub_TESTE.hypothesis')
    const [v] = await executar<{ n: number }>('SELECT count(*) AS n FROM main.glossary_entry')
    expect(await contagens()).toEqual({ objetos: o!.n, hipoteses: h!.n, verbetes: v!.n })
  })

  it('o banco é só de leitura', async () => {
    await expect(executar("UPDATE main.object SET period_code = 'X'")).rejects.toThrow(/readonly/i)
  })

  it('linhasDaFila() traz cada linha como o pipeline a gravou; as de item levam o número do objeto', async () => {
    const l = await linhasDaFila()
    expect(l).toEqual([
      { tipo: 'citacao_nao_resolvida', entidade: 'passage', entidadeId: 'PA-TESTE-I.S.9-cap-1', detalhe: 'Fantasma 1888: 3: obra fora da bibliografia', numero: null },
      { tipo: 'traducao_termo_alterado', entidade: 'passage', entidadeId: 'PA-TESTE-0003-cat-1', detalhe: "GL-900003: 'olhos de botão' (m) -> 'olho em forma de botão' (m)", numero: null },
      // pacote 10: as citações não resolvidas de item, depois das duas de antes (a «Imaginária 2010: 3» ligada pelo usuário saiu)
      { tipo: 'citacao_nao_resolvida', entidade: 'item', entidadeId: 'TESTE-0004', detalhe: 'campo 7: Inventado 2001: 5', numero: 'CA00004' },
      { tipo: 'citacao_nao_resolvida', entidade: 'item', entidadeId: 'TESTE-0005', detalhe: 'campo 7: Inventado 2001: 9', numero: 'BA00001' },
      { tipo: 'citacao_nao_resolvida', entidade: 'item', entidadeId: 'TESTE-0006', detalhe: 'campo 7: 1999: 12; sem autor na citação', numero: 'BA00002' },
    ])
  })

  it('lugaresDosCasos() leva um trecho ao item dele, uma imagem e uma citação também, e um item a si mesmo', async () => {
    const lugares = await lugaresDosCasos([
      { entidade: 'passage', entidadeId: 'PA-TESTE-0003-cat-1' },
      { entidade: 'item', entidadeId: 'TESTE-0004' },
      { entidade: 'bib_ref', entidadeId: '2' },
      { entidade: 'passage', entidadeId: 'PA-TESTE-I.S.9-cap-1' }, // sem item, nem introdução de grupo
      { entidade: 'gazetteer', entidadeId: null },
    ])
    expect(lugares.get('passage|PA-TESTE-0003-cat-1')).toEqual({ itemId: 'TESTE-0003', numero: 'CA00003', grupoId: null, origem: 'TESTE I: 3' })
    expect(lugares.get('item|TESTE-0004')).toMatchObject({ numero: 'CA00004', origem: 'TESTE I: 4' })
    expect(lugares.get('bib_ref|2')).toMatchObject({ itemId: 'TESTE-0001', numero: 'CA00001' })
    expect(lugares.has('passage|PA-TESTE-I.S.9-cap-1')).toBe(false)
    expect(lugares.size).toBe(3)
  })

  it('lugaresDosCasos() leva um campo do catálogo (id#campo) e uma hipótese ao objeto delas', async () => {
    const lugares = await lugaresDosCasos([
      { entidade: 'catalog_field', entidadeId: 'TESTE-0003#5' },
      { entidade: 'hypothesis', entidadeId: 'HY-900003' },
      { entidade: 'hypothesis', entidadeId: 'HY-INEXISTENTE' },
    ])
    expect(lugares.get('catalog_field|TESTE-0003#5')).toEqual({ itemId: 'TESTE-0003', numero: 'CA00003', grupoId: null, origem: 'TESTE I: 3' })
    expect(lugares.get('hypothesis|HY-900003')).toMatchObject({ numero: 'CA00002', origem: 'TESTE I: 2' })
    expect(lugares.has('hypothesis|HY-INEXISTENTE')).toBe(false)
  })

  it('elementosSemRegiaoNoPacote() traz os elementos do livro sem região, com a primeira imagem do item', async () => {
    const l = await elementosSemRegiaoNoPacote()
    expect(l).toHaveLength(1) // EL-900001 tem região no pacote; EL-900002 não
    expect(l[0]).toMatchObject({ id: 'EL-900002', rotuloDe: 'Testlöwe', itemId: 'TESTE-0001', imagem: 'IMG-TESTE-0001-1' })
    expect(l[0]!.rotulo.length).toBeGreaterThan(0)
  })

  it('traducoesNaoRevisadasNoPacote() traz só as de máquina, trechos e campos do catálogo (id#categoria)', async () => {
    const l = await traducoesNaoRevisadasNoPacote()
    // pacote 9: mais os três trechos das introduções das subcoleções (I.S.10 e I.S.11)
    expect(l.filter((t) => t.entidade === 'passage')).toHaveLength(11)
    expect(l.filter((t) => t.entidade === 'catalog_field')).toHaveLength(18)
    expect(l.filter((t) => t.entidade === 'catalog_field').every((t) => /^TESTE-\d+#\d$/.test(t.entidadeId))).toBe(true)
    const [revisado] = await executar<{ id: string }>("SELECT id FROM pub_TESTE.passage WHERE translation_state = 'reviewed'")
    expect(l.some((t) => t.entidadeId === revisado!.id)).toBe(false)
    expect(l.length).toBe(29)
  })

  it('verbetesAReverNoPacote() traz os verbetes propostos com a forma original', async () => {
    expect((await verbetesAReverNoPacote()).map((v) => v.id)).toEqual(['GL-900002', 'GL-900005', 'GL-900007', 'GL-900008'])
    expect((await verbetesAReverNoPacote())[0]).toEqual({ id: 'GL-900002', original: 'figura denteada' })
  })

  it('item() do item com 𓀀 traz termos e âncoras em code points', async () => {
    const it2 = await item('CA00002')
    expect(it2).not.toBeNull()
    const leitura = it2!.leituras[0]!
    expect(it2!.leituras).toHaveLength(1)
    expect(leitura.fonte).toBe('TESTE I: 2')
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
    expect(i.origem).toBe('TESTE I: 1')
    expect(i.itens).toEqual([{ id: 'TESTE-0001', publicacao: 'TESTE', tipo: 'catalog', origem: 'TESTE I: 1', referencia: { obra: 'TESTE I', numero: 1, sufixo: '', abb: false } }])
    expect(i.tipo).toBe('Pingente com leão-de-teste')
    expect(i.descricao).toBe('Pingente com leão-de-teste. Pedra de teste.')
    expect(i.sitio).toMatchObject({ id: 'TESTE-1', nome: 'Maḥteṣ Teste', glId: 'GL-900004', certeza: 'certain' })
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
    expect(i.catalogo[0]).toMatchObject({ itemId: 'TESTE-0001', texto: expect.stringContaining('Maḥteṣ Teste'), termos: [{ glId: 'GL-900004', inicio: 0, fim: 12 }] })
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
    expect(g!.itens[1]).toMatchObject({ itemId: 'TESTE-0005', origem: 'TESTE I: 5', tipo: 'Selo de teste', sitio: 'Maḥteṣ Teste', miniatura: 'imagens/TESTE/TESTE-0005/thumb-1.webp', display_mode: 'tons' })
    expect(g!.introducao).toEqual([
      expect.objectContaining({ id: 'PA-TESTE-I.S.19-ovw-1', texto: expect.stringContaining('selos de teste'), termos: [{ glId: 'GL-900009', inicio: 3, fim: 17 }] }),
    ])
    expect(await grupo('GR-NAO-EXISTE')).toBeNull()
  })

  describe('subcoleções (schema 9)', () => {
    it('o pacote sintético é do schema 10 (com as subcoleções do 9)', async () => {
      const [l] = await executar<{ user_version: number }>('PRAGMA pub_TESTE.user_version')
      expect(l!.user_version).toBe(10)
    })

    it('grupos() dá só os grupos de cima, com o número de subcoleções', async () => {
      const gs = await grupos()
      expect(gs.map((g) => [g.id, g.subcolecoes, g.paiId, g.numero])).toEqual([
        ['GR-TESTE-I-01', 2, null, '1'],
        ['GR-TESTE-I-02', 0, null, null],
      ])
      // Decisão 81: o grupo de cima com subcoleções leva o número do livro ('1'); a subcoleção se distingue só por paiId.
      // Foco 5: os totais não contam as linhas das subcoleções
      expect(gs.reduce((t, g) => t + g.objetos, 0)).toBe(6)
    })

    it('grupo() do grupo de cima traz as subcoleções em ordem, a introdução dele e todos os itens', async () => {
      const g = (await grupo('GR-TESTE-I-01'))!
      expect(g.subcolecoes).toEqual([
        { id: 'GR-TESTE-I-01-01', numero: '1.1', titulo: 'Animais de prova', tituloDe: 'Probetiere', objetos: 1 },
        { id: 'GR-TESTE-I-01-02', numero: '1.2–1.3', titulo: 'Figuras de prova e sinais de teste', tituloDe: 'Prüfgestalten und Testzeichen', objetos: 1 },
      ])
      expect(g.introducao.map((t) => t.id)).toEqual(['PA-TESTE-I.S.9-ovw-1'])
      expect(g.itens.map((o) => o.numero)).toEqual(['CA00001', 'CA00002', 'CA00003'])
      expect(g).toMatchObject({ subcolecoes: expect.any(Array), pai: null, posicao: null, anterior: null, proxima: null, paiId: null, numero: '1' })
    })

    it('grupo() da subcoleção traz o pai, a posição, as vizinhas, os trechos em ordem e os itens dela', async () => {
      const g = (await grupo('GR-TESTE-I-01-02'))!
      expect(g).toMatchObject({
        paiId: 'GR-TESTE-I-01',
        numero: '1.2–1.3',
        titulo: 'Figuras de prova e sinais de teste',
        tituloDe: 'Prüfgestalten und Testzeichen',
        periodo: 'Calcolítico (fase de teste)',
        pai: { id: 'GR-TESTE-I-01', titulo: 'Animais de teste e figuras de prova', tituloDe: '1. Testtiere und Probefiguren', numero: '1', subcolecoes: 2 },
        posicao: { n: 2, total: 2 },
        proxima: null,
        subcolecoes: [],
        objetos: 1,
      })
      expect(g.anterior).toMatchObject({ id: 'GR-TESTE-I-01-01', numero: '1.1', objetos: 1 })
      expect(g.introducao.map((t) => t.id)).toEqual(['PA-TESTE-I.S.10-ovw-2', 'PA-TESTE-I.S.11-ovw-1'])
      expect(g.introducao.map((t) => t.texto)).toEqual([expect.stringContaining('Figuras de prova'), expect.stringContaining('sinal de teste')])
      expect(g.introducao.every((t) => t.original.length > 0)).toBe(true)
      expect(g.itens.map((o) => o.numero)).toEqual(['CA00002'])
      const primeira = (await grupo('GR-TESTE-I-01-01'))!
      expect(primeira).toMatchObject({ posicao: { n: 1, total: 2 }, anterior: null, proxima: { id: 'GR-TESTE-I-01-02', numero: '1.2–1.3' } })
      expect(primeira.introducao.map((t) => t.id)).toEqual(['PA-TESTE-I.S.10-ovw-1'])
    })

    it('alvosDoPacote(): o rótulo do grupo como nas telas (decisão 81) e o da subcoleção com o seu número', async () => {
      const a = await alvosDoPacote(['GR-TESTE-I-01', 'GR-TESTE-I-02', 'GR-TESTE-I-01-02', 'GR-NAO-HA'])
      expect([...a.values()].map((x) => [x.ref, x.tipo, x.rotulo])).toEqual(
        expect.arrayContaining([
          ['GR-TESTE-I-01', 'grupo', '1. Animais de teste e figuras de prova'],
          ['GR-TESTE-I-02', 'grupo', 'Selos de prova e padrões denteados'],
          ['GR-TESTE-I-01-02', 'grupo', '1.2–1.3 Figuras de prova e sinais de teste'],
        ]),
      )
      expect(a.size).toBe(3)
    })

    it('vizinhos() na subcoleção anda só entre os objetos dela', async () => {
      expect(await vizinhos('CA00002', { tipo: 'grupo', id: 'GR-TESTE-I-01-02' })).toEqual({ anterior: null, proximo: null, posicao: 1, total: 1 })
      expect(await vizinhos('CA00001', { tipo: 'grupo', id: 'GR-TESTE-I-01-02' })).toBeNull()
    })

    it('«No livro» tem ordem fixa: a obra (ordem do manifesto), o volume, o grupo (ordem de leitura, que segue os períodos) e a subcoleção', () => {
      const k = (obra: number, volume: string, grupo: number, subcolecao: number) => ({ obra, volume, grupo, subcolecao })
      const lista = [k(1, 'I', 1, 0), k(0, 'II', 1, 0), k(0, 'I', 3, 2), k(0, 'I', 3, 1), k(0, 'I', 2, 0), k(0, 'I', 3, 0)]
      expect([...lista].sort(compararNoLivro)).toEqual([
        k(0, 'I', 2, 0),
        k(0, 'I', 3, 0),
        k(0, 'I', 3, 1),
        k(0, 'I', 3, 2),
        k(0, 'II', 1, 0),
        k(1, 'I', 1, 0),
      ])
    })

    it('item() traz «No livro» com a subcoleção, e `grupos` só com os de cima', async () => {
      const dois = (await item('CA00002'))!
      expect(dois.noLivro).toEqual([
        {
          publicacao: 'TESTE',
          volume: 'I',
          periodo: 'Calcolítico (fase de teste)',
          grupo: { id: 'GR-TESTE-I-01', titulo: 'Animais de teste e figuras de prova', tituloDe: '1. Testtiere und Probefiguren', numero: '1', subcolecoes: 2 },
          subcolecao: { id: 'GR-TESTE-I-01-02', numero: '1.2–1.3', titulo: 'Figuras de prova e sinais de teste', tituloDe: 'Prüfgestalten und Testzeichen' },
        },
      ])
      expect(dois.grupos).toEqual([{ id: 'GR-TESTE-I-01', titulo: 'Animais de teste e figuras de prova' }])
      const tres = (await item('CA00003'))!
      expect(tres.noLivro).toHaveLength(1)
      expect(tres.noLivro[0]!.subcolecao).toBeNull()
      expect((await item('CA00001'))!.noLivro[0]!.subcolecao?.numero).toBe('1.1')
      const quatro = (await item('CA00004'))!
      expect(quatro.noLivro).toEqual([expect.objectContaining({ grupo: expect.objectContaining({ id: 'GR-TESTE-I-02', numero: null, subcolecoes: 0 }), subcolecao: null })])
      for (const n of ['CA00001', 'CA00002', 'CA00003', 'CA00004']) {
        expect((await item(n))!.grupos.every((g) => !/^GR-TESTE-I-\d\d-\d\d$/.test(g.id))).toBe(true)
      }
    })
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
    expect((await verbetes()).map((x) => x.id)).toHaveLength(10)

    const o = await obra('BIB-900002')
    expect(o).toMatchObject({ id: 'BIB-900002', curta: 'Autora 2004', citadaComo: { TESTE: ['Autora 2004'] } })
    expect(o!.titulo).toContain('Marduk')
    expect(o!.objetos.map((x) => x.numero)).toEqual(['BA00001', 'BA00002'])
    expect(await obras()).toEqual([
      expect.objectContaining({ id: 'BIB-900001', curta: 'Autor 1999', origem: 'TESTE I', objetos: 4 }),
      expect.objectContaining({ id: 'BIB-900002', curta: 'Autora 2004', origem: 'TESTE I', objetos: 2 }),
      // pacote 10: a obra do usuário publicada (origin 'SKC'), citada pela «Imaginária 2010: 3» de BA00002
      expect.objectContaining({ id: 'BIB-900090', curta: 'Imaginária 2010', origem: 'SKC', objetos: 1 }),
    ])

    const ss = await sitios()
    // Pacote 8 (Parte 2C, bloco 2): os sítios TESTE-4 a TESTE-8, sem objetos, entram na lista (a consulta não sabe de mescla).
    expect(ss.map((s) => [s.id, s.nome, s.objetos])).toEqual([
      ['TESTE-5', 'Área Probe Teste', 0],
      ['TESTE-8', 'Ḫirbet Vizinha Teste', 0],
      ['TESTE-1', 'Maḥteṣ Teste', 3],
      ['TESTE-7', 'Maḥtiṣ Teste', 0],
      ['TESTE-4', 'Tel Probe Teste', 0],
      ['TESTE-2', 'Tell Probe Teste', 3],
      ['TESTE-3', 'Tell Usuário Teste', 0], // o sítio do usuário publicado (Tarefa 16)
      ['TESTE-6', 'Túmulo Probe Teste', 0],
    ])
    const s = await sitio('TESTE-2')
    expect(s).toMatchObject({ id: 'TESTE-2', literal: 'Tell Probe Teste', metodo: 'gazetteer', lat: 31.9132, lon: 35.2071 })
    expect(s!.objetos.map((x) => x.numero)).toEqual(['CA00003', 'CA00004', 'BA00002'])
    expect(await sitio('TESTE-99')).toBeNull()
    expect(await sitio('lixo')).toBeNull()
  })

  describe('pacote 10 (Parte 2C, bloco 3): other_forms, level_auto, resolved_by e a obra SKC', () => {
    it('o verbete traz as outras línguas, o hebraico e o árabe; os outros, a lista vazia', async () => {
      const v = await verbete('GL-900010')
      expect(v).toMatchObject({ he: 'קמע ניסיון', ar: 'تميمة تجريبية' })
      expect(v!.outras).toEqual([
        { lingua: 'grego', forma: 'φυλακτήριον δοκιμῆς' },
        { lingua: 'latim', forma: 'amuletum probationis' },
      ])
      expect((await verbete('GL-900001'))!.outras).toEqual([])
    })

    it('a hipótese de nível revisto traz o automático; as outras, null', async () => {
      expect(await hipotese('HY-900006')).toMatchObject({ nivel: 'iconographic', nivelAutomatico: 'pre_iconographic' })
      expect(await hipotese('HY-900005')).toMatchObject({ nivel: 'pre_iconographic', nivelAutomatico: null })
      // os níveis por objeto não mudam: CA00003 tem uma pré-iconográfica e duas iconográficas
      const i = (await item('CA00003'))!
      expect(Object.fromEntries(Object.entries(i.hipotesesPorNivel).map(([k, hs]) => [k, hs.map((h) => h.id)]))).toEqual({
        pre_iconographic: ['HY-900005'],
        iconographic: ['HY-900007', 'HY-900006'],
        iconological: [],
      })
    })

    it('as citações dizem quem as resolveu: o processamento, o usuário, ou ninguém', async () => {
      const bib = (await item('BA00002'))!.bibliografia
      expect(bib.map((r) => [r.bruto, r.resolvida, r.resolvidaPor, r.obraId])).toEqual([
        ['Autora 2004: 8', true, 'auto', 'BIB-900002'],
        ['1999: 12', false, null, null],
        ['Imaginária 2010: 3', true, 'user', 'BIB-900090'],
      ])
      expect((await item('CA00004'))!.bibliografia.map((r) => [r.bruto, r.resolvidaPor])).toEqual([
        ['Autor 1999: 20', 'auto'],
        ['Inventado 2001: 5', null],
      ])
    })

    it('a obra SKC publicada e o redirecionamento de obra', async () => {
      const o = await obra('BIB-900090')
      expect(o).toMatchObject({ id: 'BIB-900090', curta: 'Imaginária 2010', origem: 'SKC', citadaComo: { SKC: ['Imaginária 2010'] }, titulo: 'Selos sonhados no planalto fictício' })
      expect(o!.chicago).toBe('Imaginária, Cicrana. 2010. Selos sonhados no planalto fictício. Cidade Fictícia.')
      expect(o!.objetos.map((x) => x.numero)).toEqual(['BA00002'])
      expect((await redirecionamentos()).find((r) => r.de === 'BIB-teste123-1')).toEqual({ de: 'BIB-teste123-1', para: 'BIB-900090', tipo: 'obra', verbeteExiste: false, obraExiste: true, criado: true })
    })
  })

  it('verbetes() traz o inglês e quantos objetos cada verbete tem (hipótese no termo ou sítio de mesmo nome)', async () => {
    const lista = await verbetes()
    const por = new Map(lista.map((v) => [v.id, v]))
    expect(por.get('GL-900001')).toMatchObject({ pt: 'leão-de-teste', de: 'Testlöwe', en: 'test lion', status: 'approved', objetos: 2 })
    // o número de objetos é o de verbete(id).objetos, para todos os verbetes
    for (const v of lista) expect(v.objetos).toBe((await verbete(v.id))!.objetos.length)
    expect(por.get('GL-900004')!.objetos).toBe(3) // nome de sítio: os três objetos achados lá
    expect(por.get('GL-900005')!.objetos).toBe(3)
  })

  it('sitios() e sitio() trazem a região: o verbete-pai do verbete do nome, ou null', async () => {
    expect((await sitios()).map((x) => x.regiao)).toEqual(Array(8).fill(null)) // pacote 8: oito sítios
    expect((await sitio('TESTE-1'))!.regiao).toBeNull()
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

  it('regioesDoLivroParaExportar (Tarefa 15): as regiões, o tamanho das imagens, os verbetes dos elementos, os elementos pedidos e as obras', async () => {
    const d = await regioesDoLivroParaExportar(['IMG-TESTE-0001-2', 'IMG-NAO-EXISTE'], ['EL-900001', 'EL-999999'])
    const regiao = {
      sigla: 'TESTE',
      elementoId: 'EL-900001',
      rotulo: 'figura denteada',
      rotuloDe: 'Zackenfigur',
      imagem: 'IMG-TESTE-0003-1',
      seletor: '<polygon points="0.30,0.25 0.70,0.25 0.62,0.75 0.38,0.75"/>',
    }
    expect(d.regioes).toEqual([regiao])
    // O tamanho das imagens das regiões do livro e das pedidas (as imagens do livro onde o usuário desenhou).
    expect([...d.tamanhos.entries()].sort()).toEqual([
      ['IMG-TESTE-0001-2', { largura: 1200, altura: 900 }],
      ['IMG-TESTE-0003-1', { largura: 900, altura: 1200 }],
    ])
    // HY-900005 é sobre o elemento EL-900001, com o verbete GL-900002.
    expect([...d.termosDosElementos.entries()]).toEqual([['EL-900001', ['GL-900002']]])
    // Os elementos pedidos (onde o usuário desenhou): a obra e os rótulos; o que não existe fica de fora.
    expect([...d.elementos.entries()]).toEqual([['EL-900001', { sigla: 'TESTE', rotulo: 'figura denteada', rotuloDe: 'Zackenfigur' }]])
    // A obra, os autores e a língua (a do rótulo original).
    expect([...d.publicacoes.entries()]).toEqual([['TESTE', { obra: 'TESTE I', autores: ['Autora, Primeira Teste', 'Autor, Segundo Teste'], lingua: 'de' }]])
    // Só para contar, a tela lê só as regiões (sem termos nem obras).
    expect(await regioesDoLivro()).toEqual([regiao])
  })

  it('localizadoresDosObjetos (Tarefa 15, MEDIATION): o localizador de cada objeto no estilo do pacote, «TESTE I, Nr. 3»', async () => {
    const m = await localizadoresDosObjetos(['CA00003', 'CA00001', 'CA99999', 'OB-aaaaaaaa-1'])
    expect([...m.entries()].sort()).toEqual([
      ['CA00001', 'TESTE I, Nr. 1'],
      ['CA00003', 'TESTE I, Nr. 3'],
    ])
    expect((await localizadoresDosObjetos([])).size).toBe(0)
  })

  it('imagem(id) traz a imagem com o número do objeto e quantas imagens ele tem', async () => {
    expect(await imagem('IMG-TESTE-0001-2')).toEqual({
      ...(await item('CA00001'))!.imagens[1],
      numero: 'CA00001',
      total: 2,
    })
    expect(await imagem('IMG-TESTE-0001-1')).toMatchObject({ id: 'IMG-TESTE-0001-1', numero: 'CA00001', display_mode: 'traco', ordinal: 1 })
    expect(await imagem('IMG-NAO-EXISTE')).toBeNull()
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
      { itemId: 'TESTE-0002', numero: 'CA00002', origem: 'TESTE I: 2' },
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

  it('"sem pacote" nunca fica guardado: o pacote que chega depois aparece sem reabrir', async () => {
    const armazem = armazemMemoria()
    usarMotor(await bancoDeTeste({ armazem }))
    // Ex.: "/" ou "g b" na tela de entrar, antes de qualquer sincronização.
    expect(await abrirBanco()).toEqual({ estado: 'sem-pacote' })
    await expect(contagens()).rejects.toBeInstanceOf(ErroSemPacote)
    const cheio = await armazemComPacote()
    for (const c of await cheio.listar('')) await armazem.gravar(c, (await cheio.ler(c))!)
    expect((await abrirBanco()).estado).toBe('aberto')
    expect((await contagens()).objetos).toBe(6)
  })

  it('o Banco também não guarda "sem pacote" (o worker vive entre as telas)', async () => {
    const armazem = armazemMemoria()
    const banco = await bancoDeTeste({ armazem })
    expect(await banco.abrir()).toEqual({ estado: 'sem-pacote' })
    const cheio = await armazemComPacote()
    for (const c of await cheio.listar('')) await armazem.gravar(c, (await cheio.ler(c))!)
    expect((await banco.abrir()).estado).toBe('aberto')
  })

  it('reabrirBanco() avisa quem pediu (aoReabrir) depois de trocar o pacote', async () => {
    usarMotor(await bancoDeTeste())
    const ouvinte = vi.fn()
    const parar = aoReabrir(ouvinte)
    await reabrirBanco()
    expect(ouvinte).toHaveBeenCalledTimes(1)
    parar()
    await reabrirBanco()
    expect(ouvinte).toHaveBeenCalledTimes(1)
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

  it('a região do sítio é o verbete-pai do nome do sítio (glossary_entry.parent_id)', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    await executar("UPDATE main.glossary_entry SET parent_id = 'GL-900001' WHERE id = 'GL-900004'")
    expect((await sitios()).filter((x) => ['TESTE-1', 'TESTE-2', 'TESTE-3'].includes(x.id)).map((x) => [x.id, x.regiao])).toEqual([
      ['TESTE-1', { id: 'GL-900001', nome: 'leão-de-teste' }],
      ['TESTE-2', null],
      ['TESTE-3', null],
    ])
    expect((await sitios()).filter((x) => x.regiao !== null)).toHaveLength(1) // pacote 8: os outros sítios sem região
    expect((await sitio('TESTE-1'))!.regiao).toEqual({ id: 'GL-900001', nome: 'leão-de-teste' })
  })
})

describe('decisão 40: as citações no texto do usuário', () => {
  beforeAll(async () => usarMotor(await bancoDeTeste()))
  afterAll(() => usarMotor(null))

  it('revisão 1: fontesDosObjetos de um item sem objeto (sem linha em object_member) usa o próprio item', async () => {
    const { fontesDosObjetos } = await import('./consultas')
    expect(await fontesDosObjetos(['TESTE-0001'])).toEqual([{ obra: 'TESTE I', numero: 1, sufixo: '', abb: false }])
    expect(await fontesDosObjetos(['ZZ99999'])).toEqual([])
    // revisão 2: o recurso é por número (um com membros não esconde o outro, sem membros)
    expect(await fontesDosObjetos(['CA00001', 'TESTE-0002'])).toEqual([
      { obra: 'TESTE I', numero: 1, sufixo: '', abb: false },
      { obra: 'TESTE I', numero: 2, sufixo: '', abb: false },
    ])
  })

  it('obrasDoPacote: a sigla e o volume de cada obra aberta', async () => {
    const { obrasDoPacote } = await import('./consultas')
    expect(await obrasDoPacote()).toEqual(['TESTE I'])
  })

  it('objetosDasFontes: o objeto de cada referência que existe, pela chave; as outras ficam de fora', async () => {
    const { objetosDasFontes } = await import('./consultas')
    const r = await objetosDasFontes([
      { obra: 'TESTE I', numero: 1 },
      { obra: 'TESTE I', numero: 5 },
      { obra: 'TESTE I', numero: 9 },
      { obra: 'TESTE II', numero: 1 },
      { obra: 'TESTE I', numero: 1, sufixo: 'a' },
      { obra: 'TESTE I', numero: 1, abb: true },
    ])
    expect([...r]).toEqual([
      ['TESTE I:1', 'CA00001'],
      ['TESTE I:5', 'BA00001'],
    ])
    expect(await objetosDasFontes([])).toEqual(new Map())
  })
  it('elementosDoObjeto: os elementos dos itens do objeto (rótulo em português, senão o do texto), para "Sobre" da nova hipótese', async () => {
    const { elementosDoObjeto } = await import('./consultas')
    expect(await elementosDoObjeto('CA00001')).toEqual([{ id: 'EL-900002', rotulo: 'leão-de-teste', rotuloDe: 'Testlöwe', pai: null }])
    expect(await elementosDoObjeto('CA00003')).toEqual([{ id: 'EL-900001', rotulo: 'figura denteada', rotuloDe: 'Zackenfigur', pai: null }])
    expect(await elementosDoObjeto('CA00004')).toEqual([])
    expect(await elementosDoObjeto('ZZ99999')).toEqual([])
  })
})

describe('lugaresDosCasos(): o trecho da introdução de um grupo', () => {
  beforeAll(async () => usarMotor(await bancoDeTeste({ escrita: true })))
  afterAll(() => usarMotor(null))

  it('com itens, leva ao item; sem item nenhum, leva ao grupo cuja introdução ele é', async () => {
    const com = await lugaresDosCasos([{ entidade: 'passage', entidadeId: 'PA-TESTE-I.S.19-ovw-1' }])
    expect(com.get('passage|PA-TESTE-I.S.19-ovw-1')).toMatchObject({ itemId: 'TESTE-0004', grupoId: null })
    await executar("DELETE FROM pub_TESTE.passage_item WHERE passage_id = 'PA-TESTE-I.S.19-ovw-1'")
    const so = await lugaresDosCasos([{ entidade: 'passage', entidadeId: 'PA-TESTE-I.S.19-ovw-1' }])
    expect(so.get('passage|PA-TESTE-I.S.19-ovw-1')).toEqual({ itemId: null, numero: null, grupoId: 'GR-TESTE-I-02', origem: 'TESTE I · introdução' })
  })
})

describe('lugaresDosCasos(): subcoleções (schema 9)', () => {
  beforeEach(async () => usarMotor(await bancoDeTeste({ escrita: true })))
  afterAll(() => usarMotor(null))

  it('o 2.º trecho da «1.2–1.3» (só em author_group_passage) leva à subcoleção', async () => {
    const l = await lugaresDosCasos([{ entidade: 'passage', entidadeId: 'PA-TESTE-I.S.11-ovw-1' }])
    expect(l.get('passage|PA-TESTE-I.S.11-ovw-1')).toEqual({ itemId: null, numero: null, grupoId: 'GR-TESTE-I-01-02', origem: 'TESTE I · 1.2–1.3 · introdução' })
  })

  it('o trecho que é intro_passage_id do grupo de cima e também da 1.1 leva à subcoleção, qualquer que seja a ordem', async () => {
    // Como no I-13, I-15, II-02, II-03, III-02 e III-03: o intro do grupo é o 1.º trecho da 1.1.
    await executar("UPDATE pub_TESTE.author_group SET intro_passage_id = 'PA-TESTE-I.S.10-ovw-1' WHERE id = 'GR-TESTE-I-01'")
    const a = await lugaresDosCasos([{ entidade: 'passage', entidadeId: 'PA-TESTE-I.S.10-ovw-1' }])
    expect(a.get('passage|PA-TESTE-I.S.10-ovw-1')).toMatchObject({ grupoId: 'GR-TESTE-I-01-01', origem: 'TESTE I · 1.1 · introdução' })
    // E com o trecho também numa linha de author_group_passage do grupo de cima (o texto próprio do grupo): a subcoleção ganha.
    await executar("INSERT INTO pub_TESTE.author_group_passage (group_id, passage_id, ordinal) VALUES ('GR-TESTE-I-01', 'PA-TESTE-I.S.10-ovw-1', 1)")
    const b = await lugaresDosCasos([{ entidade: 'passage', entidadeId: 'PA-TESTE-I.S.10-ovw-1' }])
    expect(b.get('passage|PA-TESTE-I.S.10-ovw-1')).toMatchObject({ grupoId: 'GR-TESTE-I-01-01' })
  })

  it('um trecho só do grupo de cima continua no grupo, com a origem de antes', async () => {
    await executar("INSERT INTO pub_TESTE.author_group_passage (group_id, passage_id, ordinal) VALUES ('GR-TESTE-I-01', 'PA-TESTE-I.S.3-txt-1', 1)")
    const l = await lugaresDosCasos([{ entidade: 'passage', entidadeId: 'PA-TESTE-I.S.3-txt-1' }])
    expect(l.get('passage|PA-TESTE-I.S.3-txt-1')).toEqual({ itemId: null, numero: null, grupoId: 'GR-TESTE-I-01', origem: 'TESTE I · introdução' })
  })

  it("a entidade 'author_group' (filas subcolecao_* e grupo_*) leva ao grupo, com a obra, o número e o título", async () => {
    const l = await lugaresDosCasos([
      { entidade: 'author_group', entidadeId: 'GR-TESTE-I-01-02' },
      { entidade: 'author_group', entidadeId: 'GR-TESTE-I-01' },
      { entidade: 'author_group', entidadeId: 'GR-TESTE-I-02' },
      { entidade: 'author_group', entidadeId: 'GR-NAO-HA' },
      { entidade: 'subgroups_file', entidadeId: 'Testzeit › 9.' },
    ])
    expect(l.get('author_group|GR-TESTE-I-01-02')).toEqual({ itemId: null, numero: null, grupoId: 'GR-TESTE-I-01-02', origem: 'TESTE I · 1.2–1.3 Figuras de prova e sinais de teste' })
    // o grupo de cima com subcoleções: o título como nas telas, com o número do livro (decisão 81); o sem subcoleções, sem número
    expect(l.get('author_group|GR-TESTE-I-01')).toEqual({ itemId: null, numero: null, grupoId: 'GR-TESTE-I-01', origem: 'TESTE I · 1. Animais de teste e figuras de prova' })
    expect(l.get('author_group|GR-TESTE-I-02')).toEqual({ itemId: null, numero: null, grupoId: 'GR-TESTE-I-02', origem: 'TESTE I · Selos de prova e padrões denteados' })
    expect(l.has('author_group|GR-NAO-HA')).toBe(false)
    expect(l.has('subgroups_file|Testzeit › 9.')).toBe(false)
  })

  it("'subgroups_file' com o id de um item do build (fora_de_subcolecao_invalido) leva ao objeto", async () => {
    const l = await lugaresDosCasos([
      { entidade: 'subgroups_file', entidadeId: 'TESTE-0003' },
      { entidade: 'subgroups_file', entidadeId: 'TESTE-9999' },
    ])
    expect(l.get('subgroups_file|TESTE-0003')).toEqual({ itemId: 'TESTE-0003', numero: 'CA00003', grupoId: null, origem: 'TESTE I: 3' })
    expect(l.has('subgroups_file|TESTE-9999')).toBe(false)
  })

  it('a subcoleção sem título em português leva o título alemão na origem', async () => {
    await executar("UPDATE pub_TESTE.author_group SET title_pt = NULL WHERE id = 'GR-TESTE-I-01-02'")
    const l = await lugaresDosCasos([{ entidade: 'author_group', entidadeId: 'GR-TESTE-I-01-02' }])
    expect(l.get('author_group|GR-TESTE-I-01-02')!.origem).toBe('TESTE I · 1.2–1.3 Prüfgestalten und Testzeichen')
  })
})

describe('lugaresDosCasos() num pacote 6 (sem subcoleções)', () => {
  afterAll(() => usarMotor(null))

  it("o trecho da introdução e a entidade 'author_group' sem citar parent_id nem author_group_passage", async () => {
    usarMotor(await bancoDeTeste({ raiz: RAIZ_DO_PACOTE_6 }))
    const l = await lugaresDosCasos([
      { entidade: 'author_group', entidadeId: 'GR-TESTE-I-01' },
      { entidade: 'passage', entidadeId: 'PA-TESTE-I.S.9-cap-1' }, // sem item, nem introdução: passa pela consulta das introduções
    ])
    expect(l.has('passage|PA-TESTE-I.S.9-cap-1')).toBe(false)
    expect(l.get('author_group|GR-TESTE-I-01')).toEqual({ itemId: null, numero: null, grupoId: 'GR-TESTE-I-01', origem: 'TESTE I · Animais de teste e figuras de prova' })
  })
})

describe('numerosDosTrechos(): de que objeto do livro é cada trecho (T17-B-4)', () => {
  beforeAll(async () => usarMotor(await bancoDeTeste()))
  afterAll(() => usarMotor(null))

  it('o trecho que descreve um item é do objeto desse item; um que só o menciona (introdução) não é de nenhum', async () => {
    const m = await numerosDosTrechos(['PA-TESTE-0003-cat-1', 'PA-TESTE-0005-cat-1', 'PA-TESTE-I.S.9-ovw-1', 'PA-NAO-EXISTE'])
    expect([...m]).toEqual([
      ['PA-TESTE-0003-cat-1', ['CA00003']],
      ['PA-TESTE-0005-cat-1', ['BA00001']],
    ])
    expect((await numerosDosTrechos([])).size).toBe(0)
  })
})

describe('Parte 2C, bloco 2: as tabelas dos sítios do pacote 8', () => {
  afterAll(() => usarMotor(null))

  it('partesDoPacote(), grafiasDoPacote() e paresSugeridos() dão as linhas do pacote sintético (Tarefa 7)', async () => {
    usarMotor(await bancoDeTeste())
    expect(await partesDoPacote()).toEqual([
      { parte: 'TESTE-5', todo: 'TESTE-2' },
      { parte: 'TESTE-6', todo: 'TESTE-5' },
    ])
    const grafias = await grafiasDoPacote()
    expect(grafias).toHaveLength(9)
    expect(grafias).toContainEqual({ sitio: 'TESTE-1', texto: 'al-Maḥṭaṣ Teste', tradicao: null, sigla: 'TESTE', pagina: '4', origem: 'livro' })
    expect(grafias).toContainEqual({ sitio: 'TESTE-4', texto: 'Tel Probe Teste', tradicao: null, sigla: 'TESTE', pagina: '7', origem: 'livro' })
    expect(grafias).toContainEqual({ sitio: 'TESTE-2', texto: 'Probetal Teste', tradicao: 'alema', sigla: null, pagina: null, origem: 'usuario' })
    expect(await paresSugeridos()).toEqual([
      { a: 'TESTE-1', b: 'TESTE-7', motivo: 'nome' },
      { a: 'TESTE-1', b: 'TESTE-8', motivo: 'coordenada' },
    ])
  })

  it('Foco da revisão 1: o mesmo pacote sem as três tabelas novas dá listas vazias, não erro', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    for (const t of ['sitio_parte', 'sitio_grafia', 'sitio_par_sugerido']) await executar(`DROP TABLE main.${t}`)
    expect(await partesDoPacote()).toEqual([])
    expect(await grafiasDoPacote()).toEqual([])
    expect(await paresSugeridos()).toEqual([])
  })

  it('uma tradição ou um motivo fora da lista não chega às telas', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    await executar("INSERT INTO main.sitio_grafia VALUES ('TESTE-1', 'Grafia Teste', 'klingon', 'TESTE', '3', 'livro')")
    expect((await grafiasDoPacote()).find((g) => g.texto === 'Grafia Teste')).toMatchObject({ tradicao: null })
  })

  it('objetosDosSitios(): os objetos de cada sítio; um objeto em dois sítios fica no primeiro da lista (o mais perto do topo)', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    const antes = await objetosDosSitios(['TESTE-2', 'TESTE-4'])
    expect([...antes].map(([id, os]) => [id, os.map((o) => o.numero)])).toEqual([
      ['TESTE-2', ['CA00003', 'CA00004', 'BA00002']],
      ['TESTE-4', []],
    ])
    // TESTE-0003 (CA00003) também em TESTE-4 e TESTE-0001 (CA00001) só em TESTE-4.
    await executar(`INSERT INTO pub_TESTE.assertion (subject_type, subject_id, field, value, site_id, publication) VALUES
                      ('item', 'TESTE-0003', 'findspot', 'Tel Probe Teste', 4, 'TESTE'), ('item', 'TESTE-0001', 'findspot', 'Tel Probe Teste', 4, 'TESTE')`)
    const depois = await objetosDosSitios(['TESTE-2', 'TESTE-4'])
    expect([...depois].map(([id, os]) => [id, os.map((o) => o.numero)])).toEqual([
      ['TESTE-2', ['CA00003', 'CA00004', 'BA00002']],
      ['TESTE-4', ['CA00001']],
    ])
    const invertido = await objetosDosSitios(['TESTE-4', 'TESTE-2'])
    expect([...invertido].map(([id, os]) => [id, os.map((o) => o.numero)])).toEqual([
      ['TESTE-4', ['CA00001', 'CA00003']],
      ['TESTE-2', ['CA00004', 'BA00002']],
    ])
    expect((await objetosDosSitios([])).size).toBe(0)
    expect([...(await objetosDosSitios(['lixo', 'OUTRA-1', 'SI-abcdefgh-1']))]).toEqual([
      ['lixo', []],
      ['OUTRA-1', []],
      ['SI-abcdefgh-1', []],
    ])
  })
})

describe('F11: o pacote do schema 6 de antes (tests/fixtures/pacote-6) continua a abrir com as consultas de hoje', () => {
  let v9: Record<string, unknown>
  beforeAll(async () => {
    // o pacote 9 de antes (tests/fixtures/pacote-9): o 10 traz também as citações e as obras do bloco 3
    usarMotor(await bancoDeTeste({ raiz: RAIZ_DO_PACOTE_9 }))
    v9 = semSubcolecoes(await doPacote())
    usarMotor(await bancoDeTeste({ raiz: RAIZ_DO_PACOTE_6 }))
  })
  afterAll(() => usarMotor(null))

  /** O que as telas de antes leem do pacote: itens, publicação, grupos, verbetes, obras e os sítios TESTE-1 a TESTE-3. */
  async function doPacote(): Promise<Record<string, unknown>> {
    return {
      item: await item('CA00001'),
      item2: await item('BA00002'),
      grupos: await grupos(),
      grupo: await grupo('GR-TESTE-I-01'),
      verbete: await verbete('GL-900004'),
      obras: await obras(),
      sitios: (await sitios()).filter((s) => ['TESTE-1', 'TESTE-2', 'TESTE-3'].includes(s.id)),
      sitio: await sitio('TESTE-2'),
      fila: await linhasDaFila(),
    }
  }

  /**
   * O pacote 9 sem o que só ele tem: as subcoleções do grupo, o número do livro no grupo de cima (decisão 81), a
   * subcoleção em «No livro» e a fila das subcoleções.
   * O resto tem de dar o mesmo no pacote 6.
   */
  function semSubcolecoes(p: Record<string, unknown>): Record<string, unknown> {
    const semSub = (i: ItemDetalhe) => ({ ...i, noLivro: i.noLivro.map((l) => ({ ...l, grupo: { ...l.grupo, numero: null, subcolecoes: 0 }, subcolecao: null })) })
    const g = p.grupo as GrupoDetalhe
    return {
      ...p,
      item: semSub(p.item as ItemDetalhe),
      item2: semSub(p.item2 as ItemDetalhe),
      grupos: (p.grupos as Grupo[]).map((x) => ({ ...x, numero: null, subcolecoes: 0 })),
      grupo: { ...g, numero: null, subcolecoes: [] },
      fila: (p.fila as LinhaDaFila[]).filter((l) => !l.tipo.startsWith('subcolecao_')),
    }
  }

  it('abre: o schema é o 6, sem as tabelas novas', async () => {
    expect(await abrirBanco()).toMatchObject({ estado: 'aberto', publicacoes: [{ sigla: 'TESTE', esquema: 'pub_TESTE' }] })
    const [t] = await executar<{ n: number }>("SELECT count(*) AS n FROM main.sqlite_master WHERE name IN ('volume', 'item_alias', 'sitio_parte', 'sitio_grafia', 'sitio_par_sugerido')")
    expect(t!.n).toBe(0)
    const [g] = await executar<{ n: number }>("SELECT count(*) AS n FROM pub_TESTE.sqlite_master WHERE name = 'author_group_passage'")
    expect(g!.n).toBe(0)
  })

  it('itens, publicação, grupos, verbetes, obras e sítios dão o mesmo que no pacote 9, fora as subcoleções', async () => {
    expect(await doPacote()).toEqual(v9)
    expect(await sitios()).toHaveLength(3)
  })

  it('Foco 3: sem `parent_id` nem `author_group_passage`, nenhuma subcoleção e nenhum erro de SQL', async () => {
    const gs = await grupos()
    expect(gs.map((g) => [g.id, g.subcolecoes, g.paiId, g.numero])).toEqual([
      ['GR-TESTE-I-01', 0, null, null],
      ['GR-TESTE-I-02', 0, null, null],
    ])
    const g = (await grupo('GR-TESTE-I-01'))!
    expect(g.introducao.map((t) => t.id)).toEqual(['PA-TESTE-I.S.9-ovw-1'])
    expect(g).toMatchObject({ subcolecoes: [], pai: null, posicao: null, anterior: null, proxima: null })
    for (const n of ['CA00001', 'CA00002', 'CA00003', 'BA00002']) {
      const i = (await item(n))!
      expect(i.noLivro.length).toBeGreaterThan(0)
      expect(i.noLivro.every((l) => l.subcolecao === null)).toBe(true)
      // sem `numero` no pacote antigo, o grupo de cima fica sem o número do livro (decisão 81)
      expect(i.noLivro.every((l) => l.grupo.numero === null && l.grupo.subcolecoes === 0)).toBe(true)
      expect(i.noLivro.map((l) => tituloDoGrupo(l.grupo).texto)).toEqual(i.noLivro.map((l) => l.grupo.titulo))
    }
    expect(gs.map((x) => tituloDoGrupo(x).texto)).toEqual(['Animais de teste e figuras de prova', 'Selos de prova e padrões denteados'])
    expect(tituloDoGrupo(g).texto).toBe('Animais de teste e figuras de prova')
    expect((await alvosDoPacote(['GR-TESTE-I-01'])).get('GR-TESTE-I-01')?.rotulo).toBe('Animais de teste e figuras de prova')
    expect(await grupo('GR-TESTE-I-01-02')).toBeNull()
  })

  it('as consultas dos sítios do pacote 8 dão listas vazias', async () => {
    expect(await partesDoPacote()).toEqual([])
    expect(await grafiasDoPacote()).toEqual([])
    expect(await paresSugeridos()).toEqual([])
    expect((await redirecionamentos()).filter((r) => r.tipo === 'sitio').map((r) => [r.de, r.para])).toEqual([
      ['SI-teste123-1', 'TESTE-3'],
      ['SI-teste123-2', 'TESTE-2'],
    ])
    expect([...(await objetosDosSitios(['TESTE-1']))].map(([id, os]) => [id, os.map((o) => o.numero)])).toEqual([['TESTE-1', ['CA00001', 'CA00002', 'BA00001']]])
  })

  it('pacoteDeSitios() e mesclasDoPacote() abrem sem erro: só os sítios e os publicados, nada do schema 8', async () => {
    expect((await mesclasDoPacote()).size).toBe(0)
    const p = await pacoteDeSitios()
    expect([...p.sitios].sort()).toEqual(['TESTE-1', 'TESTE-2', 'TESTE-3'])
    expect(Object.fromEntries(p.publicados)).toEqual({ 'SI-teste123-1': 'TESTE-3', 'SI-teste123-2': 'TESTE-2' })
    expect([...p.criados]).toEqual(['TESTE-3']) // M-1: TESTE-3 foi criado do sítio do usuário; a TESTE-2 ele só leva
    expect(p.mesclas.size).toBe(0)
    expect(p.partes.size).toBe(0)
    expect(p.grafias).toEqual([])
    expect(p.pares).toEqual([])
  })
})

describe.each([
  [8, RAIZ_DO_PACOTE_8],
  [9, RAIZ_DO_PACOTE_9],
] as const)('Tarefa 7: o pacote %s de antes continua a abrir com as consultas de hoje (sem as colunas do schema 10)', (schema, raiz) => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ raiz }))
  })
  afterAll(() => usarMotor(null))

  it('abre, e é desse schema', async () => {
    expect(await abrirBanco()).toMatchObject({ estado: 'aberto', publicacoes: [{ sigla: 'TESTE', esquema: 'pub_TESTE' }] })
    const [l] = await executar<{ user_version: number }>('PRAGMA pub_TESTE.user_version')
    expect(l!.user_version).toBe(schema)
    const [c] = await executar<{ n: number }>("SELECT count(*) AS n FROM pragma_table_info('hypothesis', 'pub_TESTE') WHERE name = 'level_auto'")
    expect(c!.n).toBe(0)
  })

  it('sem level_auto, resolved_by nem other_forms: null e listas vazias, sem erro de SQL', async () => {
    const i = (await item('CA00003'))!
    const todas = [...Object.values(i.hipotesesPorNivel).flat(), ...i.outrasHipoteses]
    expect(todas.length).toBeGreaterThan(0)
    expect(todas.every((h) => h.nivelAutomatico === null)).toBe(true)
    expect(await hipotese('HY-900006')).toMatchObject({ nivelAutomatico: null })
    const bib = (await item('CA00001'))!.bibliografia
    expect(bib.length).toBeGreaterThan(0)
    expect(bib.every((r) => r.resolvidaPor === null)).toBe(true)
    expect((await verbete('GL-900010'))!.outras).toEqual([])
    const os = await obras()
    expect(os.map((o) => [o.id, o.origem])).toEqual([
      ['BIB-900001', 'TESTE I'],
      ['BIB-900002', 'TESTE I'],
    ])
    expect((await redirecionamentos()).some((r) => r.tipo === 'obra')).toBe(false)
    expect((await linhasDaFila()).filter((l) => l.tipo === 'citacao_nao_resolvida').map((l) => l.entidadeId)).toEqual(['PA-TESTE-I.S.9-cap-1'])
    // Tarefa 11: as citações que a Revisão pode ligar, sem `resolved_by` (só as não resolvidas)
    expect((await citacoesNaoResolvidasNoPacote()).map((c) => [c.bruto, c.resolvidaPor])).toEqual([['Fantasma 1888: 3', null]])
  })
})
