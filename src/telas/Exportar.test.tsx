/**
 * A tela Exportar (Tarefa 15): três seções (cópia de segurança, regiões W3C, hipóteses para o MEDIATION), cada uma com o
 * que o arquivo leva em números antes de baixar, e a mensagem do resultado. Tudo local: sem login, sem rede.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { B, ev } from '../../tests/suporte/eventosDeTeste'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { processadaFalsa } from '../../tests/suporte/imagensDeTeste'
import { usarMotor } from '../banco/cliente'
import { usarArmazemDasImagens, usarCacheDasImagens } from '../imagens-usuario/local'
import { adicionarImagem } from '../imagens-usuario/operacoes'
import { armazemMemoria } from '../pacote/armazem'
import { cacheMemoria } from '../pacote/imagens'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { entregarArquivo } from '../ui/entregarArquivo'
import { aparelhoAtual } from '../usuario/aparelho'
import { carregarEstado, receberEventos, registrar, registrarVarios } from '../usuario/estado'
import { esquecerPendentes, registrarPendente } from '../usuario/pendentes'
import { montarCopiaCompleta } from '../copias/copiaCompleta'
import { esquecerCopiaCompleta, progressoDaCopiaCompleta } from '../copias/montagemDaCopiaCompleta'
import { escritaDropbox } from '../dropbox/escrita'
import { avisoDasFaltas, Exportar, textoDaCopia, textoDaCopiaCompleta } from './Exportar'

vi.mock('../ui/entregarArquivo', async (original) => ({ ...(await original<typeof import('../ui/entregarArquivo')>()), entregarArquivo: vi.fn() }))
vi.mock('../dropbox/escrita', async (original) => ({ ...(await original<typeof import('../dropbox/escrita')>()), escritaDropbox: vi.fn(async () => null) }))
vi.mock('../copias/copiaCompleta', async (original) => {
  const m = await original<typeof import('../copias/copiaCompleta')>()
  return { ...m, montarCopiaCompleta: vi.fn(m.montarCopiaCompleta) }
})

function apagarBanco() {
  return new Promise<void>((ok) => {
    const r = indexedDB.deleteDatabase('iconodb-usuario')
    r.onsuccess = r.onerror = r.onblocked = () => ok()
  })
}

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/exportar']}>
      <Exportar />
    </MemoryRouter>,
  )
}

/** O que a tela entregou: o arquivo, o nome, o conteúdo já lido como JSON e o tipo. */
async function entregue(i = 0) {
  const [arquivo] = vi.mocked(entregarArquivo).mock.calls[i]!
  return { arquivo, nome: arquivo.name, json: JSON.parse(await arquivo.text()) as Record<string, unknown>, tipo: arquivo.type }
}

const secao = (nome: string) => screen.getByRole('region', { name: nome })
const mensagem = () => screen.getByRole('status', { name: 'Mensagem da exportação' })

beforeAll(async () => usarMotor(await bancoDeTeste()))
afterAll(() => usarMotor(null))

beforeEach(async () => {
  await apagarBanco()
  await carregarEstado()
  esquecerPendentes()
  vi.mocked(entregarArquivo).mockReset()
  vi.mocked(entregarArquivo).mockResolvedValue('baixado')
})
afterEach(() => {
  instalarMatchMedia(375)
  // a montagem da cópia completa vive no módulo: nada dela passa de um teste para o outro
  esquecerCopiaCompleta()
})

/** Uma camada com dados inventados: uma nota local por enviar, e do outro aparelho uma hipótese SKC e uma região. */
async function comDados() {
  await registrar('nota', 'NT-x-1', 'criar', { texto: 'nota inventada' })
  await receberEventos([
    ev({ ap: B, seq: 1, tipo: 'regiao', reg: 'RG-bbbbbbbb-1', op: 'criar', campos: { imagem: 'IMG-TESTE-0003-1', objeto: 'CA00003', seletor: '<polygon points="0,0 1,0 1,1"/>', elemento: 'leão inventado', elementoId: null, pai: null } }),
    ev({ ap: B, seq: 2, tipo: 'hipotese', reg: 'HY-bbbbbbbb-1', op: 'criar', campos: { objeto: 'CA00003', sobre: 'elemento', elemento: 'RG-bbbbbbbb-1', elementoRotulo: 'leão inventado', termos: ['GL-900007'], termosRotulos: ['x'], nivel: 'iconographic', modalidade: 'possible', justificativa: '', ancora: null } }),
    ev({ ap: B, seq: 3, tipo: 'posicao', reg: 'HY-900001', op: 'criar', campos: { hipotese: 'HY-900001', posicao: 'concordo' } }),
  ])
}

