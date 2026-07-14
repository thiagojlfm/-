const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setupregistro')
        .setDescription('Envia o painel de registro para os cidadãos.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const container = new ContainerBuilder()
                .setAccentColor(0x3C166C)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '# Central de Registro\n\nInicie o formulário de registro do seu personagem clicando no botão abaixo.'
                    )
                )
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('btn_iniciar_registro')
                            .setLabel('Registrar Personagem')
                            .setStyle(ButtonStyle.Primary)
                    )
                );

            await interaction.channel.send({ 
                components: [container],
                flags: [MessageFlags.IsComponentsV2]
            });
            
            await interaction.editReply({ content: 'Painel V2 criado com sucesso.' });
            
        } catch (error) {
            console.error('Erro ao executar o comando setupregistro:', error);
            if (interaction.deferred) {
                await interaction.editReply({ content: 'Houve um erro ao tentar criar o painel.' });
            } else {
                await interaction.reply({ content: 'Houve um erro ao tentar criar o painel.', ephemeral: true });
            }
        }
    }
};