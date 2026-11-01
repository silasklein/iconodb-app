import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Colecoes } from './Colecoes'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

function abrir(url = '/colecoes') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Colecoes />
    </MemoryRouter>,
  )
}

describe('Coleções', () => {
  beforeAll(async () => usarMotor(await bancoDeTeste()))
  afterAll(() => usarMotor(null))
  afterEach(() => instalarMatchMedia(375))

  it('a aba SKC vem primeiro, com o estado vazio, e as obras do pacote viram abas', async () => {
    abrir()
    expect(screen.getByRole('heading', { level: 1, name: 'Coleções' })).toBeInTheDocument()
    const abas = screen.getByRole('navigation', { name: 'Obras' })
    await waitFor(() => expect(within(abas).getAllByRole('link')).toHaveLength(2))
    const [skc, obra] = within(abas).getAllByRole('link')
    expect(skc).toHaveTextContent('SKC')
    expect(skc).toHaveAttribute('aria-current', 'page')
    expect(obra).toHaveTextContent('TESTE I')
    expect(obra).not.toHaveAttribute('aria-current')
    expect(screen.getByText('Crie coleções na próxima versão')).toBeInTheDocument()
  })

  it('a aba da obra lista os grupos por período, na ordem do livro, com a contagem e o link', async () => {
    abrir('/colecoes?obra=TESTE-I')
    const g1 = await screen.findByRole('link', { name: /Animais de teste e figuras de prova/ })
    expect(g1).toHaveAttribute('href', '/grupo/GR-TESTE-I-01')
    expect(g1).toHaveTextContent('3')
    const g2 = screen.getByRole('link', { name: /Selos de prova e padrões denteados/ })
    expect(g2).toHaveAttribute('href', '/grupo/GR-TESTE-I-02')
    expect(g1.compareDocumentPosition(g2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Calcolítico (fase de teste)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Época de transição (fase de teste)' })).toBeInTheDocument()
    expect(screen.queryByText('Crie coleções na próxima versão')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'TESTE I' })).toHaveAttribute('aria-current', 'page')
  })

  it('tocar na aba da obra troca o painel (e o endereço guarda a aba)', async () => {
    abrir()
    await userEvent.click(await screen.findByRole('link', { name: 'TESTE I' }))
    expect(await screen.findByRole('link', { name: /Animais de teste/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'SKC' }))
    expect(screen.getByText('Crie coleções na próxima versão')).toBeInTheDocument()
  })

  it('uma obra que não está no pacote cai na aba SKC', async () => {
    abrir('/colecoes?obra=NAO-HA')
    await screen.findByRole('link', { name: 'TESTE I' })
    expect(screen.getByRole('link', { name: 'SKC' })).toHaveAttribute('aria-current', 'page')
  })

  it('enquanto carrega com ?obra=, não mostra o painel SKC nem marca aba nenhuma', async () => {
    usarMotor({ abrir: () => new Promise(() => {}), reabrir: async () => ({ estado: 'sem-pacote' }), executar: async () => [] })
    try {
      abrir('/colecoes?obra=TESTE-I')
      expect(screen.getByRole('link', { name: 'SKC' })).not.toHaveAttribute('aria-current')
      expect(screen.queryByText('Crie coleções na próxima versão')).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Minhas coleções' })).not.toBeInTheDocument()
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })

  it('enquanto carrega sem ?obra=, a aba SKC já vale', async () => {
    usarMotor({ abrir: () => new Promise(() => {}), reabrir: async () => ({ estado: 'sem-pacote' }), executar: async () => [] })
    try {
      abrir('/colecoes')
      expect(screen.getByRole('link', { name: 'SKC' })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByText('Crie coleções na próxima versão')).toBeInTheDocument()
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })

  it('no celular tem Voltar e a lupa; sem miniaturas dos grupos', async () => {
    abrir('/colecoes?obra=TESTE-I')
    await screen.findByRole('link', { name: /Animais de teste/ })
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '#/')
    expect(screen.getByRole('link', { name: 'Buscar' })).toHaveAttribute('href', '#/busca')
    expect(document.querySelector('.colecoes-miniatura')).toBeNull()
  })

  it('no computador não repete Voltar e a lupa, conta grupos e objetos e mostra a miniatura de cada grupo', async () => {
    instalarMatchMedia(1280)
    abrir('/colecoes?obra=TESTE-I')
    await screen.findByRole('link', { name: /Animais de teste/ })
    expect(screen.queryByRole('link', { name: 'Voltar' })).not.toBeInTheDocument()
    expect(screen.getByText('2 grupos · 6 objetos')).toBeInTheDocument()
    await waitFor(() => expect(document.querySelectorAll('.colecoes-miniatura img').length).toBeGreaterThan(0))
  })

  it('sem o banco no aparelho avisa e leva a preparar', async () => {
    usarMotor({ abrir: async () => ({ estado: 'sem-pacote' }), reabrir: async () => ({ estado: 'sem-pacote' }), executar: async () => [] })
    try {
      abrir('/colecoes?obra=TESTE-I')
      expect(await screen.findByRole('alert')).toHaveTextContent('O banco ainda não está no aparelho.')
      expect(screen.getByRole('link', { name: 'Preparar o banco' })).toHaveAttribute('href', '/preparando')
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })
})
