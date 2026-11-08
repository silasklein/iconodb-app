/**
 * A conta da Revisão (src/revisao/fila.ts): a fila do pacote, os objetos SKC soltos, os rascunhos e os verbetes a revisar,
 * menos o que a pessoa resolveu. Pura sobre o Estado.
 */
import { A, ev } from '../../tests/suporte/eventosDeTeste'
import type { ElementoSemRegiao, LinhaDaFila, LugarDoCaso, TraducaoNaoRevisada } from '../banco/consultas'
import { fundir } from '../usuario/fusao'
import type { Evento } from '../usuario/eventos'
import { chaveDoCaso, chaveDoElementoSemRegiao, chaveDoRascunho, chaveDoSitioSolto } from './chave'
import { autorDaCitacao, casosIguais, idDoGrupo, montarFila, verbetesARever, type EntradaDaFila } from './fila'
import { rotuloDaPendencia } from './rotulos'

const cit = (detalhe: string, id = 'PA-TESTE-0001-cat-1'): LinhaDaFila => ({ tipo: 'citacao_nao_resolvida', entidade: 'passage', entidadeId: id, detalhe, numero: null })
const sitio = (item: string, numero: string, tipo = 'sitio_nao_normalizado', detalhe = 'x'): LinhaDaFila => ({ tipo, entidade: 'item', entidadeId: item, detalhe, numero })
const medida: LinhaDaFila = { tipo: 'medidas_nao_normalizadas', entidade: 'item', entidadeId: 'TESTE-0004', detalhe: '5 cm?', numero: 'CA00004' }
const SEM_RASCUNHOS = { porId: new Map(), rascunhos: [] as string[] }

let seq = 0
const e = (campos: Partial<Evento> & { tipo: Evento['tipo']; reg: string }): Evento => ev({ ap: A, seq: ++seq, op: 'alterar', campos: {}, ...campos })
const fila = (eventos: Evento[], p: Partial<EntradaDaFila> = {}) =>
  montarFila({ linhas: [cit('Fantasma 1888: 3'), cit('Amostra 1999: 9', 'PA-2'), sitio('TESTE-0001', 'CA00001'), sitio('TESTE-0002', 'CA00002'), medida], lugares: null, verbetesDoPacote: [], numeracao: SEM_RASCUNHOS, estado: fundir(eventos), ...p })
const quantidade = (f: ReturnType<typeof fila>, rotulo: string) => f.grupos.find((g) => g.rotulo === rotulo)?.quantidade ?? 0

