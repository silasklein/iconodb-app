import { useEffect, useId, useRef, useState, type ClipboardEvent, type FocusEvent, type KeyboardEvent } from 'react'
import { normalizarForma } from '../glossario/modelo'
import { coordenadaEmGraus, lerLatitude, lerLongitude, lerTextoDeCoordenada } from '../telas/coordenada'
import { IconButton } from '../ui/IconButton'
import { useCampoSalvo } from '../usuario/campoSalvo'
import { AvisoDeSitioParecido } from './AvisoDeSitioParecido'
import { sitiosComEsteNome, useSitiosParaComparar } from './doUsuario'
import { chaveDoNome, type Coordenada } from './modelo'
import { corrigirCoordenada, corrigirVariantes, voltarAoLivro } from './operacoes'
import { apagarRascunhoDaCoordenada, apagarRascunhoDaCoordenadaSeVersao, comecarAGravarACoordenada, guardarRascunhoDaCoordenada, lerRascunhoDaCoordenada, versaoDoRascunhoDaCoordenada } from './rascunho'
import '../objetos-skc/Formulario.css'
import './Sitios.css'

/** Um número como se escreve em português: 31,9132. */
const comoTexto = (v: number) => String(v).replace('.', ',')

const MSG_FALHOU = 'Não foi possível guardar; tente de novo.'

/**
 * O nome do sítio, corrigido no lugar. Num sítio do livro o primeiro `alterar` cria o registro (`criaRegistro`) e escrever o
 * nome do livro grava `null` (o mesmo que "Voltar ao nome do livro"). Um nome igual (pela dobra) ao de outro sítio avisa, sem
 * bloquear (Tarefa 12, item 5).
 */
export function CampoNomeDoSitio({ id, nomeAgora, nomeDoLivro, corrigido }: { id: string; nomeAgora: string; nomeDoLivro: string | null; corrigido: boolean }) {
  const uid = useId()
  const [falhou, setFalhou] = useState(false)
  const todos = useSitiosParaComparar()
  const campo = useCampoSalvo({
    tipo: 'sitio',
    reg: id,
    campo: 'nome',
    valor: nomeAgora,
    normalizar: normalizarForma,
    aceitar: (limpo) => limpo !== '',
    valorGravado: (limpo) => (nomeDoLivro !== null && limpo === normalizarForma(nomeDoLivro) ? null : limpo),
    criaRegistro: nomeDoLivro !== null,
    aoFalhar: setFalhou,
  })
  // Só avisa de um nome que a pessoa pôs: o do livro, intacto, não é "duplicado" de nada.
  const mudou = nomeDoLivro === null || chaveDoNome(campo.texto) !== chaveDoNome(nomeDoLivro)
  const parecidos = mudou ? sitiosComEsteNome(todos, campo.texto, id) : []
  return (
    <div className="form-campo">
      <label htmlFor={`${uid}-nome`}>Nome</label>
      <div className="sitio-campo-linha">
        <input
          id={`${uid}-nome`}
          type="text"
          autoComplete="off"
          value={campo.texto}
          aria-describedby={nomeDoLivro !== null ? `${uid}-livro` : undefined}
          onChange={(e) => campo.setTexto(e.target.value)}
          onFocus={campo.aoFocar}
          onBlur={() => {
            // Um nome vazio não é nome: volta ao de agora, sem gravar nada.
            if (campo.texto.trim() === '') campo.setTexto(nomeAgora)
            void campo.aoDesfocar()
          }}
        />
        {nomeDoLivro !== null && corrigido && (
          <IconButton
            icon="desfazer"
            label="Voltar ao nome do livro"
            tipPosition="start"
            onClick={() => {
              setFalhou(false)
              campo.setTexto(nomeDoLivro)
              voltarAoLivro(id, ['nome']).catch(() => setFalhou(true))
            }}
          />
        )}
      </div>
      {nomeDoLivro !== null && (
        <span id={`${uid}-livro`} className="form-ajuda">
          no livro: {nomeDoLivro}
        </span>
      )}
      <AvisoDeSitioParecido parecidos={parecidos} quando="existente" />
      {falhou && (
        <p className="form-erro" role="alert">
          {MSG_FALHOU}
        </p>
      )}
    </div>
  )
}

