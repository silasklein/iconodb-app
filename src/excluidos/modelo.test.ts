/**
 * 2C, bloco 1, Tarefa 3: o modelo da tela «Excluídos» (spec §4). Dos registros com marca própria de exclusão às linhas, por tipo,
 * com o nome, onde estava, quando, o caminho e o texto da aprovação de «Restaurar». PURO: o estado vem de `fundir`.
 */
import { ev, HORA, T0 } from '../../tests/suporte/eventosDeTeste'
import type { Json, Op, Tipo } from '../usuario/eventos'
import { fundir } from '../usuario/fusao'
import { quando } from '../usuario/textosDaSync'
import { gruposDeExcluidos, quandoDaMarca, textoDoRestaurado, type LinhaExcluida } from './modelo'

let seq = 0
const e = (tipo: Tipo, reg: string, op: Op, campos: Record<string, Json> = {}, ms?: number) => ev({ seq: ++seq, tipo, reg, op, campos, ms })
const AGORA = T0 + 10 * HORA
const ctx = (extra: Partial<Parameters<typeof gruposDeExcluidos>[1]> = {}) => ({ redirecionamentos: null, nomeNoLivro: () => null, agora: AGORA, ...extra })
const linha = (grupos: ReturnType<typeof gruposDeExcluidos>, id: string): LinhaExcluida => {
  const l = grupos.flatMap((g) => g.linhas).find((x) => x.id === id)
  if (!l) throw new Error(`sem a linha ${id}`)
  return l
}

const OB = 'OB-aaaaaaaa-1'
const objeto = (id = OB, campos: Record<string, Json> = {}) => e('objeto', id, 'criar', { origemTipo: 'publicacao', periodo: 'CA', titulo: 'Selo sintético de teste.', ...campos })
const confirmado = (id = OB, numero = 'CA00005') => e('objeto', id, 'alterar', { numero })
const colecao = (id: string, nome: string, refs: string[]) =>
  e('colecao', id, 'criar', { nome, ...Object.fromEntries(refs.flatMap((r, i) => [[`m:${r}`, true], [`i:${r}`, (i + 1) * 1024]])) })

beforeEach(() => {
  seq = 0
})

describe('gruposDeExcluidos: os grupos', () => {
  it('um grupo por tipo, na ordem Objetos SKC, Notas, Coleções, Hipóteses, Regiões, Fotos, Sítios, Verbetes; os outros tipos não entram', () => {
    const estado = fundir([
      e('verbete', 'GL-aaaaaaaa-1', 'criar', { forma: 'amuleto de prova' }),
      e('verbete', 'GL-aaaaaaaa-1', 'excluir'),
      e('sitio', 'SI-aaaaaaaa-1', 'criar', { nome: 'Tell Usuário Teste' }),
      e('sitio', 'SI-aaaaaaaa-1', 'excluir'),
      e('imagem', 'IM-aaaaaaaa-1', 'criar', { alvoTipo: 'objeto', alvo: 'CA00001', nome: 'IMG_2041.HEIC' }),
      e('imagem', 'IM-aaaaaaaa-1', 'excluir'),
      e('regiao', 'RG-aaaaaaaa-1', 'criar', { imagem: 'IMG-TESTE-0002-1', objeto: 'CA00002', elemento: 'juba' }),
      e('regiao', 'RG-aaaaaaaa-1', 'excluir'),
      e('hipotese', 'HY-aaaaaaaa-1', 'criar', { objeto: 'CA00002', termos: ['GL-000001'], termosRotulos: ['leão'] }),
      e('hipotese', 'HY-aaaaaaaa-1', 'excluir'),
      colecao('CO-aaaaaaaa-1', 'Selos', []),
      e('colecao', 'CO-aaaaaaaa-1', 'excluir'),
      e('nota', 'NT-aaaaaaaa-1', 'criar', { texto: 'Rever a datação', alvoTipo: 'objeto', alvo: 'CA00001' }),
      e('nota', 'NT-aaaaaaaa-1', 'excluir'),
      objeto(),
      e('objeto', OB, 'excluir'),
      // não são itens para a pessoa: ficam fora
      e('ligacao', 'LG-1', 'criar', { a: 'x' }),
      e('ligacao', 'LG-1', 'excluir'),
      e('posicao', 'PO-1', 'criar', { a: 'x' }),
      e('posicao', 'PO-1', 'excluir'),
      e('item-sitio', 'CA00001', 'criar', { sitio: 'x' }),
      e('item-sitio', 'CA00001', 'excluir'),
    ])
    const grupos = gruposDeExcluidos(estado, ctx())
    expect(grupos.map((g) => [g.tipo, g.titulo, g.linhas.length])).toEqual([
      ['objeto', 'Objetos SKC', 1],
      ['nota', 'Notas', 1],
      ['colecao', 'Coleções', 1],
      ['hipotese', 'Hipóteses', 1],
      ['regiao', 'Regiões', 1],
      ['imagem', 'Fotos', 1],
      ['sitio', 'Sítios', 1],
      ['verbete', 'Verbetes', 1],
    ])
  })

  it('grupos vazios não aparecem; nada excluído dá lista vazia; o que foi restaurado não aparece', () => {
    expect(gruposDeExcluidos(fundir([e('nota', 'NT-aaaaaaaa-1', 'criar', { texto: 'a' })]), ctx())).toEqual([])
    const estado = fundir([
      e('nota', 'NT-aaaaaaaa-1', 'criar', { texto: 'a', alvoTipo: 'objeto', alvo: 'CA00001' }),
      e('nota', 'NT-aaaaaaaa-1', 'excluir'),
      e('colecao', 'CO-aaaaaaaa-1', 'criar', { nome: 'Selos' }),
      e('colecao', 'CO-aaaaaaaa-1', 'excluir'),
      e('colecao', 'CO-aaaaaaaa-1', 'restaurar'),
    ])
    expect(gruposDeExcluidos(estado, ctx()).map((g) => g.titulo)).toEqual(['Notas'])
  })

  it('dentro do grupo, da marca de exclusão mais nova à mais antiga (não pela criação)', () => {
    const estado = fundir([
      e('nota', 'NT-aaaaaaaa-1', 'criar', { texto: 'primeira', alvoTipo: 'objeto', alvo: 'CA00001' }),
      e('nota', 'NT-aaaaaaaa-2', 'criar', { texto: 'segunda', alvoTipo: 'objeto', alvo: 'CA00001' }),
      e('nota', 'NT-aaaaaaaa-3', 'criar', { texto: 'terceira', alvoTipo: 'objeto', alvo: 'CA00001' }),
      e('nota', 'NT-aaaaaaaa-2', 'excluir'),
      e('nota', 'NT-aaaaaaaa-3', 'excluir'),
      e('nota', 'NT-aaaaaaaa-1', 'excluir'),
    ])
    expect(gruposDeExcluidos(estado, ctx())[0]!.linhas.map((l) => l.id)).toEqual(['NT-aaaaaaaa-1', 'NT-aaaaaaaa-3', 'NT-aaaaaaaa-2'])
  })
})

