/**
 * Os «Desfazer» dos pares de sítios com as operações de verdade (IndexedDB de teste): revisão 2 da Tarefa 15. A base são os
 * cenários do revisor (S1, S3, S4, S5, S7). Cada teste usa os seus próprios ids TESTE (o estado é o mesmo no arquivo).
 *
 * N1 + N2: «São lugares diferentes» grava `diferentesDe` SÓ nos ids do par (no de menor id); a resolução o lê pelos ids do par
 * e pelos destinos, então a cópia única segura o par respondido sob qualquer mescla depois. N5 (revisão 3): «Desfazer» tira só
 * essa cópia, nunca uma num destino (a resposta a outro par, que pode já ter saído do pacote).
 */
import { estadoAtual } from '../usuario/estado'
import { relacoesDe, resolverSitios, type PacoteDeSitios, type ParSugerido } from '../sitios/resolucao'
import { desfazerMescla, marcarComoDiferentes, marcarComoParte, mesclarSitios } from '../sitios/operacoes'
import { desfazerDiferentesDoPar, desfazerPar, paresDaRevisao } from './pares'

const pk = (sitios: string[], pares: ParSugerido[]): PacoteDeSitios => ({ sitios: new Set(sitios), publicados: new Map(), criados: new Set(), mesclas: new Map(), partes: new Map(), grafias: [], pares })
const pend = (p: PacoteDeSitios) => resolverSitios(estadoAtual(), p).paresPendentes.map((x) => `${x.a}~${x.b}`)
const como = (p: PacoteDeSitios) => paresDaRevisao(resolverSitios(estadoAtual(), p), p).resolvidos.map((x) => `${x.par.a}~${x.par.b}:${x.como}`)
const ctx = (p: PacoteDeSitios) => ({ estado: estadoAtual(), pacote: p, resolucao: resolverSitios(estadoAtual(), p), redirecionados: null, criadoEm: () => '' })
const dif = (id: string) => estadoAtual().registro('sitio', id)?.campos.diferentesDe ?? null
const campo = (id: string, c: string) => estadoAtual().registro('sitio', id)?.campos[c]
/** O que a Revisão grava em «São lugares diferentes»: só nos ids do par. */
const diferentes = (par: ParSugerido, p: PacoteDeSitios) => {
  const r = resolverSitios(estadoAtual(), p)
  return marcarComoDiferentes(r.canonico(par.a), r.canonico(par.b), estadoAtual())
}

