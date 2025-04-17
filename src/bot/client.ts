import { Client, GatewayIntentBits, Partials } from "discord.js";
import Config from "./config";

export function clientCreate(): Client {
	const client = new Client({
		intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
		partials: [Partials.Channel],
	});
	client.once("ready", () => {
		console.log(`Logged in as ${client.user?.tag}!`);
		client.user?.setActivity("Minecraft Server Manager");
	});
	return client;
}

export function clientLogin(client: Client) {
	if (Config.TOKEN) client.login(Config.TOKEN as string);
	else {
		console.error("Bot can not log in as no discord token provided. Please set token property.");
		process.exit(1);
	}
}
