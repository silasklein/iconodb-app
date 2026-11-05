/**
 * Tarefa 11, a camada de dados: as formas em uso e o estado dos verbetes (do pacote e do usuário) lidos do estado
 * fundido, as operações de editar, voltar à proposta, aprovar e excluir, e o aviso de "possível duplicado".
 */
import { ev, A, B, T0 } from '../../tests/suporte/eventosDeTeste'
import { estadoAtual } from '../usuario/estado'
import { fundir } from '../usuario/fusao'
import { aprovarVerbete, editarForma, excluirVerbete, reabrirVerbete, restaurarVerbete, voltarAProposta } from './operacoes'
import { duplicadosNoGlossario, edicoesDosVerbetes, formasEmUso, verbetesSkc } from './doUsuario'
import { lerEdicaoDoVerbete, lerVerbeteSkc, situacaoDoVerbete, type EdicaoDoVerbete } from './modelo'

const criar = (ap: string, seq: number, reg: string, forma: string, extra: Record<string, unknown> = {}) =>
  ev({ ap, seq, tipo: 'verbete', reg, op: 'criar', campos: { forma, status: 'proposed', ...extra } as never })
const alterar = (ap: string, seq: number, reg: string, campos: Record<string, unknown>, ms?: number) =>
  ev({ ap, seq, ms, tipo: 'verbete', reg, op: 'alterar', campos: campos as never })

describe('lerEdicaoDoVerbete: o que a Tarefa 11 escreve num verbete (do pacote ou do usuário)', () => {
  it('formaEmUso e status; vazio, não-texto ou fora da lista não valem', () => {
    const est = fundir([alterar(A, 1, 'GL-900001', { formaEmUso: 'leão de teste', status: 'approved', formaAprovada: 'leão de teste' })])
    expect(lerEdicaoDoVerbete(est.registro('verbete', 'GL-900001')!)).toEqual({ formaEmUso: 'leão de teste', status: 'approved', formaAprovada: 'leão de teste' })
    const vazio = fundir([alterar(A, 1, 'GL-900001', { formaEmUso: '   ', status: 'xyz', formaAprovada: '' })])
    expect(lerEdicaoDoVerbete(vazio.registro('verbete', 'GL-900001')!)).toEqual({ formaEmUso: null, status: null, formaAprovada: null })
    const nulo = fundir([alterar(A, 1, 'GL-900001', { formaEmUso: 'x' }), alterar(A, 2, 'GL-900001', { formaEmUso: null })])
    expect(lerEdicaoDoVerbete(nulo.registro('verbete', 'GL-900001')!).formaEmUso).toBeNull()
    const numero = fundir([alterar(A, 1, 'GL-900001', { formaEmUso: 5 })])
    expect(lerEdicaoDoVerbete(numero.registro('verbete', 'GL-900001')!).formaEmUso).toBeNull()
  })
})

describe('formasEmUso e edicoesDosVerbetes: o glossário fundido, para as telas', () => {
  const est = fundir([
    alterar(A, 1, 'GL-900001', { formaEmUso: 'leão de teste' }),
    alterar(A, 2, 'GL-900002', { status: 'approved', formaAprovada: null }),
    criar(A, 3, 'GL-aaaaaaaa-1', 'termo novo'),
    criar(A, 4, 'GL-aaaaaaaa-2', 'outro termo'),
    alterar(A, 5, 'GL-aaaaaaaa-2', { formaEmUso: 'outro termo revisto', status: 'approved', formaAprovada: 'outro termo revisto' }),
    criar(A, 6, 'GL-aaaaaaaa-3', 'termo apagado'),
    ev({ ap: A, seq: 7, tipo: 'verbete', reg: 'GL-aaaaaaaa-3', op: 'excluir' }),
    alterar(A, 8, 'GL-900003', { formaEmUso: null }),
  ])

  it('um verbete do pacote só entra com forma em uso; um do usuário entra sempre (a em uso ou a criada)', () => {
    const f = formasEmUso(est)
    expect(f.get('GL-900001')).toBe('leão de teste')
    expect(f.has('GL-900002')).toBe(false) // só o estado mudou
    expect(f.has('GL-900003')).toBe(false) // voltou à proposta
    expect(f.get('GL-aaaaaaaa-1')).toBe('termo novo')
    expect(f.get('GL-aaaaaaaa-2')).toBe('outro termo revisto')
    // excluído: o verbete existe, as hipóteses que o citam seguem com o nome dele
    expect(f.get('GL-aaaaaaaa-3')).toBe('termo apagado')
  })

  it('as edições dos verbetes do PACOTE (o que a pessoa escreveu); os do usuário já vêm lidos de `lerVerbeteSkc`', () => {
    const e = edicoesDosVerbetes(est)
    expect([...e.keys()].sort()).toEqual(['GL-900001', 'GL-900002', 'GL-900003'])
    expect(e.get('GL-900002')).toEqual({ formaEmUso: null, status: 'approved', formaAprovada: null })
    expect(lerVerbeteSkc(est.registro('verbete', 'GL-aaaaaaaa-2')!)).toMatchObject({ status: 'approved', aprovacaoDesatualizada: false })
  })
})

