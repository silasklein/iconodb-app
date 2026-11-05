import { ImagensComProblema } from '../imagens-usuario/ImagensComProblema'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link, useNavigate } from 'react-router'
import { sair } from '../dropbox/auth'
import { IconButton } from '../ui/IconButton'
import { IconeDeSincronizacao } from '../ui/IconeDeSincronizacao'
import { useBreakpoint } from '../ui/useBreakpoint'
import { AvisoDeCopia, MSG_SELECIONE, useCopiar } from '../ui/useCopiar'
import { eventosLocaisNaoEnviados } from '../usuario/armazem'
import type { Op, Tipo } from '../usuario/eventos'
import { linhasDasMudancas } from '../usuario/rotulos'
import { alteracoes, doAparelho, hora, plural, quando, removerChaves, textosDoEstado } from '../usuario/textosDaSync'
import { atalhoDeSalvar, definirAutomatico, sincronizarAgora, useSincronizacao, type InfoDaSync } from '../usuario/useSincronizacao'
import './Sincronizacao.css'

/** O atalho de "Salvar e sincronizar" no formato de aria-keyshortcuts. */
export const ATALHO_DE_SALVAR = 'Control+S Meta+S'
const MAXIMO_VAI_SUBIR = 20
const TITULO_DA_FALHA = 'Não foi possível sincronizar'

type Variante = 'tela' | 'painel'

/** A hora em fonte mono, como no design. */
const Hora = ({ ms }: { ms: number }) => <span className="sync-hora">{hora(ms)}</span>

function Ultima({ ultimaEm }: { ultimaEm: number | null }) {
  if (ultimaEm === null) return <span className="sync-estado-apoio">Ainda não sincronizado neste aparelho</span>
  const q = quando(ultimaEm)
  const [dia] = q.split(', ')
  return (
    <span className="sync-estado-apoio">
      Última sincronização: {dia}, <Hora ms={ultimaEm} />
    </span>
  )
}

/**
 * O estado: título e apoio na região viva (role=status); a última sincronização fica fora dela (a hora
 * mudaria a cada rodada e o leitor de tela a leria de novo). Na tela, com o ícone e a marca.
 */
export function EstadoDaSincronizacao({ info, variante }: { info: InfoDaSync; variante: Variante }) {
  const t = textosDoEstado(info, atalhoDeSalvar())
  return (
    <div className={`sync-estado sync-estado-${variante}`}>
      {variante === 'tela' && <IconeDeSincronizacao marca={t.marca} />}
      <span className="sync-estado-textos">
        <span role="status" className="sync-estado-vivo">
          <span className="sync-estado-titulo">{t.titulo}</span>
          <span className="sync-estado-apoio">{t.apoio}</span>
        </span>
        <Ultima ultimaEm={info.ultimaEm} />
        {info.estadoIlegivel && info.estadoLidoEmParte && info.estadoSoIlegiveis && (
          // A-28: só registros ilegíveis (nenhum de tipo novo): apagar o arquivo é seguro, o app o recria dos diários.
          <span className="sync-estado-apoio sync-estado-aviso">
            O <code>usuario/estado.json</code> do Dropbox tem registros ilegíveis (danificados); o que pôde ser lido entrou. Pode apagar <code>usuario/estado.json</code> no Dropbox: nada se perde, o app o
            recria a partir dos diários.
          </span>
        )}
        {info.estadoIlegivel && info.estadoLidoEmParte && !info.estadoSoIlegiveis && (
          // A-7 (revisão 1 da Tarefa 17a): o arquivo tem registros que esta versão não lê; apagá-lo não é a saída.
          <span className="sync-estado-apoio sync-estado-aviso">
            O <code>usuario/estado.json</code> do Dropbox foi lido só em parte: tem registros que esta versão do app não lê. Atualize o app neste aparelho; se ele já
            está atualizado, atualize o do aparelho que gravou o arquivo. Não apague o estado.json: ele guarda registros que só a versão nova lê.
          </span>
        )}
        {info.estadoIlegivel && !info.estadoLidoEmParte && (
          <span className="sync-estado-apoio sync-estado-aviso">
            Atualize o app neste aparelho; se o problema continuar, apague <code>usuario/estado.json</code> no Dropbox (nada se perde: o app o recria a partir dos diários).
          </span>
        )}
      </span>
    </div>
  )
}

