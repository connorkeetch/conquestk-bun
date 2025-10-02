declare module 'favico.js' {
  interface FavicoOptions {
    animation?: 'slide' | 'fade' | 'pop' | 'popFade' | 'none'
    position?: 'up' | 'down' | 'left' | 'upleft' | 'right'
    bgColor?: string
    textColor?: string
    fontFamily?: string
    fontStyle?: string
    type?: 'circle' | 'rectangle'
  }

  class Favico {
    constructor(options?: FavicoOptions)
    badge(count: number | string): void
    reset(): void
    image(element: HTMLElement): void
  }

  export = Favico
}