describe('situacaoDoVerbete: aprovado só se a forma aprovada é a forma de agora (revisão 2, I-A)', () => {
  const ed = (x: Partial<EdicaoDoVerbete>): EdicaoDoVerbete => ({ formaEmUso: null, status: null, formaAprovada: null, ...x })
  const sit = (e: EdicaoDoVerbete | null, original = 'orig', statusDoPacote: 'proposed' | 'approved' = 'proposed') => situacaoDoVerbete(e, original, statusDoPacote)

  it('sem edição vale o estado do pacote', () => {
    expect(sit(null, 'orig', 'approved')).toEqual({ status: 'approved', aprovacaoDesatualizada: false })
    expect(sit(null, 'orig', 'proposed')).toEqual({ status: 'proposed', aprovacaoDesatualizada: false })
  })

  it('o pacote aprova a forma original (o pt): mudar a forma tira a aprovação, e voltar à original a devolve', () => {
    expect(sit(ed({ formaEmUso: 'outra' }), 'orig', 'approved')).toEqual({ status: 'proposed', aprovacaoDesatualizada: true })
    expect(sit(ed({ formaEmUso: null }), 'orig', 'approved').status).toBe('approved')
    expect(sit(ed({ formaEmUso: 'orig' }), 'orig', 'approved').status).toBe('approved')
  })

  it('a aprovação do usuário grava a forma que ele viu (null = a original)', () => {
    expect(sit(ed({ status: 'approved', formaAprovada: null }), 'orig').status).toBe('approved')
    expect(sit(ed({ status: 'approved', formaAprovada: 'F', formaEmUso: 'F' }), 'orig').status).toBe('approved')
    // outra forma de agora: "a revisar", e a aprovação está desatualizada
    expect(sit(ed({ status: 'approved', formaAprovada: 'F', formaEmUso: 'G' }), 'orig')).toEqual({ status: 'proposed', aprovacaoDesatualizada: true })
    expect(sit(ed({ status: 'approved', formaAprovada: null, formaEmUso: 'G' }), 'orig').status).toBe('proposed')
    // aprovou a original e a forma voltou à original por outro caminho
    expect(sit(ed({ status: 'approved', formaAprovada: null, formaEmUso: 'orig' }), 'orig').status).toBe('approved')
  })

  it('uma aprovação sem a forma (escrita antes desta regra) vale para a original', () => {
    expect(sit(ed({ status: 'approved', formaEmUso: 'G' }), 'orig').status).toBe('proposed')
    expect(sit(ed({ status: 'approved' }), 'orig').status).toBe('approved')
  })

  it('"a revisar" gravado nunca é aprovado, e não há aviso (ninguém aprovou)', () => {
    expect(sit(ed({ status: 'proposed', formaAprovada: 'F', formaEmUso: 'F' }), 'orig', 'approved')).toEqual({ status: 'proposed', aprovacaoDesatualizada: false })
  })

  it('a comparação é a da forma normalizada (espaços, NFC)', () => {
    expect(sit(ed({ status: 'approved', formaAprovada: 'a  b', formaEmUso: 'a b' }), 'orig').status).toBe('approved')
  })
})

