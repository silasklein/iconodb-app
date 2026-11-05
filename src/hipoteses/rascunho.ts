/**
 * O rascunho do formulário "Nova hipótese" (NovaHipotese.dc.html, PC-ItemNovaHipotese.dc.html), antes de "Registrar"
 * (antes disso o registro não existe, e `useCampoSalvo` não serve). Como o de NovoObjeto (Tarefa 9): a cada mudança o
 * formulário inteiro vai ao `localStorage`, de forma SÍNCRONA (o Chromium corta escritas no IndexedDB ao fechar a
 * página; o localStorage, na mesma tarefa, não). Um rascunho por objeto (`iconodb:nova-hipotese:<objeto>`).
 *
 * - Enquanto o formulário está aberto (`aberto`), recarregar a página (ou ir ao visualizador desenhar a região nova, no
 *   celular) e voltar reabre o formulário como estava.
 * - Esc e × FECHAM o formulário e guardam o rascunho (`aberto: false`), como o Esc das notas (decisão 37; revisão 1, I2):
 *   Shift+H ou "Retomar a hipótese em preparo" o reabrem de onde estava. Fechado sem nada preenchido, é apagado.
 * - Só "Descartar" (com confirmação) e o fim de "Registrar" apagam o rascunho.
 * - `reserva`: os ids reservados por `registrarHipotese` ANTES de gravar (a hipótese, a região nova e os verbetes dos
 *   termos novos, decisão 41); `criado`: o id gravado. Com eles, um segundo "Registrar" (clique duplo, ou o salvar
 *   interrompido e retomado) nunca cria outra hipótese nem outro verbete (ver ./operacoes.ts).
 * - Um termo a criar ("Criar termo «…»") fica em `termos` com `novo: true` e o id provisório `novo:<chave>`.
 * - DUAS ABAS (revisão 3, M5): a chave é a mesma para as abas. O formulário aberto ouve o evento `storage`: se outra aba
 *   grava outro conteúdo (ou apaga o rascunho), ele para de gravar e pergunta qual fica ("Usar a da outra aba" / "Manter
 *   a desta aba"). Se a outra aba registrou (o `criado` dela foi visto, ou o registro do id que ela reservou chegou), o
 *   aviso diz "foi registrada na outra aba" e oferece abri-la; registrar esta de novo só como OUTRA hipótese, escolhido
 *   (revisão 4, I2). Uma diferença só em `reserva`/`criado` é adotada em silêncio. Nada se sobrescreve sem a pessoa saber. O "Salvar e
 *   registrar hipótese" do visualizador também pergunta antes de trocar uma hipótese em preparo. A chave é a do
 *   PRINCIPAL do grupo de ligação (a tela onde o formulário abre), nunca a do membro dono da imagem.
 *
 * Tudo em try/catch: sem armazenamento (modo privado), o formulário funciona, só não guarda.
 */
import type { Modalidade, Nivel } from '../banco/tipos'
import type { PontoRelativo } from '../imagem/desenhar'
import { eVerbeteSkc, normalizarForma } from '../glossario/modelo'
import { eElemento, lerAncora, MODALIDADES, NIVEIS_SKC, PREFIXO_DO_TERMO_NOVO, RE_HIPOTESE_SKC, RE_REGIAO, termoNovo, type AncoraDaHipoteseSkc, type TermoEscolhido } from './modelo'
import type { Reserva, RegiaoNova } from './operacoes'

export type SobreNoRascunho =
  | { tipo: 'objeto' }
  | { tipo: 'elemento'; id: string; rotulo: string }
  /** A região nova: `regiao` null enquanto ainda não foi desenhada. */
  | { tipo: 'nova'; regiao: RegiaoNova | null }

export interface RascunhoDaHipotese {
  objeto: string
  ancora: AncoraDaHipoteseSkc | null
  sobre: SobreNoRascunho
  termos: TermoEscolhido[]
  nivel: Nivel
  modalidade: Modalidade
  justificativa: string
  reserva: Reserva | null
  criado: string | null
  /** O formulário está aberto (um rascunho fechado com Esc ou × não reabre sozinho). */
  aberto: boolean
  salvoEm: number
}

const PREFIXO = 'iconodb:nova-hipotese:'
export const chaveDoRascunho = (objeto: string) => `${PREFIXO}${objeto}`

export function rascunhoNovo(objeto: string, ancora: AncoraDaHipoteseSkc | null): RascunhoDaHipotese {
  return { objeto, ancora, sobre: { tipo: 'objeto' }, termos: [], nivel: 'iconographic', modalidade: 'probable', justificativa: '', reserva: null, criado: null, aberto: true, salvoEm: 0 }
}

/** Há algo preenchido além do trecho e dos padrões (termos, justificativa, um elemento ou a região nova)? */
export function rascunhoTemConteudo(r: Pick<RascunhoDaHipotese, 'termos' | 'justificativa' | 'sobre'>): boolean {
  return r.termos.length > 0 || r.justificativa.trim() !== '' || r.sobre.tipo !== 'objeto'
}

