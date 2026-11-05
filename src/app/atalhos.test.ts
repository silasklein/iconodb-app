import { act } from '@testing-library/react'
import {
  CATALOGO,
  CONTEXTOS,
  declaracoesDoContexto,
  rotuloDaTecla,
  registrarAtalhos,
  tecladoAtivo,
  type Contexto,
} from './atalhos'

const teclar = (key: string, opcoes: KeyboardEventInit = {}, alvo: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opcoes })
  alvo.dispatchEvent(e)
  return e
}

let desfazer: (() => void)[] = []
const registrar = (mapa: Record<string, () => void | false>, contexto: Contexto, opcoes?: Parameters<typeof registrarAtalhos>[2]) => {
  const f = registrarAtalhos(mapa, contexto, opcoes)
  desfazer.push(f)
  return f
}
afterEach(() => {
  desfazer.forEach((f) => f())
  desfazer = []
  document.body.innerHTML = ''
})

describe('registro de atalhos: um só ouvinte no documento', () => {
  it('liga ao registrar o primeiro mapa e desliga ao desfazer o último', () => {
    expect(tecladoAtivo()).toBe(false)
    const a = registrar({ '/': () => {} }, 'global')
    const b = registrar({ l: () => {} }, 'item')
    expect(tecladoAtivo()).toBe(true)
    a()
    expect(tecladoAtivo()).toBe(true)
    b()
    expect(tecladoAtivo()).toBe(false)
  })

  it('chama a ação da tecla, sem distinguir maiúscula de minúscula, e cancela o padrão do navegador', () => {
    const l = vi.fn()
    registrar({ l }, 'item')
    expect(teclar('l').defaultPrevented).toBe(true)
    teclar('L', { shiftKey: true })
    expect(l).toHaveBeenCalledTimes(2)
  })

  it('desfazer o registro tira a ação', () => {
    const l = vi.fn()
    const desfaz = registrar({ l }, 'item')
    desfaz()
    teclar('l')
    expect(l).not.toHaveBeenCalled()
  })

  it('recusa uma tecla que o catálogo não declara para o contexto', () => {
    expect(() => registrarAtalhos({ q: () => {} }, 'item')).toThrow(/não declarado/)
    // "h" é do item, não do visualizador
    expect(() => registrarAtalhos({ h: () => {} }, 'visualizador')).toThrow(/não declarado/)
  })
})

describe('em produção', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('uma tecla fora do catálogo não derruba o app: registra o erro, ignora só essa tecla e mantém as outras', () => {
    vi.stubEnv('MODE', 'production')
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const l = vi.fn()
    const q = vi.fn()
    registrar({ q, l }, 'item')
    expect(erro).toHaveBeenCalledWith(expect.stringContaining('"q"'))
    teclar('q')
    teclar('l')
    expect(q).not.toHaveBeenCalled()
    expect(l).toHaveBeenCalledTimes(1)
    erro.mockRestore()
  })
})

describe('precedência: painel e modal > tela > global', () => {
  it('a tecla vai ao contexto mais específico', () => {
    const global = vi.fn()
    const tela = vi.fn()
    const painel = vi.fn()
    registrar({ Escape: global }, 'global')
    registrar({ Escape: tela }, 'visualizador')
    registrar({ Escape: painel }, 'hipotese')
    teclar('Escape')
    expect(painel).toHaveBeenCalledTimes(1)
    expect(tela).not.toHaveBeenCalled()
    expect(global).not.toHaveBeenCalled()
  })

  it('quando o contexto de cima recusa (false), o de baixo age e a tecla é tomada', () => {
    const cima = vi.fn(() => false as const)
    const baixo = vi.fn()
    registrar({ Escape: baixo }, 'global')
    registrar({ Escape: cima }, 'hipotese')
    const e = teclar('Escape')
    expect(cima).toHaveBeenCalled()
    expect(baixo).toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(true)
  })

  it('se todos recusam, a tecla segue para o navegador', () => {
    registrar({ ArrowLeft: () => false }, 'item')
    expect(teclar('ArrowLeft').defaultPrevented).toBe(false)
  })
})

