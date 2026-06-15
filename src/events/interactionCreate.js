import { queues } from '../music/queues.js';
import { buildNpEmbed, buildNpComponents } from '../commands/np.js';

export default {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (interaction.isButton() && interaction.customId.startsWith('np:')) {
            const queue = queues.get(interaction.guildId);
            const action = interaction.customId.split(':')[1];

            if (!queue?.playing) {
                return interaction.update({ content: 'Nothing playing.', embeds: [], components: [] });
            }

            if (action === 'pause') queue.pause();
            else if (action === 'skip') queue.skip();
            else if (action === 'stop') queue.stop();

            if (action === 'stop' || !queue.current) {
                return interaction.update({ content: '⏹️ Stopped.', embeds: [], components: [] });
            }

            return interaction.update({
                embeds: [buildNpEmbed(queue)],
                components: [buildNpComponents(queue)],
            });
        }

        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        if (interaction.isAutocomplete()) {
            try {
                await command.autocomplete?.(interaction);
            } catch (err) {
                console.error(err);
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        try {
            await command.execute(interaction, client);
        } catch (err) {
            console.error(err);
            const msg = { content: 'Command failed.', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(msg);
            } else {
                await interaction.reply(msg);
            }
        }
    }
};
