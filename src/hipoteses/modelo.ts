/**
 * As hipóteses SKC, as regiões e a posição sobre as hipóteses dos livros (Tarefa 10): a leitura dos registros
 * `hipotese`, `regiao` e `posicao` da camada do usuário. Puro: sem React, sem IndexedDB.
 *
 * FORMATO DOS CAMPOS (congelado: o porte para Python da Tarefa 16 importa exatamente isto). Ids e códigos são ASCII.
 *
 * `hipotese`, reg `HY-<aparelho>-<n>` (`^HY-[a-z0-9]{8}-[1-9][0-9]*$`; o `n` vem do contador do aparelho, nunca reusado).
 * - `criar` (o formulário "Nova hipótese", com TODOS os campos abaixo):
 *   - `objeto` (texto): o objeto da hipótese, canônico: o número do sistema em maiúsculas (`CA00001`, o padrão único
 *     `FONTE_DO_NUMERO` de objetos-skc/numeracao.ts) para um objeto dos livros, ou o id `OB-<aparelho>-<n>` de um objeto
 *     SKC (que não muda se o número provisório mudar). É o objeto da tela onde foi registrada (o principal do grupo de
 *     ligação). Ao LER, uma hipótese ancorada numa leitura SKC (`ancora.lingua` "skc") é do dono dessa leitura
 *     (`ancora.fonte`), não do `objeto`: desfeita a ligação, ela aparece na tela do antigo membro, com a marca no texto
 *     (`objetoDaHipotese`; revisão 3, M13); uma ancorada num trecho do livro (`pt`/`de`), do objeto desse trecho, e não do
 *     principal em cuja tela foi registrada (T17-B-4; `donos.ts`). O campo gravado não muda.
 *   - `sobre` (texto): `"objeto"` (o objeto inteiro) ou `"elemento"`.
 *   - `elemento` (texto ou null): com `sobre: "elemento"`, o id do elemento: `EL-…` (um elemento do pacote,
 *     `element.id`) ou `RG-<aparelho>-<n>` (uma região do usuário, que é o elemento novo que ela nomeia; ver `regiao`).
 *     null com `sobre: "objeto"`.
 *   - `elementoRotulo` (texto): o nome do elemento quando a hipótese foi registrada ("" para o objeto inteiro). Só
 *     para mostrar sem o pacote; o nome vivo é o do elemento.
 *   - `termos` (lista de textos): os ids dos verbetes, na ordem escolhida: do pacote (`GL-` + dígitos) ou do usuário
 *     (`GL-<aparelho>-<n>`, decisão 41: um termo criado com a hipótese, "Criar termo «…»"; o registro `verbete` e o seu
 *     formato estão em src/glossario/modelo.ts). Um termo novo é criado na MESMA gravação da hipótese (`criar`) ou do
 *     `alterar` que o põe nela, ANTES dela na gravação.
 *   - `termosRotulos` (lista de textos): o rótulo de cada termo, na mesma ordem (a forma em português de quando foi
 *     escolhido). `termos` e `termosRotulos` são sempre escritos JUNTOS, no mesmo evento.
 *   - `nivel` (texto): `pre_iconographic` | `iconographic` | `iconological` (os códigos do pacote).
 *   - `modalidade` (texto): `asserted` | `probable` | `possible` | `questioned` (os códigos do pacote; a tela diz
 *     "Certeza": afirmada, provável, possível, questionada).
 *   - `justificativa` (texto): texto do usuário, com `[[ref|rótulo]]` e citações como numa nota (decisões 37 e 40).
 *   - `ancora` (objeto ou null): o trecho selecionado numa leitura (null: a hipótese não nasceu de um trecho):
 *     `{"fonte": …, "lingua": …, "inicio": int, "fim": int, "trecho": texto, "sha": 64 hex minúsculos}`.
 *     - `lingua` `"pt"` (a tradução) ou `"de"` (o original) com `fonte` = o id do trecho do livro (`PA-…`, estável
 *       entre versões); `lingua` `"skc"` com `fonte` = o id do objeto SKC (`OB-…`): a leitura SKC dele (o campo `leitura`).
 *     - `inicio` e `fim` em CODE POINTS (como os deslocamentos do pacote, R49), no texto TAL COMO GUARDADO: para "pt", a
 *       tradução renderizada do pacote, `unit_pt_render.texto` do trecho (`unit_id` = o id do trecho); para "de", o original,
 *       `passage.text`; para "skc", o campo `leitura` do objeto (com os `[[…]]` e as citações como digitadas). Nunca o
 *       texto como aparece na tela (a forma em uso de um termo, Tarefa 11, ou o rótulo de um link podem ser outros).
 *     - `trecho`: o texto entre `inicio` e `fim` quando foi selecionado (para mostrar, e para reachar o trecho se o
 *       texto mudar).
 *     - `sha`: o SHA-256 do texto INTEIRO, normalizado como nas notas (spec §7.6, src/notas/ancora.ts: NFC, cada
 *       sequência de espaços vira um espaço, sem espaço nas pontas), em hexadecimal minúsculo. Diferente do de agora = "o
 *       texto mudou". Para "pt" é o da TRADUÇÃO (onde estão as posições), não o do original como nas notas: uma tradução
 *       revista também pede conferência. DESVIO DELIBERADO DA §7.6 (que faz o sha sobre o original e deixa a tradução
 *       revista a `desatualizada`; revisão 3, M10): as posições "pt" só valem no texto da tradução, então é ele que se
 *       confere. A tela diz, para "pt", "A tradução mudou desde que você marcou este trecho"; para "de" e "skc", "O
 *       texto da fonte mudou".
 * - `alterar`: um campo por evento, salvo os pares acima (`termos` + `termosRotulos`; `sobre` + `elemento` +
 *   `elementoRotulo`). "Já conferi" reescreve `ancora` inteira.
 * - `excluir` / `restaurar`: a marca de sempre.
 *
 * `regiao`, reg `RG-<aparelho>-<n>`: uma região desenhada numa imagem; ela É o elemento novo que nomeia, ou mais uma
 * região de um elemento que já existe.
 * - `criar`: `imagem` (texto: o id da imagem, `IMG-…` do pacote ou `IM-<aparelho>-<n>` do usuário), `objeto` (como na
 *   hipótese), `seletor` (texto: o formato R4, `<polygon points="x,y x,y …"/>`, coordenadas de 0 a 1 no quadro da
 *   imagem; ver src/imagem/desenhar.ts para o quadro das imagens giradas e das fotos com EXIF), `elemento` (texto: o nome),
 *   `elementoId` (texto ou null: null = a região é um elemento novo, cujo id é o da própria região; senão o id do
 *   elemento existente, `EL-…` ou `RG-…`) e `pai` (texto ou null: o elemento de que este é parte, "Pertence a").
 *   - `elementoId` aponta SEMPRE para uma raiz: um `EL-…` do pacote ou uma região com `elementoId` null. Nunca para uma
 *     região que é ela mesma "mais uma região de" outro (sem cadeias; o app só oferece raízes). `pai` idem.
 *   - `seletor`: cada número com `toFixed(4)` e os zeros à direita tirados (`Number(x.toFixed(4))` como texto): `0`, `1`,
 *     `0.5`, `0.1235`; nunca `1.0` nem notação científica; pontos separados por um espaço, x e y por vírgula, coordenadas
 *     de 0 a 1 inclusive. O porte só LÊ o seletor (`float` de cada número; nada a reescrever). Se um dia escrever, não use
 *     `round()` (arredonda meio para o par, o `toFixed` do JS não): `Decimal(x).quantize(Decimal('0.0001'),
 *     ROUND_HALF_UP)` sobre o valor binário exato (como o `toFixed`), com os zeros à direita e o ponto final tirados.
 * - `alterar`: `seletor` (pontos editados) ou `elemento` (o nome). `excluir` / `restaurar` como sempre.
 * - EXCLUIR uma região que é elemento (revisão 1): o registro ganha a marca, e nada mais muda. As hipóteses com
 *   `elemento` = o id dela continuam (com o `elementoRotulo` guardado e "região excluída" no painel) e as regiões com
 *   `elementoId` = ela continuam desenhadas; o app pede confirmação dizendo quantas são e oferece "Desfazer". "Desfazer"
 *   logo depois de registrar exclui a hipótese E a região nova que ela criou, num só segmento.
 *
 * `posicao`, reg = o id da hipótese DO LIVRO (`^HY-[0-9]{6,}$`): a posição do usuário sobre ela. Um reg por hipótese,
 * o mesmo em todos os aparelhos, então duas escolhas convergem pela fusão (a mais nova vence).
 * - `criar` (a primeira escolha): SÓ `hipotese` (o mesmo id do reg) e `posicao`. Nunca `justificativa`: a fusão escreve
 *   todo campo de todo evento, e o criar de um segundo aparelho que ainda não recebeu a posição apagaria a justificativa
 *   do primeiro (revisão 1). Dois `criar` do mesmo reg (um por aparelho) são normais; vale campo a campo o mais novo.
 * - `alterar`: `posicao` (`"concordo"` | `"discordo"` | `"aberto"` | null = sem posição) ou `justificativa` (texto).
 *   Sem `justificativa` escrita, ela é "" na leitura.
 * - Leitura: o reg é a verdade (um campo `hipotese` diferente é ignorado).
 *
 * PARA O PORTE EM PYTHON: `re.fullmatch` com as classes explícitas (`[a-z0-9]`, `[0-9]`; nada de `\d`, que aceita
 * dígitos de outros alfabetos, e nada de `$`, que casa antes de um `\n`). Inteiros: `int` do JSON, sem `bool`
 * (`isinstance(True, int)` é verdadeiro) e sem float (`3.0` não vale). Textos não-texto contam como "". Uma lista de
 * termos com itens que não são texto: os itens não-texto são pulados (com o rótulo da mesma posição); rótulo que falta
 * ou não é texto = o próprio id. Valores fora das listas acima = ausentes (`nivel` null etc.), nunca erro.
 * Âncora "pt": o `sha` (e as posições) são sobre `unit_pt_render.texto` do trecho, normalizado como na §7.6 (NFC, `\s+`
 * vira um espaço, sem espaço nas pontas), e NÃO sobre `passage.text` como o sha das notas: desvio deliberado da §7.6
 * (M10). Quem conferir uma âncora "pt" no pipeline compara com o sha da tradução de agora; "de" e "skc" seguem a §7.6.
 * Região de outro aparelho: o app lê só `elementoId` válido (senão a região é o próprio elemento) e põe cada coordenada
 * dentro de 0 a 1 ao ler (revisão 3, M8); o porte deve fazer o mesmo, sem reescrever o seletor.
 */
