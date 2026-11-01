import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CampoDeBusca } from './CampoDeBusca'

describe('CampoDeBusca', () => {
  it('na barra superior: nome visível "Buscar" dentro da caixa, a dica "/" e o campo ligado ao rótulo', () => {
    render(<CampoDeBusca id="q" variante="barra" valor="" aoMudar={() => {}} aoEnviar={() => {}} atalho />)
    const campo = screen.getByRole('searchbox', { name: 'Buscar' })
    expect(campo).toHaveAttribute('aria-keyshortcuts', '/')
    expect(screen.getByText('Buscar')).toHaveClass('campo-busca-rotulo')
    expect(document.querySelector('kbd')).toHaveTextContent('/')
    expect(document.querySelector('.campo-busca-barra')).not.toBeNull()
  })

  it('a dica "/" some quando há texto (o botão de limpar toma o lugar)', () => {
    render(<CampoDeBusca id="q" variante="barra" valor="teste" aoMudar={() => {}} aoEnviar={() => {}} />)
    expect(document.querySelector('kbd')).toBeNull()
    expect(screen.getByRole('button', { name: 'Limpar a busca' })).toBeInTheDocument()
  })

  it('o placeholder genérico e o envio com Enter', async () => {
    const aoEnviar = vi.fn()
    render(<CampoDeBusca id="q" valor="leão" aoMudar={() => {}} aoEnviar={aoEnviar} placeholder="termo, sítio ou número…" />)
    expect(screen.getByPlaceholderText('termo, sítio ou número…')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), '{Enter}')
    expect(aoEnviar).toHaveBeenCalledWith('leão')
  })

  it('variante "inicio" mostra o rótulo e a dica "/" também no computador', () => {
    render(<CampoDeBusca id="q" variante="inicio" valor="" aoMudar={() => {}} aoEnviar={() => {}} atalho />)
    expect(document.querySelector('.campo-busca-inicio')).not.toBeNull()
    expect(document.querySelector('kbd')).toHaveTextContent('/')
  })
})
