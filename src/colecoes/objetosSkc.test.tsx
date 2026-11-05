import { act, renderHook, waitFor } from '@testing-library/react'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { registrar } from '../usuario/estado'
import { useObjetosSkc } from './objetosSkc'

beforeAll(async () => usarMotor(await bancoDeTeste()))
afterAll(() => usarMotor(null))

describe('T17-B-17: a lista de objetos SKC acompanha o nome do sítio', () => {
  it('renomear o sítio do usuário muda o sítio mostrado no objeto, sem recarregar', async () => {
    await registrar('sitio', 'SI-rename01-1', 'criar', { nome: 'Tell Antigo de Teste' })
    await registrar('objeto', 'OB-rename01-1', 'criar', { periodo: 'CA', titulo: 'Escaraveu de teste.', sitio: 'SI-rename01-1', sitioNome: 'Tell Antigo de Teste', origemTipo: 'achado' })
    const { result } = renderHook(() => useObjetosSkc())
    await waitFor(() => expect(result.current.find((o) => o.itemId === 'OB-rename01-1')?.sitio).toBe('Tell Antigo de Teste'))
    await act(async () => void (await registrar('sitio', 'SI-rename01-1', 'alterar', { nome: 'Tell Novo de Teste' })))
    await waitFor(() => expect(result.current.find((o) => o.itemId === 'OB-rename01-1')?.sitio).toBe('Tell Novo de Teste'))
  })
})
