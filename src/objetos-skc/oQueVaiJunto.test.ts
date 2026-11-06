import { registrar, estadoAtual } from '../usuario/estado'
import { oQueVaiJunto, textoDaJuncao } from './oQueVaiJunto'

describe('textoDaJuncao', () => {
  const j = (fotos = 0, notas = 0, hipoteses = 0, regioes = 0) => ({ fotos, notas, hipoteses, regioes })
  it('vazio quando tudo é zero', () => expect(textoDaJuncao(j())).toBe(''))
  it('singular: uma foto e uma nota', () => expect(textoDaJuncao(j(1, 1))).toBe('A foto e a nota dele'))
  it('plural e vírgulas, na ordem fotos, notas, hipóteses, regiões', () => {
    expect(textoDaJuncao(j(2, 1, 3))).toBe('As 2 fotos, a nota e as 3 hipóteses dele')
    expect(textoDaJuncao(j(2, 3, 4, 5))).toBe('As 2 fotos, as 3 notas, as 4 hipóteses e as 5 regiões dele')
    expect(textoDaJuncao(j(1, 1, 1, 1))).toBe('A foto, a nota, a hipótese e a região dele')
  })
  it('omite o que é zero', () => {
    expect(textoDaJuncao(j(0, 1))).toBe('A nota dele')
    expect(textoDaJuncao(j(0, 0, 2, 1))).toBe('As 2 hipóteses e a região dele')
    expect(textoDaJuncao(j(0, 2))).toBe('As 2 notas dele')
  })
})

describe('oQueVaiJunto', () => {
  it('conta só os vivos e só os deste objeto', async () => {
    const A = 'OB-tjunto01-1'
    const B = 'OB-tjunto01-2'
    await registrar('imagem', 'IM-tjunto01-1', 'criar', { alvoTipo: 'objeto', alvo: A, formato: 'jpeg' } as never)
    await registrar('imagem', 'IM-tjunto01-2', 'criar', { alvoTipo: 'objeto', alvo: A, formato: 'jpeg' } as never)
    await registrar('imagem', 'IM-tjunto01-3', 'criar', { alvoTipo: 'objeto', alvo: A, formato: 'jpeg' } as never)
    await registrar('imagem', 'IM-tjunto01-3', 'excluir')
    await registrar('imagem', 'IM-tjunto01-4', 'criar', { alvoTipo: 'objeto', alvo: B, formato: 'jpeg' } as never)
    await registrar('nota', 'NO-tjunto01-1', 'criar', { texto: 'a', alvoTipo: 'objeto', alvo: A } as never)
    await registrar('nota', 'NO-tjunto01-2', 'criar', { texto: 'b', alvoTipo: 'objeto', alvo: A } as never)
    await registrar('nota', 'NO-tjunto01-2', 'excluir')
    await registrar('nota', 'NO-tjunto01-3', 'criar', { texto: 'c', alvoTipo: 'sitio', alvo: A } as never)
    await registrar('nota', 'NO-tjunto01-4', 'criar', { texto: 'd', alvoTipo: 'objeto', alvo: B } as never)
    await registrar('hipotese', 'HI-tjunto01-1', 'criar', { objeto: A } as never)
    await registrar('hipotese', 'HI-tjunto01-2', 'criar', { objeto: B } as never)
    await registrar('regiao', 'RE-tjunto01-1', 'criar', { objeto: A, imagem: 'IM-tjunto01-1' } as never)
    await registrar('regiao', 'RE-tjunto01-2', 'criar', { objeto: A, imagem: 'IM-tjunto01-1' } as never)
    await registrar('regiao', 'RE-tjunto01-2', 'excluir')
    expect(oQueVaiJunto(estadoAtual(), A)).toEqual({ fotos: 2, notas: 1, hipoteses: 1, regioes: 1 })
    expect(oQueVaiJunto(estadoAtual(), B)).toEqual({ fotos: 1, notas: 1, hipoteses: 1, regioes: 0 })
    expect(oQueVaiJunto(estadoAtual(), 'OB-tjunto01-9')).toEqual({ fotos: 0, notas: 0, hipoteses: 0, regioes: 0 })
  })
})
