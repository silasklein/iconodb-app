import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PontoRelativo } from '../imagem/desenhar'
import { CascaDoPainel } from '../item/CascaDoPainel'
import { CampoDaNota, type FonteDoCampo } from '../notas/CampoDaNota'
import { Icon } from '../ui/Icon'
import { useEstado } from '../usuario/estado'
import { IconButton } from '../ui/IconButton'
import { CampoDeTermos } from './CampoDeTermos'
import { OPCOES_DE_CERTEZA, OPCOES_DE_NIVEL } from './ConteudoSkc'
import type { AncoraDaHipoteseSkc, Sobre } from './modelo'
import { registrarHipotese, type Reserva, type SobreAoGravar } from './operacoes'
import {
  apagarRascunhoDaHipotese,
  chaveDoRascunho,
  guardarRascunhoDaHipotese,
  lerRascunhoDaHipotese,
  mesmoConteudo,
  rascunhoTemConteudo,
  type RascunhoDaHipotese,
  type SobreNoRascunho,
} from './rascunho'
import { Segmentos } from './Segmentos'
import './Hipoteses.css'

export interface ElementoParaEscolher {
  id: string
  rotulo: string
}

interface Props {
  variante: 'folha' | 'lateral'
  /** O rascunho com que abre (novo, com o trecho selecionado, ou o que estava guardado). */
  inicial: RascunhoDaHipotese
  /** Os elementos do objeto (do livro e as regiões SKC que são elemento), para "Sobre". */
  elementos: readonly ElementoParaEscolher[]
  /** "TESTE I: 2" (trecho do livro) ou "SKC" (leitura SKC). */
  rotuloDaFonte: (a: AncoraDaHipoteseSkc) => string
  /** Há imagem onde marcar a região nova? */
  podeMarcar: boolean
  /** "Marcar uma região nova na imagem" (E): a tela abre o desenho (no item, no computador; no visualizador, no celular). */
  aoMarcarRegiao: (r: RascunhoDaHipotese) => void
  /** Fechou: Esc e × guardam o rascunho (retomável); "Descartar" o apaga. */
  aoFechar: () => void
  /** Registrada: o id da hipótese e o da região nova que ela criou (para "Desfazer" tirar as duas). */
  aoRegistrada: (r: Reserva) => void
  devolverFoco?: () => HTMLElement | null
  /** No computador, a região está sendo marcada na coluna da imagem (o chip diz "desenhando"). */
  desenhando?: boolean
  /** A região que acabou de ser marcada na coluna da imagem (cada uma é um objeto novo). */
  regiaoDesenhada?: { imagem: string; pontos: readonly PontoRelativo[] } | null
  /** Abre uma hipótese no painel ("Abrir a registrada", quando outra aba registrou este rascunho; revisão 4, I2). */
  aoAbrirHipotese?: (id: string) => void
}

type Erros = { termos?: string; regiao?: string; nome?: string; gravar?: string }

/**
 * "Nova hipótese · SKC" (NovaHipotese.dc.html no celular, folha de baixo; PC-ItemNovaHipotese.dc.html no computador,
 * a terceira coluna do item): o trecho selecionado, Sobre (o objeto inteiro, um elemento, ou uma região nova desenhada
 * na imagem), Termo (verbetes), Nível, Certeza e Justificativa (com `[[`). "Registrar hipótese" (⌘/Ctrl+Enter); Esc
 * fecha sem registrar e GUARDA o rascunho (como o Esc das notas, decisão 37): Shift+H o retoma; só "Descartar", com
 * confirmação, o apaga (revisão 1, I2).
 *
 * Cada mudança vai ao rascunho de forma síncrona (src/hipoteses/rascunho.ts). "Registrar" reserva o id e o guarda no
 * rascunho ANTES de gravar, e marca `criado` logo depois: um clique duplo, ou um registrar interrompido e retomado,
 * nunca cria duas hipóteses.
 */
