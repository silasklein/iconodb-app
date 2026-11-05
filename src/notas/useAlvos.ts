import { useEffect, useMemo, useState } from 'react'
import { estadoAtual, useEstado } from '../usuario/estado'
import { alvosDosTextos, resolverAlvos, type AlvoResolvido } from './alvos'
import { chaveDoAlvo, type TipoDeRef } from './links'

const SEM_ALVOS: ReadonlyMap<string, AlvoResolvido> = new Map()

/**
 * Resolve os alvos que os textos ligam. Enquanto a resposta não chega (ou quando o banco não responde), o mapa é
 * vazio e o `TextoDaNota` desenha os links como links; quando chega, o que não existe vira texto com o marcador.
 * Refaz quando muda o conjunto de alvos ou o que a camada do usuário tem de coleções, sítios, hipóteses e objetos.
 */
export function useAlvos(textos: readonly string[]): ReadonlyMap<string, AlvoResolvido> {
  const alvos = useMemo(() => alvosDosTextos(textos), [textos.join('\u0001')]) // eslint-disable-line react-hooks/exhaustive-deps
  return useAlvosDe(alvos)
}

/** O mesmo, para alvos já conhecidos (por exemplo o alvo de cada nota de uma lista). */
export function useAlvosDe(alvos: readonly { tipo: TipoDeRef; ref: string }[]): ReadonlyMap<string, AlvoResolvido> {
  const chave = alvos.map((a) => chaveDoAlvo(a.tipo, a.ref)).join('|')
  // O que o usuário tem que um link pode apontar (a identidade dos mapas só muda quando algum deles muda).
  const colecoes = useEstado((e) => e.registros.get('colecao'))
  const sitios = useEstado((e) => e.registros.get('sitio'))
  const hipoteses = useEstado((e) => e.registros.get('hipotese'))
  const objetos = useEstado((e) => e.registros.get('objeto'))
  const [resolvidos, setResolvidos] = useState<ReadonlyMap<string, AlvoResolvido>>(SEM_ALVOS)

  useEffect(() => {
    if (alvos.length === 0) {
      setResolvidos(SEM_ALVOS)
      return
    }
    let vivo = true
    resolverAlvos(alvos, estadoAtual()).then(
      (m) => vivo && setResolvidos(m),
      () => vivo && setResolvidos(SEM_ALVOS),
    )
    return () => {
      vivo = false
    }
  }, [chave, colecoes, sitios, hipoteses, objetos]) // eslint-disable-line react-hooks/exhaustive-deps

  return resolvidos
}
