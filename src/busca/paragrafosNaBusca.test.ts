// @vitest-environment node
/**
 * Etapa 4, Tarefa 23: a busca acha os §§ do livro em parágrafos (`TESTEG`, e o inglês do `TESTEGEN`, que abre o § do
 * TESTEG) e as figuras pela referência («TESTEG: 1a», decisão 39, sem «Abb.»). Os §§ não são objetos: vêm em `paragrafos`,
 * com a rota `/paragrafo/:sigla/:numero` (o bloco «Nos §§» e a aba «Texto» da Tarefa 26; decisão 91, a6).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import { usarMotor } from '../banco/cliente'
import * as leituraModulo from '../banco/leitura'
import { rotaDoTrecho } from '../banco/leitura'
import { buscar } from './consulta'
import { lerTabelaDeFold } from './fold'

const tabela = lerTabelaDeFold(JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo/fold.json'), 'utf8')))
const opcoes = { escopo: 'tudo', filtros: {}, tabela } as const
const numeros = (r: { objetos: { numero: string }[] }) => r.objetos.map((o) => o.numero)

describe('os §§ na busca', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
  })
  afterAll(() => usarMotor(null))

  it('o alemão (corrigido) e o português do § acham o §, com a rota da página do §', async () => {
    const r = await buscar('Testskarabäus', opcoes)
    expect(r.paragrafos).toEqual([
      {
        sigla: 'TESTEG',
        numero: 3,
        rotulo: 'TESTEG § 3',
        caminho: '/paragrafo/TESTEG/3',
        trechos: ['PA-TESTEG-§3-txt-1'],
        publicacoes: ['TESTEG'],
        // Tarefa 26: o trecho que se mostra (o que casou: aqui o alemão, porque o português diz «escaravelho») e o caminho
        trecho: expect.objectContaining({ id: 'PA-TESTEG-§3-txt-1', nota: null, texto: 'Ein Testskarabäus aus Tell Achado Teste (Abb. 2) schließt die Probereihe ab.', lingua: 'de' }),
        trilha: ['I. Época de teste e imagens de prova', '1. Selos de prova da fase de teste'],
      },
    ])
    const pt = (await buscar('escaravelho', opcoes)).paragrafos
    expect(pt.map((p) => p.caminho)).toEqual(['/paragrafo/TESTEG/3'])
    expect(pt[0]!.trecho).toMatchObject({ id: 'PA-TESTEG-§3-txt-1', nota: null, texto: 'Um escaravelho de teste de Tell Achado Teste (Abb. 2) encerra a série de prova.', lingua: 'pt-BR' })
    // o recorte que a tela mostra, com o termo em destaque
    expect(pt[0]!.trecho.recorte).toEqual([
      { texto: 'Um ', forte: false },
      { texto: 'escaravelho', forte: true },
      { texto: ' de teste de Tell Achado Teste (Abb. 2) encerra a série de prova.', forte: false },
    ])
  })

  it('o inglês do TESTEGEN abre o § do TESTEG (a tradução não tem página própria)', async () => {
    expect((await buscar('scarab', opcoes)).paragrafos).toEqual([
      {
        sigla: 'TESTEG',
        numero: 3,
        rotulo: 'TESTEG § 3',
        caminho: '/paragrafo/TESTEG/3',
        trechos: ['PA-TESTEGEN-§3-txt-1'],
        publicacoes: ['TESTEGEN'],
        trecho: expect.objectContaining({ id: 'PA-TESTEGEN-§3-txt-1', nota: null, texto: 'A test scarab from Tell Achado Teste (illus. 2) closes the probe series.', lingua: 'en' }),
        trilha: ['I. Época de teste e imagens de prova', '1. Selos de prova da fase de teste'],
      },
    ])
  })

  it('as notas contam para o § delas; um § por vez, na ordem do livro', async () => {
    const r = await buscar('Probenote', opcoes)
    expect(r.paragrafos.map((p) => [p.numero, p.trechos])).toEqual([
      [1, ['PA-TESTEG-§1-nota-1']],
      [2, ['PA-TESTEG-§2-nota-2']],
    ])
    // o trecho mostrado é a nota, com o número dela
    expect(r.paragrafos.map((p) => [p.trecho.id, p.trecho.nota])).toEqual([
      ['PA-TESTEG-§1-nota-1', 1],
      ['PA-TESTEG-§2-nota-2', 2],
    ])
    // o § 2 tem dois trechos e o inglês: os três juntos num só resultado
    const dois = (await buscar('probesiegel', opcoes)).paragrafos.find((p) => p.numero === 2)!
    expect(dois.trechos).toEqual(['PA-TESTEG-§2-txt-1', 'PA-TESTEG-§2-txt-2'])
    expect((await buscar('probe seals', opcoes)).paragrafos.map((p) => [p.numero, p.publicacoes])).toEqual([[2, ['TESTEGEN']]])
  })

  it('no «Tudo» e na aba «Texto» (a6); um filtro de objeto os esconde, o de publicação os deixa quando é a do §', async () => {
    expect((await buscar('Testskarabäus', { ...opcoes, escopo: 'termo' })).paragrafos).toEqual([])
    // a aba «Texto» só tem §§: nenhum objeto; a contagem dela é a dos §§, em toda aba
    const texto = await buscar('Probenote', { ...opcoes, escopo: 'texto' })
    expect(texto.paragrafos.map((p) => p.numero)).toEqual([1, 2])
    expect([texto.objetos, texto.total]).toEqual([[], 0])
    expect(texto.contagens.texto).toBe(2)
    expect((await buscar('Probenote', { ...opcoes, escopo: 'termo' })).contagens.texto).toBe(2)
    expect((await buscar('Probenote', opcoes)).contagens.texto).toBe(2)
    expect((await buscar('Testskarabäus', { ...opcoes, filtros: { periodo: ['F2'] } })).paragrafos).toEqual([])
    expect((await buscar('Testskarabäus', { ...opcoes, filtros: { publicacao: ['TESTEG'] } })).paragrafos).toHaveLength(1)
    expect((await buscar('scarab', { ...opcoes, filtros: { publicacao: ['TESTEGEN'] } })).paragrafos).toHaveLength(1)
    expect((await buscar('Testskarabäus', { ...opcoes, filtros: { publicacao: ['TESTE'] } })).paragrafos).toEqual([])
    expect((await buscar('', opcoes)).paragrafos).toEqual([])
  })

  it('a figura pela referência, sem «Abb.»: «TESTEG: 1a», «TESTEG 1b» e «TESTEG 2»', async () => {
    expect(numeros(await buscar('TESTEG: 1a', opcoes))).toEqual(['F200001'])
    expect(numeros(await buscar('TESTEG 1b', opcoes))).toEqual(['CA00004'])
    expect(numeros(await buscar('testeg 2', opcoes))).toEqual(['F200002'])
    expect((await buscar('TESTEG: 1a', opcoes)).paragrafos).toEqual([])
  })

  it('fix round 1 da Tarefa 27 (M1): o número da figura sem a letra acha todas as partes; «Abb.» também vale no livro em parágrafos', async () => {
    // o livro cita «Abb. 1» pelas duas partes (1a e 1b): o número sozinho acha as duas, e nada mais
    expect(numeros(await buscar('TESTEG 1', opcoes)).sort()).toEqual(['CA00004', 'F200001'])
    expect(numeros(await buscar('TESTEG: 1', opcoes)).sort()).toEqual(['CA00004', 'F200001'])
    expect(numeros(await buscar('TESTEG: Abb. 1', opcoes)).sort()).toEqual(['CA00004', 'F200001'])
    expect(numeros(await buscar('TESTEG: Abb. 1a', opcoes))).toEqual(['F200001'])
    expect(numeros(await buscar('TESTEG 2', opcoes))).toEqual(['F200002'])
    // a letra que não existe não acha nada; no catálogo, o número sem letra continua exato (TESTE I: 4 não acha um 4a)
    expect(numeros(await buscar('TESTEG 1c', opcoes))).toEqual([])
    expect(numeros(await buscar('TESTE I: 4', opcoes))).toEqual(['CA00004'])
  })

  it('Tarefa 26: «do texto» é um valor da faceta «Certeza do sítio» (o achado tirado do §), e filtra', async () => {
    const r = await buscar('Testkredit', opcoes)
    const certeza = r.facetas.find((f) => f.chave === 'certeza')!
    // F200002 (o § 3) e F200001 (o § 2, no TESTEG-2 de mesmo número do TESTE-2; M6)
    expect(certeza.opcoes.find((o) => o.valor === 'do_texto')).toMatchObject({ rotulo: 'do texto', n: 2 })
    expect(numeros(await buscar('Testkredit', { ...opcoes, filtros: { certeza: ['do_texto'] } }))).toEqual(['F200001', 'F200002'])
  })

  it('o crédito da figura (campo 7) acha as figuras', async () => {
    expect(numeros(await buscar('Testkredit', opcoes))).toEqual(['CA00004', 'F200001', 'F200002'])
  })

  it('Tarefa 5 da leitura: o trecho de introdução de uma obra de catálogo entra como achado de página, com a rota do trecho na leitura', async () => {
    // «estrelas» só está no panorama da p. 19 (o começo do grupo GR-TESTE-I-02)
    const r = await buscar('estrelas', opcoes)
    expect(r.paragrafos).toEqual([
      {
        tipo: 'pagina',
        rotuloDoTipo: 'grupo',
        sigla: 'TESTE',
        numero: 19,
        rotulo: 'TESTE I, p. 19',
        caminho: rotaDoTrecho('TESTE', 'PA-TESTE-I.S.19-ovw-1'),
        trechos: ['PA-TESTE-I.S.19-ovw-1'],
        publicacoes: ['TESTE'],
        trecho: expect.objectContaining({ id: 'PA-TESTE-I.S.19-ovw-1', nota: null, lingua: 'pt-BR', texto: expect.stringContaining('estrelas de prova') }),
        trilha: [],
      },
    ])
    // a aba «Texto» conta a página (e diz quantas são páginas, para os rótulos); o alemão também acha
    expect(r.contagens.texto).toBe(1)
    expect(r.paginasNoTexto).toBe(1)
    expect((await buscar('Testskarabäus', opcoes)).paginasNoTexto).toBe(0)
    expect((await buscar('estrelas', { ...opcoes, escopo: 'texto' })).paragrafos.map((p) => p.rotulo)).toEqual(['TESTE I, p. 19'])
    expect((await buscar('Probesterne', opcoes)).paragrafos[0]!.trecho).toMatchObject({ id: 'PA-TESTE-I.S.19-ovw-1', lingua: 'de' })
  })

  it('Tarefa 5 da leitura: o objeto que o trecho já dava continua; a obra de catálogo vem antes do livro em parágrafos e a contagem soma os dois', async () => {
    const d = await buscar('denteados', opcoes)
    expect(numeros(d)).toEqual(['BA00001', 'BA00002', 'CA00004'])
    expect(d.paragrafos.map((p) => [p.tipo, p.rotulo])).toEqual([['pagina', 'TESTE I, p. 19']])
    const selos = await buscar('selos', opcoes)
    expect(selos.paragrafos.map((p) => [p.tipo ?? 'paragrafo', p.rotulo])).toEqual([
      ['pagina', 'TESTE I, p. 19'],
      ['paragrafo', 'TESTEG § 2'],
    ])
    expect(selos.contagens.texto).toBe(2)
    expect(selos.paginasNoTexto).toBe(1)
    // dois passos da mesma obra: cada um o seu achado, na ordem da leitura (a subcoleção 1.1 na p. 10, depois a p. 11)
    expect((await buscar('sozinho', opcoes)).paragrafos.map((p) => [p.rotulo, p.rotuloDoTipo, p.caminho])).toEqual([
      ['TESTE I, p. 10', 'subcolecao', rotaDoTrecho('TESTE', 'PA-TESTE-I.S.10-ovw-1')],
      ['TESTE I, p. 11', 'subcolecao', rotaDoTrecho('TESTE', 'PA-TESTE-I.S.11-ovw-1')],
    ])
    // um filtro de objeto esconde a página, como o §; o de publicação a deixa quando é a da obra
    expect((await buscar('estrelas', { ...opcoes, filtros: { periodo: ['F2'] } })).paragrafos).toEqual([])
    expect((await buscar('estrelas', { ...opcoes, filtros: { publicacao: ['TESTE'] } })).paragrafos).toHaveLength(1)
    expect((await buscar('estrelas', { ...opcoes, filtros: { publicacao: ['TESTEG'] } })).paragrafos).toEqual([])
  })

  it('fix final (m1): se a ordem de leitura falha (pacote velho estranho, erro de SQL), a busca continua e acha os §§ do TESTEG', async () => {
    const falha = vi.spyOn(leituraModulo, 'trechosNaLeitura').mockRejectedValue(new Error('ordem estragada'))
    try {
      const r = await buscar('Testskarabäus', opcoes)
      expect(r.paragrafos.map((p) => [p.tipo ?? 'paragrafo', p.rotulo])).toEqual([['paragrafo', 'TESTEG § 3']])
      expect(r.paginasNoTexto).toBe(0)
      // sem as páginas: a busca não as inventa, e o § continua
      expect((await buscar('selos', opcoes)).paragrafos.map((p) => p.rotulo)).toEqual(['TESTEG § 2'])
      expect(falha).toHaveBeenCalled()
    } finally {
      falha.mockRestore()
    }
  })

  it('fix final (m4): o resultado diz se há obra de leitura aberta (a aba «Texto» também busca as introduções); se a consulta falha, não', async () => {
    expect((await buscar('nadadisto', { ...opcoes, escopo: 'texto' })).comLeitura).toBe(true)
    const soGgg = vi.spyOn(leituraModulo, 'obrasDeLeitura').mockResolvedValue([])
    try {
      expect((await buscar('nadadisto', { ...opcoes, escopo: 'texto' })).comLeitura).toBe(false)
      soGgg.mockRejectedValue(new Error('ordem estragada'))
      expect((await buscar('nadadisto', { ...opcoes, escopo: 'texto' })).comLeitura).toBe(false)
    } finally {
      soGgg.mockRestore()
    }
  })
})
