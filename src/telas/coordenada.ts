/** Graus decimais como se lê em português: "31,913 N · 35,207 E". */
export function coordenadaEmGraus(lat: number, lon: number, casas: number): string {
  const grau = (v: number) => Math.abs(v).toFixed(casas).replace('.', ',')
  return `${grau(lat)} ${lat >= 0 ? 'N' : 'S'} · ${grau(lon)} ${lon >= 0 ? 'E' : 'W'}`
}

/**
 * Abrir no mapa (R18): um link externo ao OpenStreetMap, sem mapa dentro do app (que precisaria de rede).
 * Quem usa abre em outra aba, com rel="noopener".
 */
export function enderecoDoMapa(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=12/${lat}/${lon}`
}

// ---------------------------------------------------------------------------------------------------------------------
// Ler uma coordenada digitada ou colada (Tarefa 12). Sem rede e sem mapa: só texto.
// ---------------------------------------------------------------------------------------------------------------------

export type Lido<T> = ({ ok: true } & T) | { ok: false; erro: string }

/** A lista dos formatos que valem, dita em toda recusa. */
export const FORMATOS_DE_COORDENADA =
  'Use «31.77, 35.21», «31,77; 35,21», um link do OpenStreetMap (com #map=… ou mlat e mlon) ou um link do Google Maps (com @latitude,longitude).'

const emPtBr = (v: number) => String(v).replace('.', ',')
const NUM = String.raw`[+-]?\d+(?:[.,]\d+)?`
const NUM_PONTO = String.raw`[+-]?\d+(?:\.\d+)?`
const RE_NUMERO = new RegExp(`^${NUM}$`)
const RE_PAR_COM_VIRGULA = new RegExp(`^(${NUM_PONTO})\\s*([NSns])?\\s*,\\s*(${NUM_PONTO})\\s*([EWOewo])?$`)
const RE_PAR_COM_ESPACO = new RegExp(`^(${NUM})\\s*([NSns])?\\s+(${NUM})\\s*([EWOewo])?$`)
/** «maps.app.goo.gl/x», «www.openstreetmap.org/…»: um endereço colado sem o https://. */
const RE_ENDERECO_SEM_ESQUEMA = /^(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S*$/i
const RE_TOKEN = new RegExp(`^\\s*(${NUM})\\s*([A-Za-z])?\\s*$`)

const ERRO_LAT = (v: number) => `Latitude entre −90 e 90 (recebi ${emPtBr(v)}).`
const ERRO_LON = (v: number) => `Longitude entre −180 e 180 (recebi ${emPtBr(v)}).`
const generico = (t: string) => `Não reconheci «${t.trim().slice(0, 60)}» como coordenada. ${FORMATOS_DE_COORDENADA}`

/** Confere as faixas e devolve o par, ou a recusa. */
function conferir(lat: number, lon: number): Lido<{ lat: number; lon: number }> {
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) return { ok: false, erro: ERRO_LAT(lat) }
  if (!Number.isFinite(lon) || Math.abs(lon) > 180) return { ok: false, erro: ERRO_LON(lon) }
  return { ok: true, lat, lon }
}

/** Um número (ponto ou vírgula decimal) com o hemisfério, se vier (S e W/O dão negativo). */
function comHemisferio(numero: string, letra: string | undefined, eixo: 'lat' | 'lon'): Lido<{ valor: number }> {
  const v = Number(numero.replace(',', '.'))
  if (!letra) return { ok: true, valor: v }
  const l = letra.toUpperCase()
  const valida = eixo === 'lat' ? 'NS' : 'EWO'
  if (!valida.includes(l)) return { ok: false, erro: generico(`${numero} ${letra}`) }
  const negativa = l === 'S' || l === 'W' || l === 'O'
  if (v < 0 && (negativa || l === 'N' || l === 'E')) return { ok: false, erro: `O sinal de «${numero}» e o hemisfério «${letra.toUpperCase()}» não combinam: use só um dos dois.` }
  return { ok: true, valor: negativa ? -Math.abs(v) : v }
}

/** O que o iPhone compartilha («maps.app.goo.gl/…»): só uma abreviação, e abri-la exige a internet. */
const ERRO_LINK_CURTO =
  'Este é um link curto do Google Maps (maps.app.goo.gl, o que o iPhone compartilha). O app não consulta a internet para abri-lo, então não dá para ler a coordenada daqui. Abra o link no Google Maps, copie as coordenadas (toque e segure no ponto) e cole aqui, como «31.77, 35.21».'

function doLink(texto: string): Lido<{ lat: number; lon: number }> {
  let url: URL
  try {
    url = new URL(texto)
  } catch {
    return { ok: false, erro: generico(texto) }
  }
  const dono = url.hostname.toLowerCase().replace(/^www\./, '')
  if (/(^|\.)goo\.gl$/.test(dono) || dono === 'g.co') return { ok: false, erro: ERRO_LINK_CURTO }
  if (dono === 'openstreetmap.org' || dono === 'osm.org') {
    const mlat = url.searchParams.get('mlat')
    const mlon = url.searchParams.get('mlon')
    if (mlat !== null && mlon !== null && RE_NUMERO.test(mlat) && RE_NUMERO.test(mlon)) return conferir(Number(mlat), Number(mlon))
    const m = /map=\d+(?:\.\d+)?\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(url.hash)
    if (m) return conferir(Number(m[1]), Number(m[2]))
  } else if (/(^|\.)google\.[a-z.]+$/.test(dono)) {
    const m = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:[,z/]|$)/.exec(url.pathname)
    if (m) return conferir(Number(m[1]), Number(m[2]))
  }
  return { ok: false, erro: generico(texto) }
}

/**
 * Lê uma coordenada escrita ou colada (graus decimais; norte e leste positivos). Formatos que valem:
 * - `lat, lon` com PONTO decimal (a vírgula separa): «31.77, 35.21»;
 * - `lat; lon` ou `lat lon`, com vírgula ou ponto decimal: «31,77; 35,21», «31,77 35,21»;
 * - o que o próprio app mostra, com o hemisfério: «31,913 N · 35,207 E» (S, W e O dão negativo);
 * - link do OpenStreetMap (`#map=z/lat/lon` ou `?mlat=…&mlon=…`) e do Google Maps (`@lat,lon,zoom`).
 * Fora da faixa (latitude em −90 a 90, longitude em −180 a 180) e o ambíguo («31,77,35,21»; «31,35» sem espaço, que
 * pode ser um número) são recusados, com a lista dos formatos. Nada é adivinhado.
 */
export function lerCoordenada(texto: string): Lido<{ lat: number; lon: number }> {
  const t = texto.trim()
  if (t === '') return { ok: false, erro: `Escreva ou cole a coordenada. ${FORMATOS_DE_COORDENADA}` }
  if (/^https?:\/\//i.test(t)) return doLink(t)
  if (RE_ENDERECO_SEM_ESQUEMA.test(t)) return doLink(`https://${t}`)

  const par = (a: string, la: string | undefined, b: string, lb: string | undefined): Lido<{ lat: number; lon: number }> => {
    const lat = comHemisferio(a, la, 'lat')
    if (!lat.ok) return lat
    const lon = comHemisferio(b, lb, 'lon')
    if (!lon.ok) return lon
    return conferir(lat.valor, lon.valor)
  }

  if (/[;·]/.test(t)) {
    const partes = t.split(/[;·]/).map((p) => p.trim())
    if (partes.length !== 2 || partes.some((p) => p === '')) return { ok: false, erro: generico(t) }
    const a = RE_TOKEN.exec(partes[0]!)
    const b = RE_TOKEN.exec(partes[1]!)
    if (!a || !b) return { ok: false, erro: generico(t) }
    return par(a[1]!, a[2], b[1]!, b[2])
  }

  const virgula = RE_PAR_COM_VIRGULA.exec(t)
  if (virgula) {
    // «31,35» (sem ponto, sem espaço depois da vírgula) pode ser um número com vírgula, não um par: não se adivinha.
    if (!t.includes('.') && !/,\s/.test(t) && !virgula[2] && !virgula[4]) return { ok: false, erro: soUmNumero(t) }
    return par(virgula[1]!, virgula[2], virgula[3]!, virgula[4])
  }
  const espaco = RE_PAR_COM_ESPACO.exec(t)
  if (espaco) return par(espaco[1]!, espaco[2], espaco[3]!, espaco[4])
  if (RE_NUMERO.test(t)) return { ok: false, erro: soUmNumero(t) }
  if (/^[\d.,+\-\s]+$/.test(t) && (t.match(/,/g) ?? []).length >= 2) {
    return { ok: false, erro: `«${t}» é ambígua: não dá para saber onde a vírgula separa a latitude da longitude. ${FORMATOS_DE_COORDENADA}` }
  }
  return { ok: false, erro: generico(t) }
}

/**
 * O texto parece uma coordenada INTEIRA (um par, um link, um endereço), e não o número de um campo só? Então vai ao
 * `lerCoordenada`, que diz o que está errado (ambíguo, fora da faixa, link que não se lê); um número só segue para o campo.
 */
export function pareceCoordenadaInteira(texto: string): boolean {
  const t = texto.trim()
  if (t === '' || RE_NUMERO.test(t)) return false
  if (/^https?:\/\//i.test(t) || RE_ENDERECO_SEM_ESQUEMA.test(t)) return true
  if (!/\d/.test(t)) return false
  if (/[;·]/.test(t)) return true
  return (t.match(/[+-]?\d+(?:[.,]\d+)?/g) ?? []).length >= 2
}

/** Para um campo (latitude ou longitude) onde se escreveu ou colou mais que um número: o par, ou a recusa; `null`: é um número só. */
export function lerTextoDeCoordenada(texto: string): Lido<{ lat: number; lon: number }> | null {
  return pareceCoordenadaInteira(texto) ? lerCoordenada(texto) : null
}

const soUmNumero = (t: string) =>
  `«${t}» é um número só: falta a longitude. Separe a latitude e a longitude com ponto e vírgula, como em «31,77; 35,21», ou com vírgula e ponto decimal, como em «31.77, 35.21». ${FORMATOS_DE_COORDENADA}`

function umNumero(texto: string, rotulo: string, faixa: number, erroDaFaixa: (v: number) => string): Lido<{ valor: number }> {
  const t = texto.trim()
  if (t === '') return { ok: false, erro: `Escreva a ${rotulo}.` }
  if (!RE_NUMERO.test(t)) return { ok: false, erro: `Escreva a ${rotulo} como um número em graus decimais, por exemplo 31,38834.` }
  const v = Number(t.replace(',', '.'))
  return Math.abs(v) > faixa ? { ok: false, erro: erroDaFaixa(v) } : { ok: true, valor: v }
}

/** A latitude sozinha (o campo Latitude): vírgula ou ponto decimal, −90 a 90. */
export const lerLatitude = (texto: string): Lido<{ valor: number }> => umNumero(texto, 'latitude', 90, ERRO_LAT)
/** A longitude sozinha (o campo Longitude): vírgula ou ponto decimal, −180 a 180. */
export const lerLongitude = (texto: string): Lido<{ valor: number }> => umNumero(texto, 'longitude', 180, ERRO_LON)

/** Um número com até 5 casas e sem zeros à direita, em vírgula decimal. */
export function numeroAte5(v: number): string {
  const s = Math.abs(v).toFixed(5)
  return (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s).replace('.', ',')
}

/** Como se vê uma coordenada que a pessoa escreveu: até 5 casas, sem zeros à direita ("31,77 N · 35,21 E"). */
export const coordenadaAte5 = (lat: number, lon: number): string => `${numeroAte5(lat)} ${lat >= 0 ? 'N' : 'S'} · ${numeroAte5(lon)} ${lon >= 0 ? 'E' : 'W'}`