describe('gruposDeExcluidos: as linhas', () => {
  it('nota: o começo do texto entre aspas, «nota em CA00001», quando (pela marca) e o caminho dela', () => {
    const estado = fundir([
      e('nota', 'NT-aaaaaaaa-1', 'criar', { texto: 'Comparar com o selo do TESTE I, que tem a mesma moldura e o mesmo leão', alvoTipo: 'objeto', alvo: 'CA00001' }),
      e('nota', 'NT-aaaaaaaa-1', 'excluir'),
    ])
    const l = linha(gruposDeExcluidos(estado, ctx()), 'NT-aaaaaaaa-1')
    expect(l).toMatchObject({ tipo: 'nota', nome: '«Comparar com o selo do TESTE I, que tem a…»', onde: 'nota em CA00001', caminho: '/nota/NT-aaaaaaaa-1', publicado: false, alvoExcluido: null })
    expect(l.quando).toBe(quando(T0 + 2000, AGORA))
    expect(l.quando).toMatch(/^hoje, \d\d:\d\d$/)
  })

  it('nota em sítio ou verbete do livro: o nome que o livro dá (nunca o id)', () => {
    const estado = fundir([
      e('nota', 'NT-aaaaaaaa-1', 'criar', { texto: 'Rever a datação', alvoTipo: 'sitio', alvo: 'TESTE-2' }),
      e('nota', 'NT-aaaaaaaa-1', 'excluir'),
    ])
    const nomeNoLivro = (tipo: 'verbete' | 'sitio', id: string) => (tipo === 'sitio' && id === 'TESTE-2' ? 'Tell do Norte' : null)
    expect(linha(gruposDeExcluidos(estado, ctx({ nomeNoLivro })), 'NT-aaaaaaaa-1').onde).toBe('nota em Tell do Norte')
  })

  it('objeto: o número confirmado e, onde, o título; o caminho é o da página dele', () => {
    const estado = fundir([objeto(), confirmado(), e('objeto', OB, 'excluir')])
    expect(linha(gruposDeExcluidos(estado, ctx()), OB)).toMatchObject({ tipo: 'objeto', nome: 'CA00005', onde: 'Selo sintético de teste.', caminho: `/item/${OB}` })
  })

  it('objeto sem número confirmado: o título é o nome', () => {
    const estado = fundir([objeto(), e('objeto', OB, 'excluir')])
    expect(linha(gruposDeExcluidos(estado, ctx()), OB)).toMatchObject({ nome: 'Selo sintético de teste.', onde: null })
  })

  it('coleção: o nome e quantos objetos ela tem', () => {
    const estado = fundir([colecao('CO-aaaaaaaa-1', 'Selos para comparar', ['CA00001', 'CA00002', 'CA00003']), e('colecao', 'CO-aaaaaaaa-1', 'excluir')])
    expect(linha(gruposDeExcluidos(estado, ctx()), 'CO-aaaaaaaa-1')).toMatchObject({ nome: 'Selos para comparar', onde: 'coleção com 3 objetos', caminho: '/grupo/CO-aaaaaaaa-1' })
  })

  it('região: o elemento e «região na foto de CA00002»; hipótese: o termo e «hipótese em CA00002»; foto: a legenda ou o nome do arquivo', () => {
    const estado = fundir([
      e('regiao', 'RG-aaaaaaaa-1', 'criar', { imagem: 'IMG-TESTE-0002-1', objeto: 'CA00002', elemento: 'juba' }),
      e('regiao', 'RG-aaaaaaaa-1', 'excluir'),
      e('hipotese', 'HY-aaaaaaaa-1', 'criar', { objeto: 'CA00002', termos: ['GL-000001'], termosRotulos: ['leão'] }),
      e('hipotese', 'HY-aaaaaaaa-1', 'excluir'),
      e('imagem', 'IM-aaaaaaaa-1', 'criar', { alvoTipo: 'objeto', alvo: 'CA00001', nome: 'IMG_2041.HEIC', legenda: '' }),
      e('imagem', 'IM-aaaaaaaa-1', 'excluir'),
      e('imagem', 'IM-aaaaaaaa-2', 'criar', { alvoTipo: 'objeto', alvo: 'CA00001', nome: 'x.jpg', legenda: 'Selo visto de cima' }),
      e('imagem', 'IM-aaaaaaaa-2', 'excluir'),
    ])
    const g = gruposDeExcluidos(estado, ctx())
    expect(linha(g, 'RG-aaaaaaaa-1')).toMatchObject({ nome: 'juba', onde: 'região na foto de CA00002', caminho: '/item/CA00002' })
    expect(linha(g, 'HY-aaaaaaaa-1')).toMatchObject({ nome: 'leão', onde: 'hipótese em CA00002', caminho: '/item/CA00002?hipotese=HY-aaaaaaaa-1' })
    expect(linha(g, 'IM-aaaaaaaa-1')).toMatchObject({ nome: 'IMG_2041.HEIC', onde: 'foto de CA00001', caminho: '/item/CA00001' })
    expect(linha(g, 'IM-aaaaaaaa-2')).toMatchObject({ nome: 'Selo visto de cima', onde: 'foto de CA00001' })
  })

  it('o termo da hipótese pelo nome de agora: o do livro, quando o livro o tem', () => {
    const estado = fundir([
      e('hipotese', 'HY-aaaaaaaa-1', 'criar', { objeto: 'CA00002', termos: ['GL-000001'], termosRotulos: ['leao antigo'] }),
      e('hipotese', 'HY-aaaaaaaa-1', 'excluir'),
    ])
    const nomeNoLivro = (tipo: 'verbete' | 'sitio', id: string) => (tipo === 'verbete' && id === 'GL-000001' ? 'leão' : null)
    expect(linha(gruposDeExcluidos(estado, ctx({ nomeNoLivro })), 'HY-aaaaaaaa-1').nome).toBe('leão')
  })
})

