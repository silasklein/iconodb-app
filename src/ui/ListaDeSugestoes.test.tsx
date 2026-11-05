import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { semSugestoes, type Sugestao, type Sugestoes } from '../busca/sugestoes'
import { ListaDeRecentes, ListaDeSugestoes, idDaOpcao, opcoesDasRecentes, opcoesDasSugestoes, resumoDasSugestoes } from './ListaDeSugestoes'

vi.mock('./Miniatura', () => ({ Miniatura: ({ caminho }: { caminho: string }) => <img data-testid="miniatura" data-caminho={caminho} alt="" /> }))

const base = { complemento: null, complementoTrechos: [], codigo: null, codigoTrechos: [], id: null, miniatura: null, skc: false }
const s = (categoria: Sugestao['categoria'], ref: string, rotulo: string, extra: Partial<Sugestao> = {}): Sugestao => ({
  chave: `${categoria}:${ref}`,
  categoria,
  alvoTipo: 'verbete',
  ref,
  rotulo,
  trechos: [{ texto: rotulo, forte: false }],
  destino: `/x/${ref}`,
  recente: rotulo,
  ...base,
  ...extra,
})
const exemplo = (): Sugestoes => ({
  ...semSugestoes(),
  verbetes: [s('verbetes', 'GL-1', 'íbex', { id: 'GL-1', trechos: [{ texto: 'íb', forte: true }, { texto: 'ex', forte: false }] })],
  objetos: [
    s('objetos', 'CA00023', 'Remate', { codigo: 'CA00023', codigoTrechos: [{ texto: 'CA00023', forte: false }], miniatura: 'imagens/x.webp', complemento: 'IPIAO I: 60', complementoTrechos: [{ texto: 'IPIAO I: 60', forte: false }] }),
    s('objetos', 'CA00099', 'Selo do usuário', { codigo: 'CA00099', codigoTrechos: [{ texto: 'CA00099', forte: false }], skc: true }),
  ],
  colecoes: [s('colecoes', 'CO-1', 'Minhas notas', { skc: true })],
})

describe('opcoesDasSugestoes / resumoDasSugestoes', () => {
  it('a ordem da tela: por categoria (verbetes, objetos, sítios, obras, coleções) e, no fim, "Ver todos"', () => {
    const o = opcoesDasSugestoes(exemplo())
    expect(o.map((x) => (x.tipo === 'sugestao' ? x.sugestao.ref : x.tipo))).toEqual(['GL-1', 'CA00023', 'CA00099', 'CO-1', 'todos'])
    expect(opcoesDasSugestoes(exemplo(), false)).toHaveLength(4)
    expect(opcoesDasRecentes(['a', 'b'])).toEqual([{ tipo: 'recente', texto: 'a' }, { tipo: 'recente', texto: 'b' }])
    expect(idDaOpcao('lista', 3)).toBe('lista-op-3')
  })

  it('o resumo para o leitor de tela', () => {
    expect(resumoDasSugestoes(exemplo())).toBe('4 sugestões em 3 categorias')
    expect(resumoDasSugestoes({ ...semSugestoes(), obras: [s('obras', 'B', 'Autor 1999')] })).toBe('1 sugestão em 1 categoria')
    expect(resumoDasSugestoes(semSugestoes())).toBe('Nenhuma sugestão')
  })
})