describe('a fila de agora', () => {
  it('conta por grupo, do maior para o menor, e o total é a soma', () => {
    const f = fila([])
    expect(f.grupos.map((g) => [g.rotulo, g.quantidade])).toEqual([
      ['Citações não resolvidas', 2],
      ['Sítios não resolvidos', 2],
      ['Medidas não organizadas', 1],
    ])
    expect(f.total).toBe(5)
    expect(f.grupos.map((g) => g.id)).toEqual(['citacoes-nao-resolvidas', 'sitios-nao-resolvidos', 'medidas-nao-organizadas'])
  })

  it('marcar como resolvido tira da contagem, mantém o caso no grupo e desfazer devolve (excluir/restaurar)', () => {
    const chave = chaveDoCaso(cit('Fantasma 1888: 3'))
    const marcado = fila([e({ tipo: 'revisao', reg: chave, op: 'criar', campos: { tipo: 'citacao_nao_resolvida' } })])
    expect(marcado.total).toBe(4)
    const g = marcado.grupos.find((x) => x.rotulo === 'Citações não resolvidas')!
    expect(g.quantidade).toBe(1)
    expect(g.resolvidos.map((c) => c.chave)).toEqual([chave])
    expect(marcado.resolvidosPelaPessoa).toBe(1)
    const desfeito = fila([e({ tipo: 'revisao', reg: chave, op: 'criar' }), e({ tipo: 'revisao', reg: chave, op: 'excluir' })])
    expect(desfeito.total).toBe(5)
    expect(desfeito.resolvidosPelaPessoa).toBe(0)
    const denovo = fila([e({ tipo: 'revisao', reg: chave, op: 'criar' }), e({ tipo: 'revisao', reg: chave, op: 'excluir' }), e({ tipo: 'revisao', reg: chave, op: 'restaurar' })])
    expect(denovo.total).toBe(4)
  })

  it('Tarefa 15 (2C, bloco 2): os pares de sítios abertos somam no total (a Revisão, o Menu e o ponto da barra concordam)', () => {
    const f = fila([], { paresAbertos: 2 })
    expect(f.total).toBe(7)
    expect(f.paresAbertos).toBe(2)
    // os grupos da fila não mudam: o grupo dos pares é da página
    expect(f.grupos.map((g) => g.quantidade)).toEqual([2, 2, 1])
    expect(fila([]).paresAbertos).toBe(0)
    expect(fila([], { paresAbertos: 0 }).total).toBe(5)
  })

  it('um grupo todo resolvido continua listado (com 0), para o Desfazer', () => {
    const f = fila([e({ tipo: 'revisao', reg: chaveDoCaso(medida), op: 'criar' })])
    expect(f.grupos.find((g) => g.rotulo === 'Medidas não organizadas')).toMatchObject({ quantidade: 0, abertos: [], resolvidos: [{ numero: 'CA00004' }] })
  })

  it('um registro revisao de um caso que não está mais no pacote não conta nem aparece', () => {
    const f = fila([e({ tipo: 'revisao', reg: 'citacao_nao_resolvida~passage~PA-ANTIGA~abc', op: 'criar' })])
    expect(f.total).toBe(5)
    expect(f.resolvidosPelaPessoa).toBe(0)
  })

  it('ligar o sítio de um objeto do livro resolve a linha (e conta à parte)', () => {
    const f = fila([e({ tipo: 'item-sitio', reg: 'CA00001', campos: { sitio: 'TESTE-2', sitioNome: 'Tell Probe Teste' } })])
    expect(quantidade(f, 'Sítios não resolvidos')).toBe(1)
    expect(f.sitiosLigados).toBe(1)
    expect(f.total).toBe(4)
  })

  it('um sítio ainda não sincronizado NÃO conta; o excluído conta; restaurar resolve', () => {
    const troca = e({ tipo: 'item-sitio', reg: 'CA00001', campos: { sitio: 'SI-bbbbbbbb-1', sitioNome: 'Tell Remoto' } })
    // o registro do sítio não está neste aparelho: ainda não chegou
    expect(quantidade(fila([troca]), 'Sítios não resolvidos')).toBe(1)
    const criado = e({ tipo: 'sitio', reg: 'SI-bbbbbbbb-1', op: 'criar', campos: { nome: 'Tell Remoto' } })
    expect(quantidade(fila([troca, criado]), 'Sítios não resolvidos')).toBe(1)
    const excluido = e({ tipo: 'sitio', reg: 'SI-bbbbbbbb-1', op: 'excluir' })
    expect(quantidade(fila([troca, criado, excluido]), 'Sítios não resolvidos')).toBe(2)
    const restaurado = e({ tipo: 'sitio', reg: 'SI-bbbbbbbb-1', op: 'restaurar' })
    expect(quantidade(fila([troca, criado, excluido, restaurado]), 'Sítios não resolvidos')).toBe(1)
  })

  it('objetos SKC: nome livre e sítio excluído contam no mesmo grupo; sítio ainda não sincronizado, não', () => {
    const livre = e({ tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'criar', campos: { periodo: 'CA', titulo: 'Escaraveu', sitio: '', sitioNome: 'Miš' } })
    const ausente = e({ tipo: 'objeto', reg: 'OB-aaaaaaaa-2', op: 'criar', campos: { periodo: 'CA', titulo: 'Selo', sitio: 'SI-bbbbbbbb-1', sitioNome: 'Tell Remoto' } })
    const f = fila([livre, ausente])
    expect(quantidade(f, 'Sítios não resolvidos')).toBe(3)
    const soltos = f.grupos.find((g) => g.rotulo === 'Sítios não resolvidos')!.abertos.filter((c) => c.tipo === 'sitio-skc')
    expect(soltos.map((c) => c.chave)).toEqual([chaveDoSitioSolto('OB-aaaaaaaa-1', 'Miš')])
    expect(soltos[0]!.acao).toEqual({ rotulo: 'Escolher o sítio', para: '/item/OB-aaaaaaaa-1?corrigir=sitio' })
    const excl = e({ tipo: 'sitio', reg: 'SI-bbbbbbbb-1', op: 'criar', campos: { nome: 'Tell Remoto' } })
    const exc2 = e({ tipo: 'sitio', reg: 'SI-bbbbbbbb-1', op: 'excluir' })
    expect(quantidade(fila([livre, ausente, excl, exc2]), 'Sítios não resolvidos')).toBe(4)
  })

  it('os rascunhos sem número entram, e dar o período os tira', () => {
    const rascunho = e({ tipo: 'objeto', reg: 'OB-aaaaaaaa-3', op: 'criar', campos: { titulo: 'Sem período' } })
    const numeracao = { porId: new Map(), rascunhos: ['OB-aaaaaaaa-3'] }
    const f = fila([rascunho], { numeracao })
    const g = f.grupos.find((x) => x.rotulo === 'Objetos sem número')!
    expect(g.quantidade).toBe(1)
    expect(g.abertos[0]).toMatchObject({ chave: chaveDoRascunho('OB-aaaaaaaa-3'), o_que: 'Sem período', acao: { rotulo: 'Escolher o período', para: '/item/OB-aaaaaaaa-3?corrigir=periodo' } })
    expect(f.total).toBe(6)
    expect(fila([rascunho], { numeracao: SEM_RASCUNHOS }).total).toBe(5) // ganhou período: saiu da lista de rascunhos
  })

  it('"a revisar" no glossário é o estado derivado: aprovado sai, forma mudada depois da aprovação volta; o verbete do usuário conta', () => {
    const pacote = [
      { id: 'GL-900002', original: 'figura denteada' },
      { id: 'GL-900005', original: 'Tell Probe Teste' },
    ]
    expect(verbetesARever(fundir([]), pacote)).toBe(2)
    const aprova = (reg: string, forma: string | null) => e({ tipo: 'verbete', reg, campos: { status: 'approved', formaAprovada: forma } })
    expect(verbetesARever(fundir([aprova('GL-900002', null)]), pacote)).toBe(1)
    // mudou a forma depois de aprovar: volta a revisar
    expect(verbetesARever(fundir([aprova('GL-900002', null), e({ tipo: 'verbete', reg: 'GL-900002', campos: { formaEmUso: 'figura recortada' } })]), pacote)).toBe(2)
    const novo = e({ tipo: 'verbete', reg: 'GL-aaaaaaaa-1', op: 'criar', campos: { forma: 'cria de leão' } })
    expect(verbetesARever(fundir([novo]), pacote)).toBe(3)
    expect(verbetesARever(fundir([novo, e({ tipo: 'verbete', reg: 'GL-aaaaaaaa-1', op: 'excluir' })]), pacote)).toBe(2)
    const f = fila([novo], { verbetesDoPacote: pacote })
    const g = f.grupos.find((x) => x.rotulo === 'Verbetes a revisar')!
    expect(g).toMatchObject({ quantidade: 3, abertos: [], link: { para: '/glossario?revisar=1' } })
    expect(f.total).toBe(8)
  })

  it('cada tipo tem a sua ação, e o número leva ao objeto', () => {
    const lugares = new Map<string, LugarDoCaso>([['passage|PA-TESTE-0001-cat-1', { itemId: 'TESTE-0001', numero: 'CA00001', grupoId: null, origem: 'TESTE I: 1' }]])
    const f = fila([], {
      linhas: [
        cit('Amostra 1999: 9'),
        { tipo: 'traducao_termo_alterado', entidade: 'passage', entidadeId: 'PA-TESTE-0001-cat-1', detalhe: "GL-900003: 'olhos' (m) -> 'olho' (m)", numero: null },
        { tipo: 'traducao_desatualizada', entidade: 'passage', entidadeId: 'PA-TESTE-0001-cat-1', detalhe: 'x', numero: null },
        sitio('TESTE-0002', 'CA00002'),
        medida,
        { tipo: 'gazetteer_aviso', entidade: 'gazetteer', entidadeId: null, detalhe: 'recusada', numero: null },
      ],
      lugares,
    })
    const acao = (rotulo: string) => f.grupos.find((g) => g.rotulo === rotulo)!.abertos[0]!
    expect(acao('Citações não resolvidas')).toMatchObject({ numero: 'CA00001', abrir: '/item/CA00001', onde: 'TESTE I: 1 · trecho', acao: { rotulo: 'Resolver na bibliografia', para: '/bibliografia?filtro=Amostra' } })
    expect(acao('Traduções com termo alterado').acao).toEqual({ rotulo: 'Abrir o verbete', para: '/verbete/GL-900003' })
    expect(acao('Traduções desatualizadas').acao).toEqual({ rotulo: 'Abrir o objeto', para: '/item/CA00001' })
    expect(acao('Sítios não resolvidos').acao).toEqual({ rotulo: 'Escolher o sítio', para: '/item/CA00002?corrigir=sitio' })
    expect(acao('Medidas não organizadas')).toMatchObject({ abrir: '/item/CA00004', acao: { rotulo: 'Abrir o objeto', para: '/item/CA00004' } })
    // sem lugar para abrir (aviso do gazetteer): sem ação, só o «Deixar como está»
    expect(acao('Gazetteer aviso')).toMatchObject({ numero: '—', abrir: null, acao: null })
  })

  it('um trecho de introdução leva ao grupo', () => {
    const lugares = new Map<string, LugarDoCaso>([['passage|PA-TESTE-0001-cat-1', { itemId: null, numero: null, grupoId: 'GR-TESTE-I-01', origem: 'TESTE I · introdução' }]])
    const c = fila([], { linhas: [cit('Amostra 1999: 9')], lugares }).grupos[0]!.abertos[0]!
    expect(c).toMatchObject({ abrir: '/grupo/GR-TESTE-I-01', onde: 'TESTE I · introdução · trecho' })
  })

  it('casos idênticos no pacote são casos distintos (cada um se resolve sozinho)', () => {
    const f = fila([], { linhas: [medida, medida] })
    const chaves = f.grupos[0]!.abertos.map((c) => c.chave)
    expect(new Set(chaves).size).toBe(2)
    const um = fila([e({ tipo: 'revisao', reg: chaves[0]!, op: 'criar' })], { linhas: [medida, medida] })
    expect(um.total).toBe(1)
  })

  it('a conta é a mesma em qualquer ordem dos eventos e com repetições', () => {
    const eventos = [
      e({ tipo: 'revisao', reg: chaveDoCaso(medida), op: 'criar' }),
      e({ tipo: 'item-sitio', reg: 'CA00001', campos: { sitio: 'TESTE-2', sitioNome: 'T' } }),
      e({ tipo: 'revisao', reg: chaveDoCaso(cit('Amostra 1999: 9', 'PA-2')), op: 'criar' }),
      e({ tipo: 'revisao', reg: chaveDoCaso(cit('Amostra 1999: 9', 'PA-2')), op: 'excluir' }),
    ]
    const ref = fila(eventos).total
    expect(ref).toBe(5 - 1 - 1)
    expect(fila([...eventos].reverse()).total).toBe(ref)
    expect(fila([...eventos, ...eventos]).total).toBe(ref)
  })
})

