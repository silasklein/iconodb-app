import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { dobrar, normalizarForma } from '../glossario/modelo'
import { Camada } from '../ui/Camada'
import { IconButton } from '../ui/IconButton'
import { Icon } from '../ui/Icon'
import { sitiosComEsteNome, useOpcoesDeSitio, useSitiosParaComparar, useSitiosVivos } from './doUsuario'
import { criarSitio, pedidoDeTroca, trocarSitioDoObjeto } from './operacoes'
import { opcoesDaTroca } from './trocar'
import { useResolucaoDeSitios } from './useResolucao'
import '../colecoes/FolhaDeColecao.css'
import '../imagens-usuario/MarcaSkc.css'
import './Sitios.css'

const MAXIMO_DE_OPCOES = 8
const MSG_FALHOU = 'Não foi possível guardar a mudança; tente de novo.'

interface Props {
  /** O número do objeto do livro cujo sítio se troca. */
  numero: string
  /** O que o livro diz: o sítio (id e nome) e de onde vem ("TESTE I: 3"). */
  doLivro: { id: string | null; nome: string | null; origem: string | null }
  variante: 'folha' | 'dialogo'
  aoFechar: () => void
  devolverFoco?: () => HTMLElement | null
}

/**
 * "Sítio deste objeto · SKC" (ItemSitio.dc.html no celular, folha de baixo; PC-ItemSitio.dc.html no computador, diálogo): o
 * sítio atual, a busca entre os sítios (pelo nome de agora, pelo do livro e pelas grafias, com ou sem diacríticos), a lista
 * (rádio; em árvore, as partes recuadas sob o todo, `opcoesDaTroca`, telas aprovadas da Parte 2C, bloco 2, §5), "Novo sítio
 * «…»" / "Novo sítio com mais dados…" e Cancelar / Trocar. A troca é um `item-sitio` na camada do usuário: o dado do livro não é tocado e
 * continua visível na ficha como "no livro: …". É o mesmo caminho para os "sítios não resolvidos" da Revisão.
 */
