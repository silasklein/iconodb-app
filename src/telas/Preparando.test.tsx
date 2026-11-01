import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { armazemMemoria, type Armazem } from '../pacote/armazem'
import { sincronizarPacote, type AoProgredir } from '../pacote/baixar'
import { cacheMemoria } from '../pacote/imagens'
import { gravarJson } from '../pacote/local'
import {
  ErroDeIntegridade,
  ErroDeLogin,
  ErroDeRede,
  ErroDeSchema,
  ErroDeSincronizacaoEmAndamento,
  MSG_SCHEMA,
  type Fonte,
} from '../pacote/manifesto'
import { reabrirBanco } from '../banco/cliente'
import { Preparando } from './Preparando'

vi.mock('../banco/cliente', async (original) => ({
  ...(await original<typeof import('../banco/cliente')>()),
  reabrirBanco: vi.fn(),
}))

vi.mock('../pacote/baixar', async (original) => ({
  ...(await original<typeof import('../pacote/baixar')>()),
  sincronizarPacote: vi.fn(),
}))

const FONTE: Fonte = { listar: async () => [], baixar: async () => new ArrayBuffer(0) }
const MSG_SEM_CONEXAO = 'Sem conexão: o app abre com o que já está no aparelho'

let armazem: Armazem

/** Uma sincronização que o teste conduz: chama `progredir` e depois `terminar` ou `falhar`. */
function sincronizacaoManual() {
  let progredir!: AoProgredir
  let terminar!: (r: 'atualizado' | 'igual') => void
  let falhar!: (e: unknown) => void
  vi.mocked(sincronizarPacote).mockImplementation((_f, aoProgredir) => {
    progredir = aoProgredir
    return new Promise((ok, erro) => {
      terminar = ok
      falhar = erro
    })
  })
  return {
    progredir: (...a: Parameters<AoProgredir>) => act(() => progredir(...a)),
    terminar: (r: 'atualizado' | 'igual' = 'atualizado') => act(async () => terminar(r)),
    falhar: (e: unknown) => act(async () => falhar(e)),
  }
}

function montar(obterFonte: () => Promise<Fonte | null> = async () => FONTE, estrito = false) {
  const arvore = (
    <MemoryRouter initialEntries={['/preparando']}>
      <Routes>
        <Route path="/preparando" element={<Preparando armazem={armazem} cache={cacheMemoria()} obterFonte={obterFonte} />} />
        <Route path="/" element={<p>Início do app</p>} />
        <Route path="/entrar" element={<p>Tela de entrada</p>} />
      </Routes>
    </MemoryRouter>
  )
  return render(estrito ? <StrictMode>{arvore}</StrictMode> : arvore)
}

async function comEstado() {
  await gravarJson(armazem, 'estado.json', { schema: 5, gerado_em: 'x', publicacoes: [], arquivos: {} })
}

beforeEach(() => {
  armazem = armazemMemoria()
})

afterEach(() => {
  vi.resetAllMocks()
})