describe('o que saiu junto e o alvo também excluído', () => {
  it('a foto de um objeto excluído sem marca própria não aparece (volta com o objeto)', () => {
    const estado = fundir([objeto(), confirmado(), e('imagem', 'IM-aaaaaaaa-1', 'criar', { alvoTipo: 'objeto', alvo: OB, nome: 'IMG_2041.HEIC' }), e('objeto', OB, 'excluir')])
    const grupos = gruposDeExcluidos(estado, ctx())
    expect(grupos.map((g) => g.tipo)).toEqual(['objeto'])
  })

  it('com marca própria, aparece com «o objeto dela também está excluído» e alvoExcluido', () => {
    const estado = fundir([
      objeto(),
      confirmado(),
      e('imagem', 'IM-aaaaaaaa-1', 'criar', { alvoTipo: 'objeto', alvo: OB, nome: 'IMG_2041.HEIC' }),
      e('imagem', 'IM-aaaaaaaa-1', 'excluir'),
      e('nota', 'NT-aaaaaaaa-1', 'criar', { texto: 'Rever', alvoTipo: 'objeto', alvo: OB.toUpperCase() }),
      e('nota', 'NT-aaaaaaaa-1', 'excluir'),
      e('objeto', OB, 'excluir'),
    ])
    const g = gruposDeExcluidos(estado, ctx())
    expect(linha(g, 'IM-aaaaaaaa-1')).toMatchObject({ onde: 'foto de CA00005 · o objeto dela também está excluído', alvoExcluido: { tipo: 'objeto', id: OB } })
    expect(linha(g, 'NT-aaaaaaaa-1')).toMatchObject({ onde: 'nota em CA00005 · o objeto dela também está excluído', alvoExcluido: { tipo: 'objeto', id: OB } })
  })

  it('com o objeto vivo, alvoExcluido é null', () => {
    const estado = fundir([objeto(), confirmado(), e('imagem', 'IM-aaaaaaaa-1', 'criar', { alvoTipo: 'objeto', alvo: OB, nome: 'a.jpg' }), e('imagem', 'IM-aaaaaaaa-1', 'excluir')])
    expect(linha(gruposDeExcluidos(estado, ctx()), 'IM-aaaaaaaa-1')).toMatchObject({ onde: 'foto de CA00005', alvoExcluido: null })
  })
})