import { pontosDoSeletor } from '../banco/consultas'
import type { Modalidade, Nivel } from '../banco/tipos'
import { refDeObjeto } from '../colecoes/modelo'
import { chaveDaForma, normalizarForma } from '../glossario/modelo'
import type { Campos, Json } from '../usuario/eventos'
import { objetoDoTrecho } from './donos'
import type { Registro } from '../usuario/fusao'

export const RE_HIPOTESE_SKC = /^HY-[a-z0-9]{8}-[1-9][0-9]*$/
export const RE_HIPOTESE_DO_LIVRO = /^HY-[0-9]{6,}$/
export const RE_REGIAO = /^RG-[a-z0-9]{8}-[1-9][0-9]*$/
export const RE_ELEMENTO_DO_LIVRO = /^EL-[0-9]{6,}$/
const RE_OBJETO_SKC = /^OB-[a-z0-9]{8}-[1-9][0-9]*$/
const RE_SHA = /^[0-9a-f]{64}$/

export const eHipoteseSkc = (id: string) => RE_HIPOTESE_SKC.test(id)
export const eHipoteseDoLivro = (id: string) => RE_HIPOTESE_DO_LIVRO.test(id)
/** Um id de elemento que uma hipótese SKC pode ter: do pacote (`EL-…`) ou uma região do usuário (`RG-…`). */
export const eElemento = (id: unknown): id is string => typeof id === 'string' && (RE_ELEMENTO_DO_LIVRO.test(id) || RE_REGIAO.test(id))

