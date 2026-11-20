// @vitest-environment node
/**
 * Etapa 4, Tarefa 27 (a conferência com o pacote de verdade): as consultas das Coleções e dos Sítios não podem varrer uma tabela
 * grande uma vez por linha. Com o IPIAO II–IV na segunda passada, `hypothesis` e `assertion` cresceram, e a contagem das
 * hipóteses de cada grupo e a dos objetos de cada sítio, feitas numa subconsulta correlacionada que varria a tabela inteira,
 * passaram de 1 s (7 s e 2 s no navegador). O pacote não tem estatísticas (`sqlite_stat1`), então o plano do SQLite depende só
 * do esquema e dos índices, os mesmos no pacote sintético: o plano daqui é o do aparelho.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import type { Banco } from './nucleo'
import { usarMotor, type Linha, type Parametros } from './cliente'
import { grupo, grupos, sitio, sitios } from './consultas'

interface Pedido {
  sql: string
  parametros?: Parametros
}

let banco: Banco
const pedidos: Pedido[] = []

/**
 * Os passos do plano que varrem uma tabela inteira dentro de uma subconsulta correlacionada (refeita a cada linha): o SCAN, e a
 * busca num índice só pela coluna do tipo (`assertion_subject (subject_type=?)`, `hypothesis_target (target_type=?)`), que
 * percorre todas as linhas daquele tipo.
 */
async function varredurasPorLinha({ sql, parametros }: Pedido): Promise<string[]> {
  const plano = (await banco.executar(`EXPLAIN QUERY PLAN ${sql}`, parametros)) as Linha[]
  const porId = new Map(plano.map((l) => [Number(l.id), l]))
  const correlacionada = (l: Linha): boolean => {
    for (let p = porId.get(Number(l.parent)); p; p = porId.get(Number(p.parent))) if (/^CORRELATED /.test(String(p.detail))) return true
    return false
  }
  return plano
    .filter((l) => (/^SCAN /.test(String(l.detail)) || /\((?:subject|target)_type=\?\)$/.test(String(l.detail))) && correlacionada(l))
    .map((l) => String(l.detail))
}

async function pedidosDe(acao: () => Promise<unknown>): Promise<Pedido[]> {
  pedidos.length = 0
  await acao()
  return [...pedidos]
}

describe('as consultas das Coleções e dos Sítios não varrem uma tabela por linha', () => {
  beforeAll(async () => {
    banco = await bancoDeTeste()
    usarMotor({
      abrir: () => banco.abrir(),
      reabrir: () => banco.reabrir(),
      executar: (sql, parametros) => {
        pedidos.push({ sql, parametros })
        return banco.executar(sql, parametros)
      },
    })
  })
  afterAll(() => usarMotor(null))

  it('grupos() e grupo(): a contagem das hipóteses de cada grupo', async () => {
    const lidos = [...(await pedidosDe(() => grupos())), ...(await pedidosDe(() => grupo('GR-TESTE-I-01')))]
    expect(lidos.length).toBeGreaterThan(0)
    for (const p of lidos) expect(await varredurasPorLinha(p), p.sql).toEqual([])
  })

  it('sitios() e sitio(): a contagem dos objetos de cada sítio', async () => {
    const lista = await sitios()
    const lidos = [...(await pedidosDe(() => sitios())), ...(await pedidosDe(() => sitio(lista[0]!.id)))]
    expect(lidos.length).toBeGreaterThan(0)
    for (const p of lidos) expect(await varredurasPorLinha(p), p.sql).toEqual([])
  })
})
