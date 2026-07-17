const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');
const RegistroService = require('../../services/RegistroService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('criar_registro')
        .setDescription('Cria e aprova manualmente o registro de um jogador.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option =>
            option.setName('usuario').setDescription('Usuário do Discord.').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('nome_personagem').setDescription('Nome completo do personagem.').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('nick_roblox').setDescription('Nickname Roblox (nome de exibição).').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('user_roblox').setDescription('Username Roblox (nome principal).').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('local').setDescription('Local de nascimento do personagem.').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('idade').setDescription('Idade do personagem (mínimo 18).').setRequired(true)
        ),

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true }).catch(() => null);

        const usuarioAlvo = interaction.options.getUser('usuario');
        const nomePersonagem = interaction.options.getString('nome_personagem');
        const nickRoblox = interaction.options.getString('nick_roblox');
        const userRoblox = interaction.options.getString('user_roblox');
        const localNascimento = interaction.options.getString('local');
        const idadeRaw = interaction.options.getString('idade');

        const idade = parseInt(idadeRaw, 10);
        if (isNaN(idade) || !/^\d+$/.test(idadeRaw) || idade < 18) {
            return interaction.editReply({ content: 'Idade inválida. Deve ser um número inteiro maior ou igual a 18.' }).catch(() => null);
        }

        const membro = await interaction.guild.members.fetch(usuarioAlvo.id).catch(() => null);
        if (!membro) {
            return interaction.editReply({ content: 'Não foi possível encontrar esse usuário no servidor.' }).catch(() => null);
        }

        // Verifica se já tem registro aprovado
        const jaAprovado = RegistroService._lerAprovados().some(r => r.discordId === usuarioAlvo.id);
        if (jaAprovado) {
            return interaction.editReply({ content: 'Este usuário já possui um registro aprovado no sistema.' }).catch(() => null);
        }

        try {
            // Busca avatar do Roblox
            let avatarUrl = null;
            try {
                const dados = await RegistroService.buscarDadosRoblox(userRoblox);
                avatarUrl = dados.avatarUrl;
            } catch {
                console.log('[AVISO] Não foi possível buscar avatar do Roblox para criação manual.');
            }

            const ssn = RegistroService.gerarSSN();
            const registro = {
                id: Date.now().toString(),
                discordId: usuarioAlvo.id,
                nicknameOriginal: membro.displayName,
                nickRoblox,
                userRoblox,
                nomePersonagem,
                idade: idade.toString(),
                localNascimento,
                avatarUrl,
                ssn,
                status: 'APROVADO',
                motivoReprovacao: null,
                staffResponsavel: interaction.user.id,
                createdAt: new Date().toISOString()
            };

            RegistroService._salvarAprovado(registro);

            // Cargo e apelido
            await membro.setNickname(nomePersonagem).catch(err => console.log('[AVISO] Apelido:', err.message));
            await membro.roles.add(process.env.ROLE_APROVADO_ID).catch(err => console.log('[AVISO] Cargo aprovado:', err.message));
            await membro.roles.remove(process.env.ROLE_REGISTRO_ID).catch(err => console.log('[AVISO] Cargo registro:', err.message));

            // DM para o jogador
            const containerDM = new ContainerBuilder()
                .setAccentColor(382638)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('<:wumpus_wow:1467288238271102986> **REGISTRO APROVADO!**')
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `> <:valdotsmall:1392947288879665244> Parabéns! Seu registro no **GVRPNL** foi aprovado com sucesso.\n**Seu SSN:** \`${ssn}\``
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### <:rpc2:1500318320853782669> REGISTRO\n` +
                        `> <:valdotsmall:1392947288879665244> **Nome:** ${nomePersonagem}\n` +
                        `> <:valdotsmall:1392947288879665244> **Idade:** ${idade}\n` +
                        `> <:valdotsmall:1392947288879665244> **Local de nascimento:** ${localNascimento}\n` +
                        `> <:valdotsmall:1392947288879665244> **SSN:** ${ssn}`
                    )
                );

            if (avatarUrl) {
                containerDM.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL(avatarUrl).setDescription('Avatar do usuário Roblox')
                    )
                );
            }

            containerDM
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '### <:rpc2:1500318320853782669> Antes de começar\nRecomendamos que leia atentamente todas as regras do servidor antes de iniciar sua jornada.'
                    )
                );

            let dmEnviada = true;
            await membro.send({
                components: [containerDM],
                flags: MessageFlags.IsComponentsV2
            }).catch(err => {
                console.log(`[AVISO DM] Não foi possível enviar DM para ${membro.user.tag}: ${err.message}`);
                dmEnviada = false;
            });

            // Log e backup
            await RegistroService.registrarLog(client, 'APROVADO', registro);
            await RegistroService._enviarBackupRegistro(client, registro).catch(() => null);

            // Resposta para o staff
            await interaction.editReply({
                content: dmEnviada
                    ? `<:SimGVRPNL:1228154618048155701> Registro de **${nomePersonagem}** criado e aprovado com sucesso! SSN: \`${ssn}\``
                    : `<:SimGVRPNL:1228154618048155701> Registro criado! SSN: \`${ssn}\` <:NoGVRPNL:1223380966924484650> Não foi possível notificar o jogador por DM — avise manualmente.`
            }).catch(() => null);

        } catch (error) {
            console.error('[ERRO] Falha ao criar registro manual:', error);
            await interaction.editReply({ content: 'Ocorreu um erro interno ao criar o registro.' }).catch(() => null);
        }
    }
};
