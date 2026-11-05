import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { useAtalhos } from '../app/useAtalhos'
import type { Regiao } from '../banco/tipos'
import { creditoDaImagem, type ImagemExibida } from '../imagens-usuario/exibicao'
import { consumirPedidoDeFoco } from '../imagem/estado'
import { DesenhoDeRegiao } from '../imagem/DesenhoDeRegiao'
import { desfazer, fechar, novaEdicao, type Edicao, type PontoRelativo } from '../imagem/desenhar'
import { IconButton } from '../ui/IconButton'
import { estiloDeInversao, geometriaGirada, giroDaImagem, pontosDoPoligono, transformDoGiro, useUrlDaImagemExibida } from './imagemComum'
import './ImagemItem.css'

interface Props {
  /** Número do objeto (para o texto alternativo). */
  numero: string
  /** As do livro e depois as do usuário (`juntarImagens`). */
  imagens: readonly ImagemExibida[]
  /** As regiões marcadas de cada imagem (id da imagem → regiões). */
  regioes?: Readonly<Record<string, readonly Regiao[]>>
  /** O elemento da hipótese aberta: as regiões dele acendem por cima da imagem. */
  elementoAceso?: string | null
  /** Computador: a dica "Clique na imagem mostra o original" no pé. */
  comDica?: boolean
  /**
   * "Ampliar a imagem": quem tem o roteador leva ao visualizador passando o estado (o original
   * ligado, para fechar voltando ao item). Sem isto, o botão é um link comum (`#/imagem/<id>`).
   */
  aoAmpliar?: (imagemId: string, original: boolean) => void
  /**
   * De volta do visualizador: a imagem que estava à vista e se o original estava ligado. Vale só
   * para este objeto (se a imagem não é dele, é ignorada) e só ao montar ou ao trocar de objeto.
   */
  inicial?: { imagemId: string; original: boolean } | null
  /** A imagem principal do usuário (decisão 33): sem `inicial`, abre nela. */
  principal?: string | null
  /** Mostrar esta imagem agora (uma que acabou de ser adicionada ou restaurada); `vez` muda a cada pedido. */
  mostrar?: { id: string; vez: number } | null
  /** "Adicionar imagem" (A): abre a folha ou o diálogo. */
  aoAdicionar?: (e: MouseEvent<HTMLButtonElement>) => void
  /** "Editar a imagem" de uma imagem do usuário. */
  aoEditar?: (id: string, e: MouseEvent<HTMLButtonElement>) => void
  /** A imagem à vista mudou (Tarefa 10: onde marcar a região nova). */
  aoMostrar?: (id: string) => void
  /**
   * Tarefa 10, computador (PC-ItemNovaHipotese.dc.html): marcar a região nova da hipótese aqui mesmo, na coluna da
   * imagem, com o formulário aberto ao lado. Concluir entrega a imagem e os pontos; Esc (ou o botão) cancela.
   */
  marcar?: { aoConcluir: (imagemId: string, pontos: readonly PontoRelativo[]) => void; aoCancelar: () => void } | null
  /**
   * Z e I (ampliar e alternar o original) valem para esta imagem. Falso onde há várias imagens na tela, como em Comparar:
   * a tecla não teria como saber de qual delas é; o clique na imagem e o botão de ampliar seguem valendo.
   */
  atalhos?: boolean
  /**
   * De volta do visualizador, este "Ampliar a imagem" recebe o foco (padrão: sim). Onde há várias imagens na tela (Comparar),
   * só a da imagem que foi ampliada o recebe.
   */
  devolverFoco?: boolean
}

function indiceInicial(imagens: readonly ImagemExibida[], inicial: Props['inicial'], principal?: string | null): number {
  if (inicial) return imagens.findIndex((i) => i.id === inicial.imagemId)
  return principal ? imagens.findIndex((i) => i.id === principal) : -1
}

/**
 * A imagem do item sobre o painel preto (decisão 10): o desenho de traço aparece invertido
 * (`filter: invert(1)`), o resto como está. Tocar (ou Enter/Espaço) no desenho mostra o original
 * e de novo volta; é um botão com `aria-pressed`. A região da hipótese aberta acende num SVG por
 * cima, com as coordenadas de 0 a 1 do banco (viewBox 0 0 1 1 sobre a caixa exata da imagem).
 * "Ampliar a imagem" leva ao visualizador (`#/imagem/<id>`, Tarefa 9).
 */
