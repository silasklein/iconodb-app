import { ev, T0, A } from '../../tests/suporte/eventosDeTeste'
import { lerTabelaDeFold } from '../busca/fold'
import { fundir } from '../usuario/fusao'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import { agruparPorData, filtrarNotas, ligadaA, OPCOES_LIGADA } from './filtroDeNotas'
import { indiceDeNotas } from './indiceDeNotas'

const tabela = lerTabelaDeFold(JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo/fold.json'), 'utf8')))
const DIA = 24 * 60 * 60 * 1000
let seq = 0
const nota = (reg: string, campos: Record<string, unknown>, ms: number) => ev({ ap: A, seq: ++seq, ms, tipo: 'nota', reg, op: 'criar', campos: campos as never })

const estado = fundir([
  nota('NT-aaaaaaaa-1', { texto: 'O leão de Maḥteṣ, ver [[GL-900001|leão-de-teste]]', alvoTipo: 'objeto', alvo: 'CA00001' }, T0),
  nota('NT-aaaaaaaa-2', { texto: 'Comparar com [[BIB-900001|Autora 2004]] e a hipótese [[HY-aaaaaaaa-3|íbex]]', alvoTipo: 'verbete', alvo: 'GL-900002' }, T0 + 1000),
  nota('NT-aaaaaaaa-3', { texto: 'Nota sobre o sítio', alvoTipo: 'sitio', alvo: 'TESTE-1' }, T0 + DIA + 5000),
  nota('NT-aaaaaaaa-4', { texto: 'Nota da obra', alvoTipo: 'obra', alvo: 'BIB-900002' }, T0 + 2 * DIA),
])
const todas = indiceDeNotas(estado).todas

describe('agruparPorData: Minhas notas por dia, a mais recente primeiro', () => {
  it('junta as notas seguidas do mesmo dia; a ordem de entrada (mais recente primeiro) é mantida', () => {
    const grupos = agruparPorData(todas)
    expect(grupos.map((g) => g.notas.map((n) => n.id))).toEqual([['NT-aaaaaaaa-4'], ['NT-aaaaaaaa-3'], ['NT-aaaaaaaa-2', 'NT-aaaaaaaa-1']])
    expect(grupos.every((g) => /^\d\d\/\d\d\/\d{4}$/.test(g.data))).toBe(true)
    expect(new Set(grupos.map((g) => g.data)).size).toBe(3)
  })
  it('sem notas, sem grupos', () => {
    expect(agruparPorData([])).toEqual([])
  })
})

describe('ligadaA: "Ligada a" é o alvo da nota ou o que ela cita', () => {
  const por = (id: string) => todas.find((n) => n.id === id)!
  it('pelo alvo', () => {
    expect(ligadaA(por('NT-aaaaaaaa-1'), 'objeto')).toBe(true)
    expect(ligadaA(por('NT-aaaaaaaa-3'), 'sitio')).toBe(true)
    expect(ligadaA(por('NT-aaaaaaaa-4'), 'obra')).toBe(true)
  })
  it('pelo que cita no texto', () => {
    expect(ligadaA(por('NT-aaaaaaaa-1'), 'verbete')).toBe(true)
    expect(ligadaA(por('NT-aaaaaaaa-2'), 'obra')).toBe(true)
    expect(ligadaA(por('NT-aaaaaaaa-2'), 'hipotese')).toBe(true)
  })
  it('e não pelo que não tem', () => {
    expect(ligadaA(por('NT-aaaaaaaa-1'), 'obra')).toBe(false)
    expect(ligadaA(por('NT-aaaaaaaa-3'), 'verbete')).toBe(false)
  })
  it('um objeto SKC citado pelo número também conta como objeto', () => {
    const e = fundir([nota('NT-aaaaaaaa-9', { texto: 'ver [[CA00005]]', alvoTipo: 'verbete', alvo: 'GL-900001' }, T0)])
    expect(ligadaA(indiceDeNotas(e).todas[0]!, 'objeto')).toBe(true)
  })
  it('as opções do filtro: qualquer coisa primeiro', () => {
    expect(OPCOES_LIGADA[0]).toEqual({ valor: '', rotulo: 'qualquer coisa' })
    expect(OPCOES_LIGADA.map((o) => o.valor)).toEqual(['', 'objeto', 'verbete', 'hipotese', 'obra', 'sitio', 'grupo', 'colecao'])
  })
})

describe('filtrarNotas', () => {
  const ids = (l: readonly { id: string }[]) => l.map((n) => n.id)
  it('sem filtro: as mesmas notas, sem copiar', () => {
    expect(filtrarNotas(todas, { consulta: '', ligada: '' }, tabela)).toBe(todas)
  })
  it('o texto é dobrado (sem acento, sem maiúscula) e todas as palavras valem', () => {
    expect(ids(filtrarNotas(todas, { consulta: 'LEAO mahtes', ligada: '' }, tabela))).toEqual(['NT-aaaaaaaa-1'])
    expect(ids(filtrarNotas(todas, { consulta: 'leao zebra', ligada: '' }, tabela))).toEqual([])
  })
  it('procura no rótulo dos links, não no código; e no número do objeto', () => {
    expect(ids(filtrarNotas(todas, { consulta: 'leão-de-teste', ligada: '' }, tabela))).toEqual(['NT-aaaaaaaa-1'])
    expect(ids(filtrarNotas(todas, { consulta: 'CA00001', ligada: '' }, tabela))).toEqual(['NT-aaaaaaaa-1'])
    expect(ids(filtrarNotas(todas, { consulta: 'GL-900002', ligada: '' }, tabela))).toEqual(['NT-aaaaaaaa-2'])
  })
  it('"Ligada a" e o texto se combinam', () => {
    expect(ids(filtrarNotas(todas, { consulta: '', ligada: 'obra' }, tabela))).toEqual(['NT-aaaaaaaa-4', 'NT-aaaaaaaa-2'])
    expect(ids(filtrarNotas(todas, { consulta: 'comparar', ligada: 'obra' }, tabela))).toEqual(['NT-aaaaaaaa-2'])
    expect(ids(filtrarNotas(todas, { consulta: 'leao', ligada: 'obra' }, tabela))).toEqual([])
  })
})
