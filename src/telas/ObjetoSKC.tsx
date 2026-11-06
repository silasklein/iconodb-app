import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAtalhos } from '../app/useAtalhos'
import { fontesDosObjetos, item as itemDoPacote } from '../banco/consultas'
import { NIVEIS, type ItemDetalhe } from '../banco/tipos'
import { FolhaDeColecao } from '../colecoes/FolhaDeColecao'
import { useAdicionarAComparar } from '../comparar/AdicionarAComparar'
import { useObjetosSkc } from '../colecoes/objetosSkc'
import { juntarImagens, useImagensDoUsuario } from '../imagens-usuario/exibicao'
import { restaurarImagem } from '../imagens-usuario/operacoes'
import { regioesDoUsuario } from '../imagens-usuario/regioes'
import { ImagemItem } from '../item/ImagemItem'
import { Leitura } from '../item/Leitura'
import { useResumoDasHipoteses } from '../item/resumoDasHipoteses'
import { contarHipoteses, HipotesesPorNivel, Secao } from '../item/Secoes'
import { LARGURA_DO_PAINEL_LATERAL } from '../item/CascaDoPainel'
import { PainelHipotese } from '../item/PainelHipotese'
import { BotaoDoTrecho } from '../hipoteses/BotaoDoTrecho'
import { chaveDoTexto } from '../hipoteses/ConteudoSkc'
import { ancorasDasHipoteses, porNivel, useElementosSkc, useHipotesesSkc } from '../hipoteses/doUsuario'
import { eHipoteseSkc, type AncoraDaHipoteseSkc, type HipoteseSkc } from '../hipoteses/modelo'
import { NovaHipotese } from '../hipoteses/NovaHipotese'
import { guardarRascunhoDaHipotese, type RascunhoDaHipotese } from '../hipoteses/rascunho'
import { rotuloDaFonteNaTela } from '../hipoteses/selecao'
import { textoGuardado } from '../hipoteses/textosNaTela'
import { useNovaHipotese } from '../hipoteses/useNovaHipotese'
import type { PontoRelativo } from '../imagem/desenhar'
import { caminhoDaNotaNova } from '../notas/formato'
import { NotasDoAlvo } from '../notas/NotasDoAlvo'
import { useNumeracao, useGrupos } from '../objetos-skc/atual'
import { EditarFicha } from '../objetos-skc/EditarFicha'
import { EscolhaDoPeriodo, type ManejoDoPeriodo } from '../objetos-skc/EscolhaDoPeriodo'
import { LeituraSkc } from '../objetos-skc/LeituraSkc'
import { lerObjeto, textoDaOrigem, textoDasMedidas, tituloDe } from '../objetos-skc/modelo'
import { nomeDoPeriodo, textoDoNrSkc, type CodigoDePeriodo, type NumeroDoObjeto } from '../objetos-skc/numeracao'
import { textoDosNumerosNasFontes } from '../objetos-skc/numerosNasFontes'
import { desfazerLigacao, ErroDeLigacao, escolherPeriodo, excluirObjeto, ligarObjetos, restaurarObjeto } from '../objetos-skc/operacoes'
import { juncaoNoPlural, oQueVaiJunto, textoDaJuncao } from '../objetos-skc/oQueVaiJunto'
import { useSitiosVivos } from '../sitios/doUsuario'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint, useLarguraMinima } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { useTema } from '../ui/useTema'
import { estadoAtual, useEstado } from '../usuario/estado'
import { useLido } from '../usuario/useLido'
import { AdicionarImagem, EditarImagem } from './AdicionarImagem'
import '../objetos-skc/ObjetoSkc.css'
import '../imagens-usuario/MarcaSkc.css'
import './Item.css'

interface Props {
  /** O id do objeto SKC (OB-…). */
  id: string
  /** O grupo de ligação (o principal primeiro); só [id] quando não está ligado. */
  membros: readonly string[]
  /** O número pelo qual a pessoa chegou, se era um secundário que redirecionou para cá. */
  ligadoDe?: string | null
  /** O número provisório que este objeto teve e perdeu, se foi por ele que a pessoa chegou. */
  numeroAntigo?: string | null
}

const SEM_HIPOTESES_DO_LIVRO = { hipotesesPorNivel: { pre_iconographic: [], iconographic: [], iconological: [] }, outrasHipoteses: [] }

/**
 * A tela de um objeto SKC (ObjetoSKC.dc.html no celular, PC-ObjetoSKC.dc.html no computador; decisões 30, 34 e 38): o
 * número grande (mono), a linha "números nas fontes" ("TESTE I: 4 · SKC: 12") e "SKC · origem" embaixo, a ficha, as imagens do usuário (fotos: `tons`, não invertidas; Tarefa 8), a
 * leitura SKC (lida limpa, editada com `[[`), as leituras dos livros ligados, as notas, "Hipóteses por nível" e
 * "Ligar a um objeto existente". "Editar a ficha" (F) abre os campos no lugar, cada um gravando sozinho.
 */
