const WhitelistService = require('../../services/WhitelistService');
const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags
} = require('discord.js');

module.exports = {
    customId: 'modal_motivo_reprovar_wl_',
    async execute(interaction, client, extractedId) {
        const wlId = extractedId;
        const motivo = interaction.fields.getTextInputValue('input_motivo');

        await interaction.deferReply({ ephemeral: true }).catch(() => null);

        if (WhitelistService.isProcessing(wlId)) {
            return interaction
                .editReply({ content: 'Esta solicitação já está sendo processada por outro staff.' })
                .catch(() => null);
        }
        WhitelistService.lockInteraction(wlId);

        try {
            const solicitacao = await WhitelistService.buscarSolicitacao(wlId);

            if (!solicitacao || solicitacao.status !== 'PENDENTE') {
                return interaction
                    .editReply({ content: 'Esta Whitelist não está mais pendente.' })
                    .catch(() => null);
            }

            const atualizado = await WhitelistService.atualizarStatus(
                client,
                wlId,
                'REPROVADO',
                interaction.user.id,
                motivo
            );

            const membro = await interaction.guild.members.fetch(solicitacao.discordId).catch(() => null);
            let dmEnviada = false;

            if (membro) {
                const containerMsg = new ContainerBuilder()
                    .setAccentColor(0xFF59A2)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            '<:GVNL:1391202082920595556> **WL · GVRPNL**\n' +
                                '-# <:white_dot:1373337479721123870> Sistema de Whitelist'
                        )
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            '<:NoGVRPNL:1223380966924484650> Sua **Whitelist** não foi aprovada desta vez.\n\n' +
                                `<:info:1373983629746638938> **O que a staff observou:**\n> ${motivo}`
                        )
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            '<:FogueteGVRPNL:1240803507028627527> Revise as regras e tente novamente após o cooldown de **10 minutos**.\n' +
                                '<:DvidaGVRPNL:1223381990162829393> Dúvidas? Abra um ticket com a staff.\n\n' +
                                '-# <:tempo_gvrpnl:1466937443545780437> Até breve!'
                        )
                    );

                dmEnviada = await WhitelistService.notificarDm(membro, containerMsg);
                if (!dmEnviada) {
                    WhitelistService.enfileirarFallback(
                        membro.id,
                        '<:NoGVRPNL:1223380966924484650> **Você foi reprovado na Whitelist.**\n' +
                            `**Motivo:** ${motivo}\n\n` +
                            'Aguarde **10 minutos** e tente novamente após revisar as regras.'
                    );
                }
            }

            await WhitelistService.registrarLog(client, 'REPROVADO', atualizado);

            const containerStaff = new ContainerBuilder()
                .setAccentColor(0xFF59A2)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '<:NoGVRPNL:1223380966924484650> **Whitelist Reprovada**\n' +
                            '-# <:white_dot:1373337479721123870> <:GVNL:1391202082920595556> WL · GVRPNL'
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:MembrosGVRPNL:1223380937698443324> **Jogador:** <@${atualizado.discordId}>\n` +
                            `<:valdotsmall:1392947288879665244> **Roblox:** \`${atualizado.answers?.userRoblox || '-'}\`\n` +
                            `<:lock_gvrpnl:1466937465674792990> **Reprovado por:** <@${interaction.user.id}>`
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:info:1373983629746638938> **Motivo:**\n> ${motivo}\n\n` +
                            '-# Cooldown de 10 minutos aplicado. Jogador pode reenviar depois.'
                    )
                );

            await interaction.message
                .edit({
                    components: [containerStaff],
                    flags: MessageFlags.IsComponentsV2
                })
                .catch(() => null);

            await interaction
                .editReply({
                    content: dmEnviada
                        ? 'Whitelist reprovada. Jogador notificado por DM (cooldown 10 min).'
                        : 'Whitelist reprovada. <:NoGVRPNL:1223380966924484650> **Não foi possível enviar DM.** ' +
                          'Avise o jogador manualmente de que foi **reprovado na WL** e do motivo. Cooldown: 10 min.'
                })
                .catch(() => null);
        } finally {
            WhitelistService.unlockInteraction(wlId);
        }
    }
};
