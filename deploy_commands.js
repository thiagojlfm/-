/**
 * Obsoleto: o registro de slash commands agora roda automaticamente no boot
 * do bot (index.js → evento clientReady).
 *
 * Este arquivo existe só para não quebrar scripts antigos / docs.
 * Preferir: subir o bot normalmente (node index.js).
 */
console.log(
    '[AVISO] deploy_commands.js não é mais necessário.\n' +
        'Os slash commands são registrados automaticamente quando o bot inicia (index.js).'
);
process.exit(0);
