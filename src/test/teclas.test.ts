import { registrarAtalhos } from '../app/atalhos'
import { apertarQuandoPronto, lerTecla } from './teclas'

describe('apertarQuandoPronto (auxiliar dos testes)', () => {
  it('lê a tecla do catálogo: o último «+» separa a letra só quando há texto antes dele, então «+» também serve', () => {
    expect(lerTecla('a')).toEqual({ letra: 'a', modificadores: [] })
    expect(lerTecla('Shift+H')).toEqual({ letra: 'H', modificadores: ['Shift'] })
    expect(lerTecla('Control+Shift+Z')).toEqual({ letra: 'Z', modificadores: ['Control', 'Shift'] })
    expect(lerTecla('+')).toEqual({ letra: '+', modificadores: [] })
    expect(lerTecla('Shift++')).toEqual({ letra: '+', modificadores: ['Shift'] })
  })

  it('aperta «+» (o zoom do mapa) uma vez, depois de o mapa dela estar registrado', async () => {
    const aproximar = vi.fn()
    let desfazer: (() => void) | null = null
    setTimeout(() => (desfazer = registrarAtalhos({ '+': aproximar }, 'mapa')), 20) // registra um pouco depois, como um efeito
    expect(await apertarQuandoPronto('+', 'mapa')).toBe(false) // a ação tomou a tecla
    expect(aproximar).toHaveBeenCalledTimes(1)
    desfazer!()
  })
})