describe('Preparando', () => {
  it('mostra o título, as etapas aguardando, a preferência, o aviso e o botão', async () => {
    sincronizacaoManual()
    montar()
    expect(screen.getByRole('heading', { level: 1, name: 'Preparando este aparelho' })).toBeInTheDocument()
    const itens = screen.getAllByRole('listitem')
    expect(itens).toHaveLength(2)
    expect(itens[0]).toHaveTextContent('Banco de dados')
    expect(itens[0]).toHaveTextContent('aguardando')
    expect(itens[1]).toHaveTextContent('Imagens de tela')
    expect(screen.getByText('Mantenha o app aberto até terminar')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Imagens em alta resolução offline' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Abrir assim que terminar' })).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => expect(sincronizarPacote).toHaveBeenCalledTimes(1))
  })

  it('mostra o andamento de cada etapa em MB, com a barra', async () => {
    const s = sincronizacaoManual()
    montar()
    await waitFor(() => expect(sincronizarPacote).toHaveBeenCalled())
    await s.progredir('Banco de dados', 38_000_000, 90_000_000)
    const banco = screen.getAllByRole('listitem')[0]!
    expect(banco).toHaveTextContent('38 de 90 MB')
    expect(screen.getByRole('progressbar', { name: 'Banco de dados' })).toHaveAttribute('aria-valuenow', '42')
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('aguardando')

    await s.progredir('Banco de dados', 90_000_000, 90_000_000)
    await s.progredir('Imagens de tela', 0, 2_500_000)
    expect(banco).toHaveTextContent('pronto')
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('0 de 2,5 MB')
    expect(screen.queryByText('Mantenha o app aberto até terminar')).toBeInTheDocument()
  })

  it('ao terminar sem ter pedido, mostra "Abrir o app" e não sai da tela', async () => {
    const s = sincronizacaoManual()
    montar()
    await waitFor(() => expect(sincronizarPacote).toHaveBeenCalled())
    await s.progredir('Banco de dados', 10, 10)
    await s.progredir('Imagens de tela', 5, 5)
    await s.terminar()
    expect(screen.queryByText('Mantenha o app aberto até terminar')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir assim que terminar' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Abrir o app' }))
    expect(screen.getByText('Início do app')).toBeInTheDocument()
  })

  it('pacote atualizado: o banco é reaberto ANTES de "pronto" (as telas veem o pacote novo sem recarregar)', async () => {
    let reabriu!: () => void
    vi.mocked(reabrirBanco).mockImplementation(() => new Promise((ok) => (reabriu = () => ok({ estado: 'sem-pacote' }))))
    const s = sincronizacaoManual()
    montar()
    await waitFor(() => expect(sincronizarPacote).toHaveBeenCalled())
    await s.terminar('atualizado')
    expect(reabrirBanco).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Abrir o app' })).not.toBeInTheDocument()
    await act(async () => reabriu())
    expect(await screen.findByRole('button', { name: 'Abrir o app' })).toBeInTheDocument()
  })

  it('pacote igual: o banco não é reaberto; uma reabertura que falha não impede abrir o app', async () => {
    const s = sincronizacaoManual()
    montar()
    await waitFor(() => expect(sincronizarPacote).toHaveBeenCalled())
    await s.terminar('igual')
    expect(reabrirBanco).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Abrir o app' })).toBeInTheDocument()

    vi.mocked(reabrirBanco).mockRejectedValue(new Error('worker morto'))
    const s2 = sincronizacaoManual()
    montar()
    await waitFor(() => expect(sincronizarPacote).toHaveBeenCalledTimes(2))
    await s2.terminar('atualizado')
    expect(reabrirBanco).toHaveBeenCalledTimes(1)
    expect(await screen.findAllByRole('button', { name: 'Abrir o app' })).toHaveLength(2)
  })

  it('"Abrir assim que terminar" leva ao Início quando a sincronização termina', async () => {
    const s = sincronizacaoManual()
    montar()
    await waitFor(() => expect(sincronizarPacote).toHaveBeenCalled())
    const botao = screen.getByRole('button', { name: 'Abrir assim que terminar' })
    await userEvent.click(botao)
    expect(botao).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Início do app')).not.toBeInTheDocument()
    await s.terminar()
    expect(await screen.findByText('Início do app')).toBeInTheDocument()
  })

  it('"Abrir assim que terminar" pode ser desfeito', async () => {
    const s = sincronizacaoManual()
    montar()
    await waitFor(() => expect(sincronizarPacote).toHaveBeenCalled())
    const botao = screen.getByRole('button', { name: 'Abrir assim que terminar' })
    await userEvent.click(botao)
    await userEvent.click(botao)
    expect(botao).toHaveAttribute('aria-pressed', 'false')
    await s.terminar()
    expect(screen.queryByText('Início do app')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir o app' })).toBeInTheDocument()
  })

  it('sem login, vai para a entrada sem baixar nada', async () => {
    sincronizacaoManual()
    montar(async () => null)
    expect(await screen.findByText('Tela de entrada')).toBeInTheDocument()
    expect(sincronizarPacote).not.toHaveBeenCalled()
  })

  it('o login que expira no meio do download leva à entrada', async () => {
    const s = sincronizacaoManual()
    montar()
    await waitFor(() => expect(sincronizarPacote).toHaveBeenCalled())
    await s.falhar(new ErroDeLogin())
    expect(await screen.findByText('Tela de entrada')).toBeInTheDocument()
  })

  it('sem internet e sem pacote no aparelho: avisa e deixa tentar de novo', async () => {
    sincronizacaoManual()
    montar(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão: o primeiro download precisa de internet')
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir o app' })).not.toBeInTheDocument()
    expect(sincronizarPacote).not.toHaveBeenCalled()
  })

  it('sem internet com pacote no aparelho: abre com o que já está lá', async () => {
    await comEstado()
    sincronizacaoManual()
    montar(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(MSG_SEM_CONEXAO)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir o app' }))
    expect(screen.getByText('Início do app')).toBeInTheDocument()
  })

  it('a rede que cai no meio do download mantém o andamento e oferece tentar de novo', async () => {
    const s = sincronizacaoManual()
    montar()
    await waitFor(() => expect(sincronizarPacote).toHaveBeenCalled())
    await s.progredir('Banco de dados', 38_000_000, 90_000_000)
    await s.falhar(new ErroDeRede())
    expect(screen.getByRole('alert')).toHaveTextContent(/^Sem conexão/)
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('38 de 90 MB')

    const nova = sincronizacaoManual()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(sincronizarPacote).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await nova.terminar()
  })

  it('schema diferente de 5: mostra a mensagem combinada, com app-export em código', async () => {
    const s = sincronizacaoManual()
    montar()
    await waitFor(() => expect(sincronizarPacote).toHaveBeenCalled())
    await s.falhar(new ErroDeSchema())
    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent(MSG_SCHEMA.replaceAll('`', ''))
    expect(alerta.querySelector('code')).toHaveTextContent('app-export')
  })

  it('arquivo que não confere: avisa que o anterior foi mantido', async () => {
    const s = sincronizacaoManual()
    montar()
    await waitFor(() => expect(sincronizarPacote).toHaveBeenCalled())
    await s.falhar(new ErroDeIntegridade('nucleo/comum.sqlite'))
    expect(screen.getByRole('alert')).toHaveTextContent('não passou na conferência')
    expect(screen.getByRole('alert')).toHaveTextContent('o que já estava no aparelho foi mantido')
  })

  it('outra janela sincronizando: avisa e deixa tentar de novo', async () => {
    const s = sincronizacaoManual()
    montar()
    await waitFor(() => expect(sincronizarPacote).toHaveBeenCalled())
    await s.falhar(new ErroDeSincronizacaoEmAndamento())
    expect(screen.getByRole('alert')).toHaveTextContent('Já há uma sincronização em andamento em outra janela do app')
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('outro erro: mensagem geral e tentar de novo', async () => {
    const s = sincronizacaoManual()
    montar()
    await waitFor(() => expect(sincronizarPacote).toHaveBeenCalled())
    await s.falhar(new Error('quota'))
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível baixar o pacote; tente de novo')
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('guarda a preferência de alta resolução e a lê de volta', async () => {
    sincronizacaoManual()
    const { unmount } = montar()
    const caixa = await screen.findByRole('checkbox', { name: 'Imagens em alta resolução offline' })
    await userEvent.click(caixa)
    expect(caixa).toBeChecked()
    await waitFor(async () => expect(await armazem.existe('preferencias.json')).toBe(true))
    unmount()

    sincronizacaoManual()
    montar()
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Imagens em alta resolução offline' })).toBeChecked())
  })

  it('no StrictMode (efeitos em dobro), começa uma só sincronização', async () => {
    sincronizacaoManual()
    montar(async () => FONTE, true)
    await waitFor(() => expect(sincronizarPacote).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(sincronizarPacote).toHaveBeenCalledTimes(1)
  })
})