describe('os dois motivos de sítio do pipeline (formato real: sitio_nao_resolvido, com o candidato no detalhe)', () => {
  const real = (item: string, numero: string) => sitio(item, numero, 'sitio_nao_resolvido', "candidato 'Tell Inventado' (vermutlich)")
  const linhas = [real('TESTE-0001', 'CA00001'), real('TESTE-0002', 'CA00002'), sitio('TESTE-0003', 'CA00003')]

  it('entram os dois no MESMO grupo «Sítios não resolvidos», com «Escolher o sítio» (nada de «Sitio nao resolvido»)', () => {
    const f = fila([], { linhas })
    expect(f.grupos.map((g) => [g.rotulo, g.quantidade])).toEqual([['Sítios não resolvidos', 3]])
    const casos = f.grupos[0]!.abertos
    expect(casos.map((c) => c.acao)).toEqual([
      { rotulo: 'Escolher o sítio', para: '/item/CA00001?corrigir=sitio' },
      { rotulo: 'Escolher o sítio', para: '/item/CA00002?corrigir=sitio' },
      { rotulo: 'Escolher o sítio', para: '/item/CA00003?corrigir=sitio' },
    ])
    expect(casos[0]!.o_que).toBe("candidato 'Tell Inventado' (vermutlich)")
  })

  it('trocar o sítio do objeto desconta a linha, seja qual for o motivo', () => {
    const f = fila([e({ tipo: 'item-sitio', reg: 'CA00001', campos: { sitio: 'TESTE-2', sitioNome: 'Tell Probe Teste' } })], { linhas })
    expect(quantidade(f, 'Sítios não resolvidos')).toBe(2)
    expect(f.sitiosLigados).toBe(1)
    expect(f.total).toBe(2)
    const doOutro = fila([e({ tipo: 'item-sitio', reg: 'CA00003', campos: { sitio: 'TESTE-2', sitioNome: 'Tell Probe Teste' } })], { linhas })
    expect(quantidade(doOutro, 'Sítios não resolvidos')).toBe(2)
    expect(doOutro.sitiosLigados).toBe(1)
  })

  it('o nome do motivo real tem acento e texto de apoio', () => {
    expect(rotuloDaPendencia('sitio_nao_resolvido')).toBe('Sítios não resolvidos')
    expect(fila([], { linhas }).grupos[0]!.apoio).not.toBe('')
  })
})

