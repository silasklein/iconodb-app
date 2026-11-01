import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { processarRetornoDoLogin } from '../dropbox/retorno'
import { RetornoDoLogin } from './RetornoDoLogin'

vi.mock('../dropbox/retorno', () => ({ processarRetornoDoLogin: vi.fn() }))

function Onde() {
  const l = useLocation()
  return <p data-testid="onde">{l.pathname + (l.state ? ' ' + JSON.stringify(l.state) : '')}</p>
}

function montar() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <RetornoDoLogin />
      <Routes>
        <Route path="*" element={<Onde />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RetornoDoLogin', () => {
  it('login concluído leva a /preparando', async () => {
    vi.mocked(processarRetornoDoLogin).mockResolvedValue('concluido')
    montar()
    expect(await screen.findByText('/preparando')).toBeInTheDocument()
  })

  it('login que não concluiu leva a /entrar, avisando que voltou do Dropbox', async () => {
    vi.mocked(processarRetornoDoLogin).mockResolvedValue('falhou')
    montar()
    expect(await screen.findByText('/entrar {"voltou":true}')).toBeInTheDocument()
  })

  it('sem retorno do Dropbox fica onde está', async () => {
    vi.mocked(processarRetornoDoLogin).mockResolvedValue('sem-retorno')
    montar()
    await vi.waitFor(() => expect(processarRetornoDoLogin).toHaveBeenCalled())
    expect(screen.getByTestId('onde')).toHaveTextContent('/')
    expect(screen.getByTestId('onde').textContent).toBe('/')
  })
})
