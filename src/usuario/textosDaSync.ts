/**
 * Os textos da sincronização (decisão 29; Sincronizacao.dc.html, PC-Sincronizacao.dc.html, Menu.dc.html,
 * Main.dc.html): o título e a dica de cada estado, as horas, os nomes dos aparelhos e a descrição do que
 * vai subir. Puro (sem React, sem IndexedDB).
 */
import type { Campos, Op, Tipo } from './eventos'

export const numero = (n: number) => n.toLocaleString('pt-BR')
export const plural = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`
/** "1 alteração", "3 alterações". */
export const alteracoes = (n: number) => plural(n, 'alteração', 'alterações')

const doisDigitos = (n: number) => String(n).padStart(2, '0')
/** "19:10" (hora local). */
export function hora(ms: number): string {
  const d = new Date(ms)
  return `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`
}
/** A hora local de um hlc ("<ms 13>-…"). */
export const horaDoHlc = (hlc: string) => hora(Number(hlc.slice(0, 13)))

const mesmoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** "hoje, 19:10", "ontem, 19:10" ou "12/10, 19:10". */
export function quando(ms: number, agora: number = Date.now()): string {
  const d = new Date(ms)
  const hoje = new Date(agora)
  const ontem = new Date(agora)
  ontem.setDate(ontem.getDate() - 1)
  if (mesmoDia(d, hoje)) return `hoje, ${hora(ms)}`
  if (mesmoDia(d, ontem)) return `ontem, ${hora(ms)}`
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}, ${hora(ms)}`
}

/** "do Mac", "do iPhone"; sem nome (ou o nome genérico), "do outro aparelho". */
export function doAparelho(nome: string | null | undefined): string {
  return nome && nome !== 'Este aparelho' ? `do ${nome}` : 'do outro aparelho'
}

const TIPOS: Record<Tipo, { nome: string; feminino: boolean }> = {
  nota: { nome: 'Nota', feminino: true },
  colecao: { nome: 'Coleção', feminino: true },
  hipotese: { nome: 'Hipótese', feminino: true },
  regiao: { nome: 'Região', feminino: true },
  posicao: { nome: 'Posição na coleção', feminino: true },
  verbete: { nome: 'Verbete', feminino: false },
  sitio: { nome: 'Sítio', feminino: false },
  'item-sitio': { nome: 'Sítio do objeto', feminino: false },
  revisao: { nome: 'Revisão', feminino: true },
  objeto: { nome: 'Objeto SKC', feminino: false },
  imagem: { nome: 'Imagem', feminino: true },
  ligacao: { nome: 'Ligação de objetos', feminino: true },
  comparar: { nome: 'Bandeja de comparação', feminino: true },
}

const PARTICIPIOS: Record<Op, [string, string]> = {
  criar: ['novo', 'nova'],
  alterar: ['alterado', 'alterada'],
  excluir: ['excluído', 'excluída'],
  restaurar: ['restaurado', 'restaurada'],
}

const MAXIMO_DO_NOME = 60
const texto = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null)
/** «nome», cortado com reticências se for longo. */
const entreAspas = (nome: string) => `«${nome.length > MAXIMO_DO_NOME ? `${nome.slice(0, MAXIMO_DO_NOME - 1).trimEnd()}…` : nome}»`

/** O número (ou o id) de um objeto: `numeroDe` dá o de agora de um objeto SKC (`OB-…`); sem ele, a ref como está. */
type NumeroDe = (ref: string) => string | null

/**
 * O registro com o que a pessoa reconhece (A-11 da Tarefa 17), a partir dos campos de agora: "Nota em CA00001",
 * "Coleção «Selos»", "Hipótese sobre «leão» em CA00002", "Objeto SKC CA00005". Sem os campos (ou com campos que não
 * servem), o tipo e o id: "Nota NT-ab12cd34-1". `numeroDe` dá o número de agora de um objeto SKC (o id `OB-…` não diz
 * nada à pessoa).
 */
export function descreverRegistro(tipo: Tipo, reg: string, campos?: Readonly<Campos> | null, numeroDe?: NumeroDe): string {
  const nome = TIPOS[tipo]?.nome ?? tipo
  const padrao = `${nome} ${reg}`
  if (!campos) return tipo === 'item-sitio' ? `${nome} ${numeroDe?.(reg) ?? reg}` : padrao
  const objeto = (ref: unknown) => {
    const r = texto(ref)
    return r === null ? null : (numeroDe?.(r) ?? r)
  }
  switch (tipo) {
    case 'nota': {
      const onde = objeto(campos.alvo)
      return onde ? `Nota em ${onde}` : padrao
    }
    case 'colecao':
    case 'sitio': {
      const n = texto(campos.nome)
      return n ? `${nome} ${entreAspas(n)}` : padrao
    }
    case 'verbete': {
      const n = texto(campos.formaEmUso) ?? texto(campos.forma)
      return n ? `${nome} ${entreAspas(n)}` : padrao
    }
    case 'hipotese': {
      const termos = Array.isArray(campos.termosRotulos) ? campos.termosRotulos : []
      const termo = texto(termos[0])
      const em = objeto(campos.objeto)
      if (!termo && !em) return padrao
      return `${nome}${termo ? ` sobre ${entreAspas(termo)}` : ''}${em ? ` em ${em}` : ''}`
    }
    case 'regiao': {
      const el = texto(campos.elemento)
      const em = objeto(campos.objeto)
      if (!el && !em) return padrao
      return `${nome}${el ? ` ${entreAspas(el)}` : ''}${em ? ` em ${em}` : ''}`
    }
    case 'objeto': {
      const numero = numeroDe?.(reg) ?? texto(campos.numero) ?? texto(campos.pedido)
      if (numero) return `${nome} ${numero}`
      const t = texto(campos.titulo)
      return t ? `${nome} ${entreAspas(t)}` : padrao
    }
    case 'imagem': {
      const de = objeto(campos.alvo)
      return de ? `Imagem de ${de}` : padrao
    }
    case 'item-sitio':
      return `${nome} ${numeroDe?.(reg) ?? reg}`
    default:
      return padrao
  }
}

