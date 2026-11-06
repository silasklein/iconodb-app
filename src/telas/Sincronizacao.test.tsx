import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { definirSync, modulo, zerarSync } from '../../tests/suporte/syncSimulada'
import { sair } from '../dropbox/auth'
import { MSG_SEM_PERMISSAO } from '../dropbox/mensagens'
import { teclasNaoDeclaradas } from '../test/atalhosDeclarados'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { registrar, registrarVarios } from '../usuario/estado'
import { Sincronizacao } from './Sincronizacao'

vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)
vi.mock('../dropbox/auth', async (original) => ({ ...(await original<typeof import('../dropbox/auth')>()), sair: vi.fn(async () => undefined) }))

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

function apagarBanco() {
  return new Promise<void>((ok) => {
    const r = indexedDB.deleteDatabase('iconodb-usuario')
    r.onsuccess = r.onerror = r.onblocked = () => ok()
  })
}

const hoje1910 = () => {
  const d = new Date()
  d.setHours(19, 10, 0, 0)
  return d.getTime()
}

describe('Sincronização (Sincronizacao.dc.html)', () => {
  beforeEach(async () => {
    zerarSync()
    await apagarBanco()
  })
  afterEach(() => instalarMatchMedia(375))

  it('um link «Cópias e exportação» leva à tela «Cópias e exportação» (Tarefa 15; 2C: /copias; ele abre a tela, não baixa)', async () => {
    abrir()
    expect(screen.queryByRole('link', { name: 'Baixar cópia de segurança' })).toBeNull()
    const link = screen.getByRole('link', { name: 'Cópias e exportação' })
    expect(link).toHaveAttribute('href', '/copias')
    await userEvent.click(link)
    expect(screen.getByTestId('onde')).toHaveTextContent('/copias')
  })

  it('o título, o estado (role=status) com a última sincronização, o botão e a chave do automático', async () => {
    definirSync({ porEnviar: 3, ultimaEm: hoje1910() })
    abrir()
    expect(screen.getByRole('heading', { level: 1, name: 'Sincronização' })).toBeInTheDocument()
    const estado = screen.getByRole('status')
    expect(estado).toHaveTextContent('3 alterações por enviar')
    expect(estado).toHaveTextContent('Já gravadas neste aparelho.')
    // A última sincronização aparece na tela, mas fora da região viva.
    expect(estado).not.toHaveTextContent('Última sincronização')
    expect(screen.getByText(/Última sincronização: hoje,/)).toBeInTheDocument()
    expect(screen.getByText('Dropbox · iPhone')).toBeInTheDocument()

    const botao = screen.getByRole('button', { name: 'Salvar e sincronizar' })
    expect(botao).toHaveAttribute('aria-keyshortcuts', 'Control+S Meta+S')
    await userEvent.click(botao)
    expect(modulo.sincronizarAgora).toHaveBeenCalledWith('manual')

    const chave = screen.getByRole('switch', { name: /Sincronizar automaticamente/ })
    expect(chave).toBeChecked()
    await userEvent.click(chave)
    expect(modulo.definirAutomatico).toHaveBeenCalledWith(false)
    expect(teclasNaoDeclaradas(document.body)).toEqual([])
  })

  it('"Vai subir" lista as mudanças por enviar (uma linha por registro, com a hora, o que a pessoa reconhece e o link); some sem nada por enviar', async () => {
    await registrar('nota', 'NT-a-1', 'criar', { texto: 'x', alvoTipo: 'objeto', alvo: 'CA00001' })
    await registrar('nota', 'NT-a-1', 'alterar', { texto: 'y' })
    await registrarVarios([{ tipo: 'colecao', reg: 'CO-a-1', op: 'alterar', campos: { nome: 'Remates' } }])
    await registrar('comparar', 'bandeja', 'alterar', { 'm:CA00001': true })
    definirSync({ porEnviar: 4 })
    abrir()
    const secao = await screen.findByRole('region', { name: 'Vai subir' })
    const itens = await within(secao).findAllByRole('listitem')
    expect(itens.map((i) => i.textContent)).toEqual([
      expect.stringMatching(/^Nota em CA00001 — nova\d\d:\d\d$/),
      expect.stringMatching(/^Coleção «Remates» — alterada\d\d:\d\d$/),
      expect.stringMatching(/^Bandeja de comparação bandeja — alterada\d\d:\d\d$/),
    ])
    expect(within(itens[0]!).getByRole('link', { name: 'Nota em CA00001 — nova' })).toHaveAttribute('href', '/nota/NT-a-1')
    expect(within(itens[1]!).getByRole('link', { name: 'Coleção «Remates» — alterada' })).toHaveAttribute('href', '/grupo/CO-a-1')
    expect(within(itens[2]!).queryByRole('link')).not.toBeInTheDocument()
    act(() => definirSync({ porEnviar: 0 }))
    expect(screen.queryByRole('region', { name: 'Vai subir' })).not.toBeInTheDocument()
  })

  it('"Chegou do outro aparelho" e o histórico recente, com a nota sobre o mesmo campo', () => {
    definirSync({
      recebidas: { em: hoje1910(), porAparelho: [{ aparelho: 'bbbbbbbb', nome: 'Mac', eventos: 2 }] },
      historico: [
        { em: hoje1910(), titulo: 'Sincronizado', detalhe: '2 enviadas · 2 recebidas do Mac' },
        { em: hoje1910() - 60_000, titulo: 'Sem internet', detalhe: '4 alterações esperaram 12 min e foram enviadas ao voltar' },
      ],
    })
    abrir()
    const chegou = screen.getByRole('region', { name: 'Chegou do outro aparelho' })
    expect(chegou).toHaveTextContent('2 alterações do Mac')
    expect(chegou).toHaveTextContent('19:10')
    const hist = screen.getByRole('region', { name: 'Histórico recente' })
    const linhas = within(hist).getAllByRole('listitem')
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toHaveTextContent('19:10Sincronizado2 enviadas · 2 recebidas do Mac')
    expect(hist).toHaveTextContent('vale a mudança mais recente; a outra fica guardada no histórico')
  })

  it('erro geral (E-16): a frase diz o que fazer, sem o texto técnico; «Copiar detalhes» o copia e avisa', async () => {
    const tecnico = 'Não foi possível falar com o Dropbox (resposta 400: Error in call to API function "files/list_folder": bad request)'
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    definirSync({
      estado: { erro: 'geral', mensagem: tecnico },
      historico: [{ em: hoje1910(), titulo: 'Não foi possível sincronizar', detalhe: tecnico }],
    })
    abrir()
    expect(screen.getByText('Nada se perdeu: o que você fez fica neste aparelho. Toque em «Salvar e sincronizar» para tentar de novo.')).toBeInTheDocument()
    expect(screen.queryByText(/resposta 400/)).not.toBeInTheDocument()
    expect(screen.queryByText(/files\/list_folder/)).not.toBeInTheDocument()
    const hist = screen.getByRole('region', { name: 'Histórico recente' })
    expect(within(hist).getAllByRole('listitem')[0]).toHaveTextContent('19:10Não foi possível sincronizar')
    expect(within(hist).getAllByRole('listitem')[0]).not.toHaveTextContent('Dropbox (')
    await userEvent.click(screen.getByRole('button', { name: 'Copiar detalhes' }))
    expect(writeText).toHaveBeenCalledWith(tecnico)
    await waitFor(() => expect(document.querySelector('.aviso-de-copia')).toHaveTextContent('Detalhes copiados'))
  })

  it('erro geral com alterações por enviar: a contagem no fim da frase (singular e plural)', () => {
    definirSync({ estado: { erro: 'geral', mensagem: 'x' }, porEnviar: 1 })
    abrir()
    expect(screen.getByText('Nada se perdeu: 1 alteração guardada neste aparelho. Toque em «Salvar e sincronizar» para tentar de novo.')).toBeInTheDocument()
    act(() => definirSync({ estado: { erro: 'geral', mensagem: 'x' }, porEnviar: 3 }))
    expect(screen.getByText('Nada se perdeu: 3 alterações guardadas neste aparelho. Toque em «Salvar e sincronizar» para tentar de novo.')).toBeInTheDocument()
  })

  it('«Copiar detalhes» sem área de transferência (m-3): mostra o texto técnico, selecionado, e pede para copiar à mão', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    definirSync({ estado: { erro: 'geral', mensagem: 'Não foi possível falar com o Dropbox (resposta 400: x)' } })
    abrir()
    expect(screen.queryByText(/resposta 400/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Copiar detalhes' }))
    await waitFor(() => expect(document.querySelector('.aviso-de-copia')).toHaveTextContent('Selecione e copie'))
    const texto = document.querySelector('.sync-detalhe-tecnico') as HTMLElement
    expect(texto).toHaveTextContent('Não foi possível falar com o Dropbox (resposta 400: x)')
    await waitFor(() => expect(window.getSelection()!.toString()).toBe('Não foi possível falar com o Dropbox (resposta 400: x)'))
  })

  it('«Copiar detalhes» recusado (N-1): o texto técnico continua na tela e selecionado depois de o aviso sumir (4 s)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
      definirSync({ estado: { erro: 'geral', mensagem: 'Não foi possível falar com o Dropbox (resposta 400: x)' } })
      abrir()
      await userEvent.click(screen.getByRole('button', { name: 'Copiar detalhes' }))
      await waitFor(() => expect(document.querySelector('.sync-detalhe-tecnico')).not.toBeNull())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4100)
      })
      expect(document.querySelector('.aviso-de-copia')?.textContent ?? '').not.toContain('Selecione e copie')
      expect(document.querySelector('.sync-detalhe-tecnico')).toHaveTextContent('Não foi possível falar com o Dropbox (resposta 400: x)')
      expect(window.getSelection()!.toString()).toBe('Não foi possível falar com o Dropbox (resposta 400: x)')
    } finally {
      vi.useRealTimers()
    }
  })

  it('«Copiar detalhes» recusado de novo dentro dos 4 s (n-1): o texto volta a ser selecionado, mesmo que a pessoa tenha tirado a seleção', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    const tecnico = 'Não foi possível falar com o Dropbox (resposta 400: x)'
    definirSync({ estado: { erro: 'geral', mensagem: tecnico } })
    abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Copiar detalhes' }))
    await waitFor(() => expect(window.getSelection()!.toString()).toBe(tecnico))
    act(() => window.getSelection()!.removeAllRanges())
    expect(window.getSelection()!.toString()).toBe('')
    await userEvent.click(screen.getByRole('button', { name: 'Copiar detalhes' }))
    await waitFor(() => expect(window.getSelection()!.toString()).toBe(tecnico))
  })

  it('«Copiar detalhes» (m-4): chaves de acesso saem do texto copiado e do mostrado', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    definirSync({ estado: { erro: 'geral', mensagem: 'Dropbox (resposta 400: Authorization: Bearer sl.u.SEGREDO123)' } })
    abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Copiar detalhes' }))
    expect(writeText).toHaveBeenCalledWith('Dropbox (resposta 400: Authorization: [removido])')
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    await userEvent.click(screen.getByRole('button', { name: 'Copiar detalhes' }))
    await waitFor(() => expect(document.querySelector('.sync-detalhe-tecnico')).toHaveTextContent('Dropbox (resposta 400: Authorization: [removido])'))
    expect(document.body.textContent).not.toContain('SEGREDO123')
  })

  it('só o erro geral tem «Copiar detalhes»', () => {
    definirSync({ estado: { erro: 'login', mensagem: 'x' } })
    abrir()
    expect(screen.queryByRole('button', { name: 'Copiar detalhes' })).not.toBeInTheDocument()
  })

  it('histórico vazio (E-17): não parece desmentir a última sincronização', () => {
    definirSync({ ultimaEm: hoje1910() })
    abrir()
    expect(screen.getByRole('region', { name: 'Histórico recente' })).toHaveTextContent(
      'Nada a contar ainda. Aqui aparecem as edições do mesmo campo nos dois aparelhos, as esperas sem internet e as falhas.',
    )
    expect(screen.queryByText(/Nenhuma sincronização registrada/)).not.toBeInTheDocument()
  })

  it('"Detalhes": os arquivos malformados ignorados (caminho e motivo) e os segmentos que faltam', () => {
    definirSync({
      avisos: [{ caminho: 'usuario/diario/xxxxxxxx/000002.jsonl', motivo: '2 linhas ilegíveis', em: hoje1910() }],
      faltando: [{ aparelho: 'xxxxxxxx', segmento: 4 }],
    })
    abrir()
    const det = screen.getByRole('region', { name: 'Detalhes' })
    expect(det).toHaveTextContent('Arquivo ignorado: usuario/diario/xxxxxxxx/000002.jsonl')
    expect(det).toHaveTextContent('2 linhas ilegíveis')
    expect(det).toHaveTextContent('Esperando o segmento 000004 do aparelho xxxxxxxx')
  })

  it('"Detalhes": um arquivo parcialmente lido diz que as linhas válidas entraram', () => {
    definirSync({
      avisos: [
        { caminho: 'usuario/diario/xxxxxxxx/000002.jsonl', motivo: '1 linha ilegível', em: hoje1910(), parcial: true },
        { caminho: 'usuario/diario/xxxxxxxx/000003.jsonl', motivo: 'não é texto UTF-8', em: hoje1910() },
      ],
    })
    abrir()
    const det = screen.getByRole('region', { name: 'Detalhes' })
    expect(det).toHaveTextContent('Arquivo com linhas inválidas (as válidas entraram): usuario/diario/xxxxxxxx/000002.jsonl')
    expect(det).toHaveTextContent('Arquivo ignorado: usuario/diario/xxxxxxxx/000003.jsonl')
  })

  it('estado.json ilegível: a linha de recuperação, a marca de aviso, e o botão segue funcionando', async () => {
    definirSync({ estadoIlegivel: 'versão mais nova do app em outro aparelho' })
    abrir()
    expect(screen.getByText(/Atualize o app neste aparelho; se o problema continuar, apague/)).toHaveTextContent(
      'Atualize o app neste aparelho; se o problema continuar, apague usuario/estado.json no Dropbox (nada se perde: o app o recria a partir dos diários).',
    )
    expect(document.querySelector('[data-marca="aviso"]')).not.toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Sincronizado')
    expect(screen.getByRole('button', { name: 'Salvar e sincronizar' })).toBeEnabled()
    act(() => zerarSync())
    expect(screen.queryByText(/Atualize o app neste aparelho/)).not.toBeInTheDocument()
  })

  it('estado.json lido só em parte (A-7): o aviso próprio, sem a sugestão de apagar o arquivo', async () => {
    definirSync({ estadoIlegivel: 'versão mais nova do app em outro aparelho: 1 registro que esta versão não conhece', estadoLidoEmParte: true })
    abrir()
    expect(screen.getByText(/foi lido só em parte/)).toHaveTextContent(
      'O usuario/estado.json do Dropbox foi lido só em parte: tem registros que esta versão do app não lê. Atualize o app neste aparelho; se ele já está atualizado, atualize o do aparelho que gravou o arquivo. Não apague o estado.json: ele guarda registros que só a versão nova lê.',
    )
    expect(screen.queryByText(/se o problema continuar, apague/)).not.toBeInTheDocument()
    expect(screen.queryByText(/nada se perde/)).not.toBeInTheDocument()
    expect(document.querySelector('[data-marca="aviso"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Salvar e sincronizar' })).toBeEnabled()
  })

  it('A-28: estado.json com só registros ilegíveis: texto próprio, que diz que apagar é seguro', async () => {
    definirSync({ estadoIlegivel: '2 registros ilegíveis (o que pôde ser lido entrou; o arquivo não é regravado)', estadoLidoEmParte: true, estadoSoIlegiveis: true })
    abrir()
    expect(screen.getByText(/tem registros ilegíveis/)).toHaveTextContent(
      'O usuario/estado.json do Dropbox tem registros ilegíveis (danificados); o que pôde ser lido entrou. Pode apagar usuario/estado.json no Dropbox: nada se perde, o app o recria a partir dos diários.',
    )
    expect(screen.queryByText(/Não apague o estado.json/)).not.toBeInTheDocument()
    expect(screen.queryByText(/foi lido só em parte/)).not.toBeInTheDocument()
    expect(document.querySelector('[data-marca="aviso"]')).not.toBeNull()
  })

  it('sem login: "Entre de novo para sincronizar", com o link para entrar', async () => {
    definirSync({ estado: { erro: 'login', mensagem: 'Entre de novo para sincronizar' }, porEnviar: 2 })
    abrir()
    expect(screen.getByRole('status')).toHaveTextContent('Entre de novo para sincronizar')
    expect(screen.getByRole('status')).toHaveTextContent('2 alterações guardadas neste aparelho; sobem depois de entrar.')
    await userEvent.click(screen.getByRole('link', { name: 'Entrar de novo' }))
    expect(screen.getByTestId('onde')).toHaveTextContent('/entrar')
  })

  it('sem permissão: a orientação das três permissões e "Entrar de novo" (sai e vai entrar)', async () => {
    definirSync({ estado: { erro: 'permissao', mensagem: MSG_SEM_PERMISSAO } })
    abrir()
    expect(screen.getByRole('status')).toHaveTextContent('files.metadata.read')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar de novo' }))
    expect(sair).toHaveBeenCalled()
    expect(await screen.findByTestId('onde')).toHaveTextContent('/entrar')
  })

  it('o Voltar do celular leva ao Início; no computador não há Voltar', () => {
    abrir()
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '#/')
  })
})
