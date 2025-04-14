import { Client, GatewayIntentBits, Partials, EmbedBuilder, REST, Routes, SlashCommandBuilder } from "discord.js";
import MinecraftServerProcess, { ServerStatus, type ServerStatusInformation } from "./minecraft-server-process";
import type { PlayerEvent } from "./minecraft-server-output";
import DiscordPlayerEventWebhook from "./discord-player-event-webhook";
import discordServerStatusWebhook from "./discord-server-status-webhook";
import { Config } from "./config";
import { copyFile } from "fs";

// Define slash commands
const commands = [
	new SlashCommandBuilder().setName("start").setDescription("Start the Minecraft server"),
	new SlashCommandBuilder().setName("stop").setDescription("Stop the Minecraft server"),
	new SlashCommandBuilder().setName("status").setDescription("Check the Minecraft server status"),
	new SlashCommandBuilder().setName("logs").setDescription("View recent Minecraft server logs"),
	new SlashCommandBuilder().setName("help").setDescription("Show all available commands"),
].map((command) => command.toJSON());

export default class {
	// Create a new client instance
	private client = new Client({
		intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
		partials: [Partials.Channel],
	});

	private minecraftServerProcess = new MinecraftServerProcess(
		Config.SERVER_PATH ?? null,
		Config.SERVER_JAR_FILE ?? null,
		Config.SERVER_MEMORY as string,
		Config.EMPTY_SERVER_SHUTDOWN_MINUTES ? Number(Config.EMPTY_SERVER_SHUTDOWN_MINUTES) : null
	);
	private discordMinecraftChatWebhook = new DiscordPlayerEventWebhook(
		Config.CHAT_MESSAGES_CHANNEL_ID,
		Config.CHAT_MESSAGES_WEBHOOK_URL,
		"_player",
		"_player"
	);
	private discordDeathMessagesWebhook = new DiscordPlayerEventWebhook(
		Config.DEATH_MESSAGES_CHANNEL_ID,
		Config.DEATH_MESSAGES_WEBHOOK_URL,
		"Death",
		"https://gcdnb.pbrd.co/images/K5NnkpebVt14.png?o=1"
	);
	private discordAchievementMessagesWebhook = new DiscordPlayerEventWebhook(
		Config.ACHIEVEMENT_MESSAGES_CHANNEL_ID,
		Config.ACHIEVEMENT_MESSAGES_WEBHOOK_URL,
		"Achievement",
		"https://gcdnb.pbrd.co/images/fqJC7fcj4Cjm.png?o=1"
	);
	private discordJoinMessagesWebhook = new DiscordPlayerEventWebhook(
		Config.JOIN_MESSAGES_CHANNEL_ID,
		Config.JOIN_MESSAGES_WEBHOOK_URL,
		"Join",
		"https://gcdnb.pbrd.co/images/6hM5kPfahimb.png?o=1"
	);
	private discordLeaveMessagesWebhook = new DiscordPlayerEventWebhook(
		Config.LEAVE_MESSAGES_CHANNEL_ID,
		Config.LEAVE_MESSAGES_WEBHOOK_URL,
		"Leave",
		"https://gcdnb.pbrd.co/images/9YEfFRJPVEEG.png?o=1"
	);
	private serverStatusWebhook = new discordServerStatusWebhook(
		Config.SERVER_STATUS_CHANNEL_ID,
		Config.SERVER_STATUS_WEBHOOK_URL,
		"Server"
	);