export const NIVEIS_SKC: readonly Nivel[] = ['pre_iconographic', 'iconographic', 'iconological']
export const MODALIDADES: readonly Modalidade[] = ['asserted', 'probable', 'possible', 'questioned']
export const POSICOES = ['concordo', 'discordo', 'aberto'] as const
export type Posicao = (typeof POSICOES)[number]

export const ROTULO_DA_POSICAO: Record<Posicao, string> = { concordo: 'concordo', discordo: 'discordo', aberto: 'em aberto' }

export interface AncoraDaHipoteseSkc {
  fonte: string
  lingua: 'pt' | 'de' | 'skc'
  inicio: number
  fim: number
  trecho: string
  sha: string
}

export type Sobre = { tipo: 'objeto' } | { tipo: 'elemento'; id: string; rotulo: string }

export interface TermoEscolhido {
  id: string
  rotulo: string
  /**
   * Só no formulário e no rascunho (nunca num evento): um termo a CRIAR ao registrar ("Criar termo «…»", decisão 41).
   * O `id` é então provisório, `novo:<chave da forma>`, e `rotulo` é a forma normalizada; `registrarHipotese` (ou
   * `alterarHipotese`) reserva o id `GL-<aparelho>-<n>` e grava o verbete com a hipótese.
   */
  novo?: boolean
}