describe('duplicadosNoGlossario: dois aparelhos criaram o "mesmo" termo sem internet', () => {
  it('agrupa pela chave da forma de agora (sem caixa, sem acento, sem espaço a mais); renomear tira do grupo; excluído não conta', () => {
    const est = fundir([
      criar(A, 1, 'GL-aaaaaaaa-1', 'leão-de-teste'),
      criar(B, 1, 'GL-bbbbbbbb-1', 'Leao-De-Teste'),
      criar(B, 2, 'GL-bbbbbbbb-2', 'leão'),
      criar(A, 2, 'GL-aaaaaaaa-2', 'outra coisa'),
      alterar(A, 3, 'GL-aaaaaaaa-2', { formaEmUso: 'leão' }),
      criar(A, 4, 'GL-aaaaaaaa-3', 'LEÃO'),
      ev({ ap: A, seq: 5, tipo: 'verbete', reg: 'GL-aaaaaaaa-3', op: 'excluir' }),
      criar(A, 6, 'GL-aaaaaaaa-4', 'sozinho'),
      // criado igual a "leão", mas renomeado depois: a forma criada não conta
      criar(B, 3, 'GL-bbbbbbbb-3', 'leão'),
      alterar(B, 4, 'GL-bbbbbbbb-3', { formaEmUso: 'outro nome' }),
    ])
    const d = duplicadosNoGlossario(verbetesSkc(est), [])
    expect([...d.keys()].sort()).toEqual(['GL-aaaaaaaa-1', 'GL-aaaaaaaa-2', 'GL-bbbbbbbb-1', 'GL-bbbbbbbb-2'])
    expect(d.get('GL-aaaaaaaa-1')!.map((v) => v.id)).toEqual(['GL-bbbbbbbb-1'])
    expect(d.get('GL-aaaaaaaa-1')![0]).toEqual({ id: 'GL-bbbbbbbb-1', nome: 'Leao-De-Teste', doUsuario: true })
    expect(d.get('GL-bbbbbbbb-1')!.map((v) => v.id)).toEqual(['GL-aaaaaaaa-1'])
    // "leão" em uso num e criada no outro
    expect(d.get('GL-aaaaaaaa-2')!.map((v) => v.id)).toEqual(['GL-bbbbbbbb-2'])
    expect(d.has('GL-aaaaaaaa-4')).toBe(false)
    expect(d.has('GL-bbbbbbbb-3')).toBe(false)
  })
})

describe('as operações: um campo por evento, no IndexedDB primeiro', () => {
  const T = T0
  void T

  it('editar a forma de um verbete do pacote: o primeiro alterar cria o registro, sem `criar` e sem `forma`', async () => {
    await editarForma('GL-910001', '  leão   de   teste ', 'leão-de-teste')
    const r = estadoAtual().registro('verbete', 'GL-910001')!
    expect(r.campos).toEqual({ formaEmUso: 'leão de teste' })
    expect(r.excluido).toBe(false)
  })

  it('a forma igual à original grava null (a mesma coisa que voltar à proposta); vazia não grava', async () => {
    await editarForma('GL-910002', 'outra', 'original')
    await editarForma('GL-910002', 'original', 'original')
    expect(estadoAtual().registro('verbete', 'GL-910002')!.campos.formaEmUso).toBeNull()
    await expect(editarForma('GL-910002', '   ', 'original')).rejects.toThrow()
    expect(estadoAtual().registro('verbete', 'GL-910002')!.campos.formaEmUso).toBeNull()
  })

  it('voltar à proposta grava null; aprovar e reabrir gravam só o estado', async () => {
    await editarForma('GL-910003', 'mudada', 'original')
    await voltarAProposta('GL-910003')
    expect(estadoAtual().registro('verbete', 'GL-910003')!.campos).toEqual({ formaEmUso: null })
    await aprovarVerbete('GL-910003', null)
    // a aprovação é UM evento só, com a forma que a pessoa viu
    expect(estadoAtual().registro('verbete', 'GL-910003')!.campos).toEqual({ formaEmUso: null, status: 'approved', formaAprovada: null })
    await aprovarVerbete('GL-910003', 'forma vista')
    expect(estadoAtual().registro('verbete', 'GL-910003')!.campos).toMatchObject({ status: 'approved', formaAprovada: 'forma vista' })
    const ultimo = (await (await import('../usuario/armazem')).todosEventos()).filter((e) => e.reg === 'GL-910003').at(-1)!
    expect(ultimo.campos).toEqual({ status: 'approved', formaAprovada: 'forma vista' })
    await reabrirVerbete('GL-910003')
    expect(estadoAtual().registro('verbete', 'GL-910003')!.campos.status).toBe('proposed')
    // a forma anterior fica no histórico do campo
    expect(estadoAtual().historico('GL-910003', 'formaEmUso', 'verbete').map((h) => h.valor)).toEqual(['mudada'])
  })

  it('excluir e restaurar só valem para verbete do usuário (um do pacote nunca se exclui)', async () => {
    await expect(excluirVerbete('GL-910004')).rejects.toThrow()
    await expect(restaurarVerbete('GL-910004')).rejects.toThrow()
    expect(estadoAtual().registro('verbete', 'GL-910004')).toBeUndefined()
    const { registrar } = await import('../usuario/estado')
    await registrar('verbete', 'GL-aaaaaaaa-77', 'criar', { forma: 'x', status: 'proposed' })
    await excluirVerbete('GL-aaaaaaaa-77')
    expect(estadoAtual().registro('verbete', 'GL-aaaaaaaa-77')!.excluido).toBe(true)
    await restaurarVerbete('GL-aaaaaaaa-77')
    expect(estadoAtual().registro('verbete', 'GL-aaaaaaaa-77')!.excluido).toBe(false)
  })
})

