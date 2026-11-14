import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { fonteDeTeste } from '../../tests/suporte/fonteDeTeste'
import { usarMotor } from '../banco/cliente'
import { armazemMemoria, type Armazem } from '../pacote/armazem'
import { sha256, sincronizarPacote } from '../pacote/baixar'
import { cacheMemoria } from '../pacote/imagens'
import type { Fonte, Manifesto } from '../pacote/manifesto'
import { esquecerNovidade, marcarAtualizando, usarProcura } from '../pacote/novidade'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Inicio } from './Inicio'

vi.mock('../pacote/imagens', async (original) => ({
  ...(await original<typeof import('../pacote/imagens')>()),
  urlImagem: vi.fn(async (c: string) => `blob:${c}`),
}))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

const MANIFESTO = 'nucleo/manifest.json'

function Onde() {
  const { pathname, state } = useLocation()
  return <p data-testid="onde">{pathname + (state ? ` ${JSON.stringify(state)}` : '')}</p>
}

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="*" element={<Onde />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** A Fonte de teste que conta os manifestos baixados; com `volumes`, o pacote anuncia IPIAO I–IV e outro fold.json. */
async function fonte({ outra, schema }: { outra: boolean; schema?: number }): Promise<Fonte & { manifestos: number }> {
  const base = fonteDeTeste()
  const fold = Uint8Array.from(new TextEncoder().encode('{"novo": 1}'))
  const sha = await sha256(fold)
  const f = {
    manifestos: 0,
    listar: (p?: string) => base.listar(p),
    async baixar(c: string) {
      if (c !== MANIFESTO) return base.baixar(c)
      f.manifestos++
      const m = JSON.parse(new TextDecoder().decode(await base.baixar(c))) as Manifesto
      if (outra) {
        m.arquivos['nucleo/fold.json'] = { sha256: sha, bytes: fold.byteLength }
        m.publicacoes[0]!.volumes = ['I', 'II', 'III', 'IV'].map((v) => ({ volume: v, rotulo: `TESTE ${v}`, ano: 2020 }))
      }
      if (schema !== undefined) m.schema = schema
      return Uint8Array.from(new TextEncoder().encode(JSON.stringify(m))).buffer as ArrayBuffer
    },
  }
  return f
}

let armazem: Armazem

describe('Início: «Há uma versão nova dos livros no Dropbox»', () => {
  beforeAll(async () => usarMotor(await bancoDeTeste()))
  afterAll(() => usarMotor(null))
  beforeEach(async () => {
    esquecerNovidade()
    armazem = armazemMemoria()
    await sincronizarPacote(fonteDeTeste(), () => undefined, { armazem, cache: cacheMemoria() })
  })
  afterEach(() => {
    usarProcura(null)
    instalarMatchMedia(375)
  })

  it('com um pacote novo: a faixa, com os livros, e «Atualizar os livros» leva a /preparando', async () => {
    usarProcura({ obterFonte: async () => fonte({ outra: true }), armazem })
    abrir()
    const faixa = (await screen.findByText(/Há uma versão nova dos livros/)).closest('[role="status"]')
    expect(faixa).not.toBeNull()
    expect(faixa).toHaveTextContent('Há uma versão nova dos livros no Dropbox: TESTE I–IV.')
    expect(faixa).not.toHaveTextContent('!')
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar os livros' }))
    expect(screen.getByTestId('onde')).toHaveTextContent('/preparando {"atualizar":true}')
  })

  it('a procura começa depois que o Início foi desenhado, nunca no meio da primeira pintura', async () => {
    const f = await fonte({ outra: true })
    const obterFonte = vi.fn(async () => f)
    usarProcura({ obterFonte, armazem })
    abrir()
    // Desenhado (o título já está na tela) e a procura ainda não começou.
    expect(screen.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeInTheDocument()
    expect(obterFonte).not.toHaveBeenCalled()
    await waitFor(() => expect(obterFonte).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('button', { name: 'Atualizar os livros' })).toBeInTheDocument()
  })

  it('o mesmo pacote: nada aparece', async () => {
    const f = await fonte({ outra: false })
    usarProcura({ obterFonte: async () => f, armazem })
    abrir()
    await waitFor(() => expect(f.manifestos).toBe(1))
    await new Promise((ok) => setTimeout(ok, 20))
    expect(screen.queryByText(/versão nova dos livros/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Atualizar os livros' })).toBeNull()
  })

  it('um pacote que não abre nesta versão (outro schema): nada aparece, nem erro', async () => {
    const f = await fonte({ outra: true, schema: 99 })
    usarProcura({ obterFonte: async () => f, armazem })
    abrir()
    await waitFor(() => expect(f.manifestos).toBe(1))
    await new Promise((ok) => setTimeout(ok, 20))
    expect(screen.queryByText(/versão nova dos livros|não abre/)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('enquanto os livros são baixados, a faixa some; ao terminar sem baixar (falha), volta', async () => {
    usarProcura({ obterFonte: async () => fonte({ outra: true }), armazem })
    abrir()
    expect(await screen.findByRole('button', { name: 'Atualizar os livros' })).toBeInTheDocument()
    act(() => marcarAtualizando(true))
    expect(screen.queryByRole('button', { name: 'Atualizar os livros' })).toBeNull()
    act(() => marcarAtualizando(false))
    expect(screen.getByRole('button', { name: 'Atualizar os livros' })).toBeInTheDocument()
  })

  it('sem login ou sem internet: nada aparece, nem erro', async () => {
    const obterFonte = vi.fn(async () => null)
    usarProcura({ obterFonte, armazem })
    const { unmount } = abrir()
    await waitFor(() => expect(obterFonte).toHaveBeenCalled())
    await new Promise((ok) => setTimeout(ok, 20))
    expect(screen.queryByText(/versão nova dos livros/)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    unmount()

    esquecerNovidade()
    usarProcura({ obterFonte: async () => Promise.reject(new TypeError('Failed to fetch')), armazem })
    abrir()
    await new Promise((ok) => setTimeout(ok, 60))
    expect(screen.queryByText(/versão nova dos livros/)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('uma procura por abertura do app: voltar ao Início não baixa o manifesto de novo, e a faixa continua', async () => {
    const f = await fonte({ outra: true })
    usarProcura({ obterFonte: async () => f, armazem })
    const primeira = abrir()
    expect(await screen.findByRole('button', { name: 'Atualizar os livros' })).toBeInTheDocument()
    primeira.unmount()
    abrir()
    expect(screen.getByRole('button', { name: 'Atualizar os livros' })).toBeInTheDocument()
    await new Promise((ok) => setTimeout(ok, 60))
    expect(f.manifestos).toBe(1)
  })

  it('no computador, a faixa também aparece', async () => {
    instalarMatchMedia(1280)
    usarProcura({ obterFonte: async () => fonte({ outra: true }), armazem })
    abrir()
    expect(await screen.findByRole('button', { name: 'Atualizar os livros' })).toBeInTheDocument()
  })
})
