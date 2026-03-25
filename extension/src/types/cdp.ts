// CDP (Chrome DevTools Protocol) 类型定义

export interface CDPResponse<T = unknown> {
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

// DOM 类型
export interface DOMNode {
  nodeId: number;
  backendNodeId: number;
  nodeType: number;
  nodeName: string;
  localName: string;
  nodeValue: string;
  childNodeCount?: number;
  children?: DOMNode[];
  attributes?: string[];
  documentURL?: string;
  baseURL?: string;
  contentDocument?: DOMNode;
  frameId?: string;
}

export interface BoxModel {
  content: number[];
  padding: number[];
  border: number[];
  margin: number[];
  width: number;
  height: number;
}

// Runtime 类型
export interface RemoteObject {
  type: string;
  subtype?: string;
  className?: string;
  value?: unknown;
  unserializableValue?: string;
  description?: string;
  objectId?: string;
}

export interface EvaluateResult {
  result: RemoteObject;
  exceptionDetails?: ExceptionDetails;
}

export interface ExceptionDetails {
  exceptionId: number;
  text: string;
  lineNumber: number;
  columnNumber: number;
  scriptId?: string;
  url?: string;
  stackTrace?: StackTrace;
  exception?: RemoteObject;
}

export interface StackTrace {
  description?: string;
  callFrames: CallFrame[];
}

export interface CallFrame {
  functionName: string;
  scriptId: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

// Page 类型
export interface FrameTree {
  frame: Frame;
  childFrames?: FrameTree[];
}

export interface Frame {
  id: string;
  parentId?: string;
  loaderId: string;
  name?: string;
  url: string;
  urlFragment?: string;
  securityOrigin: string;
  mimeType: string;
}

export interface CaptureScreenshotParams {
  format?: 'jpeg' | 'png' | 'webp';
  quality?: number;
  clip?: Viewport;
  fromSurface?: boolean;
  captureBeyondViewport?: boolean;
}

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

// Input 类型
export interface MouseEventParams {
  type: 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel';
  x: number;
  y: number;
  button?: 'none' | 'left' | 'middle' | 'right';
  buttons?: number;
  clickCount?: number;
  deltaX?: number;
  deltaY?: number;
  modifiers?: number;
}

export interface KeyEventParams {
  type: 'keyDown' | 'keyUp' | 'rawKeyDown' | 'char';
  key?: string;
  code?: string;
  text?: string;
  modifiers?: number;
  windowsVirtualKeyCode?: number;
}

export interface InsertTextParams {
  text: string;
}

// Network 类型
export interface NetworkRequest {
  requestId: string;
  loaderId: string;
  documentURL: string;
  request: Request;
  timestamp: number;
  wallTime: number;
  initiator: Initiator;
  type: ResourceType;
  frameId?: string;
}

export interface Request {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
}

export interface Initiator {
  type: 'parser' | 'script' | 'preload' | 'SignedExchange' | 'other';
  url?: string;
  lineNumber?: number;
}

export type ResourceType =
  | 'Document'
  | 'Stylesheet'
  | 'Image'
  | 'Media'
  | 'Font'
  | 'Script'
  | 'TextTrack'
  | 'XHR'
  | 'Fetch'
  | 'EventSource'
  | 'WebSocket'
  | 'Manifest'
  | 'SignedExchange'
  | 'Ping'
  | 'CSPViolationReport'
  | 'Other';

// Cookie 类型 (CDP Network.Cookie)
export type CookieSameSite = 'Strict' | 'Lax' | 'None';

export interface CookiePartitionKey {
  topLevelSite: string;
  hasCrossSiteAncestor: boolean;
}

export interface CdpCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  size: number;
  httpOnly: boolean;
  secure: boolean;
  session: boolean;
  sameSite?: CookieSameSite;
  priority?: 'Low' | 'Medium' | 'High';
  sameParty?: boolean;
  sourceScheme?: 'Unset' | 'NonSecure' | 'Secure';
  sourcePort?: number;
  partitionKey?: CookiePartitionKey;
}

export interface SetCookieParams {
  name: string;
  value: string;
  url?: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: CookieSameSite;
  expires?: number;
  partitionKey?: CookiePartitionKey;
}

export interface DeleteCookiesParams {
  name: string;
  url?: string;
  domain?: string;
  path?: string;
  partitionKey?: CookiePartitionKey;
}
