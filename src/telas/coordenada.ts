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
