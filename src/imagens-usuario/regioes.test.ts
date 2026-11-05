import { estadoAtual, registrar } from '../usuario/estado'
import { regioesDoUsuario } from './regioes'

describe('regioesDoUsuario: as regiões (registros `regiao`) marcadas numa imagem', () => {
  it('lê o polígono (formato R4) e o nome do elemento; ignora excluídas, malformadas e as de outra imagem', async () => {
    await registrar('regiao', 'RG-aaaaaaaa-1', 'criar', { imagem: 'IM-aaaaaaaa-7', seletor: '<polygon points="0.1,0.1 0.5,0.1 0.5,0.4"/>', elemento: 'leão de teste', elementoId: 'EL-900002' })
    await registrar('regiao', 'RG-aaaaaaaa-2', 'criar', { imagem: 'IM-aaaaaaaa-7', seletor: 'lixo', elemento: 'x' })
    await registrar('regiao', 'RG-aaaaaaaa-3', 'criar', { imagem: 'IM-aaaaaaaa-8', seletor: '<polygon points="0,0 1,0 1,1"/>', elemento: 'outra' })
    await registrar('regiao', 'RG-aaaaaaaa-4', 'criar', { imagem: 'IM-aaaaaaaa-7', seletor: '<polygon points="0,0 1,0 1,1"/>', elemento: 'tirada' })
    await registrar('regiao', 'RG-aaaaaaaa-4', 'excluir')
    const rs = regioesDoUsuario(estadoAtual(), 'IM-aaaaaaaa-7')
    expect(rs).toEqual([
      { id: 'RG-aaaaaaaa-1', elementoId: 'EL-900002', elemento: 'leão de teste', elementoDe: 'leão de teste', selector: '<polygon points="0.1,0.1 0.5,0.1 0.5,0.4"/>', pontos: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.4]] },
    ])
    expect(regioesDoUsuario(estadoAtual(), 'IM-nenhuma-1')).toEqual([])
  })

  it('revisão 3, M8: o mesmo leitor da hipótese (lerRegiao): elementoId validado, pontos dentro de 0 a 1, sem nome = "região"', async () => {
    await registrar('regiao', 'RG-aaaaaaaa-11', 'criar', { imagem: 'IM-aaaaaaaa-9', seletor: '<polygon points="-0.5,0 1.2,0 1,1.7"/>', elemento: '', elementoId: 'EL-x' })
    await registrar('regiao', 'RG-aaaaaaaa-12', 'criar', { imagem: 'IM-aaaaaaaa-9', seletor: '<polygon points="0,0 1,0 1,1"/>', elemento: 'pata', elementoId: 'RG-aaaaaaaa-11' })
    const rs = regioesDoUsuario(estadoAtual(), 'IM-aaaaaaaa-9')
    expect(rs.map((r) => [r.id, r.elementoId, r.elemento])).toEqual([
      ['RG-aaaaaaaa-11', 'RG-aaaaaaaa-11', 'região'],
      ['RG-aaaaaaaa-12', 'RG-aaaaaaaa-11', 'pata'],
    ])
    expect(rs[0]!.pontos).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ])
  })
})
