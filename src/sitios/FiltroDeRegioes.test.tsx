/** Tarefa 6c: os chips de região enquanto os sítios carregam (antes, «Todas 0» e todas as regiões tracejadas). */
import { render, screen, within } from '@testing-library/react'
import { FiltroDeRegioes } from './FiltroDeRegioes'

const nada = () => undefined

describe('FiltroDeRegioes', () => {
  it('carregando (contagens null): sem números nem regiões tracejadas; o grupo diz que está ocupado', () => {
    render(<FiltroDeRegioes contagens={null} total={null} ativas={new Set()} aoAlternar={nada} aoLimpar={nada} />)
    const grupo = screen.getByRole('group', { name: 'Filtrar por região' })
    expect(grupo).toHaveAttribute('aria-busy', 'true')
    const todas = within(grupo).getByRole('button', { name: 'Todas, carregando' })
    expect(todas).toHaveTextContent(/^Todas$/)
    expect(grupo).not.toHaveTextContent(/\d/)
    expect(grupo.querySelectorAll('.regiao-chip-vazia')).toHaveLength(0)
  })

  it('carregado: os números, como antes', () => {
    render(<FiltroDeRegioes contagens={new Map([['levante-sul', 3]])} total={3} ativas={new Set()} aoAlternar={nada} aoLimpar={nada} />)
    const grupo = screen.getByRole('group', { name: 'Filtrar por região' })
    expect(grupo).not.toHaveAttribute('aria-busy')
    expect(within(grupo).getByRole('button', { name: 'Todas, 3 sítios' })).toHaveTextContent('Todas3')
  })
})
