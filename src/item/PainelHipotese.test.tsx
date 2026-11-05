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

  it('decisão 39: a Origem mostra o locator do pacote com dois pontos ("TESTE I: 1", não "TESTE I, Nr. 1")', async () => {
    abrir({ verbetes: [{ glId: 'GL-900001', texto: 'leão-de-teste' }] })
    const painel = await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
    expect(painel).toHaveTextContent('TESTE I: 1')
    expect(painel).not.toHaveTextContent('Nr.')
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

  describe('o nível no cabeçalho (decisão 35)', () => {
    it.each(['lateral', 'folha'] as const)('%s: marcador ■■□ com o nome escrito ao lado (e só ele lido)', async (variante) => {
      abrir({ variante })
      const painel = await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
      const etiqueta = painel.querySelector('.painel-hipotese-etiqueta') as HTMLElement
      const marcador = etiqueta.querySelector('.marcador-nivel') as HTMLElement
      expect(marcador).toHaveAttribute('data-nivel', 'iconographic')
      expect(marcador.querySelectorAll('rect[data-cheio="true"]')).toHaveLength(2)
      expect(marcador.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      expect(marcador.querySelector('svg')).toHaveAttribute('width', '30')
      // O nome escrito fica ao lado do marcador («Iconográfico · …») e é ele que o leitor de tela ouve: o marcador não diz
      // «nível iconográfico» por cima (seria a segunda vez).
      expect(etiqueta).toHaveTextContent(/Iconográfico · /)
      expect(etiqueta.querySelector('.so-leitor')).toBeNull()
      expect(etiqueta.textContent).not.toMatch(/nível/i)
    })
  })
})
