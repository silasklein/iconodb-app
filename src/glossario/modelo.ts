/**
 * Os verbetes do usuário (decisão 41): um termo que ainda não está no glossário dos livros, criado no campo "Termo" de
 * uma hipótese ("Criar termo «…»"). Ele vai para o Glossário com a marca SKC e o estado "a revisar", tem a sua página
 * de verbete, a busca o encontra e a hipótese aponta para ele. Puro: sem React, sem IndexedDB.
 *
 * FORMATO DOS CAMPOS (congelado: o porte para Python da Tarefa 16 exporta estes verbetes). Ids e códigos são ASCII.
 *
 * `verbete`, reg = o id do verbete.
 * - Verbete do USUÁRIO: `GL-<aparelho>-<n>` (`^GL-[a-z0-9]{8}-[1-9][0-9]*$`), do gerador de ids de sempre
 *   (`proximoId('GL')`, src/usuario/armazem.ts: o contador do aparelho, nunca reusado). O aparelho nunca é `pipeline`
 *   (reservado à Tarefa 16, src/usuario/aparelho.ts). Os verbetes do pacote são `GL-` + 6 ou mais dígitos
 *   (`^GL-[0-9]{6,}$`), então os dois nunca se confundem.
 * - `criar` (só para um verbete do usuário; uma vez, no aparelho que o criou, na MESMA gravação da hipótese que o usa):
 *   - `forma` (texto): a forma em português como foi criada (a "proposta original" do verbete), normalizada: NFC, sem
 *     espaço nas pontas, cada sequência de espaços (`\s+` do JS: inclui os espaços Unicode e o U+FEFF) vira um espaço.
 *     Nunca vazia. Nunca reescrita depois.
 *   - `status` (texto): `"proposed"` (a tela diz "a revisar"). Os códigos são os do pacote (`glossary_entry.status`:
 *     `proposed` | `approved`), como `nivel` e `modalidade` das hipóteses.
 *   - A data de criação é o `hlc` desse `criar` (o `criadoEm` do registro: o menor hlc dos eventos dele). Nenhum campo
 *     repete o hlc.
 * - EDITAR O GLOSSÁRIO (Tarefa 11; FORMA FINAL, a que a Tarefa 16 exporta), o mesmo para os verbetes do usuário e os do
 *   pacote: um `alterar` com UM campo por evento (`formaEmUso`, ou `status`), salvo o par da aprovação (`status` + `formaAprovada`).
 *   - `formaEmUso` (texto ou `null`): a forma em português que vale agora. Texto NFC, sem espaço nas pontas, cada
 *     sequência de espaços um espaço só (`normalizarForma`); nunca vazio (o app não grava vazio; a leitura trata vazio ou
 *     não-texto como `null`). `null` = volta à forma ORIGINAL ("Voltar à proposta original"): a `forma` do verbete do
 *     usuário, ou o `pt` do verbete do pacote (`glossary_entry.pt`; a `pt_proposed` do tradutor não entra). Quem escreve
 *     grava `null`, e não o texto, quando o texto digitado é igual (depois de normalizado) à original. O valor anterior
 *     fica no histórico do campo (a fusão guarda toda escrita). A forma é só do português (a `de` e a `en` não mudam).
 *   - `status` (`"proposed"` | `"approved"`) e `formaAprovada` (texto ou `null`): "Aprovar" grava os DOIS num evento só, um par
 *     como `termos` + `termosRotulos`: `status: "approved"` e `formaAprovada` = a forma que a pessoa ESTAVA VENDO (a `formaEmUso`
 *     na tela, ou `null` se era a original). "Voltar a revisar" grava só `status: "proposed"`. Mudar a forma de um verbete
 *     aprovado grava antes `status: "proposed"` (inofensivo; a tela avisa "A forma mudou; aprove de novo quando quiser.").
 *   - O ESTADO DE AGORA É DERIVADO, nunca o `status` cru (REGRA EXATA, a que a exportação da Tarefa 16 usa, para cada
 *     registro `verbete` vivo; `situacaoDoVerbete`). Seja `original` = a `forma` do verbete do usuário, ou o `pt` do verbete
 *     do pacote; `deAgora` = `formaEmUso ?? original`; `base` = o `status` gravado, ou o `status` do pacote se nunca foi
 *     gravado; `aprovada` = `formaAprovada ?? original`. O verbete está APROVADO se, e só se, `base == "approved"` E
 *     `normalizarForma(aprovada) == normalizarForma(deAgora)`; senão está "a revisar". Para um verbete que o pacote traz
 *     aprovado e que ninguém aprovou, `aprovada` é o `pt` do pacote: mudar a forma o desaprova, e voltar à original o
 *     aprova de novo. Uma aprovação escrita sem `formaAprovada` (antes desta regra) vale para a original. A regra não
 *     depende da ordem de escrita nem dos hlc: com dois aparelhos, o hlc não diz o que cada pessoa estava vendo (A edita G em
 *     t1; B, sem ter visto G, aprova F em t2 > t1: a forma de agora é G, a aprovada é F, "a revisar"). A recuperação de um
 *     texto digitado (`recuperarEmergencias`) escreve só `formaEmUso`, e a mesma derivação o trata. Um `status: "proposed"`
 *     sobre um verbete que o pacote traz aprovado é uma desaprovação.
 *   - Verbete do pacote: o reg é o id do pacote e NÃO há `criar` (a fusão cria o registro com o primeiro evento); `forma`
 *     nunca é escrita nele. Verbete do usuário: o `criar` de cima não é tocado.
 *   - `formaEmUso` de um verbete do PACOTE substitui o `pt` (a forma de VERBETE, a etiqueta, que pode levar glosa:
 *     "olhos (forma de botão)"), e nunca o `pt_text` (a forma de TEXTO CORRIDO, quando existe): o texto corrido de uma frase
 *     segue `pt_text ?? pt` (`current_form` do pipeline, R22). Um verbete do usuário não tem `pt_text`.
 *   - O QUE O APP FAZ COM ISSO (só o que se vê). A forma em uso substitui o nome nas listas, nos títulos, nas linhas de
 *     "Hipóteses por nível", no painel e nas pílulas de termo das hipóteses (que guardam `termosRotulos` do dia em que
 *     foram feitas, nunca reescritos). O nome de agora de um termo é, NESTA ORDEM: forma em uso → nome do pacote
 *     (o `pt`, a forma de verbete, a mesma que o campo Termo oferece; só sem `pt`, o `pt_text`) → rótulo guardado (só quando o verbete não existe; um verbete do pacote nunca "some").
 *   - REGRA DO TEXTO CORRIDO (a do `refresh_terms` do pipeline; `exibirTermo`). No texto, o trecho de um termo é a forma
 *     FLEXIONADA da frase ("leões-de-teste", "figuras denteadas"). A forma em uso só substitui o trecho quando o trecho é o
 *     termo INTEIRO, é igual ao `pt` do pacote sem diferenciar caixa (mas diferenciando diacríticos: `toLocaleLowerCase`) e o
 *     verbete NÃO tem `pt_text` próprio (distinto do `pt`); a maiúscula do começo do trecho se mantém ("Selo de teste" →
 *     "Selo de prova"). Em qualquer outro caso o trecho fica como foi escrito e a forma em uso vai na dica
 *     (`data-tip="Forma em uso: X"`) e no nome acessível ("<trecho> (forma em uso: X)"). Quando o trecho é trocado, a dica e o
 *     nome acessível dizem o que o tradutor escreveu ("Na tradução: X"): a regra não vê gênero nem número. NADA do que é guardado muda: os
 *     `inicio`/`fim` dos termos e das âncoras são code points no texto GUARDADO (`unit_pt_render.texto`), o sha da âncora é
 *     o desse texto, e a seleção do usuário vira posições do texto guardado (`data-b`/`data-b-fim`). Para o porte em
 *     Python: o texto a que uma posição se refere nunca é o texto com a forma em uso.
 *   - BUSCA: a forma em uso e a original acham o verbete (e os objetos dele); uma hipótese SKC é achada pelo nome de
 *     agora dos seus termos e pelo rótulo guardado.
 *   - EXPORTAÇÃO (Tarefa 16): para cada registro `verbete` vivo, `formaEmUso` não-nulo é a decisão de forma do
 *     usuário (a do pacote: o `pt` do verbete `<id>`, a forma de verbete; a do usuário: o `pt` do verbete novo) e o estado de
 *     agora DERIVADO (REGRA EXATA acima) é a aprovação: aprovado só se a forma aprovada é a de agora; o `status` cru não vale. Um verbete do usuário ainda é uma
 *     entrada nova para o glossário do pipeline (id `GL-<aparelho>-<n>`, a `forma` criada e a em uso). Ganha, por campo, a
 *     escrita de maior hlc (a fusão de sempre; `formaEmUso` e `status` são campos independentes).
 *   - DUPLICADOS: o app não junta nada. Dois verbetes, do usuário ou um do usuário e um do livro, com a mesma
 *     `chaveDaForma` do nome de AGORA são "possível duplicado" (também dois do livro, quando a pessoa renomeou um); a exportação deve deduplicar por essa chave (a mesma
 *     `dobrar` de sempre) antes de criar entradas novas no glossário do pipeline.
 * - `excluir` / `restaurar`: a marca de sempre, SÓ para o verbete do usuário (a tela "Excluir o verbete" pede a confirmação
 *   com o nome; um verbete do pacote nunca se exclui). As hipóteses que o usam seguem apontando para ele, com o nome
 *   guardado: nada é reescrito. "Desfazer" logo depois de registrar uma hipótese exclui o verbete que foi criado só para
 *   ela, se nada mais o usa (src/hipoteses/operacoes.ts, `desfazerRegistro`).
 * - Leitura: `forma` que não é texto ou é vazia = o id; `status` fora da lista = `"proposed"`; `formaEmUso` que não é
 *   texto ou é vazia = null; `formaAprovada` que não é texto ou é vazia = null (a original).
 *
 * DOIS APARELHOS sem internet criando o "mesmo" termo (a mesma `chaveDaForma`): são DOIS verbetes, com ids diferentes
 * (o aparelho está no id), e os dois aparecem em "a revisar" no Glossário. A fusão não tenta juntá-los. Tarefa 11: a lista
 * e a página de cada um dizem "possível duplicado" (mesma chave na forma de AGORA, `duplicadosNoGlossario`); quem decide é a
 * pessoa, renomeando ou excluindo (reversível). NÃO há "juntar": nenhum redirecionamento foi criado, e nada de uma
 * hipótese é reescrito. No MESMO aparelho, criar um termo cuja chave já existe (num verbete do pacote ou do usuário) oferece o
 * existente em vez de um novo (src/hipoteses/CampoDeTermos.tsx e `registrarHipotese`).
 *
 * PARA O PORTE EM PYTHON: `re.fullmatch` com as classes explícitas (`[a-z0-9]`, `[0-9]`; nada de `\d` nem de `$`).
 * `chaveDaForma` (só o app compara chaves; é a mesma dobra do filtro dos campos, `dobrar`): a forma normalizada (acima),
 * `unicodedata.normalize('NFD', …)`, tirar as categorias `M*`, `lower()`, tirar U+02BF ʿ, U+02BE ʾ, U+0027 ', U+2019 ’,
 * U+0060 ` e U+00B4 ´, trocar cada sequência de espaços (`\s+` do JS) por um espaço e tirar os das pontas. O hífen fica.
 * O `toLowerCase` do JS e o `str.lower` do Python coincidem nos alfabetos do glossário (latino, grego, cirílico).
 */
