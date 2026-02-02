export class LocalStorageMock {
  private store: Record<string, string> = {};

  getItem(key: string) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }

  setItem(key: string, value: string) {
    const stored = String(value);
    this.store[key] = stored;
    Object.defineProperty(this, key, {
      value: stored,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  removeItem(key: string) {
    delete this.store[key];
    delete (this as unknown as Record<string, string>)[key];
  }

  clear() {
    Object.keys(this.store).forEach((key) => this.removeItem(key));
  }
}

export function installMockLocalStorage() {
  const original = window.localStorage;
  const mock = new LocalStorageMock();
  Object.defineProperty(window, 'localStorage', {
    value: mock,
    configurable: true,
  });
  return {
    mock: mock as unknown as Storage,
    restore: () => {
      Object.defineProperty(window, 'localStorage', {
        value: original,
        configurable: true,
      });
    },
  };
}
