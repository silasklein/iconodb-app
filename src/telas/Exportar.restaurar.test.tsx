/**
 * «Cópias e exportação» → «Restaurar a partir de uma cópia» (2C, bloco 1, Tarefa 7; especificação §6.2; desenho
 * 2C-bloco1-desenhos.html §4, terceiro quadro): escolher a cópia, o resumo (nada mudou ainda), «Cancelar»/«Restaurar», os
 * erros e a mensagem final. Dados sintéticos (TESTE).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ev } from '../../tests/suporte/eventosDeTeste'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { esquecerCopiaCompleta } from '../copias/montagemDaCopiaCompleta'
import { montarZip } from '../copias/zip'
import { escritaDropbox, type Escrita } from '../dropbox/escrita'
import { idsLocais, usarArmazemDasImagens, usarCacheDasImagens } from '../imagens-usuario/local'
import { armazemMemoria } from '../pacote/armazem'
import { cacheMemoria } from '../pacote/imagens'
import { entregarArquivo } from '../ui/entregarArquivo'
import { todosEventos } from '../usuario/armazem'
import { carregarEstado, estadoAtual, receberEventos } from '../usuario/estado'
import type { Evento } from '../usuario/eventos'
import { FORMATO_DA_COPIA, type CopiaDeSeguranca } from '../usuario/exportar'
import { consolidar, fundir } from '../usuario/fusao'
import { esquecerPendentes } from '../usuario/pendentes'
import { sincronizarAgora } from '../usuario/useSincronizacao'
import { Exportar } from './Exportar'

vi.mock('../ui/entregarArquivo', async (original) => ({ ...(await original<typeof import('../ui/entregarArquivo')>()), entregarArquivo: vi.fn() }))
vi.mock('../dropbox/escrita', async (original) => ({ ...(await original<typeof import('../dropbox/escrita')>()), escritaDropbox: vi.fn(async () => null) }))
vi.mock('../usuario/useSincronizacao', async (original) => ({ ...(await original<typeof import('../usuario/useSincronizacao')>()), sincronizarAgora: vi.fn(async () => null) }))

function apagarBanco() {
  return new Promise<void>((ok) => {
    const r = indexedDB.deleteDatabase('iconodb-usuario')
    r.onsuccess = r.onerror = r.onblocked = () => ok()
  })
}

const Z = 'zzzzzzzz'
const QUANDO = new Date(2026, 10, 5, 15, 20, 41)
const nota = (seq: number, campos: Evento['campos'], op: Evento['op'] = 'criar', reg = `NT-${Z}-${seq}`) => ev({ ap: Z, seq, tipo: 'nota', reg, op, campos })
const imagem = (seq: number) =>
  ev({ ap: Z, seq, tipo: 'imagem', reg: `IM-${Z}-${seq}`, op: 'criar', campos: { alvoTipo: 'objeto', alvo: `OB-${Z}-1`, tipo: 'tons', formato: 'webp', extensao: 'jpg', nome: `IMG_${seq}.JPG` } })

/** Duas notas que já estão aqui (as mesmas da cópia, antes de ela mudá-las). */
const jaAqui = [nota(1, { texto: 'nota TESTE 1', alvo: 'CA00001' }), nota(2, { texto: 'nota TESTE 2', alvo: 'CA00001' })]

/** A cópia do resumo do desenho: 12 notas, 1 coleção, 1 objeto SKC e 3 fotos a trazer, e 2 notas mais novas nela. */
function eventosDaCopia(): Evento[] {
  const eventos = [...jaAqui]
  for (let i = 3; i <= 14; i++) eventos.push(nota(i, { texto: `nota TESTE ${i}`, alvo: 'CA00001' }))
  eventos.push(nota(20, { texto: 'nota TESTE 1, revista na cópia' }, 'alterar', `NT-${Z}-1`))
  eventos.push(nota(21, { texto: 'nota TESTE 2, revista na cópia' }, 'alterar', `NT-${Z}-2`))
  eventos.push(ev({ ap: Z, seq: 22, tipo: 'colecao', reg: `CO-${Z}-1`, op: 'criar', campos: { nome: 'Coleção TESTE', membros: [] } }))
  eventos.push(ev({ ap: Z, seq: 23, tipo: 'objeto', reg: `OB-${Z}-1`, op: 'criar', campos: { periodo: 'CA', titulo: 'Objeto TESTE' } }))
  eventos.push(imagem(24), imagem(25), imagem(26))
  return eventos
}

