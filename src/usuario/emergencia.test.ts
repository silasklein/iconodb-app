import { todosEventos } from './armazem'
import { estadoAtual, registrar } from './estado'
import { guardarEmergencia, guardarEmergenciaDeCampo, limparEmergencia, recuperarEmergencias, totalDeEmergencias } from './emergencia'
import { descarregarPendentes, esquecerPendentes, registrarPendente } from './pendentes'

const falha = vi.hoisted(() => ({ registrar: false }))
vi.mock('./estado', async (original) => {
  const m = await original<typeof import('./estado')>()
  return { ...m, registrar: ((...a: Parameters<typeof m.registrar>) => (falha.registrar ? Promise.reject(new Error('cortado')) : m.registrar(...a))) as typeof m.registrar }
})

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  esquecerPendentes()
  falha.registrar = false
  vi.useRealTimers()
})

const CAMPOS = { texto: 'texto salvo às pressas', alvoTipo: 'objeto', alvo: 'CA00001', rascunho: true }
const textoHlc = (reg: string) => estadoAtual().hlcDoCampo('nota', reg, 'texto')
const notasComTexto = (trecho: string) => [...(estadoAtual().registros.get('nota')?.values() ?? [])].filter((r) => String(r.campos.texto).includes(trecho))
/** Uma entrada que já passou da janela dos 5 s (a aba que a guardou não está mais ali). */
const velha = { salvoEm: Date.now() - 60_000, aba: 'outra-aba' }

describe('texto guardado de forma síncrona (a página pode ir embora antes do IndexedDB)', () => {
  it('guardar e limpar', () => {
    guardarEmergencia('a', { reg: 'NT-emer0000-1', base: null, campos: CAMPOS })
    expect(totalDeEmergencias()).toBe(1)
    limparEmergencia('a')
    expect(totalDeEmergencias()).toBe(0)
  })

  it('sem localStorage (bloqueado) guardar não lança', () => {
    const real = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('cheio')
    }
    try {
      expect(() => guardarEmergencia('a', { reg: null, base: null, campos: CAMPOS })).not.toThrow()
    } finally {
      Storage.prototype.setItem = real
    }
  })

  it('a entrada leva o instante e a aba que a guardaram', () => {
    guardarEmergencia('a', { reg: null, base: null, campos: CAMPOS })
    const dado = JSON.parse(localStorage.getItem('iconodb:emergencia:a')!)
    expect(dado.salvoEm).toBeCloseTo(Date.now(), -3)
    expect(dado.aba).toEqual(expect.any(String))
    guardarEmergencia('b', { reg: null, base: null, campos: CAMPOS })
    expect(JSON.parse(localStorage.getItem('iconodb:emergencia:b')!).aba).toBe(dado.aba)
  })

  it('recuperar: uma nota que nunca chegou ao IndexedDB é criada, com o id que tinha, como rascunho', async () => {
    guardarEmergencia('b', { reg: 'NT-emer0000-2', base: null, campos: CAMPOS })
    expect(await recuperarEmergencias()).toBe(1)
    expect(estadoAtual().registro('nota', 'NT-emer0000-2')?.campos).toMatchObject(CAMPOS)
    expect(totalDeEmergencias()).toBe(0)
  })

  it('o que não é um rascunho nosso (JSON ruim, forma errada) é ignorado e removido, sem derrubar o resto', async () => {
    localStorage.setItem('iconodb:emergencia:x', '{não é json')
    localStorage.setItem('iconodb:emergencia:y', JSON.stringify({ reg: 3, campos: 'x' }))
    localStorage.setItem('iconodb:emergencia:w', JSON.stringify({ reg: 'NT-emer0000-9', base: null, salvoEm: 1, aba: 'x', campos: { texto: 'sem lugar para criar' } }))
    guardarEmergencia('z', { reg: 'NT-emer0000-5', base: null, campos: CAMPOS })
    expect(await recuperarEmergencias()).toBe(1)
    expect(totalDeEmergencias()).toBe(0)
  })

  it('uma nota excluída não volta nem ganha texto', async () => {
    await registrar('nota', 'NT-emer0000-4', 'criar', { texto: 'excluída', alvoTipo: 'objeto', alvo: 'CA00001', rascunho: false })
    await registrar('nota', 'NT-emer0000-4', 'excluir')
    guardarEmergencia('e', { reg: 'NT-emer0000-4', base: textoHlc('NT-emer0000-4'), campos: { ...CAMPOS, texto: 'não deve voltar' } })
    await recuperarEmergencias()
    expect(estadoAtual().registro('nota', 'NT-emer0000-4')?.campos.texto).toBe('excluída')
    expect(notasComTexto('não deve voltar')).toHaveLength(0)
    expect(totalDeEmergencias()).toBe(0)
  })
})

