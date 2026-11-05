/**
 * O painel da imagem com as imagens do usuário (decisão 33): as do livro primeiro, depois as SKC; a marca SKC e o
 * crédito sob a imagem; a mesma regra de Tipo (traço invertido, tons como está); a principal abre primeiro; a do
 * outro aparelho que ainda não chegou mostra o aviso, sem erro.
 */
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Imagem } from '../banco/tipos'
import { comoImagemExibida, juntarImagens } from '../imagens-usuario/exibicao'
import { usarArmazemDasImagens, usarCacheDasImagens } from '../imagens-usuario/local'
import { adicionarImagem } from '../imagens-usuario/operacoes'
import { imagensDoObjeto, lerImagem } from '../imagens-usuario/registro'
import { usarEscritaDasImagens } from '../imagens-usuario/urls'
import { armazemMemoria } from '../pacote/armazem'
import { cacheMemoria } from '../pacote/imagens'
import { estadoAtual, registrar } from '../usuario/estado'
import { teclasNaoDeclaradas } from '../test/atalhosDeclarados'
import { escritaFalsa, processadaFalsa } from '../../tests/suporte/imagensDeTeste'
import { ImagemItem } from './ImagemItem'

vi.mock('../pacote/imagens', async (original) => ({ ...(await original<typeof import('../pacote/imagens')>()), urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

const livro = (n: number): Imagem => ({
  id: `IMG-T-${n}`,
  itemId: 'T-1',
  ordinal: n,
  display_mode: 'traco',
  tela: `imagens/T/T-1/screen-${n}.webp`,
  miniatura: `imagens/T/T-1/thumb-${n}.webp`,
  largura: 900,
  altura: 1200,
  credito: 'Desenho: Ilustradora Teste',
  rotacao: 0,
})

beforeEach(() => {
  usarArmazemDasImagens(armazemMemoria())
  usarCacheDasImagens(cacheMemoria())
  usarEscritaDasImagens(async () => escritaFalsa())
  let n = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:usuario/${++n}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})
afterEach(() => {
  usarArmazemDasImagens(undefined)
  usarCacheDasImagens(undefined)
  usarEscritaDasImagens(undefined)
  vi.restoreAllMocks()
})

async function doUsuario(objeto: string, dados: Partial<{ tipo: 'traco' | 'tons'; legenda: string; credito: string; principal: boolean }> = {}) {
  const id = await adicionarImagem({ objeto }, processadaFalsa(), { tipo: 'tons', legenda: 'vista frontal', credito: 'Museu de Teste, Cidade de Teste', principal: false, ...dados })
  return lerImagem(estadoAtual().registro('imagem', id)!)!
}

describe('ImagemItem com imagens do usuário', () => {
  it('juntarImagens: as do livro primeiro, depois as do usuário, na ordem; o ordinal continua', async () => {
    const a = await doUsuario('CA00011')
    const b = await doUsuario('CA00011')
    const todas = juntarImagens([livro(1), livro(2)], imagensDoObjeto(estadoAtual(), 'CA00011'))
    expect(todas.map((i) => [i.id, i.ordinal, !!i.skc])).toEqual([
      ['IMG-T-1', 1, false],
      ['IMG-T-2', 2, false],
      [a.id, 3, true],
      [b.id, 4, true],
    ])
  })

  it('a imagem SKC mostra a marca SKC e o crédito · legenda; tons fica como está; "Editar" abre a edição', async () => {
    const u = await doUsuario('CA00012')
    const aoEditar = vi.fn()
    render(<ImagemItem numero="CA00012" imagens={juntarImagens([livro(1)], [u])} aoEditar={aoEditar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Imagem seguinte' }))
    const img = await screen.findByRole('img', { name: 'Imagem 2 de CA00012' })
    expect(img).toHaveAttribute('src', 'blob:usuario/1')
    expect(img.style.filter).toBe('')
    const credito = screen.getByText('Museu de Teste, Cidade de Teste · vista frontal').closest('p')!
    expect(within(credito).getByText('SKC')).toBeInTheDocument()
    await userEvent.click(within(credito).getByRole('button', { name: 'Editar a imagem' }))
    expect(aoEditar).toHaveBeenCalledWith(u.id, expect.anything())
  })

  it('desenho de traço do usuário: invertido como os do livro (e o toque mostra o original)', async () => {
    const u = await doUsuario('CA00013', { tipo: 'traco' })
    render(<ImagemItem numero="CA00013" imagens={[comoImagemExibida(u, 1)]} />)
    const img = await screen.findByRole('img', { name: 'Imagem 1 de CA00013, invertida' })
    expect(img.style.filter).toBe('invert(1)')
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar o original' }))
    expect(screen.getByRole('img', { name: 'Imagem 1 de CA00013' }).style.filter).toBe('')
  })

  it('a principal abre primeiro (sem "inicial" do visualizador)', async () => {
    const u = await doUsuario('CA00014', { principal: true })
    render(<ImagemItem numero="CA00014" imagens={juntarImagens([livro(1), livro(2)], [u])} principal={u.id} />)
    expect(await screen.findByRole('img', { name: 'Imagem 3 de CA00014' })).toBeInTheDocument()
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
  })

  it('uma imagem nova (mostrar) passa a ser a da vez; sem trocar de objeto não volta à primeira', async () => {
    const { rerender } = render(<ImagemItem numero="CA00015" imagens={[livro(1)]} />)
    const u = await doUsuario('CA00015')
    rerender(<ImagemItem numero="CA00015" imagens={juntarImagens([livro(1)], [u])} mostrar={{ id: u.id, vez: 1 }} />)
    expect(await screen.findByRole('img', { name: 'Imagem 2 de CA00015' })).toBeInTheDocument()
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })

  it('"Adicionar imagem" (A) fica ao lado de "Ampliar a imagem"', async () => {
    const aoAdicionar = vi.fn()
    const { container } = render(<ImagemItem numero="CA00001" imagens={[livro(1)]} aoAdicionar={aoAdicionar} />)
    const botao = screen.getByRole('button', { name: 'Adicionar imagem' })
    expect(botao).toHaveAttribute('aria-keyshortcuts', 'A')
    expect(botao).toHaveAttribute('data-tip', 'Adicionar imagem (A)')
    await userEvent.click(botao)
    expect(aoAdicionar).toHaveBeenCalledTimes(1)
    expect(teclasNaoDeclaradas(container)).toEqual([])
  })

  it('objeto sem imagem do livro: o "Adicionar imagem" continua lá', () => {
    render(<ImagemItem numero="OB-x-1" imagens={[]} aoAdicionar={() => undefined} />)
    expect(screen.getByText('Sem imagem')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar imagem' })).toBeInTheDocument()
  })

  it('do outro aparelho, ainda sem os arquivos: "Imagem ainda não enviada pelo outro aparelho" (não é erro)', async () => {
    await registrar('imagem', 'IM-outroapa-5', 'criar', { alvoTipo: 'objeto', alvo: 'CA00016', tipo: 'tons', formato: 'webp', extensao: 'jpg', legenda: '', credito: 'Museu', principal: false })
    const u = lerImagem(estadoAtual().registro('imagem', 'IM-outroapa-5')!)!
    render(<ImagemItem numero="CA00016" imagens={[comoImagemExibida(u, 1)]} />)
    expect(await screen.findByText('Imagem ainda não enviada pelo outro aparelho')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    // A marca e o crédito continuam (o registro já chegou).
    expect(screen.getByText('SKC')).toBeInTheDocument()
    await act(async () => undefined)
  })
})
