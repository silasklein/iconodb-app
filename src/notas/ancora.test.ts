import { avaliarAncoras, ancorasDe, normalizarTrecho, reconferir, shaDoTrecho, validarAncoras } from './ancora'

describe('normalizarTrecho', () => {
  it('NFC, espaços em um só, sem espaço nas pontas', () => {
    expect(normalizarTrecho('  Der Probe-\n\tlöwe  ')).toBe('Der Probe- löwe')
    // o "ö" decomposto vira o composto
    expect(normalizarTrecho('löwe')).toBe(normalizarTrecho('löwe'))
  })
})

describe('shaDoTrecho: SHA-256 do texto normalizado', () => {
  it('é o SHA-256 conhecido (hex, 64 caracteres)', async () => {
    // sha256("abc")
    expect(await shaDoTrecho('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('espaços e a forma do Unicode não mudam o sha; uma palavra diferente muda', async () => {
    const a = await shaDoTrecho('Der Testlöwe   steht.')
    expect(await shaDoTrecho('Der  Testlöwe\nsteht. ')).toBe(a)
    expect(await shaDoTrecho('Der Testlöwe liegt.')).not.toBe(a)
  })

  it('o texto vazio tem sha (e é o de ""): a ausência de texto também pode mudar', async () => {
    expect(await shaDoTrecho('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})

describe('ancorasDe', () => {
  it('um item {p, sha} por trecho, ordenado pelo id do trecho', async () => {
    const a = await ancorasDe([
      { id: 'PA-2', texto: 'segundo' },
      { id: 'PA-1', texto: 'primeiro' },
    ])
    expect(a.map((x) => x.p)).toEqual(['PA-1', 'PA-2'])
    expect(a[0]!.sha).toBe(await shaDoTrecho('primeiro'))
  })
  it('sem trechos, lista vazia', async () => expect(await ancorasDe([])).toEqual([]))
})

describe('validarAncoras: o campo vem de um evento (pode estar malformado)', () => {
  it('aceita a lista certa e descarta o que não tem a forma', () => {
    const sha = 'a'.repeat(64)
    expect(validarAncoras([{ p: 'PA-1', sha }, { p: 3, sha }, { p: 'PA-2' }, null, 'x', { p: 'PA-3', sha: 'curto' }])).toEqual([{ p: 'PA-1', sha }])
    expect(validarAncoras(undefined)).toEqual([])
    expect(validarAncoras('texto')).toEqual([])
  })
})

describe('avaliarAncoras: o texto da fonte mudou?', () => {
  const guardadas = async () => ancorasDe([{ id: 'PA-1', texto: 'um dois' }, { id: 'PA-2', texto: 'três' }])

  it('tudo igual: ok', async () => {
    expect(await avaliarAncoras(await guardadas(), [{ id: 'PA-1', texto: 'um  dois' }, { id: 'PA-2', texto: 'três' }])).toEqual({ estado: 'ok', mudaram: [], sumiram: [] })
  })
  it('um trecho com texto diferente: mudou', async () => {
    expect(await avaliarAncoras(await guardadas(), [{ id: 'PA-1', texto: 'um dois!' }, { id: 'PA-2', texto: 'três' }])).toEqual({ estado: 'mudou', mudaram: ['PA-1'], sumiram: [] })
  })
  it('um trecho que já não está no pacote: sumiu', async () => {
    expect(await avaliarAncoras(await guardadas(), [{ id: 'PA-2', texto: 'três' }])).toEqual({ estado: 'mudou', mudaram: [], sumiram: ['PA-1'] })
  })
  it('sem âncoras (nota sem trecho), nunca há aviso', async () => {
    expect(await avaliarAncoras([], [{ id: 'PA-1', texto: 'x' }])).toEqual({ estado: 'ok', mudaram: [], sumiram: [] })
  })
  it('trechos novos no objeto não são mudança do que foi ancorado', async () => {
    expect((await avaliarAncoras(await guardadas(), [{ id: 'PA-1', texto: 'um dois' }, { id: 'PA-2', texto: 'três' }, { id: 'PA-3', texto: 'novo' }])).estado).toBe('ok')
  })
})

describe('reconferir ("Já conferi")', () => {
  const guardadas = async () => ancorasDe([{ id: 'PA-1', texto: 'um dois' }, { id: 'PA-2', texto: 'três' }, { id: 'PA-3', texto: 'quatro' }])

  it('o trecho que mudou ganha o sha de agora; o que sumiu sai; o que não mudou fica como está', async () => {
    const antes = await guardadas()
    const depois = await reconferir(antes, [{ id: 'PA-1', texto: 'um dois, revisto' }, { id: 'PA-3', texto: 'quatro' }])
    expect(depois.map((a) => a.p)).toEqual(['PA-1', 'PA-3'])
    expect(depois[0]!.sha).toBe(await shaDoTrecho('um dois, revisto'))
    expect(depois[1]).toEqual(antes[2])
  })
  it('depois de reconferir, a avaliação diz ok', async () => {
    const atuais = [{ id: 'PA-1', texto: 'outro' }, { id: 'PA-3', texto: 'quatro' }]
    expect((await avaliarAncoras(await reconferir(await guardadas(), atuais), atuais)).estado).toBe('ok')
  })
})