export function NovaHipotese({ variante, inicial, elementos, rotuloDaFonte, podeMarcar, aoMarcarRegiao, aoFechar, aoRegistrada, devolverFoco, desenhando = false, regiaoDesenhada = null, aoAbrirHipotese }: Props) {
  const [r, setR] = useState(inicial)
  const atual = useRef(r)
  const [erros, setErros] = useState<Erros>({})
  const salvando = useRef(false)
  const raiz = useRef<HTMLDivElement>(null)
  const idJustificativa = useId()
  const idNivel = useId()
  const idCerteza = useId()
  const idNome = useId()
  const idPai = useId()

  // Outra aba mudou (ou apagou) este rascunho com o formulário aberto aqui (revisão 3, M5): até a pessoa escolher,
  // nada daqui é gravado por cima do da outra aba.
  const [conflito, setConflito] = useState<{ tipo: 'mudou'; outro: RascunhoDaHipotese } | { tipo: 'saiu' } | null>(null)
  const emConflito = useRef(false)
  // Ao trocar pelo rascunho da outra aba, os campos (que guardam o que se digita) recomeçam com ele.
  const [versao, setVersao] = useState(0)

  const mudar = useCallback((f: (r: RascunhoDaHipotese) => RascunhoDaHipotese) => {
    const novo = f(atual.current)
    atual.current = novo
    if (!emConflito.current) guardarRascunhoDaHipotese(novo)
    setR(novo)
  }, [])

  // O que se viu do registrar da outra aba (revisão 4, I2): o id que ela reservou, e se ela já marcou "criado" (só depois
  // de gravar). Com isso, o rascunho que some da outra aba é "registrada", não "descartada".
  const [daOutra, setDaOutra] = useState<{ hipotese: string | null; criado: boolean }>({ hipotese: null, criado: false })
  const chegouAqui = useEstado((e) => (daOutra.hipotese ? !!e.registro('hipotese', daOutra.hipotese) : false))
  const tipoDoConflito = !conflito ? null : conflito.tipo === 'mudou' ? 'mudou' : daOutra.criado || chegouAqui ? 'registrada' : 'descartada'
  const tipoAtual = useRef(tipoDoConflito)
  tipoAtual.current = tipoDoConflito
  const aviso = useRef<HTMLDivElement>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const focarAviso = () => aviso.current?.querySelector<HTMLElement>('button')?.focus()

  const objeto = inicial.objeto
  useEffect(() => {
    const chave = chaveDoRascunho(objeto)
    const ouvir = (e: StorageEvent) => {
      if (e.key !== null && e.key !== chave) return
      const outro = lerRascunhoDaHipotese(objeto)
      const reservada = outro?.criado ?? outro?.reserva?.hipotese ?? null
      if (outro && reservada) setDaOutra((v) => ({ hipotese: reservada, criado: v.criado || outro.criado !== null }))
      if (outro && mesmoConteudo(outro, atual.current)) {
        // Só os ids reservados mudaram (a outra aba está registrando ESTE rascunho): adotados, um registrar daqui devolve
        // a mesma hipótese em vez de criar outra.
        if (outro.reserva && !atual.current.reserva) {
          atual.current = { ...atual.current, reserva: outro.reserva, criado: outro.criado ?? atual.current.criado }
          setR(atual.current)
        }
        return
      }
      emConflito.current = true
      setConflito(outro ? { tipo: 'mudou', outro } : { tipo: 'saiu' })
    }
    window.addEventListener('storage', ouvir)
    return () => window.removeEventListener('storage', ouvir)
  }, [objeto])
  // Resolvido o conflito, o foco fica no formulário (o aviso some; revisão 4, m3).
  const resolver = useCallback((usar: RascunhoDaHipotese | null) => {
    emConflito.current = false
    setConflito(null)
    if (usar) {
      atual.current = { ...usar, aberto: true }
      setR(atual.current)
      setVersao((v) => v + 1)
    }
    guardarRascunhoDaHipotese(atual.current)
    titulo.current?.focus()
  }, [])

  // A região marcada na coluna da imagem entra como "região nova" (com o nome e o pai que já tinha, se tinha).
  useEffect(() => {
    if (!regiaoDesenhada) return
    setErros((e) => ({ ...e, regiao: undefined }))
    mudar((x) => {
      const antes = x.sobre.tipo === 'nova' ? x.sobre.regiao : null
      return { ...x, sobre: { tipo: 'nova', regiao: { imagem: regiaoDesenhada.imagem, pontos: regiaoDesenhada.pontos, nome: antes?.nome ?? '', pai: antes?.pai ?? null } } }
    })
    requestAnimationFrame(() => raiz.current?.querySelector<HTMLElement>(`[id="${CSS.escape(idNome)}"]`)?.focus())
  }, [regiaoDesenhada, mudar, idNome])

  const fonte = useMemo<FonteDoCampo>(
    () => ({
      get texto() {
        return atual.current.justificativa
      },
      mudar: (t: string) => mudar((x) => ({ ...x, justificativa: t })),
      descarregar: async () => undefined,
    }),
    [mudar],
  )

  // Esc e ×: fecha e guarda (fechado). Sem nada preenchido, não há o que guardar. Com um conflito com outra aba aberto,
  // não fecha: o foco vai ao aviso, que pede a escolha (fechar gravaria por cima da outra aba; revisão 4, m1).
  const fechar = useCallback(() => {
    if (emConflito.current) {
      focarAviso()
      return
    }
    const x = atual.current
    if (rascunhoTemConteudo(x) || x.reserva) guardarRascunhoDaHipotese({ ...x, aberto: false })
    else apagarRascunhoDaHipotese(x.objeto)
    aoFechar()
  }, [aoFechar])
  const [descartando, setDescartando] = useState(false)
  const descartar = useCallback(() => {
    apagarRascunhoDaHipotese(atual.current.objeto)
    aoFechar()
  }, [aoFechar])

  const escolherSobre = (s: SobreNoRascunho) => {
    setErros((e) => ({ ...e, regiao: undefined, nome: undefined }))
    mudar((x) => ({ ...x, sobre: s }))
  }

  const registrar = useCallback(async () => {
    if (salvando.current) return
    // Com um conflito aberto, registrar espera a escolha no aviso (registrada na outra aba: nunca outra cópia; I2).
    if (emConflito.current) {
      focarAviso()
      return
    }
    const x = atual.current
    const novos: Erros = {}
    if (x.termos.length === 0) novos.termos = 'Escolha pelo menos um termo.'
    if (x.sobre.tipo === 'nova' && !x.sobre.regiao) novos.regiao = 'Marque a região na imagem, ou escolha outro "Sobre".'
    if (x.sobre.tipo === 'nova' && x.sobre.regiao && x.sobre.regiao.nome.trim() === '') novos.nome = 'Dê um nome ao elemento novo.'
    setErros(novos)
    if (novos.termos) {
      raiz.current?.querySelector<HTMLElement>('.termos input[role="combobox"]')?.focus()
      return
    }
    if (novos.regiao || novos.nome) {
      raiz.current?.querySelector<HTMLElement>(novos.nome ? `[id="${CSS.escape(idNome)}"]` : '.nova-hipotese-chip-regiao')?.focus()
      return
    }
    salvando.current = true
    const sobre: SobreAoGravar = x.sobre.tipo === 'nova' ? { tipo: 'nova', regiao: x.sobre.regiao! } : (x.sobre as Sobre)
    try {
      const reserva = await registrarHipotese(
        { objeto: x.objeto, sobre, termos: x.termos, nivel: x.nivel, modalidade: x.modalidade, justificativa: x.justificativa, ancora: x.ancora },
        {
          reserva: x.reserva,
          aoReservar: (res) => mudar((y) => ({ ...y, reserva: res })),
          aoCriar: (id) => mudar((y) => ({ ...y, criado: id })),
        },
      )
      apagarRascunhoDaHipotese(x.objeto)
      aoRegistrada(reserva)
    } catch {
      salvando.current = false
      setErros({ gravar: 'Não foi possível registrar a hipótese neste aparelho; tente de novo.' })
    }
  }, [mudar, aoRegistrada, idNome])

  /** "Registrar esta como outra hipótese" (escolhido, depois que a outra aba registrou): ids novos, nada da reserva dela. */
  const registrarComoOutra = () => {
    emConflito.current = false
    setConflito(null)
    atual.current = { ...atual.current, reserva: null, criado: null }
    setR(atual.current)
    void registrar()
  }
  const fecharRegistradaEAbrir = (id: string) => {
    apagarRascunhoDaHipotese(atual.current.objeto)
    aoAbrirHipotese?.(id)
  }
  /** "Fechar" quando a outra aba já registrou esta hipótese: nada se perde, e nada é gravado de volta. */
  const fecharRegistrada = () => {
    apagarRascunhoDaHipotese(atual.current.objeto)
    aoFechar()
  }
  const mensagem =
    tipoDoConflito === 'mudou'
      ? 'Esta hipótese em preparo mudou em outra aba. Qual fica? A outra se perde.'
      : tipoDoConflito === 'registrada'
        ? 'Esta hipótese foi registrada na outra aba. Abra a registrada; esta pode ser registrada também, como outra hipótese.'
        : tipoDoConflito === 'descartada'
          ? 'Esta hipótese em preparo foi descartada em outra aba. A desta aba continua aqui.'
          : ''
  const nomeDoAviso =
    tipoDoConflito === 'mudou'
      ? 'Esta hipótese em preparo mudou em outra aba'
      : tipoDoConflito === 'registrada'
        ? 'Esta hipótese foi registrada na outra aba'
        : 'Esta hipótese em preparo foi descartada em outra aba'

  const regiao = r.sobre.tipo === 'nova' ? r.sobre.regiao : null
  const marcar = () => (podeMarcar ? aoMarcarRegiao(atual.current) : undefined)

  return (
    <CascaDoPainel
      variante={variante}
      rotulo="Nova hipótese"
      aoFechar={fechar}
      devolverFoco={devolverFoco}
      className="nova-hipotese"
      atalhos={{
        'Control+Enter': () => void registrar(),
        'Meta+Enter': () => void registrar(),
        e: () => (podeMarcar && variante === 'lateral' ? marcar() : false),
      }}
    >
      <div className="painel-hipotese-topo">
        <h2 className="painel-hipotese-etiqueta" ref={titulo} tabIndex={-1}>
          Nova hipótese · SKC
        </h2>
        <IconButton icon="fechar" label="Fechar (o rascunho fica guardado)" shortcut="Escape" shortcutLabel="Esc" onClick={fechar} />
      </div>
      {/* Sempre montada, para o leitor de tela anunciar o aviso de outra aba quando ele aparece (revisão 4, m3). */}
      <p className="so-leitor nova-hipotese-aviso-vivo" role="status">
        {mensagem}
      </p>
      <div className="painel-hipotese-corpo" ref={raiz} key={versao}>
        {conflito && tipoDoConflito && (
          <div className="nova-hipotese-descartar nova-hipotese-conflito" role="group" aria-label={nomeDoAviso} ref={aviso}>
            <p>{mensagem}</p>
            <span className="nova-hipotese-descartar-acoes">
              {tipoDoConflito === 'registrada' ? (
                <>
                  {aoAbrirHipotese && daOutra.hipotese && (
                    <button type="button" className="texto-editavel-botao" onClick={() => fecharRegistradaEAbrir(daOutra.hipotese!)}>
                      Abrir a registrada
                    </button>
                  )}
                  <button type="button" className="texto-editavel-botao" onClick={fecharRegistrada}>
                    Fechar
                  </button>
                  <button type="button" className="texto-editavel-botao" onClick={registrarComoOutra}>
                    Registrar esta como outra hipótese
                  </button>
                </>
              ) : (
                <>
                  {conflito.tipo === 'mudou' ? (
                    <button type="button" className="texto-editavel-botao" onClick={() => resolver(conflito.outro)}>
                      Usar a da outra aba
                    </button>
                  ) : (
                    <button type="button" className="texto-editavel-botao" onClick={descartar}>
                      Descartar a desta aba
                    </button>
                  )}
                  <button type="button" className="texto-editavel-botao" onClick={() => resolver(null)}>
                    Manter a desta aba
                  </button>
                </>
              )}
            </span>
          </div>
        )}
        {r.ancora && (
          <figure className="nova-hipotese-trecho">
            <figcaption>
              Trecho <span>{`· ${rotuloDaFonte(r.ancora)}, selecionado no texto`}</span>
            </figcaption>
            <blockquote lang={r.ancora.lingua === 'de' ? 'de' : undefined}>{r.ancora.trecho}</blockquote>
          </figure>
        )}

        <fieldset>
          <legend>Sobre</legend>
          <div className="nova-hipotese-sobre">
            <button type="button" className="nova-hipotese-chip" aria-pressed={r.sobre.tipo === 'objeto'} onClick={() => escolherSobre({ tipo: 'objeto' })}>
              objeto inteiro
            </button>
            {elementos.map((el) => (
              <button
                key={el.id}
                type="button"
                className="nova-hipotese-chip"
                aria-pressed={r.sobre.tipo === 'elemento' && r.sobre.id === el.id}
                onClick={() => escolherSobre({ tipo: 'elemento', id: el.id, rotulo: el.rotulo })}
              >
                {el.rotulo}
              </button>
            ))}
            {podeMarcar && (
              <button
                type="button"
                className="nova-hipotese-chip nova-hipotese-chip-regiao"
                aria-pressed={r.sobre.tipo === 'nova' || desenhando}
                aria-label={desenhando ? 'Região nova, desenhando na imagem' : regiao ? `Região nova, ${regiao.pontos.length} pontos: marcar de novo na imagem` : 'Marcar uma região nova na imagem'}
                aria-keyshortcuts={variante === 'lateral' ? 'E' : undefined}
                data-tip={variante === 'lateral' ? 'Marcar uma região nova na imagem (E)' : undefined}
                onClick={marcar}
              >
                <Icon name="marcarRegiao" size={16} />
                {desenhando ? 'região nova · desenhando' : regiao ? `região nova · ${regiao.pontos.length} pontos` : 'região nova'}
              </button>
            )}
          </div>
          {podeMarcar && !regiao && <span className="nova-hipotese-ajuda">Ao concluir a região, o elemento novo entra aqui já escolhido.</span>}
          {erros.regiao && (
            <p className="hipoteses-erro" role="alert">
              {erros.regiao}
            </p>
          )}
        </fieldset>

        {regiao && r.sobre.tipo === 'nova' && (
          <>
            <div className="nova-hipotese-campo">
              <label htmlFor={idNome}>Nome do elemento novo</label>
              <input
                id={idNome}
                type="text"
                placeholder="ex.: focinho"
                value={regiao.nome}
                aria-invalid={erros.nome ? true : undefined}
                onChange={(e) => {
                  const nome = e.target.value
                  setErros((x) => ({ ...x, nome: undefined }))
                  mudar((y) => (y.sobre.tipo === 'nova' && y.sobre.regiao ? { ...y, sobre: { tipo: 'nova', regiao: { ...y.sobre.regiao, nome } } } : y))
                }}
              />
              {erros.nome && (
                <p className="hipoteses-erro" role="alert">
                  {erros.nome}
                </p>
              )}
            </div>
            {elementos.length > 0 && (
              <div className="nova-hipotese-campo">
                <label htmlFor={idPai}>Pertence a</label>
                <select
                  id={idPai}
                  value={regiao.pai ?? ''}
                  onChange={(e) => {
                    const pai = e.target.value || null
                    mudar((y) => (y.sobre.tipo === 'nova' && y.sobre.regiao ? { ...y, sobre: { tipo: 'nova', regiao: { ...y.sobre.regiao, pai } } } : y))
                  }}
                >
                  <option value="">nenhum (elemento solto)</option>
                  {elementos.map((el) => (
                    <option key={el.id} value={el.id}>
                      {el.rotulo}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        <CampoDeTermos
          termos={r.termos}
          erro={erros.termos ?? null}
          aoMudar={(termos) => {
            if (termos.length > 0) setErros((e) => ({ ...e, termos: undefined }))
            mudar((x) => ({ ...x, termos }))
          }}
        />

        <div className="nova-hipotese-campo">
          <span className="form-rotulo" id={idNivel}>
            Nível
          </span>
          <Segmentos rotulo="Nível" rotuloId={idNivel} opcoes={OPCOES_DE_NIVEL} valor={r.nivel} aoEscolher={(nivel) => mudar((x) => ({ ...x, nivel }))} />
        </div>
        <div className="nova-hipotese-campo">
          <span className="form-rotulo" id={idCerteza}>
            Certeza
          </span>
          <Segmentos rotulo="Certeza" rotuloId={idCerteza} opcoes={OPCOES_DE_CERTEZA} valor={r.modalidade} aoEscolher={(modalidade) => mudar((x) => ({ ...x, modalidade }))} />
        </div>

        <div className="nova-hipotese-campo">
          <label htmlFor={idJustificativa}>Justificativa</label>
          <CampoDaNota id={idJustificativa} rascunho={fonte} aoFechar={fechar} aoSalvar={() => void registrar()} descritoPor={`${idJustificativa}-ajuda`} />
          <span id={`${idJustificativa}-ajuda`} className="nova-hipotese-ajuda">
            Use [[ para ligar a objetos, verbetes e obras.
          </span>
        </div>
        {erros.gravar && (
          <p className="hipoteses-erro" role="alert">
            {erros.gravar}
          </p>
        )}
      </div>
      <div className="nova-hipotese-pe">
        {descartando ? (
          <div className="nova-hipotese-descartar" role="group" aria-label="Descartar esta hipótese em preparo?">
            <p>Descartar esta hipótese em preparo? O que foi preenchido se perde.</p>
            <span className="nova-hipotese-descartar-acoes">
              <button
                type="button"
                className="texto-editavel-botao"
                autoFocus
                onClick={() => setDescartando(false)}
              >
                Continuar
              </button>
              <button type="button" className="nova-hipotese-registrar nova-hipotese-descartar-sim" onClick={descartar}>
                Descartar
              </button>
            </span>
          </div>
        ) : (
          <>
            <button type="button" className="nova-hipotese-registrar" aria-keyshortcuts="Control+Enter Meta+Enter" onClick={() => void registrar()}>
              <Icon name="confirmar" size={18} />
              Registrar hipótese
            </button>
            <button type="button" className="texto-editavel-botao nova-hipotese-descartar-botao" onClick={() => setDescartando(true)}>
              Descartar
            </button>
          </>
        )}
        {variante === 'lateral' && (
          <p className="nova-hipotese-teclas">
            <kbd>⌘/Ctrl + Enter</kbd> registra · <kbd>Esc</kbd> fecha e guarda o rascunho
          </p>
        )}
      </div>
    </CascaDoPainel>
  )
}
