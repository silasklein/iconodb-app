import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { normalizarForma } from '../glossario/modelo'
import { lerLatitude, lerLongitude } from '../telas/coordenada'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { AvisoDeSitioParecido } from './AvisoDeSitioParecido'
import { aoColarCoordenada, lerCamposDeCoordenada, resolverTextoDeCoordenada } from './CorrigirSitio'
import { sitiosComEsteNome, useCorrecoesDosSitios, useSitiosParaComparar, useSitiosSkc } from './doUsuario'
import { chaveDoNome } from './modelo'
import { criarSitio, pedidoDeFicha, pedidoDeTroca, reservarIdDoSitio } from './operacoes'
import { useSitiosDoPacote } from './pacote'
import {
  apagarRascunhoDoSitio,
  CHAVE_DO_RASCUNHO_DO_SITIO,
  guardarRascunhoDoSitio,
  lerRascunhoDoSitio,
  mesmoConteudoDoSitio,
  paraValido,
  rascunhoTemConteudo,
  rascunhoVazio,
  type RascunhoDoSitio,
} from './rascunho'
import '../objetos-skc/Formulario.css'
import '../telas/NovoObjeto.css'
import '../imagens-usuario/MarcaSkc.css'
import './Sitios.css'

const MSG_SEM_NOME = 'Dê um nome ao sítio.'
const MSG_FALHOU = 'Não foi possível registrar o sítio neste aparelho; tente de novo. O que você preencheu continua aqui.'

const eObjetoSkcRef = (ref: string) => /^OB-/.test(ref)

/**
 * O rascunho com que a tela abre: o guardado, ou o do endereço (`?nome=` e `?para=`, de "Novo sítio com mais dados…" na ficha de um objeto).
 * Com os dois, e o guardado diferente, mantém o guardado e PERGUNTA (`pergunta`): nada que a pessoa escreveu é trocado sozinho.
 */
function abrir(nomeDoEndereco: string, paraDoEndereco: string | null): { rascunho: RascunhoDoSitio; recuperado: boolean; pergunta: RascunhoDoSitio | null } {
  const guardado = lerRascunhoDoSitio()
  const tem = guardado !== null && rascunhoTemConteudo(guardado)
  if (nomeDoEndereco === '' && paraDoEndereco === null) return { rascunho: tem ? guardado : rascunhoVazio(), recuperado: tem, pergunta: null }
  const doEndereco: RascunhoDoSitio = { ...rascunhoVazio(), nome: normalizarForma(nomeDoEndereco), para: paraDoEndereco }
  if (!tem) return { rascunho: doEndereco, recuperado: false, pergunta: null }
  const igual = chaveDoNome(guardado.nome) === chaveDoNome(doEndereco.nome) && guardado.para === doEndereco.para
  return igual ? { rascunho: guardado, recuperado: true, pergunta: null } : { rascunho: guardado, recuperado: true, pergunta: doEndereco }
}

/**
 * "Novo sítio · SKC" (NovoSitio.dc.html no celular, PC-NovoSitio.dc.html no computador): nome, outras grafias, região ou país,
 * coordenada (digitada ou colada: «31,77; 35,21», um link do OpenStreetMap ou do Google Maps; sem mapa dentro do app, que
 * precisaria de tiles da internet e de mudar a CSP: a escolha no mapa é da 2C) e nota. O sítio entra na camada do usuário e já
 * pode ser escolhido na ficha de qualquer objeto.
 *
 * - Nada se perde: cada mudança vai ao rascunho na hora (src/sitios/rascunho.ts). Esc e o × fecham e deixam o rascunho.
 * - Nome ou grafia iguais (pela dobra) aos de outro sítio avisam, com o link para o existente; não bloqueiam.
 * - "Registrar sítio" (Ctrl/⌘+Enter) cria o sítio; vindo de um objeto (`?para=`), liga o objeto a ele na MESMA gravação.
 */
