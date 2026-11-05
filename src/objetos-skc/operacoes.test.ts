import { todosEventos } from '../usuario/armazem'
import { estadoAtual } from '../usuario/estado'
import { formatarNumero } from './numeracao'
import { definirFonteDosNumerosDoPacote, recarregarNumerosDoPacote } from './pacote'
import { numeracaoDe } from './atual'
import { fichaVazia, lerObjeto } from './modelo'
import { completarObjeto, escolherPeriodo, excluirObjeto, desfazerLigacao, ligarObjetos, restaurarObjeto, salvarObjeto } from './operacoes'
import { gruposDe } from './atual'

const sincronizarAgora = vi.fn(async (_m?: string) => null)
vi.mock('../usuario/useSincronizacao', () => ({ sincronizarAgora: (m?: string) => sincronizarAgora(m) }))
const adicionarImagem = vi.fn(async (_alvo: { objeto: string }, _a: unknown, _d: unknown) => 'IM-x-1')
vi.mock('../imagens-usuario/operacoes', () => ({ adicionarImagem: (a: { objeto: string }, b: unknown, c: unknown) => adicionarImagem(a, b, c) }))

beforeEach(async () => {
  sincronizarAgora.mockClear()
  adicionarImagem.mockClear()
  definirFonteDosNumerosDoPacote(async () => Array.from({ length: 45 }, (_, i) => formatarNumero('CA', i + 1)))
  await recarregarNumerosDoPacote()
})

const ficha = (mudar: Partial<ReturnType<typeof fichaVazia>> = {}) => ({ ...fichaVazia(), titulo: 'Peça de teste. Cobre.', ...mudar })

describe('salvarObjeto', () => {
  it('com rede: sincroniza ANTES de dar o número, grava o criar com o período e o pedido, e sincroniza depois', async () => {
    const ordem: string[] = []
    sincronizarAgora.mockImplementation(async () => {
      ordem.push(`sync:${(await todosEventos()).filter((e) => e.tipo === 'objeto').length}`)
      return null
    })
    const r = await salvarObjeto(ficha({ periodo: 'CA', material: ' Cobre ' }), { online: true })
    await vi.waitFor(() => expect(ordem).toEqual(['sync:0', 'sync:1']))
    expect(r.pedido).toBe('CA00046')
    const o = estadoAtual().registro('objeto', r.id)!
    expect(o.campos).toMatchObject({ periodo: 'CA', pedido: 'CA00046', titulo: 'Peça de teste. Cobre.', material: 'Cobre', origemTipo: 'publicacao' })
    expect(numeracaoDe(estadoAtual()).porId.get(r.id)).toMatchObject({ numero: 'CA00046', situacao: 'provisorio' })
  })

  it('sem rede: não espera a sincronização; o número fica provisório', async () => {
    const r = await salvarObjeto(ficha({ periodo: 'CA' }), { online: false })
    expect(sincronizarAgora).not.toHaveBeenCalled()
    expect(numeracaoDe(estadoAtual()).porId.get(r.id)?.situacao).toBe('provisorio')
  })

  it('a sincronização de antes que demora não segura o salvar (passa do prazo e segue)', async () => {
    sincronizarAgora.mockImplementationOnce(() => new Promise(() => undefined))
    const r = await salvarObjeto(ficha({ periodo: 'CA' }), { online: true, prazoMs: 20 })
    expect(estadoAtual().registro('objeto', r.id)).toBeDefined()
  })

  it('"Ainda não sei": rascunho sem número e sem pedido; escolherPeriodo dá o número pelas mesmas regras', async () => {
    const r = await salvarObjeto(ficha({ periodo: null }), { online: false })
    expect(r.pedido).toBeNull()
    expect(numeracaoDe(estadoAtual()).porId.get(r.id)?.situacao).toBe('rascunho')
    expect(numeracaoDe(estadoAtual()).rascunhos).toContain(r.id)
    const pedido = await escolherPeriodo(r.id, 'CA', { online: true })
    expect(sincronizarAgora).toHaveBeenCalled()
    expect(estadoAtual().registro('objeto', r.id)!.campos).toMatchObject({ periodo: 'CA', pedido })
    expect(numeracaoDe(estadoAtual()).porId.get(r.id)?.numero).toBe(pedido)
  })

  it('as imagens vão depois do criar, com o id do objeto como alvo; uma que falha não desfaz o objeto', async () => {
    adicionarImagem.mockRejectedValueOnce(new Error('sem espaço'))
    const r = await salvarObjeto(ficha({ periodo: 'CA' }), {
      online: false,
      imagens: [
        { arquivo: new Blob(['a']), dados: { tipo: 'tons', legenda: '', credito: 'foto própria', principal: true } },
        { arquivo: new Blob(['b']), dados: { tipo: 'traco', legenda: '', credito: 'foto própria', principal: false } },
      ],
    })
    expect(adicionarImagem).toHaveBeenCalledTimes(2)
    expect(adicionarImagem.mock.calls[0]![0]).toEqual({ objeto: r.id })
    expect(r.imagensComErro).toBe(1)
    expect(estadoAtual().registro('objeto', r.id)).toBeDefined()
  })

  it('revisão 1: aoCriar recebe o id logo depois do criar e antes de qualquer imagem; aoGuardarImagem a cada uma; completarObjeto nunca cria', async () => {
    const ordem: string[] = []
    adicionarImagem.mockImplementation(async (alvo) => {
      ordem.push(`imagem:${alvo.objeto}`)
      return 'IM-x-1'
    })
    const img = { arquivo: new Blob(['a']), dados: { tipo: 'tons' as const, legenda: '', credito: 'foto própria', principal: true } }
    const r = await salvarObjeto(ficha({ periodo: 'CA' }), {
      online: false,
      imagens: [img, img],
      aoCriar: (id) => ordem.push(`criado:${id}:${estadoAtual().registro('objeto', id) ? 'existe' : 'falta'}`),
      aoGuardarImagem: (i) => ordem.push(`guardada:${i}`),
    })
    expect(ordem).toEqual([`criado:${r.id}:existe`, `imagem:${r.id}`, 'guardada:0', `imagem:${r.id}`, 'guardada:1'])
    const quantos = (await todosEventos()).filter((e) => e.tipo === 'objeto' && e.op === 'criar').length
    await completarObjeto(r.id, { online: false, imagens: [img] })
    expect((await todosEventos()).filter((e) => e.tipo === 'objeto' && e.op === 'criar').length).toBe(quantos)
    expect(adicionarImagem).toHaveBeenLastCalledWith({ objeto: r.id }, img.arquivo, img.dados)
  })

  it('excluir e restaurar são marcas reversíveis', async () => {
    const r = await salvarObjeto(ficha({ periodo: 'CA' }), { online: false })
    await excluirObjeto(r.id)
    expect(lerObjeto(estadoAtual().registro('objeto', r.id)!).excluido).toBe(true)
    await restaurarObjeto(r.id)
    expect(lerObjeto(estadoAtual().registro('objeto', r.id)!).excluido).toBe(false)
  })
})

