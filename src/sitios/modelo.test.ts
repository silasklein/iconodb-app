/**
 * Tarefa 12: o modelo dos sítios do usuário (lê o que as telas gravam), as operações e a fusão de dois aparelhos.
 */
import { A, B, embaralhar, ev, gerador, HORA, T0 } from '../../tests/suporte/eventosDeTeste'
import { estadoAtual } from '../usuario/estado'
import { estadoCanonico, fundir } from '../usuario/fusao'
import {
  correcoesDosSitios,
  nomeDeAgoraDoSitio,
  sitioDoObjetoDoPacote,
  sitiosComEsteNome,
  sitiosNaoResolvidos,
  sitiosParaComparar,
  sitiosSkc,
  skcComSitioNaoResolvido,
  trocasDeSitio,
} from './doUsuario'
import { camposDoSitioNovo, coordenadaValida, eSitioSkc, lerDadosDoSitio, lerSitioSkc, normalizarVariantes } from './modelo'
import { corrigirCoordenada, corrigirTexto, corrigirVariantes, criarSitio, ErroDeSitio, excluirSitio, restaurarSitio, trocarSitioDoObjeto, voltarAoLivro, pedidoDeFicha } from './operacoes'
import type { SitioResumo } from '../banco/tipos'

const sit = (ap: string, seq: number, reg: string, op: 'criar' | 'alterar' | 'excluir' | 'restaurar', campos: Record<string, unknown> = {}, ms?: number, c?: number) =>
  ev({ ap, seq, ms, c, tipo: 'sitio', reg, op, campos: campos as never })

const livro = (...s: [string, string, string?][]): ReadonlyMap<string, SitioResumo> =>
  new Map(s.map(([id, nome, literal]) => [id, { id, nome, literal: literal ?? nome, glId: null, lat: null, lon: null, regiao: null, objetos: 1 }]))

describe('ids e leitura', () => {
  it('SI-<aparelho de 8>-<n>: o formato do sítio novo; um id do livro não é', () => {
    expect(eSitioSkc('SI-aaaaaaaa-1')).toBe(true)
    expect(eSitioSkc('SI-aaaaaaaa-0')).toBe(false)
    expect(eSitioSkc('SI-aaaaaaa-1')).toBe(false)
    expect(eSitioSkc('SI-aaaaaaaa-1 ')).toBe(false)
    expect(eSitioSkc('TESTE-2')).toBe(false)
    expect(eSitioSkc(null)).toBe(false)
  })

  it('camposDoSitioNovo: só o preenchido; normaliza; recusa nome vazio e coordenada fora da faixa', () => {
    expect(camposDoSitioNovo({ nome: '  Tell   Novo ' })).toEqual({ nome: 'Tell Novo' })
    expect(
      camposDoSitioNovo({ nome: 'Tell Novo', variantes: ['Tall Naw', ' tall  naw ', '', 'Tell Nuovo'], regiao: ' Negev ', coordenada: { lat: 31.77, lon: 35.21 }, nota: ' da grade  ' }),
    ).toEqual({ nome: 'Tell Novo', variantes: ['Tall Naw', 'Tell Nuovo'], regiao: 'Negev', lat: 31.77, lon: 35.21, nota: 'da grade' })
    expect(() => camposDoSitioNovo({ nome: '   ' })).toThrow('sítio sem nome')
    expect(() => camposDoSitioNovo({ nome: 'X', coordenada: { lat: 131, lon: 35 } })).toThrow('fora da faixa')
  })

  it('lerDadosDoSitio: coordenada só vale com os dois números na faixa; vazio e não-texto não valem', () => {
    const est = fundir([
      sit(A, 1, 'SI-aaaaaaaa-1', 'criar', { nome: 'Tell Novo', lat: 31.5, lon: 35.5, variantes: ['a', 'A', 'b'], regiao: '  ', nota: 'n' }),
      sit(A, 2, 'TESTE-2', 'alterar', { lat: 31.5, lon: null, nome: 7 }),
      sit(A, 3, 'TESTE-3', 'alterar', { lat: 95, lon: 10 }),
    ])
    expect(lerDadosDoSitio(est.registro('sitio', 'SI-aaaaaaaa-1')!)).toEqual({ nome: 'Tell Novo', variantes: ['a', 'b'], regiao: null, pais: null, coordenada: { lat: 31.5, lon: 35.5 }, nota: 'n' })
    expect(lerDadosDoSitio(est.registro('sitio', 'TESTE-2')!)).toMatchObject({ nome: null, coordenada: null })
    expect(lerDadosDoSitio(est.registro('sitio', 'TESTE-3')!).coordenada).toBeNull()
    expect(coordenadaValida(0, 0)).toEqual({ lat: 0, lon: 0 })
    expect(coordenadaValida(Infinity, 0)).toBeNull()
    expect(normalizarVariantes(['x', 3, 'X', '  '])).toEqual(['x'])
  })

  it('os sítios novos vivos em ordem de criação; as correções do livro à parte; o excluído sai da lista', () => {
    const est = fundir([
      sit(A, 1, 'SI-aaaaaaaa-1', 'criar', { nome: 'Primeiro' }, T0),
      sit(B, 1, 'SI-bbbbbbbb-1', 'criar', { nome: 'Segundo' }, T0 + 10),
      sit(A, 2, 'SI-aaaaaaaa-2', 'criar', { nome: 'Apagado' }, T0 + 20),
      sit(A, 3, 'SI-aaaaaaaa-2', 'excluir', {}, T0 + 30),
      sit(A, 4, 'TESTE-2', 'alterar', { nome: 'Tell Probe corrigido' }),
    ])
    expect(sitiosSkc(est).map((s) => s.id)).toEqual(['SI-aaaaaaaa-1', 'SI-bbbbbbbb-1'])
    expect(lerSitioSkc(est.registro('sitio', 'SI-aaaaaaaa-2')!)).toMatchObject({ excluido: true, nomeDeAgora: 'Apagado' })
    expect([...correcoesDosSitios(est).keys()]).toEqual(['TESTE-2'])
  })
})

