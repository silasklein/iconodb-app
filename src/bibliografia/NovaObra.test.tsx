/**
 * Parte 2C, bloco 3, Tarefa 10: a tela «Nova obra» e as obras do usuário na Bibliografia. Sobre o pacote sintético (TESTE):
 * as obras dos livros BIB-900001 («Autor 1999»), BIB-900002 («Autora 2004») e BIB-900090 («Imaginária 2010», a obra do
 * usuário publicada, com o redirecionamento BIB-teste123-1 → BIB-900090). Só dados inventados.
 */
import { act, cleanup, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { estadoAtual, registrar } from '../usuario/estado'
import { excluirLigacao, ligar } from '../revisao/ligacoes'
import { chicago } from './chicago'
import { CAMPOS_DO_FORMULARIO } from './colar'
import { useOpcoesDeObra } from './doUsuario'
import { eObraSkc, lerObra, type Csl } from './modelo'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
  Element.prototype.scrollIntoView = vi.fn()
  // a obra do usuário que o pacote publicou (BIB-teste123-1 → BIB-900090): na lista só a do livro aparece
  await registrar('obra', 'BIB-teste123-1', 'criar', {
    csl: { type: 'book', author: [{ family: 'Imaginária', given: 'Cicrana' }], title: 'Selos sonhados no planalto fictício', issued: { 'date-parts': [[2010]] } },
    curta: 'Imaginária 2010',
  })
})
afterAll(() => usarMotor(null))
beforeEach(() => {
  instalarMatchMedia(375)
  localStorage.clear()
})

const endereco = () => screen.getByTestId('endereco').textContent ?? ''
const campo = (nome: string | RegExp) => screen.getByRole('textbox', { name: nome })
const obrasSkcVivas = () => [...(estadoAtual().registros.get('obra')?.values() ?? [])].filter((r) => eObraSkc(r.id) && !r.excluido)
const obraPeloTitulo = (titulo: string) => obrasSkcVivas().find((r) => lerObra(r)?.csl.title === titulo)
const previa = () => screen.getByTestId('previa')
const salvarObra = () => screen.getByRole('button', { name: 'Salvar a obra' })

async function abrirNova(url = '/obra/nova') {
  renderizarRota(url)
  await screen.findByRole('heading', { level: 1, name: /^Nova obra/ })
}

async function preencherLivro(titulo: string, autores = 'Probe, Ana', ano = '1993') {
  await userEvent.click(screen.getByRole('radio', { name: 'Livro' }))
  await userEvent.type(campo(/^Autores/), autores)
  await userEvent.type(campo('Ano'), ano)
  await userEvent.type(campo('Título'), titulo)
}

