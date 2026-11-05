import { B, ev } from '../../tests/suporte/eventosDeTeste'
import { guardarEventosRemotos, todosEventos } from '../usuario/armazem'
import { estadoAtual } from '../usuario/estado'
import { campoDaOrdem, campoDaPresenca, lerBandeja, REG_DA_BANDEJA } from './modelo'
import { acrescentarABandeja, acrescentarVariasABandeja, desfazerEsvaziar, desfazerSubstituicao, devolverABandeja, esvaziarBandeja, substituirBandeja, tirarDaBandeja } from './operacoes'

const bandeja = () => lerBandeja(estadoAtual().registro('comparar', REG_DA_BANDEJA))
const eventos = async () => (await todosEventos()).filter((e) => e.tipo === 'comparar')

beforeEach(async () => {
  await esvaziarBandeja()
})

describe('as escritas da bandeja (IndexedDB primeiro; nada de rede)', () => {
  it('o primeiro objeto cria o registro "bandeja"; os seguintes alteram', async () => {
    const antes = (await eventos()).length
    await acrescentarABandeja('CA00001')
    await acrescentarABandeja('ca00002')
    const novos = (await eventos()).slice(antes)
    expect(novos.map((e) => [e.reg, e.campos])).toEqual([
      [REG_DA_BANDEJA, { 'm:CA00001': true, 'i:CA00001': expect.any(Number) }],
      [REG_DA_BANDEJA, { 'm:CA00002': true, 'i:CA00002': expect.any(Number) }],
    ])
    expect(novos[1]!.op).toBe('alterar')
    expect(bandeja().itens).toEqual(['CA00001', 'CA00002'])
  })

  it('o mesmo objeto de novo não grava nada e diz que já estava', async () => {
    await acrescentarABandeja('CA00001')
    const antes = (await eventos()).length
    expect(await acrescentarABandeja('CA00001')).toMatchObject({ tipo: 'ja-estava', ref: 'CA00001' })
    expect((await eventos()).length).toBe(antes)
  })

  it('o quinto objeto não entra, não grava nada e diz que a bandeja está cheia', async () => {
    for (const n of [1, 2, 3, 4]) await acrescentarABandeja(`CA0000${n}`)
    const antes = (await eventos()).length
    expect(await acrescentarABandeja('CA00005')).toMatchObject({ tipo: 'cheia', ref: 'CA00005' })
    expect((await eventos()).length).toBe(antes)
    expect(bandeja().itens).toEqual(['CA00001', 'CA00002', 'CA00003', 'CA00004'])
  })

  it('um objeto SKC entra pelo id (OB-…)', async () => {
    await acrescentarABandeja('OB-aaaaaaaa-1')
    expect(bandeja().itens).toEqual(['OB-aaaaaaaa-1'])
  })

  it('vários de uma vez (Comparar todos): um só evento com os que cabem', async () => {
    await acrescentarABandeja('CA00001')
    const antes = (await eventos()).length
    const r = await acrescentarVariasABandeja(['CA00001', 'CA00002', 'CA00003', 'CA00004', 'CA00005'])
    expect(r.entraram).toEqual(['CA00002', 'CA00003', 'CA00004'])
    expect(r.jaEstavam).toEqual(['CA00001'])
    expect(r.deFora).toEqual(['CA00005'])
    expect((await eventos()).length).toBe(antes + 1)
    expect(bandeja().itens).toEqual(['CA00001', 'CA00002', 'CA00003', 'CA00004'])
  })

  it('tirar escreve só a presença (null) e devolve a ordem de antes; devolver põe de volta no mesmo lugar', async () => {
    for (const n of [1, 2, 3]) await acrescentarABandeja(`CA0000${n}`)
    const ordem = await tirarDaBandeja('CA00002')
    expect(ordem).not.toBeNull()
    expect(bandeja().itens).toEqual(['CA00001', 'CA00003'])
    const depois = (await eventos()).filter((e) => Object.keys(e.campos).length === 1 && e.campos['m:CA00002'] === null)
    expect(depois.length).toBeGreaterThan(0)
    await devolverABandeja('CA00002', ordem!)
    expect(bandeja().itens).toEqual(['CA00001', 'CA00002', 'CA00003'])
  })

  it('tirar quem não está não grava nada', async () => {
    const antes = (await eventos()).length
    expect(await tirarDaBandeja('CA00009')).toBeNull()
    expect((await eventos()).length).toBe(antes)
  })

  it('esvaziar tira todos num só evento e devolve o que havia, na ordem; desfazer põe tudo de volta', async () => {
    for (const n of [1, 2, 3]) await acrescentarABandeja(`CA0000${n}`)
    const antes = (await eventos()).length
    const havia = await esvaziarBandeja()
    expect(havia.map((m) => m.ref)).toEqual(['CA00001', 'CA00002', 'CA00003'])
    expect(bandeja().todos).toEqual([])
    expect((await eventos()).length).toBe(antes + 1)
    await desfazerEsvaziar(havia)
    expect(bandeja().itens).toEqual(['CA00001', 'CA00002', 'CA00003'])
  })

  it('esvaziar uma bandeja vazia não grava nada', async () => {
    const antes = (await eventos()).length
    expect(await esvaziarBandeja()).toEqual([])
    expect((await eventos()).length).toBe(antes)
  })
})