describe('entradas publicadas e origens que nunca chegaram', () => {
  const SI = 'SI-aaaaaaaa-1'
  it('origem publicada que o pacote ainda traz: «sai dos livros na próxima importação» e a aprovação do sítio publicado', () => {
    const estado = fundir([e('sitio', SI, 'criar', { nome: 'Tell Usuário Teste' }), e('sitio', SI, 'excluir')])
    const l = linha(gruposDeExcluidos(estado, ctx({ redirecionamentos: new Map([[SI, 'TESTE-3']]) })), SI)
    expect(l).toMatchObject({ nome: 'Tell Usuário Teste', onde: 'sai dos livros na próxima importação', publicado: true })
    expect(l.confirmacao).toBe('Restaurar o sítio «Tell Usuário Teste»? Ele continua nos livros, com o mesmo TESTE-3, e os objetos e notas ligados a ele voltam a se ligar a ele.')
  })

  it('o pacote não a traz mais (ou nunca trouxe): a linha fica sem a nota, como um sítio seu', () => {
    const estado = fundir([e('sitio', SI, 'criar', { nome: 'Tell Usuário Teste' }), e('sitio', SI, 'excluir')])
    const l = linha(gruposDeExcluidos(estado, ctx({ redirecionamentos: new Map() })), SI)
    expect(l).toMatchObject({ onde: null, publicado: false, caminho: `/sitio/${SI}` })
    expect(l.confirmacao).toBe('Restaurar o sítio «Tell Usuário Teste»?')
    expect(linha(gruposDeExcluidos(estado, ctx()), SI).onde).toBeNull()
  })

  it('origem que nunca chegou (só a marca, sem campos): o nome da entrada dos livros, não o id', () => {
    const estado = fundir([e('sitio', 'SI-aaaaaaaa-2', 'excluir'), e('verbete', 'GL-aaaaaaaa-3', 'excluir')])
    const pedidos: string[] = []
    const nomeNoLivro = (tipo: 'verbete' | 'sitio', id: string) => {
      pedidos.push(`${tipo}:${id}`)
      return id === 'TESTE-4' ? 'Tell Livro Teste' : id === 'GL-000123' ? 'amuleto de prova' : null
    }
    const redirecionamentos = new Map([
      ['SI-aaaaaaaa-2', 'TESTE-4'],
      ['GL-aaaaaaaa-3', 'GL-000123'],
    ])
    const g = gruposDeExcluidos(estado, ctx({ redirecionamentos, nomeNoLivro }))
    expect(linha(g, 'SI-aaaaaaaa-2')).toMatchObject({ nome: 'Tell Livro Teste', onde: 'sai dos livros na próxima importação', publicado: true })
    expect(linha(g, 'GL-aaaaaaaa-3')).toMatchObject({ nome: 'amuleto de prova', onde: 'sai dos livros na próxima importação', publicado: true })
    expect(pedidos).toEqual(expect.arrayContaining(['sitio:TESTE-4', 'verbete:GL-000123']))
    expect(linha(g, 'SI-aaaaaaaa-2').confirmacao).toBe('Restaurar o sítio «Tell Livro Teste»? Ele continua nos livros, com o mesmo TESTE-4, e os objetos e notas ligados a ele voltam a se ligar a ele.')
  })
})

