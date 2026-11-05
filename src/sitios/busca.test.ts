// @vitest-environment node
/**
 * Tarefa 12: a busca e as sugestões acham os sítios do usuário e os sítios do livro corrigidos, pelo nome de agora e
 * pelo do livro; os objetos trocados de sítio aparecem no sítio novo. Cada teste carrega módulos novos sobre um IndexedDB
 * limpo e um banco novo do pacote sintético (como indice.test.ts).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { ev, A, T0 } from '../../tests/suporte/eventosDeTeste'
import { RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import { lerTabelaDeFold } from '../busca/fold'
import type { Evento, Json, Op, Tipo } from '../usuario/eventos'

const tabela = lerTabelaDeFold(JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo/fold.json'), 'utf8')))
const opcoes = { escopo: 'tudo', filtros: {}, tabela } as const

type Modulos = {
  estado: typeof import('../usuario/estado')
  consulta: typeof import('../busca/consulta')
  sugestoes: typeof import('../busca/sugestoes')
  cliente: typeof import('../banco/cliente')
}

function apagarBanco() {
  return new Promise<void>((ok, falha) => {
    const r = indexedDB.deleteDatabase('iconodb-usuario')
    r.onsuccess = () => ok()
    r.onerror = () => falha(r.error)
    r.onblocked = () => falha(new Error('banco bloqueado'))
  })
}

let m: Modulos
beforeEach(async () => {
  await apagarBanco()
  vi.resetModules()
  m = {
    estado: await import('../usuario/estado'),
    consulta: await import('../busca/consulta'),
    sugestoes: await import('../busca/sugestoes'),
    cliente: await import('../banco/cliente'),
  }
  m.cliente.usarMotor(await bancoDeTeste())
})
afterEach(() => m.cliente.usarMotor(null))

let seq = 0
function e(tipo: Tipo, reg: string, campos: Record<string, Json>, op: Op = 'alterar'): Evento {
  seq++
  return ev({ ap: A, seq, ms: T0 + seq * 10, tipo, reg, op, campos })
}
const sugerir = (digitado: string) => m.sugestoes.sugerir(digitado, { limitePorCategoria: 3, tabela })
const buscar = (q: string, escopo: 'tudo' | 'local' = 'tudo') => m.consulta.buscar(q, { ...opcoes, escopo })

describe('buscar(): um sítio do livro corrigido acha os objetos dele pelo nome corrigido e pelo do livro', () => {
  beforeEach(() => m.estado.receberEventos([e('sitio', 'TESTE-2', { nome: 'Tell Nova Grafia', variantes: ['Khirbet Probe'] })]))

  it('o nome corrigido, uma grafia acrescentada e o nome do livro levam aos mesmos 3 objetos', async () => {
    for (const q of ['nova grafia', 'khirbet probe', 'tell probe teste']) {
      expect((await buscar(q, 'local')).numeros, q).toEqual(['BA00002', 'CA00003', 'CA00004'])
    }
  })

  it('o acerto "na sua camada" leva o nome de agora e o id do sítio do livro (a tela abre /sitio/TESTE-2)', async () => {
    const r = await buscar('khirbet probe', 'local')
    expect(r.usuario).toEqual([expect.objectContaining({ tipo: 'sitio', ref: 'TESTE-2', rotulo: 'Tell Nova Grafia' })])
  })

  it('voltar o nome ao do livro (null) tira o nome corrigido da busca', async () => {
    await m.estado.receberEventos([e('sitio', 'TESTE-2', { nome: null, variantes: null })])
    expect((await buscar('nova grafia', 'local')).total).toBe(0)
    expect((await buscar('tell probe teste', 'local')).total).toBe(3)
  })

  it('a faceta Sítio usa o nome de agora', async () => {
    const r = await buscar('tell probe teste')
    const faceta = r.facetas.find((f) => f.chave === 'sitio')!
    expect(faceta.opcoes.map((o) => [o.valor, o.rotulo])).toEqual([['TESTE-2', 'Tell Nova Grafia']])
  })
})

describe('buscar(): um sítio do usuário', () => {
  beforeEach(() =>
    m.estado.receberEventos([
      e('sitio', 'SI-aaaaaaaa-1', { nome: 'Tell Inventado', variantes: ['Tall Inventada'], regiao: 'Negev' }, 'criar'),
      e('objeto', 'OB-aaaaaaaa-1', { numero: 'CA00005', titulo: 'Escaraveu.', sitio: 'SI-aaaaaaaa-1', sitioNome: 'Tell Inventado' }, 'criar'),
      // um objeto do LIVRO que a pessoa ligou ao sítio novo (item-sitio)
      e('item-sitio', 'CA00001', { sitio: 'SI-aaaaaaaa-1', sitioNome: 'Tell Inventado' }),
    ]),
  )

  it('acha o objeto SKC e o objeto do livro ligado a ele, pelo nome e pela grafia', async () => {
    for (const q of ['tell inventado', 'tall inventada']) {
      const r = await buscar(q, 'local')
      expect(r.numeros, q).toEqual(['CA00001', 'CA00005'])
      expect(r.usuario).toEqual([expect.objectContaining({ tipo: 'sitio', ref: 'SI-aaaaaaaa-1', rotulo: 'Tell Inventado' })])
    }
  })

  it('o objeto trocado de sítio aparece na faceta sob o novo sítio, e o que não foi trocado sob o do livro', async () => {
    const r = await buscar('maḥteṣ teste')
    const faceta = r.facetas.find((f) => f.chave === 'sitio')!
    expect(Object.fromEntries(faceta.opcoes.map((o) => [o.valor, [o.rotulo, o.n]]))).toEqual({ 'SI-aaaaaaaa-1': ['Tell Inventado', 1], 'TESTE-1': ['Maḥteṣ Teste', 2] })
    // filtrar pelo sítio novo traz o objeto trocado
    const so = await m.consulta.buscar('maḥteṣ teste', { ...opcoes, filtros: { sitio: ['SI-aaaaaaaa-1'] } })
    expect(so.numeros).toEqual(['CA00001'])
  })

  it('um sítio sem objetos aparece na camada do usuário, com o link do sítio', async () => {
    await m.estado.receberEventos([e('sitio', 'SI-aaaaaaaa-2', { nome: 'Sítio vazio de teste' }, 'criar')])
    const r = await buscar('vazio de teste', 'local')
    expect(r.usuario).toEqual([expect.objectContaining({ tipo: 'sitio', ref: 'SI-aaaaaaaa-2', rotulo: 'Sítio vazio de teste' })])
  })

  it('o excluído não aparece; restaurar o traz de volta', async () => {
    await m.estado.receberEventos([e('sitio', 'SI-aaaaaaaa-1', {}, 'excluir')])
    expect((await buscar('tall inventada', 'local')).usuario).toEqual([])
    await m.estado.receberEventos([e('sitio', 'SI-aaaaaaaa-1', {}, 'restaurar')])
    expect((await buscar('tall inventada', 'local')).numeros).toEqual(['CA00001', 'CA00005'])
  })
})

describe('sugerir(): sítios', () => {
  it('um sítio do livro corrigido aparece UMA vez, com o nome de agora; o nome do livro também o acha, dito como "no livro"', async () => {
    await m.estado.receberEventos([e('sitio', 'TESTE-2', { nome: 'Tell Nova Grafia', variantes: ['Khirbet Probe'], regiao: 'Negev' })])
    const novo = await sugerir('nova graf')
    expect(novo.sitios).toHaveLength(1)
    expect(novo.sitios[0]).toMatchObject({ ref: 'TESTE-2', rotulo: 'Tell Nova Grafia', destino: '/sitio/TESTE-2', skc: false })
    expect(novo.sitios[0]!.complemento).toMatch(/Negev/)
    const antigo = await sugerir('tell probe')
    expect(antigo.sitios).toHaveLength(1)
    expect(antigo.sitios[0]).toMatchObject({ ref: 'TESTE-2', rotulo: 'Tell Nova Grafia' })
    expect(antigo.sitios[0]!.complemento).toMatch(/no livro: Tell Probe Teste/)
    const grafia = await sugerir('khirbet')
    expect(grafia.sitios.map((s) => s.ref)).toEqual(['TESTE-2'])
  })

  it('um sítio do usuário abre a página do sítio, não a busca', async () => {
    await m.estado.receberEventos([e('sitio', 'SI-aaaaaaaa-1', { nome: 'Tell Leonino', regiao: 'Negev' }, 'criar')])
    const r = await sugerir('leonino')
    expect(r.sitios[0]).toMatchObject({ skc: true, ref: 'SI-aaaaaaaa-1', rotulo: 'Tell Leonino', destino: '/sitio/SI-aaaaaaaa-1' })
    expect(r.sitios[0]!.complemento).toBe('Negev')
  })

  it('o sítio excluído não é sugerido', async () => {
    await m.estado.receberEventos([e('sitio', 'SI-aaaaaaaa-1', { nome: 'Tell Leonino' }, 'criar'), e('sitio', 'SI-aaaaaaaa-1', {}, 'excluir')])
    expect((await sugerir('leonino')).sitios).toEqual([])
  })

  it('o objeto do livro trocado de sítio mostra o sítio de agora no complemento', async () => {
    await m.estado.receberEventos([e('sitio', 'SI-aaaaaaaa-1', { nome: 'Tell Leonino' }, 'criar'), e('item-sitio', 'CA00001', { sitio: 'SI-aaaaaaaa-1', sitioNome: 'Tell Leonino' })])
    const r = await sugerir('ca00001')
    expect(r.objetos[0]!.complemento).toContain('Tell Leonino')
    expect(r.objetos[0]!.complemento).not.toContain('Maḥteṣ Teste')
  })
})

describe('m1: um objeto SKC leva o nome de agora do sítio na busca e nas sugestões, não o que ficou guardado na ficha', () => {
  beforeEach(() =>
    m.estado.receberEventos([
      // a ficha guardou «Tell Velho» quando o sítio se chamava assim; depois a correção voltou ao nome do livro
      e('objeto', 'OB-aaaaaaaa-1', { numero: 'CA00005', titulo: 'Escaraveu.', sitio: 'TESTE-2', sitioNome: 'Tell Velho' }, 'criar'),
    ]),
  )

  it('a sugestão do objeto SKC diz o nome do livro (corrigido → livro → guardado)', async () => {
    const r = await sugerir('ca00005')
    expect(r.objetos[0]!.complemento).toContain('Tell Probe Teste')
    expect(r.objetos[0]!.complemento).not.toContain('Tell Velho')
    await m.estado.receberEventos([e('sitio', 'TESTE-2', { nome: 'Tell Nova Grafia' })])
    expect((await sugerir('ca00005')).objetos[0]!.complemento).toContain('Tell Nova Grafia')
  })

  it('a faceta Sítio rotula o sítio uma vez só, com o nome de agora, mesmo com o objeto SKC contado nele', async () => {
    // a grafia acrescentada acha o sítio (sem nome corrigido: o do livro vale) e, por ele, o objeto SKC ligado
    await m.estado.receberEventos([e('sitio', 'TESTE-2', { nome: null, variantes: ['Khirbet Probe'] })])
    const r = await buscar('khirbet probe', 'local')
    expect(r.numeros).toContain('CA00005')
    const faceta = r.facetas.find((f) => f.chave === 'sitio')!
    expect(faceta.opcoes.map((o) => [o.valor, o.rotulo, o.n])).toEqual([['TESTE-2', 'Tell Probe Teste', 4]])
  })

  it('um sítio do usuário excluído: o objeto SKC diz o nome e «excluído»; restaurado, só o nome', async () => {
    await m.estado.receberEventos([
      e('sitio', 'SI-aaaaaaaa-1', { nome: 'Tell Inventado' }, 'criar'),
      e('objeto', 'OB-aaaaaaaa-1', { sitio: 'SI-aaaaaaaa-1', sitioNome: 'Nome antigo' }),
      e('sitio', 'SI-aaaaaaaa-1', {}, 'excluir'),
    ])
    expect((await sugerir('ca00005')).objetos[0]!.complemento).toContain('Tell Inventado (excluído)')
    await m.estado.receberEventos([e('sitio', 'SI-aaaaaaaa-1', {}, 'restaurar')])
    const depois = (await sugerir('ca00005')).objetos[0]!.complemento
    expect(depois).toContain('Tell Inventado')
    expect(depois).not.toContain('excluído')
  })
})

describe('r2: «(excluído)» só para o sítio que foi excluído; o que ainda não chegou a este aparelho diz «(ainda não sincronizado)»', () => {
  const objeto = (sitio: string, sitioNome: string) => e('objeto', 'OB-aaaaaaaa-1', { numero: 'CA00005', titulo: 'Escaraveu de teste.', sitio, sitioNome }, 'criar')

  it('sugestões: um sítio que este aparelho não tem não é «excluído»', async () => {
    await m.estado.receberEventos([objeto('SI-bbbbbbbb-7', 'Tell Distante')])
    const complemento = (await sugerir('ca00005')).objetos[0]!.complemento
    expect(complemento).toContain('Tell Distante (ainda não sincronizado)')
    expect(complemento).not.toContain('excluído')
  })

  it('sugestões: excluído de verdade continua «(excluído)», e quando o sítio chega a marca some', async () => {
    await m.estado.receberEventos([objeto('SI-bbbbbbbb-7', 'Tell Distante')])
    await m.estado.receberEventos([e('sitio', 'SI-bbbbbbbb-7', { nome: 'Tell Distante' }, 'criar'), e('sitio', 'SI-bbbbbbbb-7', {}, 'excluir')])
    expect((await sugerir('ca00005')).objetos[0]!.complemento).toContain('Tell Distante (excluído)')
    await m.estado.receberEventos([e('sitio', 'SI-bbbbbbbb-7', {}, 'restaurar')])
    const depois = (await sugerir('ca00005')).objetos[0]!.complemento
    expect(depois).toContain('Tell Distante')
    expect(depois).not.toMatch(/excluído|sincronizado/)
  })

  it('busca (faceta Sítio): o mesmo, «(ainda não sincronizado)» ou «(excluído)» conforme o caso', async () => {
    await m.estado.receberEventos([objeto('SI-bbbbbbbb-7', 'Tell Distante')])
    const rotulo = async () => (await buscar('escaraveu de teste')).facetas.find((f) => f.chave === 'sitio')!.opcoes.find((o) => o.valor === 'SI-bbbbbbbb-7')!.rotulo
    expect(await rotulo()).toBe('Tell Distante (ainda não sincronizado)')
    await m.estado.receberEventos([e('sitio', 'SI-bbbbbbbb-7', { nome: 'Tell Distante' }, 'criar'), e('sitio', 'SI-bbbbbbbb-7', {}, 'excluir')])
    expect(await rotulo()).toBe('Tell Distante (excluído)')
  })
})