describe('ListaDeSugestoes', () => {
  it('listbox com grupos rotulados, opções com id estável e link para o destino', () => {
    render(<ListaDeSugestoes id="l" digitado=" íb " sugestoes={exemplo()} ativo={-1} aoEscolher={() => {}} />)
    const lista = screen.getByRole('listbox', { name: 'Sugestões para «íb»' })
    expect(lista).toHaveAttribute('id', 'l')
    expect(within(lista).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Verbetes', 'Objetos', 'Coleções'])
    const opcoes = within(lista).getAllByRole('option')
    expect(opcoes.map((o) => o.id)).toEqual([0, 1, 2, 3, 4].map((i) => idDaOpcao('l', i)))
    expect(opcoes[0]).toHaveAttribute('href', '#/x/GL-1')
    expect(opcoes[4]).toHaveAttribute('href', '#/busca?q=%C3%ADb')
    expect(opcoes[4]).toHaveTextContent('Ver todos os resultados para «íb»')
    expect(opcoes.every((o) => o.getAttribute('aria-selected') === 'false')).toBe(true)
  })

  it('o verbete mostra o id; o objeto, miniatura e número; o do usuário, a marca SKC; o negrito vem dos trechos', () => {
    render(<ListaDeSugestoes id="l" digitado="íb" sugestoes={exemplo()} ativo={-1} aoEscolher={() => {}} />)
    const [verbete, objeto, skc] = screen.getAllByRole('option')
    expect(verbete).toHaveTextContent('GL-1')
    expect([...verbete!.querySelectorAll('.forte')].map((f) => f.textContent)).toEqual(['íb'])
    expect(within(objeto!).getByTestId('miniatura')).toHaveAttribute('data-caminho', 'imagens/x.webp')
    expect(within(objeto!).getByText('CA00023')).toHaveClass('codigo')
    expect(skc).toHaveTextContent('SKC')
    expect(skc!.querySelector('[data-testid="miniatura"]')).toBeNull() // sem imagem: só a área cinza
    expect(skc!.querySelector('.sugestao-miniatura')).not.toBeNull()
  })

  it('a opção ativa tem aria-selected e a dica Enter; tocar chama aoEscolher com a opção', async () => {
    const aoEscolher = vi.fn()
    render(<ListaDeSugestoes id="l" digitado="íb" sugestoes={exemplo()} ativo={1} aoEscolher={aoEscolher} />)
    const opcoes = screen.getAllByRole('option')
    expect(opcoes[1]).toHaveAttribute('aria-selected', 'true')
    expect(opcoes[1]!.querySelector('kbd')).toHaveTextContent('Enter')
    expect(opcoes[0]!.querySelector('kbd')).toBeNull()
    await userEvent.click(opcoes[2]!)
    expect(aoEscolher).toHaveBeenCalledWith({ tipo: 'sugestao', sugestao: expect.objectContaining({ ref: 'CA00099' }) })
    await userEvent.click(opcoes[4]!)
    expect(aoEscolher).toHaveBeenLastCalledWith({ tipo: 'todos' })
  })

  it('o link não navega sozinho (o clique é tratado pela tela)', async () => {
    render(<ListaDeSugestoes id="l" digitado="íb" sugestoes={exemplo()} ativo={-1} aoEscolher={() => {}} />)
    const e = new MouseEvent('click', { bubbles: true, cancelable: true })
    screen.getAllByRole('option')[0]!.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })
})

describe('ListaDeRecentes', () => {
  it('título, "Limpar", opções com ×, o aviso "só neste aparelho"', async () => {
    const aoRemover = vi.fn()
    const aoLimpar = vi.fn()
    const aoEscolher = vi.fn()
    render(<ListaDeRecentes id="r" recentes={['íbex', 'CA00023', 'F100001']} ativo={0} aoEscolher={aoEscolher} aoRemover={aoRemover} aoLimpar={aoLimpar} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Buscas recentes' })).toBeInTheDocument()
    const lista = screen.getByRole('listbox', { name: 'Buscas recentes' })
    expect(within(lista).getAllByRole('option').map((o) => o.textContent)).toEqual(['íbex', 'CA00023', 'F100001'])
    expect(within(lista).getByText('F100001')).toHaveClass('codigo')
    expect(within(lista).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
    expect(within(lista).getByText('CA00023')).toHaveClass('codigo')
    expect(screen.getByText(/ficam só neste aparelho/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remover «CA00023» das buscas recentes' }))
    expect(aoRemover).toHaveBeenCalledWith('CA00023')
    await userEvent.click(screen.getByRole('button', { name: 'Limpar' }))
    expect(aoLimpar).toHaveBeenCalled()
    await userEvent.click(within(lista).getByRole('option', { name: 'íbex' }))
    expect(aoEscolher).toHaveBeenCalledWith({ tipo: 'recente', texto: 'íbex' })
    // o listbox só tem opções: os × ficam fora dele, numa coluna ao lado, e "Limpar" no cabeçalho
    expect(within(lista).queryAllByRole('button')).toHaveLength(0)
    expect(lista.querySelector('button')).toBeNull()
    expect(screen.getAllByRole('button', { name: /^Remover/ })).toHaveLength(3)
  })
})
