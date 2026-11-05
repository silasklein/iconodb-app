/**
 * "Usar como principal" (decisão 33): a imagem do usuário marcada como principal vira a capa do objeto nas grades
 * (grupo, busca, coleções). Sem ela, a miniatura do livro.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { processadaFalsa } from '../../tests/suporte/imagensDeTeste'
import { usarArmazemDasImagens, usarCacheDasImagens } from '../imagens-usuario/local'
import { adicionarImagem, alterarImagem } from '../imagens-usuario/operacoes'
import { armazemMemoria } from '../pacote/armazem'
import { cacheMemoria } from '../pacote/imagens'
import { CartaoDeObjeto } from './CartaoDeObjeto'

vi.mock('../pacote/imagens', async (original) => ({ ...(await original<typeof import('../pacote/imagens')>()), urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

beforeEach(() => {
  usarArmazemDasImagens(armazemMemoria())
  usarCacheDasImagens(cacheMemoria())
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:usuario/capa')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})
afterEach(() => {
  usarArmazemDasImagens(undefined)
  usarCacheDasImagens(undefined)
  vi.restoreAllMocks()
})

const objeto = { numero: 'CA00020', itemId: 'T-20', origem: 'TESTE I: 20', tipo: 'Pingente', sitio: 'Sítio', miniatura: 'imagens/T/T-20/thumb-1.webp', display_mode: 'traco' as const }

describe('CartaoDeObjeto: a capa', () => {
  it('sem principal do usuário: a miniatura do livro', async () => {
    render(
      <MemoryRouter>
        <CartaoDeObjeto objeto={objeto} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('img', { name: 'Pingente' })).toHaveAttribute('src', 'blob:imagens/T/T-20/thumb-1.webp')
  })

  it('com principal do usuário: a miniatura dela; desmarcada, volta a do livro', async () => {
    const id = await adicionarImagem({ objeto: 'CA00020' }, processadaFalsa(), { tipo: 'tons', legenda: '', credito: 'x', principal: true })
    render(
      <MemoryRouter>
        <CartaoDeObjeto objeto={objeto} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('img', { name: 'Pingente' })).toHaveAttribute('src', 'blob:usuario/capa')
    await alterarImagem(id, { principal: false })
    await waitFor(() => expect(screen.getByRole('img', { name: 'Pingente' })).toHaveAttribute('src', 'blob:imagens/T/T-20/thumb-1.webp'))
  })
})