describe('o lugar na citação (formato real: «campo N: …», «aparato não dividido: …», «posição relatada de …: …»)', () => {
  const item = (detalhe: string): LinhaDaFila => ({ tipo: 'citacao_nao_resolvida', entidade: 'item', entidadeId: 'TESTE-0001', detalhe, numero: 'CA00001' })
  const lugares = new Map<string, LugarDoCaso>([['item|TESTE-0001', { itemId: 'TESTE-0001', numero: 'CA00001', grupoId: null, origem: 'TESTE I, 23' }]])
  const caso = (l: LinhaDaFila) => fila([], { linhas: [l], lugares }).grupos[0]!.abertos[0]!

  it('«campo 7: …»: o autor vem depois do prefixo, «campo 7» vai para «onde» e o «o que» fica só com a citação', () => {
    const c = caso(item('campo 7: Fantasma/Outro [ed.] 1888: 3'))
    expect(c.acao).toEqual({ rotulo: 'Resolver na bibliografia', para: '/bibliografia?filtro=Fantasma' })
    expect(c.o_que).toBe('Fantasma/Outro [ed.] 1888: 3')
    expect(c.onde).toBe('TESTE I, 23 · campo 7')
  })

  it('trecho da introdução sem lugar resolvido: o lugar legível no lugar do id cru (como B-23 nas traduções)', () => {
    const l: LinhaDaFila = { tipo: 'citacao_nao_resolvida', entidade: 'passage', entidadeId: 'PA-TESTE-I.S.9-cap-1', detalhe: 'campo 7: Fantasma 1888: 3', numero: null }
    const c = fila([], { linhas: [l], lugares: new Map() }).grupos[0]!.abertos[0]!
    expect(c.onde).toBe('TESTE I · introdução, seção 9 · campo 7')
    expect(c.onde).not.toContain('PA-')
    const sem: LinhaDaFila = { ...l, detalhe: 'Fantasma 1888: 3' }
    expect(fila([], { linhas: [sem], lugares: new Map() }).grupos[0]!.abertos[0]!.onde).toBe('TESTE I · introdução, seção 9 · trecho')
  })

  it('«aparato não dividido: …»', () => {
    const c = caso(item('aparato não dividido: Fantasma 1888: 3'))
    expect(c.acao!.para).toBe('/bibliografia?filtro=Fantasma')
    expect(c.o_que).toBe('Fantasma 1888: 3')
    expect(c.onde).toBe('TESTE I, 23 · aparato não dividido')
  })

  it('«posição relatada de …: …» (hipótese): o autor é o da citação, não os nomes do prefixo', () => {
    const h: LinhaDaFila = { tipo: 'citacao_nao_resolvida', entidade: 'hypothesis', entidadeId: 'HY-900003', detalhe: 'posição relatada de Zé, A.; Beltrano, B.: Fantasma 1888: 3', numero: null }
    const c = fila([], { linhas: [h], lugares: null }).grupos[0]!.abertos[0]!
    expect(c.acao).toEqual({ rotulo: 'Resolver na bibliografia', para: '/bibliografia?filtro=Fantasma' })
    expect(c.o_que).toBe('Fantasma 1888: 3')
    expect(c.onde).toBe('hipótese HY-900003 · posição relatada de Zé, A.; Beltrano, B.')
  })

  it('sem o prefixo (trecho) a citação fica como está; sem autor, a Bibliografia inteira', () => {
    const c = caso(item('Amostra 1999: 9'))
    expect(c.o_que).toBe('Amostra 1999: 9')
    expect(c.onde).toBe('TESTE I, 23 · catálogo')
    const sem = caso(item('campo 7: 12: 5a; ver adiante'))
    expect(sem.acao).toEqual({ rotulo: 'Resolver na bibliografia', para: '/bibliografia' })
    expect(sem.onde).toBe('TESTE I, 23 · campo 7')
  })

  it('o prefixo não muda a chave do caso (continua a do detalhe inteiro)', () => {
    expect(caso(item('campo 7: Fantasma 1888: 3')).chave).toBe(chaveDoCaso(item('campo 7: Fantasma 1888: 3')))
  })
})