/** Sem login: entrar de novo. Sem permissão: sair e entrar de novo (a permissão só vale depois). */
const TEXTOS_DA_COPIA = { copiada: 'Detalhes copiados', falhou: MSG_SELECIONE }

/**
 * Erro geral (E-16): o texto técnico não fica na tela; este botão o copia, para mandar a quem for ajudar.
 * Se a área de transferência recusar, o texto aparece, já selecionado, para a pessoa copiar à mão (como nos outros botões de copiar).
 */
function CopiarDetalhes({ texto }: { texto: string }) {
  const alvo = useRef<HTMLElement | null>(null)
  const limpo = removerChaves(texto)
  const { aviso, copiar, recusas } = useCopiar(alvo, TEXTOS_DA_COPIA)
  // A recusa tem estado próprio: o aviso some em 4 s, mas o texto técnico fica (e selecionado) até o erro mudar.
  const [recusou, setRecusou] = useState(false)
  useEffect(() => {
    if (aviso === MSG_SELECIONE) setRecusou(true)
  }, [aviso])
  useEffect(() => {
    if (!recusou || aviso !== MSG_SELECIONE || !alvo.current) return
    const faixa = document.createRange()
    faixa.selectNodeContents(alvo.current)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(faixa)
  }, [recusou, aviso, recusas])
  return (
    <div className="sync-copiar">
      <button type="button" className="sync-acao-erro" onClick={() => void copiar(limpo)}>
        Copiar detalhes
      </button>
      <AvisoDeCopia aviso={aviso} />
      {recusou && (
        <p ref={alvo as RefObject<HTMLParagraphElement>} className="sync-nota sync-detalhe-tecnico">
          {limpo}
        </p>
      )}
    </div>
  )
}

export function AcaoDoErro({ info }: { info: InfoDaSync }) {
  const navegar = useNavigate()
  const e = info.estado
  if (typeof e !== 'object' || !('erro' in e)) return null
  if (e.erro === 'geral') return <CopiarDetalhes texto={e.mensagem} />
  if (e.erro === 'login') {
    return (
      <Link className="sync-acao-erro" to="/entrar">
        Entrar de novo
      </Link>
    )
  }
  if (e.erro === 'permissao') {
    return (
      <button type="button" className="sync-acao-erro" onClick={() => void sair().finally(() => navegar('/entrar'))}>
        Entrar de novo
      </button>
    )
  }
  return null
}

interface Mudanca {
  chave: string
  tipo: Tipo
  reg: string
  op: Op
  ms: number
}

/** As mudanças por enviar, uma por registro (a criação vale sobre as alterações seguintes), em ordem. */
function usePorEnviar(porEnviar: number): Mudanca[] {
  const [lista, setLista] = useState<Mudanca[]>([])
  useEffect(() => {
    let vivo = true
    if (porEnviar === 0) {
      setLista([])
      return
    }
    eventosLocaisNaoEnviados().then(
      (eventos) => {
        const porRegistro = new Map<string, Mudanca>()
        for (const e of eventos) {
          const chave = `${e.tipo}\u0000${e.reg}`
          const ms = Number(e.hlc.slice(0, 13))
          const antes = porRegistro.get(chave)
          if (!antes) porRegistro.set(chave, { chave, tipo: e.tipo, reg: e.reg, op: e.op, ms })
          else porRegistro.set(chave, { ...antes, op: antes.op === 'criar' ? 'criar' : e.op, ms })
        }
        if (vivo) setLista([...porRegistro.values()])
      },
      () => vivo && setLista([]),
    )
    return () => {
      vivo = false
    }
  }, [porEnviar])
  return lista
}

