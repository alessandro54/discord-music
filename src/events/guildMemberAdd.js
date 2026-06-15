import { EmbedBuilder } from 'discord.js';

const WELCOME_CHANNEL_ID = '902775878075940905';

export default {
    name: 'guildMemberAdd',
    async execute(member) {
        const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Welcome! 🎮')
            .setDescription(`Hey ${member}, glad you're here!\nCheck out <#907823328369180682> to get started.`)
            .setThumbnail(member.user.displayAvatarURL())
            .setFooter({ text: `Member #${member.guild.memberCount}` });

        channel.send({ embeds: [embed] });
    }
};
