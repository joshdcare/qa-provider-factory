import fs from 'fs';
import path from 'path';
import type { RunEmitter, RunEvent } from '../tui/emitter.js';
import type {
  ReportContext,
  ReportStep,
  ReportRequest,
  ReportError,
  ReportMeta,
  RunReport,
} from './types.js';
import { generateHtmlReport } from './html-template.js';

export interface RunRecorderConfig {
  platform: 'mobile' | 'web';
  vertical: string;
  tier: string;
  targetStep: string;
  runsDir?: string;
}

interface PendingRequest {
  method: string;
  url: string;
  body: string | null;
  timestamp: string;
}

interface ActiveStep {
  step: ReportStep;
  startTime: number;
}

export class RunRecorder {
  public readonly runDir: string;

  private readonly config: RunRecorderConfig;
  private readonly constructedAt: Date;
  private readonly steps: ReportStep[] = [];
  private readonly errors: ReportError[] = [];

  private currentStep: ActiveStep | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private finished = false;
  private cachedReport: RunReport | null = null;

  constructor(config: RunRecorderConfig) {
    this.config = config;
    this.constructedAt = new Date();

    const runsDir = config.runsDir ?? path.resolve('runs');
    const ts = this.formatTimestamp(this.constructedAt);
    const dirName = `${ts}_${config.platform}_${config.vertical}`;
    this.runDir = path.join(runsDir, dirName);

    fs.mkdirSync(this.runDir, { recursive: true });

    if (config.platform === 'web') {
      fs.mkdirSync(path.join(this.runDir, 'screenshots'), { recursive: true });
    }
  }

  attach(emitter: RunEmitter): void {
    emitter.on('event', (e: RunEvent) => this.handleEvent(e));
  }

  recordError(step: string, err: Error): void {
    this.errors.push({
      step,
      message: err.message,
      stack: err.stack ?? err.message,
      timestamp: new Date().toISOString(),
    });
  }

  async finish(ctx: Record<string, any>): Promise<RunReport> {
    if (this.finished && this.cachedReport) {
      return this.cachedReport;
    }

    this.finished = true;

    const context: ReportContext = {
      email: ctx.email,
      password: ctx.password,
      memberId: ctx.memberId ?? null,
      uuid: ctx.uuid ?? null,
      authToken: ctx.authToken ?? null,
      accessToken: ctx.accessToken ?? null,
      vertical: ctx.vertical ?? null,
    };

    const meta: ReportMeta = {
      timestamp: this.constructedAt.toISOString(),
      platform: this.config.platform,
      vertical: this.config.vertical,
      tier: this.config.tier,
      targetStep: this.config.targetStep,
      totalDuration: Date.now() - this.constructedAt.getTime(),
      outcome: this.steps.some(s => s.status === 'fail') ? 'fail' : 'pass',
    };

    const report: RunReport = {
      meta,
      context,
      steps: this.steps,
      errors: this.errors,
    };

    fs.writeFileSync(
      path.join(this.runDir, 'report.json'),
      JSON.stringify(report, null, 2),
    );

    const screenshots = this.loadScreenshots();
    const html = generateHtmlReport(report, screenshots);
    fs.writeFileSync(path.join(this.runDir, 'report.html'), html);

    console.log(`  📁 Run saved to: ${this.runDir}`);

    this.cachedReport = report;
    return report;
  }

  private handleEvent(e: RunEvent): void {
    switch (e.type) {
      case 'step-start':
        this.currentStep = {
          step: {
            name: e.step,
            status: 'skipped',
            duration: 0,
            startedAt: new Date().toISOString(),
            requests: [],
            screenshot: null,
            error: null,
          },
          startTime: Date.now(),
        };
        this.pendingRequests.clear();
        break;

      case 'step-complete':
        if (this.currentStep) {
          this.flushPendingRequests();
          this.currentStep.step.status = 'pass';
          this.currentStep.step.duration = Date.now() - this.currentStep.startTime;
          this.steps.push(this.currentStep.step);
          this.currentStep = null;
        }
        break;

      case 'step-error':
        if (this.currentStep) {
          this.flushPendingRequests();
          this.currentStep.step.status = 'fail';
          this.currentStep.step.error = e.error;
          this.currentStep.step.duration = Date.now() - this.currentStep.startTime;
          this.steps.push(this.currentStep.step);
          this.currentStep = null;
        }
        break;

      case 'network-request':
        this.pendingRequests.set(e.url, {
          method: e.method,
          url: e.url,
          body: e.body ?? null,
          timestamp: new Date().toISOString(),
        });
        break;

      case 'network-response':
        if (this.currentStep) {
          const pending = this.pendingRequests.get(e.url);
          if (pending) {
            this.pendingRequests.delete(e.url);
            this.currentStep.step.requests.push({
              method: pending.method,
              url: pending.url,
              status: e.status,
              duration: e.duration,
              requestBody: pending.body,
              responseBody: e.body ?? null,
              timestamp: pending.timestamp,
            });
          }
        }
        break;
    }
  }

  private flushPendingRequests(): void {
    if (!this.currentStep) return;

    for (const [, pending] of this.pendingRequests) {
      this.currentStep.step.requests.push({
        method: pending.method,
        url: pending.url,
        status: null,
        duration: 0,
        requestBody: pending.body,
        responseBody: null,
        timestamp: pending.timestamp,
      });
    }
    this.pendingRequests.clear();
  }

  private loadScreenshots(): Record<string, Buffer> {
    const screenshotsDir = path.join(this.runDir, 'screenshots');
    const result: Record<string, Buffer> = {};
    if (!fs.existsSync(screenshotsDir)) return result;

    const files = fs.readdirSync(screenshotsDir);
    for (const file of files) {
      if (/\.(png|jpe?g|gif|webp)$/i.test(file)) {
        result[`screenshots/${file}`] = fs.readFileSync(path.join(screenshotsDir, file));
      }
    }
    return result;
  }

  private formatTimestamp(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return [
      d.getFullYear(),
      '-', pad(d.getMonth() + 1),
      '-', pad(d.getDate()),
      '_', pad(d.getHours()),
      '-', pad(d.getMinutes()),
      '-', pad(d.getSeconds()),
    ].join('');
  }
}
