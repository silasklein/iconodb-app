/**
 * O registro de atalhos de teclado: um só ouvinte de `keydown` no documento, dono de todas as teclas
 * do app. As telas registram mapas {tecla: ação} por contexto (`registrarAtalhos`, ou o hook
 * `useAtalhos`) e desfazem ao sair.
 *
 * - Precedência: painel e visualizador (hipótese, visualizador) > tela (lista, item) > global.
 *   A ação que devolve `false` não tomou a tecla: o contexto seguinte tenta.
 * - Não valem em campos de texto (só `Esc`, e só para quem é dono do campo, ver `raiz`), com Ctrl, ⌘ ou Alt
 *   (essas teclas são do navegador e do sistema) e, com um diálogo modal aberto
 *   (`[aria-modal="true"]`), só para as ações que pertencem a esse diálogo.
 * - A exceção são as combinações declaradas com Ctrl ou ⌘ ("Control+S", "Meta+S": salvar e sincronizar).
 *   Valem em qualquer lugar (campo de texto e diálogo inclusive) e, quando tomadas, impedem a ação do
 *   navegador (o "salvar página"). Qualquer outra combinação continua com o navegador.
 * - Sequências de duas teclas ("g l"): `g` arma, a segunda tecla decide. A segunda tecla de uma sequência
 *   declarada é sempre engolida, haja ou não ação registrada, para a letra não valer sozinha em outro
 *   contexto (o "l" do item, por exemplo).
 * - As letras não distinguem maiúscula de minúscula. A exceção são as declaradas com Shift ("Shift+H", Tarefa 10): com
 *   Shift, uma letra assim é outra tecla (não chama a letra sozinha); com Shift, uma letra NÃO declarada assim vale
 *   como a letra (como antes).
 *
 * O CATALOGO é a fonte única: declara cada atalho da 2A com a descrição, e a folha "Atalhos e
 * convenções" (`/atalhos`) é gerada dele. Registrar uma tecla que ele não declara é erro.
 */

export const CONTEXTOS = ['global', 'lista', 'item', 'hipotese', 'visualizador', 'revisao', 'comparar', 'mapa'] as const
export type Contexto = (typeof CONTEXTOS)[number]

export const ROTULO_DO_CONTEXTO: Record<Contexto, string> = {
  global: 'Global',
  lista: 'Lista',
  item: 'Item',
  hipotese: 'Hipótese',
  visualizador: 'Visualizador',
  revisao: 'Revisão',
  comparar: 'Comparar',
  mapa: 'Mapa dos sítios',
}

/** Quanto maior, antes a tecla é oferecida: painel e visualizador, depois a tela, depois o global. */
const PESO: Record<Contexto, number> = { global: 1, lista: 2, item: 2, hipotese: 3, visualizador: 3, revisao: 2, comparar: 2, mapa: 2 }

/** "g" e a letra: aonde cada uma leva. */
export const IR_PARA: Record<string, { caminho: string; descricao: string }> = {
  i: { caminho: '/', descricao: 'Ir ao Início' },
  c: { caminho: '/colecoes', descricao: 'Ir às Coleções' },
  l: { caminho: '/glossario', descricao: 'Ir ao Glossário' },
  s: { caminho: '/sitios', descricao: 'Ir aos Sítios' },
  b: { caminho: '/bibliografia', descricao: 'Ir à Bibliografia' },
  r: { caminho: '/revisao', descricao: 'Ir à Revisão' },
}

export interface Declaracao {
  contexto: Contexto
  /** As teclas que fazem a ação (alternativas): `event.key`, letras em minúscula, ou uma sequência "g l". */
  teclas: readonly string[]
  /** As teclas que a folha mostra, quando diferem das `teclas` (aliases como "=" não aparecem). */
  mostrar?: readonly string[]
  /** As teclas valem em conjunto (as quatro setas), em vez de uma OU outra. */
  juntas?: boolean
  descricao: string
}

