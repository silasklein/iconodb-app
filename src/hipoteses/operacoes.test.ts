import { todosEventos } from '../usuario/armazem'
import { estadoAtual, registrar } from '../usuario/estado'
import { chaveDaForma, lerVerbeteSkc } from '../glossario/modelo'
import { lerHipotese, lerPosicao, lerRegiao, termoNovo } from './modelo'
import {
  alterarHipotese,
  desfazerRegistro,
  alterarRegiao,
  escolherPosicao,
  excluirHipotese,
  excluirRegiao,
  registrarHipotese,
  restaurarHipotese,
  salvarRegiao,
  type NovaHipoteseParaGravar,
  type Reserva,
} from './operacoes'

const TRI: [number, number][] = [
  [0.1, 0.1],
  [0.5, 0.1],
  [0.5, 0.5],
]

const base = (mudar: Partial<NovaHipoteseParaGravar> = {}): NovaHipoteseParaGravar => ({
  objeto: 'CA00001',
  sobre: { tipo: 'objeto' },
  termos: [{ id: 'GL-900001', rotulo: 'leão-de-teste' }],
  nivel: 'iconographic',
  modalidade: 'probable',
  justificativa: ' como em [[CA00002]] ',
  ancora: null,
  ...mudar,
})

describe('registrarHipotese', () => {
  it('reserva o id (avisa antes de gravar), grava o criar com todos os campos e avisa depois', async () => {
    const ordem: string[] = []
    const r = await registrarHipotese(base(), {
      aoReservar: (res) => ordem.push(`reservado:${res.hipotese}:${estadoAtual().registro('hipotese', res.hipotese) ? 'existe' : 'novo'}`),
      aoCriar: (id) => ordem.push(`criado:${id}:${estadoAtual().registro('hipotese', id) ? 'existe' : 'novo'}`),
    })
    expect(r.hipotese).toMatch(/^HY-[a-z0-9]{8}-[1-9][0-9]*$/)
    expect(ordem).toEqual([`reservado:${r.hipotese}:novo`, `criado:${r.hipotese}:existe`])
    const h = lerHipotese(estadoAtual().registro('hipotese', r.hipotese)!)
    expect(h).toMatchObject({ objeto: 'CA00001', sobre: { tipo: 'objeto' }, nivel: 'iconographic', modalidade: 'probable', justificativa: 'como em [[CA00002]]' })
    expect(r.regiao).toBeNull()
  })

  it('com o id já reservado e o registro já gravado (salvar repetido ou interrompido): não cria outra', async () => {
    const r = await registrarHipotese(base({ objeto: 'CA00003' }))
    const antes = (await todosEventos()).filter((e) => e.tipo === 'hipotese').length
    const de_novo = await registrarHipotese(base({ objeto: 'CA00003' }), { reserva: { hipotese: r.hipotese, regiao: null } })
    expect(de_novo.hipotese).toBe(r.hipotese)
    expect((await todosEventos()).filter((e) => e.tipo === 'hipotese').length).toBe(antes)
  })

  it('com o id reservado mas sem registro (a página fechou antes de gravar): grava com ESSE id', async () => {
    const r = await registrarHipotese(base({ objeto: 'CA00004' }), { reserva: { hipotese: 'HY-zzzzzzzz-77', regiao: null } })
    expect(r.hipotese).toBe('HY-zzzzzzzz-77')
    expect(estadoAtual().registro('hipotese', 'HY-zzzzzzzz-77')).toBeDefined()
  })

  it('região nova: a região e a hipótese num só registro de eventos (tudo ou nada); a hipótese fala do elemento novo', async () => {
    const r = await registrarHipotese(
      base({ objeto: 'OB-aaaaaaaa-9', sobre: { tipo: 'nova', regiao: { imagem: 'IM-aaaaaaaa-2', pontos: TRI, nome: 'focinho', pai: 'EL-900001' } } }),
    )
    expect(r.regiao).toMatch(/^RG-/)
    const rg = lerRegiao(estadoAtual().registro('regiao', r.regiao!)!)
    expect(rg).toMatchObject({ imagem: 'IM-aaaaaaaa-2', objeto: 'OB-aaaaaaaa-9', elemento: 'focinho', elementoId: r.regiao, pai: 'EL-900001', seletor: '<polygon points="0.1,0.1 0.5,0.1 0.5,0.5"/>' })
    expect(lerHipotese(estadoAtual().registro('hipotese', r.hipotese)!).sobre).toEqual({ tipo: 'elemento', id: r.regiao, rotulo: 'focinho' })
    const eventos = (await todosEventos()).filter((e) => e.reg === r.regiao || e.reg === r.hipotese)
    // Mesmo seq (uma gravação), posições 0 e 1.
    expect(new Set(eventos.map((e) => e.id.split('-').slice(0, 2).join('-'))).size).toBe(1)
  })

  it('recusa sem objeto, sem nível/modalidade válidos e região nova sem polígono ou sem nome', async () => {
    await expect(registrarHipotese(base({ objeto: 'lixo' }))).rejects.toThrow()
    await expect(registrarHipotese(base({ nivel: 'x' as never }))).rejects.toThrow()
    await expect(registrarHipotese(base({ sobre: { tipo: 'nova', regiao: { imagem: 'IM-a', pontos: TRI.slice(0, 2), nome: 'x', pai: null } } }))).rejects.toThrow()
    await expect(registrarHipotese(base({ sobre: { tipo: 'nova', regiao: { imagem: 'IM-a', pontos: TRI, nome: '  ', pai: null } } }))).rejects.toThrow()
  })
})