describe('Exportar', () => {
  it('título, as seções com explicação, números e um botão cada; a mensagem numa região viva', async () => {
    await comDados()
    abrir()
    expect(screen.getByRole('heading', { level: 1, name: 'Cópias e exportação' })).toBeInTheDocument()
    expect(screen.getByText('Os arquivos são gerados neste aparelho, com o que está gravado nele.')).toBeInTheDocument()
    const copia = secao('Cópia de segurança')
    expect(within(copia).getByText('Tudo o que é seu, num arquivo JSON: notas, coleções, hipóteses, regiões, objetos SKC, sítios e verbetes. As fotos não vão dentro: para levá-las junto, use a cópia completa.')).toBeInTheDocument()
    expect(await within(copia).findByText('4 eventos de 2 aparelhos · 1 por enviar')).toBeInTheDocument()
    expect(within(copia).getByRole('button', { name: 'Baixar cópia' })).toHaveAccessibleDescription('4 eventos de 2 aparelhos · 1 por enviar')

    const regioes = secao('Regiões (W3C Web Annotation)')
    expect(await within(regioes).findByText('2 regiões: 1 sua, 1 dos livros')).toBeInTheDocument()
    expect(within(regioes).getByRole('button', { name: 'Exportar regiões' })).toBeInTheDocument()

    const hip = secao('Hipóteses para o MEDIATION')
    expect(hip).toHaveTextContent('posições sobre as hipóteses dos livros não vão')
    expect(await within(hip).findByText('1 hipótese SKC')).toBeInTheDocument()
    expect(within(hip).getByRole('button', { name: 'Exportar hipóteses para o MEDIATION' })).toBeInTheDocument()

    expect(mensagem()).toBeEmptyDOMElement()
  })

  it('camada vazia: os números dizem «nada ainda» e os três botões funcionam, com arquivos válidos e vazios', async () => {
    abrir()
    const copia = secao('Cópia de segurança')
    expect(await within(copia).findByText('nada ainda')).toBeInTheDocument()
    expect(await within(secao('Regiões (W3C Web Annotation)')).findByText('suas: nada ainda · 1 dos livros')).toBeInTheDocument()
    expect(await within(secao('Hipóteses para o MEDIATION')).findByText('nada ainda')).toBeInTheDocument()

    await userEvent.click(within(copia).getByRole('button', { name: 'Baixar cópia' }))
    await waitFor(() => expect(entregarArquivo).toHaveBeenCalledTimes(1))
    const c = await entregue(0)
    expect(c.nome).toMatch(/^iconodb-copia-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
    expect(c.tipo).toBe('application/json')
    expect(c.json).toMatchObject({ formato: 'iconodb-copia', versao: 1, eventos: [], base: null, estado: { v: 1, registros: [] } })
    expect(await screen.findByText(`Pronto: ${c.nome} foi baixado.`)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Exportar hipóteses para o MEDIATION' }))
    await waitFor(() => expect(entregarArquivo).toHaveBeenCalledTimes(2))
    expect((await entregue(1)).json).toMatchObject({ formato: 'iconodb-mediation', hipoteses: [] })

    await userEvent.click(screen.getByRole('button', { name: 'Exportar regiões' }))
    await waitFor(() => expect(entregarArquivo).toHaveBeenCalledTimes(3))
    expect((await entregue(2)).json).toMatchObject({ type: 'AnnotationCollection', total: 1 })
  })

  it('baixar a cópia: todos os eventos (os por enviar também) e o estado; a mensagem diz o nome do arquivo', async () => {
    await comDados()
    abrir()
    await within(secao('Cópia de segurança')).findByText('4 eventos de 2 aparelhos · 1 por enviar')
    await userEvent.click(screen.getByRole('button', { name: 'Baixar cópia' }))
    await waitFor(() => expect(entregarArquivo).toHaveBeenCalledTimes(1))
    const { nome, json } = await entregue()
    const { id } = await aparelhoAtual()
    expect((json.eventos as { aparelho: string }[]).map((e) => e.aparelho).sort()).toEqual([B, B, B, id].sort())
    expect(json.naoEnviados).toHaveLength(1)
    expect((json.estado as { registros: unknown[] }).registros).toHaveLength(4)
    expect(mensagem()).toHaveTextContent(`Pronto: ${nome} foi baixado.`)
  })

  it('exportar as regiões: as do usuário e as dos livros, em JSON-LD; as hipóteses: só as próprias', async () => {
    await comDados()
    abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Exportar regiões' }))
    await waitFor(() => expect(entregarArquivo).toHaveBeenCalledTimes(1))
    const r = await entregue()
    expect(r.nome).toMatch(/^iconodb-regioes-.*\.jsonld$/)
    expect(r.tipo).toBe('application/ld+json')
    const itens = (r.json.first as { items: { id: string; target: { selector: { value: string } } }[] }).items
    expect(itens.map((a) => a.id)).toEqual(['urn:iconodb:regiao:RG-bbbbbbbb-1', 'urn:iconodb:regiao-do-livro:EL-900001:IMG-TESTE-0003-1'])
    // A região do usuário numa imagem do livro: em pixels (900 × 1200).
    expect(itens[0]!.target.selector.value).toContain('viewBox="0 0 900 1200"')

    await userEvent.click(screen.getByRole('button', { name: 'Exportar hipóteses para o MEDIATION' }))
    await waitFor(() => expect(entregarArquivo).toHaveBeenCalledTimes(2))
    const h = await entregue(1)
    expect(h.nome).toMatch(/^iconodb-hipoteses-mediation-.*\.json$/)
    expect((h.json.hipoteses as { id: string; fonte: string; publicado: boolean; localizador: string }[]).map((x) => [x.id, x.fonte, x.publicado, x.localizador])).toEqual([['HY-bbbbbbbb-1', 'own_unpublished', false, 'TESTE I, Nr. 3']])
    expect(JSON.stringify(h.json)).not.toContain('HY-900001')
  })

  it('os números acompanham o que muda (uma nota nova)', async () => {
    abrir()
    const copia = secao('Cópia de segurança')
    await within(copia).findByText('nada ainda')
    await act(async () => {
      await registrarVarios([{ tipo: 'nota', reg: 'NT-x-1', op: 'criar', campos: { texto: 'a' } }])
    })
    expect(await within(copia).findByText('1 evento de 1 aparelho · 1 por enviar')).toBeInTheDocument()
  })

  it('o que está por gravar (um campo aberto) entra na cópia', async () => {
    let gravado = false
    registrarPendente(async () => {
      if (gravado) return
      gravado = true
      await registrar('nota', 'NT-x-9', 'criar', { texto: 'digitando' })
    })
    abrir()
    await within(secao('Cópia de segurança')).findByText('nada ainda')
    await userEvent.click(screen.getByRole('button', { name: 'Baixar cópia' }))
    await waitFor(() => expect(entregarArquivo).toHaveBeenCalledTimes(1))
    expect(((await entregue()).json.eventos as { reg: string }[]).map((e) => e.reg)).toEqual(['NT-x-9'])
  })

  it('compartilhar cancelado não é erro; um erro aparece em português, na mesma região', async () => {
    abrir()
    vi.mocked(entregarArquivo).mockResolvedValueOnce('cancelado')
    await userEvent.click(screen.getByRole('button', { name: 'Baixar cópia' }))
    expect(await screen.findByText('Nada foi salvo: o compartilhamento foi cancelado.')).toBeInTheDocument()
    expect(mensagem()).not.toHaveClass('exp-mensagem-erro')

    vi.mocked(entregarArquivo).mockRejectedValueOnce(new DOMException('cheio', 'QuotaExceededError'))
    await userEvent.click(screen.getByRole('button', { name: 'Exportar hipóteses para o MEDIATION' }))
    expect(await screen.findByText('Não há espaço livre no aparelho para gerar o arquivo. Libere espaço e tente de novo.')).toBeInTheDocument()
    expect(mensagem()).toHaveClass('exp-mensagem-erro')

    vi.mocked(entregarArquivo).mockResolvedValueOnce('compartilhado')
    await userEvent.click(screen.getByRole('button', { name: 'Exportar regiões' }))
    expect(await screen.findByText(/^Pronto: iconodb-regioes-.*\.jsonld foi enviado pela folha de compartilhar\.$/)).toBeInTheDocument()
  })

  it('dois toques seguidos geram um arquivo só', async () => {
    let soltar!: (v: 'baixado') => void
    vi.mocked(entregarArquivo).mockImplementationOnce(() => new Promise((ok) => (soltar = ok)))
    abrir()
    const botao = screen.getByRole('button', { name: 'Baixar cópia' })
    await userEvent.click(botao)
    await waitFor(() => expect(entregarArquivo).toHaveBeenCalledTimes(1))
    expect(botao).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(botao)
    act(() => soltar('baixado'))
    await screen.findByText(/^Pronto: /)
    expect(entregarArquivo).toHaveBeenCalledTimes(1)
    expect(botao).not.toHaveAttribute('aria-busy')
  })

  it('enquanto gera, o botão diz «Gerando…» (e aria-busy); depois volta ao nome', async () => {
    let soltar!: (v: 'baixado') => void
    vi.mocked(entregarArquivo).mockImplementationOnce(() => new Promise((ok) => (soltar = ok)))
    abrir()
    const botao = within(secao('Regiões (W3C Web Annotation)')).getByRole('button', { name: 'Exportar regiões' })
    await userEvent.click(botao)
    // Os dois textos estão sempre no DOM: o que vale é qual deles fica exposto (o outro leva aria-hidden).
    expect(within(botao).getByText('Gerando…')).not.toHaveAttribute('aria-hidden')
    expect(within(botao).getByText('Exportar regiões')).toHaveAttribute('aria-hidden', 'true')
    expect(botao).toHaveAccessibleName('Gerando…')
    expect(botao).toHaveAttribute('aria-busy', 'true')
    // Os outros botões continuam com o nome deles.
    expect(screen.getByRole('button', { name: 'Baixar cópia' })).not.toHaveAttribute('aria-busy')
    await waitFor(() => expect(entregarArquivo).toHaveBeenCalledTimes(1))
    act(() => soltar('baixado'))
    await screen.findByText(/^Pronto: /)
    expect(botao).toHaveAccessibleName('Exportar regiões')
    expect(botao).not.toHaveAttribute('aria-busy')
  })

  it('a região da mensagem é limpa antes de escrever: a mesma mensagem duas vezes é anunciada de novo', async () => {
    abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Exportar hipóteses para o MEDIATION' }))
    const primeira = await screen.findByText(/^Pronto: iconodb-hipoteses-mediation-/)
    const texto = primeira.textContent
    let soltar!: (v: 'baixado') => void
    vi.mocked(entregarArquivo).mockImplementationOnce(() => new Promise((ok) => (soltar = ok)))
    await userEvent.click(screen.getByRole('button', { name: 'Exportar hipóteses para o MEDIATION' }))
    expect(mensagem()).toBeEmptyDOMElement()
    await waitFor(() => expect(entregarArquivo).toHaveBeenCalledTimes(2))
    act(() => soltar('baixado'))
    await waitFor(() => expect(mensagem()).toHaveTextContent(texto!))
  })

  describe('no iPhone com o app instalado: a folha de compartilhar (recusada por falta de um toque recente, ou falhando por outro motivo)', () => {
    it('não diz «foi baixado»: diz que o arquivo está pronto e oferece «Salvar o arquivo», que entrega o MESMO arquivo num toque novo', async () => {
      await comDados()
      vi.mocked(entregarArquivo).mockResolvedValueOnce('precisa-tocar').mockResolvedValueOnce('compartilhado')
      abrir()
      const baixar = screen.getByRole('button', { name: 'Baixar cópia' })
      await userEvent.click(baixar)
      const salvar = await within(mensagem()).findByRole('button', { name: 'Salvar o arquivo' })
      const { arquivo, nome } = await entregue(0)
      expect(mensagem()).toHaveTextContent(`O arquivo ${nome} está pronto. Toque em «Salvar o arquivo» para guardá-lo.`)
      expect(mensagem()).not.toHaveTextContent('foi baixado')
      expect(mensagem()).not.toHaveClass('exp-mensagem-erro')
      expect(salvar).toHaveClass('exp-salvar')
      await userEvent.click(salvar)
      await waitFor(() => expect(entregarArquivo).toHaveBeenCalledTimes(2))
      // O mesmo arquivo (nada foi montado de novo).
      expect(vi.mocked(entregarArquivo).mock.calls[1]![0]).toBe(arquivo)
      expect(await screen.findByText(`Pronto: ${nome} foi enviado pela folha de compartilhar.`)).toBeInTheDocument()
      expect(within(mensagem()).queryByRole('button', { name: 'Salvar o arquivo' })).toBeNull()
      // O foco volta ao botão da seção (o «Salvar o arquivo» saiu da tela).
      expect(baixar).toHaveFocus()
    })

    it('T17-C-12: se o Safari recusa também o segundo toque, o foco fica no «Salvar o arquivo» (o botão é refeito) e dá para tentar de novo', async () => {
      await comDados()
      vi.mocked(entregarArquivo).mockResolvedValueOnce('precisa-tocar').mockResolvedValueOnce('precisa-tocar').mockResolvedValueOnce('compartilhado')
      abrir()
      await userEvent.click(screen.getByRole('button', { name: 'Baixar cópia' }))
      const primeiro = await within(mensagem()).findByRole('button', { name: 'Salvar o arquivo' })
      await userEvent.click(primeiro)
      await waitFor(() => expect(entregarArquivo).toHaveBeenCalledTimes(2))
      // a mensagem é refeita (para ser anunciada de novo) e o botão com ela: o foco vai ao novo, não ao corpo da página
      await waitFor(() => expect(within(mensagem()).getByRole('button', { name: 'Salvar o arquivo' })).toHaveFocus())
      await userEvent.click(within(mensagem()).getByRole('button', { name: 'Salvar o arquivo' }))
      await waitFor(() => expect(entregarArquivo).toHaveBeenCalledTimes(3))
      expect(await screen.findByText(/foi enviado pela folha de compartilhar\./)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Baixar cópia' })).toHaveFocus() // saiu de vez: volta ao botão da seção
    })

    it('E-9: recusada também no segundo toque, aparece o link «Baixar o arquivo» (download simples) com a frase que explica; no primeiro toque ele não existe', async () => {
      const criar = vi.fn(() => 'blob:exportar/1')
      const revogar = vi.fn()
      Object.defineProperty(URL, 'createObjectURL', { value: criar, configurable: true })
      Object.defineProperty(URL, 'revokeObjectURL', { value: revogar, configurable: true })
      vi.mocked(entregarArquivo).mockResolvedValueOnce('precisa-tocar').mockResolvedValueOnce('precisa-tocar')
      abrir()
      await userEvent.click(screen.getByRole('button', { name: 'Baixar cópia' }))
      await within(mensagem()).findByRole('button', { name: 'Salvar o arquivo' })
      expect(within(mensagem()).queryByRole('link', { name: 'Baixar o arquivo' })).toBeNull()
      expect(mensagem()).not.toHaveTextContent('Se a folha de compartilhar não abrir')
      await userEvent.click(within(mensagem()).getByRole('button', { name: 'Salvar o arquivo' }))
      const link = await within(mensagem()).findByRole('link', { name: 'Baixar o arquivo' })
      const { nome } = await entregue(0)
      expect(link).toHaveAttribute('href', 'blob:exportar/1')
      expect(link).toHaveAttribute('download', nome)
      expect(mensagem()).toHaveTextContent('Se a folha de compartilhar não abrir, use o link abaixo para baixar o arquivo.')
      expect(within(mensagem()).getByRole('button', { name: 'Salvar o arquivo' })).toBeInTheDocument()
      // outro botão de exportação descarta o arquivo pronto, o link e a URL
      await userEvent.click(screen.getByRole('button', { name: 'Exportar regiões' }))
      await waitFor(() => expect(within(mensagem()).queryByRole('link', { name: 'Baixar o arquivo' })).toBeNull())
      expect(revogar).toHaveBeenCalledWith('blob:exportar/1')
    })

    describe('a folha falha por outro motivo («folha-falhou»): o arquivo existe, então nada de erro; o link já aparece', () => {
      const FRASE = (nome: string) =>
        `O arquivo ${nome} está pronto, mas a folha de compartilhar não abriu. Toque em «Salvar o arquivo» para tentar de novo ou use o link abaixo para baixar o arquivo.`

      beforeEach(() => {
        Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:exportar/2'), configurable: true })
        Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
      })

      it('primeira exportação: a mensagem exata, «Salvar o arquivo» e o link, sem estilo de erro', async () => {
        vi.mocked(entregarArquivo).mockResolvedValueOnce('folha-falhou')
        abrir()
        await userEvent.click(screen.getByRole('button', { name: 'Baixar cópia' }))
        const salvar = await within(mensagem()).findByRole('button', { name: 'Salvar o arquivo' })
        const { nome } = await entregue(0)
        expect(within(mensagem()).getByText(FRASE(nome))).toBeInTheDocument()
        expect(mensagem()).not.toHaveClass('exp-mensagem-erro')
        expect(mensagem()).not.toHaveTextContent('Não foi possível gerar o arquivo')
        const link = await within(mensagem()).findByRole('link', { name: 'Baixar o arquivo' })
        expect(link).toHaveAttribute('href', 'blob:exportar/2')
        expect(link).toHaveAttribute('download', nome)
        expect(salvar).toBeVisible()
      })

      it('«Salvar o arquivo» que falha do mesmo jeito: o mesmo resultado, com o foco no botão refeito; que dá certo: a mensagem de sucesso, sem link', async () => {
        vi.mocked(entregarArquivo).mockResolvedValueOnce('folha-falhou').mockResolvedValueOnce('folha-falhou').mockResolvedValueOnce('compartilhado')
        abrir()
        await userEvent.click(screen.getByRole('button', { name: 'Baixar cópia' }))
        await userEvent.click(await within(mensagem()).findByRole('button', { name: 'Salvar o arquivo' }))
        await waitFor(() => expect(entregarArquivo).toHaveBeenCalledTimes(2))
        const { nome, arquivo } = await entregue(0)
        await waitFor(() => expect(within(mensagem()).getByRole('button', { name: 'Salvar o arquivo' })).toHaveFocus())
        expect(vi.mocked(entregarArquivo).mock.calls[1]![0]).toBe(arquivo)
        expect(within(mensagem()).getByText(FRASE(nome))).toBeInTheDocument()
        expect(mensagem()).not.toHaveClass('exp-mensagem-erro')
        expect(await within(mensagem()).findByRole('link', { name: 'Baixar o arquivo' })).toBeInTheDocument()
        await userEvent.click(within(mensagem()).getByRole('button', { name: 'Salvar o arquivo' }))
        expect(await screen.findByText(`Pronto: ${nome} foi enviado pela folha de compartilhar.`)).toBeInTheDocument()
        expect(within(mensagem()).queryByRole('link', { name: 'Baixar o arquivo' })).toBeNull()
      })

      it('se o «Salvar o arquivo» cai em «precisa-tocar», vale o texto do segundo toque, com o link, como antes', async () => {
        vi.mocked(entregarArquivo).mockResolvedValueOnce('folha-falhou').mockResolvedValueOnce('precisa-tocar')
        abrir()
        await userEvent.click(screen.getByRole('button', { name: 'Baixar cópia' }))
        await userEvent.click(await within(mensagem()).findByRole('button', { name: 'Salvar o arquivo' }))
        const { nome } = await entregue(0)
        const esperado = `O arquivo ${nome} está pronto. Toque em «Salvar o arquivo» para guardá-lo. Se a folha de compartilhar não abrir, use o link abaixo para baixar o arquivo.`
        await waitFor(() => expect(mensagem()).toHaveTextContent(esperado))
        expect(mensagem()).not.toHaveTextContent('não abriu')
        expect(await within(mensagem()).findByRole('link', { name: 'Baixar o arquivo' })).toBeInTheDocument()
      })

      it('um erro ao gerar o arquivo continua com a mensagem de erro e sem link; cancelar continua sem link', async () => {
        vi.mocked(entregarArquivo).mockRejectedValueOnce(new DOMException('x', 'QuotaExceededError'))
        abrir()
        await userEvent.click(screen.getByRole('button', { name: 'Baixar cópia' }))
        await waitFor(() => expect(mensagem()).toHaveTextContent('Não há espaço livre no aparelho para gerar o arquivo. Libere espaço e tente de novo.'))
        expect(mensagem()).toHaveClass('exp-mensagem-erro')
        expect(within(mensagem()).queryByRole('link', { name: 'Baixar o arquivo' })).toBeNull()
        expect(within(mensagem()).queryByRole('button', { name: 'Salvar o arquivo' })).toBeNull()
        vi.mocked(entregarArquivo).mockResolvedValueOnce('cancelado')
        await userEvent.click(screen.getByRole('button', { name: 'Exportar regiões' }))
        expect(await screen.findByText('Nada foi salvo: o compartilhamento foi cancelado.')).toBeInTheDocument()
        expect(within(mensagem()).queryByRole('link', { name: 'Baixar o arquivo' })).toBeNull()
      })

      it('m-1: «precisa-tocar» → «Salvar o arquivo» → «folha-falhou»: o texto do adendo, «Salvar o arquivo», o link e o foco no botão refeito', async () => {
        vi.mocked(entregarArquivo).mockResolvedValueOnce('precisa-tocar').mockResolvedValueOnce('folha-falhou')
        abrir()
        await userEvent.click(screen.getByRole('button', { name: 'Baixar cópia' }))
        const primeiro = await within(mensagem()).findByRole('button', { name: 'Salvar o arquivo' })
        const { nome } = await entregue(0)
        expect(within(mensagem()).queryByRole('link', { name: 'Baixar o arquivo' })).toBeNull()
        await userEvent.click(primeiro)
        await waitFor(() => expect(mensagem()).toHaveTextContent(FRASE(nome)))
        expect(mensagem()).not.toHaveClass('exp-mensagem-erro')
        expect(mensagem()).not.toHaveTextContent('Se a folha de compartilhar não abrir')
        expect(await within(mensagem()).findByRole('link', { name: 'Baixar o arquivo' })).toHaveAttribute('href', 'blob:exportar/2')
        await waitFor(() => expect(within(mensagem()).getByRole('button', { name: 'Salvar o arquivo' })).toHaveFocus())
      })

      it('m-1: «folha-falhou» → «Salvar o arquivo» → cancelado: o link e o botão somem, o texto de cancelado aparece (sem erro) e o foco volta ao botão da seção', async () => {
        vi.mocked(entregarArquivo).mockResolvedValueOnce('folha-falhou').mockResolvedValueOnce('cancelado')
        abrir()
        const baixar = screen.getByRole('button', { name: 'Baixar cópia' })
        await userEvent.click(baixar)
        await userEvent.click(await within(mensagem()).findByRole('button', { name: 'Salvar o arquivo' }))
        expect(await screen.findByText('Nada foi salvo: o compartilhamento foi cancelado.')).toBeInTheDocument()
        expect(mensagem()).not.toHaveClass('exp-mensagem-erro')
        expect(within(mensagem()).queryByRole('link', { name: 'Baixar o arquivo' })).toBeNull()
        expect(within(mensagem()).queryByRole('button', { name: 'Salvar o arquivo' })).toBeNull()
        expect(baixar).toHaveFocus()
      })

      it('m-1: as URLs «blob:» são revogadas quando o link é refeito ou some; criadas e revogadas fecham a conta, e nunca há mais de uma viva', async () => {
        let n = 0
        const vivas = new Set<string>()
        let maximo = 0
        const criar = vi.fn(() => {
          const url = `blob:exportar/v${++n}`
          vivas.add(url)
          maximo = Math.max(maximo, vivas.size)
          return url
        })
        const revogar = vi.fn((url: string) => void vivas.delete(url))
        Object.defineProperty(URL, 'createObjectURL', { value: criar, configurable: true })
        Object.defineProperty(URL, 'revokeObjectURL', { value: revogar, configurable: true })
        vi.mocked(entregarArquivo).mockResolvedValueOnce('folha-falhou').mockResolvedValueOnce('folha-falhou').mockResolvedValueOnce('cancelado')
        abrir()
        await userEvent.click(screen.getByRole('button', { name: 'Baixar cópia' }))
        const primeiro = await within(mensagem()).findByRole('link', { name: 'Baixar o arquivo' })
        expect(primeiro).toHaveAttribute('href', 'blob:exportar/v1')
        expect(vivas.size).toBe(1)
        // o link é substituído: a URL antiga é revogada e uma nova é criada
        await userEvent.click(within(mensagem()).getByRole('button', { name: 'Salvar o arquivo' }))
        await waitFor(() => expect(within(mensagem()).getByRole('link', { name: 'Baixar o arquivo' })).toHaveAttribute('href', 'blob:exportar/v2'))
        expect(revogar).toHaveBeenCalledWith('blob:exportar/v1')
        expect(vivas).toEqual(new Set(['blob:exportar/v2']))
        // o link some (cancelado): a última URL é revogada
        await userEvent.click(within(mensagem()).getByRole('button', { name: 'Salvar o arquivo' }))
        expect(await screen.findByText('Nada foi salvo: o compartilhamento foi cancelado.')).toBeInTheDocument()
        expect(within(mensagem()).queryByRole('link', { name: 'Baixar o arquivo' })).toBeNull()
        expect(criar).toHaveBeenCalledTimes(2)
        expect(revogar).toHaveBeenCalledTimes(2)
        expect(vivas.size).toBe(0)
        expect(maximo).toBe(1)
      })
    })

    it('cancelar a folha no segundo toque não é erro, e o botão sai', async () => {
      vi.mocked(entregarArquivo).mockResolvedValueOnce('precisa-tocar').mockResolvedValueOnce('cancelado')
      abrir()
      await userEvent.click(screen.getByRole('button', { name: 'Exportar hipóteses para o MEDIATION' }))
      await userEvent.click(await within(mensagem()).findByRole('button', { name: 'Salvar o arquivo' }))
      expect(await screen.findByText('Nada foi salvo: o compartilhamento foi cancelado.')).toBeInTheDocument()
      expect(mensagem()).not.toHaveClass('exp-mensagem-erro')
      expect(within(mensagem()).queryByRole('button', { name: 'Salvar o arquivo' })).toBeNull()
    })

    it('outro botão de exportação descarta o arquivo pronto (e o «Salvar o arquivo»)', async () => {
      vi.mocked(entregarArquivo).mockResolvedValueOnce('precisa-tocar')
      abrir()
      await userEvent.click(screen.getByRole('button', { name: 'Exportar hipóteses para o MEDIATION' }))
      await within(mensagem()).findByRole('button', { name: 'Salvar o arquivo' })
      await userEvent.click(screen.getByRole('button', { name: 'Exportar regiões' }))
      expect(await screen.findByText(/^Pronto: iconodb-regioes-/)).toBeInTheDocument()
      expect(within(mensagem()).queryByRole('button', { name: 'Salvar o arquivo' })).toBeNull()
    })
  })

  it('as imagens que ainda não subiram (fila deste aparelho): «N imagens ainda só neste aparelho», e enviada: false na cópia', async () => {
    usarArmazemDasImagens(armazemMemoria())
    usarCacheDasImagens(cacheMemoria())
    try {
      const id = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), { tipo: 'tons', legenda: '', credito: 'foto própria', principal: false })
      abrir()
      const copia = secao('Cópia de segurança')
      expect(await within(copia).findByText('1 evento de 1 aparelho · 1 por enviar · 1 imagem ainda só neste aparelho')).toBeInTheDocument()
      fireEvent.click(within(copia).getByRole('button', { name: 'Baixar cópia' }))
      await waitFor(() => expect(entregarArquivo).toHaveBeenCalledTimes(1))
      expect((await entregue()).json.imagens).toEqual([expect.objectContaining({ id, enviada: false })])
    } finally {
      usarArmazemDasImagens(undefined)
      usarCacheDasImagens(undefined)
    }
  })

  it('textoDaCopia: as imagens no Dropbox e as que só estão neste aparelho', () => {
    const base = { eventos: 12, aparelhos: 2, porEnviar: 0, registros: 5, vazia: false }
    expect(textoDaCopia({ ...base, imagens: 3, soNoAparelho: 1 })).toBe('12 eventos de 2 aparelhos · 2 imagens no Dropbox · 1 imagem ainda só neste aparelho')
    expect(textoDaCopia({ ...base, imagens: 2, soNoAparelho: 0 })).toBe('12 eventos de 2 aparelhos · 2 imagens no Dropbox')
    expect(textoDaCopia({ ...base, imagens: 2, soNoAparelho: 2 })).toBe('12 eventos de 2 aparelhos · 2 imagens ainda só neste aparelho')
  })

  it('I-1: a folga embaixo da página acompanha a altura real da mensagem (ResizeObserver), e volta a zero quando ela some', async () => {
    const original = globalThis.ResizeObserver
    const observadores: { cb: ResizeObserverCallback; alvos: Element[] }[] = []
    globalThis.ResizeObserver = class {
      private o = { cb: undefined as unknown as ResizeObserverCallback, alvos: [] as Element[] }
      constructor(cb: ResizeObserverCallback) {
        this.o.cb = cb
        observadores.push(this.o)
      }
      observe(el: Element) {
        this.o.alvos.push(el)
      }
      unobserve() {}
      disconnect() {
        this.o.alvos = []
      }
    } as unknown as typeof ResizeObserver
    let alto = 0
    const medida = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { height: this.classList.contains('exp-mensagem') ? alto : 0, width: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }
    })
    try {
      vi.mocked(entregarArquivo).mockResolvedValueOnce('folha-falhou')
      const { container } = abrir()
      const pagina = container.querySelector('.exp-pagina') as HTMLElement
      const caixa = mensagem()
      const observador = observadores.find((o) => o.alvos.includes(caixa))
      expect(observador, 'a mensagem é observada').toBeDefined()
      expect(pagina.style.getPropertyValue('--exp-mensagem-alto')).toBe('0px')
      alto = 246
      act(() => observador!.cb([], {} as ResizeObserver))
      expect(pagina.style.getPropertyValue('--exp-mensagem-alto')).toBe('246px')
      alto = 0
      act(() => observador!.cb([], {} as ResizeObserver))
      expect(pagina.style.getPropertyValue('--exp-mensagem-alto')).toBe('0px')
    } finally {
      medida.mockRestore()
      globalThis.ResizeObserver = original
    }
  })

  it('n-3 e n-4: a mensagem é observada pela caixa da borda (border-box) e o ResizeObserver é desligado ao desmontar', () => {
    const original = globalThis.ResizeObserver
    const observados: { alvo: Element; opcoes?: ResizeObserverOptions }[] = []
    let desligados = 0
    globalThis.ResizeObserver = class {
      observe(alvo: Element, opcoes?: ResizeObserverOptions) {
        observados.push({ alvo, opcoes })
      }
      unobserve() {}
      disconnect() {
        desligados += 1
      }
    } as unknown as typeof ResizeObserver
    try {
      const { unmount } = abrir()
      const caixa = mensagem()
      expect(observados).toHaveLength(1)
      expect(observados[0]?.alvo).toBe(caixa)
      expect(observados[0]?.opcoes).toEqual({ box: 'border-box' })
      expect(desligados).toBe(0)
      unmount()
      expect(desligados).toBe(1)
    } finally {
      globalThis.ResizeObserver = original
    }
  })

  it('no celular tem Voltar; no computador, não (a barra superior está lá)', () => {
    const { unmount } = abrir()
    expect(screen.getByRole('link', { name: 'Voltar' })).toBeInTheDocument()
    unmount()
    instalarMatchMedia(1280)
    abrir()
    expect(screen.queryByRole('link', { name: 'Voltar' })).toBeNull()
  })
})

