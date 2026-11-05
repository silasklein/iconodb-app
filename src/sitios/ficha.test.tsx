/**
 * Tarefa 12: o sítio na ficha do objeto (ItemSitio.dc.html, PC-ItemSitio.dc.html): o nome de agora (corrigido, trocado,
 * excluído) na ficha do item, no cartão, na ficha do objeto SKC e na linha da coleção; "Escolher ou trocar o sítio" (a folha
 * "Sítio deste objeto"); "Novo sítio «…»" no NovoObjeto e na ficha do SKC, na MESMA gravação do objeto; e a Revisão, que
 * conta os "sítios não resolvidos" descontando o que a pessoa ligou.
 */
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { numerosDosObjetos } from '../banco/consultas'
import { usarArmazemDasImagens, usarCacheDasImagens } from '../imagens-usuario/local'
import { usarEscritaDasImagens } from '../imagens-usuario/urls'
import { definirFonteDosNumerosDoPacote, recarregarNumerosDoPacote } from '../objetos-skc/pacote'
import { armazemMemoria } from '../pacote/armazem'
import { cacheMemoria } from '../pacote/imagens'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import * as armazem from '../usuario/armazem'
import { todosEventos } from '../usuario/armazem'
import { estadoAtual, registrar } from '../usuario/estado'
import { descarregarPendentes } from '../usuario/pendentes'
import { lerTrocaDeSitio } from './modelo'
import { apertarQuandoPronto } from '../test/teclas'

vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)
vi.mock('../pacote/imagens', async (original) => ({ ...(await original<typeof import('../pacote/imagens')>()), urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

beforeAll(async () => {
  usarMotor(await bancoDeTeste({ escrita: true }))
  usarFoldDoPacoteSintetico()
  Element.prototype.scrollIntoView = vi.fn()
  await registrar('sitio', 'SI-aaaaaaaa-1', 'criar', { nome: 'Tell Inventado', variantes: ['Tall Inventada'], regiao: 'Negev' })
})
afterAll(() => usarMotor(null))
beforeEach(async () => {
  localStorage.clear()
  instalarMatchMedia(375)
  usarArmazemDasImagens(armazemMemoria())
  usarCacheDasImagens(cacheMemoria())
  usarEscritaDasImagens(async () => null)
  definirFonteDosNumerosDoPacote(numerosDosObjetos)
  await recarregarNumerosDoPacote()
  // um teste não deixa o sítio trocado nem corrigido para o seguinte
  for (const r of estadoAtual().registros.get('item-sitio')?.values() ?? []) if (r.campos.sitio) await registrar('item-sitio', r.id, 'alterar', { sitio: null, sitioNome: null })
  await registrar('sitio', 'TESTE-2', 'alterar', { nome: null, variantes: null })
  await registrar('sitio', 'SI-aaaaaaaa-1', 'restaurar')
})
afterEach(() => {
  usarArmazemDasImagens(undefined)
  usarCacheDasImagens(undefined)
  usarEscritaDasImagens(undefined)
  definirFonteDosNumerosDoPacote(null)
})

const ficha = () => screen.getByRole('group', { name: 'Ficha' })
const trocaDe = (numero: string) => {
  const r = estadoAtual().registro('item-sitio', numero)
  return r ? lerTrocaDeSitio(r) : null
}
/** Os eventos gravados depois de `antes` (os ids de então): a ordem do IndexedDB é pela chave, não pela gravação. */
const idsDeAgora = async () => new Set((await todosEventos()).map((e) => e.id))
const novosDesde = async (antes: Set<string>) => (await todosEventos()).filter((e) => !antes.has(e.id))

describe('a ficha do objeto do livro mostra o sítio de agora', () => {
  it('sem mexida: o nome do livro, como link; e o botão de escolher ou trocar', async () => {
    renderizarRota('/item/CA00003')
    await screen.findByTestId('item-cabeca')
    const link = await within(ficha()).findByRole('link', { name: 'Tell Probe Teste' })
    expect(link).toHaveAttribute('href', '/sitio/TESTE-2')
    expect(within(ficha()).queryByText(/no livro:/)).toBeNull()
    expect(within(ficha()).getByRole('button', { name: 'Escolher ou trocar o sítio' })).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('o sítio do livro corrigido aparece com o nome corrigido', async () => {
    await registrar('sitio', 'TESTE-2', 'alterar', { nome: 'Tell Nova Grafia' })
    renderizarRota('/item/CA00003')
    expect(await within(await screen.findByRole('group', { name: 'Ficha' })).findByRole('link', { name: 'Tell Nova Grafia' })).toHaveAttribute('href', '/sitio/TESTE-2')
  })

  it('sem sítio no livro: "sem sítio" e o botão de escolher', async () => {
    await executar('DELETE FROM pub_TESTE.assertion WHERE subject_id = ? AND field = ?', { 1: 'TESTE-0004', 2: 'findspot' }).catch(() => undefined)
    await executar("UPDATE pub_TESTE.assertion SET site_id = NULL WHERE subject_id = 'TESTE-0004' AND field = 'findspot'")
    renderizarRota('/item/CA00004')
    await screen.findByTestId('item-cabeca')
    await waitFor(() => expect(within(ficha()).getByText('sem sítio')).toBeInTheDocument())
    expect(within(ficha()).getByRole('button', { name: 'Escolher ou trocar o sítio' })).toBeInTheDocument()
    await executar("UPDATE pub_TESTE.assertion SET site_id = 2 WHERE subject_id = 'TESTE-0004' AND field = 'findspot'")
  })

  it('trocado por um sítio do usuário: o nome dele e "no livro: …"; excluído, o nome fica com a marca "excluído"', async () => {
    await registrar('item-sitio', 'CA00003', 'alterar', { sitio: 'SI-aaaaaaaa-1', sitioNome: 'Tell Inventado' })
    renderizarRota('/item/CA00003')
    const f = await screen.findByRole('group', { name: 'Ficha' })
    expect(await within(f).findByRole('link', { name: 'Tell Inventado' })).toHaveAttribute('href', '/sitio/SI-aaaaaaaa-1')
    expect(within(f).getByText('no livro: Tell Probe Teste')).toBeInTheDocument()
    await act(() => registrar('sitio', 'SI-aaaaaaaa-1', 'excluir'))
    await waitFor(() => expect(within(f).getByText('excluído')).toBeInTheDocument())
    expect(within(f).getByRole('link', { name: 'Tell Inventado' })).toBeInTheDocument()
  })
})

describe('"Sítio deste objeto": trocar o sítio na ficha', () => {
  async function abrirFolha(url = '/item/CA00003') {
    renderizarRota(url)
    const f = await screen.findByRole('group', { name: 'Ficha' })
    await within(f).findAllByRole('link')
    await userEvent.click(within(f).getByRole('button', { name: 'Escolher ou trocar o sítio' }))
    return screen.findByRole('dialog', { name: 'Sítio deste objeto' })
  }

  it('abre com o sítio atual ("do livro"), a busca e a lista; Esc fecha e o foco volta ao botão', async () => {
    const d = await abrirFolha()
    expect(within(d).getByRole('heading', { level: 2 })).toHaveTextContent('Sítio deste objeto')
    expect(within(d).getByText('Atual')).toBeInTheDocument()
    expect(within(d).getByRole('link', { name: 'Tell Probe Teste' })).toHaveAttribute('href', '/sitio/TESTE-2')
    expect(within(d).getByText(/^do livro · /)).toBeInTheDocument()
    expect(within(d).getByRole('searchbox', { name: 'Buscar entre os sítios' })).toBeInTheDocument()
    const grupo = within(d).getByRole('radiogroup', { name: 'Escolher o novo sítio' })
    expect(within(grupo).getAllByRole("radio").length).toBeGreaterThanOrEqual(2)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sítio deste objeto' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Escolher ou trocar o sítio' })).toHaveFocus()
    expect(trocaDe('CA00003')?.sitio ?? null).toBeNull()
  })

  it('buscar pelo nome, pela grafia ou pelo nome antigo; escolher e "Trocar" grava o item-sitio; a ficha mostra o novo e "no livro: …"', async () => {
    const d = await abrirFolha()
    const busca = within(d).getByRole('searchbox', { name: 'Buscar entre os sítios' })
    await userEvent.type(busca, 'tall inventada')
    const grupo = within(d).getByRole('radiogroup', { name: 'Escolher o novo sítio' })
    const radios = within(grupo).getAllByRole('radio')
    expect(radios).toHaveLength(1)
    expect(radios[0]).toHaveTextContent('Tell Inventado')
    expect(radios[0]).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(radios[0]!)
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(within(d).getByRole('button', { name: 'Trocar' }))
    await waitFor(() => expect(trocaDe('CA00003')).toEqual({ sitio: 'SI-aaaaaaaa-1', sitioNome: 'Tell Inventado' }))
    expect(screen.queryByRole('dialog', { name: 'Sítio deste objeto' })).toBeNull()
    const f = screen.getByRole('group', { name: 'Ficha' })
    expect(await within(f).findByRole('link', { name: 'Tell Inventado' })).toHaveAttribute('href', '/sitio/SI-aaaaaaaa-1')
    expect(within(f).getByText('no livro: Tell Probe Teste')).toBeInTheDocument()
  })

  it('"Trocar" sem escolher diz o que falta, sem fechar nem gravar', async () => {
    const d = await abrirFolha()
    await userEvent.click(within(d).getByRole('button', { name: 'Trocar' }))
    expect(await within(d).findByRole('alert')).toHaveTextContent('Escolha um sítio na lista.')
    expect(trocaDe('CA00003')?.sitio ?? null).toBeNull()
  })

  it('"Voltar ao sítio do livro" desfaz a troca (o dado do livro nunca foi tocado)', async () => {
    await registrar('item-sitio', 'CA00003', 'alterar', { sitio: 'TESTE-1', sitioNome: 'Maḥteṣ Teste' })
    const d = await abrirFolha()
    expect(within(d).getByText(/trocado por você/)).toBeInTheDocument()
    await userEvent.click(within(d).getByRole('button', { name: 'Voltar ao sítio do livro' }))
    await waitFor(() => expect(trocaDe('CA00003')).toEqual({ sitio: null, sitioNome: null }))
    const f = screen.getByRole('group', { name: 'Ficha' })
    expect(await within(f).findByRole('link', { name: 'Tell Probe Teste' })).toBeInTheDocument()
  })

  it('"Novo sítio «…»" cria o sítio e liga o objeto na mesma gravação; "Novo sítio com mais dados…" leva ao formulário com o nome e o objeto', async () => {
    const d = await abrirFolha()
    const busca = within(d).getByRole('searchbox', { name: 'Buscar entre os sítios' })
    await userEvent.type(busca, 'Tell Rápido')
    const link = within(d).getByRole('link', { name: 'Novo sítio com mais dados…' })
    expect(link.getAttribute('href')).toBe('/sitios/novo?nome=Tell+R%C3%A1pido&para=CA00003')
    // os dois atalhos não se confundem: um cria já só com o nome, o outro abre o formulário completo
    expect(within(d).getByRole('button', { name: 'Novo sítio «Tell Rápido»' })).toBeInTheDocument()
    expect(within(d).queryByRole('link', { name: 'Novo sítio…' })).toBeNull()
    const antes = await idsDeAgora()
    await userEvent.click(within(d).getByRole('button', { name: 'Novo sítio «Tell Rápido»' }))
    await waitFor(() => expect(trocaDe('CA00003')?.sitioNome).toBe('Tell Rápido'))
    const eventos = await novosDesde(antes)
    const [a, b] = [eventos.find((e) => e.tipo === 'sitio')!, eventos.find((e) => e.tipo === 'item-sitio')!]
    expect(a.op).toBe('criar')
    // uma transação: o mesmo número de gravação, posições seguidas
    expect(a.id.split('-').slice(0, 2)).toEqual(b.id.split('-').slice(0, 2))
    expect(trocaDe('CA00003')?.sitio).toBe(a.reg)
    expect(within(screen.getByRole('group', { name: 'Ficha' })).getByRole('link', { name: 'Tell Rápido' })).toHaveAttribute('href', `/sitio/${a.reg}`)
  })

  it('um nome que já existe não oferece o atalho de criar (o existente aparece na lista)', async () => {
    const d = await abrirFolha()
    await userEvent.type(within(d).getByRole('searchbox', { name: 'Buscar entre os sítios' }), 'tall inventada')
    expect(within(d).queryByRole('button', { name: /^Novo sítio «/ })).toBeNull()
  })

  it('no computador é um diálogo', async () => {
    instalarMatchMedia(1280)
    const d = await abrirFolha()
    expect(d).toHaveClass('trocar-sitio-dialogo')
  })
})

describe('os nomes de agora nos cartões, na ficha SKC e nas coleções', () => {
  it('o cartão do objeto (grupo) mostra o nome corrigido e o sítio trocado', async () => {
    await registrar('sitio', 'TESTE-2', 'alterar', { nome: 'Tell Nova Grafia' })
    await registrar('item-sitio', 'CA00001', 'alterar', { sitio: 'SI-aaaaaaaa-1', sitioNome: 'Tell Inventado' })
    renderizarRota('/grupo/GR-TESTE-I-01')
    const cartao = (nr: string) => screen.getAllByRole('link').find((a) => a.getAttribute('href') === `/item/${nr}`)!
    await waitFor(() => expect(cartao('CA00003')).toBeDefined())
    expect(within(cartao('CA00003')).getByText('Tell Nova Grafia')).toBeInTheDocument()
    await waitFor(() => expect(within(cartao('CA00001')).getByText('Tell Inventado')).toBeInTheDocument())
    expect(within(cartao('CA00002')).getByText('Maḥteṣ Teste')).toBeInTheDocument()
    // excluído: o nome continua, com a marca
    await act(() => registrar('sitio', 'SI-aaaaaaaa-1', 'excluir'))
    await waitFor(() => expect(within(cartao('CA00001')).getByText(/Tell Inventado.*excluído/)).toBeInTheDocument())
  })

  it('r2: um sítio que ainda não chegou a este aparelho diz «ainda não sincronizado» (na ficha e no cartão), não «excluído»', async () => {
    await registrar('item-sitio', 'CA00003', 'alterar', { sitio: 'SI-zzzzzzzz-9', sitioNome: 'Tell Distante' })
    renderizarRota('/item/CA00003')
    const f = await screen.findByRole('group', { name: 'Ficha' })
    expect(await within(f).findByText('ainda não sincronizado')).toBeInTheDocument()
    expect(within(f).queryByText('excluído')).toBeNull()
    cleanup()
    renderizarRota('/grupo/GR-TESTE-I-01')
    const cartao = await waitFor(() => {
      const c = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/item/CA00003')
      expect(c).toBeDefined()
      return c!
    })
    await waitFor(() => expect(within(cartao).getByText(/Tell Distante · ainda não sincronizado/)).toBeInTheDocument())
    expect(within(cartao).queryByText(/excluído/)).toBeNull()
    await registrar('item-sitio', 'CA00003', 'alterar', { sitio: null, sitioNome: null })
  })

  it('a ficha do objeto SKC liga ao sítio do usuário (a rota existe) e mostra o nome de agora e a marca "excluído"', async () => {
    await registrar('objeto', 'OB-aaaaaaaa-9', 'criar', { periodo: 'CA', pedido: 'CA00005', titulo: 'Escaraveu de teste.', sitio: 'SI-aaaaaaaa-1', sitioNome: 'nome antigo guardado', origemTipo: 'achado' })
    renderizarRota('/item/OB-aaaaaaaa-9')
    const f = await screen.findByRole('group', { name: 'Ficha' })
    expect(within(f).getByRole('link', { name: 'Tell Inventado' })).toHaveAttribute('href', '/sitio/SI-aaaaaaaa-1')
    await act(() => registrar('sitio', 'SI-aaaaaaaa-1', 'alterar', { nome: 'Tell Renomeado' }))
    expect(await within(f).findByRole('link', { name: 'Tell Renomeado' })).toBeInTheDocument()
    await act(() => registrar('sitio', 'SI-aaaaaaaa-1', 'excluir'))
    await waitFor(() => expect(within(f).getByText('excluído')).toBeInTheDocument())
    await registrar('sitio', 'SI-aaaaaaaa-1', 'alterar', { nome: 'Tell Inventado' })
    await registrar('objeto', 'OB-aaaaaaaa-9', 'excluir')
  })

  it('um objeto SKC com sítio do livro corrigido mostra o nome corrigido e liga a /sitio/TESTE-2', async () => {
    await registrar('objeto', 'OB-aaaaaaaa-8', 'criar', { periodo: 'CA', pedido: 'CA00005', titulo: 'Outro escaraveu.', sitio: 'TESTE-2', sitioNome: 'Tell Probe Teste', origemTipo: 'achado' })
    await registrar('sitio', 'TESTE-2', 'alterar', { nome: 'Tell Nova Grafia' })
    renderizarRota('/item/OB-aaaaaaaa-8')
    const f = await screen.findByRole('group', { name: 'Ficha' })
    expect(within(f).getByRole('link', { name: 'Tell Nova Grafia' })).toHaveAttribute('href', '/sitio/TESTE-2')
    await registrar('objeto', 'OB-aaaaaaaa-8', 'excluir')
  })
})

describe('"Novo sítio «…»" no NovoObjeto e na ficha do objeto SKC', () => {
  const novosSitios = () => [...(estadoAtual().registros.get('sitio')?.values() ?? [])].filter((r) => /^SI-/.test(r.id))

  it('NovoObjeto: a opção do Sítio é "Novo sítio «…»" (e não "Usar … como nome"); salvar cria o sítio e o objeto na mesma gravação', async () => {
    renderizarRota('/objeto/novo')
    await userEvent.type(await screen.findByLabelText('Tipo e descrição curta'), 'Selo com sítio novo.')
    await userEvent.click(screen.getByRole('radio', { name: /Calcolítico/ }))
    const campo = screen.getByRole('combobox', { name: 'Sítio' })
    await userEvent.type(campo, 'Tell Zeta')
    const lista = screen.getByRole('listbox', { name: 'Sítio' })
    expect(within(lista).queryByText(/Usar «/)).toBeNull()
    const opcao = within(lista).getByRole('option', { name: /Novo sítio «Tell Zeta»/ })
    await userEvent.click(opcao)
    expect(campo).toHaveValue('Tell Zeta')
    expect(screen.getByText(/Será criado o sítio «Tell Zeta»/)).toBeInTheDocument()
    const antes = await idsDeAgora()
    await userEvent.click(screen.getAllByRole('button', { name: /Salvar objeto/ })[0]!)
    await waitFor(() => expect(screen.getByTestId('endereco').textContent).toMatch(/^\/item\/OB-/))
    const eventos = await novosDesde(antes)
    const sitio = eventos.find((e) => e.tipo === 'sitio')!
    const objeto = eventos.find((e) => e.tipo === 'objeto' && e.op === 'criar')!
    expect(sitio).toMatchObject({ op: 'criar', campos: { nome: 'Tell Zeta' } })
    expect(objeto.campos).toMatchObject({ sitio: sitio.reg, sitioNome: 'Tell Zeta' })
    // uma gravação só (uma transação): o mesmo <aparelho>-<seq>
    expect(sitio.id.split('-').slice(0, 2)).toEqual(objeto.id.split('-').slice(0, 2))
  })

  it('NovoObjeto: mexer no texto depois de escolher "Novo sítio" desfaz a escolha (vira nome livre, como antes)', async () => {
    renderizarRota('/objeto/novo')
    await screen.findByLabelText('Tipo e descrição curta')
    await userEvent.click(screen.getByRole('radio', { name: /Calcolítico/ }))
    const campo = screen.getByRole('combobox', { name: 'Sítio' })
    await userEvent.type(campo, 'Tell Eta')
    await userEvent.click(within(screen.getByRole('listbox', { name: 'Sítio' })).getByRole('option', { name: /Novo sítio «Tell Eta»/ }))
    await userEvent.type(campo, ' Segundo')
    expect(screen.queryByText(/Será criado o sítio/)).toBeNull()
    const antes = novosSitios().length
    await userEvent.click(screen.getAllByRole('button', { name: /Salvar objeto/ })[0]!)
    await waitFor(() => expect(screen.getByTestId('endereco').textContent).toMatch(/^\/item\/OB-/))
    expect(novosSitios()).toHaveLength(antes) // nenhum sítio criado: ficou o nome livre
    const id = decodeURIComponent(screen.getByTestId('endereco').textContent!.slice('/item/'.length))
    expect(estadoAtual().registro('objeto', id)!.campos).toMatchObject({ sitio: '', sitioNome: 'Tell Eta Segundo' })
  })

  it('NovoObjeto: um nome que já é de um sítio (nome ou grafia) não oferece criar outro; o existente aparece', async () => {
    renderizarRota('/objeto/novo')
    await screen.findByLabelText('Tipo e descrição curta')
    const campo = screen.getByRole('combobox', { name: 'Sítio' })
    await userEvent.type(campo, 'Tall Inventada')
    const lista = screen.getByRole('listbox', { name: 'Sítio' })
    expect(within(lista).queryByRole('option', { name: /Novo sítio «/ })).toBeNull()
    expect(within(lista).getByRole('option', { name: /Tell Inventado/ })).toBeInTheDocument()
  })

  it('a ficha do SKC: se a gravação de "Novo sítio «…»" falha, a mensagem aparece, nada fica pela metade, e dá para tentar de novo', async () => {
    await registrar('objeto', 'OB-aaaaaaaa-8', 'criar', { periodo: 'CA', pedido: 'CA00005', titulo: 'Objeto da falha.', sitio: '', sitioNome: '', origemTipo: 'achado' })
    renderizarRota('/item/OB-aaaaaaaa-8')
    await screen.findByTestId('objeto-cabeca')
    await apertarQuandoPronto('f', 'item')
    const regiao = await screen.findByRole('region', { name: 'Editar a ficha' })
    const campo = within(regiao).getByRole('combobox', { name: 'Sítio' })
    await userEvent.type(campo, 'Tell Falha')
    const antes = novosSitios().length
    const falha = vi.spyOn(armazem, 'gravarNovosEventos').mockRejectedValueOnce(new Error('disco cheio'))
    await userEvent.click(within(within(regiao).getByRole('listbox', { name: 'Sítio' })).getByRole('option', { name: /Novo sítio «Tell Falha»/ }))
    expect(await within(regiao).findByRole('alert')).toHaveTextContent('Não foi possível criar o sítio «Tell Falha»; tente de novo. O que você escreveu continua no campo.')
    falha.mockRestore()
    expect(novosSitios()).toHaveLength(antes)
    expect(estadoAtual().registro('objeto', 'OB-aaaaaaaa-8')!.campos.sitio).toBe('')
    expect(campo).toHaveValue('Tell Falha')
    // de novo, agora grava, e o erro some
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Tell Falha')
    await userEvent.click(within(within(regiao).getByRole('listbox', { name: 'Sítio' })).getByRole('option', { name: /Novo sítio «Tell Falha»/ }))
    await waitFor(() => expect(novosSitios()).toHaveLength(antes + 1))
    expect(within(regiao).queryByRole('alert')).toBeNull()
    await registrar('objeto', 'OB-aaaaaaaa-8', 'excluir')
  })

  it('a ficha do SKC (Editar a ficha): "Novo sítio «…»" cria o sítio e liga o objeto na mesma gravação; o nome livre digitado continua valendo', async () => {
    await registrar('objeto', 'OB-aaaaaaaa-7', 'criar', { periodo: 'CA', pedido: 'CA00005', titulo: 'Objeto da ficha.', sitio: '', sitioNome: '', origemTipo: 'achado' })
    renderizarRota('/item/OB-aaaaaaaa-7')
    await screen.findByTestId('objeto-cabeca')
    await apertarQuandoPronto('f', 'item')
    const regiao = await screen.findByRole('region', { name: 'Editar a ficha' })
    const campo = within(regiao).getByRole('combobox', { name: 'Sítio' })
    await userEvent.type(campo, 'Tell Teta')
    const antes = await idsDeAgora()
    await userEvent.click(within(within(regiao).getByRole('listbox', { name: 'Sítio' })).getByRole('option', { name: /Novo sítio «Tell Teta»/ }))
    await waitFor(() => expect(estadoAtual().registro('objeto', 'OB-aaaaaaaa-7')!.campos.sitioNome).toBe('Tell Teta'))
    const eventos = await novosDesde(antes)
    const sitio = eventos.find((e) => e.tipo === 'sitio')!
    const ficha = eventos.find((e) => e.tipo === 'objeto')!
    expect(estadoAtual().registro('objeto', 'OB-aaaaaaaa-7')!.campos.sitio).toBe(sitio.reg)
    expect(sitio.id.split('-').slice(0, 2)).toEqual(ficha.id.split('-').slice(0, 2))
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Nome livre outra vez')
    await act(() => descarregarPendentes())
    await waitFor(() => expect(estadoAtual().registro('objeto', 'OB-aaaaaaaa-7')!.campos).toMatchObject({ sitio: '', sitioNome: 'Nome livre outra vez' }))
    await registrar('objeto', 'OB-aaaaaaaa-7', 'excluir')
  })
})

describe('a Revisão: "sítios não resolvidos" desconta o que a pessoa ligou e conta o que ficou solto', () => {
  beforeEach(async () => {
    await executar("DELETE FROM pub_TESTE.review_queue WHERE reason IN ('sitio_nao_normalizado', 'sitio_nao_resolvido')")
    // o pacote real grava `sitio_nao_resolvido` (com o candidato no detalhe); `sitio_nao_normalizado` é o outro motivo de sítio do pipeline
    for (const item of ['TESTE-0001', 'TESTE-0002']) await executar(`INSERT INTO pub_TESTE.review_queue (entity, entity_id, reason, detail) VALUES ('item', '${item}', 'sitio_nao_resolvido', 'candidato ''Tell Inventado'' (vermutlich)')`)
    await executar(`INSERT INTO pub_TESTE.review_queue (entity, entity_id, reason, detail) VALUES ('item', 'TESTE-0003', 'sitio_nao_normalizado', 'x')`)
    for (const r of estadoAtual().registros.get('objeto')?.values() ?? []) if (!r.excluido) await registrar('objeto', r.id, 'excluir')
  })
  afterAll(async () => executar("DELETE FROM pub_TESTE.review_queue WHERE reason IN ('sitio_nao_normalizado', 'sitio_nao_resolvido')"))

  /** A contagem do grupo «Sítios não resolvidos» (a mesma que o total soma). */
  const linha = () => `Sítios não resolvidos${screen.getByRole('button', { name: /^Sítios não resolvidos/ }).querySelector('.revisao-grupo-quantidade')!.textContent}`

  it('o pacote tem 3; ligar CA00001 a um sítio resolve um; excluir esse sítio faz o objeto voltar a contar; restaurar o resolve', async () => {
    renderizarRota('/revisao')
    await waitFor(() => expect(linha()).toMatch(/Sítios não resolvidos3/))
    await act(() => registrar('item-sitio', 'CA00001', 'alterar', { sitio: 'SI-aaaaaaaa-1', sitioNome: 'Tell Inventado' }))
    await waitFor(() => expect(linha()).toMatch(/Sítios não resolvidos2/))
    await act(() => registrar('sitio', 'SI-aaaaaaaa-1', 'excluir'))
    await waitFor(() => expect(linha()).toMatch(/Sítios não resolvidos3/))
    await act(() => registrar('sitio', 'SI-aaaaaaaa-1', 'restaurar'))
    await waitFor(() => expect(linha()).toMatch(/Sítios não resolvidos2/))
    // trocar por um sítio do livro também resolve
    await act(() => registrar('item-sitio', 'CA00002', 'alterar', { sitio: 'TESTE-2', sitioNome: 'Tell Probe Teste' }))
    await waitFor(() => expect(linha()).toMatch(/Sítios não resolvidos1/))
    expect(screen.getByText(/2 resolvidos por você/)).toBeInTheDocument()
    // as duas linhas do pacote que não são de sítio, mais o sítio que sobrou
    // (e os 4 verbetes do pacote ainda a revisar, e o elemento do pacote sem região)
    expect(screen.getByText(/^8 casos · /)).toBeInTheDocument()
  })

  it('objetos SKC com nome livre (ou com o sítio excluído) contam e aparecem na lista, com o nome de agora, até serem ligados', async () => {
    await registrar('objeto', 'OB-aaaaaaaa-5', 'criar', { periodo: 'CA', pedido: 'CA00005', titulo: 'Escaraveu livre.', sitio: '', sitioNome: 'Miš', origemTipo: 'achado' })
    await registrar('objeto', 'OB-aaaaaaaa-6', 'criar', { periodo: 'CA', pedido: 'CA00006', titulo: 'Escaraveu ligado.', sitio: 'SI-aaaaaaaa-1', sitioNome: 'Tell Inventado', origemTipo: 'achado' })
    renderizarRota('/revisao?abrir=sitios-nao-resolvidos')
    await waitFor(() => expect(linha()).toMatch(/Sítios não resolvidos4/))
    const secao = screen.getByRole('list', { name: 'Casos de Sítios não resolvidos' })
    expect(within(secao).getByText(/Escaraveu livre.*«Miš» ainda não é um sítio do banco/)).toBeInTheDocument()
    expect(within(secao).queryByText(/Escaraveu ligado/)).toBeNull()
    await act(() => registrar('sitio', 'SI-aaaaaaaa-1', 'excluir'))
    await waitFor(() => expect(linha()).toMatch(/Sítios não resolvidos5/))
    expect(within(secao).getByText(/Escaraveu ligado.*«Tell Inventado» foi excluído/)).toBeInTheDocument()
    // ligar o livre a um sítio do livro o resolve
    await act(() => registrar('objeto', 'OB-aaaaaaaa-5', 'alterar', { sitio: 'TESTE-1', sitioNome: 'Maḥteṣ Teste' }))
    await waitFor(() => expect(linha()).toMatch(/Sítios não resolvidos4/))
  })
})
