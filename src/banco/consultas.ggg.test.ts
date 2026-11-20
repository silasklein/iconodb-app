// @vitest-environment node
/**
 * Etapa 4, Tarefa 26: o que as Coleções, a Bibliografia, o «No livro» e o mapa leem do livro em parágrafos, sobre o pacote
 * sintético (o `TESTEG`, modelo do GGG: o capítulo GR-TESTEG-01 com o § 1 e a seção GR-TESTEG-01-01 com os §§ 2–3; o
 * `TESTEGEN`, modelo do GGIG). Tudo inventado (repositório público).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { RAIZ_DO_PACOTE_10 } from '../../tests/suporte/fonteDeTeste'
import { executar, reabrirBanco, usarMotor } from './cliente'
import { grupo, grupos, item, livrosNaBibliografia, objetosDosSitios, resumosDosItens, sitios } from './consultas'

describe('fix round 1 da Tarefa 27 (M7): os livros da Bibliografia são lidos uma vez por pacote', () => {
  afterAll(() => usarMotor(null))

  it('a segunda chamada não consulta o banco; a reabertura (pacote novo) lê de novo', async () => {
    const banco = await bancoDeTeste()
    let consultas = 0
    const executarDoBanco = banco.executar.bind(banco)
    banco.executar = (sql, parametros) => {
      consultas++
      return executarDoBanco(sql, parametros)
    }
    usarMotor(banco)
    const primeira = await livrosNaBibliografia()
    expect(primeira.map((l) => l.sigla)).toEqual(['TESTEG', 'TESTEGEN'])
    const depois = consultas
    expect(depois).toBeGreaterThan(0)
    expect(await livrosNaBibliografia()).toBe(primeira)
    expect(consultas).toBe(depois)
    await reabrirBanco()
    expect(await livrosNaBibliografia()).toEqual(primeira)
    expect(consultas).toBeGreaterThan(depois)
  })
})

describe('o livro em parágrafos nas Coleções, na Bibliografia e no mapa', () => {
  beforeAll(async () => usarMotor(await bancoDeTeste()))
  afterAll(() => usarMotor(null))

  it('o capítulo e a seção trazem o intervalo dos §§ (o capítulo conta os das seções); um grupo do TESTE, nenhum', async () => {
    const [capitulo] = await grupos('TESTEG')
    expect(capitulo!.id).toBe('GR-TESTEG-01')
    expect(capitulo!.paragrafos).toEqual({ primeiro: 1, ultimo: 3, total: 3 })
    for (const g of await grupos('TESTE')) expect(g.paragrafos).toBeNull()

    const g = (await grupo('GR-TESTEG-01'))!
    expect(g.paragrafos).toEqual({ primeiro: 1, ultimo: 3, total: 3 })
    expect(g.subcolecoes.map((s) => [s.id, s.paragrafos])).toEqual([['GR-TESTEG-01-01', { primeiro: 2, ultimo: 3, total: 2 }]])
    expect((await grupo('GR-TESTE-I-01'))!.subcolecoes.every((s) => s.paragrafos === null)).toBe(true)
  })

  it('a seção lista os §§ dela com a primeira frase em português (a8: «Ler a seção» abre o primeiro)', async () => {
    const s = (await grupo('GR-TESTEG-01-01'))!
    expect(s.paragrafos).toEqual({ primeiro: 2, ultimo: 3, total: 2 })
    expect(s.paragrafosDaSecao).toEqual([
      { numero: 2, frase: 'Dois selos de prova de Maḥteṣ Teste mostram um leão-de-teste (Abb. 1a) e o seu verso (Abb. 1b); cf. Pl. 3.' },
      { numero: 3, frase: 'Um escaravelho de teste de Tell Achado Teste (Abb. 2) encerra a série de prova.' },
    ])
    expect((await grupo('GR-TESTE-I-01-01'))!.paragrafosDaSecao).toEqual([])
  })

  it('«No livro» diz se a linha é de um livro em parágrafos (a2: o objeto em dois livros tem as duas)', async () => {
    const ca = (await item('CA00004'))!
    expect(ca.noLivro.map((l) => [l.publicacao, l.emParagrafos])).toEqual([
      ['TESTE', false],
      ['TESTEG', true],
    ])
    expect((await item('F200001'))!.noLivro.map((l) => l.emParagrafos)).toEqual([true])
  })

  it('o achado «do texto» no resumo traz o livro, o trecho e o §', async () => {
    const [r] = await resumosDosItens(['TESTEG-0002'], 'dada')
    expect(r!.achadoDoTexto).toEqual({ sigla: 'TESTEG', trechoId: 'PA-TESTEG-§3-txt-1', paragrafo: 3 })
    const doSitio = (await objetosDosSitios(['TESTEG-9'])).get('TESTEG-9')!
    expect(doSitio.map((o) => [o.numero, o.achadoDoTexto?.paragrafo])).toEqual([['F200002', 3]])
    // o sítio do achado conta quantos objetos vêm do texto (o cartão do mapa: «1 objeto, 1 do texto»)
    const tell = (await sitios()).find((s) => s.id === 'TESTEG-9')!
    expect([tell.objetos, tell.doTexto]).toEqual([1, 1])
    expect((await sitios()).find((s) => s.id === 'TESTE-1')!.doTexto).toBe(0)
  })

  it('fix 1, I1: a figura sem tipo (sem campo 5) leva o rótulo dela no resumo; o objeto do catálogo sem tipo, não', async () => {
    const [f1, f2] = await resumosDosItens(['TESTEG-0001a', 'TESTEG-0002'], 'dada')
    expect([f1!.tipo, f1!.figura]).toEqual([null, 'TESTEG: 1a'])
    expect(f2!.figura).toBe('TESTEG: 2')
    const [ba] = await resumosDosItens(['TESTE-0006'], 'dada')
    expect(ba!.figura).toBeUndefined()
  })

  it('a Bibliografia: o livro e a tradução como obras (sem obra igual no pacote, `LIVRO-<sigla>`), com os números do livro', async () => {
    expect(await livrosNaBibliografia()).toEqual([
      {
        sigla: 'TESTEG',
        obraId: 'LIVRO-TESTEG',
        curta: 'Autorin 2021',
        titulo: 'Probesiegel und Testbilder. Ein erfundenes Buch in Paragraphen',
        csl: expect.objectContaining({ type: 'book', title: 'Probesiegel und Testbilder. Ein erfundenes Buch in Paragraphen' }),
        traducaoDe: null,
        traducao: 'TESTEGEN',
        capitulos: 1,
        paragrafos: 3,
        figuras: 3,
        primeiro: 1,
      },
      {
        sigla: 'TESTEGEN',
        obraId: 'LIVRO-TESTEGEN',
        curta: 'Autorin 2022',
        titulo: 'Probe Seals and Test Images. An Invented Book in Paragraphs',
        csl: expect.objectContaining({ type: 'book' }),
        traducaoDe: 'TESTEG',
        traducao: null,
        capitulos: 0,
        paragrafos: 3,
        figuras: 0,
        primeiro: 1,
      },
    ])
  })
})

describe('com uma obra igual na Bibliografia (banco de escrita)', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    // a tradução já é uma obra da Bibliografia comum (no real, o GGIG citado no GGG): mesmo título e ano
    await executar(
      `INSERT INTO main.bib_entry (id, csl_json, short_cites, origin) VALUES ('BIB-900077',
        '{"type": "book", "title": "Probe Seals and Test Images. An Invented Book in Paragraphs", "author": [{"family": "Autorin"}], "issued": {"date-parts": [[2022]]}}',
        '{"TESTEG": ["Autorin 2022"]}', 'TESTEG')`,
    )
  })
  afterAll(() => usarMotor(null))

  it('o livro leva o id da obra igual; o outro continua `LIVRO-`', async () => {
    expect((await livrosNaBibliografia()).map((l) => [l.sigla, l.obraId])).toEqual([
      ['TESTEG', 'LIVRO-TESTEG'],
      ['TESTEGEN', 'BIB-900077'],
    ])
  })
})

describe('o pacote 10 (sem livro em parágrafos)', () => {
  beforeAll(async () => usarMotor(await bancoDeTeste({ raiz: RAIZ_DO_PACOTE_10 })))
  afterAll(() => usarMotor(null))

  it('nenhum livro na Bibliografia, nenhum intervalo de §§, nenhuma linha em parágrafos', async () => {
    expect(await livrosNaBibliografia()).toEqual([])
    for (const g of await grupos()) expect(g.paragrafos).toBeNull()
    expect((await item('CA00004'))!.noLivro.every((l) => !l.emParagrafos)).toBe(true)
  })
})