describe('duplicadosNoGlossario: também entre um verbete do usuário e os do livro (a mesma dobra: chaveDaForma)', () => {
  const est = fundir([criar(A, 1, 'GL-aaaaaaaa-1', 'Leão de Teste'), criar(A, 2, 'GL-aaaaaaaa-2', 'sozinho'), criar(A, 3, 'GL-aaaaaaaa-3', 'solto')])
  const livros = [
    { id: 'GL-900001', nome: 'leao de teste' },
    { id: 'GL-900002', nome: 'figura denteada' },
    { id: 'GL-900003', nome: 'solto' },
    { id: 'GL-900004', nome: 'Solto' }, // dois do livro entre si, sem nenhum do usuário: não é da conta do usuário
  ]
  it('o do usuário e o do livro se apontam; dois do livro entre si, sem o do usuário, não entram', () => {
    const d = duplicadosNoGlossario(verbetesSkc(est), livros.slice(0, 2))
    expect(d.get('GL-aaaaaaaa-1')).toEqual([{ id: 'GL-900001', nome: 'leao de teste', doUsuario: false }])
    expect(d.get('GL-900001')).toEqual([{ id: 'GL-aaaaaaaa-1', nome: 'Leão de Teste', doUsuario: true }])
    expect(d.has('GL-900002')).toBe(false)
    expect(d.has('GL-aaaaaaaa-2')).toBe(false)
    const todos = duplicadosNoGlossario(verbetesSkc(est), livros)
    expect([...todos.keys()].sort()).toEqual(['GL-900001', 'GL-900003', 'GL-900004', 'GL-aaaaaaaa-1', 'GL-aaaaaaaa-3'])
    expect(todos.get('GL-aaaaaaaa-3')!.map((x) => x.id)).toEqual(['GL-900003', 'GL-900004'])
  })
})

describe('a recuperação do que estava sendo digitado passa pela mesma derivação (revisão 2, I-A, cenário 3)', () => {
  it('aprovada a forma F, digitada a G e a aba fechada antes de gravar: a recuperação escreve G e o verbete NÃO fica aprovado', async () => {
    const { guardarEmergenciaDeCampo, recuperarEmergencias } = await import('../usuario/emergencia')
    const { registrar } = await import('../usuario/estado')
    await registrar('verbete', 'GL-aaaaaaaa-90', 'criar', { forma: 'termo F', status: 'proposed' })
    await registrar('verbete', 'GL-aaaaaaaa-90', 'alterar', { status: 'approved', formaAprovada: null })
    expect(lerVerbeteSkc(estadoAtual().registro('verbete', 'GL-aaaaaaaa-90')!).status).toBe('approved')
    guardarEmergenciaDeCampo('chave-i-a', { tipo: 'verbete', reg: 'GL-aaaaaaaa-90', campo: 'formaEmUso', texto: 'termo G', base: null, valor: 'termo G' })
    const guardada = JSON.parse(localStorage.getItem('iconodb:emergencia:chave-i-a')!)
    localStorage.setItem('iconodb:emergencia:chave-i-a', JSON.stringify({ ...guardada, salvoEm: Date.now() - 60_000, aba: 'outra' }))
    expect(await recuperarEmergencias()).toBe(1)
    const v = lerVerbeteSkc(estadoAtual().registro('verbete', 'GL-aaaaaaaa-90')!)
    expect(v).toMatchObject({ emUso: 'termo G', status: 'proposed', aprovacaoDesatualizada: true })
  })
})

describe('duplicadosNoGlossario: um verbete do livro renomeado para a forma de outro do livro (revisão 2, m4)', () => {
  it('só entra quando um deles tem forma em uso (a renomeação é obra da pessoa); dois iguais no pacote, sem edição, não', () => {
    const iguais = [
      { id: 'GL-1', nome: 'selo' },
      { id: 'GL-2', nome: 'Selo' },
    ]
    expect(duplicadosNoGlossario([], iguais).size).toBe(0)
    const d = duplicadosNoGlossario([], [{ id: 'GL-1', nome: 'selo', editado: true }, { id: 'GL-2', nome: 'Selo' }])
    expect(d.get('GL-1')).toEqual([{ id: 'GL-2', nome: 'Selo', doUsuario: false }])
    expect(d.get('GL-2')).toEqual([{ id: 'GL-1', nome: 'selo', doUsuario: false }])
  })
})
