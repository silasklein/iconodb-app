/**
 * Entregar um arquivo gerado no próprio aparelho (Tarefa 15, as exportações), sem rede e sem mudar a CSP:
 * - no navegador (e no app instalado no Mac, o do Dock): um Blob, um link `<a download>` clicado e tirado do documento, e
 *   a URL revogada depois (`URL.revokeObjectURL`, na volta do agendamento: revogar no mesmo instante do clique faz o
 *   Safari perder o arquivo). No Mac, a folha de compartilhar do macOS não tem «Salvar em Arquivos», então nunca é usada;
 * - no app instalado num aparelho de TOQUE (iPhone, iPad: `display-mode: standalone` ou `navigator.standalone`, e
 *   `navigator.maxTouchPoints > 0`; o iPadOS se apresenta como Mac, mas tem toque), onde o `<a download>` com blob não é
 *   confiável: se o navegador pode compartilhar o arquivo (`navigator.canShare({files})`), a folha de compartilhar
 *   (`navigator.share({files})`), de onde a pessoa escolhe "Salvar em Arquivos".
 *   - A folha exige um toque recente. Quem chama monta o arquivo ANTES (`criarArquivo`) e `entregarArquivo` pede a folha
 *     sem esperar nada antes (o pedido sai no mesmo instante da chamada).
 *   - Cancelar a folha não é erro ('cancelado').
 *   - Se o navegador recusa por falta de um toque recente (`NotAllowedError`: montar o arquivo levou tempo), NÃO cai no
 *     link (o caminho não confiável): devolve 'precisa-tocar', e quem chama guarda o arquivo e oferece um botão que o
 *     entrega de novo, num toque novo, sem montar nada.
 *   - Qualquer outro erro da folha (nem `AbortError`, nem `NotAllowedError`) acontece com o arquivo já montado: devolve
 *     'folha-falhou' (não sobe como erro, que diria «não foi possível gerar o arquivo»), e quem chama guarda o arquivo,
 *     diz que a folha não abriu e oferece «Salvar o arquivo» e o link de download (decisão 54, adendo do E-9).
 *   Erros ao montar o arquivo (antes de `entregarArquivo`) não passam por aqui: sobem para quem monta.
 * Um Blob e uma URL `blob:` não pedem diretiva nova na CSP (o download é uma navegação, e `default-src 'none'` não a regula).
 */

export type Entrega = 'baixado' | 'compartilhado' | 'cancelado' | 'precisa-tocar' | 'folha-falhou'

/** O que o navegador oferece (injetável nos testes). */
export interface AmbienteDaEntrega {
  emModoApp: () => boolean
  comToque: () => boolean
  navegador: { canShare?: (dados?: ShareData) => boolean; share?: (dados?: ShareData) => Promise<void> }
  criarUrl: (blob: Blob) => string
  revogarUrl: (url: string) => void
  agendar: (f: () => void) => void
}

/** O app aberto pelo ícone da tela de início (display-mode standalone), ou o `navigator.standalone` do iPhone. */
export function emModoApp(): boolean {
  if ((navigator as { standalone?: boolean }).standalone === true) return true
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches === true
  } catch {
    return false
  }
}

/** Um aparelho de toque (iPhone, iPad, que se apresenta como Mac): o Mac não tem pontos de toque. */
export function comToque(): boolean {
  return (navigator.maxTouchPoints ?? 0) > 0
}

/** Quanto esperar para revogar a URL: o navegador já começou a baixar quando o clique volta. */
const REVOGAR_DEPOIS_MS = 60_000

function ambientePadrao(): AmbienteDaEntrega {
  return {
    emModoApp,
    comToque,
    navegador: navigator,
    criarUrl: (b) => URL.createObjectURL(b),
    revogarUrl: (u) => URL.revokeObjectURL(u),
    agendar: (f) => void setTimeout(f, REVOGAR_DEPOIS_MS),
  }
}

const nomeDoErro = (e: unknown) => (e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '')

/** O arquivo `nome` (do tipo MIME `tipo`) com `conteudo`, pronto para entregar (e para entregar de novo). */
export function criarArquivo(nome: string, conteudo: string, tipo: string): File {
  return new File([conteudo], nome, { type: tipo })
}

/**
 * O mesmo, com o conteúdo já num Blob (a cópia completa, .zip, montada em partes): o File aponta para as partes do Blob,
 * sem juntá-las num só buffer.
 */
export function criarArquivoDeBlob(nome: string, conteudo: Blob, tipo: string): File {
  return new File([conteudo], nome, { type: tipo })
}

function baixarPorLink(arquivo: File, amb: AmbienteDaEntrega): Entrega {
  const url = amb.criarUrl(arquivo)
  const a = document.createElement('a')
  a.href = url
  a.download = arquivo.name
  a.rel = 'noopener'
  a.hidden = true
  document.body.append(a)
  try {
    a.click()
  } finally {
    a.remove()
    amb.agendar(() => amb.revogarUrl(url))
  }
  return 'baixado'
}

/** Os dados da folha de compartilhar, se é ela que entrega aqui (app instalado num aparelho de toque que compartilha o arquivo). */
function pelaFolha(arquivo: File, amb: AmbienteDaEntrega): ShareData | null {
  const { navegador } = amb
  if (!amb.emModoApp() || !amb.comToque() || typeof navegador.share !== 'function' || typeof navegador.canShare !== 'function') return null
  const dados: ShareData = { files: [arquivo], title: arquivo.name }
  try {
    return navegador.canShare(dados) ? dados : null
  } catch {
    return null
  }
}

/**
 * Entrega o arquivo. Devolve como foi: baixado (o link foi clicado), compartilhado (a folha terminou), cancelado pela
 * pessoa (não é erro) ou 'precisa-tocar' (a folha foi recusada sem um toque recente: entregar o MESMO arquivo de novo num
 * toque novo) ou 'folha-falhou' (a folha falhou por outro motivo, com o arquivo já pronto). Erros do caminho do link
 * (`baixarPorLink`) sobem (`mensagemDoErro` diz em português).
 */
export async function entregarArquivo(arquivo: File, ambiente: AmbienteDaEntrega = ambientePadrao()): Promise<Entrega> {
  const dados = pelaFolha(arquivo, ambiente)
  if (!dados) return baixarPorLink(arquivo, ambiente)
  try {
    // Nenhuma espera antes desta chamada: o navegador só abre a folha com o toque ainda recente.
    await ambiente.navegador.share!(dados)
    return 'compartilhado'
  } catch (erro) {
    if (nomeDoErro(erro) === 'AbortError') return 'cancelado'
    if (nomeDoErro(erro) === 'NotAllowedError') return 'precisa-tocar'
    return 'folha-falhou'
  }
}

/** O erro de uma exportação em português simples. */
export function mensagemDoErro(erro: unknown): string {
  const nome = nomeDoErro(erro)
  if (nome === 'QuotaExceededError') return 'Não há espaço livre no aparelho para gerar o arquivo. Libere espaço e tente de novo.'
  if (erro instanceof RangeError) return 'O arquivo ficou grande demais para este navegador. Tente no computador.'
  return 'Não foi possível gerar o arquivo. Nada foi alterado; tente de novo.'
}
