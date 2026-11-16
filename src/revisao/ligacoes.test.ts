/**
 * As ligações de citações (Tarefa 7): `obraLigada` (a regra de `obra_da_citacao` do processamento), `ligar` com o IndexedDB
 * de teste, e a fusão de duas ligações da mesma chave em aparelhos diferentes (foco 2). Só ids e citações TESTE.
 */
import { A, B, embaralhar, ev, gerador, T0 } from '../../tests/suporte/eventosDeTeste'
import { estadoAtual, registrar, registrarVarios } from '../usuario/estado'
import type { Json } from '../usuario/eventos'
import { estadoCanonico, fundir } from '../usuario/fusao'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { item } from '../banco/consultas'
import type { ReferenciaBibliografica } from '../banco/tipos'
import { alvoDaCitacao, eIdDeLigacao, excluirLigacao, idDaOcorrencia, ligacaoDe, ligar, obraDaCitacao, obraLigada, obraPublicadaSai, resolvidaPeloProcessamento, type CitacaoDoLivro } from './ligacoes'

const inventado5: CitacaoDoLivro = { sigla: 'TESTE', alvo: 'TESTE-0004', raw: 'Inventado 2001: 5', curta: 'Inventado 2001', resolvida: false }
const inventado9: CitacaoDoLivro = { sigla: 'TESTE', alvo: 'TESTE-0005', raw: 'Inventado 2001: 9', curta: 'Inventado 2001', resolvida: false }
const semAutor: CitacaoDoLivro = { sigla: 'TESTE', alvo: 'TESTE-0006', raw: '1999: 12', curta: null, resolvida: false }
/** Uma citação que o processamento resolveu, com a mesma chave das não resolvidas (a chave não a toca). */
const resolvida: CitacaoDoLivro = { sigla: 'TESTE', alvo: 'PA-TESTE-0005-cat-1', raw: 'Inventado 2001', curta: 'Inventado 2001', resolvida: true }

describe('os ids da ligação', () => {
  it('a chave e a ocorrência (trecho, senão item; «-» sem autor)', () => {
    expect(idDaOcorrencia(inventado5)).toBe('inventado 2001@TESTE|TESTE-0004|Inventado 2001: 5')
    expect(idDaOcorrencia(semAutor)).toBe('-@TESTE|TESTE-0006|1999: 12')
    expect(alvoDaCitacao({ passagemId: 'PA-TESTE-0005-cat-1', itemId: 'TESTE-0005' })).toBe('PA-TESTE-0005-cat-1')
    expect(alvoDaCitacao({ passagemId: null, itemId: 'TESTE-0005' })).toBe('TESTE-0005')
    expect(eIdDeLigacao('inventado 2001')).toBe(true)
    expect(eIdDeLigacao('Inventado 2001')).toBe(false)
    expect(eIdDeLigacao('inventado 2001: 5')).toBe(false)
    expect(eIdDeLigacao('1999')).toBe(false)
    expect(eIdDeLigacao(idDaOcorrencia(semAutor))).toBe(true)
    // o raw pode ter «|» e «@»
    expect(eIdDeLigacao(idDaOcorrencia({ ...semAutor, raw: 'a|b@c' }))).toBe(true)
  })

  it('resolvida pelo processamento: a resolvida pelo usuário (pacote 10) conta como não resolvida', () => {
    expect(resolvidaPeloProcessamento({ resolvida: true, resolvidaPor: 'auto' })).toBe(true)
    expect(resolvidaPeloProcessamento({ resolvida: true, resolvidaPor: null })).toBe(true)
    expect(resolvidaPeloProcessamento({ resolvida: true, resolvidaPor: 'user' })).toBe(false)
    expect(resolvidaPeloProcessamento({ resolvida: false, resolvidaPor: null })).toBe(false)
  })
})

