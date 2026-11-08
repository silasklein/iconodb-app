import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { semSugestoes, type Sugestao } from '../busca/sugestoes'
import { Busca } from '../telas/Busca'
import { BarraSuperior } from './BarraSuperior'

/**
 * Escolher uma sugestão logo depois de digitar (Parte 2C, bloco 2, Tarefa 16: achado na e2e de mesclar sítios). A digitação na
 * Busca arma uma espera de 250 ms que grava `?q=`; a navegação para a sugestão vai numa transição (o React Router usa
 * `startTransition`), e a tela nova pode demorar a trocar. Antes, se a espera vencia nesse meio tempo, ela gravava `?q=` sobre a
 * Busca de antes e a navegação era trocada por ela: a pessoa voltava à Busca. Escolher a sugestão agora cancela a espera.
 */
vi.mock('../busca/useSugestoes', () => ({
  ESPERA_DAS_SUGESTOES_MS: 0,
  useSugestoes: (digitado: string) => ({ resultado: digitado.trim().length >= 2 ? sugestoes() : null, para: digitado }),
}))
vi.mock('../banco/consultas', async (original) => ({
  ...(await original<typeof import('../banco/consultas')>()),
  linhasDaFila: vi.fn(async () => []),
  verbetesAReverNoPacote: vi.fn(async () => []),
  elementosSemRegiaoNoPacote: vi.fn(async () => []),
  traducoesNaoRevisadasNoPacote: vi.fn(async () => []),
  lugaresDosCasos: vi.fn(async () => new Map()),
  sitios: vi.fn(async () => []),
  redirecionamentos: vi.fn(async () => []),
  partesDoPacote: vi.fn(async () => []),
  grafiasDoPacote: vi.fn(async () => []),
  paresSugeridos: vi.fn(async () => []),
}))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

function sugestoes() {
  const sitio: Sugestao = {
    chave: 'sitios:TESTE-1',
    categoria: 'sitios',
    alvoTipo: 'sitio',
    ref: 'TESTE-1',
    rotulo: 'Maḥteṣ Teste',
    trechos: [{ texto: 'Maḥteṣ Teste', forte: false }],
    complemento: null,
    complementoTrechos: [],
    codigo: null,
    codigoTrechos: [],
    id: null,
    miniatura: null,
    skc: false,
    destino: '/sitio/TESTE-1',
    recente: 'Maḥteṣ Teste',
  }
  return { ...semSugestoes(), sitios: [sitio] }
}

function Onde() {
  const { pathname, search } = useLocation()
  return <p data-testid="onde">{pathname + search}</p>
}
const onde = () => screen.getByTestId('onde').textContent

/**
 * Digita (começa a espera de 250 ms), escolhe a sugestão e deixa a espera vencer logo depois do clique, antes de o React desenhar a
 * tela nova (o `act` só desenha no fim). Os relógios são falsos: a espera passa quando o teste manda, sem esperar de verdade.
 */
async function digitarEEscolher() {
  const usuario = userEvent.setup({ delay: null })
  await usuario.type(screen.getByRole('combobox', { name: 'Buscar' }), 'tell')
  const opcao = screen.getByRole('option', { name: /Maḥteṣ Teste/ })
  await act(async () => {
    opcao.click()
    vi.advanceTimersByTime(300) // com o defeito, a espera gravava aqui ?q=tell sobre a Busca, e a navegação era trocada
  })
}

describe('escolher uma sugestão enquanto a espera da digitação está pendente', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['setTimeout', 'clearTimeout'] })
    // O Testing Library só avança os relógios falsos se achar um `jest` global (no vitest não há).
    vi.stubGlobal('jest', { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('na barra do computador: vai ao destino e fica lá (a espera não grava ?q= sobre a Busca)', async () => {
    render(
      <MemoryRouter initialEntries={['/busca?q=']}>
        <BarraSuperior />
        <Routes>
          <Route path="/busca" element={<Onde />} />
          <Route path="/sitio/:id" element={<Onde />} />
        </Routes>
      </MemoryRouter>,
    )
    await digitarEEscolher()
    expect(onde()).toBe('/sitio/TESTE-1')
  })

  it('no campo da página da Busca (celular): o mesmo', async () => {
    render(
      <MemoryRouter initialEntries={['/busca?q=']}>
        <Routes>
          <Route
            path="/busca"
            element={
              <>
                <Busca />
                <Onde />
              </>
            }
          />
          <Route path="/sitio/:id" element={<Onde />} />
        </Routes>
      </MemoryRouter>,
    )
    await digitarEEscolher()
    expect(onde()).toBe('/sitio/TESTE-1')
  })
})
