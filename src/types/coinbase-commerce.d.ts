declare module 'coinbase-commerce-node' {
  export interface ChargeData {
    name: string;
    description: string;
    local_price: {
      amount: string;
      currency: string;
    };
    pricing_type: 'fixed_price' | 'no_price';
    requested_info?: string[];
    metadata?: Record<string, any>;
  }

  export interface Charge {
    id: string;
    resource: string;
    code: string;
    name: string;
    description: string;
    hosted_url: string;
    created_at: string;
    expires_at: string;
    confirmed_at?: string;
    pricing_type: string;
    metadata: Record<string, any>;
    local_price: {
      amount: string;
      currency: string;
    };
    pricing: Record<string, any>;
    payments: any[];
    addresses: Record<string, string>;
    [key: string]: any;
  }

  export interface WebhookEvent {
    id: string;
    type: string;
    api_version: string;
    created_at: string;
    data: any;
  }

  export interface ClientInstance {
    setRequestTimeout(timeout: number): void;
  }

  export class Client {
    static init(apiKey: string): ClientInstance;
  }

  export namespace resources {
    export class Charge {
      static create(data: ChargeData, callback?: (error: any, response: Charge) => void): Promise<Charge>;
      static retrieve(id: string, callback?: (error: any, response: Charge) => void): Promise<Charge>;
      static list(params?: any, callback?: (error: any, list: Charge[], pagination: any) => void): Promise<{ data: Charge[], pagination: any }>;
      static all(params?: any, callback?: (error: any, list: Charge[]) => void): Promise<Charge[]>;
      
      constructor(data?: Partial<ChargeData>);
      save(callback?: (error: any, response: Charge) => void): Promise<Charge>;
    }

    export class Checkout {
      static create(data: any, callback?: (error: any, response: any) => void): Promise<any>;
      static retrieve(id: string, callback?: (error: any, response: any) => void): Promise<any>;
    }

    export class Event {
      static retrieve(id: string, callback?: (error: any, response: any) => void): Promise<any>;
      static list(params?: any, callback?: (error: any, list: any[], pagination: any) => void): Promise<{ data: any[], pagination: any }>;
    }
  }

  export class Webhook {
    static verifySigHeader(rawBody: string, signature: string, secret: string): WebhookEvent;
  }

  const coinbase: {
    Client: typeof Client;
    resources: typeof resources;
    Webhook: typeof Webhook;
  };

  export default coinbase;
} 