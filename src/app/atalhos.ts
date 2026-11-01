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
 * - Sequências de duas teclas ("g l"): `g` arma, a segunda tecla decide. A segunda tecla de uma sequência
 *   declarada é sempre engolida, haja ou não ação registrada, para a letra não valer sozinha em outro
 *   contexto (o "l" do item, por exemplo).
 * - As letras não distinguem maiúscula de minúscula.
 *
 * O CATALOGO é a fonte única: declara cada atalho da 2A com a descrição, e a folha "Atalhos e
 * convenções" (`/atalhos`) é gerada dele. Registrar uma tecla que ele não declara é erro.
 */

export const CONTEXTOS = ['global', 'lista', 'item', 'hipotese', 'visualizador'] as const
export type Contexto = (typeof CONTEXTOS)[number]

export const ROTULO_DO_CONTEXTO: Record<Contexto, string> = {
  global: 'Global',
  lista: 'Lista',
  item: 'Item',
  hipotese: 'Hipótese',
  visualizador: 'Visualizador',
}

/** Quanto maior, antes a tecla é oferecida: painel e visualizador, depois a tela, depois o global. */
const PESO: Record<Contexto, number> = { global: 1, lista: 2, item: 2, hipotese: 3, visualizador: 3 }

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

/** A tabela da auditoria (seção 4) só com o que a Parte 2A tem: nada de escrever nota, coleção, hipótese, comparar nem sincronizar. */
export const CATALOGO: readonly Declaracao[] = [
  { contexto: 'global', teclas: ['/'], descricao: 'Focar a busca' },
  ...Object.entries(IR_PARA).map(([letra, v]): Declaracao => ({ contexto: 'global', teclas: [`g ${letra}`], descricao: v.descricao })),
  { contexto: 'global', teclas: ['?'], descricao: 'Abrir esta lista de atalhos e convenções' },
  { contexto: 'global', teclas: ['Escape'], descricao: 'Fechar o menu, o painel ou o visualizador (o foco volta ao gatilho); na busca, limpar o texto e depois sair do campo' },

  { contexto: 'lista', teclas: ['j', 'ArrowDown'], descricao: 'Ir ao item seguinte da lista ou da grade (a seta só vale com um item em foco)' },
  { contexto: 'lista', teclas: ['k', 'ArrowUp'], descricao: 'Ir ao item anterior da lista ou da grade (a seta só vale com um item em foco)' },
  { contexto: 'lista', teclas: ['Enter'], descricao: 'Abrir o item em foco' },

  { contexto: 'item', teclas: ['ArrowLeft'], descricao: 'Objeto anterior, no contexto de origem (o grupo ou a busca)' },
  { contexto: 'item', teclas: ['ArrowRight'], descricao: 'Objeto seguinte, no contexto de origem (o grupo ou a busca)' },
  { contexto: 'item', teclas: ['h'], descricao: 'Ver todas as hipóteses, por nível' },
  { contexto: 'item', teclas: ['l'], descricao: 'Alternar português e alemão' },
  { contexto: 'item', teclas: ['z'], descricao: 'Ampliar a imagem (abre o visualizador)' },

  { contexto: 'hipotese', teclas: ['['], descricao: 'Hipótese anterior no texto' },
  { contexto: 'hipotese', teclas: [']'], descricao: 'Hipótese seguinte no texto' },

  { contexto: 'visualizador', teclas: ['i'], descricao: 'Alternar o desenho invertido e o original' },
  { contexto: 'visualizador', teclas: ['r'], descricao: 'Mostrar ou ocultar as regiões' },
  { contexto: 'visualizador', teclas: ['z', '+', '='], mostrar: ['z', '+'], descricao: 'Ampliar' },
  { contexto: 'visualizador', teclas: ['-', '_'], mostrar: ['-'], descricao: 'Reduzir' },
  { contexto: 'visualizador', teclas: ['0'], descricao: 'Ajustar à tela' },
  { contexto: 'visualizador', teclas: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'], juntas: true, descricao: 'Mover a imagem ampliada' },
]

export const declaracoesDoContexto = (c: Contexto): Declaracao[] => CATALOGO.filter((d) => d.contexto === c)

const SIMBOLOS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  Enter: 'Enter',
  '-': '−',
}

/** Como uma tecla aparece na folha: letras em maiúscula, setas como símbolos, Esc como "Esc". */
export const rotuloDaTecla = (tecla: string): string => SIMBOLOS[tecla] ?? tecla.toUpperCase()

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
const ESPERA_DA_SEGUNDA_TECLA_MS = 1500
const SO_MODIFICADORA = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph', 'Dead'])

export function emCampoDeTexto(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
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

function aoTeclar(e: KeyboardEvent) {
  if (SO_MODIFICADORA.has(e.key) || e.isComposing) return
  if (e.defaultPrevented) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const tecla = e.key.length === 1 ? e.key.toLowerCase() : e.key
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
 * Registra o mapa {tecla: ação} de um contexto e devolve a função que o desfaz. As teclas são as do
 * CATALOGO (`event.key`; letras em minúscula; sequências como "g l").
 */
export function registrarAtalhos(mapa: Record<string, Acao>, contexto: Contexto, opcoes: OpcoesDoRegistro = {}): () => void {
  for (const tecla of Object.keys(mapa)) {
    if (!declarada(contexto, tecla)) throw new Error(`Atalho não declarado no catálogo: "${tecla}" (${contexto})`)
  }
  const registro: Registro = { ordem: ++contador, contexto, mapa, raiz: opcoes.raiz }
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
