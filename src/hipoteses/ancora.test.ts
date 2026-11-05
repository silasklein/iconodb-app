import { shaDoTrecho } from '../notas/ancora'
import { ancoraDoTrecho, conferirAncora, posicaoNoTexto, reconferirAncora } from './ancora'

const TEXTO = 'No verso está o sinal 𓀀 ao lado de um leão-de-teste de cauda erguida; talvez uma estrela de prova.'

describe('ancoraDoTrecho: o trecho selecionado vira âncora em code points, com o sha do texto inteiro (§7.6)', () => {
  it('converte UTF-16 em code points (o 𓀀 ocupa 2 unidades e 1 code point) e guarda o trecho', async () => {
    const i16 = TEXTO.indexOf('leão-de-teste')
    const a = await ancoraDoTrecho({ fonte: 'PA-TESTE-0002-cat-1', lingua: 'pt', texto: TEXTO, inicio: i16, fim: i16 + 'leão-de-teste'.length })
    expect(a).toEqual({ fonte: 'PA-TESTE-0002-cat-1', lingua: 'pt', inicio: i16 - 1, fim: i16 - 1 + 13, trecho: 'leão-de-teste', sha: await shaDoTrecho(TEXTO) })
    expect([...TEXTO].slice(a!.inicio, a!.fim).join('')).toBe('leão-de-teste')
  })

  it('tira os espaços das pontas da seleção (o duplo clique pega o espaço); só espaços não é trecho', async () => {
    const i16 = TEXTO.indexOf(' talvez ')
    const a = await ancoraDoTrecho({ fonte: 'PA-X', lingua: 'pt', texto: TEXTO, inicio: i16, fim: i16 + ' talvez '.length })
    expect(a?.trecho).toBe('talvez')
    expect(await ancoraDoTrecho({ fonte: 'PA-X', lingua: 'pt', texto: TEXTO, inicio: 2, fim: 3 })).toBeNull()
    expect(await ancoraDoTrecho({ fonte: 'PA-X', lingua: 'pt', texto: TEXTO, inicio: 5, fim: 5 })).toBeNull()
  })

  it('não corta um par de surrogates ao meio', async () => {
    const i16 = TEXTO.indexOf('𓀀')
    const a = await ancoraDoTrecho({ fonte: 'PA-X', lingua: 'pt', texto: TEXTO, inicio: i16 + 1, fim: i16 + 2 })
    expect(a?.trecho).toBe('𓀀')
  })
})

describe('posicaoNoTexto: onde desenhar a âncora no texto de agora', () => {
  it('no mesmo lugar se o texto lá é o trecho; senão, a ocorrência mais perto; sumiu, null', async () => {
    const i16 = TEXTO.indexOf('talvez')
    const a = (await ancoraDoTrecho({ fonte: 'PA-X', lingua: 'pt', texto: TEXTO, inicio: i16, fim: i16 + 6 }))!
    expect(posicaoNoTexto(a, TEXTO)).toEqual({ inicio: a.inicio, fim: a.fim })
    const novo = `Revisto: ${TEXTO}`
    expect(posicaoNoTexto(a, novo)).toEqual({ inicio: a.inicio + 9, fim: a.fim + 9 })
    expect(posicaoNoTexto(a, 'Outro texto sem a palavra.')).toBeNull()
    // Duas ocorrências: a mais perto da posição antiga.
    const dois = 'talvez aqui; e depois talvez ali'
    const b = { ...a, inicio: 22, fim: 28 }
    expect(posicaoNoTexto(b, dois)).toEqual({ inicio: 22, fim: 28 })
    expect(posicaoNoTexto({ ...b, inicio: 1, fim: 7 }, dois)).toEqual({ inicio: 0, fim: 6 })
  })
})

describe('conferirAncora e reconferirAncora: "o texto da fonte mudou"', () => {
  it('o sha do texto normalizado: espaços a mais não contam; outra palavra conta', async () => {
    const a = (await ancoraDoTrecho({ fonte: 'PA-X', lingua: 'pt', texto: TEXTO, inicio: 0, fim: 2 }))!
    expect(await conferirAncora(a, TEXTO)).toBe('ok')
    expect(await conferirAncora(a, ` ${TEXTO.replace(' ', '\n  ')} `)).toBe('ok')
    expect(await conferirAncora(a, TEXTO.replace('verso', 'reverso'))).toBe('mudou')
  })

  it('"Já conferi": o sha de agora e a posição achada (o trecho que sumiu fica onde estava)', async () => {
    const i16 = TEXTO.indexOf('talvez')
    const a = (await ancoraDoTrecho({ fonte: 'PA-X', lingua: 'pt', texto: TEXTO, inicio: i16, fim: i16 + 6 }))!
    const novo = `Revisto: ${TEXTO}`
    const r = await reconferirAncora(a, novo)
    expect(r).toEqual({ ...a, inicio: a.inicio + 9, fim: a.fim + 9, sha: await shaDoTrecho(novo) })
    expect(await conferirAncora(r, novo)).toBe('ok')
    const sumiu = await reconferirAncora(a, 'curto')
    expect(sumiu).toEqual({ ...a, sha: await shaDoTrecho('curto') })
  })
})