describe('recuperar nunca passa por cima de um texto mais novo (regra do hlc)', () => {
  it('a nota continua como o texto de base: o texto guardado é aplicado como `alterar`', async () => {
    await registrar('nota', 'NT-emer0000-10', 'criar', { texto: 'v1', alvoTipo: 'objeto', alvo: 'CA00001', rascunho: false })
    guardarEmergencia('k', { reg: 'NT-emer0000-10', base: textoHlc('NT-emer0000-10'), campos: { texto: 'v1 e o que digitei depois' } })
    await recuperarEmergencias()
    expect(estadoAtual().registro('nota', 'NT-emer0000-10')?.campos.texto).toBe('v1 e o que digitei depois')
    expect(totalDeEmergencias()).toBe(0)
  })

  it('o texto da nota mudou depois (outra aba ou aparelho): a nota fica como está e o texto guardado vira OUTRA nota, no mesmo lugar, com a marca', async () => {
    await registrar('nota', 'NT-emer0000-11', 'criar', { texto: 'v1', alvoTipo: 'verbete', alvo: 'GL-900001', rascunho: false })
    const base = textoHlc('NT-emer0000-11')
    guardarEmergencia('k', { reg: 'NT-emer0000-11', base, campos: { texto: 'texto velho, escrito sobre v1' } })
    await registrar('nota', 'NT-emer0000-11', 'alterar', { texto: 'v2 MAIS NOVO de outro aparelho' })
    await recuperarEmergencias()
    expect(estadoAtual().registro('nota', 'NT-emer0000-11')?.campos.texto).toBe('v2 MAIS NOVO de outro aparelho')
    const [recuperada] = notasComTexto('texto velho, escrito sobre v1')
    expect(recuperada).toBeDefined()
    expect(recuperada!.id).not.toBe('NT-emer0000-11')
    expect(String(recuperada!.campos.texto)).toMatch(/^Texto recuperado de \d\d\/\d\d\/\d{4} \d\d:\d\d\n/)
    expect(recuperada!.campos).toMatchObject({ alvoTipo: 'verbete', alvo: 'GL-900001', rascunho: true })
    expect(totalDeEmergencias()).toBe(0)
  })

  it('a nota já está com o texto guardado (o IndexedDB chegou a gravar): nada a fazer, nada duplicado', async () => {
    await registrar('nota', 'NT-emer0000-12', 'criar', { texto: 'abc igual', alvoTipo: 'objeto', alvo: 'CA00001', rascunho: true })
    guardarEmergencia('k', { reg: 'NT-emer0000-12', base: null, campos: CAMPOS_COM('abc igual') })
    expect(await recuperarEmergencias()).toBe(0)
    expect(notasComTexto('abc igual')).toHaveLength(1)
    expect(totalDeEmergencias()).toBe(0)
  })

  it('uma nota nova cujo `criar` já existe é tratada como existente: base nula não casa, então o texto outro vira nota recuperada', async () => {
    await registrar('nota', 'NT-emer0000-13', 'criar', { texto: 'primeiro trecho', alvoTipo: 'objeto', alvo: 'CA00001', rascunho: true })
    guardarEmergencia('k', { reg: 'NT-emer0000-13', base: null, campos: CAMPOS_COM('primeiro trecho e o resto') })
    await recuperarEmergencias()
    expect(estadoAtual().registro('nota', 'NT-emer0000-13')?.campos.texto).toBe('primeiro trecho')
    expect(notasComTexto('primeiro trecho e o resto')).toHaveLength(1)
  })
})