describe('obraLigada com o estado de verdade', () => {
  it('a chave liga as não resolvidas iguais e nunca a resolvida pelo processamento; a sem autor não tem chave', async () => {
    expect(obraLigada(estadoAtual(), inventado5)).toBeNull()
    const e = await ligar('inventado 2001', 'BIB-900001')
    expect(e).toMatchObject({ tipo: 'citacao', reg: 'inventado 2001', op: 'criar', campos: { obra: 'BIB-900001' } })
    // o registro novo leva um restaurar na mesma gravação
    expect(estadoAtual().marcaDeExclusao('citacao', 'inventado 2001')?.op).toBe('restaurar')
    expect(obraLigada(estadoAtual(), inventado5)).toBe('BIB-900001')
    expect(obraLigada(estadoAtual(), inventado9)).toBe('BIB-900001')
    expect(ligacaoDe(estadoAtual(), inventado9)).toEqual({ obra: 'BIB-900001', por: 'chave', registro: 'inventado 2001' })
    expect(obraLigada(estadoAtual(), resolvida)).toBeNull()
    expect(obraLigada(estadoAtual(), semAutor)).toBeNull()
    // ligar a outra obra: alterar
    expect(await ligar('inventado 2001', 'BIB-900002')).toMatchObject({ op: 'alterar' })
    expect(obraLigada(estadoAtual(), inventado9)).toBe('BIB-900002')
  })

  it('a exceção vence a chave; a exceção nula devolve null; ela religa também a resolvida; excluí-la devolve a ocorrência à chave', async () => {
    await ligar('inventado 2001', 'BIB-900001')
    await ligar(idDaOcorrencia(inventado5), null)
    expect(obraLigada(estadoAtual(), inventado5)).toBeNull()
    expect(ligacaoDe(estadoAtual(), inventado5)).toMatchObject({ obra: null, por: 'ocorrencia' })
    expect(obraLigada(estadoAtual(), inventado9)).toBe('BIB-900001')
    // a exceção de uma citação resolvida pelo processamento a religa
    await ligar(idDaOcorrencia(resolvida), 'BIB-900001')
    expect(obraLigada(estadoAtual(), resolvida)).toBe('BIB-900001')
    // a sem autor só por ocorrência
    await ligar(idDaOcorrencia(semAutor), 'BIB-900002')
    expect(obraLigada(estadoAtual(), semAutor)).toBe('BIB-900002')
    expect(obraLigada(estadoAtual(), { ...semAutor, alvo: 'TESTE-0001' })).toBeNull()
    // excluir a exceção: a ocorrência volta à chave
    expect(await excluirLigacao(idDaOcorrencia(inventado5))).toMatchObject({ op: 'excluir' })
    expect(await excluirLigacao(idDaOcorrencia(inventado5))).toBeNull()
    expect(obraLigada(estadoAtual(), inventado5)).toBe('BIB-900001')
    // ligar de novo restaura
    await ligar(idDaOcorrencia(inventado5), 'BIB-900002')
    expect(estadoAtual().registro('citacao', idDaOcorrencia(inventado5))?.excluido).toBe(false)
    expect(obraLigada(estadoAtual(), inventado5)).toBe('BIB-900002')
    // a chave desligada (obra null) não liga nada; a excluída também não
    await ligar('inventado 2001', null)
    expect(obraLigada(estadoAtual(), inventado9)).toBeNull()
    await ligar('inventado 2001', 'BIB-900001')
    await excluirLigacao('inventado 2001')
    expect(obraLigada(estadoAtual(), inventado9)).toBeNull()
  })

  it('foco 3: uma obra do usuário excluída devolve null (pela chave e pela exceção); «Restaurar» liga de novo', async () => {
    const obra = 'BIB-aaaaaaaa-1'
    await registrar('obra', obra, 'criar', { csl: { type: 'book', title: 'Selos de teste' }, curta: 'Fictício 2009' })
    const chave: CitacaoDoLivro = { sigla: 'TESTE', alvo: 'TESTE-0003', raw: 'Fictício 2009: 1', curta: 'Fictício 2009', resolvida: false }
    const excecao: CitacaoDoLivro = { ...chave, alvo: 'TESTE-0002', raw: 'Fictício 2009: 2', resolvida: true }
    await ligar('ficticio 2009', obra)
    await ligar(idDaOcorrencia(excecao), obra)
    expect(obraLigada(estadoAtual(), chave)).toBe(obra)
    expect(obraLigada(estadoAtual(), excecao)).toBe(obra)
    await registrar('obra', obra, 'excluir')
    expect(obraLigada(estadoAtual(), chave)).toBeNull()
    // a exceção cuja obra foi excluída fica desligada (não cai para a chave)
    expect(ligacaoDe(estadoAtual(), excecao)).toMatchObject({ obra: null, por: 'ocorrencia' })
    await registrar('obra', obra, 'restaurar')
    expect(obraLigada(estadoAtual(), chave)).toBe(obra)
    expect(obraLigada(estadoAtual(), excecao)).toBe(obra)
  })

  it('duas exceções da mesma ocorrência com chaves impressas diferentes: vale a de escrita mais nova', async () => {
    const c: CitacaoDoLivro = { sigla: 'TESTE', alvo: 'TESTE-0002', raw: 'Exemplo 1990: 7', curta: 'Exemplo 1990', resolvida: false }
    await registrarVarios([{ tipo: 'citacao', reg: `exemplo 1990@TESTE|TESTE-0002|Exemplo 1990: 7`, op: 'criar', campos: { obra: 'BIB-900001' } }])
    expect(obraLigada(estadoAtual(), c)).toBe('BIB-900001')
    await registrarVarios([{ tipo: 'citacao', reg: `-@TESTE|TESTE-0002|Exemplo 1990: 7`, op: 'criar', campos: { obra: 'BIB-900002' } }])
    expect(obraLigada(estadoAtual(), c)).toBe('BIB-900002')
    await registrarVarios([{ tipo: 'citacao', reg: `exemplo 1990@TESTE|TESTE-0002|Exemplo 1990: 7`, op: 'alterar', campos: { obra: null } }])
    expect(ligacaoDe(estadoAtual(), c)).toMatchObject({ obra: null, registro: 'exemplo 1990@TESTE|TESTE-0002|Exemplo 1990: 7' })
  })

  it('recusa um id que não é chave nem ocorrência, e uma obra que não é obra', async () => {
    await expect(ligar('Inventado 2001: 5', 'BIB-900001')).rejects.toThrow('não é uma chave')
    await expect(ligar('1997', 'BIB-900001')).rejects.toThrow('não é uma chave')
    await expect(ligar('inventado 2001', 'GL-900001')).rejects.toThrow('não é uma obra')
  })
})

