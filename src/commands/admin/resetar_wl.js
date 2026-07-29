const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags
} = require('discord.js');
const WhitelistService = require('../../services/WhitelistService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resetar_wl')
        .setDescription('Reseta a whitelist pendente/sessão de um jogador para ele poder reenviar.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option =>
            option
                .setName('usuario')
                .setDescription('Mencione o usuário do Discord.')
                .setRequired(true)
        ),

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true }).catch(() => null);

        const usuario = interaction.options.getUser('usuario');
        const discordId = usuario.id;

        const pendente = WhitelistService.buscarPendentePorDiscordId(discordId);
        const sessao = WhitelistService.obterSessao(discordId);

        if (!pendente && !sessao) {
            return interaction.editReply({
                content: `<@${discordId}> não tem nenhuma WL pendente nem sessão em andamento.`
            }).catch(() => null);
        }

        // Remove tudo ligado a esse discord ID (pendente + sessão + cooldown)
        await WhitelistService.deletarPorDiscordId(discordId);

        const canalLogs = client.channels.cache.get(process.env.LOGS_CHANNEL_ID);
        if (canalLogs) {
            const logContainer = new ContainerBuilder()
                .setAccentColor(0xFF59A2)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '<:NoGVRPNL:1223380966924484650> **WL Resetada pela Staff**\n' +
                        '-# <:GVNL:1391202082920595556> LOG · WL · GVRPNL'
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:MembrosGVRPNL:1223380937698443324> **Jogador:** <@${discordId}>\n` +
                        `<:MembrosGVRPNL:1223380937698443324> **Resetado por:** <@${interaction.user.id}>\n` +
                        `-# Pendente removido. Jogador pode reenviar a WL.`
                    )
                );

            await canalLogs.send({
                components: [logContainer],
                flags: [MessageFlags.IsComponentsV2]
            }).catch(() => null);
        }

        await interaction.editReply({
            content: `<:SimGVRPNL:1228154618048155701> WL de <@${discordId}> resetada. Ele pode reenviar normalmente agora.`
        }).catch(() => null);
    }
};
