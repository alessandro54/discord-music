export default {
    name: 'clientReady',
    once: true,
    execute(client) {
        console.log(`[ready] ${client.user.tag} — ${client.guilds.cache.size} guild(s)`);
        client.user.setActivity('/help');
    }
};
