/**
 * chrome.debugger(CDP) 얇은 래퍼.
 * sendCommand를 Promise로 감싸고 target 수명주기를 관리한다.
 */

const PROTOCOL_VERSION = "1.3";

export class CdpSession {
  private target: chrome.debugger.Debuggee;
  private connected = false;

  constructor(tabId: number) {
    this.target = { tabId };
  }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      chrome.debugger.attach(this.target, PROTOCOL_VERSION, () => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        resolve();
      });
    });
    this.connected = true;
  }

  async send<T = unknown>(method: string, params?: object): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      chrome.debugger.sendCommand(this.target, method, params ?? {}, (result) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(`${method}: ${err.message}`));
        resolve(result as T);
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await new Promise<void>((resolve) => {
      chrome.debugger.detach(this.target, () => {
        // detach 실패는 무시 (탭이 이미 닫혔을 수 있음)
        void chrome.runtime.lastError;
        resolve();
      });
    });
    this.connected = false;
  }
}