describe('alterar, excluir e restaurar uma hipótese SKC', () => {
  it('cada mudança é um alterar só com o que mudou; termos sempre com os rótulos', async () => {
    const { hipotese: id } = await registrarHipotese(base())
    await alterarHipotese(id, { nivel: 'iconological' })
    await alterarHipotese(id, { termos: [{ id: 'GL-900002', rotulo: 'figura denteada' }] })
    await alterarHipotese(id, { sobre: { tipo: 'elemento', id: 'EL-900002', rotulo: 'leão-de-teste' } })
    const ev = (await todosEventos()).filter((e) => e.reg === id && e.op === 'alterar')
    expect(ev.map((e) => e.campos)).toEqual([
      { nivel: 'iconological' },
      { termos: ['GL-900002'], termosRotulos: ['figura denteada'] },
      { sobre: 'elemento', elemento: 'EL-900002', elementoRotulo: 'leão-de-teste' },
    ])
    await excluirHipotese(id)
    expect(estadoAtual().registro('hipotese', id)!.excluido).toBe(true)
    await restaurarHipotese(id)
    expect(estadoAtual().registro('hipotese', id)!.excluido).toBe(false)
  })
})

describe('regiões', () => {
  it('salvar uma região num elemento existente; editar os pontos; excluir', async () => {
    const id = await salvarRegiao({ imagem: 'IMG-TESTE-0001-1', objeto: 'CA00001', pontos: TRI, elemento: 'leão-de-teste', elementoId: 'EL-900002', pai: null })
    expect(lerRegiao(estadoAtual().registro('regiao', id)!)).toMatchObject({ elementoId: 'EL-900002', objeto: 'CA00001' })
    await alterarRegiao(id, [
      [0, 0],
      [1, 0],
      [1, 1],
    ])
    expect(lerRegiao(estadoAtual().registro('regiao', id)!).seletor).toBe('<polygon points="0,0 1,0 1,1"/>')
    await expect(alterarRegiao(id, TRI.slice(0, 2))).rejects.toThrow()
    await excluirRegiao(id)
    expect(estadoAtual().registro('regiao', id)!.excluido).toBe(true)
  })
})

