import { Client, WebhookClient } from "discord.js";
import type { PlayerEvent } from "./minecraft_server_output";
import EventEmitter from "events";

export type DiscordMessage = {
	username: string;
	message: string;
};

export default class extends EventEmitter {
	private webhookClient: WebhookClient | null = null;

	constructor(client: Client, channelId?: string, webhookUrl?: string) {
		super();
		if (!webhookUrl || !channelId) return;

		client.on("messageCreate", (message) => {
			if (message.author.bot) return;
			if (message.webhookId) return;
			if (message.channelId != channelId) return;

			this.emit("discordMessage", {
				username: message.author.username,
				message: message.cleanContent,
			});
		});
		this.webhookClient = new WebhookClient({
			url: webhookUrl,
		});
	}

	public onMinecraftChat(chatEvent: PlayerEvent) {
		this.webhookClient?.send({
			content: chatEvent.message,
			username: chatEvent.player,
			avatarURL: `https://minotar.net/avatar/${chatEvent.player}/128`,
		});
	}

	override on(event: "discordMessage", listener: (discordMessage: DiscordMessage) => void) {
		return super.on(event, listener);
	}

	override emit(event: "discordMessage", payload: DiscordMessage) {
		return super.emit(event, payload);
	}
}
