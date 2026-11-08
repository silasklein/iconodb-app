/**
 * Parte 2C, bloco 2: as operações de mescla, parte, «São lugares diferentes» e grafias. Cada uma grava exatamente o evento
 * do formato (src/sitios/modelo.ts): tipo `sitio`, `alterar`, um campo; as de várias escritas numa transação só.
 */
import { estadoAtual } from '../usuario/estado'
import type { Evento } from '../usuario/eventos'
import {
  corrigirGrafias,
  criarSitio,
  desfazerDiferentes,
  desfazerMescla,
  ErroDeSitio,
  marcarComoDiferentes,
  marcarComoParte,
  mesclarSitios,
  soltarParte,
} from './operacoes'

/** Os eventos gravados por `f` (os novos do registro `sitio`, em ordem). */
async function gravados(f: () => Promise<unknown>): Promise<Pick<Evento, 'tipo' | 'reg' | 'op' | 'campos'>[]> {
  const hlcAntes = new Map([...(estadoAtual().registros.get('sitio')?.values() ?? [])].map((r) => [r.id, r.alteradoEm]))
  await f()
  const saida: Pick<Evento, 'tipo' | 'reg' | 'op' | 'campos'>[] = []
  for (const r of estadoAtual().registros.get('sitio')?.values() ?? []) {
    if (hlcAntes.get(r.id) === r.alteradoEm) continue
    for (const campo of Object.keys(r.campos)) {
      if (estadoAtual().hlcDoCampo('sitio', r.id, campo) === r.alteradoEm) saida.push({ tipo: 'sitio', reg: r.id, op: 'alterar', campos: { [campo]: r.campos[campo]! } })
    }
  }
  return saida.sort((a, b) => (a.reg < b.reg ? -1 : a.reg > b.reg ? 1 : 0))
}

describe('mesclar e desfazer', () => {
  it('mesclarSitios grava mescladoEm = o que fica, no que entra', async () => {
    const e = await mesclarSitios('TESTE-1', 'TESTE-2')
    expect(e).toMatchObject({ tipo: 'sitio', reg: 'TESTE-2', op: 'alterar', campos: { mescladoEm: 'TESTE-1' } })
    await expect(mesclarSitios('TESTE-1', 'TESTE-1')).rejects.toBeInstanceOf(ErroDeSitio)
  })

  it('desfazerMescla: mescladoEm null no que entra e em cada registro dado que tem mescladoEm, numa transação', async () => {
    const si = await criarSitio({ nome: 'Publicado como TESTE-91' })
    await mesclarSitios('TESTE-3', si)
    await mesclarSitios('TESTE-3', 'TESTE-91')
    await marcarComoParte('TESTE-92', 'TESTE-3')
    const eventos = await gravados(() => desfazerMescla('TESTE-91', [si, 'TESTE-91', 'TESTE-92']))
    expect(eventos).toEqual([
      { tipo: 'sitio', reg: si, op: 'alterar', campos: { mescladoEm: null } },
      { tipo: 'sitio', reg: 'TESTE-91', op: 'alterar', campos: { mescladoEm: null } },
    ])
  })

  it('desfazerMescla sobre um TESTE-14 que só o pacote mesclou grava {mescladoEm: null} nele', async () => {
    expect(estadoAtual().registro('sitio', 'TESTE-14')).toBeUndefined()
    const eventos = await gravados(() => desfazerMescla('TESTE-14', []))
    expect(eventos).toEqual([{ tipo: 'sitio', reg: 'TESTE-14', op: 'alterar', campos: { mescladoEm: null } }])
  })
})

describe('partes', () => {
  it('marcarComoParte grava parteDe = o todo; soltarParte grava parteDe null', async () => {
    expect(await marcarComoParte('TESTE-21', 'TESTE-20')).toMatchObject({ tipo: 'sitio', reg: 'TESTE-21', op: 'alterar', campos: { parteDe: 'TESTE-20' } })
    expect(await soltarParte('TESTE-21')).toMatchObject({ tipo: 'sitio', reg: 'TESTE-21', op: 'alterar', campos: { parteDe: null } })
    await expect(marcarComoParte('TESTE-21', 'TESTE-21')).rejects.toBeInstanceOf(ErroDeSitio)
  })
})

