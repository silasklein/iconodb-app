/**
 * Tarefa 9 nas telas: NovoObjeto (erro em linha, rascunho que sobrevive ao recarregar, "Ainda não sei", origem), o
 * objeto SKC pelo Item (/item/<número> e /item/<id>), provisório e confirmado, "Editar a ficha" (F), leitura SKC limpa
 * com `[[`, ligação (as duas leituras na tela do principal e o número secundário que redireciona), Meus objetos,
 * Revisão e Menu. Sobre o pacote sintético (CA00001 a CA00004, BA00001, BA00002).
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { numerosDosObjetos } from '../banco/consultas'
import { usarArmazemDasImagens, usarCacheDasImagens } from '../imagens-usuario/local'
import { usarEscritaDasImagens } from '../imagens-usuario/urls'
import { armazemMemoria } from '../pacote/armazem'
import { cacheMemoria } from '../pacote/imagens'
import { estadoAtual, registrar } from '../usuario/estado'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Item } from '../telas/Item'
import { NovoObjeto } from '../telas/NovoObjeto'
import { Revisao } from '../telas/Revisao'
import { PainelSkc } from '../colecoes/PainelSkc'
import { Menu } from '../telas/Menu'
import { CHAVE_DOS_CONFIRMADOS, esquecerConfirmados, unirConfirmadosGuardados } from './confirmados'
import { gravarConfig } from '../usuario/diarioLocal'
import { definirFonteDosNumerosDoPacote, recarregarNumerosDoPacote } from './pacote'
import { CHAVE_DO_RASCUNHO } from './rascunhoDoNovo'
import { descarregarPendentes } from '../usuario/pendentes'
import { apertarQuandoPronto } from '../test/teclas'

vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)
vi.mock('../pacote/imagens', async (original) => ({ ...(await original<typeof import('../pacote/imagens')>()), urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

function Local() {
  const { pathname } = useLocation()
  return <output data-testid="local">{pathname}</output>
}
function abrir(caminho: string) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/item/:numero" element={<Item />} />
        <Route path="/objeto/novo" element={<NovoObjeto />} />
        <Route path="/revisao" element={<Revisao />} />
        <Route path="/colecoes" element={<PainelSkc />} />
      </Routes>
      <Local />
    </MemoryRouter>,
  )
}
const local = () => screen.getByTestId('local').textContent

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  Element.prototype.scrollIntoView = vi.fn()
})
afterAll(() => usarMotor(null))
beforeEach(async () => {
  instalarMatchMedia(375)
  usarArmazemDasImagens(armazemMemoria())
  usarCacheDasImagens(cacheMemoria())
  usarEscritaDasImagens(async () => null)
  localStorage.clear()
  definirFonteDosNumerosDoPacote(numerosDosObjetos)
  await recarregarNumerosDoPacote()
  // O IndexedDB é um só no arquivo: cada teste começa sem objetos vivos, sem confirmados e sem ligações.
  for (const r of estadoAtual().registros.get('objeto')?.values() ?? []) if (!r.excluido) await registrar('objeto', r.id, 'excluir')
  for (const r of estadoAtual().registros.get('ligacao')?.values() ?? []) if (r.campos.ativa === true) await registrar('ligacao', r.id, 'alterar', { ativa: false })
  await gravarConfig(CHAVE_DOS_CONFIRMADOS, undefined)
  esquecerConfirmados()
})
afterEach(() => {
  usarArmazemDasImagens(undefined)
  usarCacheDasImagens(undefined)
  usarEscritaDasImagens(undefined)
  definirFonteDosNumerosDoPacote(null)
})

let n = 0
async function objeto(campos: Record<string, unknown>): Promise<string> {
  const id = `OB-testeaaa-${++n}`
  await registrar('objeto', id, 'criar', { origemTipo: 'publicacao', ...campos } as never)
  return id
}

describe('NovoObjeto', () => {
  it('sem período escolhido, "Salvar objeto" mostra o erro em linha e leva o foco aos períodos (o botão nunca fica desabilitado)', async () => {
    abrir('/objeto/novo')
    const salvar = (await screen.findAllByRole('button', { name: /Salvar objeto/ }))[0]!
    expect(salvar).toBeEnabled()
    await userEvent.click(salvar)
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha o período para dar o número.')
    const grupo = screen.getByRole('radiogroup', { name: 'Período' })
    expect(grupo).toHaveAttribute('aria-invalid', 'true')
    expect(grupo.contains(document.activeElement)).toBe(true)
    expect([...(estadoAtual().registros.get('objeto')?.values() ?? [])].filter((r) => r.campos.titulo === 'sem período')).toHaveLength(0)
    // O erro some ao escolher um período.
    await userEvent.click(within(grupo).getByRole('radio', { name: /Calcolítico/ }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('o período mostra o próximo número (provisório até sincronizar); salvar grava o objeto e abre a tela dele', async () => {
    abrir('/objeto/novo')
    await userEvent.type(await screen.findByLabelText('Tipo e descrição curta'), 'Peça de teste. Cobre.')
    await userEvent.click(screen.getByRole('radio', { name: /Calcolítico/ }))
    const caixa = await screen.findByTestId('numero-novo')
    await waitFor(() => expect(caixa).toHaveTextContent('CA00005'))
    expect(caixa).toHaveTextContent(/provisório/i)
    // Decisão 38: a prévia mostra também o SKC, Nr. que o objeto vai ganhar.
    expect(caixa).toHaveTextContent('CA00005provisório · SKC: 1')
    expect(screen.getAllByRole('button', { name: /Salvar objeto CA00005/ }).length).toBeGreaterThan(0)
    await userEvent.click(screen.getAllByRole('button', { name: /Salvar objeto/ })[0]!)
    await waitFor(() => expect(local()).toMatch(/^\/item\/OB-/))
    const id = decodeURIComponent(local()!.slice('/item/'.length))
    expect(estadoAtual().registro('objeto', id)!.campos).toMatchObject({ periodo: 'CA', pedido: 'CA00005', pedidoNrSkc: '1', titulo: 'Peça de teste. Cobre.' })
    expect(localStorage.getItem(CHAVE_DO_RASCUNHO)).toBeNull()
  })

  it('"Ainda não sei" salva um rascunho sem número', async () => {
    abrir('/objeto/novo')
    await userEvent.type(await screen.findByLabelText('Tipo e descrição curta'), 'Selo sem data')
    await userEvent.click(screen.getByRole('radio', { name: /Ainda não sei/ }))
    expect(screen.getByTestId('numero-novo')).toHaveTextContent(/Sem número/)
    await userEvent.click(screen.getAllByRole('button', { name: /Salvar rascunho/ })[0]!)
    await waitFor(() => expect(local()).toMatch(/^\/item\/OB-/))
    const id = decodeURIComponent(local()!.slice('/item/'.length))
    expect(estadoAtual().registro('objeto', id)!.campos).toMatchObject({ periodo: null, pedido: null })
  })

  it('o que foi preenchido sobrevive a um recarregar (fica no armazém de emergência a cada mudança)', async () => {
    const primeira = abrir('/objeto/novo')
    await userEvent.type(await screen.findByLabelText('Tipo e descrição curta'), 'Cabeça de maça')
    await userEvent.click(screen.getByRole('radio', { name: /Bronze Antigo/ }))
    await userEvent.click(screen.getByRole('radio', { name: /Achado recente/ }))
    await userEvent.type(screen.getByLabelText(/Nota do achado/), 'visto no museu')
    primeira.unmount()
    abrir('/objeto/novo')
    expect(await screen.findByLabelText('Tipo e descrição curta')).toHaveValue('Cabeça de maça')
    expect(screen.getByRole('radio', { name: /Bronze Antigo/ })).toBeChecked()
    expect(screen.getByLabelText(/Nota do achado/)).toHaveValue('visto no museu')
    expect(screen.getByRole('status', { name: /Rascunho recuperado/ })).toBeInTheDocument()
  })

  it('origem: publicação (obra da Bibliografia, página e figura) ou achado recente com nota', async () => {
    abrir('/objeto/novo')
    await userEvent.click(await screen.findByRole('radio', { name: /Calcolítico/ }))
    const obra = screen.getByRole('combobox', { name: 'Obra' })
    await userEvent.type(obra, 'Teste')
    const opcao = (await screen.findAllByRole('option'))[0]!
    await userEvent.click(opcao)
    expect((obra as HTMLInputElement).value).not.toBe('Teste')
    await userEvent.type(screen.getByLabelText('Página'), '12')
    await userEvent.type(screen.getByLabelText('Figura'), '3')
    await userEvent.click(screen.getAllByRole('button', { name: /Salvar objeto/ })[0]!)
    await waitFor(() => expect(local()).toMatch(/^\/item\/OB-/))
    const id = decodeURIComponent(local()!.slice('/item/'.length))
    expect(estadoAtual().registro('objeto', id)!.campos).toMatchObject({ origemTipo: 'publicacao', obra: expect.stringMatching(/^BIB-/), pagina: '12', figura: '3' })
  })
})

describe('ObjetoSKC pelo Item', () => {
  it('/item/<número> de um objeto SKC: o número grande com "provisório"; confirmado, sem a marca', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'Cabeça de maça. Cobre.', material: 'Cobre', obraRotulo: 'Artigo 2025', pagina: '12', figura: '3' })
    abrir('/item/CA00005')
    const cabeca = await screen.findByTestId('objeto-cabeca')
    expect(cabeca).toHaveTextContent('CA00005')
    expect(cabeca).toHaveTextContent(/provisório/)
    expect(screen.getByRole('heading', { level: 1, name: 'Cabeça de maça. Cobre.' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Ficha' })).toHaveTextContent('Artigo 2025, p. 12, fig. 3')
    // A consolidação confirma o número e o SKC, Nr. juntos (decisão 38).
    await act(() => unirConfirmadosGuardados({ [id]: 'CA00005', [`SKC:${id}`]: '1' }))
    await waitFor(() => expect(screen.getByTestId('objeto-cabeca')).not.toHaveTextContent(/provisório/))
  })

  it('decisão 38: sob o número, "números nas fontes" com o SKC, Nr. (provisório até confirmar); a origem SKC continua sob a marca SKC', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'Cabeça de maça. Cobre.', obraRotulo: 'Artigo 2025', pagina: '12', figura: '3' })
    abrir(`/item/${id}`)
    const cabeca = await screen.findByTestId('objeto-cabeca')
    const fontes = await within(cabeca).findByTestId('numeros-nas-fontes')
    expect(fontes).toHaveTextContent(/^SKC: 1 \(provisório\)$/)
    // A ordem: o número, a linha das fontes, depois "SKC · origem".
    expect(cabeca.textContent).toMatch(/CA00005.*SKC: 1.*SKC.*Artigo 2025, p\. 12, fig\. 3/)
    await act(() => unirConfirmadosGuardados({ [id]: 'CA00005', [`SKC:${id}`]: '1' }))
    await waitFor(() => expect(within(screen.getByTestId('objeto-cabeca')).getByTestId('numeros-nas-fontes')).toHaveTextContent(/^SKC: 1$/))
  })

  it('decisão 38: o SKC, Nr. mudou (outro aparelho criou antes): o aviso diz qual era', async () => {
    await objeto({ periodo: 'CA', titulo: 'outro' })
    await objeto({ periodo: 'BA', pedidoNrSkc: '1', titulo: 'meu' })
    abrir('/item/BA00003')
    expect(await screen.findByText(/Era SKC: 1 quando foi salvo/)).toHaveTextContent('Agora é SKC: 2')
  })

  it('decisão 48: o número que um livro tomou: o aviso diz qual era e o novo (provisório; depois, definitivo), sem o aviso de "outro aparelho"', async () => {
    const id = await objeto({ periodo: 'CA', pedido: 'CA00004', numero: 'CA00004', titulo: 'tomado pelo livro' })
    try {
      await avisoDoNumeroTomado(id)
    } finally {
      // uma testemunha num objeto excluído ainda ocupa o número: os outros testes começam sem ela
      await registrar('objeto', id, 'alterar', { numero: null })
    }
  })

  async function avisoDoNumeroTomado(id: string) {
    const r = abrir('/item/CA00005')
    expect(await screen.findByText(/O número que este objeto tinha, CA00004, agora é de um objeto de livro/)).toHaveTextContent(
      'O número que este objeto tinha, CA00004, agora é de um objeto de livro; ele ganhou CA00005 (provisório até a próxima sincronização).',
    )
    expect(screen.queryByText(/outro aparelho deu esse número/)).toBeNull()
    r.unmount()
    // a consolidação escreveu a testemunha nova: o número fica definitivo, e o aviso continua
    await registrar('objeto', id, 'alterar', { numero: 'CA00005', numeroTomadoPeloLivro: 'CA00004' })
    abrir('/item/CA00005')
    expect(await screen.findByText(/O número que este objeto tinha, CA00004/)).toHaveTextContent(
      'O número que este objeto tinha, CA00004, agora é de um objeto de livro; ele ganhou CA00005, que é definitivo.',
    )
    expect(screen.queryByText(/Número provisório/)).toBeNull()
    expect(screen.queryByText(/outro aparelho deu esse número/)).toBeNull()
  }

  it('o número mudou (outro aparelho deu este número antes): o aviso diz qual era', async () => {
    await objeto({ periodo: 'CA', titulo: 'outro' })
    await objeto({ periodo: 'CA', pedido: 'CA00005', titulo: 'meu' })
    abrir('/item/CA00006')
    expect(await screen.findByText(/Era CA00005/)).toBeInTheDocument()
  })

  it('rascunho: /item/<id> mostra "sem número" e escolher o período dá o número', async () => {
    const id = await objeto({ periodo: null, titulo: 'rascunho' })
    abrir(`/item/${id}`)
    expect(await screen.findByTestId('objeto-cabeca')).toHaveTextContent(/Sem número/)
    expect(screen.queryByTestId('numeros-nas-fontes')).toBeNull() // rascunho: sem SKC, Nr. (decisão 38)
    await userEvent.click(screen.getByRole('radio', { name: /Bronze Antigo/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Dar o número' }))
    await waitFor(() => expect(screen.getByTestId('objeto-cabeca')).toHaveTextContent('BA00003'))
    expect(estadoAtual().registro('objeto', id)!.campos).toMatchObject({ periodo: 'BA', pedidoNrSkc: '1' })
    expect(screen.getByTestId('numeros-nas-fontes')).toHaveTextContent('SKC: 1')
  })

  it('"Editar a ficha" (F) abre os campos; cada campo grava sozinho (useCampoSalvo)', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'antes', material: '' })
    abrir(`/item/${id}`)
    await screen.findByTestId('objeto-cabeca')
    expect(screen.getByRole('button', { name: 'Editar a ficha' })).toHaveAttribute('aria-keyshortcuts', 'F')
    await apertarQuandoPronto('f', 'item')
    const regiao = await screen.findByRole('region', { name: 'Editar a ficha' })
    const material = within(regiao).getByLabelText('Material')
    await userEvent.type(material, 'Esteatita')
    fireEvent.blur(material)
    await waitFor(() => expect(estadoAtual().registro('objeto', id)!.campos.material).toBe('Esteatita'))
    await userEvent.click(within(regiao).getByRole('button', { name: 'Pronto' }))
    expect(screen.queryByRole('region', { name: 'Editar a ficha' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Ficha' })).toHaveTextContent('Esteatita')
  })

  it('a leitura SKC aparece limpa (links como rótulos) e "Editar a leitura" abre o campo com o código', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 't', leitura: 'os chifres de [[GL-900001|íbex]] e [[CA00001]]' })
    abrir(`/item/${id}`)
    const leituras = await screen.findByRole('region', { name: 'Leituras' })
    expect(leituras).toHaveTextContent('os chifres de íbex e CA00001')
    expect(leituras).not.toHaveTextContent('[[')
    expect(within(leituras).getByRole('link', { name: 'íbex' })).toBeInTheDocument()
    await userEvent.click(within(leituras).getByRole('button', { name: 'Editar a leitura' }))
    expect(within(leituras).getByRole('textbox', { name: /Leitura/ })).toHaveValue('os chifres de [[GL-900001|íbex]] e [[CA00001]]')
    expect(screen.getByText(/Sem leitura dos livros/)).toBeInTheDocument()
    // Hipóteses por nível: vazio, com "Registrar hipótese".
    expect(screen.getByRole('button', { name: /Hipóteses por nível/ })).toBeInTheDocument()
  })

  it('ligar a um objeto do livro: o mais antigo (CA00001) é o principal e mostra as duas leituras; o número SKC redireciona', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'meu', leitura: 'leitura minha xyzzy' })
    abrir(`/item/${id}`)
    await screen.findByTestId('objeto-cabeca')
    await userEvent.click(screen.getByRole('button', { name: 'Ligar a um objeto existente' }))
    await userEvent.type(screen.getByLabelText('Número do outro objeto'), 'CA00001')
    await userEvent.click(screen.getByRole('button', { name: 'Ligar' }))
    await waitFor(() => expect(local()).toBe('/item/CA00001'))
    const leituras = await screen.findByRole('region', { name: 'Leituras' })
    await waitFor(() => expect(leituras).toHaveTextContent('leitura minha xyzzy'))
    expect(within(leituras).getAllByText('SKC').length).toBeGreaterThan(0)
    // Decisão 38: a linha das fontes do principal junta as do livro e a do objeto SKC.
    expect(within(screen.getByTestId('item-cabeca')).getByTestId('numeros-nas-fontes')).toHaveTextContent(/^TESTE I: 1 · SKC: 1 \(provisório\)$/)
  })

  it('o número secundário continua achável e redireciona ao principal, com o aviso', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'meu' })
    await registrar('ligacao', `CA00001|${id}`, 'criar', { a: 'CA00001', b: id, ativa: true })
    abrir('/item/CA00005')
    await waitFor(() => expect(local()).toBe('/item/CA00001'))
    expect(await screen.findByText(/CA00005 está ligado a CA00001/)).toBeInTheDocument()
  })
})

describe('revisão 1', () => {
  let r = 0
  const reserva = async (numero: string) => {
    const id = `OB-pipeline-${++r}`
    await registrar('objeto', id, 'criar', { periodo: numero.slice(0, 2), reserva: 'TESTE II' })
    await unirConfirmadosGuardados({ [id]: numero })
    return id
  }
  const vivos = () => [...(estadoAtual().registros.get('objeto')?.values() ?? [])].filter((x) => !x.excluido && !x.campos.reserva).length

  it('/item/<número reservado que o pacote já tem> mostra o objeto do livro, não a reserva', async () => {
    await reserva('CA00004')
    abrir('/item/CA00004')
    expect(await screen.findByTestId('item-cabeca')).toHaveTextContent('CA00004')
    expect(screen.queryByTestId('objeto-cabeca')).toBeNull()
  })

  it('NovoObjeto: o último número é "de um livro" (reserva cumprida) ou "reservado para um livro" (ainda não no pacote)', async () => {
    await reserva('CA00004')
    const primeira = abrir('/objeto/novo')
    await userEvent.click(await screen.findByRole('radio', { name: /Calcolítico/ }))
    await waitFor(() => expect(screen.getByTestId('numero-novo')).toHaveTextContent('o último é CA00004, de um livro'))
    primeira.unmount()
    localStorage.clear()
    await reserva('CA00005')
    abrir('/objeto/novo')
    await userEvent.click(await screen.findByRole('radio', { name: /Calcolítico/ }))
    await waitFor(() => expect(screen.getByTestId('numero-novo')).toHaveTextContent('CA00006'))
    expect(screen.getByTestId('numero-novo')).toHaveTextContent('o último é CA00005, reservado para um livro')
  })

  it('salvar interrompido: o rascunho com o id do objeto já gravado nunca cria outro; "Abrir o objeto" leva a ele e limpa o rascunho', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'já salvo' })
    localStorage.setItem(CHAVE_DO_RASCUNHO, JSON.stringify({ ficha: { titulo: 'já salvo', periodo: 'CA' }, naoSei: false, imagens: [], criado: id, salvoEm: 1 }))
    const antes = vivos()
    abrir('/objeto/novo')
    expect(await screen.findByRole('status', { name: 'Objeto já salvo' })).toHaveTextContent('CA00005')
    expect(screen.queryByRole('radiogroup', { name: 'Período' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Abrir o objeto' }))
    await waitFor(() => expect(local()).toBe(`/item/${id}`))
    expect(vivos()).toBe(antes)
    expect(localStorage.getItem(CHAVE_DO_RASCUNHO)).toBeNull()
  })

  it('o id entra no rascunho logo depois do criar (antes das imagens), e um duplo Salvar cria um objeto só', async () => {
    abrir('/objeto/novo')
    await userEvent.type(await screen.findByLabelText('Tipo e descrição curta'), 'duplo')
    await userEvent.click(screen.getByRole('radio', { name: /Calcolítico/ }))
    const antes = vivos()
    const salvar = screen.getAllByRole('button', { name: /Salvar objeto/ })[0]!
    fireEvent.click(salvar)
    fireEvent.click(salvar)
    await waitFor(() => expect(local()).toMatch(/^\/item\/OB-/))
    expect(vivos()).toBe(antes + 1)
  })

  it('o número provisório perdido leva ao objeto com o aviso próprio; um número que o pacote tem nunca redireciona', async () => {
    // O pedido CA00005 ficou sem dono (o objeto foi confirmado como CA00007): /item/CA00005 leva a ele.
    const id = await objeto({ periodo: 'CA', pedido: 'CA00005', titulo: 'perdeu' })
    await unirConfirmadosGuardados({ [id]: 'CA00007' })
    const primeira = abrir('/item/CA00005')
    expect(await screen.findByText('CA00005 era o número provisório deste objeto; ficou CA00007 porque outro aparelho o usou antes.')).toBeInTheDocument()
    expect(screen.queryByText(/está ligado a/)).toBeNull()
    primeira.unmount()
    // Pedido CA00003 (um número do livro): /item/CA00003 é o livro.
    await objeto({ periodo: 'CA', pedido: 'CA00003', titulo: 'conflito' })
    abrir('/item/CA00003')
    expect(await screen.findByTestId('item-cabeca')).toHaveTextContent('CA00003')
  })

  it('um objeto SKC excluído deixa de ser o principal: a página do livro não redireciona mais a ele', async () => {
    const id = await objeto({ periodo: 'NE', titulo: 'dado primeiro' })
    await unirConfirmadosGuardados({ [id]: 'NE00001' }) // confirmado: excluído, guarda o número (e a chave de principal)
    await reserva('CA00004') // o livro deu CA00004 DEPOIS (decisão 38: o SKC é o principal)
    await registrar('ligacao', `CA00004|${id}`, 'criar', { a: 'CA00004', b: id, ativa: true })
    const primeira = abrir('/item/CA00004')
    await waitFor(() => expect(local()).toBe('/item/NE00001'))
    primeira.unmount()
    await registrar('objeto', id, 'excluir')
    abrir('/item/CA00004')
    expect(await screen.findByTestId('item-cabeca')).toHaveTextContent('CA00004')
    expect(local()).toBe('/item/CA00004')
  })

  it('EditarFicha: o Sítio digitado à mão grava em Ctrl/⌘S (pendentes), sem esperar o campo perder o foco', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 't', sitio: 'TESTE-1', sitioNome: 'Maḥteṣ Teste' })
    abrir(`/item/${id}`)
    await screen.findByTestId('objeto-cabeca')
    await apertarQuandoPronto('f', 'item')
    const regiao = await screen.findByRole('region', { name: 'Editar a ficha' })
    const sitio = within(regiao).getByRole('combobox', { name: 'Sítio' })
    await userEvent.clear(sitio)
    await userEvent.type(sitio, 'Tell Livre')
    expect(sitio).toHaveFocus()
    await act(() => descarregarPendentes())
    await waitFor(() => expect(estadoAtual().registro('objeto', id)!.campos).toMatchObject({ sitio: '', sitioNome: 'Tell Livre' }))
  })
})

describe('revisão 2 (decisão 38)', () => {
  let r = 0
  const reserva = async (numero: string) => {
    const id = `OB-pipeline-${100 + ++r}`
    await registrar('objeto', id, 'criar', { periodo: numero.slice(0, 2), reserva: 'TESTE II' })
    await unirConfirmadosGuardados({ [id]: numero })
    return id
  }

  it('Tarefa 10, revisão 3, M13: no SKC principal, a hipótese ancorada na leitura do livro ligado mostra a fonte, confere o texto e é marcada', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'visto primeiro', leitura: 'leitura skc' })
    await unirConfirmadosGuardados({ [id]: 'CA00005', [`SKC:${id}`]: '1' })
    await reserva('CA00004')
    await registrar('ligacao', `CA00004|${id}`, 'criar', { a: 'CA00004', b: id, ativa: true })
    const campos = (ancora: Record<string, unknown>) =>
      ({ objeto: id, sobre: 'objeto', elemento: null, elementoRotulo: '', termos: ['GL-900001'], termosRotulos: ['leão-de-teste'], nivel: 'iconographic', modalidade: 'probable', justificativa: '', ancora }) as never
    // No original (de), com o texto mudado desde então; e na tradução (pt), com o sha certo.
    await registrar('hipotese', 'HY-testeaaa-71', 'criar', campos({ fonte: 'PA-TESTE-0004-cat-1', lingua: 'de', inicio: 4, fim: 14, trecho: 'Testsiegel', sha: 'c'.repeat(64) }))
    const pt = 'Um selo de teste com padrão denteado; a gravação de teste é rasa.'
    const { shaDoTrecho } = await import('../notas/ancora')
    await registrar('hipotese', 'HY-testeaaa-72', 'criar', campos({ fonte: 'PA-TESTE-0004-cat-1', lingua: 'pt', inicio: 3, fim: 16, trecho: 'selo de teste', sha: await shaDoTrecho(pt) }))
    abrir('/item/CA00005?hipotese=HY-testeaaa-71')
    const painel = await screen.findByRole('dialog', { name: 'Hipótese leão-de-teste' })
    // A fonte vem dos dados do livro ligado (não do que está à vista: o original nem aparece aqui).
    expect(await within(painel).findByText(/· TESTE I: 4/)).toBeInTheDocument()
    expect(await within(painel).findByText(/O texto da fonte mudou/)).toBeInTheDocument()
    // A âncora na tradução é marcada na leitura do livro ligado (no mesmo trecho de uma hipótese do livro).
    await waitFor(() => expect(document.querySelector('[data-trecho-fonte="PA-TESTE-0004-cat-1"] [data-hipoteses~="HY-testeaaa-72"]')).toHaveTextContent('selo de teste'))
  })

  it('objeto SKC criado antes do livro que o publicou: o SKC é o principal, mostra "TESTE I: 4 · SKC: 1", e o número do livro redireciona a ele', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'visto primeiro', leitura: 'leitura skc plugh' })
    await unirConfirmadosGuardados({ [id]: 'CA00005', [`SKC:${id}`]: '1' })
    await reserva('CA00004') // um volume processado depois (Tarefa 16) deu CA00004 a este mesmo objeto
    await registrar('ligacao', `CA00004|${id}`, 'criar', { a: 'CA00004', b: id, ativa: true })
    const primeira = abrir('/item/CA00004')
    await waitFor(() => expect(local()).toBe('/item/CA00005'))
    expect(await screen.findByText(/CA00004 está ligado a CA00005/)).toBeInTheDocument()
    const fontes = await within(screen.getByTestId('objeto-cabeca')).findByTestId('numeros-nas-fontes')
    await waitFor(() => expect(fontes).toHaveTextContent(/^TESTE I: 4 · SKC: 1$/))
    // As leituras se juntam na tela do SKC.
    await waitFor(() => expect(screen.getByRole('region', { name: 'Leituras' })).toHaveTextContent('leitura skc plugh'))
    expect(screen.getByText(/Fica o número dado primeiro/)).toBeInTheDocument()
    primeira.unmount()
    // ?sozinho=1 ainda mostra o livro.
    abrir('/item/CA00004?sozinho=1')
    expect(await screen.findByTestId('item-cabeca')).toHaveTextContent('CA00004')
  })

  it('o inverso: o livro deu o número antes; o livro é o principal e o número SKC redireciona a ele', async () => {
    await reserva('CA00004')
    const id = await objeto({ periodo: 'NE', titulo: 'depois, mas de período mais antigo' })
    await unirConfirmadosGuardados({ [id]: 'NE00001', [`SKC:${id}`]: '1' })
    await registrar('ligacao', `CA00004|${id}`, 'criar', { a: 'CA00004', b: id, ativa: true })
    abrir('/item/NE00001')
    await waitFor(() => expect(local()).toBe('/item/CA00004'))
    await waitFor(() => expect(within(screen.getByTestId('item-cabeca')).getByTestId('numeros-nas-fontes')).toHaveTextContent(/^TESTE I: 4 · SKC: 1$/))
  })
})

describe('revisão 3: notas de todo o grupo ligado', () => {
  let r = 0
  const reserva = async (numero: string) => {
    const id = `OB-pipeline-${300 + ++r}`
    await registrar('objeto', id, 'criar', { periodo: numero.slice(0, 2), reserva: 'TESTE II' })
    await unirConfirmadosGuardados({ [id]: numero })
    return id
  }
  let k = 0
  const nota = (alvo: string, texto: string) => registrar('nota', `NT-grupo000-${++k}`, 'criar', { texto, alvoTipo: 'objeto', alvo, rascunho: false })

  it('na tela do principal SKC, as notas do livro ligado e do outro SKC aparecem, cada uma com o número do membro; nota nova vai ao principal', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'principal' })
    const outro = await objeto({ periodo: 'CA', titulo: 'outro skc' })
    await unirConfirmadosGuardados({ [id]: 'CA00005', [`SKC:${id}`]: '1', [outro]: 'CA00006', [`SKC:${outro}`]: '2' })
    await reserva('CA00004')
    await registrar('ligacao', `CA00004|${id}`, 'criar', { a: 'CA00004', b: id, ativa: true })
    await registrar('ligacao', `${id}|${outro}`, 'criar', { a: id, b: outro, ativa: true })
    await nota(id, 'nota do principal quux')
    await nota('CA00004', 'nota do livro quux')
    await nota(outro, 'nota do outro quux')
    abrir('/item/CA00005')
    const leituras = await screen.findByRole('region', { name: 'Leituras' })
    await waitFor(() => expect(within(leituras).getByRole('group', { name: 'SKC notas' })).toHaveTextContent('nota do principal quux'))
    const doLivro = await within(leituras).findByRole('group', { name: 'SKC notas de CA00004' })
    expect(doLivro).toHaveTextContent('nota do livro quux')
    expect(doLivro).toHaveTextContent('CA00004')
    expect(within(leituras).getByRole('group', { name: 'SKC notas de CA00006' })).toHaveTextContent('nota do outro quux')
    // Um só "Escrever nota", o do principal.
    expect(within(leituras).getAllByRole('link', { name: /Escrever nota/ })).toHaveLength(1)
    expect(within(within(leituras).getByRole('group', { name: 'SKC notas' })).getByRole('link', { name: /Escrever nota/ })).toHaveAttribute('href', expect.stringContaining(encodeURIComponent(id)))
  })

  it('na tela do livro principal, as notas do objeto SKC ligado aparecem com o número dele; membro sem nota não ganha voz vazia', async () => {
    await reserva('CA00004')
    const id = await objeto({ periodo: 'NE', titulo: 'depois' })
    const vazio = await objeto({ periodo: 'NE', titulo: 'sem notas' })
    await unirConfirmadosGuardados({ [id]: 'NE00001', [`SKC:${id}`]: '1', [vazio]: 'NE00002', [`SKC:${vazio}`]: '2' })
    await registrar('ligacao', `CA00004|${id}`, 'criar', { a: 'CA00004', b: id, ativa: true })
    await registrar('ligacao', `CA00004|${vazio}`, 'criar', { a: 'CA00004', b: vazio, ativa: true })
    await nota(id, 'nota do skc ligado quux')
    abrir('/item/CA00004')
    const leituras = await screen.findByRole('region', { name: 'Leituras' })
    expect(await within(leituras).findByRole('group', { name: 'SKC notas de NE00001' })).toHaveTextContent('nota do skc ligado quux')
    expect(within(leituras).queryByRole('group', { name: 'SKC notas de NE00002' })).toBeNull()
    expect(within(leituras).getAllByRole('link', { name: /Escrever nota/ })).toHaveLength(1)
  })
})

describe('revisão 4: livro principal com outro livro no grupo', () => {
  it('SKC ligado a CA00001 e a CA00003: a tela de CA00001 mostra a leitura, as notas e a referência de CA00003 (e o SKC)', async () => {
    const id = await objeto({ periodo: 'CA', titulo: 'nos dois livros', leitura: 'leitura skc xyzzy' })
    await unirConfirmadosGuardados({ [id]: 'CA00005', [`SKC:${id}`]: '1' })
    await registrar('ligacao', `CA00001|${id}`, 'criar', { a: 'CA00001', b: id, ativa: true })
    await registrar('ligacao', `CA00003|${id}`, 'criar', { a: 'CA00003', b: id, ativa: true })
    await registrar('nota', 'NT-grupo400-1', 'criar', { texto: 'nota de CA00003 xyzzy', alvoTipo: 'objeto', alvo: 'CA00003', rascunho: false })
    const primeira = abrir('/item/CA00003')
    await waitFor(() => expect(local()).toBe('/item/CA00001'))
    primeira.unmount()
    abrir('/item/CA00001')
    const leituras = await screen.findByRole('region', { name: 'Leituras' })
    // As leituras dos dois livros e a do SKC.
    await waitFor(() => expect(within(leituras).getAllByTestId('leitura-fonte').map((x) => x.textContent)).toEqual(['TESTEI: 1', 'TESTEI: 3']))
    expect(leituras).toHaveTextContent('leitura skc xyzzy')
    // As notas de CA00003, com o número dele; um só "Escrever nota".
    expect(await within(leituras).findByRole('group', { name: 'SKC notas de CA00003' })).toHaveTextContent('nota de CA00003 xyzzy')
    expect(within(leituras).getAllByRole('link', { name: /Escrever nota/ })).toHaveLength(1)
    // A linha das fontes junta as referências dos dois livros e o SKC, Nr.
    await waitFor(() => expect(within(screen.getByTestId('item-cabeca')).getByTestId('numeros-nas-fontes')).toHaveTextContent(/^TESTE I: 1, 3 · SKC: 1$/))
  })
})

describe('Meus objetos, Revisão e Menu', () => {
  it('Meus objetos mostra os objetos SKC com o número e a marca "provisório"; o rascunho aparece sem número', async () => {
    await objeto({ periodo: 'CA', titulo: 'Selo. Pedra.' })
    await objeto({ periodo: null, titulo: 'Rascunho. Barro.' })
    abrir('/colecoes')
    const secao = await screen.findByRole('region', { name: 'Meus objetos' })
    await waitFor(() => expect(secao).toHaveTextContent('CA00005'))
    expect(secao).toHaveTextContent(/provisório/)
    // Decisão 38: o SKC, Nr. pequeno sob o número (o rascunho não tem).
    expect(within(secao).getAllByText('SKC: 1')).toHaveLength(1)
    expect(secao).toHaveTextContent(/sem número/i)
    expect(within(secao).getByRole('link', { name: /Novo objeto/ })).toHaveAttribute('href', '/objeto/novo')
  })

  it('revisão 3: um registro OB-pipeline-… que só recebeu a testemunha (o criar do pipeline ainda não chegou) não aparece em Meus objetos nem na Revisão', async () => {
    await registrar('objeto', 'OB-pipeline-901', 'alterar', { numero: 'CA00009' })
    await registrar('objeto', 'OB-pipeline-902', 'alterar', { titulo: 'só um campo' })
    await objeto({ periodo: 'CA', titulo: 'Selo. Pedra.' })
    const primeira = abrir('/colecoes')
    const secao = await screen.findByRole('region', { name: 'Meus objetos' })
    await waitFor(() => expect(secao).toHaveTextContent('CA00010'))
    expect(secao).not.toHaveTextContent('CA00009')
    expect(secao).not.toHaveTextContent(/sem número/i)
    expect(within(secao).getAllByText(/^SKC: \d+$/).map((x) => x.textContent)).toEqual(['SKC: 1'])
    primeira.unmount()
    abrir('/revisao')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('link', { name: /só um campo/ })).toBeNull()
  })

  it('Revisão lista os rascunhos sem número, com o link para o objeto', async () => {
    const id = await objeto({ periodo: null, titulo: 'Rascunho para revisar' })
    abrir('/revisao?abrir=objetos-sem-numero')
    const grupo = await screen.findByRole('list', { name: 'Casos de Objetos sem número' })
    expect(within(grupo).getByText('Rascunho para revisar')).toBeInTheDocument()
    // o número (—) não leva a lugar nenhum; a ação leva ao objeto, na escolha do período
    expect(within(grupo).getByRole('link', { name: 'Escolher o período' })).toHaveAttribute('href', `#/item/${encodeURIComponent(id)}?corrigir=periodo`)
  })

  it('o Menu tem a linha "Novo objeto"', async () => {
    render(
      <MemoryRouter>
        <Menu variante="folha" aoFechar={() => undefined} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /Novo objeto/ })).toHaveAttribute('href', '/objeto/novo')
  })
})
