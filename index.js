require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Coleções globais para comandos e componentes
client.commands = new Map();
client.buttons = new Map();
client.modals = new Map();

// Garante o caminho absoluto correto, lidando caso o processo seja iniciado fora ou dentro de 'src'
const baseDir = __dirname.endsWith('src') ? __dirname : path.join(__dirname, 'src');

// --- CARREGADOR DE COMANDOS ---
const commandsPath = path.join(baseDir, 'commands', 'admin');
console.log(`[INFO] Procurando comandos em: ${commandsPath}`);

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));

        if (!command.data || !command.data.name) {
            console.log(`[ERRO] O comando em ${file} não exporta "data" (SlashCommandBuilder) corretamente e foi ignorado.`);
            continue;
        }

        client.commands.set(command.data.name, command);
        console.log(`[SUCESSO] Comando carregado: /${command.data.name}`);
    }
} else {
    console.log(`[ERRO] Caminho de comandos não encontrado: ${commandsPath}`);
}

// --- CARREGADOR DE BOTÕES ---
const buttonsPath = path.join(baseDir, 'components', 'buttons');
console.log(`[INFO] Procurando botões em: ${buttonsPath}`);

if (fs.existsSync(buttonsPath)) {
    const buttonFiles = fs.readdirSync(buttonsPath).filter(file => file.endsWith('.js'));
    for (const file of buttonFiles) {
        const button = require(path.join(buttonsPath, file));
        client.buttons.set(button.customId, button);
        console.log(`[SUCESSO] Botão carregado: ${button.customId}`);
    }
} else {
    console.log(`[ERRO] Caminho de botões não encontrado: ${buttonsPath}`);
}

// --- CARREGADOR DE MODALS ---
const modalsPath = path.join(baseDir, 'components', 'modals');
console.log(`[INFO] Procurando modals em: ${modalsPath}`);

if (fs.existsSync(modalsPath)) {
    const modalFiles = fs.readdirSync(modalsPath).filter(file => file.endsWith('.js'));
    for (const file of modalFiles) {
        const modal = require(path.join(modalsPath, file));
        client.modals.set(modal.customId, modal);
        console.log(`[SUCESSO] Modal carregado: ${modal.customId}`);
    }
} else {
    console.log(`[ERRO] Caminho de modals não encontrado: ${modalsPath}`);
}

// --- ROTEADOR E TRATADOR DE INTERAÇÕES ---
client.on('interactionCreate', async interaction => {

    // 1. Slash Commands (/)
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.log(`[AVISO] Comando recebido mas não encontrado nas coleções: /${interaction.commandName}`);
            return;
        }

        try {
            console.log(`[EXECUÇÃO] Executando comando: /${interaction.commandName}`);
            await command.execute(interaction, client);
        } catch (error) {
            console.error(`[ERRO] Falha ao executar o comando /${interaction.commandName}:`, error);
        }
    }

    // 2. Componentes de Botão (Buttons)
    if (interaction.isButton()) {
        let button = client.buttons.get(interaction.customId);
        let extractedId = null;

        if (!button) {
            for (const [key, value] of client.buttons.entries()) {
                if (key.endsWith('_') && interaction.customId.startsWith(key)) {
                    button = value;
                    extractedId = interaction.customId.replace(key, '');
                    break;
                }
            }
        }

        if (!button) {
            console.log(`[AVISO] Botão pressionado mas sem lógica registrada: ${interaction.customId}`);
            return;
        }

        try {
            await button.execute(interaction, client, extractedId);
        } catch (error) {
            console.error(`[ERRO] Falha ao processar botão ${interaction.customId}:`, error);
        }
    }

    // 3. Envios de Formulários (Modals)
    if (interaction.isModalSubmit()) {
        let modal = client.modals.get(interaction.customId);
        let extractedId = null;

        if (!modal) {
            for (const [key, value] of client.modals.entries()) {
                if (key.endsWith('_') && interaction.customId.startsWith(key)) {
                    modal = value;
                    extractedId = interaction.customId.replace(key, '');
                    break;
                }
            }
        }

        if (!modal) {
            console.log(`[AVISO] Modal enviado mas sem lógica registrada: ${interaction.customId}`);
            return;
        }

        try {
            await modal.execute(interaction, client, extractedId);
        } catch (error) {
            console.error(`[ERRO] Falha ao processar modal ${interaction.customId}:`, error);
        }
    }
});

// Evento disparado quando o bot se conecta com sucesso
client.once('clientReady', async () => {
    console.log(`\n[BOT] Online com sucesso como: ${client.user.tag}`);
    const RegistroService = require('./src/services/RegistroService');
    await RegistroService.sincronizarBackups(client);
});

// Evento disparado automaticamente toda vez que um membro sai do servidor
// Evento disparado automaticamente toda vez que um membro sai do servidor
client.on('guildMemberRemove', async member => {
    try {
        // Ajustado o caminho para buscar de dentro da pasta 'src'
        const RegistroService = require('./src/services/RegistroService');
        
        const registroRemovido = await RegistroService.deletarRegistro(member.id);

        if (registroRemovido) {
            console.log(`[AUTOMAÇÃO] Membro ${member.user.tag} saiu do servidor. Registro do personagem ${registroRemovido.nomePersonagem} deletado.`);

            const canalLogs = client.channels.cache.get(process.env.LOGS_CHANNEL_ID);
            if (canalLogs) {
                const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
                
                const logContainer = new ContainerBuilder()
                    .setAccentColor(0xFF59A2)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            '# [LOG AUTOMAÇÃO] Registro Removido (Saída)\n\n' +
                            `**Jogador:** ${member.user.tag} (<@${member.id}>)\n` +
                            `**Roblox:** \`${registroRemovido.nickRoblox}\` (\`@${registroRemovido.userRoblox}\`)\n` +
                            `**Personagem:** \`${registroRemovido.nomePersonagem}\`\n` +
                            `**SSN:** \`${registroRemovido.ssn}\`\n\n` +
                            '*O registro foi deletado automaticamente porque o usuário saiu do servidor.*'
                        )
                    );

                await canalLogs.send({
                    components: [logContainer],
                    flags: [MessageFlags.IsComponentsV2]
                }).catch(() => null);
            }
        }
    } catch (error) {
        console.error(`[ERRO AUTOMAÇÃO] Falha ao remover registro na saída de ${member.id}:`, error);
    }
});
client.login(process.env.DISCORD_TOKEN);