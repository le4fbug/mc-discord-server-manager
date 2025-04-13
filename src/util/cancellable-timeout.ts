export default class CancellableTimeout {
	private timeoutId: NodeJS.Timeout | null = null;
	private callback: () => void;
	private delay: number;

	constructor(callback: () => void, delay: number) {
		this.callback = callback;
		this.delay = delay;
	}

	public start() {
		if (this.timeoutId) return;

		this.timeoutId = setTimeout(() => {
			this.callback();
		}, this.delay);
	}

	public restart() {
		this.cancel();
		this.start();
	}

	public cancel() {
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
			this.timeoutId = null;
		}
	}

	public isRunning(): boolean {
		return this.timeoutId ? true : false;
	}
}
