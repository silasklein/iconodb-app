import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { CATALOGO, CONTEXTOS, rotuloDaTecla } from '../app/atalhos'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Atalhos } from './Atalhos'

function Local() {
  return <output data-testid="local">{useLocation().pathname}</output>
}

function abrir(historico = ['/colecoes', '/atalhos']) {
  return render(
    <MemoryRouter initialEntries={historico} initialIndex={historico.length - 1}>
      <Routes>
        <Route path="/atalhos" element={<Atalhos />} />
        <Route path="*" element={<p>outra tela</p>} />
      </Routes>
      <Local />
    </MemoryRouter>,
  )
}
const onde = () => screen.getByTestId('local').textContent
const secao = (nome: string) => screen.getByRole('region', { name: nome })

describe('Atalhos e convenções', () => {
  afterEach(() => instalarMatchMedia(375))

  it('tem o título, os contextos e as convenções', () => {
    abrir()
    expect(screen.getByRole('heading', { level: 1, name: 'Atalhos e convenções' })).toBeInTheDocument()
    for (const nome of ['Global', 'Lista', 'Item', 'Hipótese', 'Visualizador', 'Convenções']) {
      expect(screen.getByRole('heading', { level: 2, name: nome })).toBeInTheDocument()
    }
  })

  it('a lista sai do catálogo declarado: uma linha por atalho, com a descrição dele', () => {
    abrir()
    let total = 0
    for (const c of CONTEXTOS) {
      const nome = { global: 'Global', lista: 'Lista', item: 'Item', hipotese: 'Hipótese', visualizador: 'Visualizador' }[c]
      const itens = within(secao(nome)).getAllByRole('listitem')
      const esperadas = CATALOGO.filter((d) => d.contexto === c)
      expect(itens).toHaveLength(esperadas.length)
      esperadas.forEach((d, i) => expect(itens[i]).toHaveTextContent(d.descricao))
      total += esperadas.length
    }
    expect(total).toBe(CATALOGO.length)
  })

  it('as teclas ficam em <kbd>, as letras em maiúscula e a sequência "g" + letra em duas teclas', () => {
    abrir()
    const global = secao('Global')
    const glossario = within(global).getByText(/Ir ao Glossário/).closest('li')!
    const teclas = [...glossario.querySelectorAll('kbd')].map((k) => k.textContent)
    expect(teclas).toEqual(['G', 'L'])
    expect(glossario).toHaveTextContent(/G\s*depois\s*L/)
    const item = within(secao('Item')).getByText(/Alternar português e alemão/).closest('li')!
    expect([...item.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['L'])
    // setas como símbolos, Esc como "Esc"
    const setas = [...secao('Item').querySelectorAll('kbd')].map((k) => k.textContent)
    expect(setas).toEqual(expect.arrayContaining(['←', '→']))
    expect([...global.querySelectorAll('kbd')].map((k) => k.textContent)).toContain(rotuloDaTecla('Escape'))
    // nenhuma <kbd> em minúscula
    for (const k of document.querySelectorAll('kbd')) if (/^[a-z]$/i.test(k.textContent!)) expect(k.textContent).toBe(k.textContent!.toUpperCase())
  })

  it('as convenções explicam os sublinhados, a imagem invertida e as siglas das fontes', () => {
    abrir()
    const conv = secao('Convenções')
    expect(conv).toHaveTextContent(/sublinhado fino e contínuo/i)
    expect(conv).toHaveTextContent(/termo.*verbete/i)
    expect(conv).toHaveTextContent(/pontilhado/i)
    expect(conv).toHaveTextContent(/hipótese ancorada/i)
    expect(conv).toHaveTextContent(/citações e números/i)
    expect(conv).toHaveTextContent(/invertid/i)
    expect(conv).toHaveTextContent(/toque|clique/i)
    expect(conv).toHaveTextContent(/original/i)
    for (const sigla of ['SKC', 'IPIAO', 'GGG']) expect(conv).toHaveTextContent(sigla)
  })

  it('no celular é uma página inteira com Voltar; Voltar e Esc devolvem à tela de antes', async () => {
    abrir()
    await userEvent.click(screen.getByRole('link', { name: 'Voltar' }))
    expect(onde()).toBe('/colecoes')
  })

  it('Esc volta à tela de antes', async () => {
    abrir()
    await userEvent.keyboard('{Escape}')
    expect(onde()).toBe('/colecoes')
  })

  it('aberta direto (sem tela de antes), Esc leva ao Início', async () => {
    abrir(['/atalhos'])
    await userEvent.keyboard('{Escape}')
    expect(onde()).toBe('/')
  })

  it('no computador há o botão Fechar com a dica Esc', async () => {
    instalarMatchMedia(1280)
    abrir()
    const fechar = await screen.findByRole('button', { name: 'Fechar a lista de atalhos' })
    expect(fechar).toHaveAttribute('aria-keyshortcuts', 'Escape')
    await userEvent.click(fechar)
    expect(onde()).toBe('/colecoes')
  })
})
