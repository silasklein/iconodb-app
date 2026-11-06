/**
 * P5 (aprovação do bloco 1): o nome da entrada dos livros de uma origem que só tem a marca fica guardado NESTE aparelho
 * (config local, não sincronizada, não é evento), para «Excluídos» continuar dizendo o nome depois da importação.
 */
import 'fake-indexeddb/auto'
import { gravarConfig, lerConfig } from '../usuario/diarioLocal'
import { CHAVE_DOS_NOMES, esquecerNomesGuardados, guardarNomes, lerNomesGuardados, nomesGuardadosAtuais } from './nomesGuardados'

beforeEach(async () => {
  esquecerNomesGuardados()
  await gravarConfig(CHAVE_DOS_NOMES, undefined)
})

describe('nomes guardados das origens (P5)', () => {
  it('guarda, une e lê de volta (também depois de esquecer a cópia em memória, como num app reaberto)', async () => {
    await guardarNomes({ 'GL-aaaaaaaa-1': 'leão-de-teste' })
    await guardarNomes({ 'SI-aaaaaaaa-1': 'Tell TESTE', 'GL-aaaaaaaa-1': 'leão-de-teste' })
    expect(nomesGuardadosAtuais()).toEqual({ 'GL-aaaaaaaa-1': 'leão-de-teste', 'SI-aaaaaaaa-1': 'Tell TESTE' })
    expect(await lerConfig(CHAVE_DOS_NOMES)).toEqual({ 'GL-aaaaaaaa-1': 'leão-de-teste', 'SI-aaaaaaaa-1': 'Tell TESTE' })
    esquecerNomesGuardados()
    expect(nomesGuardadosAtuais()).toEqual({})
    expect(await lerNomesGuardados()).toEqual({ 'GL-aaaaaaaa-1': 'leão-de-teste', 'SI-aaaaaaaa-1': 'Tell TESTE' })
  })

  it('ignora nomes vazios e ids que não são de verbete ou sítio do usuário; um nome novo troca o antigo', async () => {
    await guardarNomes({ 'GL-aaaaaaaa-1': '  ', 'CA00005': 'x', 'GL-000123': 'do livro', 'SI-bbbbbbbb-2': 'Tell B' })
    await guardarNomes({ 'SI-bbbbbbbb-2': 'Tell B corrigido' })
    expect(await lerNomesGuardados()).toEqual({ 'SI-bbbbbbbb-2': 'Tell B corrigido' })
  })
})
