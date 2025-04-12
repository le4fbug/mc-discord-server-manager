export default class RetryLoop<T = unknown> {
	private fn: () => Promise<T>;
	private intervalMs: number;
	private isCancelled = false;
	private currentPromise: Promise<T> | null = null;

	constructor(fn: () => Promise<T>, intervalMs = 5000) {
		this.fn = fn;
		this.intervalMs = intervalMs;
	}

	public run(): Promise<T> {
		if (this.currentPromise) return this.currentPromise;

		this.currentPromise = new Promise<T>((resolve, reject) => {
			const attempt = async () => {
				while (!this.isCancelled) {
					try {
						const result = await this.fn();
						if (!this.isCancelled) resolve(result);
						return;
					} catch (err) {
						if (this.isCancelled) return;
						await this.delay(this.intervalMs);
					}
				}
			};
			attempt();
		});

		return this.currentPromise;
	}

	public cancel(): void {
		this.isCancelled = true;
	}

	private delay(ms: number): Promise<void> {
		return new Promise((res) => setTimeout(res, ms));
	}
}
