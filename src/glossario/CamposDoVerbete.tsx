/**
 * Os campos completos de um verbete do usuário (Parte 2C, bloco 3, Tarefa 12; quadro «Verbete seu, completo»): a leitura,
 * como na página do verbete dos livros (`DadosDoVerbeteSkc`), e a edição no lugar (`EditarCamposDoVerbete`): tipo, gênero,
 * número, alemão, inglês, hebraico, árabe, «Outra língua» (repetível), variantes, termo mais geral, Iconclass e SSSL. Cada
 * mudança se grava na hora, um campo por evento (o formato está em src/glossario/modelo.ts): os textos e as listas pelo
 * `useCampoSalvo` (1 s depois da última tecla, ao sair, em Ctrl/⌘S, com a rede de segurança), as escolhas ao escolher
 * (`alterarCamposDoVerbete`). O hebraico e o árabe levam `dir="rtl"` no campo e na página.
 */
import { useId, useMemo, useRef, useState, type FocusEvent } from 'react'
import { Link } from 'react-router'
import { Segmentos } from '../hipoteses/Segmentos'
import { CampoDeEscolha, type OpcaoDeEscolha } from '../objetos-skc/CampoDeEscolha'
import { Linha } from '../telas/detalhe'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { useCampoSalvo } from '../usuario/campoSalvo'
import { useFormasEmUso, useNomeVivo, useVerbetesSkc } from './doUsuario'
import { nomeDoPacote, useFormasDoPacote } from './formasDoPacote'
import {
  listaDeOutras,
  listaDeTextos,
  normalizarForma,
  outrasInteiras,
  ROTULO_DO_GENERO,
  ROTULO_DO_NUMERO,
  ROTULO_DO_TIPO,
  type CamposCompletos,
  type OutraForma,
  type TipoDoVerbete,
} from './modelo'
import { alterarCamposDoVerbete } from './operacoes'
import '../objetos-skc/Formulario.css'
import './Glossario.css'

const MSG_FALHOU = 'Não foi possível guardar; tente de novo.'

/** As línguas com campo próprio: o rótulo, o código (`lang`) e a direção. */
const LINGUAS = [
  { campo: 'de', rotulo: 'Alemão', lang: 'de', rtl: false },
  { campo: 'en', rotulo: 'Inglês', lang: 'en', rtl: false },
  { campo: 'he', rotulo: 'Hebraico', lang: 'he', rtl: true },
  { campo: 'ar', rotulo: 'Árabe', lang: 'ar', rtl: true },
] as const

// ---- A leitura

/** O gênero e o número, na seção da forma em português (como no verbete dos livros). */
export function GeneroENumero({ campos }: { campos: CamposCompletos }) {
  return (
    <>
      <Linha rotulo="Gênero" vazio={!campos.genero}>
        {campos.genero ? ROTULO_DO_GENERO[campos.genero] : null}
      </Linha>
      <Linha rotulo="Número" vazio={!campos.numero}>
        {campos.numero ? ROTULO_DO_NUMERO[campos.numero] : null}
      </Linha>
    </>
  )
}

/** «Outras línguas»: a língua e a forma de cada linha inteira (a forma com `dir="auto"`: pode ser de escrita da direita). */
export function ListaDeOutras({ outras }: { outras: readonly OutraForma[] }) {
  return (
    <ul className="verbete-outras">
      {outras.map((o) => (
        <li key={`${o.lingua}|${o.forma}`}>
          <span className="verbete-outras-lingua">{o.lingua}</span> <span dir="auto">{o.forma}</span>
        </li>
      ))}
    </ul>
  )
}

/** A ordem das línguas na leitura: a do verbete dos livros (o formulário segue a do quadro: hebraico, depois árabe). */
const LINGUAS_DA_LEITURA = ['de', 'en', 'ar', 'he'].map((c) => LINGUAS.find((l) => l.campo === c)!)

/**
 * Uma forma numa língua, na leitura: o `lang` no `dd` e a direção num `<bdi>` dentro dele (fix round 1, N2): o texto corre da
 * direita para a esquerda sem empurrar o bloco para a borda da coluna.
 */
export function FormaNaLingua({ texto, rtl }: { texto: string; rtl: boolean | 'auto' }) {
  return rtl ? <bdi dir={rtl === 'auto' ? 'auto' : 'rtl'}>{texto}</bdi> : <>{texto}</>
}

