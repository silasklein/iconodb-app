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
 * - CAMPOS COMPLETOS (Parte 2C, bloco 3, Tarefa 12; os nomes e as formas são os do `user-import`, `CAMPOS_DO_VERBETE` em
 *   iconodb/usuario_import.py, que leva cada um para a coluna do `glossary_entry`). Um `alterar` por campo, gravado na hora
 *   (`alterarCamposDoVerbete`); ganha, por campo, a escrita de maior hlc. Uma escrita `null` limpa o campo. Quem escreve
 *   grava só a forma normalizada (`camposParaGravar`); quem lê aceita o que vier e deixa de fora o que não está no formato.
 *   - `tipo`: `"concept"` | `"name"` | `"technical"` (→ `kind`); `genero`: `"m"` | `"f"` (→ `pt_gender`); `numero`:
 *     `"sg"` | `"pl"` (→ `pt_number`). Outro valor não é gravado.
 *   - `de`, `en`, `he`, `ar` (texto, `normalizarForma`; vazio = `null`). O hebraico e o árabe são mostrados com `dir="rtl"`.
 *   - `outras` («Outra língua»): `[{"lingua": texto, "forma": texto}]`, na ordem (→ `other_forms`). A língua é o nome dela
 *     como a pessoa escreve («francês»), não um código. Uma linha ainda pela metade (só a língua, ou só a forma) é gravada
 *     assim, para não se perder; o `user-import` a deixa de fora sem aviso, e a página e a busca só usam as linhas inteiras.
 *     Linhas vazias e repetidas não são gravadas; a lista vazia é `null`.
 *   - `variantes`, `iconclass`, `sssl`: listas de textos (→ `variants`, `iconclass`, `sssl`), sem vazios nem repetidos; a
 *     lista vazia é `null`. Na publicação, as variantes se juntam às do verbete de destino (união).
 *   - `pai` («Termo mais geral»): o id de outro verbete, do livro (`GL-<dígitos>`) ou do usuário (`GL-<aparelho>-<n>`; o
 *     `user-import` o troca pelo id do livro dele) (→ `parent_id`). Nunca o próprio verbete.
 *   - Os campos são escritos no registro do verbete do usuário. Depois de publicado (o pacote o redireciona para um
 *     `GL-<dígitos>`), o `user-import` também lê os campos escritos no registro com o id do livro.
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
  /** Os campos completos (Tarefa 12): tipo, gênero, número, as outras línguas, as variantes, o pai, Iconclass e SSSL. */
  campos: CamposCompletos
}

const textoNaoVazio = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

// ---- Os campos completos (Parte 2C, bloco 3, Tarefa 12; o formato está no cabeçalho)

export const TIPOS_DO_VERBETE = ['concept', 'name', 'technical'] as const
export type TipoDoVerbete = (typeof TIPOS_DO_VERBETE)[number]
/** O tipo como a etiqueta do verbete o diz (o mesmo do verbete dos livros). */
export const ROTULO_DO_TIPO: Record<TipoDoVerbete, string> = { concept: 'Conceito', name: 'Nome', technical: 'Técnico' }
export const GENEROS_DO_VERBETE = ['m', 'f'] as const
export type GeneroDoVerbete = (typeof GENEROS_DO_VERBETE)[number]
export const NUMEROS_DO_VERBETE = ['sg', 'pl'] as const
export type NumeroDoVerbete = (typeof NUMEROS_DO_VERBETE)[number]
export const ROTULO_DO_GENERO: Record<GeneroDoVerbete, string> = { m: 'masculino', f: 'feminino' }
export const ROTULO_DO_NUMERO: Record<NumeroDoVerbete, string> = { sg: 'singular', pl: 'plural' }

/** Uma linha de «Outra língua»: o nome da língua, como a pessoa o escreve, e a forma nela. */
export interface OutraForma {
  lingua: string
  forma: string
}

