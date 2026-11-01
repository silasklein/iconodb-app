import { armazemMemoria } from './armazem'

describe('armazemMemoria', () => {
  it('grava, lê, confere, lista e remove', async () => {
    const a = armazemMemoria()
    expect(await a.ler('x/y.bin')).toBeNull()
    expect(await a.existe('x/y.bin')).toBe(false)

    await a.gravar('x/y.bin', new Uint8Array([1, 2, 3]))
    await a.gravar('x/z.bin', new Uint8Array([4]))
    await a.gravar('w.json', new Uint8Array([5]))
    expect(await a.ler('x/y.bin')).toEqual(new Uint8Array([1, 2, 3]))
    expect(await a.existe('x/y.bin')).toBe(true)
    expect((await a.listar('x')).sort()).toEqual(['x/y.bin', 'x/z.bin'])
    expect((await a.listar('')).sort()).toEqual(['w.json', 'x/y.bin', 'x/z.bin'])

    await a.remover('x/y.bin')
    expect(await a.existe('x/y.bin')).toBe(false)
    await a.remover('x/y.bin') // remover o que não existe não é erro
  })

  it('regravar substitui o conteúdo e a cópia lida não altera o armazém', async () => {
    const a = armazemMemoria()
    const original = new Uint8Array([1, 2])
    await a.gravar('a', original)
    original[0] = 9
    expect(await a.ler('a')).toEqual(new Uint8Array([1, 2]))
    await a.gravar('a', new Uint8Array([7]))
    expect(await a.ler('a')).toEqual(new Uint8Array([7]))
  })
})