describe('o nome de agora: corrigido, depois o do livro, depois o guardado', () => {
  const est = fundir([sit(A, 1, 'TESTE-2', 'alterar', { nome: 'Tell Probe corrigido' }), sit(A, 2, 'SI-aaaaaaaa-1', 'criar', { nome: 'Tell Novo' }), sit(A, 3, 'TESTE-1', 'alterar', { nome: null })])
  const pacote = livro(['TESTE-1', 'Maḥteṣ Teste'], ['TESTE-2', 'Tell Probe Teste'])

  it('corrigido vence; null volta ao livro; sem o pacote, o guardado; o sítio novo, o dele; excluído conserva o nome', () => {
    expect(nomeDeAgoraDoSitio(est, 'TESTE-2', pacote, 'guardado')).toBe('Tell Probe corrigido')
    expect(nomeDeAgoraDoSitio(est, 'TESTE-1', pacote, 'guardado')).toBe('Maḥteṣ Teste')
    expect(nomeDeAgoraDoSitio(est, 'TESTE-1', null, 'guardado')).toBe('guardado')
    expect(nomeDeAgoraDoSitio(est, 'TESTE-9', pacote, null)).toBeNull()
    expect(nomeDeAgoraDoSitio(est, 'SI-aaaaaaaa-1', pacote, 'x')).toBe('Tell Novo')
    expect(nomeDeAgoraDoSitio(est, 'SI-zzzzzzzz-1', pacote, 'rótulo guardado')).toBe('rótulo guardado')
    const excl = fundir([sit(A, 1, 'SI-aaaaaaaa-1', 'criar', { nome: 'Tell Novo' }), sit(A, 2, 'SI-aaaaaaaa-1', 'excluir')])
    expect(nomeDeAgoraDoSitio(excl, 'SI-aaaaaaaa-1', pacote, null)).toBe('Tell Novo')
  })
})

