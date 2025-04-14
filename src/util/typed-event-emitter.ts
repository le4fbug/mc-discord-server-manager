import { EventEmitter } from "events";

export default class<Events> extends EventEmitter {
	override on<K extends keyof Events & string>(
		event: K,
		listener: Events[K] extends (...args: any[]) => void ? Events[K] : never
	): this {
		return super.on(event, listener as any);
	}

	override off<K extends keyof Events & string>(
		event: K,
		listener: Events[K] extends (...args: any[]) => void ? Events[K] : never
	): this {
		return super.off(event, listener as any);
	}

	override once<K extends keyof Events & string>(
		event: K,
		listener: Events[K] extends (...args: any[]) => void ? Events[K] : never
	): this {
		return super.once(event, listener as any);
	}

	override emit<K extends keyof Events & string>(
		event: K,
		...args: Events[K] extends (...args: infer P) => void ? P : never
	): boolean {
		return super.emit(event, ...args);
	}
}
