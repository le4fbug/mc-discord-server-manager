import TypedEventEmitter from "../util/typed-event-emitter";
import { GameDig, type QueryResult } from "gamedig";
import Rcon from "./rcon";
import RetryLoop from "../util/retry-loop";

interface MessagerEmitter {
	serverInformation: (serverInformation: QueryResult) => void;
}

export default class MinecraftServerMessager extends TypedEventEmitter<MessagerEmitter> {
	private rcon: Rcon;
	private isInitialConnectionEstablished: boolean = false;
	private isDestroyed: boolean = false;
	private stopRetryLoop: RetryLoop<void>;

	constructor(serverIp: string, rconPort: number, rconPassword: string) {
		super();
		this.stopRetryLoop = new RetryLoop(
			() =>
				new Promise<void>(async (resolve, reject) => {
					{
						try {
							let response: string = await this.sendCommand("stop");
							if (response) resolve();
							else reject();
						} catch (error) {
							reject(error);
						}
					}
				}),
			3000
		);
		this.rcon = new Rcon(serverIp, rconPort, rconPassword);
	}

	public start(): Promise<QueryResult> {
		return new Promise(async (resolve, reject) => {
			await this.rcon.connect();
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

	public sendStop(): Promise<void> {
		return this.stopRetryLoop.run();
	}

	public destroy(): void {
		this.isDestroyed = true;
		this.stopRetryLoop.cancel();
		this.rcon.disconnect();
	}
}