describe('escolherPosicao: dois aparelhos (revisão 1, I1)', () => {
  it('o primeiro "criar" de cada aparelho não apaga a justificativa escrita no outro, em qualquer ordem', async () => {
    const { ev, A, B, T0 } = await import('../../tests/suporte/eventosDeTeste')
    const { fundir } = await import('../usuario/fusao')
    // A cria com "discordo" e escreve a justificativa; B, sem ter recebido nada, escolhe "em aberto" (o criar dele é
    // mais novo) e depois escreve outra justificativa num terceiro momento, ou não escreve.
    await escolherPosicao('HY-900077', 'discordo')
    const doApp = (await todosEventos()).find((e) => e.tipo === 'posicao' && e.reg === 'HY-900077' && e.op === 'criar')!
    const criarA = ev({ ap: A, seq: 1, ms: T0, tipo: 'posicao', reg: 'HY-900077', op: 'criar', campos: doApp.campos })
    const justA = ev({ ap: A, seq: 2, ms: T0 + 1000, tipo: 'posicao', reg: 'HY-900077', op: 'alterar', campos: { justificativa: 'a cauda não é de leão' } })
    const criarB = ev({ ap: B, seq: 1, ms: T0 + 5000, tipo: 'posicao', reg: 'HY-900077', op: 'criar', campos: { ...doApp.campos, posicao: 'aberto' } })
    const ordens = [
      [criarA, justA, criarB],
      [criarB, criarA, justA],
      [justA, criarB, criarA],
      [criarB, justA, criarA, criarB],
    ]
    for (const o of ordens) {
      const p = lerPosicao(fundir(o).registro('posicao', 'HY-900077')!)
      expect(p).toMatchObject({ posicao: 'aberto', justificativa: 'a cauda não é de leão' })
    }
    // Com uma justificativa também em B (mais nova), vale a de B, e a de A fica no histórico.
    const justB = ev({ ap: B, seq: 2, ms: T0 + 6000, tipo: 'posicao', reg: 'HY-900077', op: 'alterar', campos: { justificativa: 'talvez' } })
    for (const o of [
      [criarA, justA, criarB, justB],
      [justB, criarB, justA, criarA],
    ]) {
      const e = fundir(o)
      expect(lerPosicao(e.registro('posicao', 'HY-900077')!).justificativa).toBe('talvez')
      expect(e.historico('HY-900077', 'justificativa', 'posicao').map((h) => h.valor)).toEqual(['a cauda não é de leão'])
    }
  })
})