describe('a aprovação de «Restaurar» (confirmacao)', () => {
  it('objeto com a foto e a nota, numa coleção, com número confirmado: o texto do desenho', () => {
    const estado = fundir([
      objeto(),
      confirmado(),
      e('imagem', 'IM-aaaaaaaa-1', 'criar', { alvoTipo: 'objeto', alvo: OB, nome: 'a.jpg' }),
      e('nota', 'NT-aaaaaaaa-1', 'criar', { texto: 'n', alvoTipo: 'objeto', alvo: OB }),
      colecao('CO-aaaaaaaa-1', 'Selos para comparar', [OB, 'CA00001']),
      e('objeto', OB, 'excluir'),
    ])
    expect(linha(gruposDeExcluidos(estado, ctx()), OB).confirmacao).toBe(
      'Restaurar o objeto CA00005? Voltam com ele a foto e a nota. Ele volta às listas e à coleção «Selos para comparar», no mesmo lugar, com o mesmo número.',
    )
  })

  it('sem nada junto e em nenhuma coleção: sem «Voltam com ele…»; «Ele volta às listas, com o mesmo número.»', () => {
    const estado = fundir([objeto(), confirmado(), e('objeto', OB, 'excluir')])
    expect(linha(gruposDeExcluidos(estado, ctx()), OB).confirmacao).toBe('Restaurar o objeto CA00005? Ele volta às listas, com o mesmo número.')
  })

  it('duas coleções vivas (pelo id ou pelo número): «às coleções «X» e «Y»»; a excluída não conta; o plural da junção', () => {
    const estado = fundir([
      objeto(),
      confirmado(),
      e('hipotese', 'HY-aaaaaaaa-1', 'criar', { objeto: OB, termos: ['GL-000001'], termosRotulos: ['leão'] }),
      e('hipotese', 'HY-aaaaaaaa-2', 'criar', { objeto: OB, termos: ['GL-000001'], termosRotulos: ['leão'] }),
      colecao('CO-aaaaaaaa-1', 'Selos para comparar', [OB]),
      colecao('CO-aaaaaaaa-2', 'Amuletos', ['CA00005']),
      colecao('CO-aaaaaaaa-3', 'Velha', [OB]),
      e('colecao', 'CO-aaaaaaaa-3', 'excluir'),
      e('objeto', OB, 'excluir'),
    ])
    expect(linha(gruposDeExcluidos(estado, ctx()), OB).confirmacao).toBe(
      'Restaurar o objeto CA00005? Voltam com ele as 2 hipóteses. Ele volta às listas e às coleções «Amuletos» e «Selos para comparar», no mesmo lugar, com o mesmo número.',
    )
  })

  it('uma coisa só junto: «Volta com ele a nota.»', () => {
    const estado = fundir([objeto(), confirmado(), e('nota', 'NT-aaaaaaaa-1', 'criar', { texto: 'n', alvoTipo: 'objeto', alvo: OB }), e('objeto', OB, 'excluir')])
    expect(linha(gruposDeExcluidos(estado, ctx()), OB).confirmacao).toBe('Restaurar o objeto CA00005? Volta com ele a nota. Ele volta às listas, com o mesmo número.')
  })

  it('sem número confirmado: o título entre aspas e sem «, com o mesmo número»', () => {
    const semColecao = fundir([objeto(), e('objeto', OB, 'excluir')])
    expect(linha(gruposDeExcluidos(semColecao, ctx()), OB).confirmacao).toBe('Restaurar o objeto «Selo sintético de teste.»? Ele volta às listas.')
    const comColecao = fundir([objeto(), colecao('CO-aaaaaaaa-1', 'Selos para comparar', [OB]), e('objeto', OB, 'excluir')])
    expect(linha(gruposDeExcluidos(comColecao, ctx()), OB).confirmacao).toBe('Restaurar o objeto «Selo sintético de teste.»? Ele volta às listas e à coleção «Selos para comparar», no mesmo lugar.')
  })

  it('os demais: «Restaurar <descrição>?»', () => {
    const estado = fundir([
      e('nota', 'NT-aaaaaaaa-1', 'criar', { texto: 'a', alvoTipo: 'objeto', alvo: 'CA00001' }),
      e('nota', 'NT-aaaaaaaa-1', 'excluir'),
      colecao('CO-aaaaaaaa-1', 'Selos', []),
      e('colecao', 'CO-aaaaaaaa-1', 'excluir'),
      e('hipotese', 'HY-aaaaaaaa-1', 'criar', { objeto: 'CA00002', termos: ['GL-000001'], termosRotulos: ['leão'] }),
      e('hipotese', 'HY-aaaaaaaa-1', 'excluir'),
      e('regiao', 'RG-aaaaaaaa-1', 'criar', { imagem: 'IMG-TESTE-0002-1', objeto: 'CA00002', elemento: 'juba' }),
      e('regiao', 'RG-aaaaaaaa-1', 'excluir'),
      e('imagem', 'IM-aaaaaaaa-1', 'criar', { alvoTipo: 'objeto', alvo: 'CA00001', nome: 'IMG_2041.HEIC' }),
      e('imagem', 'IM-aaaaaaaa-1', 'excluir'),
      e('sitio', 'SI-aaaaaaaa-1', 'criar', { nome: 'Tell Novo' }),
      e('sitio', 'SI-aaaaaaaa-1', 'excluir'),
      e('verbete', 'GL-aaaaaaaa-1', 'criar', { forma: 'amuleto de prova' }),
      e('verbete', 'GL-aaaaaaaa-1', 'excluir'),
    ])
    const g = gruposDeExcluidos(estado, ctx())
    expect(linha(g, 'NT-aaaaaaaa-1').confirmacao).toBe('Restaurar a nota em CA00001?')
    expect(linha(g, 'CO-aaaaaaaa-1').confirmacao).toBe('Restaurar a coleção «Selos»?')
    expect(linha(g, 'HY-aaaaaaaa-1').confirmacao).toBe('Restaurar a hipótese sobre «leão» em CA00002?')
    expect(linha(g, 'RG-aaaaaaaa-1').confirmacao).toBe('Restaurar a região «juba» na foto de CA00002?')
    expect(linha(g, 'IM-aaaaaaaa-1').confirmacao).toBe('Restaurar a foto «IMG_2041.HEIC» de CA00001?')
    expect(linha(g, 'SI-aaaaaaaa-1').confirmacao).toBe('Restaurar o sítio «Tell Novo»?')
    expect(linha(g, 'GL-aaaaaaaa-1').confirmacao).toBe('Restaurar o verbete «amuleto de prova»?')
  })

  it('verbete publicado: continua nos livros, com o mesmo número, e o que se liga a ele volta a se ligar', () => {
    const estado = fundir([e('verbete', 'GL-aaaaaaaa-1', 'criar', { forma: 'amuleto de prova' }), e('verbete', 'GL-aaaaaaaa-1', 'excluir')])
    const l = linha(gruposDeExcluidos(estado, ctx({ redirecionamentos: new Map([['GL-aaaaaaaa-1', 'GL-000123']]) })), 'GL-aaaaaaaa-1')
    expect(l.confirmacao).toBe('Restaurar o verbete «amuleto de prova»? Ele continua nos livros, com o mesmo GL-000123, e as hipóteses e notas ligadas a ele voltam a se ligar a ele.')
    expect(l.juntas).toEqual(['GL-aaaaaaaa-1'])
  })
})