/** Uma linha de "Vai subir": "Nota em CA00001 — alterada" (veja `descreverRegistro`). */
export function descreverMudanca(tipo: Tipo, reg: string, op: Op, campos?: Readonly<Campos> | null, numeroDe?: NumeroDe): string {
  const t = TIPOS[tipo]
  const participio = PARTICIPIOS[op]?.[t?.feminino ? 1 : 0] ?? op
  return `${descreverRegistro(tipo, reg, campos, numeroDe)} — ${participio}`
}

/** A tela do registro (o caminho da rota), quando há uma; null se não há (bandeja, revisão, ligação, posição). */
export function caminhoDoRegistro(tipo: Tipo, reg: string, campos?: Readonly<Campos> | null): string | null {
  const id = encodeURIComponent(reg)
  const objeto = texto(campos?.objeto)
  switch (tipo) {
    case 'nota':
      return `/nota/${id}`
    case 'colecao':
      return `/grupo/${id}`
    case 'objeto':
    case 'item-sitio':
      return `/item/${id}`
    case 'sitio':
      return `/sitio/${id}`
    case 'verbete':
      return `/verbete/${id}`
    case 'hipotese':
      return objeto ? `/item/${encodeURIComponent(objeto)}?hipotese=${id}` : null
    case 'regiao':
      return objeto ? `/item/${encodeURIComponent(objeto)}` : null
    default:
      return null
  }
}

// ------------------------------------------------------------------ os estados

export type Marca = 'nenhuma' | 'ponto' | 'girando' | 'traco' | 'erro' | 'aviso'

/** O que se sabe para escrever o estado (um pedaço de InfoDaSync). */
export interface ParaOsTextos {
  estado: 'sincronizado' | { porEnviar: number } | 'sincronizando' | 'sem-internet' | { erro: 'login' | 'permissao' | 'geral'; mensagem: string }
  porEnviar: number
  ultimaEm: number | null
  /** O estado.json do Dropbox não pôde ser lido: aviso que não impede de sincronizar. */
  estadoIlegivel?: string | null
  /** O estado.json foi lido só em parte (A-7): o aviso diz isso, e não "não pôde ser lido". */
  estadoLidoEmParte?: boolean
  /** Com `estadoLidoEmParte`: só registros ilegíveis (A-28): o aviso diz que o arquivo tem registros ilegíveis. */
  estadoSoIlegiveis?: boolean
}

export interface TextosDoEstado {
  /** O título do estado no painel, na tela e no Menu ("3 alterações por enviar"). */
  titulo: string
  /** A linha de apoio sob o título. */
  apoio: string
  /** O nome acessível do ícone da barra (sem o atalho). */
  rotulo: string
  /** A dica do ícone (com o atalho, quando o clique sincroniza). */
  dica: string
  marca: Marca
}

const SALVAR = 'Salvar e sincronizar'
/** Na dica do ícone, quando o estado.json do Dropbox não pode ser lido (a sincronização segue). */
const AVISO_DO_ESTADO = 'aviso: o estado.json do Dropbox não pôde ser lido (ver Sincronização)'
const AVISO_DO_ESTADO_EM_PARTE = 'aviso: o estado.json do Dropbox foi lido só em parte (ver Sincronização)'
const AVISO_DO_ESTADO_ILEGIVEIS = 'aviso: o estado.json do Dropbox tem registros ilegíveis (ver Sincronização)'
const avisoDoEstado = (i: ParaOsTextos) =>
  i.estadoIlegivel ? ` — ${i.estadoLidoEmParte ? (i.estadoSoIlegiveis ? AVISO_DO_ESTADO_ILEGIVEIS : AVISO_DO_ESTADO_EM_PARTE) : AVISO_DO_ESTADO}` : ''

