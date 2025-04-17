import { REST, Routes, SlashCommandBuilder } from "discord.js";
import Config from "./config";

export default async function () {
	const commands = [
		new SlashCommandBuilder().setName("start").setDescription("Start the Minecraft server"),
		new SlashCommandBuilder().setName("stop").setDescription("Stop the Minecraft server"),
		new SlashCommandBuilder().setName("status").setDescription("Check the Minecraft server status"),
		new SlashCommandBuilder().setName("logs").setDescription("View recent Minecraft server logs"),
		new SlashCommandBuilder().setName("help").setDescription("Show all available commands"),
		new SlashCommandBuilder()
			.setName("send")
			.setDescription("Send a command to the Minecraft server")
			.addStringOption((option) =>
				option.setName("command").setDescription("The command to send").setRequired(true)
			),
	].map((command) => command.toJSON());

	const rest = new REST({ version: "10" }).setToken(Config.TOKEN as string);

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
}
