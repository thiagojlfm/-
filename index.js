require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

// --- SERVIDOR HTTP (API para bot 911) ---
const API_PORT = process.env.PORT || 8080;
const API_TOKEN = process.env.WL_API_TOKEN || '';

const apiServer = http.createServer((req, res) => {
    // Autenticação por token
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    if (API_TOKEN && token !== API_TOKEN) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    // GET /registro/discord/:discordId
    const match = req.url.match(/^\/registro\/discord\/(\d+)$/);
    if (req.method === 'GET' && match) {
        const discordId = match[1];
        try {
            const WhitelistService = require('./src/services/WhitelistService');
            const RegistroService = require('./src/services/RegistroService');

            const wlAprovada = WhitelistService.estaAprovado(discordId);
            const wlPendente = !!WhitelistService.buscarPendentePorDiscordId(discordId);
            const registro = RegistroService.buscarAtivo(discordId);
            const totalRegistros = RegistroService._lerTodos().length;

            console.log(`[API] /registro/discord/${discordId} → wl=${wlAprovada} registro=${registro?.nomePersonagem || 'null'} total_no_json=${totalRegistros}`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                discordId,
                whitelist: {
                    aprovada: wlAprovada,
                    pendente: wlPendente
                },
                registro: registro ? {
                    nomePersonagem: registro.nomePersonagem,
                    ssn: registro.ssn,
                    nickRoblox: registro.nickRoblox,
                    userRoblox: registro.userRoblox,
                    idade: registro.idade,
                    localNascimento: registro.localNascimento
                } : null
            }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Internal error', detail: err.message }));
        }
    }

    // GET /health
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

apiServer.listen(API_PORT, () => {
    console.log(`[API] Servidor HTTP rodando na porta ${API_PORT}`);
});

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
client.selects = new Map();

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

// --- CARREGADOR DE SELECT MENUS ---
const selectsPath = path.join(baseDir, 'components', 'selects');
console.log(`[INFO] Procurando select menus em: ${selectsPath}`);

if (fs.existsSync(selectsPath)) {
    const selectFiles = fs.readdirSync(selectsPath).filter(file => file.endsWith('.js'));
    for (const file of selectFiles) {
        const select = require(path.join(selectsPath, file));
        client.selects.set(select.customId, select);
        console.log(`[SUCESSO] Select carregado: ${select.customId}`);
    }
} else {
    console.log(`[AVISO] Caminho de select menus não encontrado: ${selectsPath}`);
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

    // Resolve handler por customId exato ou pelo prefixo dinâmico mais longo (ex: btn_aprovar_wl_ antes de btn_aprovar_)
    const resolvePrefixed = (collection, customId) => {
        const exact = collection.get(customId);
        if (exact) return { handler: exact, extractedId: null };

        let bestKey = null;
        let bestHandler = null;
        for (const [key, value] of collection.entries()) {
            if (key.endsWith('_') && customId.startsWith(key)) {
                if (!bestKey || key.length > bestKey.length) {
                    bestKey = key;
                    bestHandler = value;
                }
            }
        }
        if (!bestHandler) return { handler: null, extractedId: null };
        return {
            handler: bestHandler,
            extractedId: customId.slice(bestKey.length)
        };
    };

    // 2. Componentes de Botão (Buttons)
    if (interaction.isButton()) {
        const { handler: button, extractedId } = resolvePrefixed(client.buttons, interaction.customId);

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
        const { handler: modal, extractedId } = resolvePrefixed(client.modals, interaction.customId);

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

    // 4. Select Menus
    if (interaction.isAnySelectMenu()) {
        const { handler: select, extractedId } = resolvePrefixed(client.selects, interaction.customId);

        if (!select) {
            console.log(`[AVISO] Select acionado mas sem lógica registrada: ${interaction.customId}`);
            return;
        }

        try {
            await select.execute(interaction, client, extractedId);
        } catch (error) {
            console.error(`[ERRO] Falha ao processar select ${interaction.customId}:`, error);
        }
    }
});

// Evento disparado quando o bot se conecta com sucesso
client.once('clientReady', async () => {
    console.log(`\n[BOT] Online com sucesso como: ${client.user.tag}`);

    // Registra/atualiza slash commands automaticamente no boot (guild — propaga na hora)
    try {
        const commandsData = [...client.commands.values()].map((cmd) => cmd.data.toJSON());
        const guildId = process.env.GUILD_ID;

        if (!guildId) {
            console.warn('[DEPLOY] GUILD_ID não definido nas envs — slash commands não foram registrados.');
        } else if (commandsData.length === 0) {
            console.warn('[DEPLOY] Nenhum comando carregado para registrar.');
        } else {
            console.log(`[DEPLOY] Registrando ${commandsData.length} comando(s) na guild ${guildId}...`);
            const registrados = await client.application.commands.set(commandsData, guildId);
            console.log(`[DEPLOY] ${registrados.size} comando(s) registrado(s) com sucesso.`);
        }
    } catch (error) {
        console.error('[DEPLOY] Falha ao registrar slash commands no boot:', error);
    }

    const RegistroService = require('./src/services/RegistroService');
    await RegistroService.sincronizarBackups(client);
});

// Entrada: boas-vindas (DM) + auto-restore de registro (só saída; CK exige /devolver_registro)
client.on('guildMemberAdd', async member => {
    try {
        const { enviarBoasVindasDm } = require('./src/services/BoasVindasService');
        const resultado = await enviarBoasVindasDm(member.user);
        if (resultado.ok) {
            console.log(`[BOAS-VINDAS] DM (fallback) enviada para ${member.user.tag} (${member.id}).`);
        } else {
            console.warn(
                `[BOAS-VINDAS] Não foi possível contatar ${member.user.tag} (${member.id}): ${resultado.erro}`
            );
        }
    } catch (error) {
        console.error(`[ERRO BOAS-VINDAS] Falha ao enviar boas-vindas para ${member.id}:`, error);
    }

    try {
        const RegistroService = require('./src/services/RegistroService');
        await RegistroService.handleMemberJoin(member, client);
    } catch (error) {
        console.error(`[ERRO AUTOMAÇÃO] Falha ao restaurar registro na entrada de ${member.id}:`, error);
    }
});

// Saída: arquiva registro (status) + limpa whitelist
client.on('guildMemberRemove', async member => {
    try {
        const RegistroService = require('./src/services/RegistroService');
        const WhitelistService = require('./src/services/WhitelistService');
        const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
        const canalLogs = client.channels.cache.get(process.env.LOGS_CHANNEL_ID);

        await RegistroService.handleMemberLeave(member, client);

        const wlRemovida = await WhitelistService.deletarPorDiscordId(member.id);
        if (wlRemovida) {
            console.log(`[AUTOMAÇÃO] Membro ${member.user.tag} saiu. Whitelist removida (status: ${wlRemovida.status}).`);

            if (canalLogs) {
                const logContainer = new ContainerBuilder()
                    .setAccentColor(0xFF59A2)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            '# [LOG AUTOMAÇÃO] Whitelist Removida (Saída)\n\n' +
                                `**Jogador:** ${member.user.tag} (<@${member.id}>)\n` +
                                `**Roblox:** \`${wlRemovida.answers?.userRoblox || '-'}\`\n` +
                                `**Status anterior:** \`${wlRemovida.status}\`\n\n` +
                                '*A Whitelist foi removida automaticamente porque o usuário saiu do servidor. Ao voltar, deverá refazer.*'
                        )
                    );

                await canalLogs
                    .send({
                        components: [logContainer],
                        flags: [MessageFlags.IsComponentsV2]
                    })
                    .catch(() => null);
            }
        }
    } catch (error) {
        console.error(`[ERRO AUTOMAÇÃO] Falha ao limpar dados na saída de ${member.id}:`, error);
    }
});
client.login(process.env.DISCORD_TOKEN);