describe('«Deixar como está» e as chaves dos casos que nascem do estado do usuário', () => {
  it('o rascunho sem número não se deixa como está (não há o que decidir: só ganhar período); marca antiga não o esconde', () => {
    const rascunho = e({ tipo: 'objeto', reg: 'OB-aaaaaaaa-3', op: 'criar', campos: { titulo: 'Sem período' } })
    const numeracao = { porId: new Map(), rascunhos: ['OB-aaaaaaaa-3'] }
    const f = fila([rascunho, e({ tipo: 'revisao', reg: chaveDoRascunho('OB-aaaaaaaa-3'), op: 'criar' })], { numeracao })
    const g = f.grupos.find((x) => x.rotulo === 'Objetos sem número')!
    expect(g.abertos).toHaveLength(1)
    expect(g.resolvidos).toHaveLength(0)
    expect(g.abertos[0]!.deixavel).toBe(false)
    expect(f.total).toBe(6)
    expect(fila([], { linhas: [medida] }).grupos[0]!.abertos[0]!.deixavel).toBe(true)
  })

  it('a chave do sítio solto leva o nome: um problema novo no mesmo objeto não herda a marca do antigo', () => {
    const objeto = (nome: string) => e({ tipo: 'objeto', reg: 'OB-aaaaaaaa-1', op: 'criar', campos: { periodo: 'CA', titulo: 'Escaraveu', sitio: '', sitioNome: nome } })
    const a = fila([objeto('Miš')], { linhas: [] })
    const chaveA = a.grupos[0]!.abertos[0]!.chave
    expect(chaveA).toBe(chaveDoSitioSolto('OB-aaaaaaaa-1', 'Miš'))
    const marcado = fila([objeto('Miš'), e({ tipo: 'revisao', reg: chaveA, op: 'criar' })], { linhas: [] })
    expect(marcado.total).toBe(0)
    // semanas depois: outro nome livre no mesmo objeto = outro caso
    const outro = fila([objeto('Miš'), e({ tipo: 'revisao', reg: chaveA, op: 'criar' }), e({ tipo: 'objeto', reg: 'OB-aaaaaaaa-1', campos: { sitioNome: 'Tell Outro' } })], { linhas: [] })
    expect(outro.total).toBe(1)
    expect(outro.grupos[0]!.abertos[0]!.chave).not.toBe(chaveA)
  })
})

