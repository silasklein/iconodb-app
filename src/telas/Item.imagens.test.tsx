/**
 * As imagens do usuário na tela do Item (decisão 33), sobre o pacote sintético: as do livro e depois as do usuário,
 * "Adicionar imagem" (A, o ícone, arrastar no computador), a imagem nova à vista com "Imagem adicionada · Desfazer",
 * editar e excluir (reversível), a principal, a linha "Imagens" da ficha, e o visualizador numa imagem do usuário.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { processadaFalsa } from '../../tests/suporte/imagensDeTeste'
import { usarMotor } from '../banco/cliente'
import { usarArmazemDasImagens, usarCacheDasImagens } from '../imagens-usuario/local'
import { adicionarImagem, excluirImagem } from '../imagens-usuario/operacoes'
import { imagensDoObjeto } from '../imagens-usuario/registro'
import { usarEscritaDasImagens } from '../imagens-usuario/urls'
import { armazemMemoria } from '../pacote/armazem'
import { cacheMemoria } from '../pacote/imagens'
import { estadoAtual, registrar } from '../usuario/estado'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Imagem } from './Imagem'
import { Item } from './Item'
import { apertarQuandoPronto } from '../test/teclas'

vi.mock('../pacote/imagens', async (original) => ({ ...(await original<typeof import('../pacote/imagens')>()), urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../imagens-usuario/processar', async (original) => {
  const m = await original<typeof import('../imagens-usuario/processar')>()
  const { processadaFalsa: falsa } = await import('../../tests/suporte/imagensDeTeste')
  return { ...m, processarImagem: vi.fn(async (f: File) => falsa({ original: f, nome: f.name })) }
})

function Local() {
  const { pathname } = useLocation()
  return <output data-testid="local">{pathname}</output>
}
function abrir(caminho: string) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/item/:numero" element={<Item />} />
        <Route path="/imagem/:id" element={<Imagem />} />
      </Routes>
      <Local />
    </MemoryRouter>,
  )
}
const pronto = () => screen.findByRole('button', { name: 'Mostrar o original alemão', hidden: true })
const painel = () => screen.getAllByRole('region', { name: 'Imagem' })[0]!

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  Element.prototype.scrollIntoView = vi.fn()
})
afterAll(() => usarMotor(null))
beforeEach(() => {
  usarArmazemDasImagens(armazemMemoria())
  usarCacheDasImagens(cacheMemoria())
  usarEscritaDasImagens(async () => null)
  let n = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:usuario/${++n}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})
afterEach(() => {
  usarArmazemDasImagens(undefined)
  usarCacheDasImagens(undefined)
  usarEscritaDasImagens(undefined)
  vi.restoreAllMocks()
  instalarMatchMedia(375)
})

const dados = { tipo: 'tons' as const, legenda: 'vista frontal', credito: 'Museu de Teste', principal: false }

describe('Item com imagens do usuário', () => {
  it('as do livro e depois as do usuário; a do usuário com a marca SKC e o crédito; a ficha diz quantas', async () => {
    await adicionarImagem({ objeto: 'CA00002' }, processadaFalsa(), dados)
    abrir('/item/CA00002')
    await pronto()
    expect(within(painel()).getByText('1 / 2')).toBeInTheDocument()
    await userEvent.click(within(painel()).getByRole('button', { name: 'Imagem seguinte' }))
    expect(await within(painel()).findByRole('img', { name: 'Imagem 2 de CA00002' })).toHaveAttribute('src', expect.stringMatching(/^blob:usuario\//))
    expect(within(painel()).getByText('Museu de Teste · vista frontal')).toBeInTheDocument()
    expect(within(painel()).getByText('SKC')).toBeInTheDocument()
    const ficha = screen.getByRole('group', { name: 'Ficha' })
    expect(within(ficha).getByText('Imagens')).toBeInTheDocument()
    expect(within(ficha).getByText('2 · 1 do livro; 1 SKC (Museu de Teste)')).toBeInTheDocument()
  })

  it('a principal abre primeiro', async () => {
    await adicionarImagem({ objeto: 'CA00003' }, processadaFalsa(), { ...dados, principal: true })
    abrir('/item/CA00003')
    await pronto()
    expect(await within(painel()).findByRole('img', { name: 'Imagem 2 de CA00003' })).toBeInTheDocument()
  })

  it('celular: A (ou o ícone) abre a folha; escolher, dar o crédito e Adicionar mostra a imagem nova com "Imagem adicionada · Desfazer"', async () => {
    abrir('/item/CA00004')
    await pronto()
    await apertarQuandoPronto('a', 'item')
    const folha = await screen.findByRole('dialog', { name: 'Adicionar imagem a CA00004' })
    await apertarQuandoPronto('Escape', 'item', folha)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await userEvent.click(within(painel()).getByRole('button', { name: 'Adicionar imagem' }))
    await screen.findByRole('dialog', { name: 'Adicionar imagem a CA00004' })
    await userEvent.upload(document.querySelector<HTMLInputElement>('input[data-origem="galeria"]')!, new File([new Uint8Array(10)], 'IMG_1.JPG', { type: 'image/jpeg' }))
    await userEvent.type(await screen.findByRole('textbox', { name: 'Crédito / fonte' }), 'foto própria')
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await within(painel()).findByRole('img', { name: 'Imagem 2 de CA00004' })).toBeInTheDocument()
    const aviso = screen.getByRole('status', { name: 'Aviso' })
    expect(aviso).toHaveTextContent('Imagem adicionada')
    await userEvent.click(within(aviso).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(imagensDoObjeto(estadoAtual(), 'CA00004')).toEqual([]))
    // Só a do livro de novo: sem paginação.
    await waitFor(() => expect(within(painel()).queryByRole('button', { name: 'Imagem seguinte' })).toBeNull())
  })

  it('Editar → Excluir a imagem: some, "Imagem excluída · Desfazer" a traz de volta', async () => {
    const id = await adicionarImagem({ objeto: 'BA00001' }, processadaFalsa(), dados)
    abrir('/item/BA00001')
    await pronto()
    await userEvent.click(within(painel()).getByRole('button', { name: 'Imagem seguinte' }))
    await userEvent.click(await within(painel()).findByRole('button', { name: 'Editar a imagem' }))
    const folha = await screen.findByRole('dialog', { name: 'Editar a imagem SKC de BA00001' })
    await userEvent.click(within(folha).getByRole('button', { name: 'Excluir a imagem' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(estadoAtual().registro('imagem', id)!.excluido).toBe(true)
    const aviso = screen.getByRole('status', { name: 'Aviso' })
    expect(aviso).toHaveTextContent('Imagem excluída')
    await userEvent.click(within(aviso).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(estadoAtual().registro('imagem', id)!.excluido).toBe(false))
    expect(await within(painel()).findByRole('img', { name: 'Imagem 2 de BA00001' })).toBeInTheDocument()
  })

  it('computador: arrastar uma imagem sobre o item abre o diálogo já com ela', async () => {
    instalarMatchMedia(1280)
    abrir('/item/CA00001')
    await pronto()
    const raiz = document.querySelector('.item-pc')!
    await act(async () => {
      fireEvent.dragOver(raiz, { dataTransfer: { types: ['Files'], files: [] } })
      fireEvent.drop(raiz, { dataTransfer: { types: ['Files'], files: [new File([new Uint8Array(10)], 'solta.jpg', { type: 'image/jpeg' })] } })
    })
    const dialogo = await screen.findByRole('dialog', { name: 'Adicionar imagem a CA00001' })
    expect(await within(dialogo).findByText('1 imagem para adicionar')).toBeInTheDocument()
    expect(within(dialogo).getByText('solta.jpg')).toBeInTheDocument()
  })
})

describe('o visualizador numa imagem do usuário', () => {
  it('abre a imagem (cópia local), com o número, a posição, a marca SKC e o crédito; o zoom funciona; as regiões aparecem', async () => {
    const id = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), { ...dados, tipo: 'traco' })
    await registrar('regiao', 'RG-teste000-1', 'criar', { imagem: id, seletor: '<polygon points="0.1,0.1 0.6,0.1 0.6,0.5"/>', elemento: 'cabeça' })
    instalarMatchMedia(1280)
    abrir(`/imagem/${encodeURIComponent(id)}`)
    const img = await screen.findByRole('img', { name: 'Imagem 3 de CA00001, invertida' })
    expect(img).toHaveAttribute('src', expect.stringMatching(/^blob:usuario\//))
    expect(screen.getByText('CA00001 · 3/3')).toBeInTheDocument()
    const credito = screen.getByText('Museu de Teste · vista frontal').closest('p')!
    expect(within(credito).getByText('SKC')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ampliar' }))
    expect(screen.getByText(/^\d+ %$/).textContent).not.toBe('100 %')
    const painelDeRegioes = screen.getByRole('complementary', { name: 'Elementos e regiões' })
    expect(within(painelDeRegioes).getByText('cabeça')).toBeInTheDocument()
    expect(document.querySelectorAll('.vis-regioes polygon.regiao-traco')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Fechar o visualizador' }))
    await waitFor(() => expect(screen.getByTestId('local')).toHaveTextContent('/item/CA00001'))
  })

  it('imagem excluída ou desconhecida: "Imagem não encontrada"', async () => {
    const id = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)
    await excluirImagem(id)
    abrir(`/imagem/${encodeURIComponent(id)}`)
    expect(await screen.findByRole('heading', { name: 'Imagem não encontrada' })).toBeInTheDocument()
  })
})
