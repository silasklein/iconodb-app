import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { fonteDeTeste } from '../../tests/suporte/fonteDeTeste'
import { zerarSync } from '../../tests/suporte/syncSimulada'
import { armazemMemoria, type Armazem } from '../pacote/armazem'
import { sha256, sincronizarPacote } from '../pacote/baixar'
import { cacheMemoria } from '../pacote/imagens'
import type { Fonte, Manifesto } from '../pacote/manifesto'
import { ErroDePacoteAusente, ErroDePermissao } from '../dropbox/fonte'
import { MSG_SEM_PACOTE_NO_DROPBOX, MSG_SEM_PERMISSAO } from '../dropbox/mensagens'
import { esquecerNovidade, marcarAtualizando, procurarNaAbertura, usarProcura } from '../pacote/novidade'
import { MSG_LIVROS_ATUALIZANDO, MSG_LIVROS_INCOMPATIVEL, MSG_LIVROS_SEM_RESPOSTA, Sincronizacao } from './Sincronizacao'

vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)
vi.mock('../dropbox/auth', async (original) => ({ ...(await original<typeof import('../dropbox/auth')>()), sair: vi.fn(async () => undefined) }))

const MANIFESTO = 'nucleo/manifest.json'

function Onde() {
  const { pathname } = useLocation()
  return <p data-testid="onde">{pathname}</p>
}

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/sincronizacao']}>
      <Routes>
        <Route path="/sincronizacao" element={<Sincronizacao />} />
        <Route path="*" element={<Onde />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** O pacote sintético; com `outra`, o manifesto anuncia outro fold.json (um pacote mais novo); com `schema`, outro schema. */
async function fonte({ outra, schema }: { outra: boolean; schema?: number }): Promise<Fonte> {
  const base = fonteDeTeste()
  const fold = Uint8Array.from(new TextEncoder().encode('{"novo": 2}'))
  const sha = await sha256(fold)
  return {
    listar: (p) => base.listar(p),
    async baixar(c) {
      if (c !== MANIFESTO || (!outra && schema === undefined)) return base.baixar(c)
      const m = JSON.parse(new TextDecoder().decode(await base.baixar(c))) as Manifesto
      if (outra) m.arquivos['nucleo/fold.json'] = { sha256: sha, bytes: fold.byteLength }
      if (schema !== undefined) m.schema = schema
      return Uint8Array.from(new TextEncoder().encode(JSON.stringify(m))).buffer as ArrayBuffer
    },
  }
}

const secao = () => screen.getByRole('region', { name: 'Livros' })

let armazem: Armazem

describe('Sincronização: «Procurar livros novos»', () => {
  beforeEach(async () => {
    zerarSync()
    esquecerNovidade()
    armazem = armazemMemoria()
    await sincronizarPacote(fonteDeTeste(), () => undefined, { armazem, cache: cacheMemoria() })
  })
  afterEach(() => usarProcura(null))

  it('o mesmo pacote: «Os livros estão em dia.»', async () => {
    usarProcura({ obterFonte: async () => fonte({ outra: false }), armazem })
    abrir()
    expect(within(secao()).queryByText('Os livros estão em dia.')).toBeNull()
    await userEvent.click(within(secao()).getByRole('button', { name: 'Procurar livros novos' }))
    expect(await within(secao()).findByText('Os livros estão em dia.')).toBeInTheDocument()
    expect(within(secao()).queryByRole('button', { name: 'Atualizar os livros' })).toBeNull()
  })

  it('um pacote novo: o aviso e «Atualizar os livros», que leva a /preparando', async () => {
    usarProcura({ obterFonte: async () => fonte({ outra: true }), armazem })
    abrir()
    await userEvent.click(within(secao()).getByRole('button', { name: 'Procurar livros novos' }))
    expect(await within(secao()).findByText('Há uma versão nova dos livros no Dropbox: TESTE I, TESTEG, TESTEGEN.')).toBeInTheDocument()
    await userEvent.click(within(secao()).getByRole('button', { name: 'Atualizar os livros' }))
    expect(screen.getByTestId('onde')).toHaveTextContent('/preparando')
  })

  it('enquanto procura: «Procurando…» e o botão ocupado (um clique a mais não procura de novo)', async () => {
    let soltar!: (f: Fonte) => void
    const obterFonte = vi.fn(() => new Promise<Fonte>((ok) => (soltar = ok)))
    usarProcura({ obterFonte, armazem })
    abrir()
    const botao = within(secao()).getByRole('button', { name: 'Procurar livros novos' })
    await userEvent.click(botao)
    expect(within(secao()).getByText('Procurando…')).toHaveAttribute('aria-live', 'polite')
    expect(botao).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(botao)
    expect(obterFonte).toHaveBeenCalledTimes(1)
    await act(async () => soltar(await fonte({ outra: false })))
    expect(await within(secao()).findByText('Os livros estão em dia.')).toBeInTheDocument()
    expect(botao).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('sem internet ou sem login: diz que não deu para procurar, sem erro vermelho nem alerta', async () => {
    usarProcura({ obterFonte: async () => Promise.reject(new TypeError('Failed to fetch')), armazem })
    abrir()
    await userEvent.click(within(secao()).getByRole('button', { name: 'Procurar livros novos' }))
    expect(await within(secao()).findByText(/Não foi possível procurar agora/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('o que a procura da abertura achou já aparece, sem clicar', async () => {
    usarProcura({ obterFonte: async () => fonte({ outra: true }), armazem })
    await procurarNaAbertura()
    abrir()
    expect(within(secao()).getByRole('button', { name: 'Atualizar os livros' })).toBeInTheDocument()
    await waitFor(() => expect(within(secao()).getByText(/Há uma versão nova dos livros/)).toBeInTheDocument())
  })

  it('um pacote que não abre nesta versão (outro schema): diz isso depois do clique, sem faixa; antes do clique, nada', async () => {
    usarProcura({ obterFonte: async () => fonte({ outra: true, schema: 99 }), armazem })
    await procurarNaAbertura()
    abrir()
    expect(within(secao()).queryByText(MSG_LIVROS_INCOMPATIVEL)).toBeNull()
    await userEvent.click(within(secao()).getByRole('button', { name: 'Procurar livros novos' }))
    expect(await within(secao()).findByText(MSG_LIVROS_INCOMPATIVEL)).toBeInTheDocument()
    expect(MSG_LIVROS_INCOMPATIVEL).not.toContain('!')
    expect(within(secao()).queryByText('Os livros estão em dia.')).toBeNull()
    expect(within(secao()).queryByRole('button', { name: 'Atualizar os livros' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('o manifesto não está na pasta do app: o texto do Preparando (onde pôr as pastas), não «sem conexão»', async () => {
    usarProcura({ obterFonte: async () => ({ listar: async () => [], baixar: async (c: string) => Promise.reject(new ErroDePacoteAusente(c)) }), armazem })
    abrir()
    await userEvent.click(within(secao()).getByRole('button', { name: 'Procurar livros novos' }))
    expect(await within(secao()).findByText(MSG_SEM_PACOTE_NO_DROPBOX)).toBeInTheDocument()
    expect(within(secao()).queryByText(MSG_LIVROS_SEM_RESPOSTA)).toBeNull()
  })

  it('falta uma permissão: o texto das permissões e «Entrar de novo» (sai e vai à entrada)', async () => {
    usarProcura({ obterFonte: async () => ({ listar: async () => [], baixar: async () => Promise.reject(new ErroDePermissao('files.content.read')) }), armazem })
    abrir()
    await userEvent.click(within(secao()).getByRole('button', { name: 'Procurar livros novos' }))
    expect(await within(secao()).findByText(MSG_SEM_PERMISSAO)).toBeInTheDocument()
    await userEvent.click(within(secao()).getByRole('button', { name: 'Entrar de novo' }))
    await waitFor(() => expect(screen.getByTestId('onde')).toHaveTextContent('/entrar'))
  })

  it('com um pacote novo já visto, procurar sem internet não tira a faixa: ela fica, e a linha diz que não deu', async () => {
    usarProcura({ obterFonte: async () => fonte({ outra: true }), armazem })
    await procurarNaAbertura()
    abrir()
    usarProcura({ obterFonte: async () => Promise.reject(new TypeError('Failed to fetch')), armazem })
    await userEvent.click(within(secao()).getByRole('button', { name: 'Procurar livros novos' }))
    expect(await within(secao()).findByText(MSG_LIVROS_SEM_RESPOSTA)).toBeInTheDocument()
    expect(within(secao()).getByRole('button', { name: 'Atualizar os livros' })).toBeInTheDocument()
  })

  it('enquanto procura de novo, a faixa já vista fica na tela (nada pula)', async () => {
    usarProcura({ obterFonte: async () => fonte({ outra: true }), armazem })
    await procurarNaAbertura()
    abrir()
    let soltar!: (f: Fonte) => void
    usarProcura({ obterFonte: () => new Promise<Fonte>((ok) => (soltar = ok)), armazem })
    await userEvent.click(within(secao()).getByRole('button', { name: 'Procurar livros novos' }))
    expect(within(secao()).getByText('Procurando…')).toBeInTheDocument()
    expect(within(secao()).getByRole('button', { name: 'Atualizar os livros' })).toBeInTheDocument()
    await act(async () => soltar(await fonte({ outra: true })))
    expect(within(secao()).queryByText('Procurando…')).toBeNull()
    expect(within(secao()).getByRole('button', { name: 'Atualizar os livros' })).toBeInTheDocument()
  })

  it('enquanto os livros são baixados (/preparando), a faixa some, a linha diz isso e procurar fica ocupado', async () => {
    usarProcura({ obterFonte: async () => fonte({ outra: true }), armazem })
    await procurarNaAbertura()
    abrir()
    expect(within(secao()).getByRole('button', { name: 'Atualizar os livros' })).toBeInTheDocument()
    act(() => marcarAtualizando(true))
    expect(within(secao()).queryByRole('button', { name: 'Atualizar os livros' })).toBeNull()
    expect(within(secao()).getByText(MSG_LIVROS_ATUALIZANDO)).toBeInTheDocument()
    const botao = within(secao()).getByRole('button', { name: 'Procurar livros novos' })
    expect(botao).toHaveAttribute('aria-disabled', 'true')
    act(() => marcarAtualizando(false))
    expect(within(secao()).getByRole('button', { name: 'Atualizar os livros' })).toBeInTheDocument()
    expect(botao).not.toHaveAttribute('aria-disabled')
  })

  it('a procura da abertura sem resposta (sem internet) não mostra nada antes de clicar', async () => {
    usarProcura({ obterFonte: async () => null, armazem })
    await procurarNaAbertura()
    abrir()
    expect(within(secao()).queryByText(/Não foi possível/)).toBeNull()
    expect(secao().querySelector('[aria-live="polite"]')).toHaveTextContent(/^$/)
    expect(within(secao()).queryByRole('button', { name: 'Atualizar os livros' })).toBeNull()
  })
})