describe('mais ações para as entidades do pipeline (m4)', () => {
  const linha = (tipo: string, entidade: string, entidadeId: string, detalhe = 'x'): LinhaDaFila => ({ tipo, entidade, entidadeId, detalhe, numero: null })
  const casoUnico = (l: LinhaDaFila, lugares: Map<string, LugarDoCaso> | null = null) => fila([], { linhas: [l], lugares }).grupos[0]!.abertos[0]!

  it('glossary_entry (o nome certo da entidade) abre o verbete', () => {
    expect(casoUnico(linha('correspondencia_invalida', 'glossary_entry', 'GL-000123')).acao).toEqual({ rotulo: 'Abrir o verbete', para: '/verbete/GL-000123' })
    expect(casoUnico(linha('decisao_sem_verbete', 'glossary_entry', 'GL-000124')).acao!.rotulo).toBe('Abrir o verbete')
  })
  it('bib_entry abre a obra', () => {
    expect(casoUnico(linha('obra_do_capitulo_nao_encontrada', 'bib_entry', 'BIB-000036')).acao).toEqual({ rotulo: 'Abrir a obra', para: '/obra/BIB-000036' })
    // um id que não é de obra (ilegível) não leva a lugar nenhum
    expect(casoUnico(linha('entrada_bibliografica_ilegivel', 'bib_entry', 'x.y.360')).acao).toBeNull()
  })
  it('catalog_field e hypothesis abrem o objeto pelo lugar que a consulta achou', () => {
    const lugares = new Map<string, LugarDoCaso>([
      ['catalog_field|TESTE-0003#5', { itemId: 'TESTE-0003', numero: 'CA00003', grupoId: null, origem: 'TESTE I: 3' }],
      ['hypothesis|HY-900003', { itemId: 'TESTE-0002', numero: 'CA00002', grupoId: null, origem: 'TESTE I: 2' }],
    ])
    const cf = casoUnico(linha('traducao_excecao_preservacao', 'catalog_field', 'TESTE-0003#5'), lugares)
    expect(cf).toMatchObject({ numero: 'CA00003', abrir: '/item/CA00003', acao: { rotulo: 'Abrir o objeto', para: '/item/CA00003' } })
    const hy = casoUnico(linha('mencao_de_figura_ambigua', 'hypothesis', 'HY-900003'), lugares)
    expect(hy).toMatchObject({ numero: 'CA00002', abrir: '/item/CA00002', onde: 'TESTE I: 2 · hipótese' })
  })
})

describe('nomes em português para os motivos reais (m5)', () => {
  it.each([
    ['sitio_nao_resolvido', 'Sítios não resolvidos'],
    ['tabela_na_introducao', 'Tabelas na introdução'],
    ['traducao_fora_de_escopo', 'Traduções fora do escopo'],
    ['traducao_excecao_preservacao', 'Traduções com exceção de preservação'],
    ['obra_do_capitulo_nao_encontrada', 'Obras de capítulo não encontradas'],
    ['entrada_bibliografica_ilegivel', 'Entradas bibliográficas ilegíveis'],
  ])('%s → %s, com texto de apoio no grupo', (motivo, nome) => {
    expect(rotuloDaPendencia(motivo)).toBe(nome)
    const f = fila([], { linhas: [{ tipo: motivo, entidade: 'item', entidadeId: 'TESTE-0001', detalhe: 'x', numero: 'CA00001' }] })
    expect(f.grupos[0]!.rotulo).toBe(nome)
    expect(f.grupos[0]!.apoio.length).toBeGreaterThan(10)
  })
})

