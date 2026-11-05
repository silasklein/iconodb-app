import type { Marca } from '../usuario/textosDaSync'
import { Icon } from './Icon'
import './IconeDeSincronizacao.css'

/**
 * As marcas do glifo de sincronização (PC-Sincronizacao.dc.html): o glifo é sempre o mesmo, só muda a marca
 * no canto. Decorativas: quem usa dá o nome acessível. Ficam presas ao pai (o botão, ou o `solto`).
 * - ponto: algo por enviar (6 px, como o da Revisão);
 * - girando: as setas giram (uma volta a cada 1,2 s; paradas com prefers-reduced-motion);
 * - traco: sem internet (traço diagonal sobre o glifo);
 * - erro: selo redondo com ponto de exclamação;
 * - aviso: triângulo vazado com ponto de exclamação (algo a olhar, mas sem impedir de sincronizar).
 */
export function MarcasDeSincronizacao({ marca }: { marca: Marca }) {
  return (
    <>
      <span className={marca === 'girando' ? 'sync-glifo sync-girando' : 'sync-glifo'}>
        <Icon name="sincronizar" />
      </span>
      {marca === 'ponto' && <span className="sync-marca-ponto" data-marca="ponto" aria-hidden="true" />}
      {marca === 'girando' && <span hidden data-marca="girando" />}
      {marca === 'traco' && (
        <svg className="sync-marca-traco" data-marca="traco" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeLinecap="round" aria-hidden="true" focusable="false">
          <path d="M4 4l16 16" className="sync-traco-fundo" strokeWidth="4.5" />
          <path d="M4 4l16 16" className="sync-traco-linha" strokeWidth="1.5" />
        </svg>
      )}
      {marca === 'erro' && (
        <svg className="sync-marca-erro" data-marca="erro" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <circle cx="6" cy="6" r="6" className="sync-erro-disco" />
          <path d="M6 3v3.6" className="sync-erro-sinal" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="6" cy="8.9" r="0.95" className="sync-erro-ponto" />
        </svg>
      )}
      {marca === 'aviso' && (
        <svg className="sync-marca-aviso" data-marca="aviso" width="13" height="13" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
          <path d="M7 1.2 13 12.4H1z" className="sync-aviso-fundo" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M7 5.2v3.2" className="sync-aviso-sinal" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="7" cy="10.3" r="0.8" className="sync-erro-ponto" />
        </svg>
      )}
    </>
  )
}

/** O glifo com a marca, solto (20 px), para o Menu e a tela de Sincronização. */
export function IconeDeSincronizacao({ marca }: { marca: Marca }) {
  return (
    <span className="sync-icone-solto" aria-hidden="true">
      <MarcasDeSincronizacao marca={marca} />
    </span>
  )
}