import type { Campos } from '../usuario/eventos'
import type { Registro } from '../usuario/fusao'

export const RE_VERBETE_SKC = /^GL-[a-z0-9]{8}-[1-9][0-9]*$/
export const RE_VERBETE_DO_PACOTE = /^GL-[0-9]{6,}$/

export const eVerbeteSkc = (id: unknown): id is string => typeof id === 'string' && RE_VERBETE_SKC.test(id)

export const STATUS_DO_VERBETE = ['proposed', 'approved'] as const
export type StatusDoVerbete = (typeof STATUS_DO_VERBETE)[number]
export const ROTULO_DO_STATUS: Record<StatusDoVerbete, string> = { proposed: 'a revisar', approved: 'aprovado' }

/** NFC, sem espaço nas pontas, cada sequência de espaços vira um espaço. */
export const normalizarForma = (t: string): string => t.normalize('NFC').replace(/\s+/g, ' ').trim()

/**
 * A dobra de um texto para comparar e filtrar (revisão 3 da Tarefa 10, Minor 2: UMA só, a do filtro dos campos de
 * escolha, src/objetos-skc/CampoDeEscolha.tsx, e a da chave da forma): NFD, sem as marcas combinantes (`\p{M}`), em
 * minúsculas, sem ʿ ʾ ' ’ ` ´ (o ʿayin e o ʾalef das transliterações e os apóstrofos), cada sequência de espaços vira
 * um, sem espaço nas pontas. O hífen fica.
 */
