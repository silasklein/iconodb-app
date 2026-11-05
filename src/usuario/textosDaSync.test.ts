import { alteracoes, caminhoDoRegistro, descreverMudanca, descreverRegistro, doAparelho, quando, removerChaves, textoCurtoDaUltima, textoDaUltima, textosDoEstado } from './textosDaSync'

const as1920 = new Date(2026, 9, 31, 19, 20).getTime()
const agora = new Date(2026, 9, 31, 21, 0).getTime()

describe('os textos de cada estado (PC-Sincronizacao.dc.html)', () => {
  const t = (estado: Parameters<typeof textosDoEstado>[0]['estado'], porEnviar = 0, ultimaEm: number | null = as1920) => textosDoEstado({ estado, porEnviar, ultimaEm }, 'Ctrl+S')

  it('sincronizado: só o ícone; a dica diz a hora e o atalho', () => {
    expect(t('sincronizado')).toMatchObject({
      titulo: 'Sincronizado',
      rotulo: 'Sincronizado às 19:20 — Salvar e sincronizar',
      dica: 'Sincronizado às 19:20 — Salvar e sincronizar (Ctrl+S)',
      marca: 'nenhuma',
    })
    expect(t('sincronizado', 0, null).rotulo).toBe('Nada por enviar — Salvar e sincronizar')
  })

  it('por enviar: o ponto; o número na dica e no painel', () => {
    expect(t({ porEnviar: 3 }, 3)).toEqual({
      titulo: '3 alterações por enviar',
      apoio: 'Já gravadas neste aparelho.',
      rotulo: '3 alterações por enviar — Salvar e sincronizar',
      dica: '3 alterações por enviar — Salvar e sincronizar (Ctrl+S)',
      marca: 'ponto',
    })
    expect(t({ porEnviar: 1 }, 1).titulo).toBe('1 alteração por enviar')
  })

  it('com o estado.json ilegível: a marca de aviso (sem bloquear) e o aviso na dica; sincronizando e erros não mudam', () => {
    const com = (estado: Parameters<typeof textosDoEstado>[0]['estado'], porEnviar = 0) =>
      textosDoEstado({ estado, porEnviar, ultimaEm: as1920, estadoIlegivel: 'versão mais nova do app em outro aparelho' }, 'Ctrl+S')
    expect(com('sincronizado')).toMatchObject({
      titulo: 'Sincronizado',
      marca: 'aviso',
      rotulo: 'Sincronizado às 19:20 — Salvar e sincronizar — aviso: o estado.json do Dropbox não pôde ser lido (ver Sincronização)',
    })
    expect(com({ porEnviar: 2 }, 2)).toMatchObject({ titulo: '2 alterações por enviar', marca: 'aviso' })
    expect(com('sincronizando').marca).toBe('girando')
    expect(com('sem-internet').marca).toBe('traco')
    expect(com({ erro: 'geral', mensagem: 'x' }).marca).toBe('erro')
  })

  it('com o estado.json lido só em parte (A-7): a dica diz "lido só em parte", não "não pôde ser lido"', () => {
    const r = textosDoEstado({ estado: 'sincronizado', porEnviar: 0, ultimaEm: as1920, estadoIlegivel: '1 registro que esta versão não conhece', estadoLidoEmParte: true }, 'Ctrl+S')
    expect(r).toMatchObject({
      marca: 'aviso',
      rotulo: 'Sincronizado às 19:20 — Salvar e sincronizar — aviso: o estado.json do Dropbox foi lido só em parte (ver Sincronização)',
    })
    expect(textosDoEstado({ estado: { porEnviar: 1 }, porEnviar: 1, ultimaEm: as1920, estadoIlegivel: 'x', estadoLidoEmParte: true }, 'Ctrl+S').rotulo).toContain('foi lido só em parte')
  })

  it('A-28: só registros ilegíveis: a dica diz «tem registros ilegíveis», não «lido só em parte»', () => {
    const r = textosDoEstado({ estado: 'sincronizado', porEnviar: 0, ultimaEm: as1920, estadoIlegivel: '2 registros ilegíveis', estadoLidoEmParte: true, estadoSoIlegiveis: true }, 'Ctrl+S')
    expect(r.rotulo).toBe('Sincronizado às 19:20 — Salvar e sincronizar — aviso: o estado.json do Dropbox tem registros ilegíveis (ver Sincronização)')
  })

  it('sincronizando: as setas giram', () => {
    expect(t('sincronizando', 3)).toMatchObject({ rotulo: 'Sincronizando: enviando 3 alterações', dica: 'Sincronizando… enviando 3 alterações', marca: 'girando' })
    expect(t('sincronizando', 0)).toMatchObject({ rotulo: 'Sincronizando', dica: 'Sincronizando…' })
  })

  it('sem internet: o traço; guardadas aqui, envia quando voltar', () => {
    expect(t('sem-internet', 3)).toMatchObject({
      rotulo: 'Sem internet — 3 alterações guardadas neste aparelho; envia quando voltar',
      dica: 'Sem internet — 3 alterações guardadas aqui; envia quando voltar',
      marca: 'traco',
    })
  })

  it('erro: o selo; login pede para entrar de novo; o geral oferece tentar de novo com o atalho', () => {
    expect(t({ erro: 'login', mensagem: 'x' }, 2)).toMatchObject({
      titulo: 'Entre de novo para sincronizar',
      apoio: '2 alterações guardadas neste aparelho; sobem depois de entrar.',
      rotulo: 'Entre de novo para sincronizar',
      marca: 'erro',
    })
    expect(t({ erro: 'geral', mensagem: 'Não foi possível falar com o Dropbox' })).toMatchObject({
      rotulo: 'Não foi possível falar com o Dropbox — tentar de novo',
      dica: 'Não foi possível falar com o Dropbox — tentar de novo (Ctrl+S)',
    })
    expect(t({ erro: 'geral', mensagem: 'Não foi possível falar com o Dropbox (resposta 400: x)' }).apoio).toBe(
      'Nada se perdeu: o que você fez fica neste aparelho. Toque em «Salvar e sincronizar» para tentar de novo.',
    )
    expect(t({ erro: 'geral', mensagem: 'detalhe técnico' }, 1).apoio).toBe('Nada se perdeu: 1 alteração guardada neste aparelho. Toque em «Salvar e sincronizar» para tentar de novo.')
    expect(t({ erro: 'geral', mensagem: 'detalhe técnico' }, 3).apoio).toBe('Nada se perdeu: 3 alterações guardadas neste aparelho. Toque em «Salvar e sincronizar» para tentar de novo.')
    expect(t({ erro: 'permissao', mensagem: 'marque as três permissões' })).toMatchObject({ titulo: 'Falta uma permissão do Dropbox', apoio: 'marque as três permissões' })
  })
})