/** Os dados do verbete do usuário, na ordem e com os rótulos do verbete dos livros; as linhas vazias não aparecem. */
export function DadosDoVerbeteSkc({ campos }: { campos: CamposCompletos }) {
  const nomeDe = useNomeVivo()
  const outras = outrasInteiras(campos.outras)
  return (
    <dl className="detalhe-dl">
      {LINGUAS_DA_LEITURA.map((l) => (
        <Linha key={l.campo} rotulo={l.rotulo} lang={l.lang} vazio={!campos[l.campo]}>
          <FormaNaLingua texto={campos[l.campo] ?? ''} rtl={l.rtl} />
        </Linha>
      ))}
      <Linha rotulo="Outras línguas" vazio={outras.length === 0}>
        <ListaDeOutras outras={outras} />
      </Linha>
      <Linha rotulo="Pai" vazio={!campos.pai}>
        {campos.pai && <Link to={`/verbete/${encodeURIComponent(campos.pai)}`}>{nomeDe(campos.pai, campos.pai)}</Link>}
      </Linha>
      <Linha rotulo="Iconclass" vazio={campos.iconclass.length === 0}>
        <ul>
          {campos.iconclass.map((i) => (
            <li key={i}>
              <span className="codigo">{i}</span>
            </li>
          ))}
        </ul>
      </Linha>
      <Linha rotulo="SSSL" vazio={campos.sssl.length === 0}>
        <ul>
          {campos.sssl.map((s) => (
            <li key={s}>
              <span className="codigo">{s}</span>
            </li>
          ))}
        </ul>
      </Linha>
      <Linha rotulo="Variantes" vazio={campos.variantes.length === 0}>
        {campos.variantes.join(', ')}
      </Linha>
    </dl>
  )
}

// ---- A edição

function Erro({ falhou }: { falhou: boolean }) {
  return falhou ? (
    <p className="form-erro" role="alert">
      {MSG_FALHOU}
    </p>
  ) : null
}

/** Uma escolha nativa que grava ao escolher: mostra a escolha na hora e volta à gravada se a gravação falha. */
function EscolhaQueGrava({ rotulo, valor, opcoes, aoEscolher }: { rotulo: string; valor: string; opcoes: readonly (readonly [string, string])[]; aoEscolher: (v: string) => Promise<unknown> }) {
  const uid = useId()
  const [escolhido, setEscolhido] = useState<{ v: string; de: string } | null>(null)
  const [falhou, setFalhou] = useState(false)
  // a escolha feita aqui vale até o valor gravado mudar (chegou a escrita, daqui ou de outro aparelho)
  const mostrado = escolhido && escolhido.de === valor ? escolhido.v : valor
  return (
    <div className="form-campo">
      <label htmlFor={uid}>{rotulo}</label>
      <select
        id={uid}
        className="verbete-escolha"
        value={mostrado}
        onChange={(e) => {
          const v = e.target.value
          setEscolhido({ v, de: valor })
          setFalhou(false)
          aoEscolher(v).catch(() => {
            setEscolhido(null)
            setFalhou(true)
          })
        }}
      >
        {opcoes.map(([v, texto]) => (
          <option key={v} value={v}>
            {texto}
          </option>
        ))}
      </select>
      <Erro falhou={falhou} />
    </div>
  )
}

/** Um campo de texto de uma língua (alemão, inglês, hebraico, árabe): vazio = sem forma (`null`). */
function CampoDaLingua({ id, campo, rotulo, lang, rtl, valor, criaRegistro }: { id: string; campo: 'de' | 'en' | 'he' | 'ar'; rotulo: string; lang: string; rtl: boolean; valor: string | null; criaRegistro: boolean }) {
  const uid = useId()
  const [falhou, setFalhou] = useState(false)
  const c = useCampoSalvo({ tipo: 'verbete', reg: id, campo, valor: valor ?? '', normalizar: normalizarForma, valorGravado: (limpo) => (limpo === '' ? null : limpo), criaRegistro, aoFalhar: setFalhou })
  return (
    <div className="form-campo">
      <label htmlFor={uid}>{rotulo}</label>
      <input id={uid} type="text" autoComplete="off" lang={lang} dir={rtl ? 'rtl' : undefined} value={c.texto} onChange={(e) => c.setTexto(e.target.value)} onFocus={c.aoFocar} onBlur={() => void c.aoDesfocar()} />
      <Erro falhou={falhou} />
    </div>
  )
}

