const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');

const PAINEL_COR = 0x3C166C;
const PAINEL_TITULO = '<:WL_GVRPNL:1526693761420234903> ・Central de Whitelist';
const PAINEL_IMAGEM_URL =
    'https://cdn.discordapp.com/attachments/1527677328182870171/1528889330108731594/wl.png?ex=6a5ff0a5&is=6a5e9f25&hm=4c2fbd057daf34ee7e2202497564e0392f9e515402874b6d4509ed7abba058da';
const PAINEL_FOOTER =
    'Todos os direitos reservados, GVPRNL ©\nAgradecimentos especiais: c0erus, thiago j & marquez';

const { CENTRAL_INFO_CHANNEL_ID } = require('../../config/channels');

function mençãoCanalInfo() {
    const id = CENTRAL_INFO_CHANNEL_ID;
    return id && id !== '' ? `<#${id}>` : 'o canal de informações';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setupwhitelist')
        .setDescription('Envia o painel de Whitelist para os visitantes.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const canalInfo = mençãoCanalInfo();
            const painelDescricao =
                '> Clique no botão abaixo para iniciar a **Whitelist** do servidor.\n' +
                `> Consulte ${canalInfo} antes de começar — o conteúdo facilita as respostas do formulário.\n` +
                '> Leia as regras com atenção antes de começar.\n⠀';

            const embed = new EmbedBuilder()
                .setColor(PAINEL_COR)
                .setTitle(PAINEL_TITULO)
                .setDescription(painelDescricao)
                .addFields({
                    name: '\n\n<:wumpus_asdawdsa:1467288278800662588>・** Orientações**',
                    value:
                        '⠀\n' +
                        `> **1.** Leia ${canalInfo} com atenção! Isso te ajudará a responder o formulário da whitelist.\n` +
                        '> **2.** A whitelist possui **várias etapas** (textos + situações). Reserve cerca de 15 a 20 minutos.\n' +
                        '> **3.** Responda com as **suas** palavras. Uso de terceiros pode resultar em reprovação/punição.\n' +
                        '> **4.** A staff avalia manualmente: não há nota automática.\n' +
                        '> **5.** Em caso de reprovação, aguarde **10 minutos** antes de tentar novamente.\n' +
                        '> **6.** Após aprovado, você terá acesso ao canal de **registro de personagem**.\n\n' +
                        '<:SuporteWumpusGVRPNL:1223379087985217616> ・ Dúvidas? Contate a staff.'
                })
                .setFooter({ text: PAINEL_FOOTER });

            if (PAINEL_IMAGEM_URL) {
                embed.setImage(PAINEL_IMAGEM_URL);
            }

            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_iniciar_wl')
                    .setLabel('Iniciar Whitelist')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.channel.send({ embeds: [embed], components: [actionRow] });
            await interaction.editReply({ content: 'Painel de Whitelist criado com sucesso.' });
        } catch (error) {
            console.error('Erro ao executar o comando setupwhitelist:', error);
            if (interaction.deferred) {
                await interaction.editReply({ content: 'Houve um erro ao tentar criar o painel.' });
            } else {
                await interaction.reply({
                    content: 'Houve um erro ao tentar criar o painel.',
                    ephemeral: true
                });
            }
        }
    }
};
