const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

/**
 * Discord: label ≤ 45, placeholder ≤ 100.
 * Labels curtas (Pergunta N); texto completo no placeholder.
 * O painel da staff usa PERGUNTAS_ABERTAS com o texto integral.
 */
const PERGUNTAS_ABERTAS = {
    userRoblox: 'Username Roblox (não Display Name)',
    failRp: 'O que é Fail RP? Explique e dê um pequeno exemplo',
    rulebreak: 'Caso você veja alguem quebrando regras, o que faria?',
    void: 'O que é void e quando ele pode ser aplicado?',
    peaceTimes: 'Quais são os tipos de Peace times e o que é permitido em um deles?',
    prioridade: 'O que é prioridade? Quando ela é liberada?',
    registrarVeiculo: 'Demonstre o passo a passo para registrar um veículo em nosso servidor.',
    tiers: 'O que são tiers, quais são os tipos e como obtê-los?',
    assinatura: 'Assine seu username do Discord (confirma honestidade e as regras)'
};

/**
 * @param {string} customId
 * @param {string} labelCurto - ex.: "Pergunta 1"
 * @param {string} perguntaCompleta - vai no placeholder (até 100 chars)
 * @param {number} style
 * @param {{ required?: boolean, minLength?: number, maxLength?: number }} [opts]
 */
function campo(customId, labelCurto, perguntaCompleta, style, opts = {}) {
    const input = new TextInputBuilder()
        .setCustomId(customId)
        .setLabel(String(labelCurto).slice(0, 45))
        .setStyle(style)
        .setRequired(opts.required !== false);

    if (opts.minLength) input.setMinLength(opts.minLength);
    if (opts.maxLength) input.setMaxLength(opts.maxLength);

    if (perguntaCompleta) {
        input.setPlaceholder(String(perguntaCompleta).slice(0, 100));
    }

    return new ActionRowBuilder().addComponents(input);
}

function montarModalEtapa1() {
    const modal = new ModalBuilder()
        .setCustomId('modal_wl_etapa1')
        .setTitle('Whitelist: Etapa 1/3');

    modal.addComponents(
        campo('input_user_roblox', 'Pergunta 1', PERGUNTAS_ABERTAS.userRoblox, TextInputStyle.Short, {
            minLength: 3,
            maxLength: 20
        }),
        campo('input_fail_rp', 'Pergunta 2', PERGUNTAS_ABERTAS.failRp, TextInputStyle.Paragraph, {
            minLength: 20,
            maxLength: 1000
        }),
        campo('input_rulebreak', 'Pergunta 3', PERGUNTAS_ABERTAS.rulebreak, TextInputStyle.Paragraph, {
            minLength: 15,
            maxLength: 1000
        }),
        campo('input_void', 'Pergunta 4', PERGUNTAS_ABERTAS.void, TextInputStyle.Paragraph, {
            minLength: 15,
            maxLength: 1000
        }),
        campo(
            'input_peace_times',
            'Pergunta 5',
            PERGUNTAS_ABERTAS.peaceTimes,
            TextInputStyle.Paragraph,
            { minLength: 20, maxLength: 1000 }
        )
    );

    return modal;
}

function montarModalEtapa2() {
    const modal = new ModalBuilder()
        .setCustomId('modal_wl_etapa2')
        .setTitle('Whitelist: Etapa 2/3');

    modal.addComponents(
        campo(
            'input_prioridade',
            'Pergunta 1',
            PERGUNTAS_ABERTAS.prioridade,
            TextInputStyle.Paragraph,
            { minLength: 20, maxLength: 1000 }
        ),
        campo(
            'input_registrar_veiculo',
            'Pergunta 2',
            PERGUNTAS_ABERTAS.registrarVeiculo,
            TextInputStyle.Paragraph,
            { minLength: 20, maxLength: 1000 }
        ),
        campo('input_tiers', 'Pergunta 3', PERGUNTAS_ABERTAS.tiers, TextInputStyle.Paragraph, {
            minLength: 20,
            maxLength: 1000
        })
    );

    return modal;
}

function montarModalJuramento() {
    const modal = new ModalBuilder()
        .setCustomId('modal_wl_juramento')
        .setTitle('Whitelist: Juramento');

    modal.addComponents(
        campo(
            'input_assinatura',
            'Pergunta 1',
            PERGUNTAS_ABERTAS.assinatura,
            TextInputStyle.Short,
            {
                minLength: 2,
                maxLength: 40
            }
        )
    );

    return modal;
}

module.exports = {
    PERGUNTAS_ABERTAS,
    montarModalEtapa1,
    montarModalEtapa2,
    montarModalJuramento
};
