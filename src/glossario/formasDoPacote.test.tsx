/**
 * Revisão 2, m2: as formas do pacote são lidas de novo quando um pacote novo é instalado (`aoReabrir`); uma tela aberta
 * não fica comparando o texto com o `pt` antigo.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { reabrirBanco, usarMotor } from '../banco/cliente'
import { formasDoPacote, useFormasDoPacote } from './formasDoPacote'

const lista = vi.hoisted(() => ({ atual: [{ id: 'GL-1', pt: 'forma antiga', ptTexto: null as string | null }] }))
vi.mock('../banco/consultas', async (original) => ({ ...(await original<typeof import('../banco/consultas')>()), formasDosVerbetes: vi.fn(async () => lista.atual) }))

beforeAll(async () => usarMotor(await bancoDeTeste()))
afterAll(() => usarMotor(null))

it('depois de reabrir o banco, o hook e o cache trazem as formas do pacote novo', async () => {
  const { result } = renderHook(() => useFormasDoPacote())
  await waitFor(() => expect(result.current?.get('GL-1')?.pt).toBe('forma antiga'))
  lista.atual = [{ id: 'GL-1', pt: 'forma nova', ptTexto: 'forma nova de texto' }]
  // sem reabrir, o cache vale
  expect((await formasDoPacote()).get('GL-1')?.pt).toBe('forma antiga')
  await act(async () => {
    await reabrirBanco()
  })
  await waitFor(() => expect(result.current?.get('GL-1')).toEqual({ pt: 'forma nova', ptTexto: 'forma nova de texto' }))
  expect((await formasDoPacote()).get('GL-1')?.pt).toBe('forma nova')
})
