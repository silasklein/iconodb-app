/**
 * "Adicionar imagem" a um objeto (decisão 33; ItemAdicionarImagem.dc.html no celular, PC-ItemAdicionarImagem.dc.html
 * no computador) e "Editar a imagem" (a mesma folha, para uma imagem do usuário que já existe).
 *
 * Celular: folha de baixo, modal. (a) De onde vem: Tirar foto (câmera traseira), Fotos, Arquivos, cada uma um
 * `<input type="file" accept="image/*">` (o iOS entrega JPEG das Fotos; do Arquivos pode vir HEIC). (b) A foto
 * escolhida: prévia, Tipo (o detectado já marcado), Legenda, Crédito / fonte, "Usar como imagem principal".
 * Computador: diálogo modal com a área de soltar; várias imagens de uma vez, cada uma com os seus campos (clicar na
 * miniatura edita a seguinte).
 *
 * As imagens são processadas UMA DE CADA VEZ (uma foto de 48 MP por vez na memória), num worker quando dá
 * (processar.ts). Erros na própria folha, em português, nunca um botão desabilitado: formato que não abre, falta de
 * crédito, falta de espaço no aparelho.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ErroDeEspaco, MSG_SEM_ESPACO } from '../imagens-usuario/local'
import type { Modo } from '../imagens-usuario/modo'
import { adicionarImagem, alterarImagem, excluirImagem, restaurarImagem } from '../imagens-usuario/operacoes'
import { ErroDeFormato, MSG_FORMATO, processarImagem, type ImagemProcessada } from '../imagens-usuario/processar'
import { excluidasDoObjeto, lerImagem, type ImagemDoUsuario } from '../imagens-usuario/registro'
import { useUrlDoUsuario } from '../imagens-usuario/urls'
import { useCampoSalvo } from '../usuario/campoSalvo'
import { useEstado, type Estado } from '../usuario/estado'
import { Camada } from '../ui/Camada'
import { Icon, type IconName } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import './AdicionarImagem.css'

type Variante = 'folha' | 'dialogo'
type Origem = 'camera' | 'galeria' | 'arquivos' | 'arrastada'

export const MSG_SEM_CREDITO = 'Diga de onde vem a imagem (por exemplo, foto própria ou o museu).'
const MSG_NAO_ABRE = 'Tire da lista (ou troque) a imagem que não abre neste aparelho.'
const MSG_FALHA = 'Não foi possível guardar a mudança; tente de novo.'
const MSG_NAO_PREPAROU = 'Não foi possível preparar esta imagem neste aparelho. Tente de novo ou escolha outra.'
const MSG_CREDITO_VAZIO = 'Diga de onde vem a imagem; o crédito anterior continua guardado.'
const NOTA_DROPBOX = 'Fica no seu Dropbox; aparece nos outros aparelhos depois de sincronizar.'

const DE_ONDE: Record<Origem, string> = { camera: 'da câmera', galeria: 'da galeria', arquivos: 'de Arquivos', arrastada: 'arrastada' }

/** "3,1 MB" / "900 KB" (decimal, como o iPhone mostra). */
export function tamanhoLegivel(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`
  return `${Math.max(1, Math.round(bytes / 1e3)).toLocaleString('pt-BR')} KB`
}
const px = (n: number) => n.toLocaleString('pt-BR')

// ---------------------------------------------------------------------------------------------------- os campos

export interface ValoresDosCampos {
  tipo: Modo
  legenda: string
  credito: string
  principal: boolean
}

interface PropsDosCampos {
  valores: ValoresDosCampos
  detectado: Modo | null
  /** null: um objeto SKC (não há desenho de livro a substituir). */
  rotuloDoLivro?: string | null
  erroDoCredito?: string | null
  creditoRef?: React.Ref<HTMLInputElement>
  aoMudarTipo: (t: Modo) => void
  aoMudarPrincipal: (p: boolean) => void
  legenda: { aoMudar: (t: string) => void; aoFocar?: () => void; aoDesfocar?: () => void }
  credito: { aoMudar: (t: string) => void; aoFocar?: () => void; aoDesfocar?: () => void }
  sugestoes: readonly string[]
}

export function CamposDaImagem({ valores, detectado, rotuloDoLivro, erroDoCredito, creditoRef, aoMudarTipo, aoMudarPrincipal, legenda, credito, sugestoes }: PropsDosCampos) {
  const id = useId()
  const nomeDoGrupo = `${id}-tipo`
  const opcoes: { modo: Modo; rotulo: string; apoio: string }[] = [
    { modo: 'traco', rotulo: 'Desenho de traço', apoio: '(mostrar invertido)' },
    { modo: 'tons', rotulo: 'Foto / tons', apoio: '(mostrar como está)' },
  ]
  const campoDoCredito = useRef<HTMLInputElement | null>(null)
  const juntarRef = (el: HTMLInputElement | null) => {
    campoDoCredito.current = el
    if (typeof creditoRef === 'function') creditoRef(el)
    else if (creditoRef) (creditoRef as React.MutableRefObject<HTMLInputElement | null>).current = el
  }
  const sugerir = (s: string) => {
    if (s === 'publicação…') {
      credito.aoMudar('Publicação: ')
      requestAnimationFrame(() => {
        const c = campoDoCredito.current
        if (!c) return
        c.focus()
        c.setSelectionRange(c.value.length, c.value.length)
      })
    } else credito.aoMudar(s)
  }
  return (
    <>
      <fieldset className="adicionar-imagem-tipo">
        <legend>Tipo</legend>
        {opcoes.map((o) => (
          <label key={o.modo} className="adicionar-imagem-opcao">
            <input type="radio" name={nomeDoGrupo} checked={valores.tipo === o.modo} onChange={() => aoMudarTipo(o.modo)} />
            <span>
              {o.rotulo} <span className="adicionar-imagem-apoio">{o.apoio}</span>
            </span>
            {detectado === o.modo && <span className="adicionar-imagem-detectado">detectado</span>}
          </label>
        ))}
      </fieldset>
      <div className="adicionar-imagem-campo">
        <label htmlFor={`${id}-legenda`}>
          Legenda <span className="adicionar-imagem-apoio">(opcional)</span>
        </label>
        <input
          id={`${id}-legenda`}
          type="text"
          value={valores.legenda}
          autoComplete="off"
          onChange={(e) => legenda.aoMudar(e.target.value)}
          onFocus={legenda.aoFocar}
          onBlur={legenda.aoDesfocar}
        />
      </div>
      <div className="adicionar-imagem-campo">
        <label htmlFor={`${id}-credito`}>Crédito / fonte</label>
        <input
          ref={juntarRef}
          id={`${id}-credito`}
          type="text"
          value={valores.credito}
          autoComplete="off"
          aria-describedby={`${id}-credito-ajuda`}
          aria-invalid={erroDoCredito ? true : undefined}
          aria-errormessage={erroDoCredito ? `${id}-credito-erro` : undefined}
          onChange={(e) => credito.aoMudar(e.target.value)}
          onFocus={credito.aoFocar}
          onBlur={credito.aoDesfocar}
        />
        {erroDoCredito && (
          <p id={`${id}-credito-erro`} className="adicionar-imagem-erro" role="alert">
            <Icon name="aviso" size={16} />
            {erroDoCredito}
          </p>
        )}
        <div role="group" aria-label="Créditos já usados" className="adicionar-imagem-sugestoes">
          {sugestoes.map((s) => (
            <button key={s} type="button" className="adicionar-imagem-sugestao" onClick={() => sugerir(s)}>
              {s}
            </button>
          ))}
        </div>
        <span id={`${id}-credito-ajuda`} className="adicionar-imagem-ajuda">
          Aparece sob a imagem, com a marca SKC.
        </span>
      </div>
      <label className="adicionar-imagem-opcao adicionar-imagem-principal">
        <input type="checkbox" checked={valores.principal} onChange={(e) => aoMudarPrincipal(e.target.checked)} />
        <span>
          Usar como imagem principal
          <span className="adicionar-imagem-apoio adicionar-imagem-principal-apoio">{rotuloDoLivro === null ? ' nas grades e no topo' : ` no lugar do desenho do ${rotuloDoLivro ?? 'livro'}, nas grades e no topo`}</span>
        </span>
      </label>
    </>
  )
}

/** Os créditos para tocar: "foto própria", os dois últimos usados e "publicação…". */
function sugestoesDeCredito(estado: Estado): string[] {
  const mapa = estado.registros.get('imagem')
  const usados: { c: string; em: string }[] = []
  for (const r of mapa?.values() ?? []) {
    const c = typeof r.campos.credito === 'string' ? r.campos.credito.trim() : ''
    if (c && c !== 'foto própria' && !c.startsWith('Publicação:')) usados.push({ c, em: r.alteradoEm })
  }
  usados.sort((a, b) => (a.em < b.em ? 1 : -1))
  const recentes = [...new Set(usados.map((u) => u.c))].slice(0, 2)
  return ['foto própria', ...recentes, 'publicação…']
}
const cacheDeSugestoes = new WeakMap<object, string[]>()
export function useSugestoesDeCredito(): readonly string[] {
  return useEstado(
    useCallback((e: Estado) => {
      const mapa = e.registros.get('imagem') ?? e
      let s = cacheDeSugestoes.get(mapa)
      if (!s) cacheDeSugestoes.set(mapa, (s = sugestoesDeCredito(e)))
      return s
    }, []),
  )
}

// ---------------------------------------------------------------------------------------------------- adicionar

interface Escolhida {
  chave: string
  arquivo: File
  origem: Origem
  fase: 'preparando' | 'pronta' | 'erro'
  processada?: ImagemProcessada
  erro?: string
  previa?: string
  /** O detalhe técnico de um erro que não é de formato (a linha "Detalhe"). */
  detalhe?: string
  tipo: Modo | null
  legenda: string
  credito: string
  principal: boolean
  erroDoCredito?: boolean
}

export interface PropsDeAdicionar {
  /** O número do objeto (ou o id de um objeto SKC). */
  objeto: string
  /** "IPIAO I": o livro cujo desenho a imagem principal substitui. */
  rotuloDoLivro?: string
  variante: Variante
  /** Arquivos que já chegam escolhidos (soltos sobre o item, no computador). */
  arquivos?: readonly File[]
  aoFechar: () => void
  /** Os ids das imagens gravadas (na ordem). */
  aoAdicionar: (ids: string[]) => void
  devolverFoco?: () => HTMLElement | null
  /** Troca o processamento (testes). */
  processar?: (arquivo: File) => Promise<ImagemProcessada>
}

let contador = 0

export function AdicionarImagem({ objeto, rotuloDoLivro, variante, arquivos, aoFechar, aoAdicionar, devolverFoco, processar = processarImagem }: PropsDeAdicionar) {
  const [itens, setItens] = useState<Escolhida[]>([])
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [adicionando, setAdicionando] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  // Revisão 1, M6: com imagens escolhidas, Esc e o fundo perguntam antes de descartar.
  const [confirmar, setConfirmar] = useState(false)
  const continuar = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (confirmar) continuar.current?.focus()
  }, [confirmar])
  // Pedido de foco no Crédito (depois de mostrar o erro dele): feito no efeito, já com o campo na tela.
  const [focarCredito, setFocarCredito] = useState(0)
  const sugestoes = useSugestoesDeCredito()
  const excluidas = useEstado(useCallback((e: Estado) => excluidasDoObjeto(e, objeto), [objeto]))
  const credito = useRef<HTMLInputElement | null>(null)
  const entradas = useRef<Partial<Record<Origem, HTMLInputElement | null>>>({})
  const vivo = useRef(true)
  const previas = useRef(new Set<string>())
  const processando = useRef(new Map<string, Promise<ImagemProcessada | null>>())
  const cadeia = useRef<Promise<unknown>>(Promise.resolve())
  const folha = variante === 'folha'
  const idTitulo = useId()

  useEffect(() => {
    vivo.current = true
    const urls = previas.current
    return () => {
      vivo.current = false
      for (const u of urls) URL.revokeObjectURL(u)
      urls.clear()
    }
  }, [])

  useEffect(() => {
    if (focarCredito) credito.current?.focus()
  }, [focarCredito])

  const mudar = useCallback((chave: string, f: (i: Escolhida) => Escolhida) => setItens((lista) => lista.map((i) => (i.chave === chave ? f(i) : i))), [])

  /** Põe na fila de processamento (uma por vez). */
  const preparar = useCallback(
    (chave: string, arquivo: File) => {
      const feito = cadeia.current.then(async () => {
        if (!vivo.current) return null
        try {
          const p = await processar(arquivo)
          if (!vivo.current) return null
          const previa = URL.createObjectURL(p.tela)
          previas.current.add(previa)
          mudar(chave, (i) => (i.arquivo === arquivo ? { ...i, fase: 'pronta', processada: p, previa, tipo: i.tipo } : i))
          return p
        } catch (erro) {
          if (vivo.current) {
            const formato = erro instanceof ErroDeFormato
            const detalhe = formato ? undefined : (erro instanceof Error ? erro.message || erro.name : String(erro)).slice(0, 200)
            mudar(chave, (i) => (i.arquivo === arquivo ? { ...i, fase: 'erro', erro: formato ? MSG_FORMATO : MSG_NAO_PREPAROU, detalhe } : i))
          }
          return null
        }
      })
      cadeia.current = feito
      processando.current.set(chave, feito)
    },
    [processar, mudar],
  )

  const acrescentar = useCallback(
    (lista: readonly File[], origem: Origem) => {
      const novos = lista.filter((f) => f.size > 0 || f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp|gif|avif)$/i.test(f.name))
      if (novos.length === 0) return
      setErroGeral(null)
      const escolhidas: Escolhida[] = novos.map((arquivo) => ({ chave: `e${++contador}`, arquivo, origem, fase: 'preparando', tipo: null, legenda: '', credito: '', principal: false }))
      setItens((atuais) => (folha ? escolhidas.slice(0, 1) : [...atuais, ...escolhidas]))
      setSelecionada((s) => (folha || !s ? escolhidas[0]!.chave : s))
      for (const e of folha ? escolhidas.slice(0, 1) : escolhidas) preparar(e.chave, e.arquivo)
    },
    [folha, preparar],
  )

  /** "Trocar a imagem" (celular): a nova foto entra no lugar, com os campos já escritos. */
  const trocar = useCallback(
    (arquivo: File, origem: Origem) => {
      const atual = itens[0]
      if (!atual) return acrescentar([arquivo], origem)
      if (atual.previa) {
        URL.revokeObjectURL(atual.previa)
        previas.current.delete(atual.previa)
      }
      const nova: Escolhida = { ...atual, arquivo, origem, fase: 'preparando', processada: undefined, erro: undefined, previa: undefined, tipo: null }
      setItens([nova])
      preparar(nova.chave, arquivo)
    },
    [itens, acrescentar, preparar],
  )

  // Arquivos soltos sobre o item (computador): entram na lista ao abrir.
  const iniciais = useRef(arquivos)
  useEffect(() => {
    if (iniciais.current?.length) acrescentar(iniciais.current, 'arrastada')
    iniciais.current = undefined
  }, [acrescentar])

  const tirar = (chave: string) => {
    setItens((lista) => {
      const i = lista.find((x) => x.chave === chave)
      if (i?.previa) {
        URL.revokeObjectURL(i.previa)
        previas.current.delete(i.previa)
      }
      const resto = lista.filter((x) => x.chave !== chave)
      if (selecionada === chave) setSelecionada(resto[0]?.chave ?? null)
      return resto
    })
  }

  const escolher = (origem: Origem) => entradas.current[origem]?.click()
  const aoEscolher = (origem: Origem) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const lista = [...(e.target.files ?? [])]
    e.target.value = ''
    if (lista.length === 0) return
    if (folha && itens.length > 0) trocar(lista[0]!, origem)
    else acrescentar(lista, origem)
  }

  const atual = itens.find((i) => i.chave === selecionada) ?? itens[0] ?? null

  const adicionar = async () => {
    if (adicionando) return
    setErroGeral(null)
    if (itens.length === 0) {
      setErroGeral('Escolha uma imagem primeiro.')
      return
    }
    const quebrada = itens.find((i) => i.fase === 'erro')
    if (quebrada) {
      setSelecionada(quebrada.chave)
      setErroGeral(MSG_NAO_ABRE)
      return
    }
    const semCredito = itens.find((i) => !i.credito.trim())
    if (semCredito) {
      setItens((lista) => lista.map((i) => (i.credito.trim() ? i : { ...i, erroDoCredito: true })))
      setSelecionada(semCredito.chave)
      setFocarCredito((n) => n + 1)
      return
    }
    setAdicionando(true)
    const ids: string[] = []
    try {
      for (const i of itens) {
        const p = i.processada ?? (await processando.current.get(i.chave)) ?? null
        if (!p) {
          setSelecionada(i.chave)
          setErroGeral(MSG_NAO_ABRE)
          return
        }
        ids.push(await adicionarImagem({ objeto }, p, { tipo: i.tipo ?? p.modoSugerido, legenda: i.legenda, credito: i.credito, principal: i.principal }))
        if (vivo.current) tirar(i.chave)
      }
      aoAdicionar(ids)
    } catch (erro) {
      if (!vivo.current) return
      const ja = ids.length ? ` ${ids.length === 1 ? 'Uma imagem já foi adicionada.' : `${ids.length} imagens já foram adicionadas.`}` : ''
      setErroGeral(erro instanceof ErroDeEspaco ? `${MSG_SEM_ESPACO}${ja}` : `Não foi possível guardar a imagem neste aparelho; tente de novo.${ja}`)
      if (ids.length) aoAdicionar(ids)
    } finally {
      if (vivo.current) setAdicionando(false)
    }
  }

  const campos = atual && (
    <CamposDaImagem
      key={atual.chave}
      valores={{ tipo: atual.tipo ?? atual.processada?.modoSugerido ?? 'tons', legenda: atual.legenda, credito: atual.credito, principal: atual.principal }}
      detectado={atual.processada?.modoSugerido ?? null}
      rotuloDoLivro={rotuloDoLivro}
      erroDoCredito={atual.erroDoCredito ? MSG_SEM_CREDITO : null}
      creditoRef={credito}
      sugestoes={sugestoes}
      aoMudarTipo={(t) => mudar(atual.chave, (i) => ({ ...i, tipo: t }))}
      aoMudarPrincipal={(p) => setItens((lista) => lista.map((i) => (i.chave === atual.chave ? { ...i, principal: p } : p ? { ...i, principal: false } : i)))}
      legenda={{ aoMudar: (t) => mudar(atual.chave, (i) => ({ ...i, legenda: t })) }}
      credito={{ aoMudar: (t) => mudar(atual.chave, (i) => ({ ...i, credito: t, erroDoCredito: false })) }}
    />
  )

  const entradasOcultas = (
    <div hidden>
      {(['camera', 'galeria', 'arquivos'] as const).map((o) => (
        <input
          key={o}
          ref={(el) => {
            entradas.current[o] = el
          }}
          type="file"
          accept="image/*"
          data-origem={o}
          tabIndex={-1}
          aria-hidden="true"
          multiple={!folha && o !== 'camera'}
          capture={o === 'camera' ? 'environment' : undefined}
          onChange={aoEscolher(o)}
        />
      ))}
    </div>
  )

  const pedirFechar = () => {
    if (confirmar) setConfirmar(false)
    else if (itens.length > 0) setConfirmar(true)
    else aoFechar()
  }
  const n = itens.length
  const pergunta = `Descartar ${n === 1 ? '1 imagem' : `${n} imagens`}?`
  const confirmacao = confirmar && (
    <div className="adicionar-imagem-confirmar" role="alertdialog" aria-label={pergunta} aria-describedby={`${idTitulo}-descartar`}>
      <p>
        <strong>{pergunta}</strong> <span id={`${idTitulo}-descartar`}>A escolha e o que foi escrito se perdem.</span>
      </p>
      <span className="adicionar-imagem-confirmar-botoes">
        <button ref={continuar} type="button" className="adicionar-imagem-botao adicionar-imagem-botao-pequeno" onClick={() => setConfirmar(false)}>
          {n === 1 ? 'Voltar à imagem' : 'Voltar às imagens'}
        </button>
        <button type="button" className="adicionar-imagem-botao adicionar-imagem-botao-pequeno adicionar-imagem-botao-principal" onClick={aoFechar}>
          {n === 1 ? 'Descartar a imagem' : 'Descartar as imagens'}
        </button>
      </span>
    </div>
  )
  const rotulo = `Adicionar imagem a ${objeto}`
  const textoDoBotao = adicionando ? 'Adicionando…' : itens.length > 1 ? `Adicionar ${itens.length} imagens` : 'Adicionar'
  const pe = (
    <div className="adicionar-imagem-pe">
      {confirmacao}
      {erroGeral && (
        <p className="adicionar-imagem-erro adicionar-imagem-erro-geral" role="alert">
          <Icon name="aviso" size={16} />
          {erroGeral}
        </p>
      )}
      <div className="adicionar-imagem-botoes">
        <button type="button" className="adicionar-imagem-botao" onClick={aoFechar}>
          Cancelar
        </button>
        <button type="button" className="adicionar-imagem-botao adicionar-imagem-botao-principal" aria-busy={adicionando || undefined} onClick={() => void adicionar()}>
          <Icon name="confirmar" size={18} />
          {textoDoBotao}
        </button>
      </div>
      <span className="adicionar-imagem-nota">{NOTA_DROPBOX}</span>
    </div>
  )

  const listaDeExcluidas = excluidas.length > 0 && <Excluidas imagens={excluidas} />

  if (folha) {
    const topo = (rotuloFechar: string) => (
      <div className="adicionar-imagem-topo">
        <h2 id={idTitulo} className="adicionar-imagem-etiqueta">
          Adicionar imagem · <span className="codigo">{objeto}</span>
        </h2>
        <IconButton icon="fechar" label={rotuloFechar} shortcut="Escape" shortcutLabel="Esc" onClick={aoFechar} />
      </div>
    )
    if (!atual) {
      return (
        <Camada variante="folha" rotulo={rotulo} aoFechar={aoFechar} devolverFoco={devolverFoco} className="adicionar-imagem-origem">
          {topo('Fechar')}
          <p className="adicionar-imagem-intro">Uma foto de museu, outra publicação ou foto própria, ao lado do desenho do livro.</p>
          <div className="adicionar-imagem-fontes">
            {(
              [
                ['camera', 'camera', 'Tirar foto', 'Câmera do iPhone'],
                ['galeria', 'fotos', 'Fotos', 'Galeria do iPhone'],
                ['arquivos', 'arquivos', 'Arquivos', 'App Arquivos: iCloud, Dropbox'],
              ] as [Origem, IconName, string, string][]
            ).map(([origem, icone, nome, apoio]) => (
              <button key={origem} type="button" className="adicionar-imagem-fonte" onClick={() => escolher(origem)}>
                <span className="adicionar-imagem-fonte-icone">
                  <Icon name={icone} size={20} />
                </span>
                <span className="adicionar-imagem-fonte-texto">
                  <span>{nome}</span>
                  <span className="adicionar-imagem-fonte-apoio">{apoio}</span>
                </span>
              </button>
            ))}
          </div>
          {erroGeral && (
            <p className="adicionar-imagem-erro" role="alert">
              {erroGeral}
            </p>
          )}
          <p className="adicionar-imagem-nota">{NOTA_DROPBOX}</p>
          <button type="button" className="adicionar-imagem-botao adicionar-imagem-cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          {listaDeExcluidas}
          {entradasOcultas}
        </Camada>
      )
    }
    return (
      <Camada variante="folha" rotulo={rotulo} aoFechar={aoFechar} aoPedirFechar={pedirFechar} devolverFoco={devolverFoco} className="adicionar-imagem-detalhes">
        {topo('Fechar sem adicionar')}
        <div className="adicionar-imagem-rolagem">
          <div className="adicionar-imagem-escolhida">
            <Previa item={atual} />
            <div className="adicionar-imagem-escolhida-texto">
              <span className="adicionar-imagem-nome">{atual.arquivo.name || 'Imagem'}</span>
              <span className="adicionar-imagem-apoio">{`${tamanhoLegivel(atual.arquivo.size)} · ${DE_ONDE[atual.origem]}`}</span>
              <button type="button" className="adicionar-imagem-trocar" onClick={() => escolher(atual.origem === 'arrastada' ? 'arquivos' : atual.origem)}>
                Trocar a imagem
              </button>
            </div>
          </div>
          {campos}
        </div>
        {pe}
        {entradasOcultas}
      </Camada>
    )
  }

  // Computador: o diálogo com a área de soltar.
  return (
    <Camada variante="dialogo" rotulo={rotulo} aoFechar={aoFechar} aoPedirFechar={pedirFechar} devolverFoco={devolverFoco} aoSoltar={(lista) => acrescentar(lista, 'arrastada')}>
      <div className="adicionar-imagem-topo">
        <h2 id={idTitulo} className="adicionar-imagem-titulo">
          Adicionar imagem <span className="codigo">{objeto}</span>
        </h2>
        <IconButton icon="fechar" label="Fechar sem adicionar" shortcut="Escape" shortcutLabel="Esc" onClick={aoFechar} />
      </div>
      <div className="adicionar-imagem-corpo">
        <div className="adicionar-imagem-esquerda">
          <div
            className={`adicionar-imagem-soltar${arrastando ? ' adicionar-imagem-soltar-ativa' : ''}`}
            data-area-de-soltar=""
            onDragEnter={() => setArrastando(true)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false)
            }}
            onDrop={() => setArrastando(false)}
          >
            <Icon name="enviarArquivo" size={22} />
            <span>Arraste imagens aqui ou escolha arquivos</span>
            <span className="adicionar-imagem-soltar-botoes">
              <button type="button" className="adicionar-imagem-botao adicionar-imagem-botao-pequeno" onClick={() => escolher('arquivos')}>
                Escolher arquivos
              </button>
              <button type="button" className="adicionar-imagem-botao adicionar-imagem-botao-pequeno" onClick={() => escolher('galeria')}>
                Fotos
              </button>
            </span>
          </div>
          {itens.length > 0 && (
            <>
              <h3 className="adicionar-imagem-etiqueta">{itens.length === 1 ? '1 imagem para adicionar' : `${itens.length} imagens para adicionar`}</h3>
              <ul className="adicionar-imagem-lista">
                {itens.map((i) => (
                  <li key={i.chave} className={`adicionar-imagem-cartao${i.chave === atual?.chave ? ' adicionar-imagem-cartao-atual' : ''}`}>
                    <button type="button" className="adicionar-imagem-cartao-botao" aria-label={`Editar ${i.arquivo.name || 'imagem'}`} aria-current={i.chave === atual?.chave ? 'true' : undefined} onClick={() => setSelecionada(i.chave)}>
                      <Previa item={i} />
                    </button>
                    <span className="adicionar-imagem-cartao-pe">
                      <span className="adicionar-imagem-cartao-texto">
                        <span className="adicionar-imagem-nome">{i.arquivo.name || 'Imagem'}</span>
                        <span className="adicionar-imagem-apoio">{descricaoDoCartao(i)}</span>
                      </span>
                      <IconButton icon="fechar" label={`Tirar ${i.arquivo.name || 'a imagem'} da lista`} onClick={() => tirar(i.chave)} />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {listaDeExcluidas}
        </div>
        <div className="adicionar-imagem-direita">
          {campos ?? <p className="adicionar-imagem-intro">Uma foto de museu, outra publicação ou foto própria, ao lado do desenho do livro. Escolha ou arraste uma imagem para preencher o Tipo, a legenda e o crédito.</p>}
          {itens.length > 1 && <p className="adicionar-imagem-ajuda">Com várias imagens, cada uma tem estes campos: clique na miniatura para editar a seguinte.</p>}
        </div>
      </div>
      {pe}
      {entradasOcultas}
    </Camada>
  )
}

function descricaoDoCartao(i: Escolhida): string {
  const p = i.processada
  const l = p?.originalLargura ?? p?.largura
  const a = p?.originalAltura ?? p?.altura
  return l && a ? `${px(l)} × ${px(a)} px · ${tamanhoLegivel(i.arquivo.size)}` : tamanhoLegivel(i.arquivo.size)
}

function Previa({ item }: { item: Escolhida }) {
  if (item.fase === 'erro') {
    return (
      <div className="adicionar-imagem-previa adicionar-imagem-previa-erro" role="alert">
        <span>{item.erro}</span>
        {item.detalhe && <span className="adicionar-imagem-detalhe">Detalhe: {item.detalhe}</span>}
      </div>
    )
  }
  if (item.fase === 'preparando' || !item.previa) {
    return (
      <div className="adicionar-imagem-previa" role="status" aria-busy="true">
        Preparando a imagem…
      </div>
    )
  }
  return <img className="adicionar-imagem-previa" src={item.previa} alt="Prévia da imagem escolhida" />
}

/** As imagens excluídas do objeto, para restaurar (a exclusão é uma marca reversível). */
function Excluidas({ imagens }: { imagens: readonly ImagemDoUsuario[] }) {
  const [falha, setFalha] = useState<string | null>(null)
  const id = useId()
  return (
    <section className="adicionar-imagem-excluidas" aria-labelledby={id}>
      <h3 id={id} className="adicionar-imagem-etiqueta">
        Imagens excluídas deste objeto
      </h3>
      <ul>
        {imagens.map((img) => (
          <li key={img.id}>
            <MiniaturaDaExcluida id={img.id} />
            <span className="adicionar-imagem-excluida-texto">{img.credito || img.nome || img.id}</span>
            <button
              type="button"
              className="adicionar-imagem-link"
              aria-label={`Restaurar a imagem ${img.credito || img.nome || img.id}`}
              onClick={() => {
                setFalha(null)
                restaurarImagem(img.id).catch(() => setFalha(MSG_FALHA))
              }}
            >
              Restaurar
            </button>
          </li>
        ))}
      </ul>
      {falha && (
        <p className="adicionar-imagem-erro" role="alert">
          {falha}
        </p>
      )}
    </section>
  )
}

function MiniaturaDaExcluida({ id }: { id: string }) {
  const r = useUrlDoUsuario(id, 'miniatura')
  return <span className="adicionar-imagem-excluida-mini">{r.estado === 'ok' && <img src={r.url} alt="" />}</span>
}

// ---------------------------------------------------------------------------------------------------- editar

export interface PropsDeEditar {
  id: string
  rotuloDoLivro?: string
  variante: Variante
  aoFechar: () => void
  /** A imagem foi excluída (a tela mostra "Imagem excluída · Desfazer"). */
  aoExcluir: (id: string) => void
  devolverFoco?: () => HTMLElement | null
}

/** "Editar a imagem": Tipo e principal gravam ao tocar; legenda e crédito se salvam sozinhos (useCampoSalvo). */
export function EditarImagem({ id, rotuloDoLivro, variante, aoFechar, aoExcluir, devolverFoco }: PropsDeEditar) {
  const img = useEstado(
    useMemo(() => {
      let reg: unknown = null
      let lida: ImagemDoUsuario | null = null
      return (e: Estado) => {
        const r = e.registro('imagem', id) ?? null
        if (r !== reg) {
          reg = r
          lida = r ? lerImagem(r) : null
        }
        return lida
      }
    }, [id]),
  )
  const sugestoes = useSugestoesDeCredito()
  const [falha, setFalha] = useState<string | null>(null)
  const legenda = useCampoSalvo({ tipo: 'imagem', reg: id, campo: 'legenda', valor: img?.legenda ?? '', aoFalhar: (f) => setFalha(f ? MSG_FALHA : null) })
  // Revisão 1, M7: o crédito não fica vazio (não é gravado; o anterior continua) e o campo diz por quê.
  const credito = useCampoSalvo({ tipo: 'imagem', reg: id, campo: 'credito', valor: img?.credito ?? '', aceitar: (t) => t !== '', aoFalhar: (f) => setFalha(f ? MSG_FALHA : null) })
  const [saiuDoCredito, setSaiuDoCredito] = useState(false)
  const creditoVazio = credito.texto.trim() === '' && saiuDoCredito
  const previa = useUrlDoUsuario(id, 'miniatura')
  const tentar = (acao: Promise<void>, depois?: () => void) => {
    setFalha(null)
    acao.then(depois, () => setFalha(MSG_FALHA))
  }
  if (!img) return null
  const rotulo = `Editar a imagem SKC de ${img.alvo}`
  return (
    <Camada variante={variante} rotulo={rotulo} aoFechar={aoFechar} devolverFoco={devolverFoco} className="adicionar-imagem-editar">
      <div className="adicionar-imagem-topo">
        <h2 className={variante === 'folha' ? 'adicionar-imagem-etiqueta' : 'adicionar-imagem-titulo'}>
          Imagem SKC · <span className="codigo">{img.alvo}</span>
        </h2>
        <IconButton icon="fechar" label="Fechar" shortcut="Escape" shortcutLabel="Esc" onClick={aoFechar} />
      </div>
      <div className="adicionar-imagem-rolagem">
        <div className="adicionar-imagem-escolhida">
          {previa.estado === 'ok' ? <img className="adicionar-imagem-previa" src={previa.url} alt="A imagem" /> : <div className="adicionar-imagem-previa" aria-hidden="true" />}
          <div className="adicionar-imagem-escolhida-texto">
            <span className="adicionar-imagem-nome">{img.nome || 'Imagem'}</span>
            {img.bytes && <span className="adicionar-imagem-apoio">{tamanhoLegivel(img.bytes)}</span>}
          </div>
        </div>
        <CamposDaImagem
          valores={{ tipo: img.tipo, legenda: legenda.texto, credito: credito.texto, principal: img.principal }}
          detectado={img.tipoDetectado}
          rotuloDoLivro={rotuloDoLivro}
          sugestoes={sugestoes}
          erroDoCredito={creditoVazio ? MSG_CREDITO_VAZIO : null}
          aoMudarTipo={(t) => tentar(alterarImagem(id, { tipo: t }))}
          aoMudarPrincipal={(p) => tentar(alterarImagem(id, { principal: p }))}
          legenda={{ aoMudar: legenda.setTexto, aoFocar: legenda.aoFocar, aoDesfocar: () => void legenda.aoDesfocar() }}
          credito={{
            aoMudar: credito.setTexto,
            aoFocar: credito.aoFocar,
            aoDesfocar: () => {
              setSaiuDoCredito(true)
              void credito.aoDesfocar()
            },
          }}
        />
        <button type="button" className="adicionar-imagem-excluir" onClick={() => tentar(excluirImagem(id), () => aoExcluir(id))}>
          <Icon name="excluir" size={18} />
          Excluir a imagem
        </button>
        {falha && (
          <p className="adicionar-imagem-erro" role="alert">
            <Icon name="aviso" size={16} />
            {falha}
          </p>
        )}
      </div>
      <div className="adicionar-imagem-pe">
        <div className="adicionar-imagem-botoes adicionar-imagem-botoes-um">
          <button type="button" className="adicionar-imagem-botao adicionar-imagem-botao-principal" onClick={aoFechar}>
            <Icon name="confirmar" size={18} />
            Pronto
          </button>
        </div>
        <span className="adicionar-imagem-nota">As mudanças se salvam sozinhas e sobem na próxima sincronização.</span>
      </div>
    </Camada>
  )
}
