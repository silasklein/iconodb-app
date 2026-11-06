/**
 * Decisão 50 (revisão 2 da Tarefa 16): a página de um verbete ou sítio do livro que veio de um registro do usuário (a linha
 * do `redirecionamento` com `criado`) mostra «Este verbete veio de você» / «Este sítio veio de você», com «Excluir o seu
 * verbete» / «Excluir o seu sítio» (exclui o registro de origem; sai dos livros na próxima importação, decisão 47) e, depois
 * de excluído, o aviso e «Restaurar». No pacote sintético: `GL-teste123-1` → `GL-900010` e `SI-teste123-1` → `TESTE-3` são
 * criados (1); `GL-teste123-2` → `GL-900002` e `SI-teste123-2` → `TESTE-2` levam a um que já era do livro (0): ali não há
 * o bloco (o negativo prova o positivo), nem num verbete ou sítio sem origem.
 */
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { definirSync, zerarSync } from '../../tests/suporte/syncSimulada'
import { executar, usarMotor } from '../banco/cliente'
import { redirecionamentosDoPacote } from '../pacote/redirecionamentos'
import { irPara, renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { CHAVE_DOS_NOMES, esquecerNomesGuardados } from '../excluidos/nomesGuardados'
import { gravarConfig, lerConfig } from '../usuario/diarioLocal'
import { estadoAtual, receberEventos, registrar, registrarVarios } from '../usuario/estado'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/estado', async (original) => {
  const m = await original<typeof import('../usuario/estado')>()
  return { ...m, registrarVarios: vi.fn(m.registrarVarios) }
})
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
  await registrar('verbete', 'GL-teste123-1', 'criar', { forma: 'amuleto de prova', status: 'proposed' })
  await registrar('verbete', 'GL-teste123-2', 'criar', { forma: 'figura denteada do app', status: 'proposed' })
  await registrar('sitio', 'SI-teste123-1', 'criar', { nome: 'Tell Usuário Teste' })
  await registrar('sitio', 'SI-teste123-2', 'criar', { nome: 'Tell Probe do app' })
})
afterAll(() => usarMotor(null))
// m-2: o mapa de nomes guardados (P5) vive no módulo e no IndexedDB: nada passa de um teste para o outro
beforeEach(async () => {
  esquecerNomesGuardados()
  await gravarConfig(CHAVE_DOS_NOMES, undefined)
})
afterEach(() => esquecerNomesGuardados())

const excluido = (tipo: 'verbete' | 'sitio', id: string) => estadoAtual().registro(tipo, id)?.excluido ?? null

