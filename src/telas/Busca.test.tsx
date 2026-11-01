import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import { usarMotor } from '../banco/cliente'
import { lerTabelaDeFold, usarTabelaDeFold } from '../busca/fold'
import { Busca, MSG_SEM_PACOTE } from './Busca'

// A tabela de dobra do pacote sintético: com ela a tela sabe que `"` e `*` não deixam nada para buscar.
beforeAll(() => usarTabelaDeFold(lerTabelaDeFold(JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo/fold.json'), 'utf8')))))
afterAll(() => usarTabelaDeFold(null))

function abrir(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Busca />
    </MemoryRouter>,
  )
}

describe('tela Busca: consulta vazia', () => {
  it.each([['/busca'], ['/busca?q='], ['/busca?q=%20%20%20'], ['/busca?q=%22'], ['/busca?q=*']])('%s mostra o estado vazio, não um erro', async (url) => {
    abrir(url)
    expect(screen.getByRole('heading', { level: 1, name: 'Busca' })).toBeInTheDocument()
    expect(await screen.findByText(/Digite um termo/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/Nada encontrado/)).not.toBeInTheDocument()
  })

  it('o campo traz o que foi digitado e é pesquisável por rótulo', () => {
    abrir('/busca?q=%22')
    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('"')
  })

  it('limpar a busca esvazia o campo', async () => {
    abrir('/busca?q=%22')
    await userEvent.click(screen.getByRole('button', { name: 'Limpar a busca' }))
    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('')
    await waitFor(() => expect(screen.getByText(/Digite um termo/)).toBeInTheDocument())
  })
})


describe('tela Busca: sem o banco no aparelho', () => {
  afterEach(() => usarMotor(null))

  it('avisa que o banco não está no aparelho, com o caminho para prepará-lo', async () => {
    // O motor responde "sem pacote", como o worker antes da primeira sincronização completa.
    usarMotor({ abrir: async () => ({ estado: 'sem-pacote' }), reabrir: async () => ({ estado: 'sem-pacote' }), executar: async () => [] })
    abrir('/busca?q=leao')
    expect(await screen.findByRole('alert')).toHaveTextContent(MSG_SEM_PACOTE)
    expect(screen.getByRole('link', { name: 'Preparar o banco' })).toHaveAttribute('href', '/preparando')
  })
})
