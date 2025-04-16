import {
	Client,
	GatewayIntentBits,
	Partials,
	EmbedBuilder,
	REST,
	Routes,
	SlashCommandBuilder,
	CommandInteraction,
} from "discord.js";
import MinecraftServerProcess, { ServerStatus, type ServerStatusInformation } from "./minecraft-server-process";
import type { PlayerEvent } from "./minecraft-server-output";
import DiscordPlayerEventWebhook from "./discord-player-event-webhook";
import discordServerStatusWebhook from "./discord-server-status-webhook";
import Config from "./config";

// Define slash commands
const commands = [
	new SlashCommandBuilder().setName("start").setDescription("Start the Minecraft server"),
	new SlashCommandBuilder().setName("stop").setDescription("Stop the Minecraft server"),
	new SlashCommandBuilder().setName("status").setDescription("Check the Minecraft server status"),
	new SlashCommandBuilder().setName("logs").setDescription("View recent Minecraft server logs"),
	new SlashCommandBuilder().setName("help").setDescription("Show all available commands"),
	new SlashCommandBuilder()
		.setName("send")
		.setDescription("Send a command to the Minecraft server")
		.addStringOption((option) => option.setName("command").setDescription("The command to send").setRequired(true)),
].map((command) => command.toJSON());

function isAuthorized(interaction: CommandInteraction): boolean {
	const userId = interaction.user.id;
	if (Config.ADMIN_USER_IDS.includes(userId)) return true;

	const member = interaction.member;
	if (!member || !member.roles) return false;

	if (Array.isArray(member.roles)) {
		return member.roles.some((roleId) => Config.ADMIN_ROLE_IDS.includes(roleId));
	}

	const roleIds = Array.from(member.roles.cache.keys());
	return roleIds.some((roleId) => Config.ADMIN_ROLE_IDS.includes(roleId));
}

function minecraftToDiscord(text: string): string {
	return text
		.replace(/§[0-9a-f]/gi, "") // Strip color codes
		.replace(/§l/gi, "**") // Bold
		.replace(/§o/gi, "*") // Italic
		.replace(/§n/gi, "__") // Underline
		.replace(/§m/gi, "~~") // Strikethrough
		.replace(/§r/gi, "") // Reset (no formatting in Discord)
		.replace(/\n/g, "\n"); // Preserve newlines
}

export default class {
	// Create a new client instance
	private client = new Client({
		intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
		partials: [Partials.Channel],
	});

	private minecraftServerProcess = new MinecraftServerProcess(
		Config.SERVER_PATH ?? null,
		Config.SERVER_JAR_FILE ?? null,
		Config.SERVER_MIN_MEMORY,
		Config.SERVER_MAX_MEMORY,
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

				if (!Config.CLIENT_ID) {
					console.error(
						"Commands could not be registerd as Discord client id not provided. Please set in client-id in bot.properties."
					);
				}
				if (!Config.GUILD_ID) {
					console.error(
						"Commands could not be registerd as Discord guild id not provided. Please set in guild-id in bot.properties."
					);
				}
				if (!Config.CLIENT_ID || !Config.GUILD_ID) process.exit(1);

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
					await interaction.editReply(
						`Failed to start server: ${error instanceof Error ? error.message : error}`
					);
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
			} else if (commandName === "send") {
				if (!isAuthorized(interaction)) {
					await interaction.reply({
						content: "You do not have permission to use this command.",
						flags: 64, // Only show for command user
					});
					return;
				}

				const commandOption = interaction.options.get("command", true);

				try {
					const response = await this.minecraftServerProcess.sendCommand(commandOption.value as string);
					if (response) await interaction.reply(`Command sent.\n\`\`\`${minecraftToDiscord(response)}\`\`\``);
					else await interaction.reply(`Command sent.`);
				} catch (error) {
					await interaction.reply({
						content: `Failed to send command: ${error instanceof Error ? error.message : error}`,
						flags: 64, // Only show for command user
					});
				}
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
		if (Config.TOKEN) this.client.login(Config.TOKEN as string);
		else {
			console.error("Bot can not log in as no discord token provided. Please set token property.");
			process.exit(1);
		}
	}
}
