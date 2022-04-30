import {
  HassEntities,
  HassConfig,
  Auth,
  Connection,
  MessageBase,
  HassServices,
  HassServiceTarget,
} from 'home-assistant-js-websocket';

export enum TimeFormat {
  language = 'language',
  system = 'system',
  am_pm = '12',
  twenty_four = '24',
}

export enum NumberFormat {
  language = 'language',
  system = 'system',
  comma_decimal = 'comma_decimal',
  decimal_comma = 'decimal_comma',
  space_comma = 'space_comma',
  none = 'none',
}

export interface FrontendLocaleData {
  language: string;
  number_format: NumberFormat;
  time_format: TimeFormat;
}

export interface ToggleMenuActionConfig extends BaseActionConfig {
  action: 'toggle-menu';
}

export interface ToggleActionConfig extends BaseActionConfig {
  action: 'toggle';
}

export interface CallServiceActionConfig extends BaseActionConfig {
  action: 'call-service';
  service: string;
  service_data?: {
    entity_id?: string | [string];
    [key: string]: any;
  };

  target?: HassServiceTarget;
  repeat?: number;
  haptic?: any;
}

export interface NavigateActionConfig extends BaseActionConfig {
  action: 'navigate';
  navigation_path: string;
}

export interface UrlActionConfig extends BaseActionConfig {
  action: 'url';
  url_path: string;
}

export interface MoreInfoActionConfig extends BaseActionConfig {
  action: 'more-info';
  entity?: string;
}

export interface NoActionConfig extends BaseActionConfig {
  action: 'none';
}

export interface CustomActionConfig extends BaseActionConfig {
  action: 'fire-dom-event';
}

/**
 * `repeat` and `haptic` are specifically for use in custom cards like the Button-Card
 */
export interface BaseActionConfig {
  confirmation?: ConfirmationRestrictionConfig;
  repeat?: number;
  haptic?: any;
}

export interface ConfirmationRestrictionConfig {
  text?: string;
  exemptions?: RestrictionConfig[];
}

export interface RestrictionConfig {
  user: string;
}

export type ActionConfig =
  | ToggleActionConfig
  | CallServiceActionConfig
  | NavigateActionConfig
  | UrlActionConfig
  | MoreInfoActionConfig
  | NoActionConfig
  | CustomActionConfig
  | ToggleMenuActionConfig;

export interface Window {
  // Custom panel entry point url
  customPanelJS: string;
  ShadyCSS: {
    nativeCss: boolean;
    nativeShadow: boolean;
    prepareTemplate(
      templateElement: any,
      elementName: any,
      elementExtension: any
    ): any;
    styleElement(element: any): any;
    styleSubtree(element: any, overrideProperties: any): any;
    styleDocument(overrideProperties: any): any;
    getComputedStyleValue(element: any, propertyName: any): any;
  };
}

declare global {
  // for fire event
  interface HASSDomEvents {
    'value-changed': {
      value: unknown;
    };
    'config-changed': {
      config: any;
    };
    'hass-more-info': {
      entityId: string | undefined;
    };
    'll-rebuild': {};
    'll-custom': {};
    'location-changed': {
      replace: boolean;
    };
    'show-dialog': {};
    action: {
      action: string;
    };
  }
}

export type LocalizeFunc = (key: string, ...args: any[]) => string;

export interface Credential {
  auth_provider_type: string;
  auth_provider_id: string;
}

export interface MFAModule {
  id: string;
  name: string;
  enabled: boolean;
}

export interface CurrentUser {
  id: string;
  is_owner: boolean;
  is_admin: boolean;
  name: string;
  credentials: Credential[];
  mfa_modules: MFAModule[];
}

export interface Theme {
  // Incomplete
  'primary-color': string;
  'text-primary-color': string;
  'accent-color': string;
}

export interface Themes {
  default_theme: string;
  themes: { [key: string]: Theme };
}

export interface Panel {
  component_name: string;
  config: { [key: string]: any } | null;
  icon: string | null;
  title: string | null;
  url_path: string;
}

export interface Panels {
  [name: string]: Panel;
}

export interface Resources {
  [language: string]: { [key: string]: string };
}

export interface Translation {
  nativeName: string;
  isRTL: boolean;
  fingerprints: { [fragment: string]: string };
}

export interface ServiceCallRequest {
  domain: string;
  service: string;
  serviceData?: Record<string, any>;
  target?: HassServiceTarget;
}

export interface HomeAssistant {
  auth: Auth;
  connection: Connection;
  connected: boolean;
  states: HassEntities;
  services: HassServices;
  config: HassConfig;
  themes: Themes;
  selectedTheme?: string | null;
  panels: Panels;
  panelUrl: string;

  // i18n
  // current effective language, in that order:
  //   - backend saved user selected lanugage
  //   - language in local appstorage
  //   - browser language
  //   - english (en)
  language: string;
  locale: FrontendLocaleData;
  // local stored language, keep that name for backward compability
  selectedLanguage: string | null;
  resources: Resources;
  localize: LocalizeFunc;
  translationMetadata: {
    fragments: string[];
    translations: {
      [lang: string]: Translation;
    };
  };

  dockedSidebar: boolean;
  moreInfoEntityId: string;
  user: CurrentUser;
  callService: (
    domain: ServiceCallRequest['domain'],
    service: ServiceCallRequest['service'],
    serviceData?: ServiceCallRequest['serviceData'],
    target?: ServiceCallRequest['target']
  ) => Promise<void>;
  callApi: <T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    parameters?: { [key: string]: any }
  ) => Promise<T>;
  fetchWithAuth: (
    path: string,
    init?: { [key: string]: any }
  ) => Promise<Response>;
  sendWS: (msg: MessageBase) => Promise<void>;
  callWS: <T>(msg: MessageBase) => Promise<T>;
}
