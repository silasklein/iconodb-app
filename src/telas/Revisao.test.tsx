import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Revisao } from './Revisao'

function abrir() {
  return render(
    <MemoryRouter>
      <Revisao />
    </MemoryRouter>,
  )
}

describe('Revisão (só leitura, 2A)', () => {
  beforeAll(async () => usarMotor(await bancoDeTeste()))
  afterAll(() => usarMotor(null))
  afterEach(() => instalarMatchMedia(375))

  it('mostra o total e as contagens por tipo, do maior para o menor', async () => {
    abrir()
    expect(screen.getByRole('heading', { level: 1, name: 'Revisão' })).toBeInTheDocument()
    expect(await screen.findByText(/^2 casos · o que o processamento não decidiu sozinho/)).toBeInTheDocument()
    const lista = screen.getByRole('list', { name: 'Casos por tipo' })
    const itens = within(lista).getAllByRole('listitem')
    expect(itens).toHaveLength(2)
    expect(itens[0]).toHaveTextContent('Citações não resolvidas')
    expect(itens[0]).toHaveTextContent('1')
    expect(itens[1]).toHaveTextContent('Traduções com termo alterado')
  })

  it('diz que resolver e deixar como está chegam na próxima versão', async () => {
    abrir()
    await screen.findByRole('list', { name: 'Casos por tipo' })
    expect(screen.getByText(/Resolver e Deixar como está: na próxima versão/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Resolver/ })).not.toBeInTheDocument()
  })

  it('no celular tem Voltar', async () => {
    abrir()
    await screen.findByRole('list', { name: 'Casos por tipo' })
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '#/')
  })

  it('no computador não repete o Voltar (a barra superior leva às seções)', async () => {
    instalarMatchMedia(1280)
    abrir()
    await screen.findByRole('list', { name: 'Casos por tipo' })
    expect(screen.queryByRole('link', { name: 'Voltar' })).not.toBeInTheDocument()
  })

  it('sem o banco no aparelho avisa', async () => {
    usarMotor({ abrir: async () => ({ estado: 'sem-pacote' }), reabrir: async () => ({ estado: 'sem-pacote' }), executar: async () => [] })
    try {
      abrir()
      expect(await screen.findByRole('alert')).toHaveTextContent('O banco ainda não está no aparelho.')
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })
})