describe('Cópia completa, com fotos (2C, bloco 1)', () => {
  const NOME = 'iconodb-copia-completa-2026-11-05-1712.zip'
  const zipFalso = () => new File([new Uint8Array([80, 75, 5, 6])], NOME, { type: 'application/zip' })
  const completa = () => secao('Cópia completa, com fotos')
  const baixarCompleta = () => within(completa()).getByRole('button', { name: /Baixar cópia completa|Juntando…/ })

  beforeEach(() => {
    esquecerCopiaCompleta()
    vi.mocked(montarCopiaCompleta).mockClear()
    vi.mocked(escritaDropbox).mockReset()
    vi.mocked(escritaDropbox).mockResolvedValue(null)
  })
  afterEach(() => {
    usarArmazemDasImagens(undefined)
    usarCacheDasImagens(undefined)
  })

  /** Segura a montagem: `avancar` chama o aoAvancar da tela; `terminar` resolve com as faltas. */
  function montagemSegura() {
    const c = { avancar: (_f: number, _t: number) => undefined as void, terminar: (_faltaram: string[]) => undefined as void, dep: null as Parameters<typeof montarCopiaCompleta>[0] | null }
    vi.mocked(montarCopiaCompleta).mockImplementationOnce(
      (dep) =>
        new Promise((ok) => {
          c.dep = dep
          c.avancar = (f, t) => act(() => dep.aoAvancar(f, t))
          c.terminar = (faltaram) => ok({ arquivo: zipFalso(), faltaram })
        }),
    )
    return c
  }

  it('a seção logo depois da cópia de segurança, com o texto, «nenhuma foto ainda» e «Baixar cópia completa»', async () => {
    abrir()
    const s = completa()
    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titulos.slice(0, 2)).toEqual(['Cópia de segurança', 'Cópia completa, com fotos'])
    expect(within(s).getByText('Tudo o que está na cópia de segurança, mais as suas fotos, num arquivo .zip. Use-a para guardar fora do Dropbox.')).toBeInTheDocument()
    expect(within(s).getByText('nenhuma foto ainda')).toBeInTheDocument()
    const botao = within(s).getByRole('button', { name: 'Baixar cópia completa' })
    expect(botao).toHaveAccessibleDescription('nenhuma foto ainda')
    expect(botao).not.toHaveClass('exp-botao-principal')
  })

  it('com fotos: «N fotos, cerca de M MB», acompanhando o que muda', async () => {
    usarArmazemDasImagens(armazemMemoria())
    usarCacheDasImagens(cacheMemoria())
    abrir()
    await within(completa()).findByText('nenhuma foto ainda')
    await act(async () => {
      await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa({ original: new File([new Uint8Array(2_600_000)], 'IMG_2041.HEIC') }), { tipo: 'tons', legenda: '', credito: 'x', principal: false })
    })
    expect(await within(completa()).findByText('1 foto, cerca de 3 MB')).toBeInTheDocument()
  })

  it('textoDaCopiaCompleta: MB arredondado (1 MB = 1.000.000 bytes, nunca «0 MB»); sem tamanho conhecido, só as fotos', () => {
    expect(textoDaCopiaCompleta({ fotos: 40, bytes: 180_400_000 })).toBe('40 fotos, cerca de 180 MB')
    expect(textoDaCopiaCompleta({ fotos: 40, bytes: 179_500_000 })).toBe('40 fotos, cerca de 180 MB')
    expect(textoDaCopiaCompleta({ fotos: 1, bytes: 300_000 })).toBe('1 foto, cerca de 1 MB')
    expect(textoDaCopiaCompleta({ fotos: 1500, bytes: 7_250_000_000 })).toBe('1.500 fotos, cerca de 7.250 MB')
    expect(textoDaCopiaCompleta({ fotos: 3, bytes: 0 })).toBe('3 fotos')
    expect(textoDaCopiaCompleta({ fotos: 0, bytes: 0 })).toBe('nenhuma foto ainda')
  })

  it('avisoDasFaltas: quantas e quais (até 5 nomes, depois «e mais N»)', () => {
    expect(avisoDasFaltas([])).toBeNull()
    expect(avisoDasFaltas(['IMG_2041.HEIC'])).toBe('1 foto ficou de fora (IMG_2041.HEIC): tente de novo mais tarde.')
    expect(avisoDasFaltas(['IMG_2041.HEIC', 'IMG_2050.HEIC'])).toBe('2 fotos ficaram de fora (IMG_2041.HEIC, IMG_2050.HEIC): tente de novo mais tarde.')
    expect(avisoDasFaltas(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toBe('7 fotos ficaram de fora (a, b, c, d, e e mais 2): tente de novo mais tarde.')
  })

  it('durante: «Juntando…» desabilitado e «Juntando as fotos: 12 de 40…» com a barra; no fim, pronto com as faltas antes de «Toque em «Salvar o arquivo»…»', async () => {
    const escrita = { baixar: vi.fn() } as unknown as NonNullable<Awaited<ReturnType<typeof escritaDropbox>>>
    vi.mocked(escritaDropbox).mockResolvedValue(escrita)
    vi.mocked(entregarArquivo).mockResolvedValueOnce('precisa-tocar').mockResolvedValueOnce('compartilhado')
    const m = montagemSegura()
    abrir()
    const botao = baixarCompleta()
    await userEvent.click(botao)
    await waitFor(() => expect(m.dep).not.toBeNull())
    expect(m.dep!.escrita).toBe(escrita)
    m.avancar(0, 40)
    m.avancar(12, 40)
    expect(botao).toHaveAccessibleName('Juntando…')
    expect(botao).toHaveAttribute('aria-disabled', 'true')
    expect(botao).toHaveAttribute('aria-busy', 'true')
    expect(mensagem()).toHaveTextContent(/^Juntando as fotos: 12 de 40…$/)
    const barra = mensagem().querySelector('.exp-barra > span') as HTMLElement
    expect(barra.style.width).toBe('30%')
    // Outro toque enquanto junta não monta outro .zip.
    await userEvent.click(botao)
    expect(montarCopiaCompleta).toHaveBeenCalledTimes(1)

    m.avancar(40, 40)
    m.terminar(['IMG_2041.HEIC', 'IMG_2050.HEIC'])
    const salvar = await within(mensagem()).findByRole('button', { name: 'Salvar o arquivo' })
    expect(mensagem()).toHaveTextContent(`O arquivo ${NOME} está pronto, mas 2 fotos ficaram de fora (IMG_2041.HEIC, IMG_2050.HEIC): tente de novo mais tarde. Toque em «Salvar o arquivo» para guardá-lo.`)
    expect(mensagem().querySelector('.exp-barra')).toBeNull()
    expect(botao).toHaveAccessibleName('Baixar cópia completa')
    expect(botao).not.toHaveAttribute('aria-disabled')
    const [entregue1] = vi.mocked(entregarArquivo).mock.calls[0]!
    expect(entregue1.name).toBe(NOME)
    await userEvent.click(salvar)
    expect(vi.mocked(entregarArquivo).mock.calls[1]![0]).toBe(entregue1)
    expect(await screen.findByText(`Pronto: ${NOME} foi enviado pela folha de compartilhar. 2 fotos ficaram de fora (IMG_2041.HEIC, IMG_2050.HEIC): tente de novo mais tarde.`)).toBeInTheDocument()
    expect(botao).toHaveFocus()
  })

  it('baixado sem faltas: «Pronto: … foi baixado.»; com faltas, a frase das faltas depois', async () => {
    const m = montagemSegura()
    abrir()
    await userEvent.click(baixarCompleta())
    await waitFor(() => expect(m.dep).not.toBeNull())
    m.terminar([])
    expect(await screen.findByText(`Pronto: ${NOME} foi baixado.`)).toBeInTheDocument()
    const m2 = montagemSegura()
    await userEvent.click(baixarCompleta())
    await waitFor(() => expect(m2.dep).not.toBeNull())
    m2.terminar(['IMG_2041.HEIC'])
    expect(await screen.findByText(`Pronto: ${NOME} foi baixado. 1 foto ficou de fora (IMG_2041.HEIC): tente de novo mais tarde.`)).toBeInTheDocument()
  })

  it('a folha que falha (decisão 54, adendo): as faltas antes de «Toque em…», com «Salvar o arquivo» e o link; recusada de novo: a frase do link', async () => {
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:copia/1'), configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    vi.mocked(entregarArquivo).mockResolvedValueOnce('folha-falhou').mockResolvedValueOnce('precisa-tocar')
    const m = montagemSegura()
    abrir()
    await userEvent.click(baixarCompleta())
    await waitFor(() => expect(m.dep).not.toBeNull())
    m.terminar(['IMG_2041.HEIC'])
    const link = await within(mensagem()).findByRole('link', { name: 'Baixar o arquivo' })
    expect(link).toHaveAttribute('download', NOME)
    expect(mensagem()).toHaveTextContent(
      `O arquivo ${NOME} está pronto, mas a folha de compartilhar não abriu. 1 foto ficou de fora (IMG_2041.HEIC): tente de novo mais tarde. Toque em «Salvar o arquivo» para tentar de novo ou use o link abaixo para baixar o arquivo.`,
    )
    expect(mensagem()).not.toHaveClass('exp-mensagem-erro')
    await userEvent.click(within(mensagem()).getByRole('button', { name: 'Salvar o arquivo' }))
    await waitFor(() =>
      expect(mensagem()).toHaveTextContent(
        `O arquivo ${NOME} está pronto, mas 1 foto ficou de fora (IMG_2041.HEIC): tente de novo mais tarde. Toque em «Salvar o arquivo» para guardá-lo. Se a folha de compartilhar não abrir, use o link abaixo para baixar o arquivo.`,
      ),
    )
    expect(await within(mensagem()).findByRole('link', { name: 'Baixar o arquivo' })).toBeInTheDocument()
  })

  it('sem internet: nem pede o Dropbox; a mensagem diz, antes de começar, que só entram as fotos deste aparelho', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      const m = montagemSegura()
      abrir()
      await userEvent.click(baixarCompleta())
      await waitFor(() => expect(m.dep).not.toBeNull())
      expect(m.dep!.escrita).toBeNull()
      expect(escritaDropbox).not.toHaveBeenCalled()
      expect(mensagem()).toHaveTextContent(/^Sem acesso ao Dropbox agora: só entram as fotos que estão neste aparelho\.$/)
      m.avancar(0, 3)
      expect(mensagem()).toHaveTextContent(/^Sem acesso ao Dropbox agora: só entram as fotos que estão neste aparelho\. Juntando as fotos: 0 de 3…$/)
      m.terminar([])
      await screen.findByText(`Pronto: ${NOME} foi baixado.`)
    } finally {
      online.mockRestore()
    }
  })

  it('sem login (escritaDropbox dá null): o mesmo aviso; um erro ao montar: a mensagem de erro de sempre', async () => {
    const m = montagemSegura()
    abrir()
    await userEvent.click(baixarCompleta())
    await waitFor(() => expect(m.dep).not.toBeNull())
    expect(m.dep!.escrita).toBeNull()
    expect(mensagem()).toHaveTextContent('Sem acesso ao Dropbox agora: só entram as fotos que estão neste aparelho.')
    m.terminar([])
    await screen.findByText(`Pronto: ${NOME} foi baixado.`)

    vi.mocked(montarCopiaCompleta).mockRejectedValueOnce(new DOMException('cheio', 'QuotaExceededError'))
    await userEvent.click(baixarCompleta())
    expect(await screen.findByText('Não há espaço livre no aparelho para gerar o arquivo. Libere espaço e tente de novo.')).toBeInTheDocument()
    expect(mensagem()).toHaveClass('exp-mensagem-erro')
    expect(baixarCompleta()).toHaveAccessibleName('Baixar cópia completa')
  })

  describe('revisão 1: sair da tela durante «Juntando…» não perde a cópia (uma montagem por vez, no app inteiro)', () => {
    it('saiu e voltou durante a montagem: a tela mostra «Juntando…» e o progresso; um toque não começa outra; no fim, a entrega de sempre', async () => {
      vi.mocked(escritaDropbox).mockResolvedValue({ baixar: vi.fn() } as unknown as NonNullable<Awaited<ReturnType<typeof escritaDropbox>>>)
      const m = montagemSegura()
      const primeira = abrir()
      await userEvent.click(baixarCompleta())
      await waitFor(() => expect(m.dep).not.toBeNull())
      m.avancar(12, 40)
      primeira.unmount()
      m.avancar(13, 40)

      abrir()
      const botao = baixarCompleta()
      expect(botao).toHaveAccessibleName('Juntando…')
      expect(botao).toHaveAttribute('aria-disabled', 'true')
      expect(mensagem()).toHaveTextContent(/^Juntando as fotos: 13 de 40…$/)
      await userEvent.click(botao)
      // Nem os outros botões entram enquanto junta (como antes, na mesma tela).
      await userEvent.click(screen.getByRole('button', { name: 'Exportar regiões' }))
      expect(montarCopiaCompleta).toHaveBeenCalledTimes(1)
      expect(entregarArquivo).not.toHaveBeenCalled()
      m.avancar(14, 40)
      expect(mensagem()).toHaveTextContent(/^Juntando as fotos: 14 de 40…$/)

      m.terminar([])
      expect(await screen.findByText(`Pronto: ${NOME} foi baixado.`)).toBeInTheDocument()
      expect(entregarArquivo).toHaveBeenCalledTimes(1)
      expect(baixarCompleta()).toHaveAccessibleName('Baixar cópia completa')
    })

    it('terminou longe da tela: nada é entregue sem um toque; ao voltar, a mensagem de pronto com as faltas e «Salvar o arquivo», que entrega o .zip', async () => {
      const m = montagemSegura()
      const primeira = abrir()
      await userEvent.click(baixarCompleta())
      await waitFor(() => expect(m.dep).not.toBeNull())
      primeira.unmount()
      m.terminar(['IMG_2041.HEIC'])
      await waitFor(() => expect(progressoDaCopiaCompleta()).toBeNull())
      expect(entregarArquivo).not.toHaveBeenCalled()

      const segunda = abrir()
      const salvar = await within(mensagem()).findByRole('button', { name: 'Salvar o arquivo' })
      expect(mensagem()).toHaveTextContent(`O arquivo ${NOME} está pronto, mas 1 foto ficou de fora (IMG_2041.HEIC): tente de novo mais tarde. Toque em «Salvar o arquivo» para guardá-lo.`)
      expect(baixarCompleta()).toHaveAccessibleName('Baixar cópia completa')
      expect(entregarArquivo).not.toHaveBeenCalled()
      await userEvent.click(salvar)
      await waitFor(() => expect(entregarArquivo).toHaveBeenCalledTimes(1))
      expect(vi.mocked(entregarArquivo).mock.calls[0]![0].name).toBe(NOME)
      expect(await screen.findByText(`Pronto: ${NOME} foi baixado. 1 foto ficou de fora (IMG_2041.HEIC): tente de novo mais tarde.`)).toBeInTheDocument()

      // O resultado é entregue uma vez só: outra visita não o mostra de novo.
      segunda.unmount()
      abrir()
      expect(mensagem()).toBeEmptyDOMElement()
    })

    // m-2 (revisão final): escolher uma cópia para restaurar não descarta a cópia completa pronta nem esconde o progresso
    const escolherParaRestaurar = async (arquivo: File) => {
      const restaurar = screen.getByRole('region', { name: 'Restaurar a partir de uma cópia' })
      await userEvent.click(within(restaurar).getByRole('button', { name: 'Escolher a cópia' }))
      fireEvent.change(restaurar.querySelector<HTMLInputElement>('input[type="file"]')!, { target: { files: [arquivo] } })
    }
    const NAO_E_COPIA = 'Este arquivo não é uma cópia do IconoDB.'

    it('m-2: a cópia completa esperando «Salvar o arquivo» continua lá depois de escolher uma cópia para restaurar', async () => {
      const m = montagemSegura()
      const primeira = abrir()
      await userEvent.click(baixarCompleta())
      await waitFor(() => expect(m.dep).not.toBeNull())
      primeira.unmount()
      m.terminar(['IMG_2041.HEIC'])
      await waitFor(() => expect(progressoDaCopiaCompleta()).toBeNull())
      abrir()
      await within(mensagem()).findByRole('button', { name: 'Salvar o arquivo' })

      await escolherParaRestaurar(new File(['não é json'], 'outra-coisa.txt'))
      await within(mensagem()).findByText(NAO_E_COPIA)
      // a mensagem de pronto e o botão continuam, junto da mensagem da restauração
      expect(mensagem()).toHaveTextContent(`O arquivo ${NOME} está pronto, mas 1 foto ficou de fora (IMG_2041.HEIC): tente de novo mais tarde. Toque em «Salvar o arquivo» para guardá-lo.`)
      await userEvent.click(within(mensagem()).getByRole('button', { name: 'Salvar o arquivo' }))
      await waitFor(() => expect(entregarArquivo).toHaveBeenCalledTimes(1))
      expect(vi.mocked(entregarArquivo).mock.calls[0]![0].name).toBe(NOME)
    })

    it('NB-2: a cópia completa fica pronta enquanto a restauração ainda lê o arquivo: o fim da restauração não a descarta', async () => {
      vi.mocked(entregarArquivo).mockResolvedValueOnce('precisa-tocar')
      const m = montagemSegura()
      abrir()
      await userEvent.click(baixarCompleta())
      await waitFor(() => expect(m.dep).not.toBeNull())
      // um arquivo cuja leitura o teste segura
      let soltar!: () => void
      const lido = new Promise<void>((ok) => (soltar = ok))
      const real = new File(['não é json'], 'outra-coisa.txt')
      const lento = {
        name: real.name,
        size: real.size,
        type: '',
        slice: (de?: number, ate?: number) => {
          const fatia = real.slice(de, ate)
          return { arrayBuffer: async () => (await lido, fatia.arrayBuffer()), text: () => fatia.text(), size: fatia.size }
        },
        text: () => real.text(),
        arrayBuffer: () => real.arrayBuffer(),
      } as unknown as File
      await escolherParaRestaurar(lento)
      // a cópia termina e a folha pede um toque novo: pronta, com «Salvar o arquivo»
      m.terminar([])
      await within(mensagem()).findByRole('button', { name: 'Salvar o arquivo' })
      // só agora a restauração termina (com um erro)
      await act(async () => soltar())
      await within(mensagem()).findByText(NAO_E_COPIA)
      expect(mensagem()).toHaveTextContent(`O arquivo ${NOME} está pronto. Toque em «Salvar o arquivo» para guardá-lo.`)
      expect(within(mensagem()).getByRole('button', { name: 'Salvar o arquivo' })).toBeInTheDocument()
    })

    it('m-2: durante «Juntando…», a mensagem da restauração não esconde o progresso', async () => {
      const m = montagemSegura()
      abrir()
      await userEvent.click(baixarCompleta())
      await waitFor(() => expect(m.dep).not.toBeNull())
      m.avancar(12, 40)
      await escolherParaRestaurar(new File(['não é json'], 'outra-coisa.txt'))
      await within(mensagem()).findByText(NAO_E_COPIA)
      expect(within(mensagem()).getByText(/Juntando as fotos: 12 de 40…$/)).toBeInTheDocument()
      expect(mensagem().querySelector('.exp-barra')).not.toBeNull()
      m.avancar(13, 40)
      expect(within(mensagem()).getByText(/Juntando as fotos: 13 de 40…$/)).toBeInTheDocument()
      // no fim, a entrega de sempre
      m.terminar([])
      expect(await screen.findByText(`Pronto: ${NOME} foi baixado.`)).toBeInTheDocument()
    })

    it('um erro longe da tela aparece ao voltar, com a mensagem de erro de sempre', async () => {
      let falhar!: (e: unknown) => void
      vi.mocked(montarCopiaCompleta).mockImplementationOnce(() => new Promise((_ok, erro) => (falhar = erro)))
      const primeira = abrir()
      await userEvent.click(baixarCompleta())
      await waitFor(() => expect(montarCopiaCompleta).toHaveBeenCalledTimes(1))
      primeira.unmount()
      falhar(new DOMException('cheio', 'QuotaExceededError'))
      await waitFor(() => expect(progressoDaCopiaCompleta()).toBeNull())
      abrir()
      expect(await screen.findByText('Não há espaço livre no aparelho para gerar o arquivo. Libere espaço e tente de novo.')).toBeInTheDocument()
      expect(mensagem()).toHaveClass('exp-mensagem-erro')
    })
  })

  it('de ponta a ponta (sem simular a montagem): o .zip entregue tem copia.json, a foto local e o LEIA-ME', async () => {
    usarArmazemDasImagens(armazemMemoria())
    usarCacheDasImagens(cacheMemoria())
    const id = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), { tipo: 'tons', legenda: '', credito: 'x', principal: false })
    abrir()
    await within(completa()).findByText('1 foto, cerca de 1 MB')
    await userEvent.click(baixarCompleta())
    await waitFor(() => expect(entregarArquivo).toHaveBeenCalledTimes(1))
    const [arquivo] = vi.mocked(entregarArquivo).mock.calls[0]!
    expect(arquivo.name).toMatch(/^iconodb-copia-completa-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/)
    expect(arquivo.type).toBe('application/zip')
    const { lerZip } = await import('../copias/zip')
    expect([...(await lerZip(arquivo)).keys()].sort()).toEqual(['LEIA-ME.txt', 'copia.json', `imagens/${id}/miniatura.webp`, `imagens/${id}/original.jpg`, `imagens/${id}/tela.webp`])
    expect(await screen.findByText(`Pronto: ${arquivo.name} foi baixado.`)).toBeInTheDocument()
  })
})