export const PREFIXO_DO_TERMO_NOVO = 'novo:'

/** O termo a criar com a hipótese, com a forma normalizada (src/glossario/modelo.ts). */
export function termoNovo(forma: string): TermoEscolhido {
  return { id: `${PREFIXO_DO_TERMO_NOVO}${chaveDaForma(forma)}`, rotulo: normalizarForma(forma), novo: true }
}

export interface HipoteseSkc {
  id: string
  objeto: string | null
  sobre: Sobre
  termos: TermoEscolhido[]
  nivel: Nivel | null
  modalidade: Modalidade | null
  justificativa: string
  ancora: AncoraDaHipoteseSkc | null
  excluido: boolean
  criadoEm: string
}

/**
 * O nome curto de uma hipótese SKC: o primeiro termo pelo nome de AGORA (`nomeDe`, Tarefa 11: a forma em uso, senão o nome
 * do pacote, senão o rótulo guardado; `useNomeVivo`). Sem `nomeDe`, o rótulo guardado quando a hipótese foi registrada.
 */
export const nomeDaHipoteseSkc = (h: Pick<HipoteseSkc, 'termos'>, nomeDe?: (id: string, guardado: string) => string): string => {
  const t = h.termos[0]
  return t ? (nomeDe ? nomeDe(t.id, t.rotulo) : t.rotulo) : 'hipótese SKC'
}

export interface RegiaoSkc {
  id: string
  imagem: string
  objeto: string | null
  seletor: string
  pontos: [number, number][]
  elemento: string
  /** O elemento a que a região pertence: o informado, ou a própria região (elemento novo). */
  elementoId: string
  pai: string | null
  excluido: boolean
}

export interface PosicaoSkc {
  hipotese: string
  posicao: Posicao | null
  justificativa: string
  excluido: boolean
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
const inteiro = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)

/** O objeto, só na forma canônica (número em maiúsculas ou id de objeto SKC). */
export function objetoCanonico(v: unknown): string | null {
  const r = refDeObjeto(v)
  return r !== null && r === v && (!r.startsWith('OB-') || RE_OBJETO_SKC.test(r)) ? r : null
}

export function lerAncora(v: unknown): AncoraDaHipoteseSkc | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const a = v as Record<string, unknown>
  const lingua = a.lingua
  if (lingua !== 'pt' && lingua !== 'de' && lingua !== 'skc') return null
  if (typeof a.fonte !== 'string') return null
  if (lingua === 'skc' ? !RE_OBJETO_SKC.test(a.fonte) : !/^PA-[\x21-\x7e]+$/.test(a.fonte)) return null
  if (!inteiro(a.inicio) || !inteiro(a.fim) || a.inicio < 0 || a.fim <= a.inicio) return null
  if (typeof a.trecho !== 'string' || a.trecho === '') return null
  if (typeof a.sha !== 'string' || !RE_SHA.test(a.sha)) return null
  return { fonte: a.fonte, lingua, inicio: a.inicio, fim: a.fim, trecho: a.trecho, sha: a.sha }
}

function lerTermos(ids: Json | undefined, rotulos: Json | undefined): TermoEscolhido[] {
  if (!Array.isArray(ids)) return []
  const r = Array.isArray(rotulos) ? rotulos : []
  const saida: TermoEscolhido[] = []
  ids.forEach((id, i) => {
    if (typeof id !== 'string' || id.trim() === '') return
    const rotulo = r[i]
    saida.push({ id, rotulo: typeof rotulo === 'string' && rotulo.trim() !== '' ? rotulo : id })
  })
  return saida
}