/**
 * Um campo de texto do sítio que se grava sozinho: a região (ou país) e a nota. Vazio é "sem correção" (`null`): num sítio do
 * livro volta ao valor do livro (`original`); escrever o valor do livro também grava `null`.
 */
export function CampoDeTextoDoSitio({
  id,
  campo: nomeDoCampo,
  rotulo,
  valor,
  original,
  doLivro,
  longo = false,
  ajuda,
}: {
  id: string
  campo: 'regiao' | 'nota'
  rotulo: string
  valor: string
  original: string | null
  doLivro: boolean
  longo?: boolean
  ajuda?: string
}) {
  const uid = useId()
  const [falhou, setFalhou] = useState(false)
  const normalizar = nomeDoCampo === 'regiao' ? normalizarForma : undefined
  const campo = useCampoSalvo({
    tipo: 'sitio',
    reg: id,
    campo: nomeDoCampo,
    valor,
    normalizar,
    valorGravado: (limpo) => (limpo === '' || (original !== null && limpo === normalizarForma(original)) ? null : limpo),
    criaRegistro: doLivro,
    aoFalhar: setFalhou,
  })
  const props = {
    id: `${uid}-campo`,
    value: campo.texto,
    'aria-describedby': original !== null || ajuda ? `${uid}-ajuda` : undefined,
    onFocus: campo.aoFocar,
    onBlur: () => void campo.aoDesfocar(),
  }
  return (
    <div className="form-campo">
      <label htmlFor={`${uid}-campo`}>{rotulo}</label>
      {longo ? <textarea {...props} onChange={(e) => campo.setTexto(e.target.value)} /> : <input {...props} type="text" autoComplete="off" onChange={(e) => campo.setTexto(e.target.value)} />}
      {(original !== null || ajuda) && (
        <span id={`${uid}-ajuda`} className="form-ajuda">
          {[original !== null ? `no livro: ${original}` : null, ajuda].filter(Boolean).join(' · ')}
        </span>
      )}
      {falhou && (
        <p className="form-erro" role="alert">
          {MSG_FALHOU}
        </p>
      )}
    </div>
  )
}

/**
 * As outras grafias: pílulas com × e um campo ("outra grafia + Enter"; sair do campo também acrescenta o que está escrito, para
 * nada se perder). A lista inteira é um valor do registro (`variantes`); uma grafia igual a outra pela dobra não entra.
 */
export function GrafiasDoSitio({ id, variantes, nomeAgora }: { id: string; variantes: readonly string[]; nomeAgora: string }) {
  const uid = useId()
  const [texto, setTexto] = useState('')
  const [falhou, setFalhou] = useState(false)
  const todos = useSitiosParaComparar()
  const parecidos = sitiosComEsteNome(todos, texto, id)

  const tentar = (p: Promise<unknown>) => {
    setFalhou(false)
    p.catch(() => setFalhou(true))
  }
  const acrescentar = () => {
    const nova = normalizarForma(texto)
    setTexto('')
    if (nova === '' || chaveDoNome(nova) === chaveDoNome(nomeAgora) || variantes.some((v) => chaveDoNome(v) === chaveDoNome(nova))) return
    tentar(corrigirVariantes(id, [...variantes, nova]))
  }
  const teclar = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    acrescentar()
  }
  return (
    <div className="form-campo">
      <label htmlFor={`${uid}-grafia`}>Outras grafias</label>
      {variantes.length > 0 && (
        <ul className="sitio-grafias" aria-label="Outras grafias do sítio">
          {variantes.map((v) => (
            <li key={v} className="sitio-grafia">
              {v}
              <span className="marca-skc">SKC</span>
              <IconButton icon="fechar" label={`Tirar a grafia ${v}`} size={16} tipPosition="start" onClick={() => tentar(corrigirVariantes(id, variantes.filter((x) => x !== v)))} />
            </li>
          ))}
        </ul>
      )}
      <input id={`${uid}-grafia`} type="text" autoComplete="off" placeholder="outra grafia + Enter" value={texto} aria-describedby={`${uid}-ajuda`} onChange={(e) => setTexto(e.target.value)} onKeyDown={teclar} onBlur={acrescentar} />
      <span id={`${uid}-ajuda`} className="form-ajuda">
        Formas antigas, modernas, árabes, hebraicas ou de outros livros. Entram na busca.
      </span>
      <AvisoDeSitioParecido parecidos={parecidos} quando="existente" />
      {falhou && (
        <p className="form-erro" role="alert">
          {MSG_FALHOU}
        </p>
      )}
    </div>
  )
}

