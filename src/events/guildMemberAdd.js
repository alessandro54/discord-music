import { CHANNEL_IDS } from "../lib/constants.js";
import { embed } from "../lib/embeds.js";

export default {
    name: "guildMemberAdd",
    async execute(member) {
        const channel = member.guild.channels.cache.get(CHANNEL_IDS.WELCOME);
        if (!channel) return;

        channel.send({
            embeds: [
                embed()
                    .setTitle("Welcome! 🎮")
                    .setDescription(
                        `Hey ${member}, glad you're here!\nCheck out <#${CHANNEL_IDS.RULES}> to get started.`,
                    )
                    .setThumbnail(member.user.displayAvatarURL())
                    .setFooter({ text: `Member #${member.guild.memberCount}` }),
            ],
        });
    },
};
