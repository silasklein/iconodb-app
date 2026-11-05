import { chaveDoCaso, chavesDosCasos, resumoDoTexto } from './chave'

const caso = { tipo: 'citacao_nao_resolvida', entidade: 'passage', entidadeId: 'PA-TESTE-I.S.9-cap-1', detalhe: 'Fantasma 1888: 3: obra fora da bibliografia' }

describe('a chave estável de um caso da fila', () => {
  it('depende do que o caso diz, não da ordem nem do id numérico da fila', () => {
    expect(chaveDoCaso(caso)).toBe(chaveDoCaso({ ...caso }))
    expect(chaveDoCaso(caso)).toMatch(/^citacao_nao_resolvida~passage~PA-TESTE-I\.S\.9-cap-1~[0-9a-f]{14}$/)
    expect(chaveDoCaso({ ...caso, detalhe: 'Outra 1999: 3: obra fora da bibliografia' })).not.toBe(chaveDoCaso(caso))
    expect(chaveDoCaso({ ...caso, entidadeId: null })).toContain('~~')
  })

  it('o resumo do texto é o mesmo em NFC e NFD e muda com um caractere', () => {
    expect(resumoDoTexto('Maḥteṣ')).toBe(resumoDoTexto('Maḥteṣ'.normalize('NFD')))
    expect(resumoDoTexto('a')).not.toBe(resumoDoTexto('b'))
    expect(resumoDoTexto('')).toMatch(/^[0-9a-f]{14}$/)
  })

  it('casos idênticos ganham sufixo, na ordem; os diferentes não', () => {
    const outro = { ...caso, detalhe: 'x' }
    const chaves = chavesDosCasos([caso, outro, caso, caso])
    expect(new Set(chaves).size).toBe(4)
    expect(chaves[0]).toBe(chaveDoCaso(caso))
    expect(chaves[1]).toBe(chaveDoCaso(outro))
    expect(chaves[2]).toBe(`${chaveDoCaso(caso)}~2`)
    expect(chaves[3]).toBe(`${chaveDoCaso(caso)}~3`)
  })
})
