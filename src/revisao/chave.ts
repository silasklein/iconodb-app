/**
 * A chave estável de um caso da fila de revisão do pacote: é o `reg` do registro `revisao` que a pessoa cria ao marcar o caso
 * como resolvido. Não usa o `id` numérico de `review_queue` (ele depende da ordem em que o pipeline gravou e muda a cada
 * pacote novo): vem do que o caso DIZ (motivo, entidade, id e texto), então o mesmo caso tem a mesma chave em qualquer
 * aparelho e em qualquer versão do pacote que o traga de novo. Dois casos idênticos na fila ganham um sufixo de repetição.
 *
 * LIMITES DA ESTABILIDADE (o que acontece quando o pipeline muda):
 * - A chave é estável enquanto o pipeline emitir o mesmo `(motivo, entidade, entity_id, detail)`. Qualquer mudança de redação do
 *   `detail` (por exemplo «; sem autor na citação») dá OUTRA chave: os casos daquele motivo voltam como abertos, e a marca
 *   antiga fica órfã (o registro `revisao` continua vivo, invisível e inofensivo; volta a valer se o texto voltar).
 * - O `detail` de alguns motivos carrega o que mudou: `traducao_termo_alterado` traz a forma antiga → nova (se a forma muda de
 *   novo, o caso volta, e é o desejável); `traducao_desatualizada` traz o nome do arquivo e o texto dos erros.
 * - As linhas de entidade `site` usam o `entity_id` inteiro (autoincremento do build): um sítio novo antes dele renumera, e a
 *   marca passa a apontar para outro caso (ou para nenhum).
 * - O caso repetido leva o sufixo `~2`, `~3`…, pela ordem em que o pacote o traz; trocar a ordem entre dois casos idênticos
 *   troca qual deles está marcado (os dois têm o mesmo texto, então não se nota).
 * Nada se perde em nenhum desses casos: no pior deles, um caso já decidido volta à fila e a pessoa o deixa como está de novo.
 * A Tarefa 16 (portar a lista de tipos para Python) ainda não lê o tipo `revisao`: ele é só do app.
 */

/** cyrb53 do texto (NFC), em 14 dígitos hexadecimais. Puro e igual em qualquer aparelho. */
export function resumoDoTexto(texto: string): string {
  const t = texto.normalize('NFC')
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const alto = (h2 >>> 0) & 0x1fffff
  return alto.toString(16).padStart(6, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

export interface CasoBruto {
  tipo: string
  entidade: string
  entidadeId: string | null
  detalhe: string
}

/** A chave de um caso do pacote; `repeticao` conta quantos casos idênticos já vieram antes (0 para o primeiro). */
export function chaveDoCaso(c: CasoBruto, repeticao = 0): string {
  const base = `${c.tipo}~${c.entidade}~${c.entidadeId ?? ''}~${resumoDoTexto(c.detalhe)}`
  return repeticao > 0 ? `${base}~${repeticao + 1}` : base
}

/** As chaves de todos os casos, na ordem dada: os repetidos levam o sufixo. */
export function chavesDosCasos(casos: readonly CasoBruto[]): string[] {
  const vistos = new Map<string, number>()
  return casos.map((c) => {
    const base = chaveDoCaso(c)
    const n = vistos.get(base) ?? 0
    vistos.set(base, n + 1)
    return n === 0 ? base : chaveDoCaso(c, n)
  })
}

/**
 * Os casos que nascem do estado do usuário, não do pacote.
 * O sítio solto leva o NOME (ou o id do sítio excluído) no resumo: marcar «deixar como está» vale para aquele problema, e um
 * nome livre novo no mesmo objeto, semanas depois, é outro caso.
 */
export const chaveDoSitioSolto = (objeto: string, nome = ''): string => `sitio-skc~${objeto}~${resumoDoTexto(nome)}`
/** O rascunho sem número não se marca (só se resolve dando o período): a chave só o identifica na lista. */
export const chaveDoRascunho = (objeto: string): string => `rascunho~${objeto}`
/** Um elemento do livro sem região: a chave é o id dele (estável entre builds, porque é o id do elemento no livro). */
export const chaveDoElementoSemRegiao = (elemento: string): string => `regiao-a-desenhar~${elemento}`
