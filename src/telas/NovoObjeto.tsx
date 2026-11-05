import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { obras } from '../banco/consultas'
import { CampoDaNota, type FonteDoCampo } from '../notas/CampoDaNota'
import { CampoDeEscolha, type OpcaoDeEscolha } from '../objetos-skc/CampoDeEscolha'
import { EscolhaDoPeriodo, type ManejoDoPeriodo } from '../objetos-skc/EscolhaDoPeriodo'
import { ImagensDoNovo, type ImagemDoNovo } from '../objetos-skc/ImagensDoNovo'
import { useNumeracao } from '../objetos-skc/atual'
import { fichaVazia, type CampoDeTexto, type FichaSkc } from '../objetos-skc/modelo'
import { formatarNumero, nomeDoPeriodo, textoDoNrSkc, type CodigoDePeriodo } from '../objetos-skc/numeracao'
import { completarObjeto, salvarObjeto } from '../objetos-skc/operacoes'
import { useNumerosDoPacote } from '../objetos-skc/pacote'
import { apagarArquivoDoRascunho, apagarRascunhoDoNovo, guardarRascunhoDoNovo, lerRascunhoDoNovo, rascunhoTemConteudo } from '../objetos-skc/rascunhoDoNovo'
import { eSitioNovoEscolhido, nomeDoSitioNovoEscolhido, useEscolhaDeSitio } from '../sitios/escolha'
import { Icon } from '../ui/Icon'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import '../objetos-skc/Formulario.css'
import './NovoObjeto.css'

export const MSG_SEM_PERIODO = 'Escolha o período para dar o número.'
const MSG_IMAGEM_NAO_ABRE = 'Tire da lista (ou troque) a imagem que não abre neste aparelho.'
const MSG_IMAGEM_PREPARANDO = 'Espere as imagens ficarem prontas (alguns segundos) e salve de novo.'
const MSG_FALHOU = 'Não foi possível salvar o objeto neste aparelho; tente de novo. O que você preencheu continua aqui.'

/** O estado do objeto que vai salvar com a tela da pessoa: o que se preenche, o rascunho e as imagens. */
interface Formulario {
  ficha: FichaSkc
  naoSei: boolean
  /** O objeto já gravado por um salvar que foi interrompido (só faltam imagens): nunca cria outro. */
  criado: string | null
  /** "Novo sítio «…»" foi escolhido no campo Sítio: salvar cria o sítio com o nome da ficha, na mesma gravação do objeto. */
  sitioNovo: boolean
}

function inicial(): { form: Formulario; imagens: ImagemDoNovo[]; recuperado: boolean } {
  const r = lerRascunhoDoNovo()
  if (!r) return { form: { ficha: fichaVazia(), naoSei: false, criado: null, sitioNovo: false }, imagens: [], recuperado: false }
  return {
    form: { ficha: r.ficha, naoSei: r.naoSei, criado: r.criado, sitioNovo: r.sitioNovo },
    imagens: r.imagens.map((i) => ({ ...i, arquivo: null, fase: 'preparando' as const, aberta: false })),
    recuperado: rascunhoTemConteudo(r),
  }
}

/**
 * Criar um objeto SKC (NovoObjeto.dc.html no celular, PC-NovoObjeto.dc.html no computador; decisões 30 e 34): imagens,
 * período e número, ficha, origem (publicação ou achado recente) e leitura SKC com `[[`.
 *
 * - Nada se perde antes do primeiro "Salvar": cada mudança vai na hora ao rascunho (localStorage; os arquivos das
 *   imagens ao IndexedDB). Recarregar a página traz tudo de volta.
 * - Sem período escolhido, "Salvar objeto" mostra o erro em linha e leva o foco aos períodos (o botão nunca é
 *   desabilitado). "Ainda não sei" salva um rascunho sem número, que fica na Revisão.
 * - O número mostrado é o próximo do período, provisório até a sincronização o confirmar (veja numeracao.ts).
 */