const normalizarLinhas = (t: string) => listaDeTextos(t.split('\n')).join('\n')

/** Uma lista de textos, um por linha (variantes, Iconclass, SSSL): as linhas vazias e as repetidas saem; nenhuma = `null`. */
function CampoDeLista({ id, campo, rotulo, valor, ajuda, codigo = false, criaRegistro }: { id: string; campo: 'variantes' | 'iconclass' | 'sssl'; rotulo: string; valor: readonly string[]; ajuda?: string; codigo?: boolean; criaRegistro: boolean }) {
  const uid = useId()
  const [falhou, setFalhou] = useState(false)
  const c = useCampoSalvo({
    tipo: 'verbete',
    reg: id,
    campo,
    valor: valor.join('\n'),
    normalizar: normalizarLinhas,
    valorGravado: (limpo) => (limpo === '' ? null : limpo.split('\n')),
    criaRegistro,
    aoFalhar: setFalhou,
  })
  return (
    <div className="form-campo">
      <label htmlFor={uid}>{rotulo}</label>
      <textarea
        id={uid}
        className={`verbete-lista${codigo ? ' verbete-lista-codigo' : ''}`}
        rows={2}
        spellCheck={!codigo}
        aria-describedby={ajuda ? `${uid}-ajuda` : undefined}
        value={c.texto}
        onChange={(e) => c.setTexto(e.target.value)}
        onFocus={c.aoFocar}
        onBlur={() => void c.aoDesfocar()}
      />
      {ajuda && (
        <span id={`${uid}-ajuda`} className="form-ajuda">
          {ajuda}
        </span>
      )}
      <Erro falhou={falhou} />
    </div>
  )
}

const lerLinhas = (t: string): OutraForma[] => {
  try {
    const l = JSON.parse(t) as unknown
    return Array.isArray(l) ? l.map((o: { lingua?: unknown; forma?: unknown }) => ({ lingua: typeof o?.lingua === 'string' ? o.lingua : '', forma: typeof o?.forma === 'string' ? o.forma : '' })) : []
  } catch {
    return []
  }
}

/**
 * «Outra língua»: linhas de língua + forma. «+ Outra língua» acrescenta uma linha (só na tela até ter algo escrito), o ×
 * tira a linha. A lista inteira é um campo só (`outras`), gravado como os de texto (o `useCampoSalvo`, com a lista em JSON):
 * 1 s depois da última tecla, ao sair do grupo e ao tirar uma linha. Uma linha pela metade é gravada (nada se perde); a vazia
 * não.
 */
function OutrasLinguas({ id, outras, criaRegistro }: { id: string; outras: readonly OutraForma[]; criaRegistro: boolean }) {
  const uid = useId()
  const [falhou, setFalhou] = useState(false)
  const grupo = useRef<HTMLFieldSetElement>(null)
  const maisRef = useRef<HTMLButtonElement>(null)
  const c = useCampoSalvo({
    tipo: 'verbete',
    reg: id,
    campo: 'outras',
    valor: JSON.stringify(outras),
    aparar: false,
    normalizar: (t) => JSON.stringify(listaDeOutras(lerLinhas(t))),
    valorGravado: (limpo) => {
      const l = JSON.parse(limpo) as OutraForma[]
      return l.length > 0 ? l.map((o) => ({ lingua: o.lingua, forma: o.forma })) : null
    },
    criaRegistro,
    aoFalhar: setFalhou,
  })
  const linhas = lerLinhas(c.texto)
  // N3: uma chave estável por linha, só da tela (tirar uma linha do meio não remonta as de baixo nem perde uma composição)
  const chaves = useRef<number[]>([])
  const proxima = useRef(0)
  if (chaves.current.length > linhas.length) chaves.current = chaves.current.slice(0, linhas.length)
  while (chaves.current.length < linhas.length) chaves.current.push(proxima.current++)
  const mudar = (novas: OutraForma[]) => c.setTexto(JSON.stringify(novas))
  const acrescentar = () => {
    mudar([...linhas, { lingua: '', forma: '' }])
    // o foco vai para a língua da linha nova (depois de ela aparecer)
    requestAnimationFrame(() => grupo.current?.querySelectorAll<HTMLInputElement>('input[data-lingua]')[linhas.length]?.focus())
  }
  const tirar = (i: number) => {
    chaves.current = chaves.current.filter((_, j) => j !== i)
    mudar(linhas.filter((_, j) => j !== i))
    void c.gravarAgora()
    maisRef.current?.focus()
  }
  const saiu = (e: FocusEvent<HTMLFieldSetElement>) => {
    if (!grupo.current?.contains(e.relatedTarget as Node | null)) void c.aoDesfocar()
  }
  return (
    <fieldset ref={grupo} className="form-campo verbete-outras-edicao" onFocus={c.aoFocar} onBlur={saiu}>
      <legend className="form-legenda">Outra língua</legend>
      {linhas.map((o, i) => {
        const n = i + 1
        return (
          <div key={chaves.current[i]} className="verbete-outra-linha">
            <input data-lingua type="text" autoComplete="off" className="verbete-outra-lingua" placeholder="língua" aria-label={`Outra língua ${n}: a língua`} value={o.lingua} onChange={(e) => mudar(linhas.map((x, j) => (j === i ? { ...x, lingua: e.target.value } : x)))} />
            <input type="text" autoComplete="off" dir="auto" placeholder="forma" aria-label={`Outra língua ${n}: a forma`} value={o.forma} onChange={(e) => mudar(linhas.map((x, j) => (j === i ? { ...x, forma: e.target.value } : x)))} />
            <IconButton icon="fechar" label={`Tirar a linha ${o.lingua.trim() || n}`} size={16} tipPosition="start" onClick={() => tirar(i)} />
          </div>
        )
      })}
      <button ref={maisRef} type="button" className="form-botao verbete-outra-mais" aria-describedby={`${uid}-ajuda`} onClick={acrescentar}>
        <Icon name="adicionar" size={18} />
        Outra língua
      </button>
      <span id={`${uid}-ajuda`} className="form-ajuda">
        O nome da língua e a forma nela. Uma linha por língua.
      </span>
      <Erro falhou={falhou} />
    </fieldset>
  )
}

