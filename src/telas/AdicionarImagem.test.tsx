/**
 * "Adicionar imagem" (ItemAdicionarImagem.dc.html no celular; PC-ItemAdicionarImagem.dc.html no computador) e
 * "Editar a imagem". O processamento é trocado por um falso (o jsdom não tem canvas); o resto é o de verdade
 * (adicionarImagem → OPFS em memória → registrar → IndexedDB falso).
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { cacheMemoria } from '../pacote/imagens'
import { armazemMemoria, type Armazem } from '../pacote/armazem'
import { estadoAtual } from '../usuario/estado'
import { usarArmazemDasImagens, usarCacheDasImagens, MSG_SEM_ESPACO } from '../imagens-usuario/local'
import { adicionarImagem, excluirImagem } from '../imagens-usuario/operacoes'
import { ErroDeFormato, MSG_FORMATO, type ImagemProcessada } from '../imagens-usuario/processar'
import { imagensDoObjeto } from '../imagens-usuario/registro'
import { teclasNaoDeclaradas } from '../test/atalhosDeclarados'
import { processadaFalsa } from '../../tests/suporte/imagensDeTeste'
import { AdicionarImagem, EditarImagem } from './AdicionarImagem'

let armazem: Armazem
beforeEach(() => {
  armazem = armazemMemoria()
  usarArmazemDasImagens(armazem)
  usarCacheDasImagens(cacheMemoria())
  let n = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:previa/${++n}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})
afterEach(() => {
  usarArmazemDasImagens(undefined)
  usarCacheDasImagens(undefined)
  vi.restoreAllMocks()
})

const foto = (nome = 'IMG_2041.JPG', bytes = 3_100_000) => new File([new Uint8Array(bytes)], nome, { type: 'image/jpeg' })
const processarComo = (extra: Partial<ImagemProcessada> = {}) => vi.fn(async (f: File | Blob) => processadaFalsa({ original: f, nome: (f as File).name, ...extra }))
const entrada = (origem: string) => document.querySelector<HTMLInputElement>(`input[type="file"][data-origem="${origem}"]`)!

describe('no celular: a folha de baixo', () => {
  it('(a) três origens (câmera, Fotos, Arquivos), cada uma um <input accept="image/*">; a câmera pede a traseira', async () => {
    const { container } = render(<AdicionarImagem objeto="CA00001" variante="folha" aoFechar={() => undefined} aoAdicionar={() => undefined} processar={processarComo()} />)
    const folha = screen.getByRole('dialog', { name: 'Adicionar imagem a CA00001' })
    expect(folha).toHaveAttribute('aria-modal', 'true')
    for (const nome of [/Tirar foto/, /^Fotos/, /^Arquivos/]) expect(within(folha).getByRole('button', { name: nome })).toBeInTheDocument()
    for (const origem of ['camera', 'galeria', 'arquivos']) expect(entrada(origem)).toHaveAttribute('accept', 'image/*')
    expect(entrada('camera')).toHaveAttribute('capture', 'environment')
    expect(within(folha).getByText(/Fica no seu Dropbox; aparece nos outros aparelhos depois de sincronizar/)).toBeInTheDocument()
    expect(teclasNaoDeclaradas(container)).toEqual([])
  })

  it('(b) escolhida a foto: prévia, nome e tamanho, o Tipo detectado já marcado, legenda, crédito com sugestões, principal', async () => {
    const processar = processarComo({ modoSugerido: 'tons' })
    render(<AdicionarImagem objeto="CA00001" rotuloDoLivro="IPIAO I" variante="folha" aoFechar={() => undefined} aoAdicionar={() => undefined} processar={processar} />)
    await userEvent.upload(entrada('galeria'), foto())
    expect(processar).toHaveBeenCalledTimes(1)
    const folha = screen.getByRole('dialog', { name: 'Adicionar imagem a CA00001' })
    await waitFor(() => expect(within(folha).getByRole('img', { name: 'Prévia da imagem escolhida' })).toHaveAttribute('src', expect.stringMatching(/^blob:/)))
    expect(within(folha).getByText('IMG_2041.JPG')).toBeInTheDocument()
    expect(within(folha).getByText('3,1 MB · da galeria')).toBeInTheDocument()
    expect(within(folha).getByRole('button', { name: 'Trocar a imagem' })).toBeInTheDocument()
    const tipo = within(folha).getByRole('group', { name: 'Tipo' })
    expect(within(tipo).getByRole('radio', { name: /^Foto \/ tons \(mostrar como está\)/ })).toBeChecked()
    expect(within(tipo).getByRole('radio', { name: /^Desenho de traço \(mostrar invertido\)/ })).not.toBeChecked()
    expect(within(tipo).getByText('detectado')).toBeInTheDocument()
    expect(within(folha).getByRole('textbox', { name: 'Legenda (opcional)' })).toBeInTheDocument()
    expect(within(folha).getByRole('textbox', { name: 'Crédito / fonte' })).toHaveAccessibleDescription('Aparece sob a imagem, com a marca SKC.')
    expect(within(within(folha).getByRole('group', { name: 'Créditos já usados' })).getByRole('button', { name: 'foto própria' })).toBeInTheDocument()
    expect(within(folha).getByRole('checkbox', { name: /Usar como imagem principal/ })).toHaveAccessibleName(/no lugar do desenho do IPIAO I/)
  })

  it('Adicionar sem crédito: erro no campo (o botão nunca fica desabilitado); com crédito, grava e devolve o id', async () => {
    const aoAdicionar = vi.fn()
    render(<AdicionarImagem objeto="CA00001" variante="folha" aoFechar={() => undefined} aoAdicionar={aoAdicionar} processar={processarComo()} />)
    await userEvent.upload(entrada('galeria'), foto())
    const adicionar = await screen.findByRole('button', { name: 'Adicionar' })
    expect(adicionar).toBeEnabled()
    await userEvent.click(adicionar)
    const credito = screen.getByRole('textbox', { name: 'Crédito / fonte' })
    expect(credito).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent(/de onde vem a imagem/)
    expect(credito).toHaveFocus()
    expect(aoAdicionar).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'foto própria' }))
    expect(credito).toHaveValue('foto própria')
    await userEvent.type(screen.getByRole('textbox', { name: 'Legenda (opcional)' }), 'vista frontal')
    await userEvent.click(screen.getByRole('radio', { name: /^Desenho de traço/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Usar como imagem principal/ }))
    await userEvent.click(adicionar)
    await waitFor(() => expect(aoAdicionar).toHaveBeenCalledTimes(1))
    const [ids] = aoAdicionar.mock.calls[0]! as [string[]]
    expect(ids).toHaveLength(1)
    expect(estadoAtual().registro('imagem', ids[0]!)!.campos).toMatchObject({ alvo: 'CA00001', credito: 'foto própria', legenda: 'vista frontal', tipo: 'traco', tipoDetectado: 'tons', principal: true })
  })

  it('formato que não abre: o aviso em português na prévia, nada é gravado, e dá para trocar a imagem', async () => {
    const processar = vi.fn(async () => {
      throw new ErroDeFormato()
    })
    const aoAdicionar = vi.fn()
    render(<AdicionarImagem objeto="CA00001" variante="folha" aoFechar={() => undefined} aoAdicionar={aoAdicionar} processar={processar} />)
    await userEvent.upload(entrada('arquivos'), foto('IMG_2041.HEIC'))
    expect(await screen.findByText(MSG_FORMATO)).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Crédito / fonte' }), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toMatch(/não abre neste aparelho/)
    expect(aoAdicionar).not.toHaveBeenCalled()
    expect(await armazem.listar('')).toEqual([])
    expect(screen.getByRole('button', { name: 'Trocar a imagem' })).toBeInTheDocument()
  })

  it('sem espaço no aparelho: a mensagem clara no pé, a folha continua aberta com o que foi escrito', async () => {
    usarArmazemDasImagens({ ...armazemMemoria(), gravar: async () => Promise.reject(new DOMException('cheio', 'QuotaExceededError')) })
    const aoAdicionar = vi.fn()
    render(<AdicionarImagem objeto="CA00001" variante="folha" aoFechar={() => undefined} aoAdicionar={aoAdicionar} processar={processarComo()} />)
    await userEvent.upload(entrada('galeria'), foto())
    await userEvent.type(await screen.findByRole('textbox', { name: 'Crédito / fonte' }), 'foto própria')
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(await screen.findByText(MSG_SEM_ESPACO)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Crédito / fonte' })).toHaveValue('foto própria')
    expect(aoAdicionar).not.toHaveBeenCalled()
  })

  it('Esc e Cancelar fecham; a prévia (blob:) é revogada ao fechar', async () => {
    const aoFechar = vi.fn()
    const { unmount } = render(<AdicionarImagem objeto="CA00001" variante="folha" aoFechar={aoFechar} aoAdicionar={() => undefined} processar={processarComo()} />)
    await userEvent.upload(entrada('galeria'), foto())
    await screen.findByRole('img', { name: 'Prévia da imagem escolhida' })
    // Com uma imagem escolhida, Esc pergunta antes (revisão 1, M6); Cancelar fecha direto.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await userEvent.click(screen.getByRole('button', { name: 'Descartar a imagem' }))
    expect(aoFechar).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(aoFechar).toHaveBeenCalledTimes(2)
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:previa/1')
  })

  it('as excluídas deste objeto aparecem na primeira etapa, com Restaurar', async () => {
    const id = await adicionarImagem({ objeto: 'CA00009' }, processadaFalsa(), { tipo: 'tons', legenda: '', credito: 'Museu X', principal: false })
    await excluirImagem(id)
    render(<AdicionarImagem objeto="CA00009" variante="folha" aoFechar={() => undefined} aoAdicionar={() => undefined} processar={processarComo()} />)
    const excluidas = screen.getByRole('region', { name: 'Imagens excluídas deste objeto' })
    await userEvent.click(within(excluidas).getByRole('button', { name: 'Restaurar a imagem Museu X' }))
    await waitFor(() => expect(imagensDoObjeto(estadoAtual(), 'CA00009').map((i) => i.id)).toEqual([id]))
  })
})

describe('no computador: o diálogo com a área de soltar', () => {
  it('soltar duas imagens: as duas na lista, cada uma com os próprios campos; "Adicionar 2 imagens" grava as duas', async () => {
    const processar = processarComo()
    const aoAdicionar = vi.fn()
    render(<AdicionarImagem objeto="CA00001" variante="dialogo" aoFechar={() => undefined} aoAdicionar={aoAdicionar} processar={processar} />)
    const dialogo = screen.getByRole('dialog', { name: 'Adicionar imagem a CA00001' })
    expect(within(dialogo).getByRole('heading', { name: /Adicionar imagem/ })).toBeInTheDocument()
    const area = within(dialogo).getByText('Arraste imagens aqui ou escolha arquivos').closest('[data-area-de-soltar]')!
    expect(within(dialogo).getByRole('button', { name: 'Escolher arquivos' })).toBeInTheDocument()
    expect(entrada('arquivos')).toHaveAttribute('multiple')
    await act(async () => {
      fireEvent.drop(area, { dataTransfer: { files: [foto('frente.jpg', 1_800_000), foto('verso.jpg', 900_000)], types: ['Files'] } })
    })
    await waitFor(() => expect(processar).toHaveBeenCalledTimes(2))
    expect(within(dialogo).getByText('2 imagens para adicionar')).toBeInTheDocument()
    // Uma por vez (uma foto de 48 MP de cada vez na memória).
    await within(dialogo).findByText('8.000 × 6.000 px · 1,8 MB')
    const credito = within(dialogo).getByRole('textbox', { name: 'Crédito / fonte' })
    await userEvent.type(credito, 'frente: museu')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Editar verso.jpg' }))
    expect(within(dialogo).getByRole('textbox', { name: 'Crédito / fonte' })).toHaveValue('')
    await userEvent.type(within(dialogo).getByRole('textbox', { name: 'Crédito / fonte' }), 'verso: museu')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Adicionar 2 imagens' }))
    await waitFor(() => expect(aoAdicionar).toHaveBeenCalledTimes(1))
    const imagens = imagensDoObjeto(estadoAtual(), 'CA00001').slice(-2)
    expect(imagens.map((i) => [i.nome, i.credito])).toEqual([
      ['frente.jpg', 'frente: museu'],
      ['verso.jpg', 'verso: museu'],
    ])
  })

  it('tirar uma imagem da lista; só uma pode ser a principal', async () => {
    render(<AdicionarImagem objeto="CA00001" variante="dialogo" aoFechar={() => undefined} aoAdicionar={() => undefined} processar={processarComo()} />)
    await userEvent.upload(entrada('arquivos'), [foto('a.jpg'), foto('b.jpg')])
    await screen.findByText('2 imagens para adicionar')
    await userEvent.click(screen.getByRole('checkbox', { name: /Usar como imagem principal/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Editar b.jpg' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Usar como imagem principal/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Editar a.jpg' }))
    expect(screen.getByRole('checkbox', { name: /Usar como imagem principal/ })).not.toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Tirar a.jpg da lista' }))
    expect(screen.getByText('1 imagem para adicionar')).toBeInTheDocument()
  })

  it('arquivos vindos de fora (soltos sobre o item) já entram na lista', async () => {
    const processar = processarComo()
    render(<AdicionarImagem objeto="CA00001" variante="dialogo" arquivos={[foto('solta.jpg')]} aoFechar={() => undefined} aoAdicionar={() => undefined} processar={processar} />)
    expect(await screen.findByText('1 imagem para adicionar')).toBeInTheDocument()
    expect(processar).toHaveBeenCalledTimes(1)
  })
})

describe('Editar a imagem', () => {
  it('Tipo e principal gravam na hora; legenda e crédito se salvam sozinhos; Excluir é reversível', async () => {
    const id = await adicionarImagem({ objeto: 'CA00010' }, processadaFalsa(), { tipo: 'tons', legenda: 'a', credito: 'b', principal: false })
    const aoExcluir = vi.fn()
    render(<EditarImagem id={id} variante="folha" aoFechar={() => undefined} aoExcluir={aoExcluir} />)
    const folha = screen.getByRole('dialog', { name: 'Editar a imagem SKC de CA00010' })
    await userEvent.click(within(folha).getByRole('radio', { name: /^Desenho de traço/ }))
    await waitFor(() => expect(estadoAtual().registro('imagem', id)!.campos.tipo).toBe('traco'))
    await userEvent.click(within(folha).getByRole('checkbox', { name: /Usar como imagem principal/ }))
    await waitFor(() => expect(estadoAtual().registro('imagem', id)!.campos.principal).toBe(true))
    const credito = within(folha).getByRole('textbox', { name: 'Crédito / fonte' })
    await userEvent.clear(credito)
    await userEvent.type(credito, 'Museu de Teste')
    fireEvent.blur(credito)
    await waitFor(() => expect(estadoAtual().registro('imagem', id)!.campos.credito).toBe('Museu de Teste'))
    await userEvent.click(within(folha).getByRole('button', { name: 'Excluir a imagem' }))
    await waitFor(() => expect(estadoAtual().registro('imagem', id)!.excluido).toBe(true))
    expect(aoExcluir).toHaveBeenCalledWith(id)
  })
})

describe('revisão 1 (M6): não perder a escolha por engano; mensagens em português', () => {
  it('com imagens escolhidas, Esc e o fundo perguntam "Descartar 1 imagem?"; «Voltar à imagem» mantém, «Descartar a imagem» fecha', async () => {
    const aoFechar = vi.fn()
    render(<AdicionarImagem objeto="CA00001" variante="folha" aoFechar={aoFechar} aoAdicionar={() => undefined} processar={processarComo()} />)
    // Sem nada escolhido, Esc fecha direto.
    await userEvent.upload(entrada('galeria'), foto())
    await screen.findByRole('img', { name: 'Prévia da imagem escolhida' })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Crédito / fonte' }), { key: 'Escape' })
    expect(aoFechar).not.toHaveBeenCalled()
    const pergunta = screen.getByRole('alertdialog', { name: 'Descartar 1 imagem?' })
    expect(within(pergunta).getByRole('button', { name: 'Voltar à imagem' })).toHaveFocus()
    expect(within(pergunta).getByRole('button', { name: 'Descartar a imagem' })).toBeInTheDocument()
    expect(pergunta).toHaveTextContent('A escolha e o que foi escrito se perdem.')
    await userEvent.click(within(pergunta).getByRole('button', { name: 'Voltar à imagem' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByRole('img', { name: 'Prévia da imagem escolhida' })).toBeInTheDocument()
    fireEvent.click(document.querySelector('.adicionar-imagem-fundo')!)
    await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Descartar 1 imagem?' })).getByRole('button', { name: 'Descartar a imagem' }))
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('com várias imagens escolhidas, os botões vão ao plural; o foco começa em «Voltar às imagens»', async () => {
    render(<AdicionarImagem objeto="CA00001" variante="dialogo" aoFechar={() => undefined} aoAdicionar={() => undefined} processar={processarComo()} />)
    const dialogo = screen.getByRole('dialog', { name: 'Adicionar imagem a CA00001' })
    const area = within(dialogo).getByText('Arraste imagens aqui ou escolha arquivos').closest('[data-area-de-soltar]')!
    await act(async () => {
      fireEvent.drop(area, { dataTransfer: { files: [foto('frente.jpg'), foto('verso.jpg')], types: ['Files'] } })
    })
    await screen.findByText('2 imagens para adicionar')
    fireEvent.keyDown(dialogo, { key: 'Escape' })
    const pergunta = await screen.findByRole('alertdialog', { name: 'Descartar 2 imagens?' })
    expect(within(pergunta).getByRole('button', { name: 'Voltar às imagens' })).toHaveFocus()
    expect(within(pergunta).getByRole('button', { name: 'Descartar as imagens' })).toBeInTheDocument()
  })

  it('sem nada escolhido, Esc fecha sem perguntar', () => {
    const aoFechar = vi.fn()
    render(<AdicionarImagem objeto="CA00001" variante="folha" aoFechar={aoFechar} aoAdicionar={() => undefined} processar={processarComo()} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('erro que não é de formato: a mensagem em português e, à parte, uma linha "Detalhe"', async () => {
    const processar = vi.fn(async () => {
      throw new Error('OffscreenCanvas: out of memory')
    })
    render(<AdicionarImagem objeto="CA00001" variante="folha" aoFechar={() => undefined} aoAdicionar={() => undefined} processar={processar} />)
    await userEvent.upload(entrada('galeria'), foto())
    const aviso = await screen.findByText('Não foi possível preparar esta imagem neste aparelho. Tente de novo ou escolha outra.')
    expect(aviso.textContent).not.toMatch(/OffscreenCanvas/)
    expect(screen.getByText('Detalhe: OffscreenCanvas: out of memory')).toBeInTheDocument()
  })
})

describe('revisão 1 (M7): Editar a imagem', () => {
  it('o crédito não fica vazio: apagar mostra o erro no campo e o valor guardado continua o anterior', async () => {
    const id = await adicionarImagem({ objeto: 'CA00011' }, processadaFalsa(), { tipo: 'tons', legenda: '', credito: 'Museu antigo', principal: false })
    render(<EditarImagem id={id} variante="folha" aoFechar={() => undefined} aoExcluir={() => undefined} />)
    const credito = screen.getByRole('textbox', { name: 'Crédito / fonte' })
    await userEvent.clear(credito)
    fireEvent.blur(credito)
    expect(await screen.findByRole('alert')).toHaveTextContent(/de onde vem a imagem/)
    expect(credito).toHaveAttribute('aria-invalid', 'true')
    await new Promise((r) => setTimeout(r, 1200)) // passa o atraso do salvamento automático
    expect(estadoAtual().registro('imagem', id)!.campos.credito).toBe('Museu antigo')
    await userEvent.type(credito, 'Museu novo')
    fireEvent.blur(credito)
    await waitFor(() => expect(estadoAtual().registro('imagem', id)!.campos.credito).toBe('Museu novo'))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('revisão 1 (M8): o teclado do iPhone com a folha aberta', () => {
  it('a página de trás não rola enquanto a folha está aberta, a camada segue o visualViewport, e tudo volta ao fechar', () => {
    const ouvintes = new Map<string, () => void>()
    const vv = { offsetTop: 0, height: 812, addEventListener: (t: string, f: () => void) => void ouvintes.set(t, f), removeEventListener: (t: string) => void ouvintes.delete(t) }
    vi.stubGlobal('visualViewport', vv)
    document.documentElement.style.overflow = 'auto'
    const { unmount } = render(<AdicionarImagem objeto="CA00001" variante="folha" aoFechar={() => undefined} aoAdicionar={() => undefined} processar={processarComo()} />)
    expect(document.documentElement.style.overflow).toBe('hidden')
    const camada = document.querySelector<HTMLElement>('.adicionar-imagem-camada')!
    expect(camada.style.height).toBe('812px')
    // O teclado abre: a área visível encolhe e desce.
    vv.height = 480
    vv.offsetTop = 120
    ouvintes.get('resize')!()
    expect([camada.style.top, camada.style.height]).toEqual(['120px', '480px'])
    unmount()
    expect(document.documentElement.style.overflow).toBe('auto')
    expect(ouvintes.size).toBe(0)
    vi.unstubAllGlobals()
    document.documentElement.style.overflow = ''
  })
})

describe('revisão 2: a trava de rolagem conta as camadas', () => {
  it('duas camadas abertas: fechar uma não destrava; a última a fechar devolve o valor de antes', async () => {
    const id = await adicionarImagem({ objeto: 'CA00012' }, processadaFalsa(), { tipo: 'tons', legenda: '', credito: 'c', principal: false })
    document.documentElement.style.overflow = 'scroll'
    const fora = render(<AdicionarImagem objeto="CA00012" variante="folha" aoFechar={() => undefined} aoAdicionar={() => undefined} processar={processarComo()} />)
    const dentro = render(<EditarImagem id={id} variante="folha" aoFechar={() => undefined} aoExcluir={() => undefined} />)
    expect(document.documentElement.style.overflow).toBe('hidden')
    // Fechadas fora de ordem (a de fora primeiro): enquanto uma estiver aberta, segue travado.
    fora.unmount()
    expect(document.documentElement.style.overflow).toBe('hidden')
    dentro.unmount()
    expect(document.documentElement.style.overflow).toBe('scroll')
    document.documentElement.style.overflow = ''
  })
})
