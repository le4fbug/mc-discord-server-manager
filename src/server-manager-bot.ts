import {
	Client,
	GatewayIntentBits,
	Partials,
	EmbedBuilder,
	REST,
	Routes,
	SlashCommandBuilder,
	TextChannel,
	Message,
	type ColorResolvable,
} from "discord.js";
import MinecraftServerProcess, { ServerStatus, type ServerStatusInformation } from "./minecraft-server-process";
import type { PlayerEvent } from "./minecraft-server-output";
import DiscordPlayerEventWebhook from "./discord-player-event-webhook";
import { Config } from "./config";

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

	private minecraftServerProcess = new MinecraftServerProcess();
	private discordMinecraftChatWebhook = new DiscordPlayerEventWebhook(
		Config.CHAT_MESSAGES_CHANNEL_ID,
		Config.CHAT_MESSAGES_CHANNEL_WEBHOOK_URL,
		"_player",
		"_player"
	);
	private discordDeathMessagesWebhook = new DiscordPlayerEventWebhook(
		Config.DEATH_MESSAGES_CHANNEL_ID,
		Config.DEATH_MESSAGES_CHANNEL_WEBHOOK_URL,
		"Death",
		"https://gcdnb.pbrd.co/images/K5NnkpebVt14.png?o=1"
	);
	private discordAchievementMessagesWebhook = new DiscordPlayerEventWebhook(
		Config.ACHIEVEMENT_MESSAGES_CHANNEL_ID,
		Config.ACHIEVEMENT_MESSAGES_CHANNEL_WEBHOOK_URL,
		"Achievement",
		"https://gcdnb.pbrd.co/images/fqJC7fcj4Cjm.png?o=1"
	);
	private discordJoinMessagesWebhook = new DiscordPlayerEventWebhook(
		Config.JOIN_MESSAGES_CHANNEL_ID,
		Config.JOIN_MESSAGES_CHANNEL_WEBHOOK_URL,
		"Join",
		"https://gcdnb.pbrd.co/images/6hM5kPfahimb.png?o=1"
	);
	private discordLeaveMessagesWebhook = new DiscordPlayerEventWebhook(
		Config.LEAVE_MESSAGES_CHANNEL_ID,
		Config.LEAVE_MESSAGES_CHANNEL_WEBHOOK_URL,
		"Leave",
		"https://gcdnb.pbrd.co/images/9YEfFRJPVEEG.png?o=1"
	);
	private serverActivityMessage: Message | null = null;

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
			if (!this.serverActivityMessage) return;

			const baseEmbed = this.serverActivityMessage.embeds[0]
				? EmbedBuilder.from(this.serverActivityMessage.embeds[0])
				: new EmbedBuilder();

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
					if (
						serverInformation.activeServerInformation?.playersActive == 0 &&
						Config.EMPTY_SERVER_SHUTDOWN_MINUTES
					) {
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

			this.serverActivityMessage.edit({ embeds: [updatedEmbed] });
		});

		// Log when the bot is ready
		this.client.once("ready", async () => {
			console.log(`Logged in as ${this.client.user?.tag}!`);
			this.client.user?.setActivity("Minecraft Server Manager");
			const channel = await this.client.channels.fetch(Config.SERVER_STATUS_CHANNEL_ID as string);
			if (channel && channel.isTextBased()) {
				let textChannel = channel as TextChannel;
				const statusEmbed = new EmbedBuilder()
					.setTitle("Minecraft Server Status")
					.setDescription("Server is currently down.")
					.setColor("#FF0000")
					.setTimestamp();

				this.serverActivityMessage = await textChannel.send({
					embeds: [statusEmbed],
				});
			} else {
				console.error("Channel not found or not a text-based channel.");
			}
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

		process.on("exit", async () => {
			if (this.serverActivityMessage) {
				try {
					await this.serverActivityMessage.delete();
				} catch (error) {}
			}
		});

		// Login to Discord with the token
		this.client.login(Config.TOKEN as string);
	}
}