/**
 * «Termo mais geral» (o pai): um verbete dos livros ou seu, escolhido da lista (a partir de 2 letras). Escolher grava; apagar
 * o texto e sair do campo tira o pai. Um texto que não é escolhido não vale: o pai continua o de antes, e o campo o diz.
 */
function CampoDoPai({ id, pai, excluir }: { id: string; pai: string | null; excluir: readonly string[] }) {
  const nomeDe = useNomeVivo()
  const pacote = useFormasDoPacote()
  const formas = useFormasEmUso()
  const doUsuario = useVerbetesSkc()
  const [texto, setTexto] = useState<string | null>(null)
  const [falhou, setFalhou] = useState(false)
  const nomeAtual = pai ? nomeDe(pai, pai) : ''
  const opcoes = useMemo<OpcaoDeEscolha[]>(() => {
    const saida: OpcaoDeEscolha[] = []
    const fora = new Set([id, ...excluir])
    for (const v of doUsuario) if (!fora.has(v.id)) saida.push({ id: v.id, rotulo: v.emUso, apoio: v.id, skc: true })
    for (const [gid, f] of pacote ?? []) {
      if (fora.has(gid)) continue
      const nome = formas.get(gid) ?? nomeDoPacote(f)
      if (nome) saida.push({ id: gid, rotulo: nome, apoio: gid })
    }
    return saida
  }, [doUsuario, pacote, formas, id, excluir])
  const gravar = (novo: string | null) => {
    setFalhou(false)
    alterarCamposDoVerbete(id, { pai: novo }).catch(() => setFalhou(true))
  }
  const solto = texto !== null && texto.trim() !== '' && normalizarForma(texto) !== normalizarForma(nomeAtual)
  return (
    <div className="verbete-pai">
      <CampoDeEscolha
        rotulo="Termo mais geral"
        valor={texto ?? nomeAtual}
        aoMudarTexto={setTexto}
        opcoes={opcoes}
        aoEscolher={(o) => {
          setTexto(null)
          if (o.id !== pai) gravar(o.id)
        }}
        aoDesfocar={() => {
          if (texto === null || texto.trim() !== '') return
          setTexto(null)
          if (pai) gravar(null)
        }}
        ajuda={pai ? 'O pai deste verbete, nos livros ou seu. Apague para tirar.' : 'O pai deste verbete, nos livros ou seu: escreva e escolha na lista.'}
      />
      {solto && (
        <p className="form-ajuda" role="status">
          {pai ? `Escolha um verbete da lista; o termo mais geral continua «${nomeAtual}».` : 'Escolha um verbete da lista; sem escolha, o verbete fica sem termo mais geral.'}
        </p>
      )}
      <Erro falhou={falhou} />
    </div>
  )
}

