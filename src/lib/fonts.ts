type FontToken = {
    variable: string;
};

function createFontToken(variable: string): FontToken {
    return { variable };
}

export const inter = createFontToken("--font-inter");
export const merriweather = createFontToken("--font-merriweather");
export const lora = createFontToken("--font-lora");
export const roboto_mono = createFontToken("--font-roboto-mono");
export const libre_baskerville = createFontToken("--font-libre-baskerville");
export const source_serif_4 = createFontToken("--font-source-serif");
export const work_sans = createFontToken("--font-work-sans");
export const comic_neue = createFontToken("--font-comic");
export const newsreader = createFontToken("--font-newsreader");
