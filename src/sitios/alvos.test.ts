/**
 * Tarefa 12, revisão 1 (m1): o nome do sítio num link de nota sem rótulo (`[[TESTE-2]]`, `[[SI-…]]`) é o de agora, e um sítio do
 * usuário excluído continua sendo um link que abre (a página oferece «Restaurar o sítio»), dito como excluído.
 */
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { resolverAlvos } from '../notas/alvos'
import { estadoAtual, registrar } from '../usuario/estado'

beforeAll(async () => usarMotor(await bancoDeTeste()))
afterAll(() => usarMotor(null))

const alvo = async (ref: string) => (await resolverAlvos([{ tipo: 'sitio', ref }], estadoAtual())).get(`sitio\u0000${ref}`)!

describe('links de nota para um sítio, sem rótulo', () => {
  it('um sítio do livro: o nome do livro; corrigido, o nome corrigido; de volta ao livro, o do livro', async () => {
    expect(await alvo('TESTE-2')).toMatchObject({ existe: true, rotulo: 'Tell Probe Teste', rota: '/sitio/TESTE-2' })
    await registrar('sitio', 'TESTE-2', 'alterar', { nome: 'Tell Nova Grafia' })
    expect(await alvo('TESTE-2')).toMatchObject({ existe: true, rotulo: 'Tell Nova Grafia' })
    await registrar('sitio', 'TESTE-2', 'alterar', { nome: null })
    expect(await alvo('TESTE-2')).toMatchObject({ rotulo: 'Tell Probe Teste' })
  })

  it('um sítio do usuário: o nome de agora; excluído, o link continua, com a marca «excluído» (a página oferece restaurar)', async () => {
    await registrar('sitio', 'SI-alvosaaa-1', 'criar', { nome: 'Tell de Nota' })
    expect(await alvo('SI-alvosaaa-1')).toMatchObject({ existe: true, rotulo: 'Tell de Nota', rota: '/sitio/SI-alvosaaa-1' })
    await registrar('sitio', 'SI-alvosaaa-1', 'excluir')
    expect(await alvo('SI-alvosaaa-1')).toMatchObject({ existe: true, rotulo: 'Tell de Nota (excluído)', rota: '/sitio/SI-alvosaaa-1' })
    await registrar('sitio', 'SI-alvosaaa-1', 'restaurar')
    expect(await alvo('SI-alvosaaa-1')).toMatchObject({ rotulo: 'Tell de Nota' })
  })

  it('um SI-… que nunca existiu continua "não existe"', async () => {
    expect(await alvo('SI-zzzzzzzz-9')).toMatchObject({ existe: false, rota: null })
  })
})

describe('Parte 2C, bloco 2: o link para um sítio mesclado em outro', () => {
  it('[[TESTE-4]] (mesclado em TESTE-2 pelo pacote): o nome do destino; o link continua no endereço antigo (que leva lá, com o aviso)', async () => {
    expect(await alvo('TESTE-4')).toMatchObject({ existe: true, rotulo: 'Tell Probe Teste', rota: '/sitio/TESTE-4' })
  })

  it('um sítio seu mesclado num do livro: o nome do destino; desfeita a mescla, o dele', async () => {
    await registrar('sitio', 'SI-alvosbbb-1', 'criar', { nome: 'Tell Que Entra' })
    await registrar('sitio', 'SI-alvosbbb-1', 'alterar', { mescladoEm: 'TESTE-1' })
    expect(await alvo('SI-alvosbbb-1')).toMatchObject({ existe: true, rotulo: 'Maḥteṣ Teste', rota: '/sitio/SI-alvosbbb-1' })
    await registrar('sitio', 'SI-alvosbbb-1', 'alterar', { mescladoEm: null })
    expect(await alvo('SI-alvosbbb-1')).toMatchObject({ rotulo: 'Tell Que Entra' })
  })
})
