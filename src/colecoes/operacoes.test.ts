import { todosEventos } from '../usuario/armazem'
import { estadoAtual, registrar } from '../usuario/estado'
import { lerColecao } from './modelo'
import {
  acrescentarMembros,
  criarColecao,
  descreverColecao,
  devolverMembro,
  excluirColecao,
  moverMembro,
  moverMembroPara,
  renomearColecao,
  restaurarColecao,
  tirarMembro,
  validarNome,
} from './operacoes'

const colecao = (id: string) => lerColecao(estadoAtual().registro('colecao', id)!)
const refs = (id: string) => colecao(id).membros.map((m) => m.ref)
const eventosDe = async (id: string) => (await todosEventos()).filter((e) => e.reg === id)

describe('validarNome', () => {
  it('pede um nome e limita o tamanho; o texto é aparado', () => {
    expect(validarNome('  ')).toMatch(/nome/i)
    expect(validarNome('')).toMatch(/nome/i)
    expect(validarNome('a'.repeat(121))).toMatch(/120/)
    expect(validarNome('Íbices em selos')).toBeNull()
    expect(validarNome(' x ')).toBeNull()
  })
})

describe('criar, renomear, excluir e restaurar', () => {
  it('criar grava um evento "criar" no IndexedDB com o nome aparado e devolve o id CO-<aparelho>-<n>', async () => {
    const id = await criarColecao('  Íbices em selos  ')
    expect(id).toMatch(/^CO-[a-z0-9]{8}-\d+$/)
    expect(colecao(id).nome).toBe('Íbices em selos')
    const eventos = await eventosDe(id)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ tipo: 'colecao', op: 'criar', campos: { nome: 'Íbices em selos' } })
  })

  it('criar com um primeiro objeto grava tudo no mesmo evento (a coleção nunca existe sem ele)', async () => {
    const id = await criarColecao('Remates', { membros: ['ca00001'] })
    expect(refs(id)).toEqual(['CA00001'])
    expect(await eventosDe(id)).toHaveLength(1)
  })

  it('nome inválido não grava nada', async () => {
    const antes = (await todosEventos()).length
    await expect(criarColecao('   ')).rejects.toThrow(/nome/i)
    expect((await todosEventos()).length).toBe(antes)
  })

  it('renomear e descrever são eventos "alterar" de um campo cada', async () => {
    const id = await criarColecao('Antigo')
    await renomearColecao(id, ' Novo nome ')
    await descreverColecao(id, 'Uma descrição')
    expect(colecao(id)).toMatchObject({ nome: 'Novo nome', descricao: 'Uma descrição' })
    const [, a, b] = await eventosDe(id)
    expect(a).toMatchObject({ op: 'alterar', campos: { nome: 'Novo nome' } })
    expect(b).toMatchObject({ op: 'alterar', campos: { descricao: 'Uma descrição' } })
    await expect(renomearColecao(id, '')).rejects.toThrow(/nome/i)
    expect(colecao(id).nome).toBe('Novo nome')
  })

  it('excluir é uma marca reversível: os membros e o nome ficam, e restaurar traz a coleção de volta', async () => {
    const id = await criarColecao('Para excluir', { membros: ['CA00002'] })
    await excluirColecao(id)
    expect(colecao(id).excluida).toBe(true)
    expect(colecao(id).nome).toBe('Para excluir')
    expect(refs(id)).toEqual(['CA00002'])
    await restaurarColecao(id)
    expect(colecao(id).excluida).toBe(false)
    expect(refs(id)).toEqual(['CA00002'])
    const ops = (await eventosDe(id)).map((e) => e.op)
    expect(ops).toEqual(['criar', 'excluir', 'restaurar'])
  })
})