/** A tabela da auditoria (seção 4): o que a Parte 2A tem e, da 2B, o salvar e sincronizar. */
export const CATALOGO: readonly Declaracao[] = [
  { contexto: 'global', teclas: ['/'], descricao: 'Focar a busca' },
  { contexto: 'global', teclas: ['Control+S', 'Meta+S'], descricao: 'Salvar e sincronizar (⌘S no Mac; vale também dentro de um campo de texto)' },
  ...Object.entries(IR_PARA).map(([letra, v]): Declaracao => ({ contexto: 'global', teclas: [`g ${letra}`], descricao: v.descricao })),
  { contexto: 'global', teclas: ['?'], descricao: 'Abrir esta lista de atalhos e convenções' },
  { contexto: 'global', teclas: ['Escape'], descricao: 'Fechar o menu, o painel, o visualizador ou a comparação (o foco volta ao gatilho); na busca, fechar as sugestões, depois limpar o texto e depois sair do campo' },
  { contexto: 'global', teclas: ['ArrowDown', 'ArrowUp'], juntas: true, descricao: 'No campo de busca: percorrer as sugestões e as buscas recentes (Enter abre a opção escolhida; sem opção escolhida, mostra todos os resultados)' },
  { contexto: 'global', teclas: ['Shift+Delete'], descricao: 'No campo de busca: tirar das buscas recentes a opção escolhida' },

  { contexto: 'lista', teclas: ['j', 'ArrowDown'], descricao: 'Ir ao item seguinte da lista ou da grade (a seta só vale com um item em foco)' },
  { contexto: 'lista', teclas: ['k', 'ArrowUp'], descricao: 'Ir ao item anterior da lista ou da grade (a seta só vale com um item em foco)' },
  { contexto: 'lista', teclas: ['Enter'], descricao: 'Abrir o item em foco' },
  {
    contexto: 'lista',
    teclas: ['Alt+ArrowUp', 'Alt+ArrowDown'],
    descricao: 'Numa coleção SKC: mover o item em foco uma posição para cima ou para baixo (a nova posição é anunciada; não vale dentro de um campo de texto)',
  },

  { contexto: 'item', teclas: ['ArrowLeft'], descricao: 'Objeto anterior, no contexto de origem (o grupo ou a busca)' },
  { contexto: 'item', teclas: ['ArrowRight'], descricao: 'Objeto seguinte, no contexto de origem (o grupo ou a busca)' },
  { contexto: 'item', teclas: ['h'], descricao: 'Ver todas as hipóteses, por nível' },
  { contexto: 'item', teclas: ['l'], descricao: 'Alternar português e alemão' },
  { contexto: 'item', teclas: ['i'], descricao: 'Alternar o desenho invertido e o original' },
  { contexto: 'item', teclas: ['z'], descricao: 'Ampliar a imagem (abre o visualizador)' },
  { contexto: 'item', teclas: ['n'], descricao: 'Escrever uma nota neste objeto' },
  { contexto: 'item', teclas: ['c'], descricao: 'Adicionar este objeto a uma coleção SKC (abre a folha das coleções)' },
  { contexto: 'item', teclas: ['Shift+C'], descricao: 'Pôr este objeto na comparação (até 4 objetos; a tela Comparar abre pelo Menu)' },
  { contexto: 'item', teclas: ['f'], descricao: 'Num objeto SKC: editar a ficha (os campos aparecem no lugar e se gravam sozinhos)' },
  { contexto: 'item', teclas: ['a'], descricao: 'Adicionar uma imagem a este objeto (foto, outra publicação ou arquivo; arrastar sobre o item também, no computador)' },
  {
    contexto: 'item',
    teclas: ['Shift+H'],
    descricao: 'Registrar uma hipótese SKC sobre este objeto (com um trecho selecionado numa leitura, a hipótese fica ancorada nele)',
  },
  { contexto: 'global', teclas: ['Control+Enter', 'Meta+Enter'], descricao: 'Na nova hipótese e no novo sítio: registrar (vale também dentro de um campo de texto)' },

  { contexto: 'hipotese', teclas: ['['], descricao: 'Hipótese anterior no texto' },
  { contexto: 'hipotese', teclas: [']'], descricao: 'Hipótese seguinte no texto' },
  { contexto: 'hipotese', teclas: ['e'], descricao: 'Na nova hipótese: marcar uma região nova na imagem do objeto' },

  { contexto: 'visualizador', teclas: ['i'], descricao: 'Alternar o desenho invertido e o original' },
  { contexto: 'visualizador', teclas: ['r'], descricao: 'Mostrar ou ocultar as regiões' },
  { contexto: 'visualizador', teclas: ['z', '+', '='], mostrar: ['z', '+'], descricao: 'Ampliar' },
  { contexto: 'visualizador', teclas: ['-', '_'], mostrar: ['-'], descricao: 'Reduzir' },
  { contexto: 'visualizador', teclas: ['0'], descricao: 'Ajustar à tela' },
  { contexto: 'visualizador', teclas: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'], juntas: true, descricao: 'Mover a imagem ampliada' },
  { contexto: 'visualizador', teclas: ['e'], descricao: 'Marcar uma região: cada toque ou clique põe um ponto; no primeiro ponto, fecha (os pontos se arrastam para ajustar)' },
  { contexto: 'visualizador', teclas: ['Enter'], descricao: 'Concluir a região que está sendo marcada' },
  { contexto: 'visualizador', teclas: ['Control+Z', 'Meta+Z'], descricao: 'Desfazer o último ponto da região (fora de um campo de texto)' },

  { contexto: 'revisao', teclas: ['d'], descricao: 'Deixar como está o caso em foco (o foco passa ao caso seguinte)' },
  { contexto: 'revisao', teclas: ['u'], descricao: 'Desfazer o último «Deixar como está» (vale também depois que o aviso some)' },

  { contexto: 'comparar', teclas: ['ArrowLeft'], descricao: 'No celular (um objeto por vez): o objeto anterior da comparação' },
  { contexto: 'comparar', teclas: ['ArrowRight'], descricao: 'No celular (um objeto por vez): o objeto seguinte da comparação' },

  // Tarefa 19: o mapa dos sítios (vale enquanto o mapa está na tela, fora dos campos de texto).
  { contexto: 'mapa', teclas: ['+', '='], mostrar: ['+'], descricao: 'Aproximar o mapa dos sítios' },
  { contexto: 'mapa', teclas: ['-', '_'], mostrar: ['-'], descricao: 'Afastar o mapa dos sítios' },
  { contexto: 'mapa', teclas: ['0'], descricao: 'Ver tudo: ajustar o mapa a todos os pontos' },
  { contexto: 'mapa', teclas: ['r'], descricao: 'Mostrar ou ocultar os limites das regiões' },
  { contexto: 'mapa', teclas: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'], juntas: true, descricao: 'Mover o mapa (com o foco no mapa); com o foco num ponto, ir ao ponto vizinho' },
  { contexto: 'mapa', teclas: ['PageUp', 'PageDown'], juntas: true, descricao: 'Com o foco num ponto, ir ao ponto anterior ou ao próximo (todos, em ordem de leitura)' },
  { contexto: 'mapa', teclas: ['Home', 'End'], juntas: true, descricao: 'Com o foco num ponto, ir ao primeiro ou ao último ponto' },
  { contexto: 'mapa', teclas: ['Escape'], descricao: 'Fechar o cartão do sítio selecionado (o foco volta ao ponto)' },
]

export const declaracoesDoContexto = (c: Contexto): Declaracao[] => CATALOGO.filter((d) => d.contexto === c)

const SIMBOLOS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Home: 'Home',
  End: 'End',
  Enter: 'Enter',
  '-': '−',
  'Control+S': 'Ctrl+S',
  'Meta+S': '⌘S',
  'Shift+Delete': 'Shift+Delete',
  'Alt+ArrowUp': 'Alt+↑',
  'Alt+ArrowDown': 'Alt+↓',
  'Control+Enter': 'Ctrl+Enter',
  'Meta+Enter': '⌘Enter',
  'Control+Z': 'Ctrl+Z',
  'Meta+Z': '⌘Z',
}

/** Como uma tecla aparece na folha: letras em maiúscula, setas como símbolos, Esc como "Esc". */
export const rotuloDaTecla = (tecla: string): string => SIMBOLOS[tecla] ?? (/^Shift\+[A-Z]$/.test(tecla) ? tecla : tecla.toUpperCase())

// ---------------------------------------------------------------------------------------------

/** Devolver `false` diz que a tecla não foi tomada (nada a fazer agora): o próximo contexto tenta e o navegador mantém o padrão. */
export type Acao = () => void | false

export interface OpcoesDoRegistro {
  /**
   * O elemento a que o mapa pertence (o painel, o menu). Dá ao mapa o direito de agir com o diálogo
   * modal aberto (se está dentro dele) e de receber `Esc` vindo de um campo de texto de dentro.
   */
  raiz?: () => Element | null
}

interface Registro {
  ordem: number
  contexto: Contexto
  mapa: Record<string, Acao>
  raiz?: () => Element | null
}

const registros = new Set<Registro>()
let contador = 0

const PREFIXOS = new Set(CATALOGO.flatMap((d) => d.teclas.filter((t) => t.includes(' ')).map((t) => t.split(' ')[0]!)))
const SEQUENCIAS = new Set(CATALOGO.flatMap((d) => d.teclas.filter((t) => t.includes(' '))))
/** As combinações com Ctrl ou ⌘ declaradas ("Control+S"): as únicas teclas com modificador que o app toma. */
const COMBINACOES = new Set(CATALOGO.flatMap((d) => d.teclas.filter((t) => /^(Control|Meta)\+./.test(t))))
/** As letras declaradas com Shift ("Shift+H"): com Shift, são outra tecla. */
const COM_SHIFT = new Set(CATALOGO.flatMap((d) => d.teclas.filter((t) => /^Shift\+[A-Z]$/.test(t))))
const ESPERA_DA_SEGUNDA_TECLA_MS = 1500
const SO_MODIFICADORA = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph', 'Dead'])

/** Os `input` em que não se digita texto nem se usa as setas: caixa de marcar e botões. As teclas do app valem neles. */
const INPUT_SEM_TEXTO = new Set(['checkbox', 'button', 'submit', 'reset', 'image'])

/** Uma caixa de marcar (ou botão `input`): as letras e os símbolos do app valem ali, mas as setas são do navegador, não atalho (m11). */
const emInputSemTexto = (alvo: EventTarget | null): boolean => (alvo as HTMLElement | null)?.tagName === 'INPUT' && INPUT_SEM_TEXTO.has((alvo as HTMLInputElement).type)

export function emCampoDeTexto(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  if (el.tagName === 'INPUT') return !INPUT_SEM_TEXTO.has((el as HTMLInputElement).type)
  return /^(TEXTAREA|SELECT)$/.test(el.tagName)
}

const declarada = (contexto: Contexto, tecla: string) => CATALOGO.some((d) => (d.contexto === contexto || d.contexto === 'global') && d.teclas.includes(tecla))

let armado: string | null = null
let relogio: ReturnType<typeof setTimeout> | undefined
const desarmar = () => {
  armado = null
  clearTimeout(relogio)
}

/** As ações candidatas para a tecla, na ordem de precedência, já sem as que o contexto do evento não permite. */
function candidatas(chave: string, alvo: EventTarget | null): Acao[] {
  const modal = document.querySelector('[aria-modal="true"]')
  const noCampo = emCampoDeTexto(alvo)
  return [...registros]
    .filter((r) => {
      if (!(chave in r.mapa)) return false
      const raiz = r.raiz?.() ?? null
      if (modal && !(raiz && modal.contains(raiz))) return false
      if (noCampo) return chave === 'Escape' && !!raiz && raiz.contains(alvo as Node)
      return true
    })
    .sort((a, b) => PESO[b.contexto] - PESO[a.contexto] || b.ordem - a.ordem)
    .map((r) => r.mapa[chave]!)
}

/** Roda as candidatas até uma tomar a tecla. Devolve se alguma tomou. */
function despachar(chave: string, e: KeyboardEvent): boolean {
  for (const acao of candidatas(chave, e.target)) {
    if (acao() !== false) {
      e.preventDefault()
      return true
    }
  }
  return false
}

/** Uma combinação declarada vale em qualquer lugar: a primeira ação que a toma impede o padrão do navegador. */
function despacharCombinacao(chave: string, e: KeyboardEvent): void {
  const acoes = [...registros]
    .filter((r) => chave in r.mapa)
    .sort((a, b) => PESO[b.contexto] - PESO[a.contexto] || b.ordem - a.ordem)
    .map((r) => r.mapa[chave]!)
  for (const acao of acoes) {
    if (acao() !== false) {
      e.preventDefault()
      return
    }
  }
}

function aoTeclar(e: KeyboardEvent) {
  if (SO_MODIFICADORA.has(e.key) || e.isComposing) return
  if (e.defaultPrevented) return
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
    const chave = `${e.metaKey ? 'Meta' : 'Control'}+${e.key.length === 1 ? e.key.toUpperCase() : e.key}`
    if (COMBINACOES.has(chave)) {
      desarmar()
      despacharCombinacao(chave, e)
    }
    return
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const comShift = e.shiftKey && /^[a-z]$/i.test(e.key) ? `Shift+${e.key.toUpperCase()}` : null
  const tecla = comShift && COM_SHIFT.has(comShift) && !emCampoDeTexto(e.target) ? comShift : e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (tecla.startsWith('Arrow') && emInputSemTexto(e.target)) return
  const modal = !!document.querySelector('[aria-modal="true"]')
  // Nos campos de texto e com um diálogo modal aberto não há sequências: só o que for do dono.
  if (emCampoDeTexto(e.target) || modal) {
    desarmar()
    despachar(tecla, e)
    return
  }
  if (armado !== null) {
    const chave = `${armado} ${tecla}`
    desarmar()
    if (SEQUENCIAS.has(chave)) {
      despachar(chave, e)
      return // a letra de uma sequência declarada nunca vale sozinha
    }
  } else if (PREFIXOS.has(tecla)) {
    armado = tecla
    relogio = setTimeout(desarmar, ESPERA_DA_SEGUNDA_TECLA_MS)
    return
  }
  despachar(tecla, e)
}

/** O ouvinte do documento está ligado? (Só enquanto há algum mapa registrado.) */
export const tecladoAtivo = () => registros.size > 0

/**
 * Algum mapa do `contexto` tem a `tecla` agora? Para os testes esperarem o registro (feito num efeito, depois de a tela
 * aparecer) antes de apertar a tecla, sem apertá-la de novo a cada tentativa.
 */
export const atalhoRegistrado = (tecla: string, contexto: Contexto): boolean => [...registros].some((r) => r.contexto === contexto && tecla in r.mapa)

/** Quantos mapas do `contexto` têm a `tecla` agora (para esperar o registro de um mapa a mais, quando já havia outro). Só para testes. */
export const quantosAtalhos = (tecla: string, contexto: Contexto): number => [...registros].filter((r) => r.contexto === contexto && tecla in r.mapa).length

/**
 * Registra o mapa {tecla: ação} de um contexto e devolve a função que o desfaz. As teclas são as do
 * CATALOGO (`event.key`; letras em minúscula; sequências como "g l").
 */
export function registrarAtalhos(mapa: Record<string, Acao>, contexto: Contexto, opcoes: OpcoesDoRegistro = {}): () => void {
  // Fora da produção (desenvolvimento e testes) uma tecla fora do catálogo é erro; em produção o app não cai:
  // registra o problema e ignora só essa tecla.
  const aceitas: Record<string, Acao> = {}
  for (const [tecla, acao] of Object.entries(mapa)) {
    if (declarada(contexto, tecla)) aceitas[tecla] = acao
    else if (import.meta.env.MODE !== 'production') throw new Error(`Atalho não declarado no catálogo: "${tecla}" (${contexto})`)
    else console.error(`Atalho não declarado no catálogo, ignorado: "${tecla}" (${contexto})`)
  }
  const registro: Registro = { ordem: ++contador, contexto, mapa: aceitas, raiz: opcoes.raiz }
  if (registros.size === 0) document.addEventListener('keydown', aoTeclar)
  registros.add(registro)
  return () => {
    registros.delete(registro)
    if (registros.size === 0) {
      document.removeEventListener('keydown', aoTeclar)
      desarmar()
    }
  }
}