function CAMPOS_COM(texto: string) {
  return { ...CAMPOS, texto }
}

describe('a aba que guardou ainda pode estar viva', () => {
  it('entrada de OUTRA aba com menos de 5 s: fica guardada, sem tocar em nada', async () => {
    localStorage.setItem('iconodb:emergencia:viva', JSON.stringify({ reg: 'NT-emer0000-20', base: null, salvoEm: Date.now() - 1000, aba: 'outra-aba', campos: CAMPOS }))
    expect(await recuperarEmergencias()).toBe(0)
    expect(totalDeEmergencias()).toBe(1)
    expect(estadoAtual().registro('nota', 'NT-emer0000-20')).toBeUndefined()
  })

  it('a mesma aba (recarregou: o sessionStorage é o mesmo) recupera na hora, mesmo com menos de 5 s', async () => {
    guardarEmergencia('minha', { reg: 'NT-emer0000-21', base: null, campos: CAMPOS })
    expect(await recuperarEmergencias()).toBe(1)
    expect(estadoAtual().registro('nota', 'NT-emer0000-21')).toBeDefined()
  })

  it('passados os 5 s, a entrada de outra aba é recuperada', async () => {
    localStorage.setItem('iconodb:emergencia:morta', JSON.stringify({ reg: 'NT-emer0000-22', base: null, ...velha, campos: CAMPOS }))
    expect(await recuperarEmergencias()).toBe(1)
    expect(estadoAtual().registro('nota', 'NT-emer0000-22')).toBeDefined()
  })
})

describe('o id novo é guardado ANTES de criar (uma queda no meio não gera uma segunda nota)', () => {
  it('sem id reservado: o id novo vai para a entrada antes do `registrar`; se a gravação falha, a nova tentativa usa o MESMO id', async () => {
    localStorage.setItem('iconodb:emergencia:sem-id', JSON.stringify({ reg: null, base: null, ...velha, campos: { ...CAMPOS, texto: 'texto sem id' } }))
    falha.registrar = true
    expect(await recuperarEmergencias()).toBe(0)
    const guardada = JSON.parse(localStorage.getItem('iconodb:emergencia:sem-id')!)
    expect(guardada.reg).toMatch(/^NT-/)
    falha.registrar = false
    expect(await recuperarEmergencias()).toBe(1)
    const criadas = notasComTexto('texto sem id')
    expect(criadas).toHaveLength(1)
    expect(criadas[0]!.id).toBe(guardada.reg)
  })

  it('a nota recuperada como cópia também guarda o id antes: repetir não cria duas cópias', async () => {
    await registrar('nota', 'NT-emer0000-30', 'criar', { texto: 'v1', alvoTipo: 'objeto', alvo: 'CA00001', rascunho: false })
    localStorage.setItem('iconodb:emergencia:copia', JSON.stringify({ reg: 'NT-emer0000-30', base: 'hlc-que-nao-bate', ...velha, campos: { ...CAMPOS, texto: 'texto da cópia' } }))
    falha.registrar = true
    await recuperarEmergencias()
    falha.registrar = false
    await recuperarEmergencias()
    await recuperarEmergencias()
    expect(notasComTexto('texto da cópia')).toHaveLength(1)
  })
})

describe('pendentes: a parte síncrona roda primeiro, no pagehide', () => {
  it('pagehide chama a síncrona antes de qualquer gravação assíncrona', async () => {
    const ordem: string[] = []
    registrarPendente(
      async () => {
        ordem.push('assíncrona')
      },
      () => ordem.push('síncrona'),
    )
    window.dispatchEvent(new Event('pagehide'))
    expect(ordem[0]).toBe('síncrona')
    await descarregarPendentes()
  })
})