describe('duplicados: a dobra de sempre, nome e grafias, livro e usuário', () => {
  const est = fundir([sit(A, 1, 'SI-aaaaaaaa-1', 'criar', { nome: 'Tell Novo', variantes: ['Tall Naw'] }), sit(A, 2, 'TESTE-2', 'alterar', { variantes: ['Tell Probe Antigo'] })])
  const todos = sitiosParaComparar(est, livro(['TESTE-1', 'Maḥteṣ Teste', 'Mahtes Teste (impresso)'], ['TESTE-2', 'Tell Probe Teste']))

  it('o nome de um sítio do livro, sem diacríticos nem caixa, é o mesmo; a grafia impressa e as do usuário também', () => {
    expect(sitiosComEsteNome(todos, 'MAHTES TESTE').map((s) => s.id)).toEqual(['TESTE-1'])
    expect(sitiosComEsteNome(todos, 'mahtes teste (impresso)').map((s) => s.id)).toEqual(['TESTE-1'])
    expect(sitiosComEsteNome(todos, 'tell  probe antigo').map((s) => s.id)).toEqual(['TESTE-2'])
    expect(sitiosComEsteNome(todos, 'tall naw')).toEqual([{ id: 'SI-aaaaaaaa-1', nome: 'Tell Novo', doUsuario: true }])
    expect(sitiosComEsteNome(todos, 'Tell Novo', 'SI-aaaaaaaa-1')).toEqual([])
    expect(sitiosComEsteNome(todos, 'Outro')).toEqual([])
    expect(sitiosComEsteNome(todos, '  ')).toEqual([])
  })
})

describe('o sítio de um objeto do pacote e os "não resolvidos"', () => {
  const linhas = [
    { itemId: 'TESTE-0001', numero: 'CA00001' },
    { itemId: 'TESTE-0002', numero: 'CA00002' },
    { itemId: 'TESTE-0003', numero: 'CA00003' },
  ]
  const base = [
    sit(A, 1, 'SI-aaaaaaaa-1', 'criar', { nome: 'Tell Novo' }),
    ev({ ap: A, seq: 2, tipo: 'item-sitio', reg: 'CA00001', op: 'alterar', campos: { sitio: 'TESTE-2', sitioNome: 'Tell Probe Teste' } }),
    ev({ ap: A, seq: 3, tipo: 'item-sitio', reg: 'CA00002', op: 'alterar', campos: { sitio: 'SI-aaaaaaaa-1', sitioNome: 'Tell Novo' } }),
  ]

  it('trocar o sítio resolve a linha da Revisão; o item sem troca continua; contar desconta', () => {
    const est = fundir(base)
    expect([...trocasDeSitio(est).keys()]).toEqual(['CA00001', 'CA00002'])
    const r = sitiosNaoResolvidos(est, linhas)
    expect(r.pacote).toEqual([linhas[2]])
    expect(r.resolvidasPeloUsuario).toBe(2)
    expect(r.total).toBe(1)
  })

  it('o sítio excluído: o objeto ligado volta a contar (e o nome continua); restaurar o resolve de novo', () => {
    const excl = fundir([...base, sit(A, 4, 'SI-aaaaaaaa-1', 'excluir', {}, T0 + 9999)])
    expect(sitioDoObjetoDoPacote(excl, 'CA00002', null)).toEqual({ id: 'SI-aaaaaaaa-1', trocado: true, excluido: true })
    const r = sitiosNaoResolvidos(excl, linhas)
    expect(r.pacote.map((l) => l.numero)).toEqual(['CA00002', 'CA00003'])
    expect(r.excluidos).toBe(1)
    expect(r.total).toBe(2)
    const volta = fundir([...base, sit(A, 4, 'SI-aaaaaaaa-1', 'excluir', {}, T0 + 9999), sit(A, 5, 'SI-aaaaaaaa-1', 'restaurar', {}, T0 + 19999)])
    expect(sitiosNaoResolvidos(volta, linhas).total).toBe(1)
    // "Voltar ao do livro" (sitio null) desfaz a troca
    const sem = fundir([...base, ev({ ap: A, seq: 6, ms: T0 + 99999, tipo: 'item-sitio', reg: 'CA00001', op: 'alterar', campos: { sitio: null, sitioNome: null } })])
    expect(sitioDoObjetoDoPacote(sem, 'CA00001', 'TESTE-1')).toEqual({ id: 'TESTE-1', trocado: false, excluido: false })
    expect(sitiosNaoResolvidos(sem, linhas).total).toBe(2)
  })

  it('objetos SKC: o nome livre conta; ligar a um sítio resolve; o sítio excluído volta a contar; sem sítio, nada', () => {
    const est = fundir([
      ev({ ap: A, seq: 1, tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'criar', campos: { periodo: 'CA', sitio: '', sitioNome: 'Miš' } }),
      ev({ ap: A, seq: 2, tipo: 'objeto', reg: 'OB-aaaaaaaa-2', op: 'criar', campos: { periodo: 'CA', sitio: 'TESTE-1', sitioNome: 'Maḥteṣ Teste' } }),
      ev({ ap: A, seq: 3, tipo: 'objeto', reg: 'OB-aaaaaaaa-3', op: 'criar', campos: { periodo: 'CA', sitio: 'SI-aaaaaaaa-1', sitioNome: 'Tell Novo' } }),
      ev({ ap: A, seq: 4, tipo: 'objeto', reg: 'OB-aaaaaaaa-4', op: 'criar', campos: { periodo: 'CA', sitio: '', sitioNome: '' } }),
      sit(A, 5, 'SI-aaaaaaaa-1', 'criar', { nome: 'Tell Novo' }),
      sit(A, 6, 'SI-aaaaaaaa-1', 'excluir', {}, T0 + 9999),
    ])
    expect(skcComSitioNaoResolvido(est)).toEqual([
      { id: 'OB-aaaaaaaa-1', motivo: 'livre', nome: 'Miš' },
      { id: 'OB-aaaaaaaa-3', motivo: 'excluido', nome: 'Tell Novo' },
    ])
  })
})