export function textosDoEstado(i: ParaOsTextos, atalho: string): TextosDoEstado {
  const n = i.porEnviar
  const e = i.estado
  if (e === 'sincronizando') {
    const rotulo = n > 0 ? `Sincronizando: enviando ${alteracoes(n)}` : 'Sincronizando'
    return {
      titulo: 'Sincronizando…',
      apoio: n > 0 ? `Enviando ${alteracoes(n)} e recebendo as do outro aparelho.` : 'Recebendo as alterações do outro aparelho.',
      rotulo,
      dica: n > 0 ? `Sincronizando… enviando ${alteracoes(n)}` : 'Sincronizando…',
      marca: 'girando',
    }
  }
  if (e === 'sem-internet') {
    return {
      titulo: 'Sem internet',
      apoio: n > 0 ? `${alteracoes(n)} ${n === 1 ? 'guardada' : 'guardadas'} neste aparelho; envia quando voltar.` : 'Nada por enviar; recebe quando a internet voltar.',
      rotulo: n > 0 ? `Sem internet — ${alteracoes(n)} ${n === 1 ? 'guardada' : 'guardadas'} neste aparelho; envia quando voltar` : 'Sem internet — nada por enviar',
      dica: n > 0 ? `Sem internet — ${alteracoes(n)} ${n === 1 ? 'guardada' : 'guardadas'} aqui; envia quando voltar` : 'Sem internet — nada por enviar',
      marca: 'traco',
    }
  }
  if (typeof e === 'object' && 'erro' in e) {
    const guardadas = n > 0 ? `${alteracoes(n)} ${n === 1 ? 'guardada' : 'guardadas'} neste aparelho.` : ''
    if (e.erro === 'login') {
      return {
        titulo: 'Entre de novo para sincronizar',
        apoio: guardadas ? `${guardadas.slice(0, -1)}; ${n === 1 ? 'sobe' : 'sobem'} depois de entrar.` : 'O que você fizer fica guardado neste aparelho.',
        rotulo: 'Entre de novo para sincronizar',
        dica: 'Entre de novo para sincronizar',
        marca: 'erro',
      }
    }
    if (e.erro === 'permissao') {
      return { titulo: 'Falta uma permissão do Dropbox', apoio: e.mensagem, rotulo: 'Falta uma permissão do Dropbox — ver o que fazer', dica: 'Falta uma permissão do Dropbox — ver o que fazer', marca: 'erro' }
    }
    const rotulo = 'Não foi possível falar com o Dropbox — tentar de novo'
    // E-16 (decisão 54): o detalhe técnico não aparece na tela (só pelo botão «Copiar detalhes»); a frase diz o que fazer.
    const nada = n > 0 ? `Nada se perdeu: ${alteracoes(n)} ${n === 1 ? 'guardada' : 'guardadas'} neste aparelho.` : 'Nada se perdeu: o que você fez fica neste aparelho.'
    return { titulo: 'Não foi possível falar com o Dropbox', apoio: `${nada} Toque em «Salvar e sincronizar» para tentar de novo.`, rotulo, dica: `${rotulo} (${atalho})`, marca: 'erro' }
  }
  if (typeof e === 'object' && 'porEnviar' in e) {
    const rotulo = `${alteracoes(e.porEnviar)} por enviar — ${SALVAR}`
    const aviso = avisoDoEstado(i)
    return {
      titulo: `${alteracoes(e.porEnviar)} por enviar`,
      apoio: `Já ${e.porEnviar === 1 ? 'gravada' : 'gravadas'} neste aparelho.`,
      rotulo: `${rotulo}${aviso}`,
      dica: `${rotulo}${aviso} (${atalho})`,
      marca: i.estadoIlegivel ? 'aviso' : 'ponto',
    }
  }
  const rotulo = i.ultimaEm === null ? `Nada por enviar — ${SALVAR}` : `Sincronizado às ${hora(i.ultimaEm)} — ${SALVAR}`
  const aviso = avisoDoEstado(i)
  return { titulo: 'Sincronizado', apoio: 'Nada por enviar.', rotulo: `${rotulo}${aviso}`, dica: `${rotulo}${aviso} (${atalho})`, marca: i.estadoIlegivel ? 'aviso' : 'nenhuma' }
}

/** "Última sincronização: hoje, 19:10" (ou que ainda não houve). */
export function textoDaUltima(ultimaEm: number | null, agora: number = Date.now()): string {
  return ultimaEm === null ? 'Ainda não sincronizado neste aparelho' : `Última sincronização: ${quando(ultimaEm, agora)}`
}

/** A forma curta do Menu: "última às 19:10", "última ontem, 19:10". */
export function textoCurtoDaUltima(ultimaEm: number | null, agora: number = Date.now()): string | null {
  if (ultimaEm === null) return null
  const q = quando(ultimaEm, agora)
  return q.startsWith('hoje, ') ? `última às ${q.slice(6)}` : `última ${q.startsWith('ontem') ? q : `em ${q}`}`
}

/** Tira do texto técnico o que parece chave de acesso: «Bearer …» e os tokens do Dropbox (começam com «sl.»). */
export function removerChaves(texto: string): string {
  return texto.replace(/\bBearer\s+[\w.~+/=-]{8,}/gi, '[removido]').replace(/(?<![\w./-])sl\.[\w.-]{10,}/g, '[removido]')
}
