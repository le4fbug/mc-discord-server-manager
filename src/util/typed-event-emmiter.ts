import { EventEmitter } from "events";

// Enforce string-only keys in the event map
type StrictEventMap = Record<string, (...args: any[]) => void>;

export class TypedEventEmitter<Events extends StrictEventMap> extends EventEmitter {
	override on<K extends keyof Events & string>(event: K, listener: Events[K]): this {
		return super.on(event, listener);
	}

	override off<K extends keyof Events & string>(event: K, listener: Events[K]): this {
		return super.off(event, listener);
	}

	override once<K extends keyof Events & string>(event: K, listener: Events[K]): this {
		return super.once(event, listener);
	}

	override emit<K extends keyof Events & string>(event: K, ...args: Parameters<Events[K]>): boolean {
		return super.emit(event, ...args);
	}
}
