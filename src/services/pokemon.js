import { toDiscordAnsi } from "../lib/ansi.js";

const POKEMON_COLORSCRIPTS = Deno.env.get("POKEMON_COLORSCRIPTS_PATH") || "pokemon-colorscripts";
const MAX_ART_LEN = 3800; // embed description caps at 4096; leave room for the ```ansi fences
const MAX_ATTEMPTS = 6;

const dec = new TextDecoder();

async function runPokemonColorscripts() {
    const { code, stdout, stderr } = await new Deno.Command(POKEMON_COLORSCRIPTS, {
        args: ["--random"],
        stdout: "piped",
        stderr: "piped",
    }).output();
    if (code !== 0) {
        throw new Error(`pokemon-colorscripts failed: ${dec.decode(stderr).trim() || "unknown error"}`);
    }
    // Output is "<name>\n<art>" — name line, then the sprite.
    const [name, ...artLines] = dec.decode(stdout).replace(/\n+$/, "").split("\n");
    const prettyName = name.trim().split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("-");
    return { name: prettyName, art: artLines.join("\n") };
}

// Returns { name, art } where `art` is ready to drop into a ```ansi codeblock.
// Retries a few times for a sprite small enough to fit; if every attempt is
// still oversized, falls back to the smallest one seen (trimmed to fit).
export async function getRandomPokemon() {
    let smallest = null;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const { name, art } = await runPokemonColorscripts();
        const converted = toDiscordAnsi(art);
        if (!smallest || converted.length < smallest.art.length) smallest = { name, art: converted };
        if (converted.length <= MAX_ART_LEN) return { name, art: converted };
    }
    return {
        name: smallest.name,
        art: smallest.art.length > MAX_ART_LEN ? smallest.art.slice(0, MAX_ART_LEN) + "\x1b[0m" : smallest.art,
    };
}
