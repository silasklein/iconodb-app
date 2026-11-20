import { useId } from 'react'
import { Link } from 'react-router'
import { caminhoDoParagrafo } from '../banco/paragrafos'
import type { IntervaloDeParagrafos } from '../banco/tipos'
import { Icon } from '../ui/Icon'
import { numeroPtBr } from '../ui/numero'
import './LivroEmParagrafos.css'

/*
 * As peças do livro em parágrafos (o GGG) nas Coleções (Etapa 4, Tarefa 26; tela 3 aprovada): o capítulo é o grupo de cima, a
 * seção é a subcoleção, e «Ler» abre o primeiro § (decisão 91, a8: a página do §, com ‹ › em ordem).
 */

/** «3 figuras», «1 figura». */
export const textoDeFiguras = (n: number) => `${numeroPtBr(n)} ${n === 1 ? 'figura' : 'figuras'}`
/** «2 seções», «1 seção». */
export const textoDeSecoes = (n: number) => `${numeroPtBr(n)} ${n === 1 ? 'seção' : 'seções'}`
/** «12 §§», «1 §». */
export const textoDeParagrafos = (n: number) => `${numeroPtBr(n)} ${n === 1 ? '§' : '§§'}`
/** «§§ 27–38», ou «§ 4» quando é um só. */
export const textoDoIntervalo = (i: IntervaloDeParagrafos) => (i.primeiro === i.ultimo ? `§ ${i.primeiro}` : `§§ ${i.primeiro}–${i.ultimo}`)

/** O número da seção com o ponto, como no caminho da página do § («1. Selos de prova…»; o número composto, «1.2», sem ponto). */
export const numeroDaSecao = (numero: string) => {
  const n = numero.trim().replace(/\.$/, '')
  return /^[\dIVXLC]+$/i.test(n) ? `${n}.` : n
}

/** O título da seção com o número antes: «1. Selos de prova da fase de teste». */
export const tituloDaSecao = (s: { numero: string | null; titulo: string }) => [s.numero ? numeroDaSecao(s.numero) : null, s.titulo].filter(Boolean).join(' ')

/** O nome acessível de uma seção na lista do capítulo: «1. Selos de prova…, 3 figuras, §§ 2–3». */
export const rotuloDaSecaoNaLista = (s: { numero: string; titulo: string; objetos: number; paragrafos: IntervaloDeParagrafos | null }) =>
  [tituloDaSecao(s), textoDeFiguras(s.objetos), s.paragrafos ? textoDoIntervalo(s.paragrafos) : null].filter(Boolean).join(', ')

/**
 * «TESTEG · Capítulo I», «TESTEG · Seção 1»: o rótulo de cima do capítulo e da seção (no lugar do período). O capítulo sem
 * número é o Adendo do livro (regra (b) do controlador, Etapa 4: o GGG só tem um, o adendo da última edição): «GGG · Adendo».
 * A seção sempre tem número (o schema exige `numero` na subcoleção).
 */
export const rotuloDoCapitulo = (obra: string, numero: string | null) => [obra, numero ? `Capítulo ${numero.replace(/\.$/, '')}` : 'Adendo'].join(' · ')
export const rotuloDaSecao = (obra: string, numero: string | null) => [obra, numero ? `Seção ${numero.replace(/\.$/, '')}` : 'Seção'].join(' · ')

/**
 * «Ler o capítulo §§ 27–38, em sequência» (o link de texto do capítulo) ou «Ler a seção» (o botão da seção): abre a página do
 * primeiro § (a8).
 */
export function LerOsParagrafos({ sigla, intervalo, rotulo, botao = false }: { sigla: string; intervalo: IntervaloDeParagrafos; rotulo: string; botao?: boolean }) {
  return (
    <Link className={botao ? 'ler-paragrafos ler-paragrafos-botao' : 'ler-paragrafos'} to={caminhoDoParagrafo(sigla, intervalo.primeiro)}>
      <Icon name="glossario" size={botao ? 18 : 16} />
      <span className="ler-paragrafos-rotulo">{rotulo}</span>
      {!botao && <span className="ler-paragrafos-intervalo"> {textoDoIntervalo(intervalo)}, em sequência</span>}
    </Link>
  )
}

/** «§§ desta seção»: cada § com a primeira frase (o português, ou o original), um link à página dele. */
export function ParagrafosDaSecao({ sigla, paragrafos }: { sigla: string; paragrafos: readonly { numero: number; frase: string | null }[] }) {
  const id = useId()
  if (paragrafos.length === 0) return null
  return (
    <section className="paragrafos-da-secao" aria-labelledby={id}>
      <div className="grupo-objetos-topo">
        <h2>
          <span id={id}>§§ desta seção</span> <span className="codigo">{numeroPtBr(paragrafos.length)}</span>
        </h2>
      </div>
      <ul aria-labelledby={id}>
        {paragrafos.map((p) => (
          <li key={p.numero}>
            <Link className="paragrafos-da-secao-linha" to={caminhoDoParagrafo(sigla, p.numero)}>
              <span className="paragrafos-da-secao-numero">§ {p.numero}</span>
              <span className="paragrafos-da-secao-frase">{p.frase ?? '—'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