	constructor() {
		// Register commands using your preferred method (separate from the client initialization)
		const rest = new REST({ version: "10" }).setToken(Config.TOKEN as string);
		(async () => {
			try {
				console.log("Registering slash commands...");

				await rest.put(Routes.applicationGuildCommands(Config.CLIENT_ID as string, Config.GUILD_ID as string), {
					body: commands,
				});

				console.log("Slash commands were registered successfully!");
			} catch (error) {
				console.error(`There was an error upon bot logging in: ${error}`);
			}
		})();

		this.minecraftServerProcess.on("chat", (chatEvent: PlayerEvent) =>
			this.discordMinecraftChatWebhook.onEvent(chatEvent)
		);
		this.minecraftServerProcess.on("death", (chatEvent: PlayerEvent) =>
			this.discordDeathMessagesWebhook.onEvent(chatEvent)
		);
		this.minecraftServerProcess.on("achievement", (chatEvent: PlayerEvent) =>
			this.discordAchievementMessagesWebhook.onEvent(chatEvent)
		);
		this.minecraftServerProcess.on("join", (chatEvent: PlayerEvent) =>
			this.discordJoinMessagesWebhook.onEvent(chatEvent)
		);
		this.minecraftServerProcess.on("leave", (chatEvent: PlayerEvent) =>
			this.discordLeaveMessagesWebhook.onEvent(chatEvent)
		);
	}

	public login() {
		this.minecraftServerProcess.on("serverStatus", (serverInformation: ServerStatusInformation) => {
			this.serverStatusWebhook.onStatusUpdates(serverInformation);
		});

		// Log when the bot is ready
		this.client.once("ready", async () => {
			console.log(`Logged in as ${this.client.user?.tag}!`);
			this.client.user?.setActivity("Minecraft Server Manager");
		});

		// Handle slash command interactions
		this.client.on("interactionCreate", async (interaction) => {
			if (!interaction.isCommand()) return;

			const { commandName } = interaction;

			// Command to start the Minecraft server
			if (commandName === "start") {
				try {
					await interaction.deferReply(); // Defers the response (gives you more time)

					await this.minecraftServerProcess.start();

					await interaction.editReply("Server is now up.");
				} catch (error) {
					await interaction.editReply(`Failed to start server: ${error}`);
				}
			}

			// Command to stop the Minecraft server
			else if (commandName === "stop") {
				try {
					await interaction.deferReply(); // Defers the response (gives you more time)

					await this.minecraftServerProcess.stop();

					await interaction.editReply("Server successfully shutdown.");
				} catch (error) {
					await interaction.editReply(`Failed to stop server: ${error}`);
				}
			}

			// Command to check server status
			else if (commandName === "status") {
				const statusEmbed = new EmbedBuilder()
					.setTitle("Minecraft Server Status")
					.setColor(this.minecraftServerProcess.isServerRunning() ? "#00FF00" : "#FF0000")
					.setDescription(
						this.minecraftServerProcess.isServerRunning() ? "Server is online" : "Server is offline"
					)
					.setTimestamp();

				interaction.reply({ embeds: [statusEmbed] });
			}

			// Command to show help
			else if (commandName === "help") {
				const helpEmbed = new EmbedBuilder()
					.setTitle("Minecraft Server Bot Commands")
					.setColor("#0099ff")
					.setDescription("List of available commands:")
					.addFields(
						{ name: "/start", value: "Start the Minecraft server" },
						{ name: "/stop", value: "Stop the Minecraft server" },
						{ name: "/status", value: "Check server status" },
						{ name: "/logs", value: "View recent server logs" },
						{ name: "/help", value: "Show this help message" }
					)
					.setTimestamp();

				interaction.reply({ embeds: [helpEmbed] });
			}
		});

		// Sends discord messages to mc server from specific chat channel
		this.client.on("messageCreate", (message) => {
			if (message.author.bot) return;
			if (message.webhookId) return;
			if (message.channelId !== Config.CHAT_MESSAGES_CHANNEL_ID) return;

			this.minecraftServerProcess.sendDiscordMessage({
				username: message.author.username,
				message: message.cleanContent,
			});
		});

		process.on("exit", async () => this.serverStatusWebhook.destroy());

		// Login to Discord with the token
		this.client.login(Config.TOKEN as string);
	}
}