export interface CamposCompletos {
  tipo: TipoDoVerbete | null
  genero: GeneroDoVerbete | null
  numero: NumeroDoVerbete | null
  de: string | null
  en: string | null
  he: string | null
  ar: string | null
  /** Na ordem; pode ter uma linha pela metade (só a língua ou só a forma): veja `outrasInteiras`. */
  outras: OutraForma[]
  variantes: string[]
  /** O id do termo mais geral (`GL-<dígitos>` ou `GL-<aparelho>-<n>`). */
  pai: string | null
  iconclass: string[]
  sssl: string[]
}

/** Os nomes dos campos completos, os mesmos do `user-import` (`CAMPOS_DO_VERBETE`). */
export const CAMPOS_COMPLETOS = ['tipo', 'genero', 'numero', 'de', 'en', 'he', 'ar', 'outras', 'variantes', 'pai', 'iconclass', 'sssl'] as const satisfies readonly (keyof CamposCompletos)[]

export const CAMPOS_VAZIOS: CamposCompletos = { tipo: null, genero: null, numero: null, de: null, en: null, he: null, ar: null, outras: [], variantes: [], pai: null, iconclass: [], sssl: [] }

const umDe = <T extends string>(lista: readonly T[], v: unknown): T | null => ((lista as readonly unknown[]).includes(v) ? (v as T) : null)
const eIdDeVerbete = (v: unknown): v is string => typeof v === 'string' && (RE_VERBETE_SKC.test(v) || RE_VERBETE_DO_PACOTE.test(v))

/** Os textos de uma lista, normalizados, sem vazios nem repetidos (o que não é texto fica de fora). */
export function listaDeTextos(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const saida: string[] = []
  for (const x of v) {
    if (typeof x !== 'string') continue
    const t = normalizarForma(x)
    if (t !== '' && !saida.includes(t)) saida.push(t)
  }
  return saida
}

/** As linhas de «Outra língua», normalizadas; sem as vazias e as repetidas (uma pela metade fica). */
export function listaDeOutras(v: unknown): OutraForma[] {
  if (!Array.isArray(v)) return []
  const saida: OutraForma[] = []
  for (const x of v) {
    if (typeof x !== 'object' || x === null || Array.isArray(x)) continue
    const { lingua, forma } = x as Record<string, unknown>
    if ((lingua != null && typeof lingua !== 'string') || (forma != null && typeof forma !== 'string')) continue
    const linha = { lingua: normalizarForma(typeof lingua === 'string' ? lingua : ''), forma: normalizarForma(typeof forma === 'string' ? forma : '') }
    if ((linha.lingua !== '' || linha.forma !== '') && !saida.some((o) => o.lingua === linha.lingua && o.forma === linha.forma)) saida.push(linha)
  }
  return saida
}

const textoDoCampo = (v: unknown): string | null => (typeof v === 'string' && normalizarForma(v) !== '' ? normalizarForma(v) : null)

/** Os campos completos de um registro `verbete`, lidos com folga: o que não está no formato fica vazio. */
export function lerCamposCompletos(c: Campos): CamposCompletos {
  return {
    tipo: umDe(TIPOS_DO_VERBETE, c.tipo),
    genero: umDe(GENEROS_DO_VERBETE, c.genero),
    numero: umDe(NUMEROS_DO_VERBETE, c.numero),
    de: textoDoCampo(c.de),
    en: textoDoCampo(c.en),
    he: textoDoCampo(c.he),
    ar: textoDoCampo(c.ar),
    outras: listaDeOutras(c.outras),
    variantes: listaDeTextos(c.variantes),
    pai: eIdDeVerbete(c.pai) ? c.pai : null,
    iconclass: listaDeTextos(c.iconclass),
    sssl: listaDeTextos(c.sssl),
  }
}

