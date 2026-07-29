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
        .setName('conceder_wl')
        .setDescription('Concede whitelist manualmente a um jogador (sem precisar do formulário).')
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

        // Já tem WL aprovada
        if (WhitelistService.estaAprovado(discordId)) {
            return interaction.editReply({
                content: `<@${discordId}> já tem whitelist aprovada no sistema.`
            }).catch(() => null);
        }

        // Limpa qualquer pendente/sessão anterior
        await WhitelistService.deletarPorDiscordId(discordId);

        // Cria entrada diretamente como APROVADO
        const id = Date.now().toString();
        const registro = {
            id,
            discordId,
            discordTag: usuario.tag,
            answers: { userRoblox: '-' },
            status: 'APROVADO',
            motivoReprovacao: null,
            staffResponsavel: interaction.user.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        WhitelistService._salvarAprovado(registro);

        // Cargo de WL se configurado
        const membro = await interaction.guild.members.fetch(discordId).catch(() => null);
        if (membro) {
            if (process.env.ROLE_WL_ID) {
                await membro.roles.add(process.env.ROLE_WL_ID).catch(err =>
                    console.log(`[WL] Falha ao adicionar ROLE_WL_ID:`, err.message)
                );
            }
            if (process.env.ROLE_REGISTRO_ID) {
                await membro.roles.add(process.env.ROLE_REGISTRO_ID).catch(err =>
                    console.log(`[WL] Falha ao adicionar ROLE_REGISTRO_ID:`, err.message)
                );
            }

            // Notifica o jogador por DM
            const canalRegistro = process.env.REGISTRO_CHANNEL_ID
                ? `<#${process.env.REGISTRO_CHANNEL_ID}>`
                : '#registro-cidadao';

            const dmContainer = new ContainerBuilder()
                .setAccentColor(0x75F5E9)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '# <:SimGVRPNL:1228154618048155701> WHITELIST APROVADA!'
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `> <:valdotsmall:1392947288879665244> Olá, <@${discordId}>!\n` +
                        '> Sua **Whitelist** no **GVRPNL** foi concedida pela staff.\n\n' +
                        `> **Próximo passo:** acesse ${canalRegistro}, clique em **Registrar Personagem** e preencha o formulário.\n` +
                        '> Após aprovado pela staff, você estará totalmente liberado no servidor.'
                    )
                );

            await membro.send({
                components: [dmContainer],
                flags: MessageFlags.IsComponentsV2
            }).catch(() => null);
        }

        // Log
        await WhitelistService.registrarLog(client, 'APROVADO', registro);

        await interaction.editReply({
            content: `<:SimGVRPNL:1228154618048155701> Whitelist concedida para <@${discordId}>. Ele já pode acessar o registro de personagem.`
        }).catch(() => null);
    }
};