describe('horas, nomes e mudanças', () => {
  it('quando: hoje, ontem ou a data', () => {
    expect(quando(as1920, agora)).toBe('hoje, 19:20')
    expect(quando(new Date(2026, 9, 30, 8, 5).getTime(), agora)).toBe('ontem, 08:05')
    expect(quando(new Date(2026, 9, 12, 18, 0).getTime(), agora)).toBe('12/10, 18:00')
    expect(textoDaUltima(as1920, agora)).toBe('Última sincronização: hoje, 19:20')
    expect(textoDaUltima(null, agora)).toBe('Ainda não sincronizado neste aparelho')
    expect(textoCurtoDaUltima(as1920, agora)).toBe('última às 19:20')
    expect(textoCurtoDaUltima(new Date(2026, 9, 30, 8, 5).getTime(), agora)).toBe('última ontem, 08:05')
    expect(textoCurtoDaUltima(null, agora)).toBeNull()
  })

  it('o outro aparelho pelo nome; sem nome, "do outro aparelho"', () => {
    expect(doAparelho('Mac')).toBe('do Mac')
    expect(doAparelho(null)).toBe('do outro aparelho')
    expect(doAparelho('Este aparelho')).toBe('do outro aparelho')
  })

  it('o que vai subir, com o gênero do tipo', () => {
    expect(descreverMudanca('nota', 'NT-a-1', 'criar')).toBe('Nota NT-a-1 — nova')
    expect(descreverMudanca('verbete', 'V-1', 'alterar')).toBe('Verbete V-1 — alterado')
    expect(descreverMudanca('colecao', 'CO-a-1', 'excluir')).toBe('Coleção CO-a-1 — excluída')
    expect(alteracoes(1234)).toBe('1.234 alterações')
  })

  describe('o registro com o que a pessoa reconhece (A-11), e o id só quando nada mais se sabe', () => {
    const numeros: Record<string, string> = { 'OB-a-1': 'CA00023' }
    const numeroDe = (ref: string) => numeros[ref] ?? null
    it('nota: onde ela está (o número do objeto, também de um objeto SKC)', () => {
      expect(descreverRegistro('nota', 'NT-a-1', { alvoTipo: 'objeto', alvo: 'CA00001' }, numeroDe)).toBe('Nota em CA00001')
      expect(descreverRegistro('nota', 'NT-a-1', { alvoTipo: 'objeto', alvo: 'OB-a-1' }, numeroDe)).toBe('Nota em CA00023')
      expect(descreverMudanca('nota', 'NT-a-1', 'alterar', { alvo: 'GL-900001' })).toBe('Nota em GL-900001 — alterada')
    })
    it('coleção, sítio e verbete: o nome entre aspas angulares (cortado se for longo)', () => {
      expect(descreverRegistro('colecao', 'CO-a-1', { nome: 'Selos TESTE' })).toBe('Coleção «Selos TESTE»')
      expect(descreverRegistro('sitio', 'SI-a-1', { nome: 'Tell Teste' })).toBe('Sítio «Tell Teste»')
      expect(descreverRegistro('verbete', 'GL-a-1', { forma: 'leão-de-prova' })).toBe('Verbete «leão-de-prova»')
      expect(descreverRegistro('verbete', 'GL-900001', { formaEmUso: 'leão de teste' })).toBe('Verbete «leão de teste»')
      const longo = descreverRegistro('colecao', 'CO-a-1', { nome: 'x'.repeat(200) })
      expect(longo.length).toBeLessThanOrEqual(70)
      expect(longo.endsWith('…»')).toBe(true)
    })
    it('hipótese e região: o termo ou o elemento, e o objeto', () => {
      expect(descreverRegistro('hipotese', 'HY-a-1', { termosRotulos: ['leão-de-teste'], objeto: 'CA00002' })).toBe('Hipótese sobre «leão-de-teste» em CA00002')
      expect(descreverRegistro('hipotese', 'HY-a-1', { termosRotulos: [], objeto: 'OB-a-1' }, numeroDe)).toBe('Hipótese em CA00023')
      expect(descreverRegistro('regiao', 'RG-a-1', { elemento: 'cauda', objeto: 'CA00002' })).toBe('Região «cauda» em CA00002')
    })
    it('objeto SKC: o número de agora (ou o pedido, ou o título); imagem e sítio do objeto: o objeto', () => {
      expect(descreverRegistro('objeto', 'OB-a-1', { pedido: 'CA00005' }, numeroDe)).toBe('Objeto SKC CA00023')
      expect(descreverRegistro('objeto', 'OB-a-2', { pedido: 'CA00005' }, numeroDe)).toBe('Objeto SKC CA00005')
      expect(descreverRegistro('objeto', 'OB-a-3', { titulo: 'Selo TESTE' })).toBe('Objeto SKC «Selo TESTE»')
      expect(descreverRegistro('imagem', 'IM-a-1', { alvo: 'OB-a-1' }, numeroDe)).toBe('Imagem de CA00023')
      expect(descreverRegistro('item-sitio', 'CA00001', {})).toBe('Sítio do objeto CA00001')
    })
    it('sem os campos (ou campos que não servem), o id', () => {
      expect(descreverRegistro('nota', 'NT-a-1')).toBe('Nota NT-a-1')
      expect(descreverRegistro('colecao', 'CO-a-1', { nome: 3 })).toBe('Coleção CO-a-1')
      expect(descreverRegistro('comparar', 'bandeja', {})).toBe('Bandeja de comparação bandeja')
    })
    it('o caminho da tela do registro, quando existe', () => {
      expect(caminhoDoRegistro('nota', 'NT-a-1')).toBe('/nota/NT-a-1')
      expect(caminhoDoRegistro('colecao', 'CO-a-1')).toBe('/grupo/CO-a-1')
      expect(caminhoDoRegistro('objeto', 'OB-a-1')).toBe('/item/OB-a-1')
      expect(caminhoDoRegistro('sitio', 'SI-a-1')).toBe('/sitio/SI-a-1')
      expect(caminhoDoRegistro('verbete', 'GL-a-1')).toBe('/verbete/GL-a-1')
      expect(caminhoDoRegistro('hipotese', 'HY-a-1', { objeto: 'CA00002' })).toBe('/item/CA00002?hipotese=HY-a-1')
      expect(caminhoDoRegistro('regiao', 'RG-a-1', { objeto: 'CA00002' })).toBe('/item/CA00002')
      expect(caminhoDoRegistro('item-sitio', 'CA00001')).toBe('/item/CA00001')
      expect(caminhoDoRegistro('comparar', 'bandeja')).toBeNull()
      expect(caminhoDoRegistro('hipotese', 'HY-a-1', {})).toBeNull()
    })
  })
})