/** O que os campos de coordenada dizem (compartilhado com o NovoSitio). */
export interface CamposDeCoordenada {
  lat: string
  lon: string
}

/**
 * Lê os dois campos. Os dois vazios: sem coordenada (`vazia`). Um só: pede o outro. Cada erro diz o formato e a faixa. Colar uma
 * coordenada inteira (dois números ou um link) num dos campos preenche os dois (`aoColar`); a que ainda está inteira num campo só
 * (digitada, sem sair dele: ⌘/Ctrl+Enter) vale pelo que `lerCoordenada` diz dela, a coordenada ou o motivo da recusa.
 */
export function lerCamposDeCoordenada(c: CamposDeCoordenada): { ok: true; coordenada: Coordenada | null } | { ok: false; erro: string; campo: 'lat' | 'lon' } {
  if (c.lat.trim() === '' && c.lon.trim() === '') return { ok: true, coordenada: null }
  for (const campo of ['lat', 'lon'] as const) {
    const inteira = resolverTextoDeCoordenada(c[campo])
    if (!inteira) continue
    return 'erro' in inteira ? { ok: false, erro: inteira.erro, campo } : lerCamposDeCoordenada(inteira.campos)
  }
  const lat = lerLatitude(c.lat)
  if (!lat.ok) return { ok: false, erro: lat.erro, campo: 'lat' }
  const lon = lerLongitude(c.lon)
  if (!lon.ok) return { ok: false, erro: lon.erro, campo: 'lon' }
  return { ok: true, coordenada: { lat: lat.valor, lon: lon.valor } }
}

/** O que um texto de coordenada inteira dá: os dois campos, a recusa específica do leitor, ou `null` (é um número só, vai ao campo). */
export type TextoDeCoordenada = { campos: CamposDeCoordenada } | { erro: string } | null

/**
 * Um texto que é uma coordenada INTEIRA (um par, um link, um endereço), colado ou digitado num campo só: os dois campos, ou a
 * recusa de `lerCoordenada` com o motivo (ambígua, fora da faixa, link que não se lê, link curto do Google). Um número só: `null`.
 */
export function resolverTextoDeCoordenada(texto: string): TextoDeCoordenada {
  const r = lerTextoDeCoordenada(texto)
  if (r === null) return null
  return r.ok ? { campos: { lat: comoTexto(r.lat), lon: comoTexto(r.lon) } } : { erro: r.erro }
}

/** Colar numa caixa de latitude ou longitude. Uma coordenada inteira não é colada como texto: preenche os dois campos, ou a recusa é mostrada. */
export function aoColarCoordenada(e: ClipboardEvent<HTMLInputElement>): TextoDeCoordenada {
  const r = resolverTextoDeCoordenada(e.clipboardData.getData('text'))
  if (r) e.preventDefault()
  return r
}

/** Os campos de agora dizem a coordenada `g` (ou, os dois vazios, nenhuma)? Comparados pelos números, não pelo texto. */
export function mesmaCoordenada(c: CamposDeCoordenada, g: Coordenada | null): boolean {
  const l = lerCamposDeCoordenada(c)
  if (!l.ok) return false
  return l.coordenada === null ? g === null : g !== null && l.coordenada.lat === g.lat && l.coordenada.lon === g.lon
}

const mesmoPar = (a: Coordenada | null, b: Coordenada | null) => (a === null ? b === null : b !== null && a.lat === b.lat && a.lon === b.lon)

const dosCampos = (c: Coordenada | null): CamposDeCoordenada => ({ lat: c ? comoTexto(c.lat) : '', lon: c ? comoTexto(c.lon) : '' })

