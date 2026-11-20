/**
 * Tarefa 5 do plano «O IPIAO lido no formato do §» (revisão): o «‹ origem» da decisão 85 na página de leitura, vindo do Objeto
 * («Ler no livro» da linha do catálogo: «‹ TESTE I: 3») e da Busca (a página de introdução achada: «‹ Busca»). No computador,
 * o link «‹ …» da navegação «Origem»; no celular, o ícone de voltar do topo diz a origem. Pacote sintético (repositório público).
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { buscar, type ParagrafoAchado, type ResultadoDaBusca } from '../busca/consulta'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Busca } from '../telas/Busca'
import { Item } from '../telas/Item'
import { esquecerAbaDaLeitura, Leitura, ROTA_DA_LEITURA_DA_ENTRADA, ROTA_DA_LEITURA_DO_TRECHO } from '../telas/Leitura'
import { esquecerPreferenciasDaMemoria } from './preferencias'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../busca/consulta', async (original) => ({ ...(await original<typeof import('../busca/consulta')>()), buscar: vi.fn() }))

function abrir(caminho: string) {
  const [pathname, search] = caminho.split('?')
  return render(
    <MemoryRouter initialEntries={[{ pathname: pathname!, search: search ? `?${search}` : '' }]}>
      <Routes>
        <Route path="/item/:numero" element={<Item />} />
        <Route path="/busca" element={<Busca />} />
        <Route path={ROTA_DA_LEITURA_DO_TRECHO} element={<Leitura />} />
        <Route path={ROTA_DA_LEITURA_DA_ENTRADA} element={<Leitura />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** A origem que a página de leitura mostra: o «‹ …» no computador, o nome do ícone de voltar no celular. */
async function origemNaLeitura(computador: boolean, rotulo: string) {
  if (computador) {
    const nav = await screen.findByRole('navigation', { name: 'Origem' })
    return within(nav).getByRole('link', { name: rotulo })
  }
  return screen.findByRole('link', { name: `Voltar (${rotulo})` })
}

const PAGINA: ParagrafoAchado = {
  tipo: 'pagina',
  rotuloDoTipo: 'grupo',
  sigla: 'TESTE',
  numero: 19,
  rotulo: 'TESTE I, p. 19',
  caminho: '/ler/TESTE/trecho/PA-TESTE-I.S.19-ovw-1',
  trechos: ['PA-TESTE-I.S.19-ovw-1'],
  publicacoes: ['TESTE'],
  trecho: { id: 'PA-TESTE-I.S.19-ovw-1', nota: null, texto: 'Os selos de teste.', lingua: 'pt-BR', recorte: [{ texto: 'Os selos de teste.', forte: false }] },
  trilha: [],
}
const SO_A_PAGINA: ResultadoDaBusca = {
  vazia: false,
  curta: false,
  verbetesRelacionados: [],
  objetos: [],
  numeros: [],
  total: 0,
  totalSemFiltros: 0,
  contagens: { tudo: 0, texto: 1, termo: 0, local: 0, bibliografia: 0, colecao: 0 },
  facetas: [],
  usuario: [],
  contagensDoUsuario: { tudo: 0, texto: 0, termo: 0, local: 0, bibliografia: 0, colecao: 0 },
  paragrafos: [PAGINA],
  paginasNoTexto: 1,
}

describe.each([
  ['celular', 375],
  ['computador', 1280],
] as const)('a leitura com o «‹ origem» (decisão 85; %s)', (aparelho, largura) => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterAll(() => usarMotor(null))
  beforeEach(() => instalarMatchMedia(largura))
  afterEach(() => {
    instalarMatchMedia(375)
    localStorage.clear()
    esquecerPreferenciasDaMemoria()
    esquecerAbaDaLeitura()
  })

  it('do Objeto: «Ler no livro» abre a entrada, e a leitura diz «‹ TESTE I: 3»', async () => {
    abrir('/item/CA00003')
    const noLivro = await screen.findByRole('region', { name: 'No livro' })
    await userEvent.click(await within(noLivro).findByRole('link', { name: 'Ler no livro' }))
    expect(await screen.findByRole('heading', { level: 1, name: /TESTE I: 3/ })).toBeInTheDocument()
    const volta = await origemNaLeitura(aparelho === 'computador', 'TESTE I: 3')
    expect(volta).toHaveAttribute('href', aparelho === 'computador' ? '/item/CA00003' : '#/item/CA00003')
  })

  it('da Busca: a página de introdução achada abre a leitura, e ela diz «‹ Busca»', async () => {
    vi.mocked(buscar).mockResolvedValue(SO_A_PAGINA)
    abrir('/busca?q=selos&escopo=texto')
    const lista = await screen.findByRole('region', { name: 'Trechos achados' })
    await userEvent.click(within(lista).getByRole('link'))
    expect(await screen.findByRole('heading', { level: 1, name: /TESTE I, p\. 19/ })).toBeInTheDocument()
    const volta = await origemNaLeitura(aparelho === 'computador', 'Busca')
    expect(volta).toHaveAttribute('href', aparelho === 'computador' ? '/busca?q=selos&escopo=texto' : '#/busca?q=selos&escopo=texto')
  })
})