export function NovoObjeto() {
  const computador = useBreakpoint() === 'computador'
  const navegar = useNavigate()
  const comeco = useMemo(inicial, [])
  const [form, setForm] = useState<Formulario>(comeco.form)
  const [imagens, setImagens] = useState<ImagemDoNovo[]>(comeco.imagens)
  const [recuperado, setRecuperado] = useState(comeco.recuperado)
  const [erroDoPeriodo, setErroDoPeriodo] = useState(false)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const salvandoAgora = useRef(false)
  const periodo = useRef<ManejoDoPeriodo>(null)
  const idErroDoPeriodo = useId()
  const idNumero = useId()

  // Cada mudança vai ao rascunho, na mesma tarefa (síncrono): um recarregar logo em seguida não perde nada.
  const apagado = useRef(false)
  const guardar = useCallback((f: Formulario, i: ImagemDoNovo[]) => {
    if (apagado.current) return
    guardarRascunhoDoNovo({
      ficha: f.ficha,
      naoSei: f.naoSei,
      criado: f.criado,
      sitioNovo: f.sitioNovo,
      imagens: i.filter((x) => x.fase !== 'erro').map(({ chave, nome, tipo, legenda, credito, principal }) => ({ chave, nome, tipo, legenda, credito, principal })),
    })
  }, [])
  const ultimo = useRef({ form, imagens })
  const mudarForm = (m: (f: Formulario) => Formulario) => {
    const novo = m(ultimo.current.form)
    ultimo.current = { ...ultimo.current, form: novo }
    setForm(novo)
    guardar(novo, ultimo.current.imagens)
  }
  // Síncrono (não no atualizador do React): o rascunho no localStorage muda na mesma tarefa da mudança.
  const mudarImagens = useCallback(
    (m: (i: ImagemDoNovo[]) => ImagemDoNovo[]) => {
      const novas = m(ultimo.current.imagens)
      ultimo.current = { ...ultimo.current, imagens: novas }
      guardar(ultimo.current.form, novas)
      setImagens(novas)
    },
    [guardar],
  )
  const campo = (c: CampoDeTexto) => (t: string) => mudarForm((f) => ({ ...f, ficha: { ...f.ficha, [c]: t } }))
  const escolherPeriodo = (p: CodigoDePeriodo | null) => {
    setErroDoPeriodo(false)
    mudarForm((f) => ({ ...f, ficha: { ...f.ficha, periodo: p }, naoSei: p === null }))
  }

  // O número: o próximo do período (provisório até a sincronização confirmar).
  const numeracao = useNumeracao()
  const pacote = useNumerosDoPacote()
  const p = form.ficha.periodo
  const maior = p ? (numeracao.maiores.get(p) ?? 0) : 0
  const proximo = p && pacote ? formatarNumero(p, maior + 1) : null
  // E o SKC, Nr. (decisão 38): o próximo da coleção, dado no mesmo passo que o número.
  const proximoNrSkc = numeracao.maiorNrSkc + 1
  const ultimoNumero = p && maior > 0 ? formatarNumero(p, maior) : null
  const deQuem = !ultimoNumero
    ? null
    : numeracao.porNumero.has(ultimoNumero)
      ? 'SKC'
      : pacote?.has(ultimoNumero)
        ? 'de um livro'
        : numeracao.reservas.has(ultimoNumero)
          ? 'reservado para um livro'
          : 'SKC'

  // Sítios (do pacote e SKC, com o nome de agora) e obras (Bibliografia), para as sugestões. A última opção do Sítio é
  // "Novo sítio «…»" (Tarefa 12): cria um sítio do usuário com esse nome, na mesma gravação do objeto.
  const { opcoes: opcoesDeSitio, livre: sitioNovoLivre } = useEscolhaDeSitio()
  const cargaDasObras = useCarregar(() => obras(), 'obras')
  const opcoesDeObra = useMemo<OpcaoDeEscolha[]>(
    () => (cargaDasObras.fase === 'ok' ? cargaDasObras.dados.map((o) => ({ id: o.id, rotulo: o.curta ?? o.titulo ?? o.id, apoio: o.curta && o.titulo ? o.titulo : undefined })) : []),
    [cargaDasObras],
  )

  // A leitura: o campo das notas (Tarefa 6), com `[[`, sobre o estado do formulário.
  const fonteDaLeitura = useMemo<FonteDoCampo>(
    () => ({
      get texto() {
        return ultimo.current.form.ficha.leitura
      },
      mudar: (t: string) => campo('leitura')(t),
      descarregar: async () => undefined,
    }),
    [],
  )

  const rotuloDoSalvar = form.naoSei ? 'Salvar rascunho' : 'Salvar objeto'
  const salvar = async (e?: FormEvent) => {
    e?.preventDefault()
    if (salvandoAgora.current) return
    setErroGeral(null)
    const { ficha, naoSei, criado, sitioNovo } = ultimo.current.form
    if (!criado && !ficha.periodo && !naoSei) {
      setErroDoPeriodo(true)
      periodo.current?.focar()
      return
    }
    const lista = ultimo.current.imagens
    if (lista.some((i) => i.fase === 'erro')) return setErroGeral(MSG_IMAGEM_NAO_ABRE)
    if (lista.some((i) => i.fase === 'preparando')) return setErroGeral(MSG_IMAGEM_PREPARANDO)
    const semCredito = lista.filter((i) => i.credito.trim() === '')
    if (semCredito.length) {
      mudarImagens((l) => l.map((i) => (i.credito.trim() === '' ? { ...i, erroDoCredito: true, aberta: true } : i)))
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.novo-imagens input[aria-invalid="true"]')?.focus())
      return
    }
    salvandoAgora.current = true
    setSalvando(true)
    const imagensASalvar = lista.map((i) => ({ arquivo: i.processada ?? i.arquivo!, dados: { tipo: i.tipo ?? 'tons', legenda: i.legenda, credito: i.credito, principal: i.principal } }))
    // Cada imagem guardada sai do rascunho na hora; o id do objeto entra no rascunho logo depois do `criar`. Se a página
    // fechar no meio, o rascunho recuperado só guarda as imagens que faltam, no MESMO objeto.
    const aoGuardarImagem = (i: number) => {
      const chave = lista[i]!.chave
      mudarImagens((l) => l.filter((x) => x.chave !== chave))
      void apagarArquivoDoRascunho(chave)
    }
    try {
      const r = criado
        ? { id: criado, ...(await completarObjeto(criado, { imagens: imagensASalvar, aoGuardarImagem })) }
        : await salvarObjeto(naoSei ? { ...ficha, periodo: null } : ficha, {
            imagens: imagensASalvar,
            aoCriar: (id) => mudarForm((f) => ({ ...f, criado: id, sitioNovo: false })),
            aoGuardarImagem,
            sitioNovo: sitioNovo && ficha.sitio === '' && ficha.sitioNome.trim() !== '' ? ficha.sitioNome : null,
          })
      apagado.current = true
      await apagarRascunhoDoNovo()
      void navegar(`/item/${encodeURIComponent(r.id)}`, { replace: true, state: { objetoNovo: { imagensComErro: r.imagensComErro } } })
    } catch {
      salvandoAgora.current = false
      setSalvando(false)
      setErroGeral(MSG_FALHOU)
    }
  }
  const descartar = async () => {
    await apagarRascunhoDoNovo()
    const vazio = { ficha: fichaVazia(), naoSei: false, criado: null, sitioNovo: false }
    ultimo.current = { form: vazio, imagens: [] }
    setForm(vazio)
    setImagens([])
    setRecuperado(false)
  }
  useEffect(() => {
    document.title = 'Novo objeto · IconoDB'
  }, [])

  const f = form.ficha
  const botoes = (pe: boolean) => (
    <div className={pe ? 'novo-acoes-pe' : 'novo-acoes-topo'}>
      <Link to="/colecoes" className="form-botao">
        Cancelar
      </Link>
      <button type="submit" className="form-botao form-botao-forte" aria-busy={salvando || undefined}>
        <Icon name="confirmar" size={18} />
        {salvando ? 'Salvando…' : rotuloDoSalvar}
        {!salvando && !form.naoSei && proximo && (
          <>
            {' '}
            <span className="form-codigo">{proximo}</span>
          </>
        )}
      </button>
    </div>
  )

  const secaoDoPeriodo = (
    <section className="form-secao" aria-labelledby="novo-periodo-titulo">
      <h2 id="novo-periodo-titulo" className="form-secao-titulo">
        Período e número
      </h2>
      <div className="novo-periodo-e-numero">
        <div className="novo-periodo">
          <span className="form-legenda" id="novo-periodo-legenda">
            Período <span className="form-apoio">(obrigatório)</span>
          </span>
          <EscolhaDoPeriodo
            ref={periodo}
            valor={f.periodo}
            naoSei={form.naoSei}
            aoEscolher={escolherPeriodo}
            invalido={erroDoPeriodo}
            descritoPor={[erroDoPeriodo ? idErroDoPeriodo : '', idNumero].filter(Boolean).join(' ')}
          />
          {erroDoPeriodo && (
            <p id={idErroDoPeriodo} className="form-erro" role="alert">
              <Icon name="aviso" size={16} />
              {MSG_SEM_PERIODO}
            </p>
          )}
        </div>
        <div id={idNumero} className="form-numero" data-testid="numero-novo" role="status">
          {form.naoSei ? (
            <>
              <span>Sem número</span>
              <p>Salva um rascunho sem número, que fica na Revisão até ganhar período.</p>
            </>
          ) : !p ? (
            <>
              <span>Número</span>
              <p>Escolha o período: o número é o próximo dele.</p>
            </>
          ) : (
            <>
              <span>
                Número: <strong className="form-numero-valor">{proximo ?? 'calculando…'}</strong>
                {proximo && <span className="form-marca">provisório</span>}
                {proximo && (
                  <>
                    {' · '}
                    <span className="form-numero-skc">{textoDoNrSkc(proximoNrSkc)}</span>
                  </>
                )}
              </span>
              <p>
                o próximo do {nomeDoPeriodo(p)}
                {ultimoNumero ? ` (o último é ${ultimoNumero}, ${deQuem})` : ' (o primeiro do período)'}.
              </p>
              <p>
                Provisório até sincronizar: com internet, o app sincroniza ao salvar e o número fica <strong>definitivo</strong>; depois não muda, nem se a
                datação for revista.
              </p>
            </>
          )}
        </div>
      </div>
      <p className="form-ajuda">Datação em faixa: escolha o período mais antigo, como no resto do banco. «Ainda não sei» salva um rascunho sem número, que fica na Revisão até ganhar período.</p>
    </section>
  )

  const secaoDaFicha = (
    <section className="form-secao" aria-labelledby="novo-ficha-titulo">
      <h2 id="novo-ficha-titulo" className="form-secao-titulo">
        Ficha
      </h2>
      <Texto rotulo="Tipo e descrição curta" valor={f.titulo} aoMudar={campo('titulo')} ajuda="Vira o título do objeto, como «Selo. Pedra.»" placeholder="Selo. Pedra." />
      <div className="novo-duas">
        <CampoDeEscolha
          rotulo="Sítio"
          valor={f.sitioNome}
          aoMudarTexto={(t) => mudarForm((x) => ({ ...x, sitioNovo: false, ficha: { ...x.ficha, sitioNome: t, sitio: '' } }))}
          opcoes={opcoesDeSitio}
          aoEscolher={(o) =>
            mudarForm((x) =>
              eSitioNovoEscolhido(o.id)
                ? { ...x, sitioNovo: true, ficha: { ...x.ficha, sitio: '', sitioNome: nomeDoSitioNovoEscolhido(o.id) } }
                : { ...x, sitioNovo: false, ficha: { ...x.ficha, sitio: o.id, sitioNome: o.rotulo } },
            )
          }
          livre={sitioNovoLivre}
          ajuda={
            form.sitioNovo && f.sitio === '' && f.sitioNome.trim() !== ''
              ? `Será criado o sítio «${f.sitioNome.trim()}» (SKC) ao salvar; complete os dados depois, na página do sítio.`
              : 'Busca nos sítios do banco e nas grafias. Um nome que não existe pode virar «Novo sítio».'
          }
        />
        <Texto rotulo="Datação" valor={f.datacao} aoMudar={campo('datacao')} ajuda={p ? `Texto livre, como na fonte · período: ${nomeDoPeriodo(p)} (acima)` : 'Texto livre, como na fonte.'} placeholder="como na fonte, ex.: 4500–4000 aEC" />
      </div>
      <div className="novo-duas">
        <Texto rotulo="Material" valor={f.material} aoMudar={campo('material')} />
        <fieldset className="form-campo novo-medidas">
          <legend className="form-legenda">
            Medidas <span className="form-apoio">(cm, opcional)</span>
          </legend>
          <div className="form-linha form-medidas">
            <Texto rotulo="Altura" valor={f.altura} aoMudar={campo('altura')} decimal />
            <Texto rotulo="Largura" valor={f.largura} aoMudar={campo('largura')} decimal />
            <Texto rotulo="Espessura" valor={f.espessura} aoMudar={campo('espessura')} decimal />
          </div>
          <span className="form-ajuda">A × L × E. Use vírgula decimal; para diâmetro, escreva na Altura «Ø 4,5».</span>
        </fieldset>
      </div>
      <div className="novo-duas">
        <Texto rotulo="Acervo" valor={f.acervo} aoMudar={campo('acervo')} placeholder="Museu, cidade" />
        <Texto rotulo="Inventário" valor={f.inventario} aoMudar={campo('inventario')} placeholder="nº de inventário" />
      </div>
    </section>
  )

  const secaoDaOrigem = (
    <section className="form-secao" aria-labelledby="novo-origem-titulo">
      <h2 id="novo-origem-titulo" className="form-secao-titulo">
        Origem
      </h2>
      <fieldset className="form-origens novo-origens">
        <legend className="form-legenda">De onde vem</legend>
        <div className={`form-origem${f.origemTipo === 'publicacao' ? ' form-origem-ativa' : ''}`}>
          <label className="form-origem-escolha">
            <input type="radio" name="novo-origem" checked={f.origemTipo === 'publicacao'} onChange={() => mudarForm((x) => ({ ...x, ficha: { ...x.ficha, origemTipo: 'publicacao' } }))} />
            Publicação
          </label>
          {f.origemTipo === 'publicacao' && (
            <>
              <CampoDeEscolha
                rotulo="Obra"
                valor={f.obraRotulo}
                aoMudarTexto={(t) => mudarForm((x) => ({ ...x, ficha: { ...x.ficha, obraRotulo: t, obra: '' } }))}
                opcoes={opcoesDeObra}
                aoEscolher={(o) => mudarForm((x) => ({ ...x, ficha: { ...x.ficha, obra: o.id, obraRotulo: o.rotulo } }))}
                ajuda="Busca na Bibliografia ao digitar. Se a obra não estiver lá, fica como referência livre."
                placeholder="Autor 2025"
              />
              <div className="form-linha">
                <Texto rotulo="Página" valor={f.pagina} aoMudar={campo('pagina')} />
                <Texto rotulo="Figura" valor={f.figura} aoMudar={campo('figura')} />
              </div>
            </>
          )}
        </div>
        <div className={`form-origem${f.origemTipo === 'achado' ? ' form-origem-ativa' : ''}`}>
          <label className="form-origem-escolha">
            <input type="radio" name="novo-origem" checked={f.origemTipo === 'achado'} onChange={() => mudarForm((x) => ({ ...x, ficha: { ...x.ficha, origemTipo: 'achado' } }))} />
            <span>
              Achado recente / comunicação pessoal
              <span className="form-origem-apoio">com nota: quem, quando, onde</span>
            </span>
          </label>
          {f.origemTipo === 'achado' && <Texto rotulo="Nota do achado (quem, quando, onde)" valor={f.achado} aoMudar={campo('achado')} longo />}
        </div>
      </fieldset>
    </section>
  )

  const secaoDaLeitura = (
    <section className="form-secao" aria-labelledby="novo-leitura-titulo">
      <h2 id="novo-leitura-titulo" className="form-secao-titulo">
        Leitura SKC
      </h2>
      <div className="form-campo">
        <label htmlFor="novo-leitura">
          Leitura <span className="form-apoio">(opcional)</span>
        </label>
        <CampoDaNota id="novo-leitura" rascunho={fonteDaLeitura} descritoPor="novo-leitura-ajuda" />
        <span id="novo-leitura-ajuda" className="form-ajuda novo-leitura-ajuda">
          <span>Digite [[ para ligar a um verbete, objeto ou obra.</span>
          <span>As hipóteses e as regiões se acrescentam depois, na tela do objeto.</span>
        </span>
      </div>
    </section>
  )

  const aviso = (
    <>
      {recuperado && (
        <div className="novo-recuperado" role="status" aria-label="Rascunho recuperado">
          <span>Rascunho recuperado: o que você tinha preenchido neste aparelho voltou.</span>
          <button type="button" className="novo-link" onClick={() => void descartar()}>
            Descartar o rascunho
          </button>
        </div>
      )}
      {erroGeral && (
        <p className="form-erro novo-erro-geral" role="alert">
          <Icon name="aviso" size={16} />
          {erroGeral}
        </p>
      )}
    </>
  )

  if (form.criado) {
    // Um salvar interrompido: o objeto já existe. A tela só oferece guardar nele as imagens que faltavam (nunca cria outro).
    const criado = form.criado
    const numero = numeracao.porId.get(criado)?.numero
    return (
      <div className={`novo-objeto${computador ? ' novo-objeto-pc' : ''}`}>
        <TopoDoCelular voltar={{ href: '#/colecoes', rotulo: 'Fechar (o rascunho fica guardado)' }} busca={false} />
        <form onSubmit={(e) => void salvar(e)} noValidate aria-labelledby="novo-titulo">
          <header className="novo-cabecalho">
            <h1 id="novo-titulo">
              Novo objeto <span className="novo-skc">SKC</span>
            </h1>
          </header>
          <div className="novo-corpo novo-retomar">
            <div className="novo-recuperado" role="status" aria-label="Objeto já salvo">
              <span>
                Este objeto já foi salvo{numero ? ` (${numero})` : ''}: o salvar foi interrompido enquanto as imagens eram guardadas.{' '}
                {imagens.length > 0 ? `Falta${imagens.length === 1 ? '' : 'm'} ${imagens.length === 1 ? '1 imagem' : `${imagens.length} imagens`}; «Guardar as imagens» as põe nele.` : 'Não falta nada.'}
              </span>
              <Link className="novo-link" to={`/item/${encodeURIComponent(criado)}`}>
                Abrir o objeto
              </Link>
            </div>
            {erroGeral && (
              <p className="form-erro novo-erro-geral" role="alert">
                <Icon name="aviso" size={16} />
                {erroGeral}
              </p>
            )}
            {imagens.length > 0 && <ImagensDoNovo itens={imagens} mudar={mudarImagens} computador={computador} />}
            <div className="novo-pe">
              <div className="novo-acoes-pe">
                {imagens.length > 0 && (
                  <button type="button" className="form-botao" onClick={() => void descartar()}>
                    Descartar {imagens.length === 1 ? 'a imagem' : 'as imagens'}
                  </button>
                )}
                <button type="submit" className="form-botao form-botao-forte" aria-busy={salvando || undefined}>
                  <Icon name="confirmar" size={18} />
                  {salvando ? 'Salvando…' : imagens.length > 0 ? 'Guardar as imagens' : 'Abrir o objeto'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className={`novo-objeto${computador ? ' novo-objeto-pc' : ''}`}>
      <TopoDoCelular voltar={{ href: '#/colecoes', rotulo: 'Fechar (o rascunho fica guardado)' }} busca={false} />
      <form onSubmit={(e) => void salvar(e)} noValidate aria-labelledby="novo-titulo">
        <header className="novo-cabecalho">
          {computador && (
            <nav aria-label="Caminho" className="novo-caminho">
              <Link to="/colecoes">Coleções · SKC · Meus objetos</Link>
            </nav>
          )}
          <div className="novo-cabecalho-linha">
            <div>
              <h1 id="novo-titulo">
                Novo objeto <span className="novo-skc">SKC</span>
              </h1>
              <p className="novo-apoio">Um objeto de artigo, relatório ou achado recente. Entra no banco como os dos livros: busca, coleções, hipóteses e regiões.</p>
            </div>
            {computador && botoes(false)}
          </div>
        </header>
        {computador ? (
          <div className="novo-colunas">
            <div className="novo-coluna-imagens">
              {aviso}
              <ImagensDoNovo itens={imagens} mudar={mudarImagens} computador />
            </div>
            <div className="novo-coluna-campos">
              {secaoDoPeriodo}
              {secaoDaFicha}
              {secaoDaOrigem}
              {secaoDaLeitura}
              <div className="novo-pe">
                <span className="form-ajuda">Fica na sua camada (SKC). Depois de salvar, abre a tela do objeto.</span>
                {botoes(true)}
              </div>
            </div>
          </div>
        ) : (
          <div className="novo-corpo">
            {aviso}
            <ImagensDoNovo itens={imagens} mudar={mudarImagens} computador={false} />
            {secaoDoPeriodo}
            {secaoDaFicha}
            {secaoDaOrigem}
            {secaoDaLeitura}
            <div className="novo-pe">
              {botoes(true)}
              <span className="form-nota">Fica na sua camada (SKC). Depois de salvar, abre a tela do objeto.</span>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}

function Texto({
  rotulo,
  valor,
  aoMudar,
  ajuda,
  placeholder,
  longo = false,
  decimal = false,
}: {
  rotulo: string
  valor: string
  aoMudar: (t: string) => void
  ajuda?: string
  placeholder?: string
  longo?: boolean
  decimal?: boolean
}) {
  const id = useId()
  return (
    <div className="form-campo">
      <label htmlFor={id}>{rotulo}</label>
      {longo ? (
        <textarea id={id} value={valor} onChange={(e) => aoMudar(e.target.value)} aria-describedby={ajuda ? `${id}-ajuda` : undefined} />
      ) : (
        <input
          id={id}
          type="text"
          value={valor}
          inputMode={decimal ? 'decimal' : undefined}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => aoMudar(e.target.value)}
          aria-describedby={ajuda ? `${id}-ajuda` : undefined}
        />
      )}
      {ajuda && (
        <span id={`${id}-ajuda`} className="form-ajuda">
          {ajuda}
        </span>
      )}
    </div>
  )
}