describe('qualquer campo de texto: entrada de campo (`useCampoSalvo` guarda aqui no pagehide)', () => {
  const descricaoHlc = (reg: string) => estadoAtual().hlcDoCampo('colecao', reg, 'descricao')
  const guardarCampo = (reg: string, texto: string, base: string | null, chave = 'c') =>
    guardarEmergenciaDeCampo(chave, { tipo: 'colecao', reg, campo: 'descricao', texto, base })
  const descricaoDe = (reg: string) => estadoAtual().registro('colecao', reg)?.campos.descricao

  it('o campo continua como era na base: o texto guardado entra como `alterar` e a entrada some', async () => {
    await registrar('colecao', 'CO-emer0000-1', 'criar', { nome: 'x', descricao: 'antes' })
    guardarCampo('CO-emer0000-1', 'digitado na hora de recarregar', descricaoHlc('CO-emer0000-1'))
    expect(await recuperarEmergencias()).toBe(1)
    expect(descricaoDe('CO-emer0000-1')).toBe('digitado na hora de recarregar')
    expect(totalDeEmergencias()).toBe(0)
  })

  it('um campo que nunca teve valor (base nula) também recebe o texto guardado', async () => {
    await registrar('colecao', 'CO-emer0000-2', 'criar', { nome: 'x' })
    guardarCampo('CO-emer0000-2', 'primeira descrição', descricaoHlc('CO-emer0000-2'))
    await recuperarEmergencias()
    expect(descricaoDe('CO-emer0000-2')).toBe('primeira descrição')
  })

  it('RECUSADA se o hlc do campo mudou depois da base: o valor mais novo fica, a entrada é descartada', async () => {
    await registrar('colecao', 'CO-emer0000-3', 'criar', { nome: 'x', descricao: 'v1' })
    guardarCampo('CO-emer0000-3', 'texto velho, escrito sobre v1', descricaoHlc('CO-emer0000-3'))
    await registrar('colecao', 'CO-emer0000-3', 'alterar', { descricao: 'v2 mais novo, de outro aparelho' })
    expect(await recuperarEmergencias()).toBe(0)
    expect(descricaoDe('CO-emer0000-3')).toBe('v2 mais novo, de outro aparelho')
    expect(totalDeEmergencias()).toBe(0)
  })

  it('idempotente: recuperar de novo (a entrada reaparece, ou a abertura repete) não escreve outro evento', async () => {
    await registrar('colecao', 'CO-emer0000-4', 'criar', { nome: 'x', descricao: 'antes' })
    const base = descricaoHlc('CO-emer0000-4')
    guardarCampo('CO-emer0000-4', 'uma vez só', base)
    await recuperarEmergencias()
    const eventos = (await todosEventos()).filter((e) => e.reg === 'CO-emer0000-4').length
    guardarCampo('CO-emer0000-4', 'uma vez só', base) // a mesma entrada, de novo
    expect(await recuperarEmergencias()).toBe(0)
    expect((await todosEventos()).filter((e) => e.reg === 'CO-emer0000-4').length).toBe(eventos)
    expect(totalDeEmergencias()).toBe(0)
  })

  it('o registro não existe (ou foi excluído): nada é criado nem alterado; a entrada some', async () => {
    guardarCampo('CO-emer0000-5', 'sem dono', null)
    await registrar('colecao', 'CO-emer0000-6', 'criar', { nome: 'x', descricao: 'd' })
    guardarCampo('CO-emer0000-6', 'em coleção excluída', descricaoHlc('CO-emer0000-6'), 'c2')
    await registrar('colecao', 'CO-emer0000-6', 'excluir')
    expect(await recuperarEmergencias()).toBe(0)
    expect(estadoAtual().registro('colecao', 'CO-emer0000-5')).toBeUndefined()
    expect(descricaoDe('CO-emer0000-6')).toBe('d')
    expect(totalDeEmergencias()).toBe(0)
  })

  it('a regra dos 5 s vale para o campo: entrada de OUTRA aba, recente, fica onde está', async () => {
    await registrar('colecao', 'CO-emer0000-7', 'criar', { nome: 'x', descricao: 'd' })
    localStorage.setItem(
      'iconodb:emergencia:c',
      JSON.stringify({ tipo: 'colecao', reg: 'CO-emer0000-7', campo: 'descricao', texto: 'de outra aba', base: descricaoHlc('CO-emer0000-7'), salvoEm: Date.now(), aba: 'outra-aba' }),
    )
    expect(await recuperarEmergencias()).toBe(0)
    expect(totalDeEmergencias()).toBe(1)
    expect(descricaoDe('CO-emer0000-7')).toBe('d')
  })

  it('a entrada leva o instante e a aba, e o que está malformado é descartado sem derrubar o resto', async () => {
    guardarCampo('CO-emer0000-8', 'x', null)
    const dado = JSON.parse(localStorage.getItem('iconodb:emergencia:c')!)
    expect(dado).toMatchObject({ tipo: 'colecao', campo: 'descricao', texto: 'x', base: null })
    expect(dado.aba).toEqual(expect.any(String))
    localStorage.setItem('iconodb:emergencia:ruim', JSON.stringify({ tipo: 'tipo-que-nao-existe', reg: 'a', campo: 'b', texto: 'c', base: null, ...velha }))
    localStorage.setItem('iconodb:emergencia:ruim2', JSON.stringify({ tipo: 'colecao', reg: 'a', campo: 7, texto: 'c', base: null, ...velha }))
    await recuperarEmergencias()
    expect(totalDeEmergencias()).toBe(0)
  })

  it('a falha de gravação deixa a entrada para a próxima abertura', async () => {
    await registrar('colecao', 'CO-emer0000-9', 'criar', { nome: 'x', descricao: 'd' })
    guardarCampo('CO-emer0000-9', 'não pode perder', descricaoHlc('CO-emer0000-9'))
    falha.registrar = true
    await recuperarEmergencias()
    expect(totalDeEmergencias()).toBe(1)
    falha.registrar = false
    await recuperarEmergencias()
    expect(descricaoDe('CO-emer0000-9')).toBe('não pode perder')
    expect(totalDeEmergencias()).toBe(0)
  })
})

