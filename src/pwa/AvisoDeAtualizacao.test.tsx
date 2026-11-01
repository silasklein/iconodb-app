import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { AvisoDeAtualizacao } from './AvisoDeAtualizacao'
import { definirAtualizacao } from './atualizacao'

function abrir(caminho = '/') {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <AvisoDeAtualizacao />
    </MemoryRouter>,
  )
}

describe('AvisoDeAtualizacao', () => {
  afterEach(() => act(() => definirAtualizacao({ pendente: false })))

  it('não aparece sem versão nova', () => {
    abrir()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('com versão nova, avisa sem bloquear e só recarrega ao tocar em Recarregar', async () => {
    const aplicar = vi.fn(async () => undefined)
    abrir()
    act(() => definirAtualizacao({ pendente: true, aplicar }))
    expect(screen.getByRole('status')).toHaveTextContent('Nova versão disponível')
    expect(aplicar).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Recarregar' }))
    expect(aplicar).toHaveBeenCalledTimes(1)
  })

  it('fica escondido durante o primeiro download (recarregar interromperia a sincronização)', () => {
    abrir('/preparando')
    act(() => definirAtualizacao({ pendente: true, aplicar: async () => undefined }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
