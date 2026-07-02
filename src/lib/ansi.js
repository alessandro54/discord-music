// Discord's `ansi` codeblock only understands the classic 16-color SGR codes
// (30-37 fg, 40-47 bg) — no 24-bit truecolor. krabby emits `38;2;r;g;b` /
// `48;2;r;g;b` sequences, so we quantize each to its nearest neighbor here.
// Palette pulled from Discord's ansi renderer (Solarized-based, the only
// colors it actually displays).
const FG_PALETTE = {
    30: [79, 84, 92],
    31: [220, 50, 47],
    32: [133, 153, 0],
    33: [181, 137, 0],
    34: [38, 139, 210],
    35: [211, 54, 130],
    36: [42, 161, 152],
    37: [255, 255, 255],
};
const BG_PALETTE = {
    40: [0, 43, 54],
    41: [203, 75, 22],
    42: [88, 110, 117],
    43: [101, 123, 131],
    44: [131, 148, 150],
    45: [108, 113, 196],
    46: [147, 161, 161],
    47: [253, 246, 227],
};

function nearest(palette, r, g, b) {
    let bestCode = null;
    let bestDist = Infinity;
    for (const [code, [pr, pg, pb]] of Object.entries(palette)) {
        const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
        if (dist < bestDist) {
            bestDist = dist;
            bestCode = code;
        }
    }
    return bestCode;
}

// Rewrites 24-bit truecolor SGR sequences to their nearest Discord-ansi
// equivalent. Also collapses the code length (~20 chars -> 5), which matters
// since embed descriptions cap at 4096 chars.
export function toDiscordAnsi(text) {
    return text
        .replace(
            /\x1b\[38;2;(\d+);(\d+);(\d+)m/g,
            (_, r, g, b) => `\x1b[${nearest(FG_PALETTE, +r, +g, +b)}m`,
        )
        .replace(
            /\x1b\[48;2;(\d+);(\d+);(\d+)m/g,
            (_, r, g, b) => `\x1b[${nearest(BG_PALETTE, +r, +g, +b)}m`,
        );
}
