import type { Client } from "discord.js";
import Config from "../bot/config";
import type MinecraftServerProcess from "../minecraft/minecraft-server-process";

export default function (client: Client, minecraftServer: MinecraftServerProcess) {
	client.on("messageCreate", (message) => {
		if (message.author.bot) return;
		if (message.webhookId) return;
		if (message.channelId !== Config.CHAT_MESSAGES_CHANNEL_ID) return;

		minecraftServer.sendDiscordMessage({
			username: message.author.username,
			message: message.cleanContent,
		});
	});
}