/**
 * A coordenada em correção (Sitio.dc.html): Latitude e Longitude (graus decimais, com vírgula ou ponto), "No livro: …" ao lado,
 * "Voltar à coordenada do livro" (ou "Tirar a coordenada", num sítio novo). Sem mapa nem rede: a coordenada é digitada ou
 * colada (a escolha no mapa é da 2C, que precisa de tiles e de mudar a CSP).
 *
 * Grava como os outros campos da tela: ao sair de um campo, se os dois formam uma coordenada válida e diferente da de agora
 * (o par num evento só). Nada se perde em silêncio:
 * - um par pela metade ou inválido fica num RASCUNHO (síncrono, por sítio): fechar «Corrigir» ou sair da página não o apaga, a
 *   página do sítio avisa e «Corrigir» o traz de volta, com «Descartar o rascunho»;
 * - um par válido que ainda está no campo quando a tela se fecha é gravado ao fechar;
 * - colar ou digitar uma coordenada inteira num campo preenche os dois, ou mostra o motivo da recusa (ambígua, fora da
 *   faixa, link curto do Google que não se lê sem a internet).
 * «Salvar a coordenada» continua, para quem quer gravar de propósito.
 *
 * O rascunho NÃO sai quando a gravação começa (T17-B-13: um par que só vive na memória se perde se o iOS encerra o processo ali):
 * a página só deixa de avisar enquanto a gravação está em andamento (`comecarAGravarACoordenada`), e o rascunho sai quando ela
 * termina, SÓ se ninguém mexeu nele desde que o par foi escrito. Se falha, o rascunho fica, com o par que a pessoa escreveu.
 *
 * Uma coordenada que chega de outro aparelho com «Corrigir» aberto (`atual` muda): os campos que a pessoa não mexeu desde que
 * abriram, ou desde a última gravação, acompanham o valor novo; os que ela mexeu ficam como ela escreveu. Só grava ao sair
 * quem mexeu: sair do campo sem mudar nada não grava o valor antigo da tela por cima do que chegou.
 */
