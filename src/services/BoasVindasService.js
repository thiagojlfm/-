const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    MessageFlags
} = require('discord.js');
const {
    CENTRAL_INFO_CHANNEL_ID,
    WL_PANEL_CHANNEL_ID
} = require('../config/channels');

/** Cor alinhada ao registro aprovado (btn_aprovar / criar_registro). */
const COR_BOAS_VINDAS = 382638;
const LOGO_URL =
    'https://media.discordapp.net/attachments/1194703945336111114/1442177700281188493/gv_nl_logo_geral.png?ex=6a5e4126&is=6a5cefa6&hm=1efb10f354fcddbe99ee260b27e4616d34a50b04fc24555159c0c17ff46db257&=&format=webp&quality=lossless';

/**
 * Monta o container de boas-vindas (Components V2), no estilo do "REGISTRO APROVADO".
 * @param {import('discord.js').User} user
 */
function criarContainerBoasVindas(user) {
    const canalWl =
        WL_PANEL_CHANNEL_ID != null && WL_PANEL_CHANNEL_ID !== ''
            ? `<#${WL_PANEL_CHANNEL_ID}>`
            : '#wl-panel';

    return new ContainerBuilder()
        .setAccentColor(COR_BOAS_VINDAS)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '# <:wumpus_wow:1467288238271102986> BEM-VINDO(A)!'
                    ),
                    new TextDisplayBuilder().setContent(
                        `> <:valdotsmall:1392947288879665244> Olá, <@${user.id}>!`
                    )
                )
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(LOGO_URL))
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '### <:rpc2:1500318320853782669> Informações\n' +
                    '> <:valdotsmall:1392947288879665244> Utilize o **menu de interação acima** para obter informações sobre o servidor. ' +
                    'Leia todas as informações com atenção.\n' +
                    `> <:valdotsmall:1392947288879665244> Quando estiver pronto(a), inicie o processo de whitelist em ${canalWl}. ` +
                    'Caso sua whitelist seja aprovada, você será redirecionado(a) para o **registro de personagens** ' +
                    'para começar sua história em nosso servidor!'
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '### <:suporteGVRPNL:1239389974923710504> Precisa de ajuda?\n' +
                    'Encontrou algum bug ou ficou com alguma dúvida? Entre em contato com a equipe da staff. ' +
                    'Teremos prazer em ajudá-lo.'
            )
        );
}

/**
 * Payload Components V2 (sem flag Ephemeral).
 * @param {import('discord.js').User} user
 */
function montarPayloadBoasVindas(user) {
    return {
        components: [criarContainerBoasVindas(user)],
        flags: MessageFlags.IsComponentsV2
    };
}

/**
 * Envia por DM (fallback quando ephemeral não existe ou falha).
 * @param {import('discord.js').User} user
 */
async function enviarBoasVindasDm(user) {
    try {
        const message = await user.send(montarPayloadBoasVindas(user));
        return { ok: true, via: 'dm', message };
    } catch (error) {
        const erro =
            error?.code === 50007
                ? 'DMs fechadas ou o usuário bloqueou o bot.'
                : error?.message || String(error);
        console.error(`[BOAS-VINDAS] Falha ao enviar DM para ${user.tag} (${user.id}): ${erro}`);
        return { ok: false, via: null, erro };
    }
}

/**
 * Tenta enviar como resposta ephemeral (só o usuário vê no canal).
 * Se falhar, cai no fallback de DM.
 *
 * @param {import('discord.js').ChatInputCommandInteraction | import('discord.js').Interaction} interaction
 * @param {import('discord.js').User} user: usuário “que entrou” (conteúdo da mensagem)
 * @returns {Promise<{ ok: boolean, via: 'ephemeral' | 'dm' | null, message?: import('discord.js').Message, erro?: string }>}
 */
async function enviarBoasVindasEphemeral(interaction, user) {
    const payload = {
        ...montarPayloadBoasVindas(user),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    };

    try {
        let message;
        if (interaction.replied || interaction.deferred) {
            message = await interaction.followUp(payload);
        } else {
            message = await interaction.reply({ ...payload, withResponse: false });
            // reply() retorna InteractionResponse; a mensagem ephemeral ainda foi enviada
            message = await interaction.fetchReply().catch(() => null);
        }
        return { ok: true, via: 'ephemeral', message: message ?? undefined };
    } catch (error) {
        console.warn(
            `[BOAS-VINDAS] Ephemeral falhou para ${user.tag}; tentando DM. Motivo:`,
            error?.message || error
        );
        return enviarBoasVindasDm(user);
    }
}

/**
 * Fluxo de entrada real (sem interação): só DM é possível.
 * @param {import('discord.js').Client} _client
 * @param {import('discord.js').GuildMember | import('discord.js').User} memberOrUser
 */
async function enviarBoasVindas(_client, memberOrUser) {
    const user = memberOrUser.user ?? memberOrUser;
    return enviarBoasVindasDm(user);
}

module.exports = {
    CENTRAL_INFO_CHANNEL_ID,
    WL_PANEL_CHANNEL_ID,
    LOGO_URL,
    criarContainerBoasVindas,
    montarPayloadBoasVindas,
    enviarBoasVindasDm,
    enviarBoasVindasEphemeral,
    enviarBoasVindas
};
