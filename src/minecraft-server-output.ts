import { Readable } from "stream";
import { EventEmitter } from "events";
import readline from "readline";

export interface PlayerEvent {
	player: string;
	message: string;
}

export interface MinecraftMessageEvents {
	chat: (event: PlayerEvent) => void;
	join: (event: PlayerEvent) => void;
	leave: (event: PlayerEvent) => void;
	achievement: (event: PlayerEvent) => void;
	death: (event: PlayerEvent) => void;
	raw: (outputLine: string) => void;
}

export type MinecraftMessageEvent = keyof MinecraftMessageEvents;

export default class extends EventEmitter {
	private playerList: string[] = [];

	constructor(stream: Readable | null) {
		super();
		const rl = readline.createInterface({ input: stream ? stream : new Readable() });

		rl.on("line", (line: string) => this.parseLine(line));
	}

	private parseLine(line: string) {
		// Chat messages
		const chatMatch = line.match(/<([A-Za-z0-9_]+)> (.+)/);
		if (chatMatch) {
			const [, player, message] = chatMatch;
			this.emit("chat", { player, message } as PlayerEvent);
			return;
		}

		// Join message
		const joinMatch = line.match(/\[Server thread\/INFO\]: ([A-Za-z0-9_]+) joined the game/);
		if (joinMatch) {
			const message = line.split(/\[Server thread\/INFO\]: /i)[1];
			const [, player] = joinMatch;
			this.playerList.push(player as string);
			this.emit("join", { player, message } as PlayerEvent);
			return;
		}

		// Leave message
		const leaveMatch = line.match(/\[Server thread\/INFO\]: ([A-Za-z0-9_]+) left the game/);
		if (leaveMatch) {
			const message = line.split(/\[Server thread\/INFO\]: /i)[1];
			const [, player] = leaveMatch;
			const index = this.playerList.indexOf(player as string);
			if (index > -1) {
				this.playerList.splice(index, 1);
			}
			this.emit("leave", { player, message } as PlayerEvent);
			return;
		}

		// Achievement message
		const achievementMatch = line.match(
			/\[Server thread\/INFO\]: ([A-Za-z0-9_]+) has (made|reached|earned) (the advancement|the achievement) \[(.+?)\]/
		);
		if (achievementMatch) {
			const message = line.split(/\[Server thread\/INFO\]: /i)[1];
			const [, player] = achievementMatch;
			this.emit("achievement", { player, message } as PlayerEvent);
			return;
		}

		const player = this.playerList.find((playerName) => line.includes(playerName));
		if (!player) return;

		// Other messsages other than death messages that include player names
		if (line.includes("logged in with entity id")) return;
		if (line.includes("lost connection")) return;
		if (line.includes("moved too quickly!")) return;

		const message = line.split(/\[Server thread\/INFO\]: /i)[1];
		if (message) this.emit("death", { player, message } as PlayerEvent);
	}

	override on<U extends MinecraftMessageEvent>(event: U, listener: MinecraftMessageEvents[U]): this {
		return super.on(event, listener);
	}

	override emit<U extends MinecraftMessageEvent>(
		event: U,
		payload: Parameters<MinecraftMessageEvents[U]>[0]
	): boolean {
		return super.emit(event, payload);
	}
}