export function lerHipotese(r: Registro): HipoteseSkc {
  const c = r.campos
  const nivel = NIVEIS_SKC.includes(c.nivel as Nivel) ? (c.nivel as Nivel) : null
  const modalidade = MODALIDADES.includes(c.modalidade as Modalidade) ? (c.modalidade as Modalidade) : null
  const sobre: Sobre = c.sobre === 'elemento' && eElemento(c.elemento) ? { tipo: 'elemento', id: c.elemento, rotulo: texto(c.elementoRotulo).trim() } : { tipo: 'objeto' }
  return {
    id: r.id,
    objeto: objetoCanonico(c.objeto),
    sobre,
    termos: lerTermos(c.termos, c.termosRotulos),
    nivel,
    modalidade,
    justificativa: texto(c.justificativa),
    ancora: lerAncora(c.ancora),
    excluido: r.excluido,
    criadoEm: r.criadoEm,
  }
}

/**
 * O objeto em cuja tela a hipótese aparece (revisão 3, M13): o dono da leitura SKC em que ela está ancorada, se está
 * ancorada numa leitura SKC; senão o `objeto` gravado. Uma hipótese registrada na tela do principal com o trecho na
 * leitura de um membro ligado (objeto = o principal) segue a leitura quando a ligação é desfeita: na tela do antigo membro
 * a marca é desenhada e o texto é conferido. Enquanto ligados, os dois estão no grupo e nada muda.
 */
export function objetoDaHipotese(h: Pick<HipoteseSkc, 'objeto' | 'ancora'>): string | null {
  if (h.ancora?.lingua === 'skc') return h.ancora.fonte
  // Ancorada num trecho do livro: é do objeto desse trecho, se o pacote já o disse (T17-B-4; `donos.ts`).
  if (h.ancora) return objetoDoTrecho(h.ancora.fonte, h.objeto) ?? h.objeto
  return h.objeto
}

export interface DadosDaHipotese {
  objeto: string
  sobre: Sobre
  termos: readonly TermoEscolhido[]
  nivel: Nivel
  modalidade: Modalidade
  justificativa: string
  ancora: AncoraDaHipoteseSkc | null
}

/** Os campos do `criar` (todos, sempre). */
export function camposDaHipoteseNova(d: DadosDaHipotese): Campos {
  return {
    objeto: d.objeto,
    sobre: d.sobre.tipo,
    elemento: d.sobre.tipo === 'elemento' ? d.sobre.id : null,
    elementoRotulo: d.sobre.tipo === 'elemento' ? d.sobre.rotulo : '',
    termos: d.termos.map((t) => t.id),
    termosRotulos: d.termos.map((t) => t.rotulo),
    nivel: d.nivel,
    modalidade: d.modalidade,
    justificativa: d.justificativa,
    ancora: d.ancora ? { ...d.ancora } : null,
  }
}

const naBorda = (v: number) => Math.min(1, Math.max(0, v))

/**
 * O ÚNICO leitor de `regiao` (revisão 3, M8: o item, o visualizador e as hipóteses leem por aqui). O que veio de outro
 * aparelho é lido com cuidado: `elementoId` só se for um id de elemento (senão a região é o próprio elemento), `pai`
 * idem, e cada coordenada fica dentro de 0 a 1 (o seletor guardado não é reescrito).
 */
export function lerRegiao(r: Registro): RegiaoSkc {
  const c = r.campos
  const seletor = texto(c.seletor)
  return {
    id: r.id,
    imagem: texto(c.imagem),
    objeto: objetoCanonico(c.objeto),
    seletor,
    pontos: pontosDoSeletor(seletor).map(([x, y]): [number, number] => [naBorda(x), naBorda(y)]),
    elemento: texto(c.elemento).trim(),
    elementoId: eElemento(c.elementoId) ? c.elementoId : r.id,
    pai: eElemento(c.pai) ? c.pai : null,
    excluido: r.excluido,
  }
}

export function lerPosicao(r: Registro): PosicaoSkc {
  const c = r.campos
  return {
    hipotese: r.id,
    posicao: (POSICOES as readonly unknown[]).includes(c.posicao) ? (c.posicao as Posicao) : null,
    justificativa: texto(c.justificativa),
    excluido: r.excluido,
  }
}
