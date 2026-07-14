const RegistroService = require('../../services/RegistroService');

const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags
} = require('discord.js');

module.exports = {
    customId: 'btn_aprovar_',
    async execute(interaction, client, extractedId) {
        const registroId = extractedId;

        await interaction.deferReply({ ephemeral: true }).catch(() => null);

        if (RegistroService.isProcessing(registroId)) {
            return interaction.editReply({ content: 'Esta solicitação já está sendo processada por outro staff.' }).catch(() => null);
        }
        RegistroService.lockInteraction(registroId);

        try {
            const registro = await RegistroService.buscarRegistro(client, registroId);
            
            if (!registro || registro.status !== 'PENDENTE') {
                return interaction.editReply({ content: 'Este registro não está mais pendente ou não foi encontrado.' }).catch(() => null);
            }

            const registroAtualizado = await RegistroService.atualizarStatus(client, registroId, 'APROVADO', interaction.user.id);

            const membro = await interaction.guild.members.fetch(registro.discordId).catch(() => null);
            if (membro) {
                await membro.setNickname(registroAtualizado.nomePersonagem).catch(err => console.log(`[AVISO] Não foi possível alterar o apelido:`, err.message));
                await membro.roles.add(process.env.ROLE_APROVADO_ID).catch(err => console.log(`[AVISO] Não foi possível adicionar cargo:`, err.message));
                await membro.roles.remove(process.env.ROLE_REGISTRO_ID).catch(err => console.log(`[AVISO] Não foi possível remover cargo:`, err.message));
                
                const container = new ContainerBuilder()
                    .setAccentColor(382638)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent("# <:wumpus_wow:1467288238271102986> REGISTRO APROVADO!")
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `> <:valdotsmall:1392947288879665244> Parabéns! Seu registro no **GVRPNL** foi aprovado com sucesso.\n**Seu SSN:** \`${registroAtualizado.ssn}\``
                        )
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `### <:emoji_112:1452477047850012762> Personagem\nSeu personagem foi cadastrado e seu nome no servidor foi alterado para **${registroAtualizado.nomePersonagem}**.`
                        )
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            "### <:rpc2:1500318320853782669> Antes de começar\nRecomendamos que leia atentamente todas as regras do servidor antes de iniciar sua jornada."
                        )
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            "### <:suporteGVRPNL:1239389974923710504> Precisa de ajuda?\nEncontrou algum bug ou ficou com alguma dúvida? Entre em contato com a equipe da staff. Teremos prazer em ajudá-lo."
                        )
                    );

                await membro.send({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2
                }).catch(err => {
                    console.error('[ERRO DM] Falha ao enviar o container V2 para o usuário:', err);
                });
            }

            await RegistroService.registrarLog(client, 'APROVADO', registroAtualizado);

            // Cria um contêiner limpo para substituir o painel antigo
            const containerStaff = new ContainerBuilder()
                .setAccentColor(382638) // Cor de aprovação
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# Registro Aprovado\n\n**Personagem:** ${registroAtualizado.nomePersonagem}\n**Usuário:** <@${registroAtualizado.discordId}>\n**Aprovado por:** <@${interaction.user.id}>`
                    )
                );

            // Edita a mensagem original do painel da staff
            await interaction.message.edit({
                components: [containerStaff],
                flags: MessageFlags.IsComponentsV2
            }).catch(() => null);

            await interaction.editReply({ content: 'Registro aprovado com sucesso.' }).catch(() => null);

        } catch (error) {
            console.error('[ERRO] Falha no processo de aprovação:', error);
            await interaction.editReply({ content: 'Ocorreu um erro interno ao tentar processar esta aprovação.' }).catch(() => null);
        } finally {
            RegistroService.unlockInteraction(registroId);
        }
    }
};