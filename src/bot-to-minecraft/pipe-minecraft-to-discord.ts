import Config from "../bot/config";
import type { PlayerEvent } from "../minecraft/minecraft-server-output";
import type MinecraftServerProcess from "../minecraft/minecraft-server-process";
import DiscordPlayerEventWebhook from "./discord-player-event-webhook";

export default function (minecraftServer: MinecraftServerProcess) {
	const discordMinecraftChatWebhook = new DiscordPlayerEventWebhook(
		Config.CHAT_MESSAGES_CHANNEL_ID,
		Config.CHAT_MESSAGES_WEBHOOK_URL,
		"_player",
		"_player"
	);
	const discordDeathMessagesWebhook = new DiscordPlayerEventWebhook(
		Config.DEATH_MESSAGES_CHANNEL_ID,
		Config.DEATH_MESSAGES_WEBHOOK_URL,
		"Death",
		"https://gcdnb.pbrd.co/images/K5NnkpebVt14.png?o=1"
	);
	const discordAchievementMessagesWebhook = new DiscordPlayerEventWebhook(
		Config.ACHIEVEMENT_MESSAGES_CHANNEL_ID,
		Config.ACHIEVEMENT_MESSAGES_WEBHOOK_URL,
		"Achievement",
		"https://gcdnb.pbrd.co/images/fqJC7fcj4Cjm.png?o=1"
	);
	const discordJoinMessagesWebhook = new DiscordPlayerEventWebhook(
		Config.JOIN_MESSAGES_CHANNEL_ID,
		Config.JOIN_MESSAGES_WEBHOOK_URL,
		"Join",
		"https://gcdnb.pbrd.co/images/6hM5kPfahimb.png?o=1"
	);
	const discordLeaveMessagesWebhook = new DiscordPlayerEventWebhook(
		Config.LEAVE_MESSAGES_CHANNEL_ID,
		Config.LEAVE_MESSAGES_WEBHOOK_URL,
		"Leave",
		"https://gcdnb.pbrd.co/images/9YEfFRJPVEEG.png?o=1"
	);

	minecraftServer.on("chat", (chatEvent: PlayerEvent) => discordMinecraftChatWebhook.onEvent(chatEvent));
	minecraftServer.on("death", (chatEvent: PlayerEvent) => discordDeathMessagesWebhook.onEvent(chatEvent));
	minecraftServer.on("achievement", (chatEvent: PlayerEvent) => discordAchievementMessagesWebhook.onEvent(chatEvent));
	minecraftServer.on("join", (chatEvent: PlayerEvent) => discordJoinMessagesWebhook.onEvent(chatEvent));
	minecraftServer.on("leave", (chatEvent: PlayerEvent) => discordLeaveMessagesWebhook.onEvent(chatEvent));
}