/** "Vai subir": só quando há algo por enviar. */
export function VaiSubir({ porEnviar, variante }: { porEnviar: number; variante: Variante }) {
  const lista = usePorEnviar(porEnviar)
  if (porEnviar === 0 || lista.length === 0) return null
  const id = `sync-sobe-${variante}`
  const mais = lista.length - MAXIMO_VAI_SUBIR
  const visiveis = lista.slice(0, MAXIMO_VAI_SUBIR)
  // A numeração dos objetos SKC é calculada uma vez para a lista toda (m6).
  const linhas = linhasDasMudancas(visiveis)
  return (
    <section className={`sync-secao sync-secao-${variante}`} aria-labelledby={id}>
      <h2 id={id}>Vai subir</h2>
      <ul className="sync-lista">
        {visiveis.map((m, i) => {
          const linha = linhas[i]!
          return (
            <li key={m.chave} className="sync-linha">
              {linha.caminho ? (
                <Link className="sync-linha-link" to={linha.caminho}>
                  {linha.texto}
                </Link>
              ) : (
                <span>{linha.texto}</span>
              )}
              <Hora ms={m.ms} />
            </li>
          )
        })}
      </ul>
      {mais > 0 && <p className="sync-nota">e mais {plural(mais, 'registro', 'registros')}</p>}
    </section>
  )
}