const SEM_IDS: readonly string[] = []

const OPCOES_DO_TIPO: readonly { valor: TipoDoVerbete; rotulo: string }[] = [
  { valor: 'concept', rotulo: ROTULO_DO_TIPO.concept },
  { valor: 'name', rotulo: ROTULO_DO_TIPO.name },
  { valor: 'technical', rotulo: 'Termo técnico' },
]
const OPCOES_DO_GENERO: readonly (readonly [string, string])[] = [['', '—'], ['m', ROTULO_DO_GENERO.m], ['f', ROTULO_DO_GENERO.f]]
const OPCOES_DO_NUMERO: readonly (readonly [string, string])[] = [['', '—'], ['sg', ROTULO_DO_NUMERO.sg], ['pl', ROTULO_DO_NUMERO.pl]]

/**
 * O formulário dos campos completos (quadro «Verbete seu, completo»), no lugar da leitura. `key={id}` em quem o monta.
 * `id`: o registro onde grava (o verbete do usuário; num verbete publicado, `useEdicaoPublicada().alvo`). `criaRegistro`: o
 * alvo é o id do livro, que pode ainda não ter registro. `excluirDoPai`: ids que não podem ser o termo mais geral (o id do
 * livro do verbete publicado e as origens dele).
 */
export function EditarCamposDoVerbete({ id, campos, criaRegistro = false, excluirDoPai = SEM_IDS }: { id: string; campos: CamposCompletos; criaRegistro?: boolean; excluirDoPai?: readonly string[] }) {
  const tipoId = useId()
  const [falhouTipo, setFalhouTipo] = useState(false)
  return (
    <div className="verbete-campos">
      <div className="form-campo verbete-campos-largo">
        <span id={tipoId} className="form-legenda">
          Tipo
        </span>
        <Segmentos
          rotulo="Tipo"
          rotuloId={tipoId}
          opcoes={OPCOES_DO_TIPO}
          valor={campos.tipo}
          aoEscolher={(tipo) => {
            if (tipo === campos.tipo) return
            setFalhouTipo(false)
            alterarCamposDoVerbete(id, { tipo }).catch(() => setFalhouTipo(true))
          }}
        />
        <Erro falhou={falhouTipo} />
      </div>
      <EscolhaQueGrava rotulo="Gênero" valor={campos.genero ?? ''} opcoes={OPCOES_DO_GENERO} aoEscolher={(v) => alterarCamposDoVerbete(id, { genero: v === '' ? null : (v as 'm' | 'f') })} />
      <EscolhaQueGrava rotulo="Número" valor={campos.numero ?? ''} opcoes={OPCOES_DO_NUMERO} aoEscolher={(v) => alterarCamposDoVerbete(id, { numero: v === '' ? null : (v as 'sg' | 'pl') })} />
      {LINGUAS.map((l) => (
        <CampoDaLingua key={l.campo} id={id} campo={l.campo} rotulo={l.rotulo} lang={l.lang} rtl={l.rtl} valor={campos[l.campo]} criaRegistro={criaRegistro} />
      ))}
      <div className="verbete-campos-largo">
        <OutrasLinguas id={id} outras={campos.outras} criaRegistro={criaRegistro} />
      </div>
      <div className="verbete-campos-largo">
        <CampoDeLista id={id} campo="variantes" rotulo="Variantes (uma por linha)" valor={campos.variantes} ajuda="Outras grafias do termo, em qualquer língua. Entram na busca." criaRegistro={criaRegistro} />
      </div>
      <div className="verbete-campos-largo">
        <CampoDoPai id={id} pai={campos.pai} excluir={excluirDoPai} />
      </div>
      <CampoDeLista id={id} campo="iconclass" rotulo="Iconclass" valor={campos.iconclass} ajuda="Uma notação por linha." codigo criaRegistro={criaRegistro} />
      <CampoDeLista id={id} campo="sssl" rotulo="SSSL" valor={campos.sssl} ajuda="Um código por linha." codigo criaRegistro={criaRegistro} />
      <p className="form-ajuda verbete-campos-largo">«+ Outra língua» acrescenta mais uma linha. Cada mudança se grava na hora. O verbete vai para os dados no próximo pacote, como os seus outros verbetes.</p>
    </div>
  )
}