describe('revisão 3, M14: dois aparelhos na MESMA hipótese e na MESMA posição, em qualquer ordem', () => {
  /** Todas as ordens de uma lista (n! ordens). */
  function* ordens<T>(lista: readonly T[]): Generator<T[]> {
    if (lista.length <= 1) {
      yield [...lista]
      return
    }
    for (let i = 0; i < lista.length; i++) for (const resto of ordens([...lista.slice(0, i), ...lista.slice(i + 1)])) yield [lista[i]!, ...resto]
  }
  /** Os campos que o app grava (a função de verdade), para serem reenviados como eventos de outro aparelho. */
  const camposGravados = async (reg: string, depois: () => Promise<unknown>) => {
    const antes = new Set((await todosEventos()).map((e) => e.id))
    await depois()
    return (await todosEventos()).filter((e) => !antes.has(e.id) && e.reg === reg).map((e) => ({ op: e.op, campos: e.campos }))
  }

  it('hipótese SKC: as edições de A e de B entrelaçadas convergem campo a campo, com os pares (termos e rótulos; sobre, elemento e rótulo) inteiros', async () => {
    const { ev, A, B, T0 } = await import('../../tests/suporte/eventosDeTeste')
    const { fundir, estadoCanonico } = await import('../usuario/fusao')
    const { hipotese: id } = await registrarHipotese(base({ objeto: 'CA00006' }))
    const criar = (await todosEventos()).find((e) => e.reg === id && e.op === 'criar')!
    const [nivelA] = await camposGravados(id, () => alterarHipotese(id, { nivel: 'iconological' }))
    const [termosB] = await camposGravados(id, () => alterarHipotese(id, { termos: [{ id: 'GL-900002', rotulo: 'figura denteada' }] }))
    const [termosA] = await camposGravados(id, () => alterarHipotese(id, { termos: [{ id: 'GL-900001', rotulo: 'leão-de-teste' }, { id: 'GL-900009', rotulo: 'selo de teste' }] }))
    const [sobreB] = await camposGravados(id, () => alterarHipotese(id, { sobre: { tipo: 'elemento', id: 'EL-900002', rotulo: 'leão-de-teste' } }))
    const [sobreA] = await camposGravados(id, () => alterarHipotese(id, { sobre: { tipo: 'objeto' } }))
    const [modalidadeB] = await camposGravados(id, () => alterarHipotese(id, { modalidade: 'questioned' }))
    const eventos = [
      ev({ ap: A, seq: 1, ms: T0, tipo: 'hipotese', reg: id, op: 'criar', campos: criar.campos }),
      ev({ ap: A, seq: 2, ms: T0 + 1000, tipo: 'hipotese', reg: id, ...nivelA! }),
      ev({ ap: B, seq: 1, ms: T0 + 2000, tipo: 'hipotese', reg: id, ...termosB! }),
      ev({ ap: A, seq: 3, ms: T0 + 3000, tipo: 'hipotese', reg: id, ...termosA! }),
      ev({ ap: A, seq: 4, ms: T0 + 4000, tipo: 'hipotese', reg: id, ...sobreA! }),
      ev({ ap: B, seq: 2, ms: T0 + 5000, tipo: 'hipotese', reg: id, ...sobreB! }),
      ev({ ap: B, seq: 3, ms: T0 + 6000, tipo: 'hipotese', reg: id, ...modalidadeB! }),
    ]
    let canonico: string | null = null
    let n = 0
    for (const o of ordens(eventos)) {
      const e = fundir(o)
      const h = lerHipotese(e.registro('hipotese', id)!)
      expect(h).toMatchObject({ nivel: 'iconological', modalidade: 'questioned', sobre: { tipo: 'elemento', id: 'EL-900002', rotulo: 'leão-de-teste' } })
      // Os ids e os rótulos vêm do MESMO evento (o de A, o mais novo dos dois): nunca um rótulo de outro termo.
      expect(h.termos).toEqual([
        { id: 'GL-900001', rotulo: 'leão-de-teste' },
        { id: 'GL-900009', rotulo: 'selo de teste' },
      ])
      canonico ??= estadoCanonico(e)
      expect(estadoCanonico(e)).toBe(canonico)
      n++
    }
    expect(n).toBe(5040)
  })

  it('posição: as escolhas e as justificativas de A e de B entrelaçadas convergem; o criar de B não apaga a justificativa de A', async () => {
    const { ev, A, B, T0 } = await import('../../tests/suporte/eventosDeTeste')
    const { fundir, estadoCanonico } = await import('../usuario/fusao')
    const reg = 'HY-900078'
    const [criarA] = await camposGravados(reg, () => escolherPosicao(reg, 'discordo'))
    const [aberto] = await camposGravados(reg, () => escolherPosicao(reg, 'aberto'))
    const [concordo] = await camposGravados(reg, () => escolherPosicao(reg, 'concordo'))
    const eventos = [
      ev({ ap: A, seq: 1, ms: T0, tipo: 'posicao', reg, ...criarA! }),
      ev({ ap: A, seq: 2, ms: T0 + 1000, tipo: 'posicao', reg, op: 'alterar', campos: { justificativa: 'a cauda não é de leão' } }),
      // B ainda não recebeu nada: o primeiro toque dele é um criar (o mesmo formato do app).
      ev({ ap: B, seq: 1, ms: T0 + 2000, tipo: 'posicao', reg, ...criarA!, campos: { ...criarA!.campos, posicao: 'aberto' } }),
      ev({ ap: A, seq: 3, ms: T0 + 3000, tipo: 'posicao', reg, ...aberto! }),
      ev({ ap: B, seq: 2, ms: T0 + 4000, tipo: 'posicao', reg, ...concordo! }),
      // A reescreve a justificativa ANTES do criar de B (que não a traz: o criar de B nunca a apaga, revisão 1, I1).
      ev({ ap: A, seq: 4, ms: T0 + 1500, tipo: 'posicao', reg, op: 'alterar', campos: { justificativa: 'talvez a cauda seja' } }),
    ]
    let canonico: string | null = null
    for (const o of ordens(eventos)) {
      const e = fundir(o)
      expect(lerPosicao(e.registro('posicao', reg)!)).toMatchObject({ posicao: 'concordo', justificativa: 'talvez a cauda seja', excluido: false })
      canonico ??= estadoCanonico(e)
      expect(estadoCanonico(e)).toBe(canonico)
    }
  })
})