describe('removerChaves (texto técnico que a pessoa copia e manda a outra)', () => {
  it('troca «Bearer …» e os tokens «sl.…» do Dropbox por «[removido]»', () => {
    expect(removerChaves('resposta 400: Authorization: Bearer sl.u.ABCdef-123_xyz mais')).toBe('resposta 400: Authorization: [removido] mais')
    expect(removerChaves('bearer abc.def=')).toBe('[removido]')
    expect(removerChaves('token sl.B1gLongToken_x-y e outro sl.CurtoDemais1')).toBe('token [removido] e outro [removido]')
  })
  it('«sl.u.…» sozinho, sem «Bearer», sai inteiro (N-2)', () => {
    expect(removerChaves('token sl.u.SECRETXXXXXXXX')).toBe('token [removido]')
    expect(removerChaves('token sl.u.AbCdEf-123.ghi_jkl fim')).toBe('token [removido] fim')
    expect(removerChaves('access_token=sl.u.XYZXYZXYZXYZ')).toBe('access_token=[removido]')
    expect(removerChaves('Bearer: sl.u.XXXXXXXXXXXX')).toBe('Bearer: [removido]')
  })
  it('«Bearer sl.u.…» sai inteiro (N-2)', () => {
    expect(removerChaves('Authorization: Bearer sl.u.XXXXXXXXXXXXXXXX ok')).toBe('Authorization: [removido] ok')
  })
  it('não estraga domínios com «.sl.» nem a palavra «bearer» solta (N-2)', () => {
    expect(removerChaves('https://cdn.sl.example.com/a')).toBe('https://cdn.sl.example.com/a')
    expect(removerChaves('em x.sl.algumacoisa')).toBe('em x.sl.algumacoisa')
    expect(removerChaves('the bearer of bad news')).toBe('the bearer of bad news')
    expect(removerChaves('O portador do texto e a leitura de sl. no meio da frase seguem iguais.')).toBe('O portador do texto e a leitura de sl. no meio da frase seguem iguais.')
  })
  it('«sl.» com menos de 10 caracteres depois (nomes de arquivo) fica como está (m-2)', () => {
    expect(removerChaves('arquivo sl.txt')).toBe('arquivo sl.txt')
    expect(removerChaves('arquivo sl.txt e sl.pdf')).toBe('arquivo sl.txt e sl.pdf')
    expect(removerChaves('arquivo sl.123456789')).toBe('arquivo sl.123456789')
    expect(removerChaves('arquivo sl.1234567890')).toBe('arquivo [removido]')
  })
  it('deixa o resto como está', () => {
    const t = 'Não foi possível falar com o Dropbox (resposta 400: other/..); fossil.x e Bearing'
    expect(removerChaves(t)).toBe(t)
  })
})
