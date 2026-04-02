import { EventEmitter } from 'events';

export type RunEvent =
  | { type: 'step-start'; step: string; description: string }
  | { type: 'step-complete'; step: string }
  | { type: 'step-error'; step: string; error: string }
  | { type: 'field-fill'; field: string; value: string }
  | { type: 'button-click'; label: string }
  | { type: 'checkbox'; label: string; checked: boolean }
  | { type: 'navigation'; url: string }
  | { type: 'network-request'; method: string; url: string; body?: string }
  | { type: 'network-response'; status: number; url: string; duration: number; body?: string }
  | { type: 'auth'; message: string }
  | { type: 'db-query'; query: string }
  | { type: 'info'; message: string }
  | { type: 'context-update'; key: string; value: string }
  | { type: 'user-created'; user: CreatedUser }
  | { type: 'monitoring-start' }
  | { type: 'run-complete' };

export interface CreatedUser {
  email: string;
  password?: string;
  memberId?: string;
  uuid?: string;
  vertical?: string;
  runIndex: number;
}

export class RunEmitter extends EventEmitter {
  private _emit(event: RunEvent): void {
    this.emit('event', event);
  }

  stepStart(step: string, description: string): void {
    this._emit({ type: 'step-start', step, description });
  }

  stepComplete(step: string): void {
    this._emit({ type: 'step-complete', step });
  }

  stepError(step: string, error: string): void {
    this._emit({ type: 'step-error', step, error });
  }

  fieldFill(field: string, value: string): void {
    this._emit({ type: 'field-fill', field, value });
  }

  buttonClick(label: string): void {
    this._emit({ type: 'button-click', label });
  }

  checkboxToggle(label: string, checked: boolean): void {
    this._emit({ type: 'checkbox', label, checked });
  }

  navigation(url: string): void {
    this._emit({ type: 'navigation', url });
  }

  networkRequest(method: string, url: string, body?: string): void {
    this._emit({ type: 'network-request', method, url, body });
  }

  networkResponse(status: number, url: string, duration: number, body?: string): void {
    this._emit({ type: 'network-response', status, url, duration, body });
  }

  auth(message: string): void {
    this._emit({ type: 'auth', message });
  }

  dbQuery(query: string): void {
    this._emit({ type: 'db-query', query });
  }

  info(message: string): void {
    this._emit({ type: 'info', message });
  }

  contextUpdate(key: string, value: string): void {
    this._emit({ type: 'context-update', key, value });
  }

  userCreated(user: CreatedUser): void {
    this._emit({ type: 'user-created', user });
  }

  monitoringStart(): void {
    this._emit({ type: 'monitoring-start' });
  }

  runComplete(): void {
    this._emit({ type: 'run-complete' });
  }
}

export function consoleAdapter(emitter: RunEmitter): void {
  emitter.on('event', (e: RunEvent) => {
    switch (e.type) {
      case 'step-start':
        console.log(`  ⏳ ${e.step}: ${e.description}`);
        break;
      case 'step-complete':
        console.log(`  ✓ ${e.step}`);
        break;
      case 'step-error':
        console.error(`  ✗ ${e.step}: ${e.error}`);
        break;
      case 'field-fill':
        console.log(`    Filled field → ${e.field} → "${e.value}"`);
        break;
      case 'button-click':
        console.log(`    Clicked button → "${e.label}"`);
        break;
      case 'checkbox':
        console.log(`    ${e.checked ? 'Checked' : 'Unchecked'} → ${e.label}`);
        break;
      case 'navigation':
        console.log(`    Navigated → ${e.url}`);
        break;
      case 'network-request':
        console.log(`    → ${e.method} ${e.url}`);
        if (e.body) console.log(`      ${e.body.slice(0, 200)}`);
        break;
      case 'network-response':
        console.log(`    ← ${e.status} (${e.duration}ms)`);
        if (e.body) console.log(`      ${e.body.slice(0, 200)}`);
        break;
      case 'auth':
        console.log(`    🔑 ${e.message}`);
        break;
      case 'db-query':
        console.log(`    🗄 ${e.query}`);
        break;
      case 'info':
        console.log(`    ${e.message}`);
        break;
      case 'context-update':
        break;
      case 'run-complete':
        console.log('  ✅ Run complete');
        break;
    }
  });
}
