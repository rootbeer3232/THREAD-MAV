import type { Settings } from '../core/settings-model';
import type { Repository } from '../storage/repository';

export interface AppContext {
  repo: Repository;
  settings: Settings;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  go(route: string, params?: Record<string, string>): void;
  toast(message: string): void;
  storageFallbackReason?: string;
}

export interface Screen {
  el: HTMLElement;
  destroy?(): void;
}

export interface ScreenDef {
  /** Route name: '' (home), 'thread', ... */
  route: string;
  title: string;
  /** Which bottom-tab is highlighted. */
  tab: 'home' | 'calcs' | 'saved' | 'history' | 'settings';
  /** Show a back button to this route. */
  back?: string;
  backLabel?: string;
  render(ctx: AppContext, params: URLSearchParams): Screen | Promise<Screen>;
}
