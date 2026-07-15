const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const RegistroService = require('../../services/RegistroService');

module.exports = {
    customId: 'modal_enviar_registro',
    async execute(interaction, client, extractedId) {
        const nickRoblox = interaction.fields.getTextInputValue('input_nickname_roblox');
        const userRoblox = interaction.fields.getTextInputValue('input_username_roblox');
        const nomePersonagem = interaction.fields.getTextInputValue('input_nome_personagem');
        const idadeRaw = interaction.fields.getTextInputValue('input_idade').trim();
        const localNascimento = interaction.fields.getTextInputValue('input_local_nascimento');
        
        // Validação estrita de idade: deve ser número e maior ou igual a 18
        const idade = parseInt(idadeRaw, 10);
        if (isNaN(idade) || !/^\d+$/.test(idadeRaw)) {
            return interaction.reply({
                content: 'A idade do personagem precisa ser um número inteiro válido (ex: 20).',
                ephemeral: true
            });
        }

        if (idade < 18) {
            return interaction.reply({
                content: 'Apenas personagens com idade maior ou igual a 18 anos são permitidos no servidor.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        let dadosRoblox;
        try {
            dadosRoblox = await RegistroService.buscarDadosRoblox(userRoblox);
        } catch (error) {
            console.error('[ERRO ROBLOX] Falha ao consultar usuário/avatar:', error);
            return interaction.editReply({
                content: `Não foi possível validar o username do Roblox: ${error.message}`
            });
        }

        const registro = await RegistroService.criarRegistro(client, {
            discordId: interaction.user.id,
            nicknameOriginal: interaction.member.displayName,
            nickRoblox,
            userRoblox,
            robloxUserId: dadosRoblox.userId,
            avatarUrl: dadosRoblox.avatarUrl,
            nomePersonagem,
            idade: idade.toString(),
            localNascimento
        });

        await interaction.editReply({
            content: 'Seu registro foi enviado com sucesso. Aguarde a análise da equipe.\n\nAviso: Todos os dados preenchidos aqui são estritamente fictícios e utilizados apenas para a criação do seu personagem dentro do servidor.', 
            ephemeral: true 
        });

        const painelStaff = client.channels.cache.get(process.env.STAFF_PANEL_CHANNEL_ID);
        if (!painelStaff) return;

        const containerStaff = new ContainerBuilder()
            .setAccentColor(0x6E4D5F)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    '<:tempo_gvrpnl:1466937443545780437> **Nova solicitação de registro**\n' +
                    '-# <:GVNL:1391202082920595556> WL · GVRPNL — Aguardando avaliação'
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `<:MembrosGVRPNL:1223380937698443324> **Jogador:** <@${interaction.user.id}>\n` +
                    `<:valdotsmall:1392947288879665244> **Nick Roblox:** \`${nickRoblox}\` (\`@${userRoblox}\`)\n` +
                    `<:valdotsmall:1392947288879665244>**Personagem:** \`${nomePersonagem}\`\n` +
                    `<:info:1373983629746638938> **Idade:** \`${idade} anos\` <:valdotsmall:1392947288879665244>**Origem:** \`${localNascimento}\``
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `-# <:lock_gvrpnl:1466937465674792990> ID do registro: \`${registro.id}\``
                )
            )
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`btn_aprovar_${registro.id}`)
                        .setLabel('Aprovar')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`btn_reprovar_${registro.id}`)
                        .setLabel('Reprovar')
                        .setStyle(ButtonStyle.Danger)
                )
            );

        await painelStaff.send({ 
            components: [containerStaff],
            flags: [MessageFlags.IsComponentsV2]
        });
        
        await RegistroService.registrarLog(client, 'CRIADO', registro);
    }
};