describe('T17-B-18: um sítio que ainda não chegou a este aparelho não é «excluído» na Revisão', () => {
  it('um objeto SKC cujo sítio SI-… ainda não está no estado não entra entre os não resolvidos (resolve-se sozinho ao sincronizar)', () => {
    const est = fundir([ev({ ap: A, seq: 1, tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'criar', campos: { periodo: 'CA', sitio: 'SI-bbbbbbbb-1', sitioNome: 'Tell Distante' } })])
    expect(skcComSitioNaoResolvido(est)).toEqual([])
  })
})

describe('Tarefa 12, item 8: o mesmo sítio do livro corrigido em dois aparelhos sem internet converge, em qualquer ordem', () => {
  const permutacoes = <T,>(eventos: readonly T[], vezes = 60): T[][] => {
    const sorteio = gerador(7)
    return Array.from({ length: vezes }, (_, i) => embaralhar([...eventos, ...(i % 3 === 0 ? eventos.slice(0, 2) : [])], sorteio))
  }

  it('o nome num aparelho e a coordenada no outro: os dois ficam, nas 60 ordens', () => {
    const eventos = [sit(A, 1, 'TESTE-2', 'alterar', { nome: 'Tell Probe corrigido' }, T0), sit(B, 1, 'TESTE-2', 'alterar', { lat: 31.5, lon: 35.5 }, T0 + 5)]
    const referencia = estadoCanonico(fundir(eventos))
    for (const ordem of permutacoes(eventos)) {
      const e = fundir(ordem)
      expect(estadoCanonico(e)).toBe(referencia)
      expect(lerDadosDoSitio(e.registro('sitio', 'TESTE-2')!)).toMatchObject({ nome: 'Tell Probe corrigido', coordenada: { lat: 31.5, lon: 35.5 } })
    }
  })

  it('o mesmo campo nos dois: ganha o hlc maior, em todas as ordens, e a perdedora fica no histórico', () => {
    const eventos = [sit(A, 1, 'TESTE-2', 'alterar', { nome: 'Nome de A' }, T0), sit(B, 1, 'TESTE-2', 'alterar', { nome: 'Nome de B' }, T0 + 10), sit(A, 2, 'TESTE-2', 'alterar', { lat: 1, lon: 2 }, T0 + 20), sit(B, 2, 'TESTE-2', 'alterar', { lat: 3, lon: 4 }, T0 + 15)]
    const referencia = estadoCanonico(fundir(eventos))
    for (const ordem of permutacoes(eventos)) {
      const e = fundir(ordem)
      expect(estadoCanonico(e)).toBe(referencia)
      const d = lerDadosDoSitio(e.registro('sitio', 'TESTE-2')!)
      expect(d.nome).toBe('Nome de B')
      // lat e lon vêm do MESMO evento (o par): a coordenada nunca mistura os dois aparelhos
      expect(d.coordenada).toEqual({ lat: 1, lon: 2 })
      expect(e.historico('TESTE-2', 'nome', 'sitio').map((h) => h.valor)).toEqual(['Nome de A'])
      expect(e.historico('TESTE-2', 'lat', 'sitio').map((h) => h.valor)).toEqual([3])
      expect(e.historico('TESTE-2', 'lon', 'sitio').map((h) => h.valor)).toEqual([4])
    }
  })

  it('o voltar ao livro (null) de A e o texto de B: vale o hlc maior; um relógio 1 h adiantado em B não vence uma edição causalmente nova de A', () => {
    // B, com o relógio 1 h adiantado, escreveu em T0+HORA. A viu isso antes de escrever (o hlc de A passa dele).
    const eventos = [sit(B, 1, 'TESTE-2', 'alterar', { nome: 'texto de B' }, T0 + HORA), sit(A, 1, 'TESTE-2', 'alterar', { nome: null }, T0 + HORA, 1)]
    for (const ordem of permutacoes(eventos)) {
      const e = fundir(ordem)
      expect(lerDadosDoSitio(e.registro('sitio', 'TESTE-2')!).nome).toBeNull()
      expect(e.historico('TESTE-2', 'nome', 'sitio').map((h) => h.valor)).toEqual(['texto de B'])
    }
  })

  it('excluir de A e restaurar de B no sítio novo: a marca de maior hlc vale; criar de A e correção de B convergem', () => {
    const eventos = [
      sit(A, 1, 'SI-aaaaaaaa-1', 'criar', { nome: 'Tell Novo' }, T0),
      sit(A, 2, 'SI-aaaaaaaa-1', 'excluir', {}, T0 + 10),
      sit(B, 1, 'SI-aaaaaaaa-1', 'restaurar', {}, T0 + 20),
      sit(B, 2, 'SI-aaaaaaaa-1', 'alterar', { regiao: 'Negev' }, T0 + 5),
    ]
    const referencia = estadoCanonico(fundir(eventos))
    for (const ordem of permutacoes(eventos)) {
      const e = fundir(ordem)
      expect(estadoCanonico(e)).toBe(referencia)
      expect(e.registro('sitio', 'SI-aaaaaaaa-1')!.excluido).toBe(false)
      expect(lerSitioSkc(e.registro('sitio', 'SI-aaaaaaaa-1')!)).toMatchObject({ nomeDeAgora: 'Tell Novo', regiao: 'Negev' })
    }
  })

  it('a troca de sítio do objeto (item-sitio) em dois aparelhos: o hlc maior vale', () => {
    const troca = (ap: string, seq: number, sitio: string | null, ms: number) => ev({ ap, seq, ms, tipo: 'item-sitio', reg: 'CA00001', op: 'alterar', campos: { sitio, sitioNome: null } })
    const eventos = [troca(A, 1, 'TESTE-1', T0), troca(B, 1, 'TESTE-2', T0 + 10)]
    for (const ordem of permutacoes(eventos)) {
      const e = fundir(ordem)
      expect(trocasDeSitio(e).get('CA00001')?.sitio).toBe('TESTE-2')
      expect(e.historico('CA00001', 'sitio', 'item-sitio').map((h) => h.valor)).toEqual(['TESTE-1'])
    }
  })
})