function copia(eventos: Evento[] = eventosDaCopia(), extra: Record<string, unknown> = {}): Record<string, unknown> {
  const c: CopiaDeSeguranca = {
    formato: FORMATO_DA_COPIA,
    versao: 1,
    geradoEm: QUANDO.toISOString(),
    aparelho: { id: Z, nome: 'Mac' },
    aparelhos: { [Z]: 'Mac' },
    eventos,
    naoEnviados: [],
    base: null,
    estado: consolidar(fundir(eventos)),
    marcas: {},
    numerosConfirmados: {},
    imagens: [],
    observacoes: [],
  }
  return { ...c, ...extra }
}

const arquivoJson = (x: unknown = copia()) => new File([JSON.stringify(x)], 'iconodb-copia-2026-11-05-1520.json', { type: 'application/json' })

async function arquivoZip(x: unknown = copia(), comFotos = true): Promise<File> {
  async function* entradas() {
    yield { nome: 'LEIA-ME.txt', dados: new TextEncoder().encode('TESTE') }
    yield { nome: 'copia.json', dados: new TextEncoder().encode(JSON.stringify(x)) }
    if (comFotos) for (const n of [24, 25, 26]) for (const a of ['tela.webp', 'miniatura.webp', 'original.jpg']) yield { nome: `imagens/IM-${Z}-${n}/${a}`, dados: new Uint8Array([n]) }
  }
  return new File([await montarZip(entradas())], 'iconodb-copia-completa-2026-11-05-1520.zip', { type: 'application/zip' })
}

/** Um Dropbox que responde à listagem (vazio, ou com os arquivos dados). */
function dropbox(arquivos: string[] = []) {
  const listar = vi.fn(async (prefixo: string) => arquivos.filter((c) => c.startsWith(`${prefixo}/`)).map((caminho) => ({ caminho, rev: 'r', tamanho: 1 })))
  vi.mocked(escritaDropbox).mockResolvedValue({ listar, enviar: vi.fn(), baixar: vi.fn() } as unknown as Escrita)
  return listar
}

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/copias']}>
      <Exportar />
    </MemoryRouter>,
  )
}

const secao = () => screen.getByRole('region', { name: 'Restaurar a partir de uma cópia' })
const escolher = () => within(secao()).getByRole('button', { name: 'Escolher a cópia' })
const entrada = () => secao().querySelector<HTMLInputElement>('input[type="file"]')!
const mensagem = () => screen.getByRole('status', { name: 'Mensagem da exportação' })
const resumo = () => within(secao()).getByRole('group', { name: 'Resumo da restauração' })

async function escolherArquivo(arquivo: File) {
  await userEvent.click(escolher())
  fireEvent.change(entrada(), { target: { files: [arquivo] } })
}

const RESUMO =
  'Cópia de 5/11/2026, 15h20, feita no Mac. Vai trazer de volta 12 notas, 1 coleção, 1 objeto SKC e 3 fotos que faltam aqui. Também vai atualizar 2 itens que estão mais novos na cópia. O que você mudou depois dessa data continua valendo.'

beforeAll(async () => usarMotor(await bancoDeTeste()))
afterAll(() => usarMotor(null))

beforeEach(async () => {
  await apagarBanco()
  await carregarEstado()
  esquecerPendentes()
  usarArmazemDasImagens(armazemMemoria())
  usarCacheDasImagens(cacheMemoria())
  vi.mocked(entregarArquivo).mockReset()
  vi.mocked(escritaDropbox).mockReset()
  vi.mocked(escritaDropbox).mockResolvedValue(null)
  vi.mocked(sincronizarAgora).mockClear()
  await receberEventos(jaAqui)
})
afterEach(() => {
  usarArmazemDasImagens(undefined)
  usarCacheDasImagens(undefined)
  // a montagem da cópia completa vive no módulo: nada dela passa de um teste para o outro
  esquecerCopiaCompleta()
})