describe('«São lugares diferentes»', () => {
  it('marcarComoDiferentes: no registro do menor id por ponto de código, a lista de agora + o outro', async () => {
    // "TESTE-10" < "TESTE-9" por ponto de código
    const e1 = await marcarComoDiferentes('TESTE-9', 'TESTE-10', estadoAtual())
    expect(e1).toMatchObject({ tipo: 'sitio', reg: 'TESTE-10', op: 'alterar', campos: { diferentesDe: ['TESTE-9'] } })
    const e2 = await marcarComoDiferentes('TESTE-10', 'TESTE-11', estadoAtual())
    expect(e2.campos).toEqual({ diferentesDe: ['TESTE-9', 'TESTE-11'] })
    // de novo o mesmo par: a lista não repete
    expect((await marcarComoDiferentes('TESTE-11', 'TESTE-10', estadoAtual())).campos).toEqual({ diferentesDe: ['TESTE-9', 'TESTE-11'] })
    await expect(marcarComoDiferentes('TESTE-9', 'TESTE-9', estadoAtual())).rejects.toBeInstanceOf(ErroDeSitio)
  })

  it('desfazerDiferentes tira o outro de todo registro que o tem, numa transação', async () => {
    await marcarComoDiferentes('TESTE-30', 'TESTE-31', estadoAtual())
    await marcarComoDiferentes('TESTE-30', 'TESTE-32', estadoAtual())
    // o mesmo par escrito no outro registro (outro aparelho, ou antes desta regra)
    const { registrar } = await import('../usuario/estado')
    await registrar('sitio', 'TESTE-31', 'alterar', { diferentesDe: ['TESTE-30', 'TESTE-33'] })
    const eventos = await gravados(() => desfazerDiferentes('TESTE-31', 'TESTE-30', estadoAtual()))
    expect(eventos).toEqual([
      { tipo: 'sitio', reg: 'TESTE-30', op: 'alterar', campos: { diferentesDe: ['TESTE-32'] } },
      { tipo: 'sitio', reg: 'TESTE-31', op: 'alterar', campos: { diferentesDe: ['TESTE-33'] } },
    ])
    // a lista que fica vazia grava null
    await marcarComoDiferentes('TESTE-40', 'TESTE-41', estadoAtual())
    expect(await gravados(() => desfazerDiferentes('TESTE-40', 'TESTE-41', estadoAtual()))).toEqual([{ tipo: 'sitio', reg: 'TESTE-40', op: 'alterar', campos: { diferentesDe: null } }])
    // nada a desfazer: nada se grava
    expect(await gravados(() => desfazerDiferentes('TESTE-40', 'TESTE-41', estadoAtual()))).toEqual([])
  })

  it('desfazerDiferentes com o canônico: o par gravado no SI-… antes de ele ser publicado (como TESTE-93) também sai', async () => {
    const si = await criarSitio({ nome: 'Depois TESTE-93' })
    // "SI-…" < "TESTE-50" por ponto de código: o par fica no registro do SI-…
    expect((await marcarComoDiferentes(si, 'TESTE-50', estadoAtual())).reg).toBe(si)
    const canonico = (x: string) => (x === si ? 'TESTE-93' : x)
    expect(await gravados(() => desfazerDiferentes('TESTE-93', 'TESTE-50', estadoAtual()))).toEqual([])
    expect(await gravados(() => desfazerDiferentes('TESTE-93', 'TESTE-50', estadoAtual(), canonico))).toEqual([{ tipo: 'sitio', reg: si, op: 'alterar', campos: { diferentesDe: null } }])
  })
})

describe('grafias', () => {
  it('corrigirGrafias: normaliza (sem vazias, sem repetir texto+livro, sem tradição desconhecida); lista vazia grava null', async () => {
    const e = await corrigirGrafias('TESTE-60', [
      { texto: ' Tell‑Z ', tradicao: 'arabe' },
      { texto: 'Tell-Z' },
      { texto: 'Tell-Z', livro: 'TESTE' },
      { texto: '   ' },
      { texto: 'Tal Z', tradicao: 'klingon' as never },
    ])
    expect(e).toMatchObject({ tipo: 'sitio', reg: 'TESTE-60', op: 'alterar' })
    expect(e.campos).toEqual({ grafias: [{ texto: 'Tell‑Z', tradicao: 'arabe' }, { texto: 'Tell-Z', livro: 'TESTE' }, { texto: 'Tal Z' }] })
    expect((await corrigirGrafias('TESTE-60', [])).campos).toEqual({ grafias: null })
  })

})
