import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { PainelHipotese } from './PainelHipotese'

function abrir(props: Partial<Parameters<typeof PainelHipotese>[0]> = {}) {
  const aoFechar = vi.fn()
  render(
    <MemoryRouter>
      <PainelHipotese id="HY-900001" variante="lateral" aoFechar={aoFechar} {...props} />
    </MemoryRouter>,
  )
  return aoFechar
}

describe('PainelHipotese', () => {
  beforeAll(async () => usarMotor(await bancoDeTeste()))
  afterAll(() => usarMotor(null))

  it('um link de verbete para cada glId distinto marcado no trecho (correção 3)', async () => {
    abrir({
      verbetes: [
        { glId: 'GL-900001', texto: 'leão-de-teste' },
        { glId: 'GL-900002', texto: 'figura denteada' },
      ],
    })
    const painel = await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
    expect(within(painel).getByRole('link', { name: 'Abrir verbete: leão-de-teste' })).toHaveAttribute('href', '/verbete/GL-900001')
    expect(within(painel).getByRole('link', { name: 'Abrir verbete: figura denteada' })).toHaveAttribute('href', '/verbete/GL-900002')
    expect(within(painel).queryByRole('link', { name: 'Abrir verbete' })).toBeNull()
  })

  it('um só verbete (o do trecho ou o termo da hipótese): "Abrir verbete"', async () => {
    abrir({ verbetes: [{ glId: 'GL-900001', texto: 'leão-de-teste' }] })
    const painel = await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
    expect(within(painel).getAllByRole('link', { name: /^Abrir verbete/ })).toHaveLength(1)
    expect(within(painel).getByRole('link', { name: 'Abrir verbete' })).toHaveAttribute('href', '/verbete/GL-900001')
  })

  it('Esc num campo de texto fora do painel não fecha; fora de campo, fecha (correção 4)', async () => {
    const aoFechar = abrir()
    await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
    const campo = document.createElement('input')
    document.body.append(campo)
    fireEvent.keyDown(campo, { key: 'Escape' })
    expect(aoFechar).not.toHaveBeenCalled()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(aoFechar).toHaveBeenCalledTimes(1)
    campo.remove()
  })
})
