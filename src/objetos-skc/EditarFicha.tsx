import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { obras } from '../banco/consultas'
import { useCarregar } from '../ui/useCarregar'
import { useCampoSalvo } from '../usuario/campoSalvo'
import { criarSitio, pedidoDeFicha, reservarIdDoSitio } from '../sitios/operacoes'
import { eSitioNovoEscolhido, nomeDoSitioNovoEscolhido, useEscolhaDeSitio } from '../sitios/escolha'
import { registrar, useEstado } from '../usuario/estado'
import { CampoDeEscolha, type OpcaoDeEscolha } from './CampoDeEscolha'
import { lerObjeto, type CampoDeTexto } from './modelo'
import { nomeDoPeriodo } from './numeracao'
import './Formulario.css'
import './ObjetoSkc.css'

/** O valor atual de um campo de texto do objeto, como o estado o tem. */
function useValor(id: string, campo: CampoDeTexto): string {
  return useEstado((e) => {
    const v = e.registro('objeto', id)?.campos[campo]
    return typeof v === 'string' ? v : ''
  })
}

/** Um campo de texto da ficha que grava sozinho (`useCampoSalvo`, Tarefa 7): 1 s depois da última tecla, ao sair, em Ctrl/⌘S e ao esconder a página. */
function CampoDaFicha({ id, campo, rotulo, ajuda, longo = false, decimal = false, aoDigitar }: { id: string; campo: CampoDeTexto; rotulo: string; ajuda?: string; longo?: boolean; decimal?: boolean; aoDigitar?: () => void }) {
  const valor = useValor(id, campo)
  const c = useCampoSalvo({ tipo: 'objeto', reg: id, campo, valor })
  const idCampo = useId()
  const props = {
    id: idCampo,
    value: c.texto,
    onFocus: c.aoFocar,
    onBlur: () => void c.aoDesfocar(),
    'aria-describedby': ajuda ? `${idCampo}-ajuda` : undefined,
  }
  return (
    <div className="form-campo">
      <label htmlFor={idCampo}>{rotulo}</label>
      {longo ? (
        <textarea {...props} onChange={(e) => c.setTexto(e.target.value)} />
      ) : (
        <input
          {...props}
          type="text"
          autoComplete="off"
          inputMode={decimal ? 'decimal' : undefined}
          onChange={(e) => {
            c.setTexto(e.target.value)
            aoDigitar?.()
          }}
        />
      )}
      {ajuda && (
        <span id={`${idCampo}-ajuda`} className="form-ajuda">
          {ajuda}
        </span>
      )}
    </div>
  )
}

/**
 * Uma escolha (Sítio, Obra). Escolher uma opção grava o id e o rótulo juntos. O texto digitado à mão é o rótulo e grava
 * pelo `useCampoSalvo` (1 s depois da última tecla, ao sair, em Ctrl/⌘S e ao esconder a página, com a rede de segurança);
 * a primeira tecla tira o id, que não vale mais para um texto livre.
 */
function EscolhaDaFicha({ id, rotulo, campoId, campoRotulo, opcoes, livre, ajuda }: { id: string; rotulo: string; campoId: CampoDeTexto; campoRotulo: CampoDeTexto; opcoes: readonly OpcaoDeEscolha[]; livre?: (t: string) => OpcaoDeEscolha | null; ajuda?: string }) {
  const atual = useValor(id, campoRotulo)
  const atualId = useValor(id, campoId)
  const campo = useCampoSalvo({ tipo: 'objeto', reg: id, campo: campoRotulo, valor: atual })
  const limpouId = useRef(false)
  const [erro, setErro] = useState<string | null>(null)
  return (
    <>
      <CampoDeEscolha
        rotulo={rotulo}
        valor={campo.texto}
        aoMudarTexto={(t) => {
          campo.setTexto(t)
          if (atualId && !limpouId.current) {
            limpouId.current = true
            void registrar('objeto', id, 'alterar', { [campoId]: '' })
          }
        }}
        opcoes={opcoes}
        livre={livre}
        ajuda={ajuda}
        aoEscolher={(o) => {
          setErro(null)
          // "Novo sítio «…»" (Tarefa 12): o sítio e a ficha entram na MESMA gravação (tudo ou nada). Se falhar, nada foi gravado,
          // o texto continua no campo e a mensagem diz que dá para tentar de novo (nunca uma rejeição sem tratamento).
          if (eSitioNovoEscolhido(o.id)) {
            const nome = nomeDoSitioNovoEscolhido(o.id)
            void reservarIdDoSitio()
              .then((sitioId) => criarSitio({ nome }, { id: sitioId, junto: (sid, n) => [pedidoDeFicha(id, sid, n)] }))
              .then(
                () => {
                  limpouId.current = false
                  campo.setTexto(nome)
                },
                () => setErro(`Não foi possível criar o sítio «${nome}»; tente de novo. O que você escreveu continua no campo.`),
              )
            return
          }
          registrar('objeto', id, 'alterar', { [campoId]: o.id, [campoRotulo]: o.rotulo }).then(
            () => {
              limpouId.current = false
              campo.setTexto(o.rotulo)
            },
            () => setErro('Não foi possível guardar a escolha; tente de novo.'),
          )
        }}
        aoFocar={campo.aoFocar}
        aoDesfocar={() => void campo.aoDesfocar()}
      />
      {erro && (
        <p className="form-erro" role="alert">
          {erro}
        </p>
      )}
    </>
  )
}