describe('revisão 1: a data curta', () => {
  const agora = new Date(2026, 10, 5, 18, 0).getTime()
  it('hoje e ontem com a hora; os outros dias, dia/mês sem zero à esquerda e sem hora; outro ano, com o ano', () => {
    expect(quandoDaMarca(new Date(2026, 10, 5, 15, 20).getTime(), agora)).toBe('hoje, 15:20')
    expect(quandoDaMarca(new Date(2026, 10, 4, 23, 5).getTime(), agora)).toBe('ontem, 23:05')
    expect(quandoDaMarca(new Date(2026, 10, 3, 16, 42).getTime(), agora)).toBe('3/11')
    expect(quandoDaMarca(new Date(2026, 0, 12, 9, 0).getTime(), agora)).toBe('12/1')
    expect(quandoDaMarca(new Date(2025, 10, 3, 9, 0).getTime(), agora)).toBe('3/11/2025')
  })
  it('a linha usa a data curta pela marca de exclusão', () => {
    const estado = fundir([
      e('nota', 'NT-aaaaaaaa-1', 'criar', { texto: 'a', alvoTipo: 'objeto', alvo: 'CA00001' }, new Date(2026, 10, 1, 10, 0).getTime()),
      e('nota', 'NT-aaaaaaaa-1', 'excluir', {}, new Date(2026, 10, 3, 16, 42).getTime()),
    ])
    expect(linha(gruposDeExcluidos(estado, ctx({ agora })), 'NT-aaaaaaaa-1').quando).toBe('3/11')
  })
})

describe('revisão 1: as origens da mesma entrada dos livros voltam juntas (spec §5)', () => {
  const redirecionamentos = new Map([
    ['SI-aaaaaaaa-1', 'TESTE-3'],
    ['SI-aaaaaaaa-2', 'TESTE-3'],
    ['SI-aaaaaaaa-3', 'TESTE-4'],
    ['GL-aaaaaaaa-1', 'GL-000123'],
    ['GL-aaaaaaaa-2', 'GL-000123'],
  ])
  it('duas origens excluídas do mesmo sítio dos livros: cada linha restaura as duas, e a aprovação diz isso no plural', () => {
    const estado = fundir([
      e('sitio', 'SI-aaaaaaaa-1', 'criar', { nome: 'Tell B' }),
      e('sitio', 'SI-aaaaaaaa-2', 'criar', { nome: 'Tell A' }),
      e('sitio', 'SI-aaaaaaaa-3', 'criar', { nome: 'Tell C' }),
      e('sitio', 'SI-aaaaaaaa-1', 'excluir'),
      e('sitio', 'SI-aaaaaaaa-2', 'excluir'),
      e('sitio', 'SI-aaaaaaaa-3', 'excluir'),
    ])
    const g = gruposDeExcluidos(estado, ctx({ redirecionamentos }))
    const texto = 'Restaurar os seus 2 sítios «Tell A» e «Tell B»? Eles continuam nos livros, com o mesmo TESTE-3, e os objetos e notas ligados a eles voltam a se ligar a eles.'
    for (const id of ['SI-aaaaaaaa-1', 'SI-aaaaaaaa-2']) {
      expect(linha(g, id).confirmacao).toBe(texto)
      expect(linha(g, id).juntas).toEqual(['SI-aaaaaaaa-2', 'SI-aaaaaaaa-1'])
    }
    // a outra entrada dos livros não entra
    expect(linha(g, 'SI-aaaaaaaa-3').juntas).toEqual(['SI-aaaaaaaa-3'])
    expect(linha(g, 'SI-aaaaaaaa-3').confirmacao).toBe(
      'Restaurar o sítio «Tell C»? Ele continua nos livros, com o mesmo TESTE-4, e os objetos e notas ligados a ele voltam a se ligar a ele.',
    )
  })

  it('uma origem viva da mesma entrada não entra (não está excluída); com só uma excluída, o texto fica no singular', () => {
    const estado = fundir([
      e('sitio', 'SI-aaaaaaaa-1', 'criar', { nome: 'Tell B' }),
      e('sitio', 'SI-aaaaaaaa-2', 'criar', { nome: 'Tell A' }),
      e('sitio', 'SI-aaaaaaaa-1', 'excluir'),
    ])
    const l = linha(gruposDeExcluidos(estado, ctx({ redirecionamentos })), 'SI-aaaaaaaa-1')
    expect(l.juntas).toEqual(['SI-aaaaaaaa-1'])
    expect(l.confirmacao).toBe('Restaurar o sítio «Tell B»? Ele continua nos livros, com o mesmo TESTE-3, e os objetos e notas ligados a ele voltam a se ligar a ele.')
  })

  it('dois verbetes: «Restaurar os seus 2 verbetes …? Eles continuam nos livros, com o mesmo GL-…»', () => {
    const estado = fundir([
      e('verbete', 'GL-aaaaaaaa-1', 'criar', { forma: 'amuleto de prova' }),
      e('verbete', 'GL-aaaaaaaa-2', 'excluir'),
      e('verbete', 'GL-aaaaaaaa-1', 'excluir'),
    ])
    const nomeNoLivro = (tipo: 'verbete' | 'sitio', id: string) => (tipo === 'verbete' && id === 'GL-000123' ? 'amuleto do livro' : null)
    const g = gruposDeExcluidos(estado, ctx({ redirecionamentos, nomeNoLivro }))
    expect(linha(g, 'GL-aaaaaaaa-2').confirmacao).toBe(
      'Restaurar os seus 2 verbetes «amuleto de prova» e «amuleto do livro»? Eles continuam nos livros, com o mesmo GL-000123, e as hipóteses e notas ligadas a eles voltam a se ligar a eles.',
    )
    expect(linha(g, 'GL-aaaaaaaa-2').juntas).toEqual(['GL-aaaaaaaa-1', 'GL-aaaaaaaa-2'])
  })

  it('N-2: duas origens que nunca chegaram (só a marca) levam o mesmo nome dos livros: o nome não se repete', () => {
    const estado = fundir([e('verbete', 'GL-aaaaaaaa-1', 'excluir'), e('verbete', 'GL-aaaaaaaa-2', 'excluir')])
    const nomeNoLivro = (tipo: 'verbete' | 'sitio', id: string) => (tipo === 'verbete' && id === 'GL-000123' ? 'amuleto do livro' : null)
    const g = gruposDeExcluidos(estado, ctx({ redirecionamentos, nomeNoLivro }))
    expect(linha(g, 'GL-aaaaaaaa-1').confirmacao).toBe(
      'Restaurar os seus 2 verbetes «amuleto do livro»? Eles continuam nos livros, com o mesmo GL-000123, e as hipóteses e notas ligadas a eles voltam a se ligar a eles.',
    )
  })

  it('o que não é origem publicada restaura só a si mesmo', () => {
    const estado = fundir([e('nota', 'NT-aaaaaaaa-1', 'criar', { texto: 'a' }), e('nota', 'NT-aaaaaaaa-1', 'excluir')])
    expect(linha(gruposDeExcluidos(estado, ctx()), 'NT-aaaaaaaa-1').juntas).toEqual(['NT-aaaaaaaa-1'])
  })
})

