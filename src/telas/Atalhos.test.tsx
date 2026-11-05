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
    for (const nome of ['Global', 'Lista', 'Item', 'Hipótese', 'Visualizador', 'Revisão', 'Comparar', 'Mapa dos sítios', 'Convenções']) {
      expect(screen.getByRole('heading', { level: 2, name: nome })).toBeInTheDocument()
    }
  })

  it('a lista sai do catálogo declarado: uma linha por atalho, com a descrição dele', () => {
    abrir()
    let total = 0
    for (const c of CONTEXTOS) {
      const nome = { global: 'Global', lista: 'Lista', item: 'Item', hipotese: 'Hipótese', visualizador: 'Visualizador', revisao: 'Revisão', comparar: 'Comparar', mapa: 'Mapa dos sítios' }[c]
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

  it('as teclas do mapa levam o nome impresso no teclado de PC e de Mac (PgUp, PgDn, Home, End), não um símbolo que o leitor de tela lê mal', () => {
    abrir()
    const linhas = within(secao('Mapa dos sítios'))
    const teclas = (texto: RegExp) => [...linhas.getByText(texto).closest('li')!.querySelectorAll('kbd')].map((k) => k.textContent)
    expect(teclas(/ponto anterior ou ao próximo/)).toEqual(['PgUp', 'PgDn'])
    expect(teclas(/primeiro ou ao último ponto/)).toEqual(['Home', 'End'])
    for (const k of document.querySelectorAll('kbd')) expect(k.textContent).not.toMatch(/[⇞⇟↖↘]/)
  })

  // Regra: uma tecla é um caractere só quando esse caractere é o que está impresso nela (letra, dígito, seta, sinal); as teclas
  // sem desenho de um caractere só levam o nome que o teclado traz: Esc, Enter, PgUp, PgDn, Home, End.
  it('as teclas seguem uma só grafia: uma letra ou símbolo, o nome "Esc", "Enter", "PgUp", "PgDn", "Home" e "End", ou "Ctrl+S", "⌘S", "Ctrl+Enter", "⌘Enter", "Ctrl+Z", "⌘Z", "Shift+Delete", "Shift+H" e "Alt+↑" / "Alt+↓"; e a folha não conta atalhos', () => {
    abrir()
    for (const k of document.querySelectorAll('kbd')) expect(k.textContent).toMatch(/^(.|Esc|Enter|PgUp|PgDn|Home|End|Ctrl\+[SZ]|⌘[SZ]|Ctrl\+Enter|⌘Enter|Shift\+Delete|Shift\+[A-Z]|Alt\+[↑↓])$/)
    expect(screen.queryByText(/\d+ atalhos/)).toBeNull()
  })

  it('a busca: ↓ ↑ percorrem as sugestões e Shift+Delete tira uma busca recente, no Global', () => {
    abrir()
    const global = secao('Global')
    const setas = within(global).getByText(/percorrer as sugestões/).closest('li')!
    expect([...setas.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['↓', '↑'])
    const tirar = within(global).getByText(/tirar das buscas recentes/).closest('li')!
    expect([...tirar.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['Shift+Delete'])
    expect(within(global).getByText(/fechar as sugestões, depois limpar o texto/)).toBeInTheDocument()
  })

  it('Salvar e sincronizar: Ctrl+S ou ⌘S, no Global', () => {
    abrir()
    const linha = within(secao('Global')).getByText(/^Salvar e sincronizar/).closest('li')!
    expect([...linha.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['Ctrl+S', '⌘S'])
    expect(linha).toHaveTextContent(/Ctrl\+S\s*ou\s*⌘S/)
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
    expect(conv).toHaveTextContent(/IPIAO: Schroer e Keel, Die Ikonographie Palästinas\/Israels und der Alte Orient/)
    expect(conv).toHaveTextContent(/GGG: Keel e Uehlinger, Göttinnen, Götter und Gottessymbole/)
    expect(conv).toHaveTextContent(/SKC: as suas próprias notas e leituras/)
    expect(conv).not.toHaveTextContent(/a sua voz/)
    // T17-C-31: o limite dos pontos muito juntos no mapa
    expect(conv).toHaveTextContent('Pontos muito juntos no mapa')
    expect(conv).toHaveTextContent('No mapa dos sítios, pontos quase no mesmo lugar só se separam com mais zoom ou pelo teclado (Tab e as setas). O minimapa se atualiza quando você solta o mapa.')
    expect(conv).not.toHaveTextContent(/\bpx\b|arrasto/) // sem jargão (revisão m4)
    // os títulos das obras em itálico
    expect([...conv.querySelectorAll('i')].map((i) => i.textContent)).toEqual([
      'Die Ikonographie Palästinas/Israels und der Alte Orient',
      'Göttinnen, Götter und Gottessymbole',
    ])
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