describe('ligarObjetos', () => {
  it('liga pelo número (o de um objeto SKC vira o id), o mais antigo é o principal; desfazer separa; ligar de novo junta', async () => {
    const r = await salvarObjeto(ficha({ periodo: 'CA' }), { online: false })
    const numero = numeracaoDe(estadoAtual()).porId.get(r.id)!.numero!
    const principal = await ligarObjetos(numero, 'CA00012')
    expect(principal).toBe('CA00012')
    const reg = `CA00012|${r.id}`
    expect(estadoAtual().registro('ligacao', reg)!.campos).toMatchObject({ a: 'CA00012', b: r.id, ativa: true })
    expect(gruposDe(estadoAtual()).principal(r.id)).toBe('CA00012')
    await desfazerLigacao(r.id, 'CA00012')
    expect(gruposDe(estadoAtual()).principal(r.id)).toBe(r.id)
    await ligarObjetos('CA00012', r.id)
    expect(gruposDe(estadoAtual()).principal(r.id)).toBe('CA00012')
    const eventos = (await todosEventos()).filter((e) => e.reg === reg)
    expect(eventos.map((e) => e.op)).toEqual(['criar', 'alterar', 'alterar'])
  })

  it('recusa o mesmo objeto, um número que não existe e algo que não é número', async () => {
    const r = await salvarObjeto(ficha({ periodo: 'CA' }), { online: false })
    await expect(ligarObjetos(r.id, r.id)).rejects.toThrow(/mesmo objeto/)
    await expect(ligarObjetos(r.id, 'CA09999')).rejects.toThrow(/CA09999/)
    await expect(ligarObjetos(r.id, 'abc')).rejects.toThrow(/número/)
  })
})
