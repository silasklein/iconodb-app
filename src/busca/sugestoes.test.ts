// @vitest-environment node
/**
 * Decisão 32: as sugestões da busca, sobre o pacote sintético e a camada do usuário. Cada teste carrega módulos novos
 * sobre um IndexedDB limpo e um banco novo (como indice.test.ts).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { ev, A, T0 } from '../../tests/suporte/eventosDeTeste'
import { RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import { lerTabelaDeFold } from './fold'
import type { Evento, Json, Tipo } from '../usuario/eventos'

const tabela = lerTabelaDeFold(JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo/fold.json'), 'utf8')))

type Modulos = {
  estado: typeof import('../usuario/estado')
  sugestoes: typeof import('./sugestoes')
  cliente: typeof import('../banco/cliente')
  indice: typeof import('../usuario/indice')
}

function apagarBanco() {
  return new Promise<void>((ok, falha) => {
    const r = indexedDB.deleteDatabase('iconodb-usuario')
    r.onsuccess = () => ok()
    r.onerror = () => falha(r.error)
    r.onblocked = () => falha(new Error('banco bloqueado'))
  })
}

let m: Modulos
beforeEach(async () => {
  await apagarBanco()
  vi.resetModules()
  m = {
    estado: await import('../usuario/estado'),
    sugestoes: await import('./sugestoes'),
    cliente: await import('../banco/cliente'),
    indice: await import('../usuario/indice'),
  }
  m.cliente.usarMotor(await bancoDeTeste())
})
afterEach(() => m.cliente.usarMotor(null))

let seq = 0
function e(tipo: Tipo, reg: string, campos: Record<string, Json>): Evento {
  seq++
  return ev({ ap: A, seq, tipo, reg, op: 'criar', campos })
}
const sugerir = (digitado: string, limitePorCategoria = 3) => m.sugestoes.sugerir(digitado, { limitePorCategoria, tabela })
const rotulos = (l: { rotulo: string }[]) => l.map((s) => s.rotulo)

describe('sugerir(): o pacote', () => {
  it('um prefixo sugere o verbete (com o id e o destino) e os objetos, com tipo curto, número e miniatura', async () => {
    const r = await sugerir('lea')
    expect(r.verbetes[0]).toMatchObject({
      categoria: 'verbetes',
      alvoTipo: 'verbete',
      ref: 'GL-900001',
      rotulo: 'leão-de-teste',
      id: 'GL-900001',
      destino: '/verbete/GL-900001',
      skc: false,
    })
    expect(rotulos(r.verbetes)).toEqual(['leão-de-teste', 'filhote de leão-de-teste'])
    const ca1 = r.objetos.find((o) => o.codigo === 'CA00001')!
    expect(ca1).toMatchObject({
      categoria: 'objetos',
      alvoTipo: 'objeto',
      ref: 'CA00001',
      rotulo: 'Pingente com leão-de-teste',
      destino: '/item/CA00001',
      miniatura: 'imagens/TESTE/TESTE-0001/thumb-1.webp',
    })
    expect(ca1.complemento).toContain('TESTE I: 1')
  })

  it('o negrito vem pronto, sem acento na digitação: "lea" marca "leã" em "leão-de-teste"', async () => {
    const r = await sugerir('lea')
    expect(r.verbetes[0]!.trechos).toEqual([
      { texto: 'leã', forte: true },
      { texto: 'o-de-teste', forte: false },
    ])
    expect(r.verbetes[1]!.trechos.find((t) => t.forte)?.texto).toBe('leã')
    // o rótulo do objeto também
    const ca1 = r.objetos.find((o) => o.codigo === 'CA00001')!
    expect(ca1.trechos.filter((t) => t.forte).map((t) => t.texto)).toEqual(['leã'])
  })

  it('sítios pelo nome (dobrado), com a região e a contagem de objetos', async () => {
    const r = await sugerir('mah')
    // pacote 8: também TESTE-7 «Maḥtiṣ Teste» (sem objetos), depois
    expect(r.sitios.map((x) => x.ref)).toEqual(['TESTE-1', 'TESTE-7'])
    expect(r.sitios[0]).toMatchObject({ categoria: 'sitios', alvoTipo: 'sitio', rotulo: 'Maḥteṣ Teste', destino: '/sitio/TESTE-1', skc: false })
    expect(r.sitios[0]!.complemento).toMatch(/3 objetos/)
    expect(r.sitios[0]!.trechos).toEqual([
      { texto: 'Maḥ', forte: true },
      { texto: 'teṣ Teste', forte: false },
    ])
    // ligado ao verbete do mesmo nome
    expect(rotulos(r.verbetes)).toContain('Maḥteṣ Teste')
  })

  it('obras pela citação curta, com o título como complemento', async () => {
    const r = await sugerir('aut')
    expect(rotulos(r.obras).sort()).toEqual(['Autor 1999', 'Autora 2004'])
    expect(r.obras[0]).toMatchObject({ categoria: 'obras', alvoTipo: 'obra', destino: expect.stringMatching(/^\/obra\/BIB-9000/) })
  })

  it('o número do objeto, por prefixo ("CA0000"), acha os objetos mesmo sem texto', async () => {
    const r = await sugerir('CA0000')
    expect(r.objetos.map((o) => o.codigo)).toEqual(['CA00001', 'CA00002', 'CA00003'])
    expect(await sugerir('ba')).toMatchObject({ objetos: expect.arrayContaining([expect.objectContaining({ codigo: 'BA00001' })]) })
  })

  it('limita cada categoria ao limitePorCategoria, por relevância e depois por rótulo', async () => {
    const r = await sugerir('teste', 2)
    for (const c of [r.verbetes, r.objetos, r.sitios, r.obras]) expect(c.length).toBeLessThanOrEqual(2)
    expect(r.verbetes).toHaveLength(2)
    const tudo = await sugerir('teste', 10)
    expect(tudo.verbetes.length).toBeGreaterThan(2)
    // a mesma ordem, só mais longa
    expect(rotulos(tudo.verbetes).slice(0, 2)).toEqual(rotulos(r.verbetes))
  })

  it('só a última palavra é prefixo; as outras valem inteiras', async () => {
    expect(rotulos((await sugerir('filhote de lea')).verbetes)).toEqual(['filhote de leão-de-teste'])
    expect((await sugerir('filh de lea')).verbetes).toEqual([])
  })

  it('curto demais, só espaços, só pontuação ou sem casamento: tudo vazio, sem erro', async () => {
    for (const d of ['', ' ', 'a', '"', '*', '()', 'zzzzzzzz']) {
      expect(await sugerir(d), JSON.stringify(d)).toMatchObject({ verbetes: [], objetos: [], sitios: [], obras: [] })
    }
  })

  it('nada do que foi digitado vira sintaxe do FTS5: aspas, * e parênteses não quebram nem mudam o resultado', async () => {
    const esperado = ['leão-de-teste', 'filhote de leão-de-teste']
    for (const d of ['lea', '"lea', 'lea*', '(lea', 'lea)', '"lea"', "lea'", 'lea"']) {
      expect(rotulos((await sugerir(d)).verbetes), JSON.stringify(d)).toEqual(esperado)
    }
    // operadores do FTS5 digitados são palavras comuns (AND implícito): nada de OR/NEAR/coluna:
    expect((await sugerir('lea OR zzzz')).verbetes).toEqual([])
    expect((await sugerir('NEAR(lea teste)')).verbetes).toEqual([])
    expect((await sugerir('texto: lea')).verbetes).toEqual([])
  })

  it('o número do objeto só vai na frente quando o que foi digitado tem dígitos; sem dígitos, o texto vem primeiro', async () => {
    // "ca" é início de palavra no texto de BA00001 (e de outros) e de CA0000x no número
    const semDigitos = (await sugerir('ca')).objetos.map((o) => o.codigo)
    expect(semDigitos[0]).toBe('BA00001') // o melhor acerto de texto
    expect(semDigitos).toContain('CA00001')
    expect((await sugerir('ca0')).objetos.map((o) => o.codigo)).toEqual(['CA00001', 'CA00002', 'CA00003'])
    expect((await sugerir('CA0000')).objetos.map((o) => o.codigo)).toEqual(['CA00001', 'CA00002', 'CA00003'])
  })

  it('sem pacote aberto, devolve vazio e, só em desenvolvimento, registra o erro engolido', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    m.cliente.usarMotor(null)
    await expect(m.sugestoes.sugerir('lea', { limitePorCategoria: 3, tabela })).resolves.toMatchObject({ verbetes: [], objetos: [] })
    expect(import.meta.env.DEV).toBe(true)
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining('sugerir'), expect.anything())
    aviso.mockRestore()
  })
})

describe('sugerir(): a camada do usuário (SKC)', () => {
  const receber = (...eventos: Evento[]) => m.estado.receberEventos(eventos)

  it('objeto, coleção e sítio do usuário aparecem com a marca SKC, e levam ao destino quando ele existe', async () => {
    await receber(
      e('objeto', 'OB-aaaaaaaa-1', { numero: 'CA00005', titulo: 'Escaraveu leonino.', obraRotulo: 'Autor 1999', figura: '3', sitioNome: 'Maḥteṣ Novo' }),
      e('colecao', 'CO-aaaaaaaa-1', { nome: 'Leões do meu estudo', 'm:CA00001': true, 'i:CA00001': 1024, 'm:CA00002': true, 'i:CA00002': 2048, 'm:CA00003': null, 'i:CA00003': 3072 }),
      e('sitio', 'SI-aaaaaaaa-1', { nome: 'Tell Leonino' }),
    )
    const r = await sugerir('leo')
    expect(r.objetos[0]).toMatchObject({ skc: true, alvoTipo: 'objeto', codigo: 'CA00005', rotulo: 'Escaraveu leonino', miniatura: null, destino: '/item/CA00005' })
    expect(r.objetos[0]!.complemento).toContain('Maḥteṣ Novo')
    expect(r.objetos[0]!.complemento).toContain('Autor 1999, fig. 3')
    expect(r.colecoes?.[0]).toMatchObject({ skc: true, alvoTipo: 'colecao', ref: 'CO-aaaaaaaa-1', rotulo: 'Leões do meu estudo' })
    expect(r.sitios[0]).toMatchObject({ skc: true, alvoTipo: 'sitio', ref: 'SI-aaaaaaaa-1', rotulo: 'Tell Leonino' })
    // a coleção abre a tela dela (como grupo) e diz quantos objetos tem; o sítio do usuário ainda não tem tela: o destino é a busca pelo nome
    expect(r.colecoes?.[0]!.destino).toBe('/grupo/CO-aaaaaaaa-1')
    expect(r.colecoes?.[0]!.complemento).toBe('2 objetos')
    expect(r.sitios[0]!.destino).toBe('/sitio/SI-aaaaaaaa-1')
  })

  it('decisão 41: um verbete do usuário é sugerido entre os verbetes, com a marca SKC, "a revisar" e a página dele', async () => {
    await receber(e('verbete', 'GL-aaaaaaaa-1', { forma: 'Termo-Novo-de-Teste', status: 'proposed' }))
    const r = await sugerir('termo novo')
    expect(r.verbetes).toEqual([
      expect.objectContaining({ categoria: 'verbetes', alvoTipo: 'verbete', ref: 'GL-aaaaaaaa-1', rotulo: 'Termo-Novo-de-Teste', complemento: 'a revisar', skc: true, destino: '/verbete/GL-aaaaaaaa-1' }),
    ])
    // sem acento e sem caixa, e ao lado dos do pacote (reserva um lugar)
    await receber(e('verbete', 'GL-aaaaaaaa-2', { forma: 'Leão marinho', status: 'proposed' }))
    const leao = await sugerir('leao', 3)
    expect(leao.verbetes.length).toBeLessThanOrEqual(3)
    expect(leao.verbetes.at(-1)).toMatchObject({ ref: 'GL-aaaaaaaa-2', skc: true })
    expect(leao.verbetes.slice(0, -1).every((v) => !v.skc)).toBe(true)
  })

  it('Tarefa 11: um verbete do livro com forma em uso é sugerido pela forma nova e pela antiga, uma vez só, com a forma nova', async () => {
    await receber(e('verbete', 'GL-900001', { formaEmUso: 'leão da prova' }))
    // pela forma nova (que o pacote não conhece)
    const nova = await sugerir('leão da prova')
    expect(nova.verbetes).toEqual([expect.objectContaining({ ref: 'GL-900001', rotulo: 'leão da prova', skc: false, destino: '/verbete/GL-900001', id: 'GL-900001', alvoTipo: 'verbete' })])
    // pela antiga: o mesmo verbete, mostrado com a forma nova e a antiga como complemento
    const antiga = await sugerir('leão-de-teste')
    const doLeao = antiga.verbetes.filter((v) => v.ref === 'GL-900001')
    expect(doLeao).toHaveLength(1)
    expect(doLeao[0]).toMatchObject({ rotulo: 'leão da prova', complemento: 'leão-de-teste', skc: false })
    // as sugestões do pacote que não foram editadas seguem como estavam
    expect(antiga.verbetes.map((v) => v.rotulo)).toContain('filhote de leão-de-teste')
  })

  it('Ferro I–III: "F10" já é começo de número e sugere o F100001', async () => {
    await receber(e('objeto', 'OB-aaaaaaaa-1', { numero: 'F100001', titulo: 'Selo de ferro.' }))
    expect((await sugerir('F10')).objetos.map((o) => o.codigo)).toEqual(['F100001'])
    expect((await sugerir('f100001')).objetos.map((o) => o.codigo)).toEqual(['F100001'])
  })

  it('o número de um objeto SKC ("CA0000") também sugere', async () => {
    await receber(e('objeto', 'OB-aaaaaaaa-1', { numero: 'CA00005', titulo: 'Escaraveu.' }))
    // o do usuário reserva um dos 3 lugares
    expect((await sugerir('CA0000')).objetos.map((o) => o.codigo)).toEqual(['CA00001', 'CA00002', 'CA00005'])
    expect((await sugerir('CA0000', 5)).objetos.map((o) => o.codigo)).toEqual(['CA00001', 'CA00002', 'CA00003', 'CA00004', 'CA00005'])
  })

  it('decisão 38: "SKC 3" sugere o objeto pelo SKC, Nr., que aparece no complemento', async () => {
    await receber(e('objeto', 'OB-aaaaaaaa-1', { numero: 'CA00005', nrSkc: '3', titulo: 'Escaraveu.' }))
    const r = await sugerir('SKC 3')
    expect(r.objetos.map((o) => o.codigo)).toEqual(['CA00005'])
    expect(r.objetos[0]!.complemento).toMatch(/^SKC: 3/)
    expect((await sugerir('SKC: 3')).objetos.map((o) => o.codigo)).toEqual(['CA00005'])
  })

  it('revisão 3: a referência digitada sugere exatamente aquele objeto ("SKC 1" não sugere o 12; "SKC 12" não sugere página ou altura 12)', async () => {
    await receber(
      e('objeto', 'OB-aaaaaaaa-1', { numero: 'CA00005', nrSkc: '1', titulo: 'Primeiro.' }),
      e('objeto', 'OB-aaaaaaaa-12', { numero: 'CA00006', nrSkc: '12', titulo: 'Décimo segundo.' }),
      e('objeto', 'OB-aaaaaaaa-3', { numero: 'CA00007', nrSkc: '3', titulo: 'Terceiro.', altura: '12', pagina: '12', obraRotulo: 'Autor 2001' }),
      e('nota', 'NT-aaaaaaaa-1', { texto: 'parecido com TESTE I, 1', alvoTipo: 'objeto', alvo: 'CA00003' }),
    )
    const codigos = async (q: string) => {
      const r = await sugerir(q)
      expect([r.verbetes, r.sitios, r.obras, r.colecoes ?? []].flat(), q).toEqual([])
      return r.objetos.map((o) => o.codigo)
    }
    for (const q of ['SKC 1', 'SKC: 1', 'skc nr 1', 'SKC, Nr. 1']) expect(await codigos(q), q).toEqual(['CA00005'])
    for (const q of ['SKC 12', 'SKC: 12', 'skc nr 12', 'SKC, Nr. 12']) expect(await codigos(q), q).toEqual(['CA00006'])
    expect(await codigos('SKC 99')).toEqual([])
    for (const q of ['TESTE I: 1', 'TESTE 1', 'TESTE I, Nr. 1']) expect(await codigos(q), q).toEqual(['CA00001'])
    expect((await sugerir('SKC: 12')).objetos[0]!.complemento).toMatch(/^SKC: 12/)
  })

  it('o do usuário reserva um lugar na categoria, em vez de ser empurrado para fora pelos do pacote', async () => {
    await receber(e('objeto', 'OB-aaaaaaaa-1', { numero: 'CA00005', titulo: 'Selo de prova do usuário.' }))
    const r = await sugerir('selo', 3)
    expect(r.objetos).toHaveLength(3)
    expect(r.objetos.map((o) => o.skc)).toEqual([false, false, true])
    expect(r.objetos.filter((o) => !o.skc).length).toBe(2)
  })

  it('rascunho sem número, registro excluído e nota não viram sugestão', async () => {
    await receber(
      e('objeto', 'OB-aaaaaaaa-1', { titulo: 'Rascunho sem número.' }),
      e('objeto', 'OB-aaaaaaaa-2', { numero: 'CA00006', titulo: 'Objeto excluído.' }),
      e('nota', 'NT-aaaaaaaa-1', { titulo: 'nota sobre rascunho', texto: 'rascunho' }),
    )
    await receber(ev({ ap: A, seq: 99, tipo: 'objeto', reg: 'OB-aaaaaaaa-2', op: 'excluir', campos: {}, ms: T0 + 99_000 }))
    const r = await sugerir('rascunho')
    expect(r.objetos).toEqual([])
    expect(r.colecoes ?? []).toEqual([])
    expect((await sugerir('excluido')).objetos).toEqual([])
  })

  it('2C: um objeto excluído sai da sugestão e da contagem da coleção; restaurar devolve os dois', async () => {
    await receber(
      e('objeto', 'OB-aaaaaaaa-1', { numero: 'CA00005', titulo: 'Selo cilíndrico.' }),
      e('objeto', 'OB-aaaaaaaa-2', { numero: 'CA00006', titulo: 'Selo estampado.' }),
      e('colecao', 'CO-aaaaaaaa-1', { nome: 'Selos de prova', 'm:OB-aaaaaaaa-1': true, 'i:OB-aaaaaaaa-1': 1024, 'm:OB-aaaaaaaa-2': true, 'i:OB-aaaaaaaa-2': 2048 }),
    )
    expect((await sugerir('selo')).colecoes?.[0]!.complemento).toBe('2 objetos')
    expect((await sugerir('cilindrico')).objetos.map((o) => o.codigo)).toEqual(['CA00005'])
    await receber(ev({ ap: A, seq: 98, tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'excluir', campos: {}, ms: T0 + 98_000 }))
    expect((await sugerir('selo')).colecoes?.[0]!.complemento).toBe('1 objeto')
    expect((await sugerir('cilindrico')).objetos).toEqual([])
    await receber(ev({ ap: A, seq: 99, tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'restaurar', campos: {}, ms: T0 + 99_000 }))
    expect((await sugerir('selo')).colecoes?.[0]!.complemento).toBe('2 objetos')
    expect((await sugerir('cilindrico')).objetos.map((o) => o.codigo)).toEqual(['CA00005'])
  })

  it('uma edição nova aparece na hora (o índice é posto em dia antes de sugerir)', async () => {
    await receber(e('colecao', 'CO-aaaaaaaa-1', { nome: 'Sinetes de teste' }))
    expect(rotulos((await sugerir('sinet')).colecoes ?? [])).toEqual(['Sinetes de teste'])
    await receber(e('colecao', 'CO-aaaaaaaa-1', { nome: 'Cilindros' }))
    expect((await sugerir('sinet')).colecoes ?? []).toEqual([])
    expect(rotulos((await sugerir('cilin')).colecoes ?? [])).toEqual(['Cilindros'])
  })
})