describe('membros', () => {
  it('acrescentar põe no fim, sem duplicar; devolve só o que entrou; nada novo, nada gravado', async () => {
    const id = await criarColecao('Membros')
    expect(await acrescentarMembros(id, ['CA00001', 'ba00001', 'CA00001'])).toEqual(['CA00001', 'BA00001'])
    expect(refs(id)).toEqual(['CA00001', 'BA00001'])
    const antes = (await eventosDe(id)).length
    expect(await acrescentarMembros(id, ['CA00001'])).toEqual([])
    expect((await eventosDe(id)).length).toBe(antes)
    expect(await acrescentarMembros(id, ['CA00003', 'BA00001'])).toEqual(['CA00003'])
    expect(refs(id)).toEqual(['CA00001', 'BA00001', 'CA00003'])
    // Ferro I–III também (F100001), e a forma canônica é a maiúscula
    expect(await acrescentarMembros(id, ['f100001'])).toEqual(['F100001'])
    expect(refs(id)).toEqual(['CA00001', 'BA00001', 'CA00003', 'F100001'])
  })

  it('acrescentar vários grava um evento só', async () => {
    const id = await criarColecao('Vários')
    const antes = (await eventosDe(id)).length
    await acrescentarMembros(id, ['CA00001', 'CA00002', 'CA00003', 'CA00004'])
    expect((await eventosDe(id)).length).toBe(antes + 1)
  })

  it('refs que não são de objeto são recusadas sem gravar', async () => {
    const id = await criarColecao('Recusa')
    await expect(acrescentarMembros(id, ['GL-900001'])).rejects.toThrow()
    expect(refs(id)).toEqual([])
  })

  it('tirar escreve null; devolve a ordem de antes; devolver traz o objeto de volta no mesmo lugar, sem duplicar', async () => {
    const id = await criarColecao('Tira e põe')
    await acrescentarMembros(id, ['CA00001', 'CA00002', 'CA00003'])
    const ordem = await tirarMembro(id, 'CA00002')
    expect(ordem).not.toBeNull()
    expect(refs(id)).toEqual(['CA00001', 'CA00003'])
    expect((await eventosDe(id)).at(-1)!.campos).toEqual({ 'm:CA00002': null }) // só a presença; a ordem não é tocada
    await devolverMembro(id, 'CA00002', ordem!)
    expect(refs(id)).toEqual(['CA00001', 'CA00002', 'CA00003'])
    // pôr outra vez o que já está não duplica
    await devolverMembro(id, 'CA00002', ordem!)
    await acrescentarMembros(id, ['CA00002'])
    expect(refs(id)).toEqual(['CA00001', 'CA00002', 'CA00003'])
  })

  it('devolver (o "Desfazer" de tirar) escreve SÓ a presença quando a ordem guardada já cai entre os vizinhos de antes', async () => {
    const id = await criarColecao('Desfazer só presença', { membros: ['CA00001', 'CA00002', 'CA00003'] })
    const lugar = await tirarMembro(id, 'CA00002')
    const antes = (await eventosDe(id)).length
    await devolverMembro(id, 'CA00002', lugar!)
    const novos = (await eventosDe(id)).slice(antes)
    expect(novos).toHaveLength(1)
    expect(novos[0]!.campos).toEqual({ 'm:CA00002': true })
    expect(refs(id)).toEqual(['CA00001', 'CA00002', 'CA00003'])
  })

  it('sem os dois vizinhos de antes (um deles saiu também), vale a ordem que ficou no registro, inclusive a de um movimento de outro aparelho', async () => {
    const id = await criarColecao('Sem vizinhos', { membros: ['CA00001', 'CA00002', 'CA00003'] })
    const lugar = await tirarMembro(id, 'CA00002')
    const { registrar } = await import('../usuario/estado')
    await registrar('colecao', id, 'alterar', { 'i:CA00002': 5000 }) // outro aparelho moveu o objeto tirado
    await tirarMembro(id, 'CA00003') // e um vizinho de antes saiu: não há mais "entre eles"
    const antes = (await eventosDe(id)).length
    await devolverMembro(id, 'CA00002', lugar!)
    const novos = (await eventosDe(id)).slice(antes)
    expect(novos).toHaveLength(1)
    expect(novos[0]!.campos).toEqual({ 'm:CA00002': true })
    expect(refs(id)).toEqual(['CA00001', 'CA00002'])
  })

  it('devolver reescreve a ordem só se ela sumiu ou ficou inválida', async () => {
    const id = await criarColecao('Ordem perdida', { membros: ['CA00001'] })
    const { registrar } = await import('../usuario/estado')
    await registrar('colecao', id, 'alterar', { 'm:CA00002': null }) // presença tirada sem ordem nenhuma
    await devolverMembro(id, 'CA00002', 2048)
    expect((await eventosDe(id)).at(-1)!.campos).toEqual({ 'm:CA00002': true, 'i:CA00002': 2048 })
    expect(refs(id)).toEqual(['CA00001', 'CA00002'])
  })

  describe('Desfazer de tirar volta ENTRE os vizinhos de antes (nunca num empate)', () => {
    const base = ['CA00001', 'CA00004', 'CA00002', 'CA00003'] // CA00004 no 2º lugar, com ordem 2048
    const ordemDe = (id: string) => lerColecao(estadoAtual().registro('colecao', id)!).membros.map((m) => [m.ref, m.ordem])

    it('tirar, outro aparelho renumera SEM o tirado, Desfazer: o tirado fica ENTRE os vizinhos, não empatado com um deles', async () => {
      const id = await criarColecao('Renumera sem ele', { membros: base })
      const lugar = await tirarMembro(id, 'CA00004')
      expect(lugar).toMatchObject({ antes: 'CA00001', depois: 'CA00002' })
      // renumeração de quem viu a retirada: só os presentes (1024, 2048, 3072); a ordem guardada do tirado (2048) empata com CA00002
      await registrar('colecao', id, 'alterar', { 'i:CA00001': 1024, 'i:CA00002': 2048, 'i:CA00003': 3072 })
      await devolverMembro(id, 'CA00004', lugar!)
      expect(refs(id)).toEqual(['CA00001', 'CA00004', 'CA00002', 'CA00003']) // sem o desempate por ref, ficaria depois de CA00002
      const ordens = ordemDe(id).map(([, o]) => o)
      expect(new Set(ordens).size).toBe(ordens.length) // nenhuma ordem repetida
      expect((await eventosDe(id)).at(-1)!.campos).toEqual({ 'm:CA00004': true, 'i:CA00004': 1536 })
    })

    it('os vizinhos deixaram de ser vizinhos (entrou outro membro entre eles): vale a ordem guardada, como antes', async () => {
      const id = await criarColecao('Entrou outro', { membros: base })
      const lugar = await tirarMembro(id, 'CA00004')
      await registrar('colecao', id, 'alterar', { 'm:CA00005': true, 'i:CA00005': 1500 }) // entre CA00001 (1024) e CA00002 (3072)
      await devolverMembro(id, 'CA00004', lugar!)
      expect((await eventosDe(id)).at(-1)!.campos).toEqual({ 'm:CA00004': true })
    })

    it('um vizinho saiu: sem os dois, vale a regra de antes (ordem guardada)', async () => {
      const id = await criarColecao('Vizinho saiu', { membros: base })
      const lugar = await tirarMembro(id, 'CA00004')
      await tirarMembro(id, 'CA00001')
      await devolverMembro(id, 'CA00004', lugar!)
      expect((await eventosDe(id)).at(-1)!.campos).toEqual({ 'm:CA00004': true })
    })

    it('não há espaço entre os vizinhos (ordens seguidas): cai na regra de antes, sem inventar valor', async () => {
      const id = await criarColecao('Sem espaço', { membros: ['CA00001', 'CA00004', 'CA00002'] })
      const lugar = await tirarMembro(id, 'CA00004')
      await registrar('colecao', id, 'alterar', { 'i:CA00001': 10, 'i:CA00002': 11 })
      await devolverMembro(id, 'CA00004', lugar!)
      expect((await eventosDe(id)).at(-1)!.campos).toEqual({ 'm:CA00004': true })
    })

    it('tirado do início: volta antes do primeiro de agora; tirado do fim: depois do último de agora', async () => {
      const id = await criarColecao('Pontas', { membros: ['CA00003', 'CA00001', 'CA00002'] })
      const primeiro = await tirarMembro(id, 'CA00003')
      const ultimo = await tirarMembro(id, 'CA00002')
      expect(primeiro).toMatchObject({ antes: null, depois: 'CA00001' })
      expect(ultimo).toMatchObject({ antes: 'CA00001', depois: null })
      await registrar('colecao', id, 'alterar', { 'i:CA00001': 1024 }) // o único presente é renumerado; as ordens guardadas (1024 e 3072) empatam ou ficam do lado errado
      await devolverMembro(id, 'CA00003', primeiro!)
      await devolverMembro(id, 'CA00002', ultimo!)
      expect(refs(id)).toEqual(['CA00003', 'CA00001', 'CA00002'])
    })

    it('a forma antiga (só o número da ordem) continua valendo', async () => {
      const id = await criarColecao('Número', { membros: ['CA00001'] })
      await registrar('colecao', id, 'alterar', { 'm:CA00002': null })
      await devolverMembro(id, 'CA00002', 2048)
      expect((await eventosDe(id)).at(-1)!.campos).toEqual({ 'm:CA00002': true, 'i:CA00002': 2048 })
    })
  })

  it('pôr de novo, pelo acrescentar, depois de tirar: m:true e uma ordem nova no fim', async () => {
    const id = await criarColecao('Reentra', { membros: ['CA00001', 'CA00002'] })
    await tirarMembro(id, 'CA00001')
    expect(await acrescentarMembros(id, ['CA00001'])).toEqual(['CA00001'])
    expect(refs(id)).toEqual(['CA00002', 'CA00001'])
    expect((await eventosDe(id)).at(-1)!.campos).toEqual({ 'm:CA00001': true, 'i:CA00001': 3072 })
  })

  it('tirar quem não é membro não grava nada', async () => {
    const id = await criarColecao('Sem ele')
    const antes = (await todosEventos()).length
    expect(await tirarMembro(id, 'CA00001')).toBeNull()
    expect((await todosEventos()).length).toBe(antes)
  })

  it('mover grava UM evento com UM campo (a ordem nova), e a ordem fica guardada', async () => {
    const id = await criarColecao('Ordem')
    await acrescentarMembros(id, ['CA00001', 'CA00002', 'CA00003', 'CA00004'])
    const antes = (await eventosDe(id)).length
    const r = await moverMembro(id, 3, 1)
    expect(r).toMatchObject({ ref: 'CA00004', de: 3, para: 1 })
    expect(refs(id)).toEqual(['CA00001', 'CA00004', 'CA00002', 'CA00003'])
    const novos = (await eventosDe(id)).slice(antes)
    expect(novos).toHaveLength(1)
    expect(Object.keys(novos[0]!.campos)).toEqual(['i:CA00004'])
  })

  it('mover sem espaço entre os vizinhos renumera num só evento', async () => {
    const id = await criarColecao('Aperto')
    await acrescentarMembros(id, ['CA00001', 'CA00002', 'CA00003'])
    // cola CA00002 em CA00001 (ordens consecutivas) para forçar a falta de espaço
    const [a, b] = colecao(id).membros
    const { registrar } = await import('../usuario/estado')
    await registrar('colecao', id, 'alterar', { 'i:CA00002': a!.ordem + 1 })
    expect(b!.ordem).toBeGreaterThan(a!.ordem + 1)
    const antes = (await eventosDe(id)).length
    const r = await moverMembro(id, 2, 1) // CA00003 entre CA00001 e CA00002
    expect(r.renumerou).toBe(true)
    expect(refs(id)).toEqual(['CA00001', 'CA00003', 'CA00002'])
    expect((await eventosDe(id)).length).toBe(antes + 1)
  })

  it('mover para o mesmo lugar não grava', async () => {
    const id = await criarColecao('Parado')
    await acrescentarMembros(id, ['CA00001', 'CA00002'])
    const antes = (await eventosDe(id)).length
    const r = await moverMembro(id, 1, 1)
    expect(r.campos).toEqual({})
    expect((await eventosDe(id)).length).toBe(antes)
  })

  it('tudo vai ao IndexedDB antes de qualquer outra coisa: o evento já está lá quando a operação termina', async () => {
    const id = await criarColecao('Durável')
    await acrescentarMembros(id, ['CA00001'])
    const gravados = await todosEventos()
    expect(gravados.filter((e) => e.reg === id).map((e) => e.op)).toEqual(['criar', 'alterar'])
    expect(gravados.filter((e) => e.reg === id).every((e) => e.aparelho.length === 8)).toBe(true)
  })

  it('moverMembroPara acha a posição pela ref NO ESTADO DE AGORA (outro aparelho pode ter mexido antes)', async () => {
    const id = await criarColecao('Por ref')
    await acrescentarMembros(id, ['CA00001', 'CA00002', 'CA00003'])
    const { registrar } = await import('../usuario/estado')
    // outro aparelho passou CA00003 para o início enquanto a tela ainda mostrava a ordem velha
    await registrar('colecao', id, 'alterar', { 'i:CA00003': 0 })
    expect(refs(id)).toEqual(['CA00003', 'CA00001', 'CA00002'])
    const r = await moverMembroPara(id, 'CA00001', 2) // CA00001 para o fim
    expect(r).toMatchObject({ ref: 'CA00001', de: 1, para: 2 })
    expect(refs(id)).toEqual(['CA00003', 'CA00002', 'CA00001'])
    await expect(moverMembroPara(id, 'CA00099', 0)).rejects.toThrow(/não é membro/i)
  })
})
