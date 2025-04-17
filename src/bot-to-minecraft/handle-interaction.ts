import { EmbedBuilder, MessageFlags, type Interaction } from "discord.js";
import type MinecraftServerProcess from "../minecraft/minecraft-server-process";
import Config from "../bot/config";

function isAuthorized(interaction: Interaction): boolean {
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

export default async function (interaction: Interaction, minecraftServer: MinecraftServerProcess) {
	if (!interaction.isCommand()) return;

	switch (interaction.commandName) {
		case "start":
			try {
				await interaction.deferReply();
				await minecraftServer.start();
				await interaction.editReply("Server is now up.");
			} catch (error) {
				await interaction.editReply(
					`Failed to start server: ${error instanceof Error ? error.message : error}`
				);
			}
			break;

		case "stop":
			try {
				await interaction.deferReply();
				await minecraftServer.stop();
				await interaction.editReply("Server has shutdown.");
			} catch (error) {
				await interaction.editReply(`Failed to stop server: ${error instanceof Error ? error.message : error}`);
			}
			break;

		case "status":
			const statusEmbed = new EmbedBuilder()
				.setTitle("Minecraft Server Status")
				.setColor(minecraftServer.isServerRunning() ? "#00FF00" : "#FF0000")
				.setDescription(minecraftServer.isServerRunning() ? "Server is online" : "Server is offline")
				.setTimestamp();

			interaction.reply({ embeds: [statusEmbed] });
			break;

		case "help":
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
			break;

		case "send":
			if (!isAuthorized(interaction)) {
				await interaction.reply({
					content: "You do not have permission to use this command.",
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			const commandOption = interaction.options.get("command", true);

			try {
				const response = await minecraftServer.sendCommand(commandOption.value as string);
				if (response) await interaction.reply(`Command sent.\n\`\`\`${minecraftToDiscord(response)}\`\`\``);
				else await interaction.reply(`Command sent.`);
			} catch (error) {
				await interaction.reply({
					content: `Failed to send command: ${error instanceof Error ? error.message : error}`,
					flags: MessageFlags.Ephemeral,
				});
			}
			break;
	}
}