describe('foco 2: duas ligações da mesma chave em aparelhos diferentes', () => {
  const CHAVE = 'amostra 1992a'
  const OCORRENCIA = 'amostra 1992a@TESTE|TESTE-0001|Amostra 1992a: 3'
  const ci = (ap: string, seq: number, ms: number, reg: string, op: 'criar' | 'alterar' | 'restaurar', campos: Record<string, Json> = {}) =>
    ev({ ap, seq, ms, tipo: 'citacao', reg, op, campos })
  // o Mac liga a chave a uma obra; o iPhone, sem ver, a outra, depois; o Mac também desligou uma ocorrência
  const eventos = [
    ci(A, 1, T0, CHAVE, 'criar', { obra: 'BIB-900001' }),
    ci(A, 2, T0 + 1, CHAVE, 'restaurar'),
    ci(A, 3, T0 + 500, OCORRENCIA, 'criar', { obra: null }),
    // a obra do iPhone, criada nele (a ligação a uma obra do usuário só vale com o registro dela)
    ev({ ap: B, seq: 3, ms: T0 + 900, tipo: 'obra', reg: 'BIB-bbbbbbbb-1', op: 'criar', campos: { csl: { type: 'book', title: 'Selos de teste' }, curta: 'Amostra 1992a' } }),
    ci(B, 1, T0 + 1000, CHAVE, 'criar', { obra: 'BIB-bbbbbbbb-1' }),
    ci(B, 2, T0 + 1000, CHAVE, 'restaurar'),
  ]
  const ref: CitacaoDoLivro = { sigla: 'TESTE', alvo: 'TESTE-0002', raw: 'Amostra 1992a: 9', curta: 'Amostra 1992a', resolvida: false }
  const desligada: CitacaoDoLivro = { sigla: 'TESTE', alvo: 'TESTE-0001', raw: 'Amostra 1992a: 3', curta: 'Amostra 1992a', resolvida: false }

  it('em qualquer ordem e com repetições: um só registro da chave, vale o de maior hlc, e a exceção não se perde', () => {
    const referencia = estadoCanonico(fundir(eventos))
    const sorteio = gerador(7)
    for (let i = 0; i < 60; i++) {
      const ordem = embaralhar([...eventos, ...(i % 2 === 0 ? eventos.slice(0, 2) : [])], sorteio)
      const e = fundir(ordem)
      expect(estadoCanonico(e)).toBe(referencia)
      const regs = [...e.registros.get('citacao')!.keys()].sort()
      expect(regs).toEqual([CHAVE, OCORRENCIA])
      expect(e.registro('citacao', CHAVE)?.campos.obra).toBe('BIB-bbbbbbbb-1')
      expect(obraLigada(e, ref)).toBe('BIB-bbbbbbbb-1')
      expect(ligacaoDe(e, desligada)).toEqual({ obra: null, por: 'ocorrencia', registro: OCORRENCIA })
    }
  })

  it('o Mac religa depois (hlc maior): vale o Mac, nas duas ordens', () => {
    const depois = [...eventos, ci(A, 4, T0 + 2000, CHAVE, 'alterar', { obra: 'BIB-900002' })]
    for (const ordem of [depois, [...depois].reverse()]) {
      const e = fundir(ordem)
      expect(obraLigada(e, ref)).toBe('BIB-900002')
      expect(e.historico(CHAVE, 'obra', 'citacao').map((h) => h.valor)).toEqual(['BIB-900001', 'BIB-bbbbbbbb-1'])
    }
  })
})

