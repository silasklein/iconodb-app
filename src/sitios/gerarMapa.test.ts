/**
 * O gerador do mapa base (scripts/gerar-mapa.ts, rodado à mão): as peças puras (recorte, simplificação, codificação) e a
 * conferência do JSON versionado contra a extensão do script.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EXTENSAO, SHA256_DO_WORLD_ATLAS, SHA256_DOS_LAGOS, gerarMapa, UNIDADE, codificar, recortarAnel, recortarLinha, simplificar, simplificarAnel } from '../../scripts/gerar-mapa'
import base from './mapa-base.json'
import { EXTENSAO as EXTENSAO_DO_APP } from './mapa'

describe('scripts/gerar-mapa.ts', () => {
  it('a extensão e a unidade do script são as do app e as do JSON versionado', () => {
    expect(EXTENSAO).toEqual(EXTENSAO_DO_APP)
    expect(base.unidade).toBe(UNIDADE)
    expect(base.versao).toBe(1)
  })

  it('o SHA-256 dos lagos é um hash de 64 hexadecimais', () => {
    expect(SHA256_DOS_LAGOS).toMatch(/^[0-9a-f]{64}$/)
    expect(createHash('sha256').update('x').digest('hex')).not.toBe(SHA256_DOS_LAGOS)
  })

  describe('os arquivos do world-atlas são conferidos pelo SHA-256 (uma instalação diferente não gera outro mapa sem aviso)', () => {
    it('os dois hashes são de 64 hexadecimais, e os arquivos instalados batem', () => {
      expect(Object.keys(SHA256_DO_WORLD_ATLAS).sort()).toEqual(['countries-10m.json', 'land-10m.json'])
      for (const [arquivo, sha] of Object.entries(SHA256_DO_WORLD_ATLAS)) {
        expect(sha).toMatch(/^[0-9a-f]{64}$/)
        expect(createHash('sha256').update(readFileSync(join('node_modules', 'world-atlas', arquivo))).digest('hex'), arquivo).toBe(sha)
      }
    })

    it.each(['land-10m.json', 'countries-10m.json'])('um %s diferente do esperado faz o gerador parar', (arquivo) => {
      const raiz = mkdtempSync(join(tmpdir(), 'wa-'))
      try {
        mkdirSync(join(raiz, 'world-atlas'))
        for (const a of Object.keys(SHA256_DO_WORLD_ATLAS)) writeFileSync(join(raiz, 'world-atlas', a), readFileSync(join('node_modules', 'world-atlas', a)))
        writeFileSync(join(raiz, 'world-atlas', arquivo), '{"type":"Topology","objects":{},"arcs":[]}')
        expect(() => gerarMapa(raiz, '{"type":"FeatureCollection","features":[]}')).toThrow(new RegExp(`${arquivo}.*SHA-256`))
      } finally {
        rmSync(raiz, { recursive: true, force: true })
      }
    })
  })

  describe('recortarAnel (Sutherland–Hodgman)', () => {
    it('um anel inteiro dentro fica como está (sem repetir o primeiro ponto)', () => {
      const anel: [number, number][] = [[30, 30], [31, 30], [31, 31], [30, 31], [30, 30]]
      expect(recortarAnel(anel)).toHaveLength(4)
    })
    it('um anel inteiro fora some', () => {
      expect(recortarAnel([[100, 0], [101, 0], [101, 1]])).toEqual([])
    })
    it('um anel que cruza a borda é cortado nela', () => {
      const r = recortarAnel([[60, 30], [70, 30], [70, 31], [60, 31]])
      expect(Math.max(...r.map((p) => p[0]))).toBe(EXTENSAO.lon1)
      expect(Math.min(...r.map((p) => p[0]))).toBe(60)
    })
  })

  describe('recortarLinha', () => {
    it('devolve os pedaços que ficam dentro, cortados na borda', () => {
      const pedacos = recortarLinha([[60, 30], [64, 30], [64, 31], [61, 31]])
      expect(pedacos.length).toBe(2)
      expect(pedacos[0]!.at(-1)![0]).toBe(EXTENSAO.lon1)
    })
    it('uma linha toda fora some', () => {
      expect(recortarLinha([[100, 0], [101, 1]])).toEqual([])
    })
  })

  describe('simplificar (Douglas–Peucker)', () => {
    it('tira os pontos alinhados e guarda as pontas e os cantos', () => {
      const linha: [number, number][] = [[0, 0], [1, 0.0001], [2, 0], [3, 0], [3, 3]]
      expect(simplificar(linha, 0.01)).toEqual([[0, 0], [3, 0], [3, 3]])
    })
    it('com a tolerância zero nada sai', () => {
      const linha: [number, number][] = [[0, 0], [1, 1], [2, 0]]
      expect(simplificar(linha, 0)).toEqual(linha)
    })
    it('um anel simplificado continua com pelo menos 3 pontos quando tinha detalhe', () => {
      const anel: [number, number][] = [[0, 0], [2, 0], [2, 2], [0, 2]]
      expect(simplificarAnel(anel, 0.01).length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('codificar', () => {
    it('o primeiro ponto é absoluto, os outros são deslocamentos, na unidade do JSON', () => {
      const r = codificar([[EXTENSAO.lon0 + 1, EXTENSAO.lat1 - 1], [EXTENSAO.lon0 + 2, EXTENSAO.lat1 - 1]], 2)
      expect(r).toEqual([UNIDADE, UNIDADE, UNIDADE, 0])
    })
    it('pontos repetidos depois de quantizar são tirados; poucos pontos dão nada', () => {
      expect(codificar([[30, 30], [30.0001, 30.0001], [31, 31]], 2)).toHaveLength(4)
      expect(codificar([[30, 30], [30.0001, 30.0001]], 2)).toEqual([])
    })
  })
})