describe('revisão 1: a foto de um objeto ainda excluído', () => {
  it('a aprovação termina com «Ela fica escondida até o objeto voltar.»', () => {
    const estado = fundir([
      objeto(),
      confirmado(),
      e('imagem', 'IM-aaaaaaaa-1', 'criar', { alvoTipo: 'objeto', alvo: OB, nome: 'IMG_2041.HEIC' }),
      e('imagem', 'IM-aaaaaaaa-1', 'excluir'),
      e('objeto', OB, 'excluir'),
    ])
    expect(linha(gruposDeExcluidos(estado, ctx()), 'IM-aaaaaaaa-1').confirmacao).toBe('Restaurar a foto «IMG_2041.HEIC» de CA00005? Ela fica escondida até o objeto voltar.')
  })
})

describe('P5 (aprovação): a origem só com a marca, depois da importação', () => {
  it('sem o redirecionamento nem o nome no pacote, usa o nome guardado neste aparelho, não o id', () => {
    const estado = fundir([e('verbete', 'GL-aaaaaaaa-1', 'excluir'), e('sitio', 'SI-aaaaaaaa-1', 'excluir')])
    const guardados: Record<string, string> = { 'GL-aaaaaaaa-1': 'leão-de-teste', 'SI-aaaaaaaa-1': 'Tell TESTE' }
    const g = gruposDeExcluidos(estado, ctx({ nomeGuardado: (id: string) => guardados[id] ?? null }))
    expect(linha(g, 'GL-aaaaaaaa-1').nome).toBe('leão-de-teste')
    expect(linha(g, 'SI-aaaaaaaa-1').nome).toBe('Tell TESTE')
    expect(linha(g, 'GL-aaaaaaaa-1').confirmacao).toBe('Restaurar o verbete «leão-de-teste»?')
    // sem nome guardado, como antes
    expect(linha(gruposDeExcluidos(estado, ctx()), 'GL-aaaaaaaa-1').nome).toBe('Verbete GL-aaaaaaaa-1')
  })

  it('enquanto o pacote traz a entrada, vale o nome do pacote', () => {
    const estado = fundir([e('verbete', 'GL-aaaaaaaa-1', 'excluir')])
    const g = gruposDeExcluidos(
      estado,
      ctx({ redirecionamentos: new Map([['GL-aaaaaaaa-1', 'GL-000123']]), nomeNoLivro: () => 'amuleto do livro', nomeGuardado: () => 'antigo' }),
    )
    expect(linha(g, 'GL-aaaaaaaa-1').nome).toBe('amuleto do livro')
  })
})

