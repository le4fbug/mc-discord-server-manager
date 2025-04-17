import type { Client, Interaction } from "discord.js";
import Config from "../bot/config";
import MinecraftServerProcess from "../minecraft/minecraft-server-process";
import pipeDiscordToMinecraft from "./pipe-discord-to-minecraft";
import pipeMinecraftToDiscord from "./pipe-minecraft-to-discord";
import handleInteraction from "./handle-interaction";
import createServerStatusWebhook from "./create-server-status-webhook";

export default function (client: Client) {
	const minecraftServer = new MinecraftServerProcess(
		Config.SERVER_PATH ?? null,
		Config.SERVER_JAR_FILE ?? null,
		Config.SERVER_MIN_MEMORY,
		Config.SERVER_MAX_MEMORY,
		Config.EMPTY_SERVER_SHUTDOWN_MINUTES ? Number(Config.EMPTY_SERVER_SHUTDOWN_MINUTES) : null
	);
	createServerStatusWebhook(minecraftServer);
	pipeDiscordToMinecraft(client, minecraftServer);
	pipeMinecraftToDiscord(minecraftServer);
	client.on("interactionCreate", (interaction: Interaction) => handleInteraction(interaction, minecraftServer));
}