export function NovoSitio() {
  const [params] = useSearchParams()
  const navegar = useNavigate()
  const comeco = useMemo(() => abrir(params.get('nome') ?? '', paraValido(params.get('para'))), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [r, setR] = useState<RascunhoDoSitio>(comeco.rascunho)
  const atual = useRef(r)
  const [recuperado, setRecuperado] = useState(comeco.recuperado && comeco.pergunta === null)
  const [pergunta, setPergunta] = useState<RascunhoDoSitio | null>(comeco.pergunta)
  const [outraAba, setOutraAba] = useState<RascunhoDoSitio | null>(null)
  const emConflito = useRef(false)
  const [grafia, setGrafia] = useState('')
  const [erro, setErro] = useState<{ texto: string; campo: 'nome' | 'lat' | 'lon' | 'geral' } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const salvandoAgora = useRef(false)
  const apagado = useRef(false)
  const raiz = useRef<HTMLFormElement>(null)
  const nome = useRef<HTMLInputElement>(null)
  const lat = useRef<HTMLInputElement>(null)
  const lon = useRef<HTMLInputElement>(null)
  const uid = useId()

  const todos = useSitiosParaComparar()
  const doPacote = useSitiosDoPacote()
  const novos = useSitiosSkc()
  const correcoes = useCorrecoesDosSitios()

  // Cada mudança vai ao rascunho na mesma tarefa (síncrono): um recarregar logo em seguida não perde nada.
  const mudar = useCallback((f: (x: RascunhoDoSitio) => RascunhoDoSitio) => {
    const novo = f(atual.current)
    atual.current = novo
    if (!emConflito.current && !apagado.current) guardarRascunhoDoSitio(novo)
    setR(novo)
  }, [])
  useEffect(() => {
    guardarRascunhoDoSitio(atual.current) // o que veio do endereço (?nome=) já é rascunho
    document.title = 'Novo sítio · IconoDB'
  }, [])

  // Outra aba mudou o rascunho com este formulário aberto: até a pessoa escolher, nada daqui é gravado por cima.
  useEffect(() => {
    const ouvir = (e: StorageEvent) => {
      if (e.key !== null && e.key !== CHAVE_DO_RASCUNHO_DO_SITIO) return
      const outro = lerRascunhoDoSitio()
      if (!outro || mesmoConteudoDoSitio(outro, atual.current)) return
      emConflito.current = true
      setOutraAba(outro)
    }
    window.addEventListener('storage', ouvir)
    return () => window.removeEventListener('storage', ouvir)
  }, [])
  const resolverConflito = (usar: RascunhoDoSitio | null) => {
    emConflito.current = false
    setOutraAba(null)
    if (usar) {
      atual.current = usar
      setR(usar)
    }
    guardarRascunhoDoSitio(atual.current)
  }

  const regioes = useMemo(() => {
    const nomes = new Map<string, string>()
    const ver = (t: string | null | undefined) => {
      const x = t ? normalizarForma(t) : ''
      if (x !== '' && !nomes.has(chaveDoNome(x))) nomes.set(chaveDoNome(x), x)
    }
    for (const s of doPacote?.values() ?? []) ver(s.regiao?.nome)
    for (const c of correcoes.values()) ver(c.regiao)
    for (const s of novos) ver(s.regiao)
    return [...nomes.values()].sort((a, b) => a.localeCompare(b, 'pt'))
  }, [doPacote, correcoes, novos])

  const parecidosDoNome = sitiosComEsteNome(todos, r.nome)
  const parecidosDaGrafia = sitiosComEsteNome(todos, grafia)

  const acrescentarGrafia = () => {
    const nova = normalizarForma(grafia)
    setGrafia('')
    if (nova === '') return
    mudar((x) => (x.variantes.some((v) => chaveDoNome(v) === chaveDoNome(nova)) || chaveDoNome(x.nome) === chaveDoNome(nova) ? x : { ...x, variantes: [...x.variantes, nova] }))
  }

  const conferirAoSair = (campo: 'lat' | 'lon') => {
    const valor = campo === 'lat' ? atual.current.lat : atual.current.lon
    if (valor.trim() === '') return // vazio: o que a colagem recusada disse continua à vista até a pessoa escrever
    // O par inteiro digitado num campo só: preenche os dois, ou diz o que está errado (ambíguo, fora da faixa, link…).
    const inteira = resolverTextoDeCoordenada(valor)
    if (inteira && 'campos' in inteira) {
      mudar((x) => ({ ...x, ...inteira.campos }))
      return setErro(null)
    }
    if (inteira) return setErro({ texto: inteira.erro, campo })
    const lido = campo === 'lat' ? lerLatitude(valor) : lerLongitude(valor)
    setErro(lido.ok ? (e) => (e && e.campo === campo ? null : e) : { texto: lido.erro, campo })
  }
  const colar = (campo: 'lat' | 'lon') => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const r = aoColarCoordenada(e)
    if (!r) return
    if ('campos' in r) {
      mudar((x) => ({ ...x, ...r.campos }))
      setErro(null)
    } else setErro({ texto: r.erro, campo })
  }

  const fechar = () => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    void navegar(atual.current.para ? `/item/${encodeURIComponent(atual.current.para)}` : '/sitios')
  }

  const registrar = async (e?: FormEvent) => {
    e?.preventDefault()
    if (salvandoAgora.current) return
    const x = atual.current
    const nomeLimpo = normalizarForma(x.nome)
    if (nomeLimpo === '') {
      setErro({ texto: MSG_SEM_NOME, campo: 'nome' })
      nome.current?.focus()
      return
    }
    const coordenada = lerCamposDeCoordenada(x)
    if (!coordenada.ok) {
      setErro({ texto: coordenada.erro, campo: coordenada.campo })
      ;(coordenada.campo === 'lat' ? lat : lon).current?.focus()
      return
    }
    // Uma grafia ainda no campo, sem Enter, entra (nada se perde).
    const pendente = normalizarForma(grafia)
    const variantes = pendente !== '' ? [...x.variantes, pendente] : x.variantes
    setErro(null)
    salvandoAgora.current = true
    setSalvando(true)
    try {
      const id = x.reserva ?? (await reservarIdDoSitio())
      if (!x.reserva) mudar((y) => ({ ...y, reserva: id }))
      await criarSitio(
        { nome: nomeLimpo, variantes, regiao: x.regiao, coordenada: coordenada.coordenada, nota: x.nota },
        {
          id,
          junto: x.para ? (sid, n) => [eObjetoSkcRef(x.para!) ? pedidoDeFicha(x.para!, sid, n) : pedidoDeTroca(x.para!, sid, n)] : undefined,
        },
      )
      apagado.current = true
      apagarRascunhoDoSitio()
      void navegar(x.para ? `/item/${encodeURIComponent(x.para)}` : `/sitio/${encodeURIComponent(id)}`, { replace: true })
    } catch {
      salvandoAgora.current = false
      setSalvando(false)
      setErro({ texto: MSG_FALHOU, campo: 'geral' })
    }
  }

  const teclar = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.nativeEvent.isComposing) return
    const alvo = e.target as HTMLElement
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        void registrar()
      } else if (alvo.tagName === 'INPUT') {
        // Enter num campo não envia o formulário (a grafia usa Enter para acrescentar).
        e.preventDefault()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      fechar()
    }
  }

  const descartar = () => {
    apagarRascunhoDoSitio()
    const vazio = { ...rascunhoVazio(), para: atual.current.para }
    atual.current = vazio
    setR(vazio)
    setGrafia('')
    setRecuperado(false)
    setErro(null)
  }

  const idErro = `${uid}-erro`
  const doNome = erro?.campo === 'nome'
  const erroNaCoordenada = erro?.campo === 'lat' || erro?.campo === 'lon'

  return (
    <div className="novo-objeto novo-sitio">
      <TopoDoCelular voltar={{ href: r.para ? `#/item/${encodeURIComponent(r.para)}` : '#/sitios', rotulo: 'Fechar (o rascunho fica guardado)' }} busca={false} />
      <form ref={raiz} onSubmit={(e) => void registrar(e)} onKeyDown={teclar} noValidate aria-labelledby={`${uid}-titulo`}>
        <header className="novo-cabecalho">
          <h1 id={`${uid}-titulo`}>
            Novo sítio <span className="novo-skc">SKC</span>
          </h1>
          <p className="novo-apoio">Entra na sua camada e já pode ser escolhido na ficha de qualquer objeto.</p>
        </header>
        <div className="novo-corpo">
          {pergunta && (
            <div className="novo-recuperado sitio-pergunta" role="alert" aria-label="Há um rascunho guardado">
              <span>Há um rascunho de sítio guardado («{r.nome}»). Ele continua aqui.</span>
              <button type="button" className="novo-link" onClick={() => setPergunta(null)}>
                Continuar o rascunho
              </button>
              <button
                type="button"
                className="novo-link"
                onClick={() => {
                  atual.current = pergunta
                  guardarRascunhoDoSitio(pergunta)
                  setR(pergunta)
                  setPergunta(null)
                  setRecuperado(false)
                }}
              >
                Começar um novo com «{pergunta.nome}»
              </button>
            </div>
          )}
          {outraAba && (
            <div className="novo-recuperado sitio-pergunta" role="alert" aria-label="Rascunho de outra aba">
              <span>Outra aba mudou o rascunho («{outraAba.nome}»). Qual fica?</span>
              <button type="button" className="novo-link" onClick={() => resolverConflito(outraAba)}>
                Usar o da outra aba
              </button>
              <button type="button" className="novo-link" onClick={() => resolverConflito(null)}>
                Manter o desta aba
              </button>
            </div>
          )}
          {recuperado && !pergunta && (
            <div className="novo-recuperado" role="status" aria-label="Rascunho recuperado">
              <span>Rascunho recuperado: o que você tinha preenchido neste aparelho voltou.</span>
              <button type="button" className="novo-link" onClick={descartar}>
                Descartar o rascunho
              </button>
            </div>
          )}
          {r.para && (
            <p className="form-ajuda">
              {eObjetoSkcRef(r.para) ? 'Ao registrar, o objeto SKC passa a ter este sítio.' : `Ao registrar, o objeto ${r.para} passa a ter este sítio; o dado do livro continua guardado.`}
            </p>
          )}

          <section className="form-secao" aria-label="Dados do sítio">
            <div className="form-campo">
              <label htmlFor={`${uid}-nome`}>Nome</label>
              <input
                ref={nome}
                id={`${uid}-nome`}
                type="text"
                autoComplete="off"
                value={r.nome}
                aria-invalid={doNome || undefined}
                aria-describedby={[doNome ? idErro : '', `${uid}-nome-ajuda`].filter(Boolean).join(' ')}
                onChange={(e) => {
                  mudar((x) => ({ ...x, nome: e.target.value }))
                  setErro((x) => (x?.campo === 'nome' ? null : x))
                }}
              />
              <span id={`${uid}-nome-ajuda`} className="form-ajuda">
                Ao digitar, o app compara com os sítios e as grafias; se achar um igual, mostra aqui para abrir em vez de duplicar.
              </span>
              <AvisoDeSitioParecido parecidos={parecidosDoNome} quando="novo" />
              {doNome && (
                <p id={idErro} className="form-erro" role="alert">
                  <Icon name="aviso" size={16} />
                  {erro!.texto}
                </p>
              )}
            </div>

            <div className="form-campo">
              <label htmlFor={`${uid}-grafia`}>
                Outras grafias <span className="form-apoio">(opcional)</span>
              </label>
              {r.variantes.length > 0 && (
                <ul className="sitio-grafias" aria-label="Outras grafias do sítio">
                  {r.variantes.map((v) => (
                    <li key={v} className="sitio-grafia">
                      {v}
                      <IconButton icon="fechar" label={`Tirar a grafia ${v}`} size={16} tipPosition="start" onClick={() => mudar((x) => ({ ...x, variantes: x.variantes.filter((y) => y !== v) }))} />
                    </li>
                  ))}
                </ul>
              )}
              <input
                id={`${uid}-grafia`}
                type="text"
                autoComplete="off"
                placeholder="outra grafia + Enter"
                value={grafia}
                aria-describedby={`${uid}-grafia-ajuda`}
                onChange={(e) => setGrafia(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    acrescentarGrafia()
                  }
                }}
                onBlur={acrescentarGrafia}
              />
              <span id={`${uid}-grafia-ajuda`} className="form-ajuda">
                Formas antigas, modernas, árabes, hebraicas ou de outros livros. Entram na busca.
              </span>
              <AvisoDeSitioParecido parecidos={parecidosDaGrafia} quando="novo" />
            </div>

            <div className="form-campo">
              <label htmlFor={`${uid}-regiao`}>
                Região ou país <span className="form-apoio">(opcional)</span>
              </label>
              <input id={`${uid}-regiao`} type="text" autoComplete="off" value={r.regiao} onChange={(e) => mudar((x) => ({ ...x, regiao: e.target.value }))} />
              {regioes.length > 0 && (
                <div role="group" aria-label="Regiões existentes" className="sitio-regioes">
                  {regioes.map((g) => (
                    <button key={g} type="button" className="sitio-regiao-opcao" aria-pressed={chaveDoNome(r.regiao) === chaveDoNome(g)} onClick={() => mudar((x) => ({ ...x, regiao: g }))}>
                      {g}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <fieldset className="form-campo sitio-coordenada-campos">
              <legend className="form-legenda">
                Coordenada <span className="form-apoio">(opcional)</span>
              </legend>
              <div className="sitio-coordenada-pares">
                <div className="form-campo">
                  <label htmlFor={`${uid}-lat`}>Latitude</label>
                  <input
                    ref={lat}
                    id={`${uid}-lat`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={r.lat}
                    aria-invalid={erro?.campo === 'lat' || undefined}
                    aria-describedby={`${uid}-coord-ajuda${erroNaCoordenada ? ` ${idErro}` : ''}`}
                    onChange={(e) => {
                      mudar((x) => ({ ...x, lat: e.target.value }))
                      setErro((x) => (x?.campo === 'lat' ? null : x))
                    }}
                    onPaste={colar('lat')}
                    onBlur={() => conferirAoSair('lat')}
                  />
                </div>
                <div className="form-campo">
                  <label htmlFor={`${uid}-lon`}>Longitude</label>
                  <input
                    ref={lon}
                    id={`${uid}-lon`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="ex.: 35,32897"
                    value={r.lon}
                    aria-invalid={erro?.campo === 'lon' || undefined}
                    aria-describedby={`${uid}-coord-ajuda${erroNaCoordenada ? ` ${idErro}` : ''}`}
                    onChange={(e) => {
                      mudar((x) => ({ ...x, lon: e.target.value }))
                      setErro((x) => (x?.campo === 'lon' ? null : x))
                    }}
                    onPaste={colar('lon')}
                    onBlur={() => conferirAoSair('lon')}
                  />
                </div>
              </div>
              <span id={`${uid}-coord-ajuda`} className="form-ajuda">
                Graus decimais (norte e leste positivos), com vírgula ou ponto. Cole «31,77; 35,21», um link do OpenStreetMap ou um do Google Maps num dos campos e os dois se preenchem. Escolher no mapa: na próxima versão (precisa de internet).
              </span>
              {erroNaCoordenada && (
                <p id={idErro} className="form-erro" role="alert">
                  <Icon name="aviso" size={16} />
                  {erro!.texto}
                </p>
              )}
            </fieldset>

            <div className="form-campo">
              <label htmlFor={`${uid}-nota`}>
                Nota <span className="form-apoio">(opcional)</span>
              </label>
              <textarea id={`${uid}-nota`} value={r.nota} placeholder="de onde vem a coordenada, dúvidas, bibliografia…" onChange={(e) => mudar((x) => ({ ...x, nota: e.target.value }))} />
            </div>
          </section>

          {erro?.campo === 'geral' && (
            <p className="form-erro novo-erro-geral" role="alert">
              <Icon name="aviso" size={16} />
              {erro.texto}
            </p>
          )}
          <div className="novo-pe">
            <div className="novo-acoes-pe">
              <button type="submit" className="form-botao form-botao-forte" aria-busy={salvando || undefined}>
                <Icon name="confirmar" size={18} />
                {salvando ? 'Registrando…' : 'Registrar sítio'}
              </button>
            </div>
            <span className="form-nota">Fica na sua camada (SKC) e já pode ser escolhido na ficha de qualquer objeto.</span>
          </div>
        </div>
      </form>
    </div>
  )
}
