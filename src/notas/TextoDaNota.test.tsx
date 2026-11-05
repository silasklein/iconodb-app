import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { registrar } from '../usuario/estado'
import { esquecerAlvos } from './alvos'
import { esquecerCitacoes } from './fontesCitadas'
import { TextoDaNota } from './TextoDaNota'

beforeAll(async () => usarMotor(await bancoDeTeste()))
afterAll(() => usarMotor(null))
beforeEach(() => {
  esquecerAlvos()
  esquecerCitacoes()
})

const ver = (texto: string) =>
  render(
    <MemoryRouter>
      <TextoDaNota texto={texto} />
    </MemoryRouter>,
  )

describe('TextoDaNota: links de [[ref|rótulo]]', () => {
  it('um link para um verbete, objeto, obra e sítio que existem vira link do roteador, com o rótulo da nota', async () => {
    ver('veja [[GL-900001|o leão]], [[CA00002|dois]], [[BIB-900001|Autor]] e [[TESTE-1|Maḥteṣ]].')
    expect(await screen.findByRole('link', { name: 'o leão' })).toHaveAttribute('href', '/verbete/GL-900001')
    expect(screen.getByRole('link', { name: /dois/ })).toHaveAttribute('href', '/item/CA00002')
    expect(screen.getByRole('link', { name: 'Autor' })).toHaveAttribute('href', '/obra/BIB-900001')
    expect(screen.getByRole('link', { name: 'Maḥteṣ' })).toHaveAttribute('href', '/sitio/TESTE-1')
    expect(screen.getByText(/^veja/)).toBeInTheDocument()
  })

  it('sem rótulo, o objeto aparece pelo número e o verbete pelo nome no pacote', async () => {
    ver('[[ca00001]] e [[GL-900002]]')
    expect(await screen.findByRole('link', { name: 'CA00001' })).toHaveAttribute('href', '/item/CA00001')
    await waitFor(() => expect(screen.getByRole('link', { name: 'figura denteada' })).toHaveAttribute('href', '/verbete/GL-900002'))
  })

  it('um alvo que NÃO existe aparece como texto, com um marcador discreto e sem link quebrado', async () => {
    ver('antes [[GL-999999|fantasma]] depois')
    const marcado = await screen.findByTitle('Não encontrado: GL-999999')
    expect(marcado).toHaveTextContent('fantasma')
    expect(marcado.closest('a')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    // o leitor de tela é avisado
    expect(within(marcado).getByText('(não encontrado)')).toBeInTheDocument()
  })

  it('alvo da camada do usuário: a coleção que existe é um link para a tela dela (como grupo); a que não existe é marcada', async () => {
    await registrar('colecao', 'CO-teste000-1', 'criar', { nome: 'Minhas anotações' })
    ver('[[CO-teste000-1|coleção]] e [[CO-teste000-99|sumiu]]')
    expect(await screen.findByTitle('Não encontrado: CO-teste000-99')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'coleção' })).toHaveAttribute('href', '/grupo/CO-teste000-1')
    expect(screen.queryByTitle('Não encontrado: CO-teste000-1')).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('uma referência que não se reconhece fica como está, texto puro', () => {
    ver('isto [[não é nada]] continua assim')
    expect(screen.getByText('isto [[não é nada]] continua assim')).toBeInTheDocument()
  })

  it('marcação no texto ou no rótulo NUNCA vira HTML (nem script, nem imagem)', async () => {
    const { container } = ver('<b>negrito</b> <img src=x onerror="alert(1)"> [[GL-900001|<script>alert(1)</script>]] &lt;i&gt;')
    await screen.findByRole('link')
    expect(container.querySelector('b, img, script, i')).toBeNull()
    expect(container).toHaveTextContent('<b>negrito</b> <img src=x onerror="alert(1)"> <script>alert(1)</script> &lt;i&gt;')
  })

  it('preserva as quebras de linha da nota', () => {
    const { container } = ver('linha 1\nlinha 2')
    expect(container.firstElementChild).toHaveClass('nota-texto')
    expect(container.textContent).toBe('linha 1\nlinha 2')
  })

  it('sem pacote aberto, o link continua link (não se sabe, então não se marca)', async () => {
    usarMotor(null)
    try {
      ver('[[GL-900001|o leão]]')
      expect(await screen.findByRole('link', { name: 'o leão' })).toHaveAttribute('href', '/verbete/GL-900001')
      expect(screen.queryByTitle(/Não encontrado/)).toBeNull()
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })
})

describe('TextoDaNota: citações reconhecidas no texto (decisão 40)', () => {
  it('cada número é um link para o objeto; o intervalo mostra o travessão curto; o texto guardado não muda', async () => {
    const { container } = ver('parecido com TESTE I: 1-3, 5 e CA00002.')
    const cinco = await screen.findByRole('link', { name: 'TESTE I: 5 (BA00001)' })
    expect(cinco).toHaveAttribute('href', '/item/BA00001')
    expect(cinco).toHaveTextContent(/^5$/)
    expect(screen.getByRole('link', { name: 'CA00002' })).toHaveAttribute('href', '/item/CA00002')
    const intervalo = screen.getByRole('button', { name: 'TESTE I: 1–3, lista dos objetos' })
    expect(intervalo).toHaveTextContent(/^1–3$/)
    expect(intervalo).toHaveAttribute('aria-haspopup', 'dialog')
    // só a exibição muda: o hífen vira travessão curto
    expect(container.textContent).toBe('parecido com TESTE I: 1–3, 5 e CA00002.')
  })

  it('um número que o pacote não tem fica com o "?" e sem link; um volume planejado que não chegou também', async () => {
    ver('TESTE I: 9 e IPIAO III: 5-7, 8; IPIAO V: 3')
    const nove = await screen.findByTitle('Não encontrado: TESTE I: 9')
    expect(nove).toHaveTextContent('9')
    expect(within(nove).getByText('(não encontrado)')).toBeInTheDocument()
    expect(await screen.findByTitle('Ainda não está no pacote: IPIAO III: 8')).toBeInTheDocument()
    expect(screen.getByTitle('Ainda não está no pacote: IPIAO III: 5–7')).toHaveTextContent('5–7')
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    // uma obra que não se conhece é texto puro
    expect(screen.queryByTitle(/IPIAO V/)).toBeNull()
  })

  it('"SKC: n" leva ao objeto SKC com esse SKC, Nr.; um Nr. que não existe fica com "?"', async () => {
    await registrar('objeto', 'OB-citacao0-1', 'criar', { numero: 'CA00046', nrSkc: '1', titulo: 'Selo citado.' })
    ver('SKC: 1, 2')
    expect(await screen.findByRole('link', { name: 'SKC: 1 (CA00046)' })).toHaveAttribute('href', '/item/CA00046')
    expect(await screen.findByTitle('Não encontrado: SKC: 2')).toBeInTheDocument()
  })

  it('um número do sistema de Ferro (F1…) solto também é número de objeto: aqui não existe, então "?" (nunca "[[…]]")', async () => {
    const { container } = ver('ver F100002.')
    expect(await screen.findByTitle('Não encontrado: F100002')).toBeInTheDocument()
    expect(container.textContent).not.toContain('[[')
  })

  it('dentro de [[…]] nada é reconhecido: o link escrito continua o mesmo', async () => {
    ver('[[GL-900001|TESTE I: 1]]')
    expect(await screen.findByRole('link', { name: 'TESTE I: 1' })).toHaveAttribute('href', '/verbete/GL-900001')
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('revisão 1: a folha aberta continua aberta quando as obras do pacote chegam e o texto é lido de novo', async () => {
    ver('TESTE I: 1 e SKC: 1-3')
    // O SKC é reconhecido antes do pacote responder; "TESTE I" ainda não.
    fireEvent.click(screen.getByRole('button', { name: 'SKC: 1–3, lista dos objetos' }))
    expect(screen.getByRole('dialog', { name: 'SKC: 1–3' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^TESTE I: 1/ })).toBeNull()
    await screen.findByRole('link', { name: 'TESTE I: 1 (CA00001)' })
    expect(screen.getByRole('dialog', { name: 'SKC: 1–3' })).toBeInTheDocument()
  })

  it('revisão 1: o título da folha mostra o travessão curto, numa fonte em que ele se distingue do hífen', async () => {
    ver('SKC: 1-3')
    fireEvent.click(screen.getByRole('button', { name: 'SKC: 1–3, lista dos objetos' }))
    const titulo = within(screen.getByRole('dialog')).getByRole('heading', { level: 2 })
    expect(titulo).toHaveTextContent(/^SKC: 1–3$/)
    expect(titulo).not.toHaveClass('codigo')
  })

  it('o intervalo abre a folha com os objetos (os que faltam com "?"); Esc fecha e o foco volta ao intervalo', async () => {
    ver('TESTE I: 5-8')
    const intervalo = await screen.findByRole('button', { name: 'TESTE I: 5–8, lista dos objetos' })
    intervalo.focus()
    fireEvent.click(intervalo)
    const folha = await screen.findByRole('dialog', { name: 'TESTE I: 5–8' })
    const links = await within(folha).findAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/item/BA00001', '/item/BA00002'])
    expect(within(folha).getByText('BA00001')).toBeInTheDocument()
    expect(within(folha).getAllByText(/não encontrado/)).toHaveLength(2)
    expect(within(folha).getByText('TESTE I: 7')).toBeInTheDocument()
    // Comparar todos (Tarefa 14): um botão de verdade, com o que ele faz; o teste dele está em CompararTodos.test.tsx
    expect(within(folha).getByRole('button', { name: 'Comparar todos' })).toBeEnabled()
    // ↓ e ↑ andam pela lista; da folha (o foco ao abrir), ↓ vai ao primeiro objeto
    expect(folha).toHaveFocus()
    fireEvent.keyDown(folha, { key: 'ArrowDown' })
    expect(links[0]).toHaveFocus()
    fireEvent.keyDown(links[0]!, { key: 'ArrowDown' })
    expect(links[1]).toHaveFocus()
    fireEvent.keyDown(links[1]!, { key: 'ArrowDown' })
    expect(links[1]).toHaveFocus()
    fireEvent.keyDown(links[1]!, { key: 'ArrowUp' })
    expect(links[0]).toHaveFocus()
    fireEvent.keyDown(links[0]!, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(intervalo).toHaveFocus()
    expect(document.documentElement.style.overflow).toBe('')
  })
})
