import { Inter, Merriweather, Lora, Roboto_Mono, Libre_Baskerville, Source_Serif_4, Work_Sans, Comic_Neue, Newsreader } from 'next/font/google';

export const inter = Inter({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-inter',
});

export const merriweather = Merriweather({
    weight: ['300', '400', '700', '900'],
    style: ['normal', 'italic'],
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-merriweather',
});

export const lora = Lora({
    subsets: ['latin'],
    style: ['normal', 'italic'],
    display: 'swap',
    variable: '--font-lora',
});

export const roboto_mono = Roboto_Mono({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-roboto-mono',
});

export const libre_baskerville = Libre_Baskerville({
    weight: ['400', '700', '400'],
    style: ['normal', 'italic'],
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-libre-baskerville',
});

export const source_serif_4 = Source_Serif_4({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-source-serif',
});

export const work_sans = Work_Sans({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-work-sans',
});

export const comic_neue = Comic_Neue({
    weight: ['300', '400', '700'],
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-comic',
});

export const newsreader = Newsreader({
    subsets: ['latin'],
    style: ['normal', 'italic'],
    display: 'swap',
    variable: '--font-newsreader',
});
