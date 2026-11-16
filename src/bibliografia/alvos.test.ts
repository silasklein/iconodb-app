/** Parte 2C, bloco 3 (fix round 1, M1): um [[…]] para uma obra do usuário (o autocompletar de [[ sugere as obras do usuário). */
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { resolverAlvos } from '../notas/alvos'
import { estadoAtual, registrar } from '../usuario/estado'

beforeAll(async () => usarMotor(await bancoDeTeste()))
afterAll(() => usarMotor(null))

describe('[[BIB-<aparelho>-<n>]]: a obra do usuário', () => {
  it('existe pela camada (não pelo pacote), com a citação curta e a página dela; excluída, abre e diz «(excluída)»', async () => {
    await registrar('obra', 'BIB-alvosaaa-1', 'criar', { csl: { type: 'book', title: 'Obra de alvo' }, curta: 'Alvo 2006' })
    const chave = 'obra\u0000BIB-alvosaaa-1'
    const pedir = async () => (await resolverAlvos([{ tipo: 'obra', ref: 'BIB-alvosaaa-1' }], estadoAtual())).get(chave)
    expect(await pedir()).toMatchObject({ existe: true, rotulo: 'Alvo 2006', rota: '/obra/BIB-alvosaaa-1' })
    await registrar('obra', 'BIB-alvosaaa-1', 'excluir')
    expect(await pedir()).toMatchObject({ existe: true, rotulo: 'Alvo 2006 (excluída)', rota: '/obra/BIB-alvosaaa-1' })
    // uma que este aparelho não tem: não existe; as dos livros continuam pelo pacote
    expect((await resolverAlvos([{ tipo: 'obra', ref: 'BIB-alvosaaa-9' }], estadoAtual())).get('obra\u0000BIB-alvosaaa-9')).toMatchObject({ existe: false })
    expect((await resolverAlvos([{ tipo: 'obra', ref: 'BIB-900001' }], estadoAtual())).get('obra\u0000BIB-900001')).toMatchObject({ existe: true, rota: '/obra/BIB-900001' })
  })
})
