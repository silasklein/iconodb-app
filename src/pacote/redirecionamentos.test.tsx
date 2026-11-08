/**
 * Tarefa 16: os redirecionamentos do pacote (tabela `redirecionamento` do comum.sqlite, schema 6). O pacote sintético traz
 * `GL-teste123-1` → `GL-900010` (o verbete do usuário publicado com id novo, «amuleto de prova»), `GL-teste123-2` →
 * `GL-900002` (o mesmo de um verbete que já existia, «figura denteada»), `SI-teste123-1` → `TESTE-3` (o sítio do usuário
 * publicado, «Tell Usuário Teste») e `SI-teste123-2` → `TESTE-2` («Tell Probe Teste»). A camada deste teste tem esses
 * registros e, para cada caso, um do usuário SEM redirecionamento, que continua como sempre (o negativo prova o positivo).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderHook, screen, waitFor, within } from '@testing-library/react'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import { abrirBanco, executar, usarMotor } from '../banco/cliente'
import { verbetes } from '../banco/consultas'
import { buscar } from '../busca/consulta'
import { lerTabelaDeFold } from '../busca/fold'
import { sugerir } from '../busca/sugestoes'
import { useHipotesesDoVerbete, useNomeVivo, useVerbetesSkc } from '../glossario/doUsuario'
import { resolverAlvos } from '../notas/alvos'
import { chaveDoAlvo } from '../notas/links'
import { verbetesARever } from '../revisao/fila'
import { correcoesDosSitios, nomeDeAgoraDoSitio, objetosPorSitio, sitiosNaoResolvidos, useSitiosSkc, useSitiosVivos } from '../sitios/doUsuario'
import { sitiosDoPacote } from '../sitios/pacote'
import { fundir } from '../usuario/fusao'
import { ev } from '../../tests/suporte/eventosDeTeste'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { estadoAtual, registrar } from '../usuario/estado'
import { destinoDe, mesclasDoPacote, origensDe, redirecionamentosDoPacote, useRedirecionamentos } from './redirecionamentos'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

const tabela = lerTabelaDeFold(JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo/fold.json'), 'utf8')))
const hipotese = (id: string, termos: string[], rotulos: string[], justificativa = '') =>
  registrar('hipotese', id, 'criar', { objeto: 'CA00001', sobre: 'objeto', elemento: null, elementoRotulo: '', termos, termosRotulos: rotulos, nivel: 'iconographic', modalidade: 'possible', justificativa, ancora: null })

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
  await registrar('verbete', 'GL-teste123-1', 'criar', { forma: 'amuleto de prova', status: 'proposed' })
  await registrar('verbete', 'GL-teste123-2', 'criar', { forma: 'figura denteada do app', status: 'proposed' })
  await registrar('verbete', 'GL-aaaaaaaa-5', 'criar', { forma: 'termo sem redirecionamento', status: 'proposed' })
  await registrar('sitio', 'SI-teste123-1', 'criar', { nome: 'Tell Usuário Teste' })
  await registrar('sitio', 'SI-teste123-2', 'criar', { nome: 'Tell Probe do app' })
  await registrar('sitio', 'SI-aaaaaaaa-5', 'criar', { nome: 'Sítio sem redirecionamento' })
  await hipotese('HY-aaaaaaaa-7', ['GL-teste123-1', 'GL-teste123-2'], ['amuleto antigo', 'figura antiga'], 'ver [[GL-teste123-2|a figura]] e [[SI-teste123-1|o sítio]]')
  await hipotese('HY-aaaaaaaa-8', ['GL-aaaaaaaa-5'], ['termo sem redirecionamento'])
  await registrar('objeto', 'OB-aaaaaaaa-7', 'criar', { periodo: 'CA', titulo: 'Objeto do teste', sitio: 'SI-teste123-2', sitioNome: 'Tell Probe do app', origemTipo: 'achado' })
})
afterAll(() => usarMotor(null))
afterEach(() => instalarMatchMedia(375))

const endereco = () => screen.getByTestId('endereco').textContent

describe('a tabela do pacote', () => {
  it('lê os quatro redirecionamentos do pacote sintético', async () => {
    expect(Object.fromEntries(await redirecionamentosDoPacote())).toEqual({
      'GL-teste123-1': 'GL-900010',
      'GL-teste123-2': 'GL-900002',
      'SI-teste123-1': 'TESTE-3',
      'SI-teste123-2': 'TESTE-2',
    })
  })

  it('um pacote do schema 5 (sem a tabela) abre sem erro e não redireciona nada', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    try {
      await executar('DROP TABLE main.redirecionamento')
      expect((await abrirBanco()).estado).toBe('aberto')
      expect((await redirecionamentosDoPacote()).size).toBe(0)
      expect((await verbetes()).some((v) => v.id === 'GL-900010')).toBe(true)
    } finally {
      usarMotor(await bancoDeTeste())
    }
    expect((await redirecionamentosDoPacote()).size).toBe(4)
  })

  it('só aceita de um id do usuário para um id do livro', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    try {
      await executar(`INSERT INTO main.redirecionamento (de, para, tipo) VALUES ('GL-900001', 'GL-900003', 'verbete'), ('GL-bbbbbbbb-1', 'GL-cccccccc-1', 'verbete'),
        ('SI-bbbbbbbb-1', 'SI-cccccccc-1', 'sitio'), ('GL-bbbbbbbb-2', 'TESTE-1', 'verbete'), ('SI-bbbbbbbb-2', 'GL-900001', 'sitio')`)
      expect([...(await redirecionamentosDoPacote()).keys()].sort()).toEqual(['GL-teste123-1', 'GL-teste123-2', 'SI-teste123-1', 'SI-teste123-2'])
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })
})

describe('Parte 2C, bloco 2: a mescla de um sítio do livro em outro (tipo sitio, criado 0) vai para um mapa à parte', () => {
  it('TESTE-4 → TESTE-2 está em mesclasDoPacote e não nos redirecionamentos das publicações', async () => {
    expect(Object.fromEntries(await mesclasDoPacote())).toEqual({ 'TESTE-4': 'TESTE-2' })
    expect((await redirecionamentosDoPacote()).has('TESTE-4')).toBe(false)
    const { result } = renderHook(() => useRedirecionamentos())
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current!.has('TESTE-4')).toBe(false)
    expect(destinoDe(result.current, 'TESTE-4')).toBe('TESTE-4')
    expect(origensDe(result.current, 'TESTE-2')).toEqual(['SI-teste123-2'])
  })

  it('só de um sítio da lista do pacote para outro: um id sequencial, um sítio fora da lista ou o mesmo sítio são recusados', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    try {
      await executar(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('GL-12', 'TESTE-2', 'sitio', 0), ('TESTE-5', 'GL-9', 'sitio', 0),
        ('TESTE-6', 'TESTE-99', 'sitio', 0), ('TESTE-99', 'TESTE-1', 'sitio', 0), ('TESTE-7', 'TESTE-7', 'sitio', 0), ('TESTE-8', 'TESTE-1', 'verbete', 0)`)
      expect(Object.fromEntries(await mesclasDoPacote())).toEqual({ 'TESTE-4': 'TESTE-2' })
      expect([...(await redirecionamentosDoPacote()).keys()].sort()).toEqual(['GL-teste123-1', 'GL-teste123-2', 'SI-teste123-1', 'SI-teste123-2'])
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })

  it('TESTE-4 → TESTE-99 (fora da lista dos sítios) é recusado', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    try {
      await executar("UPDATE main.redirecionamento SET para = 'TESTE-99' WHERE de = 'TESTE-4'")
      expect((await mesclasDoPacote()).size).toBe(0)
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })

  it('um pacote sem a tabela (schema 5) não tem mesclas', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    try {
      await executar('DROP TABLE main.redirecionamento')
      expect((await mesclasDoPacote()).size).toBe(0)
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })
})

describe('revisão 1 (m7): só vale um destino que existe no pacote', () => {
  it('um redirecionamento para um verbete ou sítio que o pacote não tem é ignorado (o do usuário continua como sempre)', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    try {
      await executar(`INSERT INTO main.redirecionamento (de, para, tipo) VALUES ('GL-bbbbbbbb-3', 'GL-999999', 'verbete'), ('SI-bbbbbbbb-3', 'TESTE-99', 'sitio'),
        ('SI-bbbbbbbb-4', 'OUTRA-1', 'sitio'), ('GL-bbbbbbbb-4', 'GL-900001', 'verbete')`)
      const mapa = await redirecionamentosDoPacote()
      expect(mapa.has('GL-bbbbbbbb-3')).toBe(false)
      expect(mapa.has('SI-bbbbbbbb-3')).toBe(false)
      expect(mapa.has('SI-bbbbbbbb-4')).toBe(false)
      // o positivo: um destino que existe vale
      expect(mapa.get('GL-bbbbbbbb-4')).toBe('GL-900001')
      expect(mapa.get('SI-teste123-1')).toBe('TESTE-3')
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })
})

describe('revisão 1 (decisão 47): o publicado que a pessoa excluiu sai do pacote seguinte e volta a ser do usuário', () => {
  beforeAll(async () => {
    await registrar('verbete', 'GL-dddddddd-1', 'criar', { forma: 'termo publicado e excluído', status: 'proposed' })
    await registrar('sitio', 'SI-dddddddd-1', 'criar', { nome: 'Sítio publicado e excluído' })
    await registrar('verbete', 'GL-dddddddd-1', 'excluir', {})
    await registrar('sitio', 'SI-dddddddd-1', 'excluir', {})
  })

  it('enquanto o pacote o publica, o endereço antigo leva ao do livro; no pacote sem a linha, a página dele, excluído e restaurável', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    try {
      await executar(`INSERT INTO main.redirecionamento (de, para, tipo) VALUES ('GL-dddddddd-1', 'GL-900010', 'verbete'), ('SI-dddddddd-1', 'TESTE-3', 'sitio')`)
      const r = renderizarRota('/verbete/GL-dddddddd-1')
      await waitFor(() => expect(endereco()).toBe('/verbete/GL-900010'))
      r.unmount()
    } finally {
      usarMotor(await bancoDeTeste())
    }
    // o pacote seguinte (o pipeline o retirou: sem a linha)
    expect((await redirecionamentosDoPacote()).has('GL-dddddddd-1')).toBe(false)
    const v = renderizarRota('/verbete/GL-dddddddd-1')
    expect(await screen.findByRole('heading', { level: 1, name: /termo publicado e excluído/ })).toBeInTheDocument()
    expect(endereco()).toBe('/verbete/GL-dddddddd-1')
    expect(screen.getByRole('button', { name: 'Restaurar o verbete' })).toBeInTheDocument()
    v.unmount()
    renderizarRota('/sitio/SI-dddddddd-1')
    expect(await screen.findByRole('heading', { level: 1, name: /Sítio publicado e excluído/ })).toBeInTheDocument()
    expect(endereco()).toBe('/sitio/SI-dddddddd-1')
    expect(screen.getByRole('button', { name: 'Restaurar o sítio' })).toBeInTheDocument()
  })
})

describe('o verbete do usuário publicado', () => {
  it('some do Glossário (o do livro aparece no lugar); o sem redirecionamento continua', async () => {
    renderizarRota('/glossario')
    await screen.findByRole('link', { name: /termo sem redirecionamento/ })
    const hrefs = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('a.lista-linha')).map((a) => a.getAttribute('href') ?? '')
    await waitFor(() => expect(hrefs().some((h) => h.startsWith('/verbete/GL-900010'))).toBe(true))
    expect(hrefs().filter((h) => h.includes('GL-teste123'))).toEqual([])
    expect(hrefs().some((h) => h.startsWith('/verbete/GL-aaaaaaaa-5'))).toBe(true)
  })

  it('revisão 2 (N2): na lista, o verbete do livro criado do seu conta os objetos das hipóteses SKC da origem; o que já era do livro, só os do livro', async () => {
    const doPacote = new Map((await verbetes()).map((v) => [v.id, v.objetos]))
    expect(doPacote.get('GL-900010')).toBe(0)
    renderizarRota('/glossario')
    const linha = (id: string) => document.querySelector<HTMLAnchorElement>(`a.lista-linha[href^="/verbete/${id}"]`)
    await waitFor(() => expect(linha('GL-900010')).not.toBeNull())
    // HY-aaaaaaaa-7 (no CA00001) usa GL-teste123-1 (criou GL-900010) e GL-teste123-2 (leva a GL-900002, que já era do livro)
    await waitFor(() => expect(linha('GL-900010')!.querySelector('.lista-n')!.textContent).toBe('1 objeto'))
    expect(linha('GL-900002')!.querySelector('.lista-n')!.textContent).toBe(`${doPacote.get('GL-900002')} ${doPacote.get('GL-900002') === 1 ? 'objeto' : 'objetos'}`)
    // o verbete do usuário sem redirecionamento continua com a sua contagem
    expect(linha('GL-aaaaaaaa-5')!.querySelector('.lista-n')!.textContent).toBe('1 objeto')
  })

  it('o endereço antigo /verbete/GL-teste123-1 leva ao verbete do livro, com a hipótese SKC que o usa', async () => {
    renderizarRota('/verbete/GL-teste123-1')
    expect(await screen.findByRole('heading', { level: 1, name: /amuleto de prova/ })).toBeInTheDocument()
    expect(endereco()).toBe('/verbete/GL-900010')
    await waitFor(() => expect(document.querySelector('a.hipotese-linha[href="/item/CA00001?hipotese=HY-aaaaaaaa-7"]')).not.toBeNull())
    expect(document.querySelector('a.hipotese-linha[href*="HY-aaaaaaaa-8"]')).toBeNull()
  })

  it('o verbete sem redirecionamento continua com a sua página', async () => {
    renderizarRota('/verbete/GL-aaaaaaaa-5')
    expect(await screen.findByRole('heading', { level: 1, name: /termo sem redirecionamento/ })).toBeInTheDocument()
    expect(endereco()).toBe('/verbete/GL-aaaaaaaa-5')
  })

  it('as listas do usuário, as hipóteses e o nome vivo seguem o destino', async () => {
    const lista = renderHook(() => useVerbetesSkc())
    await waitFor(() => expect(lista.result.current.map((v) => v.id)).toEqual(['GL-aaaaaaaa-5']))
    const doLivro = renderHook(() => useHipotesesDoVerbete('GL-900010'))
    await waitFor(() => expect(doLivro.result.current.map((h) => h.id)).toEqual(['HY-aaaaaaaa-7']))
    expect(renderHook(() => useHipotesesDoVerbete('GL-aaaaaaaa-5')).result.current.map((h) => h.id)).toEqual(['HY-aaaaaaaa-8'])
    const nome = renderHook(() => useNomeVivo())
    // o rótulo guardado e a forma do usuário dão lugar ao nome do verbete do livro
    await waitFor(() => expect(nome.result.current('GL-teste123-2', 'figura antiga')).toBe('figura denteada'))
    expect(nome.result.current('GL-teste123-1', 'amuleto antigo')).toBe('amuleto de prova')
    expect(nome.result.current('GL-aaaaaaaa-5', 'x')).toBe('termo sem redirecionamento')
  })

  it('a Revisão não conta o verbete publicado como "a revisar" do usuário', async () => {
    const redir = await redirecionamentosDoPacote()
    expect(verbetesARever(estadoAtual(), [], redir)).toBe(1) // só o GL-aaaaaaaa-5
    expect(verbetesARever(estadoAtual(), [])).toBe(3) // sem os redirecionamentos, os três
  })
})

describe('o sítio do usuário publicado', () => {
  it('some da lista de Sítios; o publicado (TESTE-3) e o sem redirecionamento aparecem', async () => {
    renderizarRota('/sitios')
    await screen.findByRole('link', { name: /^Sítio sem redirecionamento/ })
    await screen.findByRole('link', { name: /^Tell Usuário Teste/ })
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href') ?? '').filter((h) => h.startsWith('/sitio/'))
    expect(hrefs).toContain('/sitio/TESTE-3')
    expect(hrefs).toContain('/sitio/SI-aaaaaaaa-5')
    expect(hrefs.filter((h) => h.includes('SI-teste123'))).toEqual([])
    expect(renderHook(() => useSitiosSkc()).result.current.map((s) => s.id)).toEqual(['SI-aaaaaaaa-5'])
  })

  it('o endereço antigo /sitio/SI-teste123-2 leva ao sítio do livro; o sem redirecionamento fica', async () => {
    const r = renderizarRota('/sitio/SI-teste123-2')
    expect(await screen.findByRole('heading', { level: 1, name: /Tell Probe Teste/ })).toBeInTheDocument()
    expect(endereco()).toBe('/sitio/TESTE-2')
    r.unmount()
    renderizarRota('/sitio/SI-aaaaaaaa-5')
    expect(await screen.findByRole('heading', { level: 1, name: /Sítio sem redirecionamento/ })).toBeInTheDocument()
    expect(endereco()).toBe('/sitio/SI-aaaaaaaa-5')
  })

  it('o sítio de um objeto SKC é o do livro: nome de agora e nenhuma marca', async () => {
    const vivos = renderHook(() => useSitiosVivos())
    await waitFor(() => expect(vivos.result.current.nome('SI-teste123-2', 'Tell Probe do app')).toBe('Tell Probe Teste'))
    expect(vivos.result.current.marca('SI-teste123-2')).toBeNull()
    expect(vivos.result.current.nome('SI-aaaaaaaa-5', null)).toBe('Sítio sem redirecionamento')
  })
})

describe('links, busca e sugestões vão ao destino', () => {
  it('[[GL-teste123-2|…]] e [[SI-teste123-1|…]] abrem o verbete e o sítio do livro', async () => {
    const r = await resolverAlvos([{ tipo: 'verbete', ref: 'GL-teste123-2' }, { tipo: 'sitio', ref: 'SI-teste123-1' }, { tipo: 'verbete', ref: 'GL-aaaaaaaa-5' }], estadoAtual())
    expect(r.get(chaveDoAlvo('verbete', 'GL-teste123-2'))).toMatchObject({ existe: true, rota: '/verbete/GL-900002', rotulo: 'figura denteada' })
    expect(r.get(chaveDoAlvo('sitio', 'SI-teste123-1'))).toMatchObject({ existe: true, rota: '/sitio/TESTE-3', rotulo: 'Tell Usuário Teste' })
    expect(r.get(chaveDoAlvo('verbete', 'GL-aaaaaaaa-5'))).toMatchObject({ existe: true, rota: '/verbete/GL-aaaaaaaa-5', rotulo: 'termo sem redirecionamento' })
  })

  it('a busca acha o verbete do livro, nunca o do usuário publicado; o sem redirecionamento continua na camada', async () => {
    const amuleto = await buscar('amuleto', { escopo: 'tudo', filtros: {}, tabela })
    expect(amuleto.verbeteDestaque?.id).toBe('GL-900010')
    expect(amuleto.usuario.map((a) => a.ref)).not.toContain('GL-teste123-1')
    const sitio = await buscar('usuario teste', { escopo: 'tudo', filtros: {}, tabela })
    expect(sitio.usuario.map((a) => a.ref)).not.toContain('SI-teste123-1')
    const controle = await buscar('sem redirecionamento', { escopo: 'tudo', filtros: {}, tabela })
    expect(controle.usuario.map((a) => a.ref)).toEqual(expect.arrayContaining(['GL-aaaaaaaa-5', 'SI-aaaaaaaa-5']))
  })

  it('as sugestões também', async () => {
    const s = await sugerir('amuleto', { tabela })
    expect(s.verbetes.map((x) => x.ref)).toEqual(['GL-900010'])
    const sitios = await sugerir('tell probe', { tabela })
    expect(sitios.sitios.map((x) => x.ref)).not.toContain('SI-teste123-2')
    const controle = await sugerir('sem redirecionamento', { tabela })
    expect(controle.verbetes.map((x) => x.ref)).toContain('GL-aaaaaaaa-5')
    expect(controle.sitios.map((x) => x.ref)).toContain('SI-aaaaaaaa-5')
  })
})

describe('uma tela que mostra o termo de uma hipótese SKC', () => {
  it('no painel da hipótese, os termos têm o nome do verbete do livro e levam a ele', async () => {
    renderizarRota('/item/CA00001?hipotese=HY-aaaaaaaa-7')
    const figura = await screen.findByRole('link', { name: 'figura denteada' })
    // o link leva direto ao verbete do livro (o endereço antigo também leva, pela rota)
    await waitFor(() => expect(figura.getAttribute('href')).toBe('/verbete/GL-900002'))
    expect(screen.getByRole('link', { name: 'amuleto de prova' })).toHaveAttribute('href', '/verbete/GL-900010')
    expect(screen.queryByText('figura antiga')).toBeNull()
    expect(screen.queryByText(/figura denteada do app/)).toBeNull()
  })
})

describe('revisão 1 (I1, m4): o que apontava para o id do usuário publicado aparece no do livro', () => {
  beforeAll(async () => {
    // SI-teste123-2 → TESTE-2: um objeto do livro trocado para ele, a região e as grafias que a pessoa lhe deu, e notas.
    await registrar('item-sitio', 'CA00001', 'alterar', { sitio: 'SI-teste123-2', sitioNome: 'Tell Probe do app' })
    // um objeto SKC já com número (a testemunha), para as sugestões
    await registrar('objeto', 'OB-aaaaaaaa-9', 'criar', { numero: 'CA00009', periodo: 'CA', titulo: 'Escaravelho publicado', sitio: 'SI-teste123-2', sitioNome: 'Tell Probe do app', origemTipo: 'achado' })
    await registrar('sitio', 'SI-teste123-2', 'alterar', { regiao: 'Galileia do app' })
    await registrar('sitio', 'SI-teste123-2', 'alterar', { variantes: ['Tal Probe do App'] })
    await registrar('nota', 'NT-aaaaaaaa-21', 'criar', { texto: 'nota sobre o sítio publicado', alvoTipo: 'sitio', alvo: 'SI-teste123-2' })
    await registrar('nota', 'NT-aaaaaaaa-22', 'criar', { texto: 'veja [[SI-teste123-2|o sítio de antes]]', alvoTipo: 'objeto', alvo: 'CA00004' })
    await registrar('nota', 'NT-aaaaaaaa-23', 'criar', { texto: 'nota sobre o termo publicado', alvoTipo: 'verbete', alvo: 'GL-teste123-1' })
    // os negativos: o que é do sítio e do verbete SEM redirecionamento fica neles
    await registrar('objeto', 'OB-aaaaaaaa-8', 'criar', { periodo: 'CA', titulo: 'Objeto do sítio sem redirecionamento', sitio: 'SI-aaaaaaaa-5', sitioNome: 'Sítio sem redirecionamento', origemTipo: 'achado' })
    await registrar('nota', 'NT-aaaaaaaa-24', 'criar', { texto: 'nota do sítio sem redirecionamento', alvoTipo: 'sitio', alvo: 'SI-aaaaaaaa-5' })
    await registrar('nota', 'NT-aaaaaaaa-25', 'criar', { texto: 'nota do termo sem redirecionamento', alvoTipo: 'verbete', alvo: 'GL-aaaaaaaa-5' })
  })

  it('a página do sítio do livro lista o objeto SKC e a troca item-sitio feitos sobre o SI-… de antes; o do outro sítio não', async () => {
    renderizarRota('/sitio/TESTE-2')
    expect(await screen.findByRole('heading', { level: 1, name: /Tell Probe Teste/ })).toBeInTheDocument()
    const objetos = screen.getByRole('region', { name: 'Objetos deste sítio' })
    await waitFor(() => expect(within(objetos).getAllByRole('link').map((a) => a.getAttribute('href'))).toContain('/item/CA00001'))
    await waitFor(() => expect(within(objetos).getByText(/Objeto do teste/)).toBeInTheDocument())
    expect(within(objetos).queryByText(/Objeto do sítio sem redirecionamento/)).toBeNull()
    // os do livro continuam
    expect(within(objetos).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(expect.arrayContaining(['/item/CA00003', '/item/CA00004']))
  })

  it('o sítio sem redirecionamento continua com os seus objetos', async () => {
    renderizarRota('/sitio/SI-aaaaaaaa-5')
    const objetos = await screen.findByRole('region', { name: 'Objetos deste sítio' })
    await waitFor(() => expect(within(objetos).getByText(/Objeto do sítio sem redirecionamento/)).toBeInTheDocument())
    expect(within(objetos).queryByText(/Objeto do teste/)).toBeNull()
  })

  it('as notas feitas no SI-… ou que o citam aparecem no sítio do livro; as do sítio sem redirecionamento, não', async () => {
    renderizarRota('/sitio/TESTE-2')
    const notas = await screen.findByRole('region', { name: 'Notas SKC' })
    await waitFor(() => expect(within(notas).getByText(/nota sobre o sítio publicado/)).toBeInTheDocument())
    expect(within(notas).getByText(/o sítio de antes/)).toBeInTheDocument()
    expect(within(notas).queryByText(/nota do sítio sem redirecionamento/)).toBeNull()
  })

  it('a nota feita no GL-<aparelho>-<n> aparece no verbete do livro; a do termo sem redirecionamento, não', async () => {
    renderizarRota('/verbete/GL-900010')
    const notas = await screen.findByRole('region', { name: 'Notas SKC' })
    await waitFor(() => expect(within(notas).getByText(/nota sobre o termo publicado/)).toBeInTheDocument())
    expect(within(notas).queryByText(/nota do termo sem redirecionamento/)).toBeNull()
  })

  it('a região e as outras grafias do SI-… aparecem no sítio do livro', async () => {
    renderizarRota('/sitio/TESTE-2')
    const dados = await screen.findByRole('region', { name: 'Dados do sítio' })
    await waitFor(() => expect(within(dados).getByText('Galileia do app')).toBeInTheDocument())
    expect(within(dados).getByText('Tal Probe do App')).toBeInTheDocument()
    const redir = await redirecionamentosDoPacote()
    expect(correcoesDosSitios(estadoAtual(), redir).get('TESTE-2')).toMatchObject({ regiao: 'Galileia do app', variantes: ['Tal Probe do App'] })
    // sem os redirecionamentos, o sítio do livro não tem correção nenhuma
    expect(correcoesDosSitios(estadoAtual()).get('TESTE-2')).toBeUndefined()
  })

  it('o que o registro do livro já escreveu vence o que veio do SI-…', async () => {
    const redir = await redirecionamentosDoPacote()
    const e = fundir([
      ev({ seq: 1, tipo: 'sitio', reg: 'SI-teste123-2', op: 'criar', campos: { nome: 'x', regiao: 'do SI', variantes: ['Grafia do SI'] } }),
      ev({ seq: 2, tipo: 'sitio', reg: 'TESTE-2', op: 'alterar', campos: { regiao: null } }),
    ])
    expect(correcoesDosSitios(e, redir).get('TESTE-2')).toMatchObject({ regiao: null, variantes: ['Grafia do SI'] })
  })

  it('a contagem por sítio soma os ligados ao SI-… no sítio do livro', async () => {
    const redir = await redirecionamentosDoPacote()
    const com = objetosPorSitio(estadoAtual(), redir)
    expect(com.get('TESTE-2')).toBe(3) // os dois objetos SKC e a troca do CA00001
    expect(com.has('SI-teste123-2')).toBe(false)
    expect(com.get('SI-aaaaaaaa-5')).toBe(1)
    const sem = objetosPorSitio(estadoAtual())
    expect(sem.get('SI-teste123-2')).toBe(3)
    expect(sem.has('TESTE-2')).toBe(false)
  })

  it('m4: o nome de agora de um SI-… publicado é o do sítio do livro (nas sugestões dos objetos SKC também)', async () => {
    const redir = await redirecionamentosDoPacote()
    const livro = await sitiosDoPacote()
    expect(nomeDeAgoraDoSitio(estadoAtual(), 'SI-teste123-2', livro, null, redir)).toBe('Tell Probe Teste')
    expect(nomeDeAgoraDoSitio(estadoAtual(), 'SI-teste123-2', livro, null)).toBe('Tell Probe do app')
    // sem a lista do pacote à mão: o nome que a pessoa deu (o que o pipeline publicou), nunca o rótulo guardado
    expect(nomeDeAgoraDoSitio(estadoAtual(), 'SI-teste123-2', null, 'guardado', redir)).toBe('Tell Probe do app')
    const s = await sugerir('escaravelho', { tabela })
    const doObjeto = s.objetos.find((x) => x.codigo === 'CA00009')
    expect(doObjeto?.complemento).toContain('Tell Probe Teste')
    expect(doObjeto?.complemento).not.toContain('Tell Probe do app')
  })

  it('m4: na Revisão, um objeto ligado a um SI-… publicado não conta como sítio excluído', async () => {
    const redir = await redirecionamentosDoPacote()
    const e = fundir([
      ev({ seq: 1, tipo: 'sitio', reg: 'SI-teste123-1', op: 'criar', campos: { nome: 'Tell Usuário Teste' } }),
      ev({ seq: 2, tipo: 'sitio', reg: 'SI-teste123-1', op: 'excluir', campos: {} }),
      ev({ seq: 3, tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'criar', campos: { periodo: 'CA', titulo: 'x', sitio: 'SI-teste123-1', sitioNome: 'Tell Usuário Teste' } }),
    ])
    expect(sitiosNaoResolvidos(e, [], redir).skc).toEqual([])
    expect(sitiosNaoResolvidos(e, []).skc).toEqual([{ id: 'OB-aaaaaaaa-1', motivo: 'excluido', nome: 'Tell Usuário Teste' }])
  })
})