describe('substituir a bandeja (decisão 44)', () => {
  it('troca tudo num só evento: sem estado intermediário, e devolve o que havia para o Desfazer', async () => {
    for (const n of [1, 2, 3, 4]) await acrescentarABandeja(`CA0000${n}`)
    const antes = (await eventos()).length
    const r = await substituirBandeja(['BA00001', 'BA00002'])
    expect((await eventos()).length).toBe(antes + 1)
    expect(r.previa.map((m) => m.ref)).toEqual(['CA00001', 'CA00002', 'CA00003', 'CA00004'])
    expect(r.entraram).toEqual(['BA00001', 'BA00002'])
    expect(bandeja().itens).toEqual(['BA00001', 'BA00002'])
    expect(bandeja().excedentes).toEqual([])
  })

  it('mais de 4: entram os 4 primeiros e `deFora` diz os outros; nenhum dos de fora é gravado', async () => {
    const r = await substituirBandeja(['CA00001', 'CA00002', 'CA00003', 'CA00004', 'BA00001', 'BA00002'])
    expect(r.deFora).toEqual(['BA00001', 'BA00002'])
    expect(bandeja().itens).toEqual(['CA00001', 'CA00002', 'CA00003', 'CA00004'])
    expect(bandeja().todos).toHaveLength(4)
  })

  it('Desfazer: a bandeja de antes, com os mesmos objetos na mesma ordem, num só evento', async () => {
    for (const ref of ['CA00003', 'CA00001', 'OB-aaaaaaaa-1']) await acrescentarABandeja(ref)
    const antes = bandeja().todos
    const r = await substituirBandeja(['CA00001', 'BA00001'])
    expect(bandeja().itens).toEqual(['CA00001', 'BA00001'])
    const n = (await eventos()).length
    expect(await desfazerSubstituicao(r.previa, r.entraram, r.hlc!)).toBe(true)
    expect((await eventos()).length).toBe(n + 1)
    expect(bandeja().todos).toEqual(antes)
    expect(bandeja().itens).toEqual(['CA00003', 'CA00001', 'OB-aaaaaaaa-1'])
  })

  it('Desfazer com a bandeja mudada depois da troca: não grava nada e devolve false (nunca tira o que veio depois)', async () => {
    await acrescentarVariasABandeja(['CA00003'])
    const r = await substituirBandeja(['CA00001', 'BA00001'])
    await acrescentarABandeja('CA00002') // trabalho depois da troca
    const n = (await eventos()).length
    const antes = bandeja().todos
    expect(await desfazerSubstituicao(r.previa, r.entraram, r.hlc!)).toBe(false)
    expect((await eventos()).length).toBe(n)
    expect(bandeja().todos).toEqual(antes)
  })

  it('Desfazer com a mesma lista em outra ordem também recusa', async () => {
    const r = await substituirBandeja(['CA00001', 'BA00001'])
    await tirarDaBandeja('CA00001')
    await acrescentarABandeja('CA00001') // volta, mas no fim
    expect(bandeja().itens).toEqual(['BA00001', 'CA00001'])
    expect(await desfazerSubstituicao(r.previa, r.entraram, r.hlc!)).toBe(false)
  })

  it('T17-C-1: tirar e pôr de volta no mesmo lugar (a bandeja volta ao mesmo conteúdo) também invalida o Desfazer: só vale o evento da troca como último', async () => {
    const r = await substituirBandeja(['CA00001', 'BA00001'])
    expect(r.hlc).toEqual(expect.any(String))
    // por outro caminho a bandeja volta a ter exatamente os mesmos objetos na mesma ordem
    const ordem = await tirarDaBandeja('BA00001')
    await devolverABandeja('BA00001', ordem!)
    expect(bandeja().itens).toEqual(['CA00001', 'BA00001'])
    const n = (await eventos()).length
    expect(await desfazerSubstituicao(r.previa, r.entraram, r.hlc!)).toBe(false)
    expect((await eventos()).length).toBe(n)
    expect(bandeja().itens).toEqual(['CA00001', 'BA00001'])
  })

  it('T17-C-6: uma escrita de outra aba que já está no IndexedDB, mas ainda não chegou a esta memória, também recusa o Desfazer (confere o registro guardado antes de gravar)', async () => {
    const r = await substituirBandeja(['CA00001', 'BA00001'])
    // Outra aba gravou (o evento já está no disco); o aviso por BroadcastChannel ainda não chegou: a memória daqui não o conhece.
    await guardarEventosRemotos([ev({ ap: B, seq: 1, ms: Date.now() + 60_000, tipo: 'comparar', reg: 'bandeja', op: 'alterar', campos: { [campoDaPresenca('CA00002')]: true, [campoDaOrdem('CA00002')]: 99_000 } })])
    expect(bandeja().itens).toEqual(['CA00001', 'BA00001']) // a memória ainda não sabe
    const n = (await eventos()).length
    expect(await desfazerSubstituicao(r.previa, r.entraram, r.hlc!)).toBe(false)
    expect((await eventos()).length).toBe(n) // nada gravado
    expect(bandeja().itens).toContain('CA00002') // e a memória agora sabe
  })

  it('o hlc da troca é o do evento gravado; sem nada gravado (`igual`, sem objetos) é null', async () => {
    const r = await substituirBandeja(['CA00001', 'CA00002'])
    expect(r.hlc).toBe(estadoAtual().registro('comparar', 'bandeja')!.alteradoEm)
    expect((await substituirBandeja(['CA00001', 'CA00002'])).hlc).toBeNull() // igual
    expect((await substituirBandeja([])).hlc).toBeNull()
  })

  it('a mesma lista na mesma ordem não grava nada (`igual`)', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002'])
    const antes = (await eventos()).length
    const r = await substituirBandeja(['CA00001', 'CA00002'])
    expect(r.igual).toBe(true)
    expect((await eventos()).length).toBe(antes)
  })

  it('sem nenhum objeto para pôr não esvazia a bandeja', async () => {
    await acrescentarVariasABandeja(['CA00001'])
    const antes = (await eventos()).length
    const r = await substituirBandeja([])
    expect(r.entraram).toEqual([])
    expect((await eventos()).length).toBe(antes)
    expect(bandeja().itens).toEqual(['CA00001'])
  })

  it('depois de esvaziar, o que entra fica depois do que saiu: o Desfazer de esvaziar não empata com o novo (m1)', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002'])
    const havia = await esvaziarBandeja()
    await acrescentarABandeja('CA00009')
    await desfazerEsvaziar(havia)
    expect(bandeja().itens).toEqual(['CA00001', 'CA00002', 'CA00009'])
  })
})
