import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { resumosDosObjetos } from '../banco/consultas'
import { registrar } from '../usuario/estado'
import { resolverMembros } from './membros'
import { resumoDeObjetoSkc } from './objetosSkc'
import { estadoAtual } from '../usuario/estado'

beforeAll(async () => usarMotor(await bancoDeTeste()))
afterAll(() => usarMotor(null))

describe('resumosDosObjetos (pacote)', () => {
  it('devolve um resumo por número pedido, na ordem pedida, e deixa de fora o que o pacote não tem', async () => {
    const r = await resumosDosObjetos(['BA00001', 'CA99999', 'CA00001'])
    expect(r.map((x) => x.numero)).toEqual(['BA00001', 'CA00001'])
    expect(r[1]).toMatchObject({ numero: 'CA00001', tipo: 'Pingente com leão-de-teste', miniatura: 'imagens/TESTE/TESTE-0001/thumb-1.webp' })
  })
  it('lista vazia, consulta nenhuma', async () => {
    expect(await resumosDosObjetos([])).toEqual([])
  })
})

describe('resolverMembros: pacote e objetos SKC', () => {
  it('o pacote responde pelos números; o que ninguém conhece vem como null', async () => {
    const mapa = await resolverMembros(['CA00002', 'CA99999'], estadoAtual())
    expect(mapa.get('CA00002')).toMatchObject({ numero: 'CA00002' })
    expect(mapa.get('CA99999')).toBeNull()
  })

  it('um objeto SKC é achado pelo id (OB-…) e pelo número, com a marca SKC e sem miniatura', async () => {
    await registrar('objeto', 'OB-membro01-1', 'criar', { numero: 'CA00046', titulo: 'Peça de teste.', obraRotulo: 'Artigo 2025', figura: '3', sitioNome: 'Sítio de Teste' })
    const mapa = await resolverMembros(['OB-membro01-1', 'CA00046'], estadoAtual())
    for (const ref of ['OB-membro01-1', 'CA00046']) {
      expect(mapa.get(ref)).toMatchObject({ numero: 'CA00046', tipo: 'Peça de teste', origem: 'Artigo 2025, fig. 3', sitio: 'Sítio de Teste', skc: true, miniatura: null })
    }
  })

  it('um objeto SKC excluído não é achado; sem número, o resumo usa o id', async () => {
    await registrar('objeto', 'OB-membro01-2', 'criar', { numero: 'BA00125', titulo: 'Selo.' })
    await registrar('objeto', 'OB-membro01-2', 'excluir')
    expect((await resolverMembros(['OB-membro01-2'], estadoAtual())).get('OB-membro01-2')).toBeNull()
    await registrar('objeto', 'OB-membro01-3', 'criar', { titulo: 'Rascunho.' })
    const r = estadoAtual().registro('objeto', 'OB-membro01-3')!
    expect(resumoDeObjetoSkc(r)).toMatchObject({ numero: 'OB-membro01-3', itemId: 'OB-membro01-3', skc: true, semNumero: true })
  })

  it('sem pacote aberto os números do pacote ficam null e nada estoura', async () => {
    usarMotor({ executar: async () => { throw new Error('sem banco') } } as never)
    try {
      const mapa = await resolverMembros(['CA00001'], estadoAtual())
      expect(mapa.get('CA00001')).toBeUndefined()
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })
})
