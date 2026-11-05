import { act, renderHook, waitFor } from '@testing-library/react'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { registrar } from '../usuario/estado'
import { useMembrosResolvidos } from './membros'

beforeAll(async () => usarMotor(await bancoDeTeste()))
afterAll(() => usarMotor(null))

describe('T17-B-17 (revisão 1, m3): as linhas da coleção acompanham o nome do sítio', () => {
  it('renomear o sítio do usuário muda o sítio da linha do membro, sem remontar', async () => {
    await registrar('sitio', 'SI-membros17-1', 'criar', { nome: 'Tell Antigo de Teste' })
    await registrar('objeto', 'OB-membros17-1', 'criar', { periodo: 'CA', titulo: 'Selo de teste.', sitio: 'SI-membros17-1', sitioNome: 'Tell Antigo de Teste', origemTipo: 'achado' })
    const { result } = renderHook(() => useMembrosResolvidos(['OB-membros17-1']))
    await waitFor(() => expect(result.current.get('OB-membros17-1')?.sitio).toBe('Tell Antigo de Teste'))
    await act(async () => void (await registrar('sitio', 'SI-membros17-1', 'alterar', { nome: 'Tell Novo de Teste' })))
    await waitFor(() => expect(result.current.get('OB-membros17-1')?.sitio).toBe('Tell Novo de Teste'))
  })
})