describe('as operações gravam o que o formato diz', () => {
  it('criarSitio: reserva o id SI-<aparelho>-<n>, grava o criar; "junto" vai na mesma transação', async () => {
    const id = await criarSitio({ nome: ' Tell  Novo ', coordenada: { lat: 31.77, lon: 35.21 }, variantes: ['Tall Naw'] })
    expect(id).toMatch(/^SI-[a-z0-9]{8}-[1-9][0-9]*$/)
    expect(lerDadosDoSitio(estadoAtual().registro('sitio', id)!)).toMatchObject({ nome: 'Tell Novo', coordenada: { lat: 31.77, lon: 35.21 }, variantes: ['Tall Naw'] })
    const outro = await criarSitio({ nome: 'Outro' }, { junto: (sid, nome) => [pedidoDeFicha('OB-aaaaaaaa-9', sid, nome)] })
    expect(estadoAtual().registro('objeto', 'OB-aaaaaaaa-9')!.campos).toEqual({ sitio: outro, sitioNome: 'Outro' })
    // mais de um sítio: ids diferentes, nunca reusados
    expect(new Set([id, outro]).size).toBe(2)
    await expect(criarSitio({ nome: '' })).rejects.toThrow('sítio sem nome')
    await expect(criarSitio({ nome: 'x' }, { id: 'TESTE-1' })).rejects.toBeInstanceOf(ErroDeSitio)
  })

  it('corrigir um sítio do livro: um campo por evento; igual ao livro grava null; o par lat+lon num evento; voltar ao livro limpa', async () => {
    const e1 = await corrigirTexto('TESTE-2', 'nome', ' Tell  Probe ', 'Tell Probe Teste')
    expect(e1.campos).toEqual({ nome: 'Tell Probe' })
    expect((await corrigirTexto('TESTE-2', 'nome', 'Tell Probe Teste', 'Tell Probe Teste')).campos).toEqual({ nome: null })
    expect((await corrigirTexto('TESTE-2', 'regiao', '')).campos).toEqual({ regiao: null })
    expect((await corrigirTexto('TESTE-2', 'nota', ' dúvida\ncom linha ')).campos).toEqual({ nota: 'dúvida\ncom linha' })
    expect((await corrigirVariantes('TESTE-2', ['a', 'A', 'b'])).campos).toEqual({ variantes: ['a', 'b'] })
    expect((await corrigirVariantes('TESTE-2', [])).campos).toEqual({ variantes: null })
    expect((await corrigirCoordenada('TESTE-2', { lat: 1.5, lon: 2.5 })).campos).toEqual({ lat: 1.5, lon: 2.5 })
    await expect(corrigirCoordenada('TESTE-2', { lat: 99, lon: 2 })).rejects.toBeInstanceOf(ErroDeSitio)
    expect((await voltarAoLivro('TESTE-2', ['lat', 'lon'])).campos).toEqual({ lat: null, lon: null })
    expect(lerDadosDoSitio(estadoAtual().registro('sitio', 'TESTE-2')!).coordenada).toBeNull()
    await expect(corrigirTexto('SI-aaaaaaaa-1', 'nome', '   ')).rejects.toBeInstanceOf(ErroDeSitio)
  })

  it('excluir e restaurar só valem para o sítio do usuário; o do livro só se corrige', async () => {
    const id = await criarSitio({ nome: 'Para apagar' })
    await excluirSitio(id)
    expect(estadoAtual().registro('sitio', id)!.excluido).toBe(true)
    await restaurarSitio(id)
    expect(estadoAtual().registro('sitio', id)!.excluido).toBe(false)
    await expect(excluirSitio('TESTE-2')).rejects.toBeInstanceOf(ErroDeSitio)
    await expect(restaurarSitio('TESTE-2')).rejects.toBeInstanceOf(ErroDeSitio)
  })

  it('trocarSitioDoObjeto grava o item-sitio; null volta ao do livro', async () => {
    const e = await trocarSitioDoObjeto('CA00005', 'TESTE-1', 'Maḥteṣ Teste')
    expect(e).toMatchObject({ tipo: 'item-sitio', reg: 'CA00005', op: 'alterar', campos: { sitio: 'TESTE-1', sitioNome: 'Maḥteṣ Teste' } })
    expect((await trocarSitioDoObjeto('CA00005', null)).campos).toEqual({ sitio: null, sitioNome: null })
    expect(trocasDeSitio(estadoAtual()).has('CA00005')).toBe(false)
  })
})