/**
 * "Editar a ficha" (F) de um objeto SKC: os campos no lugar da ficha, cada um gravando sozinho. O período não se edita
 * aqui: ele deu o número, e um número confirmado não muda (o rascunho escolhe o período na cabeça da tela).
 */
export function EditarFicha({ id, aoFechar, foco }: { id: string; aoFechar: () => void; foco?: 'sitio' }) {
  const registro = useEstado((e) => e.registro('objeto', id))
  const raiz = useRef<HTMLElement>(null)
  useEffect(() => {
    // `foco`: o campo que a Revisão quer corrigir (o Sítio); senão, o primeiro.
    const rotulo = foco === 'sitio' ? [...(raiz.current?.querySelectorAll('label') ?? [])].find((l) => l.textContent === 'Sítio') : null
    const campo = rotulo?.htmlFor ? document.getElementById(rotulo.htmlFor) : null
    if (campo instanceof HTMLInputElement) {
      campo.focus()
      campo.scrollIntoView?.({ block: 'center' })
    } else raiz.current?.querySelector<HTMLInputElement>('input')?.focus()
  }, [foco])
  // Os sítios com o nome de agora e "Novo sítio «…»" (Tarefa 12).
  const { opcoes: opcoesDeSitio, livre: sitioNovoLivre } = useEscolhaDeSitio()
  const cargaDasObras = useCarregar(() => obras(), 'obras')
  const opcoesDeObra = useMemo<OpcaoDeEscolha[]>(
    () => (cargaDasObras.fase === 'ok' ? cargaDasObras.dados.map((o) => ({ id: o.id, rotulo: o.curta ?? o.titulo ?? o.id, apoio: o.curta && o.titulo ? o.titulo : undefined })) : []),
    [cargaDasObras],
  )
  if (!registro) return null
  const o = lerObjeto(registro)
  const teclar = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && (e.target as HTMLElement).getAttribute('aria-expanded') !== 'true') {
      e.preventDefault()
      e.stopPropagation()
      ;(document.activeElement as HTMLElement | null)?.blur()
      aoFechar()
    }
  }
  return (
    <section ref={raiz} className="objeto-editar" role="region" aria-label="Editar a ficha" onKeyDown={teclar}>
      <div className="objeto-editar-topo">
        <h2 className="form-secao-titulo">Editar a ficha</h2>
        <button type="button" className="objeto-botao" onClick={aoFechar}>
          Pronto
        </button>
      </div>
      <p className="form-ajuda">Cada campo se grava sozinho. As imagens se editam no painel da imagem («Editar», sob cada uma).</p>
      <CampoDaFicha id={id} campo="titulo" rotulo="Tipo e descrição curta" ajuda="Vira o título do objeto." />
      <p className="form-ajuda">
        Período: {o.periodo ? nomeDoPeriodo(o.periodo) : 'ainda não escolhido'} (dá o número; um número confirmado não muda, nem se a datação for revista).
      </p>
      <div className="objeto-editar-duas">
        <EscolhaDaFicha
          id={id}
          rotulo="Sítio"
          campoId="sitio"
          campoRotulo="sitioNome"
          opcoes={opcoesDeSitio}
          livre={sitioNovoLivre}
          ajuda="Busca nos sítios do banco e nas grafias. Um nome que não existe pode virar «Novo sítio»."
        />
        <CampoDaFicha id={id} campo="datacao" rotulo="Datação" ajuda="Texto livre, como na fonte." />
        <CampoDaFicha id={id} campo="material" rotulo="Material" />
      </div>
      <fieldset className="form-campo objeto-editar-medidas">
        <legend className="form-legenda">
          Medidas <span className="form-apoio">(cm)</span>
        </legend>
        <div className="form-linha form-medidas">
          <CampoDaFicha id={id} campo="altura" rotulo="Altura" decimal />
          <CampoDaFicha id={id} campo="largura" rotulo="Largura" decimal />
          <CampoDaFicha id={id} campo="espessura" rotulo="Espessura" decimal />
        </div>
      </fieldset>
      <div className="objeto-editar-duas">
        <CampoDaFicha id={id} campo="acervo" rotulo="Acervo" />
        <CampoDaFicha id={id} campo="inventario" rotulo="Inventário" />
      </div>
      <fieldset className="form-origens">
        <legend className="form-legenda">De onde vem</legend>
        <label className="form-origem-escolha">
          <input type="radio" name={`origem-${id}`} checked={o.origemTipo === 'publicacao'} onChange={() => void registrar('objeto', id, 'alterar', { origemTipo: 'publicacao' })} />
          Publicação
        </label>
        <label className="form-origem-escolha">
          <input type="radio" name={`origem-${id}`} checked={o.origemTipo === 'achado'} onChange={() => void registrar('objeto', id, 'alterar', { origemTipo: 'achado' })} />
          Achado recente / comunicação pessoal
        </label>
        {o.origemTipo === 'publicacao' ? (
          <>
            <EscolhaDaFicha id={id} rotulo="Obra" campoId="obra" campoRotulo="obraRotulo" opcoes={opcoesDeObra} ajuda="Busca na Bibliografia; o que não estiver lá fica como referência livre." />
            <div className="form-linha">
              <CampoDaFicha id={id} campo="pagina" rotulo="Página" />
              <CampoDaFicha id={id} campo="figura" rotulo="Figura" />
            </div>
          </>
        ) : (
          <CampoDaFicha id={id} campo="achado" rotulo="Nota do achado (quem, quando, onde)" longo />
        )}
      </fieldset>
    </section>
  )
}
