const {
    SlashCommandBuilder,
PermissionFlagsBits,
ActionRowBuilder,
ButtonBuilder,
ButtonStyle,
EmbedBuilder
} = require('discord.js');

// Edite estas constantes para personalizar o painel sem alterar o fluxo do comando.
const PAINEL_COR = 0x3C166C;
const PAINEL_TITULO = '<:WL_GVRPNL:1526693761420234903> ・Central de Registro';
const PAINEL_DESCRICAO = '> Clique no botão abaixo para iniciar o registro do seu personagem!\n⠀';
const PAINEL_IMAGEM_URL = 'https://media.discordapp.net/attachments/1526401700686991422/1526701356302204928/2_20260714_181409_0001.png?ex=6a58a3b0&is=6a575230&hm=88c62de3aeebe0dcdd8df8effddb058d22230d78c08282afcb86b6b31c4981be&=&format=webp&quality=lossless'
const PAINEL_FOOTER = 'Todos os direitos reservados, GVPRNL ©\nAgradecimentos especiais: c0erus, thiago j & marquez';

module.exports = {
data: new SlashCommandBuilder()
.setName('setupregistro')
.setDescription('Envia o painel de registro para os cidadãos.')
.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
async execute(interaction) {
try {
await interaction.deferReply({ ephemeral: true });

const embed = new EmbedBuilder()
.setColor(PAINEL_COR)
.setTitle(PAINEL_TITULO)
.setDescription(PAINEL_DESCRICAO)
.addFields({
name: '\n\n<:wumpus_asdawdsa:1467288278800662588>・** Orientações**',
value: '⠀\n> **1.** Evite utilizar nomes de pessoas reais ou celebridades.\n> <:reply:1370356802222293082> Exemplo: `Ayrton Senna`\n> **2.** O seu personagem deve ter idade **igual** ou **superior** a 18 anos.\n> **3.** Nomes inapropriados podem acarretar em punições e/ou advertências.\n> **4.** Caso seu registro seja negado pela staff, corrija os erros cometidos e tente novamente!\n\n<:SuporteWumpusGVRPNL:1223379087985217616> ・ Tem alguma dúvida? Não deixe de contatar a staff! Estaremos prontos para te ajudar.'
})
.setFooter({ text: PAINEL_FOOTER });

if (PAINEL_IMAGEM_URL) {
embed.setImage(PAINEL_IMAGEM_URL);
}

const actionRow = new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setCustomId('btn_iniciar_registro')
.setLabel('Registrar Personagem')
.setStyle(ButtonStyle.Primary)
            );

await interaction.channel.send({ embeds: [embed], components: [actionRow] });
await interaction.editReply({ content: 'Painel de registro criado com sucesso.' });
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