describe('Restaurar a partir de uma cópia', () => {
  it('a última seção, com o texto da especificação e «Escolher a cópia» (aceita .json e .zip)', () => {
    abrir()
    const secoes = screen.getAllByRole('region')
    expect(secoes.at(-1)).toBe(secao())
    expect(within(secao()).getByRole('heading', { level: 2, name: 'Restaurar a partir de uma cópia' })).toBeInTheDocument()
    expect(within(secao()).getByText('Traz de volta o que está numa cópia e falta aqui. Nada é apagado: o que você mudou depois da data da cópia continua valendo.')).toBeInTheDocument()
    expect(escolher()).toBeInTheDocument()
    expect(entrada()).toHaveAttribute('accept', '.json,.zip,application/json,application/zip')
    expect(entrada().closest('[hidden]')).not.toBeNull()
  })

  it('a cópia completa: o resumo exato (nada mudou ainda), com o foco em «Cancelar»; «Cancelar» volta, com o foco em «Escolher a cópia»', async () => {
    dropbox()
    abrir()
    const antes = await todosEventos()
    await escolherArquivo(await arquivoZip())
    expect(await within(secao()).findByText(RESUMO)).toBeInTheDocument()
    expect(within(resumo()).getByRole('button', { name: 'Restaurar' })).toBeInTheDocument()
    const cancelar = within(resumo()).getByRole('button', { name: 'Cancelar' })
    await waitFor(() => expect(cancelar).toHaveFocus())
    expect(await todosEventos()).toEqual(antes)
    expect(await idsLocais()).toEqual([])

    await userEvent.click(cancelar)
    expect(within(secao()).queryByRole('group')).toBeNull()
    await waitFor(() => expect(escolher()).toHaveFocus())
    expect(await todosEventos()).toEqual(antes)
  })

  it('«Restaurar»: «Restaurado: 12 notas, 1 coleção, 1 objeto SKC e 3 fotos. Sobe na próxima sincronização.»; o foco volta a «Escolher a cópia»; de novo, nada a trazer', async () => {
    dropbox()
    abrir()
    await escolherArquivo(await arquivoZip())
    await within(secao()).findByText(RESUMO)
    await userEvent.click(within(resumo()).getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(mensagem()).toHaveTextContent('Restaurado: 12 notas, 1 coleção, 1 objeto SKC e 3 fotos. Sobe na próxima sincronização.'))
    expect(mensagem()).toHaveTextContent(/^Restaurado: 12 notas, 1 coleção, 1 objeto SKC e 3 fotos\. Sobe na próxima sincronização\.$/)
    expect(mensagem()).not.toHaveClass('exp-mensagem-erro')
    await waitFor(() => expect(escolher()).toHaveFocus())
    expect(estadoAtual().registro('nota', `NT-${Z}-1`)?.campos.texto).toBe('nota TESTE 1, revista na cópia')
    expect(estadoAtual().registro('colecao', `CO-${Z}-1`)).toBeDefined()
    expect(await idsLocais()).toEqual([`IM-${Z}-24`, `IM-${Z}-25`, `IM-${Z}-26`])
    expect(sincronizarAgora).toHaveBeenCalledWith('restauracao')

    // A mesma cópia de novo: nada a trazer, só «Cancelar».
    const eventos = (await todosEventos()).length
    await escolherArquivo(await arquivoZip())
    expect(await within(secao()).findByText('Cópia de 5/11/2026, 15h20, feita no Mac. Esta cópia não tem nada que falte aqui.')).toBeInTheDocument()
    expect(within(resumo()).queryByRole('button', { name: 'Restaurar' })).toBeNull()
    await waitFor(() => expect(within(resumo()).getByRole('button', { name: 'Cancelar' })).toHaveFocus())
    expect(await todosEventos()).toHaveLength(eventos)
  })

  it('revisão 1: uma só listagem de usuario/imagens, feita em «Lendo…» e reaproveitada em «Restaurar»; o plano mudou → lista de novo', async () => {
    const listar = dropbox()
    abrir()
    await escolherArquivo(await arquivoZip())
    await within(secao()).findByText(RESUMO)
    expect(listar.mock.calls.map((c) => c[0])).toEqual(['usuario/imagens'])
    await userEvent.click(within(resumo()).getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(mensagem()).toHaveTextContent(/^Restaurado: /))
    expect(listar).toHaveBeenCalledTimes(1)
    expect(await idsLocais()).toEqual([`IM-${Z}-24`, `IM-${Z}-25`, `IM-${Z}-26`])

    // Outra cópia; entre o resumo e «Restaurar» chega um evento que muda o plano: a listagem é feita de novo.
    listar.mockClear()
    const outra = [...eventosDaCopia(), nota(30, { texto: 'nota TESTE 30' })]
    await escolherArquivo(await arquivoZip(copia(outra)))
    await within(secao()).findByText(/^Cópia de .+ Vai trazer de volta 1 nota que falta aqui\./)
    await receberEventos([nota(30, { texto: 'nota TESTE 30' })])
    await userEvent.click(within(resumo()).getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(mensagem()).toHaveTextContent(/^Esta cópia não tem nada que falte aqui\.$/))
    expect(listar.mock.calls.map((c) => c[0])).toEqual(['usuario/imagens', 'usuario/imagens'])
  })

  it('foco 4: sem internet, os registros voltam e a mensagem diz que as fotos não puderam ser conferidas', async () => {
    abrir()
    await escolherArquivo(await arquivoZip())
    // Sem o Dropbox, as fotos que voltam são as dos registros que voltam.
    expect(await within(secao()).findByText(RESUMO)).toBeInTheDocument()
    await userEvent.click(within(resumo()).getByRole('button', { name: 'Restaurar' }))
    await waitFor(() =>
      expect(mensagem()).toHaveTextContent(
        /^Restaurado: 12 notas, 1 coleção, 1 objeto SKC e 3 fotos\. Sobe na próxima sincronização\. As fotos não puderam ser conferidas no Dropbox agora; restaure de novo quando estiver conectado\.$/,
      ),
    )
    expect(estadoAtual().registro('imagem', `IM-${Z}-24`)).toBeDefined()
    expect(await idsLocais()).toEqual([])
  })

  it('a cópia de segurança (.json, sem fotos) e o Dropbox respondendo: as fotos que não estão lá', async () => {
    dropbox([`usuario/imagens/IM-${Z}-26/tela.webp`, `usuario/imagens/IM-${Z}-26/miniatura.webp`, `usuario/imagens/IM-${Z}-26/original.jpg`])
    abrir()
    await escolherArquivo(arquivoJson())
    expect(
      await within(secao()).findByText(
        'Cópia de 5/11/2026, 15h20, feita no Mac. Vai trazer de volta 12 notas, 1 coleção, 1 objeto SKC e 1 foto que faltam aqui. Também vai atualizar 2 itens que estão mais novos na cópia. O que você mudou depois dessa data continua valendo. 2 fotos desta cópia não estão no Dropbox, e ela não as traz: use a cópia completa.',
      ),
    ).toBeInTheDocument()
  })

  it('o .json sem internet: nada sobre fotos ausentes (o Dropbox não respondeu)', async () => {
    abrir()
    await escolherArquivo(arquivoJson())
    expect(await within(secao()).findByText(RESUMO)).toBeInTheDocument()
  })

  it('as variações do resumo: uma coisa só, só atualizar, e uma foto que falta numa cópia sem fotos', async () => {
    dropbox()
    abrir()
    // Só uma nota nova.
    await escolherArquivo(arquivoJson(copia([...jaAqui, nota(3, { texto: 'nota TESTE 3' })])))
    expect(await within(secao()).findByText('Cópia de 5/11/2026, 15h20, feita no Mac. Vai trazer de volta 1 nota que falta aqui. O que você mudou depois dessa data continua valendo.')).toBeInTheDocument()
    await userEvent.click(within(resumo()).getByRole('button', { name: 'Cancelar' }))
    // Só um item mais novo na cópia.
    await escolherArquivo(arquivoJson(copia([...jaAqui, nota(20, { texto: 'revista' }, 'alterar', `NT-${Z}-1`)])))
    expect(await within(secao()).findByText('Cópia de 5/11/2026, 15h20, feita no Mac. Vai atualizar 1 item que está mais novo na cópia. O que você mudou depois dessa data continua valendo.')).toBeInTheDocument()
    await userEvent.click(within(resumo()).getByRole('button', { name: 'Cancelar' }))
    // Uma foto que já existe aqui e falta no Dropbox, numa cópia sem fotos: nada a trazer, e o aviso da foto.
    await receberEventos([imagem(24)])
    await escolherArquivo(arquivoJson(copia([...jaAqui, imagem(24)])))
    expect(
      await within(secao()).findByText('Cópia de 5/11/2026, 15h20, feita no Mac. Esta cópia não tem nada que falte aqui. 1 foto desta cópia não está no Dropbox, e ela não a traz: use a cópia completa.'),
    ).toBeInTheDocument()
  })

  it('uma cópia feita neste aparelho, ou num aparelho sem nome', async () => {
    abrir()
    const { aparelhoAtual } = await import('../usuario/aparelho')
    const eu = await aparelhoAtual()
    await escolherArquivo(arquivoJson(copia(undefined, { aparelho: { id: eu.id, nome: eu.nome } })))
    expect(await within(secao()).findByText(/^Cópia de 5\/11\/2026, 15h20, feita neste aparelho\. Vai trazer/)).toBeInTheDocument()
    await userEvent.click(within(resumo()).getByRole('button', { name: 'Cancelar' }))
    await escolherArquivo(arquivoJson(copia(undefined, { aparelho: { id: Z, nome: 'Este aparelho' } })))
    expect(await within(secao()).findByText(/^Cópia de 5\/11\/2026, 15h20, feita em outro aparelho\. Vai trazer/)).toBeInTheDocument()
  })

  it('os quatro erros, com os textos exatos; nada é alterado e a seção continua pronta para escolher', async () => {
    abrir()
    const antes = await todosEventos()
    const casos: [File, string][] = [
      [new File(['{"a": 1}'], 'outro.json'), 'Este arquivo não é uma cópia do IconoDB.'],
      [arquivoJson(copia(undefined, { versao: 2 })), 'Esta cópia foi feita por uma versão mais nova do app; atualize o app.'],
      [arquivoJson(copia(undefined, { eventos: eventosDaCopia().slice(1) })), 'A cópia está danificada; nada foi alterado.'],
    ]
    for (const [arquivo, texto] of casos) {
      await escolherArquivo(arquivo)
      await waitFor(() => expect(mensagem()).toHaveTextContent(new RegExp(`^${texto.replace(/[.;]/g, '\\$&')}$`)))
      expect(mensagem()).toHaveClass('exp-mensagem-erro')
      expect(within(secao()).queryByRole('group')).toBeNull()
      expect(escolher()).toBeInTheDocument()
    }
    const recusa = () => Promise.reject(new DOMException('não deu', 'NotReadableError'))
    const ruim = { name: 'x.json', size: 100, type: 'application/json', slice: () => ({ arrayBuffer: recusa }), text: recusa } as unknown as File
    await escolherArquivo(ruim)
    await waitFor(() => expect(mensagem()).toHaveTextContent(/^Não foi possível ler o arquivo; nada foi alterado\.$/))
    expect(await todosEventos()).toEqual(antes)
  })

  it('escolher de novo o mesmo arquivo funciona (o campo de arquivo é limpo depois de cada escolha)', async () => {
    abrir()
    await escolherArquivo(arquivoJson())
    await within(secao()).findByText(RESUMO)
    expect(entrada().value).toBe('')
  })
})