describe('onde os atalhos não valem', () => {
  it.each(['input', 'textarea', 'select'])('em %s nada dispara', (tag) => {
    const l = vi.fn()
    registrar({ l, '/': l }, 'item')
    const campo = document.body.appendChild(document.createElement(tag))
    teclar('l', {}, campo)
    teclar('/', {}, campo)
    expect(l).not.toHaveBeenCalled()
  })

  it.each(['text', 'search', 'email', 'number', 'password', 'url', 'tel', 'date', 'radio', 'range', ''])('em input de tipo «%s» nada dispara', (tipo) => {
    const l = vi.fn()
    registrar({ l }, 'item')
    const campo = document.body.appendChild(document.createElement('input'))
    if (tipo) campo.type = tipo
    teclar('l', {}, campo)
    expect(l).not.toHaveBeenCalled()
  })

  it.each(['checkbox', 'button', 'submit'])('numa caixa de marcar ou botão (input «%s») as teclas do app valem: o texto não é digitado ali', (tipo) => {
    const l = vi.fn()
    registrar({ l }, 'item')
    const campo = document.body.appendChild(document.createElement('input'))
    campo.type = tipo
    teclar('l', {}, campo)
    expect(l).toHaveBeenCalledTimes(1)
  })

  it.each(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])('numa caixa de marcar ou botão (input) a seta «%s» não é atalho do app: é do navegador', (seta) => {
    const f = vi.fn()
    const l = vi.fn()
    registrar({ [seta]: f, l }, 'item')
    for (const tipo of ['checkbox', 'button']) {
      const campo = document.body.appendChild(document.createElement('input'))
      campo.type = tipo
      const e = teclar(seta, {}, campo)
      expect(e.defaultPrevented).toBe(false)
      // controle positivo: a letra do mesmo registro vale no mesmo campo; e a seta vale fora de um campo
      teclar('l', {}, campo)
    }
    expect(f).not.toHaveBeenCalled()
    expect(l).toHaveBeenCalledTimes(2)
    teclar(seta)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('em campo editável (contenteditable) nada dispara', () => {
    const l = vi.fn()
    registrar({ l }, 'item')
    const div = document.body.appendChild(document.createElement('div'))
    Object.defineProperty(div, 'isContentEditable', { value: true })
    teclar('l', {}, div)
    expect(l).not.toHaveBeenCalled()
  })

  it('Esc num campo vale só para quem é dono do campo (o painel), nunca para a tela de fora', () => {
    const painel = document.body.appendChild(document.createElement('div'))
    const dentro = painel.appendChild(document.createElement('input'))
    const fora = document.body.appendChild(document.createElement('input'))
    const fechar = vi.fn()
    const outra = vi.fn()
    registrar({ Escape: fechar }, 'hipotese', { raiz: () => painel })
    registrar({ Escape: outra }, 'global')
    teclar('Escape', {}, fora)
    expect(fechar).not.toHaveBeenCalled()
    expect(outra).not.toHaveBeenCalled()
    teclar('Escape', {}, dentro)
    expect(fechar).toHaveBeenCalledTimes(1)
  })

  it('com Ctrl, ⌘ ou Alt as teclas ficam com o navegador', () => {
    const l = vi.fn()
    registrar({ l }, 'item')
    teclar('l', { ctrlKey: true })
    teclar('l', { metaKey: true })
    teclar('l', { altKey: true })
    expect(l).not.toHaveBeenCalled()
  })

  it('o evento que alguém já cancelou não é tratado de novo', () => {
    const l = vi.fn()
    registrar({ l }, 'item')
    const antes = (e: Event) => e.preventDefault()
    document.addEventListener('keydown', antes, true)
    teclar('l')
    document.removeEventListener('keydown', antes, true)
    expect(l).not.toHaveBeenCalled()
  })

  describe('com um diálogo modal aberto', () => {
    it('só as ações do próprio modal valem', () => {
      const modal = document.body.appendChild(document.createElement('div'))
      modal.setAttribute('role', 'dialog')
      modal.setAttribute('aria-modal', 'true')
      const dele = vi.fn()
      const tela = vi.fn()
      const global = vi.fn()
      registrar({ Escape: dele }, 'global', { raiz: () => modal })
      registrar({ l: tela }, 'item')
      registrar({ '/': global }, 'global')
      teclar('Escape')
      teclar('l')
      teclar('/')
      expect(dele).toHaveBeenCalledTimes(1)
      expect(tela).not.toHaveBeenCalled()
      expect(global).not.toHaveBeenCalled()
      modal.remove()
      teclar('l')
      expect(tela).toHaveBeenCalledTimes(1)
    })
  })
})

describe('sequências "g" + letra', () => {
  it('g e depois l chama "g l"; sozinha, a letra não vale', () => {
    const glossario = vi.fn()
    const idioma = vi.fn()
    registrar({ 'g l': glossario }, 'global')
    registrar({ l: idioma }, 'item')
    teclar('g')
    teclar('l')
    expect(glossario).toHaveBeenCalledTimes(1)
    // a letra da sequência é engolida mesmo sem ninguém registrado para ela: não é do item
    expect(idioma).not.toHaveBeenCalled()
    teclar('l')
    expect(idioma).toHaveBeenCalledTimes(1)
  })

  it('a segunda tecla de uma sequência declarada é engolida mesmo sem ação registrada', () => {
    const idioma = vi.fn()
    registrar({ l: idioma }, 'item')
    teclar('g')
    teclar('l')
    expect(idioma).not.toHaveBeenCalled()
  })

  it('depois do g, uma tecla que não completa sequência segue normal (setas, H)', () => {
    const h = vi.fn()
    registrar({ h }, 'item')
    teclar('g')
    teclar('h')
    expect(h).toHaveBeenCalledTimes(1)
  })

  it('o g vale uma vez só: a letra seguinte, depois de uma sequência, é comum', () => {
    const idioma = vi.fn()
    registrar({ l: idioma, 'g l': () => {} }, 'item')
    teclar('g')
    teclar('l')
    teclar('l')
    expect(idioma).toHaveBeenCalledTimes(1)
  })

  it('o g espera pouco: passado o prazo, a letra é comum', () => {
    vi.useFakeTimers()
    try {
      const idioma = vi.fn()
      registrar({ l: idioma }, 'item')
      teclar('g')
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      teclar('l')
      expect(idioma).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('g dentro de um campo de texto não arma a sequência', () => {
    const idioma = vi.fn()
    registrar({ l: idioma }, 'item')
    const campo = document.body.appendChild(document.createElement('input'))
    teclar('g', {}, campo)
    teclar('l')
    expect(idioma).toHaveBeenCalledTimes(1)
  })
})

describe('Ctrl/⌘ + tecla: só as combinações declaradas (salvar e sincronizar)', () => {
  it('Ctrl+S e ⌘S chamam a ação e impedem o "salvar página" do navegador', () => {
    const salvar = vi.fn()
    registrar({ 'Control+S': salvar, 'Meta+S': salvar }, 'global')
    expect(teclar('s', { ctrlKey: true }).defaultPrevented).toBe(true)
    expect(teclar('s', { metaKey: true }).defaultPrevented).toBe(true)
    expect(salvar).toHaveBeenCalledTimes(2)
  })

  it('valem num campo de texto e com um diálogo modal aberto', () => {
    const salvar = vi.fn()
    registrar({ 'Control+S': salvar }, 'global')
    const campo = document.createElement('textarea')
    const modal = document.createElement('div')
    modal.setAttribute('aria-modal', 'true')
    document.body.append(campo, modal)
    expect(teclar('s', { ctrlKey: true }, campo).defaultPrevented).toBe(true)
    expect(salvar).toHaveBeenCalledTimes(1)
  })

  it('outras combinações, com Alt ou Shift, e a letra sozinha não são tomadas', () => {
    const salvar = vi.fn()
    registrar({ 'Control+S': salvar, 'Meta+S': salvar }, 'global')
    expect(teclar('p', { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(teclar('s', { ctrlKey: true, altKey: true }).defaultPrevented).toBe(false)
    expect(teclar('S', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false)
    expect(teclar('s').defaultPrevented).toBe(false)
    expect(salvar).not.toHaveBeenCalled()
  })

  it('sem ação registrada, o navegador fica com a tecla', () => {
    registrar({ '/': () => {} }, 'global')
    expect(teclar('s', { ctrlKey: true }).defaultPrevented).toBe(false)
  })

  it('Shift+letra declarada (Shift+H) é outra tecla: não chama a letra sozinha; Shift+letra não declarada vale como a letra', () => {
    const h = vi.fn()
    const H = vi.fn()
    const l = vi.fn()
    registrar({ h, 'Shift+H': H, l }, 'item')
    expect(teclar('H', { shiftKey: true }).defaultPrevented).toBe(true)
    expect(H).toHaveBeenCalledTimes(1)
    expect(h).not.toHaveBeenCalled()
    teclar('h')
    expect(h).toHaveBeenCalledTimes(1)
    teclar('L', { shiftKey: true })
    expect(l).toHaveBeenCalledTimes(1)
    // Num campo de texto, Shift+H é só a letra maiúscula.
    const campo = document.createElement('input')
    document.body.append(campo)
    expect(teclar('H', { shiftKey: true }, campo).defaultPrevented).toBe(false)
    expect(H).toHaveBeenCalledTimes(1)
    expect(rotuloDaTecla('Shift+H')).toBe('Shift+H')
  })

  it('Ctrl+Enter e Ctrl+Z declarados valem como combinação (com ⌘ no Mac)', () => {
    const enviar = vi.fn()
    const desfazerPonto = vi.fn()
    registrar({ 'Control+Enter': enviar, 'Meta+Enter': enviar }, 'global')
    registrar({ 'Control+Z': desfazerPonto, 'Meta+Z': desfazerPonto }, 'visualizador')
    expect(teclar('Enter', { ctrlKey: true }).defaultPrevented).toBe(true)
    expect(teclar('z', { metaKey: true }).defaultPrevented).toBe(true)
    expect(enviar).toHaveBeenCalledTimes(1)
    expect(desfazerPonto).toHaveBeenCalledTimes(1)
    expect(rotuloDaTecla('Control+Enter')).toBe('Ctrl+Enter')
    expect(rotuloDaTecla('Meta+Z')).toBe('⌘Z')
  })

  it('Ctrl+S no meio de uma sequência do g a desfaz (a letra seguinte é comum)', () => {
    const gl = vi.fn()
    registrar({ 'g l': gl, 'Control+S': () => {} }, 'global')
    teclar('g')
    teclar('s', { ctrlKey: true })
    teclar('l')
    expect(gl).not.toHaveBeenCalled()
  })
})

describe('o catálogo declarado (fonte única da lista de atalhos)', () => {
  it('declara os contextos do Global ao Mapa, cada um com ao menos um atalho descrito', () => {
    expect(CONTEXTOS).toEqual(['global', 'lista', 'item', 'hipotese', 'visualizador', 'revisao', 'comparar', 'mapa'])
    for (const c of CONTEXTOS) {
      const lista = declaracoesDoContexto(c)
      expect(lista.length).toBeGreaterThan(0)
      for (const d of lista) {
        expect(d.descricao.length).toBeGreaterThan(3)
        expect(d.teclas.length).toBeGreaterThan(0)
      }
    }
  })

  it('da 2B: o salvar e sincronizar, a nota (N), a coleção (C), a hipótese (Shift+H), as regiões (E) e a comparação (Shift+C); o resto da comparação não tem tecla própria', () => {
    const todas = CATALOGO.flatMap((d) => d.teclas)
    for (const proibida of ['x', '[[']) expect(todas).not.toContain(proibida)
    expect(declaracoesDoContexto('item').find((d) => d.teclas.includes('Shift+C'))).toMatchObject({ descricao: expect.stringMatching(/comparação/) })
    // Shift+C é outra tecla que C (a coleção): cada uma tem a sua declaração.
    expect(declaracoesDoContexto('item').filter((d) => d.teclas.includes('c') || d.teclas.includes('Shift+C'))).toHaveLength(2)
    expect(declaracoesDoContexto('item').find((d) => d.teclas.includes('Shift+H'))).toMatchObject({ descricao: expect.stringMatching(/hipótese SKC/) })
    expect(declaracoesDoContexto('visualizador').find((d) => d.teclas.includes('e'))).toMatchObject({ descricao: expect.stringMatching(/região/) })
    expect(declaracoesDoContexto('item').find((d) => d.teclas.includes('c'))).toMatchObject({ descricao: expect.stringMatching(/coleção SKC/) })
    expect(declaracoesDoContexto('item').find((d) => d.teclas.includes('n'))).toMatchObject({ descricao: 'Escrever uma nota neste objeto' })
    expect(CATALOGO.filter((d) => !d.teclas.includes('n')).map((d) => d.descricao).join(' ')).not.toMatch(/nota/i)
    expect(declaracoesDoContexto('comparar').flatMap((d) => d.teclas)).toEqual(['ArrowLeft', 'ArrowRight'])
    expect(declaracoesDoContexto('global').find((d) => d.teclas.includes('Control+S'))).toMatchObject({
      teclas: ['Control+S', 'Meta+S'],
      descricao: expect.stringMatching(/^Salvar e sincronizar/),
    })
  })

  it('o Global tem a barra, o ir-a, o ponto de interrogação e o Esc', () => {
    const teclas = declaracoesDoContexto('global').flatMap((d) => d.teclas)
    expect(teclas).toEqual(expect.arrayContaining(['/', 'g i', 'g c', 'g l', 'g s', 'g b', 'g r', '?', 'Escape']))
  })

  it('o item tem ← → H L Z; a hipótese, [ ] ; o visualizador, I R + - 0', () => {
    expect(declaracoesDoContexto('item').flatMap((d) => d.teclas)).toEqual(expect.arrayContaining(['ArrowLeft', 'ArrowRight', 'h', 'l', 'i', 'z']))
    expect(declaracoesDoContexto('hipotese').flatMap((d) => d.teclas)).toEqual(expect.arrayContaining(['[', ']']))
    expect(declaracoesDoContexto('visualizador').flatMap((d) => d.teclas)).toEqual(expect.arrayContaining(['i', 'r', '+', '-', '0']))
  })

  it('a Revisão declara D (deixar como está) e U (desfazer o último)', () => {
    const r = declaracoesDoContexto('revisao')
    expect(r.find((d) => d.teclas.includes('d'))).toMatchObject({ descricao: expect.stringMatching(/Deixar como está/) })
    expect(r.find((d) => d.teclas.includes('u'))).toMatchObject({ descricao: expect.stringMatching(/Desfazer/) })
    expect(() => registrarAtalhos({ d: () => {} }, 'revisao')()).not.toThrow()
    expect(() => registrarAtalhos({ d: () => {} }, 'lista')).toThrow(/não declarado/)
  })

  it('mostra as letras em maiúscula e as setas e o Esc como símbolos', () => {
    expect(rotuloDaTecla('l')).toBe('L')
    expect(rotuloDaTecla('ArrowLeft')).toBe('←')
    expect(rotuloDaTecla('ArrowRight')).toBe('→')
    expect(rotuloDaTecla('ArrowUp')).toBe('↑')
    expect(rotuloDaTecla('ArrowDown')).toBe('↓')
    expect(rotuloDaTecla('Escape')).toBe('Esc')
    expect(rotuloDaTecla('Enter')).toBe('Enter')
    expect(rotuloDaTecla('-')).toBe('−')
    expect(rotuloDaTecla('?')).toBe('?')
    expect(rotuloDaTecla('Control+S')).toBe('Ctrl+S')
    expect(rotuloDaTecla('Meta+S')).toBe('⌘S')
  })

  it('da Tarefa 19: o mapa dos sítios declara aproximar, afastar, ver tudo, os limites das regiões, mover e fechar o cartão', () => {
    const mapa = declaracoesDoContexto('mapa')
    const teclas = mapa.flatMap((d) => d.teclas)
    for (const t of ['+', '-', '0', 'r', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape']) expect(teclas).toContain(t)
    expect(mapa.find((d) => d.teclas.includes('0'))?.descricao).toMatch(/Ver tudo/)
    expect(mapa.find((d) => d.teclas.includes('r'))?.descricao).toMatch(/limites das regiões/i)
  })
})
