// @vitest-environment node
/**
 * Etapa 4, Tarefa 23: o pacote do schema 11 e o livro em parágrafos, sobre o pacote sintético (tests/fixtures/pacote).
 *
 * O `TESTEG` é o modelo do GGG (obra sem volumes): os §§ 1–3 (dois trechos no § 2), as notas 1 e 2, as figuras
 * `TESTEG-0001a`, `TESTEG-0001b` e `TESTEG-0002` (`kind 'figura'`), duas correções de leitura no primeiro trecho do § 2, o
 * achado «do texto» de 0002 (o § 3) e o par de mesma peça 0001b → TESTE-0004 (o objeto CA00004). O `TESTEGEN` é o modelo
 * do GGIG: os §§ 1–3 em inglês, cada um alinhado (`aligned_passage`) ao primeiro trecho do mesmo § do TESTEG.
 * Tudo inventado (repositório público).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { RAIZ_DO_PACOTE_10 } from '../../tests/suporte/fonteDeTeste'
import { SCHEMA_ESPERADO, SCHEMAS_ACEITOS, validarManifesto } from '../pacote/manifesto'
import { abrirBanco, executar, usarMotor } from './cliente'
import { item, objetosDosSitios, paragrafo, paragrafosQueCitam, resumosDosItens, sitios } from './consultas'
import { caminhoDoParagrafo, correcoesEmUtf16, dividirEmFrases, fraseDoTrechoQueCita, fraseQueCita, numeroDoParagrafo } from './paragrafos'

const manifesto = (schema: number) => ({ schema, gerado_em: '2026-11-18T00:00:00Z', publicacoes: [{ sigla: 'TESTE' }], arquivos: {} })

describe('o manifesto do schema 11', () => {
  it('é aceito, e é o esperado; os de antes continuam aceitos', () => {
    expect(SCHEMA_ESPERADO).toBe(11)
    expect(validarManifesto(manifesto(11)).schema).toBe(11)
    for (const v of [5, 6, 7, 8, 9, 10]) expect(SCHEMAS_ACEITOS).toContain(v)
    expect(() => validarManifesto(manifesto(12))).toThrow(/outra versão/)
  })
})

describe('as peças puras do livro em parágrafos', () => {
  it('numeroDoParagrafo: só «§N» (o «NW» e o «§231a» não são § numerado)', () => {
    expect(numeroDoParagrafo('§2')).toBe(2)
    expect(numeroDoParagrafo('§29')).toBe(29)
    expect(numeroDoParagrafo('NW')).toBeNull()
    expect(numeroDoParagrafo('§231a')).toBeNull()
    expect(numeroDoParagrafo('§0')).toBeNull()
    expect(numeroDoParagrafo('0060')).toBeNull()
  })

  it('caminhoDoParagrafo: a rota /paragrafo/:sigla/:numero', () => {
    expect(caminhoDoParagrafo('TESTEG', 2)).toBe('/paragrafo/TESTEG/2')
  })

  it('correcoesEmUtf16: o pipeline grava code points; um caractere fora do BMP antes desloca a correção em 1', () => {
    // linha sintética: «𓀀» (U+13000, dois code units) antes de «Mahtes» corrigido para «Maḥteṣ»
    const texto = '𓀀 Probe Maḥteṣ Teste, vgl. Pl. 3.'
    const cps = [...texto]
    const inicio = cps.indexOf('M')
    const linhas = [
      { inicio, fim: inicio + 6, lido: 'Mahtes', regra: 'ACENTO' },
      { inicio: cps.join('').indexOf('Pl.') - 1, fim: cps.join('').indexOf('Pl.') + 2, lido: 'PI.', regra: 'PL' },
    ]
    const r = correcoesEmUtf16(texto, linhas)
    expect(r).toEqual([
      { inicio: inicio + 1, fim: inicio + 7, lido: 'Mahtes', regra: 'ACENTO' },
      { inicio: texto.indexOf('Pl.'), fim: texto.indexOf('Pl.') + 3, lido: 'PI.', regra: 'PL' },
    ])
    expect(texto.slice(r[0]!.inicio, r[0]!.fim)).toBe('Maḥteṣ')
    expect(texto.slice(r[1]!.inicio, r[1]!.fim)).toBe('Pl.')
    // vazias, invertidas ou fora do texto: somem (nada sublinha o texto inteiro)
    expect(correcoesEmUtf16(texto, [{ inicio: 3, fim: 3, lido: 'x', regra: 'R' }, { inicio: 5, fim: 2, lido: 'x', regra: 'R' }])).toEqual([])
    expect(correcoesEmUtf16('abc', [{ inicio: 1, fim: 99, lido: 'x', regra: 'R' }])).toEqual([{ inicio: 1, fim: 3, lido: 'x', regra: 'R' }])
  })

  it('dividirEmFrases: não corta nas abreviações («Abb. 1a», «vgl. Pl. 3», «cf.», iniciais)', () => {
    expect(dividirEmFrases('Ein Probesiegel (Abb. 1a); vgl. Pl. 3. Der Testlöwe steht. Siehe O. Probe 1999.')).toEqual([
      'Ein Probesiegel (Abb. 1a); vgl. Pl. 3.',
      'Der Testlöwe steht.',
      'Siehe O. Probe 1999.',
    ])
    expect(dividirEmFrases('Um selo de prova (fig. 2); cf. Abb. 3. Outro selo! E mais?')).toEqual(['Um selo de prova (fig. 2); cf. Abb. 3.', 'Outro selo!', 'E mais?'])
    // «v. Chr.» e «z. B.» não fecham; uma letra minúscula qualquer («212a und b.») fecha
    expect(dividirEmFrases('Um 900 v. Chr. Der Test. Zum Beispiel z. B. Probe. Abb. 212a und b. Zuletzt.')).toEqual([
      'Um 900 v. Chr. Der Test.',
      'Zum Beispiel z. B. Probe.',
      'Abb. 212a und b.',
      'Zuletzt.',
    ])
    expect(dividirEmFrases('')).toEqual([])
  })

  it('fraseQueCita: a frase que cita a figura, com listas e intervalos; o número sem letra vale para todas as partes', () => {
    const t = 'Erster Testsatz ohne Bild. Zwei Probesiegel (Abb. 3b-c) und ein Testlöwe (Abb. 52-53). Dazu Abb. 210-211,213 und Abb. 212a und b. Zuletzt Abb. 7.'
    expect(fraseQueCita(t, 3, 'b')).toBe('Zwei Probesiegel (Abb. 3b-c) und ein Testlöwe (Abb. 52-53).')
    expect(fraseQueCita(t, 3, 'c')).toBe('Zwei Probesiegel (Abb. 3b-c) und ein Testlöwe (Abb. 52-53).')
    expect(fraseQueCita(t, 3, 'd')).toBeNull()
    expect(fraseQueCita(t, 53, '')).toBe('Zwei Probesiegel (Abb. 3b-c) und ein Testlöwe (Abb. 52-53).')
    expect(fraseQueCita(t, 211, '')).toBe('Dazu Abb. 210-211,213 und Abb. 212a und b.')
    expect(fraseQueCita(t, 213, '')).toBe('Dazu Abb. 210-211,213 und Abb. 212a und b.')
    expect(fraseQueCita(t, 212, 'b')).toBe('Dazu Abb. 210-211,213 und Abb. 212a und b.')
    expect(fraseQueCita(t, 7, 'a')).toBe('Zuletzt Abb. 7.')
    expect(fraseQueCita(t, 212, '')).toBe('Dazu Abb. 210-211,213 und Abb. 212a und b.')
    // em português («fig.») e em inglês («illus.»); a prancha («Pl. 3») não é figura
    expect(fraseQueCita('Um leão (fig. 1a) e o verso (figs. 1b-c). Ver Pl. 4.', 1, 'c')).toBe('Um leão (fig. 1a) e o verso (figs. 1b-c).')
    expect(fraseQueCita('A test lion (illus. 1a).', 1, 'a')).toBe('A test lion (illus. 1a).')
    expect(fraseQueCita('Um selo; cf. Pl. 4.', 4, '')).toBeNull()
  })

  it('fraseDoTrechoQueCita: a frase portuguesa que cita; senão a da mesma posição; senão a original; senão a primeira', () => {
    const original = 'Erster Testsatz. Ein Probesiegel (Abb. 5). Letzter Testsatz.'
    // o português cita a figura: essa frase, não a primeira
    expect(fraseDoTrechoQueCita(original, 'Primeira frase. Um selo de prova (fig. 5). Última frase.', 5, '')).toEqual({ frase: 'Um selo de prova (fig. 5).', lingua: 'pt' })
    // o português não deixa achar a referência, mas tem tantas frases quanto o original: a da mesma posição
    expect(fraseDoTrechoQueCita(original, 'Primeira frase. Um selo de prova (figura cinco). Última frase.', 5, '')).toEqual({ frase: 'Um selo de prova (figura cinco).', lingua: 'pt' })
    // o número de frases não bate: a frase original que cita
    expect(fraseDoTrechoQueCita(original, 'Uma frase só, sem a referência.', 5, '')).toEqual({ frase: 'Ein Probesiegel (Abb. 5).', lingua: 'original' })
    // sem tradução: a original
    expect(fraseDoTrechoQueCita(original, null, 5, '')).toEqual({ frase: 'Ein Probesiegel (Abb. 5).', lingua: 'original' })
    // nenhuma frase cita (a menção veio de outra forma): a primeira do português, ou a do original sem tradução
    expect(fraseDoTrechoQueCita(original, 'Primeira frase. Outra frase.', 9, '')).toEqual({ frase: 'Primeira frase.', lingua: 'pt' })
    expect(fraseDoTrechoQueCita(original, null, 9, '')).toEqual({ frase: 'Erster Testsatz.', lingua: 'original' })
  })
})

describe('o livro em parágrafos no pacote sintético', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
  })
  afterAll(() => usarMotor(null))

  it('o pacote é do schema 11 e abre as três publicações', async () => {
    expect(await abrirBanco()).toMatchObject({
      estado: 'aberto',
      publicacoes: [
        { sigla: 'TESTE', esquema: 'pub_TESTE' },
        { sigla: 'TESTEG', esquema: 'pub_TESTEG' },
        { sigla: 'TESTEGEN', esquema: 'pub_TESTEGEN' },
      ],
    })
    const [l] = await executar<{ user_version: number }>('PRAGMA pub_TESTEG.user_version')
    expect(l!.user_version).toBe(11)
  })

  it("paragrafo('TESTEG', 2): os dois trechos, o inglês alinhado, as duas correções, a nota, as figuras e os vizinhos", async () => {
    const p = (await paragrafo('TESTEG', 2))!
    expect(p).toMatchObject({ sigla: 'TESTEG', numero: 2, ano: 2021, traducao: { sigla: 'TESTEGEN', ano: 2022 } })
    // Tarefa 25: os vizinhos com a primeira frase (do português) e o caminho em português, com os grupos para os links
    expect(p.anterior).toEqual({ numero: 1, frase: 'Este livro de teste inventado ordena as suas imagens de prova em parágrafos; cada frase é uma frase de teste.' })
    expect(p.seguinte).toEqual({ numero: 3, frase: 'Um escaravelho de teste de Tell Achado Teste (Abb. 2) encerra a série de prova.' })
    expect(p.caminho).toEqual(['TESTEG', 'I. Época de teste e imagens de prova', '1. Selos de prova da fase de teste'])
    expect(p.grupos).toEqual([
      { id: 'GR-TESTEG-01', rotulo: 'I. Época de teste e imagens de prova' },
      { id: 'GR-TESTEG-01-01', rotulo: '1. Selos de prova da fase de teste' },
    ])
    // a seção (a subcoleção em que o § está) e os §§ dela, em ordem (decisão 91, a8)
    expect(p.secao).toEqual({ id: 'GR-TESTEG-01-01', subcolecao: true, paragrafos: [2, 3] })
    // as figuras que o § cita, com o número e a letra no livro (os links das menções no texto)
    expect(p.referencias).toEqual([
      { itemId: 'TESTEG-0001a', objeto: 'F200001', numero: 1, sufixo: 'a' },
      { itemId: 'TESTEG-0001b', objeto: 'CA00004', numero: 1, sufixo: 'b' },
    ])
    expect(p.trechos.map((t) => t.id)).toEqual(['PA-TESTEG-§2-txt-1', 'PA-TESTEG-§2-txt-2'])
    const [primeiro, segundo] = p.trechos
    expect(primeiro!.texto).toMatch(/^Zwei Probesiegel aus Maḥteṣ Teste/)
    expect(primeiro!.portugues).toBe('Dois selos de prova de Maḥteṣ Teste mostram um leão-de-teste (Abb. 1a) e o seu verso (Abb. 1b); cf. Pl. 3.')
    expect(primeiro!.termos).toEqual([{ glId: 'GL-900001', inicio: 47, fim: 60 }])
    expect(primeiro).toMatchObject({ estado: 'machine', desatualizada: false, pagina: 6, ordinal: 1 })
    expect(primeiro!.ingles).toBe('Two probe seals from Mahtes Teste show a test lion (illus. 1a) and its reverse (illus. 1b).')
    expect(segundo!.ingles).toBeNull()
    expect(primeiro!.correcoes).toEqual([
      { inicio: 21, fim: 27, lido: 'Mahtes', regra: 'ACENTO' },
      { inicio: 103, fim: 106, lido: 'PI.', regra: 'PL' },
    ])
    expect(primeiro!.correcoes.map((c) => primeiro!.texto.slice(c.inicio, c.fim))).toEqual(['Maḥteṣ', 'Pl.'])
    expect(segundo!.correcoes).toEqual([])
    // o inglês do pacote sintético não tem correção
    expect(primeiro!.correcoesDoIngles).toEqual([])
    // fix 1: a página do inglês, do banco da tradução
    expect(primeiro!.paginaDoIngles).toBe(6)
    expect(segundo!.paginaDoIngles).toBeNull()
    expect(p.notas.map((t) => [t.id, t.ordinal, t.portugues])).toEqual([
      // Tarefa 26: a nota cita a fig. 1b (o link dentro da nota)
      ['PA-TESTEG-§2-nota-2', 2, 'Nota de prova sobre a gravação de teste, inventada para o teste do aplicativo. Cf. Abb. 1b.'],
    ])
    // as figuras citadas no §, uma por objeto: 0001b é o CA00004 (a mesma peça que TESTE-0004, noutro banco)
    expect(p.figuras.map((f) => [f.numero, f.itemId, f.origem])).toEqual([
      ['F200001', 'TESTEG-0001a', 'TESTEG: 1a'],
      ['CA00004', 'TESTEG-0001b', 'TESTEG: 1b'],
    ])
  })

  it('o primeiro e o último §; o § que não existe, a obra que não está aberta e o livro sem §: null', async () => {
    const um = (await paragrafo('TESTEG', 1))!
    expect(um).toMatchObject({ anterior: null, seguinte: { numero: 2 }, figuras: [], referencias: [] })
    expect(um.seguinte!.frase).toBe('Dois selos de prova de Maḥteṣ Teste mostram um leão-de-teste (Abb. 1a) e o seu verso (Abb. 1b); cf. Pl. 3.')
    expect(um.caminho).toEqual(['TESTEG', 'I. Época de teste e imagens de prova'])
    expect(um.grupos).toEqual([{ id: 'GR-TESTEG-01', rotulo: 'I. Época de teste e imagens de prova' }])
    // o § do capítulo (o grupo de cima): «do capítulo», não «da seção»
    expect(um.secao).toEqual({ id: 'GR-TESTEG-01', subcolecao: false, paragrafos: [1] })
    expect(um.trechos[0]!.ingles).toBe('This invented test book arranges its probe images in paragraphs; every sentence is a test sentence.')
    expect(um.notas.map((n) => n.id)).toEqual(['PA-TESTEG-§1-nota-1'])
    const tres = (await paragrafo('TESTEG', 3))!
    expect(tres).toMatchObject({ anterior: { numero: 2 }, seguinte: null, notas: [] })
    expect(tres.secao).toEqual({ id: 'GR-TESTEG-01-01', subcolecao: true, paragrafos: [2, 3] })
    expect(tres.figuras.map((f) => f.numero)).toEqual(['F200002'])
    expect(await paragrafo('TESTEG', 4)).toBeNull()
    expect(await paragrafo('TESTEG', 0)).toBeNull()
    expect(await paragrafo('TESTEG', 2.5)).toBeNull()
    expect(await paragrafo('NAOHA', 1)).toBeNull()
    expect(await paragrafo('TESTE', 1)).toBeNull()
    // a tradução (TESTEGEN, `translation_of`) não tem página própria: o inglês aparece no § do original
    expect(await paragrafo('TESTEGEN', 1)).toBeNull()
    expect(await paragrafo('TESTEGEN', 2)).toBeNull()
  })

  it("paragrafosQueCitam: o § e a frase que cita a figura (decisão 91, a3), em português", async () => {
    expect(await paragrafosQueCitam('TESTEG-0001a')).toEqual([
      {
        sigla: 'TESTEG',
        numero: 2,
        trechoId: 'PA-TESTEG-§2-txt-1',
        frase: 'Dois selos de prova de Maḥteṣ Teste mostram um leão-de-teste (Abb. 1a) e o seu verso (Abb. 1b); cf. Pl. 3.',
        lingua: 'pt',
        // Tarefa 25: o caminho do §, em português (a figura o mostra em «Discutida em»)
        caminho: ['TESTEG', 'I. Época de teste e imagens de prova', '1. Selos de prova da fase de teste'],
      },
    ])
    expect((await paragrafosQueCitam('TESTEG-0002')).map((c) => [c.numero, c.frase])).toEqual([
      [3, 'Um escaravelho de teste de Tell Achado Teste (Abb. 2) encerra a série de prova.'],
    ])
    expect(await paragrafosQueCitam('TESTE-0001')).toEqual([])
    expect(await paragrafosQueCitam('NAOHA-1')).toEqual([])
  })

  it("a figura: `tipo 'figura'` e o rótulo sem «Abb.» (decisão 39)", async () => {
    const f = (await item('F200001'))!
    expect(f.itens.map((i) => [i.id, i.tipo, i.origem])).toEqual([['TESTEG-0001a', 'figura', 'TESTEG: 1a']])
    expect(f.origem).toBe('TESTEG: 1a')
    // só o crédito do Quellennachweis (campo 7), sem os outros campos do catálogo
    expect(f.catalogo.map((c) => [c.categoria, c.literal])).toEqual([[7, '1a-b Autor 1999: 22 Abb. 4 (Testkredit)']])
    expect(f.descricao).toBeNull()
  })

  it('a peça em dois livros (decisão 91, a2): o objeto junta o item do TESTE e a figura do TESTEG, o do TESTE primeiro', async () => {
    const o = (await item('CA00004'))!
    expect(o.itens.map((i) => [i.id, i.tipo, i.origem])).toEqual([
      ['TESTE-0004', 'catalog', 'TESTE I: 4'],
      ['TESTEG-0001b', 'figura', 'TESTEG: 1b'],
    ])
    expect(o.origem).toBe('TESTE I: 4')
    expect(o.imagens.map((i) => i.itemId)).toContain('TESTEG-0001b')
    expect(o.noLivro.map((l) => [l.publicacao, l.grupo.id, l.subcolecao?.id ?? null])).toEqual([
      ['TESTE', 'GR-TESTE-I-02', null],
      ['TESTEG', 'GR-TESTEG-01', 'GR-TESTEG-01-01'],
    ])
    // pelo id da figura também se chega ao objeto
    expect((await item('TESTEG-0001b'))!.numero).toBe('CA00004')
  })

  it('o achado «do texto» (decisão 90.1): `doTexto`, o trecho e o § de onde veio; o achado comum, não', async () => {
    expect((await item('F200002'))!.sitio).toMatchObject({
      id: 'TESTEG-9',
      nome: 'Tell Achado Teste',
      doTexto: true,
      trechoId: 'PA-TESTEG-§3-txt-1',
      paragrafo: 3,
    })
    expect((await item('CA00001'))!.sitio).toMatchObject({ id: 'TESTE-1', doTexto: false, trechoId: null, paragrafo: null })
  })

  it('o mapa: o sítio do achado «do texto» e a figura com a marca no cartão', async () => {
    const s = (await sitios()).find((x) => x.id === 'TESTEG-9')
    expect(s).toMatchObject({ nome: 'Tell Achado Teste', objetos: 1 })
    const objetos = (await objetosDosSitios(['TESTEG-9'])).get('TESTEG-9')!
    expect(objetos.map((o) => [o.numero, o.sitioId, o.achadoDoTexto])).toEqual([['F200002', 'TESTEG-9', { sigla: 'TESTEG', trechoId: 'PA-TESTEG-§3-txt-1', paragrafo: 3 }]])
    const [comum] = await resumosDosItens(['TESTE-0001'], 'dada')
    expect(comum!.achadoDoTexto).toBeUndefined()
  })
})

describe('linhas que o pacote sintético não tem, gravadas num banco de escrita', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    // o achado «do texto» tirado do crédito: sem trecho
    await executar("UPDATE pub_TESTEG.assertion SET passage_id = NULL, locator = NULL WHERE subject_id = 'TESTEG-0002'")
    // comparações entre os livros: de uma figura do TESTEG para um item do TESTE, e de um item do TESTE para uma figura
    await executar("INSERT INTO pub_TESTEG.comparison (from_type, from_id, to_type, to_id, degree, publication, locator) VALUES ('item', 'TESTEG-0001a', 'item', 'TESTE-0002', 'comparable', 'TESTEG', '§2')")
    await executar("INSERT INTO pub_TESTE.comparison (from_type, from_id, to_type, to_id, degree, publication, locator) VALUES ('item', 'TESTE-0003', 'item', 'TESTEG-0002', 'strict', 'TESTE', 'TESTE I, Nr. 3')")
    // as menções da tradução aos itens do original (no pacote real, o GGIG as grava: «illus. 1a» → GGG-…), uma delas num § do
    // TESTEGEN cujo § do TESTEG não cita a figura
    await executar("INSERT INTO pub_TESTEGEN.passage_item (passage_id, item_id, role) VALUES ('PA-TESTEGEN-§2-txt-1', 'TESTEG-0001a', 'mentions'), ('PA-TESTEGEN-§1-txt-1', 'TESTEG-0002', 'mentions')")
  })
  afterAll(() => usarMotor(null))

  it('revisão 1, I1: as menções da tradução não dão outra linha em «Discutida em»; só os §§ do TESTEG', async () => {
    const [n] = await executar<{ n: number }>("SELECT count(*) AS n FROM pub_TESTEGEN.passage_item WHERE role = 'mentions'")
    expect(n!.n).toBe(2)
    expect((await paragrafosQueCitam('TESTEG-0001a')).map((c) => [c.sigla, c.numero, c.lingua])).toEqual([['TESTEG', 2, 'pt']])
    expect((await paragrafosQueCitam('TESTEG-0002')).map((c) => [c.sigla, c.numero])).toEqual([['TESTEG', 3]])
    // e a página do § 2 continua com as figuras do TESTEG só
    expect((await paragrafo('TESTEG', 2))!.figuras.map((f) => f.itemId)).toEqual(['TESTEG-0001a', 'TESTEG-0001b'])
  })

  it('a comparação aponta para um item do outro banco: o número do objeto vem dele', async () => {
    expect((await item('F200001'))!.relacoes.paralelos.map((p) => [p.itemId, p.numero, p.grau])).toEqual([['TESTE-0002', 'CA00002', 'comparable']])
    expect((await item('TESTE-0003'))!.relacoes.paralelos.map((p) => [p.itemId, p.numero, p.grau])).toContainEqual(['TESTEG-0002', 'F200002', 'strict'])
  })

  it('Tarefa 25: as correções do inglês (do banco da tradução), em UTF-16 do inglês juntado, deslocadas pelo trecho de antes', async () => {
    // dois trechos ingleses no mesmo trecho alemão (o GGIG divide alguns parágrafos): o segundo vem depois de um espaço
    await executar(
      "INSERT INTO pub_TESTEGEN.passage (id, publication, locator, kind, ordinal, language, text, page, translation_state, translation_stale, aligned_passage) VALUES ('PA-TESTEGEN-§3-txt-2', 'TESTEGEN', '§3', 'running_text', 2, 'en', '  A second probe pl. 4 sentence.', 7, NULL, 0, 'PA-TESTEG-§3-txt-1')",
    )
    await executar(
      "INSERT INTO pub_TESTEGEN.correcao_de_leitura (entidade, entidade_id, inicio, fim, lido, regra) VALUES ('passage', 'PA-TESTEGEN-§3-txt-1', 2, 6, 'tesl', 'ACENTO'), ('passage', 'PA-TESTEGEN-§3-txt-2', 17, 20, 'pi.', 'PL_INGLES')",
    )
    const [t] = (await paragrafo('TESTEG', 3))!.trechos
    expect(t!.ingles).toBe('A test scarab from Tell Achado Teste (illus. 2) closes the probe series. A second probe pl. 4 sentence.')
    expect(t!.correcoesDoIngles).toEqual([
      { inicio: 2, fim: 6, lido: 'tesl', regra: 'ACENTO' },
      { inicio: 88, fim: 91, lido: 'pi.', regra: 'PL_INGLES' },
    ])
    expect(t!.correcoesDoIngles.map((c) => t!.ingles!.slice(c.inicio, c.fim))).toEqual(['test', 'pl.'])
    // a página é a do primeiro trecho juntado
    expect(t!.paginaDoIngles).toBe(7)
  })

  it('`doTexto` continua; o trecho e o § são null', async () => {
    expect((await item('F200002'))!.sitio).toMatchObject({ id: 'TESTEG-9', doTexto: true, trechoId: null, paragrafo: null })
    const objetos = (await objetosDosSitios(['TESTEG-9'])).get('TESTEG-9')!
    expect(objetos[0]!.achadoDoTexto).toEqual({ sigla: 'TESTEG', trechoId: null, paragrafo: null })
  })
})

describe('o pacote 10 de antes (tests/fixtures/pacote-10) continua a abrir: sem livro em parágrafos', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ raiz: RAIZ_DO_PACOTE_10 }))
  })
  afterAll(() => usarMotor(null))

  it('abre; sem `correcao_de_leitura`; as consultas novas dão null e listas vazias, sem erro de SQL', async () => {
    expect(await abrirBanco()).toMatchObject({ estado: 'aberto', publicacoes: [{ sigla: 'TESTE', esquema: 'pub_TESTE' }] })
    const [l] = await executar<{ user_version: number }>('PRAGMA pub_TESTE.user_version')
    expect(l!.user_version).toBe(10)
    expect(await paragrafo('TESTE', 1)).toBeNull()
    expect(await paragrafosQueCitam('TESTE-0001')).toEqual([])
    expect((await item('CA00001'))!.sitio).toMatchObject({ id: 'TESTE-1', doTexto: false, trechoId: null, paragrafo: null })
  })
})

describe('fix round 1 da Tarefa 27 (M6): «Discutida em» e o inglês sem consultas a mais', () => {
  const sqls: string[] = []
  beforeAll(async () => {
    const banco = await bancoDeTeste({ escrita: true })
    const executarDoBanco = banco.executar.bind(banco)
    banco.executar = (sql, parametros) => {
      sqls.push(sql)
      return executarDoBanco(sql, parametros)
    }
    usarMotor(banco)
    // a figura 1a citada também no § 3: dois §§ que a citam
    await executar("INSERT INTO pub_TESTEG.passage_item (passage_id, item_id, role) VALUES ('PA-TESTEG-§3-txt-1', 'TESTEG-0001a', 'mentions')")
  })
  afterAll(() => usarMotor(null))

  it('o caminho dos §§ que citam vem numa consulta por publicação, não uma por §', async () => {
    sqls.length = 0
    const citam = await paragrafosQueCitam('TESTEG-0001a')
    expect(citam.map((c) => [c.numero, c.caminho])).toEqual([
      [2, ['TESTEG', 'I. Época de teste e imagens de prova', '1. Selos de prova da fase de teste']],
      [3, ['TESTEG', 'I. Época de teste e imagens de prova', '1. Selos de prova da fase de teste']],
    ])
    // o caminho por trecho (`intro_passage_id IN` com os ids dos trechos) não é mais pedido § a §
    expect(sqls.filter((x) => /author_group g WHERE g\.intro_passage_id IN/.test(x))).toEqual([])
    expect(sqls.filter((x) => /FROM pub_TESTEG\.author_group_passage ap/.test(x))).toHaveLength(1)
  })

  it('Tarefa 6 (revisão da Tarefa 23, M6): as traduções e a coluna `aligned_passage` são olhadas uma vez por pacote, não a cada §', async () => {
    await paragrafo('TESTEG', 2)
    sqls.length = 0
    const p = (await paragrafo('TESTEG', 3))!
    expect(p.trechos[0]!.ingles).not.toBeNull()
    expect(p.traducao).toEqual({ sigla: 'TESTEGEN', ano: 2022 })
    expect(sqls.filter((x) => x.includes('pragma_table_info'))).toEqual([])
    expect(sqls.filter((x) => /SELECT translation_of FROM/.test(x))).toEqual([])
  })

  it('Tarefa 6 (revisão da Tarefa 23, M4): o achado do resumo (o sítio, o id e o «do texto») sai de uma subconsulta só', async () => {
    sqls.length = 0
    const [r] = await resumosDosItens(['TESTEG-0002'], 'dada')
    expect(r).toMatchObject({ sitio: 'Tell Achado Teste', sitioId: 'TESTEG-9', achadoDoTexto: { sigla: 'TESTEG', trechoId: 'PA-TESTEG-§3-txt-1', paragrafo: 3 } })
    const doResumo = sqls.find((x) => x.includes('AS campo5'))!
    // uma subconsulta do achado por publicação (a consulta une as três publicações abertas)
    expect(doResumo.match(/a\.field = 'findspot'/g)).toHaveLength(3)
  })

  it('o inglês alinhado só é procurado na tradução (o catálogo e o livro em parágrafos não têm `aligned_passage`)', async () => {
    sqls.length = 0
    expect((await paragrafo('TESTEG', 2))!.trechos[0]!.ingles).not.toBeNull()
    const doIngles = sqls.filter((x) => /WHERE aligned_passage IN/.test(x))
    expect(doIngles).toHaveLength(1)
    expect(doIngles[0]).toContain('pub_TESTEGEN.passage')
    expect(doIngles[0]).not.toMatch(/pub_TESTE\.passage|pub_TESTEG\.passage/)
  })
})