describe('escolherPosicao', () => {
  it('a primeira escolha cria (reg = id da hipótese do livro); as outras alteram; null tira a posição', async () => {
    await escolherPosicao('HY-900003', 'discordo')
    await escolherPosicao('HY-900003', 'aberto')
    await escolherPosicao('HY-900003', null)
    const ev = (await todosEventos()).filter((e) => e.tipo === 'posicao' && e.reg === 'HY-900003')
    expect(ev.map((e) => [e.op, e.campos])).toEqual([
      // Revisão 1 (I1): o criar não leva `justificativa`: num segundo aparelho, ele apagaria a do primeiro.
      ['criar', { hipotese: 'HY-900003', posicao: 'discordo' }],
      ['alterar', { posicao: 'aberto' }],
      ['alterar', { posicao: null }],
    ])
    expect(lerPosicao(estadoAtual().registro('posicao', 'HY-900003')!).posicao).toBeNull()
    await expect(escolherPosicao('HY-aaaaaaaa-1', 'concordo')).rejects.toThrow()
  })

  it('uma posição excluída (de outro aparelho) volta ao escolher de novo', async () => {
    await escolherPosicao('HY-900004', 'concordo')
    await registrar('posicao', 'HY-900004', 'excluir')
    await escolherPosicao('HY-900004', 'discordo')
    const p = estadoAtual().registro('posicao', 'HY-900004')!
    expect(p.excluido).toBe(false)
    expect(lerPosicao(p).posicao).toBe('discordo')
  })
})

