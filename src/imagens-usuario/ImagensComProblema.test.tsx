/**
 * Revisão 1 (M3): uma imagem parada por um erro permanente aparece na tela de Sincronização, com a explicação em
 * português e "Tentar de novo"; a sincronização deixa de tentá-la sozinha até a pessoa pedir.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ErroDeConflito } from '../dropbox/escrita'
import { armazemMemoria, type Armazem } from '../pacote/armazem'
import { cacheMemoria } from '../pacote/imagens'
import { sincronizarAgora } from '../usuario/useSincronizacao'
import { estadoAtual } from '../usuario/estado'
import { contarImagensPorEnviar, enviarImagensPendentes } from './fila'
import { ImagensComProblema } from './ImagensComProblema'
import { usarArmazemDasImagens, usarCacheDasImagens } from './local'
import { adicionarImagem } from './operacoes'
import { escritaFalsa, processadaFalsa } from '../../tests/suporte/imagensDeTeste'

vi.mock('../usuario/useSincronizacao', async (original) => ({ ...(await original<typeof import('../usuario/useSincronizacao')>()), sincronizarAgora: vi.fn(async () => null) }))

let armazem: Armazem
beforeEach(() => {
  armazem = armazemMemoria()
  usarArmazemDasImagens(armazem)
  usarCacheDasImagens(cacheMemoria())
})
afterEach(() => {
  usarArmazemDasImagens(undefined)
  usarCacheDasImagens(undefined)
})

describe('ImagensComProblema', () => {
  it('sem problema: nada na tela', async () => {
    const { container } = render(
      <MemoryRouter>
        <ImagensComProblema />
      </MemoryRouter>,
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(container).toBeEmptyDOMElement()
  })

  it('a imagem parada: o objeto, o arquivo, a explicação; "Tentar de novo" a devolve à fila e sincroniza', async () => {
    const id = await adicionarImagem({ objeto: 'CA00002' }, processadaFalsa(), { tipo: 'tons', legenda: '', credito: 'x', principal: false })
    const escrita = escritaFalsa()
    escrita.falhas.set(`usuario/imagens/${id}/tela.webp`, new ErroDeConflito(`usuario/imagens/${id}/tela.webp`))
    await enviarImagensPendentes(escrita, 'telas')
    render(
      <MemoryRouter>
        <ImagensComProblema />
      </MemoryRouter>,
    )
    const secao = await screen.findByRole('region', { name: 'Imagens que não subiram' })
    expect(within(secao).getByRole('link', { name: 'CA00002' })).toHaveAttribute('href', '/item/CA00002')
    expect(within(secao).getByText(/IMG_2041\.JPG/)).toBeInTheDocument()
    expect(within(secao).getByText(/outro conteúdo; nada foi sobrescrito/)).toBeInTheDocument()
    expect(await contarImagensPorEnviar()).toBe(0)
    await userEvent.click(within(secao).getByRole('button', { name: 'Tentar de novo: IMG_2041.JPG' }))
    await waitFor(() => expect(sincronizarAgora).toHaveBeenCalledWith('manual'))
    expect(await contarImagensPorEnviar()).toBe(1)
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Imagens que não subiram' })).toBeNull())
  })

  it('revisão 2: cópia local sumida: sem "continua neste aparelho", sem "Tentar de novo"; "Remover da fila" explica e não apaga o registro', async () => {
    const id = await adicionarImagem({ objeto: 'CA00003' }, processadaFalsa(), { tipo: 'tons', legenda: '', credito: 'x', principal: false })
    await armazem.remover(`${id}/tela.webp`)
    await enviarImagensPendentes(escritaFalsa(), 'telas')
    render(
      <MemoryRouter>
        <ImagensComProblema />
      </MemoryRouter>,
    )
    const secao = await screen.findByRole('region', { name: 'Imagens que não subiram' })
    expect(secao.textContent).not.toMatch(/continua neste aparelho/)
    expect(within(secao).queryByRole('button', { name: /Tentar de novo/ })).toBeNull()
    expect(within(secao).getByText(/não está mais neste aparelho/)).toBeInTheDocument()
    expect(within(secao).getByText(/O registro da imagem fica/)).toBeInTheDocument()
    await userEvent.click(within(secao).getByRole('button', { name: 'Remover da fila: IMG_2041.JPG' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Imagens que não subiram' })).toBeNull())
    expect(await armazem.listar(id)).toEqual([])
    expect(estadoAtual().registro('imagem', id)?.excluido).toBe(false)
  })
})
