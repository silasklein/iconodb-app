/**
 * Revisão 1, I1: a forma em uso só substitui o texto de um termo quando o termo está como o pacote o escreve. Na tradução o
 * termo é a forma FLEXIONADA da frase ("leões-de-teste", "figuras denteadas"); a regra é a do `refresh_terms` do pipeline
 * (`forma_corrente`: `pt_text` quando existe, senão `pt`; sem diferenciar caixa, mas diferenciando diacríticos):
 * - o trecho é igual (sem caixa) à forma `pt` do pacote E o verbete não tem `pt_text` próprio: mostra a forma em uso;
 * - senão o texto fica como foi escrito, e a forma em uso aparece na dica e no nome acessível do termo.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import type { CampoDoCatalogo, Termo } from '../banco/tipos'
import { Leitura } from '../item/Leitura'
import { Catalogo } from '../item/Secoes'
import { registrar } from '../usuario/estado'
import { exibirTermo } from './exibirTermo'
import { formasDoPacote } from './formasDoPacote'

vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
})
afterAll(() => usarMotor(null))

const formaEmUso = (id: string, forma: string | null) => registrar('verbete', id, 'alterar', { formaEmUso: forma })

describe('formasDoPacote: o pt e o pt_text de cada verbete do pacote', () => {
  it('traz os dois (pt_text só onde há)', async () => {
    const f = await formasDoPacote()
    expect(f.get('GL-900003')).toEqual({ pt: 'olhos (forma de botão)', ptTexto: 'olho em forma de botão' })
    expect(f.get('GL-900001')).toEqual({ pt: 'leão-de-teste', ptTexto: null })
    expect(f.size).toBe(10) // com o GL-900010, publicado da camada do usuário (Tarefa 16)
  })
})

describe('exibirTermo: a regra do refresh_terms', () => {
  const pt = (p: string, ptTexto: string | null = null) => ({ pt: p, ptTexto })

  it('sem forma em uso: o texto, sem dica', () => {
    expect(exibirTermo('leões-de-teste', undefined, pt('leão-de-teste'))).toMatchObject({ texto: 'leões-de-teste', dica: null, nome: null, apoio: null })
  })

  it('o trecho igual à forma do pacote (sem caixa) é substituído; o começo de frase mantém a maiúscula', () => {
    expect(exibirTermo('leão-de-teste', 'cria de leão', pt('leão-de-teste'))).toMatchObject({ texto: 'cria de leão', dica: 'Na tradução: leão-de-teste', nome: 'cria de leão (na tradução: leão-de-teste)' })
    expect(exibirTermo('Leão-de-Teste', 'cria de leão', pt('leão-de-teste'))).toMatchObject({ texto: 'Cria de leão', dica: 'Na tradução: Leão-de-Teste', nome: 'Cria de leão (na tradução: Leão-de-Teste)' })
    expect(exibirTermo('Selo de teste', 'selo de prova', pt('selo de teste'))).toMatchObject({ texto: 'Selo de prova', dica: 'Na tradução: Selo de teste', nome: 'Selo de prova (na tradução: Selo de teste)' })
  })

  it('um plural ou outra flexão fica como foi escrito, e a forma em uso vai na dica', () => {
    expect(exibirTermo('leões-de-teste', 'cria de leão', pt('leão-de-teste'))).toMatchObject({ texto: 'leões-de-teste', dica: 'Forma em uso: cria de leão', nome: 'leões-de-teste (forma em uso: cria de leão)' })
    expect(exibirTermo('figuras denteadas', 'figura serrilhada', pt('figura denteada'))).toMatchObject({ texto: 'figuras denteadas', dica: 'Forma em uso: figura serrilhada', nome: 'figuras denteadas (forma em uso: figura serrilhada)' })
  })

  it('diacríticos contam: "leao-de-teste" não é "leão-de-teste"', () => {
    expect(exibirTermo('leao-de-teste', 'cria de leão', pt('leão-de-teste')).dica).toBe('Forma em uso: cria de leão')
  })

  it('um verbete com pt_text próprio nunca é substituído (a forma do verbete é a etiqueta, com glosa)', () => {
    expect(exibirTermo('olho em forma de botão', 'olhos (forma de gota)', pt('olhos (forma de botão)', 'olho em forma de botão'))).toMatchObject({
      texto: 'olho em forma de botão',
      dica: 'Forma em uso: olhos (forma de gota)',
      nome: 'olho em forma de botão (forma em uso: olhos (forma de gota))',
    })
    // mesmo um trecho igual ao `pt` (a etiqueta) não é trocado quando há `pt_text`: o texto corrido segue `pt_text`
    expect(exibirTermo('olhos (forma de botão)', 'olhos (forma de gota)', pt('olhos (forma de botão)', 'olho em forma de botão'))).toMatchObject({
      texto: 'olhos (forma de botão)',
      dica: 'Forma em uso: olhos (forma de gota)',
      nome: 'olhos (forma de botão) (forma em uso: olhos (forma de gota))',
    })
    // o pt_text igual ao pt não é "próprio": vale a regra do pt
    expect(exibirTermo('leão', 'cria', pt('leão', 'leão')).texto).toBe('cria')
  })

  it('sem o verbete do pacote à mão (ainda carregando, ou sem pacote): o texto fica e a dica traz a forma', () => {
    expect(exibirTermo('leão-de-teste', 'cria de leão', undefined)).toMatchObject({ texto: 'leão-de-teste', dica: 'Forma em uso: cria de leão', nome: 'leão-de-teste (forma em uso: cria de leão)' })
  })
})

function desenhar(texto: string, termos: Termo[], extra: Partial<Parameters<typeof Leitura>[0]> = {}) {
  return render(
    <MemoryRouter>
      <Leitura fonte="TESTE I: 9" publicacao="TESTE" texto={texto} original="Original." termos={termos} ancoras={[]} trechoId="PA-TESTE-I.S.9-ovw-1" {...extra} />
    </MemoryRouter>,
  )
}

describe('Leitura: as frases do pacote sintético (flexões reais)', () => {
  const S9 = 'No Calcolítico da fase de teste aparecem leões-de-teste e figuras denteadas em pingentes de prova (1–3).'
  const T9: Termo[] = [
    { glId: 'GL-900001', inicio: 41, fim: 55 },
    { glId: 'GL-900002', inicio: 58, fim: 75 },
  ]

  it('"leões-de-teste" e "figuras denteadas" ficam como estão; o termo diz a forma em uso na dica e no nome acessível', async () => {
    await formaEmUso('GL-900001', 'cria de leão')
    await formaEmUso('GL-900002', 'figura serrilhada')
    const { container } = desenhar(S9, T9)
    const leoes = await screen.findByRole('link', { name: 'leões-de-teste (forma em uso: cria de leão)' })
    expect(leoes).toHaveTextContent(/^leões-de-teste$/)
    expect(leoes).toHaveAttribute('data-tip', 'Forma em uso: cria de leão')
    expect(leoes).toHaveAttribute('href', '/verbete/GL-900001')
    const figuras = screen.getByRole('link', { name: 'figuras denteadas (forma em uso: figura serrilhada)' })
    expect(figuras).toHaveTextContent(/^figuras denteadas$/)
    expect(container.querySelector('[data-trecho-fonte]')!.textContent).toBe(S9)
    // as posições seguem as do texto guardado
    expect(leoes).toHaveAttribute('data-b', String(S9.indexOf('leões')))
    expect(leoes).toHaveAttribute('data-b-fim', String(S9.indexOf('leões') + 'leões-de-teste'.length))
  })

  it('"selos de teste" (GL-900009) também', async () => {
    await formaEmUso('GL-900009', 'selo de prova')
    desenhar('Os selos de teste da época de transição trazem padrões denteados e estrelas de prova (4–6).', [{ glId: 'GL-900009', inicio: 3, fim: 17 }], { trechoId: 'PA-TESTE-I.S.19-ovw-1' })
    expect(await screen.findByRole('link', { name: 'selos de teste (forma em uso: selo de prova)' })).toHaveTextContent(/^selos de teste$/)
  })

  it('o trecho igual ao pt (com outra caixa) é substituído: "Selo de teste" → "Selo de prova"', async () => {
    desenhar('Selo de teste com estrela de prova e um filhote de leão-de-teste.', [{ glId: 'GL-900009', inicio: 0, fim: 13 }], { trechoId: 'PA-TESTE-0005-cat-1' })
    const link = await screen.findByRole('link', { name: 'Selo de prova (na tradução: Selo de teste)' })
    // trocar o trecho pode mudar gênero e número: a dica diz o que o tradutor escreveu
    expect(link).toHaveAttribute('data-tip', 'Na tradução: Selo de teste')
    expect(link).toHaveTextContent(/^Selo de prova$/)
  })

  it('GL-900003 tem pt_text: o texto corrido nunca recebe a forma de verbete editada (com glosa)', async () => {
    await formaEmUso('GL-900003', 'olhos (forma de gota)')
    const t = 'Uma figura denteada com olho em forma de botão está entre duas linhas de teste.'
    desenhar(t, [{ glId: 'GL-900002', inicio: 4, fim: 19 }, { glId: 'GL-900003', inicio: 24, fim: 46 }], { trechoId: 'PA-TESTE-0003-cat-1' })
    const olho = await screen.findByRole('link', { name: 'olho em forma de botão (forma em uso: olhos (forma de gota))' })
    expect(olho).toHaveTextContent(/^olho em forma de botão$/)
    // o outro termo (GL-900002, igual ao pt) é substituído
    expect(screen.getByRole('link', { name: 'figura serrilhada (na tradução: figura denteada)' })).toBeInTheDocument()
  })

  it('dentro de uma âncora, o termo marcado que não é substituído leva a forma em uso para o leitor de tela e na dica', async () => {
    const ancora = { hipoteseId: 'HY-900001', glId: 'GL-900001', inicio: 41, fim: 55, nivel: 'iconographic' as const, modalidade: 'probable' as const }
    desenhar(S9, [T9[0]!], { ancoras: [ancora] })
    const a = await screen.findByRole('link', { name: /^leões-de-teste/ })
    expect(a).toHaveClass('ancora')
    const marcado = within(a).getByText('leões-de-teste')
    expect(marcado).toHaveClass('termo-marcado')
    expect(marcado).toHaveAttribute('data-tip', 'Forma em uso: cria de leão')
    expect(a).toHaveAccessibleName('leões-de-teste, forma em uso: cria de leão, hipótese: iconográfico, provável')
    // o texto para o leitor de tela fica fora das posições do texto guardado
    expect(marcado.querySelector('.so-leitor')).not.toBeNull()
  })

  it('dentro de uma âncora, o texto para o leitor de tela não é cortado no primeiro "(" (T17-B-6)', async () => {
    // trecho trocado: a forma tem "(" e o trecho do tradutor também
    await formaEmUso('GL-900002', 'figura serrilhada (de teste)')
    const t = 'No Calcolítico aparecem figura denteada em pingentes.'
    const i = t.indexOf('figura denteada')
    const a1 = { hipoteseId: 'HY-900001', glId: 'GL-900002', inicio: i, fim: i + 15, nivel: 'iconographic' as const, modalidade: 'probable' as const }
    const r1 = desenhar(t, [{ glId: 'GL-900002', inicio: i, fim: i + 15 }], { ancoras: [a1], trechoId: 'PA-TESTE-0003-cat-1' })
    const m1 = await waitFor(() => {
      const el = r1.container.querySelector('.termo-marcado .so-leitor')
      expect(el).not.toBeNull()
      return el!
    })
    expect(m1.textContent).toBe(', na tradução: figura denteada')
    r1.unmount()
    // trecho não trocado: a forma em uso tem "("
    await formaEmUso('GL-900003', 'olhos (forma de gota)')
    const t2 = 'Uma figura com olho em forma de botão ali.'
    const j = t2.indexOf('olho em')
    const a2 = { hipoteseId: 'HY-900001', glId: 'GL-900003', inicio: j, fim: j + 22, nivel: 'iconographic' as const, modalidade: 'probable' as const }
    const r2 = desenhar(t2, [{ glId: 'GL-900003', inicio: j, fim: j + 22 }], { ancoras: [a2], trechoId: 'PA-TESTE-0003-cat-1' })
    const m2 = await waitFor(() => {
      const el = r2.container.querySelector('.termo-marcado .so-leitor')
      expect(el).not.toBeNull()
      return el!
    })
    expect(m2.textContent).toBe(', forma em uso: olhos (forma de gota)')
  })
})

describe('Catálogo (Secoes): a mesma regra', () => {
  it('uma flexão fica, a forma do pacote é substituída', async () => {
    await formaEmUso('GL-900001', 'cria de leão')
    const texto = 'Leão-de-teste e leões-de-teste.'
    const campo: CampoDoCatalogo = {
      itemId: 'IT',
      categoria: 5,
      unidade: 'U',
      literal: 'x',
      texto,
      termos: [
        { glId: 'GL-900001', inicio: 0, fim: 13 },
        { glId: 'GL-900001', inicio: 16, fim: 30 },
      ],
      estado: null,
      desatualizada: false,
    }
    render(
      <MemoryRouter>
        <Catalogo campos={[campo]} idioma="pt" />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('link', { name: 'Cria de leão (na tradução: Leão-de-teste)' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'leões-de-teste (forma em uso: cria de leão)' })).toBeInTheDocument()
  })
})
