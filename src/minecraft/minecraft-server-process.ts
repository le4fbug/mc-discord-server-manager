import { spawn, ChildProcess } from "child_process";
import MinecraftServerMessager from "./minecraft-server-messager";
import MinecraftServerOutput, { type PlayerEvent, type ServerOutputEmitter } from "./minecraft-server-output";
import { type QueryResult } from "gamedig";
import TypedEventEmitter from "../util/typed-event-emitter";
import CancellableTimeout from "../util/cancellable-timeout";
import PropertiesReader from "properties-reader";
import path from "path";
import fs from "fs";

export interface DiscordMessage {
	username: string;
	message: string;
}

export enum ServerStatus {
	Down,
	ShuttingDown,
	SchedulingShutdown,
	SchedulingBootup,
	BootingUp,
	Up,
}

export interface ActiveServerInformation {
	playersActive: number;
	playerList: string[];
	maxPlayers: number;
	version: string;
}

export interface ServerStatusInformation {
	status: ServerStatus;
	activeServerInformation: ActiveServerInformation | null;
}

interface ServerStatusEmitter {
	serverStatus: (info: ServerStatusInformation) => void;
}

interface ServerProcessEmitter extends ServerStatusEmitter, ServerOutputEmitter {}

export default class extends TypedEventEmitter<ServerProcessEmitter> {
	private serverStatus: ServerStatus = ServerStatus.Down;
	private minecraftServerMessager: MinecraftServerMessager | null = null;
	private internalStatusEmmitter = new TypedEventEmitter<ServerStatusEmitter>();
	private emptyServerTimer: CancellableTimeout | null = null;
	private serverPath: string | null;
	private serverJarFileName: string | null;
	private serverMinMemory: string | undefined;
	private serverMaxMemory: string | undefined;

	constructor(
		serverPath: string | null,
		serverJarFileName: string | null,
		serverMinMemory: string | undefined,
		serverMaxMemory: string | undefined,
		emptyServerShutdownMinutes: number | null
	) {
		super();

		this.serverPath = serverPath;
		this.serverJarFileName = serverJarFileName;
		this.serverMinMemory = serverMinMemory;
		this.serverMaxMemory = serverMaxMemory;

		if (emptyServerShutdownMinutes)
			this.emptyServerTimer = new CancellableTimeout(() => {
				console.log(`Server has been empty for ${emptyServerShutdownMinutes} minutes. Shutting down...`);
				this.stop();
			}, emptyServerShutdownMinutes * 60 * 1000);
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
			let currentStatus = await this.waitForNextServerStatus();
			if (currentStatus !== ServerStatus.Up)
				throw new Error("Another command stopped the server from booting up.");
			return;
		}

		if (this.serverStatus === ServerStatus.ShuttingDown) {
			console.log("Waiting for shutdown to complete before starting...");
			this.setServerStatus(ServerStatus.SchedulingBootup);
			let currentStatus = await this.waitForNextServerStatus();
			if (currentStatus !== ServerStatus.Down)
				throw new Error("Bootup canceled because server did not shut down.");
		}

		this.setServerStatus(ServerStatus.BootingUp);

		if (this.serverPath) process.chdir(this.serverPath);

		let javaArgs: string[] = [];
		const jarFileName = this.serverJarFileName ? this.serverJarFileName : "server.jar";
		const jarFilePath = path.resolve(this.serverPath ?? ".", jarFileName);
		const doesJarFileExist = fs.existsSync(jarFilePath);
		if (!doesJarFileExist)
			throw new Error(
				jarFilePath +
					" does not exist. Please check the server-path and server-jar-file is correct in bot properties."
			);

		if (this.serverMaxMemory) javaArgs.push(`-Xmx${this.serverMaxMemory}`);
		if (this.serverMinMemory) javaArgs.push(`-Xms${this.serverMinMemory}`);
		javaArgs.push("-jar");
		javaArgs.push(jarFileName);
		javaArgs.push("nogui");

		const propertiesPath = path.resolve(this.serverPath ?? ".", "server.properties");
		const properties = PropertiesReader(propertiesPath);

		const rconEnabled = properties.get("enable-rcon") === true;
		const rconPort = properties.get("rcon.port");
		const rconPassword = String(properties.get("rcon.password"));

		if (rconEnabled && rconPassword != "") {
			this.minecraftServerMessager = new MinecraftServerMessager(
				"localhost",
				rconPort ? Number(rconPort) : 25575,
				rconPassword
			);
		} else {
			console.warn(
				"Please set enable-rcon in your server.properties to true and rcon.password to something. The server will not be able to stop via commands and messages from discord will not show in game otherwise."
			);
		}

		this.minecraftServerMessager?.on("serverInformation", (gameDigQuery: QueryResult) => {
			this.setServerStatus(this.serverStatus, gameDigQuery);
		});

		const minecraftServerProcess: ChildProcess = spawn("java", javaArgs);

		minecraftServerProcess.stdout?.on("data", (data) => {
			console.log(`[SERVER] ${data.toString()}`);
		});
		minecraftServerProcess.stderr?.on("data", (data) => {
			console.error(`[SERVER ERROR] ${data.toString()}`);
		});

		const minecraftServerOutput = new MinecraftServerOutput(minecraftServerProcess.stdout);
		minecraftServerOutput.on("chat", (chatEvent: PlayerEvent) => this.emit("chat", chatEvent));
		minecraftServerOutput.on("death", (chatEvent: PlayerEvent) => this.emit("death", chatEvent));
		minecraftServerOutput.on("achievement", (chatEvent: PlayerEvent) => this.emit("achievement", chatEvent));
		minecraftServerOutput.on("join", (chatEvent: PlayerEvent) => this.emit("join", chatEvent));
		minecraftServerOutput.on("leave", (chatEvent: PlayerEvent) => this.emit("leave", chatEvent));

		const earlyExit = new Promise<never>((_, reject) => {
			minecraftServerProcess.once("close", (code) => {
				console.log(`Minecraft server process exited with code ${code}`);
				this.minecraftServerMessager?.destroy();
				this.minecraftServerMessager = null;
				this.setServerStatus(ServerStatus.Down);
				if (code == 0) reject(new Error("Minecraft server shut down during boot up."));
				else reject(new Error("Minecraft server crashed during boot up."));
			});
			this.waitForNextServerStatus().then((currentStatus) => {
				if (currentStatus !== ServerStatus.Up) reject("Another command stopped the server from starting.");
			});
		});

		const serverReady = this.minecraftServerMessager?.start().then((gameDigQuery) => {
			this.setServerStatus(ServerStatus.Up, gameDigQuery);
		});

		await Promise.race([earlyExit, serverReady]);
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
			if (currentStatus !== ServerStatus.Up) throw new Error("Another command stopped server shutdown.");
		}

		this.setServerStatus(ServerStatus.ShuttingDown);

		if (this.minecraftServerMessager) {
			try {
				await this.minecraftServerMessager.sendStop();
				const serverStatus = await this.waitForNextServerStatus();
				if (serverStatus === ServerStatus.Down) {
					return "Server successfully shut down.";
				} else {
					throw new Error("Another command stopped server shutdown.");
				}
			} catch (error) {
				throw new Error("Something went wrong with rcon stop command.");
			}
		} else {
			throw new Error("Could not find rcon connection.");
		}
	}

	public sendCommand(command: string): Promise<string> {
		return this.minecraftServerMessager
			? this.minecraftServerMessager.sendCommand(command)
			: Promise.reject("Server is not running.");
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
