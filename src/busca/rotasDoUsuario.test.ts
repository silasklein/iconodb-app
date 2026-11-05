import { ROTULO_DO_TIPO_DO_USUARIO, rotaDoAcertoDoUsuario, rotasDoUsuario } from './rotasDoUsuario'

describe('rotas dos acertos da camada do usuário', () => {
  it('a nota abre a tela da nota', () => {
    expect(rotaDoAcertoDoUsuario('nota', 'NT-aaaaaaaa-1')).toBe('/nota/NT-aaaaaaaa-1')
  })
  it('a coleção SKC abre como grupo (Tarefa 7)', () => {
    expect(rotaDoAcertoDoUsuario('colecao', 'CO-aaaaaaaa-1')).toBe('/grupo/CO-aaaaaaaa-1')
    expect(rotasDoUsuario.colecao?.('CO-a b-1')).toBe('/grupo/CO-a%20b-1')
  })
  it('tipos sem tela ainda não têm rota', () => {
    expect(rotaDoAcertoDoUsuario('hipotese', 'HY-a-1')).toBeNull()
    expect(ROTULO_DO_TIPO_DO_USUARIO.colecao).toBe('Coleção')
  })
})
