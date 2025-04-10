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
	death: (event: PlayerEvent) => void;
	raw: (outputLine: string) => void;
}

export type MinecraftMessageEvent = keyof MinecraftMessageEvents;

export default class extends EventEmitter {
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
			const message = line.split(/\[Server thread\/INFO\]: /i)[0];
			const [, player] = joinMatch;
			this.emit("join", { player, message } as PlayerEvent);
			return;
		}

		// Leave message
		const leaveMatch = line.match(/\[Server thread\/INFO\]: ([A-Za-z0-9_]+) left the game/);
		if (leaveMatch) {
			const message = line.split(/\[Server thread\/INFO\]: /i)[0];
			const [, player] = leaveMatch;
			this.emit("leave", { player, message } as PlayerEvent);
			return;
		}

		// Death messages (generic match for any death message)
		const deathMatch = line.match(
			/\[Server thread\/INFO\]: ([A-Za-z0-9_]+) .* (died|was|slain|blew up|fell|hit the ground|burned|tried to swim|was shot|was blown|was killed|suffocated|starved|was impaled|experienced kinetic energy|was squashed|was poked)/i
		);
		if (deathMatch) {
			const message = line.split(/\[Server thread\/INFO\]: /i)[0];
			const [, player] = deathMatch;
			this.emit("death", { player, message } as PlayerEvent);
			return;
		}
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
