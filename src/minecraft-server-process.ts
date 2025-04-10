import { spawn, ChildProcess } from "child_process";
import MinecraftServerMessager from "./minecraft-server-messager";
import MinecraftServerOutput, { type MinecraftMessageEvents, type PlayerEvent } from "./minecraft_server_output";
import { type QueryResult } from "gamedig";
import EventEmitter from "events";
import type { DiscordMessage } from "./discord-minecraft-chat";

export enum ServerStatus {
	Down,
	ShuttingDown,
	SchedulingShutdown,
	BootingUp,
	Up,
}

export type ActiveServerInformation = {
	playersActive: number;
	playerList: string[];
	maxPlayers: number;
	version: string;
};

export type ServerStatusInformation = {
	status: ServerStatus;
	activeServerInformation: ActiveServerInformation | null;
};

export default class extends EventEmitter {
	private serverStatus: ServerStatus = ServerStatus.Down;
	private serverPropertyListeners: Array<(serverProperties: QueryResult | null) => void> = [];
	private minecraftServerMessager: MinecraftServerMessager | null = null;

	constructor() {
		super();
	}

	private setServerStatus(serverStatus: ServerStatus, gameDigQuery?: QueryResult) {
		this.serverStatus = serverStatus;
		let activeServerInformation: ActiveServerInformation | null = null;
		if (gameDigQuery) {
			let playerList: string[] = [];
			gameDigQuery.players.forEach((element) => {
				if (element.name) playerList.push(element.name);
			});
			activeServerInformation = {
				playersActive: gameDigQuery.numplayers,
				maxPlayers: gameDigQuery.maxplayers,
				playerList: playerList,
				version: gameDigQuery.version,
			};
		}

		let serverStatusInformation: ServerStatusInformation = {
			status: serverStatus,
			activeServerInformation: activeServerInformation,
		};
		this.emit("serverStatus", serverStatusInformation);
	}

	public start(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.serverStatus == ServerStatus.BootingUp) return reject("Server is already booting up.");
			if (this.serverStatus == ServerStatus.Up) return reject("Server is already up.");
			if (this.serverStatus == ServerStatus.SchedulingShutdown) {
				this.setServerStatus(ServerStatus.BootingUp);
				return reject("Cancelled shutdown. Continuing with boot.");
			}
			this.setServerStatus(ServerStatus.BootingUp);

			process.chdir(process.env.SERVER_PATH!);

			const javaArgs: string[] = [
				`-Xmx${process.env.SERVER_MEMORY}`,
				`-Xms${process.env.SERVER_MEMORY}`,
				"-jar",
				process.env.SERVER_JAR_FILE!,
				"nogui",
			];

			const minecraftServerProcess: ChildProcess = spawn("java", javaArgs);

			this.minecraftServerMessager = new MinecraftServerMessager();
			this.minecraftServerMessager.on("serverInformation", (gameDigQuery: QueryResult) => {
				this.setServerStatus(this.serverStatus, gameDigQuery);
			});
			this.minecraftServerMessager
				.start()
				.then((gameDigQuery: QueryResult) => {
					if (
						this.serverStatus == ServerStatus.Down ||
						this.serverStatus == ServerStatus.ShuttingDown ||
						this.serverStatus == ServerStatus.SchedulingShutdown
					) {
						this.minecraftServerMessager?.sendCommand("stop");
						return reject("Server shut down before bootup.");
					}

					this.setServerStatus(ServerStatus.Up, gameDigQuery);
					resolve();
				})
				.catch(() => {});

			let minecraftServerOutput = new MinecraftServerOutput(minecraftServerProcess.stdout);
			minecraftServerOutput.on("chat", (chatEvent: PlayerEvent) => this.emit("chat", chatEvent));

			// Handle server output
			if (minecraftServerProcess.stdout) {
				minecraftServerProcess.stdout.on("data", (data) => {
					console.log(`[SERVER] ${data.toString()}`);
				});
			}

			// Handle server errors
			if (minecraftServerProcess.stderr) {
				minecraftServerProcess.stderr.on("data", (data) => {
					console.error(`[SERVER ERROR] ${data.toString()}`);
				});
			}

			// Handle server close
			minecraftServerProcess.on("close", (code) => {
				if (this.minecraftServerMessager) {
					this.minecraftServerMessager.destroy();
					this.minecraftServerMessager = null;
				}

				reject("Server is closed.");
				this.setServerStatus(ServerStatus.Down);
				console.log(`Minecraft server process exited with code ${code}`);

				// Clear server information
				this.serverPropertyListeners.forEach((listeners) => listeners(null));
			});
		});
	}

	public stop(): Promise<string> {
		return new Promise((resolve, reject) => {
			if (this.serverStatus == ServerStatus.Down) return reject("Server is already down.");
			if (this.serverStatus == ServerStatus.ShuttingDown) return reject("Server is already shutting down.");
			if (this.serverStatus == ServerStatus.SchedulingShutdown)
				return reject("Server is already scheduling a shutdown.");

			if (this.serverStatus == ServerStatus.BootingUp) {
				this.setServerStatus(ServerStatus.SchedulingShutdown);
				return resolve(
					"Server currently booting up. Server will stop immediately after. Start server again to cancel."
				);
			}

			this.setServerStatus(ServerStatus.ShuttingDown);

			if (this.minecraftServerMessager) {
				this.minecraftServerMessager
					.sendCommand("stop")
					.then(() => {
						this.setServerStatus(ServerStatus.Down);
						resolve("Server successfully shut down.");
					})
					.catch(() => {
						this.setServerStatus(ServerStatus.Down);
						reject("Something went wrong with rcon stop command.");
					});
			} else {
				this.setServerStatus(ServerStatus.Down);
				reject("Could not find rcon connection.");
			}
		});
	}

	public listenToServerPropertes(listener: (serverProperties: QueryResult | null) => void) {
		this.serverPropertyListeners.push(listener);
	}

	public sendCommand(command: string): Promise<string> {
		return this.minecraftServerMessager ? this.minecraftServerMessager.sendCommand(command) : Promise.reject();
	}

	public isServerRunning(): boolean {
		return this.serverStatus == ServerStatus.Up;
	}

	public sendDiscordMessage(discordMessage: DiscordMessage) {
		if (!this.minecraftServerMessager) return;

		this.minecraftServerMessager
			.sendCommand(`tellraw @a {"text":"<${discordMessage.username}> ${discordMessage.message}","color":"gold"}`)
			.catch(() => {});
	}
}