describe('obra da ligação: a obra do usuário só vale com o registro vivo e um CSL que se formata (N1, como o user-import)', () => {
  it('sem o registro (ainda não chegou), com o CSL quebrado ou excluída: a ligação não liga; com o registro, liga', async () => {
    const c: CitacaoDoLivro = { sigla: 'TESTE', alvo: 'TESTE-0003', raw: 'Modelo 1977: 2', curta: 'Modelo 1977', resolvida: false }
    await ligar('modelo 1977', 'BIB-aaaaaaaa-7')
    expect(ligacaoDe(estadoAtual(), c)).toEqual({ obra: null, por: 'chave', registro: 'modelo 1977' })
    await registrar('obra', 'BIB-aaaaaaaa-7', 'criar', { csl: { type: 'book', title: ' ' } })
    expect(obraLigada(estadoAtual(), c)).toBeNull()
    await registrar('obra', 'BIB-aaaaaaaa-7', 'alterar', { csl: { type: 'book', title: 'Modelos de teste' } })
    expect(obraLigada(estadoAtual(), c)).toBe('BIB-aaaaaaaa-7')
  })
})

describe('Tarefa 14 (fix round 1): a obra publicada cujas origens estão todas excluídas sai (`obras_que_saem`)', () => {
  // BIB-900077 foi criada de duas obras suas; BIB-cccccccc-3 ainda não chegou a este aparelho na segunda conta
  const criadas = new Map([
    ['BIB-cccccccc-1', 'BIB-900077'],
    ['BIB-cccccccc-2', 'BIB-900077'],
  ])
  const c: CitacaoDoLivro = { sigla: 'TESTE', alvo: 'TESTE-0003', raw: 'Sonho 2012: 4', curta: 'Sonho 2012', resolvida: false }

  it('a ligação pelo id do livro deixa de valer só quando todas as origens estão excluídas; restaurar uma a faz valer', async () => {
    for (const o of ['BIB-cccccccc-1', 'BIB-cccccccc-2']) await registrar('obra', o, 'criar', { csl: { type: 'book', title: 'Sonhos de teste' }, curta: 'Sonho 2012' })
    await ligar('sonho 2012', 'BIB-900077')
    expect(obraLigada(estadoAtual(), c, criadas)).toBe('BIB-900077')
    await registrar('obra', 'BIB-cccccccc-1', 'excluir')
    expect(obraPublicadaSai(estadoAtual(), criadas, 'BIB-900077')).toBe(false)
    expect(obraLigada(estadoAtual(), c, criadas)).toBe('BIB-900077')
    await registrar('obra', 'BIB-cccccccc-2', 'excluir')
    expect(obraPublicadaSai(estadoAtual(), criadas, 'BIB-900077')).toBe(true)
    expect(ligacaoDe(estadoAtual(), c, criadas)).toEqual({ obra: null, por: 'chave', registro: 'sonho 2012' })
    // o pacote que a traz resolvida (pelo usuário ou não) também fica sem ela
    expect(obraDaCitacao(estadoAtual(), { ...c, resolvida: true }, { obraId: 'BIB-900077', resolvidaPor: 'auto' }, criadas)).toBeNull()
    // sem os redirecionamentos (sem pacote), como antes
    expect(obraLigada(estadoAtual(), c)).toBe('BIB-900077')
    // uma origem que ainda não chegou continua viva: a obra fica
    expect(obraPublicadaSai(estadoAtual(), new Map([...criadas, ['BIB-cccccccc-3', 'BIB-900077']]), 'BIB-900077')).toBe(false)
    await registrar('obra', 'BIB-cccccccc-2', 'restaurar')
    expect(obraLigada(estadoAtual(), c, criadas)).toBe('BIB-900077')
    await excluirLigacao('sonho 2012')
  })
})

