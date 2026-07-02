import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { reloadCookies } from "../services/music/stream.js";

export default {
    data: new SlashCommandBuilder()
        .setName("setcookies")
        .setDescription("Hot-reload YouTube cookies from an uploaded cookies.txt")
        .addAttachmentOption((opt) =>
            opt.setName("file").setDescription("Netscape-format cookies.txt").setRequired(true),
        )
        // Admin-only: hidden from regular members in the command picker.
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const ownerId = Deno.env.get("OWNER_ID");
        if (ownerId && interaction.user.id !== ownerId) {
            return interaction.reply({ content: "Not authorized.", flags: MessageFlags.Ephemeral });
        }

        const file = interaction.options.getAttachment("file", true);
        if (file.size > 1_000_000) {
            return interaction.reply({ content: "That's too big to be a cookies.txt.", flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const text = await (await fetch(file.url)).text();
        if (!text.includes("\t")) {
            return interaction.editReply("Doesn't look like a Netscape cookies.txt (no tab-separated fields).");
        }

        reloadCookies(text);
        await interaction.editReply(
            "Cookies reloaded — live immediately, no restart needed. This won't survive the next " +
                "deploy/restart though: also update the `YOUTUBE_COOKIES` config var on the host for that.",
        );
    },
};
