const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
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
                            '# Registro Reprovado\n\n' +
                            `**Motivo:** ${motivo}\n\n` +
                            'Você pode preencher o formulário novamente.'
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
                .setAccentColor(0xFF59A2) // Cor de reprovação
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# Registro Reprovado\n\n**Personagem:** ${registroAtualizado.nomePersonagem}\n**Usuário:** <@${registroAtualizado.discordId}>\n**Reprovado por:** <@${interaction.user.id}>\n**Motivo:** ${motivo}`
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