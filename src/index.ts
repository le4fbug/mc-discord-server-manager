import registerCommands from "./bot/register-commands";
import { clientCreate, clientLogin } from "./bot/client";
import connectBotToMinecraft from "./bot-to-minecraft/connect-bot-to-minecraft";

(async () => {
	const client = clientCreate();
	await registerCommands();
	connectBotToMinecraft(client);
	clientLogin(client);
})();
