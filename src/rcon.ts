import net from "net";
import { Buffer } from "buffer";
import RetryLoop from "./util/retry-loop";

enum RconPacketType {
	AUTH = 3,
	AUTH_RESPONSE = 2,
	COMMAND = 2,
	RESPONSE = 0,
}

export default class {
	private socket: net.Socket | null = null;
	private requestId = 0;
	private host: string;
	private port: number;
	private password: string;
	private retryLoop;

	constructor(host: string, port: number, password: string) {
		this.host = host;
		this.port = port;
		this.password = password;
		this.retryLoop = new RetryLoop(() => this.tryConnect(), 3000);
	}

	private tryConnect(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.cleanupSocket();
			this.socket = net.createConnection(this.port, this.host, () => {
				this.authenticate().then(resolve).catch(reject);
			});
			this.socket.on("error", reject);
		});
	}

	public connect(): Promise<void> {
		return this.retryLoop.run();
	}

	private authenticate(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.sendPacket(this.password, RconPacketType.AUTH)
				.then((response) => {
					if (response.id === -1) {
						reject("Authentication failed (invalid RCON password)");
					} else {
						resolve();
					}
				})
				.catch(reject);
		});
	}

	public async sendCommand(command: string): Promise<string> {
		const response = await this.sendPacket(command, RconPacketType.COMMAND);
		return response.body;
	}

	private sendPacket(body: string, type: RconPacketType): Promise<{ id: number; body: string }> {
		return new Promise((resolve, reject) => {
			if (!this.socket) return reject("Socket not connected");

			const id = this.requestId++;
			const bodyBuffer = Buffer.from(body, "utf8");
			const packet = Buffer.alloc(4 + 4 + bodyBuffer.length + 2); // id + type + body + 2 null bytes

			packet.writeInt32LE(id, 0);
			packet.writeInt32LE(type, 4);
			bodyBuffer.copy(packet, 8);
			packet.writeInt16LE(0, 8 + bodyBuffer.length); // 2 null terminators

			const fullPacket = Buffer.alloc(4 + packet.length); // length + packet
			fullPacket.writeInt32LE(packet.length, 0);
			packet.copy(fullPacket, 4);

			this.socket.once("data", (data) => {
				const length = data.readInt32LE(0);
				const responseId = data.readInt32LE(4);
				const responseBody = data.toString("utf8", 12, 4 + length - 2); // remove last 2 nulls

				resolve({ id: responseId, body: responseBody });
			});

			this.socket.write(fullPacket);
		});
	}

	private cleanupSocket(): void {
		if (this.socket) {
			this.socket.destroy();
			this.socket = null;
		}
	}

	public disconnect(): void {
		this.retryLoop.cancel();
		this.cleanupSocket();
	}
}