/** "Chegou do outro aparelho": o que a última rodada que trouxe algo trouxe. */
export function ChegouDoOutro({ info, variante }: { info: InfoDaSync; variante: Variante }) {
  const r = info.recebidas
  if (!r || r.porAparelho.length === 0) return null
  const id = `sync-chegou-${variante}`
  return (
    <section className={`sync-secao sync-secao-${variante}`} aria-labelledby={id}>
      <h2 id={id}>Chegou do outro aparelho</h2>
      <ul className="sync-lista">
        {r.porAparelho.map((p) => (
          <li key={p.aparelho} className="sync-linha">
            <span>
              {alteracoes(p.eventos)} {doAparelho(p.nome)}
            </span>
            <Hora ms={r.em} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** "Salvar e sincronizar" (Ctrl/⌘S): envia e recebe na hora. */
export function BotaoSalvar({ variante }: { variante: Variante | 'menu' }) {
  return (
    <button type="button" className={`sync-salvar sync-salvar-${variante}`} aria-keyshortcuts={ATALHO_DE_SALVAR} onClick={() => void sincronizarAgora('manual')}>
      Salvar e sincronizar
      {variante === 'painel' && <kbd aria-hidden="true">{atalhoDeSalvar()}</kbd>}
    </button>
  )
}

/** A chave do automático (ao abrir e alguns segundos depois de cada mudança). */
export function ChaveAutomatica({ automatico, variante }: { automatico: boolean; variante: Variante }) {
  const mudar = (v: boolean) => void definirAutomatico(v)
  if (variante === 'painel') {
    return (
      <label className="sync-chave sync-chave-painel">
        <span>
          Automático: <strong>{automatico ? 'ligado' : 'desligado'}</strong>
        </span>
        <input type="checkbox" role="switch" checked={automatico} onChange={(e) => mudar(e.target.checked)} />
      </label>
    )
  }
  return (
    <label className="sync-chave">
      <span className="sync-chave-textos">
        <span className="sync-chave-nome">Sincronizar automaticamente</span>
        <span className="sync-chave-apoio">Ao abrir o app e alguns segundos depois de cada mudança.</span>
      </span>
      <input type="checkbox" role="switch" checked={automatico} onChange={(e) => mudar(e.target.checked)} />
    </label>
  )
}

/** A hora (de hoje) ou a data, na coluna do histórico. */
function HoraOuData({ ms }: { ms: number }) {
  const q = quando(ms)
  return <span className="sync-hora">{q.startsWith('hoje, ') ? hora(ms) : q.startsWith('ontem') ? 'ontem' : q.split(',')[0]}</span>
}

/**
 * A tela de Sincronização (Sincronizacao.dc.html; no computador, a mesma coluna sob a barra): o estado, o
 * botão "Salvar e sincronizar", a chave do automático, o que vai subir, o que chegou, o histórico recente e
 * os detalhes (arquivos do Dropbox ignorados por estarem malformados, segmentos que ainda faltam).
 */
export function Sincronizacao() {
  const info = useSincronizacao()
  const celular = useBreakpoint() !== 'computador'
  const avisos = info.avisos
  const onde = `Dropbox · ${info.nomeDoAparelho || 'este aparelho'}`
  return (
    <div className="pagina-consulta sync-pagina">
      {celular && (
        <div className="sync-topo">
          <IconButton icon="voltar" label="Voltar" href="#/" tipPosition="start" />
          <span className="sync-onde">{onde}</span>
        </div>
      )}
      <main className="sync-corpo">
        <div className="sync-cabeca">
          <h1>Sincronização</h1>
          {!celular && <span className="sync-onde">{onde}</span>}
        </div>
        <div className="sync-bloco">
          <EstadoDaSincronizacao info={info} variante="tela" />
          <AcaoDoErro info={info} />
        </div>
        <div className="sync-controles">
          <BotaoSalvar variante="tela" />
          <ChaveAutomatica automatico={info.automatico} variante="tela" />
        </div>

        <VaiSubir porEnviar={info.porEnviar} variante="tela" />
        <ImagensComProblema />
        <ChegouDoOutro info={info} variante="tela" />

        <section className="sync-secao sync-secao-tela" aria-labelledby="sync-hist">
          <h2 id="sync-hist">Histórico recente</h2>
          {info.historico.length === 0 ? (
            <p className="sync-nota">Nada a contar ainda. Aqui aparecem as edições do mesmo campo nos dois aparelhos, as esperas sem internet e as falhas.</p>
          ) : (
            <ol className="sync-historico">
              {info.historico.slice(0, 12).map((h, i) => (
                <li key={`${h.em}-${i}`}>
                  <HoraOuData ms={h.em} />
                  <span className="sync-historico-textos">
                    <span className="sync-historico-titulo">{h.titulo}</span>
                    {/* E-16: a falha mostra só o título; o texto técnico sai pelo «Copiar detalhes». */}
                    {h.titulo !== TITULO_DA_FALHA && <span className="sync-historico-detalhe">{h.detalhe}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="sync-nota">Se o mesmo campo for editado nos dois aparelhos, vale a mudança mais recente; a outra fica guardada no histórico do registro.</p>
        </section>

        {(avisos.length > 0 || info.faltando.length > 0) && (
          <section className="sync-secao sync-secao-tela" aria-labelledby="sync-detalhes">
            <h2 id="sync-detalhes">Detalhes</h2>
            <ul className="sync-detalhes">
              {avisos.map((a) => (
                <li key={a.caminho}>
                  <span className="sync-detalhe-titulo">
                    {a.parcial ? 'Arquivo com linhas inválidas (as válidas entraram)' : 'Arquivo ignorado'}: <code>{a.caminho}</code>
                  </span>
                  <span className="sync-detalhe-motivo">
                    {a.motivo} · {quando(a.em)}
                  </span>
                </li>
              ))}
              {info.faltando.map((f) => (
                <li key={`${f.aparelho}-${f.segmento}`}>
                  <span className="sync-detalhe-titulo">
                    Esperando o segmento <code>{String(f.segmento).padStart(6, '0')}</code> do aparelho <code>{f.aparelho}</code>
                  </span>
                  <span className="sync-detalhe-motivo">Os seguintes já entraram; este entra quando aparecer no Dropbox.</span>
                </li>
              ))}
            </ul>
            <p className="sync-nota">Arquivos com problema não impedem os outros e nunca são apagados do Dropbox.</p>
          </section>
        )}

        <p className="sync-copia">
          <Link to="/exportar">Cópia de segurança e exportações</Link>
          <span className="sync-nota">Um arquivo com tudo o que é seu, e as regiões e hipóteses para outros programas, gerados neste aparelho, sem internet.</span>
        </p>
      </main>
    </div>
  )
}
