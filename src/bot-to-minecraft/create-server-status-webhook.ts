import { EmbedBuilder, WebhookClient, type APIMessage, type ColorResolvable } from "discord.js";
import MinecraftServerProcess, {
	ServerStatus,
	type ServerStatusInformation,
} from "../minecraft/minecraft-server-process";
import Config from "../bot/config";

function buildStatusUpdateEmbed(serverInformation: ServerStatusInformation): EmbedBuilder {
	let statusMessage: string = "";
	let color: ColorResolvable;
	switch (serverInformation.status) {
		case ServerStatus.Down:
			statusMessage = "Server is offline";
			color = "#FF0000"; // Red
			break;
		case ServerStatus.SchedulingShutdown:
			statusMessage = "Server is scheduled to shut down";
			color = "#FFA500"; // Orange
			break;
		case ServerStatus.ShuttingDown:
			statusMessage = "Server is shutting down";
			color = "#FF6347"; // Tomato red
			break;
		case ServerStatus.SchedulingBootup:
			statusMessage = "Server is scheduled to boot up";
			color = "#ADD8E6"; // Light blue
			break;
		case ServerStatus.BootingUp:
			statusMessage = "Server is booting up";
			color = "#1E90FF"; // Dodger blue
			break;
		case ServerStatus.Up:
			if (serverInformation.activeServerInformation?.playersActive == 0 && Config.EMPTY_SERVER_SHUTDOWN_MINUTES) {
				// For when empty server stopper is active and set up in settings
				statusMessage = `${Config.EMPTY_SERVER_SHUTDOWN_MINUTES} minute empty server shutdown timer currently running`;
				color = "#FFFF8F"; // Canary Yellow
			} else {
				statusMessage = "Server is online";
				color = "#00FF7F"; // Spring green
			}
			break;
		default:
			statusMessage = "Unknown server status";
			color = "#808080"; // Gray
			break;
	}

	let updatedEmbed = new EmbedBuilder()
		.setTitle("Minecraft Server Status")
		.setDescription(statusMessage)
		.setColor(color)
		.setTimestamp();

	if (serverInformation.activeServerInformation)
		updatedEmbed = updatedEmbed.addFields(
			{
				name: "Version",
				value: serverInformation.activeServerInformation.version,
				inline: false,
			},
			{
				name: "Player Count",
				value:
					serverInformation.activeServerInformation.playersActive.toString() +
					" / " +
					serverInformation.activeServerInformation.maxPlayers.toString(),
				inline: false,
			},
			{
				name: "Online Players",
				value:
					serverInformation.activeServerInformation.playersActive > 0
						? serverInformation.activeServerInformation.playerList
								.map((name, i) => `${i + 1}. ${name}`)
								.join("\n")
						: "No players online",
				inline: false,
			}
		);

	return updatedEmbed;
}

export default async function (minecraftServer: MinecraftServerProcess) {
	if (!Config.SERVER_STATUS_WEBHOOK_URL || !Config.SERVER_STATUS_CHANNEL_ID) return;

	const webhookClient = new WebhookClient({
		url: Config.SERVER_STATUS_WEBHOOK_URL,
	});

	const message: APIMessage = await webhookClient.send({
		embeds: [
			buildStatusUpdateEmbed({
				status: ServerStatus.Down,
				activeServerInformation: null,
			}),
		],
		username: "Server",
		avatarURL: "",
	});

	minecraftServer.on("serverStatus", (serverInformation: ServerStatusInformation) => {
		webhookClient.editMessage(message.id, {
			embeds: [buildStatusUpdateEmbed(serverInformation)],
		});
	});
}