describe('«Regiões a desenhar» (elementos do livro sem região)', () => {
  const el = (id: string, rotulo: string, rotuloDe = '', itemId = 'TESTE-0001', imagem: string | null = 'IMG-TESTE-0001-1'): ElementoSemRegiao => ({ id, rotulo, rotuloDe, itemId, imagem })
  const elementos = [el('EL-900002', 'leão de teste', 'Testlöwe'), el('EL-900003', 'asa', 'Testflügel', 'TESTE-0002', 'IMG-TESTE-0002-1')]
  const lugares = new Map<string, LugarDoCaso>([
    ['item|TESTE-0001', { itemId: 'TESTE-0001', numero: 'CA00001', grupoId: null, origem: 'TESTE I: 1' }],
    ['item|TESTE-0002', { itemId: 'TESTE-0002', numero: 'CA00002', grupoId: null, origem: 'TESTE I: 2' }],
  ])
  const regiao = (reg: string, elementoId: string | null, op: Evento['op'] = 'criar') =>
    e({ tipo: 'regiao', reg, op, campos: op === 'criar' ? { imagem: 'IMG-TESTE-0001-1', objeto: 'CA00001', seletor: '<polygon points="0,0 1,0 1,1"/>', elemento: 'x', elementoId, pai: null } : {} })
  const regioes = (f: ReturnType<typeof fila>) => f.grupos.find((g) => g.rotulo === 'Regiões a desenhar')

  it('conta no total, um caso por elemento, com a ação que abre o visualizador pronto para desenhar', () => {
    const f = fila([], { linhas: [], elementos, lugares })
    expect(f.total).toBe(2)
    expect(regioes(f)).toMatchObject({ quantidade: 2, soConsulta: false })
    expect(regioes(f)!.abertos[0]).toMatchObject({
      chave: chaveDoElementoSemRegiao('EL-900002'),
      numero: 'CA00001',
      o_que: 'leão de teste (Testlöwe)',
      onde: 'TESTE I: 1 · elemento',
      abrir: '/item/CA00001',
      acao: { rotulo: 'Desenhar a região', para: '/imagem/IMG-TESTE-0001-1?desenhar=EL-900002' },
      deixavel: true,
    })
  })

  it('uma região viva do usuário para o elemento o resolve; excluí-la o reabre; restaurá-la o resolve de novo', () => {
    const criada = regiao('RG-aaaaaaaa-1', 'EL-900002')
    const f = fila([criada], { linhas: [], elementos, lugares })
    expect(f.total).toBe(1)
    expect(regioes(f)!.abertos.map((c) => c.numero)).toEqual(['CA00002'])
    expect(f.resolvidosPelaPessoa).toBe(0) // resolvido pelo desenho, não por «deixar como está»
    expect(fila([criada, regiao('RG-aaaaaaaa-1', null, 'excluir')], { linhas: [], elementos, lugares }).total).toBe(2)
    expect(fila([criada, regiao('RG-aaaaaaaa-1', null, 'excluir'), regiao('RG-aaaaaaaa-1', null, 'restaurar')], { linhas: [], elementos, lugares }).total).toBe(1)
  })

  it('uma região que é outro elemento (nova, ou de outro EL-) não resolve este', () => {
    const f = fila([regiao('RG-aaaaaaaa-2', null), regiao('RG-aaaaaaaa-3', 'EL-900099')], { linhas: [], elementos, lugares })
    expect(f.total).toBe(2)
  })

  it('«Deixar como está» e «Desfazer» valem; o grupo todo resolvido continua listado, com 0', () => {
    const chave = chaveDoElementoSemRegiao('EL-900002')
    const f = fila([e({ tipo: 'revisao', reg: chave, op: 'criar' })], { linhas: [], elementos, lugares })
    expect(f.total).toBe(1)
    expect(regioes(f)!.resolvidos.map((c) => c.chave)).toEqual([chave])
    expect(fila([e({ tipo: 'revisao', reg: chave, op: 'criar' }), e({ tipo: 'revisao', reg: chave, op: 'excluir' })], { linhas: [], elementos, lugares }).total).toBe(2)
  })

  it('sem a imagem do item, a ação leva ao objeto; sem lugar (Menu e barra), o caso conta do mesmo jeito', () => {
    const sem = fila([], { linhas: [], elementos: [el('EL-900004', 'cauda', '', 'TESTE-0001', null)], lugares })
    expect(regioes(sem)!.abertos[0]!.acao).toEqual({ rotulo: 'Abrir o objeto', para: '/item/CA00001' })
    const semLugares = fila([], { linhas: [], elementos, lugares: null })
    expect(semLugares.total).toBe(2)
    expect(regioes(semLugares)!.abertos[0]!.numero).toBe('—')
  })

  it('os mesmos casos (objetos) em chamadas seguidas: a linha não se refaz', () => {
    const a = regioes(fila([], { linhas: [], elementos, lugares }))!.abertos[0]!
    const b = regioes(fila([e({ tipo: 'nota', reg: 'NT-aaaaaaaa-1', op: 'criar' })], { linhas: [], elementos, lugares }))!.abertos[0]!
    expect(b).toBe(a)
    expect(casosIguais(a, { ...a })).toBe(true)
    expect(casosIguais(a, { ...a, o_que: 'outro' })).toBe(false)
  })
})

