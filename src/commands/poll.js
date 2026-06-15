import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a poll')
        .addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true))
        .addStringOption(o => o.setName('options').setDescription('Options separated by | (max 5). Leave empty for yes/no').setRequired(false)),
    async execute(interaction) {
        const question = interaction.options.getString('question');
        const raw = interaction.options.getString('options');
        const options = raw ? raw.split('|').map(o => o.trim()).slice(0, 5) : ['Yes', 'No'];
        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📊 ' + question)
            .setDescription(options.map((o, i) => `${emojis[i]} ${o}`).join('\n'))
            .setFooter({ text: `Poll by ${interaction.user.tag}` });

        const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
        for (let i = 0; i < options.length; i++) await msg.react(emojis[i]);
    }
};