/**
 * Dois rascunhos com o mesmo conteúdo: o que a pessoa preencheu. Nem `aberto`/`salvoEm`, nem `reserva`/`criado` (os ids
 * que o registrar de outra aba reservou: esta aba os adota em silêncio; revisão 4, I2).
 */
export function mesmoConteudo(a: RascunhoDaHipotese, b: RascunhoDaHipotese): boolean {
  const c = (r: RascunhoDaHipotese) => JSON.stringify([r.ancora, r.sobre, r.termos, r.nivel, r.modalidade, r.justificativa])
  return c(a) === c(b)
}

const texto = (x: unknown) => (typeof x === 'string' ? x : '')

function lerPontos(x: unknown): PontoRelativo[] | null {
  if (!Array.isArray(x)) return null
  const pontos = x.filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1))
  return pontos.length === x.length ? pontos : null
}

function lerSobre(x: unknown): SobreNoRascunho {
  const s = (x ?? {}) as Record<string, unknown>
  if (s.tipo === 'elemento' && eElemento(s.id)) return { tipo: 'elemento', id: s.id, rotulo: texto(s.rotulo) }
  if (s.tipo === 'nova') {
    const r = (s.regiao ?? null) as Record<string, unknown> | null
    const pontos = r ? lerPontos(r.pontos) : null
    return {
      tipo: 'nova',
      regiao: r && pontos && typeof r.imagem === 'string' && r.imagem ? { imagem: r.imagem, pontos, nome: texto(r.nome), pai: eElemento(r.pai) ? r.pai : null } : null,
    }
  }
  return { tipo: 'objeto' }
}

function lerTermos(x: unknown): TermoEscolhido[] {
  if (!Array.isArray(x)) return []
  const saida: TermoEscolhido[] = []
  for (const t of x) {
    if (!t || typeof t !== 'object' || typeof t.id !== 'string' || typeof t.rotulo !== 'string') continue
    const provisorio = t.id.startsWith(PREFIXO_DO_TERMO_NOVO)
    if (provisorio && t.novo !== true) continue // "novo:…" sem a marca: lixo
    if (provisorio) {
      if (normalizarForma(t.rotulo) !== '') saida.push(termoNovo(t.rotulo))
    } else {
      saida.push({ id: t.id, rotulo: t.rotulo })
    }
  }
  return saida
}

function lerTermosReservados(x: unknown): Record<string, string> {
  const saida: Record<string, string> = {}
  if (!x || typeof x !== 'object' || Array.isArray(x)) return saida
  for (const [chave, id] of Object.entries(x)) if (eVerbeteSkc(id)) saida[chave] = id
  return saida
}

export function lerRascunhoDaHipotese(objeto: string): RascunhoDaHipotese | null {
  let bruto: string | null = null
  try {
    bruto = localStorage.getItem(chaveDoRascunho(objeto))
  } catch {
    return null
  }
  if (!bruto) return null
  try {
    const x = JSON.parse(bruto) as Record<string, unknown>
    if (x.objeto !== objeto) return null
    const reserva = (x.reserva ?? null) as Record<string, unknown> | null
    return {
      objeto,
      ancora: lerAncora(x.ancora),
      sobre: lerSobre(x.sobre),
      termos: lerTermos(x.termos),
      nivel: NIVEIS_SKC.includes(x.nivel as Nivel) ? (x.nivel as Nivel) : 'iconographic',
      modalidade: MODALIDADES.includes(x.modalidade as Modalidade) ? (x.modalidade as Modalidade) : 'probable',
      justificativa: texto(x.justificativa),
      reserva:
        reserva && typeof reserva.hipotese === 'string' && RE_HIPOTESE_SKC.test(reserva.hipotese)
          ? {
              hipotese: reserva.hipotese,
              regiao: typeof reserva.regiao === 'string' && RE_REGIAO.test(reserva.regiao) ? reserva.regiao : null,
              termos: lerTermosReservados(reserva.termos),
            }
          : null,
      criado: typeof x.criado === 'string' && RE_HIPOTESE_SKC.test(x.criado) ? x.criado : null,
      aberto: x.aberto !== false,
      salvoEm: typeof x.salvoEm === 'number' ? x.salvoEm : 0,
    }
  } catch {
    return null
  }
}

export function guardarRascunhoDaHipotese(r: RascunhoDaHipotese): void {
  try {
    localStorage.setItem(chaveDoRascunho(r.objeto), JSON.stringify({ ...r, salvoEm: Date.now() }))
  } catch {
    // Sem armazenamento: o formulário segue, só não sobrevive a um recarregar.
  }
}

export function apagarRascunhoDaHipotese(objeto: string): void {
  try {
    localStorage.removeItem(chaveDoRascunho(objeto))
  } catch {
    // nada a apagar
  }
}
