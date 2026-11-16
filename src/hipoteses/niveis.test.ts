/** O nível revisto de uma hipótese dos livros (Tarefa 7), com o IndexedDB de teste. Só ids TESTE. */
import { estadoAtual, registrar } from '../usuario/estado'
import { nivelRevisto, reverNivel, voltarAoAutomatico } from './niveis'

describe('o nível revisto', () => {
  it('rever, mudar, voltar ao automático e restaurar', async () => {
    expect(nivelRevisto(estadoAtual(), 'HY-900006')).toBeNull()
    expect(await reverNivel('HY-900006', 'iconological')).toMatchObject({ tipo: 'nivel', reg: 'HY-900006', op: 'criar', campos: { nivel: 'iconological' } })
    expect(nivelRevisto(estadoAtual(), 'HY-900006')).toBe('iconological')
    expect(await reverNivel('HY-900006', 'pre_iconographic')).toMatchObject({ op: 'alterar' })
    expect(nivelRevisto(estadoAtual(), 'HY-900006')).toBe('pre_iconographic')
    expect(await voltarAoAutomatico('HY-900006')).toMatchObject({ op: 'excluir' })
    expect(nivelRevisto(estadoAtual(), 'HY-900006')).toBeNull()
    expect(await voltarAoAutomatico('HY-900006')).toBeNull()
    // «Restaurar» (Excluídos) devolve o nível; rever de novo também restaura
    await registrar('nivel', 'HY-900006', 'restaurar')
    expect(nivelRevisto(estadoAtual(), 'HY-900006')).toBe('pre_iconographic')
    await voltarAoAutomatico('HY-900006')
    await reverNivel('HY-900006', 'iconographic')
    expect(nivelRevisto(estadoAtual(), 'HY-900006')).toBe('iconographic')
    await expect(voltarAoAutomatico('HY-999999')).resolves.toBeNull()
  })

  it('só hipóteses dos livros e os três níveis; um valor estranho na camada é o automático', async () => {
    await expect(reverNivel('HY-aaaaaaaa-1', 'iconographic')).rejects.toThrow('não é uma hipótese dos livros')
    await expect(reverNivel('HY-900001', 'mitologico' as never)).rejects.toThrow('nível desconhecido')
    await registrar('nivel', 'HY-900002', 'criar', { nivel: 'mitologico' })
    expect(nivelRevisto(estadoAtual(), 'HY-900002')).toBeNull()
    await registrar('nivel', 'HY-900002', 'alterar', { nivel: null })
    expect(nivelRevisto(estadoAtual(), 'HY-900002')).toBeNull()
  })
})
