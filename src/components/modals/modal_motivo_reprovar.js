const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const RegistroService = require('../../services/RegistroService');

module.exports = {
    customId: 'modal_motivo_reprovar_',
    async execute(interaction, client, extractedId) {
        const registroId = extractedId;
        const motivo = interaction.fields.getTextInputValue('input_motivo');

        await interaction.deferReply({ ephemeral: true }).catch(() => null);

        if (RegistroService.isProcessing(registroId)) {
            return interaction.editReply({ content: 'Esta solicitação já está sendo processada por outro staff.' }).catch(() => null);
        }
        RegistroService.lockInteraction(registroId);

        try {
            const registro = await RegistroService.buscarRegistro(client, registroId);
            
            if (!registro || registro.status !== 'PENDENTE') {
                return interaction.editReply({ content: 'Este registro não está mais pendente.' }).catch(() => null);
            }

            const registroAtualizado = await RegistroService.atualizarStatus(client, registroId, 'REPROVADO', interaction.user.id, motivo);

            const membro = await interaction.guild.members.fetch(registro.discordId).catch(() => null);
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
                            '<:NoGVRPNL:1223380966924484650> Eita... desta vez não rolou.\n\n' +
                            'Sua solicitação passou pela equipe de staff e infelizmente **não foi aprovada**. Mas calma, isso não significa o fim. Acontece mais do que você imagina!\n\n' +
                            `<:info:1373983629746638938> **O que o staff observou:**\n> ${motivo}`
                        )
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            '<:FogueteGVRPNL:1240803507028627527> Revise, o ponto acima, ajuste sua ficha e **tente novamente!** . Queremos te ver aqui no servidor!\n' +
                            '<:DvidaGVRPNL:1223381990162829393> Surgiu alguma dúvida? Abre um ticket, a equipe tá aqui pra ajudar.\n\n' +
                            '-# <:tempo_gvrpnl:1466937443545780437> Até breve!'
                        )
                    );

                await membro.send({ 
                    components: [containerMsg],
                    flags: [MessageFlags.IsComponentsV2]
                }).catch(() => null);
            }

            await RegistroService.registrarLog(client, 'REPROVADO', registroAtualizado);

            // Cria um contêiner limpo para substituir o painel antigo
            const containerStaff = new ContainerBuilder()
                .setAccentColor(0xFF59A2)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '<:NoGVRPNL:1223380966924484650> **Registro Reprovado**\n' +
                        '-# <:white_dot:1373337479721123870> <:GVNL:1391202082920595556> WL · GVRPNL'
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:MembrosGVRPNL:1223380937698443324> **Jogador:** <@${registroAtualizado.discordId}>\n` +
                        `<:valdotsmall:1392947288879665244> **Personagem:** ${registroAtualizado.nomePersonagem}\n` +
                        `<:lock_gvrpnl:1466937465674792990> **Reprovado por:** <@${interaction.user.id}>`
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:info:1373983629746638938> **Motivo:**\n> ${motivo}\n\n` +
                        '-# <:SairGVRPNL:1228154685622583297> Jogador notificado via DM. Pode submeter um novo registro.'
                    )
                );

            // Edita a mensagem original do painel da staff
            await interaction.message.edit({
                components: [containerStaff],
                flags: MessageFlags.IsComponentsV2
            }).catch(() => null);

            await interaction.editReply({ content: 'Registro reprovado com sucesso.' }).catch(() => null);

        } finally {
            RegistroService.unlockInteraction(registroId);
        }
    }
};