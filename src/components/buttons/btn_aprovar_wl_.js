const WhitelistService = require('../../services/WhitelistService');
const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags
} = require('discord.js');

module.exports = {
    customId: 'btn_aprovar_wl_',
    async execute(interaction, client, extractedId) {
        const wlId = extractedId;

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
                    .editReply({ content: 'Esta Whitelist não está mais pendente ou não foi encontrada.' })
                    .catch(() => null);
            }

            const membro = await interaction.guild.members.fetch(solicitacao.discordId).catch(() => null);
            if (!membro) {
                return interaction
                    .editReply({ content: 'Não foi possível encontrar o usuário no servidor.' })
                    .catch(() => null);
            }

            const atualizado = await WhitelistService.atualizarStatus(
                client,
                wlId,
                'APROVADO',
                interaction.user.id
            );

            // Libera acesso ao registro (mesmo cargo usado no fluxo de registro)
            const roleRegistro = process.env.ROLE_REGISTRO_ID;
            const roleWl = process.env.ROLE_WL_ID;
            if (roleRegistro) {
                await membro.roles.add(roleRegistro).catch(err =>
                    console.log(`[WL] Falha ao adicionar ROLE_REGISTRO_ID:`, err.message)
                );
            }
            if (roleWl) {
                await membro.roles.add(roleWl).catch(err =>
                    console.log(`[WL] Falha ao adicionar ROLE_WL_ID:`, err.message)
                );
            }

            const dmContainer = WhitelistService.montarNotificacaoAprovacao(membro.user);
            const dmEnviada = await WhitelistService.notificarDm(membro, dmContainer);
            if (!dmEnviada) {
                WhitelistService.enfileirarFallback(
                    membro.id,
                    WhitelistService.textoFallbackAprovacao()
                );
            }

            await WhitelistService.registrarLog(client, 'APROVADO', atualizado);

            const containerStaff = new ContainerBuilder()
                .setAccentColor(0x75F5E9)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '<:SimGVRPNL:1228154618048155701> **Whitelist Aprovada** <:white_dot:1373337479721123870> <:GVNL:1391202082920595556>\n' +
                            '-# Ação registrada pelo sistema de whitelist'
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:MembrosGVRPNL:1223380937698443324> **Jogador:** <@${atualizado.discordId}>\n` +
                            `<:valdotsmall:1392947288879665244> **Roblox:** \`${atualizado.answers?.userRoblox || '-'}\`\n` +
                            `<:SimGVRPNL:1228154618048155701> **Aprovado por:** <@${interaction.user.id}>\n\n` +
                            `-# <:SairGVRPNL:1228154685622583297> Jogador notificado e cargo de registro liberado.`
                    )
                );

            await interaction.message
                .edit({
                    components: [containerStaff],
                    flags: MessageFlags.IsComponentsV2
                })
                .catch(() => null);

            // Fallback ephemeral se DM falhar: o staff vê no reply; se o player ainda estiver
            // interagindo não aplica: mas documentamos no reply da staff. Para o player,
            // tentamos também um follow-up não é possível sem interação dele.
            // O contrato era: se não conseguir DM, fallback ephemeral: isso só funciona
            // na interação do player. Aqui o fallback é o aviso à staff + texto no reply.
            await interaction
                .editReply({
                    content: dmEnviada
                        ? '<:SimGVRPNL:1228154618048155701> Whitelist aprovada com sucesso. Jogador notificado por DM.'
                        : '<:SimGVRPNL:1228154618048155701> Whitelist aprovada! <:NoGVRPNL:1223380966924484650> ' +
                          '**Não foi possível enviar DM** (DMs fechadas). Avise o jogador manualmente de que ele **passou na WL** e pode registrar.'
                })
                .catch(() => null);
        } catch (error) {
            console.error('[WL] Falha na aprovação:', error);
            await interaction
                .editReply({ content: 'Ocorreu um erro interno ao processar esta aprovação.' })
                .catch(() => null);
        } finally {
            WhitelistService.unlockInteraction(wlId);
        }
    }
};