export function TrocarSitio({ numero, doLivro, variante, aoFechar, devolverFoco }: Props) {
  const uid = useId()
  const vivos = useSitiosVivos()
  const opcoes = useOpcoesDeSitio()
  const resolucao = useResolucaoDeSitios()
  const todos = useSitiosParaComparar()
  const [consulta, setConsulta] = useState('')
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const grupo = useRef<HTMLDivElement>(null)

  const atual = vivos.doObjetoDoPacote(numero, { id: doLivro.id, nome: doLivro.nome })
  const palavras = useMemo(() => dobrar(consulta).split(' ').filter(Boolean), [consulta])
  const resultado = useMemo(() => opcoesDaTroca(resolucao, opcoes, atual.id, palavras), [resolucao, opcoes, atual.id, palavras])
  const visiveis = resultado.slice(0, MAXIMO_DE_OPCOES)
  const q = normalizarForma(consulta)
  // "Novo sítio «…»" só quando nada existente tem este nome ou grafia: o existente aparece na lista.
  const podeCriar = q.length >= 2 && sitiosComEsteNome(todos, q).length === 0
  const novo = new URLSearchParams({ ...(q ? { nome: q } : {}), para: numero }).toString()

  const tentar = async (acao: () => Promise<unknown>) => {
    if (ocupado) return
    setErro(null)
    setOcupado(true)
    try {
      await acao()
      aoFechar()
    } catch {
      setOcupado(false)
      setErro(MSG_FALHOU)
    }
  }
  const trocar = () => {
    const o = opcoes.find((x) => x.id === escolhido)
    if (!o) return setErro('Escolha um sítio na lista.')
    void tentar(() => trocarSitioDoObjeto(numero, o.id, o.nome))
  }
  const criar = () => void tentar(() => criarSitio({ nome: q }, { junto: (sid, nome) => [pedidoDeTroca(numero, sid, nome)] }))

  // Setas percorrem a lista de rádios (roving tabindex: uma parada de Tab no grupo).
  const teclar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const ids = visiveis.map((l) => l.opcao.id)
    if (ids.length === 0) return
    e.preventDefault()
    const i = escolhido ? ids.indexOf(escolhido) : -1
    const j = e.key === 'ArrowDown' ? Math.min(ids.length - 1, i + 1) : Math.max(0, i - 1)
    setEscolhido(ids[j]!)
    setErro(null)
    requestAnimationFrame(() => grupo.current?.querySelectorAll<HTMLElement>('[role="radio"]')[j]?.focus())
  }

  const deOnde =
    atual.id === null
      ? 'o livro não diz o sítio deste objeto'
      : atual.trocado
        ? `trocado por você${doLivro.nome ? ` · do livro: ${doLivro.nome}` : ' · o livro não dizia o sítio'}`
        : `do livro${doLivro.origem ? ` · ${doLivro.origem}` : ''}`

  return (
    <Camada variante={variante} rotulo="Sítio deste objeto" aoFechar={aoFechar} devolverFoco={devolverFoco} prefixo="trocar-sitio">
      <div className="trocar-sitio-topo">
        <h2 className="trocar-sitio-etiqueta">Sítio deste objeto · SKC</h2>
        <IconButton icon="fechar" label="Fechar sem trocar" shortcut="Escape" shortcutLabel="Esc" tipPosition="start" onClick={aoFechar} />
      </div>
      <div className="trocar-sitio-rolagem">
        <div className="trocar-sitio-atual">
          <span className="trocar-sitio-atual-rotulo">Atual</span>
          <span className="trocar-sitio-atual-texto">
            {atual.id === null ? (
              <span className="trocar-sitio-nome">Sem sítio</span>
            ) : (
              <Link className="trocar-sitio-nome" to={`/sitio/${encodeURIComponent(atual.id)}`}>
                {atual.nome ?? atual.id}
              </Link>
            )}
            {atual.marca && <span className="marca-excluido">{atual.marca}</span>}
            <span className="trocar-sitio-apoio">{deOnde}</span>
          </span>
        </div>

        <div className="form-campo trocar-sitio-busca">
          <label htmlFor={`${uid}-busca`}>Buscar entre os sítios</label>
          <div className="trocar-sitio-caixa">
            <Icon name="buscar" size={18} />
            <input
              id={`${uid}-busca`}
              type="search"
              autoComplete="off"
              value={consulta}
              aria-describedby={`${uid}-ajuda`}
              aria-controls={`${uid}-lista`}
              onChange={(e) => {
                setConsulta(e.target.value)
                setEscolhido(null)
                setErro(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') teclar(e as unknown as KeyboardEvent<HTMLDivElement>)
              }}
            />
          </div>
          <span id={`${uid}-ajuda`} className="form-ajuda">
            Procura no nome, no nome do livro e nas outras grafias, com ou sem diacríticos.
          </span>
        </div>

        <div id={`${uid}-lista`} ref={grupo} role="radiogroup" aria-label="Escolher o novo sítio" className="trocar-sitio-lista" onKeyDown={teclar}>
          <div className="trocar-sitio-lista-topo">
            <span>{palavras.length ? 'Resultado' : 'Sítios'}</span>
            <span className="codigo">{resultado.length}</span>
          </div>
          {visiveis.length === 0 && <p className="trocar-sitio-vazio">Nenhum sítio com este nome.</p>}
          {visiveis.map(({ opcao: o, nivel, apoio }, i) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={escolhido === o.id}
              tabIndex={escolhido === o.id || (escolhido === null && i === 0) ? 0 : -1}
              className="trocar-sitio-opcao"
              data-nivel={Math.min(nivel, 6)}
              onClick={() => {
                setEscolhido(o.id)
                setErro(null)
              }}
            >
              <span className="trocar-sitio-radio" aria-hidden="true" />
              <span className="trocar-sitio-opcao-textos">
                <span className="trocar-sitio-opcao-nome">
                  {o.nome}
                  {o.doUsuario && <span className="marca-skc">SKC</span>}
                </span>
                <span className="trocar-sitio-opcao-apoio">{apoio}</span>
              </span>
            </button>
          ))}
          {resultado.length > visiveis.length && <p className="trocar-sitio-vazio">Mais {resultado.length - visiveis.length}: escreva mais letras para afinar.</p>}
        </div>

        <div className="trocar-sitio-novo">
          {podeCriar && (
            <button type="button" className="trocar-sitio-criar" onClick={criar} disabled={ocupado}>
              <Icon name="adicionar" size={18} />
              Novo sítio «{q}»
            </button>
          )}
          <Link className="trocar-sitio-criar" to={`/sitios/novo?${novo}`}>
            Novo sítio com mais dados…
          </Link>
        </div>

        <p className="trocar-sitio-nota">
          A troca fica registrada como <span className="marca-skc">SKC</span>. O dado do livro{doLivro.nome ? `, «${doLivro.nome}»,` : ''} fica guardado e continua visível na ficha como «no livro». É o mesmo caminho para os «sítios não resolvidos» da Revisão.
        </p>
        {erro && (
          <p className="form-erro" role="alert">
            <Icon name="aviso" size={16} />
            {erro}
          </p>
        )}
      </div>
      <div className="trocar-sitio-pe">
        {atual.trocado && (
          <button type="button" className="trocar-sitio-botao trocar-sitio-voltar" onClick={() => void tentar(() => trocarSitioDoObjeto(numero, null))} disabled={ocupado}>
            Voltar ao sítio do livro
          </button>
        )}
        <button type="button" className="trocar-sitio-botao" onClick={aoFechar}>
          Cancelar
        </button>
        <button type="button" className="trocar-sitio-botao trocar-sitio-botao-forte" onClick={trocar} disabled={ocupado}>
          Trocar
        </button>
      </div>
    </Camada>
  )
}
