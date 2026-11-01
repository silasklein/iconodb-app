import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { instalarMatchMedia } from './larguraDeTela'

// jsdom não tem matchMedia: por padrão a janela é de celular (375 px). Os testes de tela
// larga chamam instalarMatchMedia(1280).
if (typeof window !== 'undefined' && !window.matchMedia) instalarMatchMedia(375)

afterEach(() => {
  cleanup()
})