export function ImagemItem({ numero, imagens, regioes = {}, elementoAceso = null, comDica = false, aoAmpliar, inicial = null, principal = null, mostrar = null, aoAdicionar, aoEditar, aoMostrar, marcar = null, atalhos = true, devolverFoco = true }: Props) {
  const ampliar = useRef<HTMLDivElement>(null)
  const [indice, setIndice] = useState(() => Math.max(indiceInicial(imagens, inicial, principal), 0))
  const [original, setOriginal] = useState(() => (inicial && indiceInicial(imagens, inicial) >= 0 ? (inicial.original ?? false) : false))
  const [natural, setNatural] = useState<{ caminho: string; w: number; h: number } | null>(null)
  const atual = imagens[Math.min(indice, imagens.length - 1)]
  const caminho = atual ? (atual.skc ? atual.id : (atual.tela ?? atual.miniatura ?? null)) : null

  // Outro objeto: volta à primeira imagem (ou à principal), invertida. (Ao montar, vale o `inicial`, que veio do visualizador.)
  const objetoAnterior = useRef(numero)
  useEffect(() => {
    if (objetoAnterior.current === numero) return
    objetoAnterior.current = numero
    const i = indiceInicial(imagens, inicial, principal)
    setIndice(Math.max(i, 0))
    setOriginal(inicial && i >= 0 ? (inicial.original ?? false) : false)
  }, [numero])

  // O mesmo objeto com a lista mudada (uma imagem entrou, saiu ou chegou do outro aparelho): fica na imagem que estava à vista.
  const atualId = useRef(atual?.id)
  const chaveDaLista = imagens.map((i) => i.id).join(' ')
  useEffect(() => {
    const i = atualId.current ? imagens.findIndex((x) => x.id === atualId.current) : -1
    if (i >= 0 && i !== indice) setIndice(i)
  }, [chaveDaLista])
  // Depois do efeito acima (que precisa da imagem da renderização anterior).
  useEffect(() => {
    atualId.current = atual?.id
  })
  const avisar = useRef(aoMostrar)
  avisar.current = aoMostrar
  useEffect(() => {
    if (atual?.id) avisar.current?.(atual.id)
  }, [atual?.id])

  // Uma imagem pedida agora (acabou de ser adicionada ou restaurada).
  useEffect(() => {
    if (!mostrar) return
    const i = imagens.findIndex((x) => x.id === mostrar.id)
    if (i >= 0) {
      setIndice(i)
      setOriginal(false)
    }
  }, [mostrar?.vez, mostrar?.id, chaveDaLista])

  // A hipótese aberta fala de um elemento marcado só em outra imagem: mostra essa.
  useEffect(() => {
    if (!elementoAceso) return
    const temAqui = (img?: ImagemExibida) => !!img && (regioes[img.id] ?? []).some((r) => r.elementoId === elementoAceso)
    if (temAqui(atual)) return
    const outra = imagens.findIndex((img) => temAqui(img))
    if (outra >= 0) setIndice(outra)
  }, [elementoAceso, regioes])

  // De volta do visualizador (Esc ou Fechar): o foco volta ao "Ampliar a imagem" desta tela nova.
  useEffect(() => {
    if (devolverFoco && consumirPedidoDeFoco()) ampliar.current?.querySelector<HTMLElement>('[aria-label="Ampliar a imagem"]')?.focus()
  }, [])

  const { url, aviso, aoFalhar } = useUrlDaImagemExibida(atual)

  // Z amplia a imagem à vista (o mesmo que "Ampliar a imagem"), com o original se estiver ligado.
  // I alterna o desenho invertido e o original (só os desenhos de traço com imagem na tela, como o toque na imagem).
  useAtalhos(
    {
      z: () => (atual && aoAmpliar ? aoAmpliar(atual.id, original) : false),
      i: () => (atual?.display_mode === 'traco' && url ? setOriginal((v) => !v) : false),
    },
    'item',
    { ativo: atalhos },
  )

  // A marcação da região nova (Tarefa 10), no computador.
  // O desenho fica preso à imagem em que começou (revisão 1, I3): as setas das imagens somem enquanto se marca, e se a
  // imagem à vista mudar mesmo assim (uma imagem nova chegou), o desenho recomeça nela, nunca leva os pontos de outra.
  const [desenho, setDesenho] = useState<{ imagem: string | null; edicao: Edicao }>({ imagem: null, edicao: novaEdicao() })
  const marcando = !!marcar && !!atual
  const edicao = desenho.imagem === (atual?.id ?? null) ? desenho.edicao : novaEdicao()
  const setEdicao = (f: Edicao | ((e: Edicao) => Edicao)) =>
    setDesenho((d) => {
      const base = d.imagem === (atual?.id ?? null) ? d.edicao : novaEdicao()
      return { imagem: atual?.id ?? null, edicao: typeof f === 'function' ? f(base) : f }
    })
  const [aviso3, setAviso3] = useState(false)
  useEffect(() => {
    if (!marcar) setDesenho({ imagem: null, edicao: novaEdicao() })
    setAviso3(false)
  }, [marcar])
  const concluirMarcacao = () => {
    if (!marcar || !atual) return false
    const f = edicao.atual.fechado ? edicao.atual : fechar(edicao.atual)
    // Menos de 3 pontos (ou sem área): o status diz por que não concluiu (M6).
    if (!f.fechado) {
      setAviso3(true)
      return
    }
    marcar.aoConcluir(atual.id, f.pontos)
  }
  useAtalhos(
    {
      Escape: () => (marcar ? marcar.aoCancelar() : false),
      Enter: () => (marcar ? concluirMarcacao() : false),
      'Control+Z': () => (marcar ? setEdicao(desfazer) : false),
      'Meta+Z': () => (marcar ? setEdicao(desfazer) : false),
    },
    'visualizador',
    { ativo: marcando },
  )

  const adicionar = aoAdicionar && <IconButton icon="adicionarImagem" label="Adicionar imagem" shortcut="A" tipAbove onClick={aoAdicionar} />

  if (!atual) {
    return (
      <div className="imagem-item">
        <div className="imagem-item-painel">
          <span className="imagem-item-aviso">Sem imagem</span>
          {adicionar && (
            <div className="imagem-item-ampliar" ref={ampliar}>
              {adicionar}
            </div>
          )}
        </div>
      </div>
    )
  }

  const traco = atual.display_mode === 'traco'
  const invertida = traco && !original
  const acesas = elementoAceso ? (regioes[atual.id] ?? []).filter((r) => r.elementoId === elementoAceso) : []
  const alt = `Imagem ${atual.ordinal} de ${numero}${invertida ? ', invertida' : ''}`

  // O giro com que o livro imprime a figura: a imagem e as regiões giram juntas, dentro de uma caixa
  // que tem o tamanho da figura girada (a 90° troca largura e altura).
  const giro = giroDaImagem(atual.rotacao)
  const dimensoes = natural?.caminho === caminho ? { w: natural.w, h: natural.h } : atual.largura && atual.altura ? { w: atual.largura, h: atual.altura } : null
  const geometria = giro !== 0 && dimensoes ? geometriaGirada(dimensoes, giro) : null
  const pct = (fracao: number) => `${Number((fracao * 100).toFixed(4))}%`

  const miolo = (
    <>
      <img
        src={url ?? undefined}
        alt={alt}
        decoding="async"
        style={estiloDeInversao(atual.display_mode, original)}
        onError={aoFalhar}
        onLoad={(e) => {
          const { naturalWidth: w, naturalHeight: h } = e.currentTarget
          if (w > 0 && h > 0 && caminho) setNatural({ caminho, w, h })
        }}
      />
      {marcando && (
        <DesenhoDeRegiao
          edicao={edicao}
          aoMudar={(e) => {
            setAviso3(false)
            setEdicao(e)
          }}
          giro={giroDaImagem(atual.rotacao)}
        />
      )}
      {acesas.length > 0 && (
        <svg className="imagem-item-regioes" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          {/* Um contorno escuro largo por baixo e o traço claro por cima (revisão 1, M2): a região destaca tanto do
              desenho de traço invertido (branco no preto) quanto de uma foto clara do usuário. */}
          {acesas.flatMap((r) => [
            <polygon key={`${r.id}-h`} className="regiao-halo" points={pontosDoPoligono(r.pontos)} vectorEffect="non-scaling-stroke" />,
            <polygon key={`${r.id}-t`} className="regiao-traco" points={pontosDoPoligono(r.pontos)} vectorEffect="non-scaling-stroke" />,
          ])}
        </svg>
      )}
    </>
  )
  const estiloDaCaixa = geometria ? ({ '--razao': geometria.razao } as CSSProperties) : undefined
  const comBotao = traco && !!url && !marcando
  const figura = url ? (
    <span className={`imagem-item-figura${geometria ? ' imagem-item-girada' : ''}`} style={estiloDaCaixa}>
      {geometria ? (
        <span
          className="imagem-item-giro"
          style={{ width: pct(geometria.fracao.w), height: pct(geometria.fracao.h), transform: `translate(-50%, -50%) ${transformDoGiro(giro)}` }}
        >
          {miolo}
        </span>
      ) : (
        miolo
      )}
    </span>
  ) : (
    <span className="imagem-item-aviso" aria-hidden={!aviso}>
      {aviso ?? ''}
    </span>
  )

  return (
    <div className="imagem-item">
      <div className="imagem-item-painel">
        {comBotao ? (
          <button type="button" className={`imagem-item-alternar${geometria ? ' imagem-item-girada' : ''}`} style={estiloDaCaixa} aria-pressed={original} aria-label="Mostrar o original" aria-keyshortcuts="I" onClick={() => setOriginal((v) => !v)}>
            {figura}
          </button>
        ) : (
          figura
        )}
        {acesas.length > 0 && <span className="so-leitor">{`Região acesa: ${acesas.map((r) => r.elemento).join(', ')}`}</span>}
        {marcando && marcar && (
          <div role="toolbar" aria-label="Marcar região" className="imagem-item-marcar">
            <IconButton icon="marcarRegiao" label="Marcar região" shortcut="E" pressionado onClick={marcar.aoCancelar} />
            <IconButton icon="desfazer" label="Desfazer o último ponto" shortcut="Control+Z Meta+Z" shortcutLabel="Ctrl/⌘Z" onClick={() => setEdicao(desfazer)} />
            <IconButton icon="confirmar" label="Concluir a região" shortcut="Enter" onClick={() => void concluirMarcacao()} />
          </div>
        )}
        {marcando && (
          <p className="imagem-item-marcar-status" role="status">
            {aviso3 && !edicao.atual.fechado
              ? 'Ponha pelo menos 3 pontos que formem uma área para concluir.'
              : edicao.atual.fechado
                ? 'Região fechada · arraste os pontos para ajustar · Enter conclui'
                : 'Clique põe pontos · clique no 1º para fechar · Enter conclui · Esc cancela'}
            <span className="desenho-contagem">{` · Região nova: ${edicao.atual.pontos.length} ${edicao.atual.pontos.length === 1 ? 'ponto' : 'pontos'}`}</span>
            {imagens.length > 1 && <span className="desenho-contagem">{` · a região fica na imagem ${indice + 1} / ${imagens.length}`}</span>}
          </p>
        )}
        <div className="imagem-item-ampliar" ref={ampliar}>
          {adicionar}
          <IconButton icon="ampliar" label="Ampliar a imagem" shortcut={atalhos ? 'Z' : undefined} href={`#/imagem/${encodeURIComponent(atual.id)}`} tipAbove onClick={aoAmpliar && ((e) => clicouEmAmpliar(e, atual.id))} />
        </div>
      </div>
      {atual.skc && (
        <p className="imagem-item-credito imagem-item-credito-skc">
          <span className="marca-skc">SKC</span>
          <span className="imagem-item-credito-texto">{creditoDaImagem(atual.skc)}</span>
          {aoEditar && (
            <button type="button" className="imagem-item-editar" aria-label="Editar a imagem" onClick={(e) => aoEditar(atual.id, e)}>
              Editar
            </button>
          )}
        </p>
      )}
      {(imagens.length > 1 || (comDica && traco)) && (
        <div className="imagem-item-pe">
          {comDica && traco ? <span className="imagem-item-dica">{original ? 'Clique na imagem volta ao invertido' : 'Clique na imagem mostra o original'}</span> : <span />}
          {imagens.length > 1 && !marcando && (
            <span className="imagem-item-paginas">
              <IconButton icon="anterior" label="Imagem anterior" tipAbove tipPosition="start" onClick={() => troca(-1)} />
              <span className="codigo">{`${indice + 1} / ${imagens.length}`}</span>
              <IconButton icon="proximo" label="Imagem seguinte" tipAbove onClick={() => troca(1)} />
            </span>
          )}
        </div>
      )}
      {!atual.skc && atual.credito && <p className="imagem-item-credito">{atual.credito}</p>}
    </div>
  )

  function clicouEmAmpliar(e: MouseEvent<HTMLAnchorElement>, id: string) {
    // Clique com modificador (abrir em outra aba…) segue o link; o comum vai pelo roteador.
    if (!aoAmpliar || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    aoAmpliar(id, original)
  }

  function troca(passo: number) {
    setIndice((i) => (i + passo + imagens.length) % imagens.length)
    setOriginal(false)
  }
}