describe('«São lugares diferentes»: uma cópia só, nos ids do par (revisão 2, N1 + N2)', () => {
  it('S1: com um lado mesclado, a cópia fica nos ids do par; desfazer a mescla, ou mesclar em outro, não reabre; U a tira', async () => {
    const par: ParSugerido = { a: 'TESTE-1', b: 'TESTE-7', motivo: 'nome' }
    const p = pk(['TESTE-1', 'TESTE-2', 'TESTE-7', 'TESTE-9'], [par])
    await mesclarSitios('TESTE-2', 'TESTE-7')
    expect(pend(p)).toEqual(['TESTE-1~TESTE-7'])
    await diferentes(par, p)
    expect(dif('TESTE-1')).toEqual(['TESTE-7'])
    expect(dif('TESTE-2')).toBeNull()
    expect(pend(p)).toEqual([])
    await desfazerMescla('TESTE-7', [])
    expect(como(p)).toEqual(['TESTE-1~TESTE-7:diferentes'])
    await mesclarSitios('TESTE-9', 'TESTE-7')
    expect(pend(p)).toEqual([])
    await desfazerMescla('TESTE-7', [])
    await mesclarSitios('TESTE-2', 'TESTE-7')
    await mesclarSitios('TESTE-9', 'TESTE-2')
    expect(pend(p)).toEqual([])
    expect(relacoesDe(resolverSitios(estadoAtual(), p)).diferentes).toEqual([['TESTE-1', 'TESTE-7']])
    // U / o aviso
    await desfazerDiferentesDoPar(par, p)
    expect(dif('TESTE-1')).toBeNull()
    expect(pend(p)).toEqual(['TESTE-1~TESTE-7'])
  })

  it('S3: 27 mesclado em 22, par respondido, mescla desfeita, «Desfazer» da linha: nenhuma cópia fica; mesclar 27 em 22 de novo NÃO o mostra resolvido', async () => {
    const par: ParSugerido = { a: 'TESTE-21', b: 'TESTE-27', motivo: 'nome' }
    const p = pk(['TESTE-21', 'TESTE-22', 'TESTE-27'], [par])
    await mesclarSitios('TESTE-22', 'TESTE-27')
    await diferentes(par, p)
    await desfazerMescla('TESTE-27', [])
    expect(como(p)).toEqual(['TESTE-21~TESTE-27:diferentes'])
    await desfazerPar(par, 'diferentes', ctx(p))
    expect(pend(p)).toEqual(['TESTE-21~TESTE-27'])
    expect(dif('TESTE-21')).toBeNull()
    expect(dif('TESTE-22')).toBeNull()
    expect(dif('TESTE-27')).toBeNull()
    expect(relacoesDe(resolverSitios(estadoAtual(), p)).diferentes).toEqual([])
    await mesclarSitios('TESTE-22', 'TESTE-27')
    expect(pend(p)).toEqual(['TESTE-21~TESTE-27'])
    expect(como(p)).toEqual([])
  })

  it('S4 (N2): desfazer 31~37 (37 mesclado em 32 depois) deixa 31≠32 como está', async () => {
    const p1: ParSugerido = { a: 'TESTE-31', b: 'TESTE-32', motivo: 'coordenada' }
    const p2: ParSugerido = { a: 'TESTE-31', b: 'TESTE-37', motivo: 'nome' }
    const p = pk(['TESTE-31', 'TESTE-32', 'TESTE-37'], [p1, p2])
    await diferentes(p1, p)
    await diferentes(p2, p)
    expect(dif('TESTE-31')).toEqual(['TESTE-32', 'TESTE-37'])
    await mesclarSitios('TESTE-32', 'TESTE-37')
    await desfazerPar(p2, 'diferentes', ctx(p))
    expect(dif('TESTE-31')).toEqual(['TESTE-32'])
    expect(pend(p)).toEqual([])
    expect(como(p)).toEqual(['TESTE-31~TESTE-32:diferentes', 'TESTE-31~TESTE-37:diferentes'])
    // e o U também
    await diferentes(p2, p)
    await desfazerDiferentesDoPar(p2, p)
    expect(dif('TESTE-31')).toEqual(['TESTE-32'])
  })

  it('revisão 3, N5: «Desfazer» tira só a cópia dos ids do par; a cópia num destino (a resposta a outro par) fica, esteja o par no pacote ou não', async () => {
    const par: ParSugerido = { a: 'TESTE-61', b: 'TESTE-67', motivo: 'nome' }
    const outro: ParSugerido = { a: 'TESTE-62', b: 'TESTE-67', motivo: 'coordenada' }
    const p = pk(['TESTE-61', 'TESTE-62', 'TESTE-67'], [par, outro])
    // 61 mesclado em 62; no destino de 61 (62), uma cópia que nomeia 67: a resposta ao par 62~67
    await mesclarSitios('TESTE-62', 'TESTE-61')
    await diferentes(par, p)
    await marcarComoDiferentes('TESTE-62', 'TESTE-67', estadoAtual())
    await desfazerPar(par, 'diferentes', ctx(p))
    expect(dif('TESTE-61')).toBeNull()
    expect(dif('TESTE-62')).toEqual(['TESTE-67'])
    // sem o outro par no pacote (já respondido, ele sai do pacote), a cópia no destino continua sendo dele: fica
    const so = pk(['TESTE-61', 'TESTE-62', 'TESTE-67'], [par])
    await diferentes(par, so)
    await desfazerPar(par, 'diferentes', ctx(so))
    expect(dif('TESTE-61')).toBeNull()
    expect(dif('TESTE-62')).toEqual(['TESTE-67'])
    // e pelo U / aviso
    await diferentes(par, so)
    await desfazerDiferentesDoPar(par, so)
    expect(dif('TESTE-61')).toBeNull()
    expect(dif('TESTE-62')).toEqual(['TESTE-67'])
  })

  it('revisão 3, N5: 52≠58 respondido; o pacote seguinte sugere 53~58; 53 mesclado em 52; «Desfazer» de 53~58 não apaga 52≠58', async () => {
    // a resposta 52≠58, num pacote em que 52~58 ainda é sugerido
    const antes = pk(['TESTE-52', 'TESTE-53', 'TESTE-58'], [{ a: 'TESTE-52', b: 'TESTE-58', motivo: 'nome' }])
    await diferentes(antes.pares[0]!, antes)
    expect(dif('TESTE-52')).toEqual(['TESTE-58'])
    // o pacote seguinte: 52~58 já respondido (sai), e sugere 53~58
    const par: ParSugerido = { a: 'TESTE-53', b: 'TESTE-58', motivo: 'nome' }
    const p = pk(['TESTE-52', 'TESTE-53', 'TESTE-58'], [par])
    await diferentes(par, p)
    expect(dif('TESTE-53')).toEqual(['TESTE-58'])
    await mesclarSitios('TESTE-52', 'TESTE-53')
    expect(como(p)).toEqual(['TESTE-53~TESTE-58:diferentes'])
    await desfazerPar(par, 'diferentes', ctx(p))
    expect(dif('TESTE-53')).toBeNull()
    expect(dif('TESTE-52')).toEqual(['TESTE-58'])
    // 53 está em 52, e 52≠58 continua respondido: o par 53~58 fica resolvido pelos destinos (nada se perdeu)
    expect(relacoesDe(resolverSitios(estadoAtual(), p)).diferentes).toEqual([['TESTE-52', 'TESTE-58']])
    // pelo U também
    await diferentes(par, p)
    await desfazerDiferentesDoPar(par, p)
    expect(dif('TESTE-53')).toBeNull()
    expect(dif('TESTE-52')).toEqual(['TESTE-58'])
  })
})

