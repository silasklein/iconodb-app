import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { resolverAlvos } from '../notas/alvos'
import { estadoAtual, registrar } from '../usuario/estado'

beforeAll(async () => usarMotor(await bancoDeTeste()))
afterAll(() => usarMotor(null))

describe('decisão 41: um [[…]] para um verbete do usuário (o autocompletar de [[ sugere os verbetes do usuário)', () => {
  it('existe pela camada do usuário (não pelo pacote), com o rótulo e a página dele; excluído, não existe', async () => {
    await registrar('verbete', 'GL-alvoskca-1', 'criar', { forma: 'termo-de-alvo', status: 'proposed' })
    const chave = 'verbete\u0000GL-alvoskca-1'
    expect((await resolverAlvos([{ tipo: 'verbete', ref: 'GL-alvoskca-1' }], estadoAtual())).get(chave)).toMatchObject({
      existe: true,
      rotulo: 'termo-de-alvo',
      rota: '/verbete/GL-alvoskca-1',
    })
    await registrar('verbete', 'GL-alvoskca-1', 'excluir')
    expect((await resolverAlvos([{ tipo: 'verbete', ref: 'GL-alvoskca-1' }], estadoAtual())).get(chave)).toMatchObject({ existe: false, rota: null })
    // os do pacote continuam pelo pacote
    expect((await resolverAlvos([{ tipo: 'verbete', ref: 'GL-900001' }], estadoAtual())).get('verbete\u0000GL-900001')).toMatchObject({ existe: true, rota: '/verbete/GL-900001' })
  })
})

describe('T17-B-12: os rótulos dos links [[…]] dizem o nome de agora do verbete', () => {
  it('um verbete do livro com forma em uso, e a hipótese cujo primeiro termo o tem, levam a forma em uso; sem ela, o nome do livro', async () => {
    await registrar('hipotese', 'HY-rotulo-1', 'criar', { objeto: 'CA00001', sobre: 'objeto', termos: ['GL-900001'], termosRotulos: ['rótulo antigo guardado'], nivel: 'iconographic', modalidade: 'probable', justificativa: '', ancora: null })
    const pedir = async () => {
      const m = await resolverAlvos([{ tipo: 'verbete', ref: 'GL-900001' }, { tipo: 'hipotese', ref: 'HY-rotulo-1' }], estadoAtual())
      return [m.get('verbete\u0000GL-900001')!.rotulo, m.get('hipotese\u0000HY-rotulo-1')!.rotulo]
    }
    // sem forma em uso: o verbete e a hipótese seguem o nome do livro (a hipótese não fica com o rótulo guardado)
    expect(await pedir()).toEqual(['leão-de-teste', 'leão-de-teste'])
    await registrar('verbete', 'GL-900001', 'alterar', { formaEmUso: 'cria de leão' })
    expect(await pedir()).toEqual(['cria de leão', 'cria de leão'])
  })
})
