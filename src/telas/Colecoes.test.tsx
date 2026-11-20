import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { obrasDeLeitura } from '../banco/leitura'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { esquecerPreferenciasDaMemoria, gravarPosicao } from '../leitura/preferencias'
import { Colecoes } from './Colecoes'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../banco/leitura', async (original) => {
  const m = await original<typeof import('../banco/leitura')>()
  return { ...m, obrasDeLeitura: vi.fn(m.obrasDeLeitura) }
})

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
    // pacote 11: o livro em parágrafos (TESTEG) é outra aba; a tradução (TESTEGEN) não tem grupos
    await waitFor(() => expect(within(abas).getAllByRole('link')).toHaveLength(3))
    const [skc, obra, livroG] = within(abas).getAllByRole('link')
    expect(livroG).toHaveTextContent('TESTEG')
    expect(skc).toHaveTextContent('SKC')
    expect(skc).toHaveAttribute('aria-current', 'page')
    expect(obra).toHaveTextContent('TESTE I')
    expect(obra).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('region', { name: 'Meus objetos' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Minhas coleções' })).toBeInTheDocument()
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
    expect(screen.queryByRole('region', { name: 'Minhas coleções' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'TESTE I' })).toHaveAttribute('aria-current', 'page')
  })

  it('a linha do grupo com subcoleções diz «3 objetos · 2 subcoleções» também no celular; a do grupo sem subcoleções fica só com o número', async () => {
    abrir('/colecoes?obra=TESTE-I')
    const g1 = await screen.findByRole('link', { name: /Animais de teste e figuras de prova/ })
    expect(g1.querySelector('.colecoes-grupo-n')).toHaveTextContent(/^3 objetos · 2 subcoleções$/)
    const g2 = screen.getByRole('link', { name: /Selos de prova e padrões denteados/ })
    expect(g2.querySelector('.colecoes-grupo-n')).toHaveTextContent(/^3$/)
    expect(g2).not.toHaveTextContent(/subcole/)
    // decisão 81: o número do livro antes do título só no grupo com subcoleções
    expect(g1.querySelector('.colecoes-grupo-nome')).toHaveTextContent(/^1\. Animais de teste e figuras de prova$/)
    expect(g2.querySelector('.colecoes-grupo-nome')).toHaveTextContent(/^Selos de prova e padrões denteados$/)
    // As subcoleções não viram linhas: só os dois grupos de cima.
    expect(screen.queryByRole('link', { name: /Animais de prova|Figuras de prova e sinais/ })).not.toBeInTheDocument()
  })

  it('no computador a linha diz «3 objetos · 2 subcoleções», e o total da aba não conta as subcoleções', async () => {
    instalarMatchMedia(1280)
    abrir('/colecoes?obra=TESTE-I')
    const g1 = await screen.findByRole('link', { name: /Animais de teste e figuras de prova/ })
    expect(g1.querySelector('.colecoes-grupo-n')).toHaveTextContent(/^3 objetos · 2 subcoleções$/)
    expect(g1.querySelector('.colecoes-grupo-nome')).toHaveTextContent(/^1\. Animais de teste e figuras de prova$/)
    expect(screen.getByText('2 grupos · 6 objetos')).toBeInTheDocument()
  })

  it('tocar na aba da obra troca o painel (e o endereço guarda a aba)', async () => {
    abrir()
    await userEvent.click(await screen.findByRole('link', { name: 'TESTE I' }))
    expect(await screen.findByRole('link', { name: /Animais de teste/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'SKC' }))
    expect(screen.getByRole('region', { name: 'Minhas coleções' })).toBeInTheDocument()
  })

  it('uma só região principal (<main>) com o título da tela', async () => {
    abrir()
    const principal = screen.getByRole('main')
    expect(within(principal).getByRole('heading', { level: 1, name: 'Coleções' })).toBeInTheDocument()
    expect(within(principal).getByRole('navigation', { name: 'Obras' })).toBeInTheDocument()
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
      expect(screen.queryByRole('region', { name: 'Meus objetos' })).not.toBeInTheDocument()
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
      expect(screen.getByRole('region', { name: 'Minhas coleções' })).toBeInTheDocument()
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

  describe.each([
    ['celular', 375],
    ['computador', 1280],
  ] as const)('Tarefa 5 da leitura: «Ler o livro» e «Continuar» na aba da obra de catálogo (%s)', (_, largura) => {
    beforeEach(() => instalarMatchMedia(largura))
    afterEach(() => {
      localStorage.clear()
      esquecerPreferenciasDaMemoria()
    })

    it('«Ler o livro» abre o 1º passo do volume; sem posição guardada, sem «Continuar»', async () => {
      abrir('/colecoes?obra=TESTE-I')
      expect(await screen.findByRole('link', { name: 'Ler o livro' })).toHaveAttribute('href', '/ler/TESTE/trecho/PA-TESTE-I.S.3-txt-1')
      expect(screen.queryByRole('link', { name: /^Continuar/ })).not.toBeInTheDocument()
    })

    it('com a posição guardada, «Continuar: TESTE I: 2» leva a ela', async () => {
      gravarPosicao('TESTE', '/ler/TESTE/entrada/2')
      abrir('/colecoes?obra=TESTE-I')
      expect(await screen.findByRole('link', { name: 'Continuar: TESTE I: 2' })).toHaveAttribute('href', '/ler/TESTE/entrada/2')
      expect(screen.getByRole('link', { name: 'Ler o livro' })).toHaveAttribute('href', '/ler/TESTE/trecho/PA-TESTE-I.S.3-txt-1')
    })

    it('a posição de um passo que o pacote não tem: sem «Continuar», e «Ler o livro» continua valendo', async () => {
      gravarPosicao('TESTE', '/ler/TESTE/entrada/99')
      abrir('/colecoes?obra=TESTE-I')
      // «Ler o livro» e «Continuar» vêm da mesma carga: com o primeiro na tela, a posição já foi conferida
      expect(await screen.findByRole('link', { name: 'Ler o livro' })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /^Continuar/ })).not.toBeInTheDocument()
      cleanup()
      gravarPosicao('TESTE', '/ler/TESTE/trecho/PA-NAO-HA')
      abrir('/colecoes?obra=TESTE-I')
      // «Ler o livro» e «Continuar» vêm da mesma carga: com o primeiro na tela, a posição já foi conferida
      expect(await screen.findByRole('link', { name: 'Ler o livro' })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /^Continuar/ })).not.toBeInTheDocument()
    })

    it('a aba do livro em parágrafos (TESTEG) não tem «Ler o livro»', async () => {
      gravarPosicao('TESTEG', '/ler/TESTEG/trecho/PA-TESTEG-§2-txt-1')
      vi.mocked(obrasDeLeitura).mockClear()
      abrir('/colecoes?obra=TESTEG')
      await screen.findByRole('link', { name: /Época de teste e imagens de prova/ })
      // a aba do livro em parágrafos nem pede as obras de leitura (não há o que esperar carregar)
      expect(vi.mocked(obrasDeLeitura)).not.toHaveBeenCalled()
      expect(screen.queryByRole('link', { name: 'Ler o livro' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /^Continuar/ })).not.toBeInTheDocument()
    })
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

describe('Coleções: uma subcoleção só (banco mudado no teste)', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    await executar("DELETE FROM pub_TESTE.author_group_item WHERE group_id = 'GR-TESTE-I-01-02'")
    await executar("DELETE FROM pub_TESTE.author_group_passage WHERE group_id = 'GR-TESTE-I-01-02'")
    await executar("DELETE FROM pub_TESTE.author_group WHERE id = 'GR-TESTE-I-01-02'")
  })
  afterAll(() => usarMotor(null))
  afterEach(() => instalarMatchMedia(375))

  it('o singular: «3 objetos · 1 subcoleção», e o total da aba não muda', async () => {
    abrir('/colecoes?obra=TESTE-I')
    const g1 = await screen.findByRole('link', { name: /Animais de teste e figuras de prova/ })
    expect(g1.querySelector('.colecoes-grupo-n')).toHaveTextContent(/^3 objetos · 1 subcoleção$/)
    cleanup()
    instalarMatchMedia(1280)
    abrir('/colecoes?obra=TESTE-I')
    await screen.findByRole('link', { name: /Animais de teste e figuras de prova/ })
    expect(screen.getByText('2 grupos · 6 objetos')).toBeInTheDocument()
  })
})
