import { act, renderHook, waitFor } from '@testing-library/react'
import { armazemComPacote, bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { abrirBanco, reabrirBanco, usarMotor } from '../banco/cliente'
import { armazemMemoria } from '../pacote/armazem'
import { esquecerCitacoes } from './fontesCitadas'
import { useObrasCitaveis } from './useCitacoes'

afterEach(() => {
  usarMotor(null)
  esquecerCitacoes()
})

describe('T17-B-2: as obras citáveis acompanham a troca do pacote', () => {
  it('uma obra que só passa a existir num pacote novo é reconhecida sem recarregar a tela', async () => {
    const armazem = armazemMemoria()
    usarMotor(await bancoDeTeste({ armazem }))
    expect(await abrirBanco()).toEqual({ estado: 'sem-pacote' })
    const { result } = renderHook(() => useObrasCitaveis())
    expect(result.current.reconhece('TESTE I')).toBe(false)
    const cheio = await armazemComPacote()
    for (const c of await cheio.listar('')) await armazem.gravar(c, (await cheio.ler(c))!)
    await act(async () => void (await reabrirBanco()))
    await waitFor(() => expect(result.current.reconhece('TESTE I')).toBe(true))
  })
})
