import { spawn, ChildProcess } from "child_process";
import MinecraftServerMessager from "./minecraft-server-messager";
import MinecraftServerOutput, { type PlayerEvent } from "./minecraft-server-output";
import { type QueryResult } from "gamedig";
import { TypedEventEmitter } from "./util/typed-event-emmiter";
import CancellableTimeout from "./util/cancellable-timeout";

export type DiscordMessage = {
	username: string;
	message: string;
};

export enum ServerStatus {
	Down,
	ShuttingDown,
	SchedulingShutdown,
	SchedulingBootup,
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

interface ServerStatusEmmitter {
	serverStatus: (info: ServerStatusInformation) => void;
	[key: string]: (...args: any[]) => void;
}

export default class extends TypedEventEmitter<ServerStatusEmmitter> {
	private serverStatus: ServerStatus = ServerStatus.Down;
	private minecraftServerMessager: MinecraftServerMessager | null = null;
	private internalStatusEmmitter = new TypedEventEmitter<ServerStatusEmmitter>();
	private emptyServerTimer: CancellableTimeout | null = null;

	constructor() {
		super();
		let shutdownMinutes = process.env.EMPTY_SERVER_SHUTDOWN_MINUTES;
		if (shutdownMinutes)
			this.emptyServerTimer = new CancellableTimeout(() => {
				console.log(`Server has been empty for ${shutdownMinutes} minutes. Shutting down...`);
				this.stop();
			}, Number(process.env.EMPTY_SERVER_SHUTDOWN_MINUTES) * 60 * 1000);
	}

	private setServerStatus(serverStatus: ServerStatus, gameDigQuery?: QueryResult) {
		let previousStatus = this.serverStatus;
		this.serverStatus = serverStatus;
		// If server is booting up or shutting down we don't want to emit down or up states to externel emmitter
		// since values will change to shutting down or booting up straight away
		if (
			(previousStatus == ServerStatus.SchedulingBootup && serverStatus == ServerStatus.Down) ||
			(previousStatus == ServerStatus.SchedulingShutdown && serverStatus == ServerStatus.Up)
		)
			return this.internalStatusEmmitter.emit("serverStatus", {
				status: serverStatus,
				activeServerInformation: null,
			});

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

			if (gameDigQuery.numplayers == 0) {
				this.emptyServerTimer?.start();
			} else {
				this.emptyServerTimer?.cancel();
			}
		} else {
			this.emptyServerTimer?.cancel();
		}

		let serverStatusInformation: ServerStatusInformation = {
			status: serverStatus,
			activeServerInformation: activeServerInformation,
		};
		this.internalStatusEmmitter.emit("serverStatus", serverStatusInformation);
		this.emit("serverStatus", serverStatusInformation);
	}

	private waitForNextServerStatus(): Promise<ServerStatus> {
		let currentServerStatus = this.serverStatus;
		return new Promise((resolve) => {
			// Create a listener to capture the next server status change
			const listener = (statusInfo: ServerStatusInformation) => {
				if (currentServerStatus == statusInfo.status) return;
				// Once the next status change happens, resolve the promise and remove the listener
				this.internalStatusEmmitter.off("serverStatus", listener);
				resolve(statusInfo.status);
			};

			// Listen to the next status change
			this.internalStatusEmmitter.on("serverStatus", listener);
		});
	}

	public async start(): Promise<void> {
		if (this.serverStatus === ServerStatus.BootingUp) {
			throw new Error("Server is already booting up.");
		}

		if (this.serverStatus === ServerStatus.SchedulingBootup) {
			throw new Error("Server is already scheduling a boot up.");
		}

		if (this.serverStatus === ServerStatus.Up) {
			throw new Error("Server is already up.");
		}

		if (this.serverStatus === ServerStatus.SchedulingShutdown) {
			this.setServerStatus(ServerStatus.BootingUp);
			throw new Error("Cancelled shutdown. Continuing with boot.");
		}

		if (this.serverStatus === ServerStatus.ShuttingDown) {
			console.log("Waiting for shutdown to complete before starting...");
			this.setServerStatus(ServerStatus.SchedulingBootup);
			let currentStatus = await this.waitForNextServerStatus();
			if (currentStatus !== ServerStatus.Down)
				throw new Error("Bootup canceled because server did not shut down.");
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

		this.minecraftServerMessager?.destroy();
		this.minecraftServerMessager = new MinecraftServerMessager();

		this.minecraftServerMessager.on("serverInformation", (gameDigQuery: QueryResult) => {
			this.setServerStatus(this.serverStatus, gameDigQuery);
		});

		if (minecraftServerProcess.stdout) {
			minecraftServerProcess.stdout.on("data", (data) => {
				console.log(`[SERVER] ${data.toString()}`);
			});
		}

		if (minecraftServerProcess.stderr) {
			minecraftServerProcess.stderr.on("data", (data) => {
				console.error(`[SERVER ERROR] ${data.toString()}`);
			});
		}

		const minecraftServerOutput = new MinecraftServerOutput(minecraftServerProcess.stdout);
		minecraftServerOutput.on("chat", (chatEvent: PlayerEvent) => this.emit("chat", chatEvent));
		minecraftServerOutput.on("death", (chatEvent: PlayerEvent) => this.emit("death", chatEvent));
		minecraftServerOutput.on("achievement", (chatEvent: PlayerEvent) => this.emit("achievement", chatEvent));
		minecraftServerOutput.on("join", (chatEvent: PlayerEvent) => this.emit("join", chatEvent));
		minecraftServerOutput.on("leave", (chatEvent: PlayerEvent) => this.emit("leave", chatEvent));

		minecraftServerProcess.on("close", (code) => {
			console.log(`Minecraft server process exited with code ${code}`);
			this.minecraftServerMessager?.destroy();
			this.minecraftServerMessager = null;
			this.setServerStatus(ServerStatus.Down);
		});

		try {
			const gameDigQuery = await this.minecraftServerMessager.start();
			this.setServerStatus(ServerStatus.Up, gameDigQuery);
		} catch (error) {
			throw error;
		}
	}

	public async stop(): Promise<string> {
		if (this.serverStatus === ServerStatus.Down) {
			throw new Error("Server is already down.");
		}

		if (this.serverStatus === ServerStatus.ShuttingDown) {
			throw new Error("Server is already shutting down.");
		}

		if (this.serverStatus === ServerStatus.SchedulingShutdown) {
			throw new Error("Server is already scheduling a shutdown.");
		}

		if (this.serverStatus === ServerStatus.BootingUp) {
			this.setServerStatus(ServerStatus.SchedulingShutdown);
			// Wait for the server to fully boot up if it's in the BootingUp state
			let currentStatus = await this.waitForNextServerStatus();
			if (currentStatus !== ServerStatus.Up) throw new Error("Canceled shutdown because server did not boot up.");
		}

		this.setServerStatus(ServerStatus.ShuttingDown);

		if (this.minecraftServerMessager) {
			try {
				await this.minecraftServerMessager.sendStop();
				return "Server successfully shut down.";
			} catch (error) {
				throw new Error("Something went wrong with rcon stop command.");
			}
		} else {
			throw new Error("Could not find rcon connection.");
		}
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