describe('«Traduções não revisadas» (só consulta)', () => {
  const traducoes: TraducaoNaoRevisada[] = [
    { entidade: 'passage', entidadeId: 'PA-TESTE-0001-cat-1' },
    { entidade: 'catalog_field', entidadeId: 'TESTE-0001#5' },
    { entidade: 'passage', entidadeId: 'PA-TESTE-I.S.9-ovw-1' },
  ]
  const lugares = new Map<string, LugarDoCaso>([
    ['passage|PA-TESTE-0001-cat-1', { itemId: 'TESTE-0001', numero: 'CA00001', grupoId: null, origem: 'TESTE I: 1' }],
    ['catalog_field|TESTE-0001#5', { itemId: 'TESTE-0001', numero: 'CA00001', grupoId: null, origem: 'TESTE I: 1' }],
    ['passage|PA-TESTE-I.S.9-ovw-1', { itemId: null, numero: null, grupoId: 'GR-TESTE-I-01', origem: 'TESTE I · introdução' }],
  ])

  it('aparece com a sua contagem, mas não entra no total, e fica por último', () => {
    const f = fila([], { traducoes, lugares })
    const g = f.grupos.find((x) => x.rotulo === 'Traduções não revisadas')!
    expect(g).toMatchObject({ quantidade: 3, soConsulta: true, link: null })
    expect(f.total).toBe(5) // só a fila de sempre
    expect(f.grupos[f.grupos.length - 1]).toBe(g)
    expect(fila([], { traducoes: [] }).grupos.some((x) => x.rotulo === 'Traduções não revisadas')).toBe(false)
  })

  it('cada linha leva ao trecho (objeto ou grupo) e não se deixa como está', () => {
    const casos = fila([], { traducoes, lugares }).grupos.find((x) => x.soConsulta)!.abertos
    expect(casos.map((c) => [c.o_que, c.onde, c.acao, c.deixavel])).toEqual([
      ['Tradução do trecho', 'TESTE I: 1 · trecho', { rotulo: 'Abrir o trecho', para: '/item/CA00001' }, false],
      ['Tradução do campo 5 do catálogo', 'TESTE I: 1 · catálogo', { rotulo: 'Abrir o campo', para: '/item/CA00001' }, false],
      ['Tradução do trecho', 'TESTE I · introdução · trecho', { rotulo: 'Abrir o trecho', para: '/grupo/GR-TESTE-I-01' }, false],
    ])
  })

  it('T17-B-23: um trecho de seção da introdução, sem lugar, tem nome legível e não mostra o id cru', () => {
    const solta: TraducaoNaoRevisada[] = [
      { entidade: 'passage', entidadeId: 'PA-TESTE-I.S.19-ovw-1' },
      { entidade: 'passage', entidadeId: 'PA-TESTE-II.S.4-txt-3' },
      { entidade: 'passage', entidadeId: 'PA-TESTE-I.S.7-cap-2' },
      { entidade: 'passage', entidadeId: 'PA-OUTRO-FORMATO' },
    ]
    const casos = fila([], { traducoes: solta, lugares: new Map() }).grupos.find((x) => x.soConsulta)!.abertos
    expect(casos.map((c) => c.onde)).toEqual([
      'TESTE I · introdução, seção 19 · trecho',
      'TESTE II · introdução, seção 4 · trecho',
      'TESTE I · introdução, seção 7 · trecho',
      'PA-OUTRO-FORMATO · trecho',
    ])
  })

  it('marcas «revisao» antigas com a mesma chave não a movem: nada se deixa como está aqui', () => {
    const chave = fila([], { traducoes, lugares }).grupos.find((x) => x.soConsulta)!.abertos[0]!.chave
    const f = fila([e({ tipo: 'revisao', reg: chave, op: 'criar' })], { traducoes, lugares })
    expect(f.grupos.find((x) => x.soConsulta)!.resolvidos).toHaveLength(0)
  })
})

describe('T17-B-24: os casos feitos do pacote sobrevivem a duas telas que se alternam (a barra e a página)', () => {
  it('alternar duas listas de elementos/traduções diferentes não refaz os casos da primeira', () => {
    const el = (id: string): ElementoSemRegiao => ({ id, rotulo: id, rotuloDe: '', itemId: 'TESTE-0001', imagem: 'IMG-TESTE-0001-1' })
    const trad = (id: string): TraducaoNaoRevisada => ({ entidade: 'passage', entidadeId: id })
    const lugaresA = new Map<string, LugarDoCaso>()
    const lugaresB = new Map<string, LugarDoCaso>()
    const A = { elementos: [el('EL-900001')], traducoes: [trad('PA-TESTE-0001-cat-1')], lugares: lugaresA }
    const B = { elementos: [el('EL-900002')], traducoes: [trad('PA-TESTE-0002-cat-1')], lugares: lugaresB }
    const pegar = (f: ReturnType<typeof fila>) => ({ regiao: f.grupos.find((g) => g.rotulo === 'Regiões a desenhar')!.abertos[0]!, traducao: f.grupos.find((g) => g.soConsulta)!.abertos[0]! })
    const a1 = pegar(fila([], A))
    pegar(fila([], B))
    const a2 = pegar(fila([], A))
    expect(a2.regiao).toBe(a1.regiao)
    expect(a2.traducao).toBe(a1.traducao)
  })
})

describe('auxiliares', () => {
  it('o id do grupo é o rótulo sem acentos', () => {
    expect(idDoGrupo('Aparato do catálogo a conferir')).toBe('aparato-do-catalogo-a-conferir')
    expect(idDoGrupo('Traduções com termo alterado')).toBe('traducoes-com-termo-alterado')
  })
  it('o autor da citação é o primeiro nome com maiúscula, antes de qualquer número', () => {
    expect(autorDaCitacao('«Amostra/Fulano [ed.] 1999» x')).toBe('Amostra')
    expect(autorDaCitacao("O'Brien 1999")).toBe("O'Brien")
    expect(autorDaCitacao('1999: 9')).toBeNull()
    expect(autorDaCitacao('12: 5a; ver adiante')).toBeNull()
    expect(autorDaCitacao('vgl. Fantasma 1888: 3')).toBe('Fantasma')
  })
  it('o autor da citação vem depois do lugar («campo N», «aparato não dividido», «posição relatada de …»)', () => {
    expect(autorDaCitacao('campo 7: Fantasma/Outro 1888: 3')).toBe('Fantasma')
    expect(autorDaCitacao('aparato não dividido: Fantasma 1888: 3')).toBe('Fantasma')
    expect(autorDaCitacao('posição relatada de Beltrano, B.; Outro, C.: Fantasma 1888: 3')).toBe('Fantasma')
    expect(autorDaCitacao('campo 7: 1888: 3')).toBeNull()
  })
})
