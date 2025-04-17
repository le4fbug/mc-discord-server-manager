import { WebhookClient } from "discord.js";
import type { PlayerEvent } from "../minecraft/minecraft-server-output";

const referencePlayer = "_player";

export default class {
	private webhookClient: WebhookClient | null = null;
	private webhookUsername: string = "";
	private avatarUrl: string = "";

	constructor(channelId?: string, webhookUrl?: string, webhookUsername?: string, avatarUrl?: string) {
		if (!webhookUrl || !channelId) return;
		this.webhookClient = new WebhookClient({
			url: webhookUrl,
		});
		this.webhookUsername = webhookUsername ? webhookUsername : "";
		this.avatarUrl = avatarUrl ? avatarUrl : "";
	}

	public onEvent(chatEvent: PlayerEvent) {
		this.webhookClient?.send({
			content: chatEvent.message,
			username: this.webhookUsername === referencePlayer ? chatEvent.player : this.webhookUsername,
			avatarURL:
				this.avatarUrl === referencePlayer
					? `https://minotar.net/avatar/${chatEvent.player}/128`
					: this.avatarUrl,
		});
	}
}