export function ObjetoSKC({ id, membros, ligadoDe = null, numeroAntigo = null }: Props) {
  useTema('item')
  const computador = useBreakpoint() === 'computador'
  const lateral = useLarguraMinima(LARGURA_DO_PAINEL_LATERAL) && computador
  const navegar = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const aberta = params.get('hipotese')
  const registro = useEstado((e) => e.registro('objeto', id))
  const numeracao = useNumeracao()
  const info = numeracao.porId.get(id)
  // "Comparar (n/4)" (Tarefa 14): a ref da bandeja é o id, que não muda com o número provisório.
  const comparar = useAdicionarAComparar(id, info?.numero ?? 'Este objeto')
  // A Revisão leva aqui com `?corrigir=sitio` (a ficha já aberta no Sítio) ou `?corrigir=periodo` (o rascunho, na escolha do
  // período). O parâmetro sai do endereço depois de lido, para voltar não repetir.
  const [corrigir] = useState(() => params.get('corrigir'))
  const [, setParams] = useSearchParams()
  useEffect(() => {
    if (corrigir)
      setParams(
        (atual) => {
          const p = new URLSearchParams(atual)
          p.delete('corrigir')
          return p
        },
        { replace: true },
      )
    // só ao montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [editando, setEditando] = useState(corrigir === 'sitio')
  const [pedidoDeNota, setPedidoDeNota] = useState(0)
  const [folha, setFolha] = useState(false)
  const [adicionando, setAdicionando] = useState(false)
  const [editandoImagem, setEditandoImagem] = useState<string | null>(null)
  const [hipoteses, setHipoteses] = useState(true)
  const [aviso, setAviso] = useState<string | null>(null)
  const gatilhoDaHipotese = useRef<HTMLElement | null>(null)
  const [imagemExcluida, setImagemExcluida] = useState<string | null>(null)
  const gatilho = useRef<HTMLElement | null>(null)
  const novo = (location.state as { objetoNovo?: { imagensComErro: number } } | null)?.objetoNovo

  // Posição em "Meus objetos" (anterior e próximo na ordem da lista).
  const meus = useObjetosSkc()
  const posicao = meus.findIndex((o) => o.itemId === id)
  const anterior = posicao > 0 ? meus[posicao - 1]! : null
  const proximo = posicao >= 0 && posicao < meus.length - 1 ? meus[posicao + 1]! : null
  const caminhoDe = (o: { numero: string; semNumero?: true; itemId: string }) => `/item/${encodeURIComponent(o.semNumero ? o.itemId : o.numero)}`

  const { imagens: doUsuario, principal } = useImagensDoUsuario(id)
  const imagensExibidas = useMemo(() => juntarImagens([], doUsuario), [doUsuario])
  const mapaDeRegioes = useEstado((e) => e.registros.get('regiao'))
  const regioes = useMemo(() => {
    const r: Record<string, ReturnType<typeof regioesDoUsuario>> = {}
    if (!mapaDeRegioes?.size) return r
    for (const img of imagensExibidas) r[img.id] = regioesDoUsuario(estadoAtual(), img.id)
    return r
  }, [mapaDeRegioes, imagensExibidas])

  // As hipóteses SKC (Tarefa 10) deste objeto e dos ligados a ele, como num objeto do livro.
  const hipotesesSkc = useHipotesesSkc(membros)
  const skcPorNivel = useMemo(() => porNivel(hipotesesSkc), [hipotesesSkc])
  const hAberta = aberta && eHipoteseSkc(aberta) ? (hipotesesSkc.find((h) => h.id === aberta) ?? null) : null
  const elementoAceso = hAberta?.sobre.tipo === 'elemento' ? hAberta.sobre.id : null
  const regiaoAcesa = !!elementoAceso && Object.values(regioes).some((rs) => rs.some((r) => r.elementoId === elementoAceso))
  const textoDe = useCallback((fonte: string, lingua: AncoraDaHipoteseSkc['lingua']): string | null => {
    if (lingua === 'skc') {
      const v = estadoAtual().registro('objeto', fonte)?.campos.leitura
      return typeof v === 'string' ? v : null
    }
    // O texto GUARDADO da leitura do livro, que ela registrou ao aparecer (nunca o que aparece; revisão 1, I7).
    return textoGuardado(fonte, lingua)
  }, [])
  const leituraDe = useEstado(useCallback((e) => e.registros.get('objeto'), []))
  const textos = useMemo(() => {
    const m = new Map<string, string>()
    for (const ob of membros.filter((x) => x.startsWith('OB-'))) {
      const t = textoDe(ob, 'skc')
      if (t !== null) m.set(chaveDoTexto(ob, 'skc'), t)
    }
    return m
  }, [membros, textoDe, leituraDe]) // eslint-disable-line react-hooks/exhaustive-deps
  // Os livros ligados (revisão 3, M13): as leituras, e o rótulo e o texto guardado de cada trecho para o painel.
  const livrosDoGrupo = useMemo(() => membros.filter((m) => !m.startsWith('OB-')), [membros])
  const itensDosLivros = useLivrosLigados(livrosDoGrupo)
  const dosLivros = useMemo(() => fontesDosLivros(itensDosLivros), [itensDosLivros])
  const textosDoPainel = useMemo(() => new Map([...dosLivros.textos, ...textos]), [dosLivros, textos])
  const novaHipotese = useNovaHipotese(id, textoDe, () => document.querySelector('.item-leituras'))
  const nova = novaHipotese.nova
  const elementosSkc = useElementosSkc(membros)
  const abrirHipotese = useCallback(
    (h: string) => {
      novaHipotese.fechar()
      void navegar({ pathname: location.pathname, search: `?hipotese=${encodeURIComponent(h)}` }, { replace: true, state: location.state })
    },
    [navegar, location.pathname, location.state, novaHipotese.fechar], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const fecharHipotese = useCallback(
    () => void navegar({ pathname: location.pathname, search: '' }, { replace: true, state: location.state }),
    [navegar, location.pathname, location.state],
  )
  const lembrarGatilho = useCallback((_: string, el: HTMLElement) => {
    gatilhoDaHipotese.current = el
  }, [])
  const registrarHipotese = useCallback(() => {
    if (nova) return
    if (aberta) fecharHipotese()
    novaHipotese.atalho()
  }, [nova, aberta, fecharHipotese, novaHipotese.atalho]) // eslint-disable-line react-hooks/exhaustive-deps
  const abrirComTrecho = useCallback(
    (t: Parameters<typeof novaHipotese.abrirComTrecho>[0]) => {
      if (aberta) fecharHipotese()
      void novaHipotese.abrirComTrecho(t)
    },
    [aberta, fecharHipotese, novaHipotese.abrirComTrecho], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const imagemAtual = useRef<string | null>(null)
  // No computador, a região é marcada na coluna da imagem; no celular, no visualizador.
  const [desenhoNoItem, setDesenhoNoItem] = useState(false)
  const [regiaoDesenhada, setRegiaoDesenhada] = useState<{ imagem: string; pontos: readonly PontoRelativo[] } | null>(null)
  const marcarNoItem = useMemo(
    () =>
      desenhoNoItem && nova
        ? {
            aoConcluir: (imagem: string, pontos: readonly PontoRelativo[]) => {
              setDesenhoNoItem(false)
              setRegiaoDesenhada({ imagem, pontos })
            },
            aoCancelar: () => setDesenhoNoItem(false),
          }
        : null,
    [desenhoNoItem, nova],
  )
  useEffect(() => {
    if (!nova) setDesenhoNoItem(false)
  }, [nova])
  const marcarRegiao = useCallback(
    (r: RascunhoDaHipotese) => {
      if (computador) {
        setDesenhoNoItem(true)
        return
      }
      const img = imagemAtual.current ?? imagensExibidas[0]?.id
      if (!img) return
      guardarRascunhoDaHipotese(r)
      void navegar(`/imagem/${encodeURIComponent(img)}`, { state: { ampliada: true, original: false, marcarPara: id } })
    },
    [computador, imagensExibidas, navegar, id],
  )

  const editarFicha = useCallback((de?: HTMLElement | null) => {
    gatilho.current = de ?? (document.activeElement as HTMLElement | null)
    setEditando((e) => !e)
  }, [])
  const pedirNota = useCallback(() => {
    if (computador) setPedidoDeNota((n) => n + 1)
    else void navegar(caminhoDaNotaNova('objeto', id))
  }, [computador, navegar, id])
  useAtalhos(
    {
      f: () => editarFicha(),
      n: pedirNota,
      c: () => setFolha((f) => !f),
      'Shift+C': comparar.adicionar,
      a: () => (adicionando ? false : setAdicionando(true)),
      ArrowLeft: () => (anterior ? void navegar(caminhoDe(anterior), { replace: true }) : false),
      ArrowRight: () => (proximo ? void navegar(caminhoDe(proximo), { replace: true }) : false),
      'Shift+H': registrarHipotese,
    },
    'item',
  )
  useEffect(() => {
    document.title = `${info?.numero ?? 'Objeto sem número'} · IconoDB`
  }, [info?.numero])

  // «Excluir o objeto» (2C, bloco 1): depois de excluir aqui, o foco vai a «Restaurar», no aviso que ocupa o lugar do botão.
  const restaurarRef = useRef<HTMLButtonElement>(null)
  const [excluidoAqui, setExcluidoAqui] = useState(false)
  const excluido = registro?.excluido ?? false
  useEffect(() => {
    if (excluidoAqui && excluido) {
      restaurarRef.current?.focus()
      setExcluidoAqui(false)
    }
  }, [excluidoAqui, excluido])
  // P1 + m-3: o aviso «Objeto salvo.» (do `location.state`) some ao excluir e não volta ao restaurar na mesma visita
  // (por objeto: a tela pode ficar montada de um objeto para outro)
  const [salvoEncerradoEm, setSalvoEncerradoEm] = useState<string | null>(null)
  useEffect(() => {
    if (excluido) setSalvoEncerradoEm(id)
  }, [excluido, id])
  const salvoEncerrado = salvoEncerradoEm === id

  if (!registro) {
    return (
      <div className="item">
        <TopoDoCelular voltar={{ href: '#/colecoes', rotulo: 'Voltar a Meus objetos' }} />
        <div className="item-aviso" role="status">
          <p>Objeto não encontrado.</p>
          <p>
            <Link to="/colecoes">Ver Meus objetos</Link>
          </p>
        </div>
      </div>
    )
  }
  const o = lerObjeto(registro)
  const livros = membros.filter((m) => !m.startsWith('OB-'))
  const outrosSkc = membros.filter((m) => m.startsWith('OB-') && m !== id)

  const acoes = (
    <>
      {computador ? (
        <IconButton icon="escrever" label="Escrever nota" shortcut="N" onClick={pedirNota} />
      ) : (
        <Link className="icon-button" to={caminhoDaNotaNova('objeto', id)} aria-label="Escrever nota" aria-keyshortcuts="N" data-tip="Escrever nota (N)">
          <Icon name="escrever" size={20} />
        </Link>
      )}
      <IconButton icon="registrarHipotese" label="Registrar hipótese" shortcut="Shift+H" expandido={!!nova} abre="dialog" onClick={registrarHipotese} />
      <IconButton icon="editarFicha" label="Editar a ficha" shortcut="F" expandido={editando} onClick={(e) => editarFicha(e.currentTarget)} />
      <IconButton icon="guardar" label="Adicionar à coleção" shortcut="C" expandido={folha} abre="dialog" onClick={(e) => {
        gatilho.current = e.currentTarget
        setFolha((f) => !f)
      }} />
      <IconButton icon="comparar" label={comparar.rotulo} shortcut="Shift+C" onClick={comparar.adicionar} />
    </>
  )
  const nav = posicao >= 0 && (
    <nav aria-label="Posição em Meus objetos" className="item-posicao">
      <span className="item-posicao-origem">
        <Link to="/colecoes" className="item-posicao-rotulo">
          Meus objetos
        </Link>
        <span aria-hidden="true"> · </span>
        <span className="item-posicao-n codigo">
          {posicao + 1} / {meus.length}
        </span>
      </span>
      <span className="item-posicao-setas">
        <Seta icon="anterior" destino={anterior ? caminhoDe(anterior) : null} rotulo={`Objeto anterior${anterior ? `: ${anterior.semNumero ? 'sem número' : anterior.numero}` : ''}`} atalho="ArrowLeft" dica="←" inicio />
        <Seta icon="proximo" destino={proximo ? caminhoDe(proximo) : null} rotulo={`Próximo objeto${proximo ? `: ${proximo.semNumero ? 'sem número' : proximo.numero}` : ''}`} atalho="ArrowRight" dica="→" />
      </span>
    </nav>
  )
  const botaoDeRegistrar = (
    <div className="objeto-hipoteses-acoes">
      <button type="button" className="objeto-botao" aria-keyshortcuts="Shift+H" onClick={registrarHipotese}>
        <Icon name="registrarHipotese" size={18} />
        {novaHipotese.emPreparo ? 'Retomar a hipótese em preparo' : 'Registrar hipótese'}
      </button>
    </div>
  )
  const imagem = (
    <ImagemItem
      numero={info?.numero ?? id}
      imagens={imagensExibidas}
      regioes={regioes}
      comDica={computador}
      principal={principal?.id ?? null}
      elementoAceso={elementoAceso}
      marcar={marcarNoItem}
      aoMostrar={(img) => {
        imagemAtual.current = img
      }}
      aoAdicionar={(e) => {
        gatilho.current = e.currentTarget
        setAdicionando(true)
      }}
      aoEditar={(img, e) => {
        gatilho.current = e.currentTarget
        setEditandoImagem(img)
      }}
    />
  )
  const devolverFoco = () => (gatilho.current?.isConnected ? gatilho.current : null)

  const conteudo = (
    <>
      {ligadoDe && (
        <p className="objeto-aviso" role="status">
          {ligadoDe} está ligado a {info?.numero ?? 'este objeto'}: as leituras aparecem juntas aqui.
        </p>
      )}
      {numeroAntigo && (
        <p className="objeto-aviso" role="status">
          {numeroAntigo} era o número provisório deste objeto; ficou {info?.numero ?? 'outro'} porque outro aparelho o usou antes.
        </p>
      )}
      {/* P1 (aprovação do bloco 1): excluído, fica só «Objeto excluído. Restaurar»; restaurado, o aviso não volta (m-3) */}
      {novo && !o.excluido && !salvoEncerrado && (
        <p className="objeto-aviso" role="status">
          Objeto salvo{info?.situacao === 'provisorio' ? `: o número ${info.numero} fica provisório até sincronizar` : info?.situacao === 'rascunho' ? ': rascunho sem número, na Revisão até ganhar período' : ''}.
          {novo.imagensComErro > 0 && ` ${novo.imagensComErro === 1 ? 'Uma imagem não' : `${novo.imagensComErro} imagens não`} pôde ser guardada neste aparelho; adicione de novo.`}
        </p>
      )}
      {o.excluido && (
        <p className="objeto-aviso" role="status">
          Objeto excluído.{' '}
          <button ref={restaurarRef} type="button" className="objeto-link" onClick={() => void restaurarObjeto(id)}>
            Restaurar
          </button>
        </p>
      )}
      <Cabeca o={o} info={info} membros={membros} focarPeriodo={corrigir === 'periodo'} />
      {editando ? (
        <EditarFicha
          id={id}
          foco={corrigir === 'sitio' ? 'sitio' : undefined}
          aoFechar={() => {
            setEditando(false)
            requestAnimationFrame(() => devolverFoco()?.focus())
          }}
        />
      ) : (
        <Ficha o={o} />
      )}
      {!computador && (
        <section className="item-imagem" aria-label="Imagem">
          {imagem}
        </section>
      )}
      <p className="objeto-aviso" role="status" hidden={!imagemExcluida}>
        {imagemExcluida && (
          <>
            Imagem excluída.{' '}
            <button type="button" className="objeto-link" onClick={() => void restaurarImagem(imagemExcluida).then(() => setImagemExcluida(null))}>
              Desfazer
            </button>
          </>
        )}
      </p>
      <section className="item-leituras" aria-label="Leituras">
        <LeituraSkc id={id} hipoteses={hipotesesSkc} hipoteseAtiva={aberta} aoAbrirHipotese={lembrarGatilho} />
        {outrosSkc.map((outro) => (
          <LeituraSkc key={outro} id={outro} numero={numeracao.porId.get(outro)?.numero ?? 'sem número'} ligada hipoteses={hipotesesSkc} hipoteseAtiva={aberta} aoAbrirHipotese={lembrarGatilho} />
        ))}
        <LeiturasDosLivros numeros={livros} itens={itensDosLivros} hipoteses={hipotesesSkc} hipoteseAtiva={aberta} aoAbrirHipotese={lembrarGatilho} />
        <NotasDoAlvo tipo="objeto" ref_={id} variante="leitura" pedido={pedidoDeNota} />
        {/* As notas escritas nos outros membros do grupo (revisão 3), cada uma com o número dele; a nota nova vai ao principal. */}
        {livros.map((nr) => (
          <NotasDoAlvo key={nr} tipo="objeto" ref_={nr} variante="leitura" membro={nr} />
        ))}
        {outrosSkc.map((outro) => (
          <NotasDoAlvo key={outro} tipo="objeto" ref_={outro} variante="leitura" membro={numeracao.porId.get(outro)?.numero ?? 'sem número'} />
        ))}
      </section>
      <div className="secoes">
        <Secao id="hipoteses" titulo="Hipóteses por nível" contagem={contarHipoteses(SEM_HIPOTESES_DO_LIVRO, skcPorNivel)} aberta={hipoteses} aoAlternar={() => setHipoteses((h) => !h)}>
          {hipotesesSkc.length === 0 ? (
            <>
              <p className="secao-vazia">Ainda sem hipóteses. Selecione um trecho da leitura, ou registre sobre o objeto inteiro ou uma região da imagem.</p>
              {botaoDeRegistrar}
            </>
          ) : (
            <HipotesesPorNivel item={SEM_HIPOTESES_DO_LIVRO} skc={skcPorNivel} aoAbrir={lembrarGatilho} acoes={botaoDeRegistrar} />
          )}
          {aviso && (
            <p className="objeto-nota" role="status">
              {aviso}
            </p>
          )}
        </Secao>
      </div>
      <Ligacoes id={id} membros={membros} />
      {!o.excluido && <ExcluirOObjeto id={id} titulo={tituloDe(o)} numero={info?.situacao === 'confirmado' ? info.numero : null} aoExcluir={() => setExcluidoAqui(true)} />}
    </>
  )

  const painel = nova ? (
    <NovaHipotese
      key={`nova-${lateral ? 'lateral' : 'folha'}`}
      variante={lateral ? 'lateral' : 'folha'}
      inicial={nova}
      elementos={elementosSkc.map((e) => ({ id: e.id, rotulo: e.rotulo }))}
      rotuloDaFonte={(a) => (a.lingua === 'skc' ? 'SKC' : (dosLivros.rotulos.get(a.fonte) ?? rotuloDaFonteNaTela(a.fonte, a.lingua) ?? a.fonte))}
      podeMarcar={imagensExibidas.length > 0}
      aoMarcarRegiao={marcarRegiao}
      aoFechar={novaHipotese.fechar}
      aoRegistrada={() => {
        novaHipotese.fechar()
        setHipoteses(true)
        setAviso('Hipótese registrada.')
      }}
      devolverFoco={novaHipotese.devolverFoco}
      desenhando={desenhoNoItem}
      regiaoDesenhada={regiaoDesenhada}
      aoAbrirHipotese={abrirHipotese}
    />
  ) : (
    aberta && (
      <PainelHipotese
        key={lateral ? 'lateral' : 'folha'}
        id={aberta}
        variante={lateral ? 'lateral' : 'folha'}
        aoFechar={fecharHipotese}
        devolverFoco={() => (gatilhoDaHipotese.current?.isConnected ? gatilhoDaHipotese.current : null)}
        regiaoAcesa={regiaoAcesa}
        textos={textosDoPainel}
        rotulosDasFontes={dosLivros.rotulos}
        aoIr={abrirHipotese}
      />
    )
  )
  const comPainel = !!(nova || aberta)
  const botaoDoTrecho = <BotaoDoTrecho selecao={nova ? null : novaHipotese.selecao} aoRegistrar={abrirComTrecho} />

  const folhas = (
    <>
      {folha && <FolhaDeColecao objeto={id} variante={computador ? 'painel' : 'folha'} aoFechar={() => setFolha(false)} devolverFoco={devolverFoco} />}
      {adicionando && (
        <AdicionarImagem
          objeto={id}
          variante={computador ? 'dialogo' : 'folha'}
          aoFechar={() => setAdicionando(false)}
          aoAdicionar={() => setAdicionando(false)}
          devolverFoco={devolverFoco}
        />
      )}
      {comparar.aviso}
      {editandoImagem && (
        <EditarImagem
          key={editandoImagem}
          id={editandoImagem}
          variante={computador ? 'dialogo' : 'folha'}
          aoFechar={() => setEditandoImagem(null)}
          aoExcluir={(img) => {
            setEditandoImagem(null)
            setImagemExcluida(img)
          }}
          devolverFoco={devolverFoco}
        />
      )}
    </>
  )

  if (!computador) {
    return (
      <div className={`item objeto-skc${comPainel ? ' item-com-folha' : ''}`}>
        <TopoDoCelular voltar={{ href: '#/colecoes', rotulo: 'Voltar a Meus objetos' }} acoes={acoes} />
        {nav}
        <main className="item-conteudo">{conteudo}</main>
        {painel}
        {folhas}
        {botaoDoTrecho}
      </div>
    )
  }
  return (
    <div className={`item item-pc objeto-skc${comPainel ? (lateral ? ' item-pc-com-painel' : ' item-com-folha') : ''}`}>
      <section className="item-coluna-imagem item-imagem" aria-label="Imagem">
        <div className="item-coluna-imagem-fixa">
          {nav}
          {imagem}
        </div>
      </section>
      <div className="item-coluna-leitura">
        <main className="item-conteudo">
          <div role="toolbar" aria-label="Ações do objeto" className="item-acoes">
            {acoes}
          </div>
          {conteudo}
        </main>
        {folhas}
      </div>
      {painel}
      {botaoDoTrecho}
    </div>
  )
}

function Seta({ icon, destino, rotulo, atalho, dica, inicio = false }: { icon: 'anterior' | 'proximo'; destino: string | null; rotulo: string; atalho: string; dica: string; inicio?: boolean }) {
  if (!destino) {
    return (
      <span className="icon-button item-posicao-apagado" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
    )
  }
  return (
    <Link className={`icon-button${inicio ? ' tip-start' : ''}`} to={destino} replace aria-label={rotulo} aria-keyshortcuts={atalho} data-tip={`${rotulo} (${dica})`}>
      <Icon name={icon} size={20} />
    </Link>
  )
}

function Cabeca({ o, info, membros, focarPeriodo = false }: { o: ReturnType<typeof lerObjeto>; info: NumeroDoObjeto | undefined; membros: readonly string[]; focarPeriodo?: boolean }) {
  const origem = textoDaOrigem(o)
  return (
    <div className="item-cabeca objeto-cabeca" data-testid="objeto-cabeca">
      <p className="objeto-numero codigo">
        {info?.numero ?? (info?.situacao === 'rascunho' || !info ? 'Sem número' : 'calculando…')}
        {info?.situacao === 'provisorio' && <span className="objeto-marca">provisório</span>}
        {info?.situacao === 'rascunho' && <span className="objeto-marca">rascunho</span>}
      </p>
      {info?.numero && <NumerosNasFontes membros={membros} />}
      <p className="item-rotulo">
        <span className="objeto-skc-marca">SKC</span>
        {origem && <span className="item-origem">{origem}</span>}
      </p>
      <h1>{tituloDe(o)}</h1>
      <EstadoDoNumero id={o.id} info={info} focarPeriodo={focarPeriodo} />
    </div>
  )
}

/**
 * "Números nas fontes" (decisão 38), logo abaixo do número do sistema: as referências dos livros ligados (na ordem das
 * fontes) e o SKC, Nr. de cada objeto SKC do grupo, no formato da decisão 39. Sem ligação, só "SKC: 12". Espera as referências dos livros
 * (para a linha não mudar de tamanho duas vezes); se a consulta falhar, mostra o que tem.
 */
function NumerosNasFontes({ membros }: { membros: readonly string[] }) {
  const numeracao = useNumeracao()
  const livros = membros.filter((m) => !m.startsWith('OB-'))
  const carga = useCarregar(() => fontesDosObjetos(livros), livros.join('|'))
  if (livros.length > 0 && carga.fase === 'carregando') return null
  const texto = textoDosNumerosNasFontes(carga.fase === 'ok' ? carga.dados : [], membros, numeracao)
  if (!texto) return null
  return (
    <p className="objeto-fontes" data-testid="numeros-nas-fontes">
      {texto}
    </p>
  )
}

/** O que o número diz: provisório, mudou (aviso), conflito, ou o rascunho sem período (com a escolha). */
function EstadoDoNumero({ id, info, focarPeriodo = false }: { id: string; info: NumeroDoObjeto | undefined; focarPeriodo?: boolean }) {
  const [periodo, setPeriodo] = useState<CodigoDePeriodo | null>(null)
  const escolha = useRef<ManejoDoPeriodo>(null)
  // «Escolher o período» da Revisão: o foco vai à escolha do período, que é o que falta.
  const rascunho = info?.situacao === 'rascunho'
  useEffect(() => {
    if (focarPeriodo && rascunho) escolha.current?.focar()
  }, [focarPeriodo, rascunho])
  const [erro, setErro] = useState<string | null>(null)
  const [dando, setDando] = useState(false)
  const idErro = useId()
  if (!info) return null
  if (info.situacao === 'rascunho') {
    const dar = async (e: FormEvent) => {
      e.preventDefault()
      if (!periodo) return setErro('Escolha o período para dar o número.')
      setDando(true)
      try {
        await escolherPeriodo(id, periodo)
      } catch {
        setErro('Não foi possível guardar o período; tente de novo.')
      } finally {
        setDando(false)
      }
    }
    return (
      <form className="objeto-rascunho" onSubmit={(e) => void dar(e)} aria-label="Dar o número">
        <p className="objeto-nota">Rascunho sem número: fica na Revisão até ganhar período. Datação em faixa: escolha o período mais antigo.</p>
        <EscolhaDoPeriodo ref={escolha} valor={periodo} naoSei={false} comNaoSei={false} aoEscolher={(p) => { setPeriodo(p); setErro(null) }} invalido={!!erro} descritoPor={erro ? idErro : undefined} />
        {erro && (
          <p id={idErro} className="form-erro" role="alert">
            <Icon name="aviso" size={16} />
            {erro}
          </p>
        )}
        <button type="submit" className="objeto-botao" aria-busy={dando || undefined}>
          Dar o número
        </button>
      </form>
    )
  }
  return (
    <>
      {info.situacao === 'provisorio' && <p className="objeto-nota">Número provisório: fica definitivo na próxima sincronização.</p>}
      {info.mudou && !info.numeroTomadoPeloLivro && (
        <p className="objeto-aviso" role="status">
          Era {info.pedido} quando foi salvo; outro aparelho deu esse número a outro objeto antes. O número agora é {info.numero}.
        </p>
      )}
      {info.mudouNrSkc && info.pedidoNrSkc !== null && info.nrSkc !== null && (
        <p className="objeto-aviso" role="status">
          Era {textoDoNrSkc(info.pedidoNrSkc)} quando foi salvo; outro aparelho criou um objeto antes. Agora é {textoDoNrSkc(info.nrSkc)}.
        </p>
      )}
      {info.numeroTomadoPeloLivro && (
        // Decisão 48: o livro fica com o número; o objeto ganha o seguinte, definitivo na consolidação (a testemunha nova).
        <p className="objeto-aviso">
          O número que este objeto tinha, {info.numeroTomadoPeloLivro}, agora é de um objeto de livro;{' '}
          {info.numero === null
            ? 'ele ainda não tem outro.'
            : info.situacao === 'confirmado'
              ? `ele ganhou ${info.numero}, que é definitivo.`
              : `ele ganhou ${info.numero} (provisório até a próxima sincronização).`}
        </p>
      )}
      {info.conflitoNrSkc && <p className="objeto-aviso">O número SKC que este objeto tinha ficou com outro objeto; ele ganhou outro.</p>}
    </>
  )
}

function Ficha({ o }: { o: ReturnType<typeof lerObjeto> }) {
  // O nome de agora do sítio (Tarefa 12): o corrigido, o do livro ou o escrito; e a marca "excluído" se o sítio foi excluído.
  const vivos = useSitiosVivos()
  const sitioId = o.sitio.trim()
  const sitio = vivos.nome(sitioId || null, o.sitioNome.trim() || null)
  const linhas: [string, ReactNode][] = []
  if (sitio) {
    linhas.push([
      'Sítio',
      sitioId ? (
        <>
          <Link className="item-ficha-link" to={`/sitio/${encodeURIComponent(sitioId)}`}>
            {sitio}
          </Link>
          {vivos.marca(sitioId) && <span className="marca-excluido">{vivos.marca(sitioId)}</span>}
        </>
      ) : (
        sitio
      ),
    ])
  }
  const data = [o.periodo ? nomeDoPeriodo(o.periodo) : null, o.datacao.trim() || null].filter(Boolean).join(', ')
  if (data) linhas.push(['Data', data])
  if (o.material.trim()) linhas.push(['Material', o.material.trim()])
  const medidas = textoDasMedidas(o)
  if (medidas) linhas.push(['Medidas', medidas])
  const acervo = [o.acervo.trim(), o.inventario.trim()].filter(Boolean).join(', ')
  if (acervo) linhas.push(['Acervo', acervo])
  const origem = textoDaOrigem(o)
  if (origem) {
    linhas.push([
      'Origem',
      o.origemTipo === 'publicacao' && o.obra ? (
        <>
          <Link className="item-ficha-link" to={`/obra/${encodeURIComponent(o.obra)}`}>
            {o.obraRotulo.trim() || o.obra}
          </Link>
          {origem.slice((o.obraRotulo.trim() || '').length)}
        </>
      ) : (
        origem
      ),
    ])
  }
  if (linhas.length === 0) return <p className="objeto-nota item-ficha-vazia">Ficha vazia: use «Editar a ficha» (F).</p>
  return (
    <dl className="item-ficha" role="group" aria-label="Ficha">
      {linhas.map(([rotulo, valor]) => (
        <div key={rotulo}>
          <dt>{rotulo}</dt>
          <dd>{valor}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Os itens dos livros ligados (para as leituras, os rótulos das fontes e os textos guardados); null enquanto carrega. */
export function useLivrosLigados(numeros: readonly string[]): readonly ItemDetalhe[] | null {
  const chave = numeros.join('|')
  const carga = useCarregar(async () => (await Promise.all(numeros.map((n) => itemDoPacote(n).catch(() => null)))).filter((d): d is ItemDetalhe => d !== null), chave)
  return carga.fase === 'ok' ? carga.dados : null
}

/**
 * Das leituras dos livros ligados (revisão 3 da Tarefa 10, M13): o rótulo de cada trecho ("TESTE I: 4", por `PA-…`) e o
 * texto GUARDADO dele, na tradução e no original (chave `<fonte>|<lingua>`), para o painel de uma hipótese SKC ancorada
 * nelas mostrar a fonte e conferir o texto (spec §7.6) sem depender do que está à vista.
 */
export function fontesDosLivros(itens: readonly ItemDetalhe[] | null): { rotulos: Map<string, string>; textos: Map<string, string> } {
  const rotulos = new Map<string, string>()
  const textos = new Map<string, string>()
  for (const d of itens ?? []) {
    for (const l of d.leituras) {
      rotulos.set(l.passagemId, l.fonte)
      if (l.texto !== null) textos.set(chaveDoTexto(l.passagemId, 'pt'), l.texto)
      textos.set(chaveDoTexto(l.passagemId, 'de'), l.original)
    }
  }
  return { rotulos, textos }
}

/**
 * As leituras dos livros ligados (os itens vêm de `useLivrosLigados`, na tela). `semAviso`: sem o aviso "Sem leitura
 * dos livros" quando não há livro (na tela de um livro). As hipóteses SKC ancoradas nelas ficam marcadas, na tradução e no
 * original (`idioma`, o do item; revisão 3, M13).
 */
export function LeiturasDosLivros({
  numeros,
  itens,
  idioma = 'pt',
  semAviso = false,
  hipoteses = [],
  hipoteseAtiva = null,
  aoAbrirHipotese,
}: {
  numeros: readonly string[]
  itens: readonly ItemDetalhe[] | null
  idioma?: 'pt' | 'de'
  semAviso?: boolean
  /** As hipóteses SKC do grupo (Tarefa 10): as ancoradas nestes trechos ficam marcadas. */
  hipoteses?: readonly HipoteseSkc[]
  hipoteseAtiva?: string | null
  aoAbrirHipotese?: (id: string, gatilho: HTMLElement) => void
}) {
  const doLivro = useMemo(() => (itens ?? []).flatMap((d) => NIVEIS.flatMap((n) => d.hipotesesPorNivel[n])), [itens])
  const resumoDaHipotese = useResumoDasHipoteses(doLivro, hipoteses)
  if (numeros.length === 0) {
    if (semAviso) return null
    return (
      <div className="leitura">
        <div className="leitura-fonte">
          <span className="leitura-sigla">Livros</span>
        </div>
        <div className="leitura-corpo">
          <p className="leitura-skc-vazia">Sem leitura dos livros. Se um livro processado depois trouxer este objeto, a leitura entra aqui.</p>
        </div>
      </div>
    )
  }
  if (itens === null) return null
  return (
    <>
      {itens.flatMap((d) =>
        d.leituras.map((l) => (
          <Leitura
            key={`${d.numero}-${l.passagemId}`}
            fonte={l.fonte}
            publicacao={l.publicacao}
            texto={l.texto}
            original={l.original}
            termos={l.termos}
            idioma={idioma}
            ancoras={l.texto === null ? l.ancoras : [...l.ancoras, ...ancorasDasHipoteses(hipoteses, l.passagemId, 'pt', l.texto)].sort((a, b) => a.inicio - b.inicio)}
            ancorasDoOriginal={ancorasDasHipoteses(hipoteses, l.passagemId, 'de', l.original)}
            trechoId={l.passagemId}
            hipoteseAtiva={hipoteseAtiva}
            aoAbrirHipotese={aoAbrirHipotese}
            resumoDaHipotese={resumoDaHipotese}
          />
        )),
      )}
    </>
  )
}

/** "Este objeto aparece num livro? Ligar a um objeto existente", e as ligações que já existem (com "Desfazer a ligação"). */
function Ligacoes({ id, membros }: { id: string; membros: readonly string[] }) {
  const navegar = useNavigate()
  const grupos = useGrupos()
  const numeracao = useNumeracao()
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const campo = useRef<HTMLInputElement>(null)
  const idCampo = useId()
  const idErro = useId()
  useEffect(() => {
    if (aberto) campo.current?.focus()
  }, [aberto])
  const rotuloDe = (ref: string) => (ref.startsWith('OB-') ? (numeracao.porId.get(ref)?.numero ?? 'objeto sem número') : ref)
  const ligadas = grupos.ligacoesDe(id)
  const ligar = async (e: FormEvent) => {
    e.preventDefault()
    setErro(null)
    if (!texto.trim()) {
      setErro('Escreva o número do outro objeto (ex.: CA00023).')
      campo.current?.focus()
      return
    }
    try {
      const principal = await ligarObjetos(id, texto)
      setAberto(false)
      setTexto('')
      if (principal !== id) {
        const numero = principal.startsWith('OB-') ? numeracao.porId.get(principal)?.numero : principal
        void navegar(`/item/${encodeURIComponent(numero ?? principal)}`, { state: { ligadoDe: rotuloDe(id) } })
      } else setAviso(`Ligado. ${rotuloDe(id)} é o principal; as leituras aparecem juntas aqui.`)
    } catch (erro) {
      setErro(erro instanceof ErroDeLigacao ? erro.message : 'Não foi possível guardar a ligação; tente de novo.')
      campo.current?.focus()
    }
  }
  return (
    <section className="objeto-ligacoes" aria-labelledby="objeto-ligacoes-titulo">
      <h2 id="objeto-ligacoes-titulo" className="objeto-ligacoes-titulo">
        Este objeto aparece num livro?
      </h2>
      {ligadas.length > 0 && (
        <ul className="objeto-ligadas" aria-label="Ligado a">
          {ligadas.map((l) => {
            const outro = l.a === id ? l.b : l.a
            return (
              <li key={l.reg}>
                <span>
                  Ligado a <span className="codigo">{rotuloDe(outro)}</span>
                  {membros[0] === outro ? ' (principal)' : ''}
                </span>
                <button type="button" className="objeto-link" onClick={() => void desfazerLigacao(id, outro).then(() => setAviso(`Ligação com ${rotuloDe(outro)} desfeita.`))}>
                  Desfazer a ligação
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {aberto ? (
        <form className="objeto-ligar" onSubmit={(e) => void ligar(e)} noValidate>
          <div className="form-campo">
            <label htmlFor={idCampo}>Número do outro objeto</label>
            <input
              ref={campo}
              id={idCampo}
              type="text"
              value={texto}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="CA00023"
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? idErro : undefined}
              onChange={(e) => {
                setTexto(e.target.value)
                setErro(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  e.stopPropagation()
                  setAberto(false)
                }
              }}
            />
            {erro && (
              <p id={idErro} className="form-erro" role="alert">
                <Icon name="aviso" size={16} />
                {erro}
              </p>
            )}
          </div>
          <span className="objeto-ligar-acoes">
            <button type="submit" className="objeto-botao">
              Ligar
            </button>
            <button type="button" className="objeto-link" onClick={() => setAberto(false)}>
              Cancelar
            </button>
          </span>
        </form>
      ) : (
        <button type="button" className="objeto-link objeto-ligar-abrir" onClick={() => setAberto(true)}>
          <Icon name="vincular" size={18} />
          Ligar a um objeto existente
        </button>
      )}
      <p className="objeto-nota">As leituras passam a aparecer juntas na tela do principal. Fica o número dado primeiro; o outro continua achável na busca e leva a ele.</p>
      {aviso && (
        <p className="objeto-nota" role="status">
          {aviso}
        </p>
      )}
    </section>
  )
}

/**
 * «Excluir o objeto», no fim da página (2C, bloco 1, §3): a confirmação abre no lugar, como «Excluir o sítio», com o foco em
 * «Cancelar»; fechar devolve o foco ao botão. Escreve só o `excluir` do objeto: as fotos, regiões, hipóteses, notas, ligações e
 * participações em coleções ficam como estão (escondidas enquanto ele estiver excluído) e voltam com «Restaurar».
 */
function ExcluirOObjeto({ id, titulo, numero, aoExcluir }: { id: string; titulo: string; numero: string | null; aoExcluir: () => void }) {
  const [aberta, setAberta] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const gatilhoRef = useRef<HTMLButtonElement>(null)
  const cancelarRef = useRef<HTMLButtonElement>(null)
  const jaAbriu = useRef(false)
  const junto = useLido(['imagem', 'nota', 'hipotese', 'regiao'], id, (e) => oQueVaiJunto(e, id))
  useEffect(() => {
    if (aberta) {
      jaAbriu.current = true
      cancelarRef.current?.focus()
    } else if (jaAbriu.current) {
      jaAbriu.current = false
      gatilhoRef.current?.focus()
    }
  }, [aberta])
  const nome = numero ?? `«${titulo}»`
  const pergunta = `Excluir o objeto ${nome}?`
  const guardado = textoDaJuncao(junto)
  const plural = juncaoNoPlural(junto)
  const frases = [
    guardado ? `${guardado} ${plural ? 'ficam guardadas e voltam' : 'fica guardada e volta'} se você restaurar.` : null,
    numero ? `O número ${numero} fica reservado para ele.` : null,
    !guardado && !numero ? 'Dá para restaurar depois.' : null,
  ].filter(Boolean)
  return (
    <div className="objeto-excluir">
      {aberta ? (
        <div role="group" aria-label={pergunta} className="objeto-confirmar">
          <p>{[pergunta, ...frases].join(' ')}</p>
          {falhou && (
            <p className="form-erro" role="alert">
              <Icon name="aviso" size={16} />
              Não foi possível excluir; tente de novo.
            </p>
          )}
          <div className="objeto-confirmar-botoes">
            <button ref={cancelarRef} type="button" className="form-botao" onClick={() => setAberta(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="form-botao form-botao-forte"
              onClick={() => {
                setFalhou(false)
                jaAbriu.current = false
                excluirObjeto(id).then(
                  () => {
                    aoExcluir()
                    setAberta(false)
                  },
                  () => setFalhou(true),
                )
              }}
            >
              Excluir
            </button>
          </div>
        </div>
      ) : (
        <button ref={gatilhoRef} type="button" className="objeto-link" onClick={() => setAberta(true)}>
          <Icon name="excluir" size={18} />
          Excluir o objeto
        </button>
      )}
    </div>
  )
}