export function CoordenadaDoSitio({ id, atual, doLivro, corrigida, ehDoLivro }: { id: string; atual: Coordenada | null; doLivro: Coordenada | null; corrigida: boolean; ehDoLivro: boolean }) {
  const uid = useId()
  const [inicio] = useState(() => {
    const r = lerRascunhoDaCoordenada(id)
    return r && !mesmaCoordenada(r, atual) ? { campos: r, recuperado: true } : { campos: dosCampos(atual), recuperado: false }
  })
  const [campos, setCampos] = useState<CamposDeCoordenada>(inicio.campos)
  const [recuperado, setRecuperado] = useState(inicio.recuperado)
  const [erro, setErro] = useState<{ texto: string; campo: 'lat' | 'lon' } | null>(null)
  const [salvo, setSalvo] = useState(false)
  const agora = useRef(inicio.campos) // o que está nos campos (síncrono)
  const guardada = useRef<Coordenada | null>(atual) // a coordenada gravada de que os campos partiram
  const armazenada = useRef<Coordenada | null>(atual) // a que está guardada de verdade agora (a de `atual`)
  const tocado = useRef({ lat: inicio.recuperado, lon: inicio.recuperado }) // campos que a pessoa mexeu desde que abriram ou da última gravação
  const pares = useRef<HTMLDivElement>(null)

  const mudar = (c: Partial<CamposDeCoordenada>) => {
    const novo = { ...agora.current, ...c }
    agora.current = novo
    if ('lat' in c) tocado.current.lat = true
    if ('lon' in c) tocado.current.lon = true
    // T17-B-14: um campo digitado de volta ao número guardado deixa de contar como mexido (não grava o valor velho por cima do que chega de fora).
    const g = guardada.current
    for (const campo of ['lat', 'lon'] as const) {
      if (!(campo in c) || !g) continue
      const lido = campo === 'lat' ? lerLatitude(novo.lat) : lerLongitude(novo.lon)
      if (lido.ok && lido.valor === g[campo]) tocado.current[campo] = false
    }
    setCampos(novo)
    setErro(null)
    setSalvo(false)
    if (mesmaCoordenada(novo, guardada.current)) apagarRascunhoDaCoordenada(id)
    else guardarRascunhoDaCoordenada(id, novo)
  }
  const falhou = () => setErro({ texto: MSG_FALHOU, campo: 'lat' })
  const ultimaGravacao = useRef<Coordenada | null>(null) // a gravação mais recente começada aqui (só `gravar` a muda; T17-B-15)
  const gravar = (c: Coordenada) => {
    guardada.current = c
    ultimaGravacao.current = c
    tocado.current = { lat: false, lon: false }
    // O rascunho fica até a gravação terminar (T17-B-13). `versao` é a dele agora, depois da última escrita do par: se a pessoa
    // escrever mais (um rascunho mais novo), esta gravação ao terminar não o apaga.
    const versao = versaoDoRascunhoDaCoordenada(id)
    const fim = comecarAGravarACoordenada(id)
    setRecuperado(false)
    corrigirCoordenada(id, c).then(
      () => {
        apagarRascunhoDaCoordenadaSeVersao(id, versao)
        fim()
        if (ultimaGravacao.current === c) setSalvo(true)
      },
      () => {
        fim()
        if (ultimaGravacao.current !== c) return // uma gravação mais nova tomou o lugar
        guardada.current = armazenada.current
        tocado.current = { lat: true, lon: true }
        // Uma chegada de fora pode ter trocado os campos pelo valor novo enquanto isto gravava: o par que a pessoa escreveu
        // volta para a tela e para o rascunho (a menos que ela já tenha escrito outra coisa depois).
        if (mesmaCoordenada(agora.current, c) || mesmaCoordenada(agora.current, armazenada.current)) {
          const volta = dosCampos(c)
          agora.current = volta
          setCampos(volta)
        }
        if (!mesmaCoordenada(agora.current, guardada.current)) guardarRascunhoDaCoordenada(id, agora.current)
        falhou()
      },
    )
  }
  /** Os dois campos formam uma coordenada válida e nova, e a pessoa mexeu neles? Grava. Devolve se havia um par válido. */
  const gravarSePar = (c: CamposDeCoordenada): boolean => {
    const l = lerCamposDeCoordenada(c)
    if (!l.ok || l.coordenada === null) return false
    if ((tocado.current.lat || tocado.current.lon) && !mesmaCoordenada(c, guardada.current)) gravar(l.coordenada)
    return true
  }

  const colar = (campo: 'lat' | 'lon') => (e: ClipboardEvent<HTMLInputElement>) => {
    const r = aoColarCoordenada(e)
    if (!r) return
    if ('campos' in r) {
      mudar(r.campos)
      gravarSePar(r.campos)
    } else setErro({ texto: r.erro, campo })
  }
  // Passar da latitude para a longitude (ou ao contrário) não grava: só sair do par, para não gravar a metade que já mudou.
  const aoSair = (campo: 'lat' | 'lon', e: FocusEvent<HTMLInputElement>) => {
    const dentro = e.relatedTarget instanceof Node && pares.current?.contains(e.relatedTarget) === true
    const c = agora.current
    const texto = c[campo]
    const r = resolverTextoDeCoordenada(texto)
    if (r && 'campos' in r) {
      mudar(r.campos)
      gravarSePar({ ...c, ...r.campos }) // o par inteiro foi escrito de uma vez: não é meia edição
      return
    }
    if (r) return setErro({ texto: r.erro, campo })
    if (texto.trim() === '') return // falta este campo: o rascunho guarda o outro
    const lido = campo === 'lat' ? lerLatitude(texto) : lerLongitude(texto)
    if (!lido.ok) return setErro({ texto: lido.erro, campo })
    if (!dentro) gravarSePar(c)
  }
  const salvar = () => {
    const r = lerCamposDeCoordenada(agora.current)
    if (!r.ok) return setErro({ texto: r.erro, campo: r.campo })
    if (r.coordenada === null) return setErro({ texto: ehDoLivro ? 'Escreva a latitude e a longitude, ou use «Voltar à coordenada do livro».' : 'Escreva a latitude e a longitude, ou use «Tirar a coordenada».', campo: 'lat' })
    if (mesmaCoordenada(agora.current, guardada.current)) {
      apagarRascunhoDaCoordenada(id)
      setSalvo(true)
    } else gravar(r.coordenada)
  }
  const poOsCampos = (c: CamposDeCoordenada) => {
    agora.current = c
    setCampos(c)
    setErro(null)
    setRecuperado(false)
    apagarRascunhoDaCoordenada(id)
  }
  const tirar = () => {
    const alvo = ehDoLivro ? doLivro : null
    poOsCampos(dosCampos(alvo))
    setSalvo(false)
    const anterior = guardada.current
    guardada.current = alvo
    const p = ehDoLivro ? voltarAoLivro(id, ['lat', 'lon']) : corrigirCoordenada(id, null)
    p.catch(() => {
      guardada.current = anterior
      falhou()
    })
  }
  const descartar = () => {
    poOsCampos(dosCampos(guardada.current))
    tocado.current = { lat: false, lon: false }
  }

  // Uma coordenada nova em `atual` (chegou de outro aparelho): os campos que a pessoa não mexeu a acompanham.
  useEffect(() => {
    armazenada.current = atual
    if (mesmoPar(atual, guardada.current)) return // a primeira vez, ou a gravação da própria pessoa que voltou
    guardada.current = atual
    const d = dosCampos(atual)
    const novo = { lat: tocado.current.lat ? agora.current.lat : d.lat, lon: tocado.current.lon ? agora.current.lon : d.lon }
    agora.current = novo
    setCampos(novo)
    setErro(null)
    if (mesmaCoordenada(novo, atual)) apagarRascunhoDaCoordenada(id)
    else if (tocado.current.lat || tocado.current.lon) guardarRascunhoDaCoordenada(id, novo)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só o valor da coordenada conta, não o objeto
  }, [atual?.lat, atual?.lon])

  // Fechar «Corrigir» ou sair da página com um par válido ainda no campo (sem ter saído dele): grava. O rascunho fica até a
  // gravação terminar (a página não avisa nesse meio tempo); se ela falhar, ele já está lá.
  useEffect(
    () => () => {
      const c = agora.current
      if (!(tocado.current.lat || tocado.current.lon) || mesmaCoordenada(c, guardada.current)) return
      const l = lerCamposDeCoordenada(c)
      if (!l.ok || l.coordenada === null) return
      guardarRascunhoDaCoordenada(id, c)
      const versao = versaoDoRascunhoDaCoordenada(id)
      const fim = comecarAGravarACoordenada(id)
      corrigirCoordenada(id, l.coordenada).then(
        () => {
          apagarRascunhoDaCoordenadaSeVersao(id, versao)
          fim()
        },
        fim,
      )
    },
    [id],
  )

  const invalido = (c: 'lat' | 'lon') => erro?.campo === c
  return (
    <section className="sitio-coordenada-edicao" role="region" aria-label="Coordenada, em correção">
      <h3>Coordenada</h3>
      {recuperado && (
        <div className="novo-recuperado" role="status" aria-label="Rascunho da coordenada recuperado">
          <span>Rascunho recuperado: a coordenada que você escreveu aqui ainda não foi salva.</span>
          <button type="button" className="novo-link" onClick={descartar}>
            Descartar o rascunho
          </button>
        </div>
      )}
      <div className="sitio-coordenada-pares" ref={pares}>
        <div className="form-campo">
          <label htmlFor={`${uid}-lat`}>Latitude</label>
          <input id={`${uid}-lat`} type="text" inputMode="decimal" autoComplete="off" value={campos.lat} aria-invalid={invalido('lat') || undefined} aria-describedby={`${uid}-ajuda`} onChange={(e) => mudar({ lat: e.target.value })} onPaste={colar('lat')} onBlur={(e) => aoSair('lat', e)} />
        </div>
        <div className="form-campo">
          <label htmlFor={`${uid}-lon`}>Longitude</label>
          <input id={`${uid}-lon`} type="text" inputMode="decimal" autoComplete="off" value={campos.lon} aria-invalid={invalido('lon') || undefined} aria-describedby={`${uid}-ajuda`} onChange={(e) => mudar({ lon: e.target.value })} onPaste={colar('lon')} onBlur={(e) => aoSair('lon', e)} />
        </div>
      </div>
      <span id={`${uid}-ajuda`} className="form-ajuda">
        Graus decimais, com vírgula ou ponto. Cole «31,77; 35,21» ou um link do OpenStreetMap ou do Google Maps num dos campos e os dois se preenchem. Grava ao sair do campo, quando os dois estão certos.
      </span>
      {erro && (
        <p className="form-erro" role="alert">
          {erro.texto}
        </p>
      )}
      {ehDoLivro && doLivro && <span className="form-ajuda">No livro: {coordenadaEmGraus(doLivro.lat, doLivro.lon, 5)}</span>}
      {salvo && <p role="status">Coordenada guardada.</p>}
      <div className="sitio-acoes">
        {(corrigida || !ehDoLivro) && atual !== null && (
          <button type="button" className="form-botao" onClick={tirar}>
            {ehDoLivro ? 'Voltar à coordenada do livro' : 'Tirar a coordenada'}
          </button>
        )}
        <button type="button" className="form-botao form-botao-forte" onClick={salvar}>
          Salvar a coordenada
        </button>
      </div>
    </section>
  )
}
