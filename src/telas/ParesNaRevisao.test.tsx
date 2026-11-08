/**
 * M-1 e M-4 da revisão final (Parte 2C, bloco 2): um par da Revisão com um sítio seu que o processamento publicou com um id de
 * livro (o pacote sintético: `SI-teste123-1` → TESTE-3, «criado»). O sítio continua seu: «De onde: seu», o do livro vem primeiro
 * (o sugerido para ficar), e o motivo «variante» não diz «O livro dá…». O par (TESTE-3 ~ TESTE-7, `variante`) entra só no
 * banco deste arquivo, para não mudar as contas de src/telas/Revisao.test.tsx.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { pacoteDeSitios } from '../sitios/pacote'
import { estadoAtual, registrar } from '../usuario/estado'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Revisao } from './Revisao'

vi.mock('../pacote/local', async (original) => {
  const real = await original<typeof import('../pacote/local')>()
  return { ...real, lerEstado: vi.fn(async (armazem?: Parameters<typeof real.lerEstado>[0]) => (await real.lerEstado(armazem).catch(() => null)) ?? ({ schema: 5 } as never)) }
})
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

const GRUPO = 'sitios-que-podem-ser-o-mesmo'
const PAR = 'par_TESTE-3_TESTE-7'

function Onde() {
  const { pathname, search } = useLocation()
  return <p data-testid="onde">{pathname + search}</p>
}
const abrir = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Revisao />
      <Onde />
    </MemoryRouter>,
  )
const linhasDoLado = (lado: HTMLElement) => [...lado.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling!.textContent])

beforeAll(async () => {
  usarMotor(await bancoDeTeste({ escrita: true }))
  await executar("INSERT INTO main.sitio_par_sugerido (a, b, motivo) VALUES ('TESTE-3', 'TESTE-7', 'variante')")
  // um par «variante» de dois do livro (o processamento: `variante_com_numero_proprio`), para o caso da re-revisão
  await executar("INSERT INTO main.sitio_par_sugerido (a, b, motivo) VALUES ('TESTE-5', 'TESTE-8', 'variante')")
})
afterAll(() => usarMotor(null))
beforeEach(() => instalarMatchMedia(375))
afterEach(async () => {
  for (const id of ['TESTE-3', 'TESTE-8']) if (estadoAtual().registro('sitio', id)?.campos.mescladoEm != null) await registrar('sitio', id, 'alterar', { mescladoEm: null })
})

describe('M-1/M-4: um par com um sítio seu publicado (TESTE-3)', () => {
  it('o pacote sabe que TESTE-3 foi criado de um sítio seu (e TESTE-2, a que um sítio seu só leva, não)', async () => {
    expect([...(await pacoteDeSitios()).criados]).toEqual(['TESTE-3'])
  })

  it('aberto: o do livro primeiro, «De onde: seu» no publicado, e o motivo sem «O livro dá…» (texto proposto)', async () => {
    abrir(`/revisao?abrir=${GRUPO}`)
    const lista = await screen.findByRole('list', { name: 'Pares de Sítios que podem ser o mesmo' })
    const par = within(lista)
      .getAllByRole('listitem')
      .find((li) => li.dataset.chave === PAR)!
    const cabeca = within(par).getByRole('button')
    await waitFor(() => expect(cabeca).toHaveTextContent(/^Estes dois podem ser o mesmo lugarVariante no livroMaḥtiṣ Teste e Tell Usuário/))
    await userEvent.click(cabeca)
    const nomeSeu = within(par).getAllByRole('group')[1]!.getAttribute('aria-label')!
    expect(nomeSeu).toMatch(/^Tell Usuário/)
    expect(cabeca).toHaveTextContent(`Estes dois podem ser o mesmo lugarMaḥtiṣ Teste, do livro, é uma grafia que você deu a ${nomeSeu}`)
    expect(cabeca).not.toHaveTextContent('O livro dá')
    const lados = within(par).getAllByRole('group')
    expect(lados.map((l) => l.getAttribute('aria-label'))).toEqual(['Maḥtiṣ Teste', nomeSeu])
    expect(linhasDoLado(lados[0]!)[0]).toEqual(['De onde', 'dos livrosTESTE-7'])
    expect(linhasDoLado(lados[1]!)[0]).toEqual(['De onde', 'seuTESTE-3'])
    // «Mesclar…» leva à página do do livro, com o seu como o outro
    await userEvent.click(within(par).getByRole('link', { name: 'Mesclar…' }))
    expect(screen.getByTestId('onde')).toHaveTextContent(`/sitio/TESTE-7?mesclar=TESTE-3`)
  })

  it('mesclado: «Resolvidos por você» põe o do livro primeiro', async () => {
    await registrar('sitio', 'TESTE-3', 'alterar', { mescladoEm: 'TESTE-7' })
    abrir(`/revisao?abrir=${GRUPO}`)
    const resolvidos = await screen.findByRole('list', { name: 'Resolvidos de Sítios que podem ser o mesmo' })
    const linha = [...resolvidos.querySelectorAll('li')].find((li) => li.dataset.chave === PAR)!
    expect(linha.querySelector('.revisao-par-resolvido-texto')).toHaveTextContent(/^Maḥtiṣ Teste e Tell Usuário.*mesclados$/)
  })

  it('re-revisão: um par de dois do livro cujo lado foi mesclado num sítio seu (SI-…) não diz «você deu»', async () => {
    await registrar('sitio', 'SI-paresrv1-1', 'criar', { nome: 'Khirbet Minha Teste' })
    await registrar('sitio', 'TESTE-8', 'alterar', { mescladoEm: 'SI-paresrv1-1' })
    abrir(`/revisao?abrir=${GRUPO},par_TESTE-5_TESTE-8`)
    const lista = await screen.findByRole('list', { name: 'Pares de Sítios que podem ser o mesmo' })
    const par = within(lista)
      .getAllByRole('listitem')
      .find((li) => li.dataset.chave === 'par_TESTE-5_TESTE-8')!
    const cabeca = par.querySelector<HTMLElement>('.revisao-par-cabeca')! // aberto pelo endereço
    // os lados são os destinos: o do livro (TESTE-5) e o seu (SI-paresrv1-1); a grafia continua sendo do livro
    await waitFor(() => expect(within(par).getAllByRole('group').map((l) => l.getAttribute('aria-label'))).toEqual(['Área Probe Teste', 'Khirbet Minha Teste']))
    expect(cabeca).toHaveTextContent('Estes dois podem ser o mesmo lugarO livro dá Khirbet Minha Teste como variante de Área Probe Teste')
    expect(cabeca).not.toHaveTextContent('você deu')
  })
})