describe('Nova obra: o formulário', () => {
  it('tem o tipo, os campos do quadro, «Colar do Zotero», a prévia e as parecidas; nada é gravado até salvar', async () => {
    await abrirNova()
    for (const t of ['Livro', 'Artigo', 'Capítulo', 'Volume organizado']) expect(screen.getByRole('radio', { name: t })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Colar do Zotero' })).toBeInTheDocument()
    for (const n of [/^Autores/, 'Ano', 'Título', 'Lugar', 'Editora', 'Citação curta']) expect(campo(n)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Como vai aparecer na Bibliografia' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Parecidas na Bibliografia' })).toBeInTheDocument()
    expect(previa()).toHaveTextContent('A prévia aparece quando houver o tipo e o título.')
    expect(salvarObra()).toBeEnabled()
    expect(obrasSkcVivas().filter((r) => r.id !== 'BIB-teste123-1')).toHaveLength(0)
  })

  it('o tipo muda os campos: o artigo tem a revista e o volume; o capítulo, o livro e os organizadores; o volume organizado, só os organizadores', async () => {
    await abrirNova()
    await userEvent.click(screen.getByRole('radio', { name: 'Artigo' }))
    expect(campo('Revista')).toBeInTheDocument()
    expect(campo('Volume')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Editora' })).toBeNull()
    await userEvent.click(screen.getByRole('radio', { name: 'Capítulo' }))
    expect(campo('Livro')).toBeInTheDocument()
    expect(campo(/^Organizadores do livro/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Volume organizado' }))
    expect(campo(/^Organizadores/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /^Autores/ })).toBeNull()
    // as setas andam pelo grupo, como num rádio
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('radio', { name: 'Capítulo' })).toBeChecked()
  })

  it('a citação curta é proposta do sobrenome e do ano, e pode ser mudada', async () => {
    await abrirNova()
    await preencherLivro('Proposta de teste', 'Probe, Ana\nExemplo, Bruno', '1993')
    expect(campo('Citação curta')).toHaveValue('Probe/Exemplo 1993')
    await userEvent.clear(campo('Citação curta'))
    await userEvent.type(campo('Citação curta'), 'Probe 1993b')
    await userEvent.clear(campo('Ano'))
    await userEvent.type(campo('Ano'), '1994')
    expect(campo('Citação curta')).toHaveValue('Probe 1993b')
    // apagada, ao sair do campo volta a proposta
    await userEvent.clear(campo('Citação curta'))
    expect(campo('Citação curta')).toHaveValue('')
    await userEvent.tab()
    expect(campo('Citação curta')).toHaveValue('Probe/Exemplo 1994')
  })

  it('a prévia é exatamente chicago() do que se grava, com o itálico do chicagoHtml pelo sanitizador', async () => {
    await abrirNova()
    await preencherLivro('Selos & sinetes de prova')
    await userEvent.type(campo('Lugar'), 'Cidade Fictícia')
    await userEvent.type(campo('Editora'), 'Editora Imaginária')
    const csl: Csl = {
      type: 'book',
      author: [{ family: 'Probe', given: 'Ana' }],
      issued: { 'date-parts': [[1993]] },
      title: 'Selos & sinetes de prova',
      'publisher-place': 'Cidade Fictícia',
      publisher: 'Editora Imaginária',
    }
    expect(previa().textContent).toBe(chicago(csl))
    expect(within(previa()).getByText('Selos & sinetes de prova').tagName).toBe('I')
  })

  it('uma marcação digitada no título não vira HTML: a prévia continua sendo o texto de chicago()', async () => {
    await abrirNova()
    await preencherLivro('Título <b>forte</b> <img src=x onerror=alert(1)>')
    const csl: Csl = { type: 'book', author: [{ family: 'Probe', given: 'Ana' }], issued: { 'date-parts': [[1993]] }, title: 'Título <b>forte</b> <img src=x onerror=alert(1)>' }
    expect(previa().textContent).toBe(chicago(csl))
    expect(previa().querySelector('b, img, script')).toBeNull()
  })

  it('sem tipo, sem título ou com o ano errado: o erro em linha, o foco no campo, nada gravado', async () => {
    await abrirNova()
    const antes = obrasSkcVivas().length
    await userEvent.click(salvarObra())
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha o tipo da obra.')
    expect(screen.getByRole('radiogroup', { name: 'Tipo' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('radio', { name: 'Livro' })).toHaveFocus()
    await userEvent.click(screen.getByRole('radio', { name: 'Livro' }))
    await userEvent.type(campo('Ano'), '1993a')
    await userEvent.click(salvarObra())
    expect(await screen.findByRole('alert')).toHaveTextContent('O ano é só o número')
    expect(campo('Ano')).toHaveFocus()
    expect(campo('Ano')).toHaveAttribute('aria-invalid', 'true')
    await userEvent.clear(campo('Ano'))
    await userEvent.click(salvarObra())
    expect(await screen.findByRole('alert')).toHaveTextContent('Dê o título da obra.')
    expect(campo('Título')).toHaveFocus()
    expect(obrasSkcVivas()).toHaveLength(antes)
  })
})

describe('Nova obra: salvar', () => {
  it('salvar cria o registro com o CSL (só os campos do formulário) e a citação curta, e abre a obra', async () => {
    await abrirNova()
    await preencherLivro('Selos de prova salvos')
    await userEvent.type(campo('Lugar'), 'Cidade Fictícia')
    await userEvent.click(salvarObra())
    await waitFor(() => expect(endereco()).toMatch(/^\/obra\/BIB-/))
    const id = decodeURIComponent(endereco().slice('/obra/'.length))
    expect(eObraSkc(id)).toBe(true)
    const r = estadoAtual().registro('obra', id)!
    expect(r.campos).toEqual({
      csl: { type: 'book', author: [{ family: 'Probe', given: 'Ana' }], issued: { 'date-parts': [[1993]] }, title: 'Selos de prova salvos', 'publisher-place': 'Cidade Fictícia' },
      curta: 'Probe 1993',
    })
    expect(Object.keys(r.campos.csl as object).every((c) => CAMPOS_DO_FORMULARIO.includes(c as never))).toBe(true)
    // a página da obra: a referência, a marca SKC, editar e excluir
    expect(await screen.findByRole('heading', { level: 1, name: 'Probe 1993' })).toBeInTheDocument()
    expect(screen.getByText('Obra do SKC')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Editar a obra' })).toHaveAttribute('href', `/obra/${id}/editar`)
    expect(screen.getByRole('button', { name: 'Excluir a obra' })).toBeInTheDocument()
  })

  it('Ctrl+Enter salva', async () => {
    await abrirNova()
    await preencherLivro('Salva pelo teclado')
    fireEvent.keyDown(campo('Título'), { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(obraPeloTitulo('Salva pelo teclado')).toBeDefined())
  })

  it('com ?citacao=: o botão diz «Salvar e ligar a citação»; salvar cria a obra e a ligação juntas e volta', async () => {
    await abrirNova('/obra/nova?citacao=fantasma%201888&curta=Fantasma%201888%3A%203&volta=%2Frevisao%3Fcaso%3Dx')
    expect(screen.getByText(/Ao salvar, a citação «Fantasma 1888» passa a abrir esta obra/)).toBeInTheDocument()
    // a citação impressa começa o formulário: o sobrenome, o ano e a citação curta
    expect(campo(/^Autores/)).toHaveValue('Fantasma, ')
    expect(campo('Ano')).toHaveValue('1888')
    expect(campo('Citação curta')).toHaveValue('Fantasma 1888')
    await userEvent.click(screen.getByRole('radio', { name: 'Livro' }))
    await userEvent.type(campo(/^Autores/), 'Ana')
    await userEvent.type(campo('Título'), 'Obra da citação fantasma')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e ligar a citação' }))
    await waitFor(() => expect(endereco()).toBe('/revisao?caso=x'))
    const obra = obraPeloTitulo('Obra da citação fantasma')!
    expect(lerObra(obra)!.csl.author).toEqual([{ family: 'Fantasma', given: 'Ana' }])
    expect(estadoAtual().registro('citacao', 'fantasma 1888')!.campos).toEqual({ obra: obra.id })
  })

  it('com ?excecao= (da Revisão): a exceção nula da citação do caso sai na mesma gravação; a de outra chave fica', async () => {
    const doCaso = 'fantasma 1888@TESTE|PA-TESTE-I.S.9-cap-1|Fantasma 1888: 3'
    const deOutra = 'inventado 2001@TESTE|TESTE-0004|Inventado 2001: 5'
    await ligar(doCaso, null)
    await ligar(deOutra, null)
    const q = new URLSearchParams([['citacao', 'fantasma 1888'], ['curta', 'Fantasma 1888: 3'], ['excecao', doCaso], ['excecao', deOutra], ['volta', '/revisao']])
    await abrirNova(`/obra/nova?${q}`)
    await userEvent.click(screen.getByRole('radio', { name: 'Livro' }))
    await userEvent.type(campo('Título'), 'Obra da exceção tirada')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e ligar a citação' }))
    await waitFor(() => expect(endereco()).toBe('/revisao'))
    expect(estadoAtual().registro('citacao', doCaso)!.excluido).toBe(true)
    expect(estadoAtual().registro('citacao', deOutra)!.excluido).toBe(false)
    await excluirLigacao(deOutra)
  })

  it('um ?citacao= que não é chave nem ocorrência é ignorado', async () => {
    await abrirNova('/obra/nova?citacao=1997&volta=%2F%2Fmal')
    expect(screen.getByRole('button', { name: 'Salvar a obra' })).toBeInTheDocument()
    expect(screen.queryByText(/Ao salvar, a citação/)).toBeNull()
  })
})

describe('Nova obra: «Colar do Zotero»', () => {
  it('cola BibTeX: o formulário se preenche, diz o que ficou de fora e a prévia aparece', async () => {
    await abrirNova()
    await userEvent.click(screen.getByRole('button', { name: 'Colar do Zotero' }))
    const caixa = campo('Cole aqui o que o Zotero copiou')
    expect(caixa).toHaveFocus()
    await userEvent.paste('@article{k, author={Probe, Ana and Exemplo, Bruno}, title={Um artigo de prova}, journal={Revista Inventada}, volume={7}, pages={12--34}, year={2001}, doi={10.0/x}}')
    expect(screen.getByRole('radio', { name: 'Artigo' })).toBeChecked()
    expect(campo(/^Autores/)).toHaveValue('Probe, Ana\nExemplo, Bruno')
    expect(campo('Revista')).toHaveValue('Revista Inventada')
    expect(campo('Páginas')).toHaveValue('12–34')
    expect(campo('Citação curta')).toHaveValue('Probe/Exemplo 2001')
    const lido = screen.getByRole('status', { name: 'Lido do Zotero' })
    expect(lido).toHaveTextContent('Preenchido do BibTeX')
    expect(lido).toHaveTextContent('fora do formulário: doi')
    expect(screen.getByRole('button', { name: 'Colar do Zotero' })).toHaveFocus()
    expect(previa()).toHaveTextContent('Probe, Ana, and Bruno Exemplo. 2001.')
  })

  it('um @misc vira «Documento» (o quinto tipo só aparece quando vem colado), com o aviso do colar', async () => {
    await abrirNova()
    expect(screen.queryByRole('radio', { name: 'Documento' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Colar do Zotero' }))
    await userEvent.paste('@misc{k, author={Probe, Ana}, title={Folheto de prova}, year={2003}}')
    expect(screen.getByRole('radio', { name: 'Documento' })).toBeChecked()
    expect(screen.getByRole('status', { name: 'Lido do Zotero' })).toHaveTextContent('tipo @misc tratado como document')
    expect(previa().textContent).toBe(chicago({ type: 'document', author: [{ family: 'Probe', given: 'Ana' }], issued: { 'date-parts': [[2003]] }, title: 'Folheto de prova' }))
  })

  it('cola lixo: diz que não leu, e o formulário não muda', async () => {
    await abrirNova()
    await userEvent.click(screen.getByRole('radio', { name: 'Livro' }))
    await userEvent.type(campo('Título'), 'Fica como estava')
    await userEvent.click(screen.getByRole('button', { name: 'Colar do Zotero' }))
    await userEvent.paste('{"items": [1, 2]} @@@ {{{')
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para ler: o texto não é CSL JSON nem BibTeX. O formulário não mudou.')
    expect(campo('Título')).toHaveValue('Fica como estava')
    expect(screen.getByRole('radio', { name: 'Livro' })).toBeChecked()
  })
})

describe('Nova obra: as parecidas e «É esta»', () => {
  it('a mesma citação curta, ano e título de uma obra dos livros: a «quase igual» em destaque', async () => {
    await abrirNova()
    await preencherLivro('Achados de teste no vale de prova.', 'Autor, Fulano', '1999')
    const quase = await screen.findByRole('region', { name: 'Quase igual a uma obra que já existe' })
    expect(within(quase).getByText('Autor 1999')).toBeInTheDocument()
    expect(within(quase).getByText(/mesma citação curta, mesmo ano e mesmo título/)).toBeInTheDocument()
    expect(within(quase).getByRole('button', { name: 'É esta: Autor 1999' })).toBeInTheDocument()
  })

  it('o mesmo sobrenome e ano (sem o título) aparece, sem destaque', async () => {
    await abrirNova()
    await preencherLivro('Outro título qualquer', 'Autora, Beltrana', '2004')
    const lado = screen.getByRole('complementary', { name: 'Prévia e obras parecidas' })
    await within(lado).findByText('Autora 2004')
    expect(screen.queryByRole('region', { name: 'Quase igual a uma obra que já existe' })).toBeNull()
    expect(within(lado).getByText('mesma citação curta')).toBeInTheDocument()
  })

  it('«É esta» com ?citacao= liga a citação à obra escolhida, sem criar obra, e volta', async () => {
    const antes = obrasSkcVivas().length
    await abrirNova('/obra/nova?citacao=autor%201999&volta=%2Frevisao')
    await userEvent.type(campo('Ano'), '1999')
    await userEvent.click(await screen.findByRole('button', { name: 'É esta: Autor 1999' }))
    await waitFor(() => expect(endereco()).toBe('/revisao'))
    expect(estadoAtual().registro('citacao', 'autor 1999')!.campos).toEqual({ obra: 'BIB-900001' })
    expect(obrasSkcVivas()).toHaveLength(antes)
  })

  it('«É esta» sem citação abre a obra existente, sem criar nada', async () => {
    const antes = obrasSkcVivas().length
    await abrirNova()
    await preencherLivro('Outro', 'Autora, B', '2004')
    await userEvent.click(await screen.findByRole('button', { name: 'É esta: Autora 2004' }))
    await waitFor(() => expect(endereco()).toBe('/obra/BIB-900002'))
    expect(obrasSkcVivas()).toHaveLength(antes)
  })

  it('a obra publicada aparece pela do livro: a obra do usuário redirecionada não é parecida', async () => {
    await abrirNova()
    await preencherLivro('Selos sonhados no planalto fictício', 'Imaginária, Cicrana', '2010')
    const quase = await screen.findByRole('region', { name: 'Quase igual a uma obra que já existe' })
    expect(within(quase).getAllByRole('button', { name: /^É esta/ }).map((b) => b.getAttribute('aria-label'))).toEqual(['É esta: Imaginária 2010'])
    expect(within(quase).queryByText('SKC')).toBeNull()
  })

  it('M1 (revisão final): com ?citacao=, a obra publicada cujas origens você excluiu não se oferece para «É esta»', async () => {
    await registrar('obra', 'BIB-teste123-1', 'excluir')
    try {
      await abrirNova('/obra/nova?citacao=imaginaria%202010&volta=%2Frevisao')
      await preencherLivro('Selos sonhados no planalto fictício', 'Imaginária, Cicrana', '2010')
      expect(await screen.findByText('Nenhuma com o mesmo sobrenome e ano, nem com o mesmo título.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^É esta/ })).toBeNull()
      // sem a citação, «É esta» só abre a obra: ela continua na lista; e na escolha de obra dos objetos SKC também
      cleanup()
      localStorage.clear()
      await abrirNova()
      await preencherLivro('Selos sonhados no planalto fictício', 'Imaginária, Cicrana', '2010')
      expect(await screen.findByRole('button', { name: 'É esta: Imaginária 2010' })).toBeInTheDocument()
      const { result } = renderHook(() => useOpcoesDeObra())
      await waitFor(() => expect(result.current.some((o) => o.id === 'BIB-900090')).toBe(true))
    } finally {
      await registrar('obra', 'BIB-teste123-1', 'restaurar')
    }
  })
})

describe('as obras do usuário na Bibliografia e na escolha de obra', () => {
  const linhas = () => screen.getAllByRole('link').filter((a) => /^\/obra\/BIB-/.test(a.getAttribute('href') ?? ''))

  it('a obra nova aparece na Bibliografia com a marca SKC; a publicada só uma vez, pelo BIB- do livro', async () => {
    const id = 'BIB-testeaaa-1'
    await registrar('obra', id, 'criar', { csl: { type: 'book', author: [{ family: 'Bibliográfica', given: 'Ana' }], title: 'Lista de prova', issued: { 'date-parts': [[2020]] } }, curta: 'Bibliográfica 2020' })
    renderizarRota('/bibliografia')
    const linha = await screen.findByRole('link', { name: /Bibliográfica 2020/ })
    expect(linha).toHaveAttribute('href', `/obra/${id}`)
    expect(within(linha).getByText('SKC')).toBeInTheDocument()
    expect(within(linha).getByText('Lista de prova')).toBeInTheDocument()
    const hrefs = linhas().map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/obra/BIB-900090')
    expect(hrefs).not.toContain('/obra/BIB-teste123-1')
    expect(hrefs.filter((h) => h === '/obra/BIB-900090')).toHaveLength(1)
    // a busca da lista acha a obra do usuário
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar na bibliografia' }), 'lista de prova')
    await waitFor(() => expect(linhas().map((a) => a.getAttribute('href'))).toEqual([`/obra/${id}`]))
  })

  it('«Nova obra» na Bibliografia leva ao formulário', async () => {
    renderizarRota('/bibliografia')
    await userEvent.click(await screen.findByRole('link', { name: 'Nova obra' }))
    expect(await screen.findByRole('heading', { level: 1, name: /^Nova obra/ })).toBeInTheDocument()
    expect(endereco()).toBe('/obra/nova')
  })

  it('a escolha de obra dos objetos SKC tem as obras do usuário junto às dos livros, com a marca SKC', async () => {
    await registrar('obra', 'BIB-testeaaa-2', 'criar', { csl: { type: 'book', title: 'Escolhível de prova' }, curta: 'Escolhível 2021' })
    const { result } = renderHook(() => useOpcoesDeObra())
    await waitFor(() => expect(result.current.length).toBeGreaterThan(0))
    const porId = new Map(result.current.map((o) => [o.id, o]))
    expect(porId.get('BIB-testeaaa-2')).toEqual({ id: 'BIB-testeaaa-2', rotulo: 'Escolhível 2021', apoio: 'Escolhível de prova', skc: true })
    expect(porId.get('BIB-900001')).toMatchObject({ rotulo: 'Autor 1999' })
    expect(porId.get('BIB-900001')!.skc).toBeUndefined()
    expect(porId.has('BIB-900090')).toBe(true)
    expect(porId.has('BIB-teste123-1')).toBe(false)
  })
})

describe('editar e excluir uma obra do usuário', () => {
  it('editar grava só o que mudou; a página mostra a obra nova', async () => {
    const id = 'BIB-testeaaa-3'
    await registrar('obra', id, 'criar', { csl: { type: 'book', author: [{ family: 'van der Probe', given: 'Ana', suffix: 'Jr.' }], title: 'Antes da edição', issued: { 'date-parts': [[2000]] } }, curta: 'van der Probe 2000' })
    renderizarRota(`/obra/${id}`)
    await userEvent.click(await screen.findByRole('link', { name: 'Editar a obra' }))
    expect(await screen.findByRole('heading', { level: 1, name: /^Editar a obra/ })).toBeInTheDocument()
    expect(campo('Título')).toHaveValue('Antes da edição')
    expect(campo(/^Autores/)).toHaveValue('van der Probe, Ana')
    expect(campo('Citação curta')).toHaveValue('van der Probe 2000')
    await userEvent.clear(campo('Título'))
    await userEvent.type(campo('Título'), 'Depois da edição')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar as mudanças' }))
    await waitFor(() => expect(endereco()).toBe(`/obra/${id}`))
    const r = estadoAtual().registro('obra', id)!
    // o nome que não mudou volta como era (com o sufixo); a citação curta não mudou e não foi regravada
    expect(r.campos.csl).toEqual({ type: 'book', author: [{ family: 'van der Probe', given: 'Ana', suffix: 'Jr.' }], issued: { 'date-parts': [[2000]] }, title: 'Depois da edição' })
    expect(estadoAtual().historico(id, 'csl', 'obra')).toHaveLength(1)
    expect(estadoAtual().historico(id, 'curta', 'obra')).toHaveLength(0)
    expect(await screen.findByText(/Depois da edição/)).toBeInTheDocument()
  })

  it('excluir pede confirmação; a obra sai da Bibliografia e volta com «Restaurar a obra»', async () => {
    const id = 'BIB-testeaaa-4'
    await registrar('obra', id, 'criar', { csl: { type: 'book', title: 'Para excluir' }, curta: 'Excluível 2022' })
    renderizarRota(`/obra/${id}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir a obra' }))
    const grupo = screen.getByRole('group', { name: 'Excluir a obra «Excluível 2022»?' })
    expect(within(grupo).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    await userEvent.click(within(grupo).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(estadoAtual().registro('obra', id)!.excluido).toBe(true))
    await userEvent.click(await screen.findByRole('button', { name: 'Restaurar a obra' }))
    await waitFor(() => expect(estadoAtual().registro('obra', id)!.excluido).toBe(false))
  })

  it('«É esta» ao editar é reversível: as ligações e os objetos passam para a outra; «Restaurar a obra» os traz de volta', async () => {
    const id = 'BIB-testeaaa-5'
    await registrar('obra', id, 'criar', { csl: { type: 'book', author: [{ family: 'Autor' }], title: 'Achados de teste no vale de prova', issued: { 'date-parts': [[1999]] } }, curta: 'Autor 1999' })
    await registrar('citacao', 'autor 1999b', 'criar', { obra: id })
    await registrar('objeto', 'OB-testeaaa-9', 'criar', { periodo: 'CA', titulo: 'Objeto que cita', origemTipo: 'publicacao', obra: id, obraRotulo: 'Minha Autor 1999' })
    const pagina = renderizarRota(`/obra/${id}`)
    expect(await screen.findByRole('complementary', { name: 'Obra quase igual' })).toHaveTextContent('Quase igual a «Autor 1999»')
    pagina.unmount()

    renderizarRota(`/obra/${id}/editar`)
    const eEsta = await screen.findByRole('button', { name: 'É esta: Autor 1999' })
    await userEvent.click(eEsta)
    const grupo = screen.getByRole('group', { name: 'Usar «Autor 1999» no lugar da sua obra?' })
    expect(grupo).toHaveTextContent(
      'A sua obra é excluída e 1 ligação de citação e 1 objeto SKC passam para «Autor 1999». «Restaurar», em «Excluídos» ou na página da obra, traz a obra de volta e devolve a ela o que passou.',
    )
    // o foco vai ao «Cancelar»; Esc fecha e o devolve a «É esta»
    expect(within(grupo).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: /^Usar/ })).toBeNull()
    await waitFor(() => expect(eEsta).toHaveFocus())
    expect(endereco()).toBe(`/obra/${id}/editar`)

    await userEvent.click(eEsta)
    const confirmar = within(screen.getByRole('group', { name: /^Usar/ })).getByRole('button', { name: 'Usar «Autor 1999»' })
    // clique duplo: uma troca só
    await userEvent.dblClick(confirmar)
    await waitFor(() => expect(estadoAtual().registro('obra', id)!.excluido).toBe(true))
    await waitFor(() => expect(endereco()).toBe('/obra/BIB-900001'))
    expect(estadoAtual().registro('citacao', 'autor 1999b')!.campos.obra).toBe('BIB-900001')
    expect(estadoAtual().registro('objeto', 'OB-testeaaa-9')!.campos).toMatchObject({ obra: 'BIB-900001', obraRotulo: 'Autor 1999' })
    expect(estadoAtual().historico(id, 'trocadaPor', 'obra')).toHaveLength(0)
    expect(estadoAtual().registro('obra', id)!.campos).toMatchObject({
      trocadaPor: 'BIB-900001',
      trocadaPorRotulo: 'Autor 1999',
      movidos: { ligacoes: ['autor 1999b'], objetos: [{ id: 'OB-testeaaa-9', obra: id, obraRotulo: 'Minha Autor 1999' }] },
    })

    // a página da obra trocada diz o que volta; «Restaurar a obra» devolve tudo
    renderizarRota(`/obra/${id}`)
    const aviso = await screen.findByText(/Esta obra foi trocada por «Autor 1999»/)
    expect(aviso).toHaveTextContent('1 ligação de citação e 1 objeto SKC que passaram voltam para ela.')
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar a obra' }))
    await waitFor(() => expect(estadoAtual().registro('obra', id)!.excluido).toBe(false))
    expect(estadoAtual().registro('citacao', 'autor 1999b')!.campos.obra).toBe(id)
    expect(estadoAtual().registro('objeto', 'OB-testeaaa-9')!.campos).toMatchObject({ obra: id, obraRotulo: 'Minha Autor 1999' })
    expect(estadoAtual().registro('obra', id)!.campos.trocadaPor).toBeNull()
  })

  it('editar uma obra dos livros ou inexistente: «Obra não encontrada»', async () => {
    renderizarRota('/obra/BIB-900001/editar')
    expect(await screen.findByRole('heading', { level: 1, name: 'Obra não encontrada' })).toBeInTheDocument()
  })
})

describe('o rascunho (fix round 1, R1)', () => {
  const guardado = (chave = 'iconodb:nova-obra') => JSON.parse(localStorage.getItem(chave) ?? 'null') as Record<string, unknown> | null

  it('cada mudança vai ao rascunho; sair e voltar (ou recarregar) traz tudo; «Descartar o rascunho» limpa', async () => {
    const primeira = renderizarRota('/obra/nova')
    await screen.findByRole('heading', { level: 1, name: /^Nova obra/ })
    await preencherLivro('Rascunho que sobrevive', 'van der Probe, Ana')
    await userEvent.type(campo('Lugar'), 'Cidade Fictícia')
    expect(guardado()).toMatchObject({ f: { tipo: 'book', titulo: 'Rascunho que sobrevive', lugar: 'Cidade Fictícia' } })
    primeira.unmount()
    await abrirNova()
    expect(screen.getByRole('status', { name: 'Rascunho recuperado' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Livro' })).toBeChecked()
    expect(campo(/^Autores/)).toHaveValue('van der Probe, Ana')
    expect(campo('Título')).toHaveValue('Rascunho que sobrevive')
    expect(campo('Lugar')).toHaveValue('Cidade Fictícia')
    await userEvent.click(screen.getByRole('button', { name: 'Descartar o rascunho' }))
    expect(campo('Título')).toHaveValue('')
    expect(guardado()).toBeNull()
  })

  it('o colado guarda os nomes como vieram (um sobrenome só continua `family` depois de recarregar)', async () => {
    const primeira = renderizarRota('/obra/nova')
    await screen.findByRole('heading', { level: 1, name: /^Nova obra/ })
    await userEvent.click(screen.getByRole('button', { name: 'Colar do Zotero' }))
    await userEvent.paste('{"type":"book","title":"Nome guardado","author":[{"family":"Probe"}]}')
    // sem o nome original, a linha «Probe» (sem vírgula) seria um nome inteiro (`literal`)
    expect(campo(/^Autores/)).toHaveValue('Probe')
    primeira.unmount()
    await abrirNova()
    await userEvent.click(salvarObra())
    await waitFor(() => expect(obraPeloTitulo('Nome guardado')).toBeDefined())
    expect(lerObra(obraPeloTitulo('Nome guardado')!)!.csl.author).toEqual([{ family: 'Probe' }])
  })

  it('salvar apaga o rascunho; a reserva guardada faz um segundo «Salvar» repetir o mesmo id', async () => {
    await abrirNova()
    await preencherLivro('Salva e limpa')
    await userEvent.click(salvarObra())
    await waitFor(() => expect(endereco()).toMatch(/^\/obra\/BIB-/))
    expect(guardado()).toBeNull()
    const id = decodeURIComponent(endereco().slice('/obra/'.length))
    // um rascunho com a reserva de antes (o salvar interrompido): salvar de novo usa o mesmo id, não cria outra obra
    localStorage.setItem('iconodb:nova-obra', JSON.stringify({ editando: null, f: { tipo: 'book', titulo: 'Salva e limpa', autores: 'Probe, Ana', ano: '1993' }, curtaManual: false, originais: {}, citacao: null, volta: null, reserva: id }))
    const antes = obrasSkcVivas().length
    cleanup()
    await abrirNova()
    await userEvent.click(salvarObra())
    await waitFor(() => expect(endereco()).toBe(`/obra/${id}`))
    expect(obrasSkcVivas()).toHaveLength(antes)
  })

  it('«Cancelar» descarta o rascunho; Esc fecha e o guarda', async () => {
    const primeira = renderizarRota('/obra/nova')
    await screen.findByRole('heading', { level: 1, name: /^Nova obra/ })
    await userEvent.type(campo('Título'), 'Fica guardado')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(endereco()).toBe('/bibliografia'))
    expect(guardado()).toMatchObject({ f: { titulo: 'Fica guardado' } })
    primeira.unmount()
    await abrirNova()
    expect(campo('Título')).toHaveValue('Fica guardado')
    await userEvent.click(screen.getByRole('link', { name: 'Cancelar' }))
    await waitFor(() => expect(endereco()).toBe('/bibliografia'))
    expect(guardado()).toBeNull()
  })

  it('outra citação no endereço que a do rascunho: pergunta qual fica', async () => {
    localStorage.setItem(
      'iconodb:nova-obra',
      JSON.stringify({ editando: null, f: { tipo: 'book', titulo: 'Da citação velha' }, curtaManual: false, originais: {}, citacao: 'velha 2001', rotuloDaCitacao: 'Velha 2001', volta: '/revisao', reserva: null }),
    )
    await abrirNova('/obra/nova?citacao=nova%202002&curta=Nova%202002')
    const pergunta = screen.getByRole('alert', { name: 'Há um rascunho guardado' })
    expect(pergunta).toHaveTextContent('Há um rascunho de obra guardado («Da citação velha»), com a citação «Velha 2001». Ele continua aqui.')
    expect(campo('Título')).toHaveValue('Da citação velha')
    await userEvent.click(within(pergunta).getByRole('button', { name: 'Começar uma nova com a citação «Nova 2002»' }))
    expect(campo('Título')).toHaveValue('')
    expect(campo(/^Autores/)).toHaveValue('Nova, ')
    expect(screen.getByRole('button', { name: 'Salvar e ligar a citação' })).toBeInTheDocument()
    expect(screen.getByText(/a citação «Nova 2002» passa a abrir/)).toBeInTheDocument()
  })

  it('editar: a mudança não salva volta ao reabrir, com o aviso também na página da obra', async () => {
    const id = 'BIB-testeaaa-6'
    await registrar('obra', id, 'criar', { csl: { type: 'book', title: 'Título gravado' }, curta: 'Gravada 2003' })
    const primeira = renderizarRota(`/obra/${id}/editar`)
    await userEvent.clear(await screen.findByRole('textbox', { name: 'Título' }))
    await userEvent.type(campo('Título'), 'Título mudado')
    primeira.unmount()
    const pagina = renderizarRota(`/obra/${id}`)
    expect(await screen.findByText(/Há mudanças desta obra ainda não salvas/)).toBeInTheDocument()
    pagina.unmount()
    renderizarRota(`/obra/${id}/editar`)
    expect(await screen.findByRole('status', { name: 'Rascunho recuperado' })).toHaveTextContent('o que você tinha mudado nesta obra')
    expect(campo('Título')).toHaveValue('Título mudado')
    await userEvent.click(screen.getByRole('button', { name: 'Descartar o rascunho' }))
    expect(campo('Título')).toHaveValue('Título gravado')
    expect(guardado(`iconodb:editar-obra:${id}`)).toBeNull()
  })
})

describe('fix round 1: os Minor', () => {
  it('M2: colar um tipo sem equivalente tira o tipo marcado; salvar pede o tipo', async () => {
    await abrirNova()
    await userEvent.click(screen.getByRole('radio', { name: 'Livro' }))
    await userEvent.click(screen.getByRole('button', { name: 'Colar do Zotero' }))
    await userEvent.paste('{"type":"webpage","title":"Uma página de prova"}')
    expect(screen.getByRole('status', { name: 'Lido do Zotero' })).toHaveTextContent('tipo webpage sem equivalente: escolha o tipo')
    expect(screen.getByRole('radio', { name: 'Livro' })).not.toBeChecked()
    await userEvent.click(salvarObra())
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha o tipo da obra.')
  })

  it('M3: a «quase igual» é anunciada numa região viva', async () => {
    await abrirNova()
    expect(screen.getByTestId('anuncio-da-quase')).toHaveTextContent('')
    await preencherLivro('Achados de teste no vale de prova', 'Autor, Fulano', '1999')
    await waitFor(() => expect(screen.getByTestId('anuncio-da-quase')).toHaveTextContent(/^Há uma obra quase igual: «Autor 1999»/))
    expect(screen.getByTestId('anuncio-da-quase')).toHaveAttribute('role', 'status')
    expect(screen.getByText('Há uma obra quase igual (veja «Parecidas na Bibliografia»).')).toBeInTheDocument()
  })

  it('N3: Ctrl+Enter na caixa do colar preenche o formulário e não salva', async () => {
    await abrirNova()
    await userEvent.click(screen.getByRole('button', { name: 'Colar do Zotero' }))
    fireEvent.change(campo('Cole aqui o que o Zotero copiou'), { target: { value: '@book{k, title={Pelo teclado}, author={Probe, Ana}, year={2001}}' } })
    fireEvent.keyDown(campo('Cole aqui o que o Zotero copiou'), { key: 'Enter', ctrlKey: true })
    expect(campo('Título')).toHaveValue('Pelo teclado')
    expect(obraPeloTitulo('Pelo teclado')).toBeUndefined()
    expect(endereco()).toBe('/obra/nova')
  })
})

describe('no computador', () => {
  it('a prévia e as parecidas ficam ao lado; «‹ Voltar à bibliografia» no caminho', async () => {
    instalarMatchMedia(1280)
    await abrirNova()
    expect(screen.getByRole('navigation', { name: 'Caminho' })).toHaveTextContent('‹ Voltar à bibliografia')
    expect(screen.getByRole('complementary', { name: 'Prévia e obras parecidas' })).toBeInTheDocument()
    await act(async () => {})
  })
})
