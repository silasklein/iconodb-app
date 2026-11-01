import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ErroSemPacote } from '../banco/cliente'
import { AvisoDeErro, MSG_ERRO_GERAL, MSG_SEM_PACOTE } from './AvisoDeErro'
import { useCarregar } from './useCarregar'

function Tela({ buscar }: { buscar: () => Promise<string> }) {
  const carga = useCarregar(buscar)
  if (carga.fase === 'carregando') return <p>Carregando…</p>
  if (carga.fase === 'erro') return <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />
  return <p>{carga.dados}</p>
}

const montar = (buscar: () => Promise<string>) =>
  render(
    <MemoryRouter>
      <Tela buscar={buscar} />
    </MemoryRouter>,
  )

describe('AvisoDeErro', () => {
  it('"Tentar de novo" carrega outra vez e, dando certo, mostra o conteúdo', async () => {
    const buscar = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error('falhou')).mockResolvedValue('Conteúdo')
    montar(buscar)
    expect(await screen.findByRole('alert')).toHaveTextContent(MSG_ERRO_GERAL)
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Conteúdo')).toBeInTheDocument()
    expect(buscar).toHaveBeenCalledTimes(2)
  })

  it('sem pacote: a mensagem, o link para preparar e também "Tentar de novo"', async () => {
    const buscar = vi.fn<() => Promise<string>>().mockRejectedValue(new ErroSemPacote())
    montar(buscar)
    expect(await screen.findByRole('alert')).toHaveTextContent(MSG_SEM_PACOTE)
    expect(screen.getByRole('link', { name: 'Preparar o banco' })).toHaveAttribute('href', '/preparando')
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(buscar).toHaveBeenCalledTimes(2)
  })

  it('sem aoTentar, sem botão', () => {
    render(
      <MemoryRouter>
        <AvisoDeErro erro={new Error('x')} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
