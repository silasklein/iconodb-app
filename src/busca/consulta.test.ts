// @vitest-environment node
/**
 * Busca sobre o pacote sintético (6 objetos, 9 verbetes, 2 obras; sítios "Maḥteṣ Teste" e
 * "Tell Probe Teste"): montagem da consulta FTS5 e `buscar`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import { usarMotor } from '../banco/cliente'
import { buscar, montarConsulta } from './consulta'
import { lerTabelaDeFold } from './fold'

const tabela = lerTabelaDeFold(JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo/fold.json'), 'utf8')))
const numeros = (r: { objetos: { numero: string }[] }) => r.objetos.map((o) => o.numero)

describe('montarConsulta()', () => {
  it('dobra, entre aspas cada palavra, com prefixo * na última', () => {
    expect(montarConsulta('mahtes', tabela)).toBe('"mahtes"*')
    expect(montarConsulta('Maḥteṣ Teste', tabela)).toBe('"mahtes" "teste"*')
    expect(montarConsulta("Marduk's", tabela)).toBe('"marduk" "s"*')
    expect(montarConsulta('  leão   de  teste ', tabela)).toBe('"leao" "de" "teste"*')
  })

  it.each([[''], ['   '], ['"'], ['*'], ['" * "'], ['()'], ['ʿ'], ['\t\n']])('%j não deixa nada: null', (digitado) => {
    expect(montarConsulta(digitado, tabela)).toBeNull()
  })

  it('nenhuma sintaxe do FTS5 digitada chega ao MATCH', () => {
    expect(montarConsulta('leao OR teste', tabela)).toBe('"leao" "or" "teste"*')
    expect(montarConsulta('NEAR(a b)', tabela)).toBe('"near" "a" "b"*')
    expect(montarConsulta('"leao" -teste', tabela)).toBe('"leao" "teste"*')
    expect(montarConsulta('texto: leao*', tabela)).toBe('"texto" "leao"*')
    expect(montarConsulta('a"b', tabela)).toBe('"a" "b"*')
  })

  it('números e letras de outros alfabetos ficam', () => {
    expect(montarConsulta('CA00001', tabela)).toBe('"ca00001"*')
    expect(montarConsulta('Ἀθηνᾶ 3', tabela)).toBe('"αθηνα" "3"*')
  })
})

describe('buscar() sobre o pacote sintético', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
  })
  afterAll(() => usarMotor(null))

  const opcoes = { escopo: 'tudo', filtros: {}, tabela } as const

  it('"mahtes" acha os itens do sítio "Maḥteṣ Teste"', async () => {
    const r = await buscar('mahtes', opcoes)
    expect(numeros(r)).toEqual(['BA00001', 'CA00001', 'CA00002'])
    expect(r.total).toBe(3)
  })

  it('"marduk" acha o item do sítio "Marduk\'s" (apóstrofo separa palavras)', async () => {
    // "Marduk's" está só na referência Chicago da obra BIB-900002, citada pelos objetos BA00001 e BA00002
    const r = await buscar('marduk', opcoes)
    expect(numeros(r)).toEqual(['BA00001', 'BA00002'])
    expect(numeros(await buscar('marduk', { ...opcoes, escopo: 'bibliografia' }))).toEqual(['BA00001', 'BA00002'])
    expect((await buscar('marduk', { ...opcoes, escopo: 'local' })).total).toBe(0)
  })

  it('"marduks" (forma colada) acha o mesmo que "marduk\'s"', async () => {
    const a = await buscar("marduk's", opcoes)
    const b = await buscar('marduks', opcoes)
    expect(numeros(b)).toEqual(numeros(a))
    expect(b.total).toBeGreaterThan(0)
  })

  it.each([[''], ['   '], ['"'], ['*']])('%j: sem erro, sem resultado', async (digitado) => {
    const r = await buscar(digitado, opcoes)
    expect(r).toMatchObject({ vazia: true, total: 0, objetos: [], numeros: [] })
    expect(r.verbeteDestaque).toBeUndefined()
  })

  it.each([['a'], ['ʿa'], ['"a"'], [' Ç '], ['9']])('%j tem menos de 2 letras: não busca, mas pede mais letras', async (digitado) => {
    const r = await buscar(digitado, opcoes)
    expect(r).toMatchObject({ vazia: true, curta: true, total: 0, objetos: [] })
  })

  it('"ca" (duas letras) já busca', async () => {
    expect(await buscar('ca', opcoes)).toMatchObject({ vazia: false, curta: false })
    expect(await buscar('"', opcoes)).toMatchObject({ vazia: true, curta: false })
  })

  it('aspas e * digitados no meio não quebram o FTS5', async () => {
    for (const digitado of ['"mahtes', 'mahtes"', 'mahtes*', '*mahtes', 'mahtes OR', 'NEAR(', '(mahtes', 'a AND', '^mahtes', 'texto:mahtes', '"" ""']) {
      await expect(buscar(digitado, opcoes)).resolves.toBeTruthy()
    }
  })

  it('verbete cujo nome dobrado é a consulta aparece em destaque, com seus objetos', async () => {
    const r = await buscar('Leão-de-Teste', opcoes)
    expect(r.verbeteDestaque?.id).toBe('GL-900001')
    expect(r.verbeteDestaque?.objetos.map((o) => o.numero)).toEqual(['CA00001', 'CA00002'])
    expect(numeros(r)).toEqual(expect.arrayContaining(['CA00001', 'CA00002']))
  })

  it('um único verbete que casa por prefixo também vai em destaque', async () => {
    expect((await buscar('mahtes', opcoes)).verbeteDestaque?.id).toBe('GL-900004')
  })

  it('várias respostas parciais e nenhuma exata: sem destaque, com "ver também"', async () => {
    const r = await buscar('teste', opcoes)
    expect(r.verbeteDestaque).toBeUndefined()
    expect(r.verbetesRelacionados.length).toBeGreaterThan(1)
  })

  it('escopo "termo": só o que vem de verbetes', async () => {
    const r = await buscar('leão-de-teste', { ...opcoes, escopo: 'termo' })
    expect(r.verbeteDestaque?.id).toBe('GL-900001')
    // inclui BA00001, que tem hipótese no verbete vizinho "filhote de leão-de-teste"
    expect(numeros(r)).toEqual(['BA00001', 'CA00001', 'CA00002'])
  })

  it('escopo "local": objetos dos sítios que casam', async () => {
    expect(numeros(await buscar('probe', { ...opcoes, escopo: 'local' }))).toEqual(['BA00002', 'CA00003', 'CA00004'])
    expect((await buscar('leão', { ...opcoes, escopo: 'local' })).total).toBe(0)
  })

  it('escopo "bibliografia": objetos que citam a obra', async () => {
    // BIB-900001 ("Autor 1999") é citada por TESTE-0001 a 0004
    expect(numeros(await buscar('autor', { ...opcoes, escopo: 'bibliografia' }))).toEqual(
      expect.arrayContaining(['CA00001', 'CA00002', 'CA00003', 'CA00004']),
    )
  })

  it('escopo "colecao": grupos de obra (author_group); as coleções SKC são testadas em usuario/indice.test.ts', async () => {
    expect((await buscar('xyzzy', { ...opcoes, escopo: 'colecao' })).total).toBe(0)
    // o título do primeiro grupo do pacote sintético: "Animais de teste e figuras de prova"
    const r = await buscar('figuras de prova', { ...opcoes, escopo: 'colecao' })
    expect(numeros(r)).toEqual(['CA00001', 'CA00002', 'CA00003'])
    // sem coleção do usuário no estado, um título de coleção qualquer não acha nada
    expect((await buscar('minhas notas', { ...opcoes, escopo: 'colecao' })).total).toBe(0)
  })

  it('contagens por escopo, para as abas', async () => {
    const r = await buscar('mahtes', opcoes)
    expect(r.contagens.tudo).toBe(3)
    expect(r.contagens.termo).toBeLessThanOrEqual(r.contagens.tudo)
    expect(Object.keys(r.contagens).sort()).toEqual(['bibliografia', 'colecao', 'local', 'termo', 'tudo'])
  })

  it('número do objeto digitado acha o objeto', async () => {
    expect(numeros(await buscar('ca00003', opcoes))).toEqual(['CA00003'])
  })

  it('cada resultado é um objeto com número, origem, tipo, sítio e miniatura', async () => {
    const [o] = (await buscar('mahtes', opcoes)).objetos
    expect(o).toMatchObject({ numero: 'BA00001', origem: 'TESTE I: 5' })
    expect(o).toHaveProperty('miniatura')
    expect(o).toHaveProperty('sitio')
    expect(o).toHaveProperty('tipo')
  })

  it('filtros: filtra, conta as facetas e mantém o total sem filtros', async () => {
    const todos = await buscar('teste', opcoes)
    const r = await buscar('teste', { ...opcoes, filtros: { nivel: ['iconographic'] } })
    expect(r.totalSemFiltros).toBe(todos.total)
    expect(r.total).toBeLessThan(todos.total)
    expect(r.facetas.map((f) => f.chave)).toEqual(expect.arrayContaining(['publicacao', 'sitio', 'tipo', 'nivel']))
  })

  it('limite corta os objetos mas não o total nem a lista ordenada de números', async () => {
    const r = await buscar('teste', { ...opcoes, limite: 2 })
    expect(r.objetos).toHaveLength(2)
    expect(r.total).toBeGreaterThan(2)
    expect(r.numeros).toHaveLength(r.total)
    expect(r.numeros.slice(0, 2)).toEqual(numeros(r))
  })
})
