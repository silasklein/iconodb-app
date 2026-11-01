import { fireEvent, render, screen } from '@testing-library/react'
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
  it('"/" foca e seleciona o campo, mas não dentro de um campo de texto', async () => {
    render(
      <>
        <input aria-label="outro" />
        <CampoDeBusca id="q" valor="leão" aoMudar={() => {}} aoEnviar={() => {}} atalho />
      </>,
    )
    const campo = screen.getByRole('searchbox', { name: 'Buscar' })
    await userEvent.keyboard('/')
    expect(campo).toHaveFocus()
    await userEvent.click(screen.getByLabelText('outro'))
    await userEvent.keyboard('/')
    expect(screen.getByLabelText('outro')).toHaveValue('/')
    expect(screen.getByLabelText('outro')).toHaveFocus()
  })

  it('sem a propriedade atalho, "/" não faz nada', async () => {
    render(<CampoDeBusca id="q" valor="" aoMudar={() => {}} aoEnviar={() => {}} />)
    await userEvent.keyboard('/')
    expect(screen.getByRole('searchbox', { name: 'Buscar' })).not.toHaveFocus()
  })

  it('Esc com texto limpa; Esc com o campo vazio sai do campo', async () => {
    const aoMudar = vi.fn()
    const { rerender } = render(<CampoDeBusca id="q" valor="leão" aoMudar={aoMudar} aoEnviar={() => {}} />)
    const campo = screen.getByRole('searchbox', { name: 'Buscar' })
    campo.focus()
    fireEvent.keyDown(campo, { key: 'Escape' })
    expect(aoMudar).toHaveBeenCalledWith('')
    expect(campo).toHaveFocus()
    rerender(<CampoDeBusca id="q" valor="" aoMudar={aoMudar} aoEnviar={() => {}} />)
    fireEvent.keyDown(campo, { key: 'Escape' })
    expect(campo).not.toHaveFocus()
  })
})