describe('R1: o que o app mostra (obraDaCitacao) quando a camada desfaz uma ligação que o pacote 10 traz do usuário (foco 3)', () => {
  const OBRA = 'BIB-teste123-1'
  let imaginaria: ReferenciaBibliografica
  let autora: ReferenciaBibliografica
  const doLivro = (r: ReferenciaBibliografica): CitacaoDoLivro => ({
    sigla: 'TESTE',
    alvo: alvoDaCitacao(r) ?? '',
    raw: r.bruto,
    curta: r.curta,
    resolvida: resolvidaPeloProcessamento(r),
  })
  const mostra = (r: ReferenciaBibliografica) => obraDaCitacao(estadoAtual(), doLivro(r), { obraId: r.obraId, resolvidaPor: r.resolvidaPor })

  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
    const bib = (await item('BA00002'))!.bibliografia
    imaginaria = bib.find((r) => r.bruto === 'Imaginária 2010: 3')!
    autora = bib.find((r) => r.bruto === 'Autora 2004: 8')!
    usarMotor(null)
  })

  it('o fixture: «Imaginária 2010: 3» resolvida pelo usuário (BIB-900090), «Autora 2004: 8» pelo processamento', () => {
    expect(imaginaria).toMatchObject({ itemId: 'TESTE-0006', passagemId: null, curta: 'Imaginária 2010', obraId: 'BIB-900090', resolvida: true, resolvidaPor: 'user' })
    expect(autora).toMatchObject({ obraId: 'BIB-900002', resolvidaPor: 'auto' })
    // a resolvida pelo usuário conta como não resolvida: a chave vale para ela
    expect(doLivro(imaginaria).resolvida).toBe(false)
  })

  it('a camada não diz nada: vale o pacote', () => {
    expect(ligacaoDe(estadoAtual(), doLivro(imaginaria))).toBeNull()
    expect(mostra(imaginaria)).toBe('BIB-900090')
    expect(mostra(autora)).toBe('BIB-900002')
  })

  it('1. a obra excluída: não resolvida; «Restaurar» a liga de novo', async () => {
    await registrar('obra', OBRA, 'criar', { csl: { type: 'book', title: 'Selos sonhados de teste' }, curta: 'Imaginária 2010' })
    await ligar('imaginaria 2010', OBRA)
    expect(mostra(imaginaria)).toBe(OBRA)
    await registrar('obra', OBRA, 'excluir')
    expect(mostra(imaginaria)).toBeNull()
    await registrar('obra', OBRA, 'restaurar')
    expect(mostra(imaginaria)).toBe(OBRA)
  })

  it('2. a chave desligada: não resolvida; religar dá a obra nova', async () => {
    await ligar('imaginaria 2010', null)
    expect(mostra(imaginaria)).toBeNull()
    await ligar('imaginaria 2010', 'BIB-900001')
    expect(mostra(imaginaria)).toBe('BIB-900001')
  })

  it('3. a ligação excluída (a chave, e a exceção que a substituía): não resolvida', async () => {
    await excluirLigacao('imaginaria 2010')
    expect(mostra(imaginaria)).toBeNull()
    await ligar(idDaOcorrencia(doLivro(imaginaria)), OBRA)
    expect(mostra(imaginaria)).toBe(OBRA)
    await excluirLigacao(idDaOcorrencia(doLivro(imaginaria)))
    expect(ligacaoDe(estadoAtual(), doLivro(imaginaria))).toMatchObject({ obra: null, por: 'chave' })
    expect(mostra(imaginaria)).toBeNull()
  })

  it('a resolução do processamento («Autora 2004: 8», auto) não é desfeita pela camada: só uma exceção que liga a outra obra a muda', async () => {
    await ligar('autora 2004', 'BIB-900001')
    expect(mostra(autora)).toBe('BIB-900002')
    await ligar('autora 2004', null)
    expect(mostra(autora)).toBe('BIB-900002')
    const ocorrencia = idDaOcorrencia(doLivro(autora))
    await ligar(ocorrencia, null)
    expect(mostra(autora)).toBe('BIB-900002')
    await ligar(ocorrencia, 'BIB-900001')
    expect(mostra(autora)).toBe('BIB-900001')
    await excluirLigacao(ocorrencia)
    expect(mostra(autora)).toBe('BIB-900002')
  })

  it('uma exceção excluída sem chave nenhuma também desfaz a ligação do usuário', () => {
    const outra: CitacaoDoLivro = { sigla: 'TESTE', alvo: 'TESTE-0001', raw: '2000: 1', curta: null, resolvida: false }
    const e = fundir([
      ev({ seq: 1, tipo: 'citacao', reg: '-@TESTE|TESTE-0001|2000: 1', op: 'criar', campos: { obra: 'BIB-900001' } }),
      ev({ seq: 2, tipo: 'citacao', reg: '-@TESTE|TESTE-0001|2000: 1', op: 'excluir' }),
    ])
    expect(obraDaCitacao(e, outra, { obraId: 'BIB-900001', resolvidaPor: 'user' })).toBeNull()
    expect(obraDaCitacao(fundir([]), outra, { obraId: 'BIB-900001', resolvidaPor: 'user' })).toBe('BIB-900001')
    // sem alvo (sem trecho e sem item), nenhuma exceção casa
    expect(obraDaCitacao(e, { ...outra, alvo: '' }, { obraId: 'BIB-900001', resolvidaPor: 'user' })).toBe('BIB-900001')
  })
})
