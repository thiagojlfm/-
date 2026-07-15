require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const baseDir = __dirname.endsWith('src') ? __dirname : path.join(__dirname, 'src');
const commandsPath = path.join(baseDir, 'commands', 'admin');

const commands = [];

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));

        if (!command.data) {
            console.log(`[AVISO] O arquivo ${file} não exporta "data" (SlashCommandBuilder) e será ignorado no deploy.`);
            continue;
        }

        commands.push(command.data.toJSON());
        console.log(`[INFO] Preparado para deploy: /${command.data.name}`);
    }
} else {
    console.log(`[ERRO] Caminho de comandos não encontrado: ${commandsPath}`);
    process.exit(1);
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`\n[DEPLOY] Registrando ${commands.length} comando(s)...`);

        // Deploy por servidor (guild) - propaga instantaneamente, ideal para testes.
        // Troque para Routes.applicationCommands(process.env.CLIENT_ID) para deploy global
        // (propagação pode levar até ~1h, mas funciona em todos os servidores).
        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );

        console.log(`[SUCESSO] ${data.length} comando(s) registrado(s) com sucesso.`);
    } catch (error) {
        console.error('[ERRO] Falha ao registrar comandos:', error);
    }
})();