describe('A-6: a aba duplicada não fica com o id da aba de origem', () => {
  /** Carrega o módulo de novo (uma página nova), com o tipo de navegação dado e o sessionStorage como está. */
  async function pagina(tipo: 'navigate' | 'reload' | 'back_forward') {
    vi.resetModules()
    const real = performance.getEntriesByType.bind(performance)
    vi.spyOn(performance, 'getEntriesByType').mockImplementation((t: string) => (t === 'navigation' ? ([{ type: tipo }] as unknown as PerformanceEntryList) : real(t)))
    return import('./emergencia')
  }
  const abaDaEntrada = (chave: string) => JSON.parse(localStorage.getItem(`iconodb:emergencia:${chave}`)!).aba as string
  afterEach(() => vi.restoreAllMocks())

  it('recarregar (e voltar/avançar) mantém o id: é a mesma aba, e a recuperação na hora é dela', async () => {
    sessionStorage.setItem('iconodb:aba', 'aba-de-antes')
    for (const tipo of ['reload', 'back_forward'] as const) {
      const m = await pagina(tipo)
      m.guardarEmergencia(tipo, { reg: null, base: null, campos: CAMPOS })
      expect(abaDaEntrada(tipo)).toBe('aba-de-antes')
    }
  })

  it('uma navegação nova (a aba duplicada, ou aberta por outra, que herda o sessionStorage) ganha outro id', async () => {
    sessionStorage.setItem('iconodb:aba', 'aba-de-origem')
    const m = await pagina('navigate')
    m.guardarEmergencia('d', { reg: null, base: null, campos: CAMPOS })
    expect(abaDaEntrada('d')).not.toBe('aba-de-origem')
    expect(sessionStorage.getItem('iconodb:aba')).toBe(abaDaEntrada('d'))
    // E o id fica o mesmo durante a vida da página.
    m.guardarEmergencia('e', { reg: null, base: null, campos: CAMPOS })
    expect(abaDaEntrada('e')).toBe(abaDaEntrada('d'))
  })

  it('a entrada recente da aba de origem (viva) não é tomada pela duplicada', async () => {
    sessionStorage.setItem('iconodb:aba', 'aba-de-origem')
    localStorage.setItem('iconodb:emergencia:viva', JSON.stringify({ reg: 'NT-emer0000-60', base: null, salvoEm: Date.now(), aba: 'aba-de-origem', campos: { ...CAMPOS, texto: 'da aba viva' } }))
    const m = await pagina('navigate')
    expect(await m.recuperarEmergencias()).toBe(0)
    expect(localStorage.getItem('iconodb:emergencia:viva')).not.toBeNull()
  })

  it('duplicada que o navegador marca como back_forward: a aba de origem ainda viva responde pelo id, e a nova troca o seu', async () => {
    sessionStorage.setItem('iconodb:aba', 'aba-x')
    const origem = await pagina('reload')
    origem.guardarEmergencia('o', { reg: null, base: null, campos: CAMPOS })
    expect(abaDaEntrada('o')).toBe('aba-x')
    const duplicada = await pagina('back_forward')
    duplicada.guardarEmergencia('d1', { reg: null, base: null, campos: CAMPOS })
    // A pergunta vai pelo BroadcastChannel; a resposta da origem chega logo depois.
    await vi.waitFor(() => {
      duplicada.guardarEmergencia('d2', { reg: null, base: null, campos: CAMPOS })
      expect(abaDaEntrada('d2')).not.toBe('aba-x')
    })
    origem.guardarEmergencia('o2', { reg: null, base: null, campos: CAMPOS })
    expect(abaDaEntrada('o2')).toBe('aba-x')
    origem.pararDeVigiarAAba()
    duplicada.pararDeVigiarAAba()
  })

  // Revisão 1 da Tarefa 17a (I1): a recuperação da abertura decidia quem é "minha" antes de a resposta do canal chegar.
  it('duplicada back_forward: a recuperação da abertura espera a resposta do canal e não toma a entrada viva da origem', async () => {
    sessionStorage.setItem('iconodb:aba', 'aba-x')
    const origem = await pagina('reload')
    // A origem se esconde (a duplicada ganhou o foco) e guarda a entrada, agora.
    origem.guardarEmergencia('viva', { reg: 'NT-emer0000-77', base: null, campos: { ...CAMPOS, texto: 'texto da aba de origem, viva' } })
    const duplicada = await pagina('back_forward')
    // Sem tempo fixo: a promessa só termina quando a resposta "eu" da origem chega (ou a espera acaba).
    expect(await duplicada.recuperarEmergencias()).toBe(0)
    expect(localStorage.getItem('iconodb:emergencia:viva')).not.toBeNull()
    expect(notasComTexto('texto da aba de origem, viva')).toHaveLength(0)
    // A duplicada trocou de id; a origem continua com o seu.
    duplicada.guardarEmergencia('d', { reg: null, base: null, campos: CAMPOS })
    expect(abaDaEntrada('d')).not.toBe('aba-x')
    origem.guardarEmergencia('o', { reg: null, base: null, campos: CAMPOS })
    expect(abaDaEntrada('o')).toBe('aba-x')
    origem.pararDeVigiarAAba()
    duplicada.pararDeVigiarAAba()
  })

  it('recarregar de verdade (a página de antes morreu): a espera acaba sem resposta e a entrada recente é recuperada pela própria aba', async () => {
    sessionStorage.setItem('iconodb:aba', 'aba-y')
    const antes = await pagina('reload')
    antes.guardarEmergencia('minha', { reg: 'NT-emer0000-78', base: null, campos: { ...CAMPOS, texto: 'guardado ao recarregar' } })
    antes.pararDeVigiarAAba() // a página de antes foi embora: ninguém responde
    const depois = await pagina('reload')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let terminou = false
    const recuperacao = depois.recuperarEmergencias().then((n) => {
      terminou = true
      return n
    })
    // Antes do fim da espera, nada foi decidido (o negativo do teste).
    await vi.advanceTimersByTimeAsync(depois.ESPERA_DA_RESPOSTA_DA_ABA_MS - 1)
    expect(terminou).toBe(false)
    expect(localStorage.getItem('iconodb:emergencia:minha')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    vi.useRealTimers()
    expect(await recuperacao).toBe(1)
    expect(notasComTexto('guardado ao recarregar')).toHaveLength(1)
    expect(localStorage.getItem('iconodb:emergencia:minha')).toBeNull()
    // E o id continua o mesmo (é a mesma aba).
    depois.guardarEmergencia('m2', { reg: null, base: null, campos: CAMPOS })
    expect(abaDaEntrada('m2')).toBe('aba-y')
    depois.pararDeVigiarAAba()
  })

  it('duas abas de verdade (ids diferentes) nunca trocam de id: a pergunta de uma não muda a outra', async () => {
    sessionStorage.setItem('iconodb:aba', 'aba-um')
    const um = await pagina('reload')
    um.guardarEmergencia('u', { reg: null, base: null, campos: CAMPOS })
    sessionStorage.setItem('iconodb:aba', 'aba-dois')
    const dois = await pagina('reload')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const recuperacao = dois.recuperarEmergencias()
    await vi.advanceTimersByTimeAsync(dois.ESPERA_DA_RESPOSTA_DA_ABA_MS)
    vi.useRealTimers()
    // A entrada recente da outra aba (viva) fica; nenhuma das duas mudou de id.
    expect(await recuperacao).toBe(0)
    expect(localStorage.getItem('iconodb:emergencia:u')).not.toBeNull()
    dois.guardarEmergencia('d', { reg: null, base: null, campos: CAMPOS })
    expect(abaDaEntrada('d')).toBe('aba-dois')
    um.guardarEmergencia('u2', { reg: null, base: null, campos: CAMPOS })
    expect(abaDaEntrada('u2')).toBe('aba-um')
    um.pararDeVigiarAAba()
    dois.pararDeVigiarAAba()
  })

  describe('sem BroadcastChannel (navegador antigo)', () => {
    beforeEach(() => vi.stubGlobal('BroadcastChannel', undefined))
    afterEach(() => vi.unstubAllGlobals())

    it('recarregar ou voltar: não dá para saber se a aba de origem vive, então a entrada recente com o mesmo id fica (sem espera e sem perda)', async () => {
      for (const tipo of ['reload', 'back_forward'] as const) {
        sessionStorage.setItem('iconodb:aba', 'aba-z')
        const antes = await pagina('reload')
        antes.guardarEmergencia(tipo, { reg: null, base: null, campos: { ...CAMPOS, texto: `sem canal ${tipo}` } })
        const depois = await pagina(tipo)
        // Termina sem relógio a avançar: não há o que esperar.
        expect(await depois.recuperarEmergencias()).toBe(0)
        expect(localStorage.getItem(`iconodb:emergencia:${tipo}`)).not.toBeNull()
      }
    })

    it('a mesma entrada, passada a janela de 5 s, é recuperada (fica só para a próxima abertura)', async () => {
      sessionStorage.setItem('iconodb:aba', 'aba-z')
      localStorage.setItem('iconodb:emergencia:velha', JSON.stringify({ reg: 'NT-emer0000-79', base: null, salvoEm: Date.now() - 60_000, aba: 'aba-z', campos: { ...CAMPOS, texto: 'sem canal, velha' } }))
      const depois = await pagina('reload')
      expect(await depois.recuperarEmergencias()).toBe(1)
      expect(notasComTexto('sem canal, velha')).toHaveLength(1)
    })

    it('uma navegação nova (id novo, que ninguém tem) recupera o que é velho sem esperar', async () => {
      sessionStorage.setItem('iconodb:aba', 'aba-z')
      localStorage.setItem('iconodb:emergencia:velha2', JSON.stringify({ reg: 'NT-emer0000-80', base: null, salvoEm: Date.now() - 60_000, aba: 'aba-z', campos: { ...CAMPOS, texto: 'velha de outra' } }))
      const nova = await pagina('navigate')
      expect(await nova.recuperarEmergencias()).toBe(1)
    })
  })
})
