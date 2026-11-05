import { hlc, T0, A } from '../../tests/suporte/eventosDeTeste'
import { cabecaDaNota, caminhoDaNota, caminhoDaNotaNova, dataDaNota, resumoDaNota, rotuloDaNotaNova, rotuloDoCampo } from './formato'

const dois = (n: number) => String(n).padStart(2, '0')
const dia = (ms: number) => `${dois(new Date(ms).getDate())}/${dois(new Date(ms).getMonth() + 1)}/${new Date(ms).getFullYear()}`
const nota = (extra: { ordinal?: number; rascunho?: boolean; ms?: number } = {}) => ({ ordinal: extra.ordinal ?? 1, rascunho: extra.rascunho ?? false, criadaEm: hlc(extra.ms ?? T0, 0, A) })

describe('formato das notas', () => {
  it('a data é a da criação, no relógio do aparelho, dd/mm/aaaa', () => {
    expect(dataDaNota(nota())).toBe(dia(T0))
    expect(dataDaNota(nota({ ms: T0 + 40 * 24 * 3600 * 1000 }))).toBe(dia(T0 + 40 * 24 * 3600 * 1000))
    expect(dataDaNota(nota())).toMatch(/^\d\d\/\d\d\/\d{4}$/)
  })
  it('a cabeça é "[n] · data", com "· rascunho" até a nota ser salva', () => {
    expect(cabecaDaNota(nota({ ordinal: 3 }))).toBe(`[3] · ${dia(T0)}`)
    expect(cabecaDaNota(nota({ rascunho: true }))).toBe(`[1] · ${dia(T0)} · rascunho`)
  })
  it('o rótulo do campo começa por "Nota"; o da nota nova é o próximo número e o dia de hoje', () => {
    expect(rotuloDoCampo(nota({ ordinal: 2, rascunho: true }))).toBe(`Nota [2] · ${dia(T0)} · rascunho`)
    expect(rotuloDaNotaNova(4, T0)).toBe(`Nota [4] · ${dia(T0)}`)
  })
  it('o resumo é uma linha só, sem espaços sobrando, cortada com reticências', () => {
    expect(resumoDaNota('  uma\n\n nota   curta ')).toBe('uma nota curta')
    const longo = resumoDaNota('palavra '.repeat(100), 20)
    expect(longo.length).toBeLessThanOrEqual(20)
    expect(longo.endsWith('…')).toBe(true)
    expect(longo).not.toMatch(/\s…$/)
  })
  it('os caminhos escapam o que vem do usuário', () => {
    expect(caminhoDaNotaNova('objeto', 'CA00001')).toBe('/nota/nova?alvoTipo=objeto&alvo=CA00001')
    expect(caminhoDaNotaNova('sitio', 'A&B=1')).toBe('/nota/nova?alvoTipo=sitio&alvo=A%26B%3D1')
    expect(caminhoDaNota('NT-aaaaaaaa-1')).toBe('/nota/NT-aaaaaaaa-1')
    expect(caminhoDaNota('a/b')).toBe('/nota/a%2Fb')
  })
})