describe('termos novos criados com a hipótese (decisão 41)', () => {
  const verbete = (id: string) => estadoAtual().registro('verbete', id)

  it('cria o verbete do usuário (GL-<aparelho>-<n>, forma, "a revisar") e a hipótese na MESMA gravação; a hipótese aponta para ele', async () => {
    const ordem: string[] = []
    const r = await registrarHipotese(base({ termos: [{ id: 'GL-900001', rotulo: 'leão-de-teste' }, termoNovo('  termo   novo-um ')] }), {
      aoReservar: (res) => ordem.push(`reservado:${JSON.stringify(res.termos)}:${res.termos && Object.values(res.termos).every((id) => !verbete(id)) ? 'novo' : 'existe'}`),
    })
    const id = r.termos![chaveDaForma('termo novo-um')]!
    expect(id).toMatch(/^GL-[a-z0-9]{8}-[1-9][0-9]*$/)
    expect(ordem).toEqual([`reservado:${JSON.stringify(r.termos)}:novo`])
    expect(lerVerbeteSkc(verbete(id)!)).toMatchObject({ forma: 'termo novo-um', status: 'proposed', excluido: false })
    expect(lerHipotese(estadoAtual().registro('hipotese', r.hipotese)!).termos).toEqual([
      { id: 'GL-900001', rotulo: 'leão-de-teste' },
      { id, rotulo: 'termo novo-um' },
    ])
    const eventos = (await todosEventos()).filter((e) => e.reg === id || e.reg === r.hipotese)
    expect(eventos.map((e) => [e.tipo, e.op])).toEqual([
      ['verbete', 'criar'],
      ['hipotese', 'criar'],
    ])
    expect(eventos[0]!.campos).toEqual({ forma: 'termo novo-um', status: 'proposed' })
    // uma gravação: o mesmo seq, posições 0 e 1
    expect(new Set(eventos.map((e) => e.id.split('-').slice(0, 2).join('-'))).size).toBe(1)
  })

  it('a chave já existe num verbete do usuário (sem caixa, sem acento): usa o existente, não cria outro', async () => {
    const r1 = await registrarHipotese(base({ termos: [termoNovo('Demônio-Dois')] }))
    const id = r1.termos![chaveDaForma('Demônio-Dois')]!
    const antes = (await todosEventos()).filter((e) => e.tipo === 'verbete').length
    const r2 = await registrarHipotese(base({ objeto: 'CA00002', termos: [termoNovo('demonio-dois')] }))
    expect(r2.termos).toEqual({})
    expect((await todosEventos()).filter((e) => e.tipo === 'verbete').length).toBe(antes)
    expect(lerHipotese(estadoAtual().registro('hipotese', r2.hipotese)!).termos).toEqual([{ id, rotulo: 'Demônio-Dois' }])
  })

  it('salvar de novo com a reserva (clique duplo, recarregar entre reservar e gravar): nem outro verbete nem outra hipótese', async () => {
    let reserva: Reserva | null = null
    const r = await registrarHipotese(base({ objeto: 'CA00003', termos: [termoNovo('termo-tres')] }), { aoReservar: (x) => (reserva = x) })
    const contar = async () => (await todosEventos()).filter((e) => e.tipo === 'verbete' || e.tipo === 'hipotese').length
    const antes = await contar()
    const de_novo = await registrarHipotese(base({ objeto: 'CA00003', termos: [termoNovo('termo-tres')] }), { reserva })
    expect(de_novo).toEqual(r)
    expect(await contar()).toBe(antes)
    // A página fechou depois de reservar e antes de gravar: grava com os MESMOS ids.
    const reservado: Reserva = { hipotese: 'HY-zzzzzzzz-91', regiao: null, termos: { [chaveDaForma('termo-quatro')]: 'GL-zzzzzzzz-91' } }
    const r4 = await registrarHipotese(base({ objeto: 'CA00004', termos: [termoNovo('termo-quatro')] }), { reserva: reservado })
    expect(r4).toEqual(reservado)
    expect(lerVerbeteSkc(verbete('GL-zzzzzzzz-91')!).forma).toBe('termo-quatro')
    expect(lerHipotese(estadoAtual().registro('hipotese', 'HY-zzzzzzzz-91')!).termos.map((t) => t.id)).toEqual(['GL-zzzzzzzz-91'])
  })

  it('recusa um termo novo sem forma', async () => {
    await expect(registrarHipotese(base({ termos: [{ id: 'novo:', rotulo: '  ', novo: true }] }))).rejects.toThrow()
  })

  it('Desfazer exclui a hipótese e o verbete criado só para ela; um verbete que outra hipótese já usa fica', async () => {
    const r = await registrarHipotese(base({ termos: [termoNovo('termo-cinco')] }))
    const id = r.termos![chaveDaForma('termo-cinco')]!
    await desfazerRegistro(r)
    expect(estadoAtual().registro('hipotese', r.hipotese)!.excluido).toBe(true)
    expect(verbete(id)!.excluido).toBe(true)

    const r2 = await registrarHipotese(base({ termos: [termoNovo('termo-seis')] }))
    const id2 = r2.termos![chaveDaForma('termo-seis')]!
    // outra hipótese passou a usar o termo antes do Desfazer
    const outra = await registrarHipotese(base({ objeto: 'CA00002', termos: [{ id: id2, rotulo: 'termo-seis' }] }))
    await desfazerRegistro(r2)
    expect(estadoAtual().registro('hipotese', r2.hipotese)!.excluido).toBe(true)
    expect(verbete(id2)!.excluido).toBe(false)
    expect(estadoAtual().registro('hipotese', outra.hipotese)!.excluido).toBe(false)

    // uma nota que já liga ao termo também o segura
    const r3 = await registrarHipotese(base({ termos: [termoNovo('termo-sete')] }))
    const id3 = r3.termos![chaveDaForma('termo-sete')]!
    await registrar('nota', 'NT-zzzzzzzz-1', 'criar', { texto: `ver [[${id3}|termo-sete]]`, alvoTipo: 'objeto', alvo: 'CA00001' })
    await desfazerRegistro(r3)
    expect(verbete(id3)!.excluido).toBe(false)
  })

  it('revisão 3, Minor 1: uma reserva velha (o salvar falhou antes de gravar) não duplica um verbete criado depois com a mesma chave', async () => {
    // A reservou GL-zzzzzzzz-301 para "cervo-r3" e o salvar falhou; em outro objeto, "cervo-r3" virou um verbete; A tenta de novo.
    const velha: Reserva = { hipotese: 'HY-zzzzzzzz-301', regiao: null, termos: { [chaveDaForma('cervo-r3')]: 'GL-zzzzzzzz-301' } }
    const b = await registrarHipotese(base({ objeto: 'CA00002', termos: [termoNovo('cervo-r3')] }))
    const existente = b.termos![chaveDaForma('cervo-r3')]!
    const a = await registrarHipotese(base({ objeto: 'CA00003', termos: [termoNovo('Cervo-R3')] }), { reserva: velha })
    expect(verbete('GL-zzzzzzzz-301')).toBeUndefined()
    expect(lerHipotese(estadoAtual().registro('hipotese', a.hipotese)!).termos.map((t) => t.id)).toEqual([existente])
    // O verbete que já existia não é "deste registro": o Desfazer de A não o exclui.
    expect(a.termos).toEqual({})
    // Uma reserva cujo verbete JÁ foi gravado (o mesmo registro, retomado) continua valendo.
    const gravada: Reserva = { hipotese: 'HY-zzzzzzzz-302', regiao: null, termos: { [chaveDaForma('cervo-r3')]: existente } }
    const c = await registrarHipotese(base({ objeto: 'CA00004', termos: [termoNovo('cervo-r3')] }), { reserva: gravada })
    expect(c.termos).toEqual({ [chaveDaForma('cervo-r3')]: existente })
  })

  it('revisão 3, Minor 2: a chave da forma ignora ʿ ʾ e apóstrofos, como o filtro do campo: "Baal" acha "Baʿal"', async () => {
    const r = await registrarHipotese(base({ termos: [termoNovo('Baʿal-r3')] }))
    const id = r.termos![chaveDaForma('Baʿal-r3')]!
    const r2 = await registrarHipotese(base({ objeto: 'CA00002', termos: [termoNovo('baal-r3')] }))
    expect(r2.termos).toEqual({})
    expect(lerHipotese(estadoAtual().registro('hipotese', r2.hipotese)!).termos.map((t) => t.id)).toEqual([id])
  })

  it('revisão 3, Minor 3: restaurar a hipótese depois do Desfazer restaura também o verbete novo dela, na mesma gravação', async () => {
    const r = await registrarHipotese(base({ termos: [{ id: 'GL-900001', rotulo: 'leão-de-teste' }, termoNovo('termo-r3-restaurar')] }))
    const id = r.termos![chaveDaForma('termo-r3-restaurar')]!
    await desfazerRegistro(r)
    expect(verbete(id)!.excluido).toBe(true)
    await restaurarHipotese(r.hipotese)
    expect(estadoAtual().registro('hipotese', r.hipotese)!.excluido).toBe(false)
    expect(verbete(id)!.excluido).toBe(false)
    const eventos = (await todosEventos()).filter((e) => e.op === 'restaurar' && (e.reg === id || e.reg === r.hipotese))
    expect(eventos.map((e) => e.tipo)).toEqual(['verbete', 'hipotese'])
    expect(new Set(eventos.map((e) => e.id.split('-').slice(0, 2).join('-'))).size).toBe(1)
  })

  it('revisão 4, m5: restaurar depois do Desfazer traz de volta a região que o MESMO Desfazer excluiu; uma excluída à parte fica', async () => {
    const r = await registrarHipotese(base({ objeto: 'CA00005', sobre: { tipo: 'nova', regiao: { imagem: 'IM-aaaaaaaa-5', pontos: TRI, nome: 'focinho-r4', pai: null } } }))
    await desfazerRegistro(r)
    expect(estadoAtual().registro('regiao', r.regiao!)!.excluido).toBe(true)
    await restaurarHipotese(r.hipotese)
    expect(estadoAtual().registro('hipotese', r.hipotese)!.excluido).toBe(false)
    expect(estadoAtual().registro('regiao', r.regiao!)!.excluido).toBe(false)
    // A região excluída de propósito no visualizador (outra gravação) continua excluída ao restaurar a hipótese.
    await excluirRegiao(r.regiao!)
    await excluirHipotese(r.hipotese)
    await restaurarHipotese(r.hipotese)
    expect(estadoAtual().registro('hipotese', r.hipotese)!.excluido).toBe(false)
    expect(estadoAtual().registro('regiao', r.regiao!)!.excluido).toBe(true)
  })

  it('editar os termos de uma hipótese com um termo novo: o verbete e o alterar na mesma gravação', async () => {
    const { hipotese } = await registrarHipotese(base())
    await alterarHipotese(hipotese, { termos: [{ id: 'GL-900001', rotulo: 'leão-de-teste' }, termoNovo('termo-oito')] })
    const h = lerHipotese(estadoAtual().registro('hipotese', hipotese)!)
    const id = h.termos[1]!.id
    expect(id).toMatch(/^GL-[a-z0-9]{8}-[1-9][0-9]*$/)
    expect(lerVerbeteSkc(verbete(id)!).forma).toBe('termo-oito')
    const todos = await todosEventos()
    const criarDoVerbete = todos.find((e) => e.reg === id)!
    const alterar = todos.filter((e) => e.reg === hipotese && e.op === 'alterar').at(-1)!
    expect(alterar.campos).toEqual({ termos: ['GL-900001', id], termosRotulos: ['leão-de-teste', 'termo-oito'] })
    expect(criarDoVerbete.id.split('-').slice(0, 2)).toEqual(alterar.id.split('-').slice(0, 2))
  })
})
