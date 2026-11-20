/**
 * Tarefa 26, fix 1 (I1; desenhos 3, 5 e 7): o cartão da figura do livro em parágrafos sem tipo mostra o rótulo da figura («GGG:
 * 3a», decisão 39) na linha do tipo, nos dois tamanhos, e «sem sítio» embaixo quando não tem sítio. O cartão de um objeto do
 * catálogo sem tipo continua com «—».
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ObjetoResumo } from '../banco/tipos'
import { CartaoDeObjeto } from './CartaoDeObjeto'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async () => null) }))

const figura: ObjetoResumo = { numero: 'F200001', itemId: 'TESTEG-0001a', origem: 'TESTEG: 1a', tipo: null, sitio: null, miniatura: null, display_mode: null, figura: 'TESTEG: 1a' }
const doCatalogo: ObjetoResumo = { numero: 'BA00002', itemId: 'TESTE-0006', origem: 'TESTE I: 6', tipo: null, sitio: null, miniatura: null, display_mode: null }

const mostrar = (o: ObjetoResumo, grande: boolean) =>
  render(
    <MemoryRouter>
      <CartaoDeObjeto objeto={o} grande={grande} />
    </MemoryRouter>,
  )

describe.each([
  ['celular', false],
  ['computador', true],
])('o cartão da figura (%s)', (_, grande) => {
  it('a linha do tipo diz «TESTEG: 1a» e a de baixo «sem sítio», sem repetir o rótulo', () => {
    mostrar(figura, grande)
    const cartao = screen.getByRole('link')
    expect(cartao.querySelector('.cartao-tipo')).toHaveTextContent(/^TESTEG: 1a$/)
    expect(cartao.querySelector('.cartao-sitio')).toHaveTextContent(/^sem sítio$/)
  })

  it('com sítio, o nome dele embaixo', () => {
    mostrar({ ...figura, sitio: 'Tell Achado Teste' }, grande)
    expect(screen.getByRole('link').querySelector('.cartao-sitio')).toHaveTextContent(/^Tell Achado Teste$/)
  })

  it('o objeto do catálogo sem tipo continua com «—»', () => {
    mostrar(doCatalogo, grande)
    const cartao = screen.getByRole('link')
    expect(cartao.querySelector('.cartao-tipo')).toHaveTextContent(/^—$/)
    expect(cartao.querySelector('.cartao-sitio')).toHaveTextContent(grande ? /^TESTE I: 6$/ : /^$/)
  })
})
