import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AppRoutes, ROTAS } from './routes'

const CAMINHOS = [
  '/',
  '/entrar',
  '/preparando',
  '/busca',
  '/colecoes',
  '/grupo/:id',
  '/item/:id',
  '/imagem/:id',
  '/glossario',
  '/verbete/:id',
  '/bibliografia',
  '/obra/:id',
  '/sitios',
  '/sitio/:id',
  '/revisao',
  '/atalhos',
]

describe('rotas', () => {
  it('declara exatamente as rotas combinadas', () => {
    expect(ROTAS.map((r) => r.path)).toEqual(CAMINHOS)
  })

  it.each(CAMINHOS)('%s mostra uma tela provisória', (caminho) => {
    const url = caminho.replace(':id', 'x1')
    render(
      <MemoryRouter initialEntries={[url]}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('caminho desconhecido volta ao Início', () => {
    render(
      <MemoryRouter initialEntries={['/nao-existe']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Início' })).toBeInTheDocument()
  })
})