describe('«Desfazer» de «parte» e de «mesclados» pelo caminho que juntou o par (revisão 2, N3 e N4)', () => {
  it('S5 (N3): 48 parte de 42 (antes); 42 mesclado em 41 (o que juntou): o «Desfazer» da linha desfaz a mescla e guarda 48 ∈ 42', async () => {
    const par: ParSugerido = { a: 'TESTE-41', b: 'TESTE-48', motivo: 'coordenada' }
    const p = pk(['TESTE-41', 'TESTE-42', 'TESTE-48'], [par])
    await marcarComoParte('TESTE-48', 'TESTE-42')
    await mesclarSitios('TESTE-41', 'TESTE-42')
    expect(como(p)).toEqual(['TESTE-41~TESTE-48:parte'])
    await desfazerPar(par, 'parte', ctx(p))
    expect(campo('TESTE-48', 'parteDe')).toBe('TESTE-42')
    expect(campo('TESTE-42', 'mescladoEm')).toBeNull()
    expect(pend(p)).toEqual(['TESTE-41~TESTE-48'])
  })

  it('S7 (N4): num conflito de círculo, desfaz a mescla que vale (203 → 202), não a descartada (que não é sobrescrita)', async () => {
    const par: ParSugerido = { a: 'TESTE-201', b: 'TESTE-207', motivo: 'nome' }
    const p = pk(['TESTE-201', 'TESTE-202', 'TESTE-203', 'TESTE-207'], [par])
    await mesclarSitios('TESTE-202', 'TESTE-201')
    await mesclarSitios('TESTE-203', 'TESTE-207')
    await mesclarSitios('TESTE-203', 'TESTE-202')
    await mesclarSitios('TESTE-202', 'TESTE-203')
    expect(como(p)).toEqual(['TESTE-201~TESTE-207:mesclados'])
    await desfazerPar(par, 'mesclados', ctx(p))
    expect(campo('TESTE-203', 'mescladoEm')).toBeNull()
    expect(campo('TESTE-201', 'mescladoEm')).toBe('TESTE-202')
    // a escrita que perdeu o conflito (202 → 203) fica como estava; sem o círculo, ela volta a valer: 201 → 202 → 203 ← 207,
    // e o par continua «mesclados» (um segundo «Desfazer» a desfaz). Ver o relatório, «Fix round 2».
    expect(campo('TESTE-202', 'mescladoEm')).toBe('TESTE-203')
    expect(como(p)).toEqual(['TESTE-201~TESTE-207:mesclados'])
    await desfazerPar(par, 'mesclados', ctx(p))
    expect(campo('TESTE-202', 'mescladoEm')).toBeNull()
    expect(pend(p)).toEqual(['TESTE-201~TESTE-207'])
  })
})