describe.each([
  { largura: 375, nome: 'celular' },
  { largura: 1280, nome: 'computador' },
])('no $nome', ({ largura }) => {
  beforeEach(() => instalarMatchMedia(largura))

  it('o verbete do livro criado do seu: o bloco, a confirmação, a exclusão da origem, o aviso e Restaurar', async () => {
    const usuario = userEvent.setup()
    renderizarRota('/verbete/GL-900010')
    const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
    expect(within(bloco).getByText(/amuleto de prova/)).toBeInTheDocument()
    expect(within(bloco).getByText(/sai dos livros na próxima importação/)).toBeInTheDocument()
    const excluir = within(bloco).getByRole('button', { name: 'Excluir o seu verbete' })
    // Cancelar não exclui e devolve o foco ao botão
    await usuario.click(excluir)
    const confirmar = within(bloco).getByRole('group', { name: 'Excluir o seu verbete «amuleto de prova»?' })
    // revisão 3 (decisão 51): o texto diz que nada se apaga, mas o que está ligado fica sem o verbete até restaurar
    expect(confirmar).toHaveTextContent(
      'GL-900010 fica reservado para ele. Nada se apaga: as notas e hipóteses ligadas a este verbete ficam guardadas, mas sem ele até você restaurar. Ao restaurar, ele volta com o mesmo GL-900010 e tudo volta a se ligar a ele.',
    )
    expect(confirmar).not.toHaveTextContent(/número|excluídos juntos/)
    expect(within(confirmar).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    await usuario.click(within(confirmar).getByRole('button', { name: 'Cancelar' }))
    expect(within(bloco).getByRole('button', { name: 'Excluir o seu verbete' })).toHaveFocus()
    expect(excluido('verbete', 'GL-teste123-1')).toBe(false)
    // Excluir: o registro de origem é excluído; a página continua (é a do livro) e mostra o aviso e Restaurar
    await usuario.click(within(bloco).getByRole('button', { name: 'Excluir o seu verbete' }))
    await usuario.click(within(screen.getByRole('group', { name: /Excluir o seu verbete/ })).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(excluido('verbete', 'GL-teste123-1')).toBe(true))
    const aviso = await within(bloco).findByRole('status')
    expect(aviso).toHaveTextContent('Você excluiu o seu verbete «amuleto de prova». Sai dos livros na próxima importação. Até lá, «Restaurar» fica aqui.')
    const restaurar = within(bloco).getByRole('button', { name: 'Restaurar' })
    expect(restaurar).toHaveFocus()
    expect(within(bloco).queryByRole('button', { name: 'Excluir o seu verbete' })).toBeNull()
    // o outro, que levava a um verbete que já era do livro, não foi tocado
    expect(excluido('verbete', 'GL-teste123-2')).toBe(false)
    // Restaurar desfaz
    await usuario.click(restaurar)
    await waitFor(() => expect(excluido('verbete', 'GL-teste123-1')).toBe(false))
    expect(await within(bloco).findByRole('button', { name: 'Excluir o seu verbete' })).toHaveFocus()
    // a região viva continua montada (vazia), para o próximo aviso ser anunciado (m-UI2)
    expect(within(bloco).getByRole('status')).toHaveTextContent(/^$/)
  })

  it('revisão 3 (m-UI2): a região viva existe antes do aviso, e Restaurar é descrito por ele', async () => {
    const usuario = userEvent.setup()
    const r = renderizarRota('/verbete/GL-900010')
    const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
    const regiao = within(bloco).getByRole('status')
    expect(regiao).toHaveTextContent(/^$/)
    await usuario.click(within(bloco).getByRole('button', { name: 'Excluir o seu verbete' }))
    await usuario.click(within(within(bloco).getByRole('group')).getByRole('button', { name: 'Excluir' }))
    const restaurar = await within(bloco).findByRole('button', { name: 'Restaurar' })
    // o MESMO nó (não um novo, inserido já com o texto)
    expect(within(bloco).getByRole('status')).toBe(regiao)
    expect(regiao).toHaveTextContent('Sai dos livros na próxima importação.')
    expect(restaurar).toHaveAccessibleDescription(/Sai dos livros na próxima importação/)
    await usuario.click(restaurar)
    await waitFor(() => expect(excluido('verbete', 'GL-teste123-1')).toBe(false))
    r.unmount()
  })

  it('o sítio do livro criado do seu: o mesmo, com «Excluir o seu sítio»', async () => {
    const usuario = userEvent.setup()
    renderizarRota('/sitio/TESTE-3')
    const bloco = await screen.findByRole('region', { name: 'Este sítio veio de você' })
    expect(within(bloco).getByText(/Tell Usuário Teste/)).toBeInTheDocument()
    await usuario.click(within(bloco).getByRole('button', { name: 'Excluir o seu sítio' }))
    const confirmar = within(bloco).getByRole('group', { name: 'Excluir o seu sítio «Tell Usuário Teste»?' })
    expect(confirmar).toHaveTextContent(
      'TESTE-3 fica reservado para ele. Nada se apaga: os objetos, as notas e as correções ligados a este sítio ficam guardados, mas sem ele até você restaurar. Ao restaurar, ele volta com o mesmo TESTE-3 e tudo volta a se ligar a ele.',
    )
    expect(confirmar).not.toHaveTextContent(/número/)
    await usuario.click(within(confirmar).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(excluido('sitio', 'SI-teste123-1')).toBe(true))
    await waitFor(() => expect(within(bloco).getByRole('status')).toHaveTextContent('Você excluiu o seu sítio «Tell Usuário Teste». Sai dos livros na próxima importação. Até lá, «Restaurar» fica aqui.'))
    await usuario.click(within(bloco).getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(excluido('sitio', 'SI-teste123-1')).toBe(false))
    expect(await within(bloco).findByRole('button', { name: 'Excluir o seu sítio' })).toBeInTheDocument()
    expect(excluido('sitio', 'SI-teste123-2')).toBe(false)
  })

  it('o que já era do livro (o seu só leva a ele) e o que não tem origem não têm o bloco', async () => {
    for (const [url, titulo] of [
      ['/verbete/GL-900002', /figura denteada/],
      ['/verbete/GL-900001', /leão-de-teste/],
      ['/sitio/TESTE-2', /Tell Probe Teste/],
      ['/sitio/TESTE-1', /Maḥteṣ Teste/],
    ] as const) {
      const r = renderizarRota(url)
      await screen.findByRole('heading', { level: largura < 768 ? 1 : 2, name: titulo })
      // a leitura dos redirecionamentos terminou (o mapa já está pronto) antes de conferir a ausência
      await redirecionamentosDoPacote()
      await act(async () => {})
      expect(screen.queryByRole('region', { name: /veio de você/ }), url).toBeNull()
      expect(screen.queryByRole('button', { name: /Excluir o seu/ }), url).toBeNull()
      r.unmount()
    }
  })
})

describe('várias origens e formato antigo', () => {
  beforeEach(() => instalarMatchMedia(375))
  afterEach(() => zerarSync())

  it('duas origens criaram o mesmo verbete: «Excluir os seus 2 verbetes» exclui as duas; Restaurar restaura as duas', async () => {
    await registrar('verbete', 'GL-eeeeeeee-1', 'criar', { forma: 'amuleto de prova', status: 'proposed' })
    usarMotor(await bancoDeTeste({ escrita: true }))
    try {
      await executar(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-eeeeeeee-1', 'GL-900010', 'verbete', 1)`)
      const usuario = userEvent.setup()
      const r = renderizarRota('/verbete/GL-900010')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await within(bloco).findByText(/2 verbetes seus/)
      // P7 (aprovação): o mesmo nome não se repete
      expect(within(bloco).getByText(/^Publicado a partir/)).toHaveTextContent(
        'Publicado a partir de 2 verbetes seus («amuleto de prova»). Se você os excluir, ele sai dos livros na próxima importação.',
      )
      expect(within(bloco).queryByRole('button', { name: 'Excluir o seu verbete' })).toBeNull()
      await usuario.click(within(bloco).getByRole('button', { name: 'Excluir os seus 2 verbetes' }))
      const confirmar = within(bloco).getByRole('group', { name: 'Excluir os seus 2 verbetes?' })
      // decisão 51: a confirmação começa dizendo que saem juntos e que a entrada só sai quando todos forem excluídos
      expect(confirmar.textContent).toMatch(
        /^Os 2 verbetes seus \(«amuleto de prova»\) são excluídos juntos: enquanto um deles existir, este verbete continua nos livros\. GL-900010 fica reservado para ele\./,
      )
      await usuario.click(within(confirmar).getByRole('button', { name: 'Excluir' }))
      await waitFor(() => expect([excluido('verbete', 'GL-teste123-1'), excluido('verbete', 'GL-eeeeeeee-1')]).toEqual([true, true]))
      expect(within(bloco).getByRole('status')).toHaveTextContent('Você excluiu os seus 2 verbetes. Sai dos livros na próxima importação. Até lá, «Restaurar» fica aqui.')
      await usuario.click(await within(bloco).findByRole('button', { name: 'Restaurar' }))
      await waitFor(() => expect([excluido('verbete', 'GL-teste123-1'), excluido('verbete', 'GL-eeeeeeee-1')]).toEqual([false, false]))
      r.unmount()
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })

  it('uma origem que este aparelho não tem (ainda sem o registro) não aparece nem é excluída; com o registro, aparece', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    try {
      await executar(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-ffffffff-1', 'GL-900001', 'verbete', 1)`)
      expect((await redirecionamentosDoPacote()).get('GL-ffffffff-1')).toBe('GL-900001')
      const r = renderizarRota('/verbete/GL-900001')
      await screen.findByRole('heading', { level: 1, name: /leão-de-teste/ })
      await act(async () => {})
      expect(screen.queryByRole('region', { name: /veio de você/ })).toBeNull()
      expect(estadoAtual().registro('verbete', 'GL-ffffffff-1')).toBeUndefined()
      r.unmount()
      // o registro chega (a sincronização): o bloco aparece, com o nome dele
      await registrar('verbete', 'GL-ffffffff-1', 'criar', { forma: 'leão de origem', status: 'proposed' })
      const r2 = renderizarRota('/verbete/GL-900001')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      expect(within(bloco).getByText(/leão de origem/)).toBeInTheDocument()
      r2.unmount()
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })

  it('revisão 3 (m-O): uma origem viva que ainda não chegou: o bloco não diz que a entrada sai dos livros e pede para sincronizar', async () => {
    definirSync({ porEnviar: 1 })
    usarMotor(await bancoDeTeste({ escrita: true }))
    try {
      // GL-900010 veio de GL-teste123-1 (que este aparelho tem) e de GL-gggggggg-1 (que ainda não chegou)
      await executar(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-gggggggg-1', 'GL-900010', 'verbete', 1)`)
      const usuario = userEvent.setup()
      const r = renderizarRota('/verbete/GL-900010')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await within(bloco).findByText(/amuleto de prova/)
      expect(bloco).toHaveTextContent(
        'Publicado a partir do seu verbete «amuleto de prova» e de mais 1 verbete seu que ainda não chegou a este aparelho. Sincronize para ver todos; enquanto um deles existir, este verbete continua nos livros.',
      )
      expect(bloco).not.toHaveTextContent(/sai dos livros/i)
      // excluir só o que está aqui não tiraria a entrada dos livros: o botão espera a sincronização
      expect(within(bloco).queryByRole('button', { name: /Excluir/ })).toBeNull()
      r.unmount()
      // o que este aparelho já excluiu, com uma origem que não chegou: o aviso não promete a saída
      await registrar('verbete', 'GL-teste123-1', 'excluir', {})
      const r2 = renderizarRota('/verbete/GL-900010')
      const bloco2 = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await waitFor(() =>
        expect(within(bloco2).getByRole('status')).toHaveTextContent(
          'Você excluiu o seu verbete «amuleto de prova». Mais 1 verbete seu leva a este verbete e ainda não chegou a este aparelho: enquanto ele existir, este verbete continua nos livros. Sincronize para vê-lo.',
        ),
      )
      expect(within(bloco2).getByRole('status')).not.toHaveTextContent(/Sai dos livros/)
      await usuario.click(within(bloco2).getByRole('button', { name: 'Restaurar' }))
      await waitFor(() => expect(excluido('verbete', 'GL-teste123-1')).toBe(false))
      r2.unmount()
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })

  it('revisão 3 (m-O): duas que ainda não chegaram: o plural', async () => {
    definirSync({ porEnviar: 1 })
    usarMotor(await bancoDeTeste({ escrita: true }))
    try {
      await executar(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('SI-gggggggg-1', 'TESTE-3', 'sitio', 1), ('SI-gggggggg-2', 'TESTE-3', 'sitio', 1)`)
      const r = renderizarRota('/sitio/TESTE-3')
      const bloco = await screen.findByRole('region', { name: 'Este sítio veio de você' })
      await waitFor(() =>
        expect(bloco).toHaveTextContent(
          'Publicado a partir do seu sítio «Tell Usuário Teste» e de mais 2 sítios seus que ainda não chegaram a este aparelho. Sincronize para ver todos; enquanto um deles existir, este sítio continua nos livros.',
        ),
      )
      expect(within(bloco).queryByRole('button', { name: /Excluir/ })).toBeNull()
      r.unmount()
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })

  it('revisão 4 (m-M): uma origem já excluída e uma viva: o botão e a confirmação contam só a viva (singular)', async () => {
    // GL-hhhhhhhh-1 foi excluído (noutro aparelho, antes do pacote): ainda leva a GL-900010 no pacote
    await registrar('verbete', 'GL-hhhhhhhh-1', 'criar', { forma: 'amuleto antigo', status: 'proposed' })
    await registrar('verbete', 'GL-hhhhhhhh-1', 'excluir', {})
    usarMotor(await bancoDeTeste({ escrita: true }))
    try {
      await executar(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-hhhhhhhh-1', 'GL-900010', 'verbete', 1)`)
      const usuario = userEvent.setup()
      const r = renderizarRota('/verbete/GL-900010')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await within(bloco).findByText(/amuleto antigo/)
      expect(bloco).toHaveTextContent(
        'Publicado a partir de 2 verbetes seus («amuleto antigo», «amuleto de prova»). Você já excluiu «amuleto antigo»; se excluir «amuleto de prova», ele sai dos livros na próxima importação.',
      )
      // o negativo: não conta a já excluída
      expect(within(bloco).queryByRole('button', { name: /Excluir os seus/ })).toBeNull()
      await usuario.click(within(bloco).getByRole('button', { name: 'Excluir o seu verbete' }))
      const confirmar = within(bloco).getByRole('group', { name: 'Excluir o seu verbete «amuleto de prova»?' })
      expect(confirmar).not.toHaveTextContent(/excluídos juntos/)
      expect(confirmar.textContent).toMatch(/^GL-900010 fica reservado para ele\./)
      await usuario.click(within(confirmar).getByRole('button', { name: 'Excluir' }))
      await waitFor(() => expect(excluido('verbete', 'GL-teste123-1')).toBe(true))
      expect(within(bloco).getByRole('status')).toHaveTextContent('Você excluiu os seus 2 verbetes. Sai dos livros na próxima importação. Até lá, «Restaurar» fica aqui.')
      await usuario.click(await within(bloco).findByRole('button', { name: 'Restaurar' }))
      await waitFor(() => expect(excluido('verbete', 'GL-teste123-1')).toBe(false))
      r.unmount()
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })

  it('revisão 4 (m-M): uma já excluída e duas vivas: «Excluir os seus 2 sítios» e «Os 2 sítios seus» (plural)', async () => {
    await registrar('sitio', 'SI-hhhhhhhh-1', 'criar', { nome: 'Tell Antigo' })
    await registrar('sitio', 'SI-hhhhhhhh-1', 'excluir', {})
    await registrar('sitio', 'SI-hhhhhhhh-2', 'criar', { nome: 'Tell Outro Aparelho' })
    usarMotor(await bancoDeTeste({ escrita: true }))
    try {
      await executar(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('SI-hhhhhhhh-1', 'TESTE-3', 'sitio', 1), ('SI-hhhhhhhh-2', 'TESTE-3', 'sitio', 1)`)
      const usuario = userEvent.setup()
      const r = renderizarRota('/sitio/TESTE-3')
      const bloco = await screen.findByRole('region', { name: 'Este sítio veio de você' })
      await within(bloco).findByText(/Tell Antigo/)
      expect(bloco).toHaveTextContent('Você já excluiu «Tell Antigo»; se excluir os outros 2, ele sai dos livros na próxima importação.')
      expect(within(bloco).queryByRole('button', { name: 'Excluir os seus 3 sítios' })).toBeNull()
      await usuario.click(within(bloco).getByRole('button', { name: 'Excluir os seus 2 sítios' }))
      const confirmar = within(bloco).getByRole('group', { name: 'Excluir os seus 2 sítios?' })
      expect(confirmar.textContent).toMatch(
        /^Os 2 sítios seus \(«Tell Outro Aparelho», «Tell Usuário Teste»\) são excluídos juntos: enquanto um deles existir, este sítio continua nos livros\. TESTE-3 fica reservado para ele\./,
      )
      expect(confirmar).not.toHaveTextContent(/Tell Antigo/)
      await usuario.click(within(confirmar).getByRole('button', { name: 'Excluir' }))
      await waitFor(() => expect([excluido('sitio', 'SI-teste123-1'), excluido('sitio', 'SI-hhhhhhhh-2')]).toEqual([true, true]))
      expect(within(bloco).getByRole('status')).toHaveTextContent('Você excluiu os seus 3 sítios. Sai dos livros na próxima importação.')
      await usuario.click(await within(bloco).findByRole('button', { name: 'Restaurar' }))
      await waitFor(() => expect(excluido('sitio', 'SI-teste123-1')).toBe(false))
      r.unmount()
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })

  it('uma tabela sem a coluna `criado` (a da revisão 1) não diz «veio de você»', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    try {
      await executar('ALTER TABLE main.redirecionamento DROP COLUMN criado')
      expect((await redirecionamentosDoPacote()).get('GL-teste123-1')).toBe('GL-900010')
      const r = renderizarRota('/verbete/GL-900010')
      await screen.findByRole('heading', { level: 1, name: /amuleto de prova/ })
      await act(async () => {})
      expect(screen.queryByRole('region', { name: /veio de você/ })).toBeNull()
      r.unmount()
    } finally {
      usarMotor(await bancoDeTeste())
    }
    // e com a coluna, o bloco volta
    const r = renderizarRota('/verbete/GL-900010')
    expect(await screen.findByRole('region', { name: 'Este verbete veio de você' })).toBeInTheDocument()
    r.unmount()
  })
})

const VERBETE_SEM_ORIGEM = /estrela de prova/
const FALTA_V =
  'Falta neste aparelho 1 verbete seu que leva a esta entrada. Se ele não chegou depois de sincronizar, pode ter se perdido. Você pode retirar a entrada dos livros mesmo assim: os seus verbetes que levam a ela vão para Excluídos, e ela sai dos livros na próxima importação.'
const FALTA_S =
  'Falta neste aparelho 1 sítio seu que leva a esta entrada. Se ele não chegou depois de sincronizar, pode ter se perdido. Você pode retirar a entrada dos livros mesmo assim: os seus sítios que levam a ela vão para Excluídos, e ela sai dos livros na próxima importação.'

describe('2C, bloco 1, Tarefa 4: «Retirar dos livros mesmo assim» (spec §5)', () => {
  // «Em dia» é «sincronizado» e já sincronizou ao menos uma vez neste aparelho (revisão 1)
  beforeEach(() => {
    instalarMatchMedia(375)
    definirSync({ ultimaEm: Date.now() })
  })
  afterEach(() => zerarSync())

  const comFalta = async (sql: string) => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    await executar(sql)
  }
  const volta = async () => usarMotor(await bancoDeTeste())

  it('verbete: com a sincronização em dia e uma origem faltando, o texto, o botão e a confirmação; confirmar exclui as duas numa transação; Restaurar traz as duas', async () => {
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-iiiiiiii-1', 'GL-900010', 'verbete', 1)`)
    try {
      const usuario = userEvent.setup()
      const r = renderizarRota('/verbete/GL-900010')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      const botao = await within(bloco).findByRole('button', { name: 'Retirar dos livros mesmo assim' })
      expect(bloco).toHaveTextContent(FALTA_V)
      expect(within(bloco).queryByRole('button', { name: /Excluir/ })).toBeNull()
      await usuario.click(botao)
      const confirmar = within(bloco).getByRole('group', { name: 'Retirar dos livros mesmo assim?' })
      expect(confirmar).toHaveTextContent(
        'GL-900010 fica reservado para ele. Nada se apaga: as notas e hipóteses ligadas a este verbete ficam guardadas, mas sem ele até você restaurar. Ao restaurar, ele volta com o mesmo GL-900010 e tudo volta a se ligar a ele.',
      )
      expect(within(confirmar).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
      // Cancelar não grava e devolve o foco
      await usuario.click(within(confirmar).getByRole('button', { name: 'Cancelar' }))
      expect(within(bloco).getByRole('button', { name: 'Retirar dos livros mesmo assim' })).toHaveFocus()
      expect(excluido('verbete', 'GL-teste123-1')).toBe(false)
      expect(estadoAtual().registro('verbete', 'GL-iiiiiiii-1')).toBeUndefined()
      await usuario.click(within(bloco).getByRole('button', { name: 'Retirar dos livros mesmo assim' }))
      await usuario.click(within(within(bloco).getByRole('group')).getByRole('button', { name: 'Retirar' }))
      await waitFor(() => expect([excluido('verbete', 'GL-teste123-1'), excluido('verbete', 'GL-iiiiiiii-1')]).toEqual([true, true]))
      // a origem que faltava ficou só com a marca (sem campos)
      expect(Object.keys(estadoAtual().registro('verbete', 'GL-iiiiiiii-1')!.campos)).toHaveLength(0)
      const restaurar = await within(bloco).findByRole('button', { name: 'Restaurar' })
      expect(restaurar).toHaveFocus()
      expect(within(bloco).getByRole('status')).toHaveTextContent('Você excluiu os seus 2 verbetes. Sai dos livros na próxima importação. Até lá, «Restaurar» fica aqui.')
      expect(within(bloco).queryByRole('button', { name: /Retirar/ })).toBeNull()
      // se a origem que faltava chegar depois (um criar de HLC mais antigo que a marca), continua excluída
      const marca = estadoAtual().marcaDeExclusao('verbete', 'GL-iiiiiiii-1')!
      const antes = `${String(Number(marca.hlc.slice(0, 13)) - 60_000).padStart(13, '0')}-0000-apxxxxxx`
      await receberEventos([{ v: 1, id: 'apxxxxxx-1-1', hlc: antes, aparelho: 'apxxxxxx', tipo: 'verbete', reg: 'GL-iiiiiiii-1', op: 'criar', campos: { forma: 'chegou tarde', status: 'proposed' } }])
      expect(estadoAtual().registro('verbete', 'GL-iiiiiiii-1')?.campos.forma).toBe('chegou tarde')
      expect(excluido('verbete', 'GL-iiiiiiii-1')).toBe(true)
      await within(bloco).findByText(/Você excluiu os seus 2 verbetes/)
      // Restaurar traz as duas (a que só tinha a marca também), numa gravação
      await usuario.click(within(bloco).getByRole('button', { name: 'Restaurar' }))
      await waitFor(() => expect([excluido('verbete', 'GL-teste123-1'), excluido('verbete', 'GL-iiiiiiii-1')]).toEqual([false, false]))
      r.unmount()
    } finally {
      await volta()
    }
  })

  it('restaurar uma origem que só tem a marca: ela volta a "faltar" e o bloco oferece a retirada de novo (a entrada continua nos livros)', async () => {
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-jjjjjjjj-1', 'GL-900010', 'verbete', 1)`)
    try {
      const usuario = userEvent.setup()
      const r = renderizarRota('/verbete/GL-900010')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await usuario.click(await within(bloco).findByRole('button', { name: 'Retirar dos livros mesmo assim' }))
      await usuario.click(within(within(bloco).getByRole('group')).getByRole('button', { name: 'Retirar' }))
      await usuario.click(await within(bloco).findByRole('button', { name: 'Restaurar' }))
      await waitFor(() => expect([excluido('verbete', 'GL-teste123-1'), excluido('verbete', 'GL-jjjjjjjj-1')]).toEqual([false, false]))
      expect(await within(bloco).findByRole('button', { name: 'Retirar dos livros mesmo assim' })).toBeInTheDocument()
      expect(bloco).toHaveTextContent(FALTA_V)
      r.unmount()
    } finally {
      await volta()
    }
  })

  it('sítio: o mesmo, com «sítio»', async () => {
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('SI-iiiiiiii-1', 'TESTE-3', 'sitio', 1)`)
    try {
      const usuario = userEvent.setup()
      const r = renderizarRota('/sitio/TESTE-3')
      const bloco = await screen.findByRole('region', { name: 'Este sítio veio de você' })
      await usuario.click(await within(bloco).findByRole('button', { name: 'Retirar dos livros mesmo assim' }))
      expect(bloco).toHaveTextContent(FALTA_S)
      const confirmar = within(bloco).getByRole('group', { name: 'Retirar dos livros mesmo assim?' })
      expect(confirmar).toHaveTextContent('TESTE-3 fica reservado para ele. Nada se apaga: os objetos, as notas e as correções ligados a este sítio ficam guardados')
      await usuario.click(within(confirmar).getByRole('button', { name: 'Retirar' }))
      await waitFor(() => expect([excluido('sitio', 'SI-teste123-1'), excluido('sitio', 'SI-iiiiiiii-1')]).toEqual([true, true]))
      await usuario.click(await within(bloco).findByRole('button', { name: 'Restaurar' }))
      await waitFor(() => expect([excluido('sitio', 'SI-teste123-1'), excluido('sitio', 'SI-iiiiiiii-1')]).toEqual([false, false]))
      r.unmount()
    } finally {
      await volta()
    }
  })

  it('duas faltando: o plural', async () => {
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('SI-kkkkkkkk-1', 'TESTE-3', 'sitio', 1), ('SI-kkkkkkkk-2', 'TESTE-3', 'sitio', 1)`)
    try {
      const r = renderizarRota('/sitio/TESTE-3')
      const bloco = await screen.findByRole('region', { name: 'Este sítio veio de você' })
      await within(bloco).findByRole('button', { name: 'Retirar dos livros mesmo assim' })
      expect(bloco).toHaveTextContent(
        'Faltam neste aparelho 2 sítios seus que levam a esta entrada. Se eles não chegaram depois de sincronizar, podem ter se perdido. Você pode retirar a entrada dos livros mesmo assim: os seus sítios que levam a ela vão para Excluídos, e ela sai dos livros na próxima importação.',
      )
      r.unmount()
    } finally {
      await volta()
    }
  })

  it.each([
    ['por enviar', { porEnviar: 2 }],
    ['sincronizando', { estado: 'sincronizando' as const }],
    ['sem internet', { estado: 'sem-internet' as const }],
    ['erro', { estado: { erro: 'geral' as const, mensagem: 'Falhou' } }],
  ])('com a sincronização em «%s» o bloco continua pedindo para sincronizar, sem o botão', async (_n, sync) => {
    definirSync(sync)
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-llllllll-1', 'GL-900010', 'verbete', 1)`)
    try {
      const r = renderizarRota('/verbete/GL-900010')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await within(bloco).findByText(/Sincronize para ver todos/)
      expect(within(bloco).queryByRole('button')).toBeNull()
      expect(bloco).not.toHaveTextContent(/retirar/i)
      r.unmount()
    } finally {
      await volta()
    }
  })

  it('já excluída a que este aparelho tem e outra faltando: Restaurar e a retirada (as vivas, inclusive a que falta)', async () => {
    await registrar('verbete', 'GL-teste123-1', 'excluir', {})
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-mmmmmmmm-1', 'GL-900010', 'verbete', 1)`)
    try {
      const usuario = userEvent.setup()
      const r = renderizarRota('/verbete/GL-900010')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await usuario.click(await within(bloco).findByRole('button', { name: 'Retirar dos livros mesmo assim' }))
      await usuario.click(within(within(bloco).getByRole('group')).getByRole('button', { name: 'Retirar' }))
      await waitFor(() => expect(excluido('verbete', 'GL-mmmmmmmm-1')).toBe(true))
      expect(within(bloco).getByRole('status')).toHaveTextContent('Sai dos livros na próxima importação.')
      await usuario.click(await within(bloco).findByRole('button', { name: 'Restaurar' }))
      await waitFor(() => expect([excluido('verbete', 'GL-teste123-1'), excluido('verbete', 'GL-mmmmmmmm-1')]).toEqual([false, false]))
      r.unmount()
    } finally {
      await volta()
    }
  })

  it('revisão 1 (1): nenhuma origem chegou a este aparelho: o bloco aparece com o texto e o botão, e retirar grava só a marca', async () => {
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-nnnnnnnn-1', 'GL-900001', 'verbete', 1)`)
    try {
      const usuario = userEvent.setup()
      const r = renderizarRota('/verbete/GL-900001')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await within(bloco).findByRole('button', { name: 'Retirar dos livros mesmo assim' })
      expect(bloco).toHaveTextContent(FALTA_V)
      await usuario.click(within(bloco).getByRole('button', { name: 'Retirar dos livros mesmo assim' }))
      await usuario.click(within(within(bloco).getByRole('group')).getByRole('button', { name: 'Retirar' }))
      await waitFor(() => expect(excluido('verbete', 'GL-nnnnnnnn-1')).toBe(true))
      // a origem que só tem a marca não tem nome visível: nunca «» vazio nem o nome da entrada repetido (N-2)
      const aviso = await within(bloco).findByRole('button', { name: 'Restaurar' })
      expect(bloco).not.toHaveTextContent('«»')
      expect(bloco).not.toHaveTextContent('leão-de-teste')
      expect(bloco).toHaveTextContent(/Você excluiu o seu verbete que não chegou\. Sai dos livros na próxima importação\./)
      await usuario.click(aviso)
      await waitFor(() => expect(excluido('verbete', 'GL-nnnnnnnn-1')).toBe(false))
      expect(await within(bloco).findByRole('button', { name: 'Retirar dos livros mesmo assim' })).toBeInTheDocument()
      r.unmount()
    } finally {
      await volta()
    }
  })

  it('revisão 1 (1): sem origem em nenhum aparelho e sincronização fora de «em dia»: nada de bloco', async () => {
    definirSync({ porEnviar: 1 })
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-nnnnnnnn-2', 'GL-900001', 'verbete', 1)`)
    try {
      const r = renderizarRota('/verbete/GL-900001')
      await screen.findByRole('heading', { level: 1, name: /leão-de-teste/ })
      await act(async () => {})
      expect(screen.queryByRole('region', { name: /veio de você/ })).toBeNull()
      r.unmount()
    } finally {
      await volta()
    }
  })

  it.each([
    ['nunca sincronizou neste aparelho', { ultimaEm: null }],
    ['a sincronização ainda não começou', { iniciado: false }],
  ])('revisão 1 (2): %s: «sincronizado» é só o estado inicial, sem o botão', async (_n, sync) => {
    definirSync(sync)
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-oooooooo-1', 'GL-900010', 'verbete', 1)`)
    try {
      const r = renderizarRota('/verbete/GL-900010')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await within(bloco).findByText(/Sincronize para ver todos/)
      expect(within(bloco).queryByRole('button')).toBeNull()
      r.unmount()
    } finally {
      await volta()
    }
  })

  it('revisão 1 (3a) e N-2: restaurada só a origem presente, a que só tem a marca fica excluída e é dita sem nome (o nome não se repete)', async () => {
    await registrar('verbete', 'GL-pppppppp-1', 'excluir', {})
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-pppppppp-1', 'GL-900010', 'verbete', 1)`)
    try {
      const r = renderizarRota('/verbete/GL-900010')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await waitFor(() => expect(bloco).toHaveTextContent(/Você já excluiu/))
      expect(bloco).not.toHaveTextContent('«»')
      expect(within(bloco).getByText(/^Publicado a partir/)).toHaveTextContent(
        'Publicado a partir de 2 verbetes seus («amuleto de prova» e 1 que não chegou). Você já excluiu 1 verbete seu que não chegou; se excluir «amuleto de prova», ele sai dos livros na próxima importação.',
      )
      expect(bloco.textContent!.match(/amuleto de prova/g)).toHaveLength(2)
      r.unmount()
    } finally {
      await volta()
    }
  })

  it('revisão 1 (3b) e N-2: só a marca está excluída e a origem com campos não chegou: o aviso não dá nome à que só tem a marca', async () => {
    definirSync({ porEnviar: 1 })
    await registrar('verbete', 'GL-qqqqqqqq-1', 'excluir', {})
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-qqqqqqqq-1', 'GL-900001', 'verbete', 1), ('GL-qqqqqqqq-2', 'GL-900001', 'verbete', 1)`)
    try {
      const r = renderizarRota('/verbete/GL-900001')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await waitFor(() =>
        expect(within(bloco).getByRole('status')).toHaveTextContent(
          'Você excluiu o seu verbete que não chegou. Mais 1 verbete seu leva a este verbete e ainda não chegou a este aparelho: enquanto ele existir, este verbete continua nos livros. Sincronize para vê-lo.',
        ),
      )
      r.unmount()
    } finally {
      await volta()
    }
  })

  it('revisão 1 (4): uma excluída e outra faltando, sincronização em dia: o aviso é o texto da §5, com Restaurar e a retirada', async () => {
    await registrar('verbete', 'GL-teste123-1', 'excluir', {})
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-rrrrrrrr-1', 'GL-900010', 'verbete', 1)`)
    try {
      const usuario = userEvent.setup()
      const r = renderizarRota('/verbete/GL-900010')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await waitFor(() => expect(within(bloco).getByRole('status')).toHaveTextContent(FALTA_V))
      expect(bloco).not.toHaveTextContent(/Sincronize para vê-lo/)
      expect(within(bloco).getByRole('button', { name: 'Restaurar' })).toBeInTheDocument()
      await usuario.click(within(bloco).getByRole('button', { name: 'Retirar dos livros mesmo assim' }))
      expect(within(bloco).getByRole('group', { name: 'Retirar dos livros mesmo assim?' })).toBeInTheDocument()
      r.unmount()
    } finally {
      await volta()
    }
  })

  it('N-1: nenhuma origem chegou e a única, só com a marca, é restaurada com algo por enviar: o bloco fica, pede para sincronizar e o foco vai ao texto', async () => {
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-tttttttt-1', 'GL-900001', 'verbete', 1)`)
    try {
      const usuario = userEvent.setup()
      const r = renderizarRota('/verbete/GL-900001')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await usuario.click(await within(bloco).findByRole('button', { name: 'Retirar dos livros mesmo assim' }))
      await usuario.click(within(within(bloco).getByRole('group')).getByRole('button', { name: 'Retirar' }))
      await waitFor(() => expect(excluido('verbete', 'GL-tttttttt-1')).toBe(true))
      // a marca ainda não subiu: a sincronização não está mais «em dia»
      act(() => definirSync({ porEnviar: 1 }))
      await usuario.click(await within(bloco).findByRole('button', { name: 'Restaurar' }))
      await waitFor(() => expect(excluido('verbete', 'GL-tttttttt-1')).toBe(false))
      act(() => definirSync({ porEnviar: 2 }))
      // o bloco continua na página, com o texto de «sincronize»
      const continua = screen.getByRole('region', { name: 'Este verbete veio de você' })
      const texto = within(continua).getByText(/^Falta neste aparelho/)
      expect(texto).toHaveTextContent(
        'Falta neste aparelho 1 verbete seu que leva a esta entrada. Sincronize para vê-lo; enquanto ele existir, este verbete continua nos livros.',
      )
      expect(continua).not.toHaveTextContent('leão-de-teste')
      expect(within(continua).queryByRole('button')).toBeNull()
      // o foco não se perde (não cai no body)
      await waitFor(() => expect(texto).toHaveFocus())
      r.unmount()
    } finally {
      await volta()
    }
  })

  it('NB-1: no computador (o Glossário continua montado), depois do N-1, outro verbete sem origem não mostra o bloco', async () => {
    instalarMatchMedia(1280)
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-vvvvvvvv-1', 'GL-900001', 'verbete', 1)`)
    try {
      const usuario = userEvent.setup()
      const r = renderizarRota('/verbete/GL-900001')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await usuario.click(await within(bloco).findByRole('button', { name: 'Retirar dos livros mesmo assim' }))
      await usuario.click(within(within(bloco).getByRole('group')).getByRole('button', { name: 'Retirar' }))
      await waitFor(() => expect(excluido('verbete', 'GL-vvvvvvvv-1')).toBe(true))
      act(() => definirSync({ porEnviar: 1 }))
      await usuario.click(await within(bloco).findByRole('button', { name: 'Restaurar' }))
      await waitFor(() => expect(excluido('verbete', 'GL-vvvvvvvv-1')).toBe(false))
      await within(screen.getByRole('region', { name: 'Este verbete veio de você' })).findByText(/^Falta neste aparelho/)
      // outro verbete do livro, sem origem nenhuma: a mesma tela, outro id
      act(() => irPara('/verbete/GL-900008'))
      await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent('/verbete/GL-900008'))
      await waitFor(() => expect(screen.getAllByRole('heading').map((h) => h.textContent).join('|')).toMatch(VERBETE_SEM_ORIGEM))
      await act(async () => {})
      expect(screen.queryByRole('region', { name: /veio de você/ })).toBeNull()
      expect(document.body).not.toHaveTextContent(/Faltam? neste aparelho/)
      r.unmount()
    } finally {
      await volta()
    }
  })

  it('P5: «Retirar dos livros mesmo assim» guarda neste aparelho o nome da entrada para cada origem que faltava (a marca segue sem campos)', async () => {
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-wwwwwwww-1', 'GL-900001', 'verbete', 1)`)
    try {
      const usuario = userEvent.setup()
      const r = renderizarRota('/verbete/GL-900001')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await usuario.click(await within(bloco).findByRole('button', { name: 'Retirar dos livros mesmo assim' }))
      await usuario.click(within(within(bloco).getByRole('group')).getByRole('button', { name: 'Retirar' }))
      await waitFor(() => expect(excluido('verbete', 'GL-wwwwwwww-1')).toBe(true))
      expect(Object.keys(estadoAtual().registro('verbete', 'GL-wwwwwwww-1')!.campos)).toHaveLength(0)
      await waitFor(async () => expect((await lerConfig<Record<string, string>>(CHAVE_DOS_NOMES))?.['GL-wwwwwwww-1']).toBe('leão-de-teste'))
      r.unmount()
    } finally {
      await volta()
    }
  })

  it('P5: uma origem retirada noutro aparelho (só a marca chegou aqui) também tem o nome guardado ao abrir a página', async () => {
    await registrar('verbete', 'GL-xxxxxxxx-1', 'excluir', {})
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-xxxxxxxx-1', 'GL-900001', 'verbete', 1)`)
    try {
      const r = renderizarRota('/verbete/GL-900001')
      await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await waitFor(async () => expect((await lerConfig<Record<string, string>>(CHAVE_DOS_NOMES))?.['GL-xxxxxxxx-1']).toBe('leão-de-teste'))
      r.unmount()
    } finally {
      await volta()
    }
  })

  it('m-1: o nome guardado é o dos livros, não a forma corrigida pela pessoa', async () => {
    await registrar('verbete', 'GL-900001', 'alterar', { formaEmUso: 'leão corrigido TESTE' })
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-yyyyyyyy-1', 'GL-900001', 'verbete', 1)`)
    try {
      const usuario = userEvent.setup()
      const r = renderizarRota('/verbete/GL-900001')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await usuario.click(await within(bloco).findByRole('button', { name: 'Retirar dos livros mesmo assim' }))
      await usuario.click(within(within(bloco).getByRole('group')).getByRole('button', { name: 'Retirar' }))
      await waitFor(() => expect(excluido('verbete', 'GL-yyyyyyyy-1')).toBe(true))
      await waitFor(async () => expect((await lerConfig<Record<string, string>>(CHAVE_DOS_NOMES))?.['GL-yyyyyyyy-1']).toBe('leão-de-teste'))
      r.unmount()
    } finally {
      await registrar('verbete', 'GL-900001', 'alterar', { formaEmUso: null })
      await volta()
    }
  })

  it('N-2: duas origens que nunca chegaram, retiradas: o aviso não repete o nome da entrada', async () => {
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-uuuuuuuu-1', 'GL-900001', 'verbete', 1), ('GL-uuuuuuuu-2', 'GL-900001', 'verbete', 1)`)
    try {
      const usuario = userEvent.setup()
      const r = renderizarRota('/verbete/GL-900001')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await usuario.click(await within(bloco).findByRole('button', { name: 'Retirar dos livros mesmo assim' }))
      await usuario.click(within(within(bloco).getByRole('group')).getByRole('button', { name: 'Retirar' }))
      await waitFor(() => expect([excluido('verbete', 'GL-uuuuuuuu-1'), excluido('verbete', 'GL-uuuuuuuu-2')]).toEqual([true, true]))
      await waitFor(() =>
        expect(within(bloco).getByRole('status')).toHaveTextContent('Você excluiu os seus 2 verbetes. Sai dos livros na próxima importação. Até lá, «Restaurar» fica aqui.'),
      )
      expect(bloco).not.toHaveTextContent('leão-de-teste')
      r.unmount()
    } finally {
      await volta()
    }
  })

  it('revisão 1 (6): se a gravação falha, diz «Não foi possível retirar; tente de novo.» e devolve o foco ao botão', async () => {
    await comFalta(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-ssssssss-1', 'GL-900010', 'verbete', 1)`)
    try {
      const usuario = userEvent.setup()
      const r = renderizarRota('/verbete/GL-900010')
      const bloco = await screen.findByRole('region', { name: 'Este verbete veio de você' })
      await usuario.click(await within(bloco).findByRole('button', { name: 'Retirar dos livros mesmo assim' }))
      vi.mocked(registrarVarios).mockRejectedValueOnce(new Error('falhou'))
      await usuario.click(within(within(bloco).getByRole('group')).getByRole('button', { name: 'Retirar' }))
      expect(await within(bloco).findByRole('alert')).toHaveTextContent('Não foi possível retirar; tente de novo.')
      expect(within(bloco).getByRole('button', { name: 'Retirar dos livros mesmo assim' })).toHaveFocus()
      expect(estadoAtual().registro('verbete', 'GL-ssssssss-1')).toBeUndefined() // nada foi gravado
      r.unmount()
    } finally {
      await volta()
    }
  })
})
