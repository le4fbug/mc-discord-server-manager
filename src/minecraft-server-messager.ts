import EventEmitter from "events";
import { GameDig, type QueryResult } from "gamedig";
import Rcon from "./rcon";

export default class MinecraftServerMessager extends EventEmitter {
	private rcon = new Rcon("localhost", 25575, "123");
	private isInitialConnectionEstablished: boolean = false;
	private isDestroyed: boolean = false;

	constructor() {
		super();
	}

	public start(): Promise<QueryResult> {
		return new Promise((resolve, reject) => {
			const serverListenerStart = async () => {
				try {
					const serverProperties = await GameDig.query({
						type: "minecraft",
						host: "localhost",
					});

					if (!this.isInitialConnectionEstablished) {
						this.isInitialConnectionEstablished = true;
						this.rcon.connect();
						resolve(serverProperties);
					} else {
						this.emit("serverInformation", serverProperties);
					}
				} catch (error) {}

				if (this.isDestroyed) {
					return reject();
				}
				setTimeout(serverListenerStart, 1000);
			};

			serverListenerStart();
		});
	}

	public sendCommand(command: string): Promise<string> {
		return this.rcon.sendCommand(command);
	}

	public destroy(): void {
		this.isDestroyed = true;
		this.rcon.disconnect();
	}
}
