import type { TextoDaIntroducao } from '../banco/tipos'

/** A língua do trecho: o português quando há tradução, senão o original alemão. */
export const linguaDoTrecho = (t: TextoDaIntroducao) => (t.texto !== null ? 'pt-BR' : 'de')

/** Um trecho da introdução: a tradução, ou o original quando falta, com o `lang` certo. */
export function TrechoDaIntroducao({ trecho, className }: { trecho: TextoDaIntroducao; className?: string }) {
  return (
    <p className={className} lang={linguaDoTrecho(trecho)}>
      {trecho.texto ?? trecho.original}
    </p>
  )
}

/**
 * A introdução aberta, a mesma no grupo e na subcoleção: o aviso quando falta tradução (toda ou em parte) e um
 * parágrafo por trecho, na ordem. Os avisos são `p.introducao-aviso`; os trechos, `p[lang]`.
 */
export function TrechosDaIntroducao({ trechos }: { trechos: TextoDaIntroducao[] }) {
  const traduzidos = trechos.filter((t) => t.texto !== null).length
  return (
    <>
      {traduzidos === 0 && <p className="introducao-aviso">Sem tradução ainda; o original, em alemão.</p>}
      {traduzidos > 0 && traduzidos < trechos.length && (
        <p className="introducao-aviso">Parte da introdução ainda sem tradução: esses trechos vão no original, em alemão.</p>
      )}
      {trechos.map((t) => (
        <TrechoDaIntroducao key={t.id} trecho={t} />
      ))}
    </>
  )
}
