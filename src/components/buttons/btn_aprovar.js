const RegistroService = require('../../services/RegistroService');

const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
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

            const membro = await interaction.guild.members.fetch(registro.discordId).catch(() => null);
            if (!membro) {
                return interaction.editReply({ content: 'Não foi possível encontrar o usuário no servidor.' }).catch(() => null);
            }

            // Reserva o SSN antes do DM para que a mensagem e o JSON tenham o mesmo valor.
            registro.ssn = RegistroService.gerarSSN();
            registro.staffResponsavel = interaction.user.id;
            const registroAtualizado = registro;
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
                            `### <:rpc2:1500318320853782669> REGISTRO\n` +
                            `> <:valdotsmall:1392947288879665244> **Nome:** ${registroAtualizado.nomePersonagem}\n` +
                            `> <:valdotsmall:1392947288879665244> **Idade:** ${registroAtualizado.idade}\n` +
                            `> <:valdotsmall:1392947288879665244> **Local de nascimento:** ${registroAtualizado.localNascimento}\n` +
                            `> <:valdotsmall:1392947288879665244> **SSN:** ${registroAtualizado.ssn}`
                        )
                    )
                    .addMediaGalleryComponents(
                        new MediaGalleryBuilder().addItems(
                            new MediaGalleryItemBuilder()
                                .setURL(registroAtualizado.avatarUrl)
                                .setDescription('Avatar do usuário Roblox')
                        )
                    )
                     .addSeparatorComponents(
                        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
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

            let dmEnviada = true;
            await membro.send({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            }).catch(err => {
                console.log(`[AVISO DM] Não foi possível enviar DM para ${membro.user.tag}: ${err.message}`);
                dmEnviada = false;
            });

            await RegistroService.atualizarStatus(client, registroId, 'APROVADO', interaction.user.id);
            await membro.setNickname(registroAtualizado.nomePersonagem).catch(err => console.log(`[AVISO] Não foi possível alterar o apelido:`, err.message));
            await membro.roles.add(process.env.ROLE_APROVADO_ID).catch(err => console.log(`[AVISO] Não foi possível adicionar cargo:`, err.message));
            await membro.roles.remove(process.env.ROLE_REGISTRO_ID).catch(err => console.log(`[AVISO] Não foi possível remover cargo:`, err.message));

            await RegistroService.registrarLog(client, 'APROVADO', registroAtualizado);

            // Cria um contêiner limpo para substituir o painel antigo
            const containerStaff = new ContainerBuilder()
                .setAccentColor(0x75F5E9)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '<:SimGVRPNL:1228154618048155701> **Registro Aprovado** <:white_dot:1373337479721123870> <:GVNL:1391202082920595556>\n' +
                        '-# Ação registrada pelo sistema de whitelist'
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:MembrosGVRPNL:1223380937698443324> **Jogador:** <@${registroAtualizado.discordId}>\n` +
                        `<:valdotsmall:1392947288879665244> **Personagem:** ${registroAtualizado.nomePersonagem}\n` +
                        `<:SimGVRPNL:1228154618048155701> **Aprovado por:** <@${interaction.user.id}>\n\n` +
                        `-# <:SairGVRPNL:1228154685622583297> Jogador notificado via DM e cargo atualizado.`
                    )
                );

            // Edita a mensagem original do painel da staff
            await interaction.message.edit({
                components: [containerStaff],
                flags: MessageFlags.IsComponentsV2
            }).catch(() => null);

            await interaction.editReply({
                content: dmEnviada
                    ? '<:SimGVRPNL:1228154618048155701> Registro aprovado com sucesso.'
                    : '<:SimGVRPNL:1228154618048155701> Registro aprovado! <:NoGVRPNL:1223380966924484650> Não foi possível notificar o jogador por DM (DMs fechadas ou sem servidores mútuos). Avise manualmente.'
            }).catch(() => null);

        } catch (error) {
            console.error('[ERRO] Falha no processo de aprovação:', error);
            await interaction.editReply({ content: 'Ocorreu um erro interno ao tentar processar esta aprovação.' }).catch(() => null);
        } finally {
            RegistroService.unlockInteraction(registroId);
        }
    }
};