describe('P4 (aprovação): a região e a hipótese de um objeto ainda excluído', () => {
  it('a aprovação também termina com «Ela fica escondida até o objeto voltar.»; a nota não muda', () => {
    const estado = fundir([
      objeto(),
      confirmado(),
      e('regiao', 'RG-aaaaaaaa-1', 'criar', { objeto: OB, imagem: 'IM-aaaaaaaa-1', elemento: 'leão TESTE', seletor: '<polygon points="0,0 1,0 1,1"/>' }),
      e('hipotese', 'HY-aaaaaaaa-1', 'criar', { objeto: OB, sobre: 'objeto', termos: [], termosRotulos: [] }),
      e('nota', 'NT-aaaaaaaa-1', 'criar', { texto: 'Nota TESTE', alvoTipo: 'objeto', alvo: OB }),
      e('regiao', 'RG-aaaaaaaa-1', 'excluir'),
      e('hipotese', 'HY-aaaaaaaa-1', 'excluir'),
      e('nota', 'NT-aaaaaaaa-1', 'excluir'),
      e('objeto', OB, 'excluir'),
    ])
    const g = gruposDeExcluidos(estado, ctx())
    expect(linha(g, 'RG-aaaaaaaa-1').confirmacao).toBe('Restaurar a região «leão TESTE» na foto de CA00005? Ela fica escondida até o objeto voltar.')
    expect(linha(g, 'HY-aaaaaaaa-1').confirmacao).toMatch(/^Restaurar a hipótese.* em CA00005\? Ela fica escondida até o objeto voltar\.$/)
    expect(linha(g, 'NT-aaaaaaaa-1').confirmacao).toBe('Restaurar a nota em CA00005?')
  })
})

describe('m-4 (re-revisão 2): sem «.?» quando o objeto sem número tem um título terminado em ponto', () => {
  it('na região, na hipótese e na foto, o ponto final antes do «?» sai', () => {
    const estado = fundir([
      objeto(OB, { titulo: 'Selo TESTE. Pedra.' }),
      e('regiao', 'RG-aaaaaaaa-1', 'criar', { objeto: OB, imagem: 'IM-aaaaaaaa-1', elemento: 'leão TESTE', seletor: '<polygon points="0,0 1,0 1,1"/>' }),
      e('hipotese', 'HY-aaaaaaaa-1', 'criar', { objeto: OB, sobre: 'objeto', termos: [], termosRotulos: [] }),
      e('imagem', 'IM-aaaaaaaa-1', 'criar', { alvoTipo: 'objeto', alvo: OB, nome: 'IMG_TESTE.JPG' }),
      e('regiao', 'RG-aaaaaaaa-1', 'excluir'),
      e('hipotese', 'HY-aaaaaaaa-1', 'excluir'),
      e('imagem', 'IM-aaaaaaaa-1', 'excluir'),
      e('objeto', OB, 'excluir'),
    ])
    const g = gruposDeExcluidos(estado, ctx())
    expect(linha(g, 'RG-aaaaaaaa-1').confirmacao).toBe('Restaurar a região «leão TESTE» na foto de Selo TESTE. Pedra? Ela fica escondida até o objeto voltar.')
    expect(linha(g, 'HY-aaaaaaaa-1').confirmacao).toMatch(/ em Selo TESTE\. Pedra\? Ela fica escondida até o objeto voltar\.$/)
    expect(linha(g, 'IM-aaaaaaaa-1').confirmacao).toBe('Restaurar a foto «IMG_TESTE.JPG» de Selo TESTE. Pedra? Ela fica escondida até o objeto voltar.')
    for (const l of g.flatMap((x) => x.linhas)) expect(l.confirmacao).not.toMatch(/\.\?/)
  })
})

describe('revisão 1: textoDoRestaurado', () => {
  it('«Restaurado: X.», sem ponto duplo quando o nome já termina em ponto; vários, com «e»', () => {
    expect(textoDoRestaurado(['CA00005'])).toBe('Restaurado: CA00005.')
    expect(textoDoRestaurado(['Selo sintético de teste.'])).toBe('Restaurado: Selo sintético de teste.')
    expect(textoDoRestaurado(['«Comparar com o selo…»'])).toBe('Restaurado: «Comparar com o selo…».')
    expect(textoDoRestaurado(['Tell A', 'Tell B'])).toBe('Restaurado: Tell A e Tell B.')
    expect(textoDoRestaurado(['A', 'B', 'C'])).toBe('Restaurado: A, B e C.')
    // N-2: o mesmo nome duas vezes (duas origens da mesma entrada dos livros) aparece uma vez
    expect(textoDoRestaurado(['amuleto do livro', 'amuleto do livro'])).toBe('Restaurado: amuleto do livro.')
    expect(textoDoRestaurado(['A', 'B', 'A'])).toBe('Restaurado: A e B.')
  })
})
