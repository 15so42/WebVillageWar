// 多入料口容器：选择连到哪个口（已占用的口禁用）。
import { importPortLabel } from './transportPorts.js';

export class FurnaceTransportPickerUi {
  constructor(game) {
    this.game = game ?? null;
    this.overlay = null;
    this.onKeyDown = null;
  }

  isOpen() {
    return Boolean(this.overlay);
  }

  close() {
    if (this.onKeyDown) {
      window.removeEventListener('keydown', this.onKeyDown);
      this.onKeyDown = null;
    }
    this.overlay?.remove();
    this.overlay = null;
  }

  open({ station, ports, disabledPorts = [], onChoose, onCancel } = {}) {
    this.close();
    if (typeof document === 'undefined' || !ports?.length) return false;
    const disabled = new Set(disabledPorts);
    const overlay = document.createElement('div');
    overlay.className = 'furnace-link-picker';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '选择入料口');
    const buttons = ports.map((port) => {
      const label = importPortLabel(station, port);
      const isDisabled = disabled.has(port);
      return `<button type="button" data-furnace-port="${port}"${isDisabled ? ' disabled' : ''}>${label}${isDisabled ? '（已连接）' : ''}</button>`;
    }).join('');
    overlay.innerHTML = `
      <div class="furnace-link-picker-panel">
        <h3 class="furnace-link-picker-title">连到哪个入料口？</h3>
        <p class="furnace-link-picker-hint">每个入料口只能接一条来自当前来源的运输线。</p>
        <div class="furnace-link-picker-actions">${buttons}
          <button type="button" class="is-muted" data-furnace-port-cancel>取消</button>
        </div>
      </div>
    `;
    const finish = (port) => {
      this.close();
      if (port) onChoose?.(port);
      else onCancel?.();
    };
    overlay.addEventListener('click', (event) => {
      event.stopPropagation();
      const btn = event.target.closest('[data-furnace-port]');
      if (!btn || btn.disabled) return;
      if (btn.hasAttribute('data-furnace-port-cancel')) {
        finish(null);
        return;
      }
      finish(btn.dataset.furnacePort);
    });
    this.onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      }
    };
    window.addEventListener('keydown', this.onKeyDown);
    document.body.appendChild(overlay);
    this.overlay = overlay;
    overlay.querySelector('[data-furnace-port]:not([disabled])')?.focus?.()
      ?? overlay.querySelector('[data-furnace-port-cancel]')?.focus?.();
    return true;
  }
}