/** As linhas de «Outra língua» com a língua E a forma (as que a página mostra, a busca acha e o `user-import` publica). */
export const outrasInteiras = (outras: readonly OutraForma[]): OutraForma[] => outras.filter((o) => o.lingua !== '' && o.forma !== '')

/** Algum campo completo está preenchido (a página mostra «Dados do verbete»). */
export const temCamposCompletos = (c: CamposCompletos): boolean =>
  CAMPOS_COMPLETOS.some((k) => {
    const v = c[k]
    return Array.isArray(v) ? v.length > 0 : v !== null
  })

/** As formas que a busca acha num verbete: alemão, inglês, hebraico, árabe, as outras línguas (inteiras) e as variantes. */
export const formasDaBusca = (c: CamposCompletos): string[] =>
  [c.de, c.en, c.he, c.ar, ...outrasInteiras(c.outras).map((o) => o.forma), ...c.variantes].filter((x): x is string => x !== null)

/**
 * O evento que grava `campos` (um ou mais campos completos): cada um normalizado como o cabeçalho diz; vazio = `null`.
 * Um valor fora do formato é erro (nada é gravado), inclusive uma lista com um item fora do formato: a folga é só da leitura. `id`: o verbete, para recusar ser o próprio pai.
 */
export function camposParaGravar(id: string, campos: Partial<CamposCompletos>): Campos {
  const saida: Campos = {}
  for (const [k, v] of Object.entries(campos) as [keyof CamposCompletos, unknown][]) {
    if (!(CAMPOS_COMPLETOS as readonly string[]).includes(k)) throw new Error(`campo desconhecido: ${k}`)
    if (v === undefined) continue
    switch (k) {
      case 'tipo':
      case 'genero':
      case 'numero': {
        const lista = k === 'tipo' ? TIPOS_DO_VERBETE : k === 'genero' ? GENEROS_DO_VERBETE : NUMEROS_DO_VERBETE
        if (v !== null && umDe(lista, v) === null) throw new Error(`${k} desconhecido: ${String(v)}`)
        saida[k] = v as string | null
        break
      }
      case 'pai':
        if (v !== null && !eIdDeVerbete(v)) throw new Error(`pai não é o id de um verbete: ${String(v)}`)
        if (v === id) throw new Error('o verbete não é o termo mais geral dele mesmo')
        saida.pai = v as string | null
        break
      case 'outras': {
        if (v !== null && !Array.isArray(v)) throw new Error('outras: esperada uma lista')
        // na escrita não há folga: um item fora do formato recusa a lista inteira (nada é apagado em silêncio)
        for (const x of (v as unknown[] | null) ?? []) {
          const o = x as Record<string, unknown> | null
          if (typeof o !== 'object' || o === null || Array.isArray(o) || Object.keys(o).some((c) => c !== 'lingua' && c !== 'forma') || (o.lingua != null && typeof o.lingua !== 'string') || (o.forma != null && typeof o.forma !== 'string'))
            throw new Error(`outras: item fora do formato (esperado {lingua, forma}): ${JSON.stringify(x)}`)
        }
        const l = listaDeOutras(v)
        saida.outras = l.length > 0 ? l.map((o) => ({ lingua: o.lingua, forma: o.forma })) : null
        break
      }
      case 'variantes':
      case 'iconclass':
      case 'sssl': {
        if (v !== null && !Array.isArray(v)) throw new Error(`${k}: esperada uma lista`)
        if (((v as unknown[] | null) ?? []).some((x) => typeof x !== 'string')) throw new Error(`${k}: só textos na lista`)
        const l = listaDeTextos(v)
        saida[k] = l.length > 0 ? l : null
        break
      }
      default:
        if (v !== null && typeof v !== 'string') throw new Error(`${k}: esperado um texto`)
        saida[k] = textoDoCampo(v)
    }
  }
  if (Object.keys(saida).length === 0) throw new Error('nenhum campo para gravar')
  return saida
}

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
    campos: lerCamposCompletos(c),
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
