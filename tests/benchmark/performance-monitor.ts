/**
 * Performance Monitor — tracks benchmark execution time and enforces
 * the 60-second performance gate.
 */

export interface PerformanceResult {
  totalMs: number;
  phases: Array<{ name: string; durationMs: number }>;
  withinGate: boolean;
}

const PERFORMANCE_GATE_MS = 60_000;

export class PerformanceMonitor {
  private startTime = 0;
  private phases: Array<{ name: string; startMs: number; endMs?: number }> = [];

  start(): void {
    this.startTime = Date.now();
  }

  startPhase(name: string): void {
    this.phases.push({ name, startMs: Date.now() });
  }

  endPhase(name: string): void {
    const phase = this.phases.find((p) => p.name === name && p.endMs === undefined);
    if (phase) {
      phase.endMs = Date.now();
    }
  }

  getResult(): PerformanceResult {
    const totalMs = Date.now() - this.startTime;
    const phases = this.phases.map((p) => ({
      name: p.name,
      durationMs: (p.endMs ?? Date.now()) - p.startMs,
    }));

    return {
      totalMs,
      phases,
      withinGate: totalMs < PERFORMANCE_GATE_MS,
    };
  }

  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }
}
