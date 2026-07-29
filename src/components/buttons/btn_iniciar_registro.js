const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const RegistroService = require('../../services/RegistroService');
const WhitelistService = require('../../services/WhitelistService');
const { WL_PANEL_CHANNEL_ID } = require('../../config/channels');

function mençãoCanalWl() {
    const id = WL_PANEL_CHANNEL_ID;
    return id ? `<#${id}>` : '#wl-panel';
}

module.exports = {
    customId: 'btn_iniciar_registro',
    async execute(interaction, client) {
        // 0. Fallback de resultado de WL se a DM falhou (mostra e encerra; próximo clique segue o fluxo)
        const fallbackWl = WhitelistService.consumirFallback(interaction.user.id);
        if (fallbackWl) {
            return interaction.reply({ content: fallbackWl, ephemeral: true });
        }

        // 1. Whitelist obrigatória: só quem está APROVADO pode registrar
        const discordId = interaction.user.id;
        if (WhitelistService.buscarPendentePorDiscordId(discordId)) {
            return interaction.reply({
                content:
                    'Sua **Whitelist** ainda está **pendente** de análise pela staff.\n' +
                    'Aguarde a aprovação antes de registrar um personagem.',
                ephemeral: true
            });
        }

        if (!WhitelistService.estaAprovado(discordId)) {
            return interaction.reply({
                content:
                    'Você precisa ter a **Whitelist aprovada** antes de registrar um personagem.\n' +
                    `Vá em ${mençãoCanalWl()}, complete o formulário e aguarde a staff.`,
                ephemeral: true
            });
        }

        // 2. Verifica se o usuário está sob o tempo de espera do Anti-Spam
        const tempoRestante = RegistroService.obterTempoRestanteCooldown(discordId);
        if (tempoRestante > 0) {
            const minutosRestantes = Math.ceil(tempoRestante / 60000);
            return interaction.reply({
                content: `Você foi reprovado recentemente. Por favor, aguarde mais ${minutosRestantes} minuto(s) antes de tentar enviar uma nova solicitação.`,
                ephemeral: true
            });
        }

        // 3. Elegibilidade: pendente, ativo, arquivado (saída) ou deletado (CK) bloqueiam
        const podeRegistrar = await RegistroService.verificarElegibilidade(client, discordId);

        if (!podeRegistrar) {
            const existente = RegistroService.consultarRegistro({ discordId });
            let msg = 'Você já possui um registro pendente ou ativo em nosso sistema.';
            if (existente?.isArquivado) {
                const st = existente.registro.status;
                if (st === 'DELETADO') {
                    msg =
                        'Seu personagem está **deletado/arquivado** (CK/reset). ' +
                        'A staff precisa usar `/devolver_registro` antes de você poder registrar de novo.';
                } else {
                    msg =
                        'Seu personagem está **arquivado** (saída do servidor). ' +
                        'Reentre no servidor para restauração automática, ou peça à staff `/devolver_registro`.';
                }
            }
            return interaction.reply({ content: msg, ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId('modal_enviar_registro')
            .setTitle('Registro de Personagem');

        // Nick do Roblox: Geralmente de 3 a 20 caracteres
        const nickRobloxInput = new TextInputBuilder()
            .setCustomId('input_nickname_roblox')
            .setLabel('Nickname Roblox (Nome de exibição)')
            .setStyle(TextInputStyle.Short)
            .setMinLength(3)
            .setMaxLength(20)
            .setRequired(true);

        // Usuário do Roblox: Geralmente de 3 a 20 caracteres
        const userRobloxInput = new TextInputBuilder()
            .setCustomId('input_username_roblox')
            .setLabel('Username Roblox (Nome principal)')
            .setStyle(TextInputStyle.Short)
            .setMinLength(3)
            .setMaxLength(20)
            .setRequired(true);

        // Nome do Personagem: Suficiente para um nome próprio e sobrenomes (evita textos gigantes)
        const nomePersonagemInput = new TextInputBuilder()
            .setCustomId('input_nome_personagem')
            .setLabel('Nome completo do personagem')
            .setPlaceholder('No máximo 3 sobrenomes')
            .setStyle(TextInputStyle.Short)
            .setMinLength(5)
            .setMaxLength(50)
            .setRequired(true);

        // Idade: No máximo 3 caracteres (ex: 110) para evitar que digitem textos longos
        const idadeInput = new TextInputBuilder()
            .setCustomId('input_idade')
            .setLabel('Idade do personagem')
            .setStyle(TextInputStyle.Short)
            .setMinLength(2)
            .setMaxLength(3)
            .setRequired(true);

        // Local de Nascimento: Geralmente o nome de um estado, país ou cidade
        const localInput = new TextInputBuilder()
            .setCustomId('input_local_nascimento')
            .setLabel('Local de nascimento')
            .setStyle(TextInputStyle.Short)
            .setMinLength(3)
            .setMaxLength(30)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nickRobloxInput),
            new ActionRowBuilder().addComponents(userRobloxInput),
            new ActionRowBuilder().addComponents(nomePersonagemInput),
            new ActionRowBuilder().addComponents(idadeInput),
            new ActionRowBuilder().addComponents(localInput)
        );

        await interaction.showModal(modal);
    }
};