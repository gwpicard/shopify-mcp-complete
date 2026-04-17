export class RateLimiter {
  private currentlyAvailable: number;
  private maximumAvailable: number;
  private restoreRate: number;
  private lastUpdated: number;

  constructor() {
    this.currentlyAvailable = 2000;
    this.maximumAvailable = 2000;
    this.restoreRate = 100;
    this.lastUpdated = Date.now();
  }

  update(throttleStatus: {
    maximumAvailable: number;
    currentlyAvailable: number;
    restoreRate: number;
  }): void {
    this.currentlyAvailable = throttleStatus.currentlyAvailable;
    this.maximumAvailable = throttleStatus.maximumAvailable;
    this.restoreRate = throttleStatus.restoreRate;
    this.lastUpdated = Date.now();
  }

  async waitIfNeeded(estimatedCost: number = 100): Promise<void> {
    const elapsed = (Date.now() - this.lastUpdated) / 1000;
    const restored = Math.min(
      elapsed * this.restoreRate,
      this.maximumAvailable
    );
    const estimated = Math.min(
      this.currentlyAvailable + restored,
      this.maximumAvailable
    );

    if (estimated < estimatedCost) {
      const waitSeconds = (estimatedCost - estimated) / this.restoreRate;
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    }
  }
}
