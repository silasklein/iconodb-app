import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { MinhasNotas } from './MinhasNotas'

describe('Minhas notas (até a 2B)', () => {
  it('mostra o estado vazio e o caminho de volta', () => {
    render(
      <MemoryRouter>
        <MinhasNotas />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Minhas notas' })).toBeInTheDocument()
    expect(screen.getByText('As suas notas chegam na próxima versão')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '#/')
  })
})