export const dobrar = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[ʿʾ'’`´]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** A chave que diz se duas formas são "a mesma": a forma normalizada, dobrada (sem caixa, sem diacríticos, sem ʿ ʾ e apóstrofos). */
export const chaveDaForma = (t: string): string => dobrar(normalizarForma(t))

export interface VerbeteSkc {
  id: string
  /** A forma como foi criada (a proposta original). */
  forma: string
  /** A forma em uso escrita pela Tarefa 11 (null: a `forma`). */
  formaEmUso: string | null
  /** O que as telas mostram: `formaEmUso` ou `forma`. */
  emUso: string
  /** O estado de AGORA (`situacaoDoVerbete`): "aprovado" só se a forma aprovada é a de agora. */
  status: StatusDoVerbete
  /** Havia uma aprovação e a forma mudou depois. */
  aprovacaoDesatualizada: boolean
  /** hlc do `criar`. */
  criadoEm: string
  excluido: boolean
}

const textoNaoVazio = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

export function lerVerbeteSkc(r: Registro): VerbeteSkc {
  const c = r.campos
  const forma = textoNaoVazio(c.forma) ?? r.id
  const formaEmUso = textoNaoVazio(c.formaEmUso)
  const gravado: StatusDoVerbete = (STATUS_DO_VERBETE as readonly unknown[]).includes(c.status) ? (c.status as StatusDoVerbete) : 'proposed'
  const situacao = situacaoDoVerbete({ formaEmUso, status: gravado, formaAprovada: textoNaoVazio(c.formaAprovada) }, forma, gravado)
  return {
    id: r.id,
    forma,
    formaEmUso,
    emUso: formaEmUso ?? forma,
    status: situacao.status,
    aprovacaoDesatualizada: situacao.aprovacaoDesatualizada,
    criadoEm: r.criadoEm,
    excluido: r.excluido,
  }
}

/**
 * O que a Tarefa 11 escreve num verbete, o mesmo para o do pacote e o do usuário: a forma em uso (null ou vazia: a
 * original) e o estado (null: nunca mexido, vale o do pacote). Um verbete do pacote não tem `forma` nem `criar`.
 */
export interface EdicaoDoVerbete {
  formaEmUso: string | null
  /** O estado GRAVADO (null: nunca mexido, vale o do pacote). Não é o estado de agora: veja `situacaoDoVerbete`. */
  status: StatusDoVerbete | null
  /** A forma que a pessoa estava vendo ao aprovar, por extenso (null, só em eventos antigos: a original de agora). Escrita junto com `status: "approved"`, num evento só. */
  formaAprovada: string | null
}

export function lerEdicaoDoVerbete(r: Registro): EdicaoDoVerbete {
  const c = r.campos
  return {
    formaEmUso: textoNaoVazio(c.formaEmUso),
    status: (STATUS_DO_VERBETE as readonly unknown[]).includes(c.status) ? (c.status as StatusDoVerbete) : null,
    formaAprovada: textoNaoVazio(c.formaAprovada),
  }
}

/**
 * O ESTADO DE AGORA de um verbete (revisão 2 da Tarefa 11, I-A): aprovado se, e só se, o estado gravado (ou o do pacote, se
 * nunca mexido) é `approved` E a forma aprovada é a forma de agora. A forma aprovada é a que a aprovação gravou
 * (`formaAprovada`; null = a original) ou, quando o pacote o traz aprovado e ninguém o aprovou, o `pt` do pacote (a original).
 * A forma de agora é a `formaEmUso` ou, sem ela, a original. Formas se comparam normalizadas (`normalizarForma`). Isto vale
 * para o app (a ✓, o filtro "a revisar", a contagem, a página) e para a exportação, qualquer que seja a ordem em que os
 * aparelhos escreveram: o hlc não diz o que cada pessoa estava vendo. `aprovacaoDesatualizada`: havia uma aprovação e a forma
 * mudou depois (a tela avisa "A forma mudou; aprove de novo quando quiser.").
 */
export function situacaoDoVerbete(edicao: EdicaoDoVerbete | null, original: string, statusDoPacote: StatusDoVerbete): { status: StatusDoVerbete; aprovacaoDesatualizada: boolean } {
  const gravado = edicao?.status ?? statusDoPacote
  if (gravado !== 'approved') return { status: 'proposed', aprovacaoDesatualizada: false }
  const aprovada = normalizarForma(edicao?.formaAprovada ?? original)
  const deAgora = normalizarForma(edicao?.formaEmUso ?? original)
  return aprovada === deAgora ? { status: 'approved', aprovacaoDesatualizada: false } : { status: 'proposed', aprovacaoDesatualizada: true }
}

/** Os campos do `criar` de um verbete do usuário. */
export function camposDoVerbeteNovo(forma: string): Campos {
  const f = normalizarForma(forma)
  if (f === '') throw new Error('verbete sem forma')
  return { forma: f, status: 'proposed' }